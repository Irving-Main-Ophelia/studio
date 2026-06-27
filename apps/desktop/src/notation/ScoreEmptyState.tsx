import { FileMusic, FolderOpen, Music2, Plus } from "lucide-react";

interface ScoreEmptyStateProps {
  onNewProject?: () => void;
  onImportAudio?: () => void;
  onOpenMusicXml?: () => void;
}

export function ScoreEmptyState({
  onNewProject,
  onImportAudio,
  onOpenMusicXml,
}: ScoreEmptyStateProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-10 text-center">
      <p className="musical text-3xl text-score-ink/50 select-none">
        &ldquo;What do we compose today?&rdquo;
      </p>
      <div className="flex flex-wrap items-stretch justify-center gap-2">
        <EmptyActionCard icon={<Plus size={16} />} label="New Project" onClick={onNewProject} />
        <EmptyActionCard
          icon={<Music2 size={16} />}
          label="Import Audio"
          sub="FLAC / MP3 / WAV"
          onClick={onImportAudio}
        />
        <EmptyActionCard
          icon={<FileMusic size={16} />}
          label="Import MIDI"
          sub=".mid .midi"
          onClick={onImportAudio}
        />
        <EmptyActionCard
          icon={<FolderOpen size={16} />}
          label="Open MusicXML"
          sub=".xml .musicxml"
          onClick={onOpenMusicXml}
        />
      </div>
      <p className="num text-[9px] uppercase tracking-[0.3em] text-score-ink/30 select-none">
        Press{" "}
        <kbd className="rounded border border-score-ink/20 bg-score-ink/5 px-1 font-sans text-[9px]">
          cmd K
        </kbd>{" "}
        for all options
      </p>
    </div>
  );
}

function EmptyActionCard({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={[
        "group relative flex w-36 cursor-pointer flex-col items-center gap-2.5 rounded-xl px-4 py-5 text-center",
        "border border-score-ink/10 bg-score-ink/5",
        "transition-all duration-150",
        "hover:border-neon-violet/60 hover:bg-neon-violet/10",
        "hover:shadow-[0_0_24px_rgba(139,92,246,0.18)]",
        "active:scale-[0.97]",
        "disabled:cursor-not-allowed disabled:opacity-30",
      ].join(" ")}
    >
      <span className="text-score-ink/40 transition-colors duration-150 group-hover:text-neon-violet">
        {icon}
      </span>
      <span className="text-[11px] font-semibold leading-tight tracking-wide text-score-ink/70 transition-colors duration-150 group-hover:text-score-ink">
        {label}
      </span>
      {sub && (
        <span className="text-[8px] uppercase tracking-widest text-score-ink/30 group-hover:text-score-ink/50">
          {sub}
        </span>
      )}
    </button>
  );
}
