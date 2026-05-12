export const ROUTE_HOME = "home";
export const ROUTE_CHAT = "chat";
export const ROUTE_STUDIO = "studio";
export const ROUTE_KNOWLEDGE = "knowledge";
export const ROUTE_SETTINGS = "settings";
export const ROUTE_SKILLS = "skills";

export type AppRoute =
  | typeof ROUTE_HOME
  | typeof ROUTE_CHAT
  | typeof ROUTE_STUDIO
  | typeof ROUTE_KNOWLEDGE
  | typeof ROUTE_SETTINGS
  | typeof ROUTE_SKILLS;
