import { activeCity } from "@/lib/cities";

// How the active city looks. Both cities share one street grid (two cross streets, a river with two bridges, a
// rail viaduct); the theme decides what stands on it: building names, colours and styles, landmarks, street life,
// trees, the far horizon and the tint of the air. Chosen once, when the town is first built.

export type HomeStyle = "gable" | "haveli";
export type BuildingLook = { name?: string; wall?: number; roof?: number };

export type Theme = {
  city: "nakameguro" | "lucknow";
  homes: HomeStyle;
  /** Arches, domes and roof pavilions on public buildings. */
  mughal: boolean;
  buildings: Record<string, BuildingLook>;
  river: number;
  /** Daytime dust in the air: the sky is mixed towards this colour by this much. */
  haze: { color: number; amount: number };
  grass: number;
  /** What flowering street trees are (their blossom colour is in seasons.ts). */
  blossomTree: "sakura" | "gulmohar";
  train: { body: number; stripe: number };
  stationSign: string;
  busSign: string;
};

const NAKAMEGURO: Theme = {
  city: "nakameguro", homes: "gable", mughal: false, buildings: {}, river: 0x63b0ba, haze: { color: 0xffffff, amount: 0 }, grass: 0x8ebc82,
  blossomTree: "sakura", train: { body: 0xf1f1ec, stripe: 0x3a9a6b }, stationSign: "中目黒 NAKAMEGURO", busSign: "BUS",
};

// Lime-washed old-city walls: cream, ochre, pale pink, sky blue and mint, under flat roofs.
const LUCKNOW: Theme = {
  city: "lucknow", homes: "haveli", mughal: true, river: 0x7fa39a, haze: { color: 0xe6d3b0, amount: 0.22 }, grass: 0x9bb07a,
  blossomTree: "gulmohar", train: { body: 0xe9e6dc, stripe: 0xc8442e }, stationSign: "चारबाग़ CHARBAGH", busSign: "TEMPO",
  buildings: {
    home_a: { name: "Mishra Niwas", wall: 0xf0dcae, roof: 0xd8c9a8 }, home_b: { name: "Ansari Manzil", wall: 0xbfd9e6, roof: 0xd5d0c2 },
    home_c: { name: "Qureshi House", wall: 0xf2c9b4, roof: 0xd9cbb5 }, home_d: { name: "Srivastava Sadan", wall: 0xcfe3c4, roof: 0xd2cdbd },
    home_e: { name: "Tiwari Bhawan", wall: 0xf3e2c0, roof: 0xd8ccb0 }, home_h: { name: "Verma Kutir", wall: 0xe9c7cf, roof: 0xd6cbbd },
    home_f: { name: "Rizvi Manzil", wall: 0xc9e0d6, roof: 0xd4cfc0 }, home_g: { name: "Singh Niwas", wall: 0xf1d6a4, roof: 0xd8caa9 },
    loc_school: { name: "गोमती पब्लिक स्कूल GOMTI PUBLIC SCHOOL", wall: 0xf1e2c2, roof: 0xb8553f },
    loc_hospital: { name: "KGMU HOSPITAL", wall: 0xf0e0b8, roof: 0xc98b4e },
    loc_pharmacy: { name: "चौक मेडिकल STORE", wall: 0xf4f1e6, roof: 0x2f8f5a },
    loc_bank: { name: "अमीनाबाद BANK", wall: 0xe9d9bb, roof: 0x8a5a3c },
    loc_restaurant: { name: "नवाब कबाब HOUSE", wall: 0xf3e6cf, roof: 0x9c3b2e },
    loc_library: { name: "अमीर-उद-दौला LIBRARY", wall: 0xf2e6c8, roof: 0xb8553f },
    loc_police: { name: "चौक कोतवाली", wall: 0xe8d9b5, roof: 0x9c3b2e },
    loc_lab: { name: "DRUG RESEARCH INSTITUTE", wall: 0xe9e4d6, roof: 0x6f7f86 },
    loc_city_hall: { name: "नगर निगम LUCKNOW", wall: 0xf0deb6, roof: 0xb8553f },
    barn: { name: "दशहरी आम ORCHARD", wall: 0xe3cf9f, roof: 0xb97b4b },
    loc_power: { name: "बिजली घर", wall: 0xd9d6c9, roof: 0x6b7780 },
    loc_gym: { name: "RIVERFRONT GYM", wall: 0xeadfe0, roof: 0xc8442e },
    loc_apartments: { name: "HAZRATGANJ APARTMENTS", wall: 0xf0dfc4, roof: 0xc9b99c },
    loc_office: { name: "GOMTI IT TOWER", wall: 0xa9c1cf, roof: 0x55636e },
    loc_mall: { name: "हज़रतगंज ARCADE", wall: 0xf4e6c9, roof: 0xe3a6a0 },
    loc_station: { name: "चारबाग़ CHARBAGH", wall: 0xa8402f, roof: 0xf2ead8 },
    loc_konbini: { name: "शर्माजी चाय & KIRANA", wall: 0xf5efdc, roof: 0xd08a2e },
    loc_shrine: { name: "बड़ा इमामबाड़ा", wall: 0xe9dcc0, roof: 0xd9c9a3 },
    loc_clinic: { name: "हज़रतगंज CLINIC", wall: 0xf1f3ee, roof: 0x4f9a8c },
  },
};

export const THEME: Theme = activeCity().id === "lucknow" ? LUCKNOW : NAKAMEGURO;
export const isLucknow = THEME.city === "lucknow";
