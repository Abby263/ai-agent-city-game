import type { Building, Point } from "./layout";
import { STREETS, at, inRoad, reach, span } from "./streets";

// Lucknow is built wall to wall. Between the places the game uses, the road frontages are filled with terraces:
// attached two- to four-storey buildings with a shop below and homes above, standing right on the road's edge.
// They follow the street map in streets.ts, are generated here once, from the same seed every time, and join the
// building list (so people walk round them and cameras stay out of them).

type Rect = [x0: number, z0: number, x1: number, z1: number];

const DEPTH = 1.7, LANE = 0.7, PANEL = 1.5;
/** The land the mohallas fill, as [x0, z0, x1, z1]: the whole old city, and downtown's blocks between its roads. */
const BLOCKS: Rect[] = ([[0.15, 0.15, 39.1, 39.6]] as Rect[])
  .concat([49.7, 71.6].flatMap((x0, i) => [0.15, 16.1, 29.1].map((z0, j): Rect => [x0, z0, [66.4, 84.1][i], [10.9, 23.9, 39.6][j]])));

// Open ground that must stay open: the bazaar, the park, the orchard, yards, squares and lanes.
const OPEN: Rect[] = [
  [15.8, 15.9, 25.2, 21.6], [15.4, 27.6, 24.8, 36.8], [1.4, 28.4, 11.4, 37.6], [15.6, 7.2, 23.8, 11.8], [14.2, 10, 17, 13],
  [1.8, 22.4, 7, 24.6], [0.6, 9.4, 11.6, 11.8], [5, 1.4, 7, 9.6], [39.3, -5, 49.4, 45],
  [71.5, 15.6, 85, 24.6], [51.5, 21.6, 66.5, 24.4], [51.8, 28.6, 68.2, 38], [58.6, 10.2, 61.4, 12.6], [84.2, -5, 95, 45],
];

const random = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

const footprint = (b: Building, margin = 0): Rect => [b.x - b.w / 2 - margin, b.z - b.d / 2 - margin, b.x + b.w / 2 + margin, b.z + b.d / 2 + margin];

/**
 * The way in to every place and every front door: a lane, wide enough to walk, straight to the nearest street that
 * can be reached without going through a building. Nothing is built on these, and they are paved in brick.
 */
export function accessLanes(existing: Building[], arrivals: Record<string, Point>): Rect[] {
  const doors = existing.filter((b) => b.id.startsWith("home_")).map((b) => ({ x: b.x, z: b.z + b.d / 2 + 0.55 }));
  const lanes: Rect[] = [];
  for (const p of [...Object.values(arrivals), ...doors]) {
    let best: { rect: Rect; length: number } | undefined;
    for (const street of STREETS) {
      const [from, to] = span(street);
      const along = street.axis === "x" ? p.x : p.z, across = street.axis === "x" ? p.z : p.x;
      if (along < from || along > to) continue;
      const centre = at(street, along), length = Math.abs(centre - across) - street.half;
      const [lo, hi] = [Math.min(across, centre), Math.max(across, centre)];
      const rect: Rect = street.axis === "x" ? [p.x - 0.65, lo, p.x + 0.65, hi] : [lo, p.z - 0.65, hi, p.z + 0.65];
      if (existing.some((b) => overlaps(rect, footprint(b, 0.1)))) continue;
      if (!best || length < best.length) best = { rect, length };
    }
    if (best && best.length > 0) lanes.push(best.rect);
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
      footprint(b, b.kind === "home" ? 0.02 : 0.3),
      // The way in: every building's front (south) side stays open to the street.
      [b.x - b.w / 2 - 0.2, b.z + b.d / 2, b.x + b.w / 2 + 0.2, b.z + b.d / 2 + 1.9],
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
  // Houses in a row share walls; rows keep a lane's width from everything else.
  const taken = (rect: Rect, row: number) => {
    const gap = LANE - 0.06;
    return out.some((t) => overlaps(rect, t.style === "mohalla" && t.z === row ? footprint(t) : footprint(t, gap)));
  };
  for (const [x0, z0, x1, z1] of BLOCKS) {
    // Rows are tried every 0.3 units, so they pack in around whatever is already standing.
    for (let z = z0 + DEPTH / 2; z + DEPTH / 2 <= z1; z += 0.3) {
      let x = x0, sinceGap = 0;
      while (x < x1 - 1.2) {
        const seed = ++n * 5.17 + z;
        const width = Math.min(x1 - x, 1.4 + random(seed) * 1.5);
        const rect: Rect = [x, z - DEPTH / 2, x + width, z + DEPTH / 2];
        if (blocked.some((b) => overlaps(rect, b)) || taken(rect, z) || inRoad(rect[0] - 0.05, rect[1] - 0.05, rect[2] + 0.05, rect[3] + 0.05, 1)) { x += 0.3; sinceGap = 0; continue; }
        out.push({ id: `terrace_${n}`, name: "", x: x + width / 2, z, w: width, d: DEPTH, h: (2 + Math.floor(random(seed + 3) * 2.4)) * 1.15, wall: 0, roof: 0,
          kind: "terrace", face: "s", style: "mohalla", seed: n });
        x += width;
        if (++sinceGap >= 3 + Math.floor(random(seed + 9) * 3)) { x += LANE; sinceGap = 0; }
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
