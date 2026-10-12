import { motion } from "framer-motion";
import { AGENTS, EDGES, type AgentId, type AgentStatus } from "@/lib/executionEvents";

interface AgentTopologyProps {
  agents: Record<AgentId, { status: AgentStatus; detail?: string }>;
}

const COLOR: Record<AgentStatus, string> = {
  idle: "#464555",
  running: "#8781ff",
  done: "#6bd8cb",
  skipped: "#34343a",
  error: "#ffb4ab",
};

const byId = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, (typeof AGENTS)[number]>;

export default function AgentTopology({ agents }: AgentTopologyProps) {
  return (
    <svg viewBox="0 0 800 440" className="w-full h-auto" role="img" aria-label="Agent topology">
      {/* grid */}
      <path
        d="M0 110 H800 M0 220 H800 M0 330 H800 M160 0 V440 M330 0 V440 M505 0 V440 M660 0 V440"
        stroke="#464555"
        strokeDasharray="4 6"
        strokeOpacity="0.12"
      />

      {/* edges */}
      {EDGES.map(([from, to]) => {
        const a = byId[from];
        const b = byId[to];
        const target = agents[to].status;
        const source = agents[from].status;
        const live = target === "running";
        const lit = target === "running" || target === "done" || (source === "done" && target !== "skipped");
        const skipped = source === "skipped" || target === "skipped";
        const color = skipped ? COLOR.skipped : live ? COLOR.running : lit ? COLOR.done : COLOR.idle;
        return (
          <motion.line
            key={`${from}-${to}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={color}
            strokeWidth={live ? 2 : 1.25}
            strokeOpacity={lit ? 0.9 : 0.35}
            strokeLinecap="round"
            strokeDasharray={live ? "6 6" : undefined}
            animate={live ? { strokeDashoffset: [0, -24] } : { strokeDashoffset: 0 }}
            transition={live ? { duration: 0.9, repeat: Infinity, ease: "linear" } : { duration: 0 }}
          />
        );
      })}

      {/* nodes */}
      {AGENTS.map((a) => {
        const { status, detail } = agents[a.id];
        const color = COLOR[status];
        const dim = status === "skipped";
        return (
          <g key={a.id} opacity={dim ? 0.4 : 1}>
            {status === "running" && (
              <motion.circle
                cx={a.x}
                cy={a.y}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                initial={{ r: a.r, opacity: 0.8 }}
                animate={{ r: a.r + 16, opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <circle cx={a.x} cy={a.y} r={a.r + 6} fill="#1e1f25" />
            <circle cx={a.x} cy={a.y} r={a.r} fill={color} fillOpacity={status === "idle" ? 0.35 : 0.9} />
            <circle cx={a.x} cy={a.y} r={status === "done" ? 4 : 3} fill="#ffffff" fillOpacity={status === "idle" ? 0.4 : 1} />

            <text
              x={a.x}
              y={a.y + a.r + 24}
              textAnchor="middle"
              fill={status === "idle" || dim ? "#918fa1" : "#e3e1e9"}
              className="font-label-code-sm"
              fontSize="11"
            >
              {a.label}
            </text>
            <text
              x={a.x}
              y={a.y + a.r + 38}
              textAnchor="middle"
              fill={a.kind === "llm" ? "#c4c0ff" : "#89f5e7"}
              fillOpacity="0.7"
              className="font-label-code-sm"
              fontSize="9"
              letterSpacing="1"
            >
              {dim ? "SKIPPED" : status === "running" && detail ? detail.toUpperCase() : a.kind === "llm" ? "LLM" : "DETERMINISTIC"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
