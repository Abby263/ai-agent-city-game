import assert from "node:assert/strict";
import test from "node:test";
import { armPose, emotionOf, gestureFor, lineEmotion, listenPoseFor } from "../src/game/three/expression";

test("emotion comes from feelings first, then mood", () => {
  assert.equal(emotionOf({ mood: "Calm", life: { emotions: { joy: 40, sadness: 70, anger: 5, fear: 5 } } as never }), "sad");
  assert.equal(emotionOf({ mood: "Annoyed", life: undefined }), "angry");
  assert.equal(emotionOf({ mood: "Overjoyed", life: undefined }), "excited");
});

test("the words of a line change how it is delivered", () => {
  assert.equal(lineEmotion("How dare you say that!", "happy"), "angry");
  assert.equal(lineEmotion("I'm so sorry about your grandpa.", "neutral"), "sad");
  assert.equal(lineEmotion("Wow, that's amazing!", "neutral"), "excited");
  assert.equal(lineEmotion("Where are you going?", "neutral"), "curious");
});

test("gestures vary with the words, the feeling and the person", () => {
  assert.equal(gestureFor("Hey Takashi!", "happy", 0, "a"), "wave");
  assert.ok(["hips", "point", "fists"].includes(gestureFor("That's not fair.", "angry", 2, "a")));
  const variety = new Set(["cit_1", "cit_2", "cit_3", "cit_4", "cit_5", "cit_6"].map((id) => gestureFor("I think we should try the new ramen place near the station.", "neutral", 3, id)));
  assert.ok(variety.size >= 2, "different people gesture differently");
  assert.equal(listenPoseFor("angry"), "crossed");
  const wave = armPose("wave", 1);
  assert.ok(wave.right[1] > 2, "waving raises the right arm high");
});
