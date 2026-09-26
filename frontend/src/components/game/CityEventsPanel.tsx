"use client";

import { useState } from "react";
import { Check, Flag, Footprints, MessageCircle, Vote, X } from "lucide-react";
import { api } from "@/lib/api";
import { currentElection, tallyElection } from "@/lib/elections";
import { sessionMemoryEnabled } from "@/lib/session-simulation";
import type { CityState } from "@/lib/types";
import { CitizenPortrait } from "./CitizenPortrait";

export function CityEventsPanel({ city, busy, act, onTalk }: {
  city: CityState;
  busy: boolean;
  act: (action: () => Promise<CityState>) => Promise<void>;
  onTalk: (id: string) => void;
}) {
  const [candidateId, setCandidateId] = useState(city.citizens[0]?.citizen_id ?? "");
  const [rivalId, setRivalId] = useState(city.citizens.find((c) => c.citizen_id !== candidateId)?.citizen_id ?? "");
  const [platform, setPlatform] = useState("");
  const [vote, setVote] = useState("");
  const event = currentElection(city);
  const player = city.citizens.find((c) => c.citizen_id === city.policy.player_citizen_id);
  const people = new Map(city.citizens.map((c) => [c.citizen_id, c]));
  const active = event && ["campaign", "voting"].includes(event.phase);
  const result = event && tallyElection(event);
  return <div className="panel-scroll city-events-panel">
    <div className="event-title"><Vote size={26} /><div><small>STUDENT COUNCIL</small><h3>A voice for Nakameguro</h3></div></div>
    {event && <ol className="event-stages" aria-label="Election stages">
      {(["campaign", "voting", "complete"] as const).map((phase) => <li key={phase} aria-current={event.phase === phase ? "step" : undefined}>{phase === "complete" ? "Results" : phase === "campaign" ? "Campaign" : "Voting"}</li>)}
    </ol>}
    {event?.error && <p role="alert" className="election-error">{event.error}</p>}
    {event && event.phase !== "cancelled" && <div className="candidate-platforms">
      {event.candidates.map((candidate) => <article className="candidate-platform" key={candidate.citizen_id}>
        <div className="candidate-heading"><CitizenPortrait citizen={candidate} size={42} /><div><strong>{candidate.name}</strong><small>{candidate.citizen_id === player?.citizen_id ? "You" : "AI candidate"}</small></div></div>
        <p>{candidate.platform}</p>
        <small>{new Set(event.campaign_log.filter((l) => l.candidate_id === candidate.citizen_id).map((l) => l.target_id)).size} residents spoken with</small>
      </article>)}
    </div>}
    {event?.phase === "campaign" && <>
      <div className="election-status"><Flag size={16} /><strong>Polls open in {Math.max(0, event.campaign_until_tick - city.clock.tick) * 15} city minutes</strong></div>
      {event.agenda && <p className="campaign-intention"><strong>{people.get(event.agenda.candidate_id)?.name}</strong> is approaching {people.get(event.agenda.target_id)?.name}: {event.agenda.intention}</p>}
      {event.waiting_for_player?.target_id === player?.citizen_id && event.waiting_for_player && <p className="campaign-intention">{people.get(event.waiting_for_player.candidate_id)?.name} would like to discuss the election with you.</p>}
      <h4>Meet the voters</h4>
      {city.citizens.filter((c) => c.citizen_id !== player?.citizen_id).map((citizen) => {
        const nearby = player?.current_location_id === citizen.current_location_id && !city.policy.player_destination;
        return <div className="voter-row" key={citizen.citizen_id}>
          <CitizenPortrait citizen={citizen} size={32} /><div><strong>{citizen.name}</strong><small>{city.locations.find((l) => l.location_id === citizen.current_location_id)?.name}</small></div>
          {player && <button className="icon-button" disabled={busy} title={`${nearby ? "Talk to" : "Meet"} ${citizen.name}`} aria-label={`${nearby ? "Talk to" : "Meet"} ${citizen.name}`} onClick={() => nearby ? onTalk(citizen.citizen_id) : void act(() => api.walkTo(citizen.current_location_id))}>{nearby ? <MessageCircle size={17} /> : <Footprints size={17} />}</button>}
        </div>;
      })}
      <button className="secondary-action election-command" disabled={busy} onClick={() => void act(() => api.electionPhase("vote"))}><Vote size={16} />Open ballots early</button>
    </>}
    {event?.phase === "voting" && <>
      <h4>Private ballots</h4>
      <div className="election-progress"><strong>{event.ballots.length} / {event.voter_ids.length}</strong><span>votes received</span></div>
      <progress aria-label="Voting progress" value={event.ballots.length} max={event.voter_ids.length} />
      {player && !event.ballots.some((b) => b.voter_id === player.citizen_id) && <form className="election-form" onSubmit={(e) => { e.preventDefault(); void act(() => api.castVote(vote === "abstain" ? null : vote)); }}>
        <label htmlFor="ballot-choice">{player.name}&apos;s ballot</label>
        <select id="ballot-choice" required value={vote} onChange={(e) => setVote(e.target.value)}><option value="" disabled>Choose your vote</option>{event.candidates.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name}</option>)}<option value="abstain">Abstain</option></select>
        <button className="primary-action" disabled={busy || !vote}><Vote size={16} />Cast my vote</button>
      </form>}
      {player && event.ballots.some((b) => b.voter_id === player.citizen_id) && <p><Check size={14} /> Your ballot is sealed.</p>}
      <button className="primary-action election-command" disabled={busy || !event.voter_ids.some((id) => id !== player?.citizen_id && !event.ballots.some((b) => b.voter_id === id))} onClick={() => void act(api.nextBallot)}><Vote size={16} />{busy ? "Resident is deciding..." : "Next AI ballot"}</button>
      <div className="voter-checklist">{event.voter_ids.map((id) => <div key={id}><span>{people.get(id)?.name}</span><small>{event.ballots.some((b) => b.voter_id === id) ? "Sealed" : id === player?.citizen_id ? "Your choice" : "Pending"}</small></div>)}</div>
    </>}
    {result && <section className="election-results">
      <small>THE VOTES ARE IN</small>
      <h3>{result.winner ? `${result.winner.name} wins` : result.tied ? "A tied election" : "No winner"}</h3>
      {result.counts.map((c) => <div className="result-row" key={c.citizen_id}><span>{c.name}</span><strong>{c.votes} votes</strong></div>)}
      <p>{result.abstentions} abstentions</p>
      <details><summary>Residents&apos; decisions</summary>{event!.ballots.map((b) => <article className="ballot-reason" key={b.voter_id}><strong>{people.get(b.voter_id)?.name}</strong><small>{b.vote_for ? people.get(b.vote_for)?.name : "Abstained"} · {b.source === "player" ? "Player choice" : "Agent decision"}</small><p>{b.reason}</p></article>)}</details>
    </section>}
    {active ? <button className="text-action election-command" disabled={busy} onClick={() => void act(() => api.electionPhase("cancel"))}><X size={15} />Cancel election</button> : <form className="election-form" onSubmit={(e) => { e.preventDefault(); void act(() => api.startElection(candidateId, rivalId, platform)); }}>
      <h4>{event ? "Next election" : "Enter the election"}</h4>
      <label htmlFor="candidate">Play as candidate</label><select id="candidate" value={candidateId} onChange={(e) => { setCandidateId(e.target.value); if (rivalId === e.target.value) setRivalId(city.citizens.find((c) => c.citizen_id !== e.target.value)!.citizen_id); }}>{city.citizens.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name}</option>)}</select>
      <label htmlFor="rival">Opposing candidate</label><select id="rival" value={rivalId} onChange={(e) => setRivalId(e.target.value)}>{city.citizens.filter((c) => c.citizen_id !== candidateId).map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name}</option>)}</select>
      <label htmlFor="campaign-platform">Your campaign promise</label><textarea id="campaign-platform" maxLength={800} required value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="I want everyone to have a say in our school clubs..." />
      <button className="primary-action" disabled={busy || !platform.trim() || !sessionMemoryEnabled()}><Flag size={16} />{busy ? "Rival is preparing..." : "Enter & start campaigning"}</button>
    </form>}
  </div>;
}
