// Types for the parts of TalkingHead (MIT) the narrator's avatar uses; the package ships none.
// The module is a patched copy made by scripts/vendor-headtts.mjs.
declare module "@/vendor/talkinghead/talkinghead.mjs" {
  export class TalkingHead {
    constructor(node: HTMLElement, options?: Record<string, unknown>);
    showAvatar(avatar: Record<string, unknown>, onprogress?: ((event: ProgressEvent) => void) | null): Promise<void>;
    speakAudio(audio: {
      audio: AudioBuffer; words?: string[]; wtimes?: number[]; wdurations?: number[];
      visemes?: string[]; vtimes?: number[]; vdurations?: number[];
    }, options?: Record<string, unknown> | null, onsubtitles?: ((text: string) => void) | null): void;
    stopSpeaking(): void;
    setMood(mood: string): void;
    start(): void;
    stop(): void;
    dispose(): void;
    setView(view: string, options?: Record<string, unknown>): void;
    avatarHeight: number;
    isSpeaking: boolean;
    isAudioPlaying: boolean;
  }
}
