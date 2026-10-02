import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { CITY_LIST, activeCity, cityText, setActiveCity } from "../src/lib/cities";
import { calendarDay, holidayOn, mondayOnOrBefore } from "../src/lib/calendar";
import { defaultCharacterPrompt } from "../src/lib/character-prompt";
import { createInitialCity } from "../src/lib/initial-city";
import { localReply, sceneIntro } from "../src/lib/narrator";
import { routineStop } from "../src/lib/routine";
import { getSessionCity, resetSession, seedSession, sessionMemories, sessionRelationships, sessionStartStory, sessionTick } from "../src/lib/session-simulation";
import { CASE_ORDER, INCIDENTS, STORYLINES, openCases, storyState } from "../src/lib/storyteller";
import type { SessionCognitionRequest, SessionCognitionResponse } from "../src/lib/types";
import { dayWeather } from "../src/lib/weather";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k),
    key: (i: number) => [...storage.keys()][i] ?? null, get length() { return storage.size; } } },
  configurable: true,
});
beforeEach(() => { storage.clear(); setActiveCity("lucknow"); });
afterEach(() => setActiveCity("nakameguro"));

const talker = async (request: SessionCognitionRequest): Promise<SessionCognitionResponse> => ({
  thought: "", mood: "Calm", memory: "We talked.", reflection: "", importance: 0.6,
  conversation: { conversation_id: `c${Math.random()}`, game_day: 1, game_minute: 600, location_id: null, actor_ids: [request.actor_id, request.target_id!], summary: "They talked.",
    transcript: [{ speaker_id: request.actor_id, text: "Arre, suno." }, { speaker_id: request.target_id!, text: "Ji?" }] },
  participant_memories: {}, participant_outcomes: {},
});
const keepQuiet = async () => ({ target_id: null, reason: "Not now.", topic: "" });

test("every city has a full, self-consistent cast and set of cases", () => {
  for (const place of CITY_LIST) {
    setActiveCity(place.id);
    const city = createInitialCity();
    const ids = new Set(city.citizens.map((c) => c.citizen_id));
    assert.equal(city.city_name, place.name);
    assert.equal(city.citizens.length, 26, `${place.name} has 26 residents`);
    assert.equal(STORYLINES.length, 9);
    assert.deepEqual([...CASE_ORDER].sort(), STORYLINES.map((s) => s.id).sort(), "every storyline is in the case order");
    for (const storyline of STORYLINES) {
      for (const seed of storyline.seeds) assert.ok(ids.has(seed.who) && (!seed.feels || ids.has(seed.feels.toward)), `${storyline.id}: seeds name residents of ${place.name}`);
      for (const beat of storyline.beats) {
        assert.ok(ids.has(beat.actor) && ids.has(beat.target) && beat.actor !== beat.target, `${storyline.id}: beats are between residents of ${place.name}`);
        for (const seed of beat.prelude ?? []) assert.ok(ids.has(seed.who));
      }
    }
    for (const incident of INCIDENTS) if (incident.who !== "everyone") assert.ok(incident.who.every((id) => ids.has(id)), incident.id);
    for (const c of city.citizens) {
      const life = c.life!;
      for (const id of [...life.parent_ids, ...life.children_ids, life.partner_id].filter((id): id is string => Boolean(id) && !String(id).startsWith("ext_")))
        assert.ok(ids.has(id), `${c.name}'s family lives in ${place.name}`);
      assert.ok(city.locations.some((l) => l.location_id === c.home_location_id));
      if (life.job) assert.ok(city.locations.some((l) => l.location_id === life.job!.location_id));
    }
  }
});

test("Lucknow is its own place: names, people, speech of the prompt, festivals and weather", () => {
  const city = createInitialCity();
  const name = (id: string) => city.locations.find((l) => l.location_id === id)!.name;
  assert.equal(name("loc_station"), "Charbagh Station");
  assert.equal(name("loc_shrine"), "Bara Imambara");
  assert.equal(name("loc_mall"), "Hazratganj Arcade");
  const text = JSON.stringify(city);
  for (const leak of ["Nakameguro", "Tokyo", "Japan", "Meguro", "cit_0"]) assert.ok(!text.includes(leak), `no ${leak} in Lucknow`);
  const kabir = city.citizens.find((c) => c.name === "Kabir Qureshi")!;
  assert.match(defaultCharacterPrompt(kabir), /kabab cook in Lucknow\.\nIndian resident of Lucknow, India/);
  assert.equal(holidayOn(new Date(Date.UTC(2026, 9, 2))), "Gandhi Jayanti");
  assert.equal(holidayOn(new Date(Date.UTC(2026, 10, 8))), "Diwali");
  assert.equal(holidayOn(new Date(Date.UTC(2026, 10, 3))), null, "Japan's Culture Day is not a holiday here");
  assert.equal(calendarDay("2026-05-04", 1).season, "summer", "May is high summer");
  // 23:00 UTC on Sunday is already Monday morning in India (and in Japan).
  assert.equal(mondayOnOrBefore(new Date(Date.UTC(2026, 8, 27, 23, 0))), "2026-09-28");
  assert.equal(mondayOnOrBefore(new Date(Date.UTC(2026, 8, 27, 17, 0))), "2026-09-21", "17:00 UTC is still Sunday night in Lucknow");
  // A year of weather: hot, a real monsoon, never snow or typhoons.
  const year = Array.from({ length: 364 }, (_, i) => dayWeather("2026-01-05", i + 1));
  assert.ok(year.every((d) => d.condition !== "snow" && d.condition !== "typhoon"));
  const monsoon = year.slice(190, 240), winter = year.slice(0, 40);
  assert.ok(monsoon.filter((d) => ["rain", "heavy_rain"].includes(d.condition)).length > winter.filter((d) => ["rain", "heavy_rain"].includes(d.condition)).length * 3, "July and August are far wetter than January");
  assert.ok(Math.max(...year.slice(110, 160).map((d) => d.high)) >= 40, "May reaches 40°C");
  assert.ok(year.some((d) => d.heatwave), "the loo blows in early summer");
  assert.ok(winter.some((d) => d.morningFog), "winter mornings are foggy");
});

test("text written for Nakameguro reads as Lucknow", () => {
  assert.equal(cityText("A new week in Nakameguro: lunch at Sunny Side Cafe."), "A new week in Lucknow: lunch at Nawab Kabab House.");
  const city = createInitialCity();
  const elder = city.citizens.find((c) => c.name === "Mirza Yusuf Baig")!;
  const activities = new Set(Array.from({ length: 48 }, (_, i) => routineStop(elder, 1, i * 30).activity));
  assert.ok([...activities].some((a) => /Nawab Kabab House|Bara Imambara/.test(a)), "his day names Lucknow's places");
  assert.ok(![...activities].some((a) => /Sunny Side|Hikawa/.test(a)));
  setActiveCity("nakameguro");
  assert.equal(cityText("Lunch at Sunny Side Cafe"), "Lunch at Sunny Side Cafe");
});

test("each city keeps its own saved world, and Lucknow opens on its own first case", async () => {
  seedSession(createInitialCity());
  await sessionStartStory();
  assert.ok([...storage.keys()].every((k) => k.startsWith("agentcity.v12.lucknow.")), "Lucknow's world is stored under its own name");
  assert.equal(openCases(storyState(getSessionCity()!.policy))[0].id, "aditya_shayari");
  const kabir = getSessionCity()!.citizens.find((c) => c.name.startsWith("Kabir"))!.citizen_id;
  const zoya = getSessionCity()!.citizens.find((c) => c.name.startsWith("Zoya"))!.citizen_id;
  assert.ok(sessionMemories(kabir).some((m) => /Chowk ki Shaam/.test(m.content)), "the ghazal secret is planted");
  assert.ok(sessionRelationships(kabir).find((r) => r.other_citizen_id === zoya)!.feelings!.affection >= 45);
  for (let i = 0; i < 6 && !getSessionCity()!.events.some((e) => e.event_type === "story_beat"); i++) await sessionTick(talker, undefined, keepQuiet);
  const beat = getSessionCity()!.events.find((e) => e.event_type === "story_beat")!;
  assert.equal(beat.payload?.storyline, "aditya_shayari");
  const scene = (await import("../src/lib/session-simulation")).sessionConversations()[0];
  assert.match(sceneIntro(getSessionCity()!, scene), /Kamla found a notebook hidden under Aditya's mattress\..*mushaira/);
  assert.deepEqual(localReply("play as Kabir and talk to Zoya", getSessionCity()!, null)!.actions.map((a) => a.citizen_id), [kabir, zoya]);
  // Nakameguro, played in the same browser, has its own world and is untouched by a reset here.
  setActiveCity("nakameguro");
  assert.equal(getSessionCity(), null);
  seedSession(createInitialCity());
  assert.ok(storage.has("agentcity.v12.city"));
  setActiveCity("lucknow");
  resetSession();
  assert.equal(getSessionCity(), null, "Lucknow's season is wiped");
  setActiveCity("nakameguro");
  assert.equal(getSessionCity()!.city_name, "Nakameguro", "Nakameguro's world survives");
  resetSession();
  assert.equal(storage.size, 0);
});
