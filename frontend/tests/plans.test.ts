import assert from "node:assert/strict";
import test from "node:test";
import { parsePlan } from "../src/lib/plans";
import { createInitialCity } from "../src/lib/initial-city";

test("plans agreed in chat become a day, time and place", () => {
  const city = createInitialCity(); // day 1 is a Monday
  city.clock.minute_of_day = 1110;
  const plan = parsePlan("Want to grab ramen on Friday after work? Let's meet at the food court around seven.", city)!;
  assert.equal(plan.day, 5);
  assert.equal(plan.minute, 19 * 60);
  assert.equal(plan.location_id, "loc_mall");
  assert.equal(parsePlan("Deal! Seven at the food court. See you on Friday!", city)?.minute, 19 * 60);
  assert.equal(parsePlan("See you at 10am tomorrow at the library", city)?.day, 2);
  assert.equal(parsePlan("That was fun, thanks!", city), null);
});

test("spoken minutes and greetings don't move the time", () => {
  const city = createInitialCity();
  city.clock.minute_of_day = 1230; // Monday evening
  const at = (text: string) => { const plan = parsePlan(text, city); return plan && `${plan.day} ${plan.minute / 60}`; };
  assert.equal(at("Tomorrow evening. I'll be at Sunny Side Cafe at six-thirty, half an hour early."), "2 18.5");
  assert.equal(at("Tomorrow at seven fifteen at the park?"), "2 19.25");
  assert.equal(at("Meet me tomorrow, half past six, at the library"), "2 18.5");
  assert.equal(at("Tomorrow, quarter to eight at the station"), "2 19.75");
  city.clock.minute_of_day = 360;
  assert.equal(at("Morning, Mateo! Play it for me tonight? Sunny Side Cafe at seven."), "1 19");
  assert.equal(at("Good morning! Let's get coffee tomorrow at seven."), "2 19");
  assert.equal(at("Let's run tomorrow morning at seven by the river"), "2 7");
});
