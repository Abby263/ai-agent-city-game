"use client";

import { useEffect, useRef } from "react";

import type { CityState } from "@/lib/types";

type SyncableScene = {
  syncCity: (city: CityState, selectedCitizenId: string | null) => void;
};

const TILE = 18;

export function GameCanvas({
  city,
  selectedCitizenId,
  onSelectCitizen,
}: {
  city: CityState | null;
  selectedCitizenId: string | null;
  onSelectCitizen: (citizenId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<{ destroy: (removeCanvas: boolean, noReturn?: boolean) => void } | null>(null);
  const sceneRef = useRef<SyncableScene | null>(null);
  const latestCityRef = useRef<CityState | null>(city);
  const selectedRef = useRef<string | null>(selectedCitizenId);
  const onSelectRef = useRef(onSelectCitizen);

  useEffect(() => {
    latestCityRef.current = city;
    selectedRef.current = selectedCitizenId;
    sceneRef.current?.syncCity(city as CityState, selectedCitizenId);
  }, [city, selectedCitizenId]);

  useEffect(() => {
    onSelectRef.current = onSelectCitizen;
  }, [onSelectCitizen]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const Phaser = await import("phaser");
      if (!mounted || !containerRef.current || gameRef.current) return;

      class CityScene extends Phaser.Scene implements SyncableScene {
        private buildings = new Map<string, Phaser.GameObjects.Container>();
        private citizens = new Map<string, Phaser.GameObjects.Container>();
        private selected: string | null = null;
        private selectedRoute?: Phaser.GameObjects.Graphics;
        private thoughtBubble?: Phaser.GameObjects.Container;

        constructor() {
          super("city");
        }

        create() {
          this.cameras.main.setBackgroundColor("#111416");
          this.drawGround();
          if (latestCityRef.current) {
            this.syncCity(latestCityRef.current, selectedRef.current);
          }
        }

        syncCity(city: CityState, selectedCitizenId: string | null) {
          if (!city) return;
          this.selected = selectedCitizenId;
          this.drawGround();
          this.drawLocations(city);
          this.drawCitizens(city);
        }

        private drawGround() {
          const existing = this.children.getByName("ground");
          existing?.destroy();
          const graphics = this.add.graphics();
          graphics.setName("ground");
          graphics.fillStyle(0x15191a, 1);
          graphics.fillRect(0, 0, 40 * TILE, 40 * TILE);

          graphics.lineStyle(1, 0x22292a, 0.38);
          for (let i = 0; i <= 40; i += 1) {
            graphics.lineBetween(i * TILE, 0, i * TILE, 40 * TILE);
            graphics.lineBetween(0, i * TILE, 40 * TILE, i * TILE);
          }

          this.drawRoad(graphics, 12, 0, 3, 40, "vertical");
          this.drawRoad(graphics, 0, 13, 40, 3, "horizontal");
          this.drawRoad(graphics, 25, 0, 3, 40, "vertical");
          this.drawRoad(graphics, 0, 25, 40, 3, "horizontal");
          this.drawSidewalks(graphics);
          this.drawTraffic(graphics);

          graphics.fillStyle(0x172827, 1);
          graphics.fillRect(33 * TILE, 30 * TILE, 5 * TILE, 7 * TILE);
          graphics.lineStyle(1, 0x3c7c84, 0.55);
          graphics.strokeRoundedRect(33 * TILE, 30 * TILE, 5 * TILE, 7 * TILE, 10);

          this.drawTreePatch(graphics, 16, 28, 8, 6);
          this.drawFarmRows(graphics, 3, 28, 9, 7);
        }

        private drawSidewalks(graphics: Phaser.GameObjects.Graphics) {
          graphics.lineStyle(3, 0x48504b, 0.7);
          for (const x of [11.6, 15.1, 24.6, 28.1]) {
            graphics.lineBetween(x * TILE, 0, x * TILE, 40 * TILE);
          }
          for (const y of [12.6, 16.1, 24.6, 28.1]) {
            graphics.lineBetween(0, y * TILE, 40 * TILE, y * TILE);
          }
          graphics.fillStyle(0xeeb754, 0.4);
          for (const [x, y] of [
            [13.4, 13.4],
            [26.4, 13.4],
            [13.4, 26.4],
            [26.4, 26.4],
          ]) {
            graphics.fillCircle(x * TILE, y * TILE, 2.5);
          }
        }

        private drawTraffic(graphics: Phaser.GameObjects.Graphics) {
          for (const vehicle of [
            { x: 12.25, y: 8.5, w: 11, h: 18, color: 0xd78b45 },
            { x: 25.25, y: 21.5, w: 11, h: 18, color: 0x6da8d6 },
            { x: 20.5, y: 13.25, w: 20, h: 11, color: 0xeeb754 },
            { x: 7.5, y: 25.25, w: 20, h: 11, color: 0x8f7dd6 },
          ]) {
            graphics.fillStyle(vehicle.color, 0.95);
            graphics.fillRoundedRect(vehicle.x * TILE, vehicle.y * TILE, vehicle.w, vehicle.h, 3);
            graphics.fillStyle(0xf7f1d7, 0.85);
            graphics.fillRect(vehicle.x * TILE + 2, vehicle.y * TILE + 2, Math.max(3, vehicle.w - 4), 2);
            graphics.fillStyle(0x101214, 0.55);
            graphics.fillCircle(vehicle.x * TILE + 2, vehicle.y * TILE + vehicle.h - 1, 2);
            graphics.fillCircle(vehicle.x * TILE + vehicle.w - 2, vehicle.y * TILE + vehicle.h - 1, 2);
          }
        }

        private drawRoad(
          graphics: Phaser.GameObjects.Graphics,
          tileX: number,
          tileY: number,
          width: number,
          height: number,
          direction: "horizontal" | "vertical",
        ) {
          graphics.fillStyle(0x343a2d, 1);
          graphics.fillRect(tileX * TILE, tileY * TILE, width * TILE, height * TILE);
          graphics.lineStyle(1, 0x65705d, 0.45);
          if (direction === "horizontal") {
            const y = (tileY + height / 2) * TILE;
            for (let x = tileX * TILE + 8; x < (tileX + width) * TILE; x += 26) {
              graphics.lineBetween(x, y, x + 12, y);
            }
          } else {
            const x = (tileX + width / 2) * TILE;
            for (let y = tileY * TILE + 8; y < (tileY + height) * TILE; y += 26) {
              graphics.lineBetween(x, y, x, y + 12);
            }
          }

          graphics.fillStyle(0xd8d5be, 0.5);
          for (const [cx, cy] of [
            [12, 13],
            [25, 13],
            [12, 25],
            [25, 25],
          ]) {
            for (let i = 0; i < 4; i += 1) {
              graphics.fillRect((cx + i * 0.65) * TILE, (cy + 1.15) * TILE, 7, 2);
              graphics.fillRect((cx + 1.15) * TILE, (cy + i * 0.65) * TILE, 2, 7);
            }
          }
        }

        private drawTreePatch(graphics: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
          graphics.fillStyle(0x274d31, 0.72);
          graphics.fillRoundedRect(x * TILE, y * TILE, w * TILE, h * TILE, 6);
          graphics.fillStyle(0x6f8c5c, 1);
          for (const [tx, ty] of [
            [17, 29],
            [19, 31],
            [22, 29],
            [20, 33],
          ]) {
            graphics.fillCircle(tx * TILE, ty * TILE, 5);
            graphics.fillStyle(0x8c6740, 1);
            graphics.fillRect(tx * TILE - 1, ty * TILE + 4, 2, 5);
            graphics.fillStyle(0x6f8c5c, 1);
          }
        }

        private drawFarmRows(graphics: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
          graphics.fillStyle(0x315c35, 0.5);
          graphics.fillRoundedRect(x * TILE, y * TILE, w * TILE, h * TILE, 6);
          for (let row = 0; row < 5; row += 1) {
            graphics.fillStyle(row % 2 === 0 ? 0x6a7d42 : 0x4f703e, 0.85);
            graphics.fillRect((x + 0.7) * TILE, (y + 0.8 + row) * TILE, (w - 1.4) * TILE, 7);
          }
        }

        private drawLocations(city: CityState) {
          for (const location of city.locations) {
            let container = this.buildings.get(location.location_id);
            if (!container) {
              container = this.add.container(location.x * TILE, location.y * TILE);
              this.buildings.set(location.location_id, container);
            }
            container.removeAll(true);
            const color = locationColor(location.type);
            const rect = this.add
              .rectangle(0, 0, location.width * TILE, location.height * TILE, color, 0.92)
              .setOrigin(0)
              .setStrokeStyle(2, 0x0d0f10, 0.9);
            const roof = this.add
              .rectangle(2, 2, location.width * TILE - 4, 8, 0xffffff, 0.12)
              .setOrigin(0);
            const label = this.add
              .text(6, 12, labelFor(location.name), {
                fontFamily: "Geist, Arial",
                fontSize: "10px",
                color: "#f2f5f1",
              })
              .setDepth(5);
            const details = this.drawBuildingDetails(location);
            container.add([rect, roof, ...details, label]);
          }
        }

        private drawBuildingDetails(location: CityState["locations"][number]) {
          const details: Phaser.GameObjects.GameObject[] = [];
          const w = location.width * TILE;
          const h = location.height * TILE;
          if (location.type === "hospital") {
            details.push(this.add.rectangle(w - 18, 12, 14, 4, 0xfff1ed).setOrigin(0.5));
            details.push(this.add.rectangle(w - 18, 12, 4, 14, 0xfff1ed).setOrigin(0.5));
          }
          if (location.type === "school") {
            details.push(this.add.rectangle(w - 13, 12, 2, 20, 0xe7e0bc).setOrigin(0.5, 0));
            details.push(this.add.triangle(w - 11, 13, 0, 0, 15, 5, 0, 10, 0xeeb754).setOrigin(0, 0.5));
          }
          if (location.type === "bank") {
            for (let i = 0; i < 3; i += 1) {
              details.push(this.add.rectangle(16 + i * 18, h - 18, 5, 24, 0xd6cfb5, 0.75));
            }
          }
          if (location.type === "market") {
            for (let i = 0; i < 4; i += 1) {
              details.push(this.add.rectangle(10 + i * 20, 20, 15, 6, i % 2 ? 0xe05d52 : 0xf1e6c0, 0.9));
            }
          }
          if (location.type === "restaurant") {
            details.push(this.add.circle(w - 18, 18, 8, 0xf1e6c0, 0.9));
            details.push(this.add.rectangle(w - 18, 18, 12, 2, 0xd78b45, 1));
          }
          if (location.type === "pharmacy") {
            details.push(this.add.rectangle(w - 17, 15, 13, 4, 0xffffff, 0.9));
            details.push(this.add.rectangle(w - 17, 15, 4, 13, 0xffffff, 0.9));
          }
          if (location.type === "lab") {
            details.push(this.add.circle(w - 16, 17, 7, 0x68b8a9, 0.9));
            details.push(this.add.rectangle(w - 16, 26, 18, 4, 0x9cc7dc, 0.8));
          }
          if (location.type === "library") {
            details.push(this.add.rectangle(w - 20, 15, 16, 12, 0xe7d7a8, 0.8));
            details.push(this.add.line(w - 20, 15, 0, 0, 15, 11, 0x6b5e8d, 0.8));
          }
          if (location.type === "power") {
            details.push(this.add.triangle(w - 18, 15, 8, 0, 0, 16, 10, 16, 0xeeb754, 0.95));
          }
          if (location.type === "bus_stop") {
            details.push(this.add.rectangle(w / 2, h - 12, w - 10, 4, 0xb9c2c7, 0.8));
            details.push(this.add.rectangle(w / 2, h - 24, w - 8, 5, 0x9cc7dc, 0.65));
          }
          if (location.type === "city_hall") {
            details.push(this.add.circle(w - 17, 17, 8, 0xf0d37b, 0.85));
          }
          return details;
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

          for (const citizen of city.citizens) {
            const x = citizen.x * TILE + TILE / 2;
            const y = citizen.y * TILE + TILE / 2;
            let container = this.citizens.get(citizen.citizen_id);
            if (!container) {
              container = this.add.container(x, y);
              const shadow = this.add.ellipse(0, 8, 14, 5, 0x000000, 0.35);
              const legs = this.add.rectangle(0, 4, 8, 9, 0x25292a, 1).setOrigin(0.5);
              const body = this.add.rectangle(0, -2, 12, 13, professionColor(citizen.profession), 1).setOrigin(0.5);
              body.setStrokeStyle(1, 0x101214, 1);
              const arms = this.add.rectangle(0, -2, 16, 3, skinTone(citizen.citizen_id), 1).setOrigin(0.5);
              const head = this.add.circle(0, -12, 5, skinTone(citizen.citizen_id), 1);
              head.setStrokeStyle(1, 0x151515, 0.8);
              const hair = this.add.arc(0, -14, 5, 180, 360, false, 0x2b211c, 1);
              const leftEye = this.add.circle(-1.8, -12.2, 0.8, 0x151515, 1);
              const rightEye = this.add.circle(1.8, -12.2, 0.8, 0x151515, 1);
              const tool = this.add.rectangle(-5, -6, 3, 8, professionAccent(citizen.profession), 1).setOrigin(0.5);
              const badge = this.add.circle(5, -3, 2.2, moodColor(citizen), 1);
              const text = this.add
                .text(0, 11, professionGlyph(citizen.profession), {
                  fontFamily: "Geist, Arial",
                  fontSize: "10px",
                  color: "#f5f1e8",
                })
                .setOrigin(0.5, 0);
              const nameLabel = this.add
                .text(0, -28, citizen.name.split(" ")[0], {
                  fontFamily: "Geist, Arial",
                  fontSize: "9px",
                  color: "#f7f1d7",
                  backgroundColor: "rgba(10,12,13,0.72)",
                  padding: { x: 3, y: 1 },
                })
                .setOrigin(0.5)
                .setVisible(false);
              container.add([shadow, legs, body, arms, head, hair, leftEye, rightEye, tool, badge, text, nameLabel]);
              container.setData("body", body);
              container.setData("badge", badge);
              container.setData("label", nameLabel);
              container.setData("tool", tool);
              container.setSize(18, 18);
              container.setInteractive(
                new Phaser.Geom.Circle(0, 0, 12),
                Phaser.Geom.Circle.Contains,
              );
              container.on("pointerdown", () => onSelectRef.current(citizen.citizen_id));
              this.citizens.set(citizen.citizen_id, container);
            }

            this.tweens.add({
              targets: container,
              x,
              y,
              scaleX: citizen.citizen_id === this.selected ? 1.16 : 1,
              scaleY: citizen.citizen_id === this.selected ? 1.16 : 1,
              duration: 420,
              ease: "Sine.easeInOut",
            });
            container.setDepth(citizen.citizen_id === this.selected ? 30 : 20);
            const body = container.getData("body") as Phaser.GameObjects.Rectangle;
            const badge = container.getData("badge") as Phaser.GameObjects.Arc;
            const label = container.getData("label") as Phaser.GameObjects.Text;
            const tool = container.getData("tool") as Phaser.GameObjects.Rectangle;
            body.setStrokeStyle(
              citizen.citizen_id === this.selected ? 3 : 1,
              citizen.citizen_id === this.selected ? 0xeeb754 : 0x101214,
              1,
            );
            badge.setFillStyle(moodColor(citizen), 1);
            tool.setFillStyle(professionAccent(citizen.profession), 1);
            label.setVisible(citizen.citizen_id === this.selected);

            if (citizen.citizen_id === this.selected) {
              this.drawSelectedRoute(citizen);
              this.drawThoughtBubble(citizen, x, y);
            }
          }
        }

        private drawSelectedRoute(citizen: CityState["citizens"][number]) {
          this.selectedRoute = this.add.graphics();
          this.selectedRoute.setDepth(18);
          this.selectedRoute.lineStyle(2, 0xeeb754, 0.8);
          this.selectedRoute.beginPath();
          this.selectedRoute.moveTo(citizen.x * TILE + TILE / 2, citizen.y * TILE + TILE / 2);
          this.selectedRoute.lineTo(citizen.target_x * TILE + TILE / 2, citizen.target_y * TILE + TILE / 2);
          this.selectedRoute.strokePath();
          this.selectedRoute.fillStyle(0xeeb754, 0.95);
          this.selectedRoute.fillCircle(citizen.target_x * TILE + TILE / 2, citizen.target_y * TILE + TILE / 2, 4);
        }

        private drawThoughtBubble(citizen: CityState["citizens"][number], x: number, y: number) {
          const thought = citizen.current_thought || citizen.current_activity;
          const text = thought.length > 58 ? `${thought.slice(0, 58)}...` : thought;
          const bubbleX = Math.min(Math.max(x + 14, 8), 40 * TILE - 176);
          const bubbleY = Math.max(y - 42, 8);
          const container = this.add.container(bubbleX, bubbleY).setDepth(45);
          const bg = this.add
            .rectangle(0, 0, 170, 30, 0x101416, 0.92)
            .setOrigin(0)
            .setStrokeStyle(1, 0xeeb754, 0.75);
          const label = this.add.text(8, 6, text, {
            fontFamily: "Geist, Arial",
            fontSize: "10px",
            color: "#f5f1e8",
            wordWrap: { width: 154 },
          });
          const dot = this.add.circle(6, 28, 3, 0xeeb754, 0.9);
          container.add([bg, label, dot]);
          this.thoughtBubble = container;
        }
      }

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: 40 * TILE,
        height: 40 * TILE,
        backgroundColor: "#111416",
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

  return <div ref={containerRef} className="h-full min-h-0 w-full overflow-hidden bg-[#111416]" />;
}

function labelFor(name: string) {
  return name
    .replace("Police Station", "Police")
    .replace("City Hall", "Hall")
    .replace("Bus Stop", "Bus");
}

function locationColor(type: string) {
  const colors: Record<string, number> = {
    home: 0x6f6a4b,
    hospital: 0x7d3f45,
    school: 0x4d6f91,
    bank: 0x6b5e8d,
    market: 0x7b6d34,
    restaurant: 0x8c4f36,
    pharmacy: 0x7d4b64,
    farm: 0x4d7a45,
    police: 0x345f7a,
    city_hall: 0x826247,
    lab: 0x3e6f6b,
    library: 0x5b5d7a,
    power: 0x6f5d3a,
    park: 0x355f3a,
    bus_stop: 0x696f75,
  };
  return colors[type] ?? 0x555b5d;
}

function professionColor(profession: string) {
  const colors: Record<string, number> = {
    Doctor: 0xe05d52,
    Nurse: 0xf28b82,
    Teacher: 0x6da8d6,
    Student: 0x8abf67,
    Engineer: 0xeeb754,
    Driver: 0xb9c2c7,
    Shopkeeper: 0xd78b45,
    Banker: 0x8f7dd6,
    "Police Officer": 0x4f90bc,
    Farmer: 0x5fa45f,
    Mayor: 0xf0d37b,
    Scientist: 0x68b8a9,
    Researcher: 0x68b8a9,
    "Restaurant Cook": 0xdf7b59,
  };
  return colors[profession] ?? 0xd7dce0;
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
  return glyphs[profession] ?? "*";
}

function professionAccent(profession: string) {
  const colors: Record<string, number> = {
    Doctor: 0xfff1ed,
    Nurse: 0xfff1ed,
    Teacher: 0xe7e0bc,
    Student: 0xf0d37b,
    Engineer: 0x101214,
    Driver: 0x343a2d,
    Shopkeeper: 0xf1e6c0,
    Banker: 0xf0d37b,
    "Police Officer": 0x101214,
    Farmer: 0x315c35,
    Mayor: 0x826247,
    Scientist: 0x9cc7dc,
    Researcher: 0x9cc7dc,
    "Restaurant Cook": 0xf1e6c0,
  };
  return colors[profession] ?? 0xf5f1e8;
}

function moodColor(citizen: CityState["citizens"][number]) {
  if (citizen.health < 55) return 0xe05d52;
  if (citizen.stress > 68) return 0xeeb754;
  if (citizen.happiness > 78) return 0x73c58c;
  return 0x8bc1df;
}

function skinTone(citizenId: string) {
  const tones = [0xf0c6a0, 0xd69b74, 0xa96f4b, 0x8d573c, 0xe8b98f];
  const index = Number.parseInt(citizenId.slice(-2), 10) % tones.length;
  return tones[index];
}
