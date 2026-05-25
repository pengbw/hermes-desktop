export type LocalizedString = Record<string, string>;

export type SeedLocale = "zh-CN" | "zh-XG" | "en";

export function resolveLocalized(loc: LocalizedString, locale: SeedLocale): string {
  if (loc[locale]) return loc[locale];
  if (loc["zh-CN"]) return loc["zh-CN"];
  const first = Object.values(loc)[0];
  return first ?? "";
}
