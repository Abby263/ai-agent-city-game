// Listening to the player: the browser's own speech recognition, so talking to the narrator needs no extra service.
// Chrome, Edge and Safari have it; where it is missing the narrator still takes typed words.

type RecognitionEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export const voiceInputSupported = () => Boolean(recognitionClass());

export type VoiceHandlers = {
  /** Words so far, while the player is still speaking. */
  onInterim: (text: string) => void;
  /** The finished sentence. Empty if nothing was heard. */
  onFinal: (text: string) => void;
  onError: (message: string) => void;
};

const PROBLEMS: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Allow it in your browser's address bar, or type instead.",
  "service-not-allowed": "This browser won't let the page use speech recognition. You can type instead.",
  "audio-capture": "No microphone was found. You can type instead.",
  network: "Speech recognition couldn't reach its service. You can type instead.",
};

/** One utterance: starts listening, reports words as they come, and finishes when the player stops talking. */
export function listenOnce(handlers: VoiceHandlers) {
  const Recognition = recognitionClass();
  if (!Recognition) {
    handlers.onError("This browser can't listen. You can type instead.");
    return () => {};
  }
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  let heard = "", finished = false;
  const finish = (text: string) => {
    if (finished) return;
    finished = true;
    handlers.onFinal(text.trim());
  };
  recognition.onresult = (event) => {
    let final = "", interim = "";
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) final += result[0].transcript;
      else interim += result[0].transcript;
    }
    heard = `${final} ${interim}`.trim();
    handlers.onInterim(heard);
  };
  recognition.onerror = (event) => {
    // Silence or the player cancelling is not a fault.
    if (event.error === "no-speech" || event.error === "aborted") return;
    finished = true;
    handlers.onError(PROBLEMS[event.error] ?? "I couldn't hear that. Try again, or type instead.");
  };
  recognition.onend = () => finish(heard);
  try {
    recognition.start();
  } catch {
    handlers.onError("The microphone is busy. Try again in a moment.");
  }
  return () => { try { recognition.stop(); } catch { /* already stopped */ } };
}
