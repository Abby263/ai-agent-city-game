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
