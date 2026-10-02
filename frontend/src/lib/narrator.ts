import { NUDGES_PER_DAY, STORYLINES, nudgesLeft, openCases, storyState, type SceneResult } from "./storyteller";
import type { CitizenAgent, CityState, Conversation } from "./types";

// The narrator tells the player what is going on and carries out what they ask for, spoken or typed.
// Plain commands ("pause", "play as Ren and talk to Aoi") are understood here, at once and for free; anything else
// goes to the narrator model (backend: cognition/narrator.py), which answers and returns actions from the same list.

export type NarratorActionType = "play_as" | "stop_playing" | "talk_to" | "say_to" | "go_to" | "nudge" | "watch" | "pause" | "resume"
  | "speed" | "street_view" | "overview" | "make_happen" | "replay_scene" | "skip_scene" | "mute" | "unmute";
export type NarratorAction = { type: NarratorActionType; citizen_id: string; location_id: string; case_id: string; text: string };
export type NarratorReply = { say: string; actions: NarratorAction[] };
export type NarratorTurn = { role: "player" | "narrator"; text: string };
export type NarratorRequest = {
  text: string; city_time: string; playing_as: string; on_screen: string; recent: string[];
  cases: Array<{ case_id: string; title: string; goal: string; brief: string; so_far: string[]; next_scene: string; next_scene_people: string[] }>;
  nudges_left: number;
  people: Array<{ citizen_id: string; name: string; age: number; profession: string; location: string; activity: string; mood: string }>;
  places: Array<{ location_id: string; name: string }>;
  history: NarratorTurn[];
};
/** The scene being played, and how far into it we are. */
export type OnStage = { conversation: Conversation; line: number } | null;

const first = (c?: Pick<CitizenAgent, "name">) => c?.name.split(" ")[0] ?? "Someone";
const action = (type: NarratorActionType, fields: Partial<NarratorAction> = {}): NarratorAction => ({ type, citizen_id: "", location_id: "", case_id: "", text: "", ...fields });
const plain = (text: string) => text.replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "").replace(/\s+/g, " ").trim();
const sentence = (text: string) => { const t = plain(text); return /[.!?]$/.test(t) ? t : `${t}.`; };
const place = (city: CityState, id: string | null | undefined) => city.locations.find((l) => l.location_id === id)?.name ?? city.city_name;
const person = (city: CityState, id: string) => city.citizens.find((c) => c.citizen_id === id);

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = keep;
    }
  }
  return row[b.length];
}
const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean);

/** The resident a spoken phrase names: an exact first or full name, else the closest first name (speech mishears). */
export function findPerson(city: CityState, spoken: string): CitizenAgent | undefined {
  const said = words(spoken);
  if (!said.length) return undefined;
  const exact = city.citizens.find((c) => said.includes(first(c).toLowerCase()));
  if (exact) return exact;
  let best: { citizen: CitizenAgent; score: number } | undefined;
  for (const citizen of city.citizens) {
    const name = first(citizen).toLowerCase();
    for (const word of said) {
      if (word.length < 3) continue;
      const score = distance(word, name);
      if (score <= (name.length >= 6 ? 2 : 1) && (!best || score < best.score)) best = { citizen, score };
    }
  }
  return best?.citizen;
}

/** The place a spoken phrase names: any distinctive word of its name ("station", "cafe", "library"). */
export function findPlace(city: CityState, spoken: string) {
  const said = words(spoken).filter((w) => w.length > 2 && !["the", "and", "nakameguro"].includes(w));
  let best: { id: string; hits: number } | undefined;
  for (const location of city.locations) {
    const name = words(location.name);
    const hits = said.filter((w) => name.some((n) => n === w || (w.length > 4 && distance(n, w) <= 1))).length;
    if (hits && (!best || hits > best.hits)) best = { id: location.location_id, hits };
  }
  return best ? city.locations.find((l) => l.location_id === best!.id) : undefined;
}

/** One of a few ways of saying the same thing, always the same one for the same scene. */
function pick(key: string, options: string[]) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return options[hash % options.length];
}

/**
 * Splits what the narrator has to say into beats: one short sentence each, said (and shown) one at a time with a
 * breath between, so the player can follow. A long sentence is broken at a natural pause.
 */
export function narrationBeats(text: string): string[] {
  const sentences = plain(text).match(/[^.!?…]+(?:[.!?…]+["”')]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  return sentences.flatMap((sentence) => {
    const count = sentence.split(/\s+/).length;
    if (count <= 16) return [sentence];
    // Break at the comma, colon or semicolon nearest the middle.
    const middle = sentence.length / 2;
    let cut = -1;
    for (const match of sentence.matchAll(/[,;:]\s/g)) if (cut < 0 || Math.abs(match.index - middle) < Math.abs(cut - middle)) cut = match.index;
    return cut > 12 && cut < sentence.length - 12 ? [sentence.slice(0, cut + 1), sentence.slice(cut + 2)] : [sentence];
  });
}

const RESULT: Record<SceneResult, string[]> = {
  well: ["That went well.", "Good. That went better than it might have.", "Well, that landed."],
  badly: ["Ouch. That went badly.", "That did not go well.", "Oh dear. That made things worse."],
  mixed: ["Hm. That could go either way.", "Not good, not bad. We'll see.", "Hard to say how that went."],
};

/** What the narrator says as a scene opens: where, and what is happening. Two or three short beats, no more. */
export function sceneIntro(city: CityState, conversation: Conversation) {
  const [a, b] = conversation.actor_ids.map((id) => person(city, id));
  const where = place(city, conversation.location_id);
  const key = conversation.conversation_id;
  const staged = conversation.encounter?.story;
  const storyline = staged && STORYLINES.find((s) => s.id === staged.id);
  const beat = storyline?.beats[staged!.beat];
  if (storyline && beat) {
    // The backstory is on the case board; aloud, the narrator only names the case and says what is happening now.
    const last = staged!.beat === storyline.beats.length - 1;
    const lead = staged!.beat === 0 ? `A new case: ${plain(storyline.title)}.` : last ? pick(key, ["This is the one that decides it.", "Here it is. The moment of truth."]) : "";
    return `${where}. ${lead ? `${lead} ` : ""}${sentence(beat.headline)}${staged!.beat === 0 ? ` ${pick(key, ["Let's listen in.", "Watch how this goes.", "Listen."])}` : ""}`;
  }
  if (conversation.encounter?.kind === "planned") return `${where}. ${first(a)} and ${first(b)} kept their plan to meet.`;
  return `${where}. ${pick(key, [`${first(a)} has spotted ${first(b)}.`, `${first(a)} goes over to ${first(b)}.`, `${first(a)} wants a word with ${first(b)}.`])}`;
}

/** What the narrator says when a scene ends: how it went, what is coming, and the player's move. Short. */
export function sceneOutro(city: CityState, conversation: Conversation) {
  const staged = conversation.encounter?.story;
  const storyline = staged && STORYLINES.find((s) => s.id === staged.id);
  if (!storyline || !staged) return "";
  const story = storyState(city.policy);
  const result = story.results[storyline.id]?.[staged.beat];
  const closed = story.closed[storyline.id];
  if (closed) return `Case closed. ${closed.outcome === "well" ? storyline.well : storyline.badly}`;
  const verdict = result ? pick(conversation.conversation_id, RESULT[result]) : "";
  const next = storyline.beats[story.progress[storyline.id] ?? 0];
  if (!next) return verdict;
  const pair = [next.actor, next.target].map((id) => first(person(city, id)));
  return `${verdict ? `${verdict} ` : ""}Next: ${sentence(next.headline)} ${nudgesLeft(story, city.clock.day) > 0
    ? `Want a word with ${pair[0]} or ${pair[1]} first?` : "No nudges left today, so we watch."}`;
}

/** A summary of the moment, from what the game already knows: the fallback when the narrator model can't be reached. */
export function whatsGoingOn(city: CityState, stage: OnStage) {
  const story = storyState(city.policy);
  const cases = openCases(story);
  const parts: string[] = [];
  if (stage) {
    const names = stage.conversation.actor_ids.map((id) => first(person(city, id))).join(" and ");
    parts.push(`${names} are talking at ${place(city, stage.conversation.location_id)}.`);
  } else if (city.policy.player_citizen_id) {
    const you = person(city, String(city.policy.player_citizen_id));
    parts.push(`You are ${first(you)}, at ${place(city, you?.current_location_id)}.`);
  }
  if (cases.length) {
    const next = cases[0].beats[story.progress[cases[0].id] ?? 0];
    parts.push(`You have ${cases.length} open ${cases.length === 1 ? "case" : "cases"}.${next ? ` Next up: ${sentence(next.headline)}` : ""}`);
  } else parts.push("Every case is closed. The town carries on.");
  return parts.join(" ");
}

function onScreen(city: CityState, stage: OnStage) {
  if (!stage) return city.clock.running ? "No scene is playing. The town is going about its day." : "The town is paused. No scene is playing.";
  const { conversation, line } = stage;
  const spoken = conversation.transcript.slice(0, line + 1).map((l) => `${first(person(city, l.speaker_id))}: ${l.text}`);
  return `A scene is playing at ${place(city, conversation.location_id)}. ${sceneIntro(city, conversation)} Lines so far: ${spoken.join(" / ")}`.slice(0, 2900);
}

export function narratorRequest(text: string, city: CityState, stage: OnStage, history: NarratorTurn[], cityTime: string): NarratorRequest {
  const story = storyState(city.policy);
  return {
    text: text.slice(0, 400), city_time: cityTime, playing_as: String(city.policy.player_citizen_id ?? ""),
    on_screen: onScreen(city, stage),
    recent: city.events.filter((e) => e.priority >= 2).slice(-8).map((e) => plain(e.description).slice(0, 220)),
    cases: openCases(story).map((c) => {
      const next = c.beats[story.progress[c.id] ?? 0];
      return { case_id: c.id, title: c.title, goal: c.goal, brief: c.brief, so_far: (story.results[c.id] ?? []).filter(Boolean),
        next_scene: next ? plain(next.headline) : "", next_scene_people: next ? [next.actor, next.target] : [] };
    }),
    nudges_left: Math.max(0, Math.min(NUDGES_PER_DAY, nudgesLeft(story, city.clock.day))),
    people: city.citizens.filter((c) => c.age >= 3).slice(0, 60).map((c) => ({ citizen_id: c.citizen_id, name: c.name, age: c.age, profession: c.profession,
      location: place(city, c.current_location_id), activity: c.current_activity.slice(0, 80), mood: c.mood })),
    places: city.locations.slice(0, 40).map((l) => ({ location_id: l.location_id, name: l.name })),
    history: history.slice(-6).map((t) => ({ role: t.role, text: t.text.slice(0, 600) })),
  };
}

export const NARRATOR_HELP = "Try: “what's going on?”, “play as Ren and talk to Aoi”, “nudge Haruto to tell the truth”, “go to the station”, or “pause”.";

/**
 * Commands that need no thinking, answered at once. Returns null for anything else (questions, anything ambiguous),
 * which goes to the narrator model.
 */
export function localReply(text: string, city: CityState, stage: OnStage): NarratorReply | null {
  const said = text.toLowerCase().replace(/[.!?,]/g, " ").replace(/\s+/g, " ").trim();
  const playerId = city.policy.player_citizen_id ? String(city.policy.player_citizen_id) : "";
  const one = (say: string, ...actions: NarratorAction[]): NarratorReply => ({ say, actions });
  if (/^(help|what can i (say|do)|commands)$/.test(said)) return one(NARRATOR_HELP);
  if (/\b(stop playing|back to watching|just watch|be the observer|stop being|let go of)\b/.test(said)) return playerId ? one("You're back to watching.", action("stop_playing")) : one("You're already just watching.");
  if (/^(pause|stop|hold on|wait|freeze)( the (game|town|city))?$/.test(said)) return one("Paused.", action("pause"));
  if (/^(resume|unpause|continue|carry on|go on|play|start|keep going)( the (game|town|city))?$/.test(said)) return one("And we're back.", action("resume"));
  if (/^(skip|next)( (this|the))?( scene| conversation)?$/.test(said)) return stage ? one("Skipping ahead.", action("skip_scene")) : one("Nothing is playing right now.");
  if (/\b(replay|play (that|it) again|watch (that|it) again|show (that|it) again)\b/.test(said)) return one("Here it is again.", action("replay_scene"));
  if (/^(unmute|sound on|turn (the )?sound on)$/.test(said)) return one("Sound on.", action("unmute"));
  if (/^(mute|quiet|silence|sound off|turn (the )?sound off|be quiet)$/.test(said)) return one("Muted.", action("mute"));
  if (/\b(faster|speed up|fast forward)\b/.test(said)) return one("Speeding things up.", action("speed", { text: /\b(fastest|max)\b/.test(said) ? "4" : "2" }));
  if (/\b(slow down|slower|normal speed)\b/.test(said)) return one("Back to story pace.", action("speed", { text: "1" }));
  if (/\b(whole town|overview|zoom out|from above|bird'?s eye)\b/.test(said)) return one("Here's the whole neighbourhood.", action("overview"));

  // "play as Ren", "let me be Ren and talk to Aoi", "I want to play as Hana then go to the library".
  const become = said.match(/\b(?:play(?:ing)? as|be|become|control|switch to|take over)\s+(.+)$/);
  if (become && !/^(quiet|honest|careful)\b/.test(become[1])) {
    const [who, ...rest] = become[1].split(/\b(?:and then|and|then)\b/);
    const me = findPerson(city, who);
    if (me) {
      if (me.age < 3) return one(`${first(me)} is a little young for that. Pick someone older.`);
      const actions = [action("play_as", { citizen_id: me.citizen_id })];
      let say = `You're ${first(me)} now.`;
      const then = rest.join(" and ").trim();
      const talk = then.match(/\b(?:talk|speak|chat)(?:ing)?\s+(?:to|with)\s+(.+)$/) ?? then.match(/\b(?:find|meet|see|visit)\s+(.+)$/);
      const walk = then.match(/\b(?:go|walk|head)(?:ing)?\s+(?:to|over to)\s+(.+)$/);
      if (talk) {
        const them = findPerson(city, talk[1]);
        if (them && them.citizen_id !== me.citizen_id) { actions.push(action("talk_to", { citizen_id: them.citizen_id })); say += ` Off to find ${first(them)}.`; }
        else if (then) return null;
      } else if (walk) {
        const there = findPlace(city, walk[1]);
        const them = there ? undefined : findPerson(city, walk[1]);
        if (there) { actions.push(action("go_to", { location_id: there.location_id })); say += ` Heading to ${there.name}.`; }
        else if (them) { actions.push(action("talk_to", { citizen_id: them.citizen_id })); say += ` Off to find ${first(them)}.`; }
        else return null;
      } else if (then) return null;
      else say += " Tell me who to talk to or where to go.";
      return { say, actions };
    }
  }
  const talk = said.match(/^(?:i want to |i'd like to |let me |can i |please |go )?(?:talk|speak|chat)\s+(?:to|with)\s+(.+)$/);
  if (talk) {
    const them = findPerson(city, talk[1]);
    if (them && playerId && them.citizen_id !== playerId) return one(`Off to find ${first(them)}.`, action("talk_to", { citizen_id: them.citizen_id }));
    if (them && !playerId) return one(`Who do you want to be when you talk to ${first(them)}? Say, for example, “play as ${first(city.citizens.find((c) => c.citizen_id !== them.citizen_id && c.age >= 16))} and talk to ${first(them)}”.`);
  }
  const go = said.match(/^(?:i want to |let me |let's |please )?(?:go|walk|head|take me|show me)\s+(?:to |over to )?(.+)$/);
  if (go) {
    const street = /\bstreet( view| level)?\b/.test(go[1]);
    const there = findPlace(city, go[1]);
    if (there) return street ? one(`Down at street level by ${there.name}.`, action("street_view", { location_id: there.location_id }))
      : one(playerId ? `Heading to ${there.name}.` : `Here's ${there.name}.`, action("go_to", { location_id: there.location_id }));
    if (street) return one("Down to street level.", action("street_view"));
    const them = findPerson(city, go[1]);
    if (them) return playerId && them.citizen_id !== playerId ? one(`Off to find ${first(them)}.`, action("talk_to", { citizen_id: them.citizen_id })) : one(`There's ${first(them)}.`, action("watch", { citizen_id: them.citizen_id }));
  }
  if (/\bstreet( view| level)\b/.test(said)) return one("Down to street level.", action("street_view"));
  const watch = said.match(/^(?:watch|find|follow|where is|where's|show me|look at)\s+(.+)$/);
  if (watch) {
    const them = findPerson(city, watch[1]);
    if (them) return one(`${first(them)} is at ${place(city, them.current_location_id)}: ${them.current_activity.toLowerCase()}.`, action("watch", { citizen_id: them.citizen_id }));
  }
  // "nudge Haruto to tell the truth": only while watching, where "tell X ..." can't mean a line to say as someone.
  const nudge = said.match(/^(?:nudge|advise|whisper to|have a word with|tell)\s+(\S+)\s+(?:to |that |he should |she should |they should )?(.+)$/);
  if (nudge && !playerId) {
    const them = findPerson(city, nudge[1]);
    const story = storyState(city.policy);
    const found = them && openCases(story).find((c) => { const next = c.beats[story.progress[c.id] ?? 0]; return next && (next.actor === them.citizen_id || next.target === them.citizen_id); });
    if (them && found) {
      if (nudgesLeft(story, city.clock.day) <= 0) return one("You're out of nudges for today. Three more tomorrow morning.");
      const original = text.trim().replace(/[.!?]+$/, "").split(/\s+/).slice(said.split(" ").length - nudge[2].split(" ").length).join(" ");
      const advice = `${original.charAt(0).toUpperCase()}${original.slice(1)}.`;
      return one(`I'll have a quiet word with ${first(them)}.`, action("nudge", { citizen_id: them.citizen_id, case_id: found.id, text: advice }));
    }
    if (them) return one(`${first(them)} isn't in the next scene of any open case, so a nudge won't land. Try someone who is about to have a scene.`);
  }
  return null;
}
