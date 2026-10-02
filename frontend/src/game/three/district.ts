import * as THREE from "three";
import { Art } from "./materials";
import { GROUND_KINDS, paintedGround } from "./surfaces";
import { clockTower, rumiDarwaza } from "./landmarks";
import { THEME, isLucknow } from "./theme";

const INK = 0x465c68;
export const EAST = { x0: 49, x1: 91, depth: 40, avenue: 69, roads: [13.5, 26.5], rail: [85.8, 87.4], deck: 2.6 };

type Helpers = {
  tree: (x: number, z: number, blossom: boolean, scale: number) => void;
  bench: (x: number, z: number) => void;
  flowerBed: (x: number, z: number) => void;
};

/** Downtown (eki-mae) east of the river: roads, rail line, station platform, shrine and street life. */
export function makeDistrict(root: THREE.Group, art: Art, helpers: Helpers) {
  const width = EAST.x1 - EAST.x0;
  const cx = (EAST.x0 + EAST.x1) / 2;
  art.box(root, cx, -0.38, 20, width + 1, 0.7, 43, 0x80a776);
  art.box(root, cx, -0.82, 20, width + 1.2, 0.22, 43.2, 0x638b74);

  // One painted ground texture keeps roads, crossings and the plaza crisp without z-fighting.
  const { canvas, maskCanvas, ctx } = paintedGround(2048, Math.round((2048 * EAST.depth) / width), GROUND_KINDS);
  const u = canvas.width / width;
  const X = (x: number) => (x - EAST.x0) * u;
  ctx.fillStyle = "#9cbd8b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ddd7c8"; // station plaza and shopping street paving
  ctx.fillRect(X(72), 15.8 * u, 12.5 * u, 8.6 * u);
  ctx.fillRect(X(52), 16 * u, 14 * u, 8.2 * u);
  ctx.fillRect(X(52), 28.8 * u, 16 * u, 9 * u);
  for (const z of EAST.roads) {
    ctx.fillStyle = "#e1ddcf";
    ctx.fillRect(0, (z - 2.5) * u, canvas.width, 5 * u);
    ctx.fillStyle = "#7b858d";
    ctx.fillRect(0, (z - 1.5) * u, canvas.width, 3 * u);
    ctx.fillStyle = "#eadfc0";
    for (let x = EAST.x0; x < EAST.rail[0] - 1; x += 1.8) ctx.fillRect(X(x), (z - 0.035) * u, 0.75 * u, 0.07 * u);
  }
  ctx.fillStyle = "#e1ddcf";
  ctx.fillRect(X(EAST.avenue - 2.5), 0, 5 * u, canvas.height);
  ctx.fillStyle = "#7b858d";
  ctx.fillRect(X(EAST.avenue - 1.5), 0, 3 * u, canvas.height);
  ctx.fillStyle = "#f7efda";
  for (const z of EAST.roads)
    for (let i = 0; i < 7; i++)
      for (const side of [-1, 1]) {
        ctx.fillRect(X(EAST.avenue - 1.2 + i * 0.38), (z + side * 2.05 - 0.38) * u, 0.2 * u, 0.76 * u);
        ctx.fillRect(X(EAST.avenue + side * 2.05 - 0.38), (z - 1.2 + i * 0.38) * u, 0.76 * u, 0.2 * u);
      }
  ctx.fillStyle = "#b9b4a8"; // shaded pavement under the viaduct
  for (let z = 0; z < EAST.depth; z += 1) if (!EAST.roads.some((road) => Math.abs(road - z - 0.5) < 2.5)) ctx.fillRect(X(EAST.rail[0] - 1.4), z * u, 4.4 * u, 1 * u);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  art.textures.push(texture);
  const material = art.ground(texture, maskCanvas, "ground-east");
  const ground = new THREE.Mesh(art.geometry(new THREE.PlaneGeometry(width, EAST.depth)), material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, 0.006, 20);
  ground.receiveShadow = true;
  root.add(ground);

  // The Tōyoko line runs on a concrete viaduct, as at the real Nakameguro Station; streets pass beneath.
  const deck = EAST.deck;
  const railX = (EAST.rail[0] + EAST.rail[1]) / 2;
  art.box(root, railX, deck - 0.2, 20, 4.2, 0.4, 46, 0xb9b4aa);
  for (const side of [-2.05, 2.05]) art.box(root, railX + side, deck + 0.25, 20, 0.12, 0.5, 46, 0xa8a399);
  for (let z = -2; z <= 42; z += 4) {
    if (EAST.roads.some((road) => Math.abs(road - z) < 2.6)) continue;
    for (const side of [-1.3, 1.3]) art.box(root, railX + side, (deck - 0.4) / 2, z, 0.5, deck - 0.4, 0.5, 0xc4bfb5);
  }
  for (const x of EAST.rail) {
    for (const side of [-0.38, 0.38]) art.box(root, x + side, deck + 0.08, 20, 0.07, 0.08, 46, 0x8b8f93);
    for (let z = -2.5; z < 42.5; z += 0.9) art.box(root, x, deck + 0.03, z, 1.05, 0.05, 0.22, 0x6f5d4e);
  }
  // The line leaves town through tunnels in the hills at both ends.
  for (const [z, face] of [[-15, 1], [55, -1]] as const) {
    art.box(root, railX, 3.4, z, 9, 7.4, 24, 0x6f9a74);
    art.box(root, railX, 5.6, z - face * 2, 7, 2.4, 18, 0x7fa97f);
    art.box(root, railX, deck + 1.35, z + face * 12.02, 4.2, 2.7, 0.3, 0xa39e92);
    art.box(root, railX, deck + 1.1, z + face * 12.1, 3.4, 2.2, 0.1, 0x1f2326);
  }

  // Elevated platform and canopy above the station building, and the town clock on the plaza.
  art.box(root, 83.4, deck + 0.35, 20, 2.2, 0.7, 12, 0xcfc8b8);
  art.box(root, 84.45, deck + 0.72, 20, 0.12, 0.04, 12, 0xf2d24b);
  for (const z of [15, 18.3, 21.7, 25]) {
    art.cylinder(root, 83.2, deck + 1.55, z, 0.07, 1.7, INK);
    art.box(root, 83.4, (deck + 0.1) / 2, z, 0.45, deck, 0.45, 0xc4bfb5);
  }
  art.box(root, 83.4, deck + 2.45, 20, 2.6, 0.12, 12.4, 0x4f6d5a);
  art.sign(root, THEME.stationSign, 83.4, deck + 2.05, 14.2, 2.2, 0.36, isLucknow ? "#7a2418" : "#4f6d5a", "#fff9e6");
  for (const z of [16.5, 23.5]) {
    art.box(root, 83.1, deck + 0.95, z, 0.4, 0.08, 1.3, 0xb39573);
    art.box(root, 82.95, deck + 1.18, z, 0.06, 0.34, 1.3, 0xb39573);
  }
  if (isLucknow) {
    // The Husainabad clock tower on the station square, and the Rumi Darwaza as the way in to the Imambara.
    clockTower(art, root, 73.4, 25);
    rumiDarwaza(art, root, 57, 30.3);
    for (let z = 31; z < 33; z += 0.55) art.box(root, 57, 0.03, z, 1.4, 0.05, 0.4, 0xcac4b5);
  } else {
  art.cylinder(root, 74, 1.4, 24.4, 0.06, 2.8, INK);
    const clock = art.cylinder(root, 74, 2.9, 24.4, 0.34, 0.08, 0xf9f0d9, 0.34, 24);
    clock.rotation.x = Math.PI / 2;
  
    // Hikawa Shrine: vermilion torii, stone path and lanterns.
    const TORII = 0xc9553d;
    for (const side of [-1, 1]) art.cylinder(root, 57 + side * 1.1, 1.35, 30.4, 0.12, 2.7, TORII, 0.1);
    art.box(root, 57, 2.75, 30.4, 3.1, 0.18, 0.3, 0x2f2d31);
    art.box(root, 57, 2.52, 30.4, 2.8, 0.14, 0.24, TORII);
    art.box(root, 57, 2.2, 30.4, 2.5, 0.12, 0.18, TORII);
    for (let z = 30.8; z < 33; z += 0.55) art.box(root, 57, 0.03, z, 0.9, 0.05, 0.4, 0xcac4b5);
    for (const side of [-1, 1]) {
      art.box(root, 57 + side * 1.6, 0.35, 32.2, 0.35, 0.7, 0.35, 0xb9b3a6);
      art.box(root, 57 + side * 1.6, 0.85, 32.2, 0.5, 0.3, 0.5, 0xd8d1c1);
      art.box(root, 57 + side * 1.6, 1.07, 32.2, 0.62, 0.12, 0.62, 0x8e887d);
    }
  
    // Japanese street life: vending machines, a bus shelter by the mall and a taxi rank sign.
    for (const [x, z, color] of [[61.9, 23.8, 0xd8473c], [62.5, 23.8, 0x3f7fc2], [66.2, 33, 0xd8473c], [73, 16.3, 0xf2f2ee], [53.4, 8.4, 0x3f7fc2]] as const) {
      art.box(root, x, 0.62, z, 0.5, 1.24, 0.42, color);
      art.box(root, x, 0.82, z + 0.215, 0.38, 0.5, 0.02, 0xcfe3ea);
      art.box(root, x, 0.3, z + 0.215, 0.32, 0.12, 0.02, INK);
    }
  }
  art.box(root, 60, 1.6, 11.4, 1.5, 0.16, 1.4, 0x648e8b);
  for (const x of [59.4, 60.6]) art.box(root, x, 0.8, 11, 0.07, 1.6, 0.07, INK);
  helpers.bench(60, 11.3);
  art.sign(root, THEME.busSign, 59.4, 1.65, 12.24, 0.55, 0.28, "#567c88", "#fff9e6");

  for (const [x, z] of [[51, 11], [52, 24.8], [66.5, 16.8], [71.8, 10.8], [80, 10.8], [51.2, 29], [60.8, 37.6], [71.8, 37.5], [80.5, 37.6], [90, 5], [90, 32], [66, 2]])
    helpers.tree(x, z, (x * 7 + z) % 3 < 1, 0.8 + ((x + z) % 5) * 0.06);
  for (const [x, z] of [[55, 37.8], [59, 37.8], [53.5, 33]]) helpers.tree(x, z, false, 0.95);
  for (const [x, z] of [[52.5, 22.8], [64.5, 22.8], [73.5, 34.8]]) helpers.flowerBed(x, z);

  const lampHeads: THREE.Vector3[] = [];
  for (const x of [52, 60, 66.2, 71.8, 80])
    for (const z of [10.8, 16.2, 23.8, 29.2]) {
      if ((x === 80 && z === 16.2) || (x === 60 && z === 10.8)) continue;
      art.cylinder(root, x, 1.4, z, 0.055, 2.8, INK);
      art.box(root, x + 0.23, 2.77, z, 0.55, 0.08, 0.08, INK);
      art.box(root, x + 0.45, 2.68, z, 0.28, 0.17, 0.23, 0xffe6a1);
      art.box(root, x + 0.45, 2.81, z, 0.37, 0.08, 0.32, INK);
      lampHeads.push(new THREE.Vector3(x + 0.45, 2.68, z));
    }
  return { lampHeads };
}
