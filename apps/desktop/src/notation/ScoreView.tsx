import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

import type { MeasureRange, SelectedNote } from "../editor/SelectionState";
import type { Articulation, Dynamic } from "../lib/api";
import { EditLayer } from "./EditLayer";
import { ScoreEmptyState } from "./ScoreEmptyState";
import { annotateScoreNotes } from "./osmdAnnotate";
import { createScoreOsmd } from "./osmdFactory";
import { timeSignatureFromMusicXml } from "./noteResolve";
import { api, type ListedNoteRow } from "../lib/api";

interface ScoreViewProps {
  musicxml: string | null;
  /**
   * Optional view-projected MusicXML to render in OSMD instead of `musicxml`
   * (e.g. a tablature view, Track A / A1). When set, it drives the rendered
   * staves and the note index; `musicxml` stays the canonical source of truth
   * for editing, so the edit overlay is expected to be disabled while a
   * projection is active.
   */
  renderMusicxml?: string | null;
  timeSignature?: string;
  positionSec?: number;
  durationSec?: number;
  theme?: "parchment" | "night";
  editEnabled?: boolean;
  selectedNote?: SelectedNote | null;
  measureRange?: MeasureRange | null;
  captureMode?: boolean;
  editorBusy?: boolean;
  onSelectNote?: (note: SelectedNote | null) => void;
  onMeasureRange?: (range: MeasureRange | null) => void;
  onNoteDuration?: (note: SelectedNote, quarters: number) => void;
  onNoteArticulation?: (note: SelectedNote, articulation: Articulation) => void;
  onNoteDynamic?: (note: SelectedNote, dynamic: Dynamic) => void;
  onNoteRespell?: (note: SelectedNote) => void;
  onNotePitch?: (note: SelectedNote, pitch: string) => void;
  onNoteTranspose?: (note: SelectedNote, semitones: number) => void;
  onNoteRemove?: (note: SelectedNote) => void;
  editorError?: string | null;
  onNewProject?: () => void;
  onImportAudio?: () => void;
  onOpenMusicXml?: () => void;
}

/**
 * Renders a MusicXML score with OpenSheetMusicDisplay.
 *
 * OSMD owns `osmdMountRef` exclusively — React overlays live in a sibling layer
 * so `osmd.render()` never destroys React-managed DOM (removeChild crashes).
 */
export function ScoreView({
  musicxml,
  renderMusicxml = null,
  timeSignature = "4/4",
  positionSec = 0,
  durationSec = 0,
  theme = "parchment",
  editEnabled = false,
  selectedNote = null,
  measureRange = null,
  captureMode = false,
  editorBusy = false,
  onSelectNote,
  onMeasureRange,
  onNoteDuration,
  onNoteArticulation,
  onNoteDynamic,
  onNoteRespell,
  onNotePitch,
  onNoteTranspose,
  onNoteRemove,
  editorError = null,
  onNewProject,
  onImportAudio,
  onOpenMusicXml,
}: ScoreViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const osmdMountRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [noteIndex, setNoteIndex] = useState<ListedNoteRow[]>([]);
  const [overlayReady, setOverlayReady] = useState(false);
  const prevMusicxmlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!osmdMountRef.current) return;
    const osmd = createScoreOsmd(osmdMountRef.current, theme);
    osmdRef.current = osmd;
    return () => {
      osmd.clear();
      osmdRef.current = null;
    };
  }, [theme]);

  // After mount the scroll + OSMD mount refs are attached; flip the overlay on once.
  useEffect(() => {
    setOverlayReady(!!scrollRef.current && !!osmdMountRef.current);
  }, []);

  // What OSMD actually renders: the projected view if one is active, else the
  // canonical score. Keeping the note index/annotations on the *same* XML avoids
  // an overlay/layout mismatch when a tab projection is shown.
  const displayXml = renderMusicxml ?? musicxml;

  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !displayXml) return;

    const isFirstLoad = prevMusicxmlRef.current === null;
    if (isFirstLoad) setLoading(true);
    else setUpdating(true);
    setError(null);

    let cancelled = false;
    void (async () => {
      try {
        osmd.clear();
        await osmd.load(displayXml);
        if (cancelled) return;
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        if (cancelled) return;
        osmd.render();
        setLoading(false);
        setUpdating(false);
        if (!osmdMountRef.current) return;
        const res = await api.listScoreNotes(displayXml);
        if (cancelled || !osmdMountRef.current) return;
        setNoteIndex(res.notes);
        const ts = timeSignatureFromMusicXml(displayXml);
        annotateScoreNotes(osmd, osmdMountRef.current, res.notes, ts || timeSignature);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setLoading(false);
        setUpdating(false);
      }
    })();

    prevMusicxmlRef.current = displayXml;
    return () => {
      cancelled = true;
    };
  }, [displayXml, timeSignature]);

  const isParchment = theme === "parchment";

  return (
    <div
      className={[
        "relative h-full w-full overflow-hidden rounded-xl ring-1 ring-obsidian-700/70 shadow-[0_30px_80px_-30px_rgba(255,46,136,0.25)]",
        isParchment
          ? "bg-score-parchment text-score-ink"
          : "bg-score-night-bg text-score-night-ink",
      ].join(" ")}
    >
      <div
        aria-hidden
        className="absolute left-0 right-0 top-0 z-10 h-px bg-neon-magenta/70 transition-[width] duration-100"
        style={{
          width: `${durationSec > 0 ? Math.min(100, (positionSec / durationSec) * 100) : 0}%`,
        }}
      />

      <div
        ref={scrollRef}
        className="relative h-full w-full overflow-auto"
      >
        <div
          ref={osmdMountRef}
          className="px-6 py-8 [&_svg]:!w-full [&_svg]:!h-auto"
        />

        {editEnabled && musicxml && !loading && overlayReady && (
          <EditLayer
            osmd={osmdRef.current}
            scrollContainer={scrollRef.current}
            scoreRoot={osmdMountRef.current}
            noteIndex={noteIndex}
            timeSignature={
              musicxml ? timeSignatureFromMusicXml(musicxml) : timeSignature
            }
            enabled={editEnabled}
            selectedNote={selectedNote}
            measureRange={measureRange}
            captureMode={captureMode}
            busy={editorBusy}
            onSelectNote={(n) => onSelectNote?.(n)}
            onMeasureRange={(r) => onMeasureRange?.(r)}
            onDuration={(n, q) => onNoteDuration?.(n, q)}
            onArticulation={(n, a) => onNoteArticulation?.(n, a)}
            onDynamic={(n, d) => onNoteDynamic?.(n, d)}
            onRespell={(n) => onNoteRespell?.(n)}
            onPitch={(n, p) => onNotePitch?.(n, p)}
            onTranspose={(n, st) => onNoteTranspose?.(n, st)}
            onRemove={(n) => onNoteRemove?.(n)}
            editorError={editorError}
          />
        )}
      </div>

      {!musicxml && !loading && !error && (
        <ScoreEmptyState
          onNewProject={onNewProject}
          onImportAudio={onImportAudio}
          onOpenMusicXml={onOpenMusicXml}
        />
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-score-parchment/80">
          <span className="num text-[10px] uppercase tracking-[0.3em] opacity-50">
            Rendering score…
          </span>
        </div>
      )}

      {updating && !loading && (
        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-md border border-neon-cyan/40 bg-obsidian-900/90 px-2 py-1 text-[10px] text-neon-cyan">
          Updating score…
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-score-parchment/95 px-8 text-center">
          <div>
            <p className="font-medium text-danger">Could not render this score.</p>
            <p className="mt-2 text-xs opacity-70">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
