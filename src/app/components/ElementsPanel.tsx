import { BADGES } from "./badges";
import { SHAPES } from "./shapes";
import { STICKER_REGISTRY } from "../templates/art";
import { sp, FONT } from "../theme";
import { TabLabel } from "./TabLabel";
import { BadgeSwatch, ShapeSwatch, StickerVariantSwatch } from "./swatches";

/**
 * Browse-and-insert grid for the Shape rail tab — same list-panel shell as
 * `TemplatePanel`, but each tile is a live-rendered swatch (from `swatches.tsx`)
 * rather than a bare icon, since the whole point here is "see the actual
 * thing before you drop it on the canvas."
 */
export function ElementsPanel({
  accent,
  onInsertBadge,
  onInsertShape,
  onInsertSticker,
}: {
  accent: string;
  onInsertBadge: (badgeId: string) => void;
  onInsertShape: (shapeId: string) => void;
  onInsertSticker: (componentId: string) => void;
}) {
  return (
    <div
      style={{
        width: "240px",
        flexShrink: 0,
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "12px",
        background: sp.white,
        borderRight: `1px solid ${sp.borderSub}`,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", width: "100%", height: "32px", flexShrink: 0 }}>
        <TabLabel>Elements</TabLabel>
      </div>

      <div
          className="scroll-area"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            padding: "0 8px 8px",
          }}
        >
          <Section label="Badge">
            {BADGES.map((b) => (
              <BadgeSwatch key={b.id} badge={b} accent={accent} onClick={() => onInsertBadge(b.id)} />
            ))}
          </Section>

          <Section label="Shapes">
            {SHAPES.map((s) => (
              <ShapeSwatch key={s.id} shapeId={s.id} onClick={() => onInsertShape(s.id)} />
            ))}
          </Section>
          <Section label="Vector stickers">
            {Object.entries(STICKER_REGISTRY).map(([id, sticker]) => (
              <StickerVariantSwatch
                key={id}
                render={sticker.render}
                variant={sticker.defaultVariant}
                label={id.replace(/-/g, " ")}
                accent={accent}
                scale={sticker.previewScale}
                onClick={() => onInsertSticker(id)}
              />
            ))}
          </Section>
        </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <p style={{ margin: 0, fontFamily: FONT, fontSize: "14px", lineHeight: "18px", fontWeight: 400, color: sp.textPrimary }}>
        {label}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>{children}</div>
    </div>
  );
}
