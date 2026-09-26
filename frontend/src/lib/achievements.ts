import { bondLabel } from "./social";
import type { CityState, Conversation, Relationship } from "./types";

export type AchievementContext = {
  city: CityState;
  conversations: Conversation[];
  relationships: Relationship[];
};

export type Achievement = {
  id: string;
  icon: string;
  title: string;
  /** How to earn it, written for a 10-15 year old player. */
  hint: string;
  earned: (context: AchievementContext) => boolean;
};

const happened = (city: CityState, type: string) => city.events.some((event) => event.event_type === type);
const lived = (city: CityState, ...kinds: string[]) => (city.life_log ?? []).some((entry) => kinds.includes(entry.kind));

export const achievements: Achievement[] = [
  { id: "first_hello", icon: "👋", title: "First hello", hint: "Watch your first conversation in Nakameguro.",
    earned: ({ conversations }) => conversations.length >= 1 },
  { id: "in_their_shoes", icon: "🎭", title: "In their shoes", hint: "Choose a citizen and press Play as.",
    earned: ({ city }) => Boolean(city.policy.player_citizen_id) },
  { id: "own_words", icon: "🗣️", title: "In your own words", hint: "While playing as someone, say something to a neighbour.",
    earned: ({ city }) => Number(city.policy.player_lines ?? 0) >= 1 },
  { id: "explorer", icon: "🧭", title: "Explorer", hint: "Walk to 5 different places while playing as a citizen.",
    earned: ({ city }) => (Array.isArray(city.policy.places_visited) ? city.policy.places_visited.length : 0) >= 5 },
  { id: "helping_hand", icon: "✅", title: "Helping hand", hint: "Give a citizen a task and see it through to the end.",
    earned: ({ city }) => happened(city, "player_task_completed") },
  { id: "friendship", icon: "🤝", title: "Friendship blooms", hint: "See two citizens become real friends.",
    earned: ({ relationships }) => relationships.some((r) => ["Friends", "Close friends"].includes(bondLabel(r))) },
  { id: "promise_kept", icon: "📅", title: "Promise kept", hint: "See two citizens plan a meet-up and actually show up.",
    earned: ({ city }) => (city.meetings ?? []).some((meeting) => meeting.status === "completed") },
  { id: "chatterbox", icon: "💬", title: "Town chatterbox", hint: "Watch 10 conversations happen.",
    earned: ({ conversations }) => conversations.length >= 10 },
  { id: "party_planner", icon: "🎉", title: "Party planner", hint: "Start a neighbourhood festival from the City panel.",
    earned: ({ city }) => happened(city, "city_festival") },
  { id: "exam_season", icon: "📝", title: "Exam season", hint: "Start an exam day and see how everyone copes.",
    earned: ({ city }) => happened(city, "school_exam") },
  { id: "democracy", icon: "🗳️", title: "Democracy in action", hint: "Run a student-council election all the way to the result.",
    earned: ({ city }) => happened(city, "election_result") },
  { id: "birthday", icon: "🎂", title: "Happy birthday!", hint: "Be in Nakameguro when someone celebrates a birthday.",
    earned: ({ city }) => lived(city, "birthday") },
  { id: "new_life", icon: "👶", title: "Welcome, little one", hint: "See a baby born at Kyosai Hospital.",
    earned: ({ city }) => lived(city, "birth") },
  { id: "get_well", icon: "💚", title: "Get well soon", hint: "See someone get sick, get treated and recover.",
    earned: ({ city }) => lived(city, "recovered") },
  { id: "love", icon: "💕", title: "Love is in the air", hint: "Two grown-ups start dating or get married.",
    earned: ({ city }) => lived(city, "dating", "engaged", "wedding") },
  { id: "dream", icon: "🌟", title: "Dream come true", hint: "Help someone achieve their big ambition.",
    earned: ({ city }) => lived(city, "ambition") },
  { id: "top_marks", icon: "📝", title: "Report card day", hint: "Make it to Saturday's weekly report cards.",
    earned: ({ city }) => lived(city, "report_cards") },
  { id: "night_owl", icon: "🌙", title: "Night owl", hint: "Keep Nakameguro running until 10 pm.",
    earned: ({ city }) => city.clock.day > 1 || city.clock.minute_of_day >= 1320 },
  { id: "weekend", icon: "☀️", title: "Weekend!", hint: "Reach the first Saturday. No school today!",
    earned: ({ city }) => city.clock.day >= 6 },
  { id: "whole_week", icon: "🏆", title: "A whole week", hint: "Live through a full week in Nakameguro.",
    earned: ({ city }) => city.clock.day >= 8 },
];

export type Unlocked = Record<string, { day: number; minute: number }>;
const STORAGE_KEY = "agentcity.achievements";

export function readUnlocked(): Unlocked {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Unlocked;
  } catch {
    return {};
  }
}

/** Returns achievements earned for the first time and remembers them; earlier unlocks never relock. */
export function unlockNew(context: AchievementContext, unlocked: Unlocked = readUnlocked()) {
  const fresh = achievements.filter((a) => !unlocked[a.id] && a.earned(context));
  if (!fresh.length) return { fresh, unlocked };
  const next = { ...unlocked };
  for (const a of fresh) next[a.id] = { day: context.city.clock.day, minute: context.city.clock.minute_of_day };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing can block storage; badges still show for this visit.
  }
  return { fresh, unlocked: next };
}
