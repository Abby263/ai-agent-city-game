import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arrivals,
  buildings,
  citizenPoint,
  isWalkable,
  walkablePoint,
  walkingRoute,
} from "../src/game/three/layout";
import type { CitizenAgent } from "../src/lib/types";

test("every public location is reachable from every other location", () => {
  for (const [fromId, from] of Object.entries(arrivals)) {
    for (const [toId, to] of Object.entries(arrivals)) {
      const route = walkingRoute(from, to);
      assert.ok(route.length, `${fromId} -> ${toId}`);
      assert.deepEqual(route.at(-1), walkablePoint(to));
      for (let i = 0; i < route.length; i++) {
        const point = route[i];
        assert.ok(isWalkable(point));
        if (i > 0) {
          const previous = route[i - 1];
          assert.ok(
            Math.hypot(point.x - previous.x, point.z - previous.z) <=
              Math.SQRT1_2 + 0.001,
          );
          assert.ok(
            isWalkable({ x: point.x, z: previous.z }),
            "no corner cutting",
          );
          assert.ok(
            isWalkable({ x: previous.x, z: point.z }),
            "no corner cutting",
          );
        }
      }
    }
  }
});

test("building interiors, pond, and off-map coordinates resolve to walkable ground", () => {
  for (const building of buildings) {
    assert.equal(isWalkable(building), false);
    assert.ok(isWalkable(walkablePoint(building)));
  }
  assert.equal(isWalkable({ x: 22, z: 32 }), false);
  for (const point of [
    { x: -100, z: 800 },
    { x: 22, z: 32 },
  ]) {
    const resolved = walkablePoint(point);
    assert.ok(isWalkable(resolved));
    assert.ok(
      resolved.x >= 0 && resolved.x < 40 && resolved.z >= 0 && resolved.z < 40,
    );
  }
});

test("path searches do not mutate the shared navigation grid", () => {
  const first = walkingRoute(arrivals.loc_homes, arrivals.loc_school);
  walkingRoute(arrivals.loc_farm, arrivals.loc_hospital);
  assert.deepEqual(
    walkingRoute(arrivals.loc_homes, arrivals.loc_school),
    first,
  );
});

test("home occupants have distinct safe positions without changing simulation state", () => {
  const citizen = {
    x: 6,
    y: 6,
    target_x: 6,
    target_y: 6,
    current_location_id: "loc_homes",
  } as CitizenAgent;
  const positions = Array.from({ length: 5 }, (_, index) =>
    citizenPoint(citizen, index),
  );
  assert.equal(
    new Set(positions.map((point) => `${point.x},${point.z}`)).size,
    5,
  );
  assert.ok(positions.every(isWalkable));
  assert.equal(citizen.x, 6);
  assert.equal(citizen.y, 6);
});
