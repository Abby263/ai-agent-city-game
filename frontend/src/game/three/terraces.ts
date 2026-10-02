import * as THREE from "three";
import type { Art } from "./materials";
import type { Building } from "./layout";
import { roundArchPanel } from "./mughal";
import { clothesline, waterTank } from "./props";

// The street walls of Lucknow. Two kinds:
//  - "chowk": the old city and its bazaars. A shop at street level (shutter down, or open with goods spilling
//    out), a painted board over it, and two or three floors of home above with balconies hung over the road,
//    white railings, shutters, washing, an air conditioner, a water tank and sometimes a hoarding on the roof.
//  - "ganj": Hazratganj. Cream colonial terraces with a round-arched arcade at street level, arched windows above,
//    a balustrade along the roof and every signboard the same black with white letters.

const WALLS = [0xf0e2c0, 0xf3e3a3, 0xe9c1b4, 0xcfe0c6, 0xc6dbe6, 0xecebe4, 0xd6d2c8, 0xe0b877, 0xf0cfa8, 0xd9cbb0];
const SHUTTERS = [0x8d9499, 0x3f6fae, 0x4f8a6b, 0x9a9388, 0x6d7f8f];
const WOODWORK = [0x2f6f6a, 0x3f6f9e, 0x6b4a32, 0x7a3b32, 0x4a6b3a];
const T = { brick: 0x9a5b43, rail: 0xf1efe8, slab: 0xcfcbc3, dark: 0x2b2622, door: 0x3a3028, trim: 0xfbf6e6, ganj: 0xf2e2ae, ganjDeep: 0xe8cf8a, board: 0x1f2226, iron: 0x23262a };
const GOODS = [0xe8463a, 0xf2b632, 0x3f8fd2, 0x57a85a, 0xf08fb0, 0xf5f1e6, 0x8a5fc2, 0xf47c2c, 0x2fb5a8];

export function tagTerraces(art: Art) {
  art.tag("plaster", ...WALLS, T.ganj, T.ganjDeep, T.slab);
  art.tag("roof", T.brick);
  art.tag("metal", ...SHUTTERS, T.iron);
  art.tag("wood", ...WOODWORK, T.door);
}

const BOARDS: Array<[text: string, bg: string, fg: string]> = [
  ["गुप्ता स्वीट्स", "#c8281e", "#fff3c4"], ["RAJA CHIKAN EMPORIUM", "#1f3f7a", "#ffffff"], ["नूर टेलर्स", "#f2c53d", "#7a1f1a"],
  ["बाजपेयी कचौड़ी", "#f6efd9", "#c8281e"], ["ROYAL PAAN BHANDAR", "#0f6b45", "#ffe9a8"], ["मोबाइल रिपेयर", "#f47c2c", "#1f2226"],
  ["SHUKLA MEDICAL", "#f6f6f2", "#1f8a55"], ["अवध ज्वेलर्स", "#7a1f1a", "#f2c53d"], ["KHAN TAILORS", "#2b2d31", "#f6efd9"],
  ["पंडित जी चाय", "#f2c53d", "#1f3f7a"], ["LAKHNAWI ZARDOZI", "#5b2a6b", "#f6e3a8"], ["अंसारी किराना", "#1f8a55", "#ffffff"],
  ["VERMA ELECTRICALS", "#e9e4d2", "#1f3f7a"], ["रस्तोगी साड़ी सेंटर", "#b7245c", "#fff3c4"], ["STAR TENT HOUSE", "#1f6f8a", "#fff8e6"],
  ["नवाबी इत्र", "#3a2a5b", "#f2c53d"],
];
const GANJ_BOARDS = ["GULMOHAR SAREES", "AWADH OPTICIANS", "NAWAB TAILORS", "GOMTI BOOK HOUSE", "SHAHI SWEETS", "CHIKAN PALACE", "LAKHNAWI ITTAR", "COFFEE HOUSE"]
  .map((text): [string, string, string] => [text, "#1f2226", "#f7f1e1"]);
const ADS: Array<[text: string, bg: string, fg: string]> = [
  ["चिकनकारी SALE", "#b7245c", "#fff3c4"], ["LUCKNOW MAHOTSAV", "#1f3f7a", "#f2c53d"], ["शादी का सीज़न", "#c8281e", "#fff3c4"], ["COACHING • IAS PCS", "#f2c53d", "#1f2226"],
];

const boards = new Map<string, THREE.MeshStandardMaterial>();
const planes = new Map<string, THREE.PlaneGeometry>();
/** A painted board from a small shared pool, so a whole street of signs costs a handful of textures. */
function board(art: Art, parent: THREE.Object3D, [text, bg, fg]: [string, string, string], x: number, y: number, z: number, w: number, h: number) {
  const key = `${text}|${bg}`;
  let material = boards.get(key);
  if (!material || !art.materials.has(`board-${key}`)) {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 384, 96);
    ctx.fillStyle = fg;
    ctx.font = "bold 40px 'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Nirmala UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 192, 52, 356);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    art.textures.push(texture);
    material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 });
    art.materials.set(`board-${key}`, material);
    art.glow(material, 0xffffff, 0.05, 0.75);
    boards.set(key, material);
  }
  const size = `${w.toFixed(1)}x${h.toFixed(2)}`;
  if (!planes.has(size) || !art.geometries.includes(planes.get(size)!)) planes.set(size, art.geometry(new THREE.PlaneGeometry(Number(w.toFixed(1)), h)));
  const mesh = new THREE.Mesh(planes.get(size)!, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

const rnd = (seed: number) => {
  const n = Math.sin(seed * 91.7 + 17.3) * 43758.5453;
  return n - Math.floor(n);
};
const FLOOR = 1.15;

export function makeTerrace(art: Art, parent: THREE.Group, b: Building) {
  const group = new THREE.Group();
  group.position.set(b.x, 0, b.z);
  group.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[b.face ?? "s"];
  parent.add(group);
  // In its own frame the building is `w` wide along the street and `d` deep, with its front on +z.
  const sideways = b.face === "e" || b.face === "w";
  const w = sideways ? b.d : b.w, d = sideways ? b.w : b.d, seed = b.seed ?? 1;
  if (b.style === "wall") compoundWall(art, group, w, b.h, seed);
  else if (b.style === "railing") railing(art, group, w, b.h);
  else if (b.style === "ganj") ganj(art, group, w, d, b.h, seed);
  else chowk(art, group, w, d, b.h, seed, b.style === "mohalla");
}

const SLOGANS: Array<[string, string, string]> = [
  ["यहाँ पोस्टर लगाना मना है", "#e9e2cf", "#1f3f7a"], ["स्वच्छ लखनऊ • स्वस्थ लखनऊ", "#f2e7c2", "#1f6f45"], ["VOTE • मतदान अवश्य करें", "#e9e2cf", "#b7245c"],
  ["TUITION Class 6-12 Maths", "#f6efd9", "#c8281e"], ["शर्मा टेंट हाउस 98XXXXXX10", "#f2e7c2", "#1f2226"],
];

/** A compound wall: plastered brick with a coping, pillars, and something painted on it. */
function compoundWall(art: Art, g: THREE.Group, w: number, h: number, seed: number) {
  const plaster = [0xe4dcc8, 0xd9cdb3, 0xcfc6b2, 0xe9d9b0][seed % 4];
  art.box(g, 0, h / 2, 0, w, h, 0.12, seed % 3 === 0 ? T.brick : plaster);
  art.box(g, 0, h + 0.025, 0, w + 0.02, 0.05, 0.18, T.slab);
  art.box(g, -w / 2 + 0.08, h / 2 + 0.06, 0, 0.16, h + 0.12, 0.18, plaster);
  // Rain streaks and a dado of grime along the foot, then a painted notice on some panels.
  art.box(g, 0, 0.09, 0.062, w, 0.18, 0.004, 0x8f8672);
  if (seed % 3 === 1) board(art, g, SLOGANS[seed % SLOGANS.length], 0.06, h * 0.56, 0.064, w - 0.4, Math.min(0.42, h * 0.5));
}

/** Iron railings on a low plinth: round the park, and along Hazratganj's pavements. */
function railing(art: Art, g: THREE.Group, w: number, h: number) {
  art.box(g, 0, 0.09, 0, w, 0.18, 0.14, T.slab);
  art.box(g, 0, h, 0, w, 0.025, 0.03, T.iron);
  art.box(g, 0, 0.3, 0, w, 0.02, 0.02, T.iron);
  const bars = Math.round(w / 0.12);
  for (let i = 0; i <= bars; i++) art.box(g, -w / 2 + (i * w) / bars, (h + 0.18) / 2, 0, 0.014, h - 0.18, 0.014, T.iron);
  art.box(g, -w / 2 + 0.04, h / 2 + 0.05, 0, 0.07, h + 0.1, 0.07, T.iron);
}

/** A family house in a lane, as its own building: the same gate, balconies, washing and water tank as its neighbours. */
export function laneHouse(art: Art, group: THREE.Group, b: Building) {
  const seed = [...b.id].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) % 997;
  chowk(art, group, b.w, b.d, b.h, seed, true);
}

const GATES = [0x2f5f9e, 0x2f7a5a, 0x7a2f2a, 0x4a4f57, 0x8a6a2f];

function chowk(art: Art, g: THREE.Group, w: number, d: number, h: number, seed: number, lane = false) {
  const wall = WALLS[Math.floor(rnd(seed) * WALLS.length)], wood = WOODWORK[Math.floor(rnd(seed + 1) * WOODWORK.length)];
  const front = d / 2, floors = Math.round(h / FLOOR);
  art.box(g, 0, h / 2, 0, w, h, d, wall);
  // Party walls are bare brick: you see them wherever a neighbour is lower or a lane cuts through.
  for (const side of [-1, 1]) art.box(g, side * (w / 2 - 0.004), h / 2, -0.02, 0.012, h, d - 0.04, T.brick);
  // Street level: in a lane, a house's steel gate and front door; on a street, a shop.
  const open = rnd(seed + 2) > 0.34;
  if (lane) {
    const gate = GATES[Math.floor(rnd(seed + 4) * GATES.length)], gw = Math.min(0.9, w * 0.5), gx = (rnd(seed + 8) > 0.5 ? 1 : -1) * (w / 2 - gw / 2 - 0.14);
    art.box(g, gx, 0.47, front + 0.012, gw, 0.9, 0.03, gate);
    art.box(g, gx, 0.47, front + 0.03, 0.02, 0.9, 0.012, T.iron);
    for (let i = 1; i < 4; i++) art.box(g, gx, i * 0.23, front + 0.03, gw - 0.04, 0.014, 0.012, T.iron);
    // The barred ground-floor window and the meter box every house has by its gate.
    art.box(g, -gx, 0.62, front + 0.006, Math.min(0.5, w * 0.3), 0.42, 0.012, 0x6f9aa5);
    for (let i = -2; i <= 2; i++) art.box(g, -gx + i * 0.09, 0.62, front + 0.018, 0.012, 0.42, 0.012, T.iron);
    art.box(g, gx - Math.sign(gx) * (gw / 2 + 0.1), 0.72, front + 0.03, 0.1, 0.14, 0.05, 0x5d6368);
    art.box(g, 0, 0.04, front + 0.14, w - 0.1, 0.08, 0.28, T.slab);
  } else if (open) {
    art.box(g, 0, 0.5, front + 0.004, w - 0.24, 0.96, 0.02, T.dark);
    const count = Math.max(3, Math.floor(w / 0.3));
    for (let i = 0; i < count; i++) {
      const tall = 0.2 + rnd(seed + i * 3) * 0.5;
      art.box(g, -w / 2 + 0.24 + (i * (w - 0.48)) / (count - 1), tall / 2 + 0.06, front + 0.14, 0.2, tall, 0.22, GOODS[Math.floor(rnd(seed + i * 7) * GOODS.length)]);
    }
    art.box(g, 0, 0.03, front + 0.16, w - 0.2, 0.06, 0.34, T.slab);
    // Things hung along the top of the opening: cloth, bags, garlands of packets.
    for (let i = 0; i < Math.floor(w / 0.28); i++) art.box(g, -w / 2 + 0.26 + i * 0.28, 0.84 - rnd(seed + i) * 0.1, front + 0.05, 0.16, 0.2 + rnd(seed + i * 5) * 0.14, 0.02, GOODS[Math.floor(rnd(seed + i * 11) * GOODS.length)]);
  } else {
    const shutter = SHUTTERS[Math.floor(rnd(seed + 4) * SHUTTERS.length)];
    art.box(g, 0, 0.5, front + 0.012, w - 0.24, 0.96, 0.03, shutter);
    for (let i = 1; i < 6; i++) art.box(g, 0, i * 0.16, front + 0.03, w - 0.26, 0.012, 0.012, T.iron);
    art.box(g, 0, 0.05, front + 0.1, w - 0.2, 0.1, 0.2, T.slab);
  }
  if (!lane) {
    for (const side of [-1, 1]) art.box(g, side * (w / 2 - 0.06), 0.52, front + 0.012, 0.12, 1.04, 0.04, wall);
    board(art, g, BOARDS[Math.floor(rnd(seed + 5) * BOARDS.length)], 0, 1.2, front + 0.07, w - 0.12, 0.3);
  }
  // A tin or cloth awning over some shopfronts.
  if (!lane && rnd(seed + 6) > 0.55) {
    const awning = art.box(g, 0, 1.03, front + 0.3, w - 0.1, 0.02, 0.5, [0x7f8c92, 0x3f6fae, 0xc8442e, 0x4f8a6b][seed % 4]);
    awning.rotation.x = 0.28;
  }
  // The homes above: a balcony over the road on every floor.
  for (let floor = 1; floor < floors; floor++) {
    const y = floor * FLOOR;
    const deep = 0.36 + rnd(seed + floor) * 0.14;
    art.box(g, 0, y + 0.42, front + deep / 2, w - 0.06, 0.05, deep, T.slab);
    art.box(g, 0, y + 0.78, front + deep - 0.015, w - 0.06, 0.03, 0.03, T.rail);
    if (rnd(seed + floor * 13) > 0.4) {
      const posts = Math.max(4, Math.round(w / 0.13));
      for (let i = 0; i <= posts; i++) art.box(g, -w / 2 + 0.04 + (i * (w - 0.08)) / posts, y + 0.6, front + deep - 0.015, 0.022, 0.34, 0.022, T.rail);
    } else art.box(g, 0, y + 0.6, front + deep - 0.015, w - 0.08, 0.3, 0.015, T.rail);
    // A door and a shuttered window onto the balcony.
    const doorX = (rnd(seed + floor * 3) - 0.5) * (w - 0.9);
    art.box(g, doorX, y + 0.86, front + 0.006, 0.34, 0.8, 0.012, T.door);
    const winX = doorX > 0 ? doorX - 0.62 : doorX + 0.62;
    if (Math.abs(winX) < w / 2 - 0.3) {
      art.box(g, winX, y + 0.95, front + 0.006, 0.36, 0.44, 0.012, rnd(seed + floor * 17) > 0.45 ? 0x709ba6 : 0x6f9aa5);
      for (const side of [-1, 1]) art.box(g, winX + side * 0.24, y + 0.95, front + 0.012, 0.11, 0.44, 0.012, wood);
    }
    if (rnd(seed + floor * 19) > 0.62) art.box(g, w / 2 - 0.28, y + 1.0, front + 0.08, 0.34, 0.2, 0.14, 0xe7e7e2);
    // Washing over the rail.
    if (rnd(seed + floor * 23) > 0.5) for (let i = 0; i < 3; i++) art.box(g, -w / 2 + 0.3 + i * 0.26 + rnd(seed + i) * 0.1, y + 0.66, front + deep + 0.005, 0.18, 0.26, 0.012, GOODS[Math.floor(rnd(seed + floor + i * 29) * GOODS.length)]);
    art.box(g, 0, y + 0.02, front + 0.01, w, 0.05, 0.03, T.slab);
  }
  // Roof: parapet, tank, and here and there a hoarding on a steel frame.
  art.box(g, 0, h + 0.13, front - 0.03, w, 0.26, 0.06, wall);
  art.box(g, 0, h + 0.13, -front + 0.03, w, 0.26, 0.06, wall);
  waterTank(art, g, (rnd(seed + 31) - 0.5) * (w - 0.8), h + 0.02, -d * 0.2, 0.9);
  if (rnd(seed + 33) > 0.7 && w > 2) clothesline(art, g, -w / 2 + 0.2, w / 2 - 0.2, h + 0.62, d * 0.15, seed);
  if (!lane && rnd(seed + 37) > 0.78 && w > 2) {
    for (const side of [-1, 1]) art.box(g, side * (w / 2 - 0.25), h + 0.7, front - 0.1, 0.04, 1.3, 0.04, T.iron);
    art.box(g, 0, h + 0.98, front - 0.11, w - 0.2, 0.86, 0.03, T.iron);
    board(art, g, ADS[seed % ADS.length], 0, h + 0.98, front - 0.09, w - 0.3, 0.76);
  }
}

function ganj(art: Art, g: THREE.Group, w: number, d: number, h: number, seed: number) {
  const front = d / 2, floors = Math.round((h - 0.25) / FLOOR);
  const cream = seed % 3 ? T.ganj : T.ganjDeep;
  art.box(g, 0, h / 2, 0, w, h, d, cream);
  // Street level: a deep round-arched arcade with the shop set back in its shade, under a black-and-white board.
  const bays = Math.max(2, Math.round(w / 1.0)), bay = w / bays;
  for (let i = 0; i < bays; i++) {
    const x = -w / 2 + bay * (i + 0.5);
    roundArchPanel(art, g, x, 0.02, front + 0.004, bay * 0.74, FLOOR * 0.9, T.dark, 0.02);
    art.box(g, x, 0.3, front + 0.03, bay * 0.5, 0.5, 0.02, GOODS[Math.floor(rnd(seed + i * 3) * GOODS.length)]);
  }
  for (let i = 0; i <= bays; i++) art.box(g, -w / 2 + bay * i, FLOOR / 2, front + 0.03, bay * 0.16, FLOOR, 0.07, T.trim);
  board(art, g, GANJ_BOARDS[Math.floor(rnd(seed + 5) * GANJ_BOARDS.length)], 0, FLOOR + 0.16, front + 0.06, w - 0.2, 0.26);
  art.box(g, 0, FLOOR + 0.34, front + 0.04, w + 0.04, 0.06, 0.12, T.trim);
  // Upper floors: tall round-headed windows between pilasters, a narrow balcony with an iron rail.
  for (let floor = 1; floor < floors; floor++) {
    const y = floor * FLOOR + 0.25;
    for (let i = 0; i < bays; i++) {
      const x = -w / 2 + bay * (i + 0.5);
      roundArchPanel(art, g, x, y + 0.16, front + 0.004, bay * 0.5, FLOOR * 0.72, T.trim, 0.016);
      roundArchPanel(art, g, x, y + 0.2, front + 0.022, bay * 0.38, FLOOR * 0.62, rnd(seed + floor * 7 + i) > 0.5 ? 0x709ba6 : 0x6f9aa5, 0.01);
    }
    for (let i = 0; i <= bays; i++) art.box(g, -w / 2 + bay * i, y + FLOOR / 2, front + 0.02, bay * 0.1, FLOOR, 0.04, T.trim);
    art.box(g, 0, y + 0.1, front + 0.1, w, 0.04, 0.2, T.trim);
    art.box(g, 0, y + 0.36, front + 0.19, w, 0.02, 0.02, T.iron);
    for (let i = 0; i <= Math.round(w / 0.2); i++) art.box(g, -w / 2 + (i * w) / Math.round(w / 0.2), y + 0.24, front + 0.19, 0.012, 0.24, 0.012, T.iron);
  }
  // Cornice and a balustrade along the roof.
  art.box(g, 0, h + 0.03, front + 0.03, w + 0.06, 0.07, d * 0.2, T.trim);
  art.box(g, 0, h + 0.3, front - 0.04, w, 0.04, 0.07, T.trim);
  const posts = Math.max(4, Math.round(w / 0.16));
  for (let i = 0; i <= posts; i++) art.box(g, -w / 2 + (i * w) / posts, h + 0.18, front - 0.04, i % 4 === 0 ? 0.08 : 0.035, 0.24, 0.05, T.trim);
  waterTank(art, g, (rnd(seed + 31) - 0.5) * (w - 0.9), h + 0.02, -d * 0.22, 0.9);
}
