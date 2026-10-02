import * as THREE from "three";
import { Tree } from "./vendor/ez-tree";
import ashMedium from "./vendor/ez-tree/ash_medium.json";
import oakMedium from "./vendor/ez-tree/oak_medium.json";
import pineMedium from "./vendor/ez-tree/pine_medium.json";
import aspenSmall from "./vendor/ez-tree/aspen_small.json";
import { THEME } from "./theme";

const gulmohar = THEME.blossomTree === "gulmohar";

// Real trees: a handful of species grown once with EZ-Tree (bark, branching, leaf cards), then repeated across the
// town as instances, so a whole street of trees costs only a few draw calls.

export type TreeSpot = { x: number; z: number; scale: number; kind: TreeKind };
export type TreeKind = "keyaki" | "sakura" | "oak" | "pine";

type Species = { preset: object; height: number; leafTint: number; leaves?: Partial<{ count: number; size: number; type: string }>; seed: number };
// Heights in town units (one unit is about 2 m).
const SPECIES: Record<TreeKind, Species> = {
  // Zelkova (keyaki), the classic Tokyo street tree.
  keyaki: { preset: ashMedium, height: 4.6, leafTint: 0xd9efbd, leaves: { count: 9, size: 3.7 }, seed: 1301 },
  // Cherry along the river: the leaf cards become blossom (see blossom below).
  sakura: { preset: aspenSmall, height: 3.3, leafTint: 0xffffff, leaves: { count: 28, type: "aspen" }, seed: 2203 },
  oak: { preset: oakMedium, height: 4.2, leafTint: 0xcfe3b0, leaves: { count: 11, size: 3.2 }, seed: 4409 },
  pine: { preset: pineMedium, height: 4.4, leafTint: 0xbfd6a6, seed: 5507 },
};

type Grown = { branches: THREE.BufferGeometry; leaves: THREE.BufferGeometry; bark: THREE.Material; foliage: THREE.Material };

/** Grows one specimen and turns its materials into physically based ones that match the town. */
function grow(kind: TreeKind): Grown {
  const species = SPECIES[kind];
  const tree = new Tree();
  const json = JSON.parse(JSON.stringify(species.preset));
  json.seed = species.seed;
  json.bark.type = "oak";
  json.leaves = { ...json.leaves, ...species.leaves, tint: species.leafTint };
  // Fewer sides and rings per branch: invisible from street distance, and a third of the triangles.
  for (const key of ["sections", "segments"] as const)
    for (const level of Object.keys(json.branch[key])) json.branch[key][level] = Math.max(3, Math.round(json.branch[key][level] * 0.6));
  tree.loadFromJson(json);
  // Leaf geometry uses 16-bit indices: thin the foliage until it fits.
  while (tree.leavesMesh.geometry.attributes.position.count > 64000 && json.leaves.count > 2) {
    json.leaves.count = Math.floor(json.leaves.count * 0.75);
    tree.loadFromJson(json);
  }
  tree.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(tree);
  const scale = species.height / Math.max(0.1, box.max.y - box.min.y);
  const fit = (geometry: THREE.BufferGeometry) => geometry.scale(scale, scale, scale).translate(0, -box.min.y * scale, 0);
  const oldBark = tree.branchesMesh.material as THREE.MeshPhongMaterial, oldLeaves = tree.leavesMesh.material as THREE.MeshPhongMaterial;
  const bark = new THREE.MeshStandardMaterial({ map: oldBark.map, normalMap: oldBark.normalMap, roughnessMap: (oldBark as unknown as { roughnessMap?: THREE.Texture }).roughnessMap ?? null,
    aoMap: oldBark.aoMap, color: oldBark.color, roughness: 1 });
  const foliage = new THREE.MeshStandardMaterial({ map: oldLeaves.map, color: oldLeaves.color, side: THREE.DoubleSide,
    alphaTest: 0.5, roughness: 0.85 });
  oldBark.dispose();
  oldLeaves.dispose();
  if (kind === "sakura") blossom(foliage, `/art/trees/leaves/${species.leaves?.type ?? "aspen"}.png`);
  return { branches: fit(tree.branchesMesh.geometry), leaves: fit(tree.leavesMesh.geometry), bark, foliage };
}

/** Recolours leaf cards into cherry blossom: pale pink petals, deeper pink in the shade, same cut-out shapes. */
function blossom(material: THREE.MeshStandardMaterial, url: string) {
  new THREE.ImageLoader().load(url, (image) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      const light = Math.min(1, lum * 1.5 + 0.2);
      // Cherry blossom is pale pink; gulmohar is flame red shading to orange.
      data[i] = gulmohar ? 205 + 50 * light : 214 + 41 * light;
      data[i + 1] = gulmohar ? 50 + 95 * light : 150 + 85 * light;
      data[i + 2] = gulmohar ? 22 + 40 * light : 175 + 70 * light;
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map?.dispose();
    material.map = texture;
    material.needsUpdate = true;
  });
}

const random = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** Places every tree: two instanced meshes (trunk and branches, leaves) per species. */
export function makeForest(spots: TreeSpot[]) {
  const root = new THREE.Group();
  const resources: Array<{ dispose(): void }> = [];
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), position = new THREE.Vector3(), size = new THREE.Vector3();
  for (const kind of Object.keys(SPECIES) as TreeKind[]) {
    const here = spots.filter((s) => s.kind === kind);
    if (!here.length) continue;
    const grown = grow(kind);
    const branches = new THREE.InstancedMesh(grown.branches, grown.bark, here.length);
    const leaves = new THREE.InstancedMesh(grown.leaves, grown.foliage, here.length);
    here.forEach((spot, i) => {
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random(spot.x * 13 + spot.z) * Math.PI * 2);
      size.setScalar(spot.scale);
      matrix.compose(position.set(spot.x, 0, spot.z), rotation, size);
      branches.setMatrixAt(i, matrix);
      leaves.setMatrixAt(i, matrix);
    });
    for (const mesh of [branches, leaves]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      root.add(mesh);
      resources.push(mesh, mesh.geometry, mesh.material as THREE.Material);
    }
  }
  return { root, dispose: () => resources.forEach((r) => r.dispose()) };
}
