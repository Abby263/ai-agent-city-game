import assert from "node:assert/strict";
import test from "node:test";
import { achievements, unlockNew } from "../src/lib/achievements";
import { createInitialCity } from "../src/lib/initial-city";
import type { Conversation, Relationship } from "../src/lib/types";

const storage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
} as Storage;

const conversation = { conversation_id: "c1", transcript: [], actor_ids: [] } as unknown as Conversation;
const friends = { trust: 70, warmth: 70, familiarity: 50 } as Relationship;

test("a brand-new world has no badges yet", () => {
  const city = createInitialCity();
  assert.deepEqual(achievements.filter((a) => a.earned({ city, conversations: [], relationships: [] })).map((a) => a.id), []);
});

test("badges unlock from real play and never relock", () => {
  storage.clear();
  const city = createInitialCity();
  city.policy.player_citizen_id = city.citizens[0].citizen_id;
  const first = unlockNew({ city, conversations: [conversation], relationships: [friends] });
  assert.deepEqual(first.fresh.map((a) => a.id).sort(), ["first_hello", "friendship", "in_their_shoes"]);
  city.policy.player_citizen_id = null;
  const again = unlockNew({ city, conversations: [], relationships: [] });
  assert.equal(again.fresh.length, 0);
  assert.ok(again.unlocked.in_their_shoes);
});

test("calendar badges follow the week", () => {
  const city = createInitialCity();
  city.clock.day = 6;
  const earned = achievements.filter((a) => a.earned({ city, conversations: [], relationships: [] })).map((a) => a.id);
  assert.ok(earned.includes("weekend"));
  assert.ok(!earned.includes("whole_week"));
});
