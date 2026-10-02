import PF from "pathfinding";
import type { CitizenAgent } from "@/lib/types";
import { THEME } from "./theme";
import { terraces } from "./infill";

export type Point = { x: number; z: number };
export type Building = {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  wall: number;
  roof: number;
  kind: "home" | "shop" | "civic" | "school" | "hospital" | "lab" | "gym" | "apartment" | "office" | "mall" | "station" | "shrine" | "terrace";
  /** Terraces only: which way the front looks, their street's style, and a seed for their details. */
  face?: "n" | "s" | "e" | "w";
  style?: "chowk" | "ganj" | "mohalla" | "wall" | "railing";
  seed?: number;
};

const BUILDINGS: Building[] = [
  {
    id: "home_a",
    name: "Willow House",
    x: 3.8,
    z: 3.8,
    w: 3.3,
    d: 3.4,
    h: 2.5,
    wall: 0xf5dfc6,
    roof: 0xbb6759,
    kind: "home",
  },
  {
    id: "home_b",
    name: "Clover House",
    x: 8.5,
    z: 3.8,
    w: 3.4,
    d: 3.4,
    h: 2.8,
    wall: 0xdbe6d3,
    roof: 0x496c78,
    kind: "home",
  },
  {
    id: "home_c",
    name: "Rose House",
    x: 3.4,
    z: 8,
    w: 2.8,
    d: 2.8,
    h: 2.4,
    wall: 0xf5e9d9,
    roof: 0xa65864,
    kind: "home",
  },
  {
    id: "home_d",
    name: "Sage House",
    x: 9,
    z: 8,
    w: 2.8,
    d: 2.8,
    h: 2.4,
    wall: 0xd1e4de,
    roof: 0x557e6d,
    kind: "home",
  },
  { id: "home_e", name: "Birch House", x: 37.4, z: 4.2, w: 3, d: 3, h: 2.5, wall: 0xf1e3cf, roof: 0x7c5c8a, kind: "home" },
  { id: "home_h", name: "Fern House", x: 37.5, z: 9.3, w: 2.8, d: 2.2, h: 2.2, wall: 0xe8efe0, roof: 0xb97b4b, kind: "home" },
  { id: "home_f", name: "Maple House", x: 37.8, z: 30.3, w: 3, d: 3, h: 2.5, wall: 0xf4e1d2, roof: 0xa9573f, kind: "home" },
  { id: "home_g", name: "Poppy House", x: 31.2, z: 37.2, w: 2.8, d: 2.6, h: 2.3, wall: 0xeee3c8, roof: 0x5b7f9c, kind: "home" },
  // Eki-mae downtown across the river.
  { id: "loc_apartments", name: "KAMIMEGURO APTS", x: 55, z: 5.2, w: 6.5, d: 4, h: 7.5, wall: 0xeae3d6, roof: 0x6d7a86, kind: "apartment" },
  { id: "loc_office", name: "GT TOWER", x: 75, z: 5.5, w: 5, d: 5, h: 12, wall: 0xa9c1cf, roof: 0x55636e, kind: "office" },
  { id: "loc_mall", name: "高架下 ARCADE", x: 58.5, z: 20, w: 8, d: 5, h: 4.4, wall: 0xf3ead9, roof: 0xd9798a, kind: "mall" },
  { id: "loc_station", name: "中目黒 NAKAMEGURO", x: 78.5, z: 20, w: 6, d: 4.4, h: 3.6, wall: 0xe8e1d0, roof: 0x4f6d5a, kind: "station" },
  { id: "loc_konbini", name: "HAPPYMART 24", x: 63.5, z: 31, w: 3.6, d: 2.8, h: 2.4, wall: 0xf7f5ee, roof: 0x3f8f6d, kind: "shop" },
  { id: "loc_shrine", name: "氷川神社 HIKAWA", x: 57, z: 34.6, w: 4, d: 3, h: 2.4, wall: 0xc9553d, roof: 0x3b3a3f, kind: "shrine" },
  { id: "loc_clinic", name: "MINAMI CLINIC", x: 76, z: 32.5, w: 4.4, d: 3.6, h: 3, wall: 0xeef3f1, roof: 0x7fb0ac, kind: "hospital" },
  { id: "loc_gym", name: "RIVERSIDE GYM", x: 37, z: 18.4, w: 3.6, d: 3.2, h: 2.8, wall: 0xe7e2ec, roof: 0xd0685e, kind: "gym" },
  {
    id: "loc_school",
    name: "中目黒学園 NAKAMEGURO SCHOOL",
    x: 19.3,
    z: 5.4,
    w: 6.5,
    d: 4,
    h: 3.4,
    wall: 0xf2dfbd,
    roof: 0xb46158,
    kind: "school",
  },
  {
    id: "loc_hospital",
    name: "KYOSAI HOSPITAL",
    x: 31.5,
    z: 5,
    w: 5,
    d: 4.2,
    h: 3.6,
    wall: 0xe5efed,
    roof: 0x83afad,
    kind: "hospital",
  },
  {
    id: "loc_pharmacy",
    name: "PHARMACY",
    x: 32,
    z: 10.4,
    w: 3.4,
    d: 2.8,
    h: 2.1,
    wall: 0xf2eee2,
    roof: 0x46867c,
    kind: "shop",
  },
  {
    id: "loc_bank",
    name: "AOBADAI BANK",
    x: 9.1,
    z: 18.4,
    w: 3.5,
    d: 3.3,
    h: 2.8,
    wall: 0xe4dcd5,
    roof: 0x70778c,
    kind: "civic",
  },
  {
    id: "loc_restaurant",
    name: "SUNNY SIDE CAFE",
    x: 4.3,
    z: 21.1,
    w: 4.1,
    d: 3.2,
    h: 2.5,
    wall: 0xefccb9,
    roof: 0xaf6562,
    kind: "shop",
  },
  {
    id: "loc_library",
    name: "図書館 LIBRARY",
    x: 20.3,
    z: 23,
    w: 5.3,
    d: 2.7,
    h: 2.4,
    wall: 0xe9e7cf,
    roof: 0x567b82,
    kind: "civic",
  },
  {
    id: "loc_police",
    name: "交番 KOBAN",
    x: 31.8,
    z: 18.3,
    w: 4.3,
    d: 3.8,
    h: 2.8,
    wall: 0xe4e9e5,
    roof: 0x567895,
    kind: "civic",
  },
  {
    id: "loc_lab",
    name: "SCIENCE LAB",
    x: 35.6,
    z: 23.1,
    w: 4,
    d: 3,
    h: 2.7,
    wall: 0xdce6ea,
    roof: 0x638e99,
    kind: "lab",
  },
  {
    id: "loc_city_hall",
    name: "目黒区役所 CITY OFFICE",
    x: 31.8,
    z: 30.3,
    w: 5.7,
    d: 4.3,
    h: 3.7,
    wall: 0xf1dec4,
    roof: 0x65716e,
    kind: "civic",
  },
  {
    id: "barn",
    name: "COMMUNITY GARDEN",
    x: 8,
    z: 31.2,
    w: 4,
    d: 4,
    h: 2.5,
    wall: 0xb96b59,
    roof: 0x657977,
    kind: "home",
  },
  {
    id: "loc_power",
    name: "ENERGY",
    x: 36,
    z: 35.2,
    w: 3,
    d: 3,
    h: 2,
    wall: 0xcdd7ca,
    roof: 0x597884,
    kind: "lab",
  },
];

// Every city stands on the same plots; the theme gives each building its local name and colours.
const PLACES: Building[] = BUILDINGS.map((b) => ({ ...b, ...THEME.buildings[b.id] }));

export const arrivals: Record<string, Point> = {
  loc_homes: { x: 6, z: 11.5 },
  loc_school: { x: 19.3, z: 9 },
  loc_hospital: { x: 31.5, z: 8.3 },
  loc_pharmacy: { x: 32, z: 12.3 },
  loc_bank: { x: 9.1, z: 20.5 },
  loc_restaurant: { x: 4.3, z: 23.3 },
  loc_library: { x: 20.3, z: 24.8 },
  loc_market: { x: 21, z: 19.5 },
  loc_police: { x: 31.8, z: 21 },
  loc_lab: { x: 35.6, z: 25 },
  loc_city_hall: { x: 31.8, z: 33.2 },
  loc_farm: { x: 8, z: 34 },
  loc_power: { x: 36, z: 37.3 },
  loc_park: { x: 18, z: 33 },
  loc_bus_stop: { x: 15.5, z: 12 },
  loc_gym: { x: 37, z: 20.6 },
  loc_apartments: { x: 55, z: 8.2 },
  loc_office: { x: 75, z: 9 },
  loc_mall: { x: 58.5, z: 23.4 },
  loc_station: { x: 78.5, z: 23.2 },
  loc_konbini: { x: 63.5, z: 33.2 },
  loc_shrine: { x: 57, z: 31.6 },
  loc_clinic: { x: 76, z: 35.2 },
};

// Things standing in the street that a terrace must not be built over: lamp posts, the gateway, the clock tower.
const STREET_FURNITURE: Point[] = [
  ...[52, 60, 66.2, 71.8, 80].flatMap((x) => [10.8, 16.2, 23.8, 29.2].map((z) => ({ x: x + 0.2, z }))),
  ...[11.2, 24.2, 28.8].flatMap((x) => [2, 10, 18, 24, 32, 38].map((z) => ({ x: x + 0.2, z }))),
  { x: 57, z: 30.3 }, { x: 73.4, z: 25 },
];
/** The places the game uses, plus (in Lucknow) the terraces that fill the streets between them. */
export const buildings: Building[] = THEME.terraces ? [...PLACES, ...terraces(PLACES, arrivals, STREET_FURNITURE)] : PLACES;

/** True if a point is inside (or within `margin` of) any building: used to keep trees and street props out of walls. */
export function insideFootprint(x: number, z: number, margin = 0.2) {
  return buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + margin && Math.abs(z - b.z) < b.d / 2 + margin);
}

/** Town bounds in world units: the old town (x 0-40), the river (41.5-48.5) and downtown (49-91). */
export const WORLD = { width: 92, depth: 40 };
export const RIVER = { from: 41.2, to: 48.8, bridges: [13.5, 26.5] };


const RESOLUTION = 2;
const WIDTH = WORLD.width * RESOLUTION;
const DEPTH = WORLD.depth * RESOLUTION;
const grid = new PF.Grid(WIDTH, DEPTH);
for (let z = 0; z < DEPTH; z++)
  for (let x = 0; x < WIDTH; x++) {
    const px = x / RESOLUTION,
      pz = z / RESOLUTION;
    const river = px > RIVER.from && px < RIVER.to && !RIVER.bridges.some((b) => Math.abs(pz - b) < 1.4);
    const blocked =
      river ||
      buildings.some(
        (b) =>
          Math.abs(px - b.x) < b.w / 2 + 0.25 &&
          Math.abs(pz - b.z) < b.d / 2 + 0.25,
      ) || Math.hypot((px - 21.8) / 1.4, (pz - 31.8) / 1.8) < 1;
    grid.setWalkableAt(x, z, !blocked);
  }
const finder = new PF.AStarFinder({
  allowDiagonal: true,
  dontCrossCorners: true,
});

export function walkablePoint(point: Point): Point {
  const x = Math.max(0, Math.min(WIDTH - 1, Math.round(point.x * RESOLUTION)));
  const z = Math.max(0, Math.min(DEPTH - 1, Math.round(point.z * RESOLUTION)));
  for (let r = 0; r < WIDTH; r++) {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (grid.isWalkableAt(x + dx, z + dz))
          return { x: (x + dx) / RESOLUTION, z: (z + dz) / RESOLUTION };
      }
  }
  return { x: 13, z: 13 };
}

const houses = buildings.filter((b) => b.id.startsWith("home_"));

/** The front step of a house. With a household id, residents use their own family's door. */
export function homeDoor(index: number, householdId?: string): Point {
  const own = householdId ? houses.find((h) => h.id === householdId) : undefined;
  const house = own ?? houses[index % houses.length];
  const slot = own ? index : Math.floor(index / houses.length);
  const side = ((slot % 4) - 1.5) * 0.4;
  return walkablePoint({ x: house.x + side, z: house.z + house.d / 2 + 0.55 + Math.floor(slot / 4) * 0.4 });
}

/** `homeSlot` is the resident's position among their own household, used at the front door. */
export function citizenPoint(citizen: CitizenAgent, index: number, homeSlot = index): Point {
  if (citizen.x === citizen.target_x && citizen.y === citizen.target_y) {
    if (citizen.current_location_id === "loc_homes") return homeDoor(citizen.life ? homeSlot : index, citizen.life?.household_id);
    const arrival = arrivals[citizen.current_location_id];
    if (arrival) {
      return walkablePoint({
        x: arrival.x + ((index % 4) - 1.5) * 0.55,
        z: arrival.z + (Math.floor(index / 4) % 2) * 0.5,
      });
    }
  }
  return walkablePoint({ x: citizen.x, z: citizen.y });
}

export function walkingRoute(from: Point, to: Point): Point[] {
  const start = walkablePoint(from),
    end = walkablePoint(to);
  return finder
    .findPath(
      Math.round(start.x * RESOLUTION),
      Math.round(start.z * RESOLUTION),
      Math.round(end.x * RESOLUTION),
      Math.round(end.z * RESOLUTION),
      grid.clone(),
    )
    .map(([x, z]) => ({ x: x / RESOLUTION, z: z / RESOLUTION }));
}

export function isWalkable(point: Point) {
  return grid.isWalkableAt(
    Math.round(point.x * RESOLUTION),
    Math.round(point.z * RESOLUTION),
  );
}
