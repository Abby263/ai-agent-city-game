// Lucknow's own street map. Nakameguro keeps its tidy grid; the old city of Lucknow (Chowk, west of the Gomti) is
// drawn here instead: a bazaar road that bends its way from the bridge to the Akbari Gate, a second road through
// Nakhas, two cross streets that never run straight, a gali too narrow for anything but feet, and a chauraha where
// the main roads meet round a railed island. Across the river, Hazratganj keeps its broad, straight colonial roads.
//
// A street is a centre-line that wanders: `pts` are [distance along, position across] pairs, joined by straight
// stretches. Everything that has to know where the road is (the ground painting, the terraces, the poles and
// wires, the traffic, the street vendors) asks this file.

export type Street = {
  id: string;
  /** "x": runs east-west, so `pts` are [x, z]; "z": runs north-south, so `pts` are [z, x]. */
  axis: "x" | "z";
  pts: Array<[number, number]>;
  /** Half the width between the building lines. */
  half: number;
  kind: "road" | "gali";
  style: "chowk" | "ganj";
};

export const CHOWK: Street[] = [
  { id: "chowk", axis: "x", half: 1.5, kind: "road", style: "chowk",
    pts: [[0.6, 13.3], [6, 13.2], [10, 13.7], [13.2, 14.1], [17, 13.9], [21, 13.2], [24, 13.4], [26.5, 13.5], [29, 13.7], [33, 14.4], [36.5, 13.9], [39.3, 13.5]] },
  { id: "nakhas", axis: "x", half: 1.2, kind: "road", style: "chowk",
    pts: [[0.6, 27.1], [5, 26.4], [9, 26], [13.5, 26.6], [17, 26.4], [20.5, 26.1], [24, 26.3], [26.5, 26.5], [29.5, 26.6], [33, 26.6], [36.5, 26.2], [39.3, 26.5]] },
  { id: "phool_gali", axis: "z", half: 0.6, kind: "gali", style: "chowk", pts: [[0.6, 12.9], [4, 13.6], [8, 14], [12.6, 13.4]] },
  { id: "sarai", axis: "z", half: 1.2, kind: "road", style: "chowk",
    pts: [[14.4, 13.2], [18, 12.8], [21.5, 12.7], [24.5, 12.9], [27, 13.5], [30, 14], [34, 14.2], [39.4, 13.4]] },
  { id: "victoria", axis: "z", half: 1.2, kind: "road", style: "chowk",
    pts: [[0.6, 27.1], [4, 26], [8, 25.8], [11, 26.3], [13.5, 26.5], [16.5, 26.9], [20, 27.3], [23.5, 26.9], [26.5, 26.5], [30, 26.1], [34, 26.2], [39.4, 27]] },
];

/** Hazratganj: `half` here reaches the building line, past the pavement. */
export const GANJ: Street[] = [
  { id: "ganj_north", axis: "x", half: 2.5, kind: "road", style: "ganj", pts: [[49.6, 13.5], [84, 13.5]] },
  { id: "ganj_south", axis: "x", half: 2.5, kind: "road", style: "ganj", pts: [[49.6, 26.5], [84, 26.5]] },
  { id: "ganj_avenue", axis: "z", half: 2.5, kind: "road", style: "ganj", pts: [[0.6, 69], [39.4, 69]] },
];

export const STREETS = [...CHOWK, ...GANJ];

/** Where the bazaar road meets Victoria Street: traffic goes round a railed island. */
export const CHAURAHA = { x: 26.5, z: 13.5, radius: 3, island: 1 };
/** The Akbari Gate stands across the bazaar road at its western end. */
export const GATE_X = 9.4;

export const span = (street: Street) => [street.pts[0][0], street.pts[street.pts.length - 1][0]] as const;

/** Where the street's centre-line is, `s` along it. */
export function at(street: Street, s: number) {
  const pts = street.pts;
  if (s <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (s <= pts[i][0]) {
    const [s0, a0] = pts[i - 1], [s1, a1] = pts[i];
    return a0 + ((a1 - a0) * (s - s0)) / (s1 - s0);
  }
  return pts[pts.length - 1][1];
}

/** The furthest the centre-line swings to one side (`side` 1 or -1) between `from` and `to`. */
export function reach(street: Street, from: number, to: number, side: number) {
  const values = [at(street, from), at(street, to), ...street.pts.filter(([s]) => s > from && s < to).map(([, a]) => a)];
  return side > 0 ? Math.max(...values) : Math.min(...values);
}

export const GATE = { x: GATE_X, z: at(CHOWK[0], GATE_X) };

/** A point on the street as world x, z. */
export const point = (street: Street, s: number, across = 0) =>
  street.axis === "x" ? { x: s, z: at(street, s) + across } : { x: at(street, s) + across, z: s };

type Segment = { ax: number; az: number; bx: number; bz: number; half: number };
const segments = (streets: Street[]): Segment[] => streets.flatMap((street) => street.pts.slice(1).map((p, i) => {
  const a = point(street, street.pts[i][0]), b = point(street, p[0]);
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z, half: street.half };
}));
const SEGMENTS = segments(STREETS);

function pointToSegment(x: number, z: number, s: Segment) {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
}
const pointToRect = (x: number, z: number, x0: number, z0: number, x1: number, z1: number) =>
  Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));

/** Does the segment pass through the rectangle? (Liang-Barsky clipping.) */
function crosses(s: Segment, x0: number, z0: number, x1: number, z1: number) {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, s.ax - x0], [dx, x1 - s.ax], [-dz, s.az - z0], [dz, z1 - s.az]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * How far a point is from the nearest road surface: negative inside a road, by how deep. The chauraha counts.
 */
export function roadClearance(x: number, z: number) {
  let best = Math.hypot(x - CHAURAHA.x, z - CHAURAHA.z) - CHAURAHA.radius;
  for (const s of SEGMENTS) best = Math.min(best, pointToSegment(x, z, s) - s.half);
  return best;
}

/**
 * True if a rectangle stands in a road. `tolerance` (0 to 1) is how much of the road's half-width counts: a little
 * under 1, because a building on a bend is square to the map, not to the road, and its corner just overhangs.
 */
export function inRoad(x0: number, z0: number, x1: number, z1: number, tolerance = 0.9) {
  if (pointToRect(CHAURAHA.x, CHAURAHA.z, x0, z0, x1, z1) < CHAURAHA.radius * tolerance) return true;
  for (const s of SEGMENTS) {
    if (crosses(s, x0, z0, x1, z1)) return true;
    const reachOf = s.half * tolerance;
    if (pointToRect(s.ax, s.az, x0, z0, x1, z1) < reachOf || pointToRect(s.bx, s.bz, x0, z0, x1, z1) < reachOf) return true;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (pointToSegment(x, z, s) < reachOf) return true;
  }
  return false;
}
