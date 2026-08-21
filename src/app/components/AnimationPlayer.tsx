import type { SpringFeel } from "../templates/schema";

/**
 * How elements enter the frame — Material 3 Expressive motion physics.
 *
 * Entrances are driven by real springs, not eased curves, so they settle with a
 * physical overshoot instead of stopping dead. The *feel* is one post-wide
 * default (any element can override it), named by how it moves rather than by
 * stiffness/damping numbers the user should never have to think about.
 */
// "None" isn't offered here — Entrance already has its own "None" (no motion
// at all), and having two independent switches that could each unilaterally
// kill motion was exactly what made the pair confusing. Feel only ever
// describes *how* a motion that's actually happening moves.
export const FEEL_OPTIONS: { value: SpringFeel; label: string }[] = [
  { value: "spatial", label: "Bouncy" },
  { value: "gentle", label: "Gentle" },
  { value: "snappy", label: "Snappy" },
];

const KNOWN: SpringFeel[] = ["spatial", "gentle", "snappy", "none"];

/** Old easing-based style names map forward onto the nearest spring feel. */
const LEGACY_STYLE_MAP: Record<string, SpringFeel> = {
  "slide-up": "spatial",
  fade: "gentle",
  pop: "snappy",
  bounce: "spatial",
  zoom: "snappy",
  "smooth-rise": "spatial",
  "quick-pop": "snappy",
  "soft-fade": "gentle",
  drift: "gentle",
};

export const DEFAULT_FEEL: SpringFeel = "spatial";

export function normalizeFeel(style: string | undefined): SpringFeel {
  if (style && KNOWN.includes(style as SpringFeel)) return style as SpringFeel;
  if (style && LEGACY_STYLE_MAP[style]) return LEGACY_STYLE_MAP[style];
  return DEFAULT_FEEL;
}

/** Spring configs, each a distinct physical character. */
const SPRING_CONFIG: Record<Exclude<SpringFeel, "none">, { damping: number; mass: number; stiffness: number }> = {
  // Visible overshoot — the tactile M3E "spatial" spring.
  spatial: { damping: 12, mass: 1, stiffness: 130 },
  // Overdamped: rises smoothly and settles with no bounce.
  gentle: { damping: 40, mass: 1, stiffness: 150 },
  // Fast, with just a hint of overshoot.
  snappy: { damping: 18, mass: 0.7, stiffness: 300 },
};

/**
 * Entrance progress 0 → 1 (may briefly exceed 1 for springs that overshoot).
 * Feeds transforms directly, so the overshoot reads as a settle, not a stop.
 */
export function enterProgress(frame: number, fps: number, feel: SpringFeel, delay: number): number {
  if (feel === "none") return frame >= delay ? 1 : 0;
  const t = Math.max(0, (frame - delay) / fps);
  const { damping, mass, stiffness } = SPRING_CONFIG[feel];
  const omega = Math.sqrt(stiffness / mass);
  const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));

  // Unit step response of a real damped spring. This mirrors the physics
  // used by Content Canvas / Remotion: spatial visibly overshoots, gentle is
  // overdamped with no bounce, and snappy reaches the target much sooner.
  if (dampingRatio < 1) {
    const dampedOmega = omega * Math.sqrt(1 - dampingRatio * dampingRatio);
    return 1 - Math.exp(-dampingRatio * omega * t) * (
      Math.cos(dampedOmega * t) + (dampingRatio / Math.sqrt(1 - dampingRatio * dampingRatio)) * Math.sin(dampedOmega * t)
    );
  }
  if (Math.abs(dampingRatio - 1) < 0.0001) return 1 - (1 + omega * t) * Math.exp(-omega * t);
  const root = Math.sqrt(dampingRatio * dampingRatio - 1);
  const r1 = -omega * (dampingRatio - root);
  const r2 = -omega * (dampingRatio + root);
  return 1 + (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r1 - r2);
}


export type Interpolate = (
  frame: number,
  inputRange: number[],
  outputRange: number[],
  options?: { extrapolateLeft?: "clamp" | "extend"; extrapolateRight?: "clamp" | "extend" }
) => number;

/**
 * A clamped, ease-out interpolate for the bespoke frame animations inside custom
 * artwork (staggered stars, a badge pulse, a bobbing pin). These are internal
 * loops and staggers, not the element's entrance — the entrance is the spring
 * above, applied to the whole layer by `LayerCanvas`.
 */
export function createInterpolate(feel?: string): Interpolate {
  // "None" feel → internal micro-animations (star staggers, badge pulses) are
  // fully settled from the first frame, matching the static entrance.
  if (feel === "none") {
    return (_frame, _inputRange, outputRange) => outputRange[outputRange.length - 1];
  }
  return (frame, inputRange, outputRange) => {
    const i = Math.max(0, Math.min(inputRange.length - 2, inputRange.findIndex((_value, index) => index < inputRange.length - 1 && frame <= inputRange[index + 1])));
    const from = inputRange[i], to = inputRange[i + 1];
    const p = Math.max(0, Math.min(1, (frame - from) / (to - from || 1)));
    const eased = 1 - Math.pow(1 - p, 3);
    return outputRange[i] + (outputRange[i + 1] - outputRange[i]) * eased;
  };
}
