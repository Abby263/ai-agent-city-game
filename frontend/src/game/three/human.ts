import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Emotion } from "./expression";

// Textured residents exported as GLB: MPFB game-engine rigs or compatible MetaHuman rigs.
// No animation files are needed: the body is posed from the same motion the simple figures use (walk swing,
// gestures, head turns), applied in the character's own space, and the face runs on ARKit shapes.
// See docs/open-character-art.md and docs/metahuman-characters.md for authoring workflows.

/** Height of a loaded human before the resident's own height scaling, matching the simple figure (155 cm). */
const BASE_HEIGHT = 1.55;

export type HumanAsset = { file: string; facingDegrees?: number };
type Manifest = { residents?: Record<string, HumanAsset> };

export function validHumanAsset(value: unknown): value is HumanAsset {
  if (!value || typeof value !== "object") return false;
  const entry = value as HumanAsset;
  return typeof entry.file === "string" && /^[a-zA-Z0-9_-]+\.glb$/.test(entry.file) &&
    (entry.facingDegrees === undefined || (Number.isFinite(entry.facingDegrees) && Math.abs(entry.facingDegrees) <= 360));
}

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
const ANIMATED_SHAPES = new Set([...FACE_SHAPES, "jawOpen", "mouthFunnel", "eyeBlinkLeft", "eyeBlinkRight"]);
const REQUIRED_BONES = ["pelvis", "spine_03", "neck_01", "head", "thigh_l", "thigh_r", "calf_l", "calf_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r"];

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

  constructor(gltf: GLTF, asset?: HumanAsset) {
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
        if ((material.transparent || material.alphaTest > 0) && /hair|brow|lash|beard|mustache/i.test(`${material.name} ${mesh.name}`)) {
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
      // Lashes and brows often contain blink/expression shapes but no jaw shape.
      if (mesh.morphTargetInfluences && mesh.morphTargetDictionary &&
        Object.keys(mesh.morphTargetDictionary).some((name) => ANIMATED_SHAPES.has(name))) this.faces.push(mesh);
    });

    // Face the character along +Z (the town's forward), whatever the exporter's convention.
    const thighL = bones.get("thigh_l"), thighR = bones.get("thigh_r");
    const holder = new THREE.Group();
    holder.add(model);
    if (thighL && thighR) {
      const left = thighL.getWorldPosition(new THREE.Vector3()).sub(thighR.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
      const forward = new THREE.Vector3().crossVectors(left, Y);
      holder.rotation.y = -Math.atan2(forward.x, forward.z);
    }
    if (asset?.facingDegrees !== undefined) holder.rotation.y = THREE.MathUtils.degToRad(asset.facingDegrees);
    holder.updateMatrixWorld(true);
    // Stand on the ground at the figure's base height.
    const box = new THREE.Box3();
    holder.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      // expandByObject would include hidden export helper meshes in the measured height.
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        const skinned = mesh as THREE.SkinnedMesh;
        skinned.computeBoundingBox();
        if (skinned.boundingBox) box.union(skinned.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
      } else {
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
      }
    });
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.25, 0, -0.25), new THREE.Vector3(0.25, BASE_HEIGHT, 0.25));
    const scale = BASE_HEIGHT / Math.max(0.1, box.max.y - box.min.y);
    holder.scale.setScalar(scale);
    holder.position.set(-(box.max.x + box.min.x) * 0.5 * scale, -box.min.y * scale, -(box.max.z + box.min.z) * 0.5 * scale);
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
    return REQUIRED_BONES.every((name) => this.joints.has(name));
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
    const disposed = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    const release = (resource: THREE.BufferGeometry | THREE.Material | THREE.Texture) => {
      if (!disposed.has(resource)) { disposed.add(resource); resource.dispose(); }
    };
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      release(mesh.geometry);
      for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
        for (const value of Object.values(material)) if ((value as THREE.Texture)?.isTexture) release(value as THREE.Texture);
        release(material);
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
    return validHumanAsset((await this.list()).residents?.[citizenId]);
  }

  load(citizenId: string) {
    let pending = this.pending.get(citizenId);
    if (!pending) {
      pending = this.list().then(async (manifest) => {
        const entry = manifest.residents?.[citizenId];
        if (!validHumanAsset(entry)) return null;
        await this.slot();
        try {
          const gltf = await this.loader.loadAsync(`${this.base}${entry.file}`);
          const human = new Human(gltf, entry);
          return human.animated ? human : (human.dispose(), null);
        } catch {
          console.warn(`Character asset could not load for ${citizenId}; using the lightweight resident.`);
          return null;
        } finally {
          this.release();
        }
      }).finally(() => this.pending.delete(citizenId));
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
