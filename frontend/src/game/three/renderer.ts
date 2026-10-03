import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Art } from "./materials";
import { makeTown } from "./town";
import { HumanLibrary } from "./human";
import { StreetView } from "./street-view";
import { CitizenModel } from "./citizen";
import { PostPipeline } from "./post";
import { FrameMonitor, initialQuality, lowerQuality, type QualityPreset } from "./quality";
import { makeHorizon } from "./horizon";
import { arrivals, citizenPoint, walkablePoint, walkingRoute } from "./layout";
import type { CityState } from "@/lib/types";
import type { ConversationFrame, InlineTalk } from "@/lib/conversation-playback";
import { speechLevel } from "@/lib/speech-level";
import { conversationCameraOffset, conversationDistance, conversationStaging, insideBuilding, sightLinesClear } from "./conversation-camera";
import { makeSkyDome, skyAt } from "./sky";
import { makeAtmosphere } from "./atmosphere";
import { makeTraffic } from "./traffic";
import { makeTrain } from "./train";
import { groundTint, makeWeatherFx } from "./weather-fx";
import { makeIncidents } from "./incidents";
import { activeIncidents } from "@/lib/incidents";
import { applyFoliage, foliageFor } from "./seasons";
import { THEME } from "./theme";

const hazeColor = new THREE.Color(THEME.haze.color);
import { calendarDay, calendarStartFor } from "@/lib/calendar";
import type { WeatherNow } from "@/lib/weather";

export type CameraMode = "orbit" | "follow" | "street";
/** In street view you hear a conversation within about 24 m (12 town units). */
export const HEARING = 12;
const nightAmbient = new THREE.Color(0x8fa3d6);
const overcast = new THREE.Color(0x9aa5ad), snowSky = new THREE.Color(0xdfe6ec), heatSky = new THREE.Color(0xf3dcb6), lightningSky = new THREE.Color(0xeef2ff);
export class CityRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  // Far enough for the skyline and Mt Fuji on the horizon.
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
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
  private post: PostPipeline;
  private quality: QualityPreset = initialQuality();
  private readonly monitor = new FrameMonitor(() => this.degrade());
  private readonly skyDome = makeSkyDome(1000);
  private readonly horizon: ReturnType<typeof makeHorizon>;
  /** How dark it is right now (0 day .. 1 night), for bloom and the immediate redraw after a resize. */
  private night = 0;
  private readonly people = new Map<string, CitizenModel>();
  private street!: StreetView;
  private lastLook: { x: number; y: number } | null = null;
  /** While the opening descent plays, the camera glides down slowly instead of snapping. */
  private descentUntil = 0;
  // Street view: a marker that leads you to the scene being played, and a speech bubble you can overhear.
  private readonly sceneMarker = document.createElement("button");
  private readonly bubble = document.createElement("div");
  // Realistic bodies are downloaded only for residents you can see up close.
  private readonly humans = new HumanLibrary();
  private readonly humanRequested = new Set<string>();
  private nextHumanCheck = 0;
  private readonly names = document.createElement("div");
  private readonly signs: Array<{
    element: HTMLElement;
    point: THREE.Vector3;
  }> = [];
  private readonly sun = new THREE.DirectionalLight(0xffecd7, 2.2);
  // The sky, re-captured as the time of day changes, lights and reflects in every realistic surface.
  private readonly envScene = new THREE.Scene();
  private pmrem!: THREE.PMREMGenerator;
  private envTarget?: THREE.WebGLRenderTarget;
  private envMinute = -Infinity;
  private envGloom = -1;
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
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.pixelRatio));
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
    // The sky dome draws the sky; fog fades the town into its horizon colour.
    this.scene.fog = new THREE.Fog(0xcfe4ef, 52, 140);
    this.scene.add(this.skyDome.dome);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const envSky = new THREE.Mesh(this.skyDome.dome.geometry, this.skyDome.dome.material);
    envSky.scale.setScalar(0.05);
    this.envScene.add(envSky);
    this.scene.add(this.ambient);
    this.sun.position.set(-15, 32, 18);
    this.sun.target.position.set(20, 0, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap);
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
    this.horizon = makeHorizon(this.art);
    this.scene.add(this.horizon.root);
    this.atmosphere = makeAtmosphere(this.art, this.town.lampHeads);
    this.traffic = makeTraffic(this.art);
    this.train = makeTrain(this.art);
    this.incidents = makeIncidents(this.art);
    this.scene.add(this.incidents.root);
    this.scene.add(this.atmosphere.root, this.traffic.root, this.train.root, this.weatherFx.root);
    this.post = new PostPipeline(this.renderer, this.scene, this.camera, this.quality, Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    void this.art.loadSurfaces(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
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
    this.street = new StreetView(this.camera, this.controls);
    this.sceneMarker.type = "button";
    this.sceneMarker.className = "street-scene-marker";
    this.sceneMarker.hidden = true;
    this.sceneMarker.addEventListener("click", (event) => { event.stopPropagation(); this.streetGoToScene(); });
    this.bubble.className = "street-speech-bubble";
    this.bubble.hidden = true;
    this.names.append(this.sceneMarker, this.bubble);
    this.renderer.domElement.addEventListener("wheel", this.streetWheel, { passive: false });
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
    // Compile every shader now, in parallel where the driver allows, instead of stuttering the first time each appears.
    this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
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
        this.humanRequested.delete(id);
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
    // Most fill light now comes from the sky itself (scene.environment); this only lifts deep shade.
    this.ambient.intensity = sky.ambient * 0.35 * (1 - gloom * 0.15) + fx.flash * 2.2;
    this.ambient.color.setHex(0xf4f3ee).lerp(nightAmbient, sky.night);
    const skyColor = sky.sky.clone().lerp(overcast.clone().multiplyScalar(1 - sky.night * 0.7), gloom * 0.75);
    // Dust in the air (Lucknow's plains haze) warms and flattens the daytime sky.
    if (THEME.haze.amount) skyColor.lerp(hazeColor, THEME.haze.amount * (1 - sky.night));
    if (w?.condition === "snow") skyColor.lerp(snowSky, 0.4 * (1 - sky.night));
    if (w?.heatwave) skyColor.lerp(heatSky, 0.25 * (1 - sky.night));
    if (fx.flash) skyColor.lerp(lightningSky, fx.flash * 0.8);
    // Overhead the sky keeps its colour; grey days wash it out towards the clouds.
    const zenith = sky.zenith.clone().lerp(overcast.clone().multiplyScalar(0.85 - sky.night * 0.6), gloom * 0.8);
    if (fx.flash) zenith.lerp(lightningSky, fx.flash * 0.6);
    this.skyDome.update(sky, skyColor, zenith, gloom);
    if (Math.abs(this.displayMinute - this.envMinute) > 6 || Math.abs(gloom - this.envGloom) > 0.08) this.captureSky(gloom);
    this.horizon.update(skyColor, sky.night, gloom);
    this.night = sky.night;
    (this.scene.fog as THREE.Fog).color.copy(skyColor);
    this.atmosphere.update(sky.night, dt, animate, w?.clouds ?? 0.45, Math.min(1, (w?.precipitation ?? 0) * 1.1), w?.wind ?? 0.1);
    groundTint(w, this.tint);
    for (const key of ["ground", "ground-east"]) this.art.materials.get(key)?.color.copy(this.tint);
    this.shake.copy(fx.offset);
  }
  private loadNearbyHumans() {
    const reach = this.quality.level === "high" ? 30 : this.quality.level === "medium" ? 18 : 0;
    for (const [id, model] of this.people) {
      if (this.humanRequested.has(id)) continue;
      const near = model.root.position.distanceTo(this.controls.target) < reach;
      if (!near && id !== this.selected && !this.conversation?.actorIds.includes(id)) continue;
      this.humanRequested.add(id);
      void this.humans.load(id).then((human) => {
        if (!human) return;
        if (!this.alive || this.people.get(id) !== model) return human.dispose();
        model.attachHuman(human);
      });
    }
  }
  private captureSky(gloom: number) {
    this.envMinute = this.displayMinute;
    this.envGloom = gloom;
    const next = this.pmrem.fromScene(this.envScene, 0.02);
    this.envTarget?.dispose();
    this.envTarget = next;
    this.scene.environment = next.texture;
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
      this.controls.minDistance = 6;
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
      // Each new speaker gets a close-up over the listener's shoulder, so faces and expressions read clearly.
      if (frame.phase === "dialogue" && frame.speakerId && frame.speakerId !== previous.speakerId && !this.reducedMotion.matches) this.closeUp(frame.speakerId);
      else if (previous.phase !== frame.phase) this.focusConversation();
      return;
    }
    this.controls.minDistance = 0.6;
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
      // Someone far away joins for the last few metres of their walk, so a scene starts in seconds, not a minute.
      shortenWalk(model, 2.5);
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
    if (distance > 0.35 && distance < 0.9) return this.holdInPlace(mover.citizen.citizen_id);
    const direction = distance > 0.01 ? { x: dx / distance, z: dz / distance } : { x: 1, z: 0 };
    const spot = walkablePoint({ x: anchor.root.position.x + direction.x * 0.6, z: anchor.root.position.z + direction.z * 0.6 });
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
    if (this.street?.active) return;
    const spot = arrivals[locationId];
    if (!spot) return;
    this.mode = "orbit";
    this.focusTarget = new THREE.Vector3(spot.x, 0.8, spot.z - 1.5);
    const offset = this.camera.position.clone().sub(this.controls.target).setLength(16);
    offset.y = Math.max(offset.y, 7);
    this.shotPosition = this.focusTarget.clone().add(offset.setLength(16));
  }
  /** Frames the pair inside the actual visible canvas, not behind a phone sheet. */
  focusPair(ids: string[], onlyIfHidden = false) {
    if (this.street?.active) return;
    let models = ids.map((id) => this.people.get(id)).filter((m) => m !== undefined);
    if (!models.length) return;
    // People in different parts of town: frame the first one rather than the empty ground between them.
    if (models.some((m) => m.root.position.distanceTo(models[0].root.position) > 14)) models = [models[0]];
    if (onlyIfHidden && models.every((m) => {
      this.vector.copy(m.root.position).project(this.camera);
      return Math.abs(this.vector.x) < 0.8 && this.vector.y > -0.1 && this.vector.y < 0.85;
    })) return;
    const center = models.reduce((sum, m) => sum.add(m.root.position), new THREE.Vector3()).multiplyScalar(1 / models.length);
    const distance = conversationDistance(10, this.camera.aspect);
    this.mode = "orbit";
    this.focusTarget = new THREE.Vector3(center.x, 0.7, center.z);
    const offset = this.camera.position.clone().sub(this.controls.target).setLength(distance);
    offset.y = Math.max(offset.y, distance * 0.45);
    offset.setLength(distance);
    // Keep the current angle when the pair is in view from it; otherwise swing to one no building blocks,
    // so the camera never ends up behind a wall or inside a block of flats.
    const heads = models.map((m) => m.root.position.clone().setY(0.7));
    const clear = sightLinesClear(this.focusTarget.clone().add(offset), heads, this.town.root);
    this.shotPosition = this.focusTarget.clone().add(clear ? offset : conversationCameraOffset(this.focusTarget, heads, this.town.root, distance, false));
  }
  private holdInPlace(id: string) {
    const model = this.people.get(id);
    if (!model) return;
    const point = model.destination ?? { x: model.root.position.x, z: model.root.position.z };
    model.hold = { locationId: model.citizen.current_location_id, point };
  }
  focusConversation() {
    if (this.street?.active) return;
    if (!this.conversationCenter) return;
    this.focusTarget = this.conversationCenter.clone();
    // Compact layouts reserve a separate subtitle area; centre people in the remaining canvas.
    const cinematic = this.conversation?.phase !== "arrival";
    const compact = window.matchMedia("(max-width: 760px), (max-width: 1024px) and (max-height: 500px)").matches;
    this.focusTarget.y = compact ? 0.5 : cinematic ? 0.25 : -0.6;
    const heads = this.conversation?.actorIds.flatMap((id) => {
      const model = this.people.get(id);
      return model?.destination ? [new THREE.Vector3(model.destination.x, 0.7, model.destination.z)] : [];
    }) ?? [];
    const distance = conversationDistance(cinematic ? 3 : 7, this.camera.aspect);
    const offset = conversationCameraOffset(this.focusTarget, heads, this.town.root, distance, cinematic);
    this.shotPosition = this.focusTarget.clone().add(offset);
  }
  /** Over the listener's shoulder onto the speaker's face; keeps the two-shot if anything blocks the view. */
  private closeUp(speakerId: string) {
    if (this.street?.active) return;
    const speaker = this.people.get(speakerId);
    const listener = this.conversation?.actorIds.filter((id) => id !== speakerId).map((id) => this.people.get(id)).find((m) => m !== undefined);
    if (!speaker || !listener) return;
    // Where they stand for the scene (they may still be walking there), and eye height just below the nameplate.
    const standing = (m: CitizenModel) => (m.destination ? new THREE.Vector3(m.destination.x, m.root.position.y, m.destination.z) : m.root.position.clone());
    const at = standing(speaker);
    const face = at.clone().setY(at.y + (speaker.labelLift - 0.1) * 0.74);
    const toListener = standing(listener).sub(at).setY(0);
    if (toListener.lengthSq() < 0.01) return;
    const apart = toListener.length();
    toListener.normalize();
    const side = new THREE.Vector3(-toListener.z, 0, toListener.x);
    // Over the listener's shoulder: their shoulder and the back of their head frame one edge, the speaker's face
    // fills the rest. Shoulders alternate with the speaker, like shot and reverse shot.
    const shoulder = speakerId === this.conversation?.actorIds[0] ? 1 : -1;
    const behind = face.clone().addScaledVector(toListener, apart + 0.62).addScaledVector(side, shoulder * 0.3).add(new THREE.Vector3(0, 0.05, 0));
    const tight = face.clone().addScaledVector(toListener, 1.15).addScaledVector(side, shoulder * 0.42).add(new THREE.Vector3(0, 0.04, 0));
    const position = sightLinesClear(behind, [face], this.town.root) ? behind : tight;
    if (!sightLinesClear(position, [face], this.town.root)) return;
    // Aim a little below the eyes: subtitles cover the bottom of the view, so the face sits in its upper part.
    this.focusTarget = face.clone().add(new THREE.Vector3(0, -0.1, 0)).addScaledVector(side, shoulder * -0.08);
    this.shotPosition = position;
  }
    setMode(mode: CameraMode) {
    if (mode === "street") {
      // Step down where the overhead camera was looking (or next to whoever is selected).
      const selected = this.selected ? this.people.get(this.selected) : undefined;
      const at = selected?.root.visible ? selected.root.position : this.controls.target;
      this.shotPosition = null;
      this.focusTarget = null;
      this.street.enter({ x: at.x + (selected ? 0.8 : 0), z: at.z + (selected ? 0.8 : 0) });
    } else if (this.street.active) this.street.exit();
    this.mode = mode;
    if (mode === "follow") this.focusCitizen(true);
  }
  /** The end of the opening flight from space: the camera drops out of the sky onto the town. */
  introDescent() {
    if (this.street.active) return;
    const target = this.controls.target.clone();
    const end = this.camera.position.clone();
    this.controls.maxDistance = 700;
    this.camera.position.set(target.x + 12, 300, target.z + 70);
    this.controls.update();
    this.descentUntil = this.seconds + 6;
    this.focusTarget = target;
    this.shotPosition = end;
  }
  /** Street view from in front of a place, e.g. "jump to the station". */
  streetViewAt(locationId: string) {
    const spot = arrivals[locationId];
    if (!spot) return;
    if (this.mode !== "street") this.setMode("street");
    // Fronts face +z: stand out in the street, a few metres back, looking at the entrance, never inside another building.
    const back = [3, 2.2, 3.8, 1.5].find((d) => !insideBuilding(new THREE.Vector3(spot.x, 0.8, spot.z + d))) ?? 1.5;
    this.street.enter({ x: spot.x, z: spot.z + back });
    this.street.yaw = 0;
    this.street.pitch = 0.08;
  }
  /** The middle of the scene being played: where its people stand (or are heading). */
  private sceneCenter() {
    const models = this.conversation?.actorIds.map((id) => this.people.get(id)).filter((m) => m !== undefined) ?? [];
    if (!models.length) return null;
    return models.reduce((sum, m) => sum.add(m.destination ? new THREE.Vector3(m.destination.x, 0, m.destination.z) : m.root.position.clone().setY(0)),
      new THREE.Vector3()).multiplyScalar(1 / models.length);
  }
  /** Street view only: how far the scene being played is from you, in town units (one is about 2 m). */
  streetSceneDistance() {
    const center = this.street.active ? this.sceneCenter() : null;
    return center ? center.distanceTo(this.street.standing.setY(0)) : null;
  }
  /** Walks you to a few metres from the scene and turns you to watch it. */
  streetGoToScene() {
    const center = this.sceneCenter();
    if (!center || !this.street.active) return;
    const from = this.street.standing.setY(0);
    const away = from.clone().sub(center).setY(0);
    if (away.lengthSq() < 0.01) away.set(0, 0, 1);
    const spot = center.clone().add(away.setLength(1.6));
    if (!this.street.walkTo({ x: spot.x, z: spot.z })) this.street.enter({ x: spot.x, z: spot.z });
    this.street.face(center);
  }
  private updateStreetScene() {
    const center = this.street.active ? this.sceneCenter() : null;
    if (!center || !this.conversation) {
      this.sceneMarker.hidden = true;
      this.bubble.hidden = true;
      return;
    }
    const distance = center.distanceTo(this.camera.position.clone().setY(0));
    // The marker: over the scene when it's in view, pinned to the screen edge with an arrow when it isn't.
    if (distance > 5) {
      const names = this.conversation.actorIds.map((id) => this.people.get(id)?.citizen.name.split(" ")[0]).filter(Boolean).join(" & ");
      const metres = Math.round(distance * 2);
      this.vector.copy(center).setY(1.3).project(this.camera);
      const ahead = this.vector.z < 1 && Math.abs(this.vector.x) < 0.9 && Math.abs(this.vector.y) < 0.85;
      let x = this.vector.x, y = this.vector.y, anchor = "-50%";
      if (!ahead) {
        if (this.vector.z >= 1) { x = -x; y = -y; }
        const side = x >= 0 ? 1 : -1;
        // Pinned to the edge it points to, reading inwards so it's never cut off.
        x = side;
        anchor = side > 0 ? "calc(-100% - 12px)" : "12px";
        y = THREE.MathUtils.clamp(y, -0.2, 0.5);
        this.sceneMarker.textContent = side > 0 ? `🎬 ${names} · ${metres} m →` : `← 🎬 ${names} · ${metres} m`;
      } else this.sceneMarker.textContent = `🎬 ${names} · ${metres} m`;
      this.sceneMarker.hidden = false;
      this.sceneMarker.style.transform = `translate(${((x + 1) * this.width) / 2}px,${((1 - y) * this.height) / 2}px) translate(${anchor}, -50%)`;
    } else this.sceneMarker.hidden = true;
    // Overhearing: the current line floats over the speaker, if you're close enough to hear it.
    const speaker = this.conversation.speakerId ? this.people.get(this.conversation.speakerId) : undefined;
    if (speaker && this.conversation.line && distance < HEARING) {
      if (this.bubble.textContent !== this.conversation.line) this.bubble.textContent = this.conversation.line;
      this.vector.copy(speaker.root.position);
      this.vector.y += speaker.labelLift + 0.06;
      this.vector.project(this.camera);
      const visible = this.vector.z < 1 && Math.abs(this.vector.x) < 0.95;
      this.bubble.hidden = !visible;
      if (visible) {
        // Just above the head, but never up under the street-view controls.
        const x = ((this.vector.x + 1) * this.width) / 2, y = Math.max(((1 - this.vector.y) * this.height) / 2, this.bubble.offsetHeight + 130);
        this.bubble.style.transform = `translate(${x}px,${y}px) translate(-50%, -100%)`;
      }
    } else this.bubble.hidden = true;
  }
  streetStep(distance: number) {
    this.street.step(distance);
  }
  streetTurn(angle: number) {
    this.street.turn(angle);
  }
  private streetWheel = (event: WheelEvent) => {
    if (!this.street.active) return;
    event.preventDefault();
    this.street.zoom(Math.sign(event.deltaY) * 4);
  };
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
    this.post.setSize(this.width, this.height);
    if (this.conversationCenter) this.focusConversation();
    else if (this.inline) this.focusPair(this.inline.actorIds);
    // Resizing clears the canvas. Draw at once: if the loop is paused (hidden tab, pane or scrolled away), the stage's
    // green background would otherwise show through with stale name tags until the loop happens to resume.
    if (this.alive && this.width > 1 && this.height > 1) this.post.render(0, this.night);
    this.resume();
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
    this.monitor.sample(now, now - this.last);
    const dt = Math.min((now - this.last) / 1000 || 0.033, 0.08);
    this.last = now;
    this.seconds += dt;
    const pedestrians: Array<{ x: number; z: number }> = [];
    for (const model of this.people.values()) {
      const participant = this.conversation?.actorIds.includes(model.citizen.citizen_id) ?? false;
      const indoors = model.asleep && !model.route.length && !participant;
      model.root.visible = !indoors && (!this.conversation || this.conversation.phase === "arrival" || participant || this.street.active);
      model.update(dt, this.reducedMotion.matches);
      if (model.root.visible) pedestrians.push(model.root.position);
    }
    if (this.seconds >= this.nextHumanCheck) {
      this.nextHumanCheck = this.seconds + 1;
      this.loadNearbyHumans();
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
      if (arrived && this.conversation.line && this.conversation.speakerId) {
        const key = this.conversation.lineKey ?? this.conversation.line;
        for (const model of participants) {
          if (model.citizen.citizen_id === this.conversation.speakerId) model.setLine(key, this.conversation.line);
          else model.hear(key, this.conversation.line);
        }
      }
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
    if (this.street.active) this.street.update(dt, this.reducedMotion.matches);
    else if (this.shotPosition && this.focusTarget) {
      const descending = this.seconds < this.descentUntil;
      const smoothing = this.reducedMotion.matches ? 1 : Math.min(1, dt * (descending ? 1.15 : 2.8));
      if (!descending && this.controls.maxDistance > 190) this.controls.maxDistance = 190;
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
    if (!this.street.active) this.controls.update();
    if (!this.reducedMotion.matches) this.town.animate(this.seconds);
    this.incidents.update(this.seconds);
    const cameraDistance = this.camera.position.distanceTo(
      this.controls.target,
    );
    const fog = this.scene.fog as THREE.Fog;
    const haze = 1 - (this.weather?.fog ?? 0) * 0.55;
    // The town stays crisp; the distance beyond it has its own haze (horizon.ts).
    fog.near = Math.max(70, cameraDistance * 1.1) * haze;
    fog.far = Math.max(230, cameraDistance * 3) * haze;
    const occupied: Array<{ x: number; y: number; w: number }> = [];
    const models = [...this.people.values()].sort(
      (a, b) =>
        Number(b.citizen.citizen_id === this.selected) -
        Number(a.citizen.citizen_id === this.selected),
    );
    for (const model of models) {
      // Dialogue identifies speakers in the subtitle area; floating labels obscure mobile close-ups.
      if (this.conversation && (this.conversation.phase !== "arrival" || !this.conversation.actorIds.includes(model.citizen.citizen_id))) {
        model.label.hidden = true;
        continue;
      }
      // Name tags only close up, or for whoever you picked: from further off they are a cloud of words.
      if (cameraDistance > 22 && model.citizen.citizen_id !== this.selected) {
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
    this.skyDome.dome.position.copy(this.camera.position);
    this.updateStreetScene();
    // No depth-of-field in street view: you choose where to look.
    this.post.render(dt, this.night, this.conversation && this.conversation.phase !== "arrival" && !this.street.active ? cameraDistance : 0);
    this.camera.position.sub(this.shake);
    this.host.dataset.rendered = "true";
  };
  /** The frame on screen as a picture, for sharing a scene. */
  snapshot() {
    if (!this.alive) return null;
    this.post.render(0, this.night, 0);
    return this.renderer.domElement.toDataURL("image/jpeg", 0.86);
  }
  /** The town can't keep up: drop one quality level (remembered for next time) and rebuild the frame pipeline. */
  private degrade() {
    const next = lowerQuality(this.quality.level);
    if (!next || !this.alive) return;
    this.quality = next;
    this.post.dispose();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, next.pixelRatio));
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.sun.shadow.mapSize.set(next.shadowMap, next.shadowMap);
    this.post = new PostPipeline(this.renderer, this.scene, this.camera, next, this.width, this.height);
    this.fit();
    this.monitor.reset(performance.now());
  }
  private resume() {
    if (!this.alive || document.hidden || !this.onScreen) return;
    cancelAnimationFrame(this.frame);
    this.last = performance.now();
    this.monitor.reset(this.last);
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
    this.lastLook = { x: event.clientX, y: event.clientY };
  };
  private pointerMove = (event: PointerEvent) => {
    // Street view: drag to look around.
    if (this.street.active && this.pointer && this.lastLook && event.pointerId === this.pointer.id) {
      this.street.look(event.clientX - this.lastLook.x, event.clientY - this.lastLook.y);
      this.lastLook = { x: event.clientX, y: event.clientY };
    }
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
      if (parent) return this.onSelect(String(parent.userData.citizenId));
    }
    // Street view: a click on the ground walks you there.
    if (this.street.active) {
      const ground = new THREE.Vector3();
      if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ground)) this.street.walkTo({ x: ground.x, z: ground.z });
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
    this.street.dispose();
    this.sceneMarker.remove();
    this.bubble.remove();
    this.renderer.domElement.removeEventListener("wheel", this.streetWheel);
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
    this.post.dispose();
    this.horizon.dispose();
    this.skyDome.dispose();
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.art.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.names.remove();
    this.scene.clear();
  }
}

/** Trims a route to its last `metres`-ish units, moving the walker to that point (a scene starts sooner). */
function shortenWalk(model: CitizenModel, length: number) {
  const route = model.route;
  if (route.length < 1) return;
  let remaining = length;
  let from = route[route.length - 1];
  for (let i = route.length - 2; i >= -1; i--) {
    const to = i >= 0 ? route[i] : { x: model.root.position.x, z: model.root.position.z };
    const step = Math.hypot(to.x - from.x, to.z - from.z);
    if (step >= remaining) {
      const t = remaining / Math.max(step, 1e-6);
      model.root.position.x = from.x + (to.x - from.x) * t;
      model.root.position.z = from.z + (to.z - from.z) * t;
      model.route = route.slice(i + 1);
      return;
    }
    remaining -= step;
    from = to;
  }
}
