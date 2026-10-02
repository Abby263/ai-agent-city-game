import * as THREE from "three";
import type { Art } from "./materials";

// The small things that make a Tokyo street: lit shop interiors behind the glass, projecting signs, banner flags,
// paper lanterns, vending machines, parked bicycles, potted plants by the door. Lit pieces glow after dark (Art.glow).

const P = { ink: 0x2f3438, pot: 0xb5674a, leaf: 0x5e8f4e, steel: 0xb9bdc0, tyre: 0x26292c };

function canvasTexture(art: Art, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  art.textures.push(texture);
  return texture;
}

/** A flat picture that glows a little by day and brightly at night. */
function litPanel(art: Art, parent: THREE.Object3D, texture: THREE.Texture, x: number, y: number, z: number, w: number, h: number, day: number, night: number) {
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35 });
  art.materials.set(`panel-${art.materials.size}`, material);
  art.glow(material, 0xffffff, day, night);
  const mesh = new THREE.Mesh(art.geometry(new THREE.PlaneGeometry(w, h)), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

const rand = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

export type Interior = "konbini" | "cafe" | "pharmacy" | "shop";
const PRODUCTS = ["#e8463a", "#f2b632", "#3f8fd2", "#57a85a", "#f08fb0", "#f5f1e6", "#8a5fc2", "#f47c2c", "#2fb5a8"];

/** What you see through a shopfront: shelves of products, or a cafe counter under pendant lamps. */
export function shopInterior(art: Art, parent: THREE.Object3D, kind: Interior, seed: number, x: number, y: number, z: number, w: number, h: number) {
  const texture = canvasTexture(art, 512, Math.max(128, Math.round((512 * h) / w / 16) * 16), (ctx) => {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const wall = ctx.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, kind === "cafe" ? "#f6d9a6" : "#fbfaf2");
    wall.addColorStop(1, kind === "cafe" ? "#b98852" : "#dfe4dc");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H);
    // Ceiling lights.
    ctx.fillStyle = kind === "cafe" ? "#fff1c9" : "#ffffff";
    for (let i = 0; i < 5; i++) ctx.fillRect(30 + i * 100, 6, 60, 8);
    if (kind === "cafe") {
      ctx.fillStyle = "#3b2a20";
      ctx.fillRect(W * 0.52, H * 0.12, W * 0.42, H * 0.3);
      ctx.fillStyle = "#f3e7cf";
      ctx.font = `bold ${Math.round(H * 0.07)}px Arial`;
      for (let i = 0; i < 4; i++) ctx.fillRect(W * 0.56, H * (0.17 + i * 0.06), W * (0.18 + rand(seed + i) * 0.14), H * 0.022);
      // Pendant lamps and the counter with an espresso machine.
      for (let i = 0; i < 3; i++) {
        const lx = W * (0.12 + i * 0.15);
        ctx.fillStyle = "#2d2520";
        ctx.fillRect(lx, 0, 3, H * 0.22);
        ctx.fillStyle = "#ffcf73";
        ctx.beginPath();
        ctx.arc(lx + 1, H * 0.25, H * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#6b4630";
      ctx.fillRect(0, H * 0.62, W, H * 0.38);
      ctx.fillStyle = "#8a5d3e";
      ctx.fillRect(0, H * 0.6, W, H * 0.05);
      ctx.fillStyle = "#c9ccd1";
      ctx.fillRect(W * 0.62, H * 0.44, W * 0.14, H * 0.17);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = PRODUCTS[(seed + i) % PRODUCTS.length]; ctx.fillRect(W * (0.08 + i * 0.07), H * 0.5, W * 0.045, H * 0.1); }
      return;
    }
    // Shelves, floor to ceiling, packed with products.
    const rows = 4, top = H * 0.14, rowH = (H * 0.8) / rows;
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = "#c9cdc6";
      ctx.fillRect(0, top + (r + 1) * rowH - 5, W, 5);
      let px = 6;
      for (let i = 0; px < W - 12; i++) {
        const pw = 10 + rand(seed + r * 31 + i) * 16, ph = rowH * (0.45 + rand(seed + r * 17 + i * 3) * 0.4);
        ctx.fillStyle = kind === "pharmacy" && rand(seed + i + r) < 0.5 ? "#f7f7f2" : PRODUCTS[Math.floor(rand(seed + r * 7 + i * 13) * PRODUCTS.length)];
        ctx.fillRect(px, top + (r + 1) * rowH - 5 - ph, pw, ph);
        px += pw + 3;
      }
    }
    if (kind === "konbini") {
      // The drinks fridge wall at one end and the till at the other.
      ctx.fillStyle = "#dff3ff";
      ctx.fillRect(W * 0.74, top, W * 0.26, H * 0.8);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { ctx.fillStyle = PRODUCTS[(r * 3 + c + seed) % PRODUCTS.length]; ctx.fillRect(W * 0.76 + c * W * 0.033, top + 8 + r * H * 0.155, W * 0.02, H * 0.1); }
    }
  });
  return litPanel(art, parent, texture, x, y, z, w, h, 0.5, 1.2);
}

/** A sign that sticks out from the wall, lettered top to bottom, lit from inside at night. */
export function projectingSign(art: Art, parent: THREE.Object3D, letters: string[], x: number, y: number, z: number, bg: string, fg: string) {
  const w = 0.3, h = 0.34 * letters.length + 0.08;
  const texture = canvasTexture(art, 128, Math.round((128 * h) / w), (ctx) => {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 92px 'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', Arial, sans-serif";
    letters.forEach((letter, i) => ctx.fillText(letter, W / 2, ((i + 0.5) * H) / letters.length + 4, W - 16));
  });
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);
  art.box(group, 0, 0, 0, 0.07, h + 0.04, w + 0.04, P.ink);
  for (const side of [-1, 1]) litPanel(art, group, texture, side * 0.037, 0, 0, w, h, 0.2, 1.3).rotation.y = (side * Math.PI) / 2;
  art.box(group, 0, h / 2 - 0.05, -w / 2 - 0.07, 0.03, 0.03, 0.14, P.ink);
  art.box(group, 0, -h / 2 + 0.05, -w / 2 - 0.07, 0.03, 0.03, 0.14, P.ink);
}

/** Nobori: the tall cloth banners outside Japanese shops. */
export function banner(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, color: number) {
  art.cylinder(parent, x, base + 0.95, z, 0.012, 1.9, P.steel, 0.012, 6);
  art.box(parent, x, base + 0.03, z, 0.2, 0.06, 0.2, 0x8b8f93);
  art.box(parent, x + 0.14, base + 1.2, z, 0.26, 1.3, 0.012, color);
  art.box(parent, x + 0.14, base + 1.72, z + 0.008, 0.2, 0.16, 0.004, 0xfdfbf3);
  art.box(parent, x + 0.07, base + 1.86, z, 0.16, 0.012, 0.012, P.steel);
}

/** A row of paper lanterns under the eaves; they glow warm at night. */
export function lanterns(art: Art, parent: THREE.Object3D, from: number, to: number, y: number, z: number, count: number) {
  for (let i = 0; i < count; i++) {
    const x = from + ((to - from) * (i + 0.5)) / count;
    const lantern = art.ball(parent, x, y, z, 0.085, 0.105, 0.085, i % 2 ? LANTERN_WHITE : LANTERN_RED);
    lantern.castShadow = false;
    art.box(parent, x, y + 0.1, z, 0.06, 0.02, 0.06, P.ink);
    art.box(parent, x, y - 0.1, z, 0.06, 0.02, 0.06, P.ink);
  }
  art.box(parent, (from + to) / 2, y + 0.13, z, Math.abs(to - from), 0.012, 0.012, P.ink);
}
export const LANTERN_RED = 0xe2452f, LANTERN_WHITE = 0xfff4dc;

export function pottedPlant(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, seed: number) {
  const tall = rand(seed) > 0.5;
  art.cylinder(parent, x, base + 0.07, z, 0.06, 0.14, seed % 3 ? P.pot : 0x7f8a8c, 0.08, 10);
  const leaves = art.ball(parent, x, base + (tall ? 0.3 : 0.22), z, 0.1, tall ? 0.18 : 0.1, 0.1, rand(seed + 2) > 0.7 ? 0xd97a9a : P.leaf);
  leaves.castShadow = true;
}

/** A sandwich board on the pavement. */
export function aFrame(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, color: number) {
  for (const side of [-1, 1]) {
    const board = art.box(parent, x, base + 0.3, z + side * 0.07, 0.32, 0.56, 0.02, color);
    board.rotation.x = side * 0.22;
    const paper = art.box(parent, x, base + 0.33, z + side * 0.085, 0.24, 0.36, 0.012, 0xfdfbf3);
    paper.rotation.x = side * 0.22;
  }
}

/** A drinks machine with a lit front: on almost every Tokyo corner. */
export function vendingMachine(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, color: number, seed: number) {
  art.box(parent, x, base + 0.47, z, 0.5, 0.94, 0.36, color);
  const texture = canvasTexture(art, 128, 192, (ctx) => {
    ctx.fillStyle = "#f7fbff";
    ctx.fillRect(0, 0, 128, 192);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      ctx.fillStyle = PRODUCTS[Math.floor(rand(seed + r * 9 + c) * PRODUCTS.length)];
      ctx.fillRect(8 + c * 19, 10 + r * 40, 13, 28);
      ctx.fillStyle = "#3a4046";
      ctx.fillRect(10 + c * 19, 42 + r * 40, 9, 4);
    }
    ctx.fillStyle = "#30363c";
    ctx.fillRect(0, 132, 128, 60);
    ctx.fillStyle = "#11161a";
    ctx.fillRect(14, 150, 70, 26);
    ctx.fillStyle = "#9fe3b0";
    ctx.fillRect(94, 142, 20, 10);
  });
  litPanel(art, parent, texture, x, base + 0.5, z + 0.182, 0.44, 0.8, 0.3, 1.3);
}

export function bicycle(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, angle: number, color: number) {
  const g = new THREE.Group();
  g.position.set(x, base, z);
  g.rotation.y = angle;
  // Leaning on its stand.
  g.rotation.z = 0.08;
  parent.add(g);
  for (const xx of [-0.27, 0.27]) {
    const wheel = art.cylinder(g, xx, 0.17, 0, 0.17, 0.02, P.tyre, 0.17, 16);
    wheel.rotation.x = Math.PI / 2;
  }
  art.box(g, 0, 0.27, 0, 0.5, 0.025, 0.025, color);
  const down = art.box(g, 0.06, 0.34, 0, 0.36, 0.025, 0.025, color);
  down.rotation.z = 0.55;
  art.box(g, 0.24, 0.38, 0, 0.022, 0.42, 0.022, P.steel);
  art.box(g, 0.24, 0.59, 0, 0.04, 0.02, 0.26, P.ink);
  art.box(g, -0.14, 0.43, 0, 0.16, 0.035, 0.09, P.ink);
  art.box(g, 0.33, 0.44, 0, 0.14, 0.11, 0.16, 0x9a7b55);
}

/** The red pillar-style post box. */
export function postBox(art: Art, parent: THREE.Object3D, x: number, base: number, z: number) {
  art.box(parent, x, base + 0.38, z, 0.3, 0.6, 0.26, 0xd3382c);
  art.box(parent, x, base + 0.04, z, 0.22, 0.08, 0.2, P.ink);
  art.box(parent, x, base + 0.5, z + 0.135, 0.2, 0.025, 0.01, P.ink);
  art.box(parent, x, base + 0.3, z + 0.135, 0.14, 0.14, 0.008, 0xfdfbf3);
}

// ---- Lucknow street life ----

/** An auto-rickshaw: green and yellow, three wheels, a canvas hood. Faces +z. */
export function autoRickshaw(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, angle: number, electric = false) {
  const g = new THREE.Group();
  g.position.set(x, base, z);
  g.rotation.y = angle;
  parent.add(g);
  // Petrol autos are green and yellow; e-rickshaws are white or blue with a flat canopy and red seats.
  const body = electric ? 0xf1f1ec : 0x2f8f4e, hood = electric ? 0x2f62b5 : 0xf2c53d;
  art.box(g, 0, 0.3, -0.05, 0.62, 0.34, 0.95, body);
  art.box(g, 0, 0.72, -0.12, 0.64, 0.06, 0.86, hood);
  for (const side of [-1, 1]) {
    art.box(g, side * 0.3, 0.52, -0.5, 0.03, 0.4, 0.03, P.ink);
    art.box(g, side * 0.3, 0.52, 0.22, 0.03, 0.4, 0.03, P.ink);
  }
  art.box(g, 0, 0.5, -0.52, 0.6, 0.36, 0.03, hood);
  art.box(g, 0, 0.36, 0.52, 0.34, 0.3, 0.24, body);
  art.box(g, 0, 0.58, 0.44, 0.5, 0.26, 0.02, 0xa2cacc);
  art.box(g, 0, 0.32, -0.22, 0.5, 0.1, 0.3, electric ? 0xc8281e : 0x3a3d42);
  const front = art.cylinder(g, 0, 0.11, 0.52, 0.11, 0.06, P.tyre, 0.11, 12);
  front.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const wheel = art.cylinder(g, side * 0.3, 0.11, -0.32, 0.11, 0.06, P.tyre, 0.11, 12);
    wheel.rotation.z = Math.PI / 2;
  }
  art.box(g, 0, 0.5, 0.65, 0.08, 0.06, 0.02, 0xffe6a1);
  return g;
}

export function scooter(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, angle: number, color: number) {
  const g = new THREE.Group();
  g.position.set(x, base, z);
  g.rotation.set(0, angle, 0.1);
  parent.add(g);
  for (const zz of [-0.27, 0.27]) {
    const wheel = art.cylinder(g, 0, 0.1, zz, 0.1, 0.05, P.tyre, 0.1, 12);
    wheel.rotation.z = Math.PI / 2;
  }
  art.box(g, 0, 0.24, -0.1, 0.16, 0.2, 0.42, color);
  art.box(g, 0, 0.36, -0.14, 0.15, 0.05, 0.34, 0x2b2d31);
  art.box(g, 0, 0.3, 0.2, 0.15, 0.36, 0.05, color);
  art.box(g, 0, 0.5, 0.2, 0.3, 0.03, 0.03, P.ink);
}

/** A chai stall: tin roof on posts, a counter with a kettle and glasses, a bench for customers. */
export function chaiStall(art: Art, parent: THREE.Object3D, x: number, base: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, base, z);
  parent.add(g);
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.3, 0.3]) art.box(g, sx, 0.55, sz, 0.04, 1.1, 0.04, 0x6b5a48);
  const roof = art.box(g, 0, 1.14, 0.05, 1.3, 0.03, 0.85, 0x8fa3ad);
  roof.rotation.x = 0.12;
  art.box(g, 0, 0.36, 0.1, 1.05, 0.06, 0.4, 0x8a6a48);
  art.box(g, 0, 0.18, 0.1, 1.0, 0.34, 0.36, 0x3f7fae);
  art.cylinder(g, -0.3, 0.47, 0.1, 0.07, 0.14, 0xb9bdc0, 0.05, 10);
  art.cylinder(g, -0.3, 0.42, 0.1, 0.09, 0.05, 0x2b2d31, 0.09, 10);
  for (let i = 0; i < 5; i++) art.cylinder(g, 0.05 + i * 0.09, 0.42, 0.16, 0.022, 0.06, 0xd9a05a, 0.026, 8);
  for (let i = 0; i < 3; i++) art.cylinder(g, 0.1 + i * 0.13, 0.46, 0.0, 0.05, 0.13, 0xf1ead6, 0.05, 10);
  art.box(g, 0, 0.2, 0.75, 0.9, 0.04, 0.2, 0x8a6a48);
  for (const sx of [-0.4, 0.4]) art.box(g, sx, 0.1, 0.75, 0.04, 0.2, 0.18, 0x6b5a48);
  return g;
}

/** A thela: a four-wheeled handcart piled with fruit. */
export function handcart(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, fruit: number, seed: number) {
  const g = new THREE.Group();
  g.position.set(x, base, z);
  g.rotation.y = (rand(seed) - 0.5) * 0.6;
  parent.add(g);
  art.box(g, 0, 0.36, 0, 0.9, 0.05, 0.55, 0x9a7b55);
  for (const sx of [-0.36, 0.36]) for (const sz of [-0.3, 0.3]) {
    const wheel = art.cylinder(g, sx, 0.14, sz, 0.14, 0.03, P.tyre, 0.14, 12);
    wheel.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 12; i++) {
    const piece = art.ball(g, -0.33 + (i % 4) * 0.22, 0.43 + Math.floor(i / 8) * 0.07, -0.17 + (Math.floor(i / 4) % 2) * 0.3, 0.06, 0.055, 0.06, i % 5 === 4 ? 0x7da04a : fruit);
    piece.castShadow = false;
  }
  art.box(g, 0.5, 0.5, 0, 0.03, 0.03, 0.5, 0x6b5a48);
}

/** A cow settled at the roadside, unbothered by everything. */
export function cow(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, angle: number, color = 0xf1ece0) {
  const g = new THREE.Group();
  g.position.set(x, base, z);
  g.rotation.y = angle;
  parent.add(g);
  art.ball(g, 0, 0.3, 0, 0.2, 0.19, 0.42, color);
  art.ball(g, 0, 0.42, 0.42, 0.11, 0.12, 0.17, color);
  art.ball(g, 0, 0.5, 0.18, 0.1, 0.09, 0.12, color);
  for (const side of [-1, 1]) {
    art.box(g, side * 0.07, 0.56, 0.4, 0.02, 0.1, 0.02, 0x4a4038);
    art.box(g, side * 0.13, 0.12, 0.25, 0.06, 0.24, 0.06, color);
    art.box(g, side * 0.13, 0.12, -0.25, 0.06, 0.24, 0.06, color);
  }
  art.box(g, 0, 0.3, -0.45, 0.02, 0.26, 0.02, 0x4a4038);
}

/** The black plastic water tank on every Indian roof. */
export function waterTank(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, size = 1) {
  art.cylinder(parent, x, base + 0.26 * size, z, 0.24 * size, 0.44 * size, 0x1f2124, 0.22 * size, 14);
  art.cylinder(parent, x, base + 0.5 * size, z, 0.1 * size, 0.06 * size, 0x1f2124, 0.1 * size, 10);
  art.box(parent, x, base + 0.02, z, 0.6 * size, 0.04, 0.6 * size, 0xb9b4a8);
}

/** Washing on a rooftop line. */
export function clothesline(art: Art, parent: THREE.Object3D, from: number, to: number, y: number, z: number, seed: number) {
  for (const x of [from, to]) art.box(parent, x, y - 0.25, z, 0.03, 0.5, 0.03, P.ink);
  art.box(parent, (from + to) / 2, y, z, Math.abs(to - from), 0.008, 0.008, P.ink);
  const cloth = [0xd8473c, 0xf2b632, 0x3f8fd2, 0xf5f1e6, 0xd9558a, 0x57a85a, 0xf47c2c];
  const count = Math.max(2, Math.floor(Math.abs(to - from) / 0.24));
  for (let i = 0; i < count; i++) {
    if (rand(seed + i * 3) < 0.25) continue;
    const tall = 0.14 + rand(seed + i) * 0.16;
    art.box(parent, from + ((to - from) * (i + 0.5)) / count, y - tall / 2, z, 0.16, tall, 0.012, cloth[Math.floor(rand(seed + i * 7) * cloth.length)]);
  }
}

/** A string of marigolds and small lights along an eave; the bulbs glow at night. */
export function festoon(art: Art, parent: THREE.Object3D, from: number, to: number, y: number, z: number, count: number) {
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count, x = from + (to - from) * t;
    const bead = art.ball(parent, x, y - Math.sin(Math.PI * ((t * 4) % 1)) * 0.06, z, 0.035, 0.04, 0.035, i % 3 === 0 ? FESTOON_BULB : i % 2 ? MARIGOLD : MARIGOLD_DEEP);
    bead.castShadow = false;
  }
}
export const MARIGOLD = 0xf4a01c, MARIGOLD_DEEP = 0xe2731a, FESTOON_BULB = 0xfff0b8;

/** A painted hoarding on posts, lettered in Hindi and English. */
export function hoarding(art: Art, parent: THREE.Object3D, text: string, x: number, base: number, z: number, w: number, h: number, bg: string, fg: string, angle = 0) {
  const g = new THREE.Group();
  g.position.set(x, base, z);
  g.rotation.y = angle;
  parent.add(g);
  for (const sx of [-w * 0.4, w * 0.4]) art.box(g, sx, 0.7, -0.03, 0.05, 1.4, 0.05, P.ink);
  art.box(g, 0, 1.4 + h / 2, -0.02, w + 0.06, h + 0.06, 0.04, P.ink);
  art.sign(g, text, 0, 1.4 + h / 2, 0.005, w, h, bg, fg);
}

/** A street vendor: a big patched umbrella over a low table of whatever is in season. */
export function vendor(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, seed: number) {
  const g = new THREE.Group();
  g.position.set(x, base, z);
  g.rotation.y = rand(seed) * 6;
  parent.add(g);
  const shades = [0xe2452f, 0xf2b632, 0x3f8fd2, 0x57a85a, 0xf47c2c, 0xd9558a];
  art.cylinder(g, 0, 0.62, 0, 0.012, 1.24, P.steel, 0.012, 6);
  for (let i = 0; i < 2; i++) {
    const canopy = art.cylinder(g, 0, 1.22 - i * 0.012, 0, 0.62 - i * 0.2, 0.2, shades[(seed + i * 2) % shades.length], 0.03, 8);
    canopy.rotation.y = i * 0.4;
  }
  art.box(g, 0.1, 0.22, 0.12, 0.62, 0.04, 0.42, 0x8a6a48);
  for (const sx of [-0.16, 0.36]) art.box(g, sx, 0.1, 0.12, 0.04, 0.2, 0.38, 0x6b5a48);
  const goods = PRODUCTS.map((c) => Number(c.replace("#", "0x")));
  for (let i = 0; i < 8; i++) {
    const item = art.ball(g, -0.12 + (i % 4) * 0.15, 0.29, 0 + Math.floor(i / 4) * 0.2, 0.055, 0.05, 0.055, goods[(seed + i * 3) % goods.length]);
    item.castShadow = false;
  }
  // The vendor's stool.
  art.cylinder(g, -0.32, 0.11, 0.1, 0.09, 0.22, 0x3f7fae, 0.09, 8);
}

/** A cycle rickshaw waiting for a fare: hooded bench seat on two wheels, a third in front. */
export function cycleRickshaw(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, angle: number) {
  const g = new THREE.Group();
  g.position.set(x, base, z);
  g.rotation.y = angle;
  parent.add(g);
  for (const side of [-1, 1]) {
    const wheel = art.cylinder(g, side * 0.26, 0.2, -0.22, 0.2, 0.025, P.tyre, 0.2, 14);
    wheel.rotation.z = Math.PI / 2;
  }
  const front = art.cylinder(g, 0, 0.2, 0.62, 0.2, 0.025, P.tyre, 0.2, 14);
  front.rotation.z = Math.PI / 2;
  art.box(g, 0, 0.36, -0.2, 0.5, 0.06, 0.34, 0xb7362d);
  art.box(g, 0, 0.52, -0.37, 0.5, 0.3, 0.05, 0xb7362d);
  const hood = art.cylinder(g, 0, 0.62, -0.2, 0.3, 0.52, 0x2b4f8a, 0.3, 10);
  hood.rotation.z = Math.PI / 2;
  hood.scale.set(1, 1, 0.75);
  art.box(g, 0, 0.3, 0.2, 0.03, 0.03, 0.8, P.ink);
  art.box(g, 0, 0.5, 0.56, 0.03, 0.44, 0.03, P.ink);
  art.box(g, 0, 0.72, 0.54, 0.3, 0.025, 0.025, P.ink);
  art.box(g, 0, 0.46, 0.22, 0.12, 0.04, 0.16, 0x2b2d31);
}

/** A heap by the roadside: rubble, sand or sacks waiting for someone to deal with them. */
export function heap(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, seed: number) {
  const color = [0xb9a27c, 0x9d948a, 0xc7b08a][seed % 3];
  for (let i = 0; i < 4; i++) {
    const lump = art.ball(parent, x + (rand(seed + i) - 0.5) * 0.5, base + 0.06, z + (rand(seed + i * 3) - 0.5) * 0.5, 0.22 + rand(seed + i * 5) * 0.16, 0.1 + rand(seed + i * 7) * 0.08, 0.2 + rand(seed + i * 9) * 0.14, color);
    lump.castShadow = false;
  }
}
