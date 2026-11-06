import { useSyncExternalStore } from "react";

// Préférence de thème commune à la suite Atelier : atelier-brand/atelier-theme.js
// (copie verbatim, insérée en tête de <head> par vite.config.ts) expose window.atelierTheme.
export type PreferenceTheme = "system" | "light" | "dark";

declare global {
  interface Window {
    atelierTheme?: {
      get: () => PreferenceTheme;
      set: (pref: PreferenceTheme) => void;
      resolved: () => "light" | "dark";
    };
  }
}

const lire = (): PreferenceTheme => window.atelierTheme?.get() ?? "system";

function abonner(f: () => void) {
  window.addEventListener("atelier-theme", f);
  document.addEventListener("visibilitychange", f);
  return () => {
    window.removeEventListener("atelier-theme", f);
    document.removeEventListener("visibilitychange", f);
  };
}

/** Préférence courante (Système / Clair / Sombre) et son setter, partagés avec les autres apps de la suite. */
export function usePreferenceTheme(): [PreferenceTheme, (p: PreferenceTheme) => void] {
  const pref = useSyncExternalStore(abonner, lire, () => "system" as const);
  return [pref, (p) => window.atelierTheme?.set(p)];
}
