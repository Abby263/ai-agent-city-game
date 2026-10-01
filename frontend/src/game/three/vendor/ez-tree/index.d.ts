import * as THREE from "three";

/** Minimal types for the vendored EZ-Tree generator (see tree.js). */
export class Tree extends THREE.Group {
  constructor();
  options: TreeOptionsShape;
  branchesMesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  leavesMesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  loadFromJson(json: unknown): void;
  generate(): void;
}

export type TreeOptionsShape = {
  seed: number;
  bark: { type: string; tint: number; textured: boolean; textureScale: { x: number; y: number } };
  leaves: { type: string; count: number; size: number; sizeVariance: number; tint: number; alphaTest: number };
  branch: { levels: number; sections: Record<string, number>; segments: Record<string, number>; children: Record<string, number> };
};
