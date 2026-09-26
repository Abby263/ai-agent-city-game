import * as THREE from "three";
import { walkablePoint, type Point } from "./layout";

export function conversationStaging(origin: Point, town: THREE.Object3D) {
  let best: { center: Point; points: Point[] } | undefined;
  let height = Infinity;
  // A cramped doorway is walkable but not a readable two-shot. Step into a
  // nearby open area before falling back to a high camera above the roofs.
  for (const [x, z] of [[0, 0], [-4, 0], [4, 0], [0, 4], [0, -4], [-6, 0], [6, 0], [0, 6]]) {
    const center = walkablePoint({ x: origin.x + x, z: origin.z + z + 1.5 });
    // About a metre and a half apart: close enough to feel like a conversation, far enough to read both faces.
    const points = [-1, 1].map((side) => walkablePoint({ x: center.x + side * 0.75, z: center.z }));
    if (Math.hypot(points[0].x - points[1].x, points[0].z - points[1].z) < 1.2) continue;
    const target = new THREE.Vector3(center.x, -0.25, center.z);
    const offset = conversationCameraOffset(target, points.map((p) => new THREE.Vector3(p.x, 1.35, p.z)), town, 7.5, true);
    if (offset.y < height) { best = { center, points }; height = offset.y; }
    if (height <= 6) break;
  }
  return best ?? { center: origin, points: [-1, 1].map((side) => walkablePoint({ x: origin.x + side, z: origin.z })) };
}

export function conversationCameraOffset(target: THREE.Vector3, heads: THREE.Vector3[], town: THREE.Object3D, distance: number, cinematic = false) {
  town.updateMatrixWorld(true);
  let best = new THREE.Vector3(0, 10, distance);
  let bestScore = Infinity;
  // Test sight lines to both residents. Prefer eye-level scenery; raise the camera
  // only if every lower angle is obstructed by a roof, stall, or tree.
  for (const height of cinematic ? [3.8, 6, 10, 16, 23] : [10, 16, 23]) {
    for (const angle of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4, Math.PI * 0.75, -Math.PI * 0.75]) {
      const offset = new THREE.Vector3(Math.sin(angle) * distance, height, Math.cos(angle) * distance);
      const position = target.clone().add(offset);
      let blocked = 0;
      for (const head of heads) {
        for (const drop of [0, 0.65, 1.05]) {
          const point = head.clone().add(new THREE.Vector3(0, -drop, 0));
          const direction = point.sub(position);
          const ray = new THREE.Raycaster(position, direction.clone().normalize(), 0, direction.length() - 0.15);
          if (ray.intersectObject(town, true).length) blocked++;
        }
      }
      const right = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
      const crowded = heads.some((head, i) => heads.slice(i + 1).some((other) => Math.abs(head.clone().sub(other).dot(right)) < 1));
      const score = blocked * 10 + Number(crowded) * 5;
      if (score < bestScore) { bestScore = score; best = offset; }
      if (!score) return offset;
    }
  }
  return best;
}
