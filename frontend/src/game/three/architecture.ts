import * as THREE from "three";
import type { Art } from "./materials";
import type { Building } from "./layout";
import { LANTERN_RED, LANTERN_WHITE, aFrame, banner, bicycle, lanterns, pottedPlant, projectingSign, shopInterior, type Interior } from "./props";

// Buildings at true scale (one unit is about 2 m): Japanese two-storey houses, shops with glass fronts, apartment
// blocks with balcony grids, a glass office tower and concrete public buildings. Everything is built from shared
// boxes so the town batches into a few instanced draws; materials come from labelled colours (see Art.tag).

const C = {
  frame: 0x8c9398, // anodised aluminium window frames
  glass: 0x709ba6, // matches the colour atmosphere.ts lights at night
  glassDark: 0x6f9aa5, // the same glass with nobody home: stays dark
  glassCool: 0x719ca7, // a room lit by a screen or a daylight bulb
  sill: 0xd8d4cb,
  foundation: 0x9d9a94,
  door: 0x6e4c38,
  darkMetal: 0x3d4247,
  rail: 0x5b6167,
  slab: 0xcfcbc3,
  ac: 0xe7e7e2,
  fan: 0x2e3236,
  gutter: 0x6f7377,
  spandrel: 0x4a5055,
  canopy: 0xbfc3c4,
  frosted: 0xb7c3c7,
};

export function tagArchitecture(art: Art) {
  art.tag("metal", C.frame, C.darkMetal, C.rail, C.gutter, C.spandrel, C.fan);
  art.tag("glass", C.glass, C.glassDark, C.glassCool);
  art.glow(art.material(C.glassCool), 0xcfe2ff, 0, 1.1);
  art.glow(art.material(LANTERN_RED), 0xff5a30, 0.1, 1.5);
  art.glow(art.material(LANTERN_WHITE), 0xffd9a0, 0.1, 1.4);
  art.tag("plaster", C.sill, C.slab, C.ac, C.canopy);
  art.tag("paving", C.foundation);
  art.tag("wood", C.door);
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** One side of a building: local x runs along the wall, y up, +z points out of the wall. */
type Face = { group: THREE.Group; width: number };

function faces(group: THREE.Group, b: Building): Record<"front" | "back" | "left" | "right", Face> {
  const make = (x: number, z: number, angle: number, width: number) => {
    const face = new THREE.Group();
    face.position.set(x, 0, z);
    face.rotation.y = angle;
    group.add(face);
    return { group: face, width };
  };
  return {
    front: make(0, b.d / 2, 0, b.w),
    back: make(0, -b.d / 2, Math.PI, b.w),
    left: make(-b.w / 2, 0, -Math.PI / 2, b.d),
    right: make(b.w / 2, 0, Math.PI / 2, b.d),
  };
}

/** An aluminium sliding window: frame, glass, meeting rail, sill; optional storm-shutter box above (amado). */
function window(art: Art, f: Face, x: number, y: number, w: number, h: number, shutter = false) {
  art.box(f.group, x, y, 0.012, w, h, 0.03, C.frame);
  // After dark most rooms are lit warm, some are dark, a few glow blue: a street of lives, not one switch.
  const pick = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + f.width * 37.719 + f.group.position.x * 3.1 + f.group.parent!.position.x * 1.7) * 43758.5453) % 1;
  art.box(f.group, x, y, 0.03, w - 0.05, h - 0.05, 0.012, pick < 0.56 ? C.glass : pick < 0.86 ? C.glassDark : C.glassCool);
  art.box(f.group, x, y, 0.04, 0.022, h - 0.04, 0.012, C.frame);
  art.box(f.group, x, y - h / 2 - 0.02, 0.045, w + 0.08, 0.03, 0.08, C.sill);
  if (shutter) art.box(f.group, x, y + h / 2 + 0.055, 0.05, w + 0.06, 0.09, 0.09, C.frame);
}

function door(art: Art, f: Face, x: number, base: number, glass = false, canopy = true) {
  art.box(f.group, x, base + 0.53, 0.012, 0.5, 1.08, 0.03, C.darkMetal);
  art.box(f.group, x, base + 0.52, 0.03, 0.44, 1.02, 0.02, glass ? C.glass : C.door);
  art.box(f.group, x + 0.15, base + 0.5, 0.05, 0.02, 0.12, 0.03, C.frame);
  // Canopy over the entrance and a step down to the pavement.
  if (canopy) art.box(f.group, x, base + 1.2, 0.2, 0.8, 0.035, 0.4, C.canopy);
  art.box(f.group, x, base * 0.5, 0.18, 0.75, base, 0.36, C.foundation);
}

function acUnit(art: Art, f: Face, x: number, y: number, z = 0.12) {
  art.box(f.group, x, y, z, 0.38, 0.28, 0.14, C.ac);
  const fan = art.cylinder(f.group, x - 0.05, y, z + 0.072, 0.09, 0.01, C.fan, 0.09, 16);
  fan.rotation.x = Math.PI / 2;
}

/** Concrete base, the wall volume and floor bands; returns floor bottoms. */
function shell(art: Art, group: THREE.Group, b: Building, floorHeight: number) {
  const base = 0.2;
  art.box(group, 0, base / 2, 0, b.w + 0.08, base, b.d + 0.08, C.foundation);
  art.box(group, 0, base + b.h / 2, 0, b.w, b.h, b.d, b.wall);
  const count = Math.max(1, Math.round(b.h / floorHeight));
  const step = b.h / count;
  const floors = Array.from({ length: count }, (_, i) => base + i * step);
  for (const y of floors.slice(1)) art.box(group, 0, y, 0, b.w + 0.05, 0.035, b.d + 0.05, C.sill);
  return { base, floors, step, top: base + b.h };
}

/** A pitched tile roof with real overhangs, fascia, a ridge cap, gutters and downpipes. */
function gableRoof(art: Art, group: THREE.Group, b: Building, top: number, rise: number) {
  const over = 0.28, half = b.w / 2 + over;
  const slope = Math.atan2(rise, b.w / 2);
  // The slab runs from the ridge down past the wall to the eave, which hangs lower than the wall top.
  const drop = rise * (over / (b.w / 2));
  const length = Math.hypot(half, rise + drop);
  for (const side of [-1, 1]) {
    const slab = art.box(group, (side * half) / 2, top + (rise - drop) / 2 + 0.03, 0, length, 0.07, b.d + over * 2, b.roof);
    slab.rotation.z = -side * slope;
    // Fascia board and gutter along the eaves.
    art.box(group, side * (half - 0.01), top - drop - 0.01, 0, 0.04, 0.09, b.d + over * 2, C.sill);
    art.box(group, side * (half + 0.03), top - drop - 0.05, 0, 0.06, 0.05, b.d + over * 2, C.gutter);
    for (const z of [-1, 1]) art.box(group, side * (b.w / 2 + 0.04), top / 2, z * (b.d / 2 + 0.04), 0.04, top - 0.1, 0.04, C.gutter);
  }
  art.box(group, 0, top + rise + 0.02, 0, 0.14, 0.08, b.d + over * 2 + 0.02, b.roof);
  // Gable walls closing the triangle under the roof at both ends.
  const shape = new THREE.Shape();
  shape.moveTo(-b.w / 2, 0);
  shape.lineTo(0, rise);
  shape.lineTo(b.w / 2, 0);
  shape.closePath();
  const geometry = art.geometry(new THREE.ExtrudeGeometry(shape, { depth: b.d, bevelEnabled: false }));
  geometry.translate(0, top, -b.d / 2);
  const gable = new THREE.Mesh(geometry, art.material(b.wall));
  gable.castShadow = gable.receiveShadow = true;
  group.add(gable);
}

/** A flat roof with a parapet and rooftop plant: AC units and a water tank. */
function flatRoof(art: Art, group: THREE.Group, b: Building, top: number, seed: number) {
  art.box(group, 0, top + 0.02, 0, b.w - 0.02, 0.04, b.d - 0.02, C.slab);
  for (const [x, z, w, d] of [[0, b.d / 2, b.w, 0.06], [0, -b.d / 2, b.w, 0.06], [b.w / 2, 0, 0.06, b.d], [-b.w / 2, 0, 0.06, b.d]])
    art.box(group, x, top + 0.12, z, w, 0.24, d, b.wall);
  for (let i = 0; i < 2 + (seed % 3); i++) art.box(group, -b.w / 3 + i * 0.5, top + 0.18, -b.d / 4, 0.38, 0.28, 0.32, C.ac);
  if (b.w > 3.5) {
    const tank = art.cylinder(group, b.w / 4, top + 0.42, b.d / 5, 0.32, 0.7, 0xb9bdbf, 0.32, 18);
    tank.castShadow = true;
  }
}

function rowOfWindows(art: Art, f: Face, y: number, count: number, w: number, h: number, shutter = false, margin = 0.35) {
  const span = f.width - margin * 2;
  for (let i = 0; i < count; i++) window(art, f, -span / 2 + (span * (i + 0.5)) / count, y, w, h, shutter);
}

function home(art: Art, group: THREE.Group, b: Building) {
  const seed = hash(b.id);
  const { base, floors, step, top } = shell(art, group, b, 1.15);
  const f = faces(group, b);
  const doorX = (seed % 2 ? 1 : -1) * b.w * 0.24;
  door(art, f.front, doorX, base);
  // Ground floor: a big living-room window; upstairs: two windows with storm shutters, or a balcony.
  window(art, f.front, -doorX, base + step * 0.48, 0.95, step * 0.62);
  // Lived-in doorsteps: plants in pots, and often a bicycle against the wall.
  pottedPlant(art, f.front.group, doorX - 0.42, 0, 0.3, seed);
  if (seed % 4) pottedPlant(art, f.front.group, doorX - 0.62, 0, 0.26, seed + 5);
  if (seed % 3 !== 1) bicycle(art, f.front.group, -doorX + (seed % 2 ? 0.2 : -0.2), 0.02, 0.32, 0.12, [0xb55f65, 0x4f7fae, 0x5e8f6d, 0xd9a03c][seed % 4]);
  const upper = floors[1] ?? base + step;
  if (seed % 3 === 0) {
    window(art, f.front, 0, upper + step * 0.45, 1.05, step * 0.72);
    art.box(f.front.group, 0, upper + 0.02, 0.25, b.w * 0.72, 0.05, 0.5, C.slab);
    art.box(f.front.group, 0, upper + 0.3, 0.49, b.w * 0.72, 0.03, 0.025, C.rail);
    for (let i = 0; i <= 14; i++) art.box(f.front.group, -b.w * 0.36 + (b.w * 0.72 * i) / 14, upper + 0.16, 0.49, 0.015, 0.28, 0.015, C.rail);
  } else rowOfWindows(art, f.front, upper + step * 0.5, 2, 0.62, step * 0.45, true, 0.4);
  for (const side of [f.left, f.right]) for (const y of floors) window(art, side, (seed % 3) * 0.2 - 0.2, y + step * 0.55, 0.42, step * 0.36);
  for (const y of floors) rowOfWindows(art, f.back, y + step * 0.55, 2, 0.55, step * 0.4, false, 0.5);
  acUnit(art, seed % 2 ? f.left : f.right, b.d * 0.15, base + 0.16);
  // A post box by the door.
  art.box(f.front.group, doorX + 0.45, base + 0.5, 0.08, 0.16, 0.2, 0.1, C.darkMetal);
  gableRoof(art, group, b, top, b.kind === "home" && b.id === "barn" ? 0.8 : 0.55 + (seed % 3) * 0.06);
}

function shop(art: Art, group: THREE.Group, b: Building) {
  const seed = hash(b.id);
  const { base, floors, step, top } = shell(art, group, b, 1.25);
  const f = faces(group, b);
  // A glass shopfront across the ground floor, with mullions and a glass door in the middle.
  const front = b.w - 0.3, height = Math.min(step - 0.25, 1.05);
  art.box(f.front.group, 0, base + height / 2, 0.012, front, height, 0.03, C.darkMetal);
  art.box(f.front.group, 0, base + height / 2, 0.03, front - 0.06, height - 0.06, 0.012, C.glass);
  const panes = Math.max(2, Math.round(front / 0.75));
  for (let i = 1; i < panes; i++) art.box(f.front.group, -front / 2 + (front * i) / panes, base + height / 2, 0.04, 0.03, height - 0.04, 0.02, C.darkMetal);
  const brand = BRANDS[b.id] ?? BRANDS.shop;
  shopInterior(art, f.front.group, brand.interior, seed, 0, base + height / 2, 0.0375, front - 0.08, height - 0.08);
  // No canopy: it would hide the sign band from the street.
  door(art, f.front, 0, base, true, false);
  // The sign band above the shopfront, and on a cafe a striped awning below it.
  art.sign(f.front.group, b.name, 0, base + height + 0.22, 0.06, b.w * 0.9, 0.3, brand.bg, brand.fg);
  if (brand.letters) projectingSign(art, f.front.group, brand.letters, b.w / 2 - 0.1, base + height + 0.75, 0.3, brand.bg, brand.fg);
  lanterns(art, f.front.group, -b.w / 2 + 0.2, b.w / 2 - 0.2, base + height - 0.02, 0.42, Math.max(4, Math.round(b.w / 0.45)));
  for (const side of [-1, 1]) banner(art, f.front.group, side * (b.w / 2 - 0.45) - 0.1, 0, 0.75, side > 0 ? brand.flag : 0xf2b632);
  aFrame(art, f.front.group, b.w * 0.24, 0, 0.8, brand.flag);
  pottedPlant(art, f.front.group, -0.5, 0, 0.42, seed);
  pottedPlant(art, f.front.group, 0.5, 0, 0.42, seed + 3);
  bicycle(art, f.front.group, -b.w * 0.3, 0.02, 0.62, 0.3, 0x4f7fae);
  if (b.id === "loc_restaurant") {
    for (let i = 0; i < 8; i++) {
      const stripe = art.box(f.front.group, -b.w / 2 + ((i + 0.5) * b.w) / 8, base + height - 0.06, 0.3, b.w / 8, 0.035, 0.58, i % 2 ? 0xf4e7d4 : b.roof);
      stripe.rotation.x = 0.28;
    }
  }
  for (const y of floors.slice(1)) rowOfWindows(art, f.front, y + step * 0.5, Math.max(2, Math.round(b.w / 1.3)), 0.6, step * 0.45, true);
  for (const side of [f.left, f.right]) window(art, side, 0, base + step * 0.6, 0.45, 0.4);
  acUnit(art, seed % 2 ? f.left : f.right, -b.d * 0.2, base + 0.16);
  flatRoof(art, group, b, top, seed);
}

function apartment(art: Art, group: THREE.Group, b: Building) {
  const seed = hash(b.id);
  const { base, floors, step, top } = shell(art, group, b, 1.45);
  const f = faces(group, b);
  const units = Math.max(2, Math.round(b.w / 1.6));
  const unit = b.w / units;
  door(art, f.front, 0, base, true);
  for (const y of floors.slice(1))
    for (let i = 0; i < units; i++) {
      const x = -b.w / 2 + unit * (i + 0.5);
      window(art, f.front, x, y + step * 0.42, unit * 0.62, step * 0.68);
      // Balcony: a slab, a frosted parapet, a dividing wall and an AC unit.
      art.box(f.front.group, x, y + 0.03, 0.3, unit - 0.04, 0.06, 0.6, C.slab);
      art.box(f.front.group, x, y + 0.3, 0.59, unit - 0.04, 0.48, 0.03, C.frosted);
      art.box(f.front.group, x - unit / 2 + 0.02, y + 0.42, 0.3, 0.04, 0.8, 0.6, b.wall);
      acUnit(art, f.front, x + unit * 0.28, y + 0.2, 0.36);
    }
  for (const y of floors) {
    rowOfWindows(art, f.back, y + step * 0.55, units, 0.5, step * 0.38, false, 0.3);
    for (const side of [f.left, f.right]) window(art, side, 0, y + step * 0.55, 0.5, step * 0.38);
  }
  flatRoof(art, group, b, top, seed);
}

type Brand = { interior: Interior; bg: string; fg: string; flag: number; letters?: string[] };
const BRANDS: Record<string, Brand> = {
  shop: { interior: "shop", bg: "#f7efda", fg: "#344b51", flag: 0xd8473c },
  loc_konbini: { interior: "konbini", bg: "#1f9a5d", fg: "#ffffff", flag: 0x1f9a5d, letters: ["2", "4", "h"] },
  loc_restaurant: { interior: "cafe", bg: "#4a2f20", fg: "#ffe9bf", flag: 0xc8642c, letters: ["カ", "フ", "ェ"] },
  loc_pharmacy: { interior: "pharmacy", bg: "#d8412f", fg: "#ffffff", flag: 0xd8412f, letters: ["く", "す", "り"] },
};

/** A glass curtain wall on every side: mullions, and dark spandrel bands at each floor. */
function office(art: Art, group: THREE.Group, b: Building) {
  const { base, floors, step, top } = shell(art, group, b, 1.6);
  for (const f of Object.values(faces(group, b))) {
    art.box(f.group, 0, base + b.h / 2, 0.015, f.width - 0.04, b.h - 0.02, 0.012, C.glass);
    const columns = Math.round(f.width / 0.7);
    for (let i = 0; i <= columns; i++) art.box(f.group, -f.width / 2 + (f.width * i) / columns, base + b.h / 2, 0.03, 0.03, b.h, 0.03, C.frame);
    for (const y of floors.slice(1)) art.box(f.group, 0, y, 0.03, f.width, 0.22, 0.03, C.spandrel);
  }
  const front = faces(group, b).front;
  door(art, front, 0, base, true);
  art.sign(front.group, b.name, 0, base + step * 0.85, 0.06, b.w * 0.7, 0.32);
  flatRoof(art, group, b, top, hash(b.id));
}

/** Concrete public buildings: ribbon windows on each floor, an entrance canopy and a sign. */
function civic(art: Art, group: THREE.Group, b: Building) {
  const seed = hash(b.id);
  const { base, floors, step, top } = shell(art, group, b, 1.3);
  const f = faces(group, b);
  const doorX = b.kind === "school" ? -b.w * 0.3 : 0;
  door(art, f.front, doorX, base, true);
  for (const [i, y] of floors.entries()) {
    const count = Math.max(2, Math.round(b.w / 1.05));
    if (i === 0) {
      const span = b.w - 0.6;
      for (let k = 0; k < count; k++) {
        const x = -span / 2 + (span * (k + 0.5)) / count;
        if (Math.abs(x - doorX) > 0.5) window(art, f.front, x, y + step * 0.55, 0.72, step * 0.5);
      }
    } else rowOfWindows(art, f.front, y + step * 0.52, count, 0.8, step * 0.52, false, 0.3);
    rowOfWindows(art, f.back, y + step * 0.52, count, 0.7, step * 0.45, false, 0.3);
    for (const side of [f.left, f.right]) rowOfWindows(art, side, y + step * 0.52, Math.max(1, Math.round(b.d / 1.2)), 0.6, step * 0.45, false, 0.35);
  }
  art.sign(f.front.group, b.name, 0, top - 0.25, 0.06, b.w * 0.82, 0.3);
  for (const side of [-1, 1]) pottedPlant(art, f.front.group, doorX + side * 0.55, 0, 0.45, seed + side);
  if (b.kind === "mall" || b.kind === "gym") {
    lanterns(art, f.front.group, -b.w / 2 + 0.3, b.w / 2 - 0.3, base + step - 0.12, 0.3, Math.max(5, Math.round(b.w / 0.5)));
    for (const x of [-b.w * 0.36, b.w * 0.36]) banner(art, f.front.group, x, 0, 0.7, b.kind === "gym" ? 0xd0685e : 0xd9798a);
  }
  if (b.id !== "loc_police") for (let i = 0; i < 2 + (seed % 3); i++) bicycle(art, f.front.group, b.w * 0.2 + i * 0.28, 0.02, 0.55, Math.PI / 2 - 0.25, [0x4f7fae, 0xb55f65, 0x5e8f6d][(seed + i) % 3]);
  if (b.kind === "hospital") {
    art.box(f.front.group, b.w * 0.36, top - 0.25, 0.07, 0.3, 0.09, 0.03, 0xc8423f);
    art.box(f.front.group, b.w * 0.36, top - 0.25, 0.07, 0.09, 0.3, 0.03, 0xc8423f);
  }
  if (b.kind === "school") {
    const clock = art.cylinder(f.front.group, b.w * 0.2, top + 0.3, 0.06, 0.24, 0.05, 0xf9f0d9, 0.24, 24);
    clock.rotation.x = Math.PI / 2;
    art.box(f.front.group, b.w * 0.2, top + 0.34, 0.1, 0.02, 0.15, 0.02, C.darkMetal);
    art.box(f.front.group, b.w * 0.2 + 0.05, top + 0.3, 0.1, 0.12, 0.02, 0.02, C.darkMetal);
    art.box(f.front.group, b.w * 0.2, top + 0.15, 0, 0.7, 0.3, 0.1, b.wall);
  }
  if (b.kind === "lab") {
    art.ball(group, -b.w * 0.2, top + 0.3, -0.2, 0.55, 0.5, 0.55, 0xc9d0d2);
  }
  flatRoof(art, group, b, top, seed);
}

/** Builds a detailed building; returns false for kinds that keep their bespoke design (station, shrine). */
export function makeArchitecture(parent: THREE.Group, art: Art, b: Building) {
  if (b.kind === "station" || b.kind === "shrine") return false;
  const group = new THREE.Group();
  group.position.set(b.x, 0, b.z);
  parent.add(group);
  if (b.kind === "home") home(art, group, b);
  else if (b.kind === "shop") shop(art, group, b);
  else if (b.kind === "apartment") apartment(art, group, b);
  else if (b.kind === "office") office(art, group, b);
  else civic(art, group, b);
  return true;
}
