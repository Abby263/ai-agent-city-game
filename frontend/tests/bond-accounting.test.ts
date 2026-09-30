import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import {
  getSessionCity, saveSessionCity, seedSession, sessionConversations,
  sessionAct, sessionMemories, sessionPause, sessionRelationships, sessionTakeControl,
} from "../src/lib/session-simulation";
import type { ActInterpretation } from "../src/lib/acts";
import type { BondSnapshot, CityState, ConversationImpact, Relationship, SessionCognitionRequest, SessionCognitionResponse } from "../src/lib/types";

// Per-file Node isolation and in-memory storage keep real saved worlds untouched.
const storage = new Map<string, string>();
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;
const actorId = "cit_009", targetId = "cit_010";
const metrics = ["trust", "warmth", "familiarity", "affection", "jealousy", "resentment", "admiration"] as const;
const initial: BondSnapshot = { trust: 60, warmth: 64, familiarity: 40, affection: 10, jealousy: 12, resentment: 20, admiration: 14 };
// An argument read as a tense act of intensity 1 (two steps): the person argued with warms less and resents more;
// both know each other a little better. The final bonds come from what the reaction actually persisted.
const postAction: Record<string, BondSnapshot> = {
  [actorId]: { ...initial, familiarity: 43 },
  [targetId]: { ...initial, trust: 56, warmth: 58, familiarity: 43, resentment: 28 },
};
/** The game master's reading of "argue about the plan". */
const argument = async (): Promise<ActInterpretation> => ({ allowed: true, refusal: "", headline: "Aoi argued with Ren about the plan.", target_id: targetId,
  involved_ids: [actorId, targetId], location_id: "", tone: "tense", intensity: 1, harm: 0, money: 0, proposal: "none", closes_location: false,
  reaction: "Aoi just argued with you about the plan.", target_memory: "Aoi argued with me about the plan." });
const argue = (generate: (request: SessionCognitionRequest) => Promise<SessionCognitionResponse>) => sessionAct(actorId, targetId, "argue about the plan", argument, generate);
let networkCalls = 0;
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
} } });
globalThis.fetch = async () => { networkCalls++; throw new Error("Real network calls are forbidden in bond-accounting tests"); };

const other = (id: string) => id === actorId ? targetId : actorId;
const pairBonds = () => sessionRelationships().filter((r) => [actorId, targetId].includes(r.citizen_id) && r.other_citizen_id === other(r.citizen_id));
const snapshot = (r: Relationship): BondSnapshot => ({
  trust: r.trust, warmth: r.warmth, familiarity: r.familiarity,
  affection: r.feelings!.affection, jealousy: r.feelings!.jealousy,
  resentment: r.feelings!.resentment, admiration: r.feelings!.admiration,
});
const stored = () => [...storage.entries()].sort(([a], [b]) => a.localeCompare(b));
const memories = () => [actorId, targetId].map((id) => sessionMemories(id));
const changes = (before: BondSnapshot, after: BondSnapshot) => Object.fromEntries(metrics
  .filter((key) => before[key] !== after[key]).map((key) => [key, after[key] - before[key]]));

beforeEach(() => {
  storage.clear();
  networkCalls = 0;
  const city = createInitialCity();
  city.policy.time_mode = "fast";
  city.simulation_mode = "manual";
  city.policy.simulation_mode = "manual";
  city.clock.running = false;
  for (const c of city.citizens) {
    c.x = c.target_x = 6;
    c.y = c.target_y = 5;
    c.current_location_id = "loc_homes";
    c.current_activity = "Resting at home";
  }
  seedSession(city);
  const relationships = sessionRelationships();
  for (const r of relationships) {
    if (![actorId, targetId].includes(r.citizen_id) || r.other_citizen_id !== other(r.citizen_id)) continue;
    r.trust = initial.trust; r.warmth = initial.warmth; r.familiarity = initial.familiarity;
    r.feelings = { affection: initial.affection, jealousy: initial.jealousy, resentment: initial.resentment, admiration: initial.admiration };
    r.history = [];
    delete r.last_changed_at;
  }
  const key = [...storage.keys()].find((key) => key.endsWith(".relationships"));
  assert.ok(key, "seedSession must create isolated relationship storage");
  storage.set(key, JSON.stringify(relationships));
  const seeded = getSessionCity()!;
  for (const id of [actorId, targetId]) {
    const c = seeded.citizens.find((c) => c.citizen_id === id)!;
    c.relationship_scores[other(id)] = 62;
    c.friend_ids = [...c.friend_ids.filter((friend) => friend !== other(id)), other(id)];
    c.mood = "Calm before the argument";
  }
  saveSessionCity(seeded);
  assert.equal(pairBonds().length, 2);
});
afterEach(() => { assert.equal(networkCalls, 0, "even swallowed network attempts fail this test"); });
after(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

function response(request: SessionCognitionRequest): SessionCognitionResponse {
  return {
    thought: "We disagreed about the plan.", mood: "Thoughtful", memory: "PROVIDER actor memory",
    reflection: "Listen before making another plan.", importance: 0.7,
    participant_memories: { [actorId]: "PROVIDER actor memory", [targetId]: "PROVIDER target memory" },
    participant_outcomes: {
      [actorId]: { mood: "Upset", relationship_effect: "negative", relationship_reason: "They dismissed my proposal.",
        feelings: { affection: -3, jealousy: 2, resentment: 4, admiration: -2, reason: "They interrupted my explanation." } },
      [targetId]: { mood: "Relieved", relationship_effect: "positive", relationship_reason: "They listened to my objection.",
        feelings: { affection: 3, jealousy: -2, resentment: -4, admiration: 5, reason: "They finally understood my objection." } },
    },
    conversation: {
      conversation_id: "bond-accounting-reply", game_day: request.city.clock.day,
      game_minute: request.city.clock.minute_of_day, location_id: "loc_homes",
      actor_ids: [actorId, targetId], summary: "An argument followed by a mixed reaction.",
      transcript: [{ speaker_id: actorId, text: request.player_utterance || "I disagree with that plan." },
        { speaker_id: targetId, text: "I understand, but please hear my objection." }],
    },
  };
}

function assertSynced(city: CityState, expected: Record<string, BondSnapshot>) {
  for (const id of [actorId, targetId]) {
    const c = city.citizens.find((c) => c.citizen_id === id)!;
    const b = expected[id];
    assert.equal(c.relationship_scores[other(id)], (b.trust + b.warmth) / 2, `${id}: score matches directed bond`);
    const friends = b.trust >= 58 && b.warmth >= 58 && b.familiarity >= 35;
    assert.equal(c.friend_ids.filter((friend) => friend === other(id)).length, friends ? 1 : 0, `${id}: friendship threshold and uniqueness`);
  }
}

function assertHistory(r: Relationship, withConversation: boolean) {
  const entries = r.history!;
  assert.equal(entries.length, withConversation ? 2 : 1, "exactly one record per action and response");
  const action = entries[0];
  assert.equal(action.source, "action");
  assert.equal(action.conversation_id, undefined, "an action must not invent a conversation ID");
  assert.deepEqual(action.before, initial);
  assert.deepEqual(action.after, postAction[r.citizen_id]);
  assert.deepEqual(action.changes, changes(initial, postAction[r.citizen_id]));
  if (withConversation) {
    const final = snapshot(r);
    const conversation = entries[1];
    assert.equal(conversation.source, "conversation");
    assert.equal(conversation.conversation_id, "bond-accounting-reply");
    assert.deepEqual(conversation.before, postAction[r.citizen_id]);
    assert.deepEqual(conversation.after, final);
    assert.deepEqual(conversation.changes, changes(postAction[r.citizen_id], final));
    for (const key of metrics) {
      assert.equal((action.changes?.[key] ?? 0) + (conversation.changes?.[key] ?? 0), final[key] - initial[key], `${key}: no missing or double-counted action delta`);
    }
  }
}

for (const controlled of [false, true]) {
  const label = controlled ? "player" : "NPC";
  test(`${label}: an argument's impacts retain pre-action, post-action and final bonds`, async () => {
    if (controlled) await sessionTakeControl(actorId);
    let actionBonds: Relationship[] = [], actionCity: CityState | undefined;
    const result = await argue(async (request) => {
      actionBonds = pairBonds();
      actionCity = getSessionCity()!;
      return response(request);
    });
    assert.equal(result.talked, true, result.error);
    assert.ok(actionCity, "the provider saw committed action mechanics");
    assertSynced(actionCity, postAction);
    for (const r of actionBonds) {
      assert.deepEqual(snapshot(r), postAction[r.citizen_id]);
      assertHistory(r, false);
    }
    const conversations = sessionConversations();
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].impacts?.length, 2);
    const final: Record<string, BondSnapshot> = {};
    for (const r of pairBonds()) {
      final[r.citizen_id] = snapshot(r);
      const impact: ConversationImpact = conversations[0].impacts!.find((i) => i.citizen_id === r.citizen_id)!;
      assert.equal(impact.other_citizen_id, r.other_citizen_id);
      assert.deepEqual(impact.before, initial);
      assert.deepEqual(impact.action_after, postAction[r.citizen_id]);
      assert.deepEqual(impact.after, snapshot(r), "visible impact equals persisted final relationship");
      assert.equal(impact.mood_before, "Calm before the argument");
      assertHistory(r, true);
    }
    assertSynced(result.city, final);
    assertSynced(getSessionCity()!, final);
  });

  test(`${label}: provider failure preserves action history without fake chat or provider memories`, async () => {
    if (controlled) await sessionTakeControl(actorId);
    const beforeMemories = memories();
    let committed: ReturnType<typeof stored> | undefined;
    const result = await argue(async () => {
      committed = stored();
      throw new Error("Bond provider unavailable");
    });
    assert.ok(committed);
    assert.equal(result.talked, false);
    assert.equal(result.error, "Bond provider unavailable");
    assert.deepEqual(stored(), committed, "provider failure does not rewrite the committed action");
    assert.equal(sessionConversations().length, 0);
    for (const r of pairBonds()) {
      assert.deepEqual(snapshot(r), postAction[r.citizen_id]);
      assertHistory(r, false);
    }
    assertSynced(getSessionCity()!, postAction);
    assert.notDeepEqual(memories(), beforeMemories, "the real argument still creates action memories");
    assert.ok(memories().flat().every((m) => !m.content.includes("PROVIDER")));
  });

  for (const settle of ["resolve", "reject"] as const) {
    test(`${label}: pause discards pending ${settle} without late memories or bond writes`, async () => {
      if (controlled) await sessionTakeControl(actorId);
      let resolve!: (response: SessionCognitionResponse) => void, reject!: (error: Error) => void;
      const gate = new Promise<SessionCognitionResponse>((yes, no) => { resolve = yes; reject = no; });
      let request: SessionCognitionRequest | undefined;
      const pending = argue((r) => { request = r; return gate; });
      // The act is interpreted first; wait until their reaction is actually being generated.
      for (let i = 0; !request && i < 200; i++) await new Promise((resolve) => setTimeout(resolve, 0));
      assert.ok(request, "the response is pending before pause");
      for (const r of pairBonds()) assertHistory(r, false);
      await sessionPause();
      const pausedMemories = memories(), pausedBonds = pairBonds(), pausedStorage = stored();
      if (settle === "resolve") resolve(response(request));
      else reject(new Error("Late bond provider failure"));
      const result = await pending;
      assert.equal(result.talked, false);
      assert.deepEqual(stored(), pausedStorage, "all isolated storage keys remain unchanged after pause");
      assert.deepEqual(memories(), pausedMemories);
      assert.deepEqual(pairBonds(), pausedBonds);
      assert.equal(sessionConversations().length, 0);
      assertSynced(getSessionCity()!, postAction);
    });
  }
}
