import assert from "node:assert/strict";
import { test } from "node:test";

// The town layout is chosen when it is first loaded, so this file loads it as Lucknow.
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => (k === "agentcity.city" ? "lucknow" : null), setItem: () => {} } },
  configurable: true,
});

test("Lucknow's streets are built up wall to wall, and every place can still be reached on foot", async () => {
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
    for (const road of [13.5, 26.5]) {
      if (t.x < 40) assert.ok(Math.abs(t.x - road) >= 2.5 + t.w / 2 - 0.01 || Math.abs(t.z - road) >= 2.5 + t.d / 2 - 0.01 || !(Math.abs(t.x - road) < 2.5 && Math.abs(t.z - road) < 2.5), `${t.id} in a junction`);
      assert.ok(Math.abs(t.z - road) >= 2.5 + t.d / 2 - 0.01 || t.face === "e" || t.face === "w", `${t.id} stands in the east-west road at z=${road}`);
    }
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
