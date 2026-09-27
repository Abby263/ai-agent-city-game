"use client";

import { useState } from "react";
import { Eye, Gamepad2, Hand, MapPin, MessageCircle, ScrollText, Send, UserRound, X } from "lucide-react";
import type { CitizenAgent, CityState } from "@/lib/types";
import { CitizenPortrait } from "./CitizenPortrait";

/** Tap someone and do something with them right away, in your own words, without opening a full panel. */
export function PersonBar({ city, citizen, player, busy, onClose, onTalk, onDo, onMore, onProfile, onPrompt, onPlayAs, onWatch, onGoTo }: {
  city: CityState;
  citizen: CitizenAgent;
  player: CitizenAgent | undefined;
  busy: boolean;
  onClose: () => void;
  onTalk: (id: string) => void;
  /** The resident you play does anything to this person, described in your words. */
  onDo: (targetId: string, text: string) => void;
  onMore: (id: string) => void;
  onProfile: (id: string) => void;
  onPrompt: (id: string) => void;
  onPlayAs: (id: string | null) => void;
  onWatch: (id: string) => void;
  onGoTo: (locationId: string) => void;
}) {
  const [text, setText] = useState("");
  const place = (id: string) => city.locations.find((l) => l.location_id === id)?.name ?? "town";
  const first = citizen.name.split(" ")[0];
  const isYou = player?.citizen_id === citizen.citizen_id;
  const nearby = player && player.current_location_id === citizen.current_location_id;
  const asleep = /sleep/i.test(citizen.current_activity);
  const promptButton = <button className="chip-action" onClick={() => onPrompt(citizen.citizen_id)}><ScrollText size={14} /> Prompt</button>;
  return (
    <section className="person-bar" aria-label={`${citizen.name}: quick actions`}>
      <header>
        <CitizenPortrait citizen={citizen} size={40} />
        <div>
          <strong>{isYou ? `You · ${citizen.name}` : citizen.name}<small>{citizen.age} · {citizen.mood}</small></strong>
          <span><MapPin size={12} /> {citizen.current_activity} · {place(citizen.current_location_id)}</span>
        </div>
        <button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
      </header>
      {player && !isYou && (
        <>
          <div className="person-bar-actions">
            <button className="primary-action" disabled={busy || asleep} title={asleep ? `${first} is asleep` : undefined} onClick={() => onTalk(citizen.citizen_id)}>
              <MessageCircle size={15} /> {asleep ? `${first} is asleep` : nearby ? `Talk to ${first}` : `Go and talk to ${first}`}
            </button>
            {promptButton}
            <button className="chip-action" onClick={() => onProfile(citizen.citizen_id)}><UserRound size={14} /> Profile</button>
          </div>
          <form className="write-what person-do" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onDo(citizen.citizen_id, text.trim()); setText(""); } }}>
            <input aria-label={`Do something with ${first}`} value={text} maxLength={400} onChange={(e) => setText(e.target.value)}
              placeholder={`Do anything with ${first}… (e.g. ask for a loan)`} />
            <button className="icon-button" type="submit" aria-label="Do it" disabled={busy || !text.trim()}><Send size={15} /></button>
          </form>
        </>
      )}
      {isYou && (
        <div className="person-bar-actions">
          <label className="go-to">
            <MapPin size={14} />
            <select aria-label="Go to a place" value="" disabled={busy} onChange={(e) => e.target.value && onGoTo(e.target.value)}>
              <option value="">Go to…</option>
              {city.locations.filter((l) => l.location_id !== citizen.current_location_id).map((l) => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
            </select>
          </label>
          {promptButton}
          <button className="chip-action" onClick={() => onProfile(citizen.citizen_id)}><UserRound size={14} /> Profile</button>
          <button className="chip-action" onClick={() => onPlayAs(null)}>Return to observer</button>
        </div>
      )}
      {!player && (
        <div className="person-bar-actions">
          <button className="primary-action" onClick={() => onPlayAs(citizen.citizen_id)}><Gamepad2 size={15} /> Play as {first}</button>
          <button className="chip-action" onClick={() => onMore(citizen.citizen_id)}><Hand size={14} /> Make {first} do something</button>
          {promptButton}
          <button className="chip-action" onClick={() => onWatch(citizen.citizen_id)}><Eye size={14} /> Watch</button>
          <button className="chip-action" onClick={() => onProfile(citizen.citizen_id)}><UserRound size={14} /> Profile</button>
        </div>
      )}
    </section>
  );
}
