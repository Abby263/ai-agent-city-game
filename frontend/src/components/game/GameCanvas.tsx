"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowDown,
  ArrowUp,
  Focus,
  PersonStanding,
  Undo2,
  Redo2,
  X,
  LoaderCircle,
  MapPin,
  Maximize,
  Minus,
  Orbit,
  Plus,
  RotateCw,
} from "lucide-react";
import type { CityState } from "@/lib/types";
import { HEARING, type CameraMode, type CityRenderer } from "@/game/three/renderer";
import type { ConversationFrame } from "@/lib/conversation-playback";
import { useGameStore } from "@/lib/store";
import { LiveConversation } from "./LiveConversation";
import { EarthIntro } from "./EarthIntro";
import { registerSceneCapture } from "@/lib/scene-capture";
import { renderShareCard } from "@/lib/share";
import { calendarDay, formatDate } from "@/lib/calendar";
import { weekday } from "@/lib/routine";

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function GameCanvas({
  city,
  selectedCitizenId,
  onSelectCitizen,
}: {
  city: CityState | null;
  selectedCitizenId: string | null;
  onSelectCitizen: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<CityRenderer | null>(null);
  const latest = useRef({ city, selectedCitizenId, onSelectCitizen });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [labels, setLabels] = useState(false);
  const [mode, setMode] = useState<CameraMode>("orbit");
  // Scenes wait while the player is chatting; a replay they asked for still plays.
  const conversation = useGameStore((state) => state.playbackHeld && !state.playbackQueue[0]?.replay ? undefined : state.playbackQueue[0]);
  const finishPlayback = useGameStore((state) => state.finishPlayback);
  const inlineTalk = useGameStore((state) => state.inlineTalk);
  const focusRequest = useGameStore((state) => state.focusRequest);
  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.ids.length) renderer.current?.focusPair(focusRequest.ids, focusRequest.onlyIfHidden);
    else if (focusRequest.locationId) renderer.current?.focusPlace(focusRequest.locationId);
  }, [focusRequest, ready]);
  useEffect(() => {
    renderer.current?.setInlineTalk(inlineTalk);
  }, [inlineTalk, ready]);
  const stageConversation = useCallback((frame: ConversationFrame | null, onReady?: () => void) => {
    renderer.current?.setConversation(frame, onReady);
  }, []);
  useEffect(() => {
    latest.current = { city, selectedCitizenId, onSelectCitizen };
    if (city) renderer.current?.sync(city, selectedCitizenId);
  }, [city, selectedCitizenId, onSelectCitizen]);

  useEffect(() => {
    let cancelled = false;
    let instance: CityRenderer | null = null;
    async function boot() {
      try {
        const { CityRenderer } = await import("@/game/three/renderer");
        if (cancelled || !host.current) return;
        instance = new CityRenderer(
          host.current,
          (id) => latest.current.onSelectCitizen(id),
          setError,
        );
        renderer.current = instance;
        registerSceneCapture(() => instance?.snapshot() ?? null);
        // A handle for inspecting the town from the browser console while developing.
        if (process.env.NODE_ENV === "development") Object.assign(window, { __town: instance, __shareCard: renderShareCard });
        if (latest.current.city)
          instance.sync(latest.current.city, latest.current.selectedCitizenId);
        setReady(true);
      } catch (cause) {
        console.error("3D town initialization failed", cause);
        if (!cancelled)
          setError(
            "Nakameguro needs WebGL 2 graphics. Enable hardware acceleration or try a supported browser.",
          );
      }
    }
    void boot();
    return () => {
      cancelled = true;
      registerSceneCapture(null);
      instance?.dispose();
      renderer.current = null;
    };
  }, []);

  function setCamera(next: CameraMode) {
    setMode(next);
    renderer.current?.setMode(next);
  }
  // The opening flight from space onto Nakameguro (skipped for reduced motion).
  // The prerender assumes reduced motion (no intro); the browser then knows the real preference.
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED).matches, () => true);
  const [introDone, setIntroDone] = useState(false);
  const intro = !reducedMotion && !introDone;
  const pendingDescent = useRef(false);
  const descend = useCallback(() => {
    if (renderer.current) renderer.current.introDescent();
    else pendingDescent.current = true;
  }, []);
  useEffect(() => {
    if (ready && pendingDescent.current) {
      pendingDescent.current = false;
      renderer.current?.introDescent();
    }
  }, [ready]);
  const endIntro = useCallback(() => setIntroDone(true), []);
  useEffect(() => { useGameStore.getState().setIntroPlaying(intro); }, [intro]);
  // Street view: how far the scene being played is, so you have to walk over to hear it.
  const [sceneDistance, setSceneDistance] = useState<number | null>(null);
  useEffect(() => {
    if (mode !== "street" || !conversation) return;
    const timer = window.setInterval(() => setSceneDistance(renderer.current?.streetSceneDistance() ?? null), 500);
    return () => { window.clearInterval(timer); setSceneDistance(null); };
  }, [mode, conversation]);
  // Esc leaves street view, like closing a panel.
  useEffect(() => {
    if (mode !== "street") return;
    const leave = (event: KeyboardEvent) => { if (event.key === "Escape") { setMode("orbit"); renderer.current?.setMode("orbit"); } };
    window.addEventListener("keydown", leave);
    return () => window.removeEventListener("keydown", leave);
  }, [mode]);

  return (
    <>
      <div ref={host} className="three-world" />
      {intro && <EarthIntro townReady={ready} onDescend={descend} onDone={endIntro} />}
      {ready && conversation && city && (
        <LiveConversation key={conversation.conversation_id} conversation={conversation}
          citizens={city.citizens} onFrame={stageConversation} onFinish={finishPlayback}
          location={city.locations.find((p) => p.location_id === conversation.location_id)?.name ?? city.city_name}
          dateLabel={city.calendar_start ? (() => { const d = calendarDay(city.calendar_start, conversation.game_day); return `${weekday(conversation.game_day).slice(0, 3)} ${formatDate(d)}`; })() : undefined}
          onFocus={() => (mode === "street" ? renderer.current?.streetGoToScene() : renderer.current?.focusConversation())}
          faraway={mode === "street" && !conversation.replay && sceneDistance !== null && sceneDistance > HEARING
            ? { metres: Math.round(sceneDistance * 2), onGo: () => renderer.current?.streetGoToScene() } : null} />
      )}
      {(!ready || error) && (
        <div className="world-graphics-status" role="status">
          {error ? (
            <>
              <strong>Town unavailable</strong>
              <p>{error}</p>
              <button
                className="outline-action"
                onClick={() => location.reload()}
              >
                Reload town
              </button>
            </>
          ) : (
            <>
              <LoaderCircle className="reply-spinner" size={22} />
              <span>Opening Nakameguro...</span>
            </>
          )}
        </div>
      )}
      <div className="camera-modes" aria-label="Camera mode">
        <button
          aria-pressed={mode === "orbit"}
          title="Orbit: drag to rotate, pinch or scroll to zoom"
          disabled={!ready}
          onClick={() => setCamera("orbit")}
        >
          <Orbit size={15} />
          Explore
        </button>
        <button
          aria-pressed={mode === "follow"}
          title="Follow selected citizen"
          disabled={!ready || !selectedCitizenId}
          onClick={() => setCamera("follow")}
        >
          <Focus size={15} />
          Follow
        </button>
        <button
          aria-pressed={mode === "street"}
          title="Street view: stand in the street and look around"
          disabled={!ready}
          onClick={() => setCamera(mode === "street" ? "orbit" : "street")}
        >
          <PersonStanding size={15} />
          Street
        </button>
      </div>
      {mode === "street" && ready && (
        <div className="street-view-controls" role="group" aria-label="Street view controls">
          <p>Drag to look around · click the street to walk · arrow keys or WASD · Esc to leave</p>
          <div className="street-view-row">
            <button aria-label="Turn left" title="Turn left" onClick={() => renderer.current?.streetTurn(Math.PI / 6)}><Undo2 size={16} /></button>
            <button aria-label="Walk forward" title="Walk forward" onClick={() => renderer.current?.streetStep(1.5)}><ArrowUp size={16} /></button>
            <button aria-label="Walk back" title="Walk back" onClick={() => renderer.current?.streetStep(-1.5)}><ArrowDown size={16} /></button>
            <button aria-label="Turn right" title="Turn right" onClick={() => renderer.current?.streetTurn(-Math.PI / 6)}><Redo2 size={16} /></button>
            <select aria-label="Go to a place in street view" value="" onChange={(event) => { if (event.target.value) renderer.current?.streetViewAt(event.target.value); }}>
              <option value="">Go to…</option>
              {city?.locations.map((place) => <option key={place.location_id} value={place.location_id}>{place.name}</option>)}
            </select>
            <button className="street-view-exit" aria-label="Leave street view" title="Leave street view (Esc)" onClick={() => setCamera("orbit")}><X size={16} /> Exit</button>
          </div>
        </div>
      )}
      <div className="map-zoom" aria-label="3D map controls">
        <button
          disabled={!ready}
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => renderer.current?.zoom(1)}
        >
          <Plus size={17} />
        </button>
        <button
          disabled={!ready}
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => renderer.current?.zoom(-1)}
        >
          <Minus size={17} />
        </button>
        <button
          disabled={!ready}
          aria-label="Rotate town"
          title="Rotate town"
          onClick={() => renderer.current?.rotate()}
        >
          <RotateCw size={16} />
        </button>
        <button
          disabled={!ready}
          aria-label="Town overview"
          title="Town overview"
          onClick={() => {
            setMode("orbit");
            renderer.current?.overview();
          }}
        >
          <Maximize size={16} />
        </button>
        <button
          disabled={!ready}
          aria-label="Place labels"
          title="Place labels"
          aria-pressed={labels}
          onClick={() => {
            setLabels(!labels);
            renderer.current?.setLabels(!labels);
          }}
        >
          <MapPin size={16} />
        </button>
      </div>
    </>
  );
}
