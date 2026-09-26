import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
/** The resolved theme actually applied to the document. */
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "alkwiti.theme.v1";

interface ThemeState {
  /** The user's saved preference (may be "system"). */
  mode: ThemeMode;
  /**
   * An unsaved preference being previewed (Settings → Appearance), or null.
   * Previews change what you see without persisting anything.
   */
  preview: ThemeMode | null;
  /** What's currently driving the document: `preview ?? mode`. */
  effectiveMode: ThemeMode;
  /** The concrete theme currently applied. */
  resolved: ResolvedTheme;
  /** Commit a preference: applies it, persists it, and clears any preview. */
  setMode: (mode: ThemeMode) => void;
  /** Apply a preference visually without persisting. Pass null to drop the preview. */
  previewMode: (mode: ThemeMode | null) => void;
  /** Convenience toggle between light and dark (ignores system). Commits. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

/** Apply/remove the `.dark` class the design tokens key off of. */
function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

function readStoredMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* ignore */
  }
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [preview, setPreview] = useState<ThemeMode | null>(null);
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [hydrated, setHydrated] = useState(false);

  const effectiveMode = preview ?? mode;

  // Hydrate the stored preference on the client and apply it in the same pass,
  // so there's no light flash between the inline boot script and React.
  useEffect(() => {
    const stored = readStoredMode();
    setModeState(stored);
    const r = resolve(stored);
    setResolved(r);
    applyTheme(r);
    setHydrated(true);
  }, []);

  // Apply whatever is effective now, and follow the OS while in "system".
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const r = resolve(effectiveMode);
    setResolved(r);
    applyTheme(r);

    if (effectiveMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = resolve("system");
      setResolved(next);
      applyTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [hydrated, effectiveMode]);

  const setMode = useCallback((next: ThemeMode) => {
    setPreview(null);
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const previewMode = useCallback((next: ThemeMode | null) => {
    setPreview(next);
  }, []);

  const toggle = useCallback(() => {
    setMode(resolve(effectiveMode) === "dark" ? "light" : "dark");
  }, [effectiveMode, setMode]);

  const value = useMemo<ThemeState>(
    () => ({ mode, preview, effectiveMode, resolved, setMode, previewMode, toggle }),
    [mode, preview, effectiveMode, resolved, setMode, previewMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
