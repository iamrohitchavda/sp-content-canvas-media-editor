import { useRef, useState, useLayoutEffect, useEffect, useCallback } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import type { Align, TemplateDef, TemplateState } from "../templates/schema";
import { sp } from "../theme";
import { EditableCanvas } from "./EditableCanvas";
import { BADGES } from "./badges";
import { SHAPES } from "./shapes";

export interface MediaItem {
  id: string;
  src: string;
  alt: string;
  /** Real video length at 30fps. Omitted for a static image. */
  durationInFrames?: number;
}

export type MediaType = "image" | "video";

/**
 * Preview frame, matching the compositions' 9:16 canvas exactly, so the preview
 * is pixel-for-pixel what will export.
 */
export const MEDIA_W = 360;
export const MEDIA_H = 640;

/**
 * Fits the media frame into the available space at a fixed 9:16, never larger
 * than the design size.
 *
 * The frame shrinks as a whole on small viewports rather than letting flex
 * squash its height — a squashed box changes the aspect ratio and crops content
 * that sits well inside its own safe margins.
 */
function FittedFrame({
  media,
  mediaType,
  onUploadMedia,
  videoRef,
  render,
}: {
  media: MediaItem;
  mediaType: MediaType;
  onUploadMedia: (file: File) => void;
  videoRef?: RefObject<HTMLVideoElement>;
  render?: (size: { w: number; h: number }) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setAvail({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Belt and braces: some embedded environments fail to deliver RO callbacks
    // on viewport resize, which left the frame stuck at its old size.
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const w = Math.floor(Math.min(MEDIA_W, avail.w, (avail.h * MEDIA_W) / MEDIA_H));
  const h = Math.floor((w * MEDIA_H) / MEDIA_W);

  return (
    <div
      ref={ref}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {w > 0 && h > 0 && (!media.src ? (
        <div data-frame style={{ position: "relative", width: `${w}px`, height: `${h}px`, flexShrink: 0, borderRadius: "8px", overflow: "hidden", background: "#202126", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "22px", border: "1px dashed #747780", borderRadius: "10px", color: "#f5f5f5", fontSize: "14px", cursor: "pointer" }}>
            <strong>Upload image or video</strong>
            <span style={{ color: "#afb1b8", fontSize: "12px" }}>Add editable overlays after upload</span>
            <input type="file" accept="image/*,video/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onUploadMedia(file); event.currentTarget.value = ""; }} />
          </label>
        </div>
      ) : (
        <div
          data-frame
          style={{
            position: "relative",
            width: `${w}px`,
            height: `${h}px`,
            flexShrink: 0,
            borderRadius: "8px",
            overflow: "hidden",
            background: "#000",
          }}
        >
          {mediaType === "video" ? <video ref={videoRef} src={media.src} muted loop playsInline preload="auto" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", background: "#000" }} /> : <img src={media.src} alt={media.alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
          {render?.({ w, h })}
        </div>
      ))}
    </div>
  );
}

/**
 * The centre column.
 *
 * The canvas is always editable — click, drag, type straight away. There is
 * no explicit Play/Pause control: playback is a gesture. Clicking any empty
 * area — the padding around the frame, or empty canvas inside it — toggles
 * playback; clicking an element always selects it (pausing first, if it was
 * playing). Play is real spring motion computed by the same renderer the
 * export uses, so what you preview is what you get.
 */

export function MediaStage({
  media,
  mediaType,
  template,
  state,
  selectedId,
  onSelect,
  onMove,
  onEditText,
  onEditExtraText,
  onToggleLayer,
  onResizeText,
  onDuplicate,
  onDelete,
  onTimingChange,
  onUploadMedia,
  showTimeline = true,
  timelineContainer,
}: {
  media: MediaItem;
  mediaType: MediaType;
  template: TemplateDef | null;
  state: TemplateState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number, align: Align) => void;
  onEditText: (key: string, value: string | number) => void;
  onEditExtraText: (id: string, text: string) => void;
  onToggleLayer: (id: string) => void;
  onResizeText: (id: string, textWidth: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onTimingChange: (id: string, startFrame: number, endFrame: number) => void;
  onUploadMedia: (file: File) => void;
  /** The modal can place this beneath every sidebar as a full-width editor. */
  showTimeline?: boolean;
  timelineContainer?: HTMLElement | null;
}) {
  const [previewFrame, setPreviewFrame] = useState<number | null>(null);
  const [soloId, setSoloId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const stopPreview = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    videoRef.current?.pause();
    setIsPlaying(false);
    setPreviewFrame(null);
    setSoloId(null);
  }, []);

  /** Pause at the current video frame instead of returning to frame zero. */
  const pauseAtFrame = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    videoRef.current?.pause();
    setIsPlaying(false);
    setSoloId(null);
  }, []);

  /** Timeline scrubbing always pauses, seeks the real media element, and
   * updates overlays from the same frame. */
  const seekToFrame = useCallback((frame: number) => {
    const total = media.durationInFrames ?? 300;
    const next = Math.max(0, Math.min(total - 1, Math.round(frame)));
    pauseAtFrame();
    if (videoRef.current) videoRef.current.currentTime = next / 30;
    setPreviewFrame(next);
  }, [media.durationInFrames, pauseAtFrame]);

  /** Loops indefinitely — the post plays on repeat until a click on the
   *  canvas interrupts it (`stopPreview`), never settling into a single
   *  static frame on its own. Pass `solo` to play only that one element's
   *  entrance while everything else stays on its settled frame — used for
   *  previewing a single element's own Motion change in isolation, rather
   *  than replaying the whole post around it. `startFrame` skips the loop
   *  ahead — soloing an element authored with a long stagger delay (it plays
   *  well after frame 0 in the full post) otherwise meant watching a long
   *  wait before anything happened; starting right at its own delay makes an
   *  edit read as instant regardless of where it sits in the original
   *  stagger. */
  const play = useCallback((solo?: string | null, startFrame = 0) => {
    if (!template) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const total = mediaType === "video" ? media.durationInFrames ?? 300 : template.durationInFrames;
    const fps = template.fps;
    const video = videoRef.current;
    // `0` is a deliberate start frame. Using `||` here silently replaced it
    // with the current late video frame, so changing Bouncy/Gentle/Snappy
    // often replayed after the spring had already settled.
    const initial = startFrame ?? previewFrame ?? 0;
    if (video) {
      video.currentTime = initial / fps;
      void video.play().catch(() => {});
    }
    const tick = (now: number) => {
      const frame = video ? Math.floor(video.currentTime * fps) : Math.floor((now / 1000) * fps) % total;
      setPreviewFrame(Math.max(0, Math.min(total - 1, frame)));
      rafRef.current = requestAnimationFrame(tick);
    };
    setSoloId(solo ?? null);
    setIsPlaying(true);
    setPreviewFrame(initial % total);
    rafRef.current = requestAnimationFrame(tick);
  }, [template, mediaType, media.durationInFrames, previewFrame]);

  // Choosing a template plays its motion straight away, on a loop — the modal
  // opens on the finished thing, so the default is to watch it happen, not to
  // be dropped straight into a static editor. A stale RAF from the previous
  // template is stopped first so switching templates never ticks against old
  // data.
  useEffect(() => {
    stopPreview();
    if (template && mediaType === "video") play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, mediaType]);

  // Changing the Motion setting mid-loop should read as an immediate change,
  // not one that only shows up once the current cycle happens to wrap back to
  // frame 0. Restart the loop from frame 0 right away, but only while a
  // preview is actually running — a paused, settled frame has nothing to
  // instantly reflect.
  const isPreviewingRef = useRef(false);
  isPreviewingRef.current = previewFrame != null;
  useEffect(() => {
    if (mediaType === "video" && isPreviewingRef.current) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.values.animationStyle]);

  // Motion is per-element now, and the edit canvas otherwise sits on the
  // settled last frame — an entrance already finished has nothing to show,
  // so picking a new Entrance or Feel for the selected element looked like
  // it did nothing. Unlike the post-wide restart above, this one plays even
  // from a paused state: there's no other way to see a per-element motion
  // change land. Only fires for an actual value change on the *same*
  // selection — switching to a different element (which naturally has a
  // different signature) must not itself trigger a replay. Solos the replay
  // to just that element: the rest of the post stays settled, so editing one
  // element's motion isn't a whole-canvas replay to watch for the one part
  // that changed.
  const selectedMotionSignature = (() => {
    if (!selectedId) return null;
    const ls = state.layers[selectedId];
    const extra = state.extras.find((e) => e.id === selectedId);
    return `${ls?.motionFeel ?? ""}|${ls?.motionType ?? ""}|${extra?.motionFeel ?? ""}|${extra?.motionType ?? ""}`;
  })();
  const prevMotionRef = useRef<{ id: string | null; signature: string | null }>({ id: null, signature: null });
  useEffect(() => {
    const prev = prevMotionRef.current;
    if (selectedId && prev.id === selectedId && prev.signature !== null && prev.signature !== selectedMotionSignature) {
      const delay = template?.layers.find((l) => l.id === selectedId)?.motion.delay
        ?? state.extras.find((e) => e.id === selectedId)?.motion.delay
        ?? 0;
      if (mediaType === "video") play(selectedId, delay);
    }
    prevMotionRef.current = { id: selectedId, signature: selectedMotionSignature };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedMotionSignature]);

  // Clicks that land on the padding around the frame (not inside it — the
  // frame and EditableCanvas handle their own clicks) toggle playback, same
  // as an empty-canvas click does inside the frame. This is what makes "any
  // area of the Canvas section" — padding included — part of the gesture. It
  // also deselects, same as an empty-canvas click: without this, a selection
  // could only ever be cleared by a click that happened to land inside the
  // frame, leaving Customize stuck showing the last-selected element's
  // controls after a click anywhere else on the stage.
  const handleStagePointerDown = (e: React.PointerEvent) => {
    if (!template) return;
    if ((e.target as HTMLElement).closest("[data-frame]")) return;
    onSelect(null);
    if (mediaType !== "video") return;
    // A solo preview auto-started from a Motion edit, not a deliberate play
    // gesture — moving on from it should show the finished post playing, not
    // silently stop (the ordinary toggle below is for a real play/pause click).
    if (soloId) { play(); return; }
    if (isPlaying) pauseAtFrame();
    else play();
  };

  return (
    <div
      onPointerDown={handleStagePointerDown}
      style={{
        flex: 1,
        // Never let the canvas collapse. The side panels are fixed width, so a
        // flexible centre column shrinks to nothing on a narrow viewport and the
        // media disappears — the card scrolls instead, which is the same
        // never-clip rule the frame itself follows.
        minWidth: `${MEDIA_W}px`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        padding: "16px",
        background: sp.white,
        position: "relative",
      }}
    >
      <FittedFrame
        media={media}
        mediaType={mediaType}
        onUploadMedia={onUploadMedia}
        videoRef={videoRef}
        render={({ w, h }) => {
          if (!template) return null;
          return (
            <EditableCanvas
              template={template}
              state={state}
              boxW={w}
              boxH={h}
              selectedId={selectedId}
              onSelect={onSelect}
              onMove={onMove}
              onEditText={onEditText}
              onEditExtraText={onEditExtraText}
              onToggleLayer={onToggleLayer}
              onResizeText={onResizeText}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              previewFrame={previewFrame}
              // Selecting a canvas element must leave video-preview mode.
              // Keeping the paused preview frame here hid the selection
              // toolbar (copy/delete/edit) even though the layer was selected.
              onCancelPreview={stopPreview}
              onEmptyClick={() => {
                if (mediaType === "video") play();
              }}
              soloId={soloId}
            />
          );
        }}
      />
      {template && mediaType === "video" && (() => {
        const timeline = <ElementTimeline
          template={template}
          state={state}
          selectedId={selectedId}
          mediaSrc={media.src}
          durationInFrames={media.durationInFrames ?? 300}
          currentFrame={previewFrame ?? 0}
          onSelect={onSelect}
          onChange={onTimingChange}
          isPlaying={isPlaying}
          onTogglePlay={() => isPlaying ? pauseAtFrame() : play()}
          onSeek={seekToFrame}
          fullWidth={Boolean(timelineContainer)}
        />;
        return timelineContainer ? createPortal(timeline, timelineContainer) : showTimeline ? timeline : null;
      })()}
    </div>
  );
}

/**
 * Extract representative frames locally in the browser for the timeline.
 * Pointing the same video URL at eight CSS backgrounds only repeats its first
 * frame; seek + canvas capture gives the editor an honest visual map of the
 * clip. Object URLs from uploads work without a server. If a remote video
 * denies canvas access, this deliberately returns no strip rather than a
 * misleading fake thumbnail row.
 */
function VideoFrameStrip({ src, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: {
  src: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const [frames, setFrames] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.src = src;

    const capture = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadedmetadata", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("Video metadata unavailable")), { once: true });
          video.load();
        });
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) throw new Error("Video duration unavailable");
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 90;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        const captured: string[] = [];
        for (let index = 0; index < 8; index += 1) {
          const time = Math.min(duration - 0.04, Math.max(0, duration * ((index + 0.5) / 8)));
          await new Promise<void>((resolve, reject) => {
            video.addEventListener("seeked", () => resolve(), { once: true });
            video.addEventListener("error", () => reject(new Error("Video seek failed")), { once: true });
            video.currentTime = time;
          });
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          captured.push(canvas.toDataURL("image/jpeg", 0.72));
        }
        if (!cancelled) setFrames(captured);
      } catch {
        if (!cancelled) setFrames([]);
      }
    };
    void capture();
    return () => { cancelled = true; video.removeAttribute("src"); video.load(); };
  }, [src]);

  // Do not render a pretend video track if thumbnails cannot be captured.
  if (frames?.length === 0) return null;
  return <div style={{ flex: "1 0 48px", display: "flex", alignItems: "center", gap: "6px", minHeight: "48px", minWidth: 0 }}>
    <span style={{ width: "104px", flexShrink: 0, color: "#5e6878", fontSize: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>▣ &nbsp;Video</span>
    <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} style={{ flex: 1, minWidth: 0, height: "100%", minHeight: "44px", display: "flex", overflow: "hidden", borderRadius: "7px", border: "2px solid #4d5562", boxSizing: "border-box", background: "#313744", cursor: "ew-resize", touchAction: "none" }}>
      {frames ? frames.map((frame, index) => <span key={index} style={{ flex: 1, minWidth: 0, borderRight: index === frames.length - 1 ? 0 : "1px solid rgba(255,255,255,.7)", backgroundImage: `linear-gradient(rgba(20,24,30,.08), rgba(20,24,30,.08)), url(${frame})`, backgroundSize: "cover", backgroundPosition: "center" }} />) : <span style={{ width: "100%", display: "grid", placeItems: "center", color: "#dce0e8", fontSize: "10px" }}>Loading video frames…</span>}
    </div>
  </div>;
}

/** A compact video-only timing editor. A selected layer is visible only in its chosen range. */
export function ElementTimeline({
  template, state, selectedId, mediaSrc, durationInFrames, currentFrame, onSelect, onChange, isPlaying, onTogglePlay, onSeek, fullWidth = false,
}: {
  template: TemplateDef; state: TemplateState; selectedId: string | null;
  mediaSrc: string;
  durationInFrames: number;
  currentFrame: number;
  onSelect: (id: string | null) => void;
  onChange: (id: string, start: number, end: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (frame: number) => void;
  fullWidth?: boolean;
}) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    mode: "move" | "start" | "end";
    startX: number;
    start: number;
    end: number;
    trackWidth: number;
    moved: boolean;
  } | null>(null);
  const scrubRef = useRef<{ startX: number; moved: boolean } | null>(null);
  // Timeline labels should identify the thing the user can see on the canvas,
  // not the implementation type ("badge", "sticker", etc.). In particular a
  // text badge uses its actual displayed copy, including a user edit.
  const extraLabel = (extra: TemplateState["extras"][number]) => {
    if (extra.kind === "text") return extra.text || "Text";
    if (extra.kind === "badge") {
      const badge = BADGES.find((item) => item.id === extra.badgeId);
      if (extra.text) return extra.text;
      if (badge?.valueField) return `${extra.value ?? badge.valueField.default}% OFF`;
      return badge?.defaultText ?? badge?.label ?? "Badge";
    }
    if (extra.kind === "shape") return SHAPES.find((shape) => shape.id === extra.shapeId)?.label ?? "Shape";
    if (extra.kind === "sticker") {
      const stickerName: Record<string, string> = { rating: "Star rating", "discount-badge": "Discount badge", pin: "Location pin" };
      return stickerName[extra.componentId] ?? "Sticker";
    }
    return "Element";
  };
  const rows = [
    ...template.layers.filter((layer) => state.layers[layer.id]?.visible !== false).map((layer, index) => ({
      id: layer.id,
      label: layer.label,
      start: state.layers[layer.id]?.startFrame ?? 0,
      end: state.layers[layer.id]?.endFrame ?? durationInFrames,
      color: ["#0ea5e9", "#8b5cf6", "#f59e0b", "#ec4899", "#22c55e"][index % 5],
    })),
    ...state.extras.map((extra, index) => ({
      id: extra.id,
      label: extraLabel(extra),
      start: extra.startFrame ?? 0,
      end: extra.endFrame ?? durationInFrames,
      color: ["#14b8a6", "#f97316", "#6366f1", "#e11d48"][index % 4],
    })),
  ];
  const selected = rows.find((row) => row.id === selectedId);
  const percent = (frame: number) => `${(frame / durationInFrames) * 100}%`;
  const playhead = percent(Math.max(0, Math.min(currentFrame, durationInFrames)));
  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(((event.clientX - rect.left) / rect.width) * durationInFrames);
  };
  const beginScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    // Arm a scrub first. A normal click should not shift the playhead because
    // browsers may emit a 1px pointer move while pressing the mouse.
    scrubRef.current = { startX: event.clientX, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const scrub = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = scrubRef.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (!drag.moved && Math.abs(event.clientX - drag.startX) < 4) return;
    drag.moved = true;
    seekFromPointer(event);
  };
  const endScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    // A deliberate click still seeks once; a held drag seeks continuously.
    if (scrubRef.current && !scrubRef.current.moved) seekFromPointer(event);
    scrubRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const setStart = (id: string, start: number, end: number) => onChange(id, Math.max(0, Math.min(start, end - 1)), end);
  const setEnd = (id: string, start: number, end: number) => onChange(id, start, Math.min(durationInFrames, Math.max(end, start + 1)));

  const beginBarDrag = (event: React.PointerEvent<HTMLDivElement>, row: typeof rows[number]) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(row.id);
    const bar = event.currentTarget;
    const track = bar.parentElement;
    if (!track) return;
    const rect = bar.getBoundingClientRect();
    const edge = Math.min(10, Math.max(4, rect.width / 3));
    const offset = event.clientX - rect.left;
    dragRef.current = {
      id: row.id,
      mode: offset <= edge ? "start" : offset >= rect.width - edge ? "end" : "move",
      startX: event.clientX,
      start: row.start,
      end: row.end,
      trackWidth: track.getBoundingClientRect().width,
      moved: false,
    };
    bar.setPointerCapture(event.pointerId);
  };

  const moveBarDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.trackWidth <= 0) return;
    // Ignore tiny pointer jitter so clicking a bar selects it without moving
    // its timing by one or two frames.
    if (!drag.moved && Math.abs(event.clientX - drag.startX) < 4) return;
    drag.moved = true;
    const delta = Math.round(((event.clientX - drag.startX) / drag.trackWidth) * durationInFrames);
    if (drag.mode === "start") setStart(drag.id, drag.start + delta, drag.end);
    else if (drag.mode === "end") setEnd(drag.id, drag.start, drag.end + delta);
    else {
      const length = drag.end - drag.start;
      const start = Math.max(0, Math.min(durationInFrames - length, drag.start + delta));
      onChange(drag.id, start, start + length);
    }
  };

  const endBarDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // Selecting on the canvas and selecting in the timeline use the same id.
  // When there are many layers, keep that selected row in view automatically.
  useEffect(() => {
    if (!selectedId || !rowsRef.current) return;
    const row = rowsRef.current.querySelector<HTMLElement>(`[data-timeline-id="${selectedId}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const timecode = (frame: number) => {
    const seconds = Math.max(0, frame) / 30;
    return `00:${String(Math.floor(seconds)).padStart(2, "0")}.${Math.round((seconds % 1) * 10)}`;
  };

  return <div
    onPointerDown={(event) => event.stopPropagation()}
    style={{ width: "100%", height: fullWidth ? "100%" : undefined, maxWidth: fullWidth ? "none" : "520px", minHeight: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", border: "1px solid #e4e6ea", borderRadius: "12px", fontSize: "11px", color: "#334155", background: "#fff", boxShadow: "0 4px 18px rgba(16,24,40,.08)", userSelect: "none" }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: "1px solid #eef0f3", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#ad4dca", boxShadow: "0 0 0 3px #f5eafd" }} />
        <strong style={{ fontSize: "11px", letterSpacing: ".03em", color: "#374151" }}>TIMELINE</strong>
      </div>
      <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: "10px", minWidth: "164px" }}>
        <button type="button" onClick={onTogglePlay} title={isPlaying ? "Pause video" : "Play video"} style={{ width: "24px", height: "24px", flexShrink: 0, display: "grid", placeItems: "center", border: 0, borderRadius: "50%", background: "#7158e8", color: "#fff", cursor: "pointer", fontSize: "10px", padding: 0, boxShadow: "0 2px 6px #7158e844" }}>{isPlaying ? "❚❚" : "▶"}</button>
        <span style={{ flex: 1, minWidth: 0, color: "#687385", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", textAlign: "right" }}>{timecode(currentFrame)} <span style={{ color: "#c5cad3" }}>/</span> {timecode(durationInFrames)}</span>
      </div>
    </div>
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "8px 12px 11px", background: "#fbfbfd", position: "relative" }}>
    <div onPointerDown={beginScrub} onPointerMove={scrub} onPointerUp={endScrub} onPointerCancel={endScrub} style={{ marginLeft: "110px", height: "24px", position: "relative", display: "grid", gridTemplateColumns: "repeat(11, 1fr)", color: "#697386", borderBottom: "1px solid #dde1e8", fontVariantNumeric: "tabular-nums", cursor: "ew-resize", touchAction: "none" }}>
      {Array.from({ length: 11 }, (_, tick) => <span key={tick} style={{ borderLeft: "1px solid #d5d9e0", paddingLeft: "3px", fontSize: "9px" }}>{((durationInFrames / 30 / 10) * tick).toFixed(tick === 0 ? 0 : 1)}s</span>)}
    </div>
    <div ref={rowsRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "6px", paddingTop: "9px", paddingRight: "14px", boxSizing: "border-box", overflowY: "auto", overflowX: "hidden", scrollbarGutter: "stable" }}>
      <VideoFrameStrip src={mediaSrc} onPointerDown={beginScrub} onPointerMove={scrub} onPointerUp={endScrub} onPointerCancel={endScrub} />
      {rows.map((row) => <div data-timeline-id={row.id} key={row.id} style={{ flex: "1 0 30px", display: "flex", alignItems: "center", gap: "6px", minHeight: "30px", minWidth: 0 }}>
        <button
          type="button"
          onClick={() => onSelect(row.id)}
          title={row.label}
          style={{ width: "104px", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", border: 0, borderRadius: "4px", padding: "4px 5px", background: row.id === selectedId ? "#edeaff" : "transparent", color: row.id === selectedId ? "#5d44c2" : "#5e6878", fontSize: "10px", cursor: "pointer", fontWeight: row.id === selectedId ? 700 : 400 }}
        >{row.label}</button>
        <div onPointerDown={beginScrub} onPointerMove={scrub} onPointerUp={endScrub} onPointerCancel={endScrub} style={{ flex: 1, minWidth: 0, height: "100%", minHeight: "26px", position: "relative", borderRadius: "6px", background: "#f0f1f5", backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), #e0e3e9 calc(10% - 1px), #e0e3e9 10%)", cursor: "ew-resize", touchAction: "none" }}>
          <div
            role="button"
            tabIndex={0}
            aria-label={`${row.label}: ${(row.start / 30).toFixed(1)} to ${(row.end / 30).toFixed(1)} seconds. Drag the middle to move; drag an edge to trim.`}
            onClick={() => onSelect(row.id)}
            onPointerDown={(event) => beginBarDrag(event, row)}
            onPointerMove={moveBarDrag}
            onPointerUp={endBarDrag}
            onPointerCancel={endBarDrag}
            style={{ position: "absolute", left: percent(row.start), width: percent(row.end - row.start), top: "3px", bottom: "3px", minWidth: "8px", borderRadius: "6px", border: row.id === selectedId ? `2px solid ${row.color}` : "1px solid rgba(255,255,255,.8)", boxShadow: row.id === selectedId ? `0 0 0 2px ${row.color}33` : "0 1px 2px rgba(36,42,52,.12)", background: `linear-gradient(90deg, ${row.color}, ${row.color}d9)`, color: "white", cursor: "grab", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "10px", fontWeight: 700, touchAction: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "6px", background: "rgba(255,255,255,.38)", cursor: "ew-resize" }} />
            {row.id === selectedId ? `${(row.start / 30).toFixed(1)}s – ${(row.end / 30).toFixed(1)}s` : ""}
            <span style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "6px", background: "rgba(255,255,255,.38)", cursor: "ew-resize" }} />
          </div>
        </div>
      </div>)}
    </div>
    <span aria-hidden="true" style={{ pointerEvents: "none", position: "absolute", zIndex: 8, left: `calc(122px + ${Math.max(0, Math.min(1, currentFrame / durationInFrames)) * 100}% - ${Math.max(0, Math.min(1, currentFrame / durationInFrames)) * 134}px)`, top: "3px", bottom: "10px", width: "2px", background: "#21242a", boxShadow: "0 0 0 1px #fff" }} />
    <span aria-hidden="true" style={{ pointerEvents: "none", position: "absolute", zIndex: 9, left: `calc(118px + ${Math.max(0, Math.min(1, currentFrame / durationInFrames)) * 100}% - ${Math.max(0, Math.min(1, currentFrame / durationInFrames)) * 134}px)`, top: "3px", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid #21242a" }} />
    </div>
    {selected ? <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", borderTop: "1px solid #eef0f3", background: "#fff", color: "#384152", minWidth: 0 }}>
      <strong title={selected.label} style={{ flex: "0 1 90px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.label}</strong>
      <span style={{ color: "#7c8697" }}>{(selected.start / 30).toFixed(1)}s – {(selected.end / 30).toFixed(1)}s</span>
      <span style={{ marginLeft: "auto", color: "#7c8697", whiteSpace: "nowrap" }}>Drag middle to move · edges to trim</span>
    </div> : <div style={{ padding: "9px 12px", borderTop: "1px solid #eef0f3", background: "#fff", color: "#7c8697" }}>Select a layer bar or an element on the canvas to set its timing.</div>}
  </div>;
}
