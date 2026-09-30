import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import { getSessionCity, saveSessionCity, seedSession, sessionAdvanceAutoElection, sessionCastVote, sessionConversations, sessionAct, sessionPause, sessionStartElectionAuto, sessionTakeControl } from "../src/lib/session-simulation";
import { activeStories } from "../src/lib/stories";
import type { SessionCognitionRequest, SessionCognitionResponse } from "../src/lib/types";
import { playerTurn, type DecideElection } from "../src/lib/elections";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } },
  configurable: true,
});
beforeEach(() => { storage.clear(); seedSession(createInitialCity()); });

let n = 0;

test("26 private ballots use batches of eight; failures remain missing and retry without duplicate votes", async () => {
  const decide: DecideElection = async () => ({ platform: "A shared garden", target_id: null, intention: "", vote_for: "cit_009", reason: "I like the garden.", mood: "Hopeful" });
  await sessionStartElectionAuto("cit_009", "cit_021", decide);
  const city = getSessionCity()!;
  city.activities!.at(-1)!.phase = "voting";
  saveSessionCity(city);
  let active = 0, peak = 0, calls = 0;
  const next = await sessionAdvanceAutoElection(talk, async (request) => {
    active++; calls++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    if (request.citizen.citizen_id === "cit_009") throw new Error("Rate limited");
    return decide(request);
  });
  assert.equal(peak, 8);
  assert.equal(calls, 8, "stop new batches when the service fails");
  assert.equal(next.activities!.at(-1)!.ballots.length, 7);
  assert.ok(next.activities!.at(-1)!.ballots.every((b) => b.vote_for !== null));
  assert.match(next.activities!.at(-1)!.error!, /19 ballots/);
  const done = await sessionAdvanceAutoElection(talk, decide);
  assert.equal(done.activities!.at(-1)!.phase, "complete");
  assert.equal(new Set(done.activities!.at(-1)!.ballots.map((b) => b.voter_id)).size, 26);
});

test("pausing during a ballot batch stops later batches and discards pending votes", async () => {
  const decide: DecideElection = async () => ({ platform: "A shared garden", target_id: null, intention: "", vote_for: "cit_009", reason: "Garden", mood: "Hopeful" });
  await sessionStartElectionAuto("cit_009", "cit_021", decide);
  const city = getSessionCity()!;
  city.activities!.at(-1)!.phase = "voting";
  saveSessionCity(city);
  let calls = 0;
  const next = await sessionAdvanceAutoElection(talk, async (request) => {
    calls++;
    if (calls === 1) await sessionPause();
    return decide(request);
  });
  assert.equal(calls, 8);
  assert.equal(next.activities!.at(-1)!.ballots.length, 0);
});
const talk = async (request: SessionCognitionRequest): Promise<SessionCognitionResponse> => ({
  thought: "", mood: "Surprised", memory: "We talked.", reflection: "", importance: 0.6,
  conversation: { conversation_id: `c${++n}`, game_day: 1, game_minute: 360, location_id: null, actor_ids: [request.actor_id, request.target_id!], summary: "They talked it over.",
    transcript: [{ speaker_id: request.actor_id, text: "Did you see what just happened?" }, { speaker_id: request.target_id!, text: "I can't believe it!" }] },
  participant_memories: {}, participant_outcomes: {},
});

test("a situation starts a story and the people involved react straight away", async () => {
  const city = getSessionCity()!;
  const [yui, daichi] = ["Yui", "Daichi"].map((name) => city.citizens.find((c) => c.name.startsWith(name))!.citizen_id);
  const master = async () => ({ allowed: true, refusal: "", headline: "Yui and Daichi got stuck in the lift together.", target_id: yui, involved_ids: [yui, daichi],
    location_id: "", tone: "tense" as const, intensity: 1, harm: 0, money: 0, proposal: "none" as const, closes_location: false, reaction: "You're stuck in the lift together.", target_memory: "" });
  const { headline, talked, story_id } = await sessionAct(null, null, "Yui and Daichi get stuck in the lift together", master, talk);
  assert.match(headline, /stuck in the lift/);
  assert.equal(talked, true);
  const story = activeStories(getSessionCity()!).find((s) => s.id === story_id)!;
  assert.ok(story.beats.some((b) => b.conversation_id), "the reaction conversation is a beat of the story");
  assert.ok(sessionConversations(yui).length > 0);
  assert.equal(getSessionCity()!.encounter ?? null, null, "no leftover encounter waits for a tick");
});

test("an election from Create runs its campaign and ends with a winner in the story", async () => {
  const city = getSessionCity()!;
  const [ava, noah] = ["Aoi", "Riku"].map((name) => city.citizens.find((c) => c.name.startsWith(name))!.citizen_id);
  const decide: DecideElection = async (request) => ({
    platform: request.purpose === "platform" ? `${request.citizen.name} will fix the vending machines.` : "",
    target_id: request.purpose === "campaign" ? request.residents.find((r) => ![ava, noah].includes(r.citizen_id))!.citizen_id : null,
    intention: "Ask for their vote", vote_for: request.purpose === "vote" ? ava : null, reason: "They listen.", mood: "Hopeful",
  });
  await sessionStartElectionAuto(ava, noah, decide);
  for (let i = 0; i < 4; i++) await sessionAdvanceAutoElection(talk, decide);
  const done = getSessionCity()!;
  const election = done.activities!.at(-1)!;
  assert.equal(election.phase, "complete");
  const story = (done.stories ?? []).find((s) => s.kind === "election")!;
  assert.ok(story.beats.some((b) => b.icon === "📣"), "platforms are in the story");
  assert.ok(story.beats.some((b) => b.conversation_id), "campaign conversations are in the story");
  assert.ok(story.beats.some((b) => b.icon === "🏆" && /Aoi Takahashi won/.test(b.text)));
});

test("a tied election is settled by drawing lots", async () => {
  const city = getSessionCity()!;
  const [ava, noah] = ["Aoi", "Riku"].map((name) => city.citizens.find((c) => c.name.startsWith(name))!.citizen_id);
  const voters = city.citizens.map((c) => c.citizen_id);
  assert.equal(voters.length, 26);
  const decide: DecideElection = async (request) => ({
    platform: "More clubs.", target_id: null, intention: "", reason: "Close call.", mood: "Calm",
    // Alternate so the ballots split evenly.
    vote_for: request.purpose === "vote" ? (voters.indexOf(request.citizen.citizen_id) % 2 ? ava : noah) : null,
  });
  await sessionStartElectionAuto(ava, noah, decide);
  for (let i = 0; i < 4; i++) await sessionAdvanceAutoElection(talk, decide);
  const done = getSessionCity()!;
  assert.equal(done.activities!.at(-1)!.phase, "complete");
  const beat = (done.stories ?? []).find((s) => s.kind === "election")!.beats.at(-1)!;
  assert.equal(beat.icon, "🏆");
  assert.match(beat.text, /won the neighbourhood election by drawing lots/);
  assert.equal((done.life_log ?? []).filter((e) => e.kind === "election").length, 1, "the result is in the news once");
});

test("the resident you play casts their own ballot, and the election waits for it", async () => {
  const city = getSessionCity()!;
  const [ava, noah, iris] = ["Aoi", "Riku", "Mio"].map((name) => city.citizens.find((c) => c.name.startsWith(name))!.citizen_id);
  await sessionTakeControl(iris);
  const decide: DecideElection = async (request) => ({
    platform: "More clubs.", target_id: request.purpose === "campaign" ? iris : null, intention: "Win Mio over", reason: "Kind.", mood: "Calm",
    vote_for: request.purpose === "vote" ? (request.citizen.citizen_id === iris ? noah : ava) : null,
  });
  await sessionStartElectionAuto(ava, noah, decide);
  for (let i = 0; i < 6; i++) await sessionAdvanceAutoElection(talk, decide);
  let now = getSessionCity()!;
  const story = (now.stories ?? []).find((s) => s.kind === "election")!;
  assert.ok(story.beats.some((b) => b.icon === "🙋"), "a candidate comes to find the player instead of speaking for them");
  assert.equal(playerTurn(now)?.waiting, true);
  assert.equal(now.activities!.at(-1)!.phase, "voting");
  now = await sessionCastVote(noah);
  assert.equal(now.activities!.at(-1)!.phase, "complete");
  assert.ok(now.activities!.at(-1)!.ballots.some((b) => b.voter_id === iris && b.vote_for === noah && b.source === "player"));
});
