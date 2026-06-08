// Core agent network configuration.
// Keep this module pure data so the 3D scene, HUD, and simulation engine
// all read from a single source of truth. Swapping mock -> live backend
// only requires replacing the simulation engine, not this topology.

export type AgentId = "gateway" | "researcher" | "coder" | "evaluator";

export type AgentStatus = "Idle" | "Thinking" | "Transferring" | "Compiling";

export interface AgentConfig {
  id: AgentId;
  label: string;
  shortCode: string;
  /** 3D world position [x, y, z] */
  position: [number, number, number];
  /** Hex color used for 3D materials + HUD accents */
  color: string;
  idleTask: string;
}

export const AGENTS: Record<AgentId, AgentConfig> = {
  gateway: {
    id: "gateway",
    label: "User Input Gateway",
    shortCode: "GATEWAY",
    position: [0, 2, 0],
    color: "#4cc9f0",
    idleTask: "Awaiting system objective",
  },
  researcher: {
    id: "researcher",
    label: "Researcher Agent",
    shortCode: "RESEARCHER",
    position: [-3, -0.5, 0],
    color: "#4895ef",
    idleTask: "Vector index standby",
  },
  coder: {
    id: "coder",
    label: "Coder Agent",
    shortCode: "CODER",
    position: [3, -0.5, 0],
    color: "#f72585",
    idleTask: "Compiler warm",
  },
  evaluator: {
    id: "evaluator",
    label: "Evaluator Agent",
    shortCode: "EVALUATOR",
    position: [0, -2.5, 0],
    color: "#7209b7",
    idleTask: "Heuristics loaded",
  },
};

export const AGENT_ORDER: AgentId[] = ["gateway", "researcher", "coder", "evaluator"];

// Logical pipeline edges (forms a closed loop for the constellation lines).
export const PIPELINE_EDGES: [AgentId, AgentId][] = [
  ["gateway", "researcher"],
  ["researcher", "coder"],
  ["coder", "evaluator"],
  ["evaluator", "gateway"],
];

export const TOTAL_VRAM_GB = 6;
