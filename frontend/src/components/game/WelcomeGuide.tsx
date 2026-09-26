"use client";

import { useEffect, useRef } from "react";

const steps = [
  { icon: "🗾", title: "A real Tokyo neighbourhood", text: "Nakameguro runs on real Tokyo time, date and weather. Night here is night in Tokyo." },
  { icon: "🏘️", title: "Meet the neighbours", text: "Tap a face at the bottom to see how someone lives: family, job, feelings, health and memories." },
  { icon: "✋", title: "Make anyone do anything", text: "Open a person, choose Act, and have them hug, help, argue with or ask out someone else. Then watch the reaction." },
  { icon: "🪄", title: "Play god", text: "Use Create to make it rain, shake the ground, drop money on the street or start a fire, and see who does the right thing." },
  { icon: "🏆", title: "Collect badges", text: "Try new things to earn badges. Can you collect them all?" },
];

export const WELCOME_KEY = "agentcity.welcomed";

export function WelcomeGuide({ onClose }: { onClose: () => void }) {
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => start.current?.focus(), []);
  return (
    <div className="welcome-backdrop" role="presentation" onClick={onClose}>
      <section className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={(e) => e.stopPropagation()}>
        <small>WELCOME TO</small>
        <h2 id="welcome-title">Nakameguro</h2>
        <p className="welcome-lead">A living Tokyo neighbourhood where every resident has their own life, feelings and memories, all imagined by AI.</p>
        <ol className="welcome-steps">
          {steps.map((step) => (
            <li key={step.title}>
              <span aria-hidden="true">{step.icon}</span>
              <div><strong>{step.title}</strong><p>{step.text}</p></div>
            </li>
          ))}
        </ol>
        <p className="welcome-safety"><span aria-hidden="true">🛡️</span>Everyone in Nakameguro is an AI character. Never share your real name, address, school, passwords or phone number.</p>
        <button ref={start} className="primary-action welcome-start" onClick={onClose}>Let&apos;s explore!</button>
      </section>
    </div>
  );
}
