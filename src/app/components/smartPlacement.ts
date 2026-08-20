import type { Anchor, Position } from "../templates/schema";
import { ANCHORS, anchorToPosition } from "../templates/schema";

/**
 * Finds the quietest region of a photo, so type never lands on a face or a busy
 * patch.
 *
 * Draws the image tiny, then scores each cell of a 3x3 grid by how much the
 * luminance varies within it. Flat sky or a plain wall scores low; a face,
 * text or clutter scores high. The lowest-scoring cell wins.
 *
 * Middle cells are penalised because the subject of a photo is usually centred,
 * and type over a face is the worst outcome — worse than type in a slightly
 * busier corner.
 */

const GRID = 3;
const SAMPLE_W = 36;
const SAMPLE_H = 64;
/** Middle row and column pay this much extra, in normalised variance units. */
const CENTRE_PENALTY = 0.15;

export interface PlacementScore {
  anchor: Anchor;
  business: number;
}

export async function analysePhoto(src: string): Promise<PlacementScore[]> {
  const img = await loadImage(src);

  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  // Cover-fit, matching how the photo is displayed, so the analysis reflects
  // what the user actually sees rather than the whole source image.
  const scale = Math.max(SAMPLE_W / img.width, SAMPLE_H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (SAMPLE_W - w) / 2, (SAMPLE_H - h) / 2, w, h);

  const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
  const cellW = SAMPLE_W / GRID;
  const cellH = SAMPLE_H / GRID;

  const scores: PlacementScore[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const lum: number[] = [];
      for (let y = Math.floor(row * cellH); y < Math.floor((row + 1) * cellH); y++) {
        for (let x = Math.floor(col * cellW); x < Math.floor((col + 1) * cellW); x++) {
          const i = (y * SAMPLE_W + x) * 4;
          lum.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
        }
      }
      const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
      const variance = lum.reduce((a, v) => a + (v - mean) ** 2, 0) / lum.length;

      const isCentreRow = row === 1;
      const isCentreCol = col === 1;
      const penalty = (isCentreRow ? CENTRE_PENALTY : 0) + (isCentreCol ? CENTRE_PENALTY / 2 : 0);

      scores.push({ anchor: ANCHORS[row * GRID + col], business: variance + penalty });
    }
  }

  return scores.sort((a, b) => a.business - b.business);
}

/**
 * The calmest place to put something on this photo.
 *
 * On a typical portrait the quiet regions — a plain wall, an empty desk — are
 * near-tied, so a single deterministic winner lands in the same corner every
 * time and reads as "it always goes there". Passing the element's current
 * anchor makes repeated taps step to the next-quietest region instead, so
 * auto-place explores the calm spots the way Shuffle explores the palette.
 */
export async function suggestPosition(src: string, currentAnchor?: Anchor): Promise<Position | null> {
  const scores = await analysePhoto(src);
  if (!scores.length) return null;

  // The clearly-quiet regions: those within twice the quietest cell's score,
  // and always at least three so repeated taps have somewhere fresh to land.
  // On a portrait this is the ring of corners around the centred subject.
  const best = scores[0].business;
  let quiet = scores.filter((s) => s.business <= best * 2);
  if (quiet.length < 3) quiet = scores.slice(0, 3);

  // Step to the next quiet region after wherever the element sits now, wrapping
  // around, so taps walk through every calm spot rather than flipping between
  // the same two.
  const idx = quiet.findIndex((s) => s.anchor === currentAnchor);
  const next = idx === -1 ? quiet[0] : quiet[(idx + 1) % quiet.length];
  return anchorToPosition(next.anchor);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Local bundled assets are same-origin, so the canvas is never tainted.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
