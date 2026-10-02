import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import { findPerson, findPlace, localReply, narrationBeats, narratorRequest, sceneIntro, sceneOutro, whatsGoingOn } from "../src/lib/narrator";
import { getSessionCity, saveSessionCity, seedSession, sessionStartStory, sessionTakeControl } from "../src/lib/session-simulation";
import { STORYLINES, storyState } from "../src/lib/storyteller";
import type { Conversation } from "../src/lib/types";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } },
  configurable: true,
});
beforeEach(async () => { storage.clear(); seedSession(createInitialCity()); await sessionStartStory(); });

const city = () => getSessionCity()!;
const id = (name: string) => city().citizens.find((c) => c.name.startsWith(name))!.citizen_id;
const types = (text: string) => localReply(text, city(), null)?.actions.map((a) => a.type);
const scene = (story?: { id: string; beat: number }): Conversation => ({
  conversation_id: "c1", game_day: 1, game_minute: 450, location_id: "loc_station", actor_ids: [id("Aiko"), id("Haruto")], summary: "",
  transcript: [{ speaker_id: id("Aiko"), text: "I found your manga." }, { speaker_id: id("Haruto"), text: "Please don't tell Dad." }],
  encounter: { kind: "chance", reason: "I found Haruto's manga pages.", topic: "the manga pages", story },
});

test("names and places are found in what was said, even when speech recognition mishears them", () => {
  assert.equal(findPerson(city(), "play as Ren please")?.citizen_id, id("Ren"));
  assert.equal(findPerson(city(), "talk to harudo")?.citizen_id, id("Haruto"), "a near miss still finds Haruto");
  assert.equal(findPerson(city(), "the weather is nice"), undefined);
  assert.match(findPlace(city(), "the station")!.name, /station/i);
  assert.match(findPlace(city(), "sunny side cafe")!.name, /cafe/i);
});

test("plain commands are understood at once, without a model", async () => {
  assert.deepEqual(types("pause"), ["pause"]);
  assert.deepEqual(types("Resume."), ["resume"]);
  assert.deepEqual(types("speed up"), ["speed"]);
  assert.deepEqual(types("show me the whole town"), ["overview"]);
  const both = localReply("I want to play as Ren and talk to Aoi", city(), null)!;
  assert.deepEqual(both.actions.map((a) => [a.type, a.citizen_id]), [["play_as", id("Ren")], ["talk_to", id("Aoi")]]);
  assert.match(both.say, /You're Ren now/);
  const walk = localReply("let me be Hana then go to the library", city(), null)!;
  assert.deepEqual(walk.actions.map((a) => a.type), ["play_as", "go_to"]);
  assert.equal(walk.actions[1].location_id, "loc_library");
  // Talking needs someone to be: the narrator asks instead of guessing.
  const ask = localReply("talk to Aoi", city(), null)!;
  assert.equal(ask.actions.length, 0);
  assert.match(ask.say, /Who do you want to be/);
  await sessionTakeControl(id("Ren"));
  assert.deepEqual(localReply("talk to Aoi", city(), null)!.actions.map((a) => [a.type, a.citizen_id]), [["talk_to", id("Aoi")]]);
  assert.deepEqual(types("stop playing"), ["stop_playing"]);
  assert.deepEqual(types("go to the station"), ["go_to"]);
});

test("questions and anything unclear go to the narrator model", () => {
  for (const text of ["what's going on?", "who is Haruto and why is he nervous", "make it rain at the shrine", "play as Ren and ask Aoi about the song"])
    assert.equal(localReply(text, city(), null), null, text);
});

test("a nudge by voice reaches someone in a case's next scene, in the player's words", () => {
  const next = STORYLINES.find((s) => s.id === "haruto_manga")!.beats[0];
  const reply = localReply("Nudge Haruto to tell the whole truth", city(), null)!;
  assert.deepEqual(reply.actions.map((a) => [a.type, a.citizen_id, a.case_id, a.text]), [["nudge", next.target, "haruto_manga", "Tell the whole truth."]]);
  assert.match(localReply("nudge Hiroshi to cheer up", city(), null)!.say, /isn't in the next scene/);
  const spent = city();
  spent.policy.story = { ...storyState(spent.policy), nudge_day: 1, nudges_used: 3 };
  saveSessionCity(spent);
  assert.match(localReply("nudge Haruto to tell the truth", city(), null)!.say, /out of nudges/);
});

test("the narrator sets up each scene and says how it went", () => {
  const opening = sceneIntro(city(), scene({ id: "haruto_manga", beat: 0 }));
  assert.match(opening, /Station/i);
  assert.match(opening, /A new case: Last Train\. Aiko found something hidden under Haruto's futon\./);
  assert.doesNotMatch(opening, /secretly entered a manga contest/, "the backstory stays on the case board");
  assert.doesNotMatch(opening, /📒/, "nothing the voice can't say");
  assert.ok(narrationBeats(opening).length <= 4 && narrationBeats(opening).every((b) => b.split(" ").length <= 16), "a few short beats");
  assert.doesNotMatch(sceneIntro(city(), scene({ id: "haruto_manga", beat: 1 })), /A new case/);
  assert.match(sceneIntro(city(), scene()), /\. Aiko (has spotted|goes over to|wants a word with) Haruto\.$/);
  const played = city();
  played.policy.story = { ...storyState(played.policy), progress: { haruto_manga: 1 }, results: { haruto_manga: ["well"] } };
  saveSessionCity(played);
  const outro = sceneOutro(city(), scene({ id: "haruto_manga", beat: 0 }));
  assert.match(outro, /Next: Haruto secretly asks Hana to look at his manga\. Want a word with Haruto or Hana first\?$/);
  assert.ok(outro.split(" ").length <= 28, "said in a breath or two");
  assert.equal(sceneOutro(city(), scene()), "", "ordinary scenes need no verdict");
});

test("the narrator model is told what is on screen, the cases and who is around", () => {
  const request = narratorRequest("what is going on", city(), { conversation: scene({ id: "haruto_manga", beat: 0 }), line: 0 }, [{ role: "player", text: "hi" }], "Monday 07:30");
  assert.match(request.on_screen, /Lines so far: Aiko: I found your manga\.$/, "only the lines already spoken");
  assert.equal(request.cases.length, 3);
  assert.deepEqual(request.cases[0].next_scene_people.length, 2);
  assert.equal(request.nudges_left, 3);
  assert.ok(request.people.some((p) => p.name.startsWith("Haruto")) && request.places.some((p) => p.location_id === "loc_station"));
  assert.match(whatsGoingOn(city(), null), /You have 3 open cases\. Next up:/);
});

test("the narrator speaks in short beats, one sentence at a time", () => {
  assert.deepEqual(narrationBeats("Charbagh Station. A new case: Adi Lakhnavi. Kamla found a notebook! Listen."), ["Charbagh Station.", "A new case: Adi Lakhnavi.", "Kamla found a notebook!", "Listen."]);
  const long = narrationBeats("Aditya is reciting at Sunday's mushaira under a pen name, and his father Rajendra, the station superintendent, thinks he is revising for the railway exam.");
  assert.equal(long.length, 2, "a long sentence is broken at a pause");
  assert.deepEqual(narrationBeats("  "), []);
  assert.deepEqual(narrationBeats("No full stop"), ["No full stop"]);
});

test("the narrator picks the most natural voice the device has, and a local one in Lucknow", async () => {
  const { narratorVoice, readingTime } = await import("../src/lib/narrator-voice");
  const voices = [
    { name: "Fred", lang: "en-US", default: true }, { name: "Daniel", lang: "en-GB", default: false },
    { name: "Microsoft Ryan Online (Natural)", lang: "en-GB", default: false }, { name: "Rishi", lang: "en-IN", default: false }, { name: "Kyoko", lang: "ja-JP", default: false },
  ];
  assert.equal(narratorVoice(voices, "nakameguro")?.name, "Microsoft Ryan Online (Natural)");
  assert.equal(narratorVoice(voices, "lucknow")?.name, "Rishi");
  assert.equal(narratorVoice(voices.slice(0, 2), "lucknow")?.name, "Daniel");
  assert.equal(narratorVoice([voices[4]], "lucknow"), undefined, "never a voice that can't read English");
  assert.ok(readingTime("Charbagh Station.") >= 1700 && readingTime("Kamla found a notebook hidden under Aditya's mattress.") > 3000);
});
