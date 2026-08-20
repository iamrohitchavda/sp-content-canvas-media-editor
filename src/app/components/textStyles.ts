import type { CSSProperties } from "react";

/**
 * Text treatments, named by the job they do rather than by how they look.
 *
 * "Neon" and "Typewriter" mean nothing to someone running a café, and inviting
 * them to pick a look invites a decorative choice they will get wrong. Naming by
 * purpose means the user picks *what the thing is* and the design comes free.
 *
 * Sizes are in 1080-wide canvas units, matching the compositions.
 */
export interface TextStyle {
  id: string;
  label: string;
  style: (accent: string) => CSSProperties;
}

export const TEXT_STYLES: TextStyle[] = [
  {
    id: "headline",
    label: "Headline",
    style: () => ({
      fontSize: "96px",
      fontWeight: 900,
      color: "#fff",
      lineHeight: 1.1,
      letterSpacing: "-1px",
      textShadow: "0 2px 12px rgba(0,0,0,0.55)",
      margin: 0,
    }),
  },
  {
    id: "price",
    label: "Price tag",
    style: (accent) => ({
      display: "inline-block",
      fontSize: "72px",
      fontWeight: 900,
      color: "#fff",
      background: accent,
      padding: "14px 40px",
      borderRadius: "60px",
      boxShadow: `0 10px 36px ${accent}66`,
      margin: 0,
    }),
  },
  {
    id: "label",
    label: "Label",
    style: (accent) => ({
      display: "inline-block",
      fontSize: "36px",
      fontWeight: 700,
      letterSpacing: "6px",
      textTransform: "uppercase",
      color: "#fff",
      background: accent,
      padding: "12px 32px",
      borderRadius: "6px",
      margin: 0,
    }),
  },
  {
    id: "caption",
    label: "Caption",
    style: () => ({
      fontSize: "48px",
      fontWeight: 400,
      color: "rgba(255,255,255,0.88)",
      lineHeight: 1.4,
      textShadow: "0 2px 8px rgba(0,0,0,0.5)",
      margin: 0,
    }),
  },
];
