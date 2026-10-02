# Cities

AgentCity has more than one city. The player picks one on first visit (`CityGate.tsx`) and can switch from the
header; each city keeps its own saved world in the browser. Two ship today:

| City | Where | Feel |
|---|---|---|
| Nakameguro | Meguro City, Tokyo | Canal, cherry trees, a shrine, the train on its viaduct |
| Lucknow | Hazratganj and Chowk, Uttar Pradesh | Lime-washed havelis, kabab houses, the Gomti, domes and kites |

## How a city is put together

Every city is the same kind of neighbourhood on the same plots: an old town, a river with two bridges, a downtown
and a rail viaduct, with the same 23 places (`loc_market`, `loc_station`, ...) standing where they always stand.
That shared skeleton is what lets the simulation (routines, jobs, households, cases, the narrator) run unchanged.
The streets between the plots can be a city's own (see Lucknow's street map below). What differs is everything a
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

Built from photographs of Hazratganj, Chowk, Aminabad, Charbagh's forecourt and ordinary residential lanes. What
those have in common, and what the town therefore does (`theme.ts`, `infill.ts`, `terraces.ts`):

- **Its own street map.** `streets.ts` draws the old city: the bazaar road bending from the bridge to the Akbari
  Gate, a second road through Nakhas, two cross streets that never run straight, a gali only wide enough to walk,
  and a chauraha where traffic goes round a railed island with a small domed pavilion. The roads are 5 to 6 m
  between building lines (Nakameguro's are 10 m with pavements). Ground painting, terraces, poles and wires,
  traffic and street vendors all read the same map; Hazratganj keeps its broad, straight colonial roads.
- **No lawns, few road markings.** Open ground is bare dusty earth; roads are worn, patched asphalt from one
  building line to the other, their edges crumbling into dust. Only the park is green; only Hazratganj has
  pavements, zebra crossings, railings, bollards and cast-iron lamp posts with globes.
- **Built wall to wall.** `infill.ts` fills the road frontages and the blocks behind them with attached two- to
  four-storey buildings around the places the game uses: a shop below (shutter down, or open with goods spilling
  out, under a painted Hindi or English board), homes above with balconies hung over the road, white railings,
  washing, air conditioners, bare-brick party walls, a black water tank on every roof and the odd rooftop hoarding.
  Behind the streets the same houses line narrow lanes, with steel gates instead of shops. Hazratganj's are cream
  colonial terraces with round-arched arcades, a balustrade and uniform black-and-white boards.
- **No spare ground.** The blocks are packed in several passes: rows facing their lane, rows standing back to back
  with those, houses side-on, then single-room-deep ones in whatever strip is left. The park and the orchard are
  smaller than Nakameguro's, and the bazaar is rows of stalls, vendors and carts with one aisle through. Every
  place and front door keeps a brick lane to the nearest street, routed round the buildings.
- **Walled plots.** Anything left open to the road has a compound wall (brick or plaster, with painted notices)
  or iron railings, with a gap wherever people need to get in.
- **Homes.** Most families live in a three-storey house in a lane like their neighbours'; two old families keep
  havelis with arched doors and a jharokha.
- **Street life.** The roadside is a market: vendors under umbrellas, fruit carts, rows of parked scooters,
  waiting cycle rickshaws and autos, heaps of sand, cows. Cloth banners hang across the road. Traffic is mostly
  autos and e-rickshaws. Every pole feeds a dozen houses by its own drooping cable.

The terraces and walls join the building list, so people walk round them and cameras stay out of them;
every place and front door keeps a brick lane to the nearest street. `tests/lucknow-streets.test.ts` checks that
nothing overlaps or stands in a road, that every place and front door can still be reached, that each road can be
walked end to end, and that traffic stays on the roads and goes round the island.

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
