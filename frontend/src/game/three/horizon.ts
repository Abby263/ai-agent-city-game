import * as THREE from "three";
import type { Art } from "./materials";

// Nakameguro is a neighbourhood inside a huge city, not an island: the ground runs to the horizon, low-rise
// streets and trees surround the town, a skyline stands in the haze and Mt Fuji rises in the west, where the sun sets.
// Everything is instanced (a handful of draw calls). Buildings get procedural windows that light up at night and
// their own distance haze, so far silhouettes stay readable instead of vanishing into the town's fog.

/** Centre of the playable town, in world units. */
export const TOWN_CENTER = new THREE.Vector3(42, 0, 21);
const TOWN = { minX: -8, maxX: 92, minZ: -8, maxZ: 50 };

const random = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

type Uniforms = { uNight: { value: number }; uHorizon: { value: THREE.Color }; uHaze: { value: number } };

/** Toon material for distant buildings: windows by world position, lit at night, faded by distance into the horizon. */
function distantMaterial(art: Art, uniforms: Uniforms, windows: boolean) {
  const material = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: art.ramp, fog: false });
  // three.js shares compiled programs by onBeforeCompile's source text; the window variant needs its own.
  material.customProgramCacheKey = () => `agentcity-distant-${windows ? "windows" : "plain"}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        mat4 placed = modelMatrix;
        #ifdef USE_INSTANCING
          placed = modelMatrix * instanceMatrix;
        #endif
        vWorldPos = (placed * vec4(transformed, 1.)).xyz;
        vWorldNormal = normalize(mat3(placed) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uNight; uniform vec3 uHorizon; uniform float uHaze;
        varying vec3 vWorldPos; varying vec3 vWorldNormal;
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        // Distant walls sit in shadow at night so their lit windows stand out.
        diffuseColor.rgb *= 1. - uNight * .6;
        float windowMask = 0.;
        vec3 windowLight = vec3(0.);
        ${windows ? `if (abs(vWorldNormal.y) < .5) {
          vec2 facade = abs(vWorldNormal.x) > .5 ? vWorldPos.zy : vWorldPos.xy;
          // Big enough to read as rows of lights from far away.
          vec2 grid = facade / vec2(2.6, 2.4);
          vec2 cell = floor(grid), f = fract(grid);
          windowMask = step(.2, f.x) * step(f.x, .8) * step(.25, f.y) * step(f.y, .8) * step(1.2, vWorldPos.y);
          float building = hash2(floor(vWorldPos.xz * .23));
          // A third to a half of the windows are lit, varying building to building.
          float lit = step(.52 + building * .2, hash2(cell + building * 71.));
          vec3 tone = mix(vec3(1., .74, .42), vec3(.72, .84, 1.), step(.78, hash2(cell * 1.7 + 3.)));
          windowLight = tone * windowMask * lit;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * .5 + vec3(.04, .07, .11), windowMask * .7);
        }` : ""}`)
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>
        // Haze grows with distance; lit windows shine through it at night.
        float haze = clamp((length(vWorldPos - cameraPosition) - 80.) / 640., 0., 1.) * uHaze;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHorizon, haze);
        gl_FragColor.rgb += windowLight * uNight * 1.35 * (1. - haze * .45);`);
  };
  return material;
}

/** The Meguro River runs north-south through town (x 41.5-48.5) and on to the horizon both ways. */
const RIVER_X = 45;

function inTown(x: number, z: number, margin = 0) {
  return (x > TOWN.minX - margin && x < TOWN.maxX + margin && z > TOWN.minZ - margin && z < TOWN.maxZ + margin)
    || Math.abs(x - RIVER_X) < 9;
}

export function makeHorizon(art: Art) {
  const root = new THREE.Group();
  const uniforms: Uniforms = { uNight: { value: 0 }, uHorizon: { value: new THREE.Color(0xcfe4ef) }, uHaze: { value: 0.85 } };
  const matrix = new THREE.Matrix4(), color = new THREE.Color();
  const disposables: Array<{ dispose(): void }> = [];

  // Ground to the horizon, just under the town's own ground.
  const groundMaterial = distantMaterial(art, uniforms, false);
  groundMaterial.color.set(0x86a577);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 48), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(TOWN_CENTER.x, -0.06, TOWN_CENTER.z);
  ground.receiveShadow = false;
  root.add(ground);
  disposables.push(ground.geometry, groundMaterial);

  // The river and its embankments continue out of town in both directions.
  const waterMaterial = distantMaterial(art, uniforms, false);
  waterMaterial.color.set(0x5ea8b4);
  const bankMaterial = distantMaterial(art, uniforms, false);
  bankMaterial.color.set(0xb1bca9);
  const reach = 700;
  for (const [from, sign] of [[-17, -1], [55, 1]] as const) {
    const center = from + (sign * reach) / 2;
    const water = new THREE.Mesh(new THREE.BoxGeometry(7, 0.16, reach), waterMaterial);
    water.position.set(RIVER_X, -0.12, center);
    root.add(water);
    disposables.push(water.geometry);
    for (const x of [41.5, 48.5]) {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, reach), bankMaterial);
      bank.position.set(x, 0.2, center);
      root.add(bank);
      disposables.push(bank.geometry);
    }
  }
  disposables.push(waterMaterial, bankMaterial);

  // Place things in rings around the town, skipping the town itself.
  const around = (count: number, inner: number, outer: number, seed: number, place: (x: number, z: number, i: number) => boolean) => {
    let placed = 0;
    for (let i = 0; placed < count && i < count * 6; i++) {
      const angle = random(seed + i) * Math.PI * 2;
      const distance = inner + Math.sqrt(random(seed + i * 3 + 1)) * (outer - inner);
      const x = TOWN_CENTER.x + Math.cos(angle) * distance, z = TOWN_CENTER.z + Math.sin(angle) * distance * 0.8;
      if (inTown(x, z, 6)) continue;
      if (place(x, z, i)) placed++;
    }
    return placed;
  };

  // Tree clumps close to the town soften its edge.
  const treeGeometry = new THREE.IcosahedronGeometry(1, 0);
  const treeMaterial = distantMaterial(art, uniforms, false);
  const trees = new THREE.InstancedMesh(treeGeometry, treeMaterial, 260);
  let t = 0;
  around(260, 52, 120, 11, (x, z, i) => {
    const s = 1.1 + random(i + 7) * 1.4;
    matrix.compose(new THREE.Vector3(x, s * 0.75, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random(i) * 6, 0)), new THREE.Vector3(s, s * 0.9, s));
    trees.setMatrixAt(t, matrix);
    trees.setColorAt(t, color.setHSL(0.26 + random(i + 3) * 0.07, 0.34, 0.27 + random(i + 5) * 0.09));
    t++;
    return true;
  });
  trees.count = t;
  root.add(trees);
  disposables.push(treeGeometry, treeMaterial, trees);

  // Low-rise streets, then the tall skyline further out; both share one box and the window material.
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const cityMaterial = distantMaterial(art, uniforms, true);
  // Low-rise streets in warm plaster and tile; the far skyline in the cool greys of distance.
  const streetPalette = [0xd8cfc2, 0xc9bfb1, 0xbcb3a6, 0xe0d7ca, 0xaab2b8, 0xc7b8a5, 0x9ea8b0];
  const skylinePalette = [0x93a4b8, 0xa7b5c4, 0x8797ab, 0xb3bfcb, 0x7f8fa3, 0x9eabb9];
  const makeBlocks = (count: number, inner: number, outer: number, seed: number, size: [number, number], height: [number, number], palette: number[]) => {
    const blocks = new THREE.InstancedMesh(box, cityMaterial, count);
    let n = 0;
    around(count, inner, outer, seed, (x, z, i) => {
      const w = size[0] + random(seed + i * 5) * (size[1] - size[0]), d = size[0] + random(seed + i * 7) * (size[1] - size[0]);
      const h = height[0] + Math.pow(random(seed + i * 11), 2.2) * (height[1] - height[0]);
      matrix.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.round(random(i + seed) * 3) * (Math.PI / 12), 0)), new THREE.Vector3(w, h, d));
      blocks.setMatrixAt(n, matrix);
      blocks.setColorAt(n, color.set(palette[Math.floor(random(seed + i * 13) * palette.length)]));
      n++;
      return true;
    });
    blocks.count = n;
    root.add(blocks);
    disposables.push(blocks);
    return blocks;
  };
  makeBlocks(340, 68, 200, 101, [4, 9], [3, 12], streetPalette);
  makeBlocks(190, 250, 540, 303, [10, 22], [18, 62], skylinePalette);
  disposables.push(box, cityMaterial);

  // Mt Fuji, far to the west-southwest, with a snow cap.
  const fujiMaterial = new THREE.MeshBasicMaterial({ color: 0x8ea3bb, fog: false });
  const capMaterial = new THREE.MeshBasicMaterial({ color: 0xf2f5f8, fog: false });
  const fuji = new THREE.Group();
  // A small, far cone on the horizon, as it looks from Tokyo on a clear day.
  const cone = new THREE.Mesh(new THREE.ConeGeometry(150, 72, 40, 1, true), fujiMaterial);
  cone.position.y = 36;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(42, 20, 40), capMaterial);
  cap.position.y = 62;
  fuji.add(cone, cap);
  fuji.position.set(TOWN_CENTER.x - 900, -6, TOWN_CENTER.z + 320);
  root.add(fuji);
  disposables.push(cone.geometry, cap.geometry, fujiMaterial, capMaterial);
  const fujiBase = new THREE.Color(0x8ea3bb), capBase = new THREE.Color(0xf2f5f8), nightTint = new THREE.Color(0x141c33);

  /** Follows the sky: the horizon colour everything fades into, and how dark it is. */
  function update(horizon: THREE.Color, night: number, gloom: number) {
    uniforms.uHorizon.value.copy(horizon);
    uniforms.uNight.value = night;
    uniforms.uHaze.value = 0.72 + gloom * 0.25;
    // Fuji is a pale silhouette by day, gone into the haze on grey days, a dark shape at night.
    fujiMaterial.color.copy(fujiBase).lerp(nightTint, night * 0.85).lerp(horizon, 0.45 + gloom * 0.5);
    capMaterial.color.copy(capBase).lerp(nightTint, night * 0.7).lerp(horizon, 0.3 + gloom * 0.6);
  }
  return { root, update, dispose: () => disposables.forEach((d) => d.dispose()) };
}
