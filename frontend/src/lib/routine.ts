import type { CitizenAgent } from "./types";
import type { WeatherNow } from "./weather";

/** What the calendar and the sky allow today. Defaults describe a dry working day. */
export type RoutineContext = {
  schoolOpen?: boolean;
  publicHoliday?: boolean;
  weather?: Pick<WeatherNow, "condition" | "heatwave">;
  evacuating?: boolean;
  /** Places shut today, e.g. after a fire. */
  closed?: string[];
};

// Offices close on public holidays; shops, care and transport keep running.
const officeLocations = new Set(["loc_bank", "loc_lab", "loc_school", "loc_office"]);
const essentialLocations = new Set(["loc_hospital", "loc_clinic", "loc_police", "loc_station", "loc_konbini"]);

// Day 1 is a Monday.
export const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const weekday = (day: number) => weekdayNames[(((day - 1) % 7) + 7) % 7];
export const isWeekend = (day: number) => (((day - 1) % 7) + 7) % 7 >= 5;
export const isNewWeek = (day: number) => day > 1 && (((day - 1) % 7) + 7) % 7 === 0;
export const weekdayIndex = (day: number) => (((day - 1) % 7) + 7) % 7;

export type RoutineStop = { location_id: string; activity: string };

// First matching skill decides where a resident spends their hobby time.
const hobbies: Array<[skills: string[], stop: RoutineStop]> = [
  [["science", "chemistry", "robotics"], { location_id: "loc_lab", activity: "Building experiments at the Meguro Science Lab" }],
  [["writing", "storytelling"], { location_id: "loc_library", activity: "Writing stories at the library" }],
  [["illustration", "sketching"], { location_id: "loc_library", activity: "Drawing comics at the library" }],
  [["gardening"], { location_id: "loc_farm", activity: "Helping with the crops at Meguro Community Garden" }],
  [["cooking"], { location_id: "loc_restaurant", activity: "Helping in the Sunny Side Cafe kitchen" }],
  [["baseball"], { location_id: "loc_park", activity: "Baseball practice in the park" }],
  [["piano"], { location_id: "loc_restaurant", activity: "Piano practice at Sunny Side Cafe" }],
  [["manga"], { location_id: "loc_library", activity: "Drawing manga at the library" }],
  [["music"], { location_id: "loc_park", activity: "Practising music in the park" }],
  [["sports"], { location_id: "loc_park", activity: "Playing football in the park" }],
  [["biology"], { location_id: "loc_park", activity: "Looking for pond creatures in the park" }],
  [["chess", "math", "debate"], { location_id: "loc_library", activity: "Chess and puzzles at the library" }],
];

export function hobbyStop(citizen: Pick<CitizenAgent, "skills">): RoutineStop {
  for (const skill of citizen.skills.map((s) => s.toLowerCase()))
    for (const [skills, stop] of hobbies) if (skills.includes(skill)) return stop;
  return { location_id: "loc_park", activity: "Hanging out at the park" };
}

// A stable -15, 0 or +15 minute personal rhythm: some residents are early birds, some run late.
export function routineOffset(citizenId: string) {
  let hash = 0;
  for (const char of citizenId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ((hash % 3) - 1) * 15;
}

function slotAt(citizen: CitizenAgent, minute: number) {
  return citizen.daily_schedule.find((entry) => Number(entry.start) <= minute && minute < Number(entry.end));
}

/** Where a resident's own routine puts them now. Needs, tasks and plans are handled by the caller. */
export function routineStop(citizen: CitizenAgent, day: number, minuteOfDay: number, context: RoutineContext = {}): RoutineStop {
  const minute = minuteOfDay - routineOffset(citizen.citizen_id);
  const stop = citizen.life && citizen.age >= 18 ? grownUpStop(citizen, day, minute, context) : youngStop(citizen, day, minute, context);
  return weatherAdjusted(citizen, stop, minute, context);
}

function weatherAdjusted(citizen: CitizenAgent, stop: RoutineStop, minute: number, context: RoutineContext): RoutineStop {
  const home = citizen.home_location_id;
  const asleep = /sleep/i.test(stop.activity);
  if (context.evacuating && !asleep) return { location_id: "loc_school", activity: "Sheltering at the evacuation area after the earthquake" };
  if (context.closed?.includes(stop.location_id) && stop.location_id !== home)
    return { location_id: home, activity: "Went home: the building is closed after a fire" };
  const weather = context.weather;
  if (!weather) return stop;
  const job = citizen.life?.job;
  const atWork = job && stop.location_id === job.location_id;
  if (weather.condition === "typhoon" && !asleep) {
    if (atWork && essentialLocations.has(job.location_id)) return stop;
    return { location_id: home, activity: "Sheltering at home from the typhoon" };
  }
  const outdoors = stop.location_id === "loc_park" || (stop.location_id === "loc_farm" && !atWork) || stop.location_id === "loc_shrine";
  if (!outdoors || asleep) return stop;
  if (weather.condition === "snow")
    return citizen.age < 18 ? { location_id: "loc_park", activity: "Building a snowman in the park" } : { location_id: home, activity: "Staying warm at home" };
  if (["rain", "heavy_rain", "thunderstorm"].includes(weather.condition))
    return citizen.age < 18 || citizen.age >= 65
      ? { location_id: citizen.age < 18 ? "loc_mall" : "loc_library", activity: citizen.age < 18 ? "Hanging out at Kokashita Arcade on a rainy day" : "Reading at the library while it rains" }
      : { location_id: "loc_mall", activity: "Rainy-day shopping at Kokashita Arcade" };
  if (weather.heatwave && minute >= 660 && minute < 960)
    return { location_id: "loc_mall", activity: "Cooling off in the air-conditioned mall" };
  return stop;
}

function youngStop(citizen: CitizenAgent, day: number, minute: number, context: RoutineContext): RoutineStop {
  const slot = slotAt(citizen, minute);
  const home = citizen.home_location_id;
  if (!slot) return { location_id: home, activity: "Sleeping" };
  const stop: RoutineStop = {
    location_id: typeof slot.location_id === "string" ? slot.location_id : home,
    activity: typeof slot.activity === "string" ? slot.activity : "Free time",
  };
  const dayOff = isWeekend(day) || context.schoolOpen === false;
  if (dayOff) {
    if (minute < 480 && /breakfast/i.test(stop.activity)) return { location_id: home, activity: "Sleeping in" };
    if (citizen.work_location_id && stop.location_id === citizen.work_location_id) {
      if (minute < 540) return { location_id: home, activity: "Late weekend breakfast" };
      if (minute < 720) return hobbyStop(citizen);
      if (minute < 780) return { location_id: "loc_restaurant", activity: "Weekend lunch at Sunny Side Cafe" };
      if (weekday(day) === "Sunday" && minute < 900) return { location_id: "loc_market", activity: "Browsing the Sunday market" };
      return { location_id: "loc_park", activity: "Weekend fun at the park" };
    }
    if (stop.location_id === "loc_park") return { location_id: "loc_park", activity: "Weekend fun at the park" };
    return stop;
  }
  // Tuesday and Thursday afternoons are club days.
  const clubDay = weekday(day) === "Tuesday" || weekday(day) === "Thursday";
  if (clubDay && stop.location_id === "loc_park" && minute >= 840 && minute < 1080) return hobbyStop(citizen);
  return stop;
}

/** Grown-ups follow their job, their gym habit and household errands; seniors keep gentler days. */
function grownUpStop(citizen: CitizenAgent, day: number, minute: number, context: RoutineContext): RoutineStop {
  const life = citizen.life!;
  const home = citizen.home_location_id;
  const wd = weekdayIndex(day);
  const closed = life.job && ((context.publicHoliday && officeLocations.has(life.job.location_id))
    || (context.schoolOpen === false && life.job.location_id === "loc_school"));
  const job = closed ? null : life.job;
  const senior = citizen.age >= 65;
  const wake = job?.workdays.includes(wd) ? Math.min(390, job.start - 75) : senior ? 420 : 450;
  if (minute < wake || minute >= (senior ? 1260 : 1350)) return { location_id: home, activity: "Sleeping" };
  if (job && job.workdays.includes(wd)) {
    if (minute < job.start - 30) return { location_id: home, activity: "Breakfast at home" };
    if (minute < job.end) return { location_id: job.location_id, activity: `Working as ${job.title.toLowerCase()}` };
    if (life.gym_days?.includes(wd) && minute < job.end + 75) return { location_id: "loc_gym", activity: "Working out at the gym" };
    if (wd === 2 && minute < job.end + 60) return { location_id: "loc_market", activity: "Grocery shopping at the market" };
    if (citizen.age < 30 && minute < Math.min(job.end + 150, 1320)) return hobbyStop(citizen);
    if (minute < 1230) return { location_id: home, activity: "Family dinner at home" };
    return { location_id: home, activity: "Relaxing at home" };
  }
  if (senior) {
    if (minute < 540) return { location_id: home, activity: "Slow breakfast at home" };
    if (minute < 600 && wd % 2 === 0) return { location_id: "loc_shrine", activity: "Morning prayer at Hikawa Shrine" };
    if (minute < 660) return { location_id: "loc_park", activity: "Morning walk in the park" };
    if (minute < 720) return { location_id: "loc_library", activity: "Reading the newspaper at the library" };
    if (minute < 780) return { location_id: "loc_restaurant", activity: "Lunch at Sunny Side Cafe" };
    if (minute < 930) return { location_id: home, activity: "Afternoon nap" };
    if (minute < 1050) return { location_id: "loc_park", activity: "Chatting on a park bench" };
    return { location_id: home, activity: "Dinner at home" };
  }
  if (minute < 540) return { location_id: home, activity: "Slow breakfast at home" };
  if (citizen.age < 30 && minute < 720) {
    if (life.gym_days?.includes(wd) && minute < 600) return { location_id: "loc_gym", activity: "Working out at the gym" };
    return hobbyStop(citizen);
  }
  if (minute < 630) return { location_id: "loc_market", activity: "Weekly shopping at the market" };
  if (life.gym_days?.includes(wd) && minute < 720) return { location_id: "loc_gym", activity: "Working out at the gym" };
  if (minute < 780) return { location_id: isWeekend(day) ? "loc_restaurant" : home, activity: isWeekend(day) ? "Weekend lunch at Sunny Side Cafe" : "Lunch at home" };
  if (minute < 1020) {
    if (citizen.age < 30) return hobbyStop(citizen);
    if (wd === 5) return { location_id: "loc_mall", activity: "Weekend shopping at Kokashita Arcade" };
    return isWeekend(day) || context.publicHoliday ? { location_id: "loc_park", activity: "Family time in the park" } : { location_id: home, activity: "Chores and errands at home" };
  }
  return { location_id: home, activity: "Dinner at home" };
}
