"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Focus,
  LoaderCircle,
  MapPin,
  Maximize,
  Minus,
  Orbit,
  Plus,
  RotateCw,
} from "lucide-react";
import type { CityState } from "@/lib/types";
import type { CameraMode, CityRenderer } from "@/game/three/renderer";
import type { ConversationFrame } from "@/lib/conversation-playback";
import { useGameStore } from "@/lib/store";
import { LiveConversation } from "./LiveConversation";
import { calendarDay, formatDate } from "@/lib/calendar";
import { weekday } from "@/lib/routine";

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
  const conversation = useGameStore((state) => state.playbackQueue[0]);
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
      instance?.dispose();
      renderer.current = null;
    };
  }, []);

  function setCamera(next: CameraMode) {
    setMode(next);
    renderer.current?.setMode(next);
  }

  return (
    <>
      <div ref={host} className="three-world" />
      {ready && conversation && city && (
        <LiveConversation key={conversation.conversation_id} conversation={conversation}
          citizens={city.citizens} onFrame={stageConversation} onFinish={finishPlayback}
          location={city.locations.find((p) => p.location_id === conversation.location_id)?.name ?? city.city_name}
          dateLabel={city.calendar_start ? (() => { const d = calendarDay(city.calendar_start, conversation.game_day); return `${weekday(conversation.game_day).slice(0, 3)} ${formatDate(d)}`; })() : undefined}
          onFocus={() => renderer.current?.focusConversation()} />
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
      </div>
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
