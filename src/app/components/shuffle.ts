import type { TemplateDef, TemplateState, TextOverrides, LayerDef } from "../templates/schema";
import { SAFE_X, SAFE_Y } from "../templates/schema";
import { FEEL_OPTIONS } from "./AnimationPlayer";
import type { SpringFeel } from "../templates/schema";
import { STICKER_REGISTRY } from "../templates/art";

/** Same curated font stacks as the Font control in CustomizePanel — no web
 *  fonts are loaded, so this stays a small, system-safe set rather than
 *  inventing new ones just for Shuffle. `""` means "the treatment's own
 *  default", same as picking "Default" by hand. */
const FONT_STACKS = {
  default: "",
  serif: "Georgia, 'Times New Roman', serif",
  rounded: "ui-rounded, 'SF Pro Rounded', 'Segoe UI', sans-serif",
  mono: "'SF Mono', 'Courier New', monospace",
  condensed: "'Arial Narrow', sans-serif",
} as const;

/**
 * Re-rolls the look into another good-looking combination.
 *
 * The point is to remove a decision, not to offer more of them. Someone with
 * ninety seconds between customers cannot evaluate a colour wheel, but they can
 * tap a button until they like what they see — so every possible result has to
 * be acceptable. A shuffle rolls a coordinated *look* — accent, motion feel and
 * shape family move together as one curated combination, never independently —
 * plus the group's placement. Three rules make every result acceptable:
 *
 *   1. Colours, feels and shape families come from a curated `LOOKS` table,
 *      never assembled from independent random picks that could clash.
 *   2. The group moves as a whole, preserving each element's offset from the
 *      others. The template's composition is the part that was designed; only
 *      where it sits changes.
 *   3. Shapes (pure decoration, no fixed meaning) are fair game to re-roll.
 *      Stickers (`OPEN NOW`, a discount %) carry the post's actual message, so
 *      shuffle never changes *which* sticker is showing — only its colour and
 *      placement, same as any other element.
 */

/** A curated shape family, so several shapes on one post read as one choice
 *  rather than a random assortment. */
const SHAPE_FAMILIES: string[][] = [
  ["circle", "squircle", "oval", "pill", "clamshell", "bun"],
  ["square", "triangle", "diamond", "pentagon", "hexagon", "gem", "slanted"],
  ["star", "burst", "soft-burst", "sunny", "very-sunny", "cookie-6", "cookie-9", "clover-4", "clover-8", "flower", "puffy", "boom", "soft-boom"],
];

/** A look = the handful of choices that have to agree with each other for a
 *  shuffle result to feel designed rather than assembled. `type` is the same
 *  three controls the Properties tab exposes for text (Font/Weight/Style) —
 *  curated per look so a shuffle's typography reads as one choice made
 *  alongside the colour and shape family, not a fourth independent roll.
 *  Size is deliberately not part of this: it's a per-element fit decision
 *  (how much room this specific line has), not a look-wide trait. */
interface Look {
  accent: string;
  family: string[];
  feel: SpringFeel;
  type: { fontFamily: string; fontWeight: number; italic?: boolean };
}

const LOOKS: Look[] = [
  { accent: "#F5A623", family: SHAPE_FAMILIES[0], feel: "spatial", type: { fontFamily: FONT_STACKS.rounded, fontWeight: 600 } },
  { accent: "#FF6B35", family: SHAPE_FAMILIES[1], feel: "snappy", type: { fontFamily: FONT_STACKS.condensed, fontWeight: 800 } },
  { accent: "#8B5CF6", family: SHAPE_FAMILIES[2], feel: "spatial", type: { fontFamily: FONT_STACKS.default, fontWeight: 800, italic: true } },
  { accent: "#0EA5E9", family: SHAPE_FAMILIES[0], feel: "gentle", type: { fontFamily: FONT_STACKS.serif, fontWeight: 400 } },
  { accent: "#10B981", family: SHAPE_FAMILIES[1], feel: "gentle", type: { fontFamily: FONT_STACKS.default, fontWeight: 600 } },
  { accent: "#EC4899", family: SHAPE_FAMILIES[2], feel: "snappy", type: { fontFamily: FONT_STACKS.rounded, fontWeight: 800 } },
  { accent: "#14B8A6", family: SHAPE_FAMILIES[0], feel: "spatial", type: { fontFamily: FONT_STACKS.mono, fontWeight: 600 } },
  { accent: "#6366F1", family: SHAPE_FAMILIES[1], feel: "spatial", type: { fontFamily: FONT_STACKS.default, fontWeight: 800, italic: true } },
];

/** Extra horizontal variety for centre-anchored elements — a left/right-
 *  anchored element (Service Spotlight's price, say) already sits at its
 *  align's safe margin and stays there; this only nudges the elements that
 *  are free to move, so a shuffle isn't just "top or bottom" forever. Modest
 *  enough that even a full-width centred line stays inside the safe margins. */
const X_BIAS = [-0.08, 0, 0.08] as const;

function pickDifferent<T>(options: readonly T[], current: T): T {
  const others = options.filter((o) => o !== current);
  if (!others.length) return current;
  return others[Math.floor(Math.random() * others.length)];
}

/**
 * How far a wrapping paragraph's own box actually extends below its anchor,
 * as a fraction of canvas height — a rough estimate (average character
 * width, so real wrapping will differ from this for any given font), but a
 * badge-sized miss here is exactly the bug it exists to catch: a two-line
 * "Mon–Sat 9am – 7pm" whose real height was invisible to the placement math
 * could end up shifted low enough to clip past the bottom of the frame
 * entirely, not just past the safe margin.
 */
function textFootprint(layer: LayerDef, state: TemplateState, template: TemplateDef): number {
  if (layer.kind !== "text" || layer.frameVariants?.length) return 0; // chips shrink to fit — never wrap
  const text = String(state.values[layer.textKey ?? ""] ?? "");
  if (!text) return 0;
  const accent = String(state.values.accentColor ?? template.previewColor);
  const style = layer.style?.(accent) ?? {};
  const fontSizePx = parseFloat(String(style.fontSize ?? "40")) || 40;
  const lineHeightMult = Number(style.lineHeight) || 1.2;
  const boxWidthPx = (layer.textWidth ?? 1 - 2 * SAFE_X) * template.width;
  const charsPerLine = Math.max(1, Math.floor(boxWidthPx / (fontSizePx * 0.55)));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return (lines * fontSizePx * lineHeightMult) / template.height;
}

/** Merges a look's typography into an element's existing overrides — colour
 *  and size are untouched, since those aren't part of the look. */
function withType(overrides: TextOverrides | undefined, type: Look["type"]): TextOverrides {
  return { ...overrides, fontFamily: type.fontFamily || undefined, fontWeight: type.fontWeight, italic: type.italic };
}

export function shuffle(state: TemplateState, template: TemplateDef): TemplateState {
  const values = { ...state.values };

  const look = pickDifferent(
    LOOKS,
    LOOKS.find((l) => l.accent === state.values.accentColor) ?? LOOKS[0],
  );
  values.accentColor = look.accent;
  values.animationStyle = FEEL_OPTIONS.find((o) => o.value === look.feel)!.value;

  // Shapes are pure decoration — re-roll each to a different shape from the
  // look's family, so several on one post still read as one coordinated
  // choice. A shape's `color` is a role (accent/white/dark), not a hex, so an
  // "accent" shape already follows the new accent above with no touch needed.
  // Stickers keep their own content and colour; only typography, colour-role
  // and placement follow the look below.
  const extras = state.extras.map((extra) => {
    if (extra.kind === "shape") return { ...extra, shapeId: pickDifferent(look.family, extra.shapeId) };
    if (extra.kind === "text") return { ...extra, overrides: withType(extra.overrides, look.type) };
    if (extra.kind === "sticker" && STICKER_REGISTRY[extra.componentId]?.hasInternalText) {
      return { ...extra, overrides: withType(extra.overrides, look.type) };
    }
    return extra;
  });

  // Move the group, keeping its internal arrangement intact.
  const visible = Object.entries(state.layers).filter(([, l]) => l.visible);
  const layers = { ...state.layers };

  // A sticker's own curated variant, and a badge-text layer's own curated
  // frame, are as much "which shape is this" as the standalone shapes above —
  // re-roll them too so a shuffle covers every combination the template
  // offers, not just placement. Font/weight/style follow the look the same
  // way accent and shape family do; colour overrides and size are left
  // alone — those are the user's own choices, not part of the coordinated
  // look.
  for (const layer of template.layers) {
    const current = layers[layer.id];
    if (!current) continue;
    if (layer.variants?.length) {
      const ids = layer.variants.map((v) => v.id);
      const from = current.variant ?? layer.defaultVariant ?? ids[0];
      layers[layer.id] = { ...current, variant: pickDifferent(ids, from) };
    }
    if (layer.frameVariants?.length) {
      const ids = layer.frameVariants.map((v) => v.id);
      const from = layers[layer.id].frameVariant ?? layer.defaultFrameVariant ?? ids[0];
      layers[layer.id] = { ...layers[layer.id], frameVariant: pickDifferent(ids, from) };
    }
    if (layer.kind === "text" || layer.hasInternalText) {
      layers[layer.id] = { ...layers[layer.id], overrides: withType(layers[layer.id].overrides, look.type) };
    }
  }

  if (visible.length) {
    // A template like Service Spotlight already has a header cluster near
    // the top and a footer cluster near the bottom — together they span
    // almost the whole canvas, so treating "every visible layer" as one
    // rigid block left the block's own height eating up nearly all the
    // headroom: "move to top" and "move to bottom" collapsed to nearly the
    // same position, which is what read as "shuffle does nothing." Splitting
    // by each layer's *authored* half (from the template, not the current,
    // already-shuffled position) keeps a header a header and a footer a
    // footer, and gives each cluster its own real room to move within its
    // own half.
    const clusters: Record<"top" | "bottom", [string, { x: number; y: number; align: string }][]> = {
      top: [],
      bottom: [],
    };
    for (const [id, ls] of visible) {
      const authoredY = template.layers.find((l) => l.id === id)?.position.y ?? ls.y;
      clusters[authoredY < 0.5 ? "top" : "bottom"].push([id, ls]);
    }

    // A cluster's true bottom edge is its lowest member's own visual bottom —
    // its anchor plus whatever it renders below that anchor — not just the
    // spread between members' anchor points. Without `footprint`, a large,
    // fixed-size element (a circular discount badge, say) had its real size
    // invisible to this math entirely, so a text block one cluster over could
    // land at a position that looked clear by anchor point alone but was
    // actually still covered by the badge.
    const GAP = 0.04;
    const footprintOf = (id: string) => {
      const l = template.layers.find((l) => l.id === id);
      if (!l) return 0;
      return Math.max(l.footprint ?? 0, textFootprint(l, state, template));
    };
    const clusterSpan = (members: [string, { y: number }][]) => {
      const top = Math.min(...members.map(([, l]) => l.y));
      const bottomEdge = Math.max(...members.map(([id, l]) => l.y + footprintOf(id)));
      return { top, height: bottomEdge - top };
    };

    const topSpan = clusters.top.length ? clusterSpan(clusters.top) : null;
    const bottomSpan = clusters.bottom.length ? clusterSpan(clusters.bottom) : null;

    // The top cluster's two candidate positions: hugging the safe margin, or
    // as close to centre as its own height allows.
    const topCandidates = topSpan
      ? [SAFE_Y, Math.max(SAFE_Y, 0.5 - GAP / 2 - topSpan.height)]
      : null;
    // The worst case (largest) bottom edge the top cluster could actually end
    // up at, regardless of which of its two candidates gets picked — used so
    // the bottom cluster's own candidates are chosen with full knowledge of
    // how far up the top cluster might reach, not just the nominal midline.
    const topWorstBottomEdge = topCandidates ? Math.max(...topCandidates) + (topSpan?.height ?? 0) : 0.5 - GAP / 2;

    const bottomCandidates = bottomSpan
      ? [
          Math.min(1 - SAFE_Y - bottomSpan.height, Math.max(0.5 + GAP / 2, topWorstBottomEdge + GAP)),
          1 - SAFE_Y - bottomSpan.height,
        ]
      : null;

    for (const half of ["top", "bottom"] as const) {
      const members = clusters[half];
      if (!members.length) continue;

      const span = half === "top" ? topSpan! : bottomSpan!;
      const candidates = (half === "top" ? topCandidates : bottomCandidates)!;

      const current = candidates.reduce((a, b) => (Math.abs(b - span.top) < Math.abs(a - span.top) ? b : a));
      const target = pickDifferent(candidates, current);
      const shift = target - span.top;

      for (const [id, layer] of members) {
        // Base off `layers[id]`, not the destructured `layer` — the sticker
        // variant/frame reroll above already wrote into `layers`, and
        // spreading the original pre-reroll object here would silently
        // discard it.
        layers[id] = { ...layers[id], y: clamp(layer.y + shift, SAFE_Y, 1 - SAFE_Y) };
      }
    }

    // Horizontal variety, on top of vertical: nudge centre-anchored elements
    // to a different bias so the group isn't always dead-centre — left- and
    // right-anchored elements keep their own alignment's margin untouched.
    const centerLayers = visible.filter(([, l]) => l.align === "center");
    if (centerLayers.length) {
      const currentBias = centerLayers[0][1].x - 0.5;
      const currentSnap = X_BIAS.reduce((a, b) => (Math.abs(b - currentBias) < Math.abs(a - currentBias) ? b : a));
      const nextBias = pickDifferent(X_BIAS, currentSnap);
      const xShift = nextBias - currentBias;
      for (const [id] of centerLayers) {
        layers[id] = { ...layers[id], x: clamp(layers[id].x + xShift, SAFE_X, 1 - SAFE_X) };
      }
    }
  }

  return { ...state, values, layers, extras };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

