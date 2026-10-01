import type { CitizenAgent, CityState } from "./types";

export type SocialDecision = { target_id: string | null; reason: string; topic: string };
export type SocialDecisionRequest = {
  citizen: CitizenAgent; city_time: string; location: string;
  /** Each person nearby, with who they are to this resident and what this resident remembers of them. */
  nearby: Array<{ citizen_id: string; name: string; activity: string; relationship?: string; you_know?: string }>;
  memories: string[];
  /** Recent news and events this resident might act on or pass on. */
  on_your_mind?: string[];
};
export type DecideSocial = (request: SocialDecisionRequest) => Promise<SocialDecision>;
export type Encounter = {
  actor_id: string; target_id: string; location_id: string; reason: string; topic: string;
  started_at: number; meeting_id?: string;
  /** A scene the storyteller staged: which storyline, which beat, what's at stake. */
  story?: { id: string; beat: number; stakes: string; proposal?: "date"; advice?: Record<string, string>;
    /** The storyline's last scene: it has to land somewhere. */
    finale?: boolean };
};
export type MeetingPlan = {
  actor_ids: string[]; location_id: string; game_day: number; game_minute: number; topic: string;
};
export type SocialMeeting = MeetingPlan & {
  id: string; source_conversation_id: string;
  status: "scheduled" | "completed" | "missed";
  /** The resident you play talked with the others there, around the agreed time. */
  kept?: boolean;
  /** The resident you play has already been sent on their way to it (only once). */
  player_set_off?: boolean;
};
export type EncounterContext = { kind: "chance" | "planned"; reason: string; topic: string; meeting_id?: string;
  /** The case scene this was, if the storyteller staged it. */
  story?: { id: string; beat: number } };
export const cityMinute = (city: CityState) => city.clock.day * 1440 + city.clock.minute_of_day;
export const meetingMinute = (meeting: MeetingPlan) => meeting.game_day * 1440 + meeting.game_minute;

export function sociallyAvailable(c: CitizenAgent, playerId?: unknown) {
  return c.citizen_id !== playerId && c.age >= 3 && c.energy >= 18 && c.health >= 45 && c.stress <= 88
    && !/^sleep/i.test(c.current_activity)
    && c.x === c.target_x && c.y === c.target_y
    && (c.personality.player_task as { status?: string } | undefined)?.status !== "active";
}

export function meetingFor(city: CityState, citizen: CitizenAgent) {
  if (city.simulation_mode !== "autonomous") return undefined;
  return city.meetings?.filter((m) => m.status === "scheduled" && m.actor_ids.includes(citizen.citizen_id))
    .sort((a, b) => meetingMinute(a) - meetingMinute(b)).find((m) => {
      const place = city.locations.find((p) => p.location_id === m.location_id);
      if (!place) return false;
      const distance = Math.abs(citizen.x - (place.x + Math.floor(place.width / 2))) + Math.abs(citizen.y - (place.y + Math.floor(place.height / 2)));
      const travelMinutes = Math.ceil(distance / 2) * 15;
      return meetingMinute(m) - cityMinute(city) <= Math.max(60, travelMinutes + 15) && cityMinute(city) <= meetingMinute(m) + 60;
    });
}

export function acceptMeeting(city: CityState, plan: MeetingPlan | null | undefined, actors: string[], sourceId: string): SocialMeeting | null {
  if (!plan || !Array.isArray(plan.actor_ids) || plan.actor_ids.length !== 2 || new Set(plan.actor_ids).size !== 2 || !plan.actor_ids.every((id) => actors.includes(id))) return null;
  if (typeof plan.topic !== "string" || !plan.topic.trim()) return null;
  if (!Number.isInteger(plan.game_day) || !Number.isInteger(plan.game_minute) || plan.game_minute < 0 || plan.game_minute >= 1440) return null;
  const due = meetingMinute(plan);
  if (due < cityMinute(city) + 30 || due > cityMinute(city) + 1440 || !city.locations.some((p) => p.location_id === plan.location_id)) return null;
  if (city.meetings?.some((m) => m.status === "scheduled" && m.actor_ids.some((id) => actors.includes(id)) && Math.abs(meetingMinute(m) - due) < 60)) return null;
  return { ...plan, topic: plan.topic.slice(0, 240), id: `meeting_${sourceId}`, source_conversation_id: sourceId, status: "scheduled" };
}
