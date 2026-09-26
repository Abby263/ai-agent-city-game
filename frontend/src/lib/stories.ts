import { calendarStartFor, realCityTime } from "./calendar";
import type { CityState, Conversation } from "./types";

// A story follows something the player set in motion (a situation, an action, an election)
// and collects every beat that follows, so "what's happening?" always has an answer.

export type StoryBeat = { day: number; minute: number; icon: string; text: string; conversation_id?: string };
export type Story = {
  id: string;
  kind: string;
  icon: string;
  title: string;
  /** Everyone involved; conversations among them become beats. */
  actors: string[];
  /** Who the camera should look at. */
  focus_ids: string[];
  location_id: string | null;
  started: number;
  /** City minute after which the story is considered finished. */
  ends: number;
  beats: StoryBeat[];
};

const now = (city: CityState) => city.clock.day * 1440 + city.clock.minute_of_day;
const DEFAULT_LENGTH = 36 * 60;
/** When a beat happened, as the clock on screen shows it: real Tokyo time in live mode. */
function stamp(city: CityState) {
  if (city.policy.time_mode !== "live") return { day: city.clock.day, minute: city.clock.minute_of_day };
  const { day, minute } = realCityTime(city.calendar_start ?? calendarStartFor(city.clock.day));
  return { day, minute };
}

export function startStory(city: CityState, input: Omit<Story, "started" | "ends" | "beats"> & { first: Omit<StoryBeat, "day" | "minute">; length?: number }) {
  const story: Story = {
    id: input.id, kind: input.kind, icon: input.icon, title: input.title, actors: [...new Set(input.actors)],
    focus_ids: input.focus_ids.length ? input.focus_ids : input.actors.slice(0, 2), location_id: input.location_id,
    started: now(city), ends: now(city) + (input.length ?? DEFAULT_LENGTH), beats: [],
  };
  story.beats.push({ ...stamp(city), ...input.first });
  city.stories = [...(city.stories ?? []).filter((s) => s.id !== story.id).slice(-11), story];
  return story;
}

export function activeStories(city: CityState) {
  // Newest first; stories started in the same minute (a paused clock) keep their creation order.
  return [...(city.stories ?? [])].reverse().filter((s) => s.ends > now(city)).sort((a, b) => b.started - a.started);
}

export function addBeat(city: CityState, storyId: string, beat: Omit<StoryBeat, "day" | "minute">) {
  const story = city.stories?.find((s) => s.id === storyId);
  if (!story) return;
  if (story.beats.some((b) => b.text === beat.text)) return;
  story.beats.push({ ...stamp(city), ...beat });
  story.beats = story.beats.slice(-30);
}

/** A conversation joins every active story it belongs to. */
export function beatForConversation(city: CityState, conversation: Conversation, names: Record<string, string>) {
  for (const story of activeStories(city)) {
    const inside = conversation.actor_ids.every((id) => story.actors.includes(id))
      || (story.kind === "election" && conversation.actor_ids.some((id) => story.focus_ids.includes(id)));
    if (!inside) continue;
    const first = conversation.transcript[0], reply = conversation.transcript.find((l) => l.speaker_id !== first?.speaker_id);
    if (!first) continue;
    const quote = (line: { speaker_id: string; text: string }) => `${names[line.speaker_id] ?? "Someone"}: “${line.text.length > 110 ? `${line.text.slice(0, 107)}…` : line.text}”`;
    addBeat(city, story.id, { icon: "💬", text: [quote(first), reply && quote(reply)].filter(Boolean).join(" "), conversation_id: conversation.conversation_id });
  }
}

/** Life news about someone in a story (an injury healing, a new couple, a treatment) is part of it too. */
export function beatForNews(city: CityState, news: { icon: string; headline: string; actors: string[]; kind: string }) {
  if (news.kind === "payday" || news.kind === "medication" || news.kind.startsWith("action_") || !news.actors.length) return;
  for (const story of activeStories(city))
    if (news.actors.some((id) => story.focus_ids.includes(id)) && story.beats[0]?.text !== news.headline)
      addBeat(city, story.id, { icon: news.icon, text: news.headline });
}
