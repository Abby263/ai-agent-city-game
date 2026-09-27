"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import type { NextMove } from "@/lib/next-moves";
import type { CitizenAgent } from "@/lib/types";

/** What the characters themselves want to do next; the player lets one happen. */
export function MoveButtons({ moves, busy, onPick }: { moves: NextMove[]; busy: boolean; onPick: (move: NextMove) => void }) {
  if (!moves.length) return null;
  return (
    <div className="next-choices">
      {moves.map((m) => (
        <button key={`${m.actor_id}-${m.text}`} disabled={busy} onClick={() => onPick(m)}>
          <span aria-hidden="true">👉</span>{m.label}
        </button>
      ))}
    </div>
  );
}

/** Or the player writes it: anyone does anything, or something just happens. */
export function WriteWhatHappens({ people, busy, onWrite, placeholder }: {
  people: CitizenAgent[];
  busy: boolean;
  onWrite: (actorId: string | null, text: string) => void;
  placeholder?: string;
}) {
  const [who, setWho] = useState(people[0]?.citizen_id ?? "");
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onWrite(who || null, text.trim());
    setText("");
  };
  return (
    <form className="write-what" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <select aria-label="Who does it" value={who} onChange={(e) => setWho(e.target.value)}>
        {people.map((p) => <option key={p.citizen_id} value={p.citizen_id}>{p.name.split(" ")[0]}</option>)}
        <option value="">Nobody: it just happens</option>
      </select>
      <input aria-label="What happens" value={text} maxLength={400} onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? (who ? "…does what? (e.g. confesses the truth)" : "What happens? (e.g. the lights go out)")} />
      <button className="icon-button" type="submit" aria-label="Make it happen" disabled={busy || !text.trim()}><Send size={15} /></button>
    </form>
  );
}

/** Shown when a scene ends: let one of their own intentions happen, write your own, or let it be. */
export function NextMoveCard({ names, moves, people, busy, onPick, onWrite, onDismiss }: {
  names: string;
  moves: NextMove[];
  people: CitizenAgent[];
  busy: boolean;
  onPick: (move: NextMove) => void;
  onWrite: (actorId: string | null, text: string) => void;
  onDismiss: () => void;
}) {
  return (
    <section className="next-move" aria-label="What happens next?">
      <header>
        <span className="story-live"><i />What happens next?</span>
        <button className="icon-button" aria-label="Let it be" title="Let it be" onClick={onDismiss}><X size={15} /></button>
      </header>
      <p>{moves.length ? `What ${names} want to do now. Let it happen, or write your own.` : `You decide what ${names} do now.`}</p>
      <MoveButtons moves={moves} busy={busy} onPick={onPick} />
      <WriteWhatHappens people={people} busy={busy} onWrite={onWrite} />
    </section>
  );
}
