"use client";

import { useEffect, useRef, useState } from "react";

import type { CityState, Location } from "@/lib/types";

type SyncableScene = {
  syncCity: (city: CityState, selectedCitizenId: string | null) => void;
  setMapZoom: (zoom: number) => void;
};

const TILE = 22;
const MAP_TILES = 40;
const MAP_PX = MAP_TILES * TILE;

type WeatherKind = "clear" | "fog" | "rain";
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
  const [zoom, setZoom] = useState(1);

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
    sceneRef.current?.setMapZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const Phaser = await import("phaser");
      if (!mounted || !containerRef.current || gameRef.current) return;

      class CityScene extends Phaser.Scene implements SyncableScene {
        private buildings = new Map<string, Phaser.GameObjects.Container>();
        private citizens = new Map<string, Phaser.GameObjects.Container>();
        private fireflies: Phaser.GameObjects.Arc[] = [];
        private fogBanks: Phaser.GameObjects.Ellipse[] = [];
        private rainDrops: Phaser.GameObjects.Rectangle[] = [];
        private vehicles: Phaser.GameObjects.Container[] = [];
        private skyOverlay?: Phaser.GameObjects.Rectangle;
        private streetLights: Phaser.GameObjects.Arc[] = [];
        private buildingWindows: Map<string, Phaser.GameObjects.Rectangle[]> = new Map();
        private selected: string | null = null;
        private selectedRoute?: Phaser.GameObjects.Graphics;
        private selectedRing?: Phaser.GameObjects.Arc;
        private thoughtBubble?: Phaser.GameObjects.Container;
        private currentMinute = 8 * 60;
        private currentWeather: WeatherKind = "clear";
        private mapZoom = 1;
        private dragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;

        constructor() {
          super("city");
        }

        create() {
          this.cameras.main.setBackgroundColor("#0a1226");
          this.cameras.main.setBounds(0, 0, MAP_PX, MAP_PX);
          this.createTileTextures();
          this.drawGround();
          this.drawDecor();
          this.spawnVehicles();
          this.skyOverlay = this.add
            .rectangle(0, 0, MAP_PX, MAP_PX, 0x050912, 0)
            .setOrigin(0)
            .setDepth(80);
          this.spawnWeather();
          this.spawnFireflies();
          this.registerCameraDrag();
          if (latestCityRef.current) {
            this.syncCity(latestCityRef.current, selectedRef.current);
          }
        }

        update(_: number, delta: number) {
          this.driftFireflies(delta);
          this.animateRain(delta);
          this.animateVehicles(delta);
        }

        syncCity(city: CityState, selectedCitizenId: string | null) {
          if (!city) return;
          const previousSelected = this.selected;
          this.selected = selectedCitizenId;
          this.currentMinute = city.clock.minute_of_day;
          this.currentWeather = weatherFor(city.clock.minute_of_day, city.clock.day, city.events);
          this.applyDayNight();
          this.applyWeather();
          this.drawLocations(city);
          this.drawCitizens(city);
          if (previousSelected !== selectedCitizenId && selectedCitizenId && this.mapZoom > 1) {
            const citizen = city.citizens.find((item) => item.citizen_id === selectedCitizenId);
            if (citizen) this.focusPoint(citizen.x * TILE + TILE / 2, citizen.y * TILE + TILE / 2);
          }
        }

        setMapZoom(zoom: number) {
          this.mapZoom = zoom;
          this.cameras.main.zoomTo(zoom, 180, "Sine.easeOut");
          if (this.selected && latestCityRef.current) {
            const citizen = latestCityRef.current.citizens.find((item) => item.citizen_id === this.selected);
            if (citizen) {
              this.focusPoint(citizen.x * TILE + TILE / 2, citizen.y * TILE + TILE / 2);
              return;
            }
          }
          this.focusPoint(MAP_PX / 2, MAP_PX / 2);
        }

        private focusPoint(x: number, y: number) {
          const camera = this.cameras.main;
          camera.pan(x, y, 220, "Sine.easeOut");
        }

        private registerCameraDrag() {
          this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) => {
            if (gameObjects.length > 0 || this.mapZoom <= 1) return;
            this.dragStart = {
              x: pointer.x,
              y: pointer.y,
              scrollX: this.cameras.main.scrollX,
              scrollY: this.cameras.main.scrollY,
            };
          });
          this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (!this.dragStart || !pointer.isDown || this.mapZoom <= 1) return;
            const camera = this.cameras.main;
            camera.scrollX = Phaser.Math.Clamp(
              this.dragStart.scrollX - (pointer.x - this.dragStart.x) / camera.zoom,
              0,
              MAP_PX - camera.width / camera.zoom,
            );
            camera.scrollY = Phaser.Math.Clamp(
              this.dragStart.scrollY - (pointer.y - this.dragStart.y) / camera.zoom,
              0,
              MAP_PX - camera.height / camera.zoom,
            );
          });
          this.input.on("pointerup", () => {
            this.dragStart = null;
          });
        }

        private createTileTextures() {
          if (this.textures.exists("agentcity-grass")) return;

          const makeTile = (
            key: string,
            base: number,
            pixels: Array<{ x: number; y: number; w: number; h: number; color: number; alpha?: number }>,
          ) => {
            const graphics = this.add.graphics().setVisible(false);
            graphics.fillStyle(base, 1);
            graphics.fillRect(0, 0, TILE, TILE);
            for (const pixel of pixels) {
              graphics.fillStyle(pixel.color, pixel.alpha ?? 1);
              graphics.fillRect(pixel.x, pixel.y, pixel.w, pixel.h);
            }
            graphics.generateTexture(key, TILE, TILE);
            graphics.destroy();
          };

          makeTile("agentcity-grass", 0x244d35, [
            { x: 3, y: 5, w: 3, h: 1, color: 0x3f7d4f, alpha: 0.8 },
            { x: 14, y: 4, w: 2, h: 2, color: 0x1c3f2d, alpha: 0.75 },
            { x: 8, y: 15, w: 4, h: 1, color: 0x65a35b, alpha: 0.6 },
            { x: 18, y: 16, w: 1, h: 3, color: 0x173724, alpha: 0.7 },
          ]);
          makeTile("agentcity-garden", 0x2e5b3d, [
            { x: 4, y: 3, w: 2, h: 2, color: 0x86efac, alpha: 0.65 },
            { x: 12, y: 7, w: 3, h: 1, color: 0x1f452d, alpha: 0.75 },
            { x: 17, y: 15, w: 2, h: 2, color: 0xf9a8d4, alpha: 0.35 },
            { x: 7, y: 18, w: 4, h: 1, color: 0xbbf7d0, alpha: 0.35 },
          ]);
          makeTile("agentcity-paver", 0x34475d, [
            { x: 0, y: 10, w: 22, h: 1, color: 0x26374b, alpha: 0.8 },
            { x: 10, y: 0, w: 1, h: 10, color: 0x26374b, alpha: 0.8 },
            { x: 4, y: 15, w: 8, h: 1, color: 0x4c637f, alpha: 0.65 },
            { x: 16, y: 5, w: 5, h: 1, color: 0x4c637f, alpha: 0.45 },
          ]);
          makeTile("agentcity-road", 0x202633, [
            { x: 0, y: 0, w: 22, h: 1, color: 0x101827, alpha: 0.9 },
            { x: 4, y: 7, w: 2, h: 1, color: 0x3b4353, alpha: 0.75 },
            { x: 14, y: 14, w: 3, h: 1, color: 0x3b4353, alpha: 0.75 },
            { x: 19, y: 4, w: 1, h: 1, color: 0x566174, alpha: 0.5 },
          ]);
          makeTile("agentcity-sidewalk", 0x536179, [
            { x: 0, y: 11, w: 22, h: 1, color: 0x394760, alpha: 0.9 },
            { x: 10, y: 0, w: 1, h: 22, color: 0x394760, alpha: 0.65 },
            { x: 3, y: 4, w: 2, h: 1, color: 0x75839a, alpha: 0.5 },
            { x: 16, y: 17, w: 2, h: 1, color: 0x75839a, alpha: 0.45 },
          ]);
          makeTile("agentcity-field", 0x536f34, [
            { x: 0, y: 4, w: 22, h: 3, color: 0x7c9446, alpha: 0.85 },
            { x: 0, y: 12, w: 22, h: 3, color: 0x334d27, alpha: 0.55 },
            { x: 6, y: 1, w: 2, h: 2, color: 0xfacc15, alpha: 0.35 },
            { x: 16, y: 18, w: 2, h: 2, color: 0xfacc15, alpha: 0.25 },
          ]);
          makeTile("agentcity-water", 0x21465c, [
            { x: 2, y: 6, w: 8, h: 1, color: 0x6db4d4, alpha: 0.55 },
            { x: 12, y: 15, w: 7, h: 1, color: 0x6db4d4, alpha: 0.42 },
            { x: 8, y: 3, w: 2, h: 1, color: 0xb7e4f7, alpha: 0.35 },
          ]);
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
          this.add.tileSprite(0, 0, MAP_PX, MAP_PX, "agentcity-grass").setOrigin(0).setDepth(0);

          const graphics = this.add.graphics();
          graphics.setName("ground");
          graphics.setDepth(5);

          // Soft inner light wash
          graphics.fillStyle(0x214936, 0.25);
          graphics.fillCircle(MAP_PX * 0.45, MAP_PX * 0.45, MAP_PX * 0.55);

          // Districts (residential west, commercial center, civic east, agri south)
          this.drawDistrict(graphics, 1, 1, 11, 12, 0x274c39, "agentcity-garden");
          this.drawDistrict(graphics, 14, 1, 11, 12, 0x2d4a55, "agentcity-paver");
          this.drawDistrict(graphics, 27, 1, 12, 12, 0x3a3554, "agentcity-paver");
          this.drawDistrict(graphics, 1, 27, 11, 12, 0x39482a, "agentcity-field");
          this.drawDistrict(graphics, 14, 27, 25, 12, 0x244a4d, "agentcity-garden");

          // Roads
          this.drawRoad(graphics, 12, 0, 3, MAP_TILES, "vertical");
          this.drawRoad(graphics, 0, 13, MAP_TILES, 3, "horizontal");
          this.drawRoad(graphics, 25, 0, 3, MAP_TILES, "vertical");
          this.drawRoad(graphics, 0, 25, MAP_TILES, 3, "horizontal");

          this.drawSidewalks(graphics);

          // Lake (riverside accent)
          graphics.fillStyle(0x21465c, 0.92);
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
          this.add
            .tileSprite(15 * TILE, 27 * TILE, 9 * TILE, 7 * TILE, "agentcity-garden")
            .setOrigin(0)
            .setDepth(1)
            .setAlpha(0.9);
          graphics.fillStyle(0x244d2c, 0.25);
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
          textureKey: string,
        ) {
          this.add
            .tileSprite(x * TILE, y * TILE, w * TILE, h * TILE, textureKey)
            .setOrigin(0)
            .setDepth(1)
            .setAlpha(0.88);
          graphics.fillStyle(color, 0.22);
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
          this.add
            .tileSprite(tileX * TILE, tileY * TILE, width * TILE, height * TILE, "agentcity-road")
            .setOrigin(0)
            .setDepth(2);
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
          // Borders along roads
          for (const x of [11.4, 15.2, 24.4, 28.2]) {
            this.add.tileSprite(x * TILE, 0, 4, MAP_PX, "agentcity-sidewalk").setOrigin(0).setDepth(3).setAlpha(0.85);
          }
          for (const y of [12.4, 16.2, 24.4, 28.2]) {
            this.add.tileSprite(0, y * TILE, MAP_PX, 4, "agentcity-sidewalk").setOrigin(0).setDepth(3).setAlpha(0.85);
          }
        }

        private drawFarmRows(
          graphics: Phaser.GameObjects.Graphics,
          x: number,
          y: number,
          w: number,
          h: number,
        ) {
          this.add
            .tileSprite(x * TILE, y * TILE, w * TILE, h * TILE, "agentcity-field")
            .setOrigin(0)
            .setDepth(1)
            .setAlpha(0.92);
          graphics.fillStyle(0x2f5a32, 0.22);
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

          const benches = [
            [17.2, 29.6], [20.8, 31.1], [22.6, 29.2], [4.2, 15.1], [19.4, 18.2],
            [31.2, 18.1], [30.5, 27.1], [7.8, 27.1],
          ];
          for (const [bx, by] of benches) this.drawBench(bx as number, by as number);

          const bikes = [
            [14.8, 12.2], [24.3, 15.8], [28.8, 12.4], [15.5, 24.2], [25.4, 28.6],
          ];
          for (const [bx, by] of bikes) this.drawBikeRack(bx as number, by as number);

          const flowerbeds = [
            [3.2, 9.5], [8.6, 9.2], [18.6, 10.4], [22.8, 8.7], [29.5, 8.4], [33.4, 23.8],
          ];
          for (const [fx, fy] of flowerbeds) this.drawFlowerBed(fx as number, fy as number);

          const signs = [
            [11.6, 12.2], [15.5, 12.2], [24.6, 24.1], [28.3, 24.1],
          ];
          for (const [sx, sy] of signs) this.drawStreetSign(sx as number, sy as number);
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

        private drawBench(tx: number, ty: number) {
          const cx = tx * TILE;
          const cy = ty * TILE;
          this.add.rectangle(cx, cy, 18, 4, 0x8b5a2b, 1).setDepth(7);
          this.add.rectangle(cx, cy + 5, 18, 3, 0x6b4226, 1).setDepth(7);
          this.add.rectangle(cx - 7, cy + 8, 2, 6, 0x1f2937, 1).setDepth(6);
          this.add.rectangle(cx + 7, cy + 8, 2, 6, 0x1f2937, 1).setDepth(6);
        }

        private drawBikeRack(tx: number, ty: number) {
          const cx = tx * TILE;
          const cy = ty * TILE;
          this.add.circle(cx - 5, cy + 3, 4, 0x000000, 0).setStrokeStyle(1.5, 0x94a3b8, 0.95).setDepth(8);
          this.add.circle(cx + 6, cy + 3, 4, 0x000000, 0).setStrokeStyle(1.5, 0x94a3b8, 0.95).setDepth(8);
          this.add.line(cx, cy, -5, 3, 0, -4, 0x60a5fa, 0.9).setLineWidth(1.5).setDepth(8);
          this.add.line(cx, cy, 0, -4, 6, 3, 0x60a5fa, 0.9).setLineWidth(1.5).setDepth(8);
          this.add.rectangle(cx + 2, cy - 5, 7, 1.5, 0xfacc15, 1).setDepth(8);
        }

        private drawFlowerBed(tx: number, ty: number) {
          const cx = tx * TILE;
          const cy = ty * TILE;
          this.add.rectangle(cx, cy, 23, 9, 0x1f452d, 0.9).setDepth(6).setStrokeStyle(1, 0x547c45, 0.9);
          for (let i = 0; i < 6; i += 1) {
            const x = cx - 9 + i * 4;
            const color = i % 3 === 0 ? 0xf9a8d4 : i % 3 === 1 ? 0xfde68a : 0x93c5fd;
            this.add.circle(x, cy - 1 + (i % 2) * 3, 1.5, color, 0.95).setDepth(7);
          }
        }

        private drawStreetSign(tx: number, ty: number) {
          const cx = tx * TILE;
          const cy = ty * TILE;
          this.add.rectangle(cx, cy + 7, 1.5, 13, 0x111827, 1).setDepth(8);
          this.add.rectangle(cx + 4, cy, 12, 5, 0x38bdf8, 0.95).setDepth(8).setStrokeStyle(1, 0x0f172a, 1);
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

        private spawnVehicles() {
          const routes = [
            { x1: -28, y1: 14.5 * TILE, x2: MAP_PX + 28, y2: 14.5 * TILE, angle: 0, color: 0x38bdf8, duration: 14500, delay: 0, kind: "car" },
            { x1: MAP_PX + 30, y1: 26.5 * TILE, x2: -30, y2: 26.5 * TILE, angle: 180, color: 0xf97316, duration: 17000, delay: 2400, kind: "bus" },
            { x1: 13.5 * TILE, y1: MAP_PX + 26, x2: 13.5 * TILE, y2: -26, angle: -90, color: 0xa78bfa, duration: 15500, delay: 1200, kind: "bike" },
            { x1: 26.5 * TILE, y1: -26, x2: 26.5 * TILE, y2: MAP_PX + 26, angle: 90, color: 0x4ade80, duration: 18000, delay: 3600, kind: "car" },
          ];

          for (const route of routes) {
            const vehicle = this.createVehicle(route.color, route.kind as "car" | "bus" | "bike");
            vehicle.setPosition(route.x1, route.y1);
            vehicle.setAngle(route.angle);
            vehicle.setDepth(route.kind === "bike" ? 17 : 18);
            this.vehicles.push(vehicle);
            this.tweens.add({
              targets: vehicle,
              x: route.x2,
              y: route.y2,
              duration: route.duration,
              delay: route.delay,
              repeat: -1,
              ease: "Linear",
            });
          }
        }

        private createVehicle(color: number, kind: "car" | "bus" | "bike") {
          const vehicle = this.add.container(0, 0);
          const shadow = this.add.ellipse(0, 6, kind === "bus" ? 28 : 18, 6, 0x000000, 0.35);
          if (kind === "bike") {
            const back = this.add.circle(-6, 2, 4, 0x000000, 0).setStrokeStyle(1.4, 0xe2e8f0, 0.9);
            const front = this.add.circle(6, 2, 4, 0x000000, 0).setStrokeStyle(1.4, 0xe2e8f0, 0.9);
            const frame = this.add.triangle(0, 0, -6, 2, 1, -6, 6, 2, color, 0.95).setOrigin(0.5);
            const rider = this.add.circle(0, -8, 3, 0xfcd9b8, 1);
            vehicle.add([shadow, back, front, frame, rider]);
            return vehicle;
          }

          const width = kind === "bus" ? 28 : 20;
          const body = this.add.rectangle(0, 0, width, 11, color, 1).setStrokeStyle(1, 0x0b1220, 1);
          const roof = this.add.rectangle(1, -1, width - 8, 6, 0xe0f2fe, 0.78);
          const frontLight = this.add.circle(width / 2 - 2, -3, 1.6, 0xfef3c7, 1);
          const tailLight = this.add.circle(-width / 2 + 2, 3, 1.4, 0xf87171, 1);
          const wheelA = this.add.circle(-width / 3, 6, 2.2, 0x0b1220, 1);
          const wheelB = this.add.circle(width / 3, 6, 2.2, 0x0b1220, 1);
          vehicle.add([shadow, body, roof, frontLight, tailLight, wheelA, wheelB]);
          return vehicle;
        }

        private driftFireflies(_delta: number) {
          // tweens handle motion; this hook intentionally empty
        }

        private animateVehicles(_delta: number) {
          for (const vehicle of this.vehicles) {
            const light = vehicle.list.find((item) => item instanceof Phaser.GameObjects.Arc) as Phaser.GameObjects.Arc | undefined;
            if (light) light.rotation += 0.02;
          }
        }

        private spawnWeather() {
          for (let i = 0; i < 80; i += 1) {
            const drop = this.add
              .rectangle(
                Phaser.Math.Between(-40, MAP_PX + 40),
                Phaser.Math.Between(-80, MAP_PX),
                1.5,
                13,
                0x93c5fd,
                0.55,
              )
              .setAngle(-18)
              .setDepth(90)
              .setVisible(false);
            this.rainDrops.push(drop);
          }

          const banks = [
            { x: 120, y: 140, w: 250, h: 80 },
            { x: 520, y: 220, w: 280, h: 90 },
            { x: 250, y: 620, w: 330, h: 96 },
          ];
          for (const bank of banks) {
            const fog = this.add
              .ellipse(bank.x, bank.y, bank.w, bank.h, 0xdbeafe, 0.1)
              .setDepth(86)
              .setVisible(false);
            this.fogBanks.push(fog);
            this.tweens.add({
              targets: fog,
              x: bank.x + 60,
              alpha: 0.18,
              duration: 5000 + bank.x,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut",
            });
          }
        }

        private applyWeather() {
          const isRain = this.currentWeather === "rain";
          const isFog = this.currentWeather === "fog";
          for (const drop of this.rainDrops) drop.setVisible(isRain);
          for (const fog of this.fogBanks) fog.setVisible(isFog);
          if (isRain) {
            this.skyOverlay?.setFillStyle(0x0c1425, Math.max(nightIntensity(this.currentMinute) * 0.48, 0.24));
          }
        }

        private animateRain(delta: number) {
          if (this.currentWeather !== "rain") return;
          for (const drop of this.rainDrops) {
            drop.y += delta * 0.42;
            drop.x -= delta * 0.12;
            if (drop.y > MAP_PX + 40) {
              drop.y = -40;
              drop.x = Phaser.Math.Between(-30, MAP_PX + 80);
            }
            if (drop.x < -50) drop.x = MAP_PX + 50;
          }
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
              const leftLeg = this.add.rectangle(-2.8, 5, 3.2, 8, 0x1f2937, 1).setOrigin(0.5, 0);
              const rightLeg = this.add.rectangle(2.8, 5, 3.2, 8, 0x1f2937, 1).setOrigin(0.5, 0);
              const body = this.add.rectangle(0, -1, 11, 11, professionColor(citizen.profession), 1).setOrigin(0.5);
              body.setStrokeStyle(1, 0x0b1220, 1);
              const skin = skinTone(citizen.citizen_id);
              const leftArm = this.add.rectangle(-7.2, -3, 2.8, 10, skin, 1).setOrigin(0.5, 0);
              const rightArm = this.add.rectangle(7.2, -3, 2.8, 10, skin, 1).setOrigin(0.5, 0);
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
                .circle(0, -1, 22, 0xffffff, 0)
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
              inner.add([leftLeg, rightLeg, leftArm, rightArm, body, head, hat, hatBrim, leftEye, rightEye, mood, glyph]);
              container.add([shadow, tapHalo, inner, nameLabel]);
              container.setData("body", body);
              container.setData("badge", mood);
              container.setData("hat", hat);
              container.setData("hatBrim", hatBrim);
              container.setData("leftLeg", leftLeg);
              container.setData("rightLeg", rightLeg);
              container.setData("leftArm", leftArm);
              container.setData("rightArm", rightArm);
              container.setData("glyph", glyph);
              container.setData("tapHalo", tapHalo);
              container.setData("label", nameLabel);
              container.setData("inner", inner);
              container.setData("bobOffset", Math.random() * Math.PI * 2);
              container.setSize(70, 70);
              container.setInteractive(
                new Phaser.Geom.Circle(0, 0, 35),
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
            const leftLeg = container.getData("leftLeg") as Phaser.GameObjects.Rectangle;
            const rightLeg = container.getData("rightLeg") as Phaser.GameObjects.Rectangle;
            const leftArm = container.getData("leftArm") as Phaser.GameObjects.Rectangle;
            const rightArm = container.getData("rightArm") as Phaser.GameObjects.Rectangle;
            const glyph = container.getData("glyph") as Phaser.GameObjects.Text;
            const limbs = [leftLeg, rightLeg, leftArm, rightArm];
            this.tweens.killTweensOf([inner, ...limbs]);
            if (moving) {
              const direction = citizen.target_x < citizen.x ? -1 : 1;
              inner.scaleX = direction;
              glyph.scaleX = direction;
              this.tweens.add({
                targets: inner,
                y: { from: 0, to: -1.6 },
                duration: 240 + Math.floor(Math.abs(bobOffset * 60)),
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
              });
              this.tweens.add({
                targets: leftLeg,
                angle: { from: -18, to: 18 },
                duration: 260,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
              });
              this.tweens.add({
                targets: rightLeg,
                angle: { from: 18, to: -18 },
                duration: 260,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
              });
              this.tweens.add({
                targets: leftArm,
                angle: { from: 16, to: -16 },
                duration: 280,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
              });
              this.tweens.add({
                targets: rightArm,
                angle: { from: -16, to: 16 },
                duration: 280,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
              });
            } else {
              inner.y = 0;
              for (const limb of limbs) limb.setAngle(0);
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
            container.setScale(isSelected ? 1.6 : 1.35);

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

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <div ref={containerRef} className="h-full min-h-0 w-full overflow-hidden [touch-action:pan-x_pan-y]" />
      <MapZoomControls
        zoom={zoom}
        onZoomIn={() => setZoom((value) => Math.min(1.9, Number((value + 0.25).toFixed(2))))}
        onZoomOut={() => setZoom((value) => Math.max(0.8, Number((value - 0.25).toFixed(2))))}
        onReset={() => setZoom(1)}
      />
    </div>
  );
}

function MapZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-30 flex items-center overflow-hidden rounded-xl border border-[rgba(125,211,252,0.35)] bg-[rgba(8,12,24,0.82)] shadow-[0_10px_28px_rgba(0,0,0,0.32),0_0_18px_rgba(56,189,248,0.10)] backdrop-blur-md sm:bottom-auto sm:right-24 sm:top-3">
      <button className="focus-ring px-3 py-2 text-sm font-semibold text-[rgb(var(--foreground))] transition hover:bg-[rgba(56,189,248,0.16)]" onClick={onZoomOut} title="Zoom out">
        −
      </button>
      <button
        className="focus-ring border-x border-[rgba(var(--border),0.55)] px-2.5 py-2 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--muted-strong))] transition hover:bg-[rgba(56,189,248,0.16)]"
        onClick={onReset}
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button className="focus-ring px-3 py-2 text-sm font-semibold text-[rgb(var(--foreground))] transition hover:bg-[rgba(56,189,248,0.16)]" onClick={onZoomIn} title="Zoom in">
        +
      </button>
    </div>
  );
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

function weatherFor(minute: number, day: number, events: Array<{ event_type: string; priority: number }>): WeatherKind {
  const hour = minute / 60;
  if (events.some((event) => event.event_type === "power_outage" && event.priority >= 2)) return "fog";
  if (hour >= 5.2 && hour <= 7.4) return "fog";
  const rainWindow = (day * 17 + Math.floor(hour / 3)) % 9;
  if ((hour >= 15 && hour <= 18 && rainWindow === 4) || rainWindow === 7) return "rain";
  return "clear";
}
