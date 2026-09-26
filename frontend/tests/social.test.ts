import { test } from "node:test";
import assert from "node:assert/strict";
import { evolveRelationship, bondLabel, conversationImpact } from "../src/lib/social";
import { sociallyAvailable } from "../src/lib/encounters";
import { bondClusters, overviewBonds, bondValue } from "../src/lib/bond-network";
import { createInitialCity } from "../src/lib/initial-city";
import type { Relationship } from "../src/lib/types";

const initial: Relationship = {
  relationship_id: "a-b",
  citizen_id: "a",
  other_citizen_id: "b",
  familiarity: 30,
  trust: 42,
  warmth: 42,
  notes: "",
};
test("impact captures actual clamped values and is independent of future changes", () => {
  const before = { ...initial, trust: 99, feelings: { affection: 99, jealousy: 0, resentment: 0, admiration: 0 } };
  const outcome = { relationship_effect: "positive" as const, relationship_reason: "Kept a promise.", feelings: { affection: 8, reason: "I felt included." } };
  const after = evolveRelationship(before, outcome, 1, 360);
  const impact = conversationImpact(before, after, outcome, "Worried", "Relieved", 1, 360);
  assert.equal(impact.after.affection - impact.before.affection, 1);
  assert.equal(impact.after.trust - impact.before.trust, 1);
  assert.equal(impact.mood_before, "Worried");
  after.feelings!.affection = 0;
  assert.equal(impact.after.affection, 100);
  const repeated = evolveRelationship(after, outcome, 1, 375);
  assert.equal(conversationImpact(after, repeated, outcome, "Calm", "Happy", 1, 375).status, "cooldown");
  assert.equal(conversationImpact(before, before, undefined, "Calm", "Calm", 1, 360).status, "not_assessed");
});

test("friendship clusters require reciprocal friends and leave strangers ungrouped", () => {
  const citizens = createInitialCity().citizens.slice(0, 3);
  const [a, b] = citizens.map((c) => c.citizen_id);
  const forward = { ...initial, citizen_id: a, other_citizen_id: b, trust: 70, warmth: 70, familiarity: 50 };
  const reverse = { ...initial, citizen_id: b, other_citizen_id: a };
  assert.equal(bondClusters(citizens, [forward, reverse]).length, 3);
  const mutual = { ...reverse, trust: 65, warmth: 65, familiarity: 50 };
  assert.deepEqual(bondClusters(citizens, [forward, mutual])[0], [a, b]);
  assert.equal(bondValue(forward, "trust"), 70);
  assert.equal(bondValue(mutual, "trust"), 65);
  assert.equal(overviewBonds([forward, mutual], "trust").length, 1);
  assert.equal(overviewBonds([initial, { ...initial, citizen_id: "b", other_citizen_id: "a" }], "trust").length, 0);
});

test("network overview is bounded to a forest and includes witnessed acquaintances", () => {
  const relationships = ["a", "b", "c", "d"].flatMap((a) => ["a", "b", "c", "d"].filter((b) => a !== b).map((b) => ({
    ...initial, relationship_id: a + b, citizen_id: a, other_citizen_id: b,
    history: [{ day: 1, minute: 360, reason: "Met", effect: "neutral" }],
  })));
  assert.equal(overviewBonds(relationships, "trust").length, 3);
  assert.deepEqual(overviewBonds(relationships, "trust"), overviewBonds(relationships.slice().reverse(), "trust"));
});
test("small talk builds familiarity, not automatic friendship", () => {
  let bond = initial;
  for (let day = 1; day < 10; day++)
    bond = evolveRelationship(
      bond,
      { relationship_effect: "neutral", relationship_reason: "We said hello." },
      day,
      360,
    );
  assert.equal(bond.trust, 42);
  assert.equal(bondLabel(bond), "Acquaintances");
});
test("hurt can reduce trust, with evidence in history", () => {
  const next = evolveRelationship(
    initial,
    {
      relationship_effect: "negative",
      relationship_reason: "They mocked my project.",
    },
    1,
    360,
  );
  assert.equal(next.trust, 37);
  assert.equal(next.history?.[0].reason, "They mocked my project.");
  assert.equal(initial.trust, 42);
});
test("repeating positive exchanges cannot farm trust", () => {
  const positive = {
    relationship_effect: "positive" as const,
    relationship_reason: "They helped with my project.",
  };
  const first = evolveRelationship(initial, positive, 1, 360);
  const repeated = evolveRelationship(first, positive, 1, 375);
  assert.equal(repeated.trust, first.trust);
  assert.equal(repeated.history?.length, 2);
});
test("an unsupported relationship claim changes no trust", () => {
  assert.equal(
    evolveRelationship(initial, { relationship_effect: "positive" }, 1, 360)
      .trust,
    42,
  );
});

test("feelings require evidence, stay bounded, and are not mutual", () => {
  const change = { affection: 90, jealousy: -90, resentment: 4, admiration: NaN };
  const unsupported = evolveRelationship(initial, { feelings: change }, 1, 360);
  assert.deepEqual(unsupported.feelings, { affection: 0, jealousy: 0, resentment: 0, admiration: 0 });
  const next = evolveRelationship(initial, { mood: "Conflicted", feelings: { ...change, reason: "They helped me but mocked my sketch." } }, 1, 360, "exchange-1");
  assert.deepEqual(next.feelings, { affection: 8, jealousy: 0, resentment: 4, admiration: 0 });
  assert.equal(initial.feelings, undefined);
  assert.equal(next.history?.[0].conversation_id, "exchange-1");
  assert.equal(next.history?.[0].mood, "Conflicted");
  const repaired = evolveRelationship(next, { feelings: { resentment: -3, reason: "They apologized for mocking my sketch." } }, 1, 510);
  assert.equal(repaired.feelings?.resentment, 1);
  assert.equal(next.history?.[0].feelings?.resentment, 4);
});

test("physical availability excludes travel, player control and sleeping", () => {
  const citizens = createInitialCity().citizens.slice(0, 3);
  citizens[0].target_x += 1;
  assert.equal(sociallyAvailable(citizens[0]), false);
  assert.equal(sociallyAvailable(citizens[1], citizens[1].citizen_id), false);
  citizens[0].target_x = citizens[0].x;
  assert.equal(sociallyAvailable(citizens[0]), true);
  citizens[2].current_activity = "Sleeping";
  assert.equal(sociallyAvailable(citizens[2]), false);
});
