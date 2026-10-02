import * as THREE from "three";
import type { Art } from "./materials";
import type { Building } from "./layout";
import { arcade, archPanel, archway, chhatri, dome, kangura, minaret } from "./mughal";

// Lucknow's landmarks, at the scale of the town (one unit is about 2 m): Charbagh Station, the Bara Imambara,
// the Rumi Darwaza and the Husainabad clock tower. Recognisable shapes, not surveys.

const RED = 0xa8402f, WHITE = 0xf2ead8, CREAM = 0xe9dcc0, CREAM_DARK = 0xd4c49e, SHADE = 0x3a3028, GOLD = 0xd9b445;

export function tagLandmarks(art: Art) {
  art.tag("plaster", RED, WHITE, CREAM, CREAM_DARK);
}

/** Charbagh: red brick banded in white, a long arcade, a big central dome and chhatris marching along the roof. */
export function charbagh(art: Art, group: THREE.Group, b: Building) {
  const base = 0.2, top = base + b.h, front = b.d / 2;
  art.box(group, 0, base / 2, 0, b.w + 0.3, base, b.d + 0.3, 0x9d9a94);
  art.box(group, 0, base + b.h / 2, 0, b.w, b.h, b.d, RED);
  for (const y of [base + 0.08, base + b.h * 0.5, top - 0.1]) art.box(group, 0, y, 0, b.w + 0.06, 0.12, b.d + 0.06, WHITE);
  // The entrance porch, pushed forward, with a tall arch.
  art.box(group, 0, base + (b.h + 0.5) / 2, front + 0.3, 1.9, b.h + 0.5, 0.6, RED);
  archPanel(art, group, 0, base, front + 0.6, 1.3, b.h * 0.86, WHITE, 0.03);
  archPanel(art, group, 0, base, front + 0.63, 1.06, b.h * 0.76, SHADE, 0.02);
  kangura(art, group, -0.95, 0.95, top + 0.5, front + 0.58, WHITE, 0.24);
  // Two storeys of arches either side of the porch, and along the ends.
  for (const side of [-1, 1]) {
    const from = side < 0 ? -b.w / 2 + 0.15 : 1.05, to = side < 0 ? -1.05 : b.w / 2 - 0.15;
    arcade(art, group, from, to, base + 0.14, b.h * 0.42, front + 0.005, WHITE, SHADE, 3);
    arcade(art, group, from, to, base + b.h * 0.55, b.h * 0.36, front + 0.005, WHITE, 0x709ba6, 4);
  }
  kangura(art, group, -b.w / 2, b.w / 2, top, front, WHITE, 0.3);
  // The roofline: a great dome over the hall, smaller domes on octagonal corner towers, chhatris between.
  art.cylinder(group, 0, top + 0.3, 0, 1.15, 0.6, RED, 1.15, 12);
  art.cylinder(group, 0, top + 0.62, 0, 1.22, 0.08, WHITE, 1.22, 12);
  dome(art, group, 0, top + 0.64, 0, 1.05, WHITE, GOLD);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (b.w / 2 - 0.25), z = sz * (b.d / 2 - 0.25);
    art.cylinder(group, x, base + (b.h + 0.7) / 2, z, 0.34, b.h + 0.7, RED, 0.34, 8);
    art.cylinder(group, x, top + 0.72, z, 0.4, 0.08, WHITE, 0.4, 8);
    dome(art, group, x, top + 0.76, z, 0.3, WHITE, GOLD);
  }
  for (const x of [-b.w * 0.27, b.w * 0.27]) chhatri(art, group, x, top + 0.02, front - 0.4, 0.5, WHITE);
  art.sign(group, b.name, 0, base + b.h * 0.94, front + 0.64, 1.7, 0.3, "#f2ead8", "#7a2418");
  // Clock over the entrance.
  const face = art.cylinder(group, 0, top + 0.28, front + 0.62, 0.2, 0.04, WHITE, 0.2, 20);
  face.rotation.x = Math.PI / 2;
  art.box(group, 0, top + 0.33, front + 0.645, 0.02, 0.13, 0.01, SHADE);
  art.box(group, 0.04, top + 0.28, front + 0.645, 0.1, 0.02, 0.01, SHADE);
}

/** The Bara Imambara: a long cream hall in three tiers of arches under a parapet of small domes, between two minarets. */
export function imambara(art: Art, group: THREE.Group, b: Building) {
  const base = 0.3, front = b.d / 2;
  // A broad flight of steps up to the plinth.
  for (let i = 0; i < 3; i++) art.box(group, 0, 0.05 + i * 0.1, front + 0.55 - i * 0.14, b.w * 0.6, 0.1, 0.5, CREAM_DARK);
  art.box(group, 0, base / 2, 0, b.w + 0.5, base, b.d + 0.4, CREAM_DARK);
  const tiers = [1.25, 0.8, 0.6];
  let y = base;
  tiers.forEach((h, i) => {
    const w = b.w - i * 0.5, d = b.d - i * 0.5;
    art.box(group, 0, y + h / 2, 0, w, h, d, CREAM);
    arcade(art, group, -w / 2 + 0.1, w / 2 - 0.1, y + 0.08, h * 0.8, d / 2 + 0.005, CREAM_DARK, i === 0 ? SHADE : 0x5a4c3c, i === 0 ? 5 : i === 1 ? 7 : 9);
    art.box(group, 0, y + h + 0.03, 0, w + 0.14, 0.06, d + 0.14, CREAM_DARK);
    y += h + 0.06;
  });
  // The parapet: a row of small domes (guldastas), and a central crown.
  const w = b.w - 1;
  for (let i = 0; i < 9; i++) dome(art, group, -w / 2 + 0.15 + (i * (w - 0.3)) / 8, y, (b.d - 1) / 2 - 0.1, 0.11, CREAM, GOLD);
  dome(art, group, 0, y, 0, 0.42, CREAM, GOLD);
  for (const side of [-1, 1]) minaret(art, group, side * (b.w / 2 + 0.1), base, front - 0.15, 3.3, 0.15, CREAM, CREAM);
  art.sign(group, b.name, 0, 0.62, front + 0.62, 1.5, 0.26, "#e9dcc0", "#5a3a26");
}

/**
 * The Rumi Darwaza: the great gate, a tall arch inside a taller one, its rim flared like a row of lotus buds, with
 * a small chhatri on the crown. You can walk through it.
 */
export function rumiDarwaza(art: Art, root: THREE.Group, x: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  root.add(g);
  const w = 3.6, h = 4.4, depth = 0.9;
  archway(art, g, 0, 0, 0, w, h, depth, CREAM, 2.1, 3.3);
  // The inner, lower arch set back inside the great one.
  archway(art, g, 0, 0, 0, 2.3, 3.0, depth * 0.55, CREAM_DARK, 1.5, 2.3);
  // Lotus buds round the rim of the outer arch.
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, a = Math.PI * (0.12 + t * 0.76);
    const bx = Math.cos(a) * 1.28, by = 1.95 + Math.sin(a) * 1.62;
    for (const side of [-1, 1]) {
      const bud = art.ball(g, bx, by, side * (depth / 2 + 0.02), 0.09, 0.14, 0.05, CREAM_DARK);
      bud.rotation.z = a - Math.PI / 2;
    }
  }
  kangura(art, g, -w / 2, w / 2, h, depth / 2 - 0.04, CREAM_DARK, 0.26);
  kangura(art, g, -w / 2, w / 2, h, -depth / 2 + 0.04, CREAM_DARK, 0.26);
  art.box(g, 0, h + 0.35, 0, 1.3, 0.5, depth * 0.8, CREAM);
  chhatri(art, g, 0, h + 0.6, 0, 0.7, CREAM, CREAM);
  for (const side of [-1, 1]) {
    art.cylinder(g, side * (w / 2 + 0.12), h / 2 + 0.2, 0, 0.2, h + 0.4, CREAM, 0.17, 8);
    dome(art, g, side * (w / 2 + 0.12), h + 0.4, 0, 0.2, CREAM, GOLD);
  }
}

/** The Husainabad clock tower: red brick, tall and square, four white faces and a pointed cap with a brass vane. */
export function clockTower(art: Art, root: THREE.Group, x: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  root.add(g);
  art.box(g, 0, 0.15, 0, 1.5, 0.3, 1.5, 0x9d9a94);
  const stages: Array<[number, number]> = [[1.05, 2.6], [0.9, 2.2], [0.78, 1.6]];
  let y = 0.3;
  for (const [w, h] of stages) {
    art.box(g, 0, y + h / 2, 0, w, h, w, RED);
    art.box(g, 0, y + h + 0.04, 0, w + 0.16, 0.08, w + 0.16, WHITE);
    for (let side = 0; side < 4; side++) {
      const face = new THREE.Group();
      face.rotation.y = (side * Math.PI) / 2;
      g.add(face);
      archPanel(art, face, 0, y + 0.25, w / 2 + 0.004, w * 0.42, h * 0.62, SHADE, 0.012);
    }
    y += h + 0.08;
  }
  // The clock stage.
  art.box(g, 0, y + 0.45, 0, 0.9, 0.9, 0.9, RED);
  for (let side = 0; side < 4; side++) {
    const face = new THREE.Group();
    face.rotation.y = (side * Math.PI) / 2;
    g.add(face);
    const dial = art.cylinder(face, 0, y + 0.45, 0.46, 0.33, 0.03, WHITE, 0.33, 24);
    dial.rotation.x = Math.PI / 2;
    art.box(face, 0, y + 0.55, 0.48, 0.03, 0.22, 0.01, SHADE);
    art.box(face, 0.08, y + 0.45, 0.48, 0.17, 0.03, 0.01, SHADE);
  }
  art.box(g, 0, y + 0.94, 0, 1.04, 0.08, 1.04, WHITE);
  const cap = art.cylinder(g, 0, y + 1.5, 0, 0.62, 1.05, 0x6f7377, 0.02, 4);
  cap.rotation.y = Math.PI / 4;
  art.cylinder(g, 0, y + 2.25, 0, 0.02, 0.5, GOLD, 0.02, 6);
  const vane = art.ball(g, 0, y + 2.5, 0, 0.09, 0.09, 0.09, GOLD);
  vane.castShadow = false;
}
