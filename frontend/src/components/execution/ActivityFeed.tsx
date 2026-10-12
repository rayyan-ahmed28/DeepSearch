import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { AGENT_LABEL } from "@/lib/executionEvents";
import type { LogEntry } from "@/lib/streamReducer";

interface ActivityFeedProps {
  logs: LogEntry[];
}

const LEVEL_CLASS: Record<LogEntry["level"], string> = {
  info: "text-on-surface-variant",
  warn: "text-secondary",
  error: "text-error",
};

export default function ActivityFeed({ logs }: ActivityFeedProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  return (
    <div ref={ref} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2">
      {logs.length === 0 && (
        <p className="font-label-code-sm text-label-code-sm text-outline">Waiting for first event…</p>
      )}
      {logs.map((l) => (
        <motion.div
          key={l.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-0.5"
        >
          <div className="flex items-center gap-2">
            <span className="font-tag-caps text-tag-caps text-primary uppercase">
              {l.agent === "system" ? "System" : AGENT_LABEL[l.agent]}
            </span>
            {l.llm && (
              <span className="font-tag-caps text-tag-caps text-on-primary-container bg-primary-container rounded px-1.5 py-px">
                LLM CALL
              </span>
            )}
          </div>
          <p className={`font-body-sm text-body-sm ${LEVEL_CLASS[l.level]}`}>{l.message}</p>
        </motion.div>
      ))}
    </div>
  );
}
