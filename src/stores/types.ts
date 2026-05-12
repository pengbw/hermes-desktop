export type Tab = "home" | "chat" | "studio" | "knowledge" | "settings" | "skills";

export interface ChatState {
  input: string;
  isStreaming: boolean;
  isThinking: boolean;
  thinkingContent: string;
  streamedContent: string;
  toolProgress: string;
}

export interface VrmState {
  isLoaded: boolean;
  loadError: string | null;
  currentExpression: string;
  activeGesture: string | null;
}

export interface AgentState {
  installed: boolean | null;
  checking: boolean;
}

export interface KnowledgeState {
  globalAutoRetrieve: boolean;
  kbList: Array<{ id: string; name: string; icon: string; status: string }>;
  indexingKbId: string | null;
  indexProgress: {
    status: string;
    current: number;
    total: number;
    file: string;
    chunk?: number;
    chunkTotal?: number;
  } | null;
}
