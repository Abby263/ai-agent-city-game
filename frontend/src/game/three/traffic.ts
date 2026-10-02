import * as THREE from "three";
import { Art } from "./materials";
import type { Point } from "./layout";
import { autoRickshaw } from "./props";
import { isLucknow } from "./theme";
import { CHAURAHA, CHOWK, at } from "./streets";

// Japan drives on the left. The route runs east over the north bridge to downtown, down the
// avenue, and back west over the south bridge, passing both bus shelters on its first stretch.
const GRID_LOOP: Point[] = [
  { x: 12.75, z: 12.75 },
  { x: 69.75, z: 12.75 },
  { x: 69.75, z: 27.25 },
  { x: 12.75, z: 27.25 },
];

/**
 * Lucknow drives on the left too, when it keeps to a side at all. The same round trip, along the old city's bent
 * roads: east down the bazaar road and round the chauraha, over the bridge, down Hazratganj's avenue, back over
 * the south bridge and through Nakhas, then north up Sarai Road to the bazaar again.
 */
function lucknowLoop(): Point[] {
  const [chowk, nakhas, , sarai] = CHOWK;
  const out: Point[] = [];
  const ring = CHAURAHA.island + 0.85;
  let rounded = false;
  for (let x = 13.6; x <= 39.2; x += 0.8) {
    if (Math.abs(x - CHAURAHA.x) < ring + 0.3) {
      // Round the island by the north side: clockwise, as on any Indian roundabout.
      if (!rounded) for (let a = Math.PI - 0.35; a >= 0.35; a -= 0.3) out.push({ x: CHAURAHA.x + Math.cos(a) * ring, z: CHAURAHA.z - Math.sin(a) * ring });
      rounded = true;
      continue;
    }
    out.push({ x, z: at(chowk, x) - 0.5 });
  }
  out.push({ x: 41, z: 12.75 }, { x: 69.75, z: 12.75 }, { x: 69.75, z: 27.25 }, { x: 41, z: 27.25 });
  for (let x = 39.2; x >= 14.6; x -= 0.8) out.push({ x, z: at(nakhas, x) + 0.35 });
  for (let z = 26.2; z >= 15; z -= 0.8) out.push({ x: at(sarai, z) - 0.35, z });
  return out;
}

const loop = isLucknow ? lucknowLoop() : GRID_LOOP;
const segments = loop.map((from, i) => {
  const to = loop[(i + 1) % loop.length];
  return { from, to, length: Math.hypot(to.x - from.x, to.z - from.z) };
});
const LOOP_LENGTH = segments.reduce((sum, s) => sum + s.length, 0);
/** How far round the loop the eastbound lane first passes `x`. */
function distanceAt(x: number) {
  let d = 0;
  for (const s of segments) {
    if (s.from.x <= x && s.to.x > x) return d + (s.length * (x - s.from.x)) / (s.to.x - s.from.x);
    d += s.length;
  }
  return 0;
}
// Where the bus doors meet the shelters (old town and Kokashita Arcade).
const BUS_STOPS = [distanceAt(16.1), distanceAt(60.5)];

export function pointOnLoop(distance: number) {
  let d = ((distance % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
  for (const s of segments) {
    if (d <= s.length) {
      const t = d / s.length;
      return { x: s.from.x + (s.to.x - s.from.x) * t, z: s.from.z + (s.to.z - s.from.z) * t, heading: Math.atan2(s.to.x - s.from.x, s.to.z - s.from.z) };
    }
    d -= s.length;
  }
  return { x: loop[0].x, z: loop[0].z, heading: 0 };
}

type Vehicle = { root: THREE.Group; body: THREE.Group; distance: number; speed: number; length: number; bus: boolean; dwell: number; stopped: number };

function makeVehicle(art: Art, bus: boolean, color: number): Vehicle {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const length = bus ? 2.7 : 1.5, width = bus ? 1.05 : 0.8, height = bus ? 1.15 : 0.55;
  art.box(body, 0, 0.3 + height / 2, 0, width, height, length, color);
  if (!bus) art.box(body, 0, 0.3 + height + 0.2, -0.1, width * 0.86, 0.4, length * 0.55, color);
  // Glass shares the window material, so vehicles glow softly at night like the houses.
  const glassY = bus ? 0.3 + height * 0.68 : 0.3 + height + 0.2;
  for (const side of [-1, 1]) art.box(body, side * (width / 2 + 0.01), glassY, bus ? 0.1 : -0.1, 0.02, bus ? 0.36 : 0.3, length * (bus ? 0.78 : 0.48), 0x709ba6);
  art.box(body, 0, glassY, length / 2 + 0.01, width * 0.8, bus ? 0.36 : 0.3, 0.02, 0x709ba6);
  for (const side of [-1, 1]) art.box(body, side * width * 0.32, 0.45, length / 2 + 0.01, 0.16, 0.1, 0.03, 0xffe6a1);
  if (bus) {
    art.box(body, 0, 0.3 + height + 0.04, 0, width * 0.94, 0.08, length * 0.96, 0xf6e7c1);
    art.box(body, 0, 0.55, 0, width + 0.02, 0.06, length, 0x3d4a52);
    art.sign(body, "CITY BUS", width / 2 + 0.02, 0.3 + height * 0.32, 0, length * 0.62, 0.2, "#f2c14e", "#34424a").rotation.y = Math.PI / 2;
  }
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      const wheel = art.cylinder(body, x * width * 0.46, 0.2, z * length * 0.32, 0.2, 0.14, 0x3a434b, 0.2, 12);
      wheel.rotation.z = Math.PI / 2;
    }
  body.traverse((o) => { if (o instanceof THREE.Mesh) o.receiveShadow = false; });
  art.contactShadow(root, width * 1.45, length * 1.2, 0.42);
  return { root, body, distance: 0, speed: bus ? 2.1 : 2.6, length, bus, dwell: 0, stopped: 0 };
}

/** An auto-rickshaw or e-rickshaw in traffic: slower than a car, and there are a lot of them. */
function makeAuto(art: Art, electric: boolean): Vehicle {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  autoRickshaw(art, body, 0, 0.04, 0, 0, electric).scale.setScalar(1.25);
  body.traverse((o) => { if (o instanceof THREE.Mesh) o.receiveShadow = false; });
  art.contactShadow(root, 1.1, 1.7, 0.42);
  return { root, body, distance: 0, speed: electric ? 1.7 : 2.2, length: 1.4, bus: false, dwell: 0, stopped: 0 };
}

// In Lucknow's narrow roads people and traffic share the same few metres, so drivers pass closer.
const YIELD = isLucknow ? 0.75 : 1.25;

export function makeTraffic(art: Art) {
  const root = new THREE.Group();
  // Lucknow's roads belong to the three-wheelers: autos and e-rickshaws outnumber everything else.
  const vehicles = isLucknow ? [
    makeVehicle(art, true, 0xd9662b),
    makeAuto(art, false),
    makeAuto(art, true),
    makeVehicle(art, false, 0xf1f1ec),
    makeAuto(art, true),
    makeAuto(art, false),
    makeAuto(art, true),
    makeVehicle(art, false, 0xb9bdc0),
    makeAuto(art, false),
    makeAuto(art, true),
  ] : [
    makeVehicle(art, true, 0xf2c14e),
    makeVehicle(art, false, 0xd9776b),
    makeVehicle(art, false, 0x6f93c9),
    makeVehicle(art, false, 0xf0d24a),
  ];
  vehicles.forEach((v, i) => {
    v.distance = BUS_STOPS[0] + 4 + (i * LOOP_LENGTH) / vehicles.length;
    root.add(v.root);
    place(v, true);
  });

  function place(v: Vehicle, snap = false) {
    const p = pointOnLoop(v.distance);
    v.root.position.set(p.x, 0, p.z);
    const turn = Math.atan2(Math.sin(p.heading - v.root.rotation.y), Math.cos(p.heading - v.root.rotation.y));
    v.root.rotation.y += snap ? turn : turn * 0.25;
  }

  /** Moves vehicles, yielding to pedestrians and to the vehicle ahead. Typhoons suspend traffic. */
  function update(dt: number, pedestrians: Point[], suspended = false) {
    for (const v of vehicles) {
      if (suspended) continue;
      if (v.dwell > 0) { v.dwell -= dt; continue; }
      const ahead = pointOnLoop(v.distance + v.length / 2 + 0.9);
      const blockedByPerson = pedestrians.some((p) => Math.hypot(p.x - ahead.x, p.z - ahead.z) < YIELD);
      const gapToNext = Math.min(...vehicles.filter((o) => o !== v).map((o) =>
        (((o.distance - v.distance) % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH - (o.length + v.length) / 2));
      if (blockedByPerson || gapToNext < 0.9) {
        v.stopped += dt;
        continue;
      }
      v.stopped = 0;
      const before = ((v.distance % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
      v.distance += v.speed * dt * Math.min(1, gapToNext / 3);
      const after = ((v.distance % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
      if (v.bus && BUS_STOPS.some((stop) => before < stop && after >= stop)) v.dwell = 4;
      place(v);
      v.body.position.y = Math.abs(Math.sin(v.distance * 3)) * 0.012;
    }
  }
  return { root, update };
}
