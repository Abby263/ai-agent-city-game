import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, afterEach, beforeEach, test as nodeTest, type TestContext } from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import { acceptMeeting, type MeetingPlan } from "../src/lib/encounters";
import { currentElection, recordBallot, tallyElection, type ElectionDecision } from "../src/lib/elections";
import { parsePlan } from "../src/lib/plans";
import { scenarioCatalog, type ScenarioRequest } from "../src/lib/scenarios";
import {
  getSessionCity, saveSessionCity, seedSession, sessionAdvanceAutoElection,
  sessionAssignTask, sessionCastVote, sessionCloseTask, sessionConversations,
  sessionCreateSituation, sessionElectionPhase, sessionMemories, sessionNextBallot,
  sessionOpenBallots, sessionPause, sessionPerformAction, sessionRelationships,
  sessionSetMode, sessionStart, sessionStartElection, sessionStartElectionAuto,
  sessionTakeControl, sessionTick,
} from "../src/lib/session-simulation";
import type { SessionCognitionRequest, SessionCognitionResponse, SessionTaskPlanResponse } from "../src/lib/types";

// Node's per-file test isolation keeps this fake browser away from real saved worlds.
const storage = new Map<string, string>();
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;
const test = (name: string, run: (context: TestContext) => void | Promise<void>) => nodeTest(name, { timeout: 5000 }, run);
const actorId = "cit_009", targetId = "cit_010";
let serial = 0, networkCalls = 0;
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
} } });
globalThis.fetch = async () => { networkCalls++; throw new Error("Real API calls are forbidden in extreme-session tests"); };

function resetCity() {
  storage.clear();
  const city = createInitialCity();
  city.policy.time_mode = "fast";
  city.simulation_mode = "manual";
  city.policy.simulation_mode = "manual";
  city.clock.running = false;
  for (const citizen of city.citizens) {
    citizen.x = citizen.target_x = 6;
    citizen.y = citizen.target_y = 5;
    citizen.current_location_id = "loc_homes";
    citizen.current_activity = "Resting at home";
  }
  seedSession(city);
  assert.ok(getSessionCity(), "fixture requires browser-local memory mode");
}
beforeEach(() => { serial = 0; networkCalls = 0; resetCity(); });
afterEach(() => { assert.equal(networkCalls, 0, "no test may call the network, even if the application swallows the error"); });
after(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const snapshot = () => Object.fromEntries([...storage.entries()].sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => [key, createHash("sha256").update(value).digest("hex")]));
const citizen = (id = actorId) => getSessionCity()!.citizens.find((c) => c.citizen_id === id)!;
const task = () => citizen().personality.player_task as { task: string; status: string; target_citizen_ids: string[] };
const plan: SessionTaskPlanResponse = {
  task_kind: "targeted_talk", target_citizen_ids: [targetId], location_id: "loc_homes",
  reasoning_summary: "Ask the other resident", player_visible_plan: "Talk with Mateo.",
};
const decision: ElectionDecision = {
  platform: "More public gardens.", target_id: null, intention: "Ask about local needs.",
  vote_for: actorId, reason: "A useful proposal.", mood: "Thoughtful",
};
function response(request: SessionCognitionRequest): SessionCognitionResponse {
  return {
    thought: "We discussed the situation.", mood: "Calm", memory: `Reply memory ${++serial}`,
    reflection: "Listen carefully.", importance: 0.6,
    participant_memories: { [request.target_id!]: `Listener memory ${serial}` },
    conversation: {
      conversation_id: `extreme-${serial}`, game_day: request.city.clock.day,
      game_minute: request.city.clock.minute_of_day, location_id: "loc_homes",
      actor_ids: [request.actor_id, request.target_id!], summary: "A short exchange.",
      transcript: [
        { speaker_id: request.actor_id, text: request.player_utterance || "Can we talk about this?" },
        { speaker_id: request.target_id!, text: "Yes, I am listening." },
      ],
    },
  };
}
const talk = async (request: SessionCognitionRequest) => response(request);
const noTalk = async (): Promise<SessionCognitionResponse> => { throw new Error("Unexpected cognition call"); };
const assign = (text = "Discuss today's plans with Mateo") => sessionAssignTask(actorId, { task: text }, async () => plan);
const startElection = () => sessionStartElectionAuto(actorId, targetId, async () => decision);
const scenarioRequest = (kind: ScenarioRequest["kind"]): ScenarioRequest => ({
  kind, location_id: "loc_homes", citizen_ids: [actorId, targetId], amount: 125,
});

test("task target normalization removes self, missing residents and duplicates", async () => {
  await sessionAssignTask(actorId, { task: "Have a conversation" }, async () => ({
    ...plan, target_citizen_ids: [actorId, "missing", targetId, targetId], location_id: "missing",
  }));
  assert.deepEqual(task().target_citizen_ids, [targetId]);
  assert.equal(task().status, "active");
});

for (const badPlan of [null, {}, { ...plan, target_citizen_ids: null }]) {
  test(`malformed task plan ${JSON.stringify(badPlan)} blocks without inventing a task memory`, async () => {
    const before = sessionMemories(actorId);
    await sessionAssignTask(actorId, { task: "Talk with Mateo" }, async () => badPlan as unknown as SessionTaskPlanResponse);
    assert.equal(task().status, "blocked");
    assert.deepEqual(sessionMemories(actorId), before);
    assert.equal(getSessionCity()!.clock.running, false);
  });
}

for (const settle of ["resolve", "reject"] as const) {
  test(`task close and restart discard in-flight cognition ${settle}`, async () => {
    await assign();
    const gate = deferred<SessionCognitionResponse>();
    let request!: SessionCognitionRequest;
    const pending = sessionTick((r) => { request = r; return gate.promise; });
    assert.ok(request, "task cognition actually started");
    await sessionCloseTask(actorId);
    await assign("Discuss the new plan with Mateo");
    const before = snapshot();
    if (settle === "resolve") gate.resolve(response(request));
    else gate.reject(new Error("Late task service failure"));
    await pending;
    assert.deepEqual(snapshot(), before, "old response cannot alter any persisted key");
    assert.equal(task().task, "Discuss the new plan with Mateo");
    assert.equal(task().status, "active");
  });
}

test("repeated task assignment and close keep goals and event buffers bounded", async () => {
  for (let i = 0; i < 45; i++) {
    await assign(`Discuss plan ${i} with Mateo`);
    assert.equal(citizen().short_term_goals.filter((g) => g.startsWith("Player task:")).length, 1);
    await sessionCloseTask(actorId);
    assert.equal(task().status, "closed");
    assert.ok(!citizen().short_term_goals.some((g) => g.startsWith("Player task:")));
  }
  assert.ok(getSessionCity()!.events.length <= 80);
  assert.ok(sessionMemories(actorId).length <= 80);
});

test("closing an already closed task does not duplicate closure events or memories", async () => {
  await assign();
  await sessionCloseTask(actorId);
  const memories = sessionMemories(actorId), events = getSessionCity()!.events;
  await sessionCloseTask(actorId);
  assert.deepEqual(sessionMemories(actorId), memories);
  assert.deepEqual(getSessionCity()!.events, events);
});

test("overlapping task plans respect latest player intent even when the old plan resolves first", async () => {
  const old = deferred<SessionTaskPlanResponse>(), recent = deferred<SessionTaskPlanResponse>();
  const first = sessionAssignTask(actorId, { task: "Old request" }, () => old.promise);
  const second = sessionAssignTask(actorId, { task: "Newest request" }, () => recent.promise);
  old.resolve(plan);
  await first;
  recent.resolve(plan);
  await second;
  assert.equal(task().task, "Newest request");
});

test("pausing a pending planner and restarting does not install its late task", async () => {
  const gate = deferred<SessionTaskPlanResponse>();
  const pending = sessionAssignTask(actorId, { task: "Old request" }, () => gate.promise);
  await sessionPause();
  await assign("Replacement request");
  const before = snapshot();
  gate.resolve(plan);
  await pending;
  assert.deepEqual(snapshot(), before);
});

for (const spec of scenarioCatalog) {
  test(`catalogue ${spec.kind}: successful reaction creates one observable story`, async () => {
    let calls = 0;
    const result = await sessionCreateSituation(scenarioRequest(spec.kind), async (request) => { calls++; return response(request); });
    assert.equal(calls, 1, "fixture supplies awake residents for a reaction");
    assert.equal(result.talked, true);
    assert.equal(sessionConversations().length, 1);
    const story = result.city.stories!.find((s) => s.id === result.story_id)!;
    assert.equal(story.kind, spec.kind);
    assert.ok(story.beats.some((b) => b.conversation_id));
    assert.equal(result.city.encounter, null);
  });

  test(`catalogue ${spec.kind}: failed reaction retains mechanics without fabricated dialogue`, async () => {
    let before: ReturnType<typeof snapshot> | undefined;
    const result = await sessionCreateSituation(scenarioRequest(spec.kind), async () => {
      before = snapshot();
      throw new Error("Scenario service unavailable");
    });
    assert.ok(before, "reaction was attempted");
    assert.equal(result.talked, false);
    assert.equal(result.error, "Scenario service unavailable");
    assert.deepEqual(snapshot(), before);
    assert.ok(result.city.stories!.some((s) => s.id === result.story_id));
    assert.equal(sessionConversations().length, 0);
  });

  test(`catalogue ${spec.kind}: pause and restart discard late reaction side effects`, async () => {
    const gate = deferred<SessionCognitionResponse>();
    let request!: SessionCognitionRequest;
    const pending = sessionCreateSituation(scenarioRequest(spec.kind), (r) => { request = r; return gate.promise; });
    assert.ok(request);
    await sessionPause();
    await sessionSetMode("autonomous");
    const before = snapshot();
    gate.resolve(response(request));
    const result = await pending;
    assert.equal(result.talked, false);
    assert.deepEqual(snapshot(), before, "stale scenario must not write conversations, memories or bonds");
  });
}

for (const controlled of [false, true]) {
  for (const settle of ["resolve", "reject"] as const) {
    test(`${controlled ? "player" : "NPC"} action interrupted by pause discards ${settle} response`, async () => {
      if (controlled) await sessionTakeControl(actorId);
      const money = citizen().money;
      const gate = deferred<SessionCognitionResponse>();
      let request!: SessionCognitionRequest;
      const pending = sessionPerformAction(actorId, targetId, "gift", "A small gift", (r) => { request = r; return gate.promise; });
      assert.ok(request);
      assert.equal(citizen().money, money - 20, "mechanics intentionally commit before optional dialogue");
      await sessionPause();
      const before = snapshot();
      if (settle === "resolve") gate.resolve(response(request));
      else gate.reject(new Error("Late action service failure"));
      const result = await pending;
      assert.equal(result.talked, false);
      assert.deepEqual(snapshot(), before);
    });
  }
}

test("overlapping gifts charge once per action without overspending or stale dialogue", async () => {
  await sessionTakeControl(actorId);
  const city = getSessionCity()!;
  city.citizens.find((c) => c.citizen_id === actorId)!.money = 60;
  saveSessionCity(city);
  const gates = Array.from({ length: 3 }, () => deferred<SessionCognitionResponse>());
  const requests: SessionCognitionRequest[] = [];
  const pending = gates.map((gate, i) => sessionPerformAction(actorId, targetId, "gift", `Gift ${i}`, (r) => {
    requests[i] = r; return gate.promise;
  }));
  await assert.rejects(sessionPerformAction(actorId, targetId, "gift", "Fourth gift", noTalk), /money/i);
  for (let i = gates.length - 1; i >= 0; i--) { gates[i].resolve(response(requests[i])); await pending[i]; }
  assert.equal(citizen().money, 0);
  assert.equal(sessionConversations().length, 1);
  assert.equal((await Promise.all(pending)).filter((r) => r.talked).length, 1);
});

const malformedReplies: Array<[string, (r: SessionCognitionResponse) => unknown]> = [
  ["null response", () => null],
  ["missing conversation", (r) => ({ ...r, conversation: null })],
  ["non-array transcript", (r) => ({ ...r, conversation: { ...r.conversation, transcript: {} } })],
  ["null transcript line", (r) => ({ ...r, conversation: { ...r.conversation, transcript: [null] } })],
  ["numeric dialogue", (r) => ({ ...r, conversation: { ...r.conversation, transcript: [{ speaker_id: actorId, text: 42 }] } })],
  ["missing listener", (r) => ({ ...r, conversation: { ...r.conversation, transcript: [{ speaker_id: actorId, text: "Hello" }] } })],
  ["numeric relationship reason", (r) => ({ ...r, participant_outcomes: { [actorId]: { relationship_reason: 42 } } })],
];
for (const [label, corrupt] of malformedReplies) {
  test(`malformed action response: ${label} leaves no partial cognition writes`, async () => {
    await sessionTakeControl(actorId);
    let before!: ReturnType<typeof snapshot>;
    const result = await sessionPerformAction(actorId, targetId, "meet", "", async (request) => {
      before = snapshot();
      return corrupt(response(request)) as SessionCognitionResponse;
    });
    assert.equal(result.talked, false);
    assert.ok(result.error);
    assert.deepEqual(snapshot(), before, "mechanics may persist, but rejected cognition must be atomic");
  });
}

test("malformed scenario amount must not persist non-finite money", async () => {
  for (const amount of [NaN, Infinity, -Infinity, "100", null, {}]) {
    const before = snapshot();
    await assert.rejects(sessionCreateSituation({ ...scenarioRequest("drop_money"), amount: amount as number }), /finite number/);
    assert.deepEqual(snapshot(), before, `invalid amount ${String(amount)} must not change any persisted state`);
  }
});

test("valid scenario amounts retain their default and bounds", async () => {
  for (const [amount, expected] of [[undefined, 100], [-10, 1], [0, 1], [125, 125], [10000, 5000]] as const) {
    resetCity();
    const before = getSessionCity()!.citizens.reduce((sum, c) => sum + c.money, 0);
    const { city, result } = await sessionCreateSituation({ ...scenarioRequest("drop_money"), amount });
    const after = city.citizens.reduce((sum, c) => sum + c.money, 0);
    const gain = result.headline.includes("handed") ? Math.round(expected * 0.1) : expected;
    assert.equal(after - before, gain);
  }
});

test("repeated scenarios keep incident identities unique at the same tick", async () => {
  const tick = getSessionCity()!.clock.tick;
  for (let i = 0; i < 6; i++) {
    await sessionCreateSituation({ ...scenarioRequest("fire"), location_id: i % 2 ? "loc_bank" : "loc_homes" });
    await sessionCreateSituation(scenarioRequest("accident"));
  }
  const incidents = getSessionCity()!.incidents!;
  assert.equal(getSessionCity()!.clock.tick, tick);
  assert.equal(incidents.length, 12);
  assert.equal(new Set(incidents.map((i) => i.id)).size, incidents.length);
});

test("invalid player ballots and duplicate ballots never mutate stored election state", async () => {
  await sessionTakeControl(actorId);
  await startElection();
  await sessionOpenBallots();
  for (const value of ["missing", "", undefined, 12, {}]) {
    const before = snapshot();
    await assert.rejects(sessionCastVote(value as string));
    assert.deepEqual(snapshot(), before);
  }
  await sessionCastVote(null);
  const before = snapshot();
  for (let i = 0; i < 10; i++) await assert.rejects(sessionCastVote(actorId), /already voted/);
  assert.deepEqual(snapshot(), before);
});

test("ballot reducer rejects invalid voters and closed phases without mutation", async () => {
  await startElection();
  const election = currentElection(getSessionCity()!)!;
  const original = structuredClone(election);
  const ballot = { voter_id: actorId, vote_for: targetId, reason: "Choice", source: "agent" as const };
  for (const phase of ["campaign", "cancelled", "complete"] as const)
    assert.throws(() => recordBallot({ ...election, phase }, ballot), /not open/);
  assert.throws(() => recordBallot({ ...election, phase: "voting" }, { ...ballot, voter_id: "missing" }), /registered/);
  assert.deepEqual(election, original);
});

test("invalid agent ballots remain missing, then recover without duplicates or premature results", async () => {
  await startElection();
  await sessionOpenBallots();
  const invalid = new Set([actorId, targetId]);
  const partial = await sessionAdvanceAutoElection(noTalk, async (request) => ({
    ...decision, vote_for: invalid.has(request.citizen.citizen_id) ? "missing" : actorId,
  }));
  const election = currentElection(partial)!;
  assert.equal(election.ballots.length, election.voter_ids.length - 2);
  assert.equal(tallyElection(election), null);
  assert.ok(election.error);
  const retried: string[] = [];
  const complete = await sessionAdvanceAutoElection(noTalk, async (request) => { retried.push(request.citizen.citizen_id); return decision; });
  assert.deepEqual(new Set(retried), invalid);
  assert.equal(currentElection(complete)!.phase, "complete");
  const before = snapshot();
  for (let i = 0; i < 10; i++) await sessionAdvanceAutoElection(noTalk, async () => { throw new Error("Election is already complete"); });
  assert.deepEqual(snapshot(), before);
  assert.equal(complete.events.filter((e) => e.event_type === "election_result").length, 1);
});

test("cancellation and a replacement election discard every late ballot batch", async () => {
  await startElection();
  await sessionOpenBallots();
  const oldId = currentElection(getSessionCity()!)!.event_id;
  const gate = deferred<ElectionDecision>();
  let calls = 0;
  const pending = sessionAdvanceAutoElection(noTalk, () => { calls++; return gate.promise; });
  assert.equal(calls, 8);
  await sessionElectionPhase("cancel");
  await startElection();
  const before = snapshot();
  gate.resolve(decision);
  await pending;
  assert.equal(calls, 8, "no additional batches after cancellation");
  assert.deepEqual(snapshot(), before);
  assert.notEqual(currentElection(getSessionCity()!)!.event_id, oldId);
  assert.equal(getSessionCity()!.activities!.find((e) => e.event_id === oldId)!.phase, "cancelled");
});

test("overlapping election advancements commit each ballot and result once", async () => {
  await startElection();
  await sessionOpenBallots();
  const old = deferred<ElectionDecision>();
  const first = sessionAdvanceAutoElection(noTalk, () => old.promise);
  const second = await sessionAdvanceAutoElection(noTalk, async () => decision);
  const before = snapshot();
  old.resolve(decision);
  await first;
  assert.deepEqual(snapshot(), before);
  const election = currentElection(second)!;
  assert.equal(new Set(election.ballots.map((b) => b.voter_id)).size, election.voter_ids.length);
  assert.equal(second.events.filter((e) => e.event_type === "election_result").length, 1);
});

test("all abstentions finish without a fabricated winner or drawing lots", async () => {
  await startElection();
  await sessionOpenBallots();
  const city = await sessionAdvanceAutoElection(noTalk, async () => ({ ...decision, vote_for: null }));
  const election = currentElection(city)!;
  assert.equal(election.phase, "complete");
  assert.equal(tallyElection(election)!.winner, null);
  assert.equal(tallyElection(election)!.abstentions, election.voter_ids.length);
  assert.equal(election.lot_winner, undefined);
});

test("manual election invalid agent decision is retryable without invented abstention", async () => {
  await sessionStartElection(actorId, targetId, "Public gardens", async () => decision);
  await sessionElectionPhase("vote");
  await sessionNextBallot(async () => ({ ...decision, vote_for: "missing" }));
  assert.equal(currentElection(getSessionCity()!)!.ballots.length, 0);
  assert.match(currentElection(getSessionCity()!)!.error!, /candidate/);
  await sessionNextBallot(async () => decision);
  assert.equal(currentElection(getSessionCity()!)!.ballots.length, 1);
});

test("failed automatic campaign can retry without consuming a turn or inventing a speech", async () => {
  await startElection();
  const before = snapshot();
  await assert.rejects(sessionAdvanceAutoElection(noTalk, async () => decision), /Unexpected cognition/);
  assert.deepEqual(snapshot(), before);
  await sessionAdvanceAutoElection(talk, async () => decision);
  assert.equal(currentElection(getSessionCity()!)!.campaign_turn, 1);
  assert.equal(sessionConversations().length, 1);
});

test("social timeout pauses once and restart clears error without fabricated dialogue", async () => {
  await sessionSetMode("autonomous");
  const city = await sessionTick(noTalk, undefined, async () => { throw new DOMException("Timed out", "TimeoutError"); });
  assert.equal(city.clock.running, false);
  assert.match(String(city.policy.autonomy_error), /too long/);
  assert.equal(sessionConversations().length, 0);
  const resumed = await sessionStart();
  assert.equal(resumed.clock.running, true);
  assert.equal(resumed.policy.autonomy_error, undefined);
});

test("meeting validation rejects malformed schedules and enforces exact day-wrap boundaries", () => {
  const city = getSessionCity()!;
  city.clock.minute_of_day = 1430;
  const valid: MeetingPlan = { actor_ids: [actorId, targetId], location_id: "loc_park", game_day: city.clock.day + 1, game_minute: 20, topic: "Talk" };
  assert.ok(acceptMeeting(city, valid, valid.actor_ids, "wrap"));
  for (const change of [
    { actor_ids: [actorId, actorId] }, { actor_ids: [actorId, "missing"] },
    { game_minute: 19 }, { game_minute: -1 }, { game_minute: 1440 },
    { game_minute: NaN }, { game_day: Infinity }, { game_day: 1.5 },
    { topic: " " }, { topic: 42 }, { location_id: "missing" },
  ]) assert.equal(acceptMeeting(city, { ...valid, ...change } as MeetingPlan, valid.actor_ids, "bad"), null, JSON.stringify(change));
  assert.ok(acceptMeeting(city, { ...valid, game_minute: 1430 }, valid.actor_ids, "last"));
  assert.equal(acceptMeeting(city, { ...valid, game_minute: 1431 }, valid.actor_ids, "late"), null);
});

test("12am parses as midnight while 12pm remains noon", () => {
  const city = getSessionCity()!;
  assert.equal(parsePlan("Tomorrow at 12am at the park", city)?.minute, 0);
  assert.equal(parsePlan("Tomorrow at 12pm at the park", city)?.minute, 720);
});

test("malformed clock times are rejected instead of silently clamped or rolled forward", () => {
  const city = getSessionCity()!;
  for (const time of ["19:99", "25:00", "13pm", "0am", "24:00", "12:60pm"])
    assert.equal(parsePlan(`Tomorrow at ${time} at the park`, city), null, time);
});

test("a leading count does not hide the later explicitly scheduled time", () => {
  assert.equal(parsePlan("Bring 2 friends tomorrow at 7pm at the park", getSessionCity()!)?.minute, 19 * 60);
});

test("stress fixture relationships retain finite bounded values", async () => {
  for (let i = 0; i < 12; i++) await sessionCreateSituation(scenarioRequest(i % 2 ? "rivalry" : "love_spark"));
  for (const relation of sessionRelationships())
    for (const value of [relation.trust, relation.warmth, relation.familiarity, ...Object.values(relation.feelings ?? {})])
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 100, String(value));
});
