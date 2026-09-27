"""Safety rules for player-written text and model prompts.

AgentCity currently has an adult-only cast and non-explicit content. The browser checks player text before sending it
(frontend/src/lib/safety.ts); the API repeats the same checks so a modified client cannot bypass
them. These patterns are a first line of defence, not a substitute for provider moderation.
"""

from __future__ import annotations

import re
from typing import Literal

SafetyCategory = Literal["personal_info", "link", "unkind_language", "wellbeing"]
SAFETY_MESSAGES: dict[str, str] = {
    "personal_info": (
        "Keep it safe: please don't share real phone numbers, emails, addresses or passwords in Nakameguro. "
        "Try again without them."
    ),
    "link": "Links can't be shared in Nakameguro. Describe it in your own words instead.",
    "unkind_language": "That message has words that aren't allowed in Nakameguro. Try saying it in a kinder way.",
    "wellbeing": (
        "It sounds like something might be really hard right now. Please talk to a parent, teacher or another "
        "adult you trust. If you are in danger, contact your local emergency number. Nakameguro's citizens are AI "
        "characters and can't help with real-life problems."
    ),
}

_PERSONAL_INFO = [
    re.compile(r"[^\s@]+@[^\s@]+\.[a-z]{2,}", re.I),
    re.compile(r"(?:\+?\d[\s().-]*){7,}"),
    re.compile(r"\b\d{1,5}\s+(?:[a-z]+\s+){1,2}(?:street|st|avenue|ave|road|rd|lane|drive|boulevard|blvd|court)\b", re.I),
    re.compile(r"\b(?:my|our)\s+(?:home\s+|house\s+|real\s+)?address\s+is\b", re.I),
    re.compile(r"\bi\s+live\s+(?:at|on)\s+\d", re.I),
    re.compile(r"\bmy\s+(?:phone|cell|mobile)(?:\s+number)?\s+is\b", re.I),
    re.compile(r"\bmy\s+password\b", re.I),
]
_LINK = re.compile(r"\b(?:https?://|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|gg|xyz)\b", re.I)
_PROFANITY = re.compile(r"\b(?:f+u+c+k\w*|sh[i1]t\w*|b[i1]tch\w*|bastard\w*|a+ss+h+o+l+e\w*|dick(?:head)?s?|cunt\w*|slut\w*|wh[o0]re\w*)\b")
# Slurs and telling someone to hurt themselves.
_ABUSE = re.compile(r"\b(?:retard\w*|fag\w*|nigg\w*|kys|kill\s+your\s*self|go\s+die)\b")
_WELLBEING = re.compile(
    r"\b(?:kill(?:ing)?\s+my\s*self|want\s+to\s+die|wanna\s+die|end\s+my\s+life|hurt(?:ing)?\s+my\s*self|"
    r"suicid\w*|self[\s-]?harm\w*|cut(?:ting)?\s+my\s*self)\b"
)
_LEET = str.maketrans({"0": "o", "@": "a", "4": "a", "$": "s", "3": "e", "1": "i"})


def _normalize_words(text: str) -> str:
    text = text.lower().translate(_LEET)
    text = re.sub(r"(.)\1{2,}", r"\1", text)
    return re.sub(r"[*_.-]", "", text)


def check_player_text(text: str) -> SafetyCategory | None:
    """Return the first safety category the text violates, or None when it is fine to send."""
    raw = text.strip()
    words = _normalize_words(raw)
    if _WELLBEING.search(words) or _WELLBEING.search(raw.lower()):
        return "wellbeing"
    if any(pattern.search(raw) for pattern in _PERSONAL_INFO):
        return "personal_info"
    if _LINK.search(raw):
        return "link"
    lowered = raw.lower()
    if _ABUSE.search(words) or _ABUSE.search(lowered):
        return "unkind_language"
    if _PROFANITY.search(words) or _PROFANITY.search(lowered):
        return "unkind_language"
    return None


def unsafe_player_text_message(*texts: str | None) -> str | None:
    for text in texts:
        if text and (category := check_player_text(text)):
            return SAFETY_MESSAGES[category]
    return None


CITIZEN_SAFETY_RULES = (
    "AgentCity's current cast consists entirely of adults aged 18 and over, with distinct jobs, hobbies and personalities. "
    "Do not infantilize residents or invent school attendance, pregnancy or births. Keep dialogue non-explicit. "
    "If children are introduced in a future cast, children and teenagers never have romance, dating or crushes. Adults may date, marry and love each other, "
    "described only warmly and without physical detail; never anything sexual, and never romance between an adult and "
    "anyone under 18. Adults never ask children to keep secrets or to meet alone. "
    "Serious life topics such as illness, hospitals, money worries, grief and death may appear, handled gently, "
    "honestly and hopefully, without graphic or frightening detail. "
    "Never describe graphic violence, weapons instructions, drug use or self-harm. "
    "Do not use slurs or harass the player. Residents can disagree, feel jealous, refuse requests and set boundaries. "
    "Never ask for or repeat real personal details such as full names, ages, schools, addresses, phone numbers, "
    "emails, photos, passwords or locations, and never suggest meeting anyone outside the game. "
    "Never encourage keeping secrets from parents or teachers. "
    "If the player mentions being hurt, unsafe or very sad in real life, stay kind and suggest talking to a "
    "parent, teacher or another trusted adult; do not act as a counsellor. "
    "Residents may argue, push, slap or hit one another when the player makes it happen. Describe such moments "
    "briefly and without graphic detail, show real consequences (pain, hurt feelings, anger, fear, guilt, "
    "apologies, trouble with the police) and never glorify violence. Adults never hurt children. "
    "Allow realistic emotional consequences and repair through honesty, apologising and listening."
)
