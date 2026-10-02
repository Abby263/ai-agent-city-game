// HeadTTS (the narrator's open-source voice) is a browser module with its own web worker, loaded at run time
// rather than bundled. This copies it from node_modules to public/vendor/headtts, where the game fetches it only
// when a player's device can run it.
//
// TalkingHead (the narrator's avatar) is bundled, but it loads its text-to-lips modules by a computed name, which
// the bundler cannot follow. The game never uses those (the voice supplies its own mouth shapes), so a copy with
// that one import removed goes to src/vendor/talkinghead.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/@met4citizen/headtts"), to = join(root, "public/vendor/headtts");
rmSync(to, { recursive: true, force: true });
mkdirSync(join(to, "dictionaries"), { recursive: true });
for (const file of ["headtts.mjs", "worker-tts.mjs", "language.mjs", "language-en-us.mjs", "utils.mjs"]) cpSync(join(from, "modules", file), join(to, "modules", file));
cpSync(join(from, "dictionaries/en-us.txt"), join(to, "dictionaries/en-us.txt"));
cpSync(join(from, "LICENSE"), join(to, "LICENSE"));
console.log("HeadTTS copied to public/vendor/headtts");

const head = join(root, "node_modules/@met4citizen/talkinghead"), vendor = join(root, "src/vendor/talkinghead");
rmSync(vendor, { recursive: true, force: true });
mkdirSync(vendor, { recursive: true });
for (const file of ["dynamicbones.mjs", "playback-worklet.js"]) cpSync(join(head, "modules", file), join(vendor, file));
cpSync(join(head, "LICENSE"), join(vendor, "LICENSE"));
const source = readFileSync(join(head, "modules/talkinghead.mjs"), "utf8");
const patched = source.replace("import(moduleName).then(", "new Promise(() => {}).then(");
if (patched === source) throw new Error("TalkingHead changed: the dynamic lip-sync import was not found.");
writeFileSync(join(vendor, "talkinghead.mjs"), patched);
console.log("TalkingHead copied to src/vendor/talkinghead");
