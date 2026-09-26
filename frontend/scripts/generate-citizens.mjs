import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const directory = fileURLToPath(
  new URL("../../backend/app/citizens/profiles/", import.meta.url),
);
const ids = new Set();
const profiles = readdirSync(directory)
  .filter((name) => name.endsWith(".yaml"))
  .sort()
  .map((name) => {
    const profile = YAML.parse(readFileSync(`${directory}/${name}`, "utf8"));
    if (
      !profile.citizen_id ||
      !profile.name ||
      !profile.profession ||
      !Array.isArray(profile.position) ||
      profile.position.length !== 2
    )
      throw new Error(`Invalid citizen profile: ${name}`);
    if (ids.has(profile.citizen_id))
      throw new Error(`Duplicate citizen: ${profile.citizen_id}`);
    if (
      !profile.position.every(
        (coordinate) =>
          Number.isInteger(coordinate) && coordinate >= 0 && coordinate < 92,
      )
    )
      throw new Error(`Invalid map position: ${name}`);
    ids.add(profile.citizen_id);
    return profile;
  })
  .filter((profile) => profile.active === true);
if (profiles.length === 0)
  throw new Error("At least one citizen must be active.");
const output = new URL("../src/lib/generated/", import.meta.url);
mkdirSync(output, { recursive: true });
writeFileSync(
  new URL("citizens.json", output),
  `${JSON.stringify(profiles, null, 2)}\n`,
);
console.log(`Generated ${profiles.length} citizens from YAML profiles.`);
