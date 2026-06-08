import { Zap, Square, FolderGit2 } from "lucide-react";

interface ControlPanelProps {
  isRunning: boolean;
  value: string;
  onChange: (v: string) => void;
  onTrigger: (objective: string) => void;
  onStop: () => void;
  projectActive?: boolean;
}

const DEFAULT_OBJECTIVE = "Build a real-time WebGL shader visualizer";

export function ControlPanel({ isRunning, value, onChange, onTrigger, onStop, projectActive }: ControlPanelProps) {
  const submit = () => {
    const objective = value.trim() || DEFAULT_OBJECTIVE;
    onChange("");
    onTrigger(objective);
  };

  const placeholder = isRunning
    ? "Pipeline running…"
    : projectActive
    ? "Continue: add a feature, fix a bug, or ask anything…"
    : "Assign objective or just chat…";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5">
      <div className="glass-panel pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-xl p-2">
        {/* Project mode icon */}
        {projectActive && !isRunning && (
          <FolderGit2 className="ml-1 size-4 shrink-0" style={{ color: "rgba(76,201,240,0.6)" }} />
        )}

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isRunning && submit()}
          placeholder={placeholder}
          disabled={isRunning}
          className="flex-1 bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-40"
        />

        {isRunning && (
          <button
            onClick={onStop}
            title="Abort pipeline"
            className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 font-display text-xs font-bold uppercase tracking-widest text-destructive transition-all hover:bg-destructive/20 hover:shadow-[0_0_20px_-4px_rgb(239_68_68_/_0.6)]"
          >
            <Square className="size-3.5 fill-current" />
            Stop
          </button>
        )}

        {!isRunning && (
          <button
            onClick={submit}
            className="group flex items-center gap-2 rounded-lg border border-cyan/40 bg-cyan/10 px-4 py-2 font-display text-xs font-bold uppercase tracking-widest text-cyan transition-all hover:bg-cyan/20 hover:shadow-[0_0_20px_-4px_var(--node-cyan)]"
          >
            <Zap className="size-4 transition-transform duration-150 group-hover:scale-110" />
            {projectActive ? "Continue" : "Trigger"}
          </button>
        )}
      </div>
    </div>
  );
}
