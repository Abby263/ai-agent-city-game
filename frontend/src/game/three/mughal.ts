import * as THREE from "three";
import type { Art } from "./materials";

// The vocabulary of Awadhi and Indo-Saracenic building: pointed arches, onion domes, chhatris (domed roof
// pavilions), slim minarets and crenellated parapets. Geometry is cached by size so repeats batch together.

const cache = new Map<string, THREE.BufferGeometry>();
const cached = <T extends THREE.BufferGeometry>(art: Art, key: string, make: () => T): T => {
  if (!cache.has(key) || !art.geometries.includes(cache.get(key)!)) cache.set(key, art.geometry(make()));
  return cache.get(key) as T;
};

/** The outline of a pointed arch, feet on y = 0, apex at `h`. */
function archOutline(w: number, h: number, shape: THREE.Shape | THREE.Path) {
  const spring = h * 0.58;
  shape.moveTo(-w / 2, 0);
  shape.lineTo(-w / 2, spring);
  shape.quadraticCurveTo(-w / 2, h * 0.9, 0, h);
  shape.quadraticCurveTo(w / 2, h * 0.9, w / 2, spring);
  shape.lineTo(w / 2, 0);
  shape.lineTo(-w / 2, 0);
  return shape;
}

/** A flat arch-shaped panel on a wall: a shaded doorway, a niche or a window, facing +z. */
export function archPanel(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, w: number, h: number, color: number, depth = 0.03) {
  const key = `arch-${w.toFixed(2)}-${h.toFixed(2)}-${depth.toFixed(2)}`;
  const geometry = cached(art, key, () => new THREE.ExtrudeGeometry(archOutline(w, h, new THREE.Shape()) as THREE.Shape, { depth, bevelEnabled: false, curveSegments: 8 }));
  const mesh = new THREE.Mesh(geometry, art.material(color));
  mesh.position.set(x, base, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** A wall with a real pointed-arch opening you can see (and walk) through. `w` x `h` overall, facing +z. */
export function archway(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, w: number, h: number, depth: number, color: number, openW: number, openH: number) {
  const key = `archway-${w.toFixed(2)}-${h.toFixed(2)}-${depth.toFixed(2)}-${openW.toFixed(2)}-${openH.toFixed(2)}`;
  const geometry = cached(art, key, () => {
    const wall = new THREE.Shape();
    wall.moveTo(-w / 2, 0);
    wall.lineTo(-w / 2, h);
    wall.lineTo(w / 2, h);
    wall.lineTo(w / 2, 0);
    wall.lineTo(-w / 2, 0);
    wall.holes.push(archOutline(openW, openH, new THREE.Path()) as THREE.Path);
    const made = new THREE.ExtrudeGeometry(wall, { depth, bevelEnabled: false, curveSegments: 10 });
    made.translate(0, 0, -depth / 2);
    return made;
  });
  const mesh = new THREE.Mesh(geometry, art.material(color));
  mesh.position.set(x, base, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** An onion dome on a short drum, with a finial. `r` is the dome's radius. */
export function dome(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, r: number, color: number, finial = 0xd9b445) {
  const group = new THREE.Group();
  group.position.set(x, base, z);
  parent.add(group);
  art.cylinder(group, 0, r * 0.14, 0, r * 0.92, r * 0.28, color, r * 0.92, 16);
  const bulb = new THREE.Mesh(art.humanSphere, art.material(color));
  bulb.scale.set(r * 1.06, r * 1.12, r * 1.06);
  bulb.position.y = r * 0.95;
  bulb.castShadow = true;
  group.add(bulb);
  art.cylinder(group, 0, r * 2.2, 0, r * 0.18, r * 0.45, color, 0.01, 8);
  art.cylinder(group, 0, r * 2.6, 0, r * 0.035, r * 0.5, finial, r * 0.035, 6);
  const knob = new THREE.Mesh(art.humanSphere, art.material(finial));
  knob.scale.setScalar(r * 0.11);
  knob.position.y = r * 2.55;
  group.add(knob);
  return group;
}

/** A chhatri: four slim columns, a slab with eaves and a small dome. `size` is its footprint. */
export function chhatri(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, size: number, color: number, domeColor = color) {
  const h = size * 1.15;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) art.cylinder(parent, x + sx * size * 0.38, base + h / 2, z + sz * size * 0.38, size * 0.07, h, color, size * 0.07, 8);
  art.box(parent, x, base + 0.02, z, size, 0.04, size, color);
  art.box(parent, x, base + h + 0.03, z, size * 1.3, 0.06, size * 1.3, color);
  dome(art, parent, x, base + h + 0.06, z, size * 0.46, domeColor);
}

/** A slim tower with a balcony ring and a chhatri on top. */
export function minaret(art: Art, parent: THREE.Object3D, x: number, base: number, z: number, h: number, r: number, color: number, domeColor = color) {
  art.cylinder(parent, x, base + h / 2, z, r, h, color, r * 0.82, 10);
  for (const at of [0.45, 0.8]) art.cylinder(parent, x, base + h * at, z, r * 1.45, r * 0.3, color, r * 1.45, 10);
  chhatri(art, parent, x, base + h, z, r * 2.6, color, domeColor);
}

/** A crenellated parapet (kangura) along x, from `from` to `to`. */
export function kangura(art: Art, parent: THREE.Object3D, from: number, to: number, y: number, z: number, color: number, step = 0.34) {
  const count = Math.max(2, Math.round((to - from) / step));
  art.box(parent, (from + to) / 2, y + 0.05, z, to - from, 0.1, 0.08, color);
  for (let i = 0; i < count; i++) art.box(parent, from + ((to - from) * (i + 0.5)) / count, y + 0.17, z, ((to - from) / count) * 0.55, 0.16, 0.08, color);
}

/** A row of arches along a wall, e.g. a verandah or blind arcade: a pier between each, shade inside. */
export function arcade(art: Art, parent: THREE.Object3D, from: number, to: number, base: number, h: number, z: number, pier: number, shade: number, bays: number, skip?: (x: number) => boolean) {
  const bay = (to - from) / bays;
  for (let i = 0; i < bays; i++) {
    const x = from + bay * (i + 0.5);
    if (skip?.(x)) continue;
    archPanel(art, parent, x, base, z, bay * 0.72, h, shade);
  }
  for (let i = 0; i <= bays; i++) art.box(parent, from + bay * i, base + h / 2, z + 0.02, bay * 0.16, h, 0.05, pier);
}
