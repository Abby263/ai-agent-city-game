import type { Building, Point } from "./layout";
import { STREETS, at, inRoad, reach, roadClearance, span } from "./streets";

// Lucknow is built wall to wall. Between the places the game uses, the road frontages are filled with terraces:
// attached two- to four-storey buildings with a shop below and homes above, standing right on the road's edge.
// They follow the street map in streets.ts, are generated here once, from the same seed every time, and join the
// building list (so people walk round them and cameras stay out of them).

type Rect = [x0: number, z0: number, x1: number, z1: number];

const DEPTH = 1.7, LANE = 0.7, PANEL = 1.5;
/** The land the mohallas fill, as [x0, z0, x1, z1]: the whole old city, and downtown's blocks between its roads. */
const BLOCKS: Rect[] = ([[0.15, 0.15, 39.1, 39.6]] as Rect[])
  .concat([49.7, 71.6].flatMap((x0, i) => [0.15, 16.1, 29.1].map((z0, j): Rect => [x0, z0, [66.4, 84.1][i], [10.9, 23.9, 39.6][j]])));

// Open ground that must stay open, and no more of it than there would be: the bazaar, the park, the orchard, the
// school's courtyard, the tempo stand, the kabab house's tables, and the lanes the old families' houses stand on.
const OPEN: Rect[] = [
  [16.2, 16.2, 24.8, 21.2], [16.9, 28.4, 24.4, 35.5], [2, 28.8, 11, 35.3], [15.8, 7.4, 23.4, 11.1], [14.6, 10.4, 16.8, 12.6],
  [1.8, 22.6, 6.8, 24.4], [0.6, 9.7, 11.4, 11.3], [5.2, 1.4, 6.8, 9.7], [39.3, -5, 49.4, 45],
  [71.5, 15.6, 85, 24.6], [51.5, 21.6, 66.5, 24.4], [51.8, 28.6, 68.2, 38], [58.6, 10.2, 61.4, 12.6], [84.2, -5, 95, 45],
];

const random = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

const footprint = (b: Building, margin = 0): Rect => [b.x - b.w / 2 - margin, b.z - b.d / 2 - margin, b.x + b.w / 2 + margin, b.z + b.d / 2 + margin];

/**
 * The way in to every place and every front door: a lane, wide enough to walk, by the shortest way round the
 * buildings to the nearest street. Nothing is built on these, and they are paved in brick. Returned as small
 * squares strung along each lane.
 */
export function accessLanes(existing: Building[], arrivals: Record<string, Point>): Rect[] {
  const STEP = 0.5, W = 184, H = 80;
  const solid = (x: number, z: number) => x < 0.5 || z < 0.5 || x > 91.5 || z > 39.5 || (x > 40.5 && x < 49.5 && Math.abs(z - 13.5) > 1.2 && Math.abs(z - 26.5) > 1.2)
    || Math.hypot((x - 21.8) / 1.5, (z - 31.8) / 1.9) < 1 || existing.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.3 && Math.abs(z - b.z) < b.d / 2 + 0.3);
  const doors = existing.filter((b) => b.id.startsWith("home_")).map((b) => ({ x: b.x, z: b.z + b.d / 2 + 0.55 }));
  const lanes: Rect[] = [];
  const paved = new Set<number>();
  for (const p of [...Object.values(arrivals), ...doors]) {
    // Breadth-first from the door, until the walk reaches a street.
    const start = Math.round(p.z / STEP) * W + Math.round(p.x / STEP);
    const from = new Map<number, number>([[start, -1]]);
    const queue = [start];
    let end = -1;
    for (let head = 0; head < queue.length && end < 0; head++) {
      const cell = queue[head], cx = cell % W, cz = Math.floor(cell / W);
      if (roadClearance(cx * STEP, cz * STEP) < -0.3) { end = cell; break; }
      for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz, next = nz * W + nx;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H || from.has(next) || solid(nx * STEP, nz * STEP)) continue;
        from.set(next, cell);
        queue.push(next);
      }
    }
    for (let cell = end; cell >= 0; cell = from.get(cell) ?? -1) {
      if (paved.has(cell)) continue;
      paved.add(cell);
      const x = (cell % W) * STEP, z = Math.floor(cell / W) * STEP;
      if (roadClearance(x, z) > -0.3) lanes.push([x - 0.62, z - 0.62, x + 0.62, z + 0.62]);
    }
  }
  return lanes;
}

export function terraces(existing: Building[], arrivals: Record<string, Point>, keepClear: Point[]): Building[] {
  const lanes = accessLanes(existing, arrivals);
  const blocked: Rect[] = [
    ...OPEN,
    ...lanes,
    ...existing.flatMap((b): Rect[] => [
      // Houses share walls with their neighbours; public buildings stand a little apart.
      footprint(b, b.kind === "home" ? 0.02 : 0.15),
      // The way in: every building's front (south) side stays open to the street.
      [b.x - b.w / 2 - 0.1, b.z + b.d / 2, b.x + b.w / 2 + 0.1, b.z + b.d / 2 + 1.6],
    ]),
    ...Object.values(arrivals).map((p): Rect => [p.x - 1.5, p.z - 1.4, p.x + 1.5, p.z + 1.4]),
    ...keepClear.map((p): Rect => [p.x - 0.7, p.z - 0.7, p.x + 0.7, p.z + 0.7]),
  ];
  const out: Building[] = [];
  let n = 0;
  // Street fronts: a row either side of every street, each building square to the map and hard against the road,
  // so where the road bends the fronts step in and out with it.
  for (const street of STREETS) for (const side of [-1, 1] as const) {
    const [from, to] = span(street);
    let s = from, sinceGap = 0;
    while (s < to - 1.2) {
      const seed = ++n * 7.31 + street.pts[0][1];
      const width = Math.min(to - s, 1.3 + random(seed) * 1.5);
      const mid = s + width / 2, ganj = street.style === "ganj";
      // Where a full-depth building will not fit between the road and the plot behind, a shallower one goes up:
      // a row of lock-up shops, or just a single room deep.
      let placed: [number, number, number, number] | undefined, depth = DEPTH;
      for (depth of ganj ? [DEPTH] : [DEPTH, 1.2, 0.8]) {
        const across = reach(street, s, s + width, side) + side * (street.half + depth / 2 + 0.04);
        const [x, z, w, d] = street.axis === "x" ? [mid, across, width, depth] : [across, mid, depth, width];
        const rect: Rect = [x - w / 2, z - d / 2, x + w / 2, z + d / 2];
        if (blocked.some((b) => overlaps(rect, b)) || inRoad(...rect) || out.some((t) => overlaps(rect, footprint(t)))) continue;
        placed = [x, z, w, d];
        break;
      }
      if (!placed) { s += 0.3; sinceGap = 0; continue; }
      const [x, z, w, d] = placed;
      const floors = ganj ? (random(seed + 3) < 0.22 ? 3 : 2) : depth < 1 ? 1 + Math.floor(random(seed + 3) * 1.6) : 2 + Math.floor(random(seed + 3) * 2.6);
      out.push({ id: `terrace_${n}`, name: "", x, z, w, d, h: floors * 1.15 + (ganj ? 0.25 : 0), wall: 0, roof: 0, kind: "terrace",
        face: street.axis === "x" ? (side > 0 ? "n" : "s") : side > 0 ? "w" : "e", style: street.style, seed: n });
      s += width;
      // Every few buildings a gali, a lane just wide enough to walk through, breaks the wall.
      if (++sinceGap >= 4 + Math.floor(random(seed + 9) * 3)) { s += 0.7; sinceGap = 0; }
    }
  }
  // Behind the street fronts, the mohallas: rows of houses along narrow lanes, filling each block around the
  // places the game uses. Rows face south onto their lane; a gali cuts through every few houses.
  // Houses in a row share walls, and stand back to back with the row behind; on every other side they keep a
  // lane's width from whatever is there.
  const gap = LANE - 0.16;
  const around = (t: Building): Rect => {
    const [x0, z0, x1, z1] = footprint(t, gap);
    return t.face === "s" ? [x0, z0 + gap, x1, z1] : t.face === "n" ? [x0, z0, x1, z1 - gap] : t.face === "e" ? [x0 + gap, z0, x1, z1] : t.face === "w" ? [x0, z0, x1 - gap, z1] : [x0, z0, x1, z1];
  };
  const taken = (rect: Rect, row: number, face: "s" | "n" | "e") =>
    out.some((t) => overlaps(rect, t.style === "mohalla" && t.face === face && (face === "e" ? t.x : t.z) === row ? footprint(t) : around(t)));
  // Several passes, each fitting what the last could not: houses facing south onto their lane, houses facing
  // north with their backs to those, houses side-on, then shallower ones (a single room deep) in the strips that
  // are left. The old city has no spare ground.
  const passes: Array<{ depth: number; face: "s" | "n" | "e"; old: boolean }> = [
    { depth: DEPTH, face: "s", old: false }, { depth: DEPTH, face: "n", old: true }, { depth: DEPTH, face: "e", old: true },
    { depth: 1.2, face: "s", old: true }, { depth: 1.2, face: "n", old: true }, { depth: 1.2, face: "e", old: true }, { depth: 0.85, face: "s", old: true },
  ];
  for (const pass of passes) for (const [x0, z0, x1, z1] of BLOCKS) {
    if (pass.old && x0 > 40) continue;
    const turned = pass.face === "e";
    // `u` runs along a row and `v` across the rows: x and z for rows facing north or south, swapped for east.
    const [u0, v0, u1, v1] = turned ? [z0, x0, z1, x1] : [x0, z0, x1, z1];
    // Rows are tried every 0.3 units, so they pack in around whatever is already standing.
    for (let v = v0 + pass.depth / 2; v + pass.depth / 2 <= v1; v += 0.3) {
      let u = u0, sinceGap = 0;
      while (u < u1 - 1.2) {
        const seed = ++n * 5.17 + v;
        const width = Math.min(u1 - u, 1.4 + random(seed) * 1.5);
        const rect: Rect = turned ? [v - pass.depth / 2, u, v + pass.depth / 2, u + width] : [u, v - pass.depth / 2, u + width, v + pass.depth / 2];
        if (blocked.some((b) => overlaps(rect, b)) || taken(rect, v, pass.face) || inRoad(rect[0] - 0.05, rect[1] - 0.05, rect[2] + 0.05, rect[3] + 0.05, 1)) { u += 0.3; sinceGap = 0; continue; }
        const floors = pass.depth < 1 ? 1 + Math.floor(random(seed + 3) * 1.7) : 2 + Math.floor(random(seed + 3) * 2.4);
        out.push({ id: `terrace_${n}`, name: "", x: (rect[0] + rect[2]) / 2, z: (rect[1] + rect[3]) / 2, w: rect[2] - rect[0], d: rect[3] - rect[1], h: floors * 1.15, wall: 0, roof: 0,
          kind: "terrace", face: pass.face, style: "mohalla", seed: n });
        u += width;
        if (++sinceGap >= 3 + Math.floor(random(seed + 9) * 3)) { u += LANE; sinceGap = 0; }
      }
    }
  }
  // What is left open to the road is walled: brick compound walls round the old city's plots, iron railings round
  // the park and along Hazratganj. A gateway is left wherever people need to get in, and every few metres besides.
  const solid = (rect: Rect) => [...existing, ...out].some((b) => overlaps(rect, footprint(b)));
  const gateways = Object.values(arrivals);
  for (const street of STREETS) for (const side of [-1, 1] as const) {
    const [from, to] = span(street);
    let sinceGate = 0;
    for (let s = from; s < to - 1; s += PANEL) {
      const mid = s + PANEL / 2, across = reach(street, s, s + PANEL, side) + side * (street.half + 0.12);
      const [x, z, w, d] = street.axis === "x" ? [mid, across, PANEL, 0.16] : [across, mid, 0.16, PANEL];
      // Skip junctions, the river, anything already built on this stretch, and the way in to every place.
      if (inRoad(x - w / 2, z - d / 2, x + w / 2, z + d / 2)) { sinceGate = 0; continue; }
      const strip: Rect = street.axis === "x" ? [s, Math.min(across, across + side * 1.2), s + PANEL, Math.max(across, across + side * 1.2)]
        : [Math.min(across, across + side * 1.2), s, Math.max(across, across + side * 1.2), s + PANEL];
      if (solid(strip) || lanes.some((lane) => overlaps(strip, lane)) || overlaps(strip, [39.3, -5, 49.4, 45]) || overlaps(strip, [84.2, -5, 95, 45])) { sinceGate = 0; continue; }
      const along = (p: Point) => (street.axis === "x" ? p.x : p.z), away = (p: Point) => Math.abs((street.axis === "x" ? p.z : p.x) - at(street, mid));
      if (gateways.some((p) => Math.abs(along(p) - mid) < 1.5 && away(p) < 9)) { sinceGate = 0; continue; }
      if (keepClear.some((p) => Math.abs(p.x - x) < 0.5 && Math.abs(p.z - z) < 0.5)) continue;
      if (++sinceGate > 4) { sinceGate = 0; continue; }
      const park = overlaps(strip, OPEN[1]), ganj = street.style === "ganj";
      out.push({ id: `wall_${++n}`, name: "", x, z, w, d, h: park || ganj ? 0.62 : 0.95, wall: 0, roof: 0, kind: "terrace",
        face: street.axis === "x" ? (side > 0 ? "n" : "s") : side > 0 ? "w" : "e", style: park || ganj ? "railing" : "wall", seed: n });
    }
  }
  return out;
}
