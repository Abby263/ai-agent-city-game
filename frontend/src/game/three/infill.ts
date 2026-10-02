import type { Building, Point } from "./layout";

// Lucknow is built wall to wall. Between the places the game uses, the road frontages are filled with terraces:
// attached two- to four-storey buildings with a shop below and homes above, standing right on the road's edge.
// They are generated here, once, from the same seed every time, and join the building list (so people walk round
// them and cameras stay out of them).

type Rect = [x0: number, z0: number, x1: number, z1: number];
type Run = { axis: "x" | "z"; at: number; from: number; to: number; style: "chowk" | "ganj" };

/** Roads, as in town.ts and district.ts: the old city's four, and downtown's two streets and avenue. */
const RUNS: Run[] = [
  { axis: "x", at: 13.5, from: 0.6, to: 39.2, style: "chowk" }, { axis: "x", at: 26.5, from: 0.6, to: 39.2, style: "chowk" },
  { axis: "z", at: 13.5, from: 0.6, to: 39.4, style: "chowk" }, { axis: "z", at: 26.5, from: 0.6, to: 39.4, style: "chowk" },
  { axis: "x", at: 13.5, from: 49.6, to: 84, style: "ganj" }, { axis: "x", at: 26.5, from: 49.6, to: 84, style: "ganj" },
  { axis: "z", at: 69, from: 0.6, to: 39.4, style: "ganj" },
];
const CROSS = { x: [13.5, 26.5, 69], z: [13.5, 26.5] };
const DEPTH = 1.7, EDGE = 2.5, LANE = 0.7, PANEL = 1.5;
/** The land between the roads, as [x0, z0, x1, z1], inset from the road edges. */
const BLOCKS: Rect[] = [0.15, 16.1, 29.1].flatMap((x0, i) => [0.15, 16.1, 29.1].map((z0, j): Rect => [x0, z0, [10.9, 23.9, 39.1][i], [10.9, 23.9, 39.6][j]]))
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

export function terraces(existing: Building[], arrivals: Record<string, Point>, keepClear: Point[]): Building[] {
  const blocked: Rect[] = [
    ...OPEN,
    ...existing.flatMap((b): Rect[] => [
      // Houses share walls with their neighbours; public buildings stand a little apart.
      b.kind === "home" ? [b.x - b.w / 2 - 0.02, b.z - b.d / 2 - 0.02, b.x + b.w / 2 + 0.02, b.z + b.d / 2 + 0.02]
        : [b.x - b.w / 2 - 0.3, b.z - b.d / 2 - 0.3, b.x + b.w / 2 + 0.3, b.z + b.d / 2 + 0.3],
      // The way in: every building's front (south) side stays open to the street.
      [b.x - b.w / 2 - 0.2, b.z + b.d / 2, b.x + b.w / 2 + 0.2, b.z + b.d / 2 + 1.9],
    ]),
    ...Object.values(arrivals).map((p): Rect => [p.x - 1.5, p.z - 1.4, p.x + 1.5, p.z + 1.4]),
    ...keepClear.map((p): Rect => [p.x - 0.7, p.z - 0.7, p.x + 0.7, p.z + 0.7]),
  ];
  const out: Building[] = [];
  let n = 0;
  for (const run of RUNS) for (const side of [-1, 1] as const) {
    const crossings = run.axis === "x" ? CROSS.x : CROSS.z;
    // Rows along the east-west streets take the corners; rows along the north-south ones stop short of them.
    const clearance = run.axis === "x" ? EDGE + 0.1 : EDGE + DEPTH + 0.15;
    let s = run.from, sinceGap = 0;
    while (s < run.to - 1.2) {
      const seed = ++n * 7.31 + run.at;
      const width = Math.min(run.to - s, 1.3 + random(seed) * 1.5);
      const mid = s + width / 2, across = run.at + side * (EDGE + DEPTH / 2);
      const [x, z, w, d] = run.axis === "x" ? [mid, across, width, DEPTH] : [across, mid, DEPTH, width];
      const rect: Rect = [x - w / 2, z - d / 2, x + w / 2, z + d / 2];
      const atCrossing = crossings.some((c) => mid + width / 2 > c - clearance && mid - width / 2 < c + clearance);
      if (atCrossing || blocked.some((b) => overlaps(rect, b))) { s += 0.3; sinceGap = 0; continue; }
      const floors = run.style === "ganj" ? (random(seed + 3) < 0.22 ? 3 : 2) : 2 + Math.floor(random(seed + 3) * 2.6);
      out.push({ id: `terrace_${n}`, name: "", x, z, w, d, h: floors * 1.15 + (run.style === "ganj" ? 0.25 : 0), wall: 0, roof: 0, kind: "terrace",
        face: run.axis === "x" ? (side > 0 ? "n" : "s") : side > 0 ? "w" : "e", style: run.style, seed: n });
      s += width;
      // Every few buildings a gali, a lane just wide enough to walk through, breaks the wall.
      if (++sinceGap >= 4 + Math.floor(random(seed + 9) * 3)) { s += 0.7; sinceGap = 0; }
    }
  }
  // Behind the street fronts, the mohallas: rows of houses along narrow lanes, filling each block around the
  // places the game uses. Rows face south onto their lane; a gali cuts through every few houses.
  const taken = (rect: Rect) => {
    const gap = LANE - 0.06;
    return out.some((t) => overlaps(rect, [t.x - t.w / 2 - gap, t.z - t.d / 2 - gap, t.x + t.w / 2 + gap, t.z + t.d / 2 + gap]));
  };
  for (const [x0, z0, x1, z1] of BLOCKS) {
    // Rows are tried every 0.3 units, so they pack in around whatever is already standing.
    for (let z = z0 + DEPTH / 2; z + DEPTH / 2 <= z1; z += 0.3) {
      let x = x0, sinceGap = 0;
      while (x < x1 - 1.2) {
        const seed = ++n * 5.17 + z;
        const width = Math.min(x1 - x, 1.4 + random(seed) * 1.5);
        const rect: Rect = [x, z - DEPTH / 2, x + width, z + DEPTH / 2];
        if (blocked.some((b) => overlaps(rect, b)) || taken(rect)) { x += 0.3; sinceGap = 0; continue; }
        out.push({ id: `terrace_${n}`, name: "", x: x + width / 2, z, w: width, d: DEPTH, h: (2 + Math.floor(random(seed + 3) * 2.4)) * 1.15, wall: 0, roof: 0,
          kind: "terrace", face: "s", style: "mohalla", seed: n });
        x += width;
        if (++sinceGap >= 3 + Math.floor(random(seed + 9) * 3)) { x += LANE; sinceGap = 0; }
      }
    }
  }
  // What is left open to the road is walled: brick compound walls round the old city's plots, iron railings round
  // the park and along Hazratganj. A gateway is left wherever people need to get in, and every few metres besides.
  const solid = (rect: Rect) => [...existing, ...out].some((b) => overlaps(rect, [b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2]));
  const gateways = Object.values(arrivals);
  for (const run of RUNS) for (const side of [-1, 1] as const) {
    const crossings = run.axis === "x" ? CROSS.x : CROSS.z;
    const across = run.at + side * (EDGE + 0.12);
    let sinceGate = 0;
    for (let s = run.from; s < run.to - 1; s += PANEL) {
      const mid = s + PANEL / 2;
      const [x, z, w, d] = run.axis === "x" ? [mid, across, PANEL, 0.16] : [across, mid, 0.16, PANEL];
      // Skip junctions, the river, anything already built on this stretch, and the way in to every place.
      if (crossings.some((c) => Math.abs(mid - c) < EDGE + 0.4)) { sinceGate = 0; continue; }
      const strip: Rect = run.axis === "x" ? [s, Math.min(across, across + side * 1.2), s + PANEL, Math.max(across, across + side * 1.2)]
        : [Math.min(across, across + side * 1.2), s, Math.max(across, across + side * 1.2), s + PANEL];
      if (solid(strip) || overlaps(strip, [39.3, -5, 49.4, 45]) || overlaps(strip, [84.2, -5, 95, 45])) { sinceGate = 0; continue; }
      const along = (p: Point) => (run.axis === "x" ? p.x : p.z), away = (p: Point) => Math.abs((run.axis === "x" ? p.z : p.x) - run.at);
      if (gateways.some((p) => Math.abs(along(p) - mid) < 1.5 && away(p) < 9)) { sinceGate = 0; continue; }
      if (keepClear.some((p) => Math.abs(p.x - x) < 0.5 && Math.abs(p.z - z) < 0.5)) continue;
      if (++sinceGate > 4) { sinceGate = 0; continue; }
      const park = overlaps(strip, OPEN[1]);
      out.push({ id: `wall_${++n}`, name: "", x, z, w, d, h: park || run.style === "ganj" ? 0.62 : 0.95, wall: 0, roof: 0, kind: "terrace",
        face: run.axis === "x" ? (side > 0 ? "n" : "s") : side > 0 ? "w" : "e", style: park || run.style === "ganj" ? "railing" : "wall", seed: n });
    }
  }
  return out;
}
