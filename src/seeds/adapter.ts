import type { QuickCard } from "@core/types";
import { quickCardsData } from "./loader";
import { resolveLocalized, type SeedLocale } from "./locale";

export function getBuiltinCards(locale: SeedLocale = "zh-CN"): QuickCard[] {
  return quickCardsData.cards.map((seed) => ({
    id: seed.id,
    name: resolveLocalized(seed.name, locale),
    icon: seed.icon,
    prompt: resolveLocalized(seed.prompt, locale),
    source: "builtin" as const,
  }));
}
