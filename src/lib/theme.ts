export type AppThemeId = "blaze" | "violet";

export interface AppThemeOption {
  id: AppThemeId;
  name: string;
  subtitle: string;
  bgPreview: string;
  cardPreview: string;
  accentPreview: string;
  badgePreview: string;
}

export const APP_THEMES: AppThemeOption[] = [
  {
    id: "blaze",
    name: "Carbon Blaze",
    subtitle: "Carbon black · Blaze orange",
    bgPreview: "#0D0E11",
    cardPreview: "#181A1F",
    accentPreview: "#FF4F17",
    badgePreview: "#34D399",
  },
  {
    id: "violet",
    name: "Future Violet",
    subtitle: "Midnight plum · Electric lavender & neon lime",
    bgPreview: "#0D071B",
    cardPreview: "#1B1233",
    accentPreview: "#9D5CFF",
    badgePreview: "#C4F970",
  },
];

const THEME_STORAGE_KEY = "espanol_fast_theme_v1";
const THEME_CHANGE_EVENT = "espanol-fast-theme-change";

export function getAppTheme(): AppThemeId {
  if (typeof window === "undefined") return "blaze";
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "violet" || saved === "blaze") {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return "blaze";
}

export function applyThemeToDocument(theme: AppThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.body?.setAttribute("data-theme", theme);
}

export function setAppTheme(theme: AppThemeId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage errors
  }
  applyThemeToDocument(theme);
  window.dispatchEvent(new CustomEvent<AppThemeId>(THEME_CHANGE_EVENT, { detail: theme }));
}

export function subscribeAppTheme(
  callback: (theme: AppThemeId) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<AppThemeId>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(getAppTheme());
    }
  };
  window.addEventListener(THEME_CHANGE_EVENT, handler);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
}
