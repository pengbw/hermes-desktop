import type { LocalizedString } from "./locale";

export interface ProviderSeed {
  value: string;
  name: LocalizedString;
  baseUrl: string;
  apiKeyEnv: string;
  icon: string;
}

export interface ProvidersData {
  version: string;
  providers: ProviderSeed[];
}

export interface QuickCardSeed {
  id: string;
  name: LocalizedString;
  icon: string;
  prompt: LocalizedString;
  source: string;
}

export interface QuickCardsData {
  version: string;
  cards: QuickCardSeed[];
}

export interface GestureSeed {
  name: string;
  duration: number;
  lookAtX: number;
  lookAtY: number;
  tilt: number;
  poseFile: string;
}

export interface GesturesData {
  version: string;
  gestures: GestureSeed[];
}

export interface UIStyleSeed {
  name: string;
  label: LocalizedString;
  description: LocalizedString;
  spacing: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  borderWidth: string;
  componentDensity: "compact" | "normal" | "spacious";
}

export interface UIStylesData {
  version: string;
  defaultUIStyle: string;
  styles: UIStyleSeed[];
}

export interface TemplateRoleSeed {
  id: string;
  nickname: string;
  icon: string;
  name: LocalizedString;
  description: LocalizedString;
  responsibilities: LocalizedString;
  soulContent: LocalizedString;
  avatarPreset: string;
  avatarColor: string;
}

export interface TemplateWorkflowSeed {
  id: string;
  fromRoleId: string | null;
  toRoleId: string;
  artifactType: LocalizedString;
  transitionType: string;
  rejectToRoleId?: string;
}

export interface ProjectTemplateSeed {
  id: string;
  icon: string;
  name: LocalizedString;
  description: LocalizedString;
  projectRule: LocalizedString;
  projectGuidelines: LocalizedString;
  roles: TemplateRoleSeed[];
  workflows: TemplateWorkflowSeed[];
}

export interface ProjectTemplatesData {
  version: string;
  templates: ProjectTemplateSeed[];
}

export interface FontConfig {
  family: string;
  size: Record<string, string>;
  weight: Record<string, string>;
  lineHeight: Record<string, string>;
}

export interface ThemeSeed {
  name: string;
  label: LocalizedString;
  description: LocalizedString;
  radius: string;
  font: string;
  variables: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
  preview: {
    accent: string;
    bg: string;
    text: string;
  };
}

export interface ThemesData {
  version: string;
  defaultTheme: string;
  fonts: Record<string, FontConfig>;
  themes: ThemeSeed[];
}
