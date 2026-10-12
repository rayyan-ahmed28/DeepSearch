import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";

import { resolvedTheme, useSettings } from "@/store/settingsStore";

/** One-click light/dark switch. The full set of appearance options lives in Settings. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSettings((s) => s.theme);
  const update = useSettings((s) => s.update);
  const shown = resolvedTheme(theme);
  const next = shown === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => update({ theme: next })}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      className={`relative w-9 h-9 rounded-lg border border-outline-variant/40 bg-surface-container text-on-surface-variant hover:text-on-surface hover:border-outline transition-colors flex items-center justify-center overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${className}`}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={shown}
          initial={{ y: 14, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 40 }}
          transition={{ duration: 0.2 }}
          className="flex"
        >
          {shown === "dark" ? <Moon size={16} /> : <Sun size={16} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
