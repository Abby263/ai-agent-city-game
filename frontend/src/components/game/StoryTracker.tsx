"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Eye, Play, RotateCcw, X } from "lucide-react";
import { activeStories, type Story } from "@/lib/stories";
import { liveElection, playerTurn } from "@/lib/elections";
import { nextMoves, type NextMove } from "@/lib/next-moves";
import { MoveButtons, WriteWhatHappens } from "./NextChoices";
import { useGameStore } from "@/lib/store";
import type { CityState, Conversation } from "@/lib/types";

const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function watchStory(story: Story) {
  useGameStore.getState().focusOn(story.focus_ids, false, story.location_id ?? undefined);
}

/** "Happening now": the latest storyline you set in motion, beat by beat, with a button to watch it. */
export function StoryTracker({ city, conversations = [], onOpenAll, busy = false, onOpenBallots, onVote, onAsk, onChoose, onWrite, onRetryElection }: {
  city: CityState; conversations?: Conversation[]; onOpenAll: () => void; busy?: boolean; onOpenBallots?: () => void;
  onVote?: (candidateId: string | null) => void; onAsk?: (candidateId: string) => void;
  onChoose?: (move: NextMove, storyId: string) => void;
  onWrite?: (actorId: string | null, text: string, storyId: string) => void;
  onRetryElection?: () => void;
}) {
  const stories = activeStories(city);
  const [hidden, setHidden] = useState<string[]>([]);
  // Folded to one line until you open it; a ballot waiting for you opens it by itself.
  const [open, setOpen] = useState(false);
  const story = stories.find((s) => !hidden.includes(s.id));
  if (!story) return null;
  const election = story.kind === "election" ? liveElection(city) : undefined;
  const turn = election ? playerTurn(city) : undefined;
  const me = turn && city.citizens.find((c) => c.citizen_id === turn.voterId)?.name.split(" ")[0];
  const expanded = open || Boolean(turn?.waiting) || Boolean(election?.error);
  const latestTalk = [...story.beats].reverse().find((b) => b.conversation_id);
  // What happens next comes from what the people in it now want, plus anything the player writes.
  const deciding = !election && expanded && Boolean(onChoose && onWrite);
  const choices = deciding ? nextMoves(city, conversations.find((c) => c.conversation_id === latestTalk?.conversation_id)) : [];
  const people = story.focus_ids.map((id) => city.citizens.find((c) => c.citizen_id === id)).filter((c) => c !== undefined);
  const beats = story.beats.slice(deciding ? -2 : -3);
  return (
    <section className="story-tracker" aria-label="Happening now" aria-live="polite" data-open={expanded}>
      <header>
        <button className="story-fold" aria-expanded={expanded} title={expanded ? "Fold" : "Show what is happening"} onClick={() => setOpen(!open)}>
          <span className="story-live"><i />Happening now{stories.length > 1 ? ` · ${stories.length}` : ""}</span>
          {!expanded && <span className="story-fold-title"><span aria-hidden="true">{story.icon}</span> {story.title}</span>}
        </button>
        <button className="icon-button" aria-label={expanded ? "Collapse" : "Expand"} onClick={() => setOpen(!open)}>{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
        <button className="icon-button" aria-label="Hide this story" onClick={() => setHidden([...hidden, story.id])}><X size={15} /></button>
      </header>
      {expanded && <>
      <strong className="story-title"><span aria-hidden="true">{story.icon}</span>{story.title}</strong>
      <ol className="story-beats">
        {beats.map((beat, i) => (
          <li key={`${beat.day}-${beat.minute}-${i}`}>
            <span aria-hidden="true">{beat.icon}</span>
            <p>{beat.text}</p>
            <time>{hhmm(beat.minute)}</time>
          </li>
        ))}
      </ol>
      {election?.error && (
        <div className="story-ballot" role="alert">
          <p>{election.error}</p>
          <button className="outline-action" disabled={busy} onClick={onRetryElection}><RotateCcw size={14} /> Retry missing ballots</button>
        </div>
      )}
      {election && !election.error && !turn?.waiting && (
        <p className="story-status">
          {election.phase === "voting" ? "🗳️ Counting private ballots…" : `📣 Campaigning (${Math.min(election.campaign_turn, 2)}/2)…`}
          {turn && election.phase === "campaign" && ` You're ${me}: ${turn.candidate ? "make your case to voters in Talk." : "your ballot waits for you, so talk to the candidates first if you like."}`}
        </p>
      )}
      {turn?.waiting && election?.phase === "campaign" && (
        <div className="story-ballot">
          <p>Done campaigning, {me}? The other candidate has had their turn.</p>
          <button className="primary-action" disabled={busy} onClick={onOpenBallots}>🗳️ Open the ballots</button>
        </div>
      )}
      {turn?.waiting && election?.phase === "voting" && (
        <div className="story-ballot">
          <p>Your secret ballot, {me}. Everyone else has voted.</p>
          {onAsk && (
            <div className="story-ask">
              {election.candidates.filter((c) => c.citizen_id !== turn.voterId).map((c) => (
                <button key={c.citizen_id} className="text-action" disabled={busy} onClick={() => onAsk(c.citizen_id)}>💬 Ask {c.name.split(" ")[0]} first</button>
              ))}
            </div>
          )}
          <div>
            {election.candidates.map((c) => (
              <button key={c.citizen_id} className="primary-action" disabled={busy} onClick={() => onVote?.(c.citizen_id)}>Vote {c.name.split(" ")[0]}</button>
            ))}
            <button className="outline-action" disabled={busy} onClick={() => onVote?.(null)}>Abstain</button>
          </div>
        </div>
      )}
      {deciding && (
        <div className="story-next">
          <small>What happens next? You decide.</small>
          <MoveButtons moves={choices} busy={busy} onPick={(m) => onChoose!(m, story.id)} />
          <WriteWhatHappens key={story.id} people={people} busy={busy} onWrite={(actor, text) => onWrite!(actor, text, story.id)} />
        </div>
      )}
      <div className="story-actions">
        <button className="outline-action" onClick={() => watchStory(story)}><Eye size={14} /> Watch</button>
        {latestTalk?.conversation_id && (
          <button className="outline-action" onClick={() => useGameStore.getState().replayConversation(latestTalk.conversation_id!)}><Play size={14} /> Replay talk</button>
        )}
        <button className="text-action" onClick={onOpenAll}>All stories</button>
      </div>
      </>}
    </section>
  );
}
