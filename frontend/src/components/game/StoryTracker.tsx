"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Eye, Play, X } from "lucide-react";
import { activeStories, type Story } from "@/lib/stories";
import { liveElection } from "@/lib/elections";
import { useGameStore } from "@/lib/store";
import type { CityState } from "@/lib/types";

const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function watchStory(story: Story) {
  useGameStore.getState().focusOn(story.focus_ids, false, story.location_id ?? undefined);
}

/** "Happening now": the latest storyline you set in motion, beat by beat, with a button to watch it. */
export function StoryTracker({ city, onOpenAll }: { city: CityState; onOpenAll: () => void }) {
  const stories = activeStories(city);
  const [hidden, setHidden] = useState<string[]>([]);
  const [open, setOpen] = useState(true);
  const story = stories.find((s) => !hidden.includes(s.id));
  if (!story) return null;
  const election = story.kind === "election" ? liveElection(city) : undefined;
  const latestTalk = [...story.beats].reverse().find((b) => b.conversation_id);
  const beats = story.beats.slice(open ? -3 : -1);
  return (
    <section className="story-tracker" aria-label="Happening now" aria-live="polite">
      <header>
        <span className="story-live"><i />Happening now{stories.length > 1 ? ` · ${stories.length} stories` : ""}</span>
        <button className="icon-button" aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)}>{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
        <button className="icon-button" aria-label="Hide this story" onClick={() => setHidden([...hidden, story.id])}><X size={15} /></button>
      </header>
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
      {election && <p className="story-status">{election.phase === "voting" ? "🗳️ Counting private ballots…" : `📣 Campaigning (${Math.min(election.campaign_turn, 2)}/2)…`}</p>}
      {city.simulation_mode !== "autonomous" && !election && story.beats.length < 3 && (
        <p className="story-status">Switch on Auto to see how the rest of the town reacts over time.</p>
      )}
      <div className="story-actions">
        <button className="outline-action" onClick={() => watchStory(story)}><Eye size={14} /> Watch</button>
        {latestTalk?.conversation_id && (
          <button className="outline-action" onClick={() => useGameStore.getState().replayConversation(latestTalk.conversation_id!)}><Play size={14} /> Replay talk</button>
        )}
        <button className="text-action" onClick={onOpenAll}>All stories</button>
      </div>
    </section>
  );
}
