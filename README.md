# Aetheria — Local Multi-Agent AI Orchestration Dashboard

<div align="center">

![Aetheria Banner](https://img.shields.io/badge/Aetheria-Multi--Agent%20AI-4cc9f0?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzRjYzlmMCIgZD0iTTEzIDIuMDVWNGMzLjk1LjQ5IDcgMy44NSA3IDggMCA0LjQ4LTMuMjkgOC4yMy03IDguOTNWMjNIMTF2LTIuMDdjLTMuNzEtLjcxLTctNC40NS03LTguOTMgMC00LjE1IDMuMDUtNy41MSA3LThWMi4wNWgyek03IDEyYzAgMi43NiAyLjI0IDUgNSA1czUtMi4yNCA1LTUtMi4yNC01LTUtNS01IDIuMjQtNSA1eiIvPjwvc3ZnPg==)
![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-Local_LLM-FF6B35?style=for-the-badge)
![TailwindCSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

**A fully local, privacy-first multi-agent AI system that builds real software projects end-to-end — running entirely on your own hardware.**

[Features](#features) · [Architecture](#architecture) · [Getting Started](#getting-started) · [How It Works](#how-it-works) · [Tech Stack](#tech-stack)

</div>

---

## What Is Aetheria?

Aetheria is a **local-first multi-agent AI orchestration dashboard** that takes a plain-English goal ("build a REST API scraper") and routes it through a 4-agent pipeline — Gateway, Researcher, Coder, Evaluator — to produce a complete, multi-file software project, downloadable as a ZIP, all running on your machine with **zero cloud API calls** and **zero data leaving your system**.

The 3D constellation UI visualizes packet transmission between agents in real time. Think of it as a futuristic IDE control room where you can watch AI agents think, collaborate, and self-correct.

---

## Features

| Feature | Description |
|---|---|
| **4-Agent Pipeline** | Gateway decomposes goals, Researcher architects, Coder builds, Evaluator reviews |
| **Evaluator Feedback Loop** | If code fails review, the Evaluator routes back to the Researcher for up to 3 iterations |
| **Project Continuation** | After a build completes, keep prompting to add features, fix bugs, or change the style — right inside the panel |
| **Live Preview** | Artifact panel has a Code/Preview toggle — HTML projects render live in a sandboxed iframe; Python projects show a file-tree overview card |
| **ZIP Download** | All generated files packaged into a proper ZIP using native browser APIs (no external zip libraries) |
| **3D Mesh Visualization** | React Three Fiber renders a live agent constellation — packets animate along edges as data flows |
| **Real-time VRAM Telemetry** | Polls Ollama `/api/ps` every 2 seconds for actual GPU VRAM usage |
| **Casual Speech Mode** | Short or conversational messages skip the pipeline and get a direct chat reply |
| **Stop / Abort** | Kill a running pipeline at any point with an instant abort |
| **100% Local** | Everything runs on your GPU via Ollama — no OpenAI, no Anthropic, no cloud |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Objective                           │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │  GATEWAY Agent  │  Decomposes goal → deliverables
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │ RESEARCHER Agent│  Chooses stack · maps file manifest
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │   CODER Agent   │  Writes all files (strict ESM/ES6 rules)
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │ EVALUATOR Agent │  Reviews code · outputs PASS or FAIL
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │ FAIL (up to 3x)             │ PASS
              ▼                             ▼
     back to RESEARCHER              Artifact delivered
       with issue list               as ZIP + Preview
```

The Evaluator-to-Researcher feedback loop fires a **reverse 3D packet** in the scene, then re-runs the Researcher, Coder, and Evaluator stages with the issue list as context. After a PASS (or max 3 iterations), the artifact is delivered.

---

## Getting Started

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) | >= 18 | Or use [Bun](https://bun.sh/) (recommended) |
| [Bun](https://bun.sh/) | Latest | Faster installs & dev server |
| [Ollama](https://ollama.ai/) | Latest | Local LLM runtime |
| GPU | 6 GB+ VRAM | 4 GB minimum with q4 quant |

### 1 — Install Ollama and pull the model

```bash
# Install Ollama from https://ollama.ai
# Then pull the VRAM-efficient 4-bit quantized Mistral instruct model:
ollama pull mistral:7b-instruct-q4_K_M
```

> **Note:** The model is ~4.4 GB. It will be downloaded once and cached locally.

### 2 — Set the CORS environment variable

Aetheria communicates with Ollama directly from the browser. You need to allow cross-origin requests:

**Windows (PowerShell — permanent):**
```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "Machine")
```

**macOS / Linux:**
```bash
# Add to your shell profile (~/.zshrc or ~/.bashrc)
export OLLAMA_ORIGINS="*"
```

Then **restart Ollama** for the change to take effect.

### 3 — Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/atheria.git
cd atheria

# Using Bun (recommended)
bun install

# Or npm
npm install
```

### 4 — Run

```bash
# Bun
bun run dev

# npm
npm run dev
```

Open **[http://localhost:8080](http://localhost:8080)** (or whichever port Vite assigns).

---

## How It Works

### Running your first build

1. Type an objective in the input bar at the bottom — e.g. `build a Python web scraper with async support`
2. Hit **Enter** or click **Trigger**
3. Watch the 3D constellation animate as agents process in sequence
4. The terminal stream on the right logs every agent action in real time
5. When done, the **Artifact Panel** slides up with your generated files

### Continuation mode

After a build completes:
- A **"continue"** input appears inside the Artifact Panel
- Type a follow-up: `add a CLI argument parser` or `make the output JSON`
- Hit **Send** — the Coder patches the existing files and the Evaluator re-reviews
- Updated files appear in the panel immediately

### Preview tab

Click **Preview** in the Artifact Panel header:
- **HTML projects** — renders live in a sandboxed iframe with CSS/JS inlined
- **README.md** — styled markdown render
- **Python / other** — project overview card with file tree, language breakdown, and entry-point code peek

### Casual chat

Not every message needs a full pipeline. Short messages or conversational prompts are detected and routed directly to a casual reply — no agents spun up.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [TanStack Start](https://tanstack.com/start) + [Vite 7](https://vite.dev/) |
| **Language** | TypeScript 5 |
| **UI** | React 19 + Tailwind CSS v4 |
| **3D Scene** | [React Three Fiber](https://r3f.docs.pmnd.rs/) + [Three.js](https://threejs.org/) + [@react-three/drei](https://github.com/pmndrs/drei) |
| **Components** | [Radix UI](https://www.radix-ui.com/) + [shadcn/ui](https://ui.shadcn.com/) primitives |
| **LLM Runtime** | [Ollama](https://ollama.ai/) (local, no cloud) |
| **Model** | Mistral 7B Instruct q4_K_M (4-bit quantized) |
| **Package Manager** | [Bun](https://bun.sh/) |
| **Icons** | [Lucide React](https://lucide.dev/) |

---

## Project Structure

```
atheria/
├── src/
│   ├── components/
│   │   ├── ArtifactPanel.tsx         # Slide-up panel: code/preview tabs + continuation input
│   │   ├── Dashboard.tsx             # Root layout, wires all HUD + 3D scene
│   │   ├── hud/
│   │   │   ├── AgentStatusPanel.tsx  # Left sidebar: live VRAM + token/s per agent
│   │   │   ├── ControlPanel.tsx      # Bottom input bar + stop button
│   │   │   ├── TerminalStream.tsx    # Right sidebar: live log stream
│   │   │   └── TopBanner.tsx         # Top status bar
│   │   └── scene/
│   │       └── SceneCanvas.tsx       # React Three Fiber 3D constellation
│   ├── lib/
│   │   ├── agents.ts                 # Agent topology: positions, colors, IDs
│   │   └── useOrchestration.ts       # Core hook: pipeline, VRAM polling, eval loop
│   └── routes/
│       └── index.tsx                 # Root route -> Dashboard
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Configuration

### Supported Models

Aetheria auto-detects the best available model. Preference order:

1. `mistral:7b-instruct-q4_K_M` — recommended
2. `mistral:latest`
3. `qwen2.5-coder:3b`
4. `qwen2.5-coder:latest`

To use a different model, pull it with `ollama pull <model>` and add it to the `MODEL_PREFERENCE` array in [`src/lib/useOrchestration.ts`](src/lib/useOrchestration.ts).

### VRAM Requirements

| Model | VRAM | Notes |
|---|---|---|
| `mistral:7b-instruct-q4_K_M` | ~4.4 GB | Best balance |
| `mistral:7b-instruct-q8_0` | ~7.7 GB | Higher quality |
| `qwen2.5-coder:3b` | ~2.0 GB | Low VRAM option |

---

## Privacy

Everything runs locally:
- No API keys required
- No data sent to any cloud service
- No telemetry or analytics
- Your prompts, generated code, and projects never leave your machine

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature
git commit -m "feat: add your feature"
git push origin feature/your-feature
# Open a PR
```

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built by [chait](https://github.com/YOUR_USERNAME) · Powered by [Ollama](https://ollama.ai/) · Visualized with [React Three Fiber](https://r3f.docs.pmnd.rs/)

</div>
