import * as THREE from "three";
import { Art } from "./materials";
import { LANES, buildings, insideFootprint, type Building } from "./layout";
import { makeDistrict } from "./district";
import { makeLanterns } from "./seasons";
import { GROUND_KINDS, paintedGround } from "./surfaces";
import { makeArchitecture, tagArchitecture } from "./architecture";
import { makeForest, type TreeSpot } from "./trees";
import { makeStreetscape } from "./streetscape";
import { autoRickshaw, chaiStall, cow, cycleRickshaw, handcart, heap, hoarding, postBox, scooter, vendingMachine, vendor } from "./props";
import { akbariGate, charbagh, chaurahaIsland, imambara, tagLandmarks } from "./landmarks";
import { THEME, isLucknow } from "./theme";
import { CHAURAHA, CHOWK, GATE, type Street, point, roadClearance, span } from "./streets";

/** Labels the palette with real materials before anything is built. */
function tagSurfaces(art: Art) {
  tagArchitecture(art);
  tagLandmarks(art);
  art.tag("grass", P.grass, 0x80a776, 0x638b74, 0x91b69b);
  art.tag("paving", P.path, P.curb);
  art.tag("asphalt", P.road);
  art.tag("wood", P.wood);
  art.tag("glass", 0x709ba6, 0x789eaa);
  art.tag("water", 0x63b8bd);
  art.tag("metal", P.ink);
  art.tag("foliage", P.hedge, 0x6d9e78, 0x80ac7d, 0x5d916c, 0x9cbd8b, 0x658e67, 0xefb0c2, 0xf6c2cf, 0xe999b4, 0xffd6de);
  art.tag("wood", 0x8b7766);
  for (const b of buildings) {
    if (b.kind === "terrace") continue;
    art.tag("plaster", b.wall);
    art.tag("roof", b.roof);
  }
}

const P = {
  grass: 0x8ebc82,
  hedge: 0x568566,
  path: 0xe4ded1,
  curb: 0xc8cebf,
  road: 0x7e8890,
  ink: 0x465c68,
  wood: 0x967766,
};
const random = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** Nakameguro: kerbed pavements either side of marked asphalt, with zebra crossings at the junctions. */
function paintTidyRoads(ctx: CanvasRenderingContext2D, unit: number) {
  for (const road of [13.5, 26.5]) {
    ctx.fillStyle = "#e1ddcf";
    ctx.fillRect((road - 2.5) * unit, 0, 5 * unit, 2048);
    ctx.fillRect(0, (road - 2.5) * unit, 2048, 5 * unit);
    ctx.fillStyle = "#899398";
    ctx.fillRect((road - 1.5) * unit, 0, 3 * unit, 2048);
    ctx.fillRect(0, (road - 1.5) * unit, 2048, 3 * unit);
  }
  for (const road of [13.5, 26.5])
    for (let n = 0; n < 40; n += 1.8) {
      if (Math.abs(n - 13.5) < 3 || Math.abs(n - 26.5) < 3) continue;
      ctx.fillStyle = "#eadfc0";
      ctx.fillRect((road - 0.035) * unit, n * unit, 0.07 * unit, 0.75 * unit);
      ctx.fillRect(n * unit, (road - 0.035) * unit, 0.75 * unit, 0.07 * unit);
    }
  ctx.strokeStyle = "#c5c6ba";
  ctx.lineWidth = 1.4;
  for (const road of [13.5, 26.5])
    for (let n = 0; n < 40; n += 0.65) {
      if (Math.abs(n - 13.5) < 2.7 || Math.abs(n - 26.5) < 2.7) continue;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo((road + side * 1.6) * unit, n * unit);
        ctx.lineTo((road + side * 2.5) * unit, n * unit);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(n * unit, (road + side * 1.6) * unit);
        ctx.lineTo(n * unit, (road + side * 2.5) * unit);
        ctx.stroke();
      }
    }
  for (const x of [13.5, 26.5])
    for (const z of [13.5, 26.5]) {
      ctx.fillStyle = "#f7efda";
      for (let i = 0; i < 7; i++)
        for (const side of [-1, 1]) {
          ctx.fillRect((x - 1.2 + i * 0.38) * unit, (z + side * 2.05 - 0.38) * unit, 0.2 * unit, 0.76 * unit);
          ctx.fillRect((x + side * 2.05 - 0.38) * unit, (z - 1.2 + i * 0.38) * unit, 0.76 * unit, 0.2 * unit);
        }
    }
}

/**
 * Lucknow's old city: narrow roads that bend (see streets.ts), worn asphalt from one building line to the other,
 * its edges crumbling into dust; patched and re-patched; hardly a painted line. The park keeps its grass, the lanes of the mohalla are paved in brick.
 */
function paintLucknowGround(ctx: CanvasRenderingContext2D, unit: number) {
  const rect = (x: number, z: number, w: number, d: number) => ctx.fillRect(x * unit, z * unit, w * unit, d * unit);
  // The park is watered; the orchard floor is not.
  ctx.fillStyle = "#a9b97f";
  rect(16.9, 28.4, 7.5, 7.1);
  // Brick-paved lanes between the houses and across the bazaar.
  ctx.fillStyle = "#b5a988";
  rect(0.6, 9.7, 10.8, 1.6);
  rect(5.2, 1.6, 1.6, 9);
  rect(16.2, 16.4, 8.8, 4.6);
  // The ways in to each place, off the streets.
  for (const [x0, z0, x1, z1] of LANES) if (x0 < 40) rect(x0 + 0.1, z0, x1 - x0 - 0.2, z1 - z0);
  const trace = (street: Street) => {
    const [from, to] = span(street);
    ctx.beginPath();
    for (let s = from - 0.6; s <= to + 0.7; s += 0.25) {
      const p = point(street, Math.max(from, Math.min(to, s)));
      const [x, z] = street.axis === "x" ? [s, p.z] : [p.x, s];
      if (s === from - 0.6) ctx.moveTo(x * unit, z * unit); else ctx.lineTo(x * unit, z * unit);
    }
  };
  ctx.lineJoin = ctx.lineCap = "round";
  // A dusty verge first, then the surface: asphalt on the roads, old brick in the gali.
  for (const street of CHOWK) {
    trace(street);
    ctx.strokeStyle = "#bfa980";
    ctx.lineWidth = (street.half * 2 + 0.25) * unit;
    ctx.stroke();
  }
  for (const street of CHOWK) {
    trace(street);
    ctx.strokeStyle = street.kind === "gali" ? "#a89a7c" : "#6f777c";
    ctx.lineWidth = street.half * 2 * unit;
    ctx.stroke();
  }
  ctx.fillStyle = "#6f777c";
  ctx.beginPath();
  ctx.arc(CHAURAHA.x * unit, CHAURAHA.z * unit, CHAURAHA.radius * unit, 0, Math.PI * 2);
  ctx.fill();
  // The roads widen to meet the bridges.
  for (const road of [13.5, 26.5]) {
    ctx.beginPath();
    ctx.moveTo(36.5 * unit, (road - 1.2) * unit);
    ctx.lineTo(40 * unit, (road - 1.6) * unit);
    ctx.lineTo(40 * unit, (road + 1.6) * unit);
    ctx.lineTo(36.5 * unit, (road + 1.2) * unit);
    ctx.fill();
  }
  // Dust drifting in from the edges in soft, uneven tongues, and lighter patches where the road was dug up and relaid.
  const blob = (x: number, z: number, r: number) => { ctx.beginPath(); ctx.ellipse(x * unit, z * unit, r * unit, r * unit * 0.8, 0, 0, Math.PI * 2); ctx.fill(); };
  CHOWK.forEach((street, index) => {
    const [from, to] = span(street);
    for (let n = from; n < to; n += 0.09) {
      for (const side of [-1, 1]) {
        const seed = n * 7 + index * 31 + side;
        const p = point(street, n, side * (street.half + 0.04 - random(seed) * random(seed + 1) * 0.5));
        if (Math.hypot(p.x - CHAURAHA.x, p.z - CHAURAHA.z) < CHAURAHA.radius) continue;
        ctx.fillStyle = ["#c9b48e", "#bda57d", "#bfa980"][Math.floor(random(n + index) * 3)];
        blob(p.x, p.z, 0.05 + random(seed + 3) * 0.13);
      }
      if (street.kind === "road" && random(n * 3.1 + index) < 0.06) {
        const p = point(street, n, (random(n) - 0.5) * street.half);
        ctx.fillStyle = "#959a98";
        rect(p.x - 0.4, p.z - 0.3, 0.5 + random(n + 1) * 0.9, 0.4 + random(n + 2) * 0.7);
      }
    }
  });
  // The only paint: a faded centre line on the bazaar road, broken where it has worn away, and the gali's bricks.
  ctx.fillStyle = "#b9b4a8";
  for (let n = 1; n < 39; n += 1.6) {
    if (Math.abs(n - CHAURAHA.x) < CHAURAHA.radius + 0.6 || random(n * 1.7) < 0.35) continue;
    const a = point(CHOWK[0], n), b = point(CHOWK[0], n + 0.7);
    ctx.beginPath();
    ctx.moveTo(a.x * unit, (a.z - 0.03) * unit);
    ctx.lineTo(b.x * unit, (b.z - 0.03) * unit);
    ctx.lineTo(b.x * unit, (b.z + 0.03) * unit);
    ctx.lineTo(a.x * unit, (a.z + 0.03) * unit);
    ctx.fill();
  }
  ctx.strokeStyle = "#978a6e";
  ctx.lineWidth = 1;
  const gali = CHOWK.find((street) => street.kind === "gali")!;
  for (let n = span(gali)[0]; n < span(gali)[1]; n += 0.24) {
    const a = point(gali, n, -gali.half + 0.06), b = point(gali, n, gali.half - 0.06);
    ctx.beginPath();
    ctx.moveTo(a.x * unit, a.z * unit);
    ctx.lineTo(b.x * unit, b.z * unit);
    ctx.stroke();
  }
}

export function makeTown(art: Art) {
  const root = new THREE.Group();
  const dynamic = new THREE.Group();
  const lampHeads: THREE.Vector3[] = [];
  tagSurfaces(art);
  art.box(root, 20, -0.38, 20, 43, 0.7, 43, THEME.ground.slab);
  art.box(root, 20, -0.82, 20, 43.2, 0.22, 43.2, THEME.ground.under);
  art.box(root, 0, -0.95, 0, 300, 0.1, 300, THEME.ground.far);

  // One ground texture avoids coplanar road intersections and keeps the mobile draw cost low.
  const { canvas, maskCanvas, ctx } = paintedGround(2048, 2048, GROUND_KINDS);
  const unit = 2048 / 40;
  ctx.fillStyle = THEME.ground.open;
  ctx.fillRect(0, 0, 2048, 2048);
  for (let i = 0; i < 3600; i++) {
    ctx.fillStyle = THEME.ground.speckle[i % 2];
    ctx.fillRect(random(i) * 2048, random(i + 5500) * 2048, THEME.ground.lawns ? 3 : 5 + random(i + 9) * 14, THEME.ground.lawns ? 7 : 4 + random(i + 3) * 10);
  }
  if (!THEME.ground.lawns) paintLucknowGround(ctx, unit);
  else paintTidyRoads(ctx, unit);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  art.textures.push(texture);
  const groundMat = art.ground(texture, maskCanvas, "ground");
  const ground = new THREE.Mesh(
    art.geometry(new THREE.PlaneGeometry(40, 40)),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(20, 0.005, 20);
  ground.receiveShadow = true;
  root.add(ground);

  for (const building of buildings) if (!makeArchitecture(root, art, building)) makeBuilding(root, art, building);
  art.box(root, 6, 0.026, 10.6, 10, 0.035, 2.1, P.path);
  art.box(root, 6, 0.028, 6.4, 1.5, 0.035, 8, P.path);
  for (let i = 0; i < 10; i++) {
    art.box(root, 1.1 + i, 0.35, 1.2, 0.08, 0.65, 0.1, 0xf3e5cf);
    if (i < 9) art.box(root, 1.6 + i, 0.45, 1.2, 1, 0.07, 0.06, 0xf3e5cf);
  }
  for (const [x, z] of [
    [2, 10.5],
    [10, 10.5],
    [17, 8.4],
    [23, 8.4],
    [29, 11.7],
    [10.8, 22.7],
    [16.5, 23.6],
    [29, 33.9],
  ])
    flowerBed(root, art, x, z);

  /** A group that scales whatever is built in it (in town coordinates) about one point: props sized for true scale. */
  const scaled = (factor: number, x: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x * (1 - factor), 0, z * (1 - factor));
    g.scale.setScalar(factor);
    root.add(g);
    return g;
  };
  // School forecourt, basketball court, and swings.
  art.box(root, 19.6, 0.025, 9.1, 7.5, 0.04, 3, P.path);
  art.box(root, 21.1, 0.052, 10, 3.8, 0.025, 2, 0x87a6a2);
  for (const z of [9.1, 10.9])
    art.box(root, 21.1, 0.07, z, 3.6, 0.01, 0.045, 0xf8f4df);
  art.box(root, 21.1, 0.07, 10, 0.04, 0.01, 1.8, 0xf8f4df);
  art.box(root, 23, 0.9, 10, 0.07, 1.8, 0.07, P.ink);
  art.box(root, 22.8, 1.65, 10, 0.08, 0.6, 0.8, 0xf5efdf);
  const swings = scaled(0.6, 17.35, 10.4);
  for (const x of [16.5, 18.2])
    art.box(swings, x, 0.8, 10.4, 0.09, 1.6, 0.1, 0xa78063);
  art.box(swings, 17.35, 1.6, 10.4, 1.9, 0.12, 0.12, 0xb67962);
  for (const x of [17.05, 17.65]) {
    art.box(swings, x, 0.98, 10.4, 0.025, 1.15, 0.025, P.ink);
  }
  art.box(swings, 17.35, 0.4, 10.4, 0.85, 0.08, 0.35, 0xd3af70);

  // A market that reads as a place, not another box-shaped building.
  art.box(root, 20.5, 0.03, 18.6, 8.5, 0.04, 4.3, P.path);
  for (const [x, z, color] of [
    [17.2, 17.5, 0xb56b71],
    [20, 17.5, 0x6c9a79],
    [23, 17.5, 0xe0aa65],
  ]) {
    marketStall(root, art, x, z, color);
  }
  for (const x of [17.5, 23.5]) {
    bench(root, art, x, 20.1);
    flowerBed(root, art, x, 20.7);
  }
  for (let i = 0; i < 8; i++) {
    const x = 17 + i;
    art.box(
      root,
      x,
      2.7 - 0.16 * Math.sin((i / 7) * Math.PI),
      19.6,
      0.4,
      0.3,
      0.04,
      [0xeab77c, 0xd4919f, 0x8fb7ac][i % 3],
    );
  }
  for (const x of [16.6, 24.4])
    art.box(root, x, 1.4, 19.6, 0.07, 2.8, 0.07, P.wood);

  // Park: an open lawn with a pond, footpaths, pergola and benches.
  art.box(root, 20, 0.025, 34.8, 8.8, 0.04, 1.1, P.path);
  art.box(root, 17.6, 0.025, 31.8, 1.1, 0.04, 7, P.path);
  const water = new THREE.Mesh(
    art.geometry(new THREE.CircleGeometry(1, 40)),
    art.material(0x63b8bd),
  );
  water.rotation.x = -Math.PI / 2;
  water.scale.set(1.45, 1.9, 1);
  water.position.set(21.8, 0.06, 31.8);
  root.add(water);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    art.ball(
      root,
      21.8 + Math.cos(a) * 1.52,
      0.16,
      31.8 + Math.sin(a) * 1.98,
      0.3,
      0.22,
      0.3,
      i % 3 ? 0xc6c7b5 : 0xadb6a5,
    );
  }
  for (const [x, z] of [
    [19.1, 34],
    [23.5, 34.2],
    [16.4, 30.5],
  ])
    bench(root, art, x, z);
  const pergola = scaled(0.65, 19.6, 29.8);
  for (const x of [18.8, 20.4])
    for (const z of [29, 30.6]) art.box(pergola, x, 1, z, 0.12, 2, 0.12, 0xf1e9d8);
  for (let i = 0; i < 6; i++)
    art.box(pergola, 19.6, 2, 28.9 + i * 0.36, 2, 0.14, 0.11, 0xe7dfc8);

  // Farm plots, greenhouse and stacks of produce. In Lucknow this is a mango orchard: trees in rows, crates of fruit.
  if (isLucknow) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) tree(root, art, 2.4 + j * 1.5, 29.4 + i * 2.2, false, 0.62 + random(i * 4 + j) * 0.1);
    for (let i = 0; i < 6; i++) {
      art.box(root, 9.6 + (i % 3) * 0.5, 0.12 + Math.floor(i / 3) * 0.22, 34.7, 0.44, 0.22, 0.34, 0xb58a52);
      for (let k = 0; k < 3; k++) art.ball(root, 9.48 + (i % 3) * 0.5 + k * 0.12, 0.26 + Math.floor(i / 3) * 0.22, 34.7, 0.06, 0.05, 0.06, 0xe9c23a);
    }
  } else
  for (let i = 0; i < 5; i++) {
    art.box(root, 4.1, 0.05, 29.6 + i * 1.1, 3.4, 0.08, 0.55, 0x9a8867);
    for (let j = 0; j < 7; j++)
      art.ball(
        root,
        2.7 + j * 0.45,
        0.26,
        29.6 + i * 1.1,
        0.18,
        0.25,
        0.18,
        i % 2 ? 0x6a995d : 0x9cac63,
      );
  }
  for (const x of [4, 5.4, 6.8]) flowerBed(root, art, x, 36.5);
  for (let i = 0; i < 4; i++)
    art.box(
      root,
      10.6,
      0.25 + (i % 2) * 0.5,
      34.4 + Math.floor(i / 2) * 0.65,
      0.6,
      0.5,
      0.6,
      0xbe996d,
    );

  // A quiet bus shelter; no fast decorative traffic.
  const shelter = scaled(0.7, 15.6, 11.5);
  art.box(shelter, 15.6, 1.6, 11.4, 1.5, 0.16, 1.4, 0x648e8b);
  for (const x of [15, 16.2]) art.box(shelter, x, 0.8, 11, 0.07, 1.6, 0.07, P.ink);
  art.box(shelter, 15.6, 0.9, 10.98, 1.3, 1.1, 0.06, 0xb1d2c9);
  bench(root, art, 15.6, 11.3);
  art.box(shelter, 15, 0.9, 12.2, 0.06, 1.8, 0.06, P.ink);
  art.sign(shelter, THEME.busSign, 15, 1.65, 12.24, 0.55, 0.28, "#567c88", "#fff9e6");

  // Street furniture adds scale at citizen height.
  for (const x of [11.2, 24.2, 28.8])
    for (const z of [2, 10, 18, 24, 32, 38]) {
      if (isLucknow && roadClearance(x, z) < 0.1) continue;
      art.cylinder(root, x, 1.4, z, 0.055, 2.8, P.ink);
      art.box(root, x + 0.23, 2.77, z, 0.55, 0.08, 0.08, P.ink);
      art.box(root, x + 0.45, 2.68, z, 0.28, 0.17, 0.23, 0xffe6a1);
      lampHeads.push(new THREE.Vector3(x + 0.45, 2.68, z));
      art.box(root, x + 0.45, 2.81, z, 0.37, 0.08, 0.32, P.ink);
    }
  if (isLucknow) {
    // Every corner has its chai stall; fruit sellers push their thelas along the bazaar; autos wait for fares.
    const clear = (x: number, z: number) => !insideFootprint(x, z, 0.35) && (x > 40 || roadClearance(x, z) > -0.45);
    for (const [x, z] of [[10.7, 5.9], [28.8, 21.3], [74.4, 23.2], [52, 8.2], [34.6, 12.6]]) if (clear(x, z)) chaiStall(art, root, x, 0.03, z);
    const fruit = [0xf2b632, 0xe9d24a, 0xe8732e, 0xd8473c, 0x7da04a];
    [[16, 23.7], [18.2, 21.3], [22.6, 21.2], [24.4, 16.4], [13, 30.2], [66.4, 32.9], [61.5, 24.2], [3.2, 24.6]].forEach(([x, z], i) => { if (clear(x, z)) handcart(art, root, x, 0.03, z, fruit[i % fruit.length], i + 3); });
    [[11.3, 15.6, 0.2], [11.3, 16.9, -0.15], [24.4, 24.4, Math.PI], [74.6, 16.4, Math.PI / 2], [76, 16.4, Math.PI / 2 + 0.2], [77.4, 16.3, Math.PI / 2 - 0.1], [66.6, 10.9, 0.3], [51.6, 23.9, -0.4]]
      .forEach(([x, z, angle], i) => { if (clear(x, z)) autoRickshaw(art, root, x, 0.03, z, angle, i % 3 === 2); });
    [[15.9, 20.9, 0.7, 0xf1ece0], [29.3, 30.6, -1.1, 0xcbb9a2], [70.9, 30.2, 2.1, 0xf1ece0]].forEach(([x, z, angle, color]) => { if (clear(x, z)) cow(art, root, x, 0.03, z, angle, color); });
    // The roadside itself is a market: every few metres a vendor under an umbrella, a fruit cart, a row of parked
    // two-wheelers, a waiting rickshaw, a heap of sand. They stand on the road's dusty edge, clear of the traffic.
    const fruits = [0xf2b632, 0xe9d24a, 0xe8732e, 0xd8473c, 0x7da04a];
    let k = 0;
    const roadside = (x: number, z: number, along: "x" | "z", side: number) => {
      const pick = random(++k * 3.7 + x + z);
      if (pick < 0.16 || !clear(x, z)) return;
      const facing = along === "x" ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
      if (pick < 0.36) vendor(art, root, x, 0.03, z, k);
      else if (pick < 0.5) handcart(art, root, x, 0.03, z, fruits[k % fruits.length], k);
      else if (pick < 0.7) for (let i = 0; i < 3; i++) scooter(art, root, x + (along === "x" ? (i - 1) * 0.32 : 0), 0.02, z + (along === "z" ? (i - 1) * 0.32 : 0), facing + 0.25, [0xb7362d, 0x2b2d31, 0x2d5fa8, 0xe9e6dc][(k + i) % 4]);
      else if (pick < 0.8) cycleRickshaw(art, root, x, 0.02, z, facing + Math.PI / 2);
      else if (pick < 0.9) autoRickshaw(art, root, x, 0.03, z, facing + Math.PI / 2, k % 2 === 0);
      else heap(art, root, x, 0.03, z, k);
    };
    const junction = (n: number, roads: number[]) => roads.some((r) => Math.abs(n - r) < 3.4);
    // In the old city they stand in the road itself, hard up against the shop fronts, and the traffic squeezes by.
    for (const street of CHOWK) if (street.kind === "road") for (const side of [-1, 1]) {
      const [from, to] = span(street);
      for (let n = from + 0.8; n < to - 0.6; n += 2.1) {
        const p = point(street, n, side * (street.half - 0.3));
        // Not where another road crosses.
        const other = CHOWK.some((o) => {
          if (o === street || o.kind !== "road") return false;
          const q = point(o, o.axis === "x" ? p.x : p.z);
          return Math.abs(q.x - p.x) + Math.abs(q.z - p.z) < o.half + 1.2;
        });
        if (other || Math.hypot(p.x - CHAURAHA.x, p.z - CHAURAHA.z) < CHAURAHA.radius + 0.8 || Math.abs(p.x - GATE.x) < 1.2) continue;
        roadside(p.x, p.z, street.axis, side);
      }
    }
    for (const road of [13.5, 26.5]) for (const side of [-1, 1])
      for (let n = 50.5; n < 84; n += 2.6) if (!junction(n, [69])) roadside(n, road + side * 2.05, "x", side);
    for (const side of [-1, 1]) for (let n = 1.5; n < 39; n += 2.6) if (!junction(n, [13.5, 26.5])) roadside(69 + side * 2.05, n, "z", side);
    // The bazaar is packed: rows of stalls under awnings, vendors on the ground between them, carts wherever one
    // will fit, and an aisle left down the middle for the crowd.
    [[18.6, 17.5, 0xd08a2e], [21.6, 17.5, 0x2f8f5a], [24.2, 17.6, 0xb7245c], [17.2, 20.9, 0x1f6f8a], [18.8, 20.9, 0xc8442e], [23, 20.9, 0xe0aa65], [24.3, 20.8, 0x6c9a79]]
      .forEach(([x, z, color]) => marketStall(root, art, x, z, color));
    [[16.8, 18.8], [18, 18.9], [19.2, 18.7], [22.7, 18.8], [23.9, 18.9], [16.7, 19.9], [24.4, 19.8]].forEach(([x, z], i) => vendor(art, root, x, 0.03, z, i + 40));
    [[18.1, 19.9], [19.4, 19.9], [22.6, 19.9], [23.6, 19.8]].forEach(([x, z], i) => handcart(art, root, x, 0.03, z, fruits[i % fruits.length], i + 20));
    // The Akbari Gate across the bazaar road, and the island in the middle of the chauraha.
    akbariGate(art, root, GATE.x, GATE.z, CHOWK[0].half * 2);
    chaurahaIsland(art, root, CHAURAHA.x, CHAURAHA.z, CHAURAHA.island);
    // Cloth banners strung across the road, from one building line to the other.
    const banners: Array<[string, string, string]> = [["लखनऊ महोत्सव में आपका स्वागत है", "#f2c53d", "#b7245c"], ["भव्य चिकन सेल • 50% तक छूट", "#c8281e", "#fff3c4"],
      ["नया सत्र • प्रवेश प्रारंभ", "#f6efd9", "#1f3f7a"], ["शुभ विवाह • गुप्ता परिवार", "#f47c2c", "#fff8e6"]];
    const [chowk, nakhas, , sarai, victoria] = CHOWK;
    const across: Array<[x: number, z: number, turned: number, width: number]> = [
      ...([[chowk, 5], [chowk, 20.5], [nakhas, 33], [nakhas, 8.5], [chowk, 35]] as Array<[Street, number]>).map(([street, x]): [number, number, number, number] => [x, point(street, x).z, 0, street.half * 2]),
      ...([[victoria, 6], [victoria, 20], [sarai, 33.5], [victoria, 34]] as Array<[Street, number]>).map(([street, z]): [number, number, number, number] => [point(street, z).x, z, 1, street.half * 2]),
      [56, 26.5, 0, 4.6], [78, 13.5, 0, 4.6],
    ];
    across.forEach(([x, z, turned, width], i) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = turned ? 0 : Math.PI / 2;
      g.scale.x = width / 4.6;
      root.add(g);
      const [text, bg, fg] = banners[i % banners.length];
      for (const face of [0, Math.PI]) art.sign(g, text, 0, 3.25, face ? -0.012 : 0.012, 4.2, 0.5, bg, fg).rotation.y = face;
      for (const end of [-1, 1]) art.box(g, end * 2.3, 3.3, 0, 0.5, 0.012, 0.012, P.ink);
    });
    hoarding(art, root, "मुस्कुराइए, आप लखनऊ में हैं", 11.2, 0.03, 29.4, 2.6, 0.7, "#f6efd9", "#8a2a1f", Math.PI / 2);
    hoarding(art, root, "SMILE, YOU ARE IN LUCKNOW", 71.6, 0.03, 29.6, 2.6, 0.7, "#f6efd9", "#8a2a1f", -Math.PI / 2);
    hoarding(art, root, "चिकनकारी SAREES & SUITS", 29, 0.03, 16.4, 2.2, 0.6, "#7b2d5b", "#ffe9bf", 0);
  } else {
  for (const [x, z] of [
    [10.7, 5.9],
    [24.2, 5.7],
    [28.8, 21.3],
    [16, 23.7],
  ]) {
    vendingMachine(art, root, x, 0.03, z, [0xd63f36, 0x2f62b5, 0xf4f4ef][Math.round(x) % 3], Math.round(x * 7 + z));
    vendingMachine(art, root, x + 0.56, 0.03, z, [0x2f62b5, 0xf4f4ef, 0xd63f36][Math.round(x) % 3], Math.round(x * 3 + z * 5));
  }
  // More corners: by the station and the konbini, and a red post box outside the bank and the station.
  for (const [x, z] of [[74.4, 23], [66.2, 32.8], [52, 8.2], [13, 30.2], [34.8, 12.4]]) {
    vendingMachine(art, root, x, 0.03, z, [0xd63f36, 0x2f62b5, 0xf4f4ef][Math.round(x + z) % 3], Math.round(x * 11 + z));
    vendingMachine(art, root, x + 0.56, 0.03, z, [0xf4f4ef, 0xd63f36, 0x2f62b5][Math.round(x + z) % 3], Math.round(x * 5 + z * 3));
  }
  }
  for (const [x, z] of [[11.6, 20.6], [75.2, 23], [29.4, 28]]) postBox(art, root, x, 0.03, z);
  for (const [x, z] of [
    [5.9, 5.5],
    [16.7, 7.9],
    [21.5, 24.5],
  ])
    bicycle(root, art, x, z);
  for (const x of [2.7, 6]) {
    // Cafe terrace: a table under a parasol, a chair either side.
    const terrace = scaled(0.55, x, 23.4);
    art.cylinder(terrace, x, 0.5, 23.4, 0.045, 1, P.ink);
    art.cylinder(terrace, x, 0.77, 23.4, 0.55, 0.08, 0xe1ba8a);
    art.cylinder(terrace, x, 1.85, 23.4, 0.9, 0.35, 0xe0b977, 0, 8);
    for (const zz of [22.75, 24.05]) {
      art.box(terrace, x, 0.37, zz, 0.42, 0.08, 0.42, 0xa8876e);
      art.box(terrace, x, 0.18, zz, 0.08, 0.36, 0.08, P.ink);
    }
  }

  // Blossom clusters, green trees, hedges and a distant cedar ridge.
  const trees = [
    [1, 5.7],
    [10.9, 1.8],
    [1.4, 11.2],
    [10.6, 10.7],
    [16, 2],
    [23.8, 2.7],
    [23.7, 10.9],
    [29, 2],
    [2, 17.7],
    [10.8, 24],
    [16.2, 16.8],
    [24.3, 22],
    [29, 24],
    [16, 28.6],
    [23.8, 29.1],
    [24, 36.8],
    [16.3, 37],
    [11, 37.2],
  ];
  trees.forEach(([x, z], i) =>
    tree(root, art, x, z, i % 3 !== 0, 0.75 + random(i) * 0.3),
  );
  // The Meguro River's famous cherry trees line both banks.
  for (const x of [40.3, 49.7])
    for (let z = 1.2; z < 39.5; z += 2.7) {
      if (Math.abs(z - 13.5) < 2.4 || Math.abs(z - 26.5) < 2.4) continue;
      tree(root, art, x, z, true, 0.62 + random(x + z) * 0.18);
    }
  for (let i = 0; i < 58; i++) {
    const x = i * 1.7 - 3,
      z = -3 - random(i + 80) * 4;
    if (x > 40.5 && x < 49.5) continue;
    tree(root, art, x, z, false, 0.7 + random(i + 30) * 0.8);
  }
  for (let i = 0; i < 24; i++)
    tree(
      root,
      art,
      -3.5 - random(i + 50) * 3,
      i * 2 - 4,
      i % 4 === 0,
      0.8 + random(i + 66) * 0.6,
    );


  // Riverside with two bridges. Water remains outside the playable navigation grid.
  art.box(root, 45, -0.12, 19, 7, 0.16, 72, THEME.river);
  for (const x of [41.5, 48.5])
    art.box(root, x, 0.2, 19, 0.35, 0.7, 72, 0xb1bca9);
  for (const z of [13.5, 26.5]) {
    art.box(root, 45, 0.28, z, 7.8, 0.25, 3.4, P.path);
    for (const zz of [z - 1.7, z + 1.7]) {
      art.box(root, 45, 0.9, zz, 7.8, 0.08, 0.09, P.ink);
      for (let i = 0; i < 9; i++)
        art.box(root, 41.2 + i * 0.95, 0.61, zz, 0.07, 0.65, 0.07, P.ink);
    }
  }
  for (let i = 0; i < 24; i++) {
    const ripple = art.box(
      dynamic,
      42.3 + random(i) * 5.2,
      0.01,
      -9 + i * 2.7,
      0.4 + random(i + 2),
      0.012,
      0.055,
      0xc2e7dd,
    );
    ripple.userData.phase = i;
  }
  const lanterns = makeLanterns(art);
  dynamic.add(lanterns.root);
  // Nakameguro: cherry petals on the wind. Lucknow: paper kites duelling high over the rooftops.
  const petalGeometry = art.geometry(isLucknow ? new THREE.PlaneGeometry(0.4, 0.4).rotateZ(Math.PI / 4) : new THREE.PlaneGeometry(0.075, 0.11));
  const petals = new THREE.InstancedMesh(
    petalGeometry,
    new THREE.MeshBasicMaterial({ color: isLucknow ? 0xffffff : 0xffc8db, side: THREE.DoubleSide }),
    isLucknow ? 22 : 64,
  );
  if (isLucknow) {
    const kiteColors = [0xe2452f, 0xf2b632, 0x3f8fd2, 0x57a85a, 0xd9558a, 0xf47c2c, 0x8a5fc2, 0xfdfbf3];
    for (let i = 0; i < 22; i++) petals.setColorAt(i, new THREE.Color(kiteColors[i % kiteColors.length]));
  }
  dynamic.add(petals);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  function animate(seconds: number) {
    dynamic.children.forEach((child) => {
      if (typeof child.userData.phase === "number")
        child.position.x += Math.sin(seconds + child.userData.phase) * 0.0009;
    });
    if (isLucknow) {
      for (let i = 0; i < 22; i++) {
        // Each kite holds its patch of sky over the old city, darting and dipping as its flyer works the string.
        const dart = Math.sin(seconds * (0.5 + random(i) * 0.6) + i * 2.1);
        position.set(3 + random(i + 11) * 36 + dart * 1.6 + Math.sin(seconds * 0.17 + i) * 2.2,
          7 + random(i + 5) * 7 + Math.sin(seconds * 0.9 + i * 1.7) * 0.7, 2 + random(i + 22) * 36 + Math.cos(seconds * 0.21 + i) * 1.8);
        quaternion.setFromEuler(euler.set(-0.5, random(i) * 6 + Math.sin(seconds * 0.3 + i) * 0.4, dart * 0.35));
        matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        petals.setMatrixAt(i, matrix);
      }
      petals.instanceMatrix.needsUpdate = true;
      return;
    }
    for (let i = 0; i < 64; i++) {
      // Half the petals drift over the old town, half along the river.
      position.set(
        (i % 2 ? 1 + random(i + 11) * 25 : 39 + random(i + 11) * 12) + Math.sin(seconds * 0.3 + i) * 1.3,
        6 - ((seconds * 0.3 + random(i) * 6) % 6),
        1 + random(i + 22) * 38,
      );
      quaternion.setFromEuler(euler.set(seconds + i, seconds * 0.7 + i, i));
      matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
      petals.setMatrixAt(i, matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
  }
  const district = makeDistrict(root, art, {
    tree: (x, z, blossom, scale) => tree(root, art, x, z, blossom, scale),
    bench: (x, z) => bench(root, art, x, z),
    flowerBed: (x, z) => flowerBed(root, art, x, z),
  });
  lampHeads.push(...district.lampHeads);
  batchStatic(root);
  // Real trees, added after batching: they are already instanced per species.
  const forest = makeForest(spots);
  root.add(forest.root);
  // Poles keep clear of trees and lamps, and in Lucknow of the gateway and the clock tower too.
  const streetscape = makeStreetscape([...spots, ...lampHeads, ...(isLucknow ? [{ x: 57, z: 30.3 }, { x: 55.6, z: 30.3 }, { x: 58.4, z: 30.3 }, { x: 73.4, z: 25 }, { x: 57.5, z: 28.75 }] : [])]);
  root.add(streetscape.root);
  spots.length = 0;
  // Light spilling out of shopfronts onto the pavement after dark, alongside the street lamps' pools.
  const spill = buildings.filter((b) => b.kind === "shop" || b.kind === "mall" || b.kind === "station")
    .flatMap((b) => [-0.25, 0.25].map((side) => new THREE.Vector3(b.x + side * b.w, 0, b.z + b.d / 2 + 0.8)));
  return {
    root,
    dynamic,
    lampHeads: [...lampHeads, ...spill],
    petals,
    lanterns: lanterns.root,
    animate,
    dispose: () => { (petals.material as THREE.Material).dispose(); forest.dispose(); streetscape.dispose(); },
  };
}

function makeBuilding(parent: THREE.Group, art: Art, b: Building) {
  const group = new THREE.Group();
  group.position.set(b.x, 0, b.z);
  parent.add(group);
  if (isLucknow && b.kind === "station") return charbagh(art, group, b);
  if (isLucknow && b.kind === "shrine") return imambara(art, group, b);
  art.box(group, 0, 0.11, 0, b.w + 0.4, 0.2, b.d + 0.5, 0xc5c3b5);
  art.box(group, 0, b.h / 2 + 0.17, 0, b.w, b.h, b.d, b.wall);
  art.box(group, 0, 0.37, b.d / 2 + 0.015, b.w, 0.3, 0.06, 0xc0b2a1);
  art.box(group, 0, b.h + 0.16, 0, b.w + 0.18, 0.13, b.d + 0.18, 0xf4e8d3);
  const roofY = b.h + 0.25;
  const flat = ["hospital", "lab", "apartment", "office", "mall", "station"].includes(b.kind);
  if (flat) {
    art.box(group, 0, roofY, 0, b.w + 0.3, 0.23, b.d + 0.3, b.roof);
    for (const x of [-b.w / 2, b.w / 2])
      art.box(group, x, roofY + 0.22, 0, 0.12, 0.4, b.d, b.wall);
    art.box(group, b.w * 0.25, roofY + 0.32, -Math.min(0.5, b.d / 5), 0.9, 0.5, Math.min(1, b.d / 2.5), 0xd4d7cf);
    for (let i = 0; i < 4; i++)
      art.box(
        group,
        b.w * 0.25,
        roofY + 0.59,
        -0.85 + i * 0.22,
        0.7,
        0.03,
        0.06,
        P.ink,
      );
    if (b.kind === "lab") {
      art.ball(group, -0.65, roofY + 0.4, -0.2, 0.8, 0.75, 0.8, 0x90bcbc);
      art.box(group, -0.65, roofY + 1.2, -0.2, 0.03, 0.8, 0.03, P.ink);
    }
  } else {
    const rise = b.kind === "school" ? 1.3 : 0.95;
    const shape = new THREE.Shape();
    shape.moveTo(-b.w / 2 - 0.27, 0);
    shape.lineTo(0, rise);
    shape.lineTo(b.w / 2 + 0.27, 0);
    shape.closePath();
    const geometry = art.geometry(
      new THREE.ExtrudeGeometry(shape, {
        depth: b.d + 0.5,
        bevelEnabled: false,
      }),
    );
    geometry.translate(0, roofY, -b.d / 2 - 0.25);
    const roof = new THREE.Mesh(geometry, art.material(b.roof));
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
    art.box(group, 0, roofY + rise, 0, 0.16, 0.14, b.d + 0.6, b.roof);
    for (let i = 1; i < 7; i++) {
      const x = ((b.w / 2 + 0.27) * i) / 7;
      for (const side of [-1, 1])
        art.box(
          group,
          side * x,
          roofY + rise * (1 - i / 7) + 0.025,
          0,
          0.045,
          0.035,
          b.d + 0.48,
          b.roof,
        );
    }
    if (b.kind === "home") {
      art.box(group, b.w * 0.28, roofY + 0.75, -0.55, 0.38, 1, 0.4, 0xd3bba1);
      art.box(group, b.w * 0.28, roofY + 1.25, -0.55, 0.5, 0.12, 0.5, 0x846f6b);
    }
  }
  const front = b.d / 2 + 0.035;
  art.box(
    group,
    0,
    0.88,
    front,
    0.69,
    1.42,
    0.06,
    b.kind === "shop" ? 0x5c8d8f : 0x92745e,
  );
  art.box(group, 0.18, 0.85, front + 0.06, 0.06, 0.06, 0.05, 0xe4c17c);
  art.box(group, 0, 0.19, front + 0.26, 1.2, 0.2, 0.6, 0xd0c8b7);
  const tall = ["apartment", "office", "mall", "station"].includes(b.kind);
  const floors = tall
    ? Array.from({ length: Math.max(1, Math.floor((b.h - 0.5) / 1.25)) }, (_, i) => 1.4 + i * 1.25)
    : b.h > 3 ? [1.4, 2.65] : [1.6];
  for (const [floor, y] of floors.entries()) {
    const count = tall ? Math.max(2, Math.round(b.w / 1.45)) : b.w > 5 ? 4 : 2;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * (b.w / (count + 0.6));
      art.box(group, x, y, front + 0.01, 0.8, 0.91, 0.075, 0xf7efdc);
      art.box(group, x, y, front + 0.055, 0.65, 0.76, 0.045, 0x709ba6);
      art.box(group, x, y, front + 0.085, 0.045, 0.78, 0.03, 0xe7dfc8);
      art.box(group, x, y - 0.08, front + 0.085, 0.7, 0.045, 0.03, 0xe7dfc8);
      art.box(group, x, y - 0.47, front + 0.13, 0.9, 0.08, 0.28, 0xe0d7c3);
      if (b.kind === "apartment" && floor > 0) {
        art.box(group, x, y - 0.5, front + 0.3, 1, 0.06, 0.55, 0xd9d3c7);
        art.box(group, x, y - 0.32, front + 0.56, 1, 0.34, 0.04, 0xb9c6cc);
      }
      if (b.kind === "home") {
        art.box(group, x, y - 0.5, front + 0.18, 0.8, 0.17, 0.23, 0xa98165);
        art.ball(group, x, y - 0.36, front + 0.2, 0.37, 0.17, 0.15, 0x779a68);
      }
    }
  }
  for (const side of [-1, 1])
    for (const z of [-b.d * 0.26, b.d * 0.26]) {
      art.box(
        group,
        side * (b.w / 2 + 0.015),
        1.55,
        z,
        0.06,
        0.85,
        0.75,
        0xece6d6,
      );
      art.box(
        group,
        side * (b.w / 2 + 0.05),
        1.55,
        z,
        0.04,
        0.68,
        0.6,
        0x789eaa,
      );
    }
  if (b.kind === "shop") {
    for (let i = 0; i < 8; i++) {
      const awning = art.box(
        group,
        -b.w / 2 + ((i + 0.5) * b.w) / 8,
        2,
        front + 0.5,
        b.w / 8,
        0.08,
        1.05,
        i % 2 ? 0xf4e7d4 : b.roof,
      );
      awning.rotation.x = 0.16;
      art.box(
        group,
        -b.w / 2 + ((i + 0.5) * b.w) / 8,
        1.87,
        front + 1,
        b.w / 8,
        0.23,
        0.045,
        i % 2 ? 0xf4e7d4 : b.roof,
      );
    }
    art.sign(group, b.name, 0, b.h + 0.13, front + 0.03, b.w * 0.85, 0.38);
  } else if (b.kind !== "home") {
    art.sign(group, b.name, 0, b.h - 0.15, front + 0.12, b.w * 0.8, 0.35);
  }
  if (b.kind === "hospital") {
    art.box(group, 0, roofY + 0.45, b.d / 2, 0.8, 0.24, 0.13, 0xc96d72);
    art.box(group, 0, roofY + 0.45, b.d / 2, 0.24, 0.8, 0.13, 0xc96d72);
  }
  if (b.kind === "school") {
    const clock = art.cylinder(
      group,
      0,
      roofY + 0.65,
      front + 0.12,
      0.35,
      0.06,
      0xf9f0d9,
      0.35,
      24,
    );
    clock.rotation.x = Math.PI / 2;
    art.box(group, 0, roofY + 0.76, front + 0.17, 0.035, 0.24, 0.025, P.ink);
    art.box(group, 0.1, roofY + 0.65, front + 0.17, 0.23, 0.035, 0.025, P.ink);
  }
}

/** Every tree planted while the town is built; grown as real, instanced trees at the end (see trees.ts). */
const spots: TreeSpot[] = [];
const nearShrine = (x: number, z: number) => x > 53 && x < 61 && z > 30 && z < 39;

function tree(
  _parent: THREE.Group,
  _art: Art,
  x: number,
  z: number,
  blossom: boolean,
  scale: number,
) {
  // Where the streets are built up wall to wall, nothing grows through a building.
  if (THEME.terraces && (insideFootprint(x, z, 0.45) || (x < 40 && roadClearance(x, z) < 0.3))) return;
  const pick = random(x * 3.1 + z * 7.7);
  // Lucknow has no pines: neem, peepal and mango, with gulmohar in flower where Nakameguro has cherry.
  const kind = blossom ? "sakura" : nearShrine(x, z) && !isLucknow ? "pine" : pick < (isLucknow ? 0.5 : 0.3) ? "oak" : "keyaki";
  // The old figure sizes (0.6 to 1.5) become a gentler spread around each species' natural height.
  spots.push({ x, z, kind, scale: 0.8 + (scale - 0.75) * 0.45 + pick * 0.15 });
}

function flowerBed(parent: THREE.Group, art: Art, x: number, z: number) {
  if (THEME.terraces && insideFootprint(x, z, 0.5)) return;
  // Built at its old size around the origin, then scaled to true scale (one unit is about 2 m).
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(0.75);
  parent.add(g);
  art.box(g, 0, 0.16, 0, 1.15, 0.28, 0.5, 0xc0b199);
  for (let i = 0; i < 5; i++) {
    art.ball(g, 0 - 0.42 + i * 0.21, 0.35, 0, 0.15, 0.2, 0.18, 0x658e67);
    art.ball(
      g,
      0 - 0.42 + i * 0.21,
      0.53,
      0,
      0.09,
      0.08,
      0.09,
      i % 2 ? 0xe6b881 : 0xe6a0b9,
    );
  }
}
function bench(parent: THREE.Group, art: Art, x: number, z: number) {
  if (THEME.terraces && insideFootprint(x, z, 0.4)) return;
  // Built at its old size around the origin, then scaled to true scale (one unit is about 2 m).
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(0.5);
  parent.add(g);
  for (const xx of [0 - 0.5, 0 + 0.5])
    art.box(g, xx, 0.25, 0, 0.08, 0.5, 0.45, P.ink);
  for (let i = 0; i < 3; i++)
    art.box(g, 0, 0.48, 0 - 0.18 + i * 0.16, 1.35, 0.07, 0.13, 0xb39573);
  art.box(g, 0, 0.76, 0 - 0.22, 1.35, 0.3, 0.06, 0xb39573);
}
function marketStall(
  parent: THREE.Group,
  art: Art,
  x: number,
  z: number,
  color: number,
) {
  // Built at its old size around the origin, then scaled to true scale (one unit is about 2 m).
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(0.65);
  parent.add(g);
  for (const xx of [0 - 0.9, 0 + 0.9])
    art.box(g, xx, 0.8, 0, 0.08, 1.6, 0.08, P.wood);
  art.box(g, 0, 0.6, 0, 1.85, 0.2, 0.9, 0xc2a078);
  for (let i = 0; i < 6; i++) {
    art.box(
      g,
      0 - 0.85 + i * 0.34,
      1.65,
      0,
      0.34,
      0.1,
      1.4,
      i % 2 ? 0xf5e9d0 : color,
    );
    art.box(
      g,
      0 - 0.85 + i * 0.34,
      1.51,
      0 + 0.68,
      0.34,
      0.22,
      0.05,
      i % 2 ? 0xf5e9d0 : color,
    );
    art.ball(
      g,
      0 - 0.7 + i * 0.28,
      0.83,
      0,
      0.16,
      0.15,
      0.16,
      i % 2 ? 0xc4895d : 0x85a96a,
    );
  }
}
function bicycle(parent: THREE.Group, art: Art, x: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, 0.03, z);
  g.scale.setScalar(0.6);
  parent.add(g);
  for (const xx of [-0.4, 0.4]) {
    const wheel = new THREE.Mesh(
      art.geometry(new THREE.TorusGeometry(0.27, 0.035, 5, 16)),
      art.material(P.ink),
    );
    wheel.position.set(xx, 0.29, 0);
    g.add(wheel);
  }
  art.box(g, 0, 0.4, 0, 0.8, 0.05, 0.05, 0xb55f65);
  const frame = art.box(g, 0.1, 0.56, 0, 0.65, 0.05, 0.05, 0xb55f65);
  frame.rotation.z = 0.6;
  art.box(g, 0.4, 0.62, 0, 0.045, 0.65, 0.045, P.ink);
  art.box(g, 0.4, 0.94, 0, 0.08, 0.04, 0.35, P.ink);
  art.box(g, -0.18, 0.69, 0, 0.27, 0.06, 0.16, P.ink);
}

function batchStatic(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const batches = new Map<string, THREE.Mesh[]>();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || Array.isArray(obj.material)) return;
    const key = `${obj.geometry.uuid}:${obj.material.uuid}:${obj.castShadow}:${obj.receiveShadow}`;
    const group = batches.get(key) ?? [];
    group.push(obj);
    batches.set(key, group);
  });
  batches.forEach((meshes) => {
    if (meshes.length < 3) return;
    const batch = new THREE.InstancedMesh(
      meshes[0].geometry,
      meshes[0].material,
      meshes.length,
    );
    batch.castShadow = meshes[0].castShadow;
    batch.receiveShadow = meshes[0].receiveShadow;
    meshes.forEach((mesh, i) => {
      batch.setMatrixAt(i, mesh.matrixWorld);
      mesh.removeFromParent();
    });
    batch.computeBoundingSphere();
    root.add(batch);
  });
}
