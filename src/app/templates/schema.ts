import type { CSSProperties, FC } from "react";

/* ------------------------------------------------------------------ fields */

export interface NumberField {
  key: string;
  type: "number";
  label: string;
  default: number;
  min: number;
  max: number;
}

export interface TextField {
  key: string;
  type: "text";
  label: string;
  default: string;
  maxLength: number;
  /** Hide the n/max counter — for short structured values (price, phone). */
  showCount?: boolean;
}

export interface ColorField {
  key: string;
  type: "color";
  label: string;
  default: string;
}

export interface SelectField {
  key: string;
  type: "select";
  label: string;
  default: string;
  options: { value: string; label: string }[];
  /** Show options as pills instead of a dropdown. */
  variant?: "dropdown" | "pills";
}

export type FieldDef = NumberField | TextField | ColorField | SelectField;

/* --------------------------------------------------------------- placement */

export type Align = "left" | "center" | "right";

/**
 * A point on the canvas, normalised 0–1 so it survives any preview size.
 *
 * `align` decides what `x` refers to — the element's left edge, centre, or
 * right edge. That is what lets several independently positioned lines share an
 * edge and still read as a designed group.
 */
export interface Position {
  x: number;
  y: number;
  align: Align;
}

/**
 * The nine named positions. No longer a layout mode — every element is freely
 * positioned now. These survive as snap targets while dragging, as the preset
 * buttons in the panel, and as the vocabulary Auto-place chooses from.
 */
export type Anchor =
  | "top-left"    | "top-center"    | "top-right"
  | "middle-left" | "middle-center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export const ANCHORS: Anchor[] = [
  "top-left",    "top-center",    "top-right",
  "middle-left", "middle-center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
];

/** Keep content clear of the canvas edges and platform UI overlays. */
export const SAFE_X = 0.075;
export const SAFE_Y = 0.055;

/** Where each named anchor sits, in normalised canvas space. */
export function anchorToPosition(anchor: Anchor): Position {
  const [v, h] = anchor.split("-") as ["top" | "middle" | "bottom", Align];
  const x = h === "left" ? SAFE_X : h === "right" ? 1 - SAFE_X : 0.5;
  const y = v === "top" ? SAFE_Y : v === "bottom" ? 1 - SAFE_Y : 0.5;
  return { x, y, align: h };
}

/** Nearest named anchor to a position — used to label the current placement. */
export function positionToAnchor(pos: Position): Anchor {
  const h = pos.x < 0.34 ? "left" : pos.x > 0.66 ? "right" : "center";
  const v = pos.y < 0.34 ? "top" : pos.y > 0.66 ? "bottom" : "middle";
  return `${v}-${h}` as Anchor;
}

/* ------------------------------------------------------------------ motion */

/** Entrance geometry — *what* moves as an element enters. */
export type MotionType = "fade" | "slide-up" | "pop" | "none";

/**
 * Spring character — *how* it moves. Material 3 Expressive's motion is physical:
 * things settle with real spring physics, not eased curves. Named by feel, never
 * by stiffness/damping numbers.
 */
export type SpringFeel = "spatial" | "gentle" | "snappy" | "none";

export interface Motion {
  type: MotionType;
  /** Frame at which this element starts animating in. */
  delay: number;
}

/* ------------------------------------------------------------------ layers */

export interface LayerRenderProps {
  /** Resolved values for this layer's fields, plus the template's globals. */
  values: FieldValues;
  accent: string;
  frame: number;
  /** Canvas dimensions, for anything that needs to size against them. */
  width: number;
  height: number;
  /** Which curated rendering variant a sticker draws — e.g. an outline vs a
   *  filled star. Falls back to the layer's own `defaultVariant`. */
  variant?: string;
  /** Manual typography knobs on a sticker's own internal text (a discount
   *  badge's "%", a tip's number) — only present for stickers whose content
   *  is text, and only used when `LayerDef.hasInternalText` opts a layer in. */
  overrides?: TextOverrides;
  /** A swatch-picker hint: render the smallest recognisable unit of this
   *  sticker rather than its full authored content — currently only read by
   *  `RatingRow`, which otherwise always draws its whole 5-star row even at
   *  swatch scale, where the point is "which star style," not "how many." */
  previewSingle?: boolean;
}

/** One curated rendering variant a sticker can offer — never a free-form shape
 *  swap, always scoped to forms that still read as that sticker. */
export interface VariantOption {
  id: string;
  label: string;
}

/**
 * One addressable element of a template.
 *
 * Templates used to be hand-written JSX, which cannot be dragged — you can't
 * move a piece of hardcoded markup to an arbitrary point. Describing each
 * element instead makes selection, dragging, inline editing and add/remove all
 * fall out of the same data.
 */
export interface LayerDef {
  id: string;
  /** Shown in the layer list and as the panel heading. */
  label: string;
  icon: string;
  kind: "text" | "custom";
  /**
   * Binds this layer's text to copy the AI already wrote for the post, so the
   * user never meets a blank box. Falls back to the field default when the post
   * has nothing to offer.
   */
  source?: "post.headline" | "post.hook" | "post.cta";
  /** The field holding this layer's text, for `kind: "text"`. */
  textKey?: string;
  /** Visual treatment for `kind: "text"`. */
  style?: (accent: string) => CSSProperties;
  /** Bespoke artwork — a badge, a map pin — for `kind: "custom"`. */
  render?: FC<LayerRenderProps>;
  /** A sticker's own curated rendering variants — e.g. a star drawn outline,
   *  filled, or bold. Scoped to that sticker; never the general shape library. */
  variants?: VariantOption[];
  /** Which of `variants` this layer renders as until the user picks another. */
  defaultVariant?: string;
  /** True when a sticker's content is itself text (a discount's "%", a tip's
   *  number) — opts it into the same typography controls text elements get. */
  hasInternalText?: boolean;
  /** A badge-style text layer's own curated background frames — a pill, a
   *  sharp tag. Only set on chip-treatment layers, never on paragraph text. */
  frameVariants?: VariantOption[];
  /** Which of `frameVariants` this layer renders as until the user picks
   *  another. */
  defaultFrameVariant?: string;
  /** Scale factor for this layer's own render inside a fixed-size swatch
   *  (e.g. a variant picker). Sticker components have wildly different
   *  intrinsic footprints — a pin is a fraction of a badge's size — so a
   *  single scale leaves some swatches looking near-empty. Falls back to a
   *  scale tuned for a mid-size sticker. */
  previewScale?: number;
  /**
   * How far this layer's own rendered box extends below its `position.y`
   * anchor, as a fraction of the canvas height. Text's real extent already
   * falls out of comparing anchor points against its neighbours, so this is
   * for elements whose visual size the anchor point alone doesn't capture —
   * chiefly a large, fixed-size sticker like a circular discount badge.
   * Without it, Shuffle's placement only ever kept anchor points apart, so a
   * 440px badge could still visually overlap a text block whose anchor sat a
   * "safe"-looking distance below it.
   */
  footprint?: number;
  /**
   * Default wrap width for `kind: "text"`, as a fraction of the canvas.
   * Falls back to the standard safe-area width — set this when a layer lives
   * in a narrower space (a compact card column) than the full safe area.
   */
  textWidth?: number;
  /** Fields this layer owns, surfaced when it is selected. */
  fields: FieldDef[];
  position: Position;
  motion: Motion;
}

export interface TemplateDef {
  id: string;
  name: string;
  category: string;
  description: string;
  previewColor: string;
  /** Representative emoji shown in the Templates list — the photo crop that
   *  used to sit there was too small to read at a glance; a colour + icon
   *  tile is legible at any size. */
  icon: string;
  /** Applies to the whole template: animation style, accent colour. */
  globalFields: FieldDef[];
  layers: LayerDef[];
  /** Ambient effects that are not addressable elements (e.g. confetti). */
  ambient?: FC<LayerRenderProps>;
  /** Whether to darken behind the busiest region so type stays legible. */
  scrim?: boolean;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------- state */

export type FieldValues = Record<string, string | number>;

export interface LayerState {
  visible: boolean;
  x: number;
  y: number;
  align: Align;
  /** Normalised wrap width for text layers, as a fraction of canvas width. */
  textWidth?: number;
  /** Which of a sticker layer's own curated variants is showing; falls back
   *  to the layer's `defaultVariant`. */
  variant?: string;
  /** Which of a badge-text layer's own curated frames is showing; falls back
   *  to the layer's `defaultFrameVariant`. */
  frameVariant?: string;
  /** A sticker's own colour, independent of the post's overall accent — the
   *  overall accent still applies when this is unset. */
  colorOverride?: string;
  /** Manual per-property typography overrides — the only text customization
   *  surface; there is no separate named-preset picker to fall back to. */
  overrides?: TextOverrides;
  /** This element's own spring feel, independent of the post's overall
   *  motion — the post's feel still applies when this is unset. Motion used
   *  to be one post-wide setting; now every element can move to its own
   *  rhythm the same way it can carry its own colour. */
  motionFeel?: SpringFeel;
  /** This element's own entrance geometry (fade / slide up / pop) — falls
   *  back to whatever the layer was authored with when unset. Feel alone
   *  ("how bouncy") wasn't enough to show for anything: an element visibly
   *  sliding up vs. popping open is the more obvious part of "how does this
   *  move," and it used to be fixed at authoring time with no way to change it. */
  motionType?: MotionType;
  /** Inclusive/exclusive frame range on a video timeline. Undefined means
   * the element spans the complete composition. */
  startFrame?: number;
  endFrame?: number;
}

/** A shape's fill: a semantic post colour, neutral, or a palette/custom hex. */
export type ColorRole = "accent" | "white" | "dark" | (string & {});

/**
 * Raw typography controls, layered on top of a text element's base treatment
 * (font/weight/style/size/colour) — the only text customisation surface.
 * Only present keys apply; everything else still comes from the treatment.
 */
export interface TextOverrides {
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  /** Percentage of the treatment's own base size, e.g. 120 = 120%. */
  sizePct?: number;
  color?: string;
}

export type ExtraLayer =
  | {
      id: string;
      kind: "text";
      text: string;
      /** Fixed at creation — which base treatment (from `textStyles.ts`) this
       *  text renders on top of; not user-switchable. */
      styleId: string;
      textWidth?: number;
      /** Set only when this text originated from (or was styled as) a
       *  badge-style chip — its curated background frame (Pill/Rounded/
       *  Sharp/Tag). Without this, duplicating a chip-text layer (e.g. a
       *  "Featured" label) dropped its shape and left plain text behind. */
      frameVariant?: string;
      overrides?: TextOverrides;
      /** This element's own spring feel, independent of the post's overall
       *  motion. */
      motionFeel?: SpringFeel;
      /** This element's own entrance geometry, independent of the post's
       *  authored default. */
      motionType?: MotionType;
      position: Position;
      motion: Motion;
      startFrame?: number;
      endFrame?: number;
    }
  | {
      id: string;
      kind: "badge";
      badgeId: string;
      /** For a sticker with an embedded editable value (a percentage, a number). */
      value?: number;
      /** For a sticker whose own words are editable ("OPEN NOW" → "OPEN
       *  LATE") — falls back to the badge's own default copy when unset. */
      text?: string;
      /** This instance's own colour, independent of the post's overall
       *  accent — without it, selecting an inserted badge had nothing of its
       *  own to show in the inspector beyond the same picker used to add it. */
      colorOverride?: string;
      textColorOverride?: string;
      /** This element's own spring feel, independent of the post's overall
       *  motion. */
      motionFeel?: SpringFeel;
      /** This element's own entrance geometry, independent of the post's
       *  authored default. */
      motionType?: MotionType;
      position: Position;
      motion: Motion;
      startFrame?: number;
      endFrame?: number;
    }
  | {
      id: string;
      kind: "shape";
      shapeId: string;
      color: ColorRole;
      /** Width as a fraction of canvas width; shapes render in a 1:1 box. */
      size: number;
      /** This element's own spring feel, independent of the post's overall
       *  motion. */
      motionFeel?: SpringFeel;
      /** This element's own entrance geometry, independent of the post's
       *  authored default. */
      motionType?: MotionType;
      position: Position;
      motion: Motion;
      startFrame?: number;
      endFrame?: number;
    }
  | {
      id: string;
      kind: "sticker";
      /** Key into `STICKER_REGISTRY` (art.tsx) — which built-in sticker
       *  component this duplicate renders. A plain string rather than the
       *  component itself, so this stays JSON-serialisable the way every
       *  other extra is. */
      componentId: string;
      variant?: string;
      /** This instance's own colour, independent of the post's overall
       *  accent — same idea as a template layer's `colorOverride`. */
      colorOverride?: string;
      /** Typography knobs on the sticker's own internal text, for
       *  components whose `STICKER_REGISTRY` entry has `hasInternalText`. */
      overrides?: TextOverrides;
      /** The sticker's own editable field (a discount %, a star count, a tip
       *  number) — snapshotted at duplication time, independent of the
       *  original's value the way duplicated text is independent copy. */
      value?: number;
      /** This element's own spring feel, independent of the post's overall
       *  motion. */
      motionFeel?: SpringFeel;
      /** This element's own entrance geometry, independent of the post's
       *  authored default. */
      motionType?: MotionType;
      position: Position;
      motion: Motion;
      startFrame?: number;
      endFrame?: number;
    };

/** A short, collision-proof id for a user-added element. */
export function newExtraId(): string {
  return `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Everything the editor knows about the current template.
 *
 * This whole object travels in Remotion's `inputProps` — the serialisation
 * boundary to the renderer. Anything kept outside it would be missing from an
 * exported MP4, so hidden layers would silently reappear.
 */
export interface TemplateState {
  values: FieldValues;
  layers: Record<string, LayerState>;
  extras: ExtraLayer[];
}

/** Copy the AI produced for this post, bound into layers via `source`. */
export interface PostCopy {
  headline?: string;
  hook?: string;
  cta?: string;
}

function resolveSource(layer: LayerDef, post: PostCopy | undefined): string | undefined {
  if (!layer.source || !post) return undefined;
  const key = layer.source.split(".")[1] as keyof PostCopy;
  const value = post[key];
  return value && value.trim() ? value : undefined;
}

export function getDefaults(template: TemplateDef, post?: PostCopy): TemplateState {
  const values: FieldValues = {};
  for (const field of template.globalFields) values[field.key] = field.default;

  const layers: Record<string, LayerState> = {};
  for (const layer of template.layers) {
    for (const field of layer.fields) values[field.key] = field.default;

    // Post copy wins over the template's placeholder, so no blank boxes and no
    // asking the user to rewrite what the AI already produced.
    const fromPost = resolveSource(layer, post);
    if (fromPost && layer.textKey) values[layer.textKey] = fromPost;

    layers[layer.id] = {
      visible: true,
      ...layer.position,
      ...(layer.kind === "text" ? { textWidth: layer.textWidth ?? 1 - 2 * SAFE_X } : {}),
    };
  }

  return { values, layers, extras: [] };
}

/** Reset placement only — the "Tidy up" action. Text and visibility survive. */
export function tidyPositions(template: TemplateDef, state: TemplateState): TemplateState {
  const layers: Record<string, LayerState> = {};
  for (const layer of template.layers) {
    layers[layer.id] = {
      visible: state.layers[layer.id]?.visible ?? true,
      ...layer.position,
      textWidth: state.layers[layer.id]?.textWidth ?? layer.textWidth,
    };
  }
  return { ...state, layers };
}

/** Layers a post cannot lose — the last visible one cannot be hidden. */
export function canHide(state: TemplateState): boolean {
  return Object.values(state.layers).filter((l) => l.visible).length > 1;
}

/** The on-canvas position of any element, whether a template layer or an extra. */
export function elementPosition(state: TemplateState, id: string): Position | null {
  const layer = state.layers[id];
  if (layer) return { x: layer.x, y: layer.y, align: layer.align };
  const extra = state.extras.find((e) => e.id === id);
  return extra ? extra.position : null;
}

/** Whether an id refers to a user-added element rather than a template layer. */
export function isExtra(state: TemplateState, id: string): boolean {
  return !state.layers[id] && state.extras.some((e) => e.id === id);
}
