import type { LayerRenderProps } from "../templates/schema";
import { sp } from "../theme";
import type { Badge } from "./badges";
import { SHAPES, shapePathD } from "./shapes";

/**
 * Live, scaled-down previews of a badge/sticker/shape — recognition, not
 * label-reading. Shared between the per-element "which variant is this"
 * pickers in CustomizePanel and the Shape tab's browse-and-insert grid, so
 * both surfaces render the exact same swatch for the exact same thing.
 */

/** A live, scaled-down preview of a badge, so picking one is recognition,
 *  not label-reading — badges render real (large) markup, so the preview
 *  shrinks it into a fixed swatch and clips whatever spills over. */
export function BadgeSwatch({
  badge,
  accent,
  selected,
  onClick,
}: {
  badge: Badge;
  accent: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={badge.label}
      aria-label={badge.label}
      onClick={onClick}
      style={{
        width: "68px",
        height: "44px",
        padding: "6px",
        borderRadius: "8px",
        border: `2px solid ${selected ? sp.blue : sp.borderSub}`,
        background: "none",
        cursor: "pointer",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxSizing: "border-box",
      }}
    >
      <div style={{ transform: `scale(${badge.previewScale ?? 0.16})`, flexShrink: 0 }}>
        <badge.render accent={accent} value={badge.valueField?.default} text={badge.defaultText} />
      </div>
    </button>
  );
}

/** A live preview of one of a sticker's own curated variants — same rendering
 *  pattern as `BadgeSwatch`, driven off the layer's real render function so
 *  the swatch is never out of sync with what selecting it actually produces. */
export function StickerVariantSwatch({
  render: Render,
  variant,
  label,
  accent,
  scale,
  selected,
  onClick,
}: {
  render: React.FC<LayerRenderProps>;
  variant: string;
  label: string;
  accent: string;
  /** Sticker components have very different intrinsic footprints (a pin is
   *  a fraction of a badge's size) — falls back to a scale tuned for a
   *  mid-size sticker when the layer doesn't specify its own. */
  scale?: number;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={{
        width: "56px",
        height: "56px",
        borderRadius: "8px",
        border: `2px solid ${selected ? sp.blue : sp.borderSub}`,
        background: "none",
        cursor: "pointer",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div style={{ transform: `scale(${scale ?? 0.095})`, flexShrink: 0 }}>
        <Render values={{}} accent={accent} frame={999} width={1080} height={1920} variant={variant} previewSingle />
      </div>
    </button>
  );
}

export function ShapeSwatch({
  shapeId,
  selected,
  onClick,
}: {
  shapeId: string;
  selected?: boolean;
  onClick: () => void;
}) {
  const shape = SHAPES.find((s) => s.id === shapeId);
  return (
    <button
      type="button"
      title={shape?.label ?? shapeId}
      aria-label={shape?.label ?? shapeId}
      onClick={onClick}
      style={{
        width: "38px",
        height: "38px",
        padding: "6px",
        borderRadius: "8px",
        border: `2px solid ${selected ? sp.blue : sp.borderSub}`,
        background: "none",
        cursor: "pointer",
        color: sp.textSecondary,
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <path d={shapePathD(shapeId)} fill="currentColor" />
      </svg>
    </button>
  );
}
