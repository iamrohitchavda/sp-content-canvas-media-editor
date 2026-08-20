import { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import type { TemplateDef, TemplateState, Align, FieldDef, LayerDef } from "../templates/schema";
import { SAFE_X, SAFE_Y, canHide, elementPosition } from "../templates/schema";
import { sp } from "../theme";
import { LayerCanvas } from "./LayerCanvas";
import { Scrim, scrimRegion } from "./layout";
import { EyeIcon, PencilIcon } from "./icons";
import { stickerComponentId } from "../templates/art";

/**
 * The canvas as a place to work, rather than a preview to look at.
 *
 * Click an element to select it, drag it anywhere, double-click text to type
 * into it. This is only possible because layers are data: positions are known
 * without measuring, so hit-testing, dragging and outlining all reduce to
 * reading and writing `x/y/align`.
 *
 * Rendered without Remotion. The canvas is always editable; Play is a transient
 * button that drives `previewFrame` through the entrance and then lands back on
 * the settled frame, so there is no separate "play mode" to leave — selection
 * and everything else survive the preview.
 */

/** How close (in normalised units) a drag must get before it snaps. */
const SNAP = 0.03;

/** Snap targets: the safe margins and the centre lines. */
const SNAP_X: { v: number; align: Align }[] = [
  { v: SAFE_X, align: "left" },
  { v: 0.5, align: "center" },
  { v: 1 - SAFE_X, align: "right" },
];
const SNAP_Y = [SAFE_Y, 0.5, 1 - SAFE_Y];

/** Shown once ever, so returning users are never nagged. */
const HINT_KEY = "quantumCanvas.hintDismissed";

/** The inline-edit field for an added text element (its copy is its own, not a
 *  template field), so the editor can treat it like any other text edit. */
const EXTRA_TEXT_FIELD: Extract<FieldDef, { type: "text" }> = {
  key: "__extraText__",
  type: "text",
  label: "Text",
  default: "",
  maxLength: 240,
};

interface DragState {
  id: string;
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
}

export function EditableCanvas({
  template,
  state,
  boxW,
  boxH,
  selectedId,
  onSelect,
  onMove,
  onEditText,
  onEditExtraText,
  onToggleLayer,
  onResizeText,
  onDuplicate,
  onDelete,
  previewFrame = null,
  onCancelPreview,
  onEmptyClick,
  soloId = null,
}: {
  template: TemplateDef;
  state: TemplateState;
  boxW: number;
  boxH: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number, align: Align) => void;
  onEditText: (key: string, value: string | number) => void;
  onEditExtraText: (id: string, text: string) => void;
  onToggleLayer: (id: string) => void;
  onResizeText: (id: string, textWidth: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** When set, the canvas plays the entrance at this frame and hides all edit
   *  chrome; `null` shows the settled, fully-editable composition. */
  previewFrame?: number | null;
  onCancelPreview?: () => void;
  /** A click that hit no element while static — starts playback, so an empty
   *  canvas click is part of the same play/pause gesture as the padding. */
  onEmptyClick?: () => void;
  /** During preview, only this element plays the entrance; every other
   *  element stays on the settled last frame. Used when previewing a single
   *  element's own Motion change rather than the whole post replaying. */
  soloId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ id: string; at: number } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismissHint = useCallback(() => {
    setHintDismissed(true);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* private browsing or storage disabled — the hint just won't persist */
    }
  }, []);

  const scale = boxW / template.width;
  const previewing = previewFrame != null;
  // While previewing, the canvas plays the entrance; otherwise everything has
  // animated in by the last frame, so it shows the finished composition rather
  // than a half-played one.
  const frame = previewing ? previewFrame : template.durationInFrames - 1;

  const layerRect = useCallback((id: string) => {
    const container = containerRef.current;
    const el = container?.querySelector<HTMLElement>(`[data-layer-id="${id}"]`);
    if (!container || !el) return null;
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height };
  }, []);

  const editableRect = useCallback((id: string) => {
    const container = containerRef.current;
    const el = container?.querySelector<HTMLElement>(`[data-layer-id="${id}"]`);
    if (!container || !el) return null;
    const target = largestTextElement(el) ?? el;
    const c = container.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // The selection toolbar and the first-run hint are siblings of the
      // layer tree inside this same pointer-handling container, not
      // descendants of a layer. Without this guard, pressing one of their
      // buttons bubbles up as an "empty canvas" click first, deselecting and
      // unmounting the toolbar before its own click handler ever runs.
      if ((e.target as HTMLElement).closest("[data-canvas-ui]")) return;

      dismissHint();
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-layer-id]");

      // A click during preview means "let me back in" — stop playback and,
      // if the click actually landed on an element, select it in the same
      // gesture. Layers stay hit-testable throughout playback (see
      // `interactive` below) specifically so this can happen in one click
      // instead of one to pause and a second to select.
      //
      // A *solo* preview is the exception: it auto-started on its own as a
      // side effect of a Motion edit, not from a deliberate play gesture, so
      // an empty-canvas click to move on reads as "show me the finished
      // post," not "stop and go back to editing" — cancelling it here left
      // the canvas silently settled until a second click actually played it.
      if (previewing) {
        if (!target && soloId) {
          onEmptyClick?.();
          return;
        }
        onCancelPreview?.();
        onSelect(target ? target.dataset.layerId! : null);
        if (!target) setEditingId(null);
        return;
      }

      if (!target) {
        onSelect(null);
        setEditingId(null);
        onEmptyClick?.();
        return;
      }
      const id = target.dataset.layerId!;
      const pos = elementPosition(state, id);
      if (!pos) return;
      const layer = template.layers.find((l) => l.id === id);
      const extra = state.extras.find((x) => x.id === id);
      const canInlineEdit = layer ? Boolean(inlineField(layer)) : extra?.kind === "text";

      onSelect(id);
      const now = e.timeStamp;
      const lastTap = lastTapRef.current;
      lastTapRef.current = { id, at: now };

      if (canInlineEdit && lastTap?.id === id && now - lastTap.at < 420) {
        e.preventDefault();
        setDrag(null);
        setEditingId(id);
        return;
      }

      // Capture keeps the drag alive if the pointer leaves the canvas, but it
      // throws for any pointer id the browser doesn't recognise. Losing capture
      // degrades the drag; losing the drag entirely is worse.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* not a live pointer — drag still works, just without capture */
      }
      setDrag({
        id,
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        startX: pos.x,
        startY: pos.y,
      });
    },
    [previewing, soloId, onCancelPreview, onEmptyClick, dismissHint, onSelect, state, template.layers],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (previewing) return;
      if (!drag) {
        // Hover affordance: only tracked while nothing is being dragged, so a
        // drag in progress never flickers a hover outline onto other layers.
        const target = (e.target as HTMLElement).closest<HTMLElement>("[data-layer-id]");
        const id = target?.dataset.layerId ?? null;
        setHoveredId((prev) => (prev === id ? prev : id));
        return;
      }
      const dx = (e.clientX - drag.startPointerX) / scale / template.width;
      const dy = (e.clientY - drag.startPointerY) / scale / template.height;

      let x = clamp(drag.startX + dx, 0, 1);
      let y = clamp(drag.startY + dy, 0, 1);
      let align = elementPosition(state, drag.id)?.align ?? "left";
      const shown: { x?: number; y?: number } = {};

      // Snap, so tidy placement is easy without making exact placement
      // impossible — release outside the pull radius and it stays put.
      const nearX = SNAP_X.find((s) => Math.abs(x - s.v) < SNAP);
      if (nearX) {
        x = nearX.v;
        align = nearX.align;
        shown.x = nearX.v;
      }
      const nearY = SNAP_Y.find((v) => Math.abs(y - v) < SNAP);
      if (nearY !== undefined) {
        y = nearY;
        shown.y = nearY;
      }

      setGuides(shown);
      onMove(drag.id, x, y, align);
    },
    [previewing, drag, onMove, scale, state, template.width, template.height],
  );

  const endDrag = useCallback(() => {
    setDrag(null);
    setGuides({});
  }, []);

  const handlePointerLeave = useCallback(() => setHoveredId(null), []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-layer-id]");
      if (!target) return;
      const id = target.dataset.layerId!;
      const layer = template.layers.find((l) => l.id === id);
      const extra = state.extras.find((x) => x.id === id);
      if ((layer && inlineField(layer)) || extra?.kind === "text") setEditingId(id);
    },
    [template.layers, state.extras],
  );

  // Reading layout during render measures the DOM as it stood after the
  // *previous* commit — a jump that isn't driven by the pointer (Auto-place,
  // Shuffle, Tidy up, Reset) changes a layer's position and rect in the same
  // update, so a same-render read would show the outline and toolbar exactly
  // one commit behind the artwork. A layout effect re-measures once React has
  // actually committed the new position, and its own state update is flushed
  // before the browser paints, so there's no visible lag.
  const [rects, setRects] = useState<{
    selected: ReturnType<typeof layerRect>;
    hovered: ReturnType<typeof layerRect>;
    editing: ReturnType<typeof editableRect>;
  }>({ selected: null, hovered: null, editing: null });

  useLayoutEffect(() => {
    if (previewing) {
      setRects({ selected: null, hovered: null, editing: null });
      return;
    }
    setRects({
      selected: selectedId ? layerRect(selectedId) : null,
      hovered: hoveredId && hoveredId !== selectedId ? layerRect(hoveredId) : null,
      editing: editingId ? editableRect(editingId) : null,
    });
  }, [previewing, selectedId, hoveredId, editingId, state, boxW, boxH, layerRect, editableRect]);

  const { selected: selectedRect, hovered: hoveredRect, editing: editingRect } = rects;

  const editingExtraRaw = editingId ? state.extras.find((e) => e.id === editingId) : null;
  const editingExtra = editingExtraRaw && editingExtraRaw.kind === "text" ? editingExtraRaw : null;
  const editingLayer = editingId && !editingExtra ? template.layers.find((l) => l.id === editingId) : null;
  const editingField: Extract<FieldDef, { type: "text" | "number" }> | null = editingExtra
    ? EXTRA_TEXT_FIELD
    : editingLayer
      ? inlineField(editingLayer)
      : null;

  const selectedLayer = selectedId ? template.layers.find((l) => l.id === selectedId) : null;
  const selectedExtra = selectedId ? state.extras.find((e) => e.id === selectedId) : null;
  // A badge-style chip ("FLASH SALE") shrinks to its own content just like a
  // sticker — it never wraps, so the width-drag handle (for reflowing a
  // wrapping paragraph) has nothing to do and shouldn't show.
  const selectedIsChip = Boolean(selectedLayer?.frameVariants) || (selectedExtra?.kind === "text" && selectedExtra.frameVariant !== undefined);
  const selectedIsText = (selectedLayer?.kind === "text" || selectedExtra?.kind === "text") && !selectedIsChip;
  const selectedCanEdit = selectedLayer ? Boolean(inlineField(selectedLayer)) : selectedExtra?.kind === "text";
  const selectedTextWidth =
    (selectedLayer ? state.layers[selectedLayer.id]?.textWidth : undefined) ??
    (selectedExtra && selectedExtra.kind === "text" ? selectedExtra.textWidth : undefined) ??
    1 - 2 * SAFE_X;
  const selectedAlign =
    (selectedId ? elementPosition(state, selectedId)?.align : undefined) ?? "left";

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={handlePointerLeave}
      onDoubleClick={handleDoubleClick}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        overflow: "hidden",
        cursor: drag ? "grabbing" : "default",
        touchAction: "none",
        // Without this, dragging an element (a pointer-down-then-move over
        // its text) is indistinguishable from a native text-selection drag —
        // the browser highlights every run of text sharing that drag path
        // across the canvas. Native selection inside the inline-edit
        // textarea (rendered below) is unaffected — form controls manage
        // their own text selection regardless of an ancestor's user-select.
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${template.width}px`,
          height: `${template.height}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {template.scrim ? <Scrim region={scrimRegion(state)} /> : null}
        <LayerCanvas
          template={template}
          state={state}
          frame={frame}
          fps={template.fps}
          width={template.width}
          height={template.height}
          soloId={previewing ? soloId : null}
          // Always hit-testable, even mid-loop: a click during playback needs
          // to resolve to the exact element it landed on so pausing and
          // selecting happen in the same gesture (see handlePointerDown).
          interactive
        />
      </div>

      {/* Snap guides, only while they are doing something */}
      {guides.x !== undefined && <Guide style={{ left: `${guides.x * 100}%`, top: 0, bottom: 0, width: "1px" }} />}
      {guides.y !== undefined && <Guide style={{ top: `${guides.y * 100}%`, left: 0, right: 0, height: "1px" }} />}

      {/* Hover affordance: a light outline on whatever the pointer sits over,
          so the canvas reads as editable before anything is clicked. */}
      {hoveredRect && !drag && (
        <div
          style={{
            position: "absolute",
            left: hoveredRect.left - 4,
            top: hoveredRect.top - 4,
            width: hoveredRect.width + 8,
            height: hoveredRect.height + 8,
            border: `1.5px dashed ${sp.borderActive}`,
            borderRadius: "3px",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Selection outline with corner handles, so a selected element reads
          as a manipulable object rather than a passive highlight. */}
      {selectedRect && !editingId && (
        <>
          <div
            style={{
              position: "absolute",
              left: selectedRect.left - 4,
              top: selectedRect.top - 4,
              width: selectedRect.width + 8,
              height: selectedRect.height + 8,
              border: `2px solid ${sp.blue}`,
              borderRadius: "3px",
              pointerEvents: "none",
            }}
          />
          {corners(selectedRect).map((c, i) => (
            <Handle key={i} left={c.left} top={c.top} />
          ))}
        </>
      )}

      {/* Wrap-width handle — text only, since artwork has no lines to reflow.
          Dragging it sets where the copy wraps, like a text box's edge. */}
      {selectedIsText && selectedId && selectedRect && !editingId && !drag && (
        <ResizeHandle
          rect={selectedRect}
          align={selectedAlign}
          boxW={boxW}
          startWidth={selectedTextWidth}
          onResize={(tw) => onResizeText(selectedId, tw)}
        />
      )}

      {/* Floating contextual toolbar, anchored to the selection — the few
          actions that matter for this one element, so the eye never has to
          leave the canvas for the panel. */}
      {selectedId && (selectedLayer || selectedExtra) && selectedRect && !editingId && !drag && (
        <SelectionToolbar
          rect={selectedRect}
          boxW={boxW}
          boxH={boxH}
          visible={selectedLayer ? state.layers[selectedLayer.id]?.visible !== false : true}
          hideAllowed={canHide(state)}
          canEdit={selectedCanEdit}
          canDuplicate={
            Boolean(selectedExtra) ||
            selectedLayer?.kind === "text" ||
            Boolean(selectedLayer && selectedLayer.kind === "custom" && selectedLayer.render && stickerComponentId(selectedLayer.render))
          }
          onEdit={() => setEditingId(selectedId)}
          onDuplicate={() => onDuplicate(selectedId)}
          onToggleVisible={selectedLayer ? () => onToggleLayer(selectedId) : undefined}
          onDelete={selectedExtra ? () => onDelete(selectedId) : undefined}
        />
      )}

      {/* First-run hint: shown once, until the canvas is touched at all. */}
      {!hintDismissed && !selectedId && !drag && !previewing && <FirstRunHint onDismiss={dismissHint} />}

      {/* Inline text editing, sized and coloured to match what it replaces */}
      {editingField && editingRect && (
        <InlineEditor
          rect={editingRect}
          scale={scale}
          layerId={editingId!}
          container={containerRef.current}
          field={editingField}
          value={editingExtra ? editingExtra.text : String(state.values[editingField.key] ?? "")}
          onChange={(v) => (editingExtra ? onEditExtraText(editingExtra.id, String(v)) : onEditText(editingField.key, v))}
          onDone={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function inlineField(layer: LayerDef): Extract<FieldDef, { type: "text" | "number" }> | null {
  if (layer.kind === "text" && layer.textKey) {
    const field = layer.fields.find((f) => f.key === layer.textKey && f.type === "text");
    return field && field.type === "text" ? field : null;
  }

  const editable = layer.fields.filter((field) => field.type === "text" || field.type === "number");
  return editable.length === 1 ? editable[0] as Extract<FieldDef, { type: "text" | "number" }> : null;
}

function largestTextElement(root: HTMLElement): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("*")).filter((el) => {
    const text = el.textContent?.trim();
    return text && Array.from(el.children).every((child) => !child.textContent?.trim());
  });

  let best: HTMLElement | null = null;
  let bestSize = 0;
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const size = parseFloat(getComputedStyle(el).fontSize) || rect.height;
    if (size > bestSize) {
      best = el;
      bestSize = size;
    }
  }
  return best;
}

function corners(rect: { left: number; top: number; width: number; height: number }) {
  const left = rect.left - 4;
  const top = rect.top - 4;
  const right = rect.left + rect.width + 4;
  const bottom = rect.top + rect.height + 4;
  return [
    { left, top },
    { left: right, top },
    { left, top: bottom },
    { left: right, top: bottom },
  ];
}

function Handle({ left, top }: { left: number; top: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: left - 4,
        top: top - 4,
        width: "8px",
        height: "8px",
        borderRadius: "2px",
        background: sp.white,
        border: `1.5px solid ${sp.blue}`,
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * The wrap-width handle on a text layer's trailing edge.
 *
 * Marked `data-canvas-ui` so the canvas treats it as chrome, not a layer, and
 * doesn't deselect on press. The drag is delta-based off the start width, so it
 * never depends on where the rendered box happens to sit — dragging in reflows
 * the copy to a narrower column; dragging out lets it run wider.
 */
function ResizeHandle({
  rect,
  align,
  boxW,
  startWidth,
  onResize,
}: {
  rect: { left: number; top: number; width: number; height: number };
  align: Align;
  boxW: number;
  startWidth: number;
  onResize: (textWidth: number) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  // Right align grows leftward, so its handle sits on the left edge; the others
  // grow rightward and take the right edge.
  const onLeftEdge = align === "right";
  const HALF = 4;
  const left = onLeftEdge ? rect.left - HALF : rect.left + rect.width - HALF;
  const top = rect.top + rect.height / 2 - 14;

  return (
    <div
      data-canvas-ui
      onPointerDown={(e) => {
        e.stopPropagation();
        drag.current = { startX: e.clientX, startWidth };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* not a live pointer — resize still works without capture */
        }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const d = (e.clientX - drag.current.startX) / boxW;
        // Centre grows from both edges, so the right edge moving out by d widens
        // the column by 2d; left-align by d; right-align shrinks as d grows.
        const delta = align === "center" ? d * 2 : onLeftEdge ? -d : d;
        onResize(clamp(drag.current.startWidth + delta, 0.15, 0.95));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* nothing captured */
        }
      }}
      style={{
        position: "absolute",
        left,
        top,
        width: "8px",
        height: "28px",
        borderRadius: "999px",
        background: sp.white,
        border: `1.5px solid ${sp.blue}`,
        cursor: "ew-resize",
        zIndex: 4,
        touchAction: "none",
      }}
    />
  );
}

/** Pill-shaped toolbar, floating beneath the selection — the Photoroom pattern. */
const TOOLBAR_H = 32;
const TOOLBAR_GAP = 8;

function SelectionToolbar({
  rect,
  boxW,
  boxH,
  visible,
  hideAllowed,
  canEdit,
  canDuplicate,
  onEdit,
  onDuplicate,
  onToggleVisible,
  onDelete,
}: {
  rect: { left: number; top: number; width: number; height: number };
  boxW: number;
  boxH: number;
  visible: boolean;
  hideAllowed: boolean;
  canEdit: boolean;
  canDuplicate: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleVisible?: () => void;
  onDelete?: () => void;
}) {
  const actionCount = 1 + (canEdit ? 1 : 0) + (canDuplicate ? 1 : 0) + (onToggleVisible ? 1 : 0) + (onDelete ? 1 : 0);
  const estWidth = actionCount * 30 + 8;

  const below = rect.top + rect.height + TOOLBAR_GAP + TOOLBAR_H <= boxH;
  const top = below ? rect.top + rect.height + TOOLBAR_GAP : Math.max(4, rect.top - TOOLBAR_GAP - TOOLBAR_H);
  const centerX = rect.left + rect.width / 2;
  const left = clamp(centerX, estWidth / 2 + 4, boxW - estWidth / 2 - 4);

  return (
    <div
      data-canvas-ui
      style={{
        position: "absolute",
        left,
        top,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: "2px",
        padding: "4px",
        height: `${TOOLBAR_H}px`,
        borderRadius: "999px",
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(8px)",
        zIndex: 4,
      }}
    >
      {canEdit && (
        <ToolbarIcon title="Edit on canvas" onClick={onEdit}>
          <PencilIcon width={16} height={16} />
        </ToolbarIcon>
      )}
      {canDuplicate && (
        <ToolbarIcon title="Duplicate" onClick={onDuplicate}>
          <DuplicateGlyph />
        </ToolbarIcon>
      )}
      {onToggleVisible && (
        <ToolbarIcon title={visible ? "Hide" : "Show"} onClick={onToggleVisible} disabled={visible && !hideAllowed}>
          <EyeIcon off={!visible} width={16} height={16} />
        </ToolbarIcon>
      )}
      {onDelete && (
        <ToolbarIcon title="Delete" onClick={onDelete}>
          <TrashGlyph />
        </ToolbarIcon>
      )}
    </div>
  );
}

function DuplicateGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 5.5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v4.5a2 2 0 0 0 2 2h1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.5h10M6.5 4.5V3.2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.3M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ToolbarIcon({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "24px",
        height: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: "999px",
        background: "none",
        color: disabled ? "rgba(255,255,255,0.35)" : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function FirstRunHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      data-canvas-ui
      style={{
        position: "absolute",
        top: "12px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 4,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        maxWidth: "calc(100% - 24px)",
        padding: "6px 8px 6px 12px",
        borderRadius: "999px",
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(8px)",
        color: "#fff",
        fontSize: "11px",
        lineHeight: "14px",
        pointerEvents: "auto",
      }}
    >
      <span>Tap to select · drag to move · double-click text to edit</span>
      <button
        type="button"
        title="Dismiss"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        style={{
          flexShrink: 0,
          width: "18px",
          height: "18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.16)",
          color: "#fff",
          fontSize: "11px",
          lineHeight: 1,
          cursor: "pointer",
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

function Guide({ style }: { style: CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        background: sp.blue,
        opacity: 0.9,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

/**
 * Types where the text already is, at the size it renders, so the user is
 * editing the artwork rather than a form field that happens to affect it.
 */
function InlineEditor({
  rect,
  scale,
  layerId,
  container,
  field,
  value,
  onChange,
  onDone,
}: {
  rect: { left: number; top: number; width: number; height: number };
  scale: number;
  layerId: string;
  container: HTMLDivElement | null;
  field: Extract<FieldDef, { type: "text" | "number" }>;
  value: string;
  onChange: (v: string | number) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [font, setFont] = useState<CSSProperties>({});

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    // Copy the real styling off the rendered layer so typing looks like the
    // result, rather than like a form field floating over it.
    //
    // Text layers and custom artwork put their visible value at different
    // depths, so use the largest leaf text node rather than the positioned
    // wrapper. Reading the wrapper gets inherited 16px.
    const layer = container?.querySelector<HTMLElement>(`[data-layer-id="${layerId}"]`);
    const el = layer ? largestTextElement(layer) ?? layer : null;
    if (!el) return;
    const cs = getComputedStyle(el);
    setFont({
      fontSize: `${parseFloat(cs.fontSize) * scale}px`,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight === "normal" ? "1.2" : `${parseFloat(cs.lineHeight) * scale}px`,
      color: cs.color,
      textAlign: cs.textAlign as CSSProperties["textAlign"],
      letterSpacing: cs.letterSpacing === "normal" ? undefined : `${parseFloat(cs.letterSpacing) * scale}px`,
    });
  }, [container, layerId, scale]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // A number has no concept of a second line, so Enter submits it. Text is
    // typically more than one line's worth of room (a review, a message) —
    // Enter there should do what it does in any text box and start a new
    // line, not end the edit. The textarea grows to fit on its own, since its
    // size already comes from re-measuring the live (multi-line) render.
    if (e.key === "Enter" && field.type === "number") {
      e.preventDefault();
      onDone();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onDone();
    }
    // Stop the native event too, or the modal's window listener sees the
    // same Escape and closes everything mid-edit.
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  };

  const commonStyle: CSSProperties = {
    position: "absolute",
    left: rect.left - 6,
    top: rect.top - 6,
    width: rect.width + 12,
    height: rect.height + 12,
    padding: "2px 4px",
    margin: 0,
    border: `2px solid ${sp.blue}`,
    borderRadius: "3px",
    background: "rgba(0,0,0,0.55)",
    resize: "none",
    outline: "none",
    overflow: "hidden",
    ...font,
  };

  if (field.type === "number") {
    return (
      <input
        ref={ref as RefObject<HTMLInputElement>}
        value={value}
        onBlur={onDone}
        onKeyDown={handleKeyDown}
        style={commonStyle}
        inputMode="numeric"
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.-]/g, "");
          const next = Number(raw);
          if (!Number.isFinite(next)) return;
          onChange(clamp(next, field.min, field.max));
        }}
      />
    );
  }

  return (
    <textarea
      ref={ref as RefObject<HTMLTextAreaElement>}
      value={value}
      onBlur={onDone}
      onKeyDown={handleKeyDown}
      style={commonStyle}
      maxLength={field.maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
