// The storyteller: interlocking storylines for the cast, so the town always has something about to happen.
// Each storyline plants private secrets and feelings once, then plays out as scenes between two residents:
// the director brings them together and the AI plays the moment. Outcomes stay theirs (a proposal can be
// turned down). Town-wide incidents give everyone something to talk about between scenes.

import { onCityChange } from "./cities";
import { LUCKNOW_CASE_ORDER, LUCKNOW_INCIDENTS, LUCKNOW_STORYLINES } from "./cities/lucknow-stories";

export type Seed = {
  who: string;
  memory: string;
  /** Feelings this resident already has toward someone when the story starts. */
  feels?: { toward: string; affection?: number; resentment?: number; jealousy?: number; admiration?: number };
};

export type Beat = {
  actor: string;
  target: string;
  /** Narrator's teaser for the feed: what's about to happen. */
  headline: string;
  /** The actor's own intention, in their words. */
  reason: string;
  topic: string;
  /** What's at stake, for the scene's writer. Only what both could see or the actor is about to say. */
  stakes: string;
  /** Things the actor (or others) learn just before this scene, e.g. a rumour that reached them. */
  prelude?: Seed[];
  /** A real question the target answers yes or no. */
  proposal?: "date";
};

/**
 * Each storyline is also a case for the player, the neighbourhood's fixer: a goal, what they know going in, and
 * how it reads when it ends well or badly.
 */
export type Storyline = { id: string; title: string; icon: string; goal: string; brief: string; well: string; badly: string; seeds: Seed[]; beats: Beat[] };

const AOI = "cit_009", REN = "cit_010", RIKU = "cit_021", MIO = "cit_022", SOTA = "cit_026", HANA = "cit_027", RIN = "cit_028",
  KAITO = "cit_029", TAKASHI = "cit_030", MASAO = "cit_032", KAORI = "cit_033", DAISUKE = "cit_034", KEIKO = "cit_035",
  NAOKI = "cit_036", YUKA = "cit_037", TAKESHI = "cit_038", NATSUMI = "cit_039", KENJI = "cit_040", AIKO = "cit_041",
  HARUTO = "cit_042", YUI = "cit_043", DAICHI = "cit_044", HIROSHI = "cit_045", EMI = "cit_046", SAKURA = "cit_047";

const NAKAMEGURO_STORYLINES: Storyline[] = [
  {
    id: "ren_song", title: "The song about someone", icon: "🎸",
    goal: "Get Ren and Aoi on a date.",
    brief: "Ren wrote a song about Aoi and has never told her. Shy Hana has a crush on Ren.",
    well: "Ren told Aoi the truth, and she said yes.",
    badly: "Ren laid his heart on the line, and Aoi turned him down.",
    seeds: [
      { who: REN, memory: "I wrote a song called 'Ninety-Nine Degrees' about Aoi Takahashi. I've never told her, or anyone. I'm playing it at my gig at Sunny Side Cafe on Saturday.", feels: { toward: AOI, affection: 45 } },
      { who: HANA, memory: "I have a crush on Ren Ishikawa from Sunny Side Cafe. I've filled half a sketchbook with drawings of him playing guitar. Nobody knows.", feels: { toward: REN, affection: 40 } },
    ],
    beats: [
      { actor: REN, target: AOI, headline: "🎸 Ren is working up the nerve to invite Aoi to his gig", reason: "I want to invite Aoi to my gig on Saturday without giving away that the new song is about her.",
        topic: "Ren's gig at the cafe on Saturday", stakes: "Ren is nervous and joking too much; he really wants Aoi to come to his gig on Saturday." },
      { actor: HANA, target: REN, headline: "✏️ Shy Hana is about to show Ren a drawing she made of him", reason: "I want to give Ren the comic page I drew of him playing guitar, before I lose my nerve.",
        topic: "a drawing Hana made", stakes: "Hana is painfully shy about her art; handing Ren a drawing of him is a huge step for her." },
      { actor: AOI, target: REN, headline: "👀 Aoi heard Ren's new song is about 'a girl from the lab' and wants answers",
        prelude: [{ who: AOI, memory: "Sakura told me Ren's new song is about a girl who works at the science lab. I'm the only girl at the lab." }],
        reason: "Someone told me Ren's new song is about a girl from the lab. I want to know if it's me, without looking foolish.", topic: "who Ren's new song is about",
        stakes: "Aoi is direct and impatient; Ren jokes when he's cornered." },
      { actor: REN, target: AOI, headline: "💘 Ren is going to tell Aoi the truth about the song", reason: "No more jokes. I'm going to tell Aoi the song is about her, and ask her out.",
        topic: "the song, and how Ren feels", stakes: "Ren is laying his feelings on the line. Aoi can say yes, no, or that she needs time.", proposal: "date" },
    ],
  },
  {
    id: "library_books", title: "Books he's already read", icon: "📚",
    goal: "Get Officer Abe and Yuka to the festival together.",
    brief: "Takeshi, a widower, keeps borrowing books he's already read just to see Yuka the librarian. His daughter Rin has noticed.",
    well: "Yuka and Takeshi are going to the festival together.",
    badly: "Yuka and Takeshi couldn't find the courage. The festival will come and go.",
    seeds: [
      { who: TAKESHI, memory: "I've borrowed 'The Wind-Up Bird Chronicle' three times this month just to talk to Yuka at the library. Part of me feels I'm betraying Amira.", feels: { toward: YUKA, affection: 40 } },
      { who: YUKA, memory: "Takeshi Abe keeps borrowing books he has already read. I think it might be because of me, and I don't know what to do with that.", feels: { toward: TAKESHI, affection: 35 } },
      { who: RIN, memory: "Dad has been going to the library almost every day. He hums now. Something's going on and he won't say." },
    ],
    beats: [
      { actor: TAKESHI, target: YUKA, headline: "📚 Officer Abe is at the library again, with a book he's already read", reason: "I'm returning the same book again. Today I'll try to ask Yuka to the shrine's autumn festival.",
        topic: "the book, and the autumn festival", stakes: "Takeshi is a widower who hasn't asked anyone out in twenty years; Yuka is shy and lonely." },
      { actor: RIN, target: TAKESHI, headline: "🕵️ Rin has worked out why her dad keeps going to the library", reason: "I've worked out Dad goes to the library for Yuka. I need to know if he's moving on from Mum, and whether I'm okay with that.",
        topic: "Dad and the librarian", stakes: "Rin lost her mother three years ago. She's direct, but this is raw for both of them." },
      { actor: MIO, target: YUKA, headline: "🤐 Mio overheard gossip about her aunt and Officer Abe",
        prelude: [{ who: MIO, memory: "At HappyMart, Aiko was telling everyone Officer Abe is sweet on Aunt Yuka. I hate gossip, but I hate seeing Yuka lonely more." }],
        reason: "Aiko is gossiping about Aunt Yuka and Officer Abe. I want Yuka to hear it from me, kindly, and to tell her she deserves to be happy.", topic: "the gossip about Yuka and Takeshi",
        stakes: "Mio is private and principled; Yuka hates being talked about." },
      { actor: YUKA, target: TAKESHI, headline: "💌 Yuka has an answer for Officer Abe", reason: "I'm going to stop hiding behind the counter and ask Takeshi to go to the festival with me, as a date.",
        topic: "the autumn festival, together", stakes: "Two shy, lonely adults trying to be brave.", proposal: "date" },
    ],
  },
  {
    id: "haruto_manga", title: "Last Train", icon: "🎌",
    goal: "Get Haruto to tell his father about the manga, without breaking them apart.",
    brief: "Haruto has secretly entered a manga contest. His father Kenji, the station master, thinks he is studying to take over the station.",
    well: "Kenji knows about the manga, and father and son are still talking.",
    badly: "The truth came out, and it drove Haruto and his father apart.",
    seeds: [
      { who: HARUTO, memory: "I entered my manga 'Last Train' in the Shonen Spark newcomer contest; the deadline is Sunday. Dad thinks I'm studying for the station supervisor exam. If he finds out, he'll explode." },
      { who: KENJI, memory: "Haruto's station supervisor exam is in two weeks. He'll run the station one day; I've worked twenty years for that." },
      { who: AIKO, memory: "I found manga pages hidden under Haruto's futon. They're actually good. Should I tell Kenji? Haruto would never forgive me." },
    ],
    beats: [
      { actor: AIKO, target: HARUTO, headline: "📒 Aiko found something hidden under Haruto's futon", reason: "I found Haruto's manga pages. I want him to tell me the truth himself before Kenji finds out.",
        topic: "the manga pages", stakes: "Aiko is nosy but loving; Haruto is secretive and terrified of his dad finding out." },
      { actor: HARUTO, target: HANA, headline: "✍️ Haruto secretly asks Hana to look at his manga", reason: "Hana draws comics. I want her honest opinion on my manga before Sunday's deadline, and I need her to keep it secret.",
        topic: "Haruto's manga for the contest", stakes: "Haruto has never shown anyone his drawings; Hana is shy about her own art." },
      { actor: KENJI, target: HARUTO, headline: "🚉 The station master knows Haruto skipped exam prep again",
        prelude: [{ who: KENJI, memory: "Haruto skipped the exam study group again. The instructor called me. Something is going on and I'm going to get to the bottom of it." }],
        reason: "Haruto skipped exam prep again. I want an explanation, now.", topic: "the supervisor exam",
        stakes: "Kenji is dutiful and proud; Haruto is torn between his father and his dream. It can get heated." },
      { actor: HARUTO, target: KENJI, headline: "🎌 Haruto is going to tell his dad about the manga", reason: "I'm going to show Dad my manga and tell him I don't want to be station master.",
        topic: "Haruto's manga and his future", stakes: "This could break them or bring them closer." },
    ],
  },
  {
    id: "cafe_sale", title: "For sale?", icon: "☕",
    goal: "Get Daisuke to come clean about selling the cafe, and keep his friends.",
    brief: "Daisuke is quietly thinking of selling Sunny Side Cafe, where his son Ren plays his music. He has told nobody.",
    well: "Daisuke told the truth about the cafe, and nobody walked away.",
    badly: "The cafe secret came out badly, and it cost Daisuke a friend.",
    seeds: [
      { who: DAISUKE, memory: "An estate agent valued Sunny Side Cafe yesterday. If I sell, I can buy the food truck outright. I haven't told Ren; the cafe is where he plays his music." },
      { who: AIKO, memory: "I saw an estate agent with a tape measure at Sunny Side Cafe this morning. Daisuke wouldn't sell... would he?" },
    ],
    beats: [
      { actor: AIKO, target: REN, headline: "🏷️ Aiko saw an estate agent measuring Sunny Side Cafe", reason: "I saw an estate agent at the cafe. Ren deserves to know, even if it's not my business.",
        topic: "the estate agent at the cafe", stakes: "Aiko loves news; Ren knows nothing about it." },
      { actor: REN, target: DAISUKE, headline: "☕ Ren confronts his dad: is the cafe for sale?", reason: "Aiko says an estate agent measured the cafe. I need Dad to tell me the truth. That's where I play.",
        topic: "selling the cafe", stakes: "Daisuke is loud and restless and kept this from his son; Ren feels betrayed. It can get heated." },
      { actor: DAISUKE, target: TAKASHI, headline: "🍜 Daisuke owes Takashi the truth about the cafe", reason: "If I sell the cafe, Takashi loses his best customer for the garden's produce. I owe him the truth.",
        topic: "the cafe sale and the garden's orders", stakes: "Takashi keeps his money worries to himself; Daisuke hates letting people down." },
    ],
  },
  {
    id: "masao_heart", title: "Grandpa's appointment card", icon: "🫀",
    goal: "Get Masao to let his family help.",
    brief: "Grandpa Masao is hiding heart tests from his family. His grandson Sota has found the appointment card.",
    well: "Masao let his family in. He will not face the tests alone.",
    badly: "Masao shut his family out. He is facing the tests alone.",
    seeds: [
      { who: MASAO, memory: "Dr. Takahashi wants me back for heart tests next Tuesday. I've told nobody. I won't be the old man everyone tiptoes around." },
      { who: SOTA, memory: "I found Grandpa's hospital appointment card in his coat pocket. Cardiology, next Tuesday. He hasn't said a word to any of us." },
      { who: KAORI, memory: "Masao Watanabe's heart results worry me. He asked me not to tell his family; I have to respect that, but I want him to tell them." },
    ],
    beats: [
      { actor: SOTA, target: MASAO, headline: "🫀 Sota found a cardiology appointment card in Grandpa's coat", reason: "I found Grandpa's heart appointment card. I want him to tell me what's going on.",
        topic: "Grandpa's appointment", stakes: "Masao is proud and hates being treated as fragile; Sota is cautious and loves him." },
      { actor: KAORI, target: MASAO, headline: "🩺 Dr. Takahashi wants Masao to tell his family", reason: "Masao's results worry me. I want to persuade him to tell his family before Tuesday.",
        topic: "telling his family about the tests", stakes: "Doctor and patient; she can't break his confidence, and he's stubborn." },
      { actor: SOTA, target: TAKASHI, headline: "😟 Sota can't keep Grandpa's secret any longer", reason: "Grandpa made me promise not to tell, but Dad needs to know about the heart tests.",
        topic: "Grandpa's heart tests", stakes: "Sota is breaking a promise; Takashi keeps his worries to himself." },
      { actor: TAKASHI, target: MASAO, headline: "👨‍🌾 Takashi confronts his father about the heart tests", reason: "Dad hid his heart tests from us. I'm angry and scared, and I'm not leaving until he lets us help.",
        topic: "the heart tests", stakes: "Two stubborn farmers who love each other; both are proud and hurt." },
    ],
  },
  {
    id: "natsumi_osaka", title: "The Osaka offer", icon: "🏋️",
    goal: "Help Natsumi decide about Osaka without leaving anyone behind.",
    brief: "Natsumi has been offered her dream job in Osaka. She has not told her sister Hana, or Riku, who is counting on her.",
    well: "Natsumi made her choice, and the people who count on her are still on her side.",
    badly: "Natsumi made her choice, and someone who counted on her feels abandoned.",
    seeds: [
      { who: NATSUMI, memory: "A studio in Osaka has offered me head coach, starting next month. It's my dream job. I haven't told Hana, or Riku, who's counting on me for his tryout." },
      { who: RIKU, memory: "Natsumi is training me for the Meguro football club tryout in three weeks. She's the only coach who's ever believed in me.", feels: { toward: NATSUMI, admiration: 45 } },
    ],
    beats: [
      { actor: HANA, target: NATSUMI, headline: "📦 Hana found an Osaka moving quote on the kitchen table",
        prelude: [{ who: HANA, memory: "I found a moving company quote for Osaka on our kitchen table. Natsumi hasn't said anything. Is she leaving me?" }],
        reason: "Natsumi is planning to move to Osaka without telling me. I want the truth.", topic: "the Osaka moving quote",
        stakes: "Sisters: Natsumi hates being treated as Hana's parent; Hana hates being left out of decisions." },
      { actor: RIKU, target: NATSUMI, headline: "⚽ Riku hears his coach might leave before his tryout",
        prelude: [{ who: RIKU, memory: "Hana let it slip that Natsumi might move to Osaka next month, before my tryout." }],
        reason: "Natsumi might leave before my tryout and she didn't tell me. I feel left out again.", topic: "Natsumi leaving for Osaka",
        stakes: "Riku is loyal and insecure about being left out; Natsumi is impulsive and driven." },
      { actor: NATSUMI, target: RIKU, headline: "🏋️ Natsumi has made her decision about Osaka", reason: "I've decided about Osaka. Riku deserves to hear it from me first, with a plan for his tryout either way.",
        topic: "Natsumi's decision", stakes: "Natsumi is choosing between her dream and the people counting on her." },
    ],
  },
  {
    id: "stolen_credit", title: "Whose idea was it?", icon: "💼",
    goal: "Get Yui to make it right with Rin.",
    brief: "Yui presented Rin's work as her own, days before a promotion decision. Daichi, meanwhile, is trying to ask Yui to lunch.",
    well: "Yui owned up, and Rin can work with her again.",
    badly: "Yui and Rin are finished as colleagues who trust each other.",
    seeds: [
      { who: RIN, memory: "In Monday's meeting Yui Sato presented my user-retention model as 'our team's idea'. My name wasn't on a single slide.", feels: { toward: YUI, resentment: 40 } },
      { who: YUI, memory: "I used Rin Abe's model in my pitch without crediting her. I panicked; the promotion decision is Friday. I feel sick about it." },
      { who: DAICHI, memory: "I've saved Yui's favourite table at the food court five days in a row. Today I'll actually say something to her.", feels: { toward: YUI, affection: 40 } },
    ],
    beats: [
      { actor: RIN, target: YUI, headline: "💼 Rin is about to confront Yui about stolen credit", reason: "Yui presented my model as hers. I'm going to say it to her face, calmly but clearly.",
        topic: "who built the retention model", stakes: "Rin is direct and fair-minded and hates stolen credit; Yui is ambitious and exhausted. Neither makes nice too fast." },
      { actor: DAICHI, target: YUI, headline: "🍱 Daichi saved Yui's table again; today he'll say something", reason: "I'm finally going to ask Yui to lunch, properly.",
        topic: "lunch, finally", stakes: "Yui is having an awful week; Daichi is easygoing and nervous." },
      { actor: YUI, target: RIN, headline: "🙇 Yui has to decide whether to own up before Friday", reason: "Before Friday's promotion decision, I have to tell Rin the truth and decide whether to credit her publicly.",
        topic: "the pitch and the promotion", stakes: "Yui's promotion is on the line." },
    ],
  },
  {
    id: "kaito_promise", title: "The third broken promise", icon: "🍳",
    goal: "Mend things between Kaito and his dad.",
    brief: "Dr. Ito has broken three promises to his son Kaito this year. Kaito has stopped pretending it is fine.",
    well: "Kaito is giving his dad one more chance, and this time Dr. Ito means it.",
    badly: "Kaito has heard it all before. He does not believe his dad any more.",
    seeds: [
      { who: KAITO, memory: "Dad promised to come to my first community-kitchen tasting on Saturday. He didn't show. Third broken promise this year.", feels: { toward: NAOKI, resentment: 35 } },
      { who: NAOKI, memory: "I missed Kaito's tasting; the experiment overran. I keep telling myself he understands." },
    ],
    beats: [
      { actor: KAITO, target: NAOKI, headline: "🍳 Kaito is done pretending his dad's broken promises don't hurt", reason: "Dad missed my tasting. I'm done pretending it's fine; he needs to hear it.",
        topic: "the missed tasting", stakes: "Kaito is warm but has boundaries; Naoki is kind and absent-minded." },
      { actor: NAOKI, target: AOI, headline: "🔬 Dr. Ito asks Aoi to cover for him so he can make it up to Kaito", reason: "I need Aoi to run Saturday's assay so I can finally be there for Kaito.",
        topic: "covering Saturday's assay", stakes: "Aoi wants to impress Dr. Ito, but it's her weekend too." },
      { actor: NAOKI, target: KAITO, headline: "🍲 Dr. Ito is trying to make it right with his son", reason: "I cleared my Saturday. I want to tell Kaito I'll be at the next tasting, and mean it this time.",
        topic: "the next tasting", stakes: "Kaito may not believe him yet." },
    ],
  },
  {
    id: "sakura_audition", title: "The audition", icon: "🎹",
    goal: "Get Sakura onto a stage before her audition.",
    brief: "Sakura has an audition at the Tokyo conservatory and has told no one, not even her mum.",
    well: "Sakura has people behind her, and a stage to play on before the audition.",
    badly: "Sakura is facing the audition feeling more alone than before.",
    seeds: [
      { who: SAKURA, memory: "I've got an audition at the Tokyo conservatory on the 20th. I'd have to drop my HappyMart evening shifts to practise. I haven't told Mum or Aiko." },
    ],
    beats: [
      { actor: SAKURA, target: AIKO, headline: "🎹 Sakura has to ask her boss for time off", reason: "I have to ask Aiko to drop my evening shifts for the audition, and she's already short-staffed.",
        topic: "Sakura's shifts", stakes: "Sakura is shy and hates being put on the spot; Aiko depends on her." },
      { actor: EMI, target: SAKURA, headline: "✉️ Emi found the conservatory letter in Sakura's bag",
        prelude: [{ who: EMI, memory: "I found a letter from the Tokyo conservatory in Sakura's bag: an audition on the 20th. Why didn't she tell me?" }],
        reason: "Sakura has a conservatory audition and didn't tell me. I want to know why she hid it.", topic: "the audition letter",
        stakes: "Mother and daughter; Emi works late and worries Sakura doesn't believe in herself." },
      { actor: REN, target: SAKURA, headline: "🎶 Ren wants Sakura to play piano at his gig", reason: "I heard Sakura plays piano beautifully. I want her to play with me on Saturday: a stage before her audition.",
        topic: "playing together on Saturday", stakes: "Sakura is shy; Ren is playful and persuasive." },
    ],
  },
];

export type Incident = { id: string; headline: string; memory: string; who: string[] | "everyone" };

/** Things that happen to the whole town, giving everyone something to talk about. */
const NAKAMEGURO_INCIDENTS: Incident[] = [
  { id: "festival", headline: "🏮 Hikawa Shrine announces its autumn festival for Saturday evening", who: "everyone",
    memory: "The shrine's autumn festival is on Saturday evening: lanterns, food stalls and fireworks over the river. Everyone's talking about who they'll go with." },
  { id: "open_mic", headline: "🎤 Sunny Side Cafe puts up a poster for Saturday's open mic", who: [REN, SAKURA, HANA, AOI, HARUTO, DAISUKE],
    memory: "Sunny Side Cafe has a poster up for an open mic on Saturday night, with Ren's name at the top." },
  { id: "power_cut", headline: "⚡ A power cut blacks out the station area for an hour", who: [SOTA, KENJI, HARUTO, AIKO, DAICHI, YUI],
    memory: "The power went out around the station for an hour today. Trains stopped, the HappyMart freezers beeped, and the substation crew were run off their feet." },
  { id: "lost_cat", headline: "🐈 'LOST: Mochi' posters appear all over Aobadai", who: [HIROSHI, HANA, KAITO, YUKA, MASAO],
    memory: "Posters for a lost cat called Mochi are up all over Aobadai. Old Mr. Nakamura is looking for her; she was his late wife's cat." },
  { id: "garden_plan", headline: "📰 The ward newsletter says the community garden may be redeveloped", who: [TAKASHI, MASAO, KAITO, DAISUKE, AIKO],
    memory: "The ward newsletter says Meguro Community Garden is being looked at for redevelopment into flats." },
  { id: "wedding_rumour", headline: "💍 Rumour at HappyMart: someone in Nakameguro is getting married", who: [AIKO, YUI, NATSUMI, KAORI, KEIKO],
    memory: "Aiko swears someone in Nakameguro is about to get engaged. She won't say who, which means she doesn't know." },
];

/** How a scene went for the two people in it. */
export type SceneResult = "well" | "badly" | "mixed";
export type CaseOutcome = "well" | "badly";
/** A word in someone's ear before their next scene. */
export type CaseNudge = { beat: number; who: string; text: string };

/** Cases open in this order, strongest hook first, and a few at a time so the player can follow them. */
const NAKAMEGURO_CASE_ORDER = ["haruto_manga", "ren_song", "masao_heart", "library_books", "stolen_credit", "kaito_promise", "cafe_sale", "natsumi_osaka", "sakura_audition"];

// The storylines, incidents and case order of the city being played. The arrays keep their identity and are
// refilled when the city changes, so every importer always sees the active city's stories.
export const STORYLINES: Storyline[] = [];
export const INCIDENTS: Incident[] = [];
export const CASE_ORDER: string[] = [];
onCityChange((city) => {
  const lucknow = city.id === "lucknow";
  STORYLINES.splice(0, STORYLINES.length, ...(lucknow ? LUCKNOW_STORYLINES : NAKAMEGURO_STORYLINES));
  INCIDENTS.splice(0, INCIDENTS.length, ...(lucknow ? LUCKNOW_INCIDENTS : NAKAMEGURO_INCIDENTS));
  CASE_ORDER.splice(0, CASE_ORDER.length, ...(lucknow ? LUCKNOW_CASE_ORDER : NAKAMEGURO_CASE_ORDER));
});
export const OPEN_CASES = 3;
export const NUDGES_PER_DAY = 3;

/** What has played so far; kept on the city so it survives reloads. */
export type StoryState = {
  progress: Record<string, number>;
  /** When each storyline last moved on, so the director rotates between them. */
  advanced: Record<string, number>;
  last_scene: number;
  last_incident: number;
  incidents: number;
  /** How each played scene of a case went, in order. */
  results: Record<string, SceneResult[]>;
  closed: Record<string, { outcome: CaseOutcome; day: number; minute: number }>;
  nudges: Record<string, CaseNudge[]>;
  nudge_day: number;
  nudges_used: number;
};

export function storyState(policy: Record<string, unknown>): StoryState {
  const raw = (policy.story ?? {}) as Partial<StoryState>;
  return { progress: { ...(raw.progress ?? {}) }, advanced: { ...(raw.advanced ?? {}) }, last_scene: raw.last_scene ?? -1e9,
    last_incident: raw.last_incident ?? -1e9, incidents: raw.incidents ?? 0, results: { ...(raw.results ?? {}) }, closed: { ...(raw.closed ?? {}) },
    nudges: { ...(raw.nudges ?? {}) }, nudge_day: raw.nudge_day ?? 0, nudges_used: raw.nudges_used ?? 0 };
}

const ordered = () => CASE_ORDER.map((id) => STORYLINES.find((s) => s.id === id)).filter((s) => s !== undefined);
export const caseFinished = (state: StoryState, storyline: Storyline) => (state.progress[storyline.id] ?? 0) >= storyline.beats.length;
/** The cases on the player's desk right now. */
export const openCases = (state: StoryState) => ordered().filter((s) => !caseFinished(state, s)).slice(0, OPEN_CASES);
export const closedCases = (state: StoryState) => ordered().filter((s) => caseFinished(state, s));
export const nudgesLeft = (state: StoryState, day: number) => NUDGES_PER_DAY - (state.nudge_day === day ? state.nudges_used : 0);

type Effect = "neutral" | "positive" | "negative" | undefined;
/** A scene went well if it brought them closer, badly if it pushed either away. */
export function sceneResult(effects: Effect[]): SceneResult {
  const hurt = effects.includes("negative"), warmed = effects.includes("positive");
  return hurt && warmed ? "mixed" : hurt ? "badly" : warmed ? "well" : "mixed";
}

/** How a case ends: a proposal's answer decides it; otherwise the last scene, with earlier scenes breaking a tie. */
export function caseOutcome(results: SceneResult[], answer?: "accepted" | "declined"): CaseOutcome {
  if (answer) return answer === "accepted" ? "well" : "badly";
  const last = results.at(-1);
  if (last === "well" || last === "badly") return last;
  return results.filter((r) => r === "well").length >= results.filter((r) => r === "badly").length ? "well" : "badly";
}

/** Minimum game minutes between directed scenes, and between town incidents. */
export const SCENE_GAP = 40;
export const INCIDENT_GAP = 240;

/** Scenes play in the waking day; nobody gets a dramatic confrontation at 3 a.m. */
export const sceneHours = (minuteOfDay: number) => minuteOfDay >= 450 && minuteOfDay < 1320;

/**
 * The next scene the director can stage: open cases least recently advanced first, the next unplayed beat
 * of each, and only if both people can take part right now.
 */
export function nextBeat(state: StoryState, canPlay: (id: string) => boolean) {
  const waiting = openCases(state).sort((a, b) => (state.advanced[a.id] ?? -1e9) - (state.advanced[b.id] ?? -1e9));
  for (const storyline of waiting) {
    const index = state.progress[storyline.id] ?? 0;
    const beat = storyline.beats[index];
    if (beat && canPlay(beat.actor) && canPlay(beat.target)) return { storyline, beat, index };
  }
  return null;
}
