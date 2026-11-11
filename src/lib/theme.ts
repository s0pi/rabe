/** Theme list and early theme boot script (shared by server layout and client). */

export type ThemeId = "aurora" | "midnight" | "sunset" | "daylight";

export const THEMES: { id: ThemeId; name: string; desc: string; swatch: [string, string, string]; meta: string }[] = [
  { id: "aurora", name: "Aurora", desc: "Near-black, violet → cyan", swatch: ["#06070d", "#7c5cff", "#22d3ee"], meta: "#06070d" },
  { id: "midnight", name: "Midnight Violet", desc: "The original look", swatch: ["#050918", "#8b5cf6", "#c9b8ff"], meta: "#050918" },
  { id: "sunset", name: "Bukidnon Sunset", desc: "Warm plum, coral → amber", swatch: ["#110a0f", "#ff6384", "#ffb03b"], meta: "#110a0f" },
  { id: "daylight", name: "Daylight", desc: "Light and airy", swatch: ["#f4f3fa", "#6846f5", "#0ea5e9"], meta: "#f4f3fa" },
];

export const SETTINGS_KEY = "rabe:settings";

/**
 * Runs before React loads (inlined in <head>) so the saved theme applies
 * before the first paint, avoiding a flash of the default theme.
 */
export const THEME_BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"{}");var d=document.documentElement;d.dataset.theme=s.theme||"aurora";if(s.textSize)d.dataset.textSize=s.textSize;if(s.reduceMotion)d.dataset.reduceMotion="true";}catch(e){}`;
