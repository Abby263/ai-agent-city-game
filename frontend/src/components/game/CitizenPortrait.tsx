import { appearanceFor, type AppearanceSource } from "@/lib/appearance";

export { citizenPalette } from "@/lib/appearance";

export function CitizenPortrait({
  citizen,
  size = 48,
}: {
  citizen: AppearanceSource & { name: string };
  size?: number;
}) {
  const colors = appearanceFor(citizen);
  const index = ["cit_009", "cit_010", "cit_021", "cit_022", "cit_026"].indexOf(
    citizen.citizen_id,
  );
  return (
    <span
      role="img"
      aria-label={citizen.name}
      className="citizen-portrait"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: colors.background,
        backgroundImage: index >= 0 ? 'url("/art/citizens.png")' : undefined,
        backgroundSize: "500% auto",
        backgroundPosition: `${Math.max(0, index) * 25}% 28%`,
      }}
    >
      {index < 0 ? <svg viewBox="0 0 64 64" aria-hidden="true" width="100%" height="100%">
        <rect width="64" height="64" fill={colors.background} />
        <ellipse cx="32" cy="62" rx="25" ry="21" fill={colors.shirt} />
        <rect x="27" y="39" width="10" height="12" rx="4" fill={colors.skin} />
        <ellipse cx="32" cy="26" rx="19" ry="22" fill={colors.hair} />
        <ellipse cx="32" cy="29" rx="15" ry="18" fill={colors.skin} />
        <path d="M15 25 Q12 3 34 6 Q53 6 49 24 Q40 13 35 16 Q23 22 15 25Z" fill={colors.hair} />
        <ellipse cx="25" cy="30" rx="2" ry="3" fill="#292e38" />
        <ellipse cx="39" cy="30" rx="2" ry="3" fill="#292e38" />
        <path d="M27 39 Q32 43 37 39" fill="none" stroke="#9c5b54" strokeWidth="1.5" strokeLinecap="round" />
        {citizen.citizen_id === "cit_028" && <circle cx="48" cy="13" r="8" fill={colors.hair} />}
        {citizen.citizen_id === "cit_027" && <path d="M15 23 L14 46 L21 43 L20 26 M49 22 L50 45 L43 44 L44 26" fill={colors.hair} />}
        {citizen.citizen_id === "cit_029" && <g fill="none" stroke="#514d51" strokeWidth="1.5"><circle cx="25" cy="30" r="6" /><circle cx="39" cy="30" r="6" /><path d="M31 30 L33 30" /></g>}
      </svg> : null}
    </span>
  );
}
