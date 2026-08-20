import type { CSSProperties } from "react";
import type {
  Align,
  ExtraLayer,
  LayerDef,
  Motion,
  Position,
  SpringFeel,
  TemplateDef,
  TemplateState,
} from "../templates/schema";
import { SAFE_X } from "../templates/schema";
import type { VariantOption } from "../templates/schema";
import { enterProgress, normalizeFeel } from "./AnimationPlayer";
import { TEXT_STYLES } from "./textStyles";
import { BADGES } from "./badges";
import { STICKER_REGISTRY } from "../templates/art";
import { ShapeGlyph, resolveShapeColor } from "./shapes";

/** A badge-style text layer's own curated backgrounds — never a clip-path
 *  shaped for a square sticker, since these boxes are short and wide. */
export const BADGE_TEXT_FRAME_VARIANTS: VariantOption[] = [
  { id: "pill", label: "Pill" },
  { id: "rounded", label: "Rounded" },
  { id: "sharp", label: "Sharp" },
  { id: "tag", label: "Tag" },
];

export const BADGE_TEXT_FRAME_CSS: Record<string, CSSProperties> = {
  pill: { borderRadius: "999px" },
  rounded: { borderRadius: "14px" },
  sharp: { borderRadius: "0px" },
  tag: { borderRadius: "4px", clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 4% 100%, 0% 50%)" },
};

/**
 * Draws a template's layers from data.
 *
 * Takes `frame` as a prop rather than calling Remotion's `useCurrentFrame()`,
 * so one renderer serves both hosts: inside Remotion a thin wrapper feeds it the
 * live frame; the edit canvas passes a settled frame and Remotion is not
 * involved at all. That is what makes the same pixels both playable and
 * directly editable.
 */

/** How `x` is interpreted, given the layer's alignment. */
const TRANSLATE: Record<Align, string> = {
  left: "translateX(0)",
  center: "translateX(-50%)",
  right: "translateX(-100%)",
};

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

/**
 * The entrance for one element: the geometry decides *what* moves, the post's
 * single spring feel decides *how* — motion is common architecture across the
 * whole post, not a per-element choice. Opacity rises on a short linear ramp
 * so the element is visible while the spring settles its position — the
 * overshoot then reads as a physical settle rather than a stop.
 */
export function motionStyle(motion: Motion, frame: number, fps: number, postFeel: SpringFeel): CSSProperties {
  // "None" feel → everything is static from the first frame, no entrance at all.
  if (postFeel === "none") return {};
  if (motion.type === "none") return {};
  const fadeFrames = motion.type === "fade" ? 18 : 10;
  const opacity = clamp01((frame - motion.delay) / fadeFrames);
  if (motion.type === "fade") return { opacity };

  const p = enterProgress(frame, fps, postFeel, motion.delay);
  if (motion.type === "pop") return { opacity, transform: `scale(${p})` };
  // slide-up: an overshooting spring lets p exceed 1, so the element rises just
  // past its mark and settles back — the M3E bounce.
  return { opacity, transform: `translateY(${(1 - p) * 96}px)` };
}

/** Wraps one element at its position, with its entrance applied. */
function Positioned({
  id,
  position,
  motion,
  frame,
  fps,
  postFeel,
  width,
  height,
  interactive,
  maxWidthFrac,
  fixedWidth,
  children,
}: {
  id: string;
  position: Position;
  motion: Motion;
  frame: number;
  fps: number;
  postFeel: SpringFeel;
  width: number;
  height: number;
  interactive?: boolean;
  /** Wrap width as a fraction of the canvas; falls back to the safe area. */
  maxWidthFrac?: number;
  /**
   * Renders as a real box at that width rather than shrinking to the content.
   *
   * A shrink-to-fit box hugs whatever text happens to be there, so on short
   * copy the selection outline and the wrap handle end up hard against the
   * letters — nowhere near where a longer line would actually wrap. A fixed
   * width makes the box *be* the column, so hover, selection and the handle
   * all land on the real wrap boundary, the way a text box works in Figma or
   * Canva. Alignment is unaffected: `textAlign` still does the positioning
   * within the box, so left/centre/right output the same pixels either way.
   */
  fixedWidth?: boolean;
  children: React.ReactNode;
}) {
  const inner = motionStyle(motion, frame, fps, postFeel);
  const boxWidth = (maxWidthFrac ?? 1 - 2 * SAFE_X) * width;
  // The entrance transform lives on an inner element so it never fights the
  // alignment transform that positions the layer.
  return (
    <div
      // The edit canvas finds layers by this attribute rather than measuring
      // its way through the tree, so hit-testing survives any change to how a
      // layer draws itself.
      data-layer-id={id}
      style={{
        position: "absolute",
        left: `${position.x * width}px`,
        top: `${position.y * height}px`,
        transform: TRANSLATE[position.align],
        textAlign: position.align,
        ...(fixedWidth ? { width: `${boxWidth}px` } : { maxWidth: `${boxWidth}px` }),
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "grab" : undefined,
      }}
    >
      <div style={inner}>{children}</div>
    </div>
  );
}

export function LayerCanvas({
  template,
  state,
  frame,
  fps,
  width,
  height,
  interactive,
  soloId,
}: {
  template: TemplateDef;
  state: TemplateState;
  frame: number;
  fps: number;
  width: number;
  height: number;
  /** Edit mode: layers accept pointer events so they can be selected/dragged. */
  interactive?: boolean;
  /** When set, only this element plays `frame` — every other element renders
   *  at the post's settled last frame, as if its own entrance already
   *  finished. Used to preview one element's Motion change in isolation,
   *  rather than replaying the whole post around it. */
  soloId?: string | null;
}) {
  const postFeel = normalizeFeel(state.values.animationStyle as string | undefined);
  const accent = String(state.values.accentColor ?? template.previewColor);
  const settledFrame = template.durationInFrames - 1;
  const frameFor = (id: string) => (soloId && id !== soloId ? settledFrame : frame);
  const renderProps = { values: state.values, accent, frame, width, height };

  const inRange = (item: { startFrame?: number; endFrame?: number }, at: number) =>
    at >= (item.startFrame ?? 0) && at < (item.endFrame ?? Number.POSITIVE_INFINITY);
  const visible = template.layers.filter((l) => {
    const layerState = state.layers[l.id];
    return layerState?.visible !== false && inRange(layerState ?? {}, frame);
  });

  return (
    <>
      {template.ambient ? <template.ambient {...renderProps} /> : null}

      {visible.map((layer) => {
        const ls = state.layers[layer.id];
        const pos = ls ?? layer.position;
        // Paragraph text carries an adjustable wrap width and needs a real
        // box at that width; a badge-style chip (has its own frame variants)
        // and artwork both shrink to their own content instead, so their hit
        // box always matches what's actually drawn — not the full safe area a
        // wrapping paragraph would otherwise default to.
        const isChip = Boolean(layer.frameVariants);
        const maxWidthFrac = layer.kind === "text" && !isChip ? ls?.textWidth : undefined;
        // A sticker or chip's own colour, if set, stands in for the post accent only
        // for that one element — text keeps its separate colour override.
        const layerAccent = (layer.kind === "custom" || isChip) && ls?.colorOverride ? ls.colorOverride : accent;
        const layerRenderProps = layerAccent === accent ? renderProps : { ...renderProps, accent: layerAccent };
        // An element's own spring feel and entrance geometry, if set, stand
        // in for the post's authored defaults only for that one element —
        // same pattern as its own colour.
        const layerFeel = ls?.motionFeel ? normalizeFeel(ls.motionFeel) : postFeel;
        const layerMotion = ls?.motionType ? { ...layer.motion, type: ls.motionType } : layer.motion;
        const layerFrame = Math.max(0, frameFor(layer.id) - (ls?.startFrame ?? 0));
        return (
          <Positioned
            key={layer.id}
            id={layer.id}
            interactive={interactive}
            position={pos}
            motion={layerMotion}
            frame={layerFrame}
            fps={fps}
            postFeel={layerFeel}
            width={width}
            height={height}
            maxWidthFrac={maxWidthFrac}
            fixedWidth={layer.kind === "text" && !isChip}
          >
            <LayerBody
              layer={layer}
              accent={layerAccent}
              renderProps={layerFrame === frame ? layerRenderProps : { ...layerRenderProps, frame: layerFrame }}
              overrides={ls?.overrides}
              variant={ls?.variant ?? layer.defaultVariant}
              frameVariant={ls?.frameVariant ?? layer.defaultFrameVariant}
            />
          </Positioned>
        );
      })}

      {state.extras.filter((extra) => inRange(extra, frame)).map((extra) => {
        const extraFeel = extra.motionFeel ? normalizeFeel(extra.motionFeel) : postFeel;
        const extraMotion = extra.motionType ? { ...extra.motion, type: extra.motionType } : extra.motion;
        const extraFrame = Math.max(0, frameFor(extra.id) - (extra.startFrame ?? 0));
        const progress = enterProgress(extraFrame, fps, extraFeel, extraMotion.delay);
        return (
          <Positioned
            key={extra.id}
            id={extra.id}
            interactive={interactive}
            position={extra.position}
            motion={extraMotion}
            frame={extraFrame}
            fps={fps}
            postFeel={extraFeel}
            width={width}
            height={height}
            maxWidthFrac={extra.kind === "text" ? extra.textWidth : undefined}
            fixedWidth={extra.kind === "text"}
          >
            <ExtraBody extra={extra} accent={accent} progress={progress} canvasWidth={width} canvasHeight={height} frame={extraFrame} />
          </Positioned>
        );
      })}
    </>
  );
}

function LayerBody({
  layer,
  accent,
  renderProps,
  overrides,
  variant,
  frameVariant,
}: {
  layer: LayerDef;
  accent: string;
  renderProps: Parameters<NonNullable<LayerDef["render"]>>[0];
  /** Raw typography knobs on top of the layer's authored style, or — for a
   *  sticker with `hasInternalText` — on its own internal text. */
  overrides?: import("../templates/schema").TextOverrides;
  /** Which of the sticker's own curated variants to draw. */
  variant?: string;
  /** Which of a badge-text layer's own curated frames to draw. */
  frameVariant?: string;
}) {
  if (layer.kind === "custom" && layer.render) {
    // Every sticker reads `overrides.sizePct` for its own whole-element Size
    // control now, not just the ones with internal text (which additionally
    // read colour/font for their digits) — pass overrides through always.
    return <layer.render {...renderProps} variant={variant} overrides={overrides} />;
  }
  const text = String(renderProps.values[layer.textKey ?? ""] ?? "");
  if (!text) return null;
  const style = applyOverrides(layer.style?.(accent) ?? {}, overrides);
  const frameCss = layer.frameVariants ? BADGE_TEXT_FRAME_CSS[frameVariant ?? ""] : undefined;
  // Text is always constrained by Positioned's column width. `overflowWrap`
  // also handles a long URL or a word without spaces, which otherwise has no
  // natural wrapping point and can escape the 9:16 canvas.
  const textLayout: CSSProperties = {
    maxWidth: "100%",
    boxSizing: "border-box",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  };
  return <div style={{ ...style, ...frameCss, ...textLayout }}>{text}</div>;
}

/** Layers the typography overrides on top of a resolved base style — only
 *  present keys apply, everything else still comes from the base treatment.
 *  Size is a percentage of whatever base size the treatment set, so it scales
 *  the treatment rather than replacing it with an absolute number. */
function applyOverrides(style: CSSProperties, ov?: import("../templates/schema").TextOverrides): CSSProperties {
  if (!ov) return style;
  const next: CSSProperties = { ...style };
  if (ov.fontFamily) next.fontFamily = ov.fontFamily;
  if (ov.fontWeight) next.fontWeight = ov.fontWeight;
  if (ov.italic) next.fontStyle = "italic";
  if (ov.color) next.color = ov.color;
  if (ov.sizePct) {
    const base = parseFloat(String(style.fontSize ?? "")) || 0;
    if (base) next.fontSize = `${(base * ov.sizePct) / 100}px`;
  }
  return next;
}

function ExtraBody({
  extra,
  accent,
  progress,
  canvasWidth,
  canvasHeight,
  frame,
}: {
  extra: ExtraLayer;
  accent: string;
  /** Entrance progress 0..1, for a `kind:"shape"` element's morph-in. */
  progress: number;
  canvasWidth: number;
  canvasHeight: number;
  /** For a duplicated built-in sticker — these still run their own frame-
   *  driven micro-animation (a star's pop-in stagger, a badge's pulse) the
   *  same as the original layer does. */
  frame: number;
}) {
  if (extra.kind === "text") {
    const style = TEXT_STYLES.find((s) => s.id === extra.styleId) ?? TEXT_STYLES[0];
    const base = applyOverrides(style.style(accent), extra.overrides);
    const frameCss = extra.frameVariant ? BADGE_TEXT_FRAME_CSS[extra.frameVariant] : undefined;
    return <div style={{
      ...base,
      ...frameCss,
      maxWidth: "100%",
      boxSizing: "border-box",
      whiteSpace: "normal",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
    }}>{extra.text}</div>;
  }
  if (extra.kind === "shape") {
    const px = Math.max(24, extra.size * canvasWidth);
    return (
      <div style={{ width: `${px}px`, height: `${px}px` }}>
        <ShapeGlyph shapeId={extra.shapeId} color={resolveShapeColor(extra.color, accent)} progress={progress} />
      </div>
    );
  }
  if (extra.kind === "sticker") {
    const reg = STICKER_REGISTRY[extra.componentId];
    if (!reg) return null;
    const stickerAccent = extra.colorOverride ?? accent;
    const values = reg.valuesKey ? { [reg.valuesKey]: extra.value ?? reg.valueField?.default ?? 0 } : {};
    return (
      <reg.render
        values={values}
        accent={stickerAccent}
        frame={frame}
        width={canvasWidth}
        height={canvasHeight}
        variant={extra.variant ?? reg.defaultVariant}
        overrides={extra.overrides}
      />
    );
  }
  const badge = BADGES.find((b) => b.id === extra.badgeId) ?? BADGES[0];
  return <badge.render accent={extra.colorOverride ?? accent} textColor={extra.textColorOverride} value={extra.value} text={extra.text} />;
}
