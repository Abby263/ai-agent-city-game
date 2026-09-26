import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialCity } from "../src/lib/initial-city";
import { acceptMeeting, meetingFor, type MeetingPlan } from "../src/lib/encounters";

test("appointments require valid participants, a future public place and no conflicting promise", () => {
  const city = createInitialCity();
  const actors = city.citizens.slice(0, 2).map((c) => c.citizen_id);
  const plan = { actor_ids: actors, location_id: "loc_park", game_day: 1, game_minute: 600, topic: "Finish a drawing" };
  const meeting = acceptMeeting(city, plan, actors, "exchange");
  assert.equal(meeting?.status, "scheduled");
  assert.equal(acceptMeeting(city, { ...plan, actor_ids: [actors[0], actors[0]] }, actors, "x"), null);
  assert.equal(acceptMeeting(city, { ...plan, location_id: "imaginary" }, actors, "x"), null);
  assert.equal(acceptMeeting(city, { ...plan, game_minute: 100 }, actors, "x"), null);
  assert.equal(acceptMeeting(city, {} as MeetingPlan, actors, "x"), null);
  city.meetings = [meeting!];
  assert.equal(acceptMeeting(city, plan, actors, "second"), null);
  city.simulation_mode = "autonomous";
  city.clock.minute_of_day = 590;
  assert.equal(meetingFor(city, city.citizens[0])?.id, meeting!.id);
  city.simulation_mode = "manual";
  assert.equal(meetingFor(city, city.citizens[0]), undefined);
});
