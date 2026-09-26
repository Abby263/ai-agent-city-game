import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import { getSessionCity, seedSession, sessionAdvanceAutoElection, sessionConversations, sessionCreateSituation, sessionStartElectionAuto } from "../src/lib/session-simulation";
import { activeStories } from "../src/lib/stories";
import type { SessionCognitionRequest, SessionCognitionResponse } from "../src/lib/types";
import type { DecideElection } from "../src/lib/elections";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } },
  configurable: true,
});
beforeEach(() => { storage.clear(); seedSession(createInitialCity()); });

let n = 0;
const talk = async (request: SessionCognitionRequest): Promise<SessionCognitionResponse> => ({
  thought: "", mood: "Surprised", memory: "We talked.", reflection: "", importance: 0.6,
  conversation: { conversation_id: `c${++n}`, game_day: 1, game_minute: 360, location_id: null, actor_ids: [request.actor_id, request.target_id!], summary: "They talked it over.",
    transcript: [{ speaker_id: request.actor_id, text: "Did you see what just happened?" }, { speaker_id: request.target_id!, text: "I can't believe it!" }] },
  participant_memories: {}, participant_outcomes: {},
});

test("a situation starts a story and the people involved react straight away", async () => {
  const city = getSessionCity()!;
  const [yui, daichi] = ["Yui", "Daichi"].map((name) => city.citizens.find((c) => c.name.startsWith(name))!.citizen_id);
  const { result, talked, story_id } = await sessionCreateSituation({ kind: "love_spark", citizen_ids: [yui, daichi] }, talk);
  assert.ok(result.headline);
  assert.equal(talked, true);
  const story = activeStories(getSessionCity()!).find((s) => s.id === story_id)!;
  assert.equal(story.icon, "💘");
  assert.ok(story.beats.some((b) => b.conversation_id), "the reaction conversation is a beat of the story");
  assert.ok(sessionConversations(yui).length > 0);
  assert.equal(getSessionCity()!.encounter, null, "no leftover encounter waits for a tick");
});

test("an election from Create runs its campaign and ends with a winner in the story", async () => {
  const city = getSessionCity()!;
  const [ava, noah] = ["Ava", "Noah"].map((name) => city.citizens.find((c) => c.name.startsWith(name))!.citizen_id);
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
  assert.ok(story.beats.some((b) => b.icon === "🏆" && /Ava Singh won/.test(b.text)));
});
