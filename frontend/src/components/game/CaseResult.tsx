"use client";

import { useEffect, useRef } from "react";
import { Share2 } from "lucide-react";
import type { CaseOutcome, Storyline } from "@/lib/storyteller";

export function seasonRank(wins: number, total: number) {
  const share = total ? wins / total : 0;
  return share === 1 ? "The heart of Nakameguro" : share >= 0.75 ? "Trusted fixer" : share >= 0.5 ? "Well-meaning meddler" : "Agent of chaos";
}

/** A case just closed: how it ended, in one line, and what's next on the desk. */
export function CaseResult({ storyline, outcome, next, record, onShare, onNewSeason, onClose }: {
  storyline: Storyline;
  outcome: CaseOutcome;
  next?: Storyline;
  record: { wins: number; closed: number; total: number };
  onShare: () => void;
  onNewSeason: () => void;
  onClose: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  const good = outcome === "well";
  const finale = record.closed === record.total;
  return (
    <div className="welcome-backdrop" role="presentation">
      <section className="case-result" data-good={good} role="dialog" aria-modal="true" aria-labelledby="case-result-title">
        <small>Case closed · {storyline.title}</small>
        <h2 id="case-result-title"><span aria-hidden="true">{good ? "🎉" : "💔"}</span>{good ? "It ended well" : "It ended badly"}</h2>
        <p className="case-result-line">{good ? storyline.well : storyline.badly}</p>
        <p className="case-result-record">{record.wins} of {record.closed} cases ended well so far.</p>
        {finale ? (
          <div className="case-result-next"><small>Season over</small><strong>{seasonRank(record.wins, record.total)}</strong>
            <p>Every case is closed. Nakameguro carries on, and so can you: keep watching, or start again and see if you can do better.</p>
            <button className="text-action" onClick={onNewSeason}>Start a new season</button></div>
        ) : next && (
          <div className="case-result-next"><small>New case on your desk</small><strong><span aria-hidden="true">{next.icon}</span> {next.goal}</strong><p>{next.brief}</p></div>
        )}
        <div className="case-result-actions">
          <button className="outline-action" onClick={onShare}><Share2 size={15} /> Share how it ended</button>
          <button ref={button} className="primary-action" onClick={onClose}>{finale ? "Finish" : "Next case"}</button>
        </div>
      </section>
    </div>
  );
}
