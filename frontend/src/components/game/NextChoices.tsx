"use client";

import { X } from "lucide-react";
import type { Choice } from "@/lib/choices";

/** "What happens next?": the player's move after a scene or situation. */
export function ChoiceButtons({ choices, busy, onPick }: { choices: Choice[]; busy: boolean; onPick: (choice: Choice) => void }) {
  return (
    <div className="next-choices">
      {choices.map((c) => (
        <button key={`${c.actor_id}-${c.action}`} disabled={busy} onClick={() => onPick(c)}>
          <span aria-hidden="true">{c.icon}</span>{c.label}
        </button>
      ))}
    </div>
  );
}

/** Shown when a scene ends: pick what the two of them do next, or let it be. */
export function NextMoveCard({ names, choices, busy, onPick, onDismiss }: {
  names: string;
  choices: Choice[];
  busy: boolean;
  onPick: (choice: Choice) => void;
  onDismiss: () => void;
}) {
  if (!choices.length) return null;
  return (
    <section className="next-move" aria-label="What happens next?">
      <header>
        <span className="story-live"><i />What happens next?</span>
        <button className="icon-button" aria-label="Let it be" title="Let it be" onClick={onDismiss}><X size={15} /></button>
      </header>
      <p>You decide what {names} do now.</p>
      <ChoiceButtons choices={choices} busy={busy} onPick={onPick} />
    </section>
  );
}
