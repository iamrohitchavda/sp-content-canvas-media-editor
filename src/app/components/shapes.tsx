import type { CSSProperties } from "react";
import type { ColorRole } from "../templates/schema";

/**
 * Material 3 Expressive's shape library — the signature move of the vibe this
 * whole layer model chases. Every shape is sampled to the same number of
 * boundary points, so any shape can morph into any other by lerping point
 * arrays directly. This is a deliberately pragmatic stand-in for Android's
 * `androidx.graphics.shapes` "matched features" morphing (see the plan's note
 * on evaluating a port first) — same effect, far less code: a shape is a
 * closed polar curve sampled at N points, smoothed into an SVG path with a
 * Catmull-Rom spline, and a morph is just a per-point lerp between two shapes'
 * point sets since they share N and a shared centring convention.
 */

type Pt = [number, number];

/** Every shape samples to this many boundary points, so any pair morphs directly. */
const N = 24;

function fromRadius(r: (theta: number) => number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * Math.PI * 2;
    const rad = Math.max(0.02, r(theta));
    pts.push([rad * Math.cos(theta), rad * Math.sin(theta)]);
  }
  return pts;
}

/** A regular polygon's radius at angle theta, blended toward a circle by
 *  `rounding` (0 = sharp polygon, 1 = circle) — the M3 "squircle" continuum. */
function polygonR(sides: number, rounding = 0, rotate = 0) {
  const step = (Math.PI * 2) / sides;
  return (theta: number) => {
    const t = theta + rotate;
    const a = (((t % step) + step) % step) - step / 2;
    const sharp = Math.cos(Math.PI / sides) / Math.cos(a);
    return sharp * (1 - rounding) + rounding;
  };
}

/** A circle modulated by one or two angular lobes — stars, bursts, cookies,
 *  clovers and flowers are all one family, just different lobe counts/depths. */
function lobedR(k: number, amp: number, phase = 0, k2?: number, amp2 = 0, phase2 = 0) {
  return (theta: number) => {
    let r = 1 + amp * Math.cos(k * theta + phase);
    if (k2) r += amp2 * Math.cos(k2 * theta + phase2);
    return Math.max(0.15, r);
  };
}

function squash(pts: Pt[], sx: number, sy: number): Pt[] {
  return pts.map(([x, y]) => [x * sx, y * sy]);
}

/** Flattens one side of a round shape toward a straight edge — arches, tabs. */
function flattenSide(pts: Pt[], side: "top" | "bottom", amount: number): Pt[] {
  return pts.map(([x, y]) => {
    if (side === "bottom" && y > 0) return [x, y * (1 - amount)];
    if (side === "top" && y < 0) return [x, y * (1 - amount)];
    return [x, y];
  });
}

/** A sharp downward point against an otherwise round body — a map pin, as a
 *  shape rather than bespoke art. A Gaussian dip centred on the bottom angle
 *  keeps this a plain, robust radius function (always positive, no special
 *  casing) instead of hand-placed teardrop geometry. */
function pinR() {
  const target = Math.PI / 2; // the "bottom" angle, given fromRadius's y = sin(theta)
  return (theta: number) => {
    let d = Math.abs(theta - target);
    if (d > Math.PI) d = 2 * Math.PI - d;
    const dip = Math.exp(-((d / 0.55) ** 2));
    return Math.max(0.05, 1 - 0.94 * dip);
  };
}

function heartRaw(): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push([x, y]);
  }
  return pts;
}

/** Recentres on its own bounding box and scales to fill [-1,1] — the shared
 *  framing convention every shape (even an off-centre one like an arch) needs
 *  so morphing between any two always reads at a consistent scale. */
function fitBox(pts: Pt[]): Pt[] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY) / 2 || 1;
  return pts.map(([x, y]) => [(x - cx) / half, (y - cy) / half]);
}

/* ------------------------------------------------------------------ library */

export interface ShapeDef {
  id: string;
  label: string;
  points: Pt[];
}

const RAW: { id: string; label: string; gen: () => Pt[] }[] = [
  { id: "circle", label: "Circle", gen: () => fromRadius(() => 1) },
  { id: "square", label: "Square", gen: () => fromRadius(polygonR(4, 0.12)) },
  { id: "squircle", label: "Squircle", gen: () => fromRadius(polygonR(4, 0.45)) },
  { id: "triangle", label: "Triangle", gen: () => fromRadius(polygonR(3, 0.14, Math.PI / 2)) },
  { id: "diamond", label: "Diamond", gen: () => fromRadius(polygonR(4, 0.05, Math.PI / 4)) },
  { id: "gem", label: "Gem", gen: () => fromRadius(polygonR(4, 0.3, Math.PI / 4)) },
  { id: "pentagon", label: "Pentagon", gen: () => fromRadius(polygonR(5, 0.14, -Math.PI / 2)) },
  { id: "hexagon", label: "Hexagon", gen: () => fromRadius(polygonR(6, 0.12)) },
  { id: "clamshell", label: "Clamshell", gen: () => fromRadius(polygonR(6, 0.5, Math.PI / 6)) },
  { id: "pill", label: "Pill", gen: () => squash(fromRadius(() => 1), 1.7, 0.85) },
  { id: "oval", label: "Oval", gen: () => squash(fromRadius(() => 1), 1.35, 0.95) },
  { id: "slanted", label: "Slanted", gen: () => fromRadius(polygonR(4, 0.35, Math.PI / 6)) },
  { id: "arch", label: "Arch", gen: () => flattenSide(fromRadius(() => 1), "bottom", 0.75) },
  { id: "semicircle", label: "Semicircle", gen: () => flattenSide(fromRadius(() => 1), "bottom", 1) },
  { id: "tab", label: "Tab", gen: () => flattenSide(fromRadius(polygonR(4, 0.3)), "bottom", 0.5) },
  { id: "arrow", label: "Arrow", gen: () => fromRadius(lobedR(1, 0.42, Math.PI)) },
  { id: "fan", label: "Fan", gen: () => fromRadius(lobedR(1, 0.5, 0)) },
  { id: "boom", label: "Boom", gen: () => fromRadius(lobedR(5, 0.34)) },
  { id: "soft-boom", label: "Soft boom", gen: () => fromRadius(lobedR(5, 0.2)) },
  { id: "sunny", label: "Sunny", gen: () => fromRadius(lobedR(8, 0.28)) },
  { id: "very-sunny", label: "Very sunny", gen: () => fromRadius(lobedR(12, 0.24)) },
  { id: "burst", label: "Burst", gen: () => fromRadius(lobedR(6, 0.38)) },
  { id: "soft-burst", label: "Soft burst", gen: () => fromRadius(lobedR(6, 0.22)) },
  { id: "cookie-4", label: "Cookie 4", gen: () => fromRadius(lobedR(4, 0.24)) },
  { id: "cookie-6", label: "Cookie 6", gen: () => fromRadius(lobedR(6, 0.2)) },
  { id: "cookie-7", label: "Cookie 7", gen: () => fromRadius(lobedR(7, 0.19)) },
  { id: "cookie-9", label: "Cookie 9", gen: () => fromRadius(lobedR(9, 0.16)) },
  { id: "cookie-12", label: "Cookie 12", gen: () => fromRadius(lobedR(12, 0.13)) },
  { id: "clover-4", label: "Clover 4", gen: () => fromRadius(lobedR(4, 0.5)) },
  { id: "clover-8", label: "Clover 8", gen: () => fromRadius(lobedR(8, 0.3)) },
  { id: "flower", label: "Flower", gen: () => fromRadius(lobedR(5, 0.28, 0, 10, 0.06)) },
  { id: "puffy", label: "Puffy", gen: () => fromRadius(lobedR(4, 0.1, Math.PI / 4)) },
  { id: "puffy-diamond", label: "Puffy diamond", gen: () => fromRadius(lobedR(4, 0.22, Math.PI / 4, 8, 0.05)) },
  { id: "bun", label: "Bun", gen: () => flattenSide(fromRadius(lobedR(6, 0.08)), "bottom", 0.35) },
  { id: "wave", label: "Wave", gen: () => fromRadius(lobedR(5, 0.14, Math.PI / 5)) },
  { id: "pixel-circle", label: "Pixel circle", gen: () => fromRadius(lobedR(16, 0.05)) },
  { id: "pixel-triangle", label: "Pixel triangle", gen: () => fromRadius(polygonR(3, 0.02, Math.PI / 2)) },
  { id: "heart", label: "Heart", gen: heartRaw },
  { id: "star", label: "Star", gen: () => fromRadius(lobedR(5, 0.62, Math.PI / 2)) },
  { id: "star-soft", label: "Soft star", gen: () => fromRadius(lobedR(5, 0.28, Math.PI / 2)) },
  { id: "star-sharp", label: "Sharp star", gen: () => fromRadius(lobedR(5, 0.85, Math.PI / 2)) },
  { id: "star-round", label: "Round star", gen: () => fromRadius(lobedR(5, 0.46, Math.PI / 2)) },
  { id: "pin", label: "Pin", gen: () => fromRadius(pinR()) },
];

export const SHAPES: ShapeDef[] = RAW.map(({ id, label, gen }) => ({ id, label, points: fitBox(gen()) }));
export const SHAPE_OPTIONS = SHAPES.map((s) => ({ value: s.id, label: s.label }));

function findShape(id: string): ShapeDef {
  return SHAPES.find((s) => s.id === id) ?? SHAPES[0];
}

function lerpPts(a: Pt[], b: Pt[], t: number): Pt[] {
  const n = Math.min(a.length, b.length);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) out.push([a[i][0] + (b[i][0] - a[i][0]) * t, a[i][1] + (b[i][1] - a[i][1]) * t]);
  return out;
}

/** Smooth closed curve through N points via Catmull-Rom → cubic Bezier, mapped
 *  into a 0..100 viewBox with a small margin so rounded corners never clip.
 *  Collinear runs (a sampled straight polygon edge) stay straight under
 *  Catmull-Rom, so "sharp" shapes still render with crisp edges and only their
 *  corners get the soft M3 rounding. */
function pathFromPoints(pts: Pt[]): string {
  const n = pts.length;
  const M = 46;
  const at = (i: number): Pt => {
    const [x, y] = pts[((i % n) + n) % n];
    return [50 + x * M, 50 + y * M];
  };
  const p0 = at(0);
  let d = `M ${p0[0].toFixed(2)} ${p0[1].toFixed(2)} `;
  for (let i = 0; i < n; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), e = at(i + 2);
    const c1: Pt = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2: Pt = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += `C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${c[0].toFixed(2)} ${c[1].toFixed(2)} `;
  }
  return d + "Z";
}

export function shapePathD(id: string): string {
  return pathFromPoints(findShape(id).points);
}

/** The path for a shape mid-entrance: morphs from a plain circle into the
 *  target shape as `progress` runs 0→1, so the overshoot of the spring driving
 *  it and the change of silhouette read as one physical motion. */
export function morphedPathD(toId: string, progress: number): string {
  const t = Math.min(1, Math.max(0, progress));
  if (t >= 1) return shapePathD(toId);
  if (t <= 0) return shapePathD("circle");
  return pathFromPoints(lerpPts(findShape("circle").points, findShape(toId).points, t));
}

export function resolveShapeColor(role: ColorRole, accent: string): string {
  if (role === "white") return "#ffffff";
  if (role === "dark") return "#15181d";
  return role === "accent" ? accent : role;
}

export const COLOR_ROLE_OPTIONS: { value: ColorRole; label: string }[] = [
  { value: "accent", label: "Accent" },
  { value: "white", label: "White" },
  { value: "dark", label: "Dark" },
];

/** A standalone shape element, filling its box, morphing in from a circle as
 *  it enters. */
export function ShapeGlyph({
  shapeId,
  color,
  progress,
  style,
}: {
  shapeId: string;
  color: string;
  /** Entrance progress 0..1 — 0 shows the base circle, 1 the target shape. */
  progress: number;
  style?: CSSProperties;
}) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={style} aria-hidden="true">
      <path d={morphedPathD(shapeId, progress)} fill={color} />
    </svg>
  );
}
