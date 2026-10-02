import { activeCity } from "./cities";

// A scene or a closed case as a picture people can post: the frame from the town, the lines, and where to play.

export type ShareCard = {
  /** Small heading, e.g. "Overheard in Nakameguro" or "Case closed". */
  kicker: string;
  title: string;
  lines: Array<{ name: string; text: string }>;
  /** A frame of the town (data URL), shown behind the heading. */
  backdrop?: string | null;
  verdict?: { text: string; good: boolean };
};

export const SHARE_URL = "ai-agent-city-game.vercel.app";
const W = 1080, H = 1350;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s.,;:!?]+$/, "")}…`;
  }
  return lines;
}

const loadImage = (url: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = url;
});

/** The lines worth quoting: the last couple, which is where a scene lands. */
export function quotable<T extends { text: string }>(transcript: T[], upTo = transcript.length - 1, count = 2) {
  return transcript.slice(Math.max(0, upTo - count + 1), upTo + 1);
}

export async function renderShareCard(card: ShareCard): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#12191c";
  ctx.fillRect(0, 0, W, H);
  const photo = 620;
  const image = card.backdrop ? await loadImage(card.backdrop) : null;
  if (image) {
    const scale = Math.max(W / image.width, photo / image.height);
    ctx.drawImage(image, (W - image.width * scale) / 2, (photo - image.height * scale) / 2, image.width * scale, image.height * scale);
  } else {
    const sky = ctx.createLinearGradient(0, 0, W, photo);
    sky.addColorStop(0, "#28675b");
    sky.addColorStop(1, "#e9a05c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, photo);
  }
  const fade = ctx.createLinearGradient(0, photo - 300, 0, photo);
  fade.addColorStop(0, "#12191c00");
  fade.addColorStop(1, "#12191c");
  ctx.fillStyle = fade;
  ctx.fillRect(0, photo - 300, W, 302);
  ctx.fillRect(0, photo, W, H - photo);

  const sans = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffcf9c";
  ctx.font = `600 30px ${sans}`;
  ctx.fillText(card.kicker.toUpperCase(), 72, photo - 96);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 60px Georgia, serif`;
  wrap(ctx, card.title, W - 144, 2).forEach((line, i, all) => ctx.fillText(line, 72, photo - 28 - (all.length - 1 - i) * 68));

  let y = photo + 70;
  if (card.verdict) {
    ctx.font = `700 34px ${sans}`;
    ctx.fillStyle = card.verdict.good ? "#89ffe0" : "#ff9c8a";
    for (const line of wrap(ctx, card.verdict.text, W - 144, 3)) { ctx.fillText(line, 72, y); y += 46; }
    y += 26;
  }
  const room = H - 150 - y;
  const perLine = Math.max(2, Math.floor(room / Math.max(1, card.lines.length) / 50) - 1);
  for (const line of card.lines) {
    ctx.fillStyle = "#89ffe0";
    ctx.font = `700 30px ${sans}`;
    ctx.fillText(line.name, 72, y);
    y += 48;
    ctx.fillStyle = "#f4faf7";
    ctx.font = `400 38px ${sans}`;
    for (const part of wrap(ctx, `“${line.text}”`, W - 144, perLine)) { ctx.fillText(part, 72, y); y += 50; }
    y += 28;
  }
  ctx.fillStyle = "#ffffff22";
  ctx.fillRect(72, H - 118, W - 144, 2);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 32px ${sans}`;
  ctx.fillText("AgentCity", 72, H - 62);
  ctx.fillStyle = "#b9d2cb";
  ctx.font = `400 28px ${sans}`;
  ctx.fillText(`Stories of ${activeCity().name}`, 250, H - 62);
  ctx.textAlign = "right";
  ctx.fillText(SHARE_URL, W - 72, H - 62);
  ctx.textAlign = "left";
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

/** Shares the card through the device's share sheet, or saves the picture where there isn't one. */
export async function shareCard(card: ShareCard): Promise<"shared" | "saved" | "failed"> {
  const blob = await renderShareCard(card);
  if (!blob) return "failed";
  const file = new File([blob], "nakameguro-scene.jpg", { type: "image/jpeg" });
  const text = `${card.title}: a scene from AgentCity, a town of AI neighbours. https://${SHARE_URL}`;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: card.title, text });
      return "shared";
    }
  } catch (error) {
    // Closing the share sheet is a choice, not an error.
    if ((error as Error)?.name === "AbortError") return "shared";
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "saved";
}
