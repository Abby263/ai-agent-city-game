"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Play } from "lucide-react";
import type { CityState } from "@/lib/types";
import { sociallyAvailable } from "@/lib/encounters";

export type PendingExchange = { names: string; startedAt: number };

function Elapsed({ startedAt }: { startedAt: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return <span>Generating dialogue · {seconds}s</span>;
}

export function AutonomyStatus({ city, pending, busy, onResume }: {
  city: CityState; pending: PendingExchange | null; busy: boolean; onResume: () => void;
}) {
  if (city.simulation_mode !== "autonomous") return null;
  const failure = typeof city.policy.autonomy_error === "string" ? city.policy.autonomy_error : "";
  const available = city.citizens.filter((c) => sociallyAvailable(c, city.policy.player_citizen_id));
  const ready = available.some((c) => available.some((other) => c !== other && c.current_location_id === other.current_location_id));
  const resting = city.citizens.every((c) => /^sleep/i.test(c.current_activity) || c.energy < 18);
  return <section className="auto-status" aria-label="Automatic conversations">
    {pending && city.clock.running ? <>
      <div role="status"><LoaderCircle size={16} className="reply-spinner" /><strong>{pending.names} are talking</strong></div>
      <Elapsed key={pending.startedAt} startedAt={pending.startedAt} />
    </> : !city.clock.running ? <>
      <strong>{failure ? "Auto paused after an AI error" : "Auto is paused"}</strong>
      {failure && <p role="alert">{failure}</p>}
      <button className="text-action" onClick={onResume} disabled={busy}><Play size={14} />Resume Auto</button>
    </> : <>
      <strong>{city.encounter ? "An encounter is unfolding" : ready ? "Residents have time together" : resting ? "Residents are resting" : "Residents are on the move"}</strong>
      <span>{city.encounter?.reason || (ready ? "They may talk, or enjoy some time alone" : "Waiting for residents to meet")}</span>
    </>}
  </section>;
}
