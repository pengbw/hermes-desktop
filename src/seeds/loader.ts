import type {
  ProvidersData,
  QuickCardsData,
  GesturesData,
  UIStylesData,
  ProjectTemplatesData,
  ThemesData,
} from "./types";

import providersJson from "../../src-tauri/resources/providers.json";
import quickCardsJson from "../../src-tauri/resources/quick-cards.json";
import gesturesJson from "../../src-tauri/resources/gestures.json";
import uiStylesJson from "../../src-tauri/resources/ui-styles.json";
import projectTemplatesJson from "../../src-tauri/resources/project-templates.json";
import themesJson from "../../src-tauri/resources/themes.json";

export const providersData = providersJson as ProvidersData;
export const quickCardsData = quickCardsJson as QuickCardsData;
export const gesturesData = gesturesJson as GesturesData;
export const uiStylesData = uiStylesJson as UIStylesData;
export const projectTemplatesData = projectTemplatesJson as ProjectTemplatesData;
export const themesData = themesJson as ThemesData;
