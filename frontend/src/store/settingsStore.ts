/**
 * User preferences from the Settings page, kept in this browser (localStorage).
 *
 * Appearance is applied as attributes on <html> (data-theme, data-accent,
 * data-scale, data-motion); styles/theme.css and styles/index.css do the rest.
 * index.html applies the saved appearance before the first paint, so a light
 * theme never flashes dark on load.
 */
import { create } from "zustand";

import type { ResearchDepth, ResearchMode } from "@/lib/runConfig";

export type ThemeChoice = "dark" | "light" | "system";
export type Accent = "indigo" | "rose" | "amber" | "orchid";
export type Scale = "small" | "default" | "large";
export type MotionChoice = "system" | "reduce" | "full";

export interface Settings {
  theme: ThemeChoice;
  accent: Accent;
  scale: Scale;
  motion: MotionChoice;
  /** Initial depth and domains on New Research and the Dashboard. */
  defaultDepth: ResearchDepth;
  defaultMode: ResearchMode;
  /** Go from the Execution screen to the report as soon as it is ready. */
  autoOpenReport: boolean;
  /** A short chime when a run finishes. */
  chime: boolean;
  /** List the three fictional sample runs under Recent Research. */
  showSampleRuns: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  accent: "indigo",
  scale: "default",
  motion: "system",
  defaultDepth: "standard",
  defaultMode: "auto",
  autoOpenReport: false,
  chime: false,
  showSampleRuns: true,
};

const STORAGE_KEY = "deepsearch.settings.v1";

function load(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === "object" ? (parsed as Partial<Settings>) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persist(settings: Settings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private window or storage disabled: settings still apply until the tab closes.
  }
}

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()((set, get) => ({
  ...load(),
  update: (patch) => {
    set(patch);
    persist(pick(get()));
  },
  reset: () => {
    set(DEFAULT_SETTINGS);
    persist(DEFAULT_SETTINGS);
  },
}));

function pick(s: SettingsStore): Settings {
  const { update: _u, reset: _r, ...settings } = s;
  return settings;
}

// ── Appearance ─────────────────────────────────────────────────────
const darkQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const motionQuery =
  typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

/** The theme actually shown ("system" resolved against the operating system). */
export function resolvedTheme(choice: ThemeChoice): "dark" | "light" {
  if (choice === "system") return darkQuery && !darkQuery.matches ? "light" : "dark";
  return choice;
}

export function reducedMotion(choice: MotionChoice): boolean {
  return choice === "reduce" || (choice === "system" && !!motionQuery?.matches);
}

let switchTimer: number | undefined;

function applyAppearance(s: Settings, animate: boolean) {
  const root = document.documentElement;
  if (animate && !reducedMotion(s.motion)) {
    root.classList.add("theme-switching");
    window.clearTimeout(switchTimer);
    switchTimer = window.setTimeout(() => root.classList.remove("theme-switching"), 300);
  }
  root.dataset.theme = resolvedTheme(s.theme);
  root.dataset.accent = s.accent;
  root.dataset.scale = s.scale;
  root.dataset.motion = reducedMotion(s.motion) ? "reduce" : "full";
}

applyAppearance(useSettings.getState(), false);
useSettings.subscribe((now, before) => {
  if (now.theme !== before.theme || now.accent !== before.accent || now.scale !== before.scale || now.motion !== before.motion) {
    applyAppearance(now, now.theme !== before.theme || now.accent !== before.accent);
  }
});
darkQuery?.addEventListener?.("change", () => applyAppearance(useSettings.getState(), true));
motionQuery?.addEventListener?.("change", () => applyAppearance(useSettings.getState(), false));

// ── Run-finished chime (Web Audio, no sound file) ──────────────────
export function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [659.25, 987.77]; // E5 then B5: two soft sine notes
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.14;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    });
    window.setTimeout(() => ctx.close(), 1200);
  } catch {
    // Audio blocked or unavailable: the run still finishes, just silently.
  }
}
