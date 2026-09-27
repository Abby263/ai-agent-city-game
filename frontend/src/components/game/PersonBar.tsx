"use client";

import { Eye, Gamepad2, Hand, MapPin, MessageCircle, MoreHorizontal, UserRound, X } from "lucide-react";
import { actionBlocked, actions, type ActionId } from "@/lib/actions";
import type { CitizenAgent, CityState } from "@/lib/types";
import { CitizenPortrait } from "./CitizenPortrait";

const quick: ActionId[] = ["hug", "high_five", "compliment", "invite", "tease", "argue"];

/** Tap someone and do something with them right away, without opening a full panel. */
export function PersonBar({ city, citizen, player, busy, onClose, onTalk, onAction, onMore, onProfile, onPlayAs, onWatch, onGoTo }: {
  city: CityState;
  citizen: CitizenAgent;
  player: CitizenAgent | undefined;
  busy: boolean;
  onClose: () => void;
  onTalk: (id: string) => void;
  onAction: (targetId: string, action: ActionId) => void;
  onMore: (id: string) => void;
  onProfile: (id: string) => void;
  onPlayAs: (id: string | null) => void;
  onWatch: (id: string) => void;
  onGoTo: (locationId: string) => void;
}) {
  const place = (id: string) => city.locations.find((l) => l.location_id === id)?.name ?? "town";
  const first = citizen.name.split(" ")[0];
  const isYou = player?.citizen_id === citizen.citizen_id;
  const nearby = player && player.current_location_id === citizen.current_location_id;
  const asleep = /sleep/i.test(citizen.current_activity);
  const moves = player && !isYou
    ? quick.filter((id) => !actionBlocked(city, player, citizen, id)).slice(0, 4).map((id) => actions.find((a) => a.id === id)!)
    : [];
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
        <div className="person-bar-actions">
          <button className="primary-action" disabled={busy || asleep} title={asleep ? `${first} is asleep` : undefined} onClick={() => onTalk(citizen.citizen_id)}>
            <MessageCircle size={15} /> {asleep ? `${first} is asleep` : nearby ? `Talk to ${first}` : `Go and talk to ${first}`}
          </button>
          {moves.map((a) => (
            <button key={a.id} className="chip-action" disabled={busy} title={`${a.label}: ${first}`} onClick={() => onAction(citizen.citizen_id, a.id)}>
              <span aria-hidden="true">{a.icon}</span>{a.label}
            </button>
          ))}
          <button className="chip-action" onClick={() => onMore(citizen.citizen_id)}><MoreHorizontal size={14} /> More</button>
          <button className="chip-action" onClick={() => onProfile(citizen.citizen_id)}><UserRound size={14} /> Profile</button>
        </div>
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
          <button className="chip-action" onClick={() => onProfile(citizen.citizen_id)}><UserRound size={14} /> Profile</button>
          <button className="chip-action" onClick={() => onPlayAs(null)}>Return to observer</button>
        </div>
      )}
      {!player && (
        <div className="person-bar-actions">
          <button className="primary-action" disabled={citizen.age < 3} onClick={() => onPlayAs(citizen.citizen_id)}><Gamepad2 size={15} /> Play as {first}</button>
          <button className="chip-action" onClick={() => onMore(citizen.citizen_id)}><Hand size={14} /> Make {first} do something</button>
          <button className="chip-action" onClick={() => onWatch(citizen.citizen_id)}><Eye size={14} /> Watch</button>
          <button className="chip-action" onClick={() => onProfile(citizen.citizen_id)}><UserRound size={14} /> Profile</button>
        </div>
      )}
    </section>
  );
}
