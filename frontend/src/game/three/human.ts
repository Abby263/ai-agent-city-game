import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Emotion } from "./expression";

// Realistic residents: MetaHumans exported as GLB (UE MetaHuman skeleton + the 51 ARKit face shapes).
// No animation files are needed: the body is posed from the same motion the simple figures use (walk swing,
// gestures, head turns), applied in the character's own space, and the face runs on ARKit shapes.
// See docs/metahuman-characters.md for how to export a resident.

/** Height of a loaded human before the resident's own height scaling, matching the simple figure (155 cm). */
const BASE_HEIGHT = 1.55;

type Manifest = { residents?: Record<string, { file: string }> };

/** What the resident's simple rig is doing this frame, mirrored onto the real skeleton and face. */
export type HumanPose = {
  /** Leg pivots (rotation about the side axis), right leg first: the figure's limbs[0] and limbs[1]. */
  legs: [number, number];
  /** Arm pivots [forward swing, outward lift], right arm first: the figure's limbs[2] and limbs[3]. */
  arms: [[number, number], [number, number]];
  head: { yaw: number; pitch: number; tilt: number };
  /** Whole-body lean forward/back and side to side. */
  lean: { x: number; z: number };
  /** 0-1 eyelid closure, 0-1 mouth opening from the voice. */
  blink: number;
  voice: number;
  emotion: Emotion;
};

// ARKit shape weights for each emotion (both sides where the shape is sided).
const FACES: Record<Emotion, Record<string, number>> = {
  neutral: {},
  happy: { mouthSmileLeft: 0.55, mouthSmileRight: 0.55, cheekSquintLeft: 0.25, cheekSquintRight: 0.25 },
  excited: { mouthSmileLeft: 0.75, mouthSmileRight: 0.75, eyeWideLeft: 0.35, eyeWideRight: 0.35, browInnerUp: 0.35, browOuterUpLeft: 0.3, browOuterUpRight: 0.3 },
  sad: { mouthFrownLeft: 0.5, mouthFrownRight: 0.5, browInnerUp: 0.65, mouthPressLeft: 0.2, mouthPressRight: 0.2 },
  angry: { browDownLeft: 0.75, browDownRight: 0.75, noseSneerLeft: 0.3, noseSneerRight: 0.3, mouthPressLeft: 0.35, mouthPressRight: 0.35 },
  worried: { browInnerUp: 0.55, mouthStretchLeft: 0.2, mouthStretchRight: 0.2, eyeWideLeft: 0.15, eyeWideRight: 0.15 },
  curious: { browOuterUpLeft: 0.45, browInnerUp: 0.2, mouthSmileLeft: 0.12 },
};
const FACE_SHAPES = [...new Set(Object.values(FACES).flatMap((f) => Object.keys(f)))];

type Joint = {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  /** Rest orientation relative to the character, to turn character-space rotations into this bone's own. */
  world: THREE.Quaternion;
};

const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qInv = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export class Human {
  readonly root = new THREE.Group();
  private readonly joints = new Map<string, Joint>();
  private readonly faces: THREE.Mesh[] = [];
  /** Rotation that brings each arm from the export's A-pose down to hanging at the side. */
  private readonly armsDown = new Map<string, THREE.Quaternion>();
  private readonly weights = new Map<string, number>();

  constructor(gltf: GLTF) {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const bones = new Map<string, THREE.Bone>();
    model.traverse((object) => {
      if ((object as THREE.Bone).isBone && !bones.has(object.name.toLowerCase())) bones.set(object.name.toLowerCase(), object as THREE.Bone);
      const mesh = object as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
      if (materials.every((m) => /hide/i.test(m.name))) mesh.visible = false;
      for (const material of materials) {
        // Hair, brows and lashes are cards with see-through strands: cut-out plus MSAA smoothing sorts correctly.
        if (material.transparent && /hair|brow|lash|beard|mustache/i.test(`${material.name} ${mesh.name}`)) {
          material.transparent = false;
          material.alphaTest = 0.35;
          material.alphaToCoverage = true;
          material.depthWrite = true;
        }
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Skinned bounds follow the bind pose, not the animated body; never cull a resident by mistake.
      mesh.frustumCulled = false;
      if (mesh.morphTargetDictionary && "jawOpen" in mesh.morphTargetDictionary) this.faces.push(mesh);
    });

    // Face the character along +Z (the town's forward), whatever the exporter's convention.
    const thighL = bones.get("thigh_l"), thighR = bones.get("thigh_r");
    if (thighL && thighR) {
      const left = thighL.getWorldPosition(new THREE.Vector3()).sub(thighR.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
      const forward = new THREE.Vector3().crossVectors(left, Y);
      model.rotation.y = -Math.atan2(forward.x, forward.z);
    }
    const holder = new THREE.Group();
    holder.add(model);
    holder.updateMatrixWorld(true);
    // Stand on the ground at the figure's base height.
    const box = new THREE.Box3().setFromObject(holder, true);
    const scale = BASE_HEIGHT / Math.max(0.1, box.max.y - box.min.y);
    holder.scale.setScalar(scale);
    holder.position.y = -box.min.y * scale;
    this.root.add(holder);
    this.root.updateMatrixWorld(true);

    const rootInverse = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const name of ["pelvis", "spine_01", "spine_03", "spine_05", "neck_01", "head", "thigh_l", "thigh_r", "calf_l", "calf_r",
      "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r"]) {
      const bone = bones.get(name);
      if (!bone) continue;
      this.joints.set(name, { bone, rest: bone.quaternion.clone(), world: rootInverse.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion())) });
    }
    for (const side of ["l", "r"]) {
      const upper = bones.get(`upperarm_${side}`), lower = bones.get(`lowerarm_${side}`);
      if (!upper || !lower) continue;
      const toRoot = this.root.matrixWorld.clone().invert();
      const from = lower.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot).sub(upper.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot)).normalize();
      const out = side === "l" ? 1 : -1;
      this.armsDown.set(side, new THREE.Quaternion().setFromUnitVectors(from, new THREE.Vector3(out * 0.14, -1, 0.04).normalize()));
    }
  }

  get animated() {
    return this.joints.has("thigh_l") && this.joints.has("upperarm_l");
  }

  /** Rotates a joint by a rotation given in the character's space, on top of its rest pose. */
  private turn(name: string, rotation: THREE.Quaternion) {
    const joint = this.joints.get(name);
    if (!joint) return;
    qInv.copy(joint.world).invert();
    joint.bone.quaternion.copy(joint.rest).multiply(q2.copy(qInv).multiply(rotation).multiply(joint.world));
  }

  pose(p: HumanPose, dt: number) {
    const rot = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
    // Legs: swing from the hip; the knee bends as the leg comes forward.
    (["r", "l"] as const).forEach((side, i) => {
      const swing = p.legs[i];
      this.turn(`thigh_${side}`, rot(X, swing));
      this.turn(`calf_${side}`, rot(X, Math.max(0, -swing) * 1.3 + Math.abs(swing) * 0.2));
    });
    // Arms: down from the A-pose, then the figure's swing and lift; elbows soften as the arm comes up.
    (["r", "l"] as const).forEach((side, i) => {
      const [forward, out] = p.arms[i];
      const down = this.armsDown.get(side) ?? q.identity();
      this.turn(`upperarm_${side}`, rot(Z, out).multiply(rot(X, forward)).multiply(down));
      this.turn(`lowerarm_${side}`, rot(X, -0.12 + Math.min(0, forward) * 0.6));
    });
    this.turn("spine_03", rot(X, p.lean.x * 0.6).multiply(rot(Z, p.lean.z * 0.6)));
    // Head: shared between neck and skull so turns look natural.
    const head = rot(Y, p.head.yaw * 0.5).multiply(rot(X, p.head.pitch * 0.5)).multiply(rot(Z, p.head.tilt * 0.5));
    this.turn("neck_01", head);
    this.turn("head", head);

    // Face: ease towards the emotion's expression, then blink and speak on top.
    const target = FACES[p.emotion];
    const ease = Math.min(1, dt * 6);
    for (const shape of FACE_SHAPES) {
      const now = this.weights.get(shape) ?? 0;
      this.weights.set(shape, now + ((target[shape] ?? 0) - now) * ease);
    }
    this.weights.set("eyeBlinkLeft", p.blink);
    this.weights.set("eyeBlinkRight", p.blink);
    this.weights.set("jawOpen", Math.min(1, p.voice) * 0.32);
    this.weights.set("mouthFunnel", Math.min(1, p.voice) * 0.12);
    for (const mesh of this.faces) {
      const dictionary = mesh.morphTargetDictionary!, influences = mesh.morphTargetInfluences!;
      this.weights.forEach((weight, shape) => {
        const index = dictionary[shape];
        if (index !== undefined) influences[index] = weight;
      });
    }
  }

  dispose() {
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
        for (const value of Object.values(material)) if ((value as THREE.Texture)?.isTexture) (value as THREE.Texture).dispose();
        material.dispose();
      }
    });
    this.root.removeFromParent();
  }
}

/**
 * Finds out which residents have a realistic model (public/characters/manifest.json) and loads them on
 * request, a couple at a time. Residents without one keep their simple figure.
 */
export class HumanLibrary {
  private manifest?: Promise<Manifest>;
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly pending = new Map<string, Promise<Human | null>>();
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly base = "/characters/") {}

  private list() {
    this.manifest ??= fetch(`${this.base}manifest.json`)
      .then((response) => (response.ok ? (response.json() as Promise<Manifest>) : {}))
      .catch(() => ({}));
    return this.manifest;
  }

  async has(citizenId: string) {
    return Boolean((await this.list()).residents?.[citizenId]);
  }

  load(citizenId: string) {
    let pending = this.pending.get(citizenId);
    if (!pending) {
      pending = this.list().then(async (manifest) => {
        const entry = manifest.residents?.[citizenId];
        if (!entry) return null;
        await this.slot();
        try {
          const gltf = await this.loader.loadAsync(`${this.base}${entry.file}`);
          const human = new Human(gltf);
          return human.animated ? human : (human.dispose(), null);
        } catch {
          return null;
        } finally {
          this.release();
        }
      });
      this.pending.set(citizenId, pending);
    }
    return pending;
  }

  private slot() {
    if (this.active < 2) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.queue.push(() => { this.active++; resolve(); }));
  }

  private release() {
    this.active--;
    this.queue.shift()?.();
  }
}
