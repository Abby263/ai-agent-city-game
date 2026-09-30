import { appearanceFor, styleFor, type AppearanceSource } from "@/lib/appearance";

export { citizenPalette } from "@/lib/appearance";

export function CitizenPortrait({
  citizen,
  size = 48,
}: {
  citizen: AppearanceSource & { name: string };
  size?: number;
}) {
  const colors = appearanceFor(citizen);
  const style = styleFor(citizen);
  const long = style.hairstyle === "long" || style.hairstyle === "bob";
  const older = (citizen.age ?? 20) >= 50;
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
      }}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" width="100%" height="100%">
        <rect width="64" height="64" fill={colors.background} />
        <ellipse cx="32" cy="68" rx="26" ry="22" fill={colors.shirt} />
        <path d="M27 39 V49 Q32 54 37 49 V39" fill={colors.skin} />
        {long && <path d={`M18 22 Q13 9 32 8 Q52 9 47 28 L49 ${style.hairstyle === "long" ? 53 : 41} L15 ${style.hairstyle === "long" ? 53 : 41}Z`} fill={colors.hair} />}
        <ellipse cx="18" cy="30" rx="2.5" ry="4" fill={colors.skin} />
        <ellipse cx="46" cy="30" rx="2.5" ry="4" fill={colors.skin} />
        <path d="M18 25 Q17 11 32 11 Q47 11 46 25 L44 36 Q40 46 32 47 Q23 45 20 36Z" fill={colors.skin} />
        <path d={style.hairstyle === "crop" ? "M18 26 Q12 7 32 8 Q51 7 46 26 L42 17 Q31 20 23 17Z" : "M18 29 Q10 7 33 7 Q52 7 46 29 L41 17 Q35 14 31 19 Q26 24 20 22Z"} fill={colors.hair} />
        {style.hairstyle === "bun" && <circle cx="43" cy="11" r="7" fill={colors.hair} />}
        <g fill="none" stroke={colors.hair} strokeWidth="1.25" strokeLinecap="round"><path d="M23 27 Q26 25 29 27 M35 27 Q38 25 41 27" /></g>
        <path d="M22 31 Q26 27 30 31 M34 31 Q38 27 42 31" fill="#e9e4dc" stroke="#735e50" strokeWidth="0.7" />
        <g fill="#35332d"><ellipse cx="26" cy="30.2" rx="1.7" ry="1.5" /><ellipse cx="38" cy="30.2" rx="1.7" ry="1.5" /></g>
        <path d="M32 30 L30 36 L33 37 M28 40 Q32 42 36 40" fill="none" stroke="#ac7d68" strokeWidth="1" strokeLinecap="round" />
        {older && <path d="M22 34 L27 35 M37 35 L42 34 M25 38 L24 41 M39 38 L40 41" fill="none" stroke="#ac8c78" strokeWidth="0.7" />}
        {style.glasses && <g fill="none" stroke="#41464a" strokeWidth="1.1"><rect x="20" y="27" width="11" height="8" rx="3" /><rect x="33" y="27" width="11" height="8" rx="3" /><path d="M31 30 H33" /></g>}
        {(style.outfit === "coat" || style.outfit === "jacket") && <><path d="M27 49 L32 62 L37 49" fill="#f0efe9" /><path d="M24 48 L22 55 L28 55 L32 64 M40 48 L42 55 L36 55 L32 64" fill="none" stroke="#747c7c" strokeWidth="1" /></>}
        {style.outfit === "apron" && <path d="M24 49 V55 H40 V49 M23 55 H41 V64 H23Z" fill="#687363" stroke="#687363" strokeWidth="2" />}
      </svg>
    </span>
  );
}
