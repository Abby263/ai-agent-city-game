// A glanceable picture of what someone is doing, shown on their map nameplate.
const icons: Array<[RegExp, string]> = [
  [/sleep/i, "💤"],
  [/talk|conversation|chat|approaching|meet/i, "💬"],
  [/campaign|election|vote/i, "🗳️"],
  [/walk|going|heading|travel/i, "🚶"],
  [/hospital|medical|recover/i, "🩺"],
  [/experiment|lab|robot/i, "🔬"],
  [/comic|draw|sketch/i, "🎨"],
  [/stor(y|ies)|writ/i, "✍️"],
  [/chess|puzzle/i, "♟️"],
  [/piano/i, "🎹"],
  [/baseball/i, "⚾"],
  [/manga|comic/i, "🎨"],
  [/music/i, "🎵"],
  [/shrine|prayer/i, "⛩️"],
  [/evacuat|shelter/i, "🆘"],
  [/snowman/i, "⛄"],
  [/mall|shopping/i, "🛍️"],
  [/station|train/i, "🚉"],
  [/football|ball/i, "⚽"],
  [/pond|creature/i, "🐸"],
  [/crop|farm|garden/i, "🌱"],
  [/kitchen|cook/i, "🍳"],
  [/market|buying|shop/i, "🛒"],
  [/breakfast|lunch|dinner|meal|food|cafe/i, "🍽️"],
  [/school|class|exam|study|library/i, "📚"],
  [/park|fun|hang/i, "🌳"],
  [/rest|home/i, "🏠"],
  [/task|thinking/i, "💭"],
];

export function activityIcon(activity: string) {
  return icons.find(([pattern]) => pattern.test(activity))?.[1] ?? "✨";
}
