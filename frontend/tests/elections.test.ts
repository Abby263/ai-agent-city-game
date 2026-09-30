import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createInitialCity } from "../src/lib/initial-city";
import { currentElection, recordBallot, tallyElection } from "../src/lib/elections";
import type { Election, ElectionDecision } from "../src/lib/elections";
import { seedSession, getSessionCity, sessionStartElection, sessionElectionPhase, sessionNextBallot, sessionCastVote, sessionPause, sessionTick, sessionMemories, saveSessionCity, sessionConversations } from "../src/lib/session-simulation";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value),
} } });
beforeEach(() => { storage.clear(); seedSession(createInitialCity()); });
const decision: ElectionDecision = { platform: "A quiet reading room and a shared garden.", target_id: null, intention: "", vote_for: "cit_010", reason: "I care about creative spaces.", mood: "Thoughtful" };
const start = () => sessionStartElection("cit_009", "cit_010", "More science clubs.", async () => decision);

test("an election has two distinct candidates and an independently generated rival platform", async () => {
  const city = await start();
  assert.equal(city.policy.player_citizen_id, "cit_009");
  assert.equal(city.simulation_mode, "autonomous");
  assert.equal(currentElection(city)?.candidates[1].platform, decision.platform);
  assert.equal(currentElection(city)?.voter_ids.length, city.citizens.length); // every resident is 18+ and votes
  await assert.rejects(start(), /current election/);
});

test("private agent ballots never include other ballots and all votes are counted exactly once", async () => {
  await start(); await sessionElectionPhase("vote");
  await sessionCastVote("cit_009");
  await assert.rejects(sessionCastVote("cit_009"), /already voted/);
  let calls = 0;
  const others = getSessionCity()!.citizens.length - 1;
  for (let i = 0; i < others; i++) await sessionNextBallot(async (request) => {
    calls++;
    assert.equal(request.purpose, "vote");
    assert.equal("ballots" in request, false);
    assert.ok(!JSON.stringify(request).includes("I made up my own mind after hearing the candidates"));
    return decision;
  });
  const event = currentElection(getSessionCity()!)!;
  assert.equal(calls, others);
  assert.equal(event.phase, "complete");
  assert.equal(tallyElection(event)?.winner?.citizen_id, "cit_010");
  assert.equal(tallyElection(event)?.winner?.votes, others);
  assert.ok(sessionMemories("cit_009").some((m) => m.content.includes("won the neighbourhood-association election")));
});

test("no partial tally leaks, failed votes remain retryable, and pause invalidates pending decisions", async () => {
  await start(); await sessionElectionPhase("vote");
  assert.equal(tallyElection(currentElection(getSessionCity()!)!), null);
  await sessionNextBallot(async () => { throw new Error("Quota exhausted"); });
  assert.equal(currentElection(getSessionCity()!)?.ballots.length, 0);
  assert.equal(currentElection(getSessionCity()!)?.error, "Quota exhausted");
  let release!: (value: ElectionDecision) => void;
  const pending = sessionNextBallot(() => new Promise((resolve) => { release = resolve; }));
  await sessionPause(); release(decision); await pending;
  assert.equal(currentElection(getSessionCity()!)?.ballots.length, 0);
  await sessionNextBallot(async () => decision);
  assert.equal(currentElection(getSessionCity()!)?.ballots.length, 1);
});

test("ties and abstention produce no fabricated winner; invalid ballots are rejected", () => {
  const event: Election = { event_id: "test", kind: "council_election", title: "Council", phase: "voting", candidates: [{ citizen_id: "a", name: "A", platform: "Art" }, { citizen_id: "b", name: "B", platform: "Science" }], voter_ids: ["a", "b"], campaign_until_tick: 32, ballots: [], campaign_turn: 0, campaign_log: [] };
  assert.throws(() => recordBallot(event, { voter_id: "a", vote_for: "bad", reason: "", source: "agent" }));
  assert.throws(() => recordBallot(event, { voter_id: "bad", vote_for: "a", reason: "", source: "agent" }));
  const tied = recordBallot(recordBallot(event, { voter_id: "a", vote_for: "a", reason: "", source: "agent" }), { voter_id: "b", vote_for: "b", reason: "", source: "agent" });
  assert.equal(tallyElection(tied)?.tied, true);
  assert.equal(tallyElection(tied)?.winner, null);
  const abstained = recordBallot(recordBallot(event, { voter_id: "a", vote_for: null, reason: "", source: "agent" }), { voter_id: "b", vote_for: null, reason: "", source: "agent" });
  assert.equal(tallyElection(abstained)?.abstentions, 2);
  assert.equal(tallyElection(abstained)?.winner, null);
});

test("rival picks a target through its agent rather than a fixed voter order", async () => {
  await start();
  const city = getSessionCity()!; city.clock.tick = 2; saveSessionCity(city);
  await sessionTick(async () => { throw new Error("Only planning this tick"); }, async (request) => {
    assert.equal(request.citizen.citizen_id, "cit_010");
    assert.equal(request.purpose, "campaign");
    return { ...decision, target_id: "cit_028", intention: "Ask Rin about a robotics club." };
  });
  assert.equal(currentElection(getSessionCity()!)?.agenda?.target_id, "cit_028");
});

test("cancelling during platform generation never installs an election", async () => {
  let release!: (value: ElectionDecision) => void;
  const pending = sessionStartElection("cit_009", "cit_010", "Science", () => new Promise((resolve) => { release = resolve; }));
  await sessionPause(); release(decision); await pending;
  assert.equal(currentElection(getSessionCity()!), undefined);
});

test("an AI campaign conversation is witnessed and remembered before voting", async () => {
  await start();
  const city = getSessionCity()!;
  city.clock.tick = 5;
  for (const citizen of city.citizens) { citizen.x = citizen.target_x = 6; citizen.y = citizen.target_y = 5; }
  currentElection(city)!.agenda = { candidate_id: "cit_010", target_id: "cit_021", intention: "Ask Riku how an art club could include sports." };
  saveSessionCity(city);
  const next = await sessionTick(async (request) => {
    assert.equal(request.actor_id, "cit_010"); assert.equal(request.target_id, "cit_021");
    return { thought: "Listen to Riku", mood: "Curious", memory: "We discussed an art club.", reflection: "Sport can bring people together.", importance: .7,
      participant_memories: { cit_010: "Riku suggested drawing sports stories.", cit_021: "Ren asked how art could include sports." },
      conversation: { conversation_id: "campaign-conversation", game_day: 1, game_minute: 375, location_id: "loc_homes", actor_ids: ["cit_010", "cit_021"],
        transcript: [{ speaker_id: "cit_010", text: "How could art include sports?" }, { speaker_id: "cit_021", text: "We could draw sports stories." }], summary: "An art and sport proposal." } };
  }, async () => { throw new Error("Already planned"); });
  assert.equal(currentElection(next)?.agenda, undefined);
  assert.equal(currentElection(next)?.campaign_log.length, 1);
  assert.equal(sessionConversations()[0].conversation_id, "campaign-conversation");
  await sessionElectionPhase("vote");
  await sessionNextBallot(async (request) => {
    assert.ok(request.memories.join(" ").includes("Riku suggested drawing sports stories."));
    return decision;
  });
});

test("automatic deadline opens ballots without inventing a campaign speech", async () => {
  await start();
  const city = getSessionCity()!;
  city.clock.tick = currentElection(city)!.campaign_until_tick - 1;
  saveSessionCity(city);
  const next = await sessionTick(async () => { throw new Error("Campaign is closed"); }, async (request) => {
    assert.equal(request.purpose, "vote"); return decision;
  });
  assert.equal(currentElection(next)?.phase, "voting");
  assert.equal(currentElection(next)?.ballots.length, 1);
});
