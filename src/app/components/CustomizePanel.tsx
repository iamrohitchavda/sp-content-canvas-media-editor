import { useState } from "react";
import type { ColorRole, FieldDef, MotionType, NumberField, SpringFeel, TemplateDef, TemplateState, TextOverrides } from "../templates/schema";
import { sp, space, type, FONT, radius } from "../theme";
import { TabLabel } from "./TabLabel";
import { ResetIcon } from "./icons";
import { FieldControl } from "./FieldControl";
import { Field, PillSelect, SegmentedTabs, Select, ColorInput } from "./ds";
import { BADGES } from "./badges";
import { STICKER_REGISTRY, stickerComponentId } from "../templates/art";
import { FEEL_OPTIONS, DEFAULT_FEEL } from "./AnimationPlayer";
import { SHAPES, COLOR_ROLE_OPTIONS } from "./shapes";
import { BADGE_TEXT_FRAME_VARIANTS, BADGE_TEXT_FRAME_CSS } from "./LayerCanvas";
import { TEXT_STYLES } from "./textStyles";
import { BadgeSwatch, StickerVariantSwatch, ShapeSwatch } from "./swatches";

/** Editing an added text element's own copy, via the standard text control. */
const EXTRA_TEXT_FIELD: FieldDef = { key: "__extraText__", type: "text", label: "Text", default: "", maxLength: 240 };

/**
 * Raw typography controls — the only text customisation surface, no separate
 * named-preset picker in front of it. No web fonts are loaded in this app, so
 * "font family" stays a small, curated set of system-safe stacks rather than
 * a picker that promises fonts the browser doesn't actually have.
 */
export const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Default" },
  { value: "Georgia, 'Times New Roman', serif", label: "Serif" },
  { value: "ui-rounded, 'SF Pro Rounded', 'Segoe UI', sans-serif", label: "Rounded" },
  { value: "'SF Mono', 'Courier New', monospace", label: "Mono" },
  { value: "'Arial Narrow', sans-serif", label: "Condensed" },
  { value: "'Brush Script MT', cursive", label: "Script" },
];

export const WEIGHT_OPTIONS = [
  { value: "400", label: "Regular" },
  { value: "600", label: "Medium" },
  { value: "800", label: "Bold" },
];

export const STYLE_OPTIONS = [
  { value: "normal", label: "Regular" },
  { value: "italic", label: "Italic" },
];

const SIZE_FIELD: NumberField = { key: "__sizePct__", type: "number", label: "Size", default: 100, min: 50, max: 200 };

const ELEMENT_PALETTE = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#14b8a6", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#ffffff", "#15181d"];

function ColorPalette({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
    {ELEMENT_PALETTE.map((color) => <button
      key={color}
      type="button"
      title={color}
      aria-label={`Use ${color}`}
      onClick={() => onChange(color)}
      style={{ width: "22px", height: "22px", padding: 0, borderRadius: "999px", cursor: "pointer", background: color, border: value.toLowerCase() === color ? `2px solid ${sp.blue}` : "1px solid #c9cbd1", boxShadow: color === "#ffffff" ? "inset 0 0 0 1px #ddd" : undefined }}
    />)}
  </div>;
}

/** *What* moves as an element enters — the spring feel only covers *how*
 *  (how bouncy), which wasn't the part anyone could actually see. */
const MOTION_TYPE_OPTIONS: { value: MotionType; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "slide-up", label: "Slide up" },
  { value: "pop", label: "Pop" },
  { value: "none", label: "None" },
];

/** Every selected element gets exactly two tabs: its own properties (content,
 *  shape, colour, typography — whatever applies to that element) and Motion
 *  (entrance + feel, nothing else). Both tab labels are fixed regardless of
 *  element kind — a label that changed between "Text" and "Properties" read
 *  as two different systems rather than one consistent one. */
type InspectorTab = "properties" | "motion";

/**
 * Supporting options for whatever is selected on the canvas.
 *
 * The canvas is where work happens — click an element, drag it, type into it.
 * This panel follows the selection: empty (just Motion + Accent) until
 * something is selected, then only that element's controls — a text element
 * gets typography, a sticker gets its own curated shape variants — so the
 * user is never shown a wall of options for things they aren't touching.
 * Motion is common architecture for the whole post, not a per-element choice,
 * so it only ever appears here as one global setting. Duplicate/hide/delete
 * live only on the canvas's own selection toolbar — not duplicated here.
 */
export function CustomizePanel({
  template,
  state,
  selectedId,
  onFieldChange,
  onEditExtraText,
  onSetShape,
  onSetBadge,
  onSetBadgeValue,
  onSetBadgeText,
  onSetBadgeColorOverride,
  onSetBadgeTextColorOverride,
  onSetTextOverrides,
  onSetVariant,
  onSetStickerValue,
  onSetFrameVariant,
  onSetColorOverride,
  onSetMotionFeel,
  onSetMotionType,
  onReset,
  onShuffle,
  canReset,
}: {
  template: TemplateDef | null;
  state: TemplateState;
  selectedId: string | null;
  onFieldChange: (key: string, value: string | number) => void;
  onEditExtraText: (id: string, text: string) => void;
  onSetShape: (id: string, patch: { shapeId?: string; color?: ColorRole }) => void;
  onSetBadge: (id: string, badgeId: string) => void;
  onSetBadgeValue: (id: string, value: number) => void;
  onSetBadgeText: (id: string, text: string) => void;
  onSetBadgeColorOverride: (id: string, colorOverride: string | undefined) => void;
  onSetBadgeTextColorOverride: (id: string, colorOverride: string | undefined) => void;
  onSetTextOverrides: (id: string, patch: Partial<TextOverrides>) => void;
  onSetVariant: (id: string, variant: string) => void;
  onSetStickerValue: (id: string, value: number) => void;
  onSetFrameVariant: (id: string, frameVariant: string) => void;
  onSetColorOverride: (id: string, colorOverride: string | undefined) => void;
  onSetMotionFeel: (id: string, motionFeel: SpringFeel | undefined) => void;
  onSetMotionType: (id: string, motionType: MotionType | undefined) => void;
  onReset: () => void;
  onShuffle: () => void;
  canReset: boolean;
}) {
  const selLayer = selectedId ? template?.layers.find((l) => l.id === selectedId) ?? null : null;
  const selExtra = selectedId ? state.extras.find((e) => e.id === selectedId) ?? null : null;
  const hasSelection = Boolean(selLayer || selExtra);
  const accent = String(state.values.accentColor ?? template?.previewColor ?? sp.textSecondary);

  return (
    <div
      style={{
        width: "340px",
        flexShrink: 0,
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        // Fixed width includes the safe inset. Without border-box, the 16px
        // of padding extended beyond the right scroll edge and clipped Reset,
        // slider thumbs and the final swatch.
        // Keep a visibly safe right edge even at the far end of the
        // horizontal editor scroll; Reset must never touch the modal edge.
        padding: "16px 32px 16px 16px",
        background: sp.white,
        borderLeft: `1px solid ${sp.borderSub}`,
        overflow: "hidden",
      }}
    >
      {/* Title row, with the post-wide actions parked at its right edge. */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          width: "100%",
          minWidth: 0,
          height: "32px",
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0, overflow: "hidden" }}><TabLabel>Customize</TabLabel></div>
        <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: space[8], marginLeft: space[8] }}>
          {/* Shuffle only exists in the no-selection default state (see
              Overview) — once an element is selected, you're customizing it
              directly, and a whole-post reroll sitting right there read as
              if it might apply to just that element. Removing it from this
              state entirely, rather than leaving it and hoping the label
              reads as "whole post," is what actually resolves that. */}
          <HeaderActionButton label="Reset" title="Reset to the template" onClick={onReset} disabled={!canReset}>
            <ResetIcon width={32} height={32} />
          </HeaderActionButton>
        </div>
      </div>

      <div
        className="scroll-area"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: template ? `0 ${space[8]} ${space[8]}` : 0,
          display: "flex",
          flexDirection: "column",
          gap: space[16],
          fontFamily: FONT,
        }}
      >
        {!template ? (
          <Muted style={{ padding: `0 ${space[8]}` }}>Select an option to customize</Muted>
        ) : hasSelection ? (
          <Inspector
            state={state}
            selectedId={selectedId!}
            selLayer={selLayer}
            selExtra={selExtra}
            onFieldChange={onFieldChange}
            onEditExtraText={onEditExtraText}
            onSetShape={onSetShape}
            onSetBadge={onSetBadge}
            onSetBadgeValue={onSetBadgeValue}
            onSetBadgeText={onSetBadgeText}
            onSetBadgeColorOverride={onSetBadgeColorOverride}
            onSetBadgeTextColorOverride={onSetBadgeTextColorOverride}
            onSetTextOverrides={onSetTextOverrides}
            onSetVariant={onSetVariant}
            onSetStickerValue={onSetStickerValue}
            onSetFrameVariant={onSetFrameVariant}
            onSetColorOverride={onSetColorOverride}
            onSetMotionFeel={onSetMotionFeel}
            onSetMotionType={onSetMotionType}
            accent={accent}
          />
        ) : (
          <Overview onShuffle={onShuffle} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ overview */

/** Nothing selected: motion and colour used to be one post-wide setting
 *  shown here, but that made every element share the same look by default —
 *  they're per-element choices now (in the Inspector, once something is
 *  selected). A template lands with its first element already selected, so
 *  this is reachable only after a deliberate deselect. Two things are still
 *  available with nothing selected — select something, or shuffle — read as
 *  two options rather than one instruction with a footnote, with Shuffle
 *  toned down to an outline button since it's an alternative here, not the
 *  obvious next step the way it is once something's already selected. */
function Overview({ onShuffle }: { onShuffle: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: space[8], padding: `${space[8]} 0` }}>
      <p style={{ margin: 0, textAlign: "center", fontSize: type.s.size, lineHeight: type.s.line, color: sp.textPrimary }}>
        Select an element to edit
      </p>
      <p style={{ margin: 0, fontSize: type.xs.size, lineHeight: type.xs.line, color: sp.textSecondary }}>(or)</p>
      <OutlineShuffleButton onClick={onShuffle} />
    </div>
  );
}

/* ----------------------------------------------------------------- inspector */

/**
 * Something selected: only that element's controls, no heading and no
 * "Done" — clicking anywhere else on the canvas already deselects, so a
 * dedicated close affordance would just be a second way to do the same thing.
 */
function Inspector({
  state,
  selectedId,
  selLayer,
  selExtra,
  onFieldChange,
  onEditExtraText,
  onSetShape,
  onSetBadge,
  onSetBadgeValue,
  onSetBadgeText,
  onSetBadgeColorOverride,
  onSetBadgeTextColorOverride,
  onSetTextOverrides,
  onSetVariant,
  onSetStickerValue,
  onSetFrameVariant,
  onSetColorOverride,
  onSetMotionFeel,
  onSetMotionType,
  accent,
}: {
  state: TemplateState;
  selectedId: string;
  selLayer: TemplateDef["layers"][number] | null;
  selExtra: TemplateState["extras"][number] | null;
  onFieldChange: (key: string, value: string | number) => void;
  onEditExtraText: (id: string, text: string) => void;
  onSetShape: (id: string, patch: { shapeId?: string; color?: ColorRole }) => void;
  onSetBadge: (id: string, badgeId: string) => void;
  onSetBadgeValue: (id: string, value: number) => void;
  onSetBadgeText: (id: string, text: string) => void;
  onSetBadgeColorOverride: (id: string, colorOverride: string | undefined) => void;
  onSetBadgeTextColorOverride: (id: string, colorOverride: string | undefined) => void;
  onSetTextOverrides: (id: string, patch: Partial<TextOverrides>) => void;
  onSetVariant: (id: string, variant: string) => void;
  onSetStickerValue: (id: string, value: number) => void;
  onSetFrameVariant: (id: string, frameVariant: string) => void;
  onSetColorOverride: (id: string, colorOverride: string | undefined) => void;
  onSetMotionFeel: (id: string, motionFeel: SpringFeel | undefined) => void;
  onSetMotionType: (id: string, motionType: MotionType | undefined) => void;
  accent: string;
}) {
  // A duplicated built-in sticker (`kind: "sticker"`) is a portable copy of
  // the same component a template layer draws — everything below treats the
  // two uniformly by resolving one shared descriptor here rather than
  // branching selLayer/selExtra separately in every section. A template's
  // own original sticker layer needs this lookup too (not just a duplicate)
  // — it carries registry-level metadata like `previewScale` that isn't
  // duplicated onto the `LayerDef` itself.
  const stickerReg =
    selExtra?.kind === "sticker"
      ? STICKER_REGISTRY[selExtra.componentId]
      : selLayer?.kind === "custom" && selLayer.render
        ? STICKER_REGISTRY[stickerComponentId(selLayer.render) ?? ""]
        : undefined;

  const isShape = selExtra?.kind === "shape";
  const isBadge = selExtra?.kind === "badge";
  const isText = selLayer?.kind === "text" || selExtra?.kind === "text";
  const isSticker = Boolean(selLayer?.variants?.length) || Boolean(stickerReg);
  // A chip's shape stays editable after duplication — the extra carries its
  // own `frameVariant` rather than a template layer's fixed `frameVariants`
  // list, so its options are the same fixed set every chip-text layer uses.
  const isChipText = Boolean(selLayer?.frameVariants?.length) || Boolean(selExtra?.kind === "text" && selExtra.frameVariant !== undefined);
  const chipFrameVariants = selLayer?.frameVariants ?? BADGE_TEXT_FRAME_VARIANTS;
  const chipFrameVariant =
    selLayer
      ? state.layers[selLayer.id]?.frameVariant ?? selLayer.defaultFrameVariant ?? chipFrameVariants[0].id
      : selExtra?.kind === "text"
        ? selExtra.frameVariant ?? chipFrameVariants[0].id
        : chipFrameVariants[0].id;
  // What the chip actually looks like right now — its own copy and base
  // treatment — so its frame swatches can render a true live preview
  // ("Flash Sale" on its real background) instead of a plain text label.
  const chipText = selLayer ? String(state.values[selLayer.textKey ?? ""] ?? "") : selExtra?.kind === "text" ? selExtra.text : "";
  const chipBaseStyle = selLayer?.style?.(accent) ?? (selExtra?.kind === "text" ? TEXT_STYLES.find((s) => s.id === selExtra.styleId)?.style(accent) : undefined) ?? {};
  const hasInternalText = Boolean(selLayer?.hasInternalText) || Boolean(stickerReg?.hasInternalText);

  const stickerRender = selLayer?.render ?? stickerReg?.render;
  const stickerVariants = selLayer?.variants ?? stickerReg?.variants;
  const stickerCurrentVariant = selLayer
    ? state.layers[selLayer.id]?.variant ?? selLayer.defaultVariant
    : selExtra?.kind === "sticker"
      ? selExtra.variant ?? stickerReg?.defaultVariant
      : undefined;
  const stickerScale = selLayer?.previewScale ?? stickerReg?.previewScale;

  const overrides: TextOverrides =
    (selLayer
      ? state.layers[selLayer.id]?.overrides
      : selExtra?.kind === "text" || selExtra?.kind === "sticker"
        ? selExtra.overrides
        : undefined) ?? {};

  // Motion used to be one post-wide setting; now every element carries its
  // own, the same way it carries its own colour — unset just means "follow
  // the post's own feel." Type (what moves) falls back to whatever this
  // specific element was authored with, not a single global default — a
  // sticker that was designed to pop in has a different natural default
  // than a headline that was designed to fade.
  const motionFeel = (selLayer ? state.layers[selLayer.id]?.motionFeel : selExtra?.motionFeel) ?? DEFAULT_FEEL;
  const authoredMotionType = selLayer?.motion.type ?? selExtra?.motion.type ?? "fade";
  const motionType = (selLayer ? state.layers[selLayer.id]?.motionType : selExtra?.motionType) ?? authoredMotionType;

  // Every element gets the same two tabs — its own properties, and Motion
  // (entrance + feel, nothing else) — never a scrolling list of both mixed
  // together. `hasTextTab` still gates whether typography controls appear
  // inside the Properties tab; the tab's own label stays "Properties"
  // regardless.
  const hasTextTab = isText || hasInternalText;
  const [tab, setTab] = useState<InspectorTab>("properties");

  // Shape is the identity of the element — which form this is — so it leads
  // the Properties tab, before content or colour, whenever a selection has
  // one: a chip's frame, a sticker's curated variants, a standalone shape's
  // full library, or a badge's own catalogue. Only one of these ever applies
  // to a given selection.
  const shapeSection = (
    <>
      {/* A badge-style text layer's own curated background frame — swatches
          render the chip live, on its own copy and colour, the same "what
          you pick is what you get" treatment as a badge or sticker swatch,
          rather than a plain text pill naming the option. */}
      {isChipText && (
        <div style={{ display: "flex", flexDirection: "column", gap: space[8] }}>
          <SectionLabel>Shape</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space[4] }}>
            {chipFrameVariants.map((v) => (
              <ChipFrameSwatch
                key={v.id}
                label={v.label}
                text={chipText}
                baseStyle={chipBaseStyle}
                frameStyle={BADGE_TEXT_FRAME_CSS[v.id]}
                selected={chipFrameVariant === v.id}
                onClick={() => onSetFrameVariant(selectedId, v.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* A built-in sticker (rating, pin, badge, numeral) — its own curated
          shape variants only, never the general shape library. A star stays
          a star. Works the same whether this is the template's own layer or
          a duplicated copy of it. */}
      {isSticker && stickerRender && stickerVariants && (
        <div style={{ display: "flex", flexDirection: "column", gap: space[8] }}>
          <SectionLabel>Shape</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space[4] }}>
            {stickerVariants.map((v) => (
              <StickerVariantSwatch
                key={v.id}
                render={stickerRender}
                variant={v.id}
                label={v.label}
                accent={accent}
                scale={stickerScale}
                selected={stickerCurrentVariant === v.id}
                onClick={() => onSetVariant(selectedId, v.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* A standalone shape — which shape, and what fills it. Pure decoration,
          so the full shape library is fair game (unlike a sticker above). */}
      {isShape && (
        <div style={{ display: "flex", flexDirection: "column", gap: space[8] }}>
          <SectionLabel>Shape</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space[4] }}>
            {SHAPES.map((s) => (
              <ShapeSwatch
                key={s.id}
                shapeId={s.id}
                selected={selExtra.shapeId === s.id}
                onClick={() => onSetShape(selectedId, { shapeId: s.id })}
              />
            ))}
          </div>
          <PillSelect value={selExtra.color} options={COLOR_ROLE_OPTIONS} onChange={(v) => onSetShape(selectedId, { color: v as ColorRole })} />
          <ColorPalette value={selExtra.color === "accent" ? accent : selExtra.color === "white" ? "#ffffff" : selExtra.color === "dark" ? "#15181d" : selExtra.color} onChange={(color) => onSetShape(selectedId, { color })} />
          <ColorInput value={selExtra.color === "accent" ? accent : selExtra.color === "white" ? "#ffffff" : selExtra.color === "dark" ? "#15181d" : selExtra.color} onChange={(color) => onSetShape(selectedId, { color })} />
        </div>
      )}

      {/* A text sticker — which one. Labelled "Shape" like every other
          shape-choosing section, not "Sticker" — one word for "which form is
          this" everywhere it shows up. */}
      {isBadge && (
        <div style={{ display: "flex", flexDirection: "column", gap: space[8] }}>
          <SectionLabel>Shape</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space[4] }}>
            {BADGES.map((b) => (
              <BadgeSwatch
                key={b.id}
                badge={b}
                accent={accent}
                selected={selExtra.badgeId === b.id}
                onClick={() => onSetBadge(selectedId, b.id)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );

  const propertiesContent = (
    <>
      {shapeSection}

      {/* Size, right after Shape — every sticker (Offer/Location/Rating/Tip)
          gets this uniformly, since they're plain fixed-palette artwork now
          rather than accent-tinted shapes with their own colour control. */}
      {isSticker && (
        <FieldControl
          field={SIZE_FIELD}
          value={overrides.sizePct ?? 100}
          onChange={(_, v) => onSetTextOverrides(selectedId, { sizePct: Number(v) })}
        />
      )}

      {/* Content: a template layer's fields, an added text element's copy,
          or a duplicated sticker's own editable field. A field whose label
          just repeats the layer's own name (e.g. the "Label" field on a
          layer called "Label") showed no label at all, which read as a
          stray unlabelled box — generic "Text" instead, so the first
          control always has something naming it. */}
      {selLayer?.fields.map((field) => {
        const generic = field.type === "text" && sameLabel(field.label, selLayer.label);
        return (
          <FieldControl
            key={field.key}
            field={generic ? { ...field, label: "Text" } : field}
            value={state.values[field.key] ?? field.default}
            onChange={onFieldChange}
          />
        );
      })}
      {selExtra?.kind === "text" && (
        <FieldControl
          field={EXTRA_TEXT_FIELD}
          value={selExtra.text}
          onChange={(_, v) => onEditExtraText(selExtra.id, String(v))}
        />
      )}
      {selExtra?.kind === "sticker" && stickerReg?.valueField && (
        <FieldControl
          field={{ key: "__stickerValue__", type: "number", ...stickerReg.valueField }}
          value={selExtra.value ?? stickerReg.valueField.default}
          onChange={(_, v) => onSetStickerValue(selectedId, Number(v))}
        />
      )}

      {/* A text sticker's own words ("OPEN NOW" → "OPEN LATE"), and its
          embedded value if it has one — grouped with the rest of this
          badge's own content, after the Shape section above. */}
      {isBadge &&
        (() => {
          const badge = BADGES.find((b) => b.id === selExtra.badgeId);
          if (badge?.defaultText === undefined) return null;
          return (
            <FieldControl
              field={{ key: "__badgeText__", type: "text", label: "Text", default: badge.defaultText, maxLength: 24 }}
              value={selExtra.text ?? badge.defaultText}
              onChange={(_, v) => onSetBadgeText(selectedId, String(v))}
            />
          );
        })()}
      {isBadge &&
        (() => {
          const badge = BADGES.find((b) => b.id === selExtra.badgeId);
          if (!badge?.valueField) return null;
          const field: NumberField = {
            key: "__badgeValue__",
            type: "number",
            label: badge.valueField.label,
            default: badge.valueField.default,
            min: badge.valueField.min,
            max: badge.valueField.max,
          };
          return (
            <FieldControl
              field={field}
              value={selExtra.value ?? badge.valueField.default}
              onChange={(_, v) => onSetBadgeValue(selectedId, Number(v))}
            />
          );
        })()}

      {/* Typography — font/weight/style/size, plus colour for plain text.
          Also opts in a sticker's own internal text (a discount's "%", a tip
          numeral's digit) — the same controls, scoped to that text only. */}
      {hasTextTab && (
        <>
          {/* A sticker's own internal digit/percentage isn't typeset content
              a user picks a font/weight/style for — it's fixed art with a
              number dropped on top, so only Shape (above), Size and its own
              value field (e.g. "Tip number") apply. Font/Weight/Style stay
              scoped to real typed text. */}
          {!hasInternalText && (
            <>
              {/* A sticker's whole-element Size control already sits right after
                  its Shape section above and writes this same `sizePct` — this
                  one is only for plain text, where that section doesn't exist.
                  Comes right after the content field, ahead of Font/Weight/
                  Style, since resizing is the more common first move. */}
              {!isSticker && (
                <FieldControl
                  field={SIZE_FIELD}
                  value={overrides.sizePct ?? 100}
                  onChange={(_, v) => onSetTextOverrides(selectedId, { sizePct: Number(v) })}
                />
              )}
              <Field label="Font">
                <Select
                  value={overrides.fontFamily ?? ""}
                  options={FONT_OPTIONS}
                  onChange={(e) => onSetTextOverrides(selectedId, { fontFamily: e.target.value || undefined })}
                />
              </Field>
              <Field label="Weight">
                <PillSelect
                  value={String(overrides.fontWeight ?? 400)}
                  options={WEIGHT_OPTIONS}
                  onChange={(v) => onSetTextOverrides(selectedId, { fontWeight: Number(v) })}
                />
              </Field>
              <Field label="Style">
                <PillSelect
                  value={overrides.italic ? "italic" : "normal"}
                  options={STYLE_OPTIONS}
                  onChange={(v) => onSetTextOverrides(selectedId, { italic: v === "italic" || undefined })}
                />
              </Field>
            </>
          )}
          {/* Plain text's own colour lives here; a sticker's internal text
              instead gets paired with the sticker's shape colour below, so
              the two read as "shape colour, text colour" rather than two
              unlabelled colour rows with no visible relationship. The swatch
              falls back to the treatment's own resolved colour (often the
              accent, not white) so it always matches what's actually drawn
              on the canvas when there's no override yet. */}
          {isChipText ? (
            <div style={{ display: "flex", gap: space[8], width: "100%" }}>
              <div style={{ flex: "1 1 0px", minWidth: 0, display: "flex", flexDirection: "column", gap: space[4] }}>
                <SectionLabel>Shape Color</SectionLabel>
                <ColorInput
                  value={(selLayer && state.layers[selLayer.id]?.colorOverride) ?? accent}
                  onChange={(hex) => onSetColorOverride(selectedId, hex)}
                />
              </div>
              <div style={{ flex: "1 1 0px", minWidth: 0, display: "flex", flexDirection: "column", gap: space[4] }}>
                <SectionLabel>Text Color</SectionLabel>
                <ColorInput
                  value={overrides.color ?? (typeof chipBaseStyle.color === "string" ? chipBaseStyle.color : "#ffffff")}
                  onChange={(hex) => onSetTextOverrides(selectedId, { color: hex })}
                />
              </div>
            </div>
          ) : !hasInternalText ? (
            <Field label="Color">
              <div style={{ display: "flex", alignItems: "center", gap: space[8] }}>
                <div style={{ flex: 1 }}>
                  <ColorInput
                    value={overrides.color ?? (typeof chipBaseStyle.color === "string" ? chipBaseStyle.color : "#ffffff")}
                    onChange={(hex) => onSetTextOverrides(selectedId, { color: hex })}
                  />
                </div>
                {overrides.color && (
                  <button
                    type="button"
                    title="Reset to the default colour"
                    onClick={() => onSetTextOverrides(selectedId, { color: undefined })}
                    style={linkButtonStyle}
                  >
                    Reset
                  </button>
                )}
              </div>
            </Field>
          ) : null}
        </>
      )}

      {/* This instance's own colour, independent of the post's overall
          accent — without this, selecting an inserted badge showed nothing
          beyond the same picker used to add it in the first place, which
          read as "selecting did nothing." */}
      {isBadge && (
        <div style={{ display: "flex", gap: space[8], width: "100%" }}>
          <div style={{ flex: "1 1 0px", minWidth: 0, display: "flex", flexDirection: "column", gap: space[4] }}>
            <SectionLabel>Shape Color</SectionLabel>
            <ColorInput
              value={selExtra.colorOverride ?? accent}
              onChange={(hex) => onSetBadgeColorOverride(selectedId, hex)}
            />
          </div>
          <div style={{ flex: "1 1 0px", minWidth: 0, display: "flex", flexDirection: "column", gap: space[4] }}>
            <SectionLabel>Text Color</SectionLabel>
            <ColorInput
              value={selExtra.textColorOverride ?? "#ffffff"}
              onChange={(hex) => onSetBadgeTextColorOverride(selectedId, hex)}
            />
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <SegmentedTabs
        value={tab}
        options={[
          { value: "properties", label: "Properties" },
          { value: "motion", label: "Motion" },
        ]}
        onChange={(v) => setTab(v as InspectorTab)}
      />
      {tab === "properties" ? (
        propertiesContent
      ) : (
        <>
          <Field label="Entrance">
            <PillSelect
              value={motionType}
              options={MOTION_TYPE_OPTIONS}
              onChange={(v) => onSetMotionType(selectedId, v === authoredMotionType ? undefined : (v as MotionType))}
            />
          </Field>
          {/* Feel has nothing to do without an entrance to shape, so with
              "None" selected the field is gone rather than shown inert —
              it reappears the moment an actual entrance is picked. */}
          {motionType !== "none" && (
            <Field label="Feel">
              <PillSelect
                value={motionFeel}
                options={FEEL_OPTIONS}
                onChange={(v) => onSetMotionFeel(selectedId, v === DEFAULT_FEEL ? undefined : (v as SpringFeel))}
              />
            </Field>
          )}
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- pieces */

/** Shuffle gets a solid, filled treatment — a plain text link doesn't read as
 *  the primary thing to do with nothing selected, and it's now the main
 *  action available in that state. Reset stays a plain link: destructive,
 *  and only relevant once something's actually been changed. */
/** The nothing-selected state's own Shuffle — an outline/skeleton treatment
 *  so it reads as "an alternative to selecting something," not the loud
 *  primary action a solid fill would suggest. The header's Shuffle (once
 *  something's selected) stays the plain link `HeaderActionButton` already
 *  used for Reset. */
function OutlineShuffleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      title="Shuffle the look"
      aria-label="Shuffle the look"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: space[4],
        padding: `4px ${space[16]} 4px ${space[8]}`,
        borderRadius: radius[2],
        border: `1px solid ${sp.aiYellow}`,
        background: "none",
        color: sp.blue,
        fontFamily: FONT,
        fontSize: type.s.size,
        lineHeight: type.s.line,
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: "14px" }}>✨</span>
      <span>Shuffle</span>
    </button>
  );
}

function HeaderActionButton({
  label,
  title,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        height: "32px",
        display: "flex",
        alignItems: "center",
        gap: space[4],
        padding: 0,
        border: "none",
        background: "none",
        color: disabled ? sp.textDisabled : sp.blue,
        fontFamily: FONT,
        fontSize: type.s.size,
        lineHeight: type.s.line,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        style={{
          width: "24px",
          height: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: disabled ? sp.textDisabled : sp.blue,
        }}
      >
        {children}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** A live preview of a chip-text layer's own curated background frame — same
 *  "render it for real" treatment as `BadgeSwatch`, on the element's actual
 *  copy and colour, rather than a plain text label naming the option. */
function ChipFrameSwatch({
  label,
  text,
  baseStyle,
  frameStyle,
  selected,
  onClick,
}: {
  label: string;
  text: string;
  baseStyle: React.CSSProperties;
  frameStyle: React.CSSProperties;
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
      <div style={{ transform: "scale(0.16)", flexShrink: 0, whiteSpace: "nowrap" }}>
        <div style={{ ...baseStyle, ...frameStyle }}>{text}</div>
      </div>
    </button>
  );
}

function sameLabel(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const linkButtonStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  cursor: "pointer",
  color: sp.blue,
  fontFamily: FONT,
  fontSize: type.s.size,
  lineHeight: type.s.line,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: type.s.size, lineHeight: type.s.line, fontWeight: 400, color: sp.textPrimary }}>
      {children}
    </p>
  );
}

function Muted({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ margin: 0, fontSize: type.s.size, lineHeight: type.s.line, color: sp.textTertiary, ...style }}>
      {children}
    </p>
  );
}
