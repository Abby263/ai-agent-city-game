import assert from "node:assert/strict";
import { test } from "node:test";

// The town layout is chosen when it is first loaded, so this file loads it as Lucknow.
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => (k === "agentcity.city" ? "lucknow" : null), setItem: () => {} } },
  configurable: true,
});

test("Lucknow's streets are built up wall to wall, and every place can still be reached on foot", async () => {
  const { inRoad } = await import("../src/game/three/streets");
  const { arrivals, buildings, homeDoor, isWalkable, walkablePoint, walkingRoute } = await import("../src/game/three/layout");
  const walls = buildings.filter((b) => b.style === "wall" || b.style === "railing");
  assert.ok(walls.length >= 40, `open plots are walled off from the road (${walls.length} panels)`);
  const terraces = buildings.filter((b) => b.kind === "terrace" && b.style !== "wall" && b.style !== "railing");
  assert.ok(terraces.length >= 55, `the streets and lanes are built up (${terraces.length} terraces)`);
  for (const style of ["chowk", "ganj", "mohalla"]) assert.ok(terraces.some((b) => b.style === style), `there are ${style} buildings`);
  // Terraces never stand on another building, in a road, or on a place people arrive at.
  const places = buildings.filter((b) => b.kind !== "terrace");
  for (const t of terraces) {
    for (const p of places) assert.ok(Math.abs(t.x - p.x) >= (t.w + p.w) / 2 || Math.abs(t.z - p.z) >= (t.d + p.d) / 2, `${t.id} overlaps ${p.id}`);
    assert.ok(!inRoad(t.x - t.w / 2, t.z - t.d / 2, t.x + t.w / 2, t.z + t.d / 2, 0.85), `${t.id} stands in a road`);
    for (const [id, p] of Object.entries(arrivals)) assert.ok(Math.abs(t.x - p.x) > t.w / 2 + 1 || Math.abs(t.z - p.z) > t.d / 2 + 1, `${t.id} crowds ${id}`);
  }
  for (let i = 0; i < terraces.length; i++) for (let j = i + 1; j < terraces.length; j++) {
    const a = terraces[i], b = terraces[j];
    assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 0.01 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2 - 0.01, `${a.id} overlaps ${b.id}`);
  }
  // Walking: from the old-city lane to every place and every front door.
  const start = walkablePoint(arrivals.loc_homes);
  const targets = [...Object.entries(arrivals), ...["home_a", "home_b", "home_c", "home_d", "home_e", "home_f", "home_g", "home_h"].map((id, i): [string, { x: number; z: number }] => [id, homeDoor(i, id)])];
  for (const [id, point] of targets) {
    const end = walkablePoint(point);
    assert.ok(isWalkable(end));
    assert.ok(Math.hypot(end.x - point.x, end.z - point.z) < 1.6, `${id}'s arrival point is open ground`);
    assert.ok(id === "loc_homes" || walkingRoute(start, end).length > 0, `${id} can be walked to`);
  }
});

test("Lucknow's old city has its own street map: bent, narrow roads, a chauraha and a gate", async () => {
  const { CHAURAHA, CHOWK, GATE, at, roadClearance, span } = await import("../src/game/three/streets");
  const { buildings, isWalkable, walkingRoute, walkablePoint } = await import("../src/game/three/layout");
  const { pointOnLoop } = await import("../src/game/three/traffic");
  for (const street of CHOWK) {
    const [from, to] = span(street);
    const positions = Array.from({ length: 40 }, (_, i) => at(street, from + ((to - from) * i) / 39));
    assert.ok(Math.max(...positions) - Math.min(...positions) > 0.8, `${street.id} bends`);
    assert.ok(street.half <= 1.5, `${street.id} is narrower than Nakameguro's five-unit streets`);
    // Nothing the game uses stands in the road, and the road can be walked from end to end.
    for (let s = from + 1; s < to - 1; s += 0.5) {
      const [x, z] = street.axis === "x" ? [s, at(street, s)] : [at(street, s), s];
      const hit = buildings.find((b) => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2);
      assert.ok(!hit, `${hit?.id} stands in ${street.id}`);
    }
    const a = walkablePoint(street.axis === "x" ? { x: from + 1, z: at(street, from + 1) } : { x: at(street, from + 1), z: from + 1 });
    const b = walkablePoint(street.axis === "x" ? { x: to - 1, z: at(street, to - 1) } : { x: at(street, to - 1), z: to - 1 });
    assert.ok(walkingRoute(a, b).length > 0, `${street.id} can be walked`);
  }
  assert.ok(!isWalkable({ x: CHAURAHA.x, z: CHAURAHA.z }), "the chauraha's island is railed off");
  assert.ok(roadClearance(GATE.x, GATE.z) < -1, "the gate stands over the bazaar road");
  // Traffic keeps to the roads and goes round the island, never over it.
  for (let d = 0; d < 400; d += 0.4) {
    const p = pointOnLoop(d);
    assert.ok(p.x > 39 || roadClearance(p.x, p.z) < -0.2, `traffic leaves the road at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
    assert.ok(Math.hypot(p.x - CHAURAHA.x, p.z - CHAURAHA.z) > CHAURAHA.island + 0.45, "traffic drives over the island");
  }
});
