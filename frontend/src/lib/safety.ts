// Player-written text is checked before it reaches any AI model. Keep these rules in sync with
// backend/app/safety.py, which re-checks every request so the browser check cannot be bypassed.
// This is a first line of defence for a game played by all ages, not a replacement for provider moderation.

export type SafetyCategory = "personal_info" | "link" | "unkind_language" | "wellbeing";
export type SafetyResult = { ok: true } | { ok: false; category: SafetyCategory; message: string };

export const safetyMessages: Record<SafetyCategory, string> = {
  personal_info:
    "Keep it safe: please don't share real phone numbers, emails, addresses or passwords in AgentCity. Try again without them.",
  link: "Links can't be shared in AgentCity. Describe it in your own words instead.",
  unkind_language:
    "That message has words that aren't allowed in AgentCity. Try saying it in a kinder way.",
  wellbeing:
    "It sounds like something might be really hard right now. Please talk to a parent, teacher or another adult you trust. If you are in danger, contact your local emergency number. AgentCity's residents are AI characters and can't help with real-life problems.",
};

const personalInfo = [
  /[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
  /(?:\+?\d[\s().-]*){7,}/,
  /\b\d{1,5}\s+(?:[a-z]+\s+){1,2}(?:street|st|avenue|ave|road|rd|lane|drive|boulevard|blvd|court)\b/i,
  /\b(?:my|our)\s+(?:home\s+|house\s+|real\s+)?address\s+is\b/i,
  /\bi\s+live\s+(?:at|on)\s+\d/i,
  /\bmy\s+(?:phone|cell|mobile)(?:\s+number)?\s+is\b/i,
  /\bmy\s+password\b/i,
];
const link = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|gg|xyz)\b/i;
const profanity = /\b(?:f+u+c+k\w*|sh[i1]t\w*|b[i1]tch\w*|bastard\w*|a+ss+h+o+l+e\w*|dick(?:head)?s?|cunt\w*|slut\w*|wh[o0]re\w*)\b/;
const abuse = /\b(?:retard\w*|fag\w*|nigg\w*|kys|kill\s+your\s*self|go\s+die)\b/;
const wellbeing =
  /\b(?:kill(?:ing)?\s+my\s*self|want\s+to\s+die|wanna\s+die|end\s+my\s+life|hurt(?:ing)?\s+my\s*self|suicid\w*|self[\s-]?harm\w*|cut(?:ting)?\s+my\s*self)\b/;

// Undo the most common filter-dodging tricks before matching words.
function normalizeWords(text: string) {
  return text
    .toLowerCase()
    .replace(/[0@4$31]/g, (c) => ({ "0": "o", "@": "a", "4": "a", $: "s", "3": "e", "1": "i" })[c] ?? c)
    .replace(/(.)\1{2,}/g, "$1")
    .replace(/[*_.-]/g, "");
}

export function checkPlayerText(text: string): SafetyResult {
  const raw = text.trim();
  const words = normalizeWords(raw);
  const fail = (category: SafetyCategory): SafetyResult => ({ ok: false, category, message: safetyMessages[category] });
  if (wellbeing.test(words) || wellbeing.test(raw.toLowerCase())) return fail("wellbeing");
  if (personalInfo.some((pattern) => pattern.test(raw))) return fail("personal_info");
  if (link.test(raw)) return fail("link");
  const lowered = raw.toLowerCase();
  if (abuse.test(words) || abuse.test(lowered)) return fail("unkind_language");
  if (profanity.test(words) || profanity.test(lowered)) return fail("unkind_language");
  return { ok: true };
}

export function assertPlayerTextSafe(text: string) {
  const result = checkPlayerText(text);
  if (!result.ok) throw new Error(result.message);
}
