import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import {
  getSessionCity, saveSessionCity, seedSession, sessionMemories, sessionRelationships, sessionStartStory, sessionTakeControl, sessionTick,
} from "../src/lib/session-simulation";
import { INCIDENTS, STORYLINES, storyState } from "../src/lib/storyteller";
import type { SessionCognitionRequest, SessionCognitionResponse, SocialOutcome } from "../src/lib/types";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } },
  configurable: true,
});
beforeEach(() => { storage.clear(); seedSession(createInitialCity()); });

const id = (name: string) => getSessionCity()!.citizens.find((c) => c.name.startsWith(name))!.citizen_id;
let n = 0;
const talker = (outcomes: Record<string, SocialOutcome> = {}, requests: SessionCognitionRequest[] = []) =>
  async (request: SessionCognitionRequest): Promise<SessionCognitionResponse> => {
    requests.push(request);
    n++;
    return {
      thought: "", mood: "Calm", memory: "We talked.", reflection: "", importance: 0.6,
      conversation: { conversation_id: `s${n}`, game_day: 1, game_minute: 600, location_id: null, actor_ids: [request.actor_id, request.target_id!], summary: "They talked.",
        transcript: [{ speaker_id: request.actor_id, text: `Line ${n}.` }, { speaker_id: request.target_id!, text: `Reply ${n}.` }] },
      participant_memories: {}, participant_outcomes: outcomes,
    };
  };
/** Ordinary "should I talk to someone?" choices: nobody starts one, so only the storyteller acts. */
const keepQuiet = async () => ({ target_id: null, reason: "Not now.", topic: "" });

async function startAt(minute: number) {
  const city = getSessionCity()!;
  city.clock.minute_of_day = minute;
  saveSessionCity(city);
  return sessionStartStory();
}
const beats = () => getSessionCity()!.events.filter((e) => e.event_type === "story_beat");
/** Only one storyline left to play, at a given beat. */
function onlyStoryline(storyline: string, beat: number) {
  const city = getSessionCity()!;
  const progress = Object.fromEntries(STORYLINES.map((s) => [s.id, s.id === storyline ? beat : s.beats.length]));
  city.policy.story = { ...storyState(city.policy), progress };
  saveSessionCity(city);
}

test("a world opens as a running show, with the storylines' secrets planted once", async () => {
  const city = await startAt(600);
  assert.equal(city.simulation_mode, "autonomous");
  assert.equal(city.policy.time_mode, "fast");
  assert.equal(city.clock.running, true);
  const [ren, aoi] = ["Ren", "Aoi"].map(id);
  const secret = () => sessionMemories(ren).filter((m) => /Ninety-Nine Degrees/.test(m.content)).length;
  assert.equal(secret(), 1);
  assert.ok(sessionRelationships(ren).find((r) => r.other_citizen_id === aoi)!.feelings!.affection >= 45);
  // Later choices stick: starting again changes nothing.
  city.simulation_mode = "manual";
  saveSessionCity(city);
  await sessionStartStory();
  assert.equal(getSessionCity()!.simulation_mode, "manual");
  assert.equal(secret(), 1);
});

test("the director stages a scene in one AI call, with the stakes, and the storyline moves on", async () => {
  await startAt(600);
  const requests: SessionCognitionRequest[] = [];
  for (let i = 0; i < 24 && !beats().length; i++) await sessionTick(talker({}, requests), undefined, keepQuiet);
  const [beat] = beats();
  assert.ok(beat, "a storyline scene played during the day");
  const scene = requests.find((r) => r.actor_id === beat.actors[0] && r.target_id === beat.actors[1])!;
  assert.ok(scene.observations.some((o) => o.startsWith("What's at stake:")), "the scene's writer knows what's at stake");
  assert.ok(scene.observations.some((o) => /Don't smooth it over/.test(o)));
  const city = getSessionCity()!;
  const [actor, target] = beat.actors.map((who) => city.citizens.find((c) => c.citizen_id === who)!);
  assert.equal(actor.current_location_id, target.current_location_id, "the actor went to find them");
  assert.equal(storyState(city.policy).progress[String(beat.payload?.storyline)], Number(beat.payload?.beat) + 1);
  // Scenes are paced: not another one straight away.
  await sessionTick(talker({}, requests), undefined, keepQuiet);
  assert.equal(beats().length, 1);
});

test("a proposal in a storyline is a real question: yes starts dating, no doesn't", async () => {
  for (const [answer, status] of [["declined", "single"], ["accepted", "dating"]] as const) {
    storage.clear();
    seedSession(createInitialCity());
    await startAt(600);
    onlyStoryline("ren_song", 3);
    const [ren, aoi] = ["Ren", "Aoi"].map(id);
    const requests: SessionCognitionRequest[] = [];
    for (let i = 0; i < 30 && !beats().length; i++) await sessionTick(talker({ [aoi]: { invitation_response: answer } }, requests), undefined, keepQuiet);
    assert.equal(requests.find((r) => r.actor_id === ren)?.proposal, "date", "Aoi is asked a real question");
    assert.equal(getSessionCity()!.citizens.find((c) => c.citizen_id === aoi)!.life!.relationship_status, status);
  }
});

test("the resident you play is never pushed into a scene; other storylines carry on", async () => {
  await startAt(600);
  await sessionTakeControl(id("Ren"));
  for (let i = 0; i < 30 && beats().length < 2; i++) await sessionTick(talker(), undefined, keepQuiet);
  assert.ok(beats().length >= 1);
  assert.ok(beats().every((b) => !b.actors.includes(id("Ren"))));
});

test("the night is quiet; town incidents give everyone something to talk about", async () => {
  await startAt(120);
  for (let i = 0; i < 4; i++) await sessionTick(talker(), undefined, keepQuiet);
  assert.equal(beats().length, 0, "nobody is staged into a confrontation at 2 a.m.");
  await startAt(600);
  await sessionTick(talker(), undefined, keepQuiet);
  const incident = getSessionCity()!.events.find((e) => e.event_type === "town_incident")!;
  assert.equal(incident.description, INCIDENTS[0].headline);
  assert.ok(sessionMemories(id("Hiroshi")).some((m) => /autumn festival/.test(m.content)), "everyone heard about the festival");
});
