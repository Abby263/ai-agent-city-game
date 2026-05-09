"use client";

import { useEffect, useRef } from "react";

import type { CityState, Location } from "@/lib/types";

type SyncableScene = {
  syncCity: (city: CityState, selectedCitizenId: string | null) => void;
};

const TILE = 22;
const MAP_TILES = 40;
const MAP_PX = MAP_TILES * TILE;

type HoverInfo = { kind: "location"; data: Location } | { kind: "citizen"; data: { name: string; subtitle: string } } | null;

export function GameCanvas({
  city,
  selectedCitizenId,
  onSelectCitizen,
  onHoverChange,
}: {
  city: CityState | null;
  selectedCitizenId: string | null;
  onSelectCitizen: (citizenId: string) => void;
  onHoverChange?: (info: HoverInfo) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<{ destroy: (removeCanvas: boolean, noReturn?: boolean) => void } | null>(null);
  const sceneRef = useRef<SyncableScene | null>(null);
  const latestCityRef = useRef<CityState | null>(city);
  const selectedRef = useRef<string | null>(selectedCitizenId);
  const onSelectRef = useRef(onSelectCitizen);
  const onHoverRef = useRef(onHoverChange);

  useEffect(() => {
    latestCityRef.current = city;
    selectedRef.current = selectedCitizenId;
    sceneRef.current?.syncCity(city as CityState, selectedCitizenId);
  }, [city, selectedCitizenId]);

  useEffect(() => {
    onSelectRef.current = onSelectCitizen;
  }, [onSelectCitizen]);

  useEffect(() => {
    onHoverRef.current = onHoverChange;
  }, [onHoverChange]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const Phaser = await import("phaser");
      if (!mounted || !containerRef.current || gameRef.current) return;

      class CityScene extends Phaser.Scene implements SyncableScene {
        private buildings = new Map<string, Phaser.GameObjects.Container>();
        private citizens = new Map<string, Phaser.GameObjects.Container>();
        private fireflies: Phaser.GameObjects.Arc[] = [];
        private skyOverlay?: Phaser.GameObjects.Rectangle;
        private streetLights: Phaser.GameObjects.Arc[] = [];
        private buildingWindows: Map<string, Phaser.GameObjects.Rectangle[]> = new Map();
        private selected: string | null = null;
        private selectedRoute?: Phaser.GameObjects.Graphics;
        private selectedRing?: Phaser.GameObjects.Arc;
        private thoughtBubble?: Phaser.GameObjects.Container;
        private currentMinute = 8 * 60;

        constructor() {
          super("city");
        }

        create() {
          this.cameras.main.setBackgroundColor("#0a1226");
          this.drawGround();
          this.drawDecor();
          this.skyOverlay = this.add
            .rectangle(0, 0, MAP_PX, MAP_PX, 0x050912, 0)
            .setOrigin(0)
            .setDepth(80);
          this.spawnFireflies();
          if (latestCityRef.current) {
            this.syncCity(latestCityRef.current, selectedRef.current);
          }
        }

        update(_: number, delta: number) {
          this.driftFireflies(delta);
        }

        syncCity(city: CityState, selectedCitizenId: string | null) {
          if (!city) return;
          this.selected = selectedCitizenId;
          this.currentMinute = city.clock.minute_of_day;
          this.applyDayNight();
          this.drawLocations(city);
          this.drawCitizens(city);
        }

        private applyDayNight() {
          const minute = this.currentMinute;
          const intensity = nightIntensity(minute);
          this.skyOverlay?.setFillStyle(skyColor(minute), intensity * 0.48);

          const isNight = intensity > 0.35;
          for (const lamp of this.streetLights) {
            lamp.setVisible(isNight);
            lamp.setAlpha(0.4 + intensity * 0.6);
          }
          for (const firefly of this.fireflies) {
            firefly.setVisible(intensity > 0.5);
          }
          for (const [, windows] of this.buildingWindows) {
            for (const window of windows) {
              window.setAlpha(isNight ? 0.85 + intensity * 0.15 : 0.05);
            }
          }
        }

        private drawGround() {
          const graphics = this.add.graphics();
          graphics.setName("ground");
          graphics.setDepth(0);

          // Grass / land base with subtle gradient stripes
          for (let row = 0; row < MAP_TILES; row += 1) {
            const tone = row % 2 === 0 ? 0x183024 : 0x1a3527;
            graphics.fillStyle(tone, 1);
            graphics.fillRect(0, row * TILE, MAP_PX, TILE);
          }

          // Soft inner light wash
          graphics.fillStyle(0x214936, 0.25);
          graphics.fillCircle(MAP_PX * 0.45, MAP_PX * 0.45, MAP_PX * 0.55);

          // Districts (residential west, commercial center, civic east, agri south)
          this.drawDistrict(graphics, 1, 1, 11, 12, 0x274c39, "Residential");
          this.drawDistrict(graphics, 14, 1, 11, 12, 0x2d4a55, "Commercial");
          this.drawDistrict(graphics, 27, 1, 12, 12, 0x3a3554, "Civic");
          this.drawDistrict(graphics, 1, 27, 11, 12, 0x39482a, "Agri");
          this.drawDistrict(graphics, 14, 27, 25, 12, 0x244a4d, "Riverside");

          // Roads
          this.drawRoad(graphics, 12, 0, 3, MAP_TILES, "vertical");
          this.drawRoad(graphics, 0, 13, MAP_TILES, 3, "horizontal");
          this.drawRoad(graphics, 25, 0, 3, MAP_TILES, "vertical");
          this.drawRoad(graphics, 0, 25, MAP_TILES, 3, "horizontal");

          this.drawSidewalks(graphics);

          // Lake (riverside accent)
          graphics.fillStyle(0x21465c, 1);
          graphics.fillRoundedRect(33 * TILE, 30 * TILE, 6 * TILE, 7.5 * TILE, 14);
          graphics.lineStyle(1, 0x4d8db0, 0.6);
          graphics.strokeRoundedRect(33 * TILE, 30 * TILE, 6 * TILE, 7.5 * TILE, 14);
          // Water ripples
          graphics.lineStyle(1, 0x6db4d4, 0.45);
          for (let i = 0; i < 4; i += 1) {
            graphics.strokeCircle(35.5 * TILE, 33.5 * TILE, 6 + i * 7);
          }
          graphics.fillStyle(0x6db4d4, 0.55);
          graphics.fillCircle(35 * TILE, 33 * TILE, 1.6);
          graphics.fillCircle(36.4 * TILE, 34.2 * TILE, 1.6);
          graphics.fillCircle(37.1 * TILE, 32.5 * TILE, 1.6);

          // Park grass patch
          graphics.fillStyle(0x244d2c, 0.85);
          graphics.fillRoundedRect(15 * TILE, 27 * TILE, 9 * TILE, 7 * TILE, 16);
          // Path through park
          graphics.lineStyle(3, 0x90a96b, 0.5);
          graphics.lineBetween(16 * TILE, 30 * TILE, 23 * TILE, 33 * TILE);

          // Farm rows
          this.drawFarmRows(graphics, 2, 28, 9, 7);
        }

        private drawDistrict(
          graphics: Phaser.GameObjects.Graphics,
          x: number,
          y: number,
          w: number,
          h: number,
          color: number,
          _label: string,
        ) {
          graphics.fillStyle(color, 0.55);
          graphics.fillRoundedRect(x * TILE, y * TILE, w * TILE, h * TILE, 12);
          graphics.lineStyle(1, color, 0.85);
          graphics.strokeRoundedRect(x * TILE, y * TILE, w * TILE, h * TILE, 12);
        }

        private drawRoad(
          graphics: Phaser.GameObjects.Graphics,
          tileX: number,
          tileY: number,
          width: number,
          height: number,
          direction: "horizontal" | "vertical",
        ) {
          // Asphalt
          graphics.fillStyle(0x1c2230, 1);
          graphics.fillRect(tileX * TILE, tileY * TILE, width * TILE, height * TILE);
          // Edges
          graphics.lineStyle(2, 0x3a4356, 0.9);
          graphics.strokeRect(tileX * TILE, tileY * TILE, width * TILE, height * TILE);
          // Center divider
          graphics.lineStyle(1, 0xfacc15, 0.65);
          if (direction === "horizontal") {
            const y = (tileY + height / 2) * TILE;
            for (let x = tileX * TILE + 6; x < (tileX + width) * TILE - 6; x += 28) {
              graphics.lineBetween(x, y, x + 14, y);
            }
          } else {
            const x = (tileX + width / 2) * TILE;
            for (let y = tileY * TILE + 6; y < (tileY + height) * TILE - 6; y += 28) {
              graphics.lineBetween(x, y, x, y + 14);
            }
          }

          // Crosswalks at intersections
          for (const [cx, cy] of [
            [12, 13],
            [25, 13],
            [12, 25],
            [25, 25],
          ]) {
            this.drawCrosswalk(graphics, cx, cy);
          }
        }

        private drawCrosswalk(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number) {
          graphics.fillStyle(0xe2e8f0, 0.55);
          // Horizontal stripes
          for (let i = 0; i < 4; i += 1) {
            graphics.fillRect((cx + i * 0.7 + 0.05) * TILE, (cy + 1.05) * TILE, 8, 3);
            graphics.fillRect((cx + i * 0.7 + 0.05) * TILE, (cy + 1.85) * TILE, 8, 3);
          }
          // Vertical stripes
          for (let i = 0; i < 4; i += 1) {
            graphics.fillRect((cx + 1.05) * TILE, (cy + i * 0.7 + 0.05) * TILE, 3, 8);
            graphics.fillRect((cx + 1.85) * TILE, (cy + i * 0.7 + 0.05) * TILE, 3, 8);
          }
        }

        private drawSidewalks(graphics: Phaser.GameObjects.Graphics) {
          graphics.fillStyle(0x394760, 0.7);
          // Borders along roads
          for (const x of [11.4, 15.2, 24.4, 28.2]) {
            graphics.fillRect(x * TILE, 0, 4, MAP_PX);
          }
          for (const y of [12.4, 16.2, 24.4, 28.2]) {
            graphics.fillRect(0, y * TILE, MAP_PX, 4);
          }
        }

        private drawFarmRows(
          graphics: Phaser.GameObjects.Graphics,
          x: number,
          y: number,
          w: number,
          h: number,
        ) {
          graphics.fillStyle(0x2f5a32, 0.65);
          graphics.fillRoundedRect(x * TILE, y * TILE, w * TILE, h * TILE, 10);
          for (let row = 0; row < 6; row += 1) {
            graphics.fillStyle(row % 2 === 0 ? 0x6f8b3f : 0x517336, 0.9);
            graphics.fillRect((x + 0.6) * TILE, (y + 0.6 + row) * TILE, (w - 1.2) * TILE, 7);
          }
          // Tractor
          graphics.fillStyle(0xf97316, 1);
          graphics.fillRoundedRect((x + 6.8) * TILE, (y + 5.4) * TILE, 18, 12, 2);
          graphics.fillStyle(0x111827, 1);
          graphics.fillCircle((x + 6.9) * TILE + 4, (y + 5.4) * TILE + 12, 3);
          graphics.fillCircle((x + 6.9) * TILE + 14, (y + 5.4) * TILE + 12, 3);
        }

        private drawDecor() {
          // Trees scattered in residential & green zones
          const trees = [
            [3.5, 14], [5.5, 14.5], [7.5, 14.4], [9.4, 14.5],
            [3, 26], [5, 26], [7, 26], [9, 26],
            [16, 16], [18, 17], [22, 16.5], [24, 17.5],
            [28, 16], [30, 17], [32, 16.5], [34, 17],
            [16.5, 26], [18.5, 26.5], [22.5, 27], [24, 26.5],
            [28, 26], [30, 26], [32, 26], [34, 26],
            [16, 33], [18, 34], [21, 34.5], [23, 33],
          ];
          for (const [tx, ty] of trees) {
            this.drawTree(tx as number, ty as number);
          }

          // Park benches & lampposts
          const lamps = [
            [12.5, 8], [12.5, 20], [12.5, 32], [25.5, 8], [25.5, 20], [25.5, 32],
            [6, 13.5], [18, 13.5], [32, 13.5], [6, 25.5], [18, 25.5], [32, 25.5],
          ];
          for (const [lx, ly] of lamps) {
            this.drawLampPost(lx as number, ly as number);
          }
        }

        private drawTree(tx: number, ty: number) {
          const cx = tx * TILE;
          const cy = ty * TILE;
          const trunk = this.add.rectangle(cx, cy + 5, 3, 6, 0x6b4226).setDepth(3);
          const canopy = this.add.circle(cx, cy, 7, 0x3f7a3f).setDepth(4);
          canopy.setStrokeStyle(1, 0x1c4423, 1);
          const dot = this.add.circle(cx - 2, cy - 2, 1.6, 0x6fb16f, 0.85).setDepth(5);
          trunk.setName("decor");
          canopy.setName("decor");
          dot.setName("decor");
        }

        private drawLampPost(tx: number, ty: number) {
          const cx = tx * TILE;
          const cy = ty * TILE;
          this.add.rectangle(cx, cy + 3, 1.5, 8, 0x1f2937).setDepth(6);
          const head = this.add.circle(cx, cy - 2, 2.6, 0x111827, 1).setDepth(6).setStrokeStyle(1, 0x4b5563, 1);
          head.setName("decor");
          const glow = this.add.circle(cx, cy - 2, 9, 0xfde68a, 0.55).setDepth(70);
          glow.setVisible(false);
          this.streetLights.push(glow);
        }

        private spawnFireflies() {
          for (let i = 0; i < 26; i += 1) {
            const x = Phaser.Math.Between(0, MAP_PX);
            const y = Phaser.Math.Between(0, MAP_PX);
            const dot = this.add.circle(x, y, 1.4, 0xfde68a, 0.8).setDepth(85);
            this.fireflies.push(dot);
            this.tweens.add({
              targets: dot,
              x: x + Phaser.Math.Between(-30, 30),
              y: y + Phaser.Math.Between(-30, 30),
              alpha: 0.4,
              duration: 1800 + Math.random() * 1400,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut",
            });
          }
        }

        private driftFireflies(_delta: number) {
          // tweens handle motion; this hook intentionally empty
        }

        private drawLocations(city: CityState) {
          for (const location of city.locations) {
            let container = this.buildings.get(location.location_id);
            const fresh = !container;
            if (!container) {
              container = this.add.container(location.x * TILE, location.y * TILE);
              container.setDepth(10);
              this.buildings.set(location.location_id, container);
            }
            container.removeAll(true);
            const baseColor = locationColor(location.type);
            const shade = darken(baseColor, 0.65);
            const w = location.width * TILE;
            const h = location.height * TILE;

            // Drop shadow
            const shadow = this.add.rectangle(4, 6, w, h, 0x000000, 0.35).setOrigin(0);
            // Side wall (3D-ish)
            const side = this.add.rectangle(0, 4, w, h, shade, 1).setOrigin(0);
            // Body
            const rect = this.add
              .rectangle(0, 0, w, h, baseColor, 0.96)
              .setOrigin(0)
              .setStrokeStyle(1.4, 0x0b1220, 1);
            // Roof highlight strip
            const roof = this.add
              .rectangle(2, 2, w - 4, 6, 0xffffff, 0.18)
              .setOrigin(0);
            // Door
            const door = this.add.rectangle(w / 2, h - 6, 7, 10, 0x111827, 1).setOrigin(0.5, 1);

            container.add([shadow, side, rect, roof, door]);

            // Windows lit at night
            const windows = this.drawWindows(container, location, w, h);
            this.buildingWindows.set(location.location_id, windows);

            // Type-specific badge / detail
            const detail = this.drawBuildingDetails(location, w, h);
            container.add(detail);

            // Label tag
            const labelBg = this.add
              .rectangle(8, h + 6, w - 16, 16, 0x0b1325, 0.85)
              .setOrigin(0)
              .setStrokeStyle(1, 0x1f2937, 0.9);
            const label = this.add
              .text(w / 2, h + 14, labelFor(location.name), {
                fontFamily: "Geist, Inter, Arial",
                fontSize: "10px",
                color: "#e2e8f0",
              })
              .setOrigin(0.5);
            container.add([labelBg, label]);

            // Hover interactivity
            rect.setInteractive({ useHandCursor: true });
            rect.on("pointerover", () => onHoverRef.current?.({ kind: "location", data: location }));
            rect.on("pointerout", () => onHoverRef.current?.(null));

            if (fresh) {
              container.setAlpha(0);
              this.tweens.add({ targets: container, alpha: 1, duration: 380 });
            }
          }
          this.applyDayNight();
        }

        private drawWindows(
          container: Phaser.GameObjects.Container,
          location: Location,
          w: number,
          h: number,
        ): Phaser.GameObjects.Rectangle[] {
          const windows: Phaser.GameObjects.Rectangle[] = [];
          const cols = Math.max(2, Math.floor(w / 24));
          const rows = Math.max(1, Math.floor((h - 18) / 18));
          for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
              const wx = 8 + c * (w - 16) / Math.max(1, cols - 1) - 4;
              const wy = 12 + r * 16;
              const win = this.add.rectangle(wx, wy, 6, 7, 0xfde68a, 0.05).setOrigin(0);
              container.add(win);
              windows.push(win);
            }
          }
          // Type-specific tint
          const tint =
            location.type === "hospital" ? 0xfca5a5 :
            location.type === "school" ? 0xfde68a :
            location.type === "lab" ? 0x86efac :
            location.type === "library" ? 0xc4b5fd :
            location.type === "police" ? 0x60a5fa :
            location.type === "city_hall" ? 0xfacc15 :
            location.type === "power" ? 0xfb923c :
            location.type === "restaurant" ? 0xfdba74 :
            location.type === "pharmacy" ? 0xa5f3fc :
            0xfde68a;
          for (const win of windows) win.setFillStyle(tint, 0.05);
          return windows;
        }

        private drawBuildingDetails(location: Location, w: number, h: number) {
          const items: Phaser.GameObjects.GameObject[] = [];
          const cx = w / 2;
          const cy = h / 2 - 2;
          if (location.type === "hospital") {
            items.push(this.add.rectangle(cx, cy, 14, 4, 0xffffff, 1).setOrigin(0.5));
            items.push(this.add.rectangle(cx, cy, 4, 14, 0xffffff, 1).setOrigin(0.5));
          } else if (location.type === "school") {
            items.push(this.add.triangle(cx, cy - 6, 0, 12, 12, 0, 24, 12, 0xfde68a, 1).setOrigin(0.5));
            items.push(this.add.rectangle(cx + 8, cy - 8, 2, 8, 0x92400e).setOrigin(0.5));
            items.push(this.add.circle(cx + 8, cy - 12, 2, 0xfacc15).setOrigin(0.5));
          } else if (location.type === "bank") {
            for (let i = 0; i < 4; i += 1) {
              items.push(this.add.rectangle(8 + i * 10, h - 10, 4, 16, 0xe5e7eb, 0.75).setOrigin(0));
            }
            items.push(this.add.rectangle(6, h - 12, w - 12, 4, 0xe5e7eb, 0.7).setOrigin(0));
          } else if (location.type === "market") {
            const stripeColors = [0xef4444, 0xfde68a, 0x60a5fa];
            for (let i = 0; i < Math.floor(w / 8); i += 1) {
              items.push(
                this.add
                  .rectangle(4 + i * 8, 18, 7, 5, stripeColors[i % stripeColors.length], 0.95)
                  .setOrigin(0),
              );
            }
          } else if (location.type === "restaurant") {
            items.push(this.add.circle(cx, 18, 6, 0xfacc15, 1).setOrigin(0.5));
            items.push(this.add.rectangle(cx, 22, 11, 3, 0xfb7185, 1).setOrigin(0.5));
          } else if (location.type === "pharmacy") {
            items.push(this.add.rectangle(cx, cy, 12, 4, 0x86efac, 1).setOrigin(0.5));
            items.push(this.add.rectangle(cx, cy, 4, 12, 0x86efac, 1).setOrigin(0.5));
          } else if (location.type === "lab") {
            items.push(this.add.circle(cx, cy, 7, 0x86efac, 0.9).setOrigin(0.5));
            items.push(this.add.rectangle(cx, cy, 14, 3, 0xa78bfa, 1).setOrigin(0.5));
          } else if (location.type === "library") {
            items.push(this.add.rectangle(cx - 6, cy - 1, 5, 14, 0xfca5a5, 0.9).setOrigin(0.5));
            items.push(this.add.rectangle(cx, cy - 1, 5, 14, 0xfde68a, 0.9).setOrigin(0.5));
            items.push(this.add.rectangle(cx + 6, cy - 1, 5, 14, 0x60a5fa, 0.9).setOrigin(0.5));
          } else if (location.type === "police") {
            items.push(this.add.star(cx, cy, 5, 4, 9, 0xfacc15, 1).setOrigin(0.5));
          } else if (location.type === "city_hall") {
            items.push(this.add.triangle(cx, 14, 0, 12, 12, 0, 24, 12, 0xfacc15, 1).setOrigin(0.5));
            items.push(this.add.circle(cx, 11, 3, 0xfde68a, 1).setOrigin(0.5));
            for (let i = 0; i < 4; i += 1) {
              items.push(this.add.rectangle(8 + i * 10, h - 10, 3, 14, 0xe5e7eb, 0.75).setOrigin(0));
            }
          } else if (location.type === "power") {
            items.push(this.add.triangle(cx, cy, 0, 12, 8, 0, 16, 12, 0xfacc15, 1).setOrigin(0.5));
            items.push(this.add.triangle(cx, cy + 4, 0, 8, 8, -2, 16, 8, 0xfb923c, 1).setOrigin(0.5));
          } else if (location.type === "bus_stop") {
            items.push(this.add.rectangle(cx, h - 12, w - 12, 4, 0x60a5fa, 0.85).setOrigin(0.5));
            items.push(this.add.rectangle(cx, h - 22, w - 14, 7, 0xa5f3fc, 0.6).setOrigin(0.5));
          } else if (location.type === "home") {
            items.push(this.add.triangle(cx, 8, 0, 12, w / 2, 0, w, 12, 0x7c3326, 1).setOrigin(0));
            items.push(this.add.rectangle(cx, h - 8, 6, 10, 0xfde68a, 0.8).setOrigin(0.5, 1));
          }
          return items;
        }

        private drawCitizens(city: CityState) {
          const activeIds = new Set(city.citizens.map((citizen) => citizen.citizen_id));
          for (const [id, container] of this.citizens) {
            if (!activeIds.has(id)) {
              container.destroy();
              this.citizens.delete(id);
            }
          }

          this.selectedRoute?.destroy();
          this.selectedRoute = undefined;
          this.thoughtBubble?.destroy();
          this.thoughtBubble = undefined;
          this.selectedRing?.destroy();
          this.selectedRing = undefined;

          for (const citizen of city.citizens) {
            const x = citizen.x * TILE + TILE / 2;
            const y = citizen.y * TILE + TILE / 2;
            let container = this.citizens.get(citizen.citizen_id);
            if (!container) {
              container = this.add.container(x, y);
              container.setDepth(20);
              const shadow = this.add.ellipse(0, 9, 14, 5, 0x000000, 0.45);
              const inner = this.add.container(0, 0);
              const legs = this.add.rectangle(0, 5, 7, 7, 0x1f2937, 1).setOrigin(0.5);
              const body = this.add.rectangle(0, -1, 11, 11, professionColor(citizen.profession), 1).setOrigin(0.5);
              body.setStrokeStyle(1, 0x0b1220, 1);
              const skin = skinTone(citizen.citizen_id);
              const arms = this.add.rectangle(0, -1, 14, 2.5, skin, 1).setOrigin(0.5);
              const head = this.add.circle(0, -10, 4.5, skin, 1);
              head.setStrokeStyle(1, 0x0b1220, 0.8);
              const hat = this.add.rectangle(0, -14, 9, 3, professionAccent(citizen.profession), 1).setOrigin(0.5);
              const hatBrim = this.add.rectangle(0, -12.5, 11, 1.6, professionAccent(citizen.profession), 1).setOrigin(0.5);
              const leftEye = this.add.circle(-1.4, -10, 0.7, 0x0b1220, 1);
              const rightEye = this.add.circle(1.4, -10, 0.7, 0x0b1220, 1);
              const mood = this.add.circle(5, -2, 2.4, moodColor(citizen), 1);
              mood.setStrokeStyle(1, 0x0b1220, 0.8);
              const glyph = this.add
                .text(0, 12, professionGlyph(citizen.profession), {
                  fontFamily: "Geist Mono, monospace",
                  fontSize: "9px",
                  color: "#e2e8f0",
                  backgroundColor: "rgba(11,18,32,0.85)",
                  padding: { x: 2, y: 0 },
                })
                .setOrigin(0.5, 0);
              const tapHalo = this.add
                .circle(0, -1, 17, 0xffffff, 0)
                .setStrokeStyle(1, 0xe2e8f0, 0.18);
              const nameLabel = this.add
                .text(0, -28, citizen.name.split(" ")[0], {
                  fontFamily: "Geist, Inter, Arial",
                  fontSize: "9px",
                  color: "#f1f5f9",
                  backgroundColor: "rgba(11,18,32,0.85)",
                  padding: { x: 4, y: 1 },
                })
                .setOrigin(0.5)
                .setVisible(false);
              inner.add([legs, body, arms, head, hat, hatBrim, leftEye, rightEye, mood, glyph]);
              container.add([shadow, tapHalo, inner, nameLabel]);
              container.setData("body", body);
              container.setData("badge", mood);
              container.setData("hat", hat);
              container.setData("hatBrim", hatBrim);
              container.setData("tapHalo", tapHalo);
              container.setData("label", nameLabel);
              container.setData("inner", inner);
              container.setData("bobOffset", Math.random() * Math.PI * 2);
              container.setSize(56, 56);
              container.setInteractive(
                new Phaser.Geom.Circle(0, 0, 28),
                Phaser.Geom.Circle.Contains,
              );
              container.on("pointerdown", () => onSelectRef.current(citizen.citizen_id));
              container.on("pointerover", () => {
                nameLabel.setVisible(true);
                onHoverRef.current?.({
                  kind: "citizen",
                  data: { name: citizen.name, subtitle: `${citizen.profession} · ${citizen.current_activity}` },
                });
              });
              container.on("pointerout", () => {
                nameLabel.setVisible(selectedRef.current === citizen.citizen_id);
                onHoverRef.current?.(null);
              });
              this.citizens.set(citizen.citizen_id, container);
            }

            const isSelected = citizen.citizen_id === this.selected;
            const moving = citizen.x !== citizen.target_x || citizen.y !== citizen.target_y;

            this.tweens.add({
              targets: container,
              x,
              y,
              duration: 460,
              ease: "Sine.easeInOut",
            });
            container.setDepth(isSelected ? 30 : 20);

            const inner = container.getData("inner") as Phaser.GameObjects.Container;
            const bobOffset = container.getData("bobOffset") as number;
            // bobbing animation
            this.tweens.killTweensOf(inner);
            if (moving) {
              this.tweens.add({
                targets: inner,
                y: { from: 0, to: -1.6 },
                duration: 240 + Math.floor(Math.abs(bobOffset * 60)),
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
              });
            } else {
              inner.y = 0;
            }

            const body = container.getData("body") as Phaser.GameObjects.Rectangle;
            const badge = container.getData("badge") as Phaser.GameObjects.Arc;
            const label = container.getData("label") as Phaser.GameObjects.Text;
            const hat = container.getData("hat") as Phaser.GameObjects.Rectangle;
            const hatBrim = container.getData("hatBrim") as Phaser.GameObjects.Rectangle;
            const tapHalo = container.getData("tapHalo") as Phaser.GameObjects.Arc;
            body.setStrokeStyle(isSelected ? 2 : 1, isSelected ? 0xfacc15 : 0x0b1220, 1);
            badge.setFillStyle(moodColor(citizen), 1);
            hat.setFillStyle(professionAccent(citizen.profession), 1);
            hatBrim.setFillStyle(professionAccent(citizen.profession), 1);
            label.setVisible(isSelected);
            tapHalo.setStrokeStyle(isSelected ? 2 : 1, isSelected ? 0xfacc15 : 0xe2e8f0, isSelected ? 0.7 : 0.2);
            container.setScale(isSelected ? 1.45 : 1.25);

            if (isSelected) {
              this.drawSelectionRing(x, y);
              this.drawSelectedRoute(citizen);
              this.drawThoughtBubble(citizen, x, y);
            }
          }
        }

        private drawSelectionRing(x: number, y: number) {
          this.selectedRing = this.add.circle(x, y, 16, 0xfacc15, 0).setStrokeStyle(2, 0xfacc15, 0.9);
          this.selectedRing.setDepth(15);
          this.tweens.add({
            targets: this.selectedRing,
            scale: { from: 0.85, to: 1.25 },
            alpha: { from: 0.95, to: 0.05 },
            duration: 1400,
            repeat: -1,
            ease: "Sine.easeOut",
          });
        }

        private drawSelectedRoute(citizen: CityState["citizens"][number]) {
          this.selectedRoute = this.add.graphics();
          this.selectedRoute.setDepth(18);
          this.selectedRoute.lineStyle(2.5, 0xfacc15, 0.85);
          this.selectedRoute.beginPath();
          this.selectedRoute.moveTo(citizen.x * TILE + TILE / 2, citizen.y * TILE + TILE / 2);
          this.selectedRoute.lineTo(citizen.target_x * TILE + TILE / 2, citizen.target_y * TILE + TILE / 2);
          this.selectedRoute.strokePath();
          this.selectedRoute.fillStyle(0xfacc15, 0.95);
          this.selectedRoute.fillCircle(citizen.target_x * TILE + TILE / 2, citizen.target_y * TILE + TILE / 2, 4.5);
          this.selectedRoute.lineStyle(1, 0xfacc15, 0.5);
          this.selectedRoute.strokeCircle(citizen.target_x * TILE + TILE / 2, citizen.target_y * TILE + TILE / 2, 9);
        }

        private drawThoughtBubble(citizen: CityState["citizens"][number], x: number, y: number) {
          const thought = citizen.current_thought || citizen.current_activity;
          const text = thought.length > 70 ? `${thought.slice(0, 70)}…` : thought;
          const bubbleX = Math.min(Math.max(x + 18, 8), MAP_PX - 196);
          const bubbleY = Math.max(y - 56, 8);
          const container = this.add.container(bubbleX, bubbleY).setDepth(95);
          const bg = this.add
            .rectangle(0, 0, 188, 36, 0x0b1325, 0.94)
            .setOrigin(0)
            .setStrokeStyle(1.4, 0xfacc15, 0.85);
          const accent = this.add.rectangle(0, 0, 3, 36, 0xfacc15, 1).setOrigin(0);
          const label = this.add.text(10, 7, text, {
            fontFamily: "Geist, Inter, Arial",
            fontSize: "10px",
            color: "#f1f5f9",
            wordWrap: { width: 168 },
          });
          const tail = this.add.triangle(8, 36, 0, 0, 8, 0, 4, 6, 0x0b1325, 0.94).setOrigin(0);
          container.add([bg, accent, label, tail]);
          this.thoughtBubble = container;
        }
      }

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: MAP_PX,
        height: MAP_PX,
        backgroundColor: "#0a1226",
        scene: CityScene,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      });
      gameRef.current = game;
      game.events.once("ready", () => {
        sceneRef.current = game.scene.getScene("city") as unknown as SyncableScene;
      });
      setTimeout(() => {
        sceneRef.current = game.scene.getScene("city") as unknown as SyncableScene;
        if (latestCityRef.current) {
          sceneRef.current?.syncCity(latestCityRef.current, selectedRef.current);
        }
      }, 0);
    }

    boot();
    return () => {
      mounted = false;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="h-full min-h-0 w-full overflow-hidden [touch-action:manipulation]" />;
}

function labelFor(name: string) {
  return name
    .replace("Police Station", "Police")
    .replace("City Hall", "Hall")
    .replace("Bus Stop", "Bus")
    .replace("Research Lab", "Lab")
    .replace("Power Station", "Power");
}

function locationColor(type: string) {
  const colors: Record<string, number> = {
    home: 0x8b6f47,
    hospital: 0xb91c1c,
    school: 0x2563eb,
    bank: 0x4f46e5,
    market: 0xc2410c,
    restaurant: 0xea580c,
    pharmacy: 0x0e7490,
    farm: 0x65a30d,
    police: 0x1e40af,
    city_hall: 0x9a6c2c,
    lab: 0x059669,
    library: 0x6b21a8,
    power: 0xb45309,
    park: 0x166534,
    bus_stop: 0x4b5563,
  };
  return colors[type] ?? 0x475569;
}

function darken(hex: number, factor: number) {
  const r = Math.floor(((hex >> 16) & 0xff) * factor);
  const g = Math.floor(((hex >> 8) & 0xff) * factor);
  const b = Math.floor((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function professionColor(profession: string) {
  const colors: Record<string, number> = {
    Doctor: 0xef4444,
    Nurse: 0xf472b6,
    Teacher: 0x60a5fa,
    Student: 0x86efac,
    Engineer: 0xfbbf24,
    Driver: 0xcbd5e1,
    Shopkeeper: 0xfb923c,
    Banker: 0xa78bfa,
    "Police Officer": 0x3b82f6,
    Farmer: 0x4ade80,
    Mayor: 0xfacc15,
    Scientist: 0x34d399,
    Researcher: 0x2dd4bf,
    "Restaurant Cook": 0xfb7185,
  };
  return colors[profession] ?? 0xe2e8f0;
}

function professionGlyph(profession: string) {
  const glyphs: Record<string, string> = {
    Doctor: "+",
    Nurse: "+",
    Teacher: "T",
    Student: "S",
    Engineer: "E",
    Driver: "D",
    Shopkeeper: "$",
    Banker: "B",
    "Police Officer": "P",
    Farmer: "F",
    Mayor: "M",
    Scientist: "R",
    Researcher: "R",
    "Restaurant Cook": "C",
  };
  return glyphs[profession] ?? "·";
}

function professionAccent(profession: string) {
  const colors: Record<string, number> = {
    Doctor: 0xfee2e2,
    Nurse: 0xfecdd3,
    Teacher: 0x1e40af,
    Student: 0x1e3a8a,
    Engineer: 0xea580c,
    Driver: 0x111827,
    Shopkeeper: 0xfde68a,
    Banker: 0x111827,
    "Police Officer": 0x111827,
    Farmer: 0x854d0e,
    Mayor: 0x7c2d12,
    Scientist: 0x047857,
    Researcher: 0x0f766e,
    "Restaurant Cook": 0xfde68a,
  };
  return colors[profession] ?? 0x1e293b;
}

function moodColor(citizen: CityState["citizens"][number]) {
  if (citizen.health < 55) return 0xef4444;
  if (citizen.stress > 68) return 0xfbbf24;
  if (citizen.happiness > 78) return 0x4ade80;
  return 0x60a5fa;
}

function skinTone(citizenId: string) {
  const tones = [0xfcd9b8, 0xe8b48c, 0xc99373, 0xa46b4d, 0x7a4d34];
  const seed = citizenId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return tones[seed % tones.length];
}

function nightIntensity(minute: number) {
  // 0..1, with 1 = full night, 0 = midday
  const hour = minute / 60;
  if (hour <= 5) return 1;
  if (hour <= 7) return 1 - (hour - 5) / 2; // dawn
  if (hour <= 17) return 0;
  if (hour <= 19) return (hour - 17) / 2; // dusk
  if (hour <= 22) return 0.7 + (hour - 19) / 10;
  return 1;
}

function skyColor(minute: number) {
  const hour = minute / 60;
  if (hour <= 5) return 0x050912;
  if (hour <= 7) return 0x402250; // dawn purple
  if (hour <= 17) return 0x102040;
  if (hour <= 19) return 0x6b3a1f; // dusk orange
  return 0x050912;
}
