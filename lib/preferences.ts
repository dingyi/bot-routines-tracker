export const DATA_URL_KEY = "bot-routines.dataUrl";
export const LOCALE_KEY = "bot-routines.locale";
export const TIME_ZONE_KEY = "bot-routines.timezone";
export const GATE_KEY = "bot-routines.gate";

export const POLL_INTERVAL_MS = 45_000;
export const DEFAULT_TIME_ZONE = "Asia/Shanghai";
export const DAY_COUNT = 7;
export const RUNS_PER_DAY = 6;

export const TIME_ZONES = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
] as const;

const TIME_ZONE_LABELS: Record<string, { zh: string; en: string }> = {
  "Asia/Shanghai": { zh: "上海", en: "Shanghai" },
  "Asia/Hong_Kong": { zh: "香港", en: "Hong Kong" },
  "Asia/Taipei": { zh: "台北", en: "Taipei" },
  "Asia/Tokyo": { zh: "东京", en: "Tokyo" },
  "Asia/Singapore": { zh: "新加坡", en: "Singapore" },
  "Asia/Kolkata": { zh: "加尔各答", en: "Kolkata" },
  "Europe/London": { zh: "伦敦", en: "London" },
  "Europe/Berlin": { zh: "柏林", en: "Berlin" },
  "America/New_York": { zh: "纽约", en: "New York" },
  "America/Chicago": { zh: "芝加哥", en: "Chicago" },
  "America/Los_Angeles": { zh: "洛杉矶", en: "Los Angeles" },
  UTC: { zh: "协调世界时", en: "UTC" },
};

export function timeZoneLabel(timeZone: string, locale: "zh" | "en"): string {
  const known = TIME_ZONE_LABELS[timeZone];
  if (!known) return timeZone;
  return `${known[locale]} · ${timeZone}`;
}

export function sampleDataUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}/routines.json`;
}

export function gatePassword(): string {
  return process.env.NEXT_PUBLIC_GATE_PASSWORD ?? "";
}
