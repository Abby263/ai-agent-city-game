"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Eye, Send } from "lucide-react";
import { NUDGES_PER_DAY, closedCases, nudgesLeft, openCases, storyState, type SceneResult, type Storyline } from "@/lib/storyteller";
import { checkPlayerText } from "@/lib/safety";
import type { CityState } from "@/lib/types";

// The player's desk: the cases they're working, how each scene went, what's coming up, and the one thing they
// can do about it: a quiet word with someone before their next scene.

const ADVICE = ["Tell the whole truth.", "Stay calm and really listen.", "Say how you really feel.", "Stand your ground.", "Go easy on them."];
const MARK: Record<SceneResult, string> = { well: "Went well", badly: "Went badly", mixed: "Could go either way" };

export function CaseBoard({ city, busy, spotlight, onNudge, onWatch, onComposing, onMessage }: {
  city: CityState;
  busy: boolean;
  /** The case whose scene just played: opened for you, with how it went. */
  spotlight?: { id: string; beat: number } | null;
  onNudge: (storylineId: string, citizenId: string, text: string) => void;
  onWatch: (ids: string[]) => void;
  /** The town waits while you choose your words. */
  onComposing: (composing: boolean) => void;
  onMessage: (text: string) => void;
}) {
  const story = storyState(city.policy);
  const cases = openCases(story), closed = closedCases(story);
  const left = nudgesLeft(story, city.clock.day);
  const [picked, setPicked] = useState<string | null>(null);
  // On a phone the desk starts folded, so the town is what you see first.
  // Folded to one line until you open it, so the town stays in view.
  const [collapsed, setCollapsed] = useState(true);
  const [whisper, setWhisper] = useState<{ storyline: string; who: string } | null>(null);
  const [text, setText] = useState("");
  // A scene that just played takes over from whatever you had open, once.
  const [seen, setSeen] = useState<string | null>(null);
  const spotKey = spotlight ? `${spotlight.id}:${spotlight.beat}` : null;
  if (spotKey !== seen) {
    setSeen(spotKey);
    if (spotlight) { setPicked(spotlight.id); setCollapsed(false); }
  }
  if (!cases.length && !closed.length) return null;
  const name = (id: string) => city.citizens.find((c) => c.citizen_id === id)?.name.split(" ")[0] ?? "Someone";
  const open = cases.find((c) => c.id === picked) ?? null;
  const wins = closed.filter((c) => story.closed[c.id]?.outcome === "well").length;
  const stopWhisper = () => { setWhisper(null); setText(""); onComposing(false); };
  const send = (storyline: Storyline, who: string, advice: string) => {
    const safety = checkPlayerText(advice);
    if (!safety.ok) return onMessage(safety.message);
    onNudge(storyline.id, who, advice);
    stopWhisper();
  };
  const dots = (storyline: Storyline) => (
    <span className="case-dots" aria-label={`${story.progress[storyline.id] ?? 0} of ${storyline.beats.length} scenes played`}>
      {storyline.beats.map((_, i) => <i key={i} data-result={story.results[storyline.id]?.[i] ?? (i < (story.progress[storyline.id] ?? 0) ? "mixed" : "todo")} />)}
    </span>
  );
  return (
    <section className="case-board" aria-label="Your cases" data-collapsed={collapsed}>
      <header>
        <span className="case-kicker">Your cases</span>
        <span className="case-nudges" title={`${left} of ${NUDGES_PER_DAY} nudges left today`} aria-label={`${left} of ${NUDGES_PER_DAY} nudges left today`}>
          {Array.from({ length: NUDGES_PER_DAY }, (_, i) => <i key={i} data-spent={i >= left} />)}
          <small>{left} {left === 1 ? "nudge" : "nudges"}</small>
        </span>
        {closed.length > 0 && <span className="case-record" title="Cases that ended well, of those closed">{wins}/{closed.length} ended well</span>}
        <button className="icon-button" aria-label={collapsed ? "Show cases" : "Hide cases"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
      </header>
      {!collapsed && !cases.length && <p className="case-empty">Every case is closed. {wins} of {closed.length} ended well.</p>}
      {!collapsed && cases.map((storyline) => {
        const index = story.progress[storyline.id] ?? 0;
        const beat = storyline.beats[index];
        const last = story.results[storyline.id]?.[index - 1];
        const given = (story.nudges[storyline.id] ?? []).filter((n) => n.beat === index);
        const expanded = open?.id === storyline.id;
        return (
          <article key={storyline.id} className="case-row" data-open={expanded}>
            <button className="case-summary" aria-expanded={expanded} onClick={() => { setPicked(expanded ? null : storyline.id); stopWhisper(); }}>
              <span aria-hidden="true">{storyline.icon}</span>
              <span><strong>{storyline.goal}</strong>{dots(storyline)}</span>
            </button>
            {expanded && beat && (
              <div className="case-detail">
                <p className="case-brief">{storyline.brief}</p>
                {last && spotlight?.id === storyline.id && <p className="case-last" data-result={last}>That scene: {MARK[last].toLowerCase()}.</p>}
                <p className="case-next"><small>Coming up</small>{beat.headline}</p>
                {given.map((n) => <p key={n.who} className="case-given">🤫 You told {name(n.who)}: “{n.text}”</p>)}
                {whisper?.storyline === storyline.id ? (
                  <form className="case-whisper" onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 3) send(storyline, whisper.who, text.trim()); }}>
                    <small>A quiet word with {name(whisper.who)}:</small>
                    <div className="case-advice">
                      {ADVICE.map((advice) => <button type="button" key={advice} disabled={busy} onClick={() => send(storyline, whisper.who, advice)}>{advice}</button>)}
                    </div>
                    <div className="case-own">
                      <input autoFocus aria-label={`Your advice to ${name(whisper.who)}`} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder="…or in your own words" />
                      <button className="icon-button" type="submit" aria-label="Say it" disabled={busy || text.trim().length < 3}><Send size={15} /></button>
                      <button type="button" className="text-action" onClick={stopWhisper}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="case-actions">
                    {[beat.actor, beat.target].map((who) => (
                      <button key={who} className="chip-action" disabled={busy || left <= 0 || given.some((n) => n.who === who)}
                        title={left <= 0 ? "No nudges left today" : `Costs one nudge`}
                        onClick={() => { setWhisper({ storyline: storyline.id, who }); onComposing(true); }}>🤫 Nudge {name(who)}</button>
                    ))}
                    <button className="chip-action" onClick={() => onWatch([beat.actor, beat.target])}><Eye size={14} /> Find them</button>
                  </div>
                )}
                {left <= 0 && !whisper && <p className="case-out">No nudges left today. Three more tomorrow morning.</p>}
              </div>
            )}
          </article>
        );
      })}
      {!collapsed && closed.length > 0 && (
        <details className="case-closed">
          <summary>Closed cases ({closed.length})</summary>
          {closed.map((storyline) => {
            const good = story.closed[storyline.id]?.outcome !== "badly";
            return <p key={storyline.id} data-good={good}><span aria-hidden="true">{storyline.icon}</span>{good ? storyline.well : storyline.badly}</p>;
          })}
        </details>
      )}
    </section>
  );
}
