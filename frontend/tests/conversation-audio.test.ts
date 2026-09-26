import { test } from "node:test";
import assert from "node:assert/strict";
import { ConversationAudio, speechChunks, voiceStyle, type Voice } from "../src/lib/conversation-audio";

const voices: Voice[] = [
  { voiceURI: "local-b", name: "B", lang: "en-GB", localService: true },
  { voiceURI: "cloud", name: "C", lang: "en-US", localService: false },
  { voiceURI: "local-a", name: "A", lang: "en-US", localService: true },
];
test("voice identity is stable across list order and prefers local English voices", () => {
  const first = voiceStyle("cit_009", voices);
  assert.deepEqual(first, voiceStyle("cit_009", [...voices].reverse()));
  assert.equal(first.voice?.localService, true);
  assert.notDeepEqual(first, voiceStyle("cit_010", voices), "Voice styles can differ even when only one local voice is available");
  assert.equal(voiceStyle("cit_009", []).voice, undefined);
});
test("chunking retains the complete dialogue without inventing words", () => {
  const text = "A sentence that is fairly long. ".repeat(18).trim();
  const chunks = speechChunks(text);
  assert.ok(chunks.every((chunk) => chunk.length <= 160));
  assert.equal(chunks.join(" "), text);
  assert.deepEqual(speechChunks("  "), []);
});

function harness() {
  const spoken: SpeechSynthesisUtterance[] = [];
  let cancellations = 0;
  const player = new ConversationAudio({ cancel: () => { cancellations++; }, speak: (u) => { spoken.push(u); }, getVoices: () => voices as SpeechSynthesisVoice[] }, (text) => ({ text }) as SpeechSynthesisUtterance);
  return { player, spoken, cancelled: () => cancellations };
}
const fire = (u: SpeechSynthesisUtterance, event: "onend" | "onerror" | "onstart") => (u[event] as (() => void) | null)?.();

test("speech completes all chunks before advancing; volume changes affect later chunks", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { player, spoken } = harness();
  let done = 0;
  player.play({ key: "one", citizenId: "cit_009", text: "hello ".repeat(40), volume: 0.8, onEnd: () => done++, onError: () => assert.fail("unexpected error") });
  assert.equal(spoken.length, 1);
  fire(spoken[0], "onstart");
  player.setVolume(0.3);
  fire(spoken[0], "onend");
  fire(spoken[0], "onend");
  assert.equal(spoken.length, 2);
  assert.equal(spoken[1].volume, 0.3);
  assert.equal(done, 0);
  fire(spoken[1], "onend");
  t.mock.timers.tick(500);
  assert.equal(done, 1);
  player.stop();
});

test("pause, skip and unmount cancellation prevent stale audio from advancing dialogue", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { player, spoken, cancelled } = harness();
  let ended = 0, errors = 0;
  const line = { key: "one", citizenId: "cit_009", text: "Hi Leo.", volume: 0.8, onEnd: () => ended++, onError: () => errors++ };
  player.play(line);
  player.play(line);
  assert.equal(spoken.length, 1, "rendering again must not restart speech");
  player.stop();
  fire(spoken[0], "onend"); fire(spoken[0], "onerror");
  t.mock.timers.tick(30000);
  assert.equal(ended, 0); assert.equal(errors, 0);
  assert.ok(cancelled() >= 2);
  player.play(line);
  assert.equal(spoken.length, 2, "resume restarts the interrupted line");
  player.stop();
});

test("blocked or stalled browser speech fails safely so subtitles can continue", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { player, spoken } = harness();
  let errors = 0;
  player.play({ key: "one", citizenId: "cit_009", text: "Hello.", volume: 0.8, onEnd: () => assert.fail("must not auto-complete"), onError: () => errors++ });
  t.mock.timers.tick(7000);
  fire(spoken[0], "onerror");
  assert.equal(errors, 1);
  player.stop();
});
