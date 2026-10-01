import * as THREE from "three";
import { EAST } from "./district";

// Tokyo's overhead wires: concrete utility poles along the pavements, a crossarm with three power lines and a lower
// telecom cable, a pole-mounted transformer every few poles, and the wires sagging between them.

type Run = { axis: "x" | "z"; at: number; from: number; to: number; crossings: number[] };

const TOWN_ROADS = [13.5, 26.5];
const RUNS: Run[] = [
  ...TOWN_ROADS.map((at) => ({ axis: "x" as const, at, from: 0.5, to: 39.5, crossings: TOWN_ROADS })),
  ...TOWN_ROADS.map((at) => ({ axis: "z" as const, at, from: 0.5, to: 39.5, crossings: TOWN_ROADS })),
  ...EAST.roads.map((at) => ({ axis: "x" as const, at, from: EAST.x0 + 0.5, to: EAST.rail[0] - 1.5, crossings: [EAST.avenue] })),
  { axis: "z", at: EAST.avenue, from: 0.5, to: 39.5, crossings: EAST.roads },
];
// Units: one is about 2 m. Poles stand at the kerb side of the pavement.
const KERB = 2.25, SPACING = 4, HEIGHT = 5.1;

export function makeStreetscape(avoid: Array<{ x: number; z: number }>) {
  const root = new THREE.Group();
  const resources: Array<{ dispose(): void }> = [];
  const poles: THREE.Vector3[][] = [];
  for (const run of RUNS) {
    const line: THREE.Vector3[] = [];
    for (let s = run.from; s <= run.to; s += SPACING) {
      if (run.crossings.some((c) => Math.abs(s - c) < 3.2)) continue;
      const point = run.axis === "x" ? new THREE.Vector3(s, 0, run.at + KERB) : new THREE.Vector3(run.at + KERB, 0, s);
      if (avoid.some((a) => Math.hypot(a.x - point.x, a.z - point.z) < 0.7)) continue;
      line.push(point);
    }
    poles.push(line);
  }
  const all = poles.flat();
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb8b5ad, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.55, metalness: 0.6 });
  const shaft = new THREE.CylinderGeometry(0.055, 0.075, HEIGHT, 10).translate(0, HEIGHT / 2, 0);
  const arm = new THREE.BoxGeometry(0.95, 0.06, 0.06);
  const can = new THREE.CylinderGeometry(0.13, 0.13, 0.42, 12);
  const pole = new THREE.InstancedMesh(shaft, concrete, all.length);
  const arms = new THREE.InstancedMesh(arm, steel, all.length);
  const transformers = new THREE.InstancedMesh(can, steel, Math.ceil(all.length / 3));
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  let cans = 0, index = 0;
  poles.forEach((line, r) => {
    const across = RUNS[r].axis === "x" ? 0 : Math.PI / 2;
    line.forEach((p, i) => {
      pole.setMatrixAt(index, matrix.makeTranslation(p.x, 0, p.z));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), across + Math.PI / 2);
      arms.setMatrixAt(index, matrix.compose(new THREE.Vector3(p.x, HEIGHT - 0.25, p.z), q, one));
      if (i % 3 === 1) transformers.setMatrixAt(cans++, matrix.makeTranslation(p.x + (across ? 0.16 : 0), HEIGHT - 0.95, p.z + (across ? 0 : 0.16)));
      index++;
    });
  });
  transformers.count = cans;
  for (const mesh of [pole, arms, transformers]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  resources.push(pole, arms, transformers, shaft, arm, can, concrete, steel);

  // Wires: three power lines off the crossarm and a telecom cable lower down, each sagging between poles.
  const points: number[] = [];
  const sag = (a: THREE.Vector3, b: THREE.Vector3, y: number, offset: THREE.Vector3) => {
    const steps = 8;
    for (let k = 0; k < steps; k++) {
      for (const t of [k / steps, (k + 1) / steps]) {
        const p = a.clone().lerp(b, t).add(offset);
        points.push(p.x, y - Math.sin(Math.PI * t) * 0.18, p.z);
      }
    }
  };
  poles.forEach((line, r) => {
    const side = RUNS[r].axis === "x" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1];
      if (a.distanceTo(b) > SPACING * 1.6) continue;
      for (const o of [-0.42, 0, 0.42]) sag(a, b, HEIGHT - 0.22, side.clone().multiplyScalar(o));
      sag(a, b, HEIGHT - 1.4, new THREE.Vector3());
    }
  });
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const wireMaterial = new THREE.LineBasicMaterial({ color: 0x23272b, transparent: true, opacity: 0.85 });
  const wires = new THREE.LineSegments(wireGeometry, wireMaterial);
  wires.raycast = () => {};
  root.add(wires);
  resources.push(wireGeometry, wireMaterial);
  return { root, dispose: () => resources.forEach((r) => r.dispose()) };
}
