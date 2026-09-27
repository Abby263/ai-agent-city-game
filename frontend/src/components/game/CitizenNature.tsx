import { citizenNature } from "@/lib/nature";
import type { CitizenAgent } from "@/lib/types";

export function CitizenNature({ citizen }: { citizen: CitizenAgent }) {
  const nature = citizenNature(citizen);
  if (!nature) return null;
  return <section className="citizen-nature" aria-label="Personality">
    <h4>At heart</h4>
    <div className="nature-traits">{nature.traits.map((trait) => <span key={trait}>{trait}</span>)}</div>
    <p>{nature.values}</p>
    <details><summary>What makes {citizen.name.split(" ")[0]} tick</summary>
      <dl><dt>Voice</dt><dd>{nature.voice}</dd><dt>Sensitive to</dt><dd>{nature.sensitivity}</dd><dt>Making amends</dt><dd>{nature.repair}</dd></dl>
    </details>
  </section>;
}
