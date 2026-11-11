"use client";

import { useCallback, useEffect, useState } from "react";
import { SETTINGS_KEY, THEMES, type ThemeId } from "@/lib/theme";

export { THEMES, type ThemeId };

export interface Settings {
  enterToSend: boolean;
  showSources: boolean;
  reduceMotion: boolean;
  textSize: "sm" | "md" | "lg";
  theme: ThemeId;
}

const DEFAULTS: Settings = {
  enterToSend: true,
  showSources: true,
  reduceMotion: false,
  textSize: "md",
  theme: "aurora",
};

function read(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const merged = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    if (!THEMES.some((t) => t.id === merged.theme)) merged.theme = DEFAULTS.theme;
    return merged;
  } catch {
    return DEFAULTS;
  }
}

/** UI preferences saved in this browser. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettings(read());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return; // the boot script already applied the saved values
    const root = document.documentElement;
    root.dataset.textSize = settings.textSize;
    root.dataset.reduceMotion = String(settings.reduceMotion);
    root.dataset.theme = settings.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    const color = THEMES.find((t) => t.id === settings.theme)?.meta;
    if (meta && color) meta.setAttribute("content", color);
  }, [loaded, settings.textSize, settings.reduceMotion, settings.theme]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable (private mode): keep in memory only
      }
      return next;
    });
  }, []);

  return { settings, update };
}
