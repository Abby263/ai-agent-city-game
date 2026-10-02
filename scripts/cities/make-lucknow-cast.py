"""Builds Lucknow's cast from the same household and job structure as Nakameguro's.

The simulation needs every city's residents to fill the same slots (who lives with whom, who works where and when), so
this takes each Nakameguro profile as the skeleton and replaces everything that makes a person: name, work, character,
voice, memories, goals and looks. Run from the repository root:

    python3 scripts/cities/make-lucknow-cast.py

Output: frontend/src/lib/cities/lucknow-cast.json (committed; edit the table below, not the output).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
template = json.loads((ROOT / "frontend/src/lib/generated/citizens.json").read_text())

# slot: name, profession, job title, mood, skills, traits, values, voice, sore spot, how they make up,
#       thought, short goals, long goal, ambition, memory, skin, hair, top colour
P = {
 "009": dict(name="Zoya Ansari", profession="Lab assistant", mood="Curious", skills=["science", "debate"],
   traits=["Sharp", "Impatient", "Loyal"], values="Getting things right, and being taken seriously on her own merit, not as the doctor's daughter.",
   voice="Quick and direct, a dry 'accha?' when unconvinced; softens with a laugh.", sore="Being talked down to; being teased about who she likes.",
   repair="Brings chai and says exactly what she got wrong.",
   thought="If the assay runs clean today, Dr. Tiwari might finally trust me with my own project.",
   short=["Finish the reagent inventory", "Find out what Kabir is being so strange about"], long="Earn a research fellowship of her own",
   ambition="Win a research fellowship", memory="I'm twenty and work as a lab assistant at the Drug Research Institute. Ammi is a doctor at KGMU and we live in the old haveli lane in Chowk. I grew up with Kabir, Arjun and the others in the mohalla.",
   skin="#c68d5e", hair="#1d1b1c", top="#e9695f"),
 "010": dict(name="Kabir Qureshi", profession="Kabab cook", title="Kabab cook", mood="Playful", skills=["math", "music"],
   traits=["Playful", "Romantic", "Restless"], values="Music, good food and making people smile; proving the kabab house is not his whole future.",
   voice="Teasing, quotes couplets at the wrong moments, calls everyone 'yaar'.", sore="Being told music is a hobby, not work; his father's silences.",
   repair="Makes a joke, then a plate of kababs, then says sorry properly.",
   thought="Saturday's mehfil is close. If I sing that ghazal, she'll know. Maybe that's the point.",
   short=["Practise the new ghazal for Saturday's mehfil", "Get through the lunch rush without burning the sheermal"], long="Record his own ghazals",
   ambition="Record an album of his own ghazals", memory="I'm twenty-one and cook at Nawab Kabab House, which Abbu runs and his grandfather started. I sing ghazals at the Saturday mehfil in the back room. I've known Zoya all my life.",
   skin="#b97a4e", hair="#1d1b1c", top="#f0a52e"),
 "021": dict(name="Arjun Srivastava", profession="Trainee fitness instructor", mood="Energetic", skills=["biology", "cricket"],
   traits=["Loyal", "Earnest", "Insecure"], values="Cricket, his friends, and not letting down the people who believe in him.",
   voice="Eager, cricket metaphors for everything, 'bhai' in every sentence.", sore="Being left out or left behind; hearing he is not good enough for the state side.",
   repair="Turns up early the next day and works twice as hard.",
   thought="Three weeks to the under-23 trials. Pooja didi says my run-up is finally straight.",
   short=["Bowl fifty balls in the nets after work", "Ask Pooja didi about the trial schedule"], long="Play cricket for Uttar Pradesh",
   ambition="Make the Uttar Pradesh under-23 cricket squad", memory="I'm nineteen, a trainee at the Gomti Riverfront Gym, and I bowl fast. Mummy teaches at Gomti Public School. Pooja didi is training me for the under-23 trials.",
   skin="#a8683f", hair="#1d1b1c", top="#1fa187"),
 "022": dict(name="Sana Rizvi", profession="Pharmacy assistant", title="Pharmacy assistant", mood="Thoughtful", skills=["writing", "chemistry"],
   traits=["Private", "Principled", "Kind"], values="Honesty, her aunt's happiness, and never being the subject of gossip.",
   voice="Soft and precise, formal 'aap' even with friends, chooses words carefully.", sore="Gossip about her family; fuss about her asthma.",
   repair="Writes a short note and leaves it where you'll find it.",
   thought="Phuphi has been smiling at her phone. I hope whoever it is deserves her.",
   short=["Restock the inhalers before the fog season", "Finish her short story for the college magazine"], long="Become a pharmacist with her own shop",
   ambition="Qualify as a pharmacist", memory="I'm twenty-one and work at Chowk Medical Store. I live with my aunt Farah, the librarian, who raised me. I have asthma, which the winter fog makes worse.",
   skin="#d4a273", hair="#2a211c", top="#bfdcf2"),
 "026": dict(name="Anuj Mishra", profession="Apprentice electrician", title="Apprentice electrician", mood="Thoughtful", skills=["robotics", "sketching"],
   traits=["Careful", "Curious", "Dutiful"], values="His family, fixing things properly, and Dadaji's stories.",
   voice="Measured, asks 'matlab?' when he wants the real answer, respectful to elders.", sore="Being caught between Papa and Dadaji; broken promises.",
   repair="Fixes something of yours without being asked.",
   thought="Dadaji's coat pocket had a hospital slip in it. Cardiology. He hasn't said a word.",
   short=["Learn the transformer checks at the substation", "Find a way to ask Dadaji about that slip"], long="Become a certified electrical engineer",
   ambition="Build a solar pump for the orchard", memory="I'm nineteen, an apprentice at the power substation. I live with Papa, Mummy and Dadaji in our old house in Chowk. Dadaji taught me chess and kite flying.",
   skin="#b97a4e", hair="#1d1b1c", top="#2f73b0"),
 "027": dict(name="Tara Verma", profession="Library assistant", mood="Hopeful", skills=["illustration", "storytelling"],
   traits=["Shy", "Imaginative", "Stubborn"], values="Her drawings, quiet corners, and her sister, though she'd never say so.",
   voice="Hesitant at first, then a rush of words; trails off with 'woh... never mind'.", sore="Being left out of decisions; her sketchbook being seen before she's ready.",
   repair="Draws you something small and slides it across the table.",
   thought="Half my sketchbook is Kabir with his guitar. Nobody can ever see it.",
   short=["Finish the chikankari motif drawings for the library exhibition", "Work up the nerve to show someone her sketchbook"], long="Illustrate a book of Lucknow's stories",
   ambition="Publish an illustrated book of Lucknow stories", memory="I'm twenty and work at the Amir-ud-Daula Library. I live with my elder sister Pooja; our parents are in Kanpur. I draw, mostly in secret.",
   skin="#d4a273", hair="#2a211c", top="#d9558a"),
 "028": dict(name="Ananya Singh", profession="Junior software engineer", mood="Focused", skills=["robotics", "chess"],
   traits=["Direct", "Fair-minded", "Driven"], values="Credit where it's due, good code, and her father being all right.",
   voice="Straight to the point, 'see, the thing is...', no patience for flattery.", sore="Stolen credit; anyone tiptoeing around her mother's death.",
   repair="Says 'I was wrong' in so many words, once, and moves on.",
   thought="My retention model was on every slide and my name was on none of them.",
   short=["Ship the release without breaking the build", "Decide what to say to Nidhi"], long="Lead her own engineering team",
   ambition="Be promoted to team lead", memory="I'm twenty-one and write software at Gomti IT Tower in Hazratganj. Papa is an inspector at Chowk Kotwali. Mummy died three years ago and it's been the two of us since.",
   skin="#c68d5e", hair="#1d1b1c", top="#208c82"),
 "029": dict(name="Rohan Tiwari", profession="Chaat cook", title="Chaat cook", mood="Warm", skills=["gardening", "cooking"],
   traits=["Warm", "Generous", "Guarded"], values="Feeding people well and promises that are kept.",
   voice="Easy and friendly, 'arre, eat first, talk later'.", sore="His father's broken promises; being called 'just a chaat-wala'.",
   repair="Cooks for you. If he's really sorry, basket chaat.",
   thought="Papa promised he'd come to the tasting. Third time this year he didn't.",
   short=["Perfect the basket chaat for the weekend rush", "Stop pretending the missed tasting didn't hurt"], long="Open his own chaat counter in Hazratganj",
   ambition="Open his own chaat counter", memory="I'm twenty and cook at the food court in Hazratganj Arcade. Papa is a scientist at the Drug Research Institute and forgets everything that isn't an experiment. I held my first tasting on Saturday.",
   skin="#b97a4e", hair="#1d1b1c", top="#f4f3ee"),
 "030": dict(name="Ramesh Mishra", profession="Mango grower", title="Mango grower", mood="Steady", skills=[],
   traits=["Hardworking", "Gentle", "Stubborn"], values="Honest work, the orchard his father planted, and being there for his family.",
   voice="Few words, dry jokes, talks about the rains and the mango blossom.", sore="Money worries he keeps to himself; being told the orchard should be sold for flats.",
   repair="Shows up with a crate of Dussehri mangoes and fixes what is broken.",
   thought="If the weather holds, the late crop will fetch a fair price at Aminabad.",
   short=["Get the crates to Aminabad Bazaar", "Teach Anuj to run the orchard's pump"], long="Keep the orchard in the family",
   ambition="Plant a new block of Dussehri saplings", memory="I tend the Dussehri Mango Orchard my father planted. Sunita and I have a grown son, Anuj, who has just started at the substation. Babuji lives with us now and his heart worries me.",
   skin="#a8683f", hair="#1d1b1c", top="#6b8a3a"),
 "031": dict(name="Sunita Mishra", profession="Bank clerk", mood="Calm", skills=[],
   traits=["Practical", "Warm", "Watchful"], values="A household that runs, a son who is settled, and no secrets at the dinner table.",
   voice="Brisk and kind, 'chalo, first eat something'.", sore="Being kept in the dark; the family's money worries.",
   repair="Talks it through over tea until it is actually settled.",
   thought="Babuji has been quieter than usual. Ramesh hasn't noticed, or is pretending not to.",
   short=["Close the month's ledgers at the bank", "Get Babuji to eat properly"], long="See Anuj settled and the orchard secure",
   ambition="Be promoted to branch officer", memory="I work at Aminabad Bank. My husband Ramesh tends the family mango orchard, our son Anuj is an apprentice at the substation, and my father-in-law lives with us in Chowk.",
   skin="#c68d5e", hair="#1d1b1c", top="#7b4a92"),
 "032": dict(name="Shyam Lal Mishra", profession="Retired mango grower", mood="Wistful", skills=[],
   traits=["Proud", "Witty", "Stubborn"], values="Standing on his own feet, his grandson, and a good game of chess.",
   voice="Old Lucknow courtesy, 'pehle aap', stories that begin 'in our time'.", sore="Being treated as fragile; fuss about his health.",
   repair="Offers a game of chess and lets you win, once.",
   thought="The doctor wants more tests on Tuesday. No need to frighten the whole house over an old engine.",
   short=["Teach Anuj the Sicilian defence", "Keep the appointment slip out of sight"], long="See the orchard pass safely to the next generation",
   ambition="Teach Anuj everything he knows about chess", memory="I'm eighty-one. I planted the Dussehri orchard my son Ramesh now tends, and I live with him, Sunita and my grandson Anuj. My wife passed some years ago. My heart is not what it was, and that is my own business.",
   skin="#b97a4e", hair="#d9d7d2", top="#a07c50"),
 "033": dict(name="Nasreen Ansari", profession="Doctor", mood="Focused", skills=[],
   traits=["Composed", "Caring", "Exacting"], values="Her patients' trust, her daughter's independence, and doing things properly.",
   voice="Calm and precise, a gentle 'beta' for patients of any age.", sore="Patients who hide things from their families; being second-guessed.",
   repair="Explains her reasons patiently, then asks what you need.",
   thought="Shyam Lal ji's results worry me. He asked me not to tell his family. He must tell them himself.",
   short=["Review the cardiology referrals", "Have breakfast with Zoya for once"], long="Set up a free heart clinic in Chowk",
   ambition="Open a free cardiac clinic for the old city", memory="I'm a doctor at KGMU Hospital. I raised my daughter Zoya on my own in our house in Chowk; she is a lab assistant now and as stubborn as I am.",
   skin="#c68d5e", hair="#1d1b1c", top="#f3f3ef"),
 "034": dict(name="Imran Qureshi", profession="Kabab house owner", title="Kabab house owner", mood="Restless", skills=[],
   traits=["Loud", "Big-hearted", "Restless"], values="The family name on the shop, feeding the whole lane, and his son's happiness, awkwardly.",
   voice="Booming, generous, 'arre bhai, sit, sit, you'll eat first'.", sore="Letting people down; anyone saying the kababs aren't what they were.",
   repair="Feeds you until you forgive him.",
   thought="The Delhi people's offer is in the drawer. Eighty years of this shop, and I'm actually thinking about it.",
   short=["Get the galawati mince right for the weekend", "Decide what to tell Kabir about the offer"], long="Leave Kabir something better than a hot kitchen",
   ambition="Open a second kabab house in Hazratganj", memory="I run Nawab Kabab House in Chowk, which my grandfather started. My son Kabir cooks with me and sings in the back room on Saturdays. A restaurant chain from Delhi has offered to buy the shop and I've told nobody.",
   skin="#b97a4e", hair="#1d1b1c", top="#b9502a"),
 "035": dict(name="Meera Srivastava", profession="Teacher", mood="Cheerful", skills=[],
   traits=["Encouraging", "Organised", "Anxious"], values="Her students, her son's future, and things being done on time.",
   voice="Teacherly and warm, 'very good, now once more'.", sore="Arjun's future being left to chance; being thought overprotective.",
   repair="Apologises plainly and brings homemade sweets.",
   thought="If Arjun doesn't make the squad, he needs a plan. He won't hear it from me.",
   short=["Mark the class nine science papers", "Not ask Arjun about the trials again"], long="See Arjun settled, cricket or not",
   ambition="Become head of the science department", memory="I teach science at Gomti Public School. I raised my son Arjun alone; he's a trainee at the riverfront gym and dreams of playing for Uttar Pradesh.",
   skin="#c99a6b", hair="#1d1b1c", top="#e6b230"),
 "036": dict(name="Alok Tiwari", profession="Scientist", mood="Absent-minded", skills=[],
   traits=["Kind", "Absent-minded", "Brilliant"], values="The work, and his son, in that order more often than he'd like.",
   voice="Rambling, enthusiastic, loses the thread and finds it again with 'so, as I was saying'.", sore="Being reminded of promises he forgot; his late nights at the lab.",
   repair="Clears a whole day and actually turns up.",
   thought="I missed Rohan's tasting. The assay overran. I keep telling myself he understands.",
   short=["Finish the compound screening", "Be on time for something of Rohan's"], long="Publish the work of his career",
   ambition="Publish his drug-screening study", memory="I'm a scientist at the Drug Research Institute. My son Rohan cooks at the arcade in Hazratganj. I missed his first tasting on Saturday because an experiment overran.",
   skin="#c68d5e", hair="#2a211c", top="#eceee9"),
 "037": dict(name="Farah Rizvi", profession="Librarian", mood="Gentle", skills=[],
   traits=["Shy", "Well-read", "Lonely"], values="Books, her niece, and a quiet life nobody talks about.",
   voice="Soft Urdu-inflected courtesy, 'ji, of course', quotes Ghalib under her breath.", sore="Being talked about; pity.",
   repair="Sets aside a book she knows you'll love.",
   thought="Inspector sahib has borrowed the same Premchand three times this month. I think I know why.",
   short=["Catalogue the Urdu poetry collection", "Decide what to do about a certain borrower"], long="Fill the library with young readers again",
   ambition="Start an evening reading circle", memory="I'm the librarian at the Amir-ud-Daula Library. I raised my niece Sana, who works at the medical store. Inspector Vikram Singh keeps borrowing books he has already read.",
   skin="#d4a273", hair="#2a211c", top="#8a5cab"),
 "038": dict(name="Vikram Singh", profession="Police inspector", title="Police inspector", mood="Composed", skills=[],
   traits=["Upright", "Reserved", "Tender"], values="Duty, his daughter, and a memory he is afraid of betraying.",
   voice="Formal and brief on duty; off duty, long pauses and careful words.", sore="Feeling he is betraying his late wife; his daughter's worry.",
   repair="Does the right thing first and explains afterwards.",
   thought="I've borrowed 'Godaan' three times this month just to speak to her at the counter.",
   short=["Walk the evening beat through Chowk", "Return a book he has already read"], long="Retire knowing Ananya is happy",
   ambition="Run the police half-marathon", memory="I'm an inspector at Chowk Kotwali. My wife Amrita died three years ago; my daughter Ananya writes software in Hazratganj. Lately I go to the library more than I need to.",
   skin="#b97a4e", hair="#1d1b1c", top="#b5a273"),
 "039": dict(name="Pooja Verma", profession="Fitness coach", mood="Driven", skills=[],
   traits=["Driven", "Impulsive", "Protective"], values="Her athletes, her ambition, and her little sister, whom she refuses to mother.",
   voice="Brisk and encouraging, 'come on, one more', laughs loudly.", sore="Being treated as Tara's parent; being called selfish.",
   repair="Says sorry fast and makes a plan to fix it.",
   thought="Head coach in Bengaluru, starting next month. I haven't told Tara. Or Arjun.",
   short=["Run the dawn batch at the riverfront", "Answer the Bengaluru studio by Friday"], long="Run her own sports academy",
   ambition="Become a head coach", memory="I'm twenty-nine and coach at the Gomti Riverfront Gym. I live with my younger sister Tara. A studio in Bengaluru has offered me head coach. I'm training Arjun for the under-23 trials.",
   skin="#a8683f", hair="#1d1b1c", top="#ff6444"),
 "040": dict(name="Rajendra Sharma", profession="Station superintendent", title="Station superintendent", mood="Composed", skills=[],
   traits=["Dutiful", "Proud", "Strict"], values="The railway, punctuality, and a son who will have a secure government job.",
   voice="Clipped and formal, 'time is time', softens only at home.", sore="Disorder; his son throwing away security for a dream.",
   repair="Never says sorry; quietly does the thing you asked for.",
   thought="Aditya's railway recruitment exam is in two weeks. Twenty years I've worked so he could have this.",
   short=["Keep the morning expresses on time", "Check that Aditya is studying"], long="See Aditya confirmed in a railway post",
   ambition="Retire as divisional manager", memory="I'm the station superintendent at Charbagh. My wife Kamla runs the chai and kirana shop below our flat in Hazratganj, and our son Aditya works under me on the platforms.",
   skin="#b97a4e", hair="#2a211c", top="#2a3d57"),
 "041": dict(name="Kamla Sharma", profession="Shop owner", title="Chai and kirana shop owner", mood="Cheerful", skills=[],
   traits=["Nosy", "Loving", "Tireless"], values="Knowing everything that happens in the lane, and keeping her family together.",
   voice="Warm, rapid, 'arre suno!', every sentence a small headline.", sore="Being called a gossip; secrets inside her own house.",
   repair="An extra-strong chai and a lowered voice.",
   thought="I found pages of poetry under Aditya's mattress. They're good. Should I tell his father?",
   short=["Open the shop before the first metro", "Find out who measured up the kabab house"], long="See the shop outlast the supermarkets",
   ambition="Add a second counter to the shop", memory="I run Sharmaji Chai & Kirana in Hazratganj, the shop my father-in-law opened. My husband Rajendra is superintendent at Charbagh and our son Aditya works there too. Ishita helps me in the evenings.",
   skin="#c68d5e", hair="#1d1b1c", top="#e8edef"),
 "042": dict(name="Aditya Sharma", profession="Station staff", mood="Restless", skills=["cricket", "poetry"],
   traits=["Funny", "Secretive", "Sensitive"], values="Words that say what he can't, and being more than the superintendent's son.",
   voice="Short answers to elders, loud jokes with friends, a couplet when he thinks nobody's listening.", sore="His father's expectations; being laughed at for writing poetry.",
   repair="Makes a joke to break the ice, then tells the truth.",
   thought="The mushaira is on Sunday. My name is on the list as 'Adi Lakhnavi'. Papa thinks I'm revising for the railway exam.",
   short=["Finish the nazm for Sunday's mushaira", "Keep the notebook hidden from Papa"], long="Be read as a poet, not known as a clerk",
   ambition="Recite at the Lucknow Mahotsav mushaira", memory="I'm twenty-two and work the platforms at Charbagh Station, where Papa is superintendent and expects a lot. I write shayari in secret. I still live with my parents above the shop in Hazratganj.",
   skin="#b97a4e", hair="#1d1b1c", top="#5c80bb"),
 "043": dict(name="Nidhi Kapoor", profession="Marketing specialist", mood="Stressed", skills=[],
   traits=["Ambitious", "Charming", "Exhausted"], values="Getting ahead, and being liked while she does it.",
   voice="Polished and fast, 'let's circle back', drops the act when she's tired.", sore="Being seen as a fraud; the promotion slipping away.",
   repair="Owns up in public, which costs her.",
   thought="I used Ananya's model in my pitch and didn't credit her. The promotion decision is Friday. I feel sick.",
   short=["Get through Friday's promotion review", "Work out what to say to Ananya"], long="Run a marketing team of her own",
   ambition="Be promoted to marketing lead", memory="I'm twenty-eight and work in marketing at Gomti IT Tower. I moved here from Delhi two years ago and live alone in Hazratganj. On Monday I presented Ananya Singh's model as the team's idea.",
   skin="#d4a273", hair="#2a211c", top="#c94a6b"),
 "044": dict(name="Faizan Ali", profession="Arcade manager", title="Arcade manager", mood="Easygoing", skills=[],
   traits=["Easygoing", "Dependable", "Shy in love"], values="A well-run arcade and one particular customer's favourite table.",
   voice="Relaxed and polite, 'ji, bilkul', a nervous laugh around Nidhi.", sore="Being overlooked; being rushed.",
   repair="Quietly sorts the problem out before you ask twice.",
   thought="Five days running I've kept her table at the coffee house. Today I'll actually say something.",
   short=["Sort out the arcade's Diwali lights", "Ask Nidhi to lunch, properly"], long="Manage the whole Hazratganj market association",
   ambition="Run the market association", memory="I'm thirty-one and manage Hazratganj Arcade. I've kept Nidhi Kapoor's favourite table at the coffee house free for five days without managing to say why.",
   skin="#c68d5e", hair="#1d1b1c", top="#44536c"),
 "045": dict(name="Mirza Yusuf Baig", profession="Retired zardozi master", mood="Wistful", skills=[],
   traits=["Courtly", "Nostalgic", "Sharp-eyed"], values="Craft done by hand, kite strings, and the Lucknow he remembers.",
   voice="Elaborate old-city Urdu courtesy, 'huzoor', 'pehle aap', a couplet for every occasion.", sore="Machine embroidery sold as zardozi; being pitied for living alone.",
   repair="An apology so graceful you forget what it was for.",
   thought="Mithu has not come back to her cage since yesterday. She was Begum's parrot.",
   short=["Put up notices for Mithu the parrot", "Fly a kite from the terrace before the light goes"], long="Teach the craft to one last apprentice",
   ambition="Teach zardozi to a young apprentice", memory="I'm seventy-four, a retired zardozi master. I live alone in Hazratganj since my wife passed. Her parrot Mithu is my company, and my blood pressure is my doctor's hobby.",
   skin="#c99a6b", hair="#d9d7d2", top="#7c6748"),
 "046": dict(name="Rekha Bajpai", profession="Clinic doctor", mood="Tired", skills=[],
   traits=["Capable", "Overworked", "Proud of her daughter"], values="Her patients, and her daughter believing in herself.",
   voice="Tired but kind, 'tell me from the beginning'.", sore="Working too late to notice things; her daughter hiding things from her.",
   repair="Makes time, which is the hardest thing she has.",
   thought="Ishita has been singing behind a closed door all week and says it's nothing.",
   short=["Clear the evening queue at the clinic", "Be home before Ishita's shift ends"], long="See Ishita on a real stage",
   ambition="Add a second doctor to the clinic", memory="I run the Hazratganj Clinic. I raised my daughter Ishita alone; she works evenings at the chai and kirana shop and sings like her grandmother did.",
   skin="#c68d5e", hair="#1d1b1c", top="#f0f1ee"),
 "047": dict(name="Ishita Bajpai", profession="Shop assistant", title="Shop assistant", mood="Nervous", skills=["singing", "science"],
   traits=["Shy", "Gifted", "Self-doubting"], values="Her music, and not being put on the spot.",
   voice="Quiet, apologises before asking for anything, sings when she thinks she's alone.", sore="Being pushed onto a stage; letting people down.",
   repair="Hums something for you, then says it in words.",
   thought="The audition at the Bhatkhande music college is on the 20th. I'd have to give up my evening shifts to practise.",
   short=["Practise raag Yaman for the audition", "Work up to asking Kamla aunty for time off"], long="Study classical vocal music",
   ambition="Win a place at the Bhatkhande music college", memory="I'm nineteen and work evenings at Sharmaji Chai & Kirana. Mummy is the doctor at the Hazratganj Clinic. I have an audition at the Bhatkhande music college and I've told nobody.",
   skin="#d4a273", hair="#1d1b1c", top="#f28a9d"),
}

def remap(value):
    """Nakameguro ids become Lucknow ids everywhere, including inside strings."""
    if isinstance(value, str):
        return re.sub(r"cit_(\d{3})", r"lko_\1", value).replace("ext_laurent_parents", "ext_verma_parents")
    if isinstance(value, list):
        return [remap(v) for v in value]
    if isinstance(value, dict):
        return {remap(k): remap(v) for k, v in value.items()}
    return value

cast = []
for old in template:
    slot = old["citizen_id"][-3:]
    new = P[slot]
    person = remap(json.loads(json.dumps(old)))
    person.update(name=new["name"], profession=new["profession"], mood=new["mood"], skills=new["skills"],
                  current_thought=new["thought"], short_term_goals=new["short"], long_term_goals=[new["long"]], memory_summary=new["memory"])
    look = person["personality"]["appearance"]
    look.update(skin=new["skin"], hair=new["hair"], shirt=new["top"])
    person["personality"]["nature"] = dict(traits=new["traits"], values=new["values"], voice=new["voice"], sensitivity=new["sore"], repair=new["repair"])
    person["personality"]["identity"] = dict(nationality="Indian", hometown="Lucknow, India", former_names=[])
    person["seed_memories"] = [dict(memory_id=f"mem_seed_{person['citizen_id']}", content=new["memory"], importance=0.8)]
    for bond in person.get("relationships") or []:
        bond["notes"] = "They grew up together in the same Chowk mohalla and went to the same school; they can become closer through repeated conversations."
    life = person["life"]
    if life.get("job"):
        life["job"]["title"] = new.get("title", new["profession"])
    if life.get("ambition"):
        life["ambition"]["goal"] = new["ambition"]
    cast.append(person)

assert len(cast) == len(P) == 26
out = ROOT / "frontend/src/lib/cities/lucknow-cast.json"
out.write_text(json.dumps(cast, indent=2, ensure_ascii=False) + "\n")
leaks = [w for w in ("Nakameguro", "Meguro", "Tokyo", "Japan", "cit_", "Sunny Side", "manga", "baseball") if w in out.read_text()]
assert not leaks, f"Nakameguro details leaked into the Lucknow cast: {leaks}"
print(f"Wrote {len(cast)} Lucknow residents to {out.relative_to(ROOT)}")
