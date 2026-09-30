import * as THREE from "three";
import { Art } from "./materials";
import type { CitizenAgent } from "@/lib/types";
import { appearanceFor } from "@/lib/appearance";
import { activityIcon } from "@/lib/activity-icon";
import type { Point } from "./layout";
import { armPose, emotionOf, gestureFor, lineEmotion, listenPoseFor, type Emotion, type Gesture } from "./expression";
import type { Human } from "./human";

const NECK = 1.16;

export class CitizenModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly limbs: THREE.Group[] = [];
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
  labelLift = 1.9;
  private walkSpeed = 3.2;
  private belly: THREE.Mesh;
  private umbrella = new THREE.Group();
  private phase = 0;
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
  private heightScale = 1;

  constructor(
    public citizen: CitizenAgent,
    art: Art,
    onSelect: (id: string) => void,
  ) {
    this.root.name = citizen.citizen_id;
    const colors = appearanceFor(citizen);
    this.root.add(this.body);
    const torso = (this.torso = new THREE.Mesh(
      art.geometry(new THREE.CapsuleGeometry(0.2, 0.29, 4, 10)),
      art.material(colors.shirt),
    ));
    torso.position.y = 0.81;
    torso.scale.z = 0.8;
    torso.castShadow = true;
    this.body.add(torso);
    // The head is its own group at the neck, so it can turn, nod and tilt while talking.
    this.head.position.y = NECK;
    this.body.add(this.head);
    const h = this.head;
    art.ball(h, 0, 1.31 - NECK, 0, 0.285, 0.32, 0.26, colors.skin);
    art.ball(h, 0, 1.48 - NECK, -0.035, 0.31, 0.2, 0.28, colors.hair);
    for (let i = 0; i < 5; i++) art.ball(h, -0.2 + i * 0.1, 1.49 - (i % 2) * 0.04 - NECK, 0.17, 0.105, 0.105, 0.1, colors.hair);
    const longHair = ["cit_009", "cit_022", "cit_027"].includes(citizen.citizen_id) || (citizen.life?.sex === "female" && citizen.age >= 13 && !citizen.citizen_id.startsWith("cit_02"));
    if (longHair)
      for (const side of [-1, 1]) art.ball(h, side * 0.25, (citizen.citizen_id === "cit_009" ? 1.19 : 1.3) - NECK, -0.09, 0.1, citizen.citizen_id === "cit_009" ? 0.35 : 0.23, 0.21, colors.hair);
    if (citizen.citizen_id === "cit_028") art.ball(h, 0, 1.67 - NECK, -0.04, 0.16, 0.14, 0.16, colors.hair);
    for (const side of [-1, 1]) {
      art.ball(h, side * 0.105, 1.33 - NECK, 0.235, 0.046, 0.061, 0.026, 0xffffff);
      art.ball(h, side * 0.106, 1.324 - NECK, 0.258, 0.024, 0.039, 0.014, 0x343443);
      art.ball(h, side * 0.15, 1.24 - NECK, 0.221, 0.047, 0.025, 0.019, 0xd59c8d);
      art.ball(h, side * 0.275, 1.31 - NECK, 0, 0.06, 0.085, 0.065, colors.skin);
      // Eyelids close to blink; eyebrows carry the emotion.
      const lid = art.ball(h, side * 0.105, 1.345 - NECK, 0.248, 0.052, 0.001, 0.03, colors.skin);
      lid.castShadow = false;
      this.lids.push(lid);
      const brow = art.box(h, side * 0.105, 1.41 - NECK, 0.232, 0.075, 0.016, 0.012, colors.hair);
      brow.castShadow = false;
      this.brows.push(brow);
    }
    art.ball(h, 0, 1.23 - NECK, 0.262, 0.035, 0.018, 0.013, 0xa9776d);
    this.mouth = art.ball(h, 0, 1.185 - NECK, 0.252, 0.05, 0.012, 0.02, 0x7a3f42);
    this.mouth.castShadow = false;
    art.box(this.body, 0, 0.85, -0.19, 0.32, 0.36, 0.15, 0x8b786f);
    for (const side of [-1, 1])
      art.box(this.body, side * 0.13, 0.9, 0.14, 0.035, 0.33, 0.035, 0xf2e7d4);
    for (let i = 0; i < 4; i++) {
      const arm = i > 1,
        side = i % 2 ? 1 : -1;
      const pivot = new THREE.Group();
      pivot.position.set(side * (arm ? 0.27 : 0.115), arm ? 0.97 : 0.57, 0);
      const limb = new THREE.Mesh(
        art.geometry(
          new THREE.CapsuleGeometry(
            arm ? 0.065 : 0.08,
            arm ? 0.24 : 0.28,
            3,
            8,
          ),
        ),
        art.material(arm ? colors.shirt : 0x566375),
      );
      limb.position.y = -0.18;
      limb.castShadow = true;
      pivot.add(limb);
      if (arm) art.ball(pivot, 0, -0.37, 0.01, 0.075, 0.08, 0.07, colors.skin);
      else {
        art.ball(pivot, 0, -0.44, 0.045, 0.1, 0.075, 0.17, 0xf5ead6);
        art.box(pivot, 0, -0.49, 0.045, 0.17, 0.04, 0.26, 0xc2c3b5);
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
      art.geometry(new THREE.RingGeometry(0.44, 0.49, 40)),
      ringMat,
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.09;
    this.root.add(this.ring);
    // A soft contact shadow keeps them standing on the street rather than floating over it.
    art.contactShadow(this.root, 0.95, 0.95, 0.4);
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
      // The model is drawn at a 155 cm teenager's size; scale to real height and build.
      const scale = (this.heightScale = Math.max(0.36, life.height_cm / 155));
      const build = Math.min(1.35, Math.max(0.85, life.weight_kg / (life.height_cm / 100) ** 2 / 20));
      // A real body already has its own build; stretching it would distort the face.
      if (this.human) this.body.scale.setScalar(scale);
      else this.body.scale.set(scale * build, scale, scale * Math.min(1.2, build));
      this.labelLift = 1.9 * scale + 0.1;
      this.belly.visible = Boolean(life.pregnancy);
      this.walkSpeed = citizen.age >= 75 ? 2.2 : citizen.age >= 65 ? 2.6 : 3.2;
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
    for (const lid of this.lids) lid.scale.y = Math.max(0.001, closed * 0.066);
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
    // The realistic body mirrors the simple rig: same stride, gestures, head turns, blinks and voice.
    this.human?.pose({
      legs: [this.limbs[0].rotation.x, this.limbs[1].rotation.x],
      arms: [[this.limbs[2].rotation.x, this.limbs[2].rotation.z], [this.limbs[3].rotation.x, this.limbs[3].rotation.z]],
      head: { yaw: this.head.rotation.y, pitch: this.head.rotation.x, tilt: this.head.rotation.z },
      lean: { x: 0, z: 0 },
      blink: closed,
      voice,
      emotion,
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
