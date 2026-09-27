import assert from "node:assert/strict";
import test from "node:test";
import { checkPlayerText } from "../src/lib/safety";

const category = (text: string) => {
  const result = checkPlayerText(text);
  return result.ok ? null : result.category;
};

test("friendly everyday messages are allowed", () => {
  for (const text of [
    "Hi Noah, want to study for the science test together?",
    "3 kids crossed the road to the park",
    "Meet me at the library at 15:30 on day 2",
    "I scored 12 points in the class quiz!",
    "That shiny new bike looks awesome",
  ]) assert.equal(category(text), null, text);
});

test("personal information and links are blocked", () => {
  assert.equal(category("email me at kid@example.com"), "personal_info");
  assert.equal(category("call 555-123-4567 later"), "personal_info");
  assert.equal(category("I live at 42 Maple Street"), "personal_info");
  assert.equal(category("my password is sunshine"), "personal_info");
  assert.equal(category("check out https://example.com/game"), "link");
  assert.equal(category("go to coolgames.gg"), "link");
});

test("unkind language is blocked, including disguised spellings", () => {
  assert.equal(category("you are a sh1t friend"), "unkind_language");
  assert.equal(category("f.u.c.k this"), "unkind_language");
  assert.equal(category("just kys"), "unkind_language");
});

test("wellbeing messages point to a trusted adult instead of the AI", () => {
  const result = checkPlayerText("sometimes I want to die");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /trusted adult|adult you trust/);
});

