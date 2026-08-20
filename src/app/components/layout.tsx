import type { CSSProperties } from "react";
import type { TemplateState } from "../templates/schema";

/**
 * A darkening layer behind the type, so it stays legible over any photo.
 *
 * It used to follow a single anchor, because every text element lived in one
 * stack. Now that each element is positioned independently, the scrim follows
 * wherever the content actually clusters.
 */
export type ScrimRegion = "top" | "middle" | "bottom";

/** Where the visible layers sit, on average — drives the scrim. */
export function scrimRegion(state: TemplateState): ScrimRegion {
  const ys = Object.values(state.layers).filter((l) => l.visible).map((l) => l.y);
  if (!ys.length) return "bottom";
  const avg = ys.reduce((a, b) => a + b, 0) / ys.length;
  return avg < 0.4 ? "top" : avg > 0.6 ? "bottom" : "middle";
}

export function Scrim({ region, opacity = 1 }: { region: ScrimRegion; opacity?: number }) {
  // Deliberately light: the type already carries its own drop shadow, so the
  // scrim only needs to lift contrast a little, not paint a black slab over the
  // photo. The middle case was the worst offender — a centred element used to
  // dim the whole subject — so it gets the gentlest treatment of the three.
  const style: CSSProperties =
    region === "middle"
      ? {
          inset: 0,
          background:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 38%, rgba(0,0,0,0.2) 62%, transparent 100%)",
        }
      : region === "top"
        ? {
            top: 0,
            left: 0,
            right: 0,
            height: "46%",
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.16) 52%, transparent 100%)",
          }
        : {
            bottom: 0,
            left: 0,
            right: 0,
            height: "46%",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.16) 52%, transparent 100%)",
          };

  return <div style={{ position: "absolute", pointerEvents: "none", opacity, ...style }} />;
}
