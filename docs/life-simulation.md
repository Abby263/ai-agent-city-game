# Life Simulation

Nakameguro's residents live whole lives. One city day is one day of life: everyone ages a day at midnight,
and birthdays arrive on the right date. The engine is `frontend/src/lib/life.ts`; routines are in
`frontend/src/lib/routine.ts`. Random events use a seeded roll per day and person, so a world replays
the same way and tests are deterministic.

## Who Lives Here

26 residents, all 18 or older, live across family houses and apartments. Ten younger adults have first jobs:

| Resident | Age | Job |
| --- | --- | --- |
| Ava | 20 | Lab assistant |
| Mateo | 21 | Barista at his father's cafe |
| Noah | 19 | Trainee gym instructor |
| Iris | 21 | Pharmacy technician |
| Leo | 19 | Apprentice technician |
| Sophie | 20 | Library assistant |
| Zara | 22 | Junior software engineer |
| Eliot | 20 | Food-court cook |
| Haruto | 22 | Station staff alongside his father |
| Sakura | 19 | Konbini clerk |

| Household | Residents |
| --- | --- |
| Willow House | Tom (farmer), Hannah (bank clerk), Walter (82, heart condition), Leo |
| Clover House | Priya (doctor), Ava |
| Rose House | Carlos (cafe owner), Mateo |
| Sage House | Grace (teacher), Noah |
| Birch House | Wei (scientist), Eliot |
| Maple House | Elena (librarian, Iris's aunt), Iris (asthma) |
| Poppy House | Samir (police officer, widower), Zara |
| Fern House | Maya (gym coach, Sophie's big sister), Sophie |

Profiles live in `backend/app/citizens/profiles/*.yaml` under a `life:` block with dates relative to day 1.
The adult-cast release uses a new `agentcity.v12` save namespace. Previous worlds are not imported: old
ages, conversations and memories must not contradict the new biographies. Within v12, newly enabled
profiles can still join without clearing learned memories. `life.family_roles` records relatives such as
Iris's aunt Elena explicitly, so family labels survive adulthood and moving house.

## Systems

| System | What happens |
| --- | --- |
| Age | One day at midnight; birthdays with a cafe party and eventual senior milestones. |
| Body | Height, weight and fitness. Weight follows a slowly moving set point nudged by meals and workouts; fitness fades to a walking baseline without the gym. |
| Feelings | Joy, sadness, anger and worry decay toward a baseline and feed happiness and stress. Loneliness rises when alone and falls with family or friends. |
| Work and money | Adults work shifts for an hourly wage (after 25% tax). Monday: adults share household rent and groceries; seniors get a pension. Low savings bring money worries. |
| Hobbies | Under-30s pursue their skills after work and on days off, around gym visits and errands. Sakura practises piano at Sunny Side Cafe, not school. |
| Health | Colds, flu and stomach bugs spread within households, classrooms and workplaces. The sick go to the pharmacy or hospital; a doctor on shift treats them. Chronic conditions (heart condition, asthma) need medicine every week. Bodies heal slowly, and never above an age-based cap. |
| Love and family | Adults who grow close in conversation start dating, may get engaged and marry in the park, then move in together. Pregnancy and births are disabled by `BIRTHS_ENABLED = false`; the implementation remains available for a future release. Hannah is not pregnant. |
| Death and grief | Death risk rises with age, severe chronic illness or very low health. Family and friends grieve, and a memorial is held in the park two days later. Children and teenagers can become seriously ill but do not die: a deliberate choice for a game that families play. |
| Ambitions | Each resident has a goal (study, fitness, money, career, creative, social, family) that progresses with what they actually do. Career goals end in promotions. |

Legacy child development and school routines are not active gameplay for the shipped adult cast.
Child-safety guards remain covered using explicit test fixtures. All active parent-child age gaps are at least 20 years.

## In The Game

- **Citizens → Life** shows age and birthday, height, weight and BMI, feelings, job, ambition progress, health and a clickable family tree.
- **News** is the Nakameguro Daily: birthdays, illnesses, recoveries, love, promotions, upcoming parties and memorials, and an "In loving memory" section.
- **Nameplates** show the current activity, and 3D bodies follow real height and build. Elders have grey hair and walk slower.
- **Speed** can run at 4x to watch life unfold faster.
