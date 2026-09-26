import type { CitizenAgent, CityState } from "./types";

export type Candidate = { citizen_id: string; name: string; platform: string };
export type Ballot = { voter_id: string; vote_for: string | null; reason: string; source: "agent" | "player" };
export type Election = {
  event_id: string;
  kind: "student_election";
  title: string;
  phase: "campaign" | "voting" | "complete" | "cancelled";
  candidates: Candidate[];
  voter_ids: string[];
  campaign_until_tick: number;
  ballots: Ballot[];
  agenda?: { candidate_id: string; target_id: string; intention: string };
  waiting_for_player?: { candidate_id: string; target_id: string; intention: string };
  campaign_turn: number;
  campaign_log: Array<{ candidate_id: string; target_id: string; conversation_id: string }>;
  error?: string;
  /** Created from Create: both candidates are AI-run and the election plays out as a quick story. */
  auto?: boolean;
  story_id?: string;
};
export type ElectionDecision = { platform: string; target_id: string | null; intention: string; vote_for: string | null; reason: string; mood: string };
export type ElectionDecisionRequest = {
  purpose: "platform" | "campaign" | "vote";
  citizen: CitizenAgent;
  candidates: Candidate[];
  residents: Array<{ citizen_id: string; name: string; location: string }>;
  memories: string[];
};
export type DecideElection = (request: ElectionDecisionRequest) => Promise<ElectionDecision>;

export function currentElection(city: CityState) { return city.activities?.at(-1); }
export function liveElection(city: CityState) {
  const election = currentElection(city);
  return election && ["campaign", "voting"].includes(election.phase) ? election : undefined;
}
export function electionNotice(city: CityState): string[] {
  const event = currentElection(city);
  if (!event || event.phase === "cancelled") return [];
  return [`Public notice: ${event.title}, ${event.phase}. Candidates: ${event.candidates.map((c) => `${c.name} (${c.citizen_id}): ${c.platform}`).join("; ")}. Campaign promises are proposals, not completed facts.`,
    ...(event.phase === "complete" ? [`Public results: ${JSON.stringify(tallyElection(event))}.`] : [])];
}
export function recordBallot(election: Election, ballot: Ballot): Election {
  if (election.phase !== "voting") throw new Error("Voting is not open.");
  if (!election.voter_ids.includes(ballot.voter_id)) throw new Error("This resident is not registered to vote.");
  if (election.ballots.some((b) => b.voter_id === ballot.voter_id)) throw new Error("This resident has already voted.");
  if (ballot.vote_for !== null && !election.candidates.some((c) => c.citizen_id === ballot.vote_for)) throw new Error("That candidate is not on the ballot.");
  const ballots = [...election.ballots, ballot];
  return { ...election, ballots, phase: ballots.length === election.voter_ids.length ? "complete" : "voting", error: undefined };
}
export function tallyElection(election: Election) {
  if (election.phase !== "complete") return null;
  const counts = election.candidates.map((c) => ({ ...c, votes: election.ballots.filter((b) => b.vote_for === c.citizen_id).length }));
  const high = Math.max(...counts.map((c) => c.votes));
  const leaders = high > 0 ? counts.filter((c) => c.votes === high) : [];
  return { counts, winner: leaders.length === 1 ? leaders[0] : null, tied: leaders.length > 1,
    abstentions: election.ballots.filter((b) => b.vote_for === null).length };
}
