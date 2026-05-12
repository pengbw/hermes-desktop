import { create } from "zustand";
import type { AgentState } from "./types";

interface AgentStore extends AgentState {
  setInstalled: (installed: boolean | null) => void;
  setChecking: (checking: boolean) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  installed: null,
  checking: false,
  setInstalled: (installed) => set({ installed }),
  setChecking: (checking) => set({ checking }),
}));
