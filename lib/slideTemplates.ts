/**
 * Visual templates for generated slide decks. Colors are stored as 6-digit hex
 * WITHOUT the leading "#": pptxgenjs wants bare hex, and the preview prepends
 * "#" as needed. `previewBg` is a CSS background for the on-screen slide card.
 */
export interface SlideTemplate {
  id: string;
  name: string;
  /** Slide background (pptx). */
  bg: string;
  /** Title color. */
  title: string;
  /** Body text color. */
  text: string;
  /** Accent (bullets, rules). */
  accent: string;
  /** CSS background for the preview card. */
  previewBg: string;
  /** pptx font face. */
  font: string;
}

export const SLIDE_TEMPLATES: SlideTemplate[] = [
  {
    id: "midnight",
    name: "Midnight",
    bg: "0B0B0D",
    title: "FFFFFF",
    text: "D6D6DB",
    accent: "5EE6C5",
    previewBg: "linear-gradient(135deg,#111114,#0b0b0d)",
    font: "Inter",
  },
  {
    id: "minimal",
    name: "Minimal",
    bg: "FFFFFF",
    title: "111114",
    text: "33333A",
    accent: "2563EB",
    previewBg: "#ffffff",
    font: "Arial",
  },
  {
    id: "ocean",
    name: "Ocean",
    bg: "06283D",
    title: "FFFFFF",
    text: "D8ECF3",
    accent: "47B5FF",
    previewBg: "linear-gradient(135deg,#0a3a52,#06283d)",
    font: "Inter",
  },
  {
    id: "sunset",
    name: "Sunset",
    bg: "2A1726",
    title: "FFF3EC",
    text: "F3D9D2",
    accent: "FF7E5F",
    previewBg: "linear-gradient(135deg,#3a1f33,#2a1726)",
    font: "Inter",
  },
  {
    id: "forest",
    name: "Forest",
    bg: "0F1F15",
    title: "FFFFFF",
    text: "D7E8DC",
    accent: "7BE08A",
    previewBg: "linear-gradient(135deg,#143324,#0f1f15)",
    font: "Inter",
  },
  {
    id: "mono",
    name: "Mono",
    bg: "000000",
    title: "FFFFFF",
    text: "BFBFBF",
    accent: "FFFFFF",
    previewBg: "#000000",
    font: "Arial",
  },
];

export const DEFAULT_TEMPLATE_ID = "midnight";

export function getTemplate(id: string | undefined): SlideTemplate {
  return SLIDE_TEMPLATES.find((t) => t.id === id) ?? SLIDE_TEMPLATES[0];
}

/** "#"-prefixed hex for CSS. */
export function hex(c: string): string {
  return c.startsWith("#") ? c : `#${c}`;
}
