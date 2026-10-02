# Cities

AgentCity has more than one city. The player picks one on first visit (`CityGate.tsx`) and can switch from the
header; each city keeps its own saved world in the browser. Two ship today:

| City | Where | Feel |
|---|---|---|
| Nakameguro | Meguro City, Tokyo | Canal, cherry trees, a shrine, the train on its viaduct |
| Lucknow | Hazratganj and Chowk, Uttar Pradesh | Lime-washed havelis, kabab houses, the Gomti, domes and kites |

## How a city is put together

Every city is the same kind of neighbourhood on the same street grid: two cross streets, a river with two bridges
and a rail viaduct, with the same 23 places (`loc_market`, `loc_station`, ...). That shared skeleton is what lets
the simulation (routines, jobs, households, cases, the narrator) run unchanged. What differs is everything a
player sees and hears.

| Layer | File | What it holds |
|---|---|---|
| Identity, calendar, climate | `frontend/src/lib/cities.ts` | Name, region, coordinates and captions for the opening flight, time zone, currency, place names, public holidays and school breaks, seasons, monthly climate and what the sky can do (monsoon, fog, heatwave, typhoons, snow), how people talk, and the phrase table that turns text written for Nakameguro into local text (`cityText`) |
| Cast | `frontend/src/lib/cities/lucknow-cast.json` | 26 residents filling the same household and job slots. Built by `scripts/cities/make-lucknow-cast.py` from a table of names, characters, voices, memories and looks |
| Cases and incidents | `frontend/src/lib/cities/lucknow-stories.ts` | Nine cases, their order, and town-wide incidents |
| Look | `frontend/src/game/three/theme.ts` | Building names and colours, house style, river and haze colour, tree in flower, train livery |
| Buildings | `architecture.ts`, `mughal.ts`, `landmarks.ts` | Havelis (arched doors, jharokha balconies, roof terraces with water tanks and washing); arches, domes, chhatris and crenellated parapets on public buildings; Hazratganj's cream-and-pink arcade; Charbagh Station, the Bara Imambara, the Rumi Darwaza and the Husainabad clock tower |
| Street life | `props.ts`, `town.ts`, `traffic.ts` | Chai stalls, fruit carts, auto-rickshaws and e-rickshaws (parked and in traffic), scooters, cows, hoardings in Hindi, marigold-and-bulb festoons, a mango orchard, gulmohar trees, kites over the old city |
| People's bodies and dress | `scripts/blender/export-residents.py`, `wardrobe.ts` | One model per resident; kurtas, dupattas, topis and uniforms are added in the game |

The active city is read once, when the page loads (`activeCity()`); choosing another reloads the page. Storage keys
are `agentcity.v12.*` for Nakameguro (unchanged, so existing worlds survive) and `agentcity.v12.<city>.*` otherwise.
A link can name a city: `?city=lucknow`.

The backend is city-neutral: prompts name no city, and every request carries the city in `city_time`, the
residents' character prompts and, for scenes, a line on how people there speak.

## Lucknow, specifically

- **Places.** West of the Gomti is the old city: Chowk Mohalla, Aminabad Bazaar, Nawab Kabab House, KGMU Hospital,
  the Amir-ud-Daula Library, Chowk Kotwali, a Dussehri mango orchard. East is Hazratganj and Charbagh: the arcade,
  Gomti IT Tower, Sharmaji Chai & Kirana, the Bara Imambara behind the Rumi Darwaza, Charbagh Station with the metro
  overhead, the clock tower on the square. Private businesses are invented; public landmarks are real.
- **Calendar.** Indian Standard Time; Republic Day, Independence Day, Gandhi Jayanti and the main festivals for
  2026 and 2027 (Holi, Eid, Muharram, Dussehra, Diwali, ...; lunar dates are approximate). Schools break in summer
  and briefly in winter.
- **Climate.** Summers reach 40°C and above with heatwave days before the monsoon; nine-tenths of the rain falls
  from late June to September; winter mornings are foggy. No snow, no typhoons.
- **Speech.** Scenes are written in English with the odd natural Hindi or Urdu word (ji, beta, arre, yaar).

Tests: `frontend/tests/cities.test.ts`.

## Adding another city

1. Add it to `CITIES` in `cities.ts` (identity, places, calendar, climate, phrase table).
2. Write its cast (same slots, new ids with their own prefix) and its storylines; register both in
   `initial-city.ts` and `storyteller.ts`.
3. Give it a `Theme`, and any landmark builders it needs.
4. Add `ART` rows to the exporter, build the models, list them in `public/characters/manifest.json`, and add
   wardrobe rows.
5. `cities.test.ts` checks every city in `CITY_LIST` for a complete, self-consistent cast and set of cases.
