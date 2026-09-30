import { test } from "node:test";
import assert from "node:assert/strict";
import { ConversationAudio, speechChunks, type Voice } from "../src/lib/conversation-audio";
import { castVoices, deliveryStyle, deviceVoice, spokenText } from "../src/lib/voices";
import { createInitialCity } from "../src/lib/initial-city";

const voices: Voice[] = [
  { voiceURI: "bubbles", name: "Bubbles", lang: "en-US", localService: true },
  { voiceURI: "zarvox", name: "Zarvox", lang: "en-US", localService: true },
  { voiceURI: "samantha", name: "Samantha", lang: "en-US", localService: true },
  { voiceURI: "daniel", name: "Daniel", lang: "en-GB", localService: true },
  { voiceURI: "ava-premium", name: "Ava (Premium)", lang: "en-US", localService: true },
];
const cast = castVoices(createInitialCity().citizens);
const casting = cast.get("cit_009")!;

test("every resident gets a distinct natural voice that fits their sex and age", () => {
  const city = createInitialCity();
  const ava = cast.get("cit_009")!, walter = cast.get("cit_032")!, tom = cast.get("cit_030")!;
  assert.equal(ava.sex, "female");
  assert.match(ava.describe, /20-year-old woman/);
  assert.match(walter.describe, /older man/);
  assert.ok(walter.pitch < tom.pitch && walter.rate < tom.rate, "seniors speak lower and slower");
  const adults = city.citizens.filter((c) => c.age >= 18 && c.age < 62).map((c) => cast.get(c.citizen_id)!.natural);
  assert.ok(new Set(adults).size >= adults.length - 4, "voices are spread across the cast");
});

test("device voices skip novelty voices and match gender, preferring premium quality", () => {
  assert.equal(deviceVoice(casting, voices, "cit_009")?.name, "Ava (Premium)");
  assert.equal(deviceVoice(cast.get("cit_030")!, voices, "cit_030")?.name, "Daniel");
  assert.equal(deviceVoice(casting, voices.slice(0, 2), "x"), undefined, "never Bubbles or Zarvox");
});

test("stage directions and emojis are not read aloud; delivery follows the words", () => {
  assert.equal(spokenText("*Aoi hugs Sota* Missed you! 🤗"), "Missed you!");
  assert.match(deliveryStyle(casting, "I'm so sorry, I miss her."), /sad/);
  assert.match(deliveryStyle(casting, "That's amazing!"), /excited/);
  assert.match(deliveryStyle(casting, "Hi"), /20-year-old woman$/);
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
  const player = new ConversationAudio({ cancel: () => { cancellations++; }, speak: (u) => { spoken.push(u); }, getVoices: () => voices as SpeechSynthesisVoice[] }, (text) => ({ text }) as SpeechSynthesisUtterance, () => "device");
  return { player, spoken, cancelled: () => cancellations };
}
const fire = (u: SpeechSynthesisUtterance, event: "onend" | "onerror" | "onstart") => (u[event] as (() => void) | null)?.();

test("speech completes all chunks before advancing; volume changes affect later chunks", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { player, spoken } = harness();
  let done = 0;
  player.play({ key: "one", citizenId: "cit_009", casting, text: "hello ".repeat(40), volume: 0.8, onEnd: () => done++, onError: () => assert.fail("unexpected error") });
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
  const line = { key: "one", citizenId: "cit_009", casting, text: "Hi Sota.", volume: 0.8, onEnd: () => ended++, onError: () => errors++ };
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
  player.play({ key: "one", citizenId: "cit_009", casting, text: "Hello.", volume: 0.8, onEnd: () => assert.fail("must not auto-complete"), onError: () => errors++ });
  t.mock.timers.tick(7000);
  fire(spoken[0], "onerror");
  assert.equal(errors, 1);
  player.stop();
});
