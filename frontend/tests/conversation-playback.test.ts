import { test } from "node:test";
import assert from "node:assert/strict";
import { newExchanges, subtitleDuration } from "../src/lib/conversation-playback";
import { arrivals, buildings, isWalkable, walkingRoute } from "../src/game/three/layout";
import type { Conversation } from "../src/lib/types";
import * as THREE from "three";
import { conversationCameraOffset, conversationStaging } from "../src/game/three/conversation-camera";

const exchange = (id: string, minute = 360): Conversation => ({
  conversation_id: id, game_day: 1, game_minute: minute, location_id: "loc_homes",
  actor_ids: ["cit_009", "cit_010"], summary: "Hello",
  transcript: [{ speaker_id: "cit_009", text: "Hello Mateo." }, { speaker_id: "cit_010", text: "Hi Ava." }],
});
test("history does not replay, new exchanges play oldest first exactly once", () => {
  const known = new Set(["saved"]);
  assert.deepEqual(newExchanges(known, [exchange("saved")]), []);
  assert.deepEqual(newExchanges(known, [exchange("later", 390), exchange("first", 375), exchange("first", 375)]).map((c) => c.conversation_id), ["first", "later"]);
  assert.deepEqual(newExchanges(known, [exchange("later", 390)]), []);
});
test("empty transcripts cannot block the world in an empty playback", () => {
  assert.deepEqual(newExchanges(new Set(), [{ ...exchange("empty"), transcript: [] }]), []);
});
test("subtitles have bounded reading time independent of simulation speed", () => {
  assert.equal(subtitleDuration("Hi."), 4000);
  assert.ok(subtitleDuration("An actual sentence that takes a little longer to read than hello.") > 4000);
  assert.equal(subtitleDuration("word ".repeat(500)), 18000);
});
test("conversation staging points are reachable at every city location", () => {
  for (const origin of Object.values(arrivals)) {
    const { center, points } = conversationStaging(origin, new THREE.Group());
    for (const point of points) {
      assert.ok(isWalkable(point));
      assert.ok(walkingRoute(center, point).length);
    }
    assert.notDeepEqual(points[0], points[1]);
  }
});

test("hospital conversations step out of the narrow courtyard for a close two-shot", () => {
  const town = new THREE.Group();
  for (const b of buildings) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.4, b.h + 1.5, b.d + 0.4), new THREE.MeshBasicMaterial());
    mesh.position.set(b.x, (b.h + 1.5) / 2, b.z);
    town.add(mesh);
  }
  const { center, points } = conversationStaging(arrivals.loc_hospital, town);
  const offset = conversationCameraOffset(new THREE.Vector3(center.x, -0.25, center.z), points.map((p) => new THREE.Vector3(p.x, 1.35, p.z)), town, 7.5, true);
  assert.ok(offset.y <= 6, "The camera should not retreat to an aerial view");
  points.forEach((p) => assert.ok(walkingRoute(arrivals.loc_hospital, p).length));
  town.children.forEach((child) => { const mesh = child as THREE.Mesh; mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); });
});
test("camera picks a clear angle rather than hiding speakers behind a building", () => {
  const town = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 3), new THREE.MeshBasicMaterial());
  roof.position.set(0, 4, 4);
  town.add(roof);
  const target = new THREE.Vector3(0, -1.2, 0);
  const heads = [new THREE.Vector3(-1, 1.35, 0), new THREE.Vector3(1, 1.35, 0)];
  const offset = conversationCameraOffset(target, heads, town, 11);
  assert.notEqual(offset.x, 0);
  const right = new THREE.Vector3(offset.z, 0, -offset.x).normalize();
  assert.ok(Math.abs(heads[0].clone().sub(heads[1]).dot(right)) >= 1, "Both people must remain visually separated");
  const position = target.clone().add(offset);
  for (const head of heads) {
    const direction = head.clone().sub(position);
    assert.equal(new THREE.Raycaster(position, direction.clone().normalize(), 0, direction.length() - 0.15).intersectObject(town, true).length, 0);
  }
  roof.geometry.dispose();
  (roof.material as THREE.Material).dispose();
});
