import * as THREE from "three";
import type { Art } from "./materials";
import { isLucknow } from "./theme";

// Base tree colours used in town.ts: four sakura shades and four green shades.
const SAKURA = [0xefb0c2, 0xf6c2cf, 0xe999b4, 0xffd6de];
const GREEN = [0x6d9e78, 0x80ac7d, 0x5d916c, 0x9cbd8b];

export type Foliage = { sakura: number[]; green: number[]; petals: number | null; lanterns: boolean; label: string };

/** Tokyo's year in trees: hanami, fresh leaves, deep summer green, autumn colour, bare winter. */
export function foliageFor(month: number, day: number): Foliage {
  const v = month * 100 + day;
  // Lucknow: kites fly all year (the "petals" are kites there), and the riverbank is strung with lights for Diwali.
  if (isLucknow) return { sakura: SAKURA, green: GREEN, petals: 0xffffff, lanterns: v >= 1101 && v <= 1115, label: v >= 1101 && v <= 1115 ? "Diwali lights" : "Kite weather" };
  if (v >= 325 && v <= 408) return { sakura: SAKURA, green: [0x7fae74, 0x8dba7c, 0x6e9f6c, 0xa7c98f], petals: 0xffc8db, lanterns: true, label: "Cherry blossoms" };
  if (v >= 409 && v <= 425) return { sakura: [0xc9d9a2, 0xe8c6cf, 0xb5d08f, 0xf1d8de], green: [0x86b878, 0x98c585, 0x76a970, 0xb0d196], petals: 0xf6d6df, lanterns: v <= 415, label: "Fresh leaves" };
  if (v >= 426 && v <= 1031) return { sakura: [0x6f9f6a, 0x7fae74, 0x5e8f60, 0x8fbf7f], green: GREEN, petals: null, lanterns: false, label: "Summer green" };
  if (v >= 1101 && v <= 1210) return { sakura: [0xd9784a, 0xe39458, 0xc4623e, 0xefb070], green: [0xd9b44a, 0x7f9e62, 0xc9a13e, 0xa9b86a], petals: 0xe08a4a, lanterns: false, label: "Autumn leaves" };
  return { sakura: [0x9d8b80, 0xa89688, 0x8f7d72, 0xb3a296], green: [0x5f8a6a, 0x6c9270, 0x557f62, 0x86a07f], petals: null, lanterns: false, label: "Winter" };
}

/** Recolours the shared tree materials in place; every tree in town follows. */
export function applyFoliage(art: Art, foliage: Foliage) {
  SAKURA.forEach((base, i) => art.material(base).color.set(foliage.sakura[i]));
  GREEN.forEach((base, i) => art.material(base).color.set(foliage.green[i]));
}

/** Paper lanterns (chōchin) strung along the Meguro River during hanami. */
export function makeLanterns(art: Art) {
  const root = new THREE.Group();
  const pink = new THREE.MeshStandardMaterial({ color: 0xf6b8c8, emissive: 0xff9fb8, emissiveIntensity: 0.35, roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0xffe9c8, emissiveIntensity: 0.35, roughness: 0.7 });
  art.materials.set("lantern-pink", pink);
  art.materials.set("lantern-white", white);
  const shape = art.geometry(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 10));
  for (const x of [41.3, 48.7])
    for (let z = 0.8; z < 39.5; z += 1.1) {
      if (Math.abs(z - 13.5) < 1.9 || Math.abs(z - 26.5) < 1.9) continue;
      const lantern = new THREE.Mesh(shape, Math.round(z / 1.1) % 2 ? pink : white);
      lantern.position.set(x, 1.55, z);
      root.add(lantern);
    }
  root.visible = false;
  return { root, materials: [pink, white] };
}
