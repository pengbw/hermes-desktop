export const DEFAULT_TAB = "home";

export const DEFAULT_CHAT_STATE = {
  isStreaming: false,
  isThinking: false,
  thinkingContent: "",
  streamedContent: "",
  toolProgress: "",
} as const;

export const CARDS_STORAGE_KEY = "hermes-custom-cards";

export const OLLAMA_DEFAULT_ENDPOINT = "http://localhost:11434";

export const VRM_MODEL_PATH = "/vrm/miko.vrm";

export const TYPEWRITER_DEFAULT_SPEED = 50;
