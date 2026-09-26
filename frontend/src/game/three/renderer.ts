import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Art } from "./materials";
import { makeTown } from "./town";
import { CitizenModel } from "./citizen";
import { InkPass } from "./ink-pass";
import { arrivals, citizenPoint, walkablePoint, walkingRoute } from "./layout";
import type { CityState } from "@/lib/types";
import type { ConversationFrame, InlineTalk } from "@/lib/conversation-playback";
import { speechLevel } from "@/lib/speech-level";
import { conversationCameraOffset, conversationStaging } from "./conversation-camera";
import { skyAt } from "./sky";
import { makeAtmosphere } from "./atmosphere";
import { makeTraffic } from "./traffic";
import { makeTrain } from "./train";
import { groundTint, makeWeatherFx } from "./weather-fx";
import { makeIncidents } from "./incidents";
import { activeIncidents } from "@/lib/scenarios";
import { applyFoliage, foliageFor } from "./seasons";
import { calendarDay, calendarStartFor } from "@/lib/calendar";
import type { WeatherNow } from "@/lib/weather";

export type CameraMode = "orbit" | "follow";
const nightAmbient = new THREE.Color(0x8fa3d6);
const overcast = new THREE.Color(0x9aa5ad), snowSky = new THREE.Color(0xdfe6ec), heatSky = new THREE.Color(0xf3dcb6), lightningSky = new THREE.Color(0xeef2ff);
export class CityRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 420);
  readonly controls: OrbitControls;
  private readonly art = new Art();
  private readonly town: ReturnType<typeof makeTown>;
  private readonly atmosphere: ReturnType<typeof makeAtmosphere>;
  private readonly traffic: ReturnType<typeof makeTraffic>;
  private readonly train: ReturnType<typeof makeTrain>;
  private readonly weatherFx = makeWeatherFx();
  private readonly incidents: ReturnType<typeof makeIncidents>;
  private weather: WeatherNow | undefined;
  private readonly tint = new THREE.Color();
  private readonly shake = new THREE.Vector3();
  private season = "";
  private readonly ink: InkPass;
  private readonly people = new Map<string, CitizenModel>();
  private readonly names = document.createElement("div");
  private readonly signs: Array<{
    element: HTMLElement;
    point: THREE.Vector3;
  }> = [];
  private readonly sun = new THREE.DirectionalLight(0xffecd7, 2.2);
  private readonly ambient = new THREE.HemisphereLight(
    0xf4f3ee,
    0x8e90ad,
    1.05,
  );
  private readonly resize: ResizeObserver;
  private readonly reducedMotion = matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  private readonly vector = new THREE.Vector3();
  private frame = 0;
  private last = 0;
  private seconds = 0;
  private selected: string | null = null;
  private mode: CameraMode = "orbit";
  private focusTarget: THREE.Vector3 | null = null;
  private labelsVisible = false;
  private alive = true;
  private onScreen = true;
  private readonly intersection: IntersectionObserver;
  private pointer: { x: number; y: number; id: number; moved: boolean } | null =
    null;
  private pointers = new Set<number>();
  // Absolute city minutes; the displayed sky eases between 15-minute ticks.
  private clockMinute = 360;
  private displayMinute = 360;
  private width = 1;
  private height = 1;
  private conversation: ConversationFrame | null = null;
  private conversationReady: (() => void) | undefined;
  private conversationCenter: THREE.Vector3 | null = null;
  private inline: InlineTalk | null = null;
  private savedCamera: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private latestCity: CityState | null = null;
  private shotPosition: THREE.Vector3 | null = null;

  constructor(
    private host: HTMLDivElement,
    private onSelect: (id: string) => void,
    private onError: (message: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, innerWidth < 761 ? 1.35 : 1.75),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D town of Nakameguro",
    );
    this.renderer.domElement.setAttribute("role", "img");
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    host.appendChild(this.renderer.domElement);
    this.names.className = "world-label-layer";
    host.appendChild(this.names);
    this.scene.background = new THREE.Color(0xc3dfeb);
    this.scene.fog = new THREE.Fog(0xc3dfeb, 52, 140);
    this.scene.add(this.ambient);
    this.sun.position.set(-15, 32, 18);
    this.sun.target.position.set(20, 0, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -34,
      right: 34,
      top: 34,
      bottom: -34,
      near: 1,
      far: 100,
    });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight(0xc2d6f2, 0.4);
    fill.position.set(35, 18, -15);
    this.scene.add(fill);
    this.town = makeTown(this.art);
    this.scene.add(this.town.root, this.town.dynamic);
    this.atmosphere = makeAtmosphere(this.art, this.town.lampHeads);
    this.traffic = makeTraffic(this.art);
    this.train = makeTrain(this.art);
    this.incidents = makeIncidents(this.art);
    this.scene.add(this.incidents.root);
    this.scene.add(this.atmosphere.root, this.traffic.root, this.train.root, this.weatherFx.root);
    this.ink = new InkPass(this.camera);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 190;
    this.controls.minPolarAngle = 0.22;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.11;
    this.controls.maxTargetRadius = 55;
    this.controls.cursor.set(45, 0, 20);
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.addEventListener("start", this.cancelFocus);
    this.camera.position.set(23, 17, 31);
    this.controls.target.set(12, 0.2, 12);
    this.controls.update();
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.pointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.addEventListener(
      "pointercancel",
      this.pointerCancel,
    );
    for (const [id, point] of Object.entries(arrivals)) {
      const element = document.createElement("span");
      element.className = "place-nameplate";
      element.textContent = id.replace("loc_", "").replaceAll("_", " ");
      element.hidden = true;
      this.names.appendChild(element);
      this.signs.push({
        element,
        point: new THREE.Vector3(point.x, 2, point.z),
      });
    }
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.intersection = new IntersectionObserver((entries) => {
      this.onScreen = entries[0]?.isIntersecting ?? false;
      if (this.onScreen) this.resume();
      else this.stop();
    });
    this.intersection.observe(host);
    document.addEventListener("visibilitychange", this.visibility);
    this.resume();
    // Development-only handle for inspecting the scene from the browser console.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __agentcityRenderer?: CityRenderer }).__agentcityRenderer = this;
  }

  sync(city: CityState, selected: string | null) {
    this.latestCity = city;
    const changed = selected !== this.selected;
    this.selected = selected;
    const ids = new Set(city.citizens.map((c) => c.citizen_id));
    for (const [id, model] of this.people)
      if (!ids.has(id)) {
        model.dispose();
        this.people.delete(id);
      }
    const households = new Map<string, number>();
    city.citizens.forEach((citizen, index) => {
      const household = citizen.life?.household_id ?? "";
      const slot = households.get(household) ?? 0;
      households.set(household, slot + 1);
      const point = citizenPoint(citizen, index, slot);
      let model = this.people.get(citizen.citizen_id);
      if (!model) {
        model = new CitizenModel(citizen, this.art, this.onSelect);
        model.root.position.set(point.x, 0.055, point.z);
        this.people.set(citizen.citizen_id, model);
        this.scene.add(model.root);
        this.names.appendChild(model.label);
      }
      // After talking, people stay where they stood until their plans take them somewhere else.
      const arrivedHere = citizen.x === citizen.target_x && citizen.y === citizen.target_y;
      if (model.hold && (model.hold.locationId !== citizen.current_location_id || !arrivedHere)) model.hold = null;
      if (
        !model.hold &&
        !this.conversation?.actorIds.includes(citizen.citizen_id) && (!model.destination ||
        Math.hypot(
          model.destination.x - point.x,
          model.destination.z - point.z,
        ) > 0.1)
      ) {
        model.route = walkingRoute(
          { x: model.root.position.x, z: model.root.position.z },
          point,
        );
        model.destination = point;
      }
      model.setCitizen(citizen);
      model.select(selected === citizen.citizen_id);
    });
    if (city.encounter && !this.conversation) {
      const actor = this.people.get(city.encounter.actor_id), target = this.people.get(city.encounter.target_id);
      if (actor && target) {
        const point = walkablePoint({ x: target.root.position.x - 1.5, z: target.root.position.z });
        if (!actor.destination || Math.hypot(actor.destination.x - point.x, actor.destination.z - point.z) > 0.2) {
          actor.destination = point;
          actor.route = walkingRoute(actor.root.position, point);
        }
      }
    }
    if (changed && selected && !this.conversation) this.focusCitizen(false);
    this.weather = city.weather;
    const today = calendarDay(city.calendar_start ?? calendarStartFor(city.clock.day), city.clock.day);
    const season = `${today.month}-${today.dayOfMonth}`;
    if (season !== this.season) {
      this.season = season;
      const foliage = foliageFor(today.month, today.dayOfMonth);
      applyFoliage(this.art, foliage);
      this.town.petals.visible = foliage.petals !== null;
      if (foliage.petals !== null) (this.town.petals.material as THREE.MeshBasicMaterial).color.set(foliage.petals);
      this.town.lanterns.visible = foliage.lanterns;
    }
    this.incidents.sync(activeIncidents(city, city.clock.day * 1440 + city.clock.minute_of_day));
    const wet = Boolean(city.weather && city.weather.precipitation > 0 && city.weather.condition !== "snow");
    const indoors = new Set(["loc_homes", "loc_apartments", "loc_school", "loc_hospital", "loc_clinic", "loc_mall", "loc_office", "loc_library", "loc_bank", "loc_lab", "loc_gym", "loc_station", "loc_konbini", "loc_restaurant", "loc_pharmacy", "loc_police", "loc_city_hall"]);
    for (const citizen of city.citizens) {
      const arrived = citizen.x === citizen.target_x && citizen.y === citizen.target_y;
      this.people.get(citizen.citizen_id)?.setUmbrella(wet && (!arrived || !indoors.has(citizen.current_location_id)));
    }
    this.clockMinute = (city.clock.day - 1) * 1440 + city.clock.minute_of_day;
    // Loading a save or a long pause should not replay hours of sky in fast-forward.
    if (Math.abs(this.clockMinute - this.displayMinute) > 180) this.displayMinute = this.clockMinute;
  }
  private light(dt: number) {
    const ease = this.reducedMotion.matches ? 1 : Math.min(1, dt * 1.2);
    this.displayMinute += (this.clockMinute - this.displayMinute) * ease;
    const sky = skyAt(this.displayMinute % 1440);
    const w = this.weather;
    const gloom = w ? Math.min(1, w.clouds * 0.35 + w.precipitation * 0.55) : 0;
    const animate = !this.reducedMotion.matches;
    const fx = this.weatherFx.update(dt, w, this.controls.target, animate);
    // Keep crisp shadows wherever the camera looks, snapped to avoid shimmering.
    this.sun.target.position.set(Math.round(this.controls.target.x / 4) * 4, 0, Math.round(this.controls.target.z / 4) * 4);
    this.sun.intensity = sky.sunIntensity * (1 - gloom * 0.6);
    this.sun.color.copy(sky.sun);
    this.sun.position.copy(this.sun.target.position).addScaledVector(sky.sunDirection, 45);
    this.ambient.intensity = sky.ambient * (1 - gloom * 0.15) + fx.flash * 2.2;
    this.ambient.color.setHex(0xf4f3ee).lerp(nightAmbient, sky.night);
    const skyColor = sky.sky.clone().lerp(overcast.clone().multiplyScalar(1 - sky.night * 0.7), gloom * 0.75);
    if (w?.condition === "snow") skyColor.lerp(snowSky, 0.4 * (1 - sky.night));
    if (w?.heatwave) skyColor.lerp(heatSky, 0.25 * (1 - sky.night));
    if (fx.flash) skyColor.lerp(lightningSky, fx.flash * 0.8);
    (this.scene.background as THREE.Color).copy(skyColor);
    (this.scene.fog as THREE.Fog).color.copy(skyColor);
    this.atmosphere.update(sky.night, dt, animate, w?.clouds ?? 0.45, Math.min(1, (w?.precipitation ?? 0) * 1.1), w?.wind ?? 0.1);
    groundTint(w, this.tint);
    for (const key of ["ground", "ground-east"]) this.art.materials.get(key)?.color.copy(this.tint);
    this.shake.copy(fx.offset);
  }
  setConversation(frame: ConversationFrame | null, onReady?: () => void) {
    const previous = this.conversation;
    this.conversation = frame;
    if (!frame) {
      this.conversationReady = undefined;
      this.conversationCenter = null;
      for (const id of previous?.actorIds ?? []) this.holdInPlace(id);
      this.people.forEach((model) => { model.speaking = false; model.listening = false; model.lookAt = null; model.root.visible = true; });
      this.shotPosition = null;
      if (this.savedCamera) {
        this.camera.position.copy(this.savedCamera.position);
        this.controls.target.copy(this.savedCamera.target);
        this.savedCamera = null;
        this.focusTarget = null;
        this.controls.update();
      }
      if (this.latestCity) this.sync(this.latestCity, this.selected);
      return;
    }
    if (previous?.id === frame.id) {
      if (previous.phase !== frame.phase) this.focusConversation();
      return;
    }
    const models = frame.actorIds.map((id) => this.people.get(id)).filter((model) => model !== undefined);
    if (!models.length) { onReady?.(); return; }
    this.savedCamera ??= { position: this.camera.position.clone(), target: this.controls.target.clone() };
    const arrival = frame.locationId && arrivals[frame.locationId];
    const origin = arrival || models[0].destination || models[0].root.position;
    const { center, points } = conversationStaging(origin, this.town.root);
    this.conversationCenter = new THREE.Vector3(center.x, 0, center.z);
    // Stage the actual participants on walkable ground, without changing simulation data.
    models.forEach((model, index) => {
      const target = points[index % points.length];
      model.route = walkingRoute(model.root.position, target);
      model.destination = target;
    });
    this.conversationReady = onReady;
    this.focusConversation();
  }
  /** Player chats: face each other a step apart, lips and gestures follow the lines; the camera never moves. */
  setInlineTalk(talk: InlineTalk | null) {
    const previous = this.inline;
    this.inline = talk;
    if (!talk) {
      for (const id of previous?.actorIds ?? []) {
        const model = this.people.get(id);
        if (model && !this.conversation?.actorIds.includes(id)) { model.speaking = false; model.listening = false; model.lookAt = null; }
      }
      return;
    }
    const [mover, anchor] = talk.actorIds.map((id) => this.people.get(id));
    if (!mover || !anchor || mover.route.length) return;
    const dx = mover.root.position.x - anchor.root.position.x, dz = mover.root.position.z - anchor.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.7 && distance < 1.7) return this.holdInPlace(mover.citizen.citizen_id);
    const direction = distance > 0.01 ? { x: dx / distance, z: dz / distance } : { x: 1, z: 0 };
    const spot = walkablePoint({ x: anchor.root.position.x + direction.x * 1.15, z: anchor.root.position.z + direction.z * 1.15 });
    mover.route = walkingRoute(mover.root.position, spot);
    mover.destination = spot;
    mover.hold = { locationId: mover.citizen.current_location_id, point: spot };
  }
  /** Eye contact, lips on the audio and facing each other, for staged and inline conversations. */
  private animateTalk(dt: number) {
    const level = speechLevel();
    const inline = !this.conversation ? this.inline : null;
    const ids = this.conversation?.actorIds ?? inline?.actorIds ?? [];
    const speakerId = this.conversation ? this.conversation.speakerId : inline?.speakerId ?? null;
    for (const [id, model] of this.people) {
      const participant = ids.includes(id);
      model.talkLevel = participant && level.speakerId === id ? level.level : 0;
      if (!participant) { if (!this.conversation && !inline) model.lookAt = null; continue; }
      const others = ids.filter((other) => other !== id).map((other) => this.people.get(other)).filter((m) => m !== undefined);
      const focus = speakerId && speakerId !== id ? this.people.get(speakerId) : others[0];
      model.lookAt = focus ? focus.root.position : null;
      if (inline) {
        model.speaking = speakerId === id;
        model.listening = !model.speaking;
        model.speechPaused = false;
        if (model.speaking && inline.line) model.setLine(inline.key, inline.line);
        if (!model.route.length && focus) {
          const toward = Math.atan2(focus.root.position.x - model.root.position.x, focus.root.position.z - model.root.position.z);
          model.body.rotation.y += Math.atan2(Math.sin(toward - model.body.rotation.y), Math.cos(toward - model.body.rotation.y)) * Math.min(1, dt * 6);
        }
      }
    }
  }
  /** Flies to a place, e.g. a building on fire. */
  focusPlace(locationId: string) {
    const spot = arrivals[locationId];
    if (!spot) return;
    this.mode = "orbit";
    this.focusTarget = new THREE.Vector3(spot.x, this.height > this.width * 1.05 ? -2.5 : 0.8, spot.z - 1.5);
    const offset = this.camera.position.clone().sub(this.controls.target).setLength(16);
    offset.y = Math.max(offset.y, 7);
    this.shotPosition = this.focusTarget.clone().add(offset.setLength(16));
  }
  /** Frames two people talking, leaving room below for the chat panel on narrow screens. */
  focusPair(ids: string[], onlyIfHidden = false) {
    let models = ids.map((id) => this.people.get(id)).filter((m) => m !== undefined);
    if (!models.length) return;
    // People in different parts of town: frame the first one rather than the empty ground between them.
    if (models.some((m) => m.root.position.distanceTo(models[0].root.position) > 14)) models = [models[0]];
    if (onlyIfHidden && models.every((m) => {
      this.vector.copy(m.root.position).project(this.camera);
      return Math.abs(this.vector.x) < 0.8 && this.vector.y > -0.1 && this.vector.y < 0.85;
    })) return;
    const center = models.reduce((sum, m) => sum.add(m.root.position), new THREE.Vector3()).multiplyScalar(1 / models.length);
    // On narrow screens the chat sheet covers the lower part, so frame them higher and wider.
    // Portrait screens show the chat as a bottom sheet, so the pair sits in the top third of the view.
    const covered = this.width < 761 || this.height > this.width * 1.05;
    const distance = covered ? 16 : 10;
    this.mode = "orbit";
    this.focusTarget = new THREE.Vector3(center.x, covered ? -3.6 : 0.7, center.z);
    const offset = this.camera.position.clone().sub(this.controls.target).setLength(distance);
    offset.y = Math.max(offset.y, distance * (covered ? 0.32 : 0.45));
    this.shotPosition = this.focusTarget.clone().add(offset.setLength(distance));
  }
  private holdInPlace(id: string) {
    const model = this.people.get(id);
    if (!model) return;
    const point = model.destination ?? { x: model.root.position.x, z: model.root.position.z };
    model.hold = { locationId: model.citizen.current_location_id, point };
  }
  focusConversation() {
    if (!this.conversationCenter) return;
    this.focusTarget = this.conversationCenter.clone();
    // Leave the lower part of the frame for subtitles, including portrait screens.
    const cinematic = this.conversation?.phase !== "arrival";
    this.focusTarget.y = cinematic ? -0.25 : -1.2;
    const heads = this.conversation?.actorIds.flatMap((id) => {
      const model = this.people.get(id);
      return model?.destination ? [new THREE.Vector3(model.destination.x, 1.35, model.destination.z)] : [];
    }) ?? [];
    const distance = cinematic ? (this.width < 600 ? 7.4 : 6.4) : (this.width < 600 ? 14 : 11);
    const offset = conversationCameraOffset(this.focusTarget, heads, this.town.root, distance, cinematic);
    this.shotPosition = this.focusTarget.clone().add(offset);
  }
  setMode(mode: CameraMode) {
    this.mode = mode;
    if (mode === "follow") this.focusCitizen(true);
  }
  setLabels(visible: boolean) {
    this.labelsVisible = visible;
  }
  zoom(direction: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(
      offset.length() * (direction > 0 ? 0.8 : 1.25),
      6,
      this.controls.maxDistance,
    );
    this.camera.position
      .copy(this.controls.target)
      .add(offset.setLength(distance));
    this.controls.update();
  }
  overview() {
    this.focusTarget = null;
    this.mode = "orbit";
    this.controls.target.set(45, 1, 20);
    const direction = new THREE.Vector3(29, 43, 33).normalize();
    const right = new THREE.Vector3()
      .crossVectors(this.camera.up, direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const tanY = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanX = tanY * this.camera.aspect;
    let distance = 0;
    // Fit all town corners, including roof height, in either portrait or landscape.
    for (const x of [-46, 46])
      for (const y of [-1, 8])
        for (const z of [-21, 21]) {
          const corner = new THREE.Vector3(x, y, z);
          distance = Math.max(
            distance,
            corner.dot(direction) +
              Math.max(
                Math.abs(corner.dot(right)) / tanX,
                Math.abs(corner.dot(up)) / tanY,
              ),
          );
        }
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(
        direction,
        Math.min(distance * 1.12, this.controls.maxDistance),
      );
    this.controls.update();
  }
  rotate() {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }
  focusCitizen(close = true) {
    const model = this.selected && this.people.get(this.selected);
    if (!model) return;
    this.focusTarget = model.root.position.clone();
    if (close) {
      const offset = this.camera.position
        .clone()
        .sub(this.controls.target)
        .setLength(this.width < 761 ? 17 : 16);
      this.camera.position.copy(this.controls.target).add(offset);
    }
  }
  private fit() {
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    const ratio = this.renderer.getPixelRatio();
    this.ink.resize(
      Math.round(this.width * ratio),
      Math.round(this.height * ratio),
    );
  }
  private project(point: THREE.Vector3, element: HTMLElement, lift = 0) {
    this.vector.copy(point);
    this.vector.y += lift;
    this.vector.project(this.camera);
    const visible =
      this.vector.z > -1 &&
      this.vector.z < 1 &&
      Math.abs(this.vector.x) < 0.97 &&
      Math.abs(this.vector.y) < 0.94;
    element.hidden = !visible;
    if (visible)
      element.style.transform = `translate(${((this.vector.x + 1) * this.width) / 2}px,${((1 - this.vector.y) * this.height) / 2}px) translate(-50%, -100%)`;
  }
  private render = (now: number) => {
    if (!this.alive || document.hidden || !this.onScreen) return;
    this.frame = requestAnimationFrame(this.render);
    if (now - this.last < 1000 / 30) return;
    const dt = Math.min((now - this.last) / 1000 || 0.033, 0.08);
    this.last = now;
    this.seconds += dt;
    const pedestrians: Array<{ x: number; z: number }> = [];
    for (const model of this.people.values()) {
      const participant = this.conversation?.actorIds.includes(model.citizen.citizen_id) ?? false;
      const indoors = model.asleep && !model.route.length && !participant;
      model.root.visible = !indoors && (!this.conversation || this.conversation.phase === "arrival" || participant);
      model.update(dt, this.reducedMotion.matches);
      if (model.root.visible) pedestrians.push(model.root.position);
    }
    this.light(dt);
    const stormy = this.weather?.condition === "typhoon";
    if (!this.reducedMotion.matches) {
      this.traffic.update(dt, pedestrians, stormy);
      this.train.update(dt, stormy);
    }
    if (this.conversation && this.conversationCenter) {
      const participants = this.conversation.actorIds.map((id) => this.people.get(id)).filter((model) => model !== undefined);
      const arrived = participants.every((model) => !model.route.length);
      for (const model of participants) {
        model.speaking = arrived && model.citizen.citizen_id === this.conversation.speakerId;
        model.speechPaused = this.conversation.paused;
        model.listening = !model.speaking;
        if (!model.route.length) {
          // Face each other, "cheated" a little toward the camera so the audience can see their faces.
          const toPartner = Math.atan2(this.conversationCenter.x - model.root.position.x, this.conversationCenter.z - model.root.position.z);
          const toCamera = Math.atan2(this.camera.position.x - model.root.position.x, this.camera.position.z - model.root.position.z);
          const cheat = Math.atan2(Math.sin(toCamera - toPartner), Math.cos(toCamera - toPartner)) * 0.32;
          model.body.rotation.y += Math.atan2(Math.sin(toPartner + cheat - model.body.rotation.y), Math.cos(toPartner + cheat - model.body.rotation.y)) * Math.min(1, dt * 5);
        }
      }
      // A slow push toward whoever is speaking, like a camera operator following the dialogue.
      const speaker = this.conversation.speakerId ? this.people.get(this.conversation.speakerId) : undefined;
      if (arrived && speaker && this.conversation.phase === "dialogue" && !this.focusTarget) {
        const aim = this.conversationCenter.clone().lerp(speaker.root.position, 0.3);
        aim.y = this.controls.target.y;
        this.controls.target.lerp(aim, Math.min(1, dt * 0.8));
      }
      if (arrived && this.conversation.line && this.conversation.speakerId)
        this.people.get(this.conversation.speakerId)?.setLine(this.conversation.lineKey ?? this.conversation.line, this.conversation.line);
      if (arrived && this.conversationReady) {
        const ready = this.conversationReady;
        this.conversationReady = undefined;
        ready();
      }
    }
    this.animateTalk(dt);
    const followed =
      !this.conversation && this.mode === "follow" && this.selected && this.people.get(this.selected);
    if (followed) this.focusTarget = followed.root.position.clone();
    if (this.shotPosition && this.focusTarget) {
      const smoothing = this.reducedMotion.matches ? 1 : Math.min(1, dt * 2.8);
      this.camera.position.lerp(this.shotPosition, smoothing);
      this.controls.target.lerp(this.focusTarget, smoothing);
      if (this.camera.position.distanceTo(this.shotPosition) < 0.005) {
        this.shotPosition = null;
        this.focusTarget = null;
      }
    } else if (this.focusTarget) {
      const delta = this.focusTarget
        .clone()
        .sub(this.controls.target)
        .multiplyScalar(this.reducedMotion.matches ? 1 : Math.min(1, dt * 5));
      this.controls.target.add(delta);
      this.camera.position.add(delta);
      if (!followed && delta.length() < 0.003) this.focusTarget = null;
    }
    this.controls.update();
    if (!this.reducedMotion.matches) this.town.animate(this.seconds);
    this.incidents.update(this.seconds);
    const cameraDistance = this.camera.position.distanceTo(
      this.controls.target,
    );
    const fog = this.scene.fog as THREE.Fog;
    const haze = 1 - (this.weather?.fog ?? 0) * 0.55;
    fog.near = Math.max(52, cameraDistance * 0.95) * haze;
    fog.far = Math.max(160, cameraDistance * 2.6) * haze;
    const occupied: Array<{ x: number; y: number; w: number }> = [];
    const models = [...this.people.values()].sort(
      (a, b) =>
        Number(b.citizen.citizen_id === this.selected) -
        Number(a.citizen.citizen_id === this.selected),
    );
    for (const model of models) {
      if (this.conversation && !this.conversation.actorIds.includes(model.citizen.citizen_id)) {
        model.label.hidden = true;
        continue;
      }
      if (cameraDistance > 40 && model.citizen.citizen_id !== this.selected) {
        model.label.hidden = true;
        continue;
      }
      this.project(model.root.position, model.label, model.labelLift);
      if (model.label.hidden) continue;
      const w = model.label.offsetWidth;
      const x = THREE.MathUtils.clamp(
          ((this.vector.x + 1) * this.width) / 2,
          w / 2 + 8,
          this.width - w / 2 - 8,
        ),
        anchorY = ((1 - this.vector.y) * this.height) / 2;
      let y = anchorY;
      for (let attempt = 0; attempt < 6; attempt++) {
        if (
          !occupied.some(
            (r) =>
              Math.abs(r.x - x) < (r.w + w) / 2 + 5 && Math.abs(r.y - y) < 37,
          )
        )
          break;
        y -= 38;
      }
      if (y < 38) {
        model.label.hidden = true;
        continue;
      }
      model.label.style.transform = `translate(${x}px,${y}px) translate(-50%, -100%)`;
      model.label.style.setProperty("--leader", `${anchorY - y}px`);
      occupied.push({ x, y, w });
    }
    for (const sign of this.signs) {
      if (this.labelsVisible) this.project(sign.point, sign.element);
      else sign.element.hidden = true;
    }
    this.camera.position.add(this.shake);
    this.ink.render(this.renderer, this.scene, this.camera, this.conversation && this.conversation.phase !== "arrival" ? cameraDistance : 0);
    this.camera.position.sub(this.shake);
    this.host.dataset.rendered = "true";
  };
  private resume() {
    if (!this.alive || document.hidden || !this.onScreen) return;
    cancelAnimationFrame(this.frame);
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.render);
  }
  private stop() {
    cancelAnimationFrame(this.frame);
  }
  private visibility = () => {
    if (document.hidden) this.stop();
    else this.resume();
  };
  private cancelFocus = () => {
    this.focusTarget = null;
    this.shotPosition = null;
  };
  private pointerDown = (event: PointerEvent) => {
    this.pointers.add(event.pointerId);
    if (this.pointers.size > 1) {
      this.pointer = null;
      return;
    }
    this.pointer = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      moved: false,
    };
  };
  private pointerMove = (event: PointerEvent) => {
    if (
      this.pointer &&
      Math.hypot(
        event.clientX - this.pointer.x,
        event.clientY - this.pointer.y,
      ) > 7
    )
      this.pointer.moved = true;
  };
  private pointerCancel = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.pointer = null;
  };
  private pointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    const pointer = this.pointer;
    this.pointer = null;
    if (
      !pointer ||
      pointer.id !== event.pointerId ||
      pointer.moved ||
      event.button > 0
    )
      return;
    const rect = this.host.getBoundingClientRect();
    const cursor = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(cursor, this.camera);
    const hit = ray.intersectObjects(
      [...this.people.values()].filter((p) => p.root.visible).map((p) => p.root),
      true,
    )[0];
    if (hit) {
      let parent: THREE.Object3D | null = hit.object;
      while (parent && !parent.userData.citizenId) parent = parent.parent;
      if (parent) this.onSelect(String(parent.userData.citizenId));
    }
  };
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.stop();
    this.onError(
      "The 3D graphics context was interrupted. Reload the town to continue.",
    );
  };
  dispose() {
    this.alive = false;
    this.stop();
    this.resize.disconnect();
    this.intersection.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.renderer.domElement.removeEventListener(
      "pointerdown",
      this.pointerDown,
    );
    this.renderer.domElement.removeEventListener(
      "pointermove",
      this.pointerMove,
    );
    this.renderer.domElement.removeEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.removeEventListener(
      "pointercancel",
      this.pointerCancel,
    );
    this.controls.dispose();
    this.people.forEach((p) => p.dispose());
    this.scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    this.sun.shadow.dispose();
    this.town.dispose();
    this.atmosphere.dispose();
    this.weatherFx.dispose();
    this.incidents.dispose();
    this.ink.dispose();
    this.art.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.names.remove();
    this.scene.clear();
  }
}
