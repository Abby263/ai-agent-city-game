import type { CitizenAgent } from "./types";

export type Palette = { shirt: string; skin: string; hair: string; background: string };
export type ResidentStyle = {
  hairstyle: "crop" | "parted" | "bob" | "long" | "bun";
  outfit: "casual" | "jacket" | "apron" | "coat";
  trousers: string;
  shoes: string;
  glasses: boolean;
};

/** Shared by the map and portraits, with profile-owned wardrobe rather than ID-specific costumes. */
export function styleFor(citizen: AppearanceSource): ResidentStyle {
  const custom = citizen.personality?.appearance as Partial<ResidentStyle> | undefined;
  return {
    hairstyle: custom?.hairstyle ?? "parted",
    outfit: custom?.outfit ?? "casual",
    trousers: custom?.trousers ?? "#41484e",
    shoes: custom?.shoes ?? "#eeeeea",
    glasses: custom?.glasses ?? false,
  };
}

export const citizenPalette: Record<string, Palette> = {
  cit_027: { shirt: "#d86f96", skin: "#edb898", hair: "#5d3630", background: "#f2d9e4" },
  cit_028: { shirt: "#4b9b99", skin: "#b97953", hair: "#292830", background: "#d6ebe6" },
  cit_029: { shirt: "#ce9d46", skin: "#e5b38c", hair: "#302e32", background: "#efe4c8" },
  cit_009: { shirt: "#e57d72", skin: "#bd815f", hair: "#362f31", background: "#efe1af" },
  cit_010: { shirt: "#f4b64c", skin: "#d7a07b", hair: "#493b31", background: "#f4d4ce" },
  cit_021: { shirt: "#6ebcaa", skin: "#83533d", hair: "#252728", background: "#c4e0d4" },
  cit_022: { shirt: "#a9a2d8", skin: "#f0c5a9", hair: "#865340", background: "#e0dcec" },
  cit_026: { shirt: "#75a9cd", skin: "#eac09c", hair: "#9d713c", background: "#d4e5ee" },
};

const skins = ["#f0c5a9", "#e5b38c", "#c9956f", "#a86e4a", "#83533d"];
const hairs = ["#2b2a2f", "#493b31", "#865340", "#c49a5c", "#5d3630"];
const shirts = ["#e57d72", "#75a9cd", "#6ebcaa", "#ce9d46", "#a9a2d8", "#d86f96"];

function hashed(id: string): Palette {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { skin: skins[h % skins.length], hair: hairs[(h >>> 3) % hairs.length], shirt: shirts[(h >>> 6) % shirts.length], background: "#e8ebe4" };
}

export type AppearanceSource = Pick<CitizenAgent, "citizen_id"> & Partial<Pick<CitizenAgent, "personality" | "age">>;

/** Profile colours first, then the classic cast, then a stable generated look; hair greys with age. */
export function appearanceFor(citizen: AppearanceSource): Palette {
  const custom = citizen.personality?.appearance as Partial<Palette> | undefined;
  const base = { ...hashed(citizen.citizen_id), ...citizenPalette[citizen.citizen_id], ...custom };
  if ((citizen.age ?? 0) >= 70 && !custom?.hair) base.hair = "#d9d7d2";
  return base;
}
