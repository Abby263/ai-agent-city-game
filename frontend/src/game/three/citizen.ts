import * as THREE from "three";
import { Art } from "./materials";
import type { CitizenAgent } from "@/lib/types";
import { appearanceFor, styleFor } from "@/lib/appearance";
import { activityIcon } from "@/lib/activity-icon";
import type { Point } from "./layout";
import { armPose, emotionOf, gestureFor, lineEmotion, listenPoseFor, type Emotion, type Gesture } from "./expression";
import type { Human } from "./human";

const NECK = 1.16;
/**
 * People at the town's true scale: one unit is about 2 m (a storey is 1.25 units), so a 1.7 m adult stands about
 * 0.85 units tall. Everything the figure builds below is in its own 155 cm units and scaled by this.
 */
export const PERSON_SCALE = 0.5;

export class CitizenModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly limbs: THREE.Group[] = [];
  private readonly joints: THREE.Group[] = [];
  readonly ring: THREE.Mesh;
  readonly label: HTMLButtonElement;
  route: Point[] = [];
  destination: Point | null = null;
  moving = false;
  speaking = false;
  speechPaused = false;
  listening = false;
  /** Asleep at home: the model goes indoors and only the nameplate stays on the map. */
  asleep = false;
  /** Height of the nameplate anchor above the ground, following the person's real height. */
  labelLift = 1.9 * PERSON_SCALE;
  private walkSpeed = 1.2;
  private belly: THREE.Mesh;
  private umbrella = new THREE.Group();
  private phase = 0;
  private idleTime = Math.random() * 100;
  private selected = false;
  private readonly head = new THREE.Group();
  private readonly lids: THREE.Mesh[] = [];
  private readonly brows: THREE.Mesh[] = [];
  private mouth!: THREE.Mesh;
  private torso!: THREE.Mesh;
  private emotion: Emotion = "neutral";
  private lineEmotion: Emotion = "neutral";
  private gesture: Gesture = "none";
  private lineKey = "";
  private lineCount = 0;
  private blink = 2 + Math.random() * 3;
  private nod = 0;
  /** 0-1 loudness of this resident's voice right now, set by the renderer from the audio. */
  talkLevel = 0;
  /** World point this resident is looking at during a conversation. */
  lookAt: THREE.Vector3 | null = null;
  /** After a conversation, stay put here until the resident's plans change. */
  hold: { locationId: string; point: Point } | null = null;
  /** A realistic body (MetaHuman) standing in for the simple figure, when one has been loaded. */
  private human: Human | null = null;
  private readonly figure: THREE.Object3D[] = [];
  private heightScale = PERSON_SCALE;

  constructor(
    public citizen: CitizenAgent,
    art: Art,
    onSelect: (id: string) => void,
  ) {
    this.root.name = citizen.citizen_id;
    this.body.scale.setScalar(PERSON_SCALE);
    const colors = appearanceFor(citizen);
    const style = styleFor(citizen);
    const ball = (...args: Parameters<Art["ball"]>) => {
      const mesh: THREE.Mesh = art.ball(...args);
      mesh.geometry = art.humanSphere;
      return mesh;
    };
    this.root.add(this.body);
    const torso = (this.torso = new THREE.Mesh(
      art.geometry(new THREE.CapsuleGeometry(0.17, 0.25, 6, 16)),
      art.material(colors.shirt),
    ));
    torso.position.y = 1;
    torso.scale.z = 0.8;
    torso.castShadow = true;
    this.body.add(torso);
    // The head is its own group at the neck, so it can turn, nod and tilt while talking.
    this.head.position.y = 1.23;
    this.head.scale.set(0.62, 0.62, 0.62);
    art.cylinder(this.body, 0, 1.26, 0, 0.064, 0.14, Number(colors.skin.replace("#", "0x")), 0.064, 12);
    this.body.add(this.head);
    const h = this.head;
    ball(h, 0, 1.31 - NECK, 0, 0.25, 0.32, 0.24, colors.skin);
    ball(h, 0, 1.49 - NECK, -0.05, 0.264, 0.15, 0.25, colors.hair);
    const longHair = style.hairstyle === "long" || style.hairstyle === "bob";
    if (style.hairstyle !== "crop") {
      const fringe = ball(h, -0.08, 1.49 - NECK, 0.13, 0.2, 0.09, 0.12, colors.hair);
      fringe.rotation.z = 0.22;
      ball(h, 0.15, 1.46 - NECK, 0.12, 0.095, 0.13, 0.1, colors.hair);
    }
    if (longHair)
      for (const side of [-1, 1]) ball(h, side * 0.235, (style.hairstyle === "long" ? 1.16 : 1.29) - NECK, -0.1, 0.075, style.hairstyle === "long" ? 0.32 : 0.2, 0.19, colors.hair);
    if (style.hairstyle === "bun") ball(h, 0, 1.53 - NECK, -0.25, 0.14, 0.14, 0.13, colors.hair);
    for (const side of [-1, 1]) {
      ball(h, side * 0.098, 1.33 - NECK, 0.215, 0.045, 0.024, 0.02, 0xe8e4db);
      ball(h, side * 0.098, 1.328 - NECK, 0.234, 0.021, 0.022, 0.012, 0x332d28);
      ball(h, side * 0.102, 1.338 - NECK, 0.244, 0.006, 0.007, 0.004, 0xffffff);
      ball(h, side * 0.246, 1.31 - NECK, 0, 0.035, 0.064, 0.038, colors.skin);
      // Eyelids close to blink; eyebrows carry the emotion.
      const lid = ball(h, side * 0.098, 1.33 - NECK, 0.24, 0.047, 0.001, 0.018, colors.skin);
      lid.castShadow = false;
      this.lids.push(lid);
      const brow = art.box(h, side * 0.105, 1.41 - NECK, 0.232, 0.075, 0.016, 0.012, colors.hair);
      brow.castShadow = false;
      this.brows.push(brow);
      if (style.glasses) {
        const rim = new THREE.Mesh(art.geometry(new THREE.TorusGeometry(0.061, 0.006, 6, 20)), art.material(0x373c40));
        rim.position.set(side * 0.098, 1.33 - NECK, 0.256);
        rim.scale.y = 0.8;
        h.add(rim);
      }
    }
    if (style.glasses) art.box(h, 0, 1.34 - NECK, 0.256, 0.08, 0.009, 0.01, 0x373c40);
    ball(h, 0, 1.28 - NECK, 0.24, 0.032, 0.057, 0.055, colors.skin);
    this.mouth = ball(h, 0, 1.185 - NECK, 0.227, 0.05, 0.012, 0.012, 0x9a655e);
    this.mouth.castShadow = false;
    if (style.outfit === "apron") {
      art.box(this.body, 0, 0.95, 0.142, 0.27, 0.45, 0.025, 0x687363);
      art.box(this.body, 0, 0.86, 0.161, 0.16, 0.1, 0.012, 0x55634e);
      for (const side of [-1, 1]) art.box(this.body, side * 0.095, 1.17, 0.13, 0.024, 0.2, 0.022, 0x687363);
    } else if (style.outfit === "coat" || style.outfit === "jacket") {
      art.box(this.body, 0, 1.13, 0.144, 0.09, 0.28, 0.02, 0xf2f1e9);
      for (const side of [-1, 1]) {
        const lapel = art.box(this.body, side * 0.066, 1.17, 0.15, 0.04, 0.16, 0.025, colors.shirt);
        lapel.rotation.z = side * -0.25;
      }
      art.box(this.body, -0.095, 1.08, 0.155, 0.062, 0.036, 0.012, 0xe4e9e7);
    }
    art.box(this.body, 0, 0.79, 0, 0.3, 0.07, 0.22, style.trousers);
    for (let i = 0; i < 4; i++) {
      const arm = i > 1,
        side = i % 2 ? 1 : -1;
      const pivot = new THREE.Group();
      pivot.position.set(side * (arm ? 0.205 : 0.088), arm ? 1.21 : 0.75, 0);
      const limb = new THREE.Mesh(
        art.geometry(
          new THREE.CapsuleGeometry(
            arm ? 0.055 : 0.073,
            arm ? 0.16 : 0.22,
            5,
            12,
          ),
        ),
        art.material(arm ? colors.shirt : style.trousers),
      );
      limb.position.y = arm ? -0.105 : -0.16;
      limb.castShadow = true;
      pivot.add(limb);
      const joint = new THREE.Group();
      joint.position.y = arm ? -0.24 : -0.34;
      pivot.add(joint);
      this.joints.push(joint);
      ball(joint, 0, arm ? -0.115 : -0.15, 0, arm ? 0.046 : 0.06, arm ? 0.15 : 0.18, arm ? 0.044 : 0.058, arm && style.outfit === "casual" ? colors.skin : arm ? colors.shirt : style.trousers);
      if (arm) ball(joint, 0, -0.28, 0.014, 0.046, 0.071, 0.032, colors.skin);
      else {
        ball(joint, 0, -0.35, 0.035, 0.072, 0.05, 0.135, style.shoes);
        art.box(joint, 0, -0.385, 0.035, 0.132, 0.025, 0.225, 0xcecec6);
      }
      this.body.add(pivot);
      this.limbs.push(pivot);
    }
    this.belly = art.ball(this.body, 0, 0.74, 0.14, 0.2, 0.2, 0.18, colors.shirt);
    this.belly.visible = false;
    this.figure.push(...this.body.children);
    // A folding umbrella, opened when it rains and the resident is outside.
    const canopy = new THREE.Mesh(art.geometry(new THREE.ConeGeometry(0.62, 0.32, 8, 1, true)),
      art.material([0xd8473c, 0x3f7fc2, 0xf2d24b, 0x3a9a6b, 0xe8e6df, 0x8d6fb5][citizen.citizen_id.charCodeAt(citizen.citizen_id.length - 1) % 6]));
    canopy.position.y = 2.02;
    (canopy.material as THREE.Material).side = THREE.DoubleSide;
    this.umbrella.add(canopy);
    art.cylinder(this.umbrella, 0, 1.62, 0, 0.015, 0.8, 0x3a3a3f);
    this.umbrella.position.set(0.18, 0, 0.08);
    this.umbrella.visible = false;
    this.body.add(this.umbrella);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffdb8a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    this.ring = new THREE.Mesh(
      art.geometry(new THREE.RingGeometry(0.44 * PERSON_SCALE, 0.49 * PERSON_SCALE, 40)),
      ringMat,
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.09;
    this.root.add(this.ring);
    // A soft contact shadow keeps them standing on the street rather than floating over it.
    art.contactShadow(this.root, 0.95 * PERSON_SCALE, 0.95 * PERSON_SCALE, 0.4);
    this.label = document.createElement("button");
    this.label.type = "button";
    this.label.className = "citizen-nameplate";
    this.setCitizen(citizen);
    this.label.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect(citizen.citizen_id);
    });
    this.root.userData.citizenId = citizen.citizen_id;
  }
  setCitizen(citizen: CitizenAgent) {
    this.citizen = citizen;
    const life = citizen.life;
    if (life) {
      // Both bodies are normalized around 155 cm, then scaled to the resident's real height.
      const scale = (this.heightScale = Math.max(0.36, life.height_cm / 155) * PERSON_SCALE);
      const build = Math.min(1.35, Math.max(0.85, life.weight_kg / (life.height_cm / 100) ** 2 / 20));
      // A real body already has its own build; stretching it would distort the face.
      if (this.human) this.body.scale.setScalar(scale);
      else this.body.scale.set(scale * build, scale, scale * Math.min(1.2, build));
      this.labelLift = 1.9 * scale + 0.05;
      this.belly.visible = !this.human && Boolean(life.pregnancy);
      // A brisk walk (about 2.4 m/s, a little quick so people keep up with compressed game time); older residents slower.
      this.walkSpeed = citizen.age >= 75 ? 0.85 : citizen.age >= 65 ? 1 : 1.2;
    }
    this.asleep = /sleep/i.test(citizen.current_activity) && citizen.current_location_id === citizen.home_location_id;
    this.emotion = emotionOf(citizen);
    const text = `${activityIcon(citizen.current_activity)} ${citizen.name.split(" ")[0]}`;
    if (this.label.textContent !== text) this.label.textContent = text;
    this.label.title = `${citizen.name}: ${citizen.current_activity}`;
    this.label.setAttribute("aria-label", `Select ${citizen.name} on map, ${citizen.current_activity}`);
  }
  /** Swaps the simple figure for a realistic body; the nameplate, ring, walking and look-at logic stay. */
  attachHuman(human: Human) {
    this.human?.dispose();
    this.human = human;
    for (const part of this.figure) part.visible = false;
    this.body.add(human.root);
    this.body.scale.setScalar(this.heightScale);
  }
    setUmbrella(open: boolean) {
    this.umbrella.visible = open;
  }
  select(selected: boolean) {
    this.selected = selected;
    this.ring.visible = selected || this.speaking || this.listening;
    this.label.setAttribute("aria-pressed", String(selected));
  }
  /** A new spoken line: pick body language that fits the words, the mood and the person. */
  setLine(key: string, text: string) {
    if (key === this.lineKey) return;
    this.lineKey = key;
    this.lineEmotion = lineEmotion(text, this.emotion);
    this.gesture = gestureFor(text, this.lineEmotion, this.lineCount++, this.citizen.citizen_id);
  }
  update(dt: number, reducedMotion: boolean) {
    this.ring.visible = this.selected || this.speaking || this.listening;
    (this.ring.material as THREE.MeshBasicMaterial).color.set(this.speaking ? 0x89ffe0 : this.listening ? 0xaacfee : 0xffdb8a);
    this.label.dataset.speaking = String(this.speaking);
    this.label.dataset.listening = String(this.listening);
    this.moving = this.route.length > 0;
    let travel = dt * this.walkSpeed;
    while (travel > 0 && this.route.length) {
      const point = this.route[0];
      const dx = point.x - this.root.position.x,
        dz = point.z - this.root.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.025) {
        this.route.shift();
        continue;
      }
      this.body.rotation.y = turnToward(this.body.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 12));
      const step = Math.min(travel, distance);
      this.root.position.x += (dx / distance) * step;
      this.root.position.z += (dz / distance) * step;
      travel -= step;
      if (step === distance) this.route.shift();
    }
    this.phase += dt * (this.moving ? 11 : 1.6);
    this.idleTime += dt;
    const t = this.phase;
    const still = reducedMotion;
    const talking = this.speaking && !this.speechPaused;
    const emotion = talking ? this.lineEmotion : this.emotion;
    this.body.position.y = still ? 0 : this.moving ? Math.abs(Math.sin(t)) * 0.045 : emotion === "excited" && talking ? Math.abs(Math.sin(t * 4)) * 0.02 : 0;
    // Breathing and a slow weight shift keep idle people alive.
    this.torso.scale.y = 1 + (still ? 0 : Math.sin(t * 1.3) * 0.012);
    this.body.rotation.z = this.moving || still ? 0 : Math.sin(t * 0.37) * 0.025;
    this.body.rotation.x = this.moving ? 0 : emotion === "angry" && talking ? 0.06 : emotion === "sad" ? -0.03 : talking ? 0.025 : 0;

    const ease = Math.min(1, dt * 7);
    if (this.moving) {
      this.limbs.forEach((limb, i) => {
        limb.rotation.x = still ? 0 : Math.sin(t + (i % 2 ? Math.PI : 0)) * (i < 2 ? 0.5 : -0.35);
        limb.rotation.z = THREE.MathUtils.lerp(limb.rotation.z, (i % 2 ? 1 : -1) * 0.05, ease);
      });
    } else {
      const pose = armPose(talking ? this.gesture : this.speaking || this.listening ? listenPoseFor(this.emotion) : "none", still ? 0 : t);
      [pose.left, pose.right].forEach(([x, out], i) => {
        const limb = this.limbs[i + 2], side = i ? 1 : -1;
        limb.rotation.x = THREE.MathUtils.lerp(limb.rotation.x, x, ease);
        limb.rotation.z = THREE.MathUtils.lerp(limb.rotation.z, side * out, ease);
      });
      this.limbs[0].rotation.x = THREE.MathUtils.lerp(this.limbs[0].rotation.x, 0, ease);
      this.limbs[1].rotation.x = THREE.MathUtils.lerp(this.limbs[1].rotation.x, 0, ease);
    }

    // Head: look at whoever matters, nod while listening, tilt when curious, drop when sad.
    let yaw = 0;
    if (this.lookAt) {
      const toward = Math.atan2(this.lookAt.x - this.root.position.x, this.lookAt.z - this.root.position.z);
      // Mostly toward the other person, but not all the way, so faces stay readable on camera.
      yaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(toward - this.body.rotation.y), Math.cos(toward - this.body.rotation.y)) * 0.7, -0.8, 0.8);
    } else if (!this.moving && !still) yaw = Math.sin(t * 0.21) * 0.35 * Math.max(0, Math.sin(t * 0.07));
    if (this.listening && !talking && !still) {
      this.nod -= dt;
      if (this.nod < -2.5 - (this.citizen.citizen_id.charCodeAt(5) % 3)) this.nod = 0.6;
    }
    const nodding = this.nod > 0 ? Math.sin((0.6 - this.nod) * Math.PI * 3.3) * 0.12 : 0;
    const pitch = (emotion === "sad" ? 0.2 : emotion === "worried" ? 0.08 : 0) + nodding + (talking && !still ? Math.sin(t * 5.3) * 0.03 : 0);
    const tilt = emotion === "curious" || (talking && this.gesture === "shrug") ? 0.13 : 0;
    this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, yaw, ease);
    this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, pitch, ease);
    this.head.rotation.z = THREE.MathUtils.lerp(this.head.rotation.z, tilt, ease);

    // Face: blink, mouth follows the voice, eyebrows show the feeling.
    this.blink -= dt;
    if (this.blink < -0.13) this.blink = 1.8 + Math.random() * 4.2;
    const closed = this.asleep ? 1 : this.blink < 0 ? 1 : emotion === "sad" ? 0.35 : 0;
    for (const lid of this.lids) lid.scale.y = Math.max(0.001, closed * 0.027);
    const voice = talking ? Math.max(this.talkLevel, still ? 0.3 : 0.2 + Math.abs(Math.sin(t * 17)) * 0.5 * (this.talkLevel ? 0 : 1)) : 0;
    this.mouth.scale.set(emotion === "happy" || emotion === "excited" ? 0.068 : emotion === "sad" ? 0.042 : 0.052, 0.012 + Math.min(1, voice) * 0.05, 0.02);
    const browTilt = emotion === "angry" ? -0.38 : emotion === "sad" || emotion === "worried" ? 0.3 : 0;
    const browLift = emotion === "excited" || emotion === "curious" ? 0.025 : emotion === "angry" ? -0.012 : 0;
    this.brows.forEach((brow, i) => {
      const side = i ? 1 : -1;
      brow.rotation.z = THREE.MathUtils.lerp(brow.rotation.z, side * browTilt, ease);
      brow.position.y = THREE.MathUtils.lerp(brow.position.y, 1.41 - NECK + browLift, ease);
    });

    this.ring.scale.setScalar(
      this.selected && !reducedMotion ? 1 + Math.sin(this.phase) * 0.025 : 1,
    );
    this.joints.forEach((joint, i) => {
      const swing = this.limbs[i].rotation.x;
      const bend = i < 2 ? (this.moving ? Math.max(0, -swing) * 1.3 : 0.02) : -0.12 + Math.min(0, swing) * 0.65;
      joint.rotation.x = THREE.MathUtils.lerp(joint.rotation.x, bend, ease);
    });
    // The realistic body mirrors the simple rig: same stride, gestures, head turns, blinks and voice.
    this.human?.pose({
      legs: [this.limbs[0].rotation.x, this.limbs[1].rotation.x],
      arms: [[this.limbs[2].rotation.x, this.limbs[2].rotation.z], [this.limbs[3].rotation.x, this.limbs[3].rotation.z]],
      head: { yaw: this.head.rotation.y, pitch: this.head.rotation.x, tilt: this.head.rotation.z },
      lean: { x: 0, z: 0 },
      blink: closed,
      voice,
      emotion,
      gait: { moving: this.moving && !still, phase: this.phase },
      time: still ? 0 : this.idleTime,
    }, dt);
  }
  dispose() {
    this.human?.dispose();
    this.label.remove();
    (this.ring.material as THREE.Material).dispose();
    this.root.removeFromParent();
  }
}

function turnToward(current: number, target: number, amount: number) {
  return current + Math.atan2(Math.sin(target - current), Math.cos(target - current)) * amount;
}
