# Life Simulation

Nakameguro's residents live whole lives. One city day is one day of life: everyone ages a day at midnight,
and birthdays arrive on the right date. The engine is `frontend/src/lib/life.ts`; routines are in
`frontend/src/lib/routine.ts`. Random events use a seeded roll per day and person, so a world replays
the same way and tests are deterministic.

## Who Lives Here

18 residents in eight houses: 8 students aged 12-15, their parents and guardians, and grandfather Walter.

| Household | Residents |
| --- | --- |
| Willow House | Tom (farmer), Hannah (bank clerk, due on day 12), Walter (82, heart condition), Leo |
| Clover House | Priya (doctor), Ava |
| Rose House | Carlos (cafe owner), Mateo |
| Sage House | Grace (teacher), Noah |
| Birch House | Wei (scientist), Eliot |
| Maple House | Elena (librarian, Iris's aunt), Iris (asthma) |
| Poppy House | Samir (police officer, widower), Zara |
| Fern House | Maya (gym coach, Sophie's big sister), Sophie |

Profiles live in `backend/app/citizens/profiles/*.yaml` under a `life:` block with dates relative to day 1.
Older saves are migrated automatically: new residents move in, and existing residents gain families and bodies.

## Systems

| System | What happens |
| --- | --- |
| Age and growth | Age in days; birthdays with a party (park for kids, cafe for adults); baby → child → teen → adult → senior milestones; children grow taller. |
| Body | Height, weight and fitness. Weight follows a slowly moving set point nudged by meals and workouts; fitness fades to a walking baseline without the gym. |
| Feelings | Joy, sadness, anger and worry decay toward a baseline and feed happiness and stress. Loneliness rises when alone and falls with family or friends. |
| Work and money | Adults work shifts for an hourly wage (after 25% tax). Monday: rent, groceries and pocket money from parents; seniors get a pension. Low savings bring money worries. |
| School | Grades drift toward each student's usual level, dragged down by exhaustion, stress or illness; library time slowly raises it. Report cards every Saturday. |
| Health | Colds, flu and stomach bugs spread within households, classrooms and workplaces. The sick go to the pharmacy or hospital; a doctor on shift treats them. Chronic conditions (heart condition, asthma) need medicine every week. Bodies heal slowly, and never above an age-based cap. |
| Love and family | Adults who grow close in conversation start dating, may get engaged and marry in the park, then move in together. Couples who want children may conceive; a pregnancy lasts 280 days and ends with a birth at the hospital. Babies follow a caregiver and are fed by family. Children never date. |
| Death and grief | Death risk rises with age, severe chronic illness or very low health. Family and friends grieve, and a memorial is held in the park two days later. Children and teenagers can become seriously ill but do not die: a deliberate choice for a game that families play. |
| Ambitions | Each resident has a goal (study, fitness, money, career, creative, social, family) that progresses with what they actually do. Career goals end in promotions. |

A year-long headless run (AI stubbed out) gives about three illnesses per person, realistic weight
and savings, weekly report cards, and one natural death.

## In The Game

- **Citizens → Life** shows age and birthday, height, weight and BMI, feelings, job or grades, ambition progress, health, pregnancy and a clickable family tree.
- **News** is the Nakameguro Daily: births, birthdays, illnesses, recoveries, love, promotions, report cards, upcoming parties and memorials, and an "In loving memory" section.
- **Nameplates** show the current activity, and 3D bodies follow real height and build. Elders have grey hair and walk slower; a pregnancy shows.
- **Speed** can run at 4x to watch life unfold faster.
