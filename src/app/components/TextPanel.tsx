import { TEXT_STYLES } from "./textStyles";
import { sp, FONT } from "../theme";
import { TabLabel } from "./TabLabel";

/** Insertable text treatments. Each is a normal editable canvas element. */
export function TextPanel({ onInsert }: { onInsert: (styleId: string) => void }) {
  return <div style={{ width: "240px", flexShrink: 0, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "16px", padding: "12px", background: sp.white, borderRight: `1px solid ${sp.borderSub}` }}>
    <div style={{ display: "flex", alignItems: "flex-end", width: "100%", height: "32px", flexShrink: 0 }}><TabLabel>Text</TabLabel></div>
    <p style={{ margin: 0, padding: "0 8px", fontFamily: FONT, fontSize: "14px", lineHeight: "18px", color: sp.textTertiary }}>Add a text element, then click it to edit, resize, move, duplicate, or delete it.</p>
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "0 8px" }}>
      {TEXT_STYLES.map((style) => <button key={style.id} type="button" onClick={() => onInsert(style.id)} style={{ border: `1px solid ${sp.borderSub}`, borderRadius: "8px", padding: "12px", background: sp.white, color: sp.textPrimary, fontFamily: FONT, textAlign: "left", cursor: "pointer" }}>
        <div style={{ fontSize: "14px", fontWeight: 700 }}>{style.label}</div>
        <div style={{ marginTop: "3px", fontSize: "12px", color: sp.textTertiary }}>Add text</div>
      </button>)}
    </div>
  </div>;
}
