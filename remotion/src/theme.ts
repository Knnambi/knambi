// Palette for the Napoleonic blockade piece — sea navy, parchment, imperial gold & red.
export const COLORS = {
  sea: "#0C1A2B",
  seaDeep: "#081321",
  parchment: "#F3E6C8",
  ink: "#F7F1E1",
  gold: "#E6B450",
  goldSoft: "#F2D488",
  imperialRed: "#B2202B",
  imperialBlue: "#1E3A6E",
  britishRed: "#C8433B",
  muted: "#A9B4C4",
} as const;

// Serif for a period feel, with robust system fallbacks (no network fonts).
export const FONT_SERIF =
  'Georgia, "Times New Roman", "Iowan Old Style", "Palatino Linotype", serif';
export const FONT_SANS =
  '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';
