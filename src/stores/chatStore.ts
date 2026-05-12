import { create } from "zustand";
import type { ChatState } from "./types";

export interface AttachedFile {
  name: string;
  path: string;
}

interface ChatStore extends ChatState {
  attachedFiles: AttachedFile[];
  isDragging: boolean;
  setInput: (input: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setIsThinking: (thinking: boolean) => void;
  setThinkingContent: (content: string) => void;
  setStreamedContent: (content: string) => void;
  setToolProgress: (progress: string) => void;
  setAttachedFiles: (files: AttachedFile[]) => void;
  setIsDragging: (dragging: boolean) => void;
  resetStreamState: () => void;
}

const INITIAL_CHAT_STATE: ChatState = {
  input: "",
  isStreaming: false,
  isThinking: false,
  thinkingContent: "",
  streamedContent: "",
  toolProgress: "",
};

export const useChatStore = create<ChatStore>((set) => ({
  ...INITIAL_CHAT_STATE,
  attachedFiles: [],
  isDragging: false,
  setInput: (input) => set({ input }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setIsThinking: (isThinking) => set({ isThinking }),
  setThinkingContent: (thinkingContent) => set({ thinkingContent }),
  setStreamedContent: (streamedContent) => set({ streamedContent }),
  setToolProgress: (toolProgress) => set({ toolProgress }),
  setAttachedFiles: (attachedFiles) => set({ attachedFiles }),
  setIsDragging: (isDragging) => set({ isDragging }),
  resetStreamState: () =>
    set({
      isStreaming: false,
      isThinking: false,
      thinkingContent: "",
      streamedContent: "",
      toolProgress: "",
    }),
}));
