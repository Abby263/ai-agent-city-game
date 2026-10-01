"use client";

import { useEffect, useRef } from "react";
import type { Storyline } from "@/lib/storyteller";

export const WELCOME_KEY = "agentcity.welcomed";

/** One sentence about who you are, and the first case. Everything else is learned by playing. */
export function WelcomeGuide({ firstCase, onClose }: { firstCase?: Storyline; onClose: () => void }) {
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => start.current?.focus(), []);
  return (
    <div className="welcome-backdrop" role="presentation" onClick={onClose}>
      <section className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={(e) => e.stopPropagation()}>
        <small>NAKAMEGURO, TOKYO</small>
        <h2 id="welcome-title">You&apos;re the neighbourhood fixer.</h2>
        <p className="welcome-lead">Everyone here is hiding something, and you know all of it. Watch their scenes play out, then have a quiet word with someone before the next one. You get three nudges a day, and every case ends well or badly.</p>
        {firstCase && (
          <div className="welcome-case">
            <small>Your first case</small>
            <strong><span aria-hidden="true">{firstCase.icon}</span> {firstCase.title}</strong>
            <p>{firstCase.brief}</p>
            <p className="welcome-goal">{firstCase.goal}</p>
          </div>
        )}
        <button ref={start} className="primary-action welcome-start" onClick={onClose}>Take the case</button>
        <p className="welcome-safety">Everyone in Nakameguro is an AI character. Never share your real name, address, school, passwords or phone number.</p>
      </section>
    </div>
  );
}
