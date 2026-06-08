import { useEffect, useMemo, useRef, useState } from "react";
import { X, Download, FileCode2, CheckCircle2, File, Eye, Code2, SendHorizonal, Loader2 } from "lucide-react";
import type { ArtifactFile } from "@/lib/useOrchestration";

interface ArtifactPanelProps {
  isVisible: boolean;
  filename: string;
  artifactFiles: ArtifactFile[];
  onClose: () => void;
  confidenceScore?: number | null;
  /** True once at least one full build has completed */
  projectActive?: boolean;
  /** Whether the pipeline is currently running (locks the continuation input) */
  isRunning?: boolean;
  /** Called when the user submits a follow-up request from inside the panel */
  onContinue?: (request: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP builder (pure browser, no external deps)
// ─────────────────────────────────────────────────────────────────────────────

async function downloadZip(files: ArtifactFile[], basename: string) {
  try {
    const enc = new TextEncoder();
    const localEntries: Uint8Array[] = [];
    const centralEntries: Uint8Array[] = [];
    let offset = 0;

    const tbl = (() => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[i] = c;
      }
      return t;
    })();
    const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = tbl[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const u16 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
    const u32 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
    const cat = (...a: Uint8Array[]) => { const t = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; a.forEach(x => { t.set(x, p); p += x.length; }); return t; };

    for (const file of files) {
      const nb = enc.encode(file.path), db = enc.encode(file.content);
      const crc = crc32(db);
      const now = new Date();
      const dt = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
      const tm = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
      const lh = cat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), u16(20), u16(0), u16(0), u16(tm), u16(dt), u32(crc), u32(db.length), u32(db.length), u16(nb.length), u16(0), nb, db);
      localEntries.push(lh);
      centralEntries.push(cat(new Uint8Array([0x50, 0x4b, 0x01, 0x02]), u16(20), u16(20), u16(0), u16(0), u16(tm), u16(dt), u32(crc), u32(db.length), u32(db.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nb));
      offset += lh.length;
    }
    const cd = cat(...centralEntries);
    const eocd = cat(new Uint8Array([0x50, 0x4b, 0x05, 0x06]), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0));
    triggerDl(new Blob([cat(...localEntries, cd, eocd)], { type: "application/zip" }), `${basename}.zip`);
  } catch {
    const txt = files.map(f => `# ===== ${f.path} =====\n${f.content}`).join("\n\n");
    triggerDl(new Blob([txt], { type: "text/plain" }), `${basename}.txt`);
  }
}

function triggerDl(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview builder — generates a self-contained HTML for the iframe
// ─────────────────────────────────────────────────────────────────────────────

function buildPreviewHtml(files: ArtifactFile[]): string {
  // Case 1: index.html exists → inline CSS + JS into it
  const htmlFile = files.find(f => f.path === "index.html" || f.path.endsWith("/index.html"));
  if (htmlFile) {
    let doc = htmlFile.content;
    files.filter(f => f.path.endsWith(".css")).forEach(css => {
      doc = doc.replace(/<link[^>]+href=["'][^"']*\.css["'][^>]*>/gi, `<style>${css.content}</style>`);
    });
    files.filter(f => f.path.endsWith(".js") && !f.path.includes("node_modules")).forEach(js => {
      doc = doc.replace(/<script[^>]+src=["'][^"']*\.js["'][^>]*><\/script>/gi, `<script>${js.content}</script>`);
    });
    return doc;
  }

  // Case 2: README.md → styled markdown render
  const readme = files.find(f => /readme\.md$/i.test(f.path));
  if (readme) return renderMarkdownAsHtml(readme.content);

  // Case 3: Everything else → project overview card
  return buildProjectOverview(files);
}

function renderMarkdownAsHtml(md: string): string {
  const body = md
    .replace(/^# (.+)/gm, "<h1>$1</h1>")
    .replace(/^## (.+)/gm, "<h2>$1</h2>")
    .replace(/^### (.+)/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^- (.+)/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, "</p><p>");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 24px;background:#0a0a16;color:#c8e6ff;line-height:1.7}
    h1,h2,h3{color:#4cc9f0;border-bottom:1px solid rgba(76,201,240,0.2);padding-bottom:6px;margin:1.2em 0 0.6em}
    code{background:rgba(76,201,240,0.1);color:#4cc9f0;padding:2px 6px;border-radius:4px;font-size:0.87em;font-family:monospace}
    ul{padding-left:20px} li{margin:4px 0} strong{color:#f0f0ff}
  </style></head><body><p>${body}</p></body></html>`;
}

function buildProjectOverview(files: ArtifactFile[]): string {
  const ext = (p: string) => p.split(".").pop() ?? "";
  const ICONS: Record<string, string> = { py: "🐍", js: "📜", ts: "💙", jsx: "⚛️", tsx: "⚛️", html: "🌐", css: "🎨", json: "📦", md: "📝", txt: "📄", toml: "⚙️", yaml: "⚙️", yml: "⚙️" };
  const icon = (p: string) => ICONS[ext(p)] ?? "📁";

  // Language breakdown
  const langs: Record<string, number> = {};
  files.forEach(f => { const e = ext(f.path); langs[e] = (langs[e] || 0) + 1; });
  const langPills = Object.entries(langs)
    .map(([e, n]) => `<span style="background:rgba(76,201,240,0.12);border:1px solid rgba(76,201,240,0.25);border-radius:4px;padding:2px 8px;font-size:11px;color:#4cc9f0;font-family:monospace">.${e} ×${n}</span>`)
    .join(" ");

  // File tree rows
  const fileRows = files.map(f => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
      <span style="font-size:15px;flex-shrink:0">${icon(f.path)}</span>
      <div style="flex:1;min-width:0">
        <div style="font-family:monospace;font-size:12px;color:#4cc9f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.path}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:2px">${f.content.split("\n").length} lines · ${(f.content.length / 1024).toFixed(1)} KB</div>
      </div>
    </div>`).join("");

  // Entry point code preview (first file, first 25 lines)
  const entry = files[0];
  const preview = entry?.content.split("\n").slice(0, 25).join("\n") ?? "";
  const truncated = (entry?.content.split("\n").length ?? 0) > 25;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0a0a16;color:#c8e6ff;padding:20px;overflow:auto}
    .glow{color:#4cc9f0;text-shadow:0 0 12px rgba(76,201,240,0.6)}
    .section{margin-bottom:20px}
    .label{font-size:9px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.18em;margin-bottom:8px}
    .card{background:rgba(76,201,240,0.03);border:1px solid rgba(76,201,240,0.12);border-radius:10px;padding:12px}
    pre{background:#060610;border:1px solid rgba(76,201,240,0.15);border-radius:8px;padding:14px;font-size:10.5px;font-family:monospace;line-height:1.55;overflow:auto;max-height:220px;color:rgba(200,230,255,0.85)}
    .langs{display:flex;flex-wrap:wrap;gap:6px}
  </style></head><body>
    <div class="section" style="display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid rgba(76,201,240,0.15);margin-bottom:20px">
      <div>
        <div class="glow" style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase">⚡ Project Preview</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:3px">Generated by Aetheria · ${files.length} files</div>
      </div>
      <span style="background:rgba(76,201,240,0.1);border:1px solid rgba(76,201,240,0.3);border-radius:4px;padding:3px 10px;font-size:10px;color:#4cc9f0;font-family:monospace">${files.length} files</span>
    </div>

    <div class="section">
      <div class="label">Languages</div>
      <div class="langs">${langPills}</div>
    </div>

    <div class="section">
      <div class="label">File Structure</div>
      <div class="card">${fileRows}</div>
    </div>

    ${entry ? `
    <div class="section">
      <div class="label">${entry.path} — entry point preview</div>
      <pre>${preview.replace(/</g, "&lt;").replace(/>/g, "&gt;")}${truncated ? "\n\n… (truncated — see full file in Code tab)" : ""}</pre>
    </div>` : ""}
  </body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ArtifactPanel({
  isVisible,
  filename,
  artifactFiles,
  onClose,
  confidenceScore,
  projectActive,
  isRunning,
  onContinue,
}: ArtifactPanelProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [viewMode, setViewMode] = useState<"code" | "preview">("code");
  const [continueText, setContinueText] = useState("");
  const continueInputRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const displayScore = confidenceScore != null ? confidenceScore.toFixed(3) : "—";

  const submitContinue = () => {
    const text = continueText.trim();
    if (!text || isRunning || !onContinue) return;
    setContinueText("");
    onContinue(text);
  };

  // Reset state when a new artifact arrives
  useEffect(() => {
    if (isVisible) {
      setActiveTab(0);
      setViewMode("code");
      codeRef.current?.scrollTo({ top: 0 });
    }
  }, [isVisible, artifactFiles]);

  useEffect(() => { codeRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }, [activeTab]);

  // Build preview HTML from files (memoized — only recomputes when files change)
  const previewHtml = useMemo(
    () => (isVisible && artifactFiles.length > 0 ? buildPreviewHtml(artifactFiles) : null),
    [isVisible, artifactFiles],
  );

  // Load iframe blob URL when switching to preview
  useEffect(() => {
    if (viewMode === "preview" && iframeRef.current && previewHtml) {
      const blob = new Blob([previewHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      iframeRef.current.src = url;
      return () => URL.revokeObjectURL(url);
    }
  }, [viewMode, previewHtml]);

  const activeFile = artifactFiles[activeTab];

  return (
    <>
      {/* Backdrop */}
      <div
        className="pointer-events-none absolute inset-0 z-30 transition-opacity duration-500"
        style={{ background: "radial-gradient(ellipse at center, transparent 30%, #0a0a16bb 100%)", opacity: isVisible ? 1 : 0 }}
      />

      {/* Panel */}
      <div
        className="absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5 transition-all duration-500"
        style={{ transform: isVisible ? "translateY(0)" : "translateY(110%)", opacity: isVisible ? 1 : 0, pointerEvents: isVisible ? "auto" : "none" }}
      >
        <div
          className="glass-panel w-full max-w-4xl overflow-hidden rounded-2xl"
          style={{ border: "1px solid rgba(76,201,240,0.22)", boxShadow: "0 0 60px -10px rgba(76,201,240,0.25), inset 0 1px 0 rgba(255,255,255,0.06)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "rgba(76,201,240,0.15)" }}>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-destructive/80" />
                <span className="size-2.5 rounded-full bg-warning/80" />
                <span className="size-2.5 rounded-full bg-success/80" />
              </div>
              <FileCode2 className="size-4" style={{ color: "#4cc9f0", filter: "drop-shadow(0 0 6px #4cc9f0)" }} />
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: "#4cc9f0", textShadow: "0 0 10px #4cc9f0" }}>
                {filename} · {artifactFiles.length} file{artifactFiles.length !== 1 ? "s" : ""}
              </span>
              {projectActive && (
                <span
                  className="flex cursor-default items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest"
                  style={{ borderColor: "rgba(76,201,240,0.3)", color: "rgba(76,201,240,0.7)" }}
                  title="Type below to keep building on this project"
                >
                  <span className="size-1 animate-pulse rounded-full bg-cyan-400" />
                  project mode
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Code / Preview toggle */}
              <div className="flex overflow-hidden rounded border" style={{ borderColor: "rgba(76,201,240,0.2)" }}>
                <button
                  onClick={() => setViewMode("code")}
                  className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider transition-all"
                  style={{ background: viewMode === "code" ? "rgba(76,201,240,0.15)" : "transparent", color: viewMode === "code" ? "#4cc9f0" : "rgba(255,255,255,0.35)" }}
                >
                  <Code2 className="size-2.5" /> Code
                </button>
                <button
                  onClick={() => setViewMode("preview")}
                  className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider transition-all"
                  style={{ background: viewMode === "preview" ? "rgba(76,201,240,0.15)" : "transparent", color: viewMode === "preview" ? "#4cc9f0" : "rgba(255,255,255,0.35)", borderLeft: "1px solid rgba(76,201,240,0.2)" }}
                >
                  <Eye className="size-2.5" /> Preview
                </button>
              </div>

              {confidenceScore != null && (
                <div className="flex items-center gap-1.5 rounded border border-success/30 bg-success/10 px-2 py-0.5">
                  <CheckCircle2 className="size-3 text-success" />
                  <span className="font-mono text-[9px] uppercase tracking-widest text-success">Validated · {displayScore}</span>
                </div>
              )}

              <button onClick={onClose} aria-label="Close artifact panel" className="flex size-6 items-center justify-center rounded border border-white/10 bg-white/5 text-muted-foreground transition-all hover:border-white/20 hover:bg-white/10 hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* File tabs — only in code mode */}
          {viewMode === "code" && artifactFiles.length > 1 && (
            <div className="flex gap-0 overflow-x-auto border-b" style={{ borderColor: "rgba(76,201,240,0.10)" }}>
              {artifactFiles.map((file, i) => (
                <button
                  key={file.path}
                  onClick={() => setActiveTab(i)}
                  className="flex shrink-0 items-center gap-1.5 px-4 py-2 font-mono text-[10px] transition-all"
                  style={{ color: i === activeTab ? "#4cc9f0" : "rgba(255,255,255,0.35)", borderBottom: i === activeTab ? "2px solid #4cc9f0" : "2px solid transparent", background: i === activeTab ? "rgba(76,201,240,0.06)" : "transparent" }}
                >
                  <File className="size-3 shrink-0" /> {file.path}
                </button>
              ))}
            </div>
          )}

          {/* Content area */}
          <div
            className="relative overflow-hidden"
            style={{ height: "40vh", background: "linear-gradient(180deg, rgba(76,201,240,0.02) 0%, transparent 100%)" }}
          >
            {/* scanline */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px z-10"
              style={{ background: "linear-gradient(90deg, transparent, #4cc9f066, transparent)", animation: "scanline 3s linear infinite" }}
            />

            {/* CODE VIEW */}
            {viewMode === "code" && (
              <pre
                ref={codeRef}
                className="thin-scroll h-full overflow-y-auto p-5 font-mono text-[11px] leading-relaxed"
                style={{ color: "rgba(200,230,255,0.85)", background: "transparent", tabSize: 4 }}
              >
                <code>{activeFile?.content ?? ""}</code>
              </pre>
            )}

            {/* PREVIEW VIEW */}
            {viewMode === "preview" && (
              <iframe
                ref={iframeRef}
                sandbox="allow-scripts allow-same-origin"
                className="h-full w-full border-0"
                title="Project Preview"
              />
            )}

            {/* bottom fade (code mode only) */}
            {viewMode === "code" && (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
                style={{ background: "linear-gradient(to bottom, transparent, oklch(0.16 0.035 275 / 80%))" }}
              />
            )}
          </div>

          {/* Footer */}
          <div className="border-t" style={{ borderColor: "rgba(76,201,240,0.15)" }}>

            {/* ── Continuation input — only shown when project is active ── */}
            {projectActive && (
              <div
                className="flex items-center gap-2 border-b px-4 py-2.5"
                style={{ borderColor: "rgba(76,201,240,0.10)", background: "rgba(76,201,240,0.03)" }}
              >
                <span
                  className="shrink-0 font-mono text-[9px] uppercase tracking-widest"
                  style={{ color: "rgba(76,201,240,0.5)" }}
                >
                  continue&nbsp;›
                </span>
                <input
                  ref={continueInputRef}
                  value={continueText}
                  onChange={(e) => setContinueText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitContinue()}
                  disabled={isRunning}
                  placeholder={isRunning ? "Pipeline running…" : "Add a feature, fix a bug, change the style…"}
                  className="flex-1 bg-transparent font-mono text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none disabled:opacity-40"
                  style={{ caretColor: "#4cc9f0" }}
                  autoComplete="off"
                />
                <button
                  onClick={submitContinue}
                  disabled={!continueText.trim() || isRunning}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all disabled:opacity-30"
                  style={{
                    color: "#4cc9f0",
                    border: "1px solid rgba(76,201,240,0.35)",
                    background: "rgba(76,201,240,0.08)",
                  }}
                >
                  {isRunning
                    ? <Loader2 className="size-3 animate-spin" />
                    : <SendHorizonal className="size-3" />}
                  {isRunning ? "Running" : "Send"}
                </button>
              </div>
            )}

            {/* ── Bottom bar: meta info + download ── */}
            <div className="flex items-center justify-between px-5 py-3">
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                aetheria@evaluator · {artifactFiles.length} file{artifactFiles.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => downloadZip(artifactFiles, filename)}
                className="group flex items-center gap-2 rounded-lg px-5 py-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] transition-all duration-200"
                style={{ color: "#4cc9f0", border: "1px solid rgba(76,201,240,0.45)", background: "rgba(76,201,240,0.08)", textShadow: "0 0 10px #4cc9f0" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(76,201,240,0.18)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 24px -4px rgba(76,201,240,0.6)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(76,201,240,0.08)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
              >
                <Download className="size-3.5 transition-transform duration-200 group-hover:-translate-y-0.5" />
                Download ZIP
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
