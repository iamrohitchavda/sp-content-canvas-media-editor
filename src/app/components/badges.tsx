import type { FC } from "react";

/**
 * Stickers — pre-composed, meaningful content, unlike a shape (a pure
 * geometric form with no fixed meaning). "OPEN NOW" or "30% OFF" is a sticker
 * because what it says is the point; a circle or a star is a shape because its
 * silhouette is the point. See `shapes.tsx` for the shape half of that split.
 *
 * No hearts, sparkles or seasonal decoration: this modal edits media the AI
 * already produced, and the only marks worth adding are ones that change what
 * the post asks of a viewer. Nothing trade-specific — a hardware shop and a
 * salon can use all of them.
 *
 * Sizes are in 1080-wide canvas units.
 */
export interface Badge {
  id: string;
  label: string;
  render: FC<{ accent: string; textColor?: string; value?: number; text?: string }>;
  /** Present when the sticker carries one embedded editable number
   *  (a percentage, a count) — surfaced as a number field once it's selected. */
  valueField?: { label: string; default: number; min: number; max: number };
  /** Present when the sticker's own words are editable ("OPEN NOW" →
   *  "OPEN LATE") — the copy passed here is the default an instance starts
   *  with, surfaced as a text field once it's selected. */
  defaultText?: string;
  /** Swatch preview width, in the badge's own unscaled units — lets the
   *  picker size each swatch's scale to its actual shape instead of a single
   *  scale that clips a wide row and leaves a square one swimming in space. */
  previewScale?: number;
}

const pill = (accent: string, textColor?: string): React.CSSProperties => ({
  display: "inline-block",
  fontSize: "40px",
  fontWeight: 800,
  letterSpacing: "4px",
  color: textColor ?? "#fff",
  background: accent,
  padding: "16px 44px",
  borderRadius: "80px",
  boxShadow: `0 10px 36px ${accent}66`,
  whiteSpace: "nowrap",
});

function textBadge(id: string, label: string, copy: string): Badge {
  return {
    id,
    label,
    defaultText: copy,
    previewScale: 0.15,
    render: ({ accent, textColor, text }) => <span style={pill(accent, textColor)}>{text ?? copy}</span>,
  };
}

export const BADGES: Badge[] = [
  textBadge("open-now", "Open now", "OPEN NOW"),
  textBadge("percent-off", "% off", "% OFF"),
  textBadge("new", "New", "NEW"),
  textBadge("book-now", "Book now", "BOOK NOW"),
  textBadge("call-us", "Call us", "CALL US"),
  {
    id: "five-star",
    label: "Five stars",
    previewScale: 0.12,
    render: ({ accent, textColor }) => (
      <span style={{ display: "inline-flex", gap: "10px" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <svg key={i} width="72" height="72" viewBox="0 0 24 24" fill={textColor ?? accent}>
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
          </svg>
        ))}
      </span>
    ),
  },
  {
    id: "discount-circle",
    label: "Discount",
    valueField: { label: "Discount", default: 30, min: 5, max: 90 },
    previewScale: 0.09,
    render: ({ accent, textColor, value = 30 }) => (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "320px",
          height: "320px",
          borderRadius: "50%",
          background: accent,
          boxShadow: "0 16px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ fontSize: "124px", fontWeight: 900, color: textColor ?? "#fff", lineHeight: 1 }}>{value}%</div>
        <div style={{ fontSize: "44px", fontWeight: 700, color: textColor ?? "rgba(255,255,255,0.9)", letterSpacing: "6px" }}>OFF</div>
      </div>
    ),
  },
  {
    id: "tip-number",
    label: "Number",
    valueField: { label: "Number", default: 1, min: 1, max: 20 },
    previewScale: 0.13,
    render: ({ accent, value = 1 }) => (
      <div
        style={{
          fontSize: "180px",
          fontWeight: 900,
          lineHeight: 1,
          color: accent,
          textShadow: "0 1px 3px rgba(0,0,0,0.6), 0 4px 18px rgba(0,0,0,0.45)",
        }}
      >
        {value}
      </div>
    ),
  },
];
