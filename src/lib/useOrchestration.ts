import { useCallback, useEffect, useRef, useState } from "react";
import {
  AGENTS,
  AGENT_ORDER,
  type AgentId,
  type AgentStatus,
} from "./agents";

// ─────────────────────────────────────────────────────────────────────────────
// Ollama config
// ─────────────────────────────────────────────────────────────────────────────

const OLLAMA_BASE = "http://localhost:11434";

const MODEL_PREFERENCE = [
  "mistral:7b-instruct-q4_K_M",
  "mistral:latest",
  "qwen2.5-coder:3b",
  "qwen2.5-coder:latest",
] as const;

type PreferredModel = (typeof MODEL_PREFERENCE)[number] | string;

const MAX_EVAL_LOOPS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Real-time VRAM polling via Ollama /api/ps
// ─────────────────────────────────────────────────────────────────────────────

interface OllamaPsModel {
  name: string;
  size: number;       // total model bytes
  size_vram: number;  // bytes currently in VRAM
}

/** Polls Ollama /api/ps for real model VRAM usage. Returns { usedGb, totalGb } */
async function fetchOllamaVram(): Promise<{ usedGb: number; totalGb: number } | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/ps`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: OllamaPsModel[] };
    const models = data.models ?? [];
    if (models.length === 0) return null;
    const usedBytes = models.reduce((s, m) => s + (m.size_vram ?? 0), 0);
    const totalBytes = models.reduce((s, m) => s + (m.size ?? 0), 0);
    return {
      usedGb: usedBytes / 1_073_741_824,
      // total = model size * 1.25 to account for KV cache + OS overhead
      totalGb: (totalBytes / 1_073_741_824) * 1.25,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Casual speech detection
// ─────────────────────────────────────────────────────────────────────────────

const TECHNICAL_KEYWORDS = [
  "build", "create", "make", "write", "generate", "implement", "develop",
  "code", "script", "api", "app", "system", "server", "database", "tool",
  "function", "class", "module", "service", "bot", "cli", "pipeline",
  "automate", "scraper", "parser", "crawler", "deploy", "setup", "website",
  "frontend", "backend", "fullstack", "dashboard", "visualizer",
  "add", "fix", "update", "change", "refactor", "extend", "improve",
];

function isCasualSpeech(input: string): boolean {
  const t = input.trim().toLowerCase();
  if (t.split(" ").length <= 3) return true;
  return !TECHNICAL_KEYWORDS.some((kw) => t.includes(kw));
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent personas
// ─────────────────────────────────────────────────────────────────────────────

const PERSONAS = {
  gateway: {
    system: `You are the GATEWAY Agent. Your role is to decompose a high-level user goal and kick off the system.
Output a clear, numbered breakdown of:
1. The core objective restated precisely.
2. A list of concrete deliverables.
3. Any explicit constraints (language, environment, compatibility).
Output plain text only. Be concise. No code.`,
  },
  researcher: {
    system: `You are the RESEARCHER Agent — an elite Software Architect.
Your role: Choose the tech stack, outline the architectural context, and produce a CLEAN FILE MANIFEST.

You MUST output two sections:
ARCHITECTURE:
- (bullet points covering design patterns, data flows, async strategy, error handling)

FILE MANIFEST:
- <filename>: <one-line description of this file's responsibility>

Rules:
- Do NOT write any code.
- For browser scripts (.js): flag as "vanilla ES6, no imports".
- For modern modules (.jsx/.tsx/.mjs): flag as "ES module imports only".
- Never mix CommonJS require() with ES import in the same file.`,
  },
  coder: {
    system: `You are the CODER Agent — a context-aware builder.
You receive a Researcher's architecture plan and build the actual files.

Module rules (strict):
- .js for pure browser → vanilla ES6 only (no import/export, no require).
- .mjs/.jsx/.tsx → ES module syntax (import/export). NEVER use require().
- .py → standard Python imports, asyncio where appropriate.
- NEVER mix CommonJS (require/module.exports) with ES modules (import/export) in the same file.

Output format — use EXACTLY this delimiter per file:
===FILE: <relative/path/to/filename>===
<complete file content>
===ENDFILE===

Rules:
- Split into ALL files from the File Manifest.
- No markdown fences, no prose, no explanations.
- Every file must be complete and immediately runnable.`,
  },
  evaluator: {
    system: `You are the EVALUATOR Agent — automated code reviewer.
Inspect the Coder's output for:
- Design flaws and architectural drift.
- Logic loopholes, missing edge case handling.
- Security risks (injection, hardcoded secrets, unsafe eval).
- CommonJS/ESM module mixing violations.
- Missing error handling in async functions.
- Syntax errors or unrunnable code.

Output format:
ISSUES:
- <describe each issue, or write "None" if clean>

REVIEW_STATUS: PASS
(or)
REVIEW_STATUS: FAIL

VALIDATED_CONFIDENCE_SCORE: <float 0.00–1.00>`,
  },
} satisfies Record<AgentId, { system: string }>;

const CASUAL_PERSONA = {
  system: "You are Aetheria, a friendly AI assistant in a futuristic agentic dashboard. Reply naturally and briefly. Keep it under 3 sentences.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ArtifactFile { path: string; content: string }
export interface AgentRuntime { status: AgentStatus; task: string; tokensPerSec: number; vramGb: number }
export interface ActivePacket { from: AgentId; to: AgentId; color: string; id: number }
export type LogLevel = "info" | "agent" | "success" | "warn" | "error" | "loop";
export interface LogLine { id: number; ts: string; source: string; text: string; level: LogLevel }

// ─────────────────────────────────────────────────────────────────────────────
// Ollama API
// ─────────────────────────────────────────────────────────────────────────────

interface OllamaReq { model: string; prompt: string; system?: string; stream: boolean; options?: { temperature?: number; top_p?: number; num_ctx?: number; num_predict?: number } }
interface OllamaRes { response: string; done: boolean }

async function queryOllama(agentId: AgentId | "casual", prompt: string, onToken: (n: number) => void, signal: AbortSignal, model: PreferredModel): Promise<string> {
  const persona = agentId === "casual" ? CASUAL_PERSONA : PERSONAS[agentId];
  const body: OllamaReq = {
    model, system: persona.system,
    prompt: `[INST] ${prompt} [/INST]`,
    stream: true,
    options: {
      temperature: agentId === "coder" ? 0.15 : agentId === "casual" ? 0.75 : 0.45,
      top_p: 0.92, num_ctx: 4096,
      num_predict: agentId === "casual" ? 256 : agentId === "evaluator" ? 768 : 2048,
    },
  };
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Ollama response body is null");
  const dec = new TextDecoder();
  let full = ""; let n = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value, { stream: true }).split("\n").filter(Boolean)) {
      try {
        const p: OllamaRes = JSON.parse(line);
        if (p.response) { full += p.response; onToken(++n); }
        if (p.done) return full;
      } catch { /* partial */ }
    }
  }
  return full;
}

async function checkOllamaHealth(): Promise<{ reachable: boolean; model: PreferredModel | null }> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { reachable: false, model: null };
    const data = (await res.json()) as { models?: { name: string }[] };
    const pulled = data.models?.map((m) => m.name) ?? [];
    const best = MODEL_PREFERENCE.find((p) => pulled.some((n) => n === p || n.startsWith(p.split(":")[0]))) ?? null;
    return { reachable: true, model: best };
  } catch { return { reachable: false, model: null }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-file parser
// ─────────────────────────────────────────────────────────────────────────────

export function parseMultiFile(raw: string): ArtifactFile[] {
  const files: ArtifactFile[] = [];
  const START = /===FILE:\s*(.+?)===/g;
  const END = "===ENDFILE===";
  let m: RegExpExecArray | null;
  while ((m = START.exec(raw)) !== null) {
    const path = m[1].trim();
    const cs = m.index + m[0].length;
    const ei = raw.indexOf(END, cs);
    const content = (ei !== -1 ? raw.slice(cs, ei) : raw.slice(cs)).trim();
    if (path && content) files.push({ path, content });
  }
  if (!files.length && raw.trim())
    files.push({ path: "main.py", content: raw.replace(/^```\w*\s*/i, "").replace(/```\s*$/i, "").trim() });
  return files;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluator result parser
// ─────────────────────────────────────────────────────────────────────────────

interface EvalResult { status: "PASS" | "FAIL"; issues: string; confidence: number }

function parseEvalResult(raw: string): EvalResult {
  const sm = raw.match(/REVIEW_STATUS:\s*(PASS|FAIL)/i);
  const status = (sm?.[1]?.toUpperCase() ?? "FAIL") as "PASS" | "FAIL";
  const cm = raw.match(/VALIDATED_CONFIDENCE_SCORE:\s*([\d.]+)/i);
  const confidence = cm ? Math.min(1, Math.max(0, parseFloat(cm[1]) || 0.5)) : 0.5;
  const im = raw.match(/ISSUES:\s*([\s\S]*?)(?=REVIEW_STATUS:|$)/i);
  return { status, confidence, issues: im?.[1]?.trim() ?? raw.trim() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function nowStamp() { return new Date().toLocaleTimeString("en-GB", { hour12: false }); }
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "artifact"; }

function makeIdleAgents(): Record<AgentId, AgentRuntime> {
  return AGENT_ORDER.reduce((acc, id) => {
    acc[id] = { status: "Idle", task: AGENTS[id].idleTask, tokensPerSec: 0, vramGb: 0.4 };
    return acc;
  }, {} as Record<AgentId, AgentRuntime>);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useOrchestration() {
  const [agents, setAgents] = useState<Record<AgentId, AgentRuntime>>(makeIdleAgents);
  const [logs, setLogs] = useState<LogLine[]>([{ id: 0, ts: nowStamp(), source: "SYSTEM", text: "Aetheria mesh online · Mistral 7B (q4_K_M) · awaiting objective.", level: "info" }]);
  const [activePacket, setActivePacket] = useState<ActivePacket | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // ── Artifact state ────────────────────────────────────────────────────────
  const [artifactVisible, setArtifactVisible] = useState(false);
  const [artifactFilename, setArtifactFilename] = useState("");
  const [artifactFiles, setArtifactFiles] = useState<ArtifactFile[]>([]);
  const [artifactCodeContent, setArtifactCodeContent] = useState("");
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);
  const [loopCount, setLoopCount] = useState(0);

  // ── Project continuation ──────────────────────────────────────────────────
  // When true, the user can keep prompting to iterate on the current project.
  const [projectActive, setProjectActive] = useState(false);

  // ── Real-time VRAM ────────────────────────────────────────────────────────
  const [totalVramGb, setTotalVramGb] = useState(6); // updated by polling

  const closeArtifact = useCallback(() => setArtifactVisible(false), []);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const logId = useRef(1);
  const packetId = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const payloads = useRef({ gateway: "", researcher: "", coder: "", evaluator: "" });
  const activeAgentRef = useRef<AgentId | null>(null); // which agent is currently generating

  // ── Helpers ───────────────────────────────────────────────────────────────
  const pushLog = useCallback((source: string, text: string, level: LogLevel = "info") => {
    setLogs((p) => [...p, { id: logId.current++, ts: nowStamp(), source, text, level }].slice(-150));
  }, []);

  const setAgent = useCallback((id: AgentId, patch: Partial<AgentRuntime>) => {
    setAgents((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
    if (patch.status === "Thinking" || patch.status === "Compiling") activeAgentRef.current = id;
  }, []);

  const resetAgents = useCallback(() => {
    AGENT_ORDER.forEach((id) => setAgent(id, { status: "Idle", task: AGENTS[id].idleTask, tokensPerSec: 0, vramGb: 0.4 }));
    setActivePacket(null);
    activeAgentRef.current = null;
  }, [setAgent]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    resetAgents();
    setIsRunning(false);
  }, [resetAgents]);

  // ── Real-time VRAM polling (every 2 s) ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const vram = await fetchOllamaVram();
      if (!cancelled && vram) {
        // totalGb = model size * 1.25 overhead — update once when we first see a value
        setTotalVramGb((prev) => vram.totalGb > 0 ? Math.max(prev, +(vram.totalGb).toFixed(1)) : prev);

        // Distribute VRAM to agents
        setAgents((prev) => {
          const next = { ...prev };
          for (const id of AGENT_ORDER) {
            const a = prev[id];
            const isActive = id === activeAgentRef.current &&
              (a.status === "Thinking" || a.status === "Compiling" || a.status === "Transferring");
            // Active agent gets the real VRAM, idle agents share minimal baseline
            const targetVram = isActive ? vram.usedGb : 0.3 + Math.random() * 0.15;
            next[id] = { ...a, vramGb: +(a.vramGb + (targetVram - a.vramGb) * 0.3).toFixed(2) };
          }
          return next;
        });
      } else if (!cancelled) {
        // Ollama idle — interpolate toward baseline
        setAgents((prev) => {
          const next = { ...prev };
          for (const id of AGENT_ORDER) {
            const a = prev[id];
            const busy = a.status === "Thinking" || a.status === "Compiling" || a.status === "Transferring";
            const target = busy ? 2.5 + Math.random() * 1.5 : 0.3 + Math.random() * 0.15;
            next[id] = { ...a, vramGb: +(a.vramGb + (target - a.vramGb) * 0.18).toFixed(2) };
          }
          return next;
        });
      }
    };
    poll(); // immediate first call
    const interval = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // ── Token/s telemetry (separate 220ms tick) ───────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setAgents((prev) => {
        const next = { ...prev };
        for (const id of AGENT_ORDER) {
          const a = prev[id];
          const busy = a.status === "Thinking" || a.status === "Compiling" || a.status === "Transferring";
          const tokTarget = busy ? 180 + Math.random() * 220 : 0;
          next[id] = { ...a, tokensPerSec: Math.round(a.tokensPerSec + (tokTarget - a.tokensPerSec) * 0.18) };
        }
        return next;
      });
    }, 220);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  // ── 3D packet bridge ──────────────────────────────────────────────────────
  const handlePacketArrive = useCallback(() => setActivePacket(null), []);

  const firePacket = useCallback((from: AgentId, to: AgentId) => {
    setAgent(from, { status: "Transferring", task: `Routing → ${AGENTS[to].shortCode}` });
    pushLog(AGENTS[from].shortCode, `Transmitting payload → ${AGENTS[to].shortCode}`, "agent");
    setActivePacket({ from, to, color: AGENTS[from].color, id: packetId.current++ });
    setTimeout(() => setAgent(from, { status: "Idle", task: AGENTS[from].idleTask }), 1300);
  }, [pushLog, setAgent]);

  // ─────────────────────────────────────────────────────────────────────────
  // Shared pipeline stages
  // ─────────────────────────────────────────────────────────────────────────

  const runResearcher = useCallback(async (spec: string, feedback: string | null, signal: AbortSignal, model: PreferredModel, iter: number): Promise<string> => {
    const isRetry = feedback !== null;
    setAgent("researcher", { status: "Thinking", task: isRetry ? `Reworking arch (loop ${iter})…` : "Choosing stack & mapping files…" });
    if (isRetry) {
      pushLog("RESEARCHER", `⟳ Loop ${iter} — Evaluator rejected. Reconfiguring…`, "loop");
      pushLog("RESEARCHER", `Issues: ${feedback?.slice(0, 180)}`, "warn");
    } else {
      pushLog("RESEARCHER", "Choosing tech stack · mapping file manifest…", "agent");
    }
    const prompt = isRetry
      ? `Original spec:\n${spec}\n\nEvaluator rejection (loop ${iter}):\n${feedback}\n\nReconfigure. Re-output ARCHITECTURE and FILE MANIFEST.`
      : `Gateway spec:\n\n${spec}\n\nChoose stack. Output ARCHITECTURE and FILE MANIFEST sections.`;
    const r = await queryOllama("researcher", prompt, (t) => setAgent("researcher", { task: `${isRetry ? "Reworking" : "Mapping"}… (${t} tokens)` }), signal, model);
    pushLog("RESEARCHER", `Blueprint ${isRetry ? "updated" : "ready"} · ${r.length} chars`, "success");
    return r;
  }, [pushLog, setAgent]);

  const runCoder = useCallback(async (blueprint: string, objective: string, feedback: string | null, existingFiles: ArtifactFile[] | null, signal: AbortSignal, model: PreferredModel, iter: number): Promise<string> => {
    const isRetry = feedback !== null;
    const isContinue = existingFiles !== null && !isRetry;
    setAgent("coder", { status: "Thinking", task: isRetry ? `Patching code (loop ${iter})…` : isContinue ? "Continuing project…" : "Building multi-file project…" });
    if (isRetry) pushLog("CODER", `⟳ Loop ${iter} — Applying Evaluator fixes…`, "loop");
    else if (isContinue) pushLog("CODER", "Continuing project with your request…", "agent");
    else pushLog("CODER", "Translating blueprint into files…", "agent");

    let prompt: string;
    if (isRetry) {
      prompt = `Blueprint:\n${blueprint}\n\nPrevious code issues:\n${feedback}\n\nRewrite all files fixing the issues. Use ===FILE: path===...===ENDFILE=== format.`;
    } else if (isContinue && existingFiles) {
      const existingDump = existingFiles.map(f => `===FILE: ${f.path}===\n${f.content}\n===ENDFILE===`).join("\n\n");
      prompt = `Current project files:\n\n${existingDump}\n\nUser continuation request: "${objective}"\n\nApply the requested changes. Output ALL files (changed + unchanged) using ===FILE: path===...===ENDFILE=== format.`;
    } else {
      prompt = `Blueprint:\n\n${blueprint}\n\nObjective: "${objective}"\n\nGenerate complete multi-file implementation using ===FILE: path===...===ENDFILE=== format. Follow all module rules.`;
    }

    const r = await queryOllama("coder", prompt, (t) => setAgent("coder", { task: `Streaming files… (${t} tokens)` }), signal, model);
    const files = parseMultiFile(r);
    pushLog("CODER", `${files.length} file(s) ${isRetry ? "patched" : isContinue ? "updated" : "generated"} · ${files.map(f => f.path).join(", ")}`, "success");
    return r;
  }, [pushLog, setAgent]);

  const runEvaluator = useCallback(async (coderOutput: string, signal: AbortSignal, model: PreferredModel, iter: number): Promise<EvalResult> => {
    setAgent("evaluator", { status: "Compiling", task: `Running audit (pass ${iter})…` });
    pushLog("EVALUATOR", `Auditing code · pass ${iter} of ${MAX_EVAL_LOOPS}…`, "agent");
    const files = parseMultiFile(coderOutput);
    const summary = files.map(f => `# ${f.path}\n${f.content}`).join("\n\n---\n\n");
    const r = await queryOllama("evaluator", `Code files to audit (loop ${iter}):\n\n${summary}`, (t) => setAgent("evaluator", { task: `Auditing… (${t} tokens)` }), signal, model);
    const result = parseEvalResult(r);
    const icon = result.status === "PASS" ? "✔" : "✖";
    pushLog("EVALUATOR", `${icon} ${result.status} · confidence ${result.confidence.toFixed(3)}`, result.status === "PASS" ? "success" : "warn");
    if (result.status === "FAIL") pushLog("EVALUATOR", `Issues: ${result.issues.slice(0, 200)}`, "warn");
    return result;
  }, [pushLog, setAgent]);

  // ─────────────────────────────────────────────────────────────────────────
  // Core eval loop (researcher → coder → evaluator × N)
  // Shared by initial run AND project continuation
  // ─────────────────────────────────────────────────────────────────────────

  const runEvalLoop = useCallback(async (opts: {
    gatewaySpec: string;
    objective: string;
    existingFiles: ArtifactFile[] | null;
    signal: AbortSignal;
    model: PreferredModel;
    isContinuation: boolean;
  }): Promise<{ files: ArtifactFile[]; confidence: number; loops: number }> => {
    const { gatewaySpec, objective, existingFiles, signal, model, isContinuation } = opts;
    let evalFeedback: string | null = null;
    let finalFiles: ArtifactFile[] = existingFiles ?? [];
    let finalConf = 0;
    let iteration = 1;

    while (iteration <= MAX_EVAL_LOOPS) {
      if (signal.aborted) throw new Error("AbortError");
      setLoopCount(iteration);

      // RESEARCHER — skip on continuation pass 1 (we already have files)
      if (!isContinuation || evalFeedback !== null) {
        const blueprint = await runResearcher(gatewaySpec, evalFeedback, signal, model, iteration);
        payloads.current.researcher = blueprint;
        firePacket("researcher", "coder");
        await sleep(1400);
      }

      // CODER
      const coderOut = await runCoder(
        payloads.current.researcher,
        objective,
        evalFeedback,
        isContinuation && evalFeedback === null ? existingFiles : null,
        signal, model, iteration,
      );
      payloads.current.coder = coderOut;
      finalFiles = parseMultiFile(coderOut);

      firePacket("coder", "evaluator");
      await sleep(1400);

      // EVALUATOR
      const evalResult = await runEvaluator(coderOut, signal, model, iteration);
      finalConf = evalResult.confidence;

      if (evalResult.status === "PASS") {
        pushLog("SYSTEM", `✔ PASS on loop ${iteration} — delivering`, "success");
        firePacket("evaluator", "gateway");
        await sleep(1400);
        break;
      }

      if (iteration === MAX_EVAL_LOOPS) {
        pushLog("SYSTEM", `⚠ Max loops (${MAX_EVAL_LOOPS}) — delivering best attempt`, "warn");
        firePacket("evaluator", "gateway");
        await sleep(1400);
        break;
      }

      pushLog("SYSTEM", `✖ FAIL — routing back to Researcher (${iteration}/${MAX_EVAL_LOOPS})`, "loop");
      evalFeedback = evalResult.issues;
      firePacket("evaluator", "researcher");
      await sleep(1400);
      iteration++;
    }

    return { files: finalFiles, confidence: finalConf, loops: iteration };
  }, [runResearcher, runCoder, runEvaluator, pushLog, firePacket]);

  // ─────────────────────────────────────────────────────────────────────────
  // trigger — initial run OR project continuation
  // ─────────────────────────────────────────────────────────────────────────

  const trigger = useCallback(async (objective: string) => {
    if (isRunning) return;
    const isContinuation = projectActive && artifactFiles.length > 0 && !isCasualSpeech(objective);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    payloads.current = { gateway: "", researcher: "", coder: "", evaluator: "" };
    // Preserve researcher payload if continuing (no new RESEARCHER stage on first pass)
    if (isContinuation) payloads.current.researcher = "[continuation — existing files as context]";

    setIsRunning(true);
    setLoopCount(0);
    // Don't hide artifact on continuation — user can still see the old files
    if (!isContinuation) { setArtifactVisible(false); setConfidenceScore(null); }

    pushLog("USER", `"${objective}"`, "info");

    // ── Health check ─────────────────────────────────────────────────────
    const { reachable, model } = await checkOllamaHealth();
    if (!reachable) {
      pushLog("SYSTEM", "⚠ Ollama unreachable — mock pipeline.", "warn");
      await runMockFallback(objective, { setAgent, pushLog, firePacket, setArtifactFilename, setArtifactFiles, setArtifactCodeContent, setArtifactVisible, setIsRunning, setProjectActive, ctrl });
      return;
    }
    if (!model) {
      pushLog("SYSTEM", `No model found. Pull: ollama pull ${MODEL_PREFERENCE[0]}`, "warn");
      await runMockFallback(objective, { setAgent, pushLog, firePacket, setArtifactFilename, setArtifactFiles, setArtifactCodeContent, setArtifactVisible, setIsRunning, setProjectActive, ctrl });
      return;
    }

    // ── Casual mode ──────────────────────────────────────────────────────
    if (!isContinuation && isCasualSpeech(objective)) {
      pushLog("SYSTEM", `${model} · casual mode`, "info");
      setAgent("gateway", { status: "Thinking", task: "Composing reply…" });
      try {
        const reply = await queryOllama("casual", objective, (t) => setAgent("gateway", { task: `Replying… (${t} tokens)` }), ctrl.signal, model);
        pushLog("GATEWAY", reply.trim(), "success");
      } catch (e: unknown) {
        if ((e as Error)?.name !== "AbortError") pushLog("GATEWAY", "Couldn't reach model.", "warn");
      } finally {
        setAgent("gateway", { status: "Idle", task: AGENTS.gateway.idleTask });
        setIsRunning(false);
      }
      return;
    }

    try {
      if (isContinuation) {
        // ── CONTINUATION: skip GATEWAY, go straight to CODER with existing files ──
        pushLog("SYSTEM", `${model} · continuing project · request: "${objective}"`, "success");
        const { files, confidence } = await runEvalLoop({
          gatewaySpec: payloads.current.gateway || objective,
          objective,
          existingFiles: artifactFiles,
          signal: ctrl.signal,
          model,
          isContinuation: true,
        });
        setConfidenceScore(confidence);
        setArtifactFiles(files);
        setArtifactCodeContent(files[0]?.content ?? "");
        setArtifactVisible(true);
        pushLog("GATEWAY", `Project updated · ${files.length} file(s) · confidence ${confidence.toFixed(3)} ✔`, "success");
      } else {
        // ── FRESH RUN: GATEWAY → researcher/coder/eval loop ──────────────────
        pushLog("SYSTEM", `${model} · 4-agent pipeline · max ${MAX_EVAL_LOOPS} eval loops`, "success");
        setAgent("gateway", { status: "Thinking", task: "Decomposing user goal…" });
        pushLog("GATEWAY", "Decomposing high-level goal into deliverables…", "agent");
        const gatewayOut = await queryOllama(
          "gateway",
          `User goal: "${objective}"\n\nDecompose into core objective, deliverables, and constraints.`,
          (t) => setAgent("gateway", { task: `Decomposing… (${t} tokens)` }),
          ctrl.signal, model,
        );
        payloads.current.gateway = gatewayOut;
        pushLog("GATEWAY", `Spec ready · ${gatewayOut.length} chars`, "success");
        firePacket("gateway", "researcher");
        await sleep(1400);

        const { files, confidence, loops } = await runEvalLoop({
          gatewaySpec: gatewayOut,
          objective,
          existingFiles: null,
          signal: ctrl.signal,
          model,
          isContinuation: false,
        });
        setConfidenceScore(confidence);
        setAgent("gateway", { status: "Thinking", task: "Packaging artifact…" });
        pushLog("GATEWAY", "Packaging and delivering artifact…", "agent");
        await sleep(500);
        pushLog("GATEWAY", "Delivery complete · objective fulfilled ✔", "success");
        pushLog("SYSTEM", `${files.length} file(s) · ${loops} eval loop(s) · confidence ${confidence.toFixed(3)} · project mode ON`, "info");
        setArtifactFilename(slug(objective));
        setArtifactFiles(files);
        setArtifactCodeContent(files[0]?.content ?? "");
        setArtifactVisible(true);
        setProjectActive(true); // unlock continuation
        setAgent("gateway", { status: "Idle", task: AGENTS.gateway.idleTask });
      }
      setIsRunning(false);
    } catch (e: unknown) {
      const isAbort = (e as Error)?.name === "AbortError" || (e as Error)?.message === "AbortError";
      pushLog("SYSTEM", isAbort ? "Pipeline stopped by user." : `Error: ${(e as Error)?.message ?? e}`, isAbort ? "warn" : "error");
      resetAgents();
      setIsRunning(false);
    }
  }, [isRunning, projectActive, artifactFiles, pushLog, setAgent, firePacket, resetAgents, runEvalLoop]);

  return {
    agents, logs, activePacket, isRunning,
    trigger, stop, handlePacketArrive,
    artifactVisible, artifactFilename, artifactFiles, artifactCodeContent,
    confidenceScore, loopCount, projectActive, totalVramGb,
    closeArtifact,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock fallback
// ─────────────────────────────────────────────────────────────────────────────

interface FallbackDeps {
  setAgent: (id: AgentId, patch: Partial<AgentRuntime>) => void;
  pushLog: (s: string, t: string, l?: LogLevel) => void;
  firePacket: (f: AgentId, t: AgentId) => void;
  setArtifactFilename: (v: string) => void;
  setArtifactFiles: (v: ArtifactFile[]) => void;
  setArtifactCodeContent: (v: string) => void;
  setArtifactVisible: (v: boolean) => void;
  setIsRunning: (v: boolean) => void;
  setProjectActive: (v: boolean) => void;
  ctrl: AbortController;
}

async function runMockFallback(objective: string, deps: FallbackDeps) {
  const { setAgent, pushLog, firePacket, setArtifactFilename, setArtifactFiles, setArtifactCodeContent, setArtifactVisible, setIsRunning, setProjectActive, ctrl } = deps;
  const stages: { from: AgentId; to: AgentId; lines: string[]; ms: number }[] = [
    { from: "gateway", to: "researcher", lines: ["Decomposing goal…", "Deliverables mapped"], ms: 1600 },
    { from: "researcher", to: "coder", lines: ["Choosing stack…", "File manifest ready"], ms: 2000 },
    { from: "coder", to: "evaluator", lines: ["Building modules…", "4 files generated"], ms: 2400 },
    { from: "evaluator", to: "gateway", lines: ["Auditing…", "PASS · 0.964"], ms: 1400 },
  ];
  const statuses: Record<string, AgentStatus> = { researcher: "Thinking", coder: "Thinking", evaluator: "Compiling", gateway: "Idle" };
  for (const stage of stages) {
    if (ctrl.signal.aborted) return;
    setAgent(stage.to, { status: statuses[stage.to] ?? "Thinking", task: stage.lines[0] });
    for (let i = 0; i < stage.lines.length; i++) {
      if (ctrl.signal.aborted) return;
      await sleep(500 + i * 500);
      pushLog(AGENTS[stage.to].shortCode, stage.lines[i], "agent");
    }
    await sleep(stage.ms);
    firePacket(stage.from, stage.to);
    await sleep(1400);
    setAgent(stage.from, { status: "Idle", task: AGENTS[stage.from].idleTask });
  }
  if (ctrl.signal.aborted) return;
  const files = buildFallbackFiles(objective);
  setArtifactFilename(slug(objective));
  setArtifactFiles(files);
  setArtifactCodeContent(files[0]?.content ?? "");
  setArtifactVisible(true);
  setProjectActive(true);
  pushLog("GATEWAY", "Delivery complete (mock) ✔", "success");
  setIsRunning(false);
}

function buildFallbackFiles(objective: string): ArtifactFile[] {
  const ts = new Date().toISOString();
  return [
    { path: "main.py", content: `#!/usr/bin/env python3\n"""Aetheria Mock · ${objective} · ${ts}"""\nimport asyncio\nfrom pipeline import run_pipeline\nfrom config import Config\n\nif __name__ == "__main__":\n    asyncio.run(run_pipeline(Config(objective="${objective}")))\n` },
    { path: "pipeline.py", content: `"""Pipeline for: ${objective}"""\nimport asyncio, logging\nfrom config import Config\nlog = logging.getLogger(__name__)\n\nasync def run_pipeline(cfg: Config) -> dict:\n    log.info("Running: %s", cfg.objective)\n    await asyncio.sleep(0.1)\n    return {"status": "success"}\n` },
    { path: "config.py", content: `from dataclasses import dataclass, field\nfrom pathlib import Path\nfrom typing import Any\n\n@dataclass\nclass Config:\n    objective: str = ""\n    output_dir: Path = Path("./output")\n    metadata: dict[str, Any] = field(default_factory=dict)\n` },
    { path: "requirements.txt", content: `# Aetheria · ${objective}\nasyncio>=3.4.3\ntyping-extensions>=4.0.0\n` },
  ];
}
