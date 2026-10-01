import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import { getSessionCity, saveSessionCity, seedSession, sessionMemories, sessionNudge, sessionSpendNudge, sessionStartStory, sessionTick } from "../src/lib/session-simulation";
import { CASE_ORDER, NUDGES_PER_DAY, OPEN_CASES, STORYLINES, caseOutcome, nudgesLeft, openCases, sceneResult, storyState } from "../src/lib/storyteller";
import type { SessionCognitionRequest, SessionCognitionResponse, SocialOutcome } from "../src/lib/types";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } },
  configurable: true,
});
beforeEach(() => { storage.clear(); seedSession(createInitialCity()); });

let n = 0;
const talker = (effect: SocialOutcome["relationship_effect"], requests: SessionCognitionRequest[] = []) =>
  async (request: SessionCognitionRequest): Promise<SessionCognitionResponse> => {
    requests.push(request);
    n++;
    return {
      thought: "", mood: "Calm", memory: "We talked.", reflection: "", importance: 0.6,
      conversation: { conversation_id: `c${n}`, game_day: 1, game_minute: 600, location_id: null, actor_ids: [request.actor_id, request.target_id!], summary: "They talked.",
        transcript: [{ speaker_id: request.actor_id, text: `Line ${n}.` }, { speaker_id: request.target_id!, text: `Reply ${n}.` }] },
      participant_memories: {},
      participant_outcomes: { [request.actor_id]: { relationship_effect: effect }, [request.target_id!]: { relationship_effect: effect } },
    };
  };
const keepQuiet = async () => ({ target_id: null, reason: "Not now.", topic: "" });
const story = () => storyState(getSessionCity()!.policy);
const events = (type: string) => getSessionCity()!.events.filter((e) => e.event_type === type);
/** Leaves one case with only its last scene to play. */
function lastSceneOf(id: string) {
  const city = getSessionCity()!;
  const state = storyState(city.policy);
  for (const s of STORYLINES) state.progress[s.id] = s.id === id ? s.beats.length - 1 : CASE_ORDER.indexOf(s.id) < CASE_ORDER.indexOf(id) ? s.beats.length : 0;
  city.clock.minute_of_day = 600;
  city.policy.story = state;
  saveSessionCity(city);
}

test("a new world opens at breakfast with three cases, the strongest first", async () => {
  const city = await sessionStartStory();
  assert.equal(city.clock.minute_of_day, 435, "the sleepy first hour is skipped");
  const open = openCases(story());
  assert.equal(open.length, OPEN_CASES);
  assert.equal(open[0].id, "haruto_manga");
  assert.ok(STORYLINES.every((s) => s.goal && s.brief && s.well && s.badly && CASE_ORDER.includes(s.id)), "every storyline is a case with a goal and two endings");
  const requests: SessionCognitionRequest[] = [];
  let decisions = 0;
  for (let i = 0; i < 6 && !events("story_beat").length; i++) await sessionTick(talker("positive", requests), undefined, async () => { decisions++; return keepQuiet(); });
  assert.equal(events("story_beat")[0]?.payload?.storyline, "haruto_manga", "the first scene of the game is the first case");
  assert.equal(decisions, 0, "no small talk is staged before it");
});

test("how scenes and cases are judged", () => {
  assert.equal(sceneResult(["positive", "neutral"]), "well");
  assert.equal(sceneResult(["negative", "neutral"]), "badly");
  assert.equal(sceneResult(["positive", "negative"]), "mixed");
  assert.equal(sceneResult([undefined, undefined]), "mixed");
  assert.equal(caseOutcome(["badly", "badly"], "accepted"), "well", "a yes decides a proposal");
  assert.equal(caseOutcome(["well", "well"], "declined"), "badly");
  assert.equal(caseOutcome(["well", "badly"]), "badly", "otherwise the last scene decides");
  assert.equal(caseOutcome(["well", "badly", "mixed"]), "well", "a mixed ending falls back on the scenes before it");
});

test("a nudge is rationed, remembered by the resident and carried into their next scene", async () => {
  await sessionStartStory();
  const first = openCases(story())[0], beat = first.beats[0];
  assert.throws(() => sessionNudge(first.id, "cit_009", "Tell the truth."), /next scene/, "only the people in the next scene can be nudged");
  sessionNudge(first.id, beat.target, "Tell the whole truth.");
  assert.equal(nudgesLeft(story(), 1), NUDGES_PER_DAY - 1);
  assert.ok(sessionMemories(beat.target).some((m) => /Tell the whole truth/.test(m.content)));
  assert.equal(events("nudge").length, 1);
  const requests: SessionCognitionRequest[] = [];
  for (let i = 0; i < 6 && !events("story_beat").length; i++) await sessionTick(talker("positive", requests), undefined, keepQuiet);
  const scene = requests.find((r) => r.actor_id === beat.actor && r.target_id === beat.target)!;
  assert.match(scene.private_memories![beat.target][0], /Advice from a neighbour I trust.*Tell the whole truth/);
  assert.ok(!scene.private_memories![beat.actor].some((m) => /Advice from a neighbour/.test(m)), "the other person never hears it");
  assert.equal(story().results[first.id][0], "well");
  // The rest of the day's nudges, then none until tomorrow.
  sessionSpendNudge();
  sessionSpendNudge();
  assert.throws(() => sessionSpendNudge(), /No nudges left today/);
  assert.equal(nudgesLeft(story(), 2), NUDGES_PER_DAY, "a new day brings three more");
});

test("a case closes on its last scene, well or badly, and the next one opens", async () => {
  for (const [effect, outcome] of [["positive", "well"], ["negative", "badly"]] as const) {
    storage.clear();
    seedSession(createInitialCity());
    await sessionStartStory();
    lastSceneOf("haruto_manga");
    const requests: SessionCognitionRequest[] = [];
    for (let i = 0; i < 30 && !events("case_closed").length; i++) await sessionTick(talker(effect, requests), undefined, keepQuiet);
    const closed = events("case_closed")[0];
    assert.equal(closed?.payload?.storyline, "haruto_manga");
    assert.equal(closed.payload?.outcome, outcome);
    assert.equal(story().closed.haruto_manga.outcome, outcome);
    const finale = requests.find((r) => r.observations.some((o) => /comes to a head/.test(o)));
    assert.ok(finale, "the last scene is told to land somewhere");
    assert.ok(finale.observations.some((o) => /here and now/.test(o)));
    assert.equal(openCases(story()).length, OPEN_CASES, "the desk is topped back up");
    assert.equal(events("case_opened")[0]?.payload?.storyline, CASE_ORDER[OPEN_CASES]);
    const saved = getSessionCity()!;
    assert.ok(saved.events.every((e) => e.event_type !== "season_finale"));
  }
});
