import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aetheria // Agentic Mesh Interface" },
      {
        name: "description",
        content:
          "A 3D interactive multi-agent orchestration dashboard visualizing an AI agentic network in real time.",
      },
      { property: "og:title", content: "Aetheria // Agentic Mesh Interface" },
      {
        property: "og:description",
        content:
          "Sci-fi glassmorphic command center for tracking a live multi-agent AI pipeline in 3D.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Dashboard,
});
