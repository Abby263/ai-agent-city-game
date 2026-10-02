import * as THREE from "three";

// What makes each resident recognisable at a glance: their own outfit colours, one signature accessory, and the
// way they carry themselves. The bodies share a small set of CC0 outfits; this is what tells them apart.

export type Accessory =
  | { kind: "cap"; color: number; band?: number }
  | { kind: "strawHat" }
  | { kind: "beret"; color: number }
  | { kind: "flatCap"; color: number }
  | { kind: "chefCap" }
  | { kind: "headband"; color: number }
  | { kind: "scarf"; color: number }
  | { kind: "lanyard"; color: number }
  | { kind: "stethoscope" }
  | { kind: "headphones"; color: number }
  | { kind: "apron"; color: number }
  | { kind: "backpack"; color: number }
  | { kind: "guitar" }
  | { kind: "bag"; color: number }
  | { kind: "cane" }
  /** The skirt of a kurta or kameez, from the waist to the knee (or the shin, for a saree-length drape). */
  | { kind: "kurta"; color: number; long?: boolean }
  /** A dupatta over both shoulders, its ends hanging in front. */
  | { kind: "dupatta"; color: number }
  /** A close-fitting cap (the Lucknowi topi). */
  | { kind: "topi"; color: number };

export type Wardrobe = { top: number; bottom: number; accessories: Accessory[] };

const WARDROBE: Record<string, Wardrobe> = {
  cit_009: { top: 0xe9695f, bottom: 0x2f4a70, accessories: [{ kind: "lanyard", color: 0x2f7bd0 }] },                     // Aoi, lab assistant
  cit_010: { top: 0xf0a52e, bottom: 0x33373f, accessories: [{ kind: "guitar" }] },                                        // Ren, barista and musician
  cit_021: { top: 0x1fa187, bottom: 0x1f2328, accessories: [{ kind: "backpack", color: 0xe2572b }] },                     // Riku, footballer
  cit_022: { top: 0xbfdcf2, bottom: 0x4f5a66, accessories: [{ kind: "bag", color: 0x7a4b32 }] },                          // Mio, pharmacy
  cit_026: { top: 0x2f73b0, bottom: 0x474b55, accessories: [{ kind: "cap", color: 0xe8b53a }] },                          // Sota, technician
  cit_027: { top: 0xd9558a, bottom: 0x363d4b, accessories: [{ kind: "beret", color: 0x7a2f43 }] },                        // Hana, artist
  cit_028: { top: 0x208c82, bottom: 0x272b33, accessories: [{ kind: "headphones", color: 0x202227 }] },                   // Rin, engineer
  cit_029: { top: 0xf4f3ee, bottom: 0x2c2f37, accessories: [{ kind: "chefCap" }, { kind: "apron", color: 0xc8432f }] },   // Kaito, cook
  cit_030: { top: 0x6b8a3a, bottom: 0x5a4936, accessories: [{ kind: "cap", color: 0x3f5a2c }, { kind: "scarf", color: 0xf1efe6 }] }, // Takashi, farmer
  cit_031: { top: 0x7b4a92, bottom: 0x2b2e37, accessories: [{ kind: "scarf", color: 0xf0d79a }] },                        // Yuko, bank clerk
  cit_032: { top: 0xa07c50, bottom: 0x524c45, accessories: [{ kind: "strawHat" }, { kind: "cane" }] },                    // Masao, retired farmer
  cit_033: { top: 0xf3f3ef, bottom: 0x2a7a7c, accessories: [{ kind: "stethoscope" }] },                                   // Kaori, doctor
  cit_034: { top: 0xb9502a, bottom: 0x383b43, accessories: [{ kind: "apron", color: 0x2c2723 }] },                        // Daisuke, cafe owner
  cit_035: { top: 0xe6b230, bottom: 0x414e6b, accessories: [{ kind: "bag", color: 0x2e5d4d }] },                          // Keiko, teacher
  cit_036: { top: 0xeceee9, bottom: 0x3d444b, accessories: [{ kind: "lanyard", color: 0xd0492f }] },                      // Naoki, scientist
  cit_037: { top: 0x8a5cab, bottom: 0x5a5560, accessories: [{ kind: "scarf", color: 0xe9e2d2 }] },                        // Yuka, librarian
  cit_038: { top: 0x21344f, bottom: 0x1b2433, accessories: [{ kind: "cap", color: 0x1b2433, band: 0xd9b445 }] },          // Takeshi, police officer
  cit_039: { top: 0xff6444, bottom: 0x22252a, accessories: [{ kind: "headband", color: 0xffffff }] },                     // Natsumi, coach
  cit_040: { top: 0x2a3d57, bottom: 0x222936, accessories: [{ kind: "cap", color: 0x2a3d57, band: 0xc23b2e }] },          // Kenji, station master
  cit_041: { top: 0xe8edef, bottom: 0x3b3f47, accessories: [{ kind: "apron", color: 0x27995a }] },                        // Aiko, konbini owner
  cit_042: { top: 0x5c80bb, bottom: 0x293040, accessories: [{ kind: "bag", color: 0x8a5a2b }] },                          // Haruto, station staff
  cit_043: { top: 0xc94a6b, bottom: 0x292b32, accessories: [{ kind: "bag", color: 0x1f2024 }] },                          // Yui, office worker
  cit_044: { top: 0x44536c, bottom: 0x2a2d36, accessories: [{ kind: "lanyard", color: 0xe0a030 }] },                      // Daichi, mall manager
  cit_045: { top: 0x7c6748, bottom: 0x4a4a43, accessories: [{ kind: "flatCap", color: 0x66735a }] },                      // Hiroshi, retired carpenter
  cit_046: { top: 0xf0f1ee, bottom: 0x775889, accessories: [{ kind: "stethoscope" }, { kind: "scarf", color: 0xa9c7e8 }] }, // Emi, clinic doctor
  cit_047: { top: 0xf28a9d, bottom: 0x454a55, accessories: [{ kind: "apron", color: 0x27995a }, { kind: "headphones", color: 0xf4f1ea }] }, // Sakura, konbini clerk
  // ---- Lucknow ----
  lko_009: { top: 0xe9695f, bottom: 0xf1ece0, accessories: [{ kind: "kurta", color: 0xe9695f }, { kind: "dupatta", color: 0xf6e7c4 }] },                   // Zoya, lab assistant
  lko_010: { top: 0xf0a52e, bottom: 0xf1ece0, accessories: [{ kind: "kurta", color: 0xf0a52e }, { kind: "guitar" }] },                                    // Kabir, kabab cook and singer
  lko_021: { top: 0x1fa187, bottom: 0x1f2328, accessories: [{ kind: "cap", color: 0x2d5fa8 }, { kind: "backpack", color: 0xe2572b }] },                   // Arjun, cricketer
  lko_022: { top: 0xbfdcf2, bottom: 0xf1ece0, accessories: [{ kind: "kurta", color: 0xbfdcf2 }, { kind: "dupatta", color: 0x5c80bb }] },                   // Sana, pharmacy
  lko_026: { top: 0x2f73b0, bottom: 0x474b55, accessories: [{ kind: "cap", color: 0xe8b53a }] },                                                          // Anuj, electrician
  lko_027: { top: 0xd9558a, bottom: 0x363d4b, accessories: [{ kind: "kurta", color: 0xd9558a, long: true }, { kind: "bag", color: 0xd9a03c }] },                       // Tara, artist
  lko_028: { top: 0x208c82, bottom: 0x272b33, accessories: [{ kind: "headphones", color: 0x202227 }, { kind: "lanyard", color: 0xe0523f }] },             // Ananya, engineer
  lko_029: { top: 0xf4f3ee, bottom: 0x2c2f37, accessories: [{ kind: "chefCap" }, { kind: "apron", color: 0xc8432f }] },                                   // Rohan, chaat cook
  lko_030: { top: 0x6b8a3a, bottom: 0xe9e2cf, accessories: [{ kind: "kurta", color: 0x6b8a3a }, { kind: "scarf", color: 0xc8442e }] },                     // Ramesh, mango grower
  lko_031: { top: 0x7b4a92, bottom: 0x5f3474, accessories: [{ kind: "kurta", color: 0x7b4a92, long: true }, { kind: "dupatta", color: 0xf0d79a }] },       // Sunita, bank clerk
  lko_032: { top: 0xf3efe2, bottom: 0xf3efe2, accessories: [{ kind: "kurta", color: 0xf3efe2 }, { kind: "scarf", color: 0xd08a2e }, { kind: "cane" }] },   // Shyam Lal
  lko_033: { top: 0xf3f3ef, bottom: 0x2a7a7c, accessories: [{ kind: "kurta", color: 0xf3f3ef }, { kind: "stethoscope" }] },                                // Nasreen, doctor
  lko_034: { top: 0xf1ead8, bottom: 0xf1ead8, accessories: [{ kind: "kurta", color: 0xf1ead8 }, { kind: "topi", color: 0xfbfaf4 }, { kind: "scarf", color: 0xb9502a }] }, // Imran, kabab house owner
  lko_035: { top: 0xe6b230, bottom: 0x8a3d2f, accessories: [{ kind: "kurta", color: 0xe6b230, long: true }, { kind: "dupatta", color: 0x8a3d2f }] },       // Meera, teacher
  lko_036: { top: 0xeceee9, bottom: 0x3d444b, accessories: [{ kind: "lanyard", color: 0xd0492f }] },                                                      // Alok, scientist
  lko_037: { top: 0x8a5cab, bottom: 0xe9e2d2, accessories: [{ kind: "kurta", color: 0x8a5cab, long: true }, { kind: "dupatta", color: 0xe9e2d2 }] },                   // Farah, librarian
  lko_038: { top: 0xb5a273, bottom: 0xa8956a, accessories: [{ kind: "cap", color: 0x9c8a5a, band: 0xb7362d }] },                                          // Vikram, police inspector (khaki)
  lko_039: { top: 0xff6444, bottom: 0x22252a, accessories: [{ kind: "headband", color: 0xffffff }] },                                                     // Pooja, coach
  lko_040: { top: 0x2a3d57, bottom: 0x222936, accessories: [{ kind: "cap", color: 0x2a3d57, band: 0xc23b2e }] },                                          // Rajendra, station superintendent
  lko_041: { top: 0xd9662b, bottom: 0xb9502a, accessories: [{ kind: "kurta", color: 0xd9662b, long: true }, { kind: "dupatta", color: 0xf2c53d }] },       // Kamla, shop owner
  lko_042: { top: 0x5c80bb, bottom: 0x293040, accessories: [{ kind: "bag", color: 0x8a5a2b }] },                                                          // Aditya, station staff
  lko_043: { top: 0xc94a6b, bottom: 0x292b32, accessories: [{ kind: "bag", color: 0x1f2024 }] },                                                          // Nidhi, marketing
  lko_044: { top: 0x44536c, bottom: 0x2a2d36, accessories: [{ kind: "lanyard", color: 0xe0a030 }] },                                                      // Faizan, arcade manager
  lko_045: { top: 0xefe6d0, bottom: 0xefe6d0, accessories: [{ kind: "kurta", color: 0xefe6d0, long: true }, { kind: "topi", color: 0xfbfaf4 }] },          // Mirza Yusuf, zardozi master
  lko_046: { top: 0xf0f1ee, bottom: 0x775889, accessories: [{ kind: "kurta", color: 0xf0f1ee }, { kind: "stethoscope" }, { kind: "dupatta", color: 0x775889 }] }, // Rekha, clinic doctor
  lko_047: { top: 0xf28a9d, bottom: 0xf1ece0, accessories: [{ kind: "kurta", color: 0xf28a9d }, { kind: "dupatta", color: 0xfbf3e0 }] },                   // Ishita, singer
};

export const wardrobeFor = (citizenId: string): Wardrobe | undefined => WARDROBE[citizenId];

/** How someone walks and stands: no two residents move alike. */
export type Bearing = { cadence: number; stride: number; swing: number; stoop: number; bounce: number; sway: number };

export function bearingFor(citizenId: string, age: number): Bearing {
  let h = 7;
  for (const c of citizenId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = (shift: number) => ((h >>> shift) % 100) / 100;
  const old = THREE.MathUtils.clamp((age - 55) / 30, 0, 1), young = THREE.MathUtils.clamp((30 - age) / 12, 0, 1);
  return {
    cadence: 0.88 + r(0) * 0.24 - old * 0.18,
    stride: 0.85 + r(3) * 0.3 - old * 0.3,
    swing: 0.6 + r(6) * 0.8 - old * 0.25,
    stoop: old * 0.16 + (r(9) - 0.5) * 0.05,
    bounce: 0.7 + young * 0.5 + r(12) * 0.3 - old * 0.4,
    sway: 0.7 + r(15) * 0.7,
  };
}

type Mount = (bone: string, object: THREE.Object3D, offset: THREE.Vector3) => void;
/** Where things sit on this body, in the figure's own units (a 155 cm person is 1.55 tall). */
export type BodyFrame = { headY: number; crownY: number; neckY: number; chestY: number; hipY: number; shoulder: number };

// The spine runs up the back of the torso: the chest is well in front of it, the shoulder blades just behind.
const FRONT = 0.15, BACK = 0.085, SKULL = 0.1;

const mat = (color: number, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
function part(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}
/** A strap, cord or stick between two points. */
function strap(from: [number, number, number], to: [number, number, number], width: number, depth: number, material: THREE.Material) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const mesh = part(new THREE.BoxGeometry(width, a.distanceTo(b), depth), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

/** Builds one accessory and hangs it on the right bone. Sizes are in the figure's units. */
export function addAccessory(accessory: Accessory, frame: BodyFrame, mount: Mount) {
  const group = new THREE.Group();
  const r = SKULL;
  // Hats sit on the crown: their rim a little below the top of the head, whatever the hairstyle.
  const crown = new THREE.Vector3(0, frame.crownY - frame.headY - 0.07, 0.01);
  // Things worn on the torso hang from the upper spine; these are heights relative to it.
  const neck = frame.neckY - frame.chestY, hip = frame.hipY - frame.chestY;
  switch (accessory.kind) {
    case "cap": {
      const cloth = mat(accessory.color);
      const dome = part(new THREE.SphereGeometry(r * 1.12, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cloth);
      dome.scale.y = 0.78;
      const brim = part(new THREE.CylinderGeometry(r * 1.0, r * 1.0, 0.01, 20, 1, false, -Math.PI / 2, Math.PI), cloth, 0, 0.005, r * 0.6);
      brim.scale.z = 0.95;
      group.add(dome, brim);
      if (accessory.band !== undefined) group.add(part(new THREE.CylinderGeometry(r * 1.135, r * 1.135, 0.026, 20, 1, true), mat(accessory.band, 0.5), 0, 0.016, 0));
      mount("head", group, crown);
      break;
    }
    case "flatCap": {
      const cloth = mat(accessory.color, 0.95);
      const dome = part(new THREE.SphereGeometry(r * 1.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cloth, 0, 0.012, 0.012);
      dome.scale.set(1, 0.68, 1.14);
      group.add(dome, part(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.01, 16, 1, false, -Math.PI / 2, Math.PI), cloth, 0, 0.012, r * 0.75));
      mount("head", group, crown);
      break;
    }
    case "strawHat": {
      const straw = mat(0xd9bf7c, 0.95);
      const dome = part(new THREE.SphereGeometry(r * 1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), straw);
      dome.scale.y = 0.85;
      group.add(dome, part(new THREE.CylinderGeometry(r * 2.0, r * 2.1, 0.01, 28), straw, 0, 0.004, 0),
        part(new THREE.CylinderGeometry(r * 1.125, r * 1.125, 0.024, 20, 1, true), mat(0x5b3a22), 0, 0.02, 0));
      mount("head", group, crown);
      break;
    }
    case "beret": {
      const felt = mat(accessory.color, 0.95);
      const disc = part(new THREE.SphereGeometry(r * 1.3, 20, 12), felt, r * 0.2, 0.045, -0.012);
      disc.scale.y = 0.36;
      disc.rotation.z = -0.24;
      group.add(disc, part(new THREE.SphereGeometry(0.01, 8, 6), felt, r * 0.2, 0.085, -0.012));
      mount("head", group, crown);
      break;
    }
    case "chefCap": {
      const white = mat(0xfafaf6, 0.9);
      group.add(part(new THREE.CylinderGeometry(r * 1.1, r * 1.08, 0.07, 20), white, 0, 0.035, 0));
      const puff = part(new THREE.SphereGeometry(r * 1.3, 20, 12), white, 0, 0.11, 0);
      puff.scale.y = 0.6;
      group.add(puff);
      mount("head", group, crown);
      break;
    }
    case "headband": {
      const band = part(new THREE.CylinderGeometry(r * 0.99, r * 0.97, 0.032, 24, 1, true), mat(accessory.color, 0.7));
      (band.material as THREE.Material).side = THREE.DoubleSide;
      band.rotation.x = -0.2;
      mount("head", band, new THREE.Vector3(0, crown.y + 0.012, 0.014));
      break;
    }
    case "headphones": {
      // Worn around the neck, where they're visible from every side.
      const plastic = mat(accessory.color, 0.45);
      const band = part(new THREE.TorusGeometry(0.075, 0.01, 8, 24, Math.PI), plastic, 0, neck - 0.01, 0.0);
      band.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI);
      group.add(band);
      for (const side of [-1, 1]) {
        const cup = part(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 16), plastic, side * 0.075, neck - 0.04, FRONT * 0.5);
        cup.rotation.z = Math.PI / 2;
        group.add(cup);
      }
      mount("spine_03", group, new THREE.Vector3());
      break;
    }
    case "scarf": {
      const wool = mat(accessory.color, 0.95);
      const wrap = part(new THREE.TorusGeometry(0.068, 0.028, 10, 24), wool, 0, neck - 0.02, 0.035);
      wrap.rotation.x = Math.PI / 2 - 0.3;
      wrap.scale.set(1, 1.15, 1);
      group.add(wrap, strap([0.035, neck - 0.04, FRONT * 0.72], [0.045, neck - 0.26, FRONT * 0.98], 0.05, 0.016, wool));
      mount("spine_03", group, new THREE.Vector3());
      break;
    }
    case "lanyard": {
      const cord = mat(accessory.color, 0.6);
      for (const side of [-1, 1]) group.add(strap([side * 0.06, neck - 0.02, FRONT * 0.45], [0, neck - 0.27, FRONT * 1.02], 0.012, 0.006, cord));
      group.add(part(new THREE.BoxGeometry(0.06, 0.08, 0.006), mat(0xf7f7f2, 0.4), 0, neck - 0.31, FRONT * 1.03),
        part(new THREE.BoxGeometry(0.06, 0.02, 0.008), cord, 0, neck - 0.28, FRONT * 1.03));
      mount("spine_03", group, new THREE.Vector3());
      break;
    }
    case "stethoscope": {
      const tube = mat(0x23262b, 0.5), steel = mat(0xc9ccd1, 0.25);
      for (const side of [-1, 1]) group.add(strap([side * 0.065, neck - 0.015, FRONT * 0.4], [side * 0.05, neck - 0.2, FRONT * 0.98], 0.012, 0.012, tube));
      group.add(strap([-0.05, neck - 0.2, FRONT * 0.98], [0.05, neck - 0.2, FRONT * 0.98], 0.012, 0.012, tube));
      const disc = part(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 14), steel, 0.05, neck - 0.23, FRONT * 1.02);
      disc.rotation.x = Math.PI / 2;
      group.add(disc);
      mount("spine_03", group, new THREE.Vector3());
      break;
    }
    case "apron": {
      const cloth = mat(accessory.color, 0.9);
      // A bib over the chest, a skirt to the thighs and a tie round the waist.
      group.add(part(new THREE.BoxGeometry(0.2, 0.2, 0.01), cloth, 0, hip + 0.2, FRONT * 1.03),
        part(new THREE.BoxGeometry(0.3, 0.02, FRONT + BACK + 0.05), cloth, 0, hip + 0.1, (FRONT - BACK) / 2));
      for (const side of [-1, 1]) group.add(strap([side * 0.08, hip + 0.3, FRONT * 1.0], [side * 0.07, neck - 0.01, FRONT * 0.35], 0.022, 0.008, cloth));
      mount("spine_03", group, new THREE.Vector3());
      const skirt = new THREE.Group();
      skirt.add(part(new THREE.BoxGeometry(0.31, 0.3, 0.01), cloth, 0, -0.06, FRONT * 0.98),
        part(new THREE.BoxGeometry(0.1, 0.07, 0.008), mat(0xffffff, 0.8), 0, -0.04, FRONT * 0.98 + 0.008));
      mount("pelvis", skirt, new THREE.Vector3());
      break;
    }
    case "backpack": {
      const cloth = mat(accessory.color, 0.85), dark = mat(0x2b2d33);
      group.add(part(new THREE.BoxGeometry(0.22, 0.28, 0.1), cloth, 0, 0.0, -BACK - 0.05),
        part(new THREE.BoxGeometry(0.16, 0.1, 0.03), dark, 0, -0.05, -BACK - 0.11));
      for (const side of [-1, 1]) {
        group.add(strap([side * 0.09, neck - 0.03, -BACK * 0.6], [side * 0.1, neck - 0.04, FRONT * 0.75], 0.03, 0.01, dark),
          strap([side * 0.1, neck - 0.04, FRONT * 0.75], [side * 0.12, -0.16, FRONT * 0.85], 0.03, 0.01, dark));
      }
      mount("spine_03", group, new THREE.Vector3());
      break;
    }
    case "guitar": {
      // In a soft case slung across the back, neck up over the left shoulder.
      const cloth = mat(0x2a2c31, 0.9), tan = mat(0xb8862f);
      const slung = new THREE.Group();
      const body = part(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 20), cloth, 0, -0.2, 0);
      body.rotation.x = Math.PI / 2;
      const waist = part(new THREE.CylinderGeometry(0.115, 0.115, 0.078, 18), cloth, 0, -0.03, 0);
      waist.rotation.x = Math.PI / 2;
      slung.add(body, waist, part(new THREE.BoxGeometry(0.06, 0.4, 0.045), cloth, 0, 0.22, 0), part(new THREE.BoxGeometry(0.085, 0.09, 0.05), cloth, 0, 0.45, 0));
      slung.rotation.z = -0.55;
      slung.position.set(0, -0.06, -BACK - 0.06);
      group.add(slung, strap([-0.13, neck - 0.01, 0.02], [0.12, hip + 0.12, FRONT * 0.95], 0.035, 0.01, tan),
        strap([-0.13, neck - 0.01, 0.02], [0.02, -0.05, -BACK - 0.01], 0.035, 0.01, tan));
      mount("spine_03", group, new THREE.Vector3());
      break;
    }
    case "bag": {
      const leather = mat(accessory.color, 0.7);
      const side = frame.shoulder + 0.03;
      group.add(strap([0.1, neck - 0.01, 0.03], [-side * 0.9, hip + 0.02, FRONT * 0.75], 0.03, 0.01, leather),
        strap([0.1, neck - 0.01, 0.03], [-side * 0.9, hip + 0.02, -BACK * 0.9], 0.03, 0.01, leather),
        part(new THREE.BoxGeometry(0.08, 0.2, 0.26), leather, -side, hip - 0.08, 0.03));
      mount("spine_03", group, new THREE.Vector3());
      break;
    }
    case "kurta": {
      // Open at the bottom and a little wider there, so legs swing inside it.
      const length = accessory.long ? 0.66 : 0.44;
      const cloth = mat(accessory.color, 0.9);
      cloth.side = THREE.DoubleSide;
      const skirt = part(new THREE.CylinderGeometry(0.185, accessory.long ? 0.2 : 0.215, length + 0.07, 18, 1, true), cloth, 0, 0.14 - (length + 0.07) / 2, 0.02);
      skirt.scale.z = 0.9;
      mount("pelvis", skirt, new THREE.Vector3());
      break;
    }
    case "dupatta": {
      // Worn across the body: over the left shoulder, down across the chest to the right hip, the other end down the back.
      const cloth = mat(accessory.color, 0.92);
      const shoulder: [number, number, number] = [0.115, neck - 0.015, 0.01];
      group.add(strap(shoulder, [0.02, neck - 0.19, FRONT * 0.9], 0.085, 0.012, cloth),
        strap([0.02, neck - 0.19, FRONT * 0.9], [-0.13, hip + 0.1, FRONT * 0.72], 0.085, 0.012, cloth),
        strap(shoulder, [0.12, hip + 0.12, -BACK * 0.95], 0.085, 0.012, cloth));
      mount("spine_03", group, new THREE.Vector3());
      break;
    }
    case "topi": {
      const cloth = mat(accessory.color, 0.9);
      group.add(part(new THREE.CylinderGeometry(r * 1.0, r * 1.06, 0.06, 20), cloth, 0, 0.035, 0));
      const top = part(new THREE.SphereGeometry(r * 1.0, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), cloth, 0, 0.065, 0);
      top.scale.y = 0.28;
      group.add(top);
      mount("head", group, crown);
      break;
    }
    case "cane": {
      const wood = mat(0x5a3a22, 0.6);
      const stick = part(new THREE.CylinderGeometry(0.011, 0.008, 0.66, 8), wood, 0, -0.33, 0);
      const crook = part(new THREE.TorusGeometry(0.03, 0.011, 8, 14, Math.PI), wood, 0, 0, -0.03);
      crook.rotation.y = Math.PI / 2;
      group.add(stick, crook);
      mount("hand_r", group, new THREE.Vector3(0, -0.07, 0.03));
      break;
    }
  }
}
