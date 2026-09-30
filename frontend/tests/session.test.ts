import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createInitialCity } from "../src/lib/initial-city";
import { api } from "../src/lib/api";
import {
  seedSession,
  sessionAssignTask,
  sessionTick,
  sessionPause,
  sessionMemories,
  sessionTakeControl,
  sessionSpeak,
  sessionConversations,
  getSessionCity,
  sessionWalkTo,
  sessionRelationships,
  saveSessionCity,
  sessionSetMode,
  sessionStart,
} from "../src/lib/session-simulation";
import type {
  SessionCognitionResponse,
  SessionTaskPlanResponse,
} from "../src/lib/types";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  },
  configurable: true,
});
const [actorId, targetId] = ["cit_009", "cit_010"];
const approach: import("../src/lib/encounters").DecideSocial = async (request) => ({
  target_id: request.nearby[0].citizen_id, reason: "I want company while I draw.", topic: "my drawing",
});
beforeEach(() => {
  storage.clear();
  const city = createInitialCity();
  for (const citizen of city.citizens) {
    citizen.x = 6;
    citizen.y = 5;
    citizen.target_x = 6;
    citizen.target_y = 5;
  }
  seedSession(city);
});

test("v12 starts fresh without importing a v11 world, conversations or private memories", () => {
  storage.clear();
  const old = createInitialCity();
  old.citizens[0].age = 13;
  storage.set("agentcity.v11.city", JSON.stringify(old));
  storage.set("agentcity.v11.conversations", JSON.stringify([{ conversation_id: "old-chat" }]));
  storage.set("agentcity.v11.memory.cit_009", JSON.stringify([{ content: "OLD PRIVATE MEMORY" }]));
  assert.equal(getSessionCity(), null);
  seedSession(createInitialCity());
  assert.ok(storage.has("agentcity.v12.city"));
  assert.ok(getSessionCity()!.citizens.every((c) => c.age >= 18));
  assert.equal(sessionConversations().length, 0);
  assert.ok(!sessionMemories("cit_009").some((m) => m.content.includes("OLD PRIVATE MEMORY")));
  assert.ok(storage.has("agentcity.v11.city"), "old data is left untouched, not migrated or deleted");
});

test("cast refresh preserves journals, bonds, life state and player-authored prompts", () => {
  const original = getSessionCity()!;
  const resident = original.citizens[0];
  resident.name = "Previous name";
  resident.personality.identity = {};
  resident.personality.appearance = {};
  resident.personality.prompt = "A private player-written persona";
  resident.personality.prompt_edited = true;
  resident.memory_summary = "PRIVATE: a conversation I remember";
  resident.relationship_scores[targetId] = 76;
  resident.money = 1234;
  const memories = sessionMemories(actorId);
  const relationships = sessionRelationships(actorId);
  saveSessionCity(original);
  const refreshed = seedSession(createInitialCity()).citizens[0];
  assert.equal(refreshed.name, "Aoi Takahashi");
  assert.equal(refreshed.personality.prompt, "A private player-written persona");
  assert.equal(refreshed.memory_summary, "PRIVATE: a conversation I remember");
  assert.equal(refreshed.relationship_scores[targetId], 76);
  assert.equal(refreshed.money, 1234);
  assert.deepEqual(sessionMemories(actorId), memories);
  assert.deepEqual(sessionRelationships(actorId), relationships);
});
const plan: SessionTaskPlanResponse = {
  task_kind: "go_with_citizen",
  target_citizen_ids: [targetId],
  location_id: "loc_bank",
  reasoning_summary: "Ask first",
  player_visible_plan: "Invite Ren to the bank.",
};
function reply(): SessionCognitionResponse {
  return {
    thought: "Ren declined.",
    mood: "Disappointed",
    memory: "Ren said no.",
    reflection: "Respect the answer.",
    importance: 0.6,
    conversation: {
      conversation_id: "test-conversation",
      game_day: 1,
      game_minute: 375,
      location_id: "loc_homes",
      actor_ids: [actorId, targetId],
      summary: "An invitation was declined.",
      transcript: [
        { speaker_id: actorId, text: "Want to come to the bank?" },
        { speaker_id: targetId, text: "No, I need to study." },
      ],
    },
    participant_memories: {
      [actorId]: "Ren declined.",
      [targetId]: "I declined.",
    },
    participant_outcomes: {
      [targetId]: {
        invitation_response: "declined",
        relationship_effect: "neutral",
      },
      [actorId]: { task_complete: false, relationship_effect: "neutral" },
    },
  };
}
test("profile nature updates preserve learned memory, mood and active tasks", () => {
  const existing = getSessionCity()!;
  existing.citizens[0].personality.nature = { traits: ["Old"] };
  existing.citizens[0].personality.player_task = { task: "Keep my task", status: "active" };
  existing.citizens[0].memory_summary = "A real learned experience";
  existing.citizens[0].mood = "Reflective";
  saveSessionCity(existing);
  const updated = seedSession(createInitialCity());
  assert.deepEqual(updated.citizens[0].personality.nature, createInitialCity().citizens[0].personality.nature);
  assert.deepEqual(updated.citizens[0].personality.player_task, { task: "Keep my task", status: "active" });
  assert.equal(updated.citizens[0].memory_summary, "A real learned experience");
  assert.equal(updated.citizens[0].mood, "Reflective");
  const traits = updated.citizens.map((c) => JSON.stringify(c.personality.nature));
  assert.equal(new Set(traits).size, updated.citizens.length);
});

test("task exchanges persist directional impacts and original moods", async () => {
  const previousMood = getSessionCity()!.citizens.find((c) => c.citizen_id === actorId)!.mood;
  await sessionAssignTask(actorId, { task: "Go to the bank with Ren" }, async () => plan);
  const response = reply();
  response.participant_outcomes![actorId] = { mood: "Disappointed", relationship_effect: "neutral", feelings: { affection: -1, reason: "I was hoping for company." } };
  await sessionTick(async () => response);
  const conversation = sessionConversations()[0];
  assert.equal(conversation.impacts?.length, 2);
  const impact = conversation.impacts!.find((i) => i.citizen_id === actorId)!;
  assert.equal(impact.mood_before, previousMood);
  assert.equal(impact.mood_after, "Disappointed");
  assert.equal(impact.after.affection, 0);
  assert.equal(impact.reason, "I was hoping for company.");
});
test("a refusal never creates a companion journey", async () => {
  await sessionAssignTask(
    actorId,
    { task: "Go to the bank with Ren" },
    async () => plan,
  );
  const city = await sessionTick(async () => reply());
  assert.equal(
    city.citizens.find((c) => c.citizen_id === targetId)?.personality
      .companion_task,
    undefined,
  );
  assert.ok(
    city.events.some((event) => event.event_type === "invitation_unresolved"),
  );
  assert.equal(
    city.events.some((event) => event.event_type === "player_task_completed"),
    false,
  );
});
test("task listeners never receive the initiator's private instructions", async () => {
  const secret = "PRIVATE_REASON: I want to compare loan fees without telling Ren";
  await sessionAssignTask(actorId, { task: `Go to the bank with Ren. ${secret}` }, async () => plan);
  let called = false;
  await sessionTick(async (request) => {
    called = true;
    assert.ok(request.private_memories![actorId].join(" ").includes(secret));
    assert.ok(!request.private_memories![targetId].join(" ").includes(secret));
    return reply();
  });
  assert.ok(called);
});

test("same-minute dialogue stays chronological and excludes other places, people and future chats", async () => {
  await sessionTakeControl(actorId);
  const city = getSessionCity()!;
  const location = city.citizens.find((c) => c.citizen_id === actorId)!.current_location_id;
  const conversation = (text: string, extra = {}) => ({ ...reply().conversation!,
    conversation_id: text, game_day: city.clock.day, game_minute: city.clock.minute_of_day,
    location_id: location, transcript: [{ speaker_id: actorId, text }], ...extra });
  storage.set("agentcity.v12.conversations", JSON.stringify([
    conversation("FUTURE", { game_minute: city.clock.minute_of_day + 1 }),
    conversation("SOMEONE_ELSE", { actor_ids: [actorId, "cit_011"] }),
    conversation("OTHER_PLACE", { location_id: "loc_bank" }),
    conversation("Newest: ramen invitation"), conversation("Middle: gift"), conversation("Oldest: greeting"),
  ]));
  await sessionSpeak(targetId, "Which ramen place?", async (request) => {
    assert.deepEqual(request.prior_lines?.map((line) => line.text), ["Oldest: greeting", "Middle: gift", "Newest: ramen invitation"]);
    const result = reply();
    result.conversation!.transcript[0].text = "Which ramen place?";
    return result;
  });
});

test("memory retrieval deduplicates experiences and recalls the listener without copying their private memory", async () => {
  await sessionTakeControl(actorId);
  const memories = Array.from({ length: 9 }, (_, i) => ({
    memory_id: `m${i}`, citizen_id: actorId, content: `Other recent experience ${i}`,
    created_at: "Day 1 06:00", related_citizen_id: "cit_011", extra: {},
  }));
  const shared = { ...memories[0], content: "I gave Ren a gift", related_citizen_id: targetId };
  storage.set(`agentcity.v12.memory.${actorId}`, JSON.stringify([...memories, shared, { ...shared, memory_id: "duplicate" }]));
  storage.set(`agentcity.v12.memory.${targetId}`, JSON.stringify([{ ...shared, citizen_id: targetId, content: "PRIVATE_MATEO_FEELING" }]));
  await sessionSpeak(targetId, "Want ramen?", async (request) => {
    const recalled = request.private_memories![actorId].join(" ");
    assert.equal(recalled.split("I gave Ren a gift").length - 1, 1);
    assert.ok(!recalled.includes("PRIVATE_MATEO_FEELING"));
    assert.ok(request.private_memories![targetId].join(" ").includes("PRIVATE_MATEO_FEELING"));
    assert.ok(!recalled.includes("Other recent experience 8"), "memory window remains bounded");
    const result = reply();
    result.conversation!.transcript[0].text = "Want ramen?";
    return result;
  });
});
test("pause invalidates a pending response and its memories", async () => {
  await sessionAssignTask(
    actorId,
    { task: "Go to the bank with Ren" },
    async () => plan,
  );
  const count = sessionMemories(actorId).length;
  let release!: (value: SessionCognitionResponse) => void;
  const pending = sessionTick(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  assert.equal(typeof release, "function");
  await sessionPause();
  release(reply());
  const city = await pending;
  assert.equal(city.clock.running, false);
  assert.equal(sessionMemories(actorId).length, count);
  assert.equal(sessionConversations().length, 0);
});
test("invalid dialogue does not create memories", async () => {
  await sessionAssignTask(
    actorId,
    { task: "Go to the bank with Ren" },
    async () => plan,
  );
  const count = sessionMemories(actorId).length;
  await sessionTick(async () => ({ ...reply(), conversation: null }));
  assert.equal(sessionMemories(actorId).length, count);
});
test("player speech is sent verbatim and switching control interrupts it", async () => {
  await sessionTakeControl(actorId);
  let release!: (value: SessionCognitionResponse) => void;
  const pending = sessionSpeak(targetId, "How are you?", async (request) => {
    assert.equal(request.player_utterance, "How are you?");
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  await sessionTakeControl(targetId);
  release(reply());
  await pending;
  assert.equal(getSessionCity()?.policy.player_citizen_id, targetId);
  assert.equal(sessionConversations().length, 0);
});
test("player walks without spending a cognition call", async () => {
  await sessionTakeControl(actorId);
  await sessionWalkTo("loc_bank");
  let city = getSessionCity()!;
  for (let i = 0; i < 30 && city.policy.player_destination; i++) {
    city = await sessionTick(async () => {
      throw new Error("Walking must not call the LLM");
    });
  }
  assert.equal(
    city.citizens.find((c) => c.citizen_id === actorId)?.current_location_id,
    "loc_bank",
  );
  assert.equal(city.policy.player_destination, null);
  assert.equal(city.clock.running, false);
});

test("new YAML residents join through the app API without erasing memories or time", async () => {
  const city = getSessionCity()!;
  city.citizens = city.citizens.filter((c) => c.citizen_id !== "cit_027");
  city.clock.minute_of_day = 700;
  saveSessionCity(city);
  const memories = sessionMemories(actorId);
  const joined = await api.getState();
  assert.equal(joined.citizens.length, 26);
  assert.equal(joined.clock.minute_of_day, 700);
  assert.deepEqual(sessionMemories(actorId), memories);
  assert.equal(sessionRelationships("cit_027").length, 25);
  assert.ok(sessionMemories("cit_027").length > 0);
  assert.equal(seedSession(createInitialCity()).citizens.length, 26);
});

test("autonomous emotions persist for each speaker with evidence and private context", async () => {
  await sessionSetMode("autonomous");
  let calls = 0;
  for (let i = 0; i < 3; i++) await sessionTick(async (request) => {
    calls++;
    const result = reply();
    result.conversation!.actor_ids = [request.actor_id, request.target_id!];
    result.conversation!.transcript = [
      { speaker_id: request.actor_id, text: "I can help you fix that sketch." },
      { speaker_id: request.target_id!, text: "Thanks, that means a lot." },
    ];
    result.participant_outcomes = {
      [request.actor_id]: { mood: "Proud", feelings: { affection: 2, reason: "They thanked me for helping." } },
      [request.target_id!]: { mood: "Grateful", feelings: { admiration: 4, reason: "They helped repair my sketch." } },
    };
    return result;
  }, undefined, approach);
  assert.equal(calls, 1);
  const conversation = sessionConversations()[0];
  const [first, second] = conversation.actor_ids;
  assert.equal(sessionRelationships(first).find((r) => r.other_citizen_id === second)?.feelings?.affection, 2);
  assert.equal(sessionRelationships(second).find((r) => r.other_citizen_id === first)?.feelings?.admiration, 4);
  assert.equal(getSessionCity()!.citizens.find((c) => c.citizen_id === second)?.mood, "Grateful");
  assert.equal(sessionRelationships(first).find((r) => r.other_citizen_id === second)?.history?.at(-1)?.conversation_id, conversation.conversation_id);
  assert.equal(conversation.impacts?.find((impact) => impact.citizen_id === first)?.after.affection, 2);
  assert.equal(conversation.impacts?.find((impact) => impact.citizen_id === second)?.after.admiration, 4);
  assert.equal(conversation.impacts?.find((impact) => impact.citizen_id === first)?.mood_after, "Proud");
  await sessionTakeControl(first);
  await sessionSpeak(second, "How are you feeling?", async (request) => {
    const firstContext = request.private_memories?.[first]?.join(" ") ?? "";
    const secondContext = request.private_memories?.[second]?.join(" ") ?? "";
    assert.ok(firstContext.includes("They thanked me for helping."));
    assert.ok(!firstContext.includes("They helped repair my sketch."));
    assert.ok(secondContext.includes("They helped repair my sketch."));
    assert.ok(!secondContext.includes("They thanked me for helping."));
    const result = reply();
    result.conversation!.actor_ids = [request.actor_id, request.target_id!];
    result.conversation!.transcript = [
      { speaker_id: request.actor_id, text: "How are you feeling?" },
      { speaker_id: request.target_id!, text: "Grateful you helped with my sketch." },
    ];
    return result;
  });
});

test("auto chooses an encounter first, approaches, then talks on a later tick", async () => {
  await sessionSetMode("autonomous");
  let calls = 0;
  const generate = async (request: import("../src/lib/types").SessionCognitionRequest) => {
    calls++;
    assert.equal(request.conversation_mode, "autonomous");
    const result = reply();
    result.conversation!.actor_ids = [request.actor_id, request.target_id!];
    result.conversation!.transcript = [
      { speaker_id: request.actor_id, text: "How is your morning?" },
      { speaker_id: request.target_id!, text: "Good. How about yours?" },
    ];
    return result;
  };
  const first = await sessionTick(generate, undefined, approach);
  assert.equal(calls, 0);
  assert.equal(first.encounter?.topic, "my drawing");
  await sessionTick(generate, undefined, approach);
  assert.equal(sessionConversations()[0].encounter?.reason, "I want company while I draw.");
  await sessionTick(generate, undefined, approach);
  assert.equal(calls, 1);
  await sessionTick(generate, undefined, approach);
  assert.equal(calls, 1);
  await sessionTick(generate, undefined, approach);
  assert.equal(calls, 2);
});

test("auto errors are visible, pause retries, and never fabricate conversations", async () => {
  await sessionSetMode("autonomous");
  const before = sessionConversations().length;
  const city = await sessionTick(async () => reply(), undefined, async () => { throw new Error("gemini quota or rate limit reached."); });
  assert.equal(city.clock.running, false, "an exhausted quota pauses at once instead of retrying");
  assert.match(String(city.policy.autonomy_error), /quota or rate limit reached/);
  assert.equal(sessionConversations().length, before);
  assert.ok(city.events.some((event) => event.event_type === "agent_cognition_blocked" && event.description.includes("quota")));
  const resumed = await sessionStart();
  assert.equal(resumed.clock.running, true);
  assert.equal(resumed.policy.autonomy_error, undefined);
});

test("interrupted auto exchanges do not turn a deliberate pause into an error", async () => {
  await sessionSetMode("autonomous");
  await sessionTick(async () => reply(), undefined, approach);
  await sessionTick(async () => {
    await sessionPause();
    throw new Error("A request finished after pause");
  });
  assert.equal(getSessionCity()!.clock.running, false);
  assert.equal(getSessionCity()!.policy.autonomy_error, undefined);
  assert.equal(sessionConversations().length, 0);
});

test("a resident can prefer solitude without generating a conversation", async () => {
  await sessionSetMode("autonomous");
  let decisions = 0;
  const decide = async () => { decisions++; return { target_id: null, reason: "I need to finish my drawing.", topic: "" }; };
  for (let i = 0; i < 3; i++) await sessionTick(async () => { throw new Error("Must not chat"); }, undefined, decide);
  assert.equal(decisions, 1);
  assert.equal(sessionConversations().length, 0);
  assert.ok(getSessionCity()!.events.some((e) => e.event_type === "quiet_moment"));
});

test("auto cannot approach an absent resident or invent a fallback exchange", async () => {
  await sessionSetMode("autonomous");
  const city = await sessionTick(async () => reply(), undefined, async () => ({ target_id: "absent", reason: "A visit", topic: "dinner" }));
  assert.equal(city.encounter, undefined);
  assert.equal(sessionConversations().length, 0);
  assert.equal(city.clock.running, true, "one bad choice is dropped and the town carries on");
  assert.ok(city.events.some((e) => e.event_type === "conversation_fizzled" && /unavailable encounter/.test(e.description)));
});

test("agreed appointments are saved to both journals and become a planned encounter", async () => {
  await sessionSetMode("autonomous");
  await sessionTick(async () => reply(), undefined, approach);
  const next = await sessionTick(async (request) => {
    const response = reply();
    response.conversation!.actor_ids = [request.actor_id, request.target_id!];
    response.conversation!.transcript = [
      { speaker_id: request.actor_id, text: "Meet here at eight to draw?" },
      { speaker_id: request.target_id!, text: "Yes, here at eight." },
    ];
    response.meeting_plan = { actor_ids: response.conversation!.actor_ids, location_id: "loc_homes", game_day: 1, game_minute: 480, topic: "Drawing" };
    return response;
  }, undefined, approach);
  assert.equal(next.meetings?.[0].status, "scheduled");
  for (const id of next.meetings![0].actor_ids) assert.ok(sessionMemories(id).some((m) => m.content.includes("Drawing")));
  next.clock.minute_of_day = 465;
  for (const c of next.citizens) c.daily_schedule = [{ start: 0, end: 1440, location_id: "loc_homes", activity: "Drawing" }];
  saveSessionCity(next);
  const completed = await sessionTick(async (request) => {
    assert.ok(request.observations.some((s) => s.includes("kept their plan")));
    const response = reply();
    response.conversation!.conversation_id = "planned-exchange";
    response.conversation!.actor_ids = [request.actor_id, request.target_id!];
    response.conversation!.transcript = [{ speaker_id: request.actor_id, text: "I brought my drawing." }, { speaker_id: request.target_id!, text: "Let's see it." }];
    return response;
  }, undefined, approach);
  assert.equal(completed.meetings?.[0].status, "completed");
  assert.equal(sessionConversations()[0].encounter?.kind, "planned");
});

test("depleted residents recover before leaving medical care instead of oscillating between needs", async () => {
  const city = getSessionCity()!;
  city.simulation_mode = "autonomous";
  const c = city.citizens[0];
  const hospital = city.locations.find((p) => p.location_id === "loc_hospital")!;
  c.current_location_id = hospital.location_id;
  c.x = c.target_x = hospital.x + Math.floor(hospital.width / 2);
  c.y = c.target_y = hospital.y + Math.floor(hospital.height / 2);
  c.health = 54; c.energy = 0; c.hunger = 100;
  saveSessionCity(city);
  for (let i = 0; i < 12; i++) await sessionTick(async () => reply(), undefined, async () => ({ target_id: null, reason: "Rest first.", topic: "" }));
  const recovered = getSessionCity()!.citizens[0];
  assert.equal(recovered.current_location_id, "loc_hospital");
  assert.ok(recovered.health >= 85);
  assert.ok(recovered.energy >= 40);
  assert.ok(recovered.hunger < 60);
});

test("literal player speech does not invent the player's feelings or change their bond", async () => {
  await sessionTakeControl(actorId);
  const before = sessionRelationships(actorId).find((r) => r.other_citizen_id === targetId)!;
  await sessionSpeak(targetId, "How are you?", async () => {
    const result = reply();
    result.conversation!.transcript[0].text = "How are you?";
    delete result.participant_outcomes![actorId];
    result.participant_outcomes![targetId] = { mood: "Calm", feelings: { admiration: 2, reason: "A thoughtful question." } };
    return result;
  });
  const after = sessionRelationships(actorId).find((r) => r.other_citizen_id === targetId)!;
  assert.deepEqual(after, before);
  assert.equal(sessionConversations()[0].impacts?.find((i) => i.citizen_id === actorId)?.status, "not_assessed");
  assert.equal(sessionConversations()[0].impacts?.find((i) => i.citizen_id === targetId)?.after.admiration, 2);
});
