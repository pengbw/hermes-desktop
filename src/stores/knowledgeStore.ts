import { create } from "zustand";
import type { KnowledgeState } from "./types";

interface KnowledgeStore extends KnowledgeState {
  setGlobalAutoRetrieve: (autoRetrieve: boolean) => void;
  setKbList: (list: Array<{ id: string; name: string; icon: string; status: string }>) => void;
  setIndexingKbId: (id: string | null) => void;
  setIndexProgress: (progress: KnowledgeState["indexProgress"]) => void;
}

export const useKnowledgeStore = create<KnowledgeStore>((set) => ({
  globalAutoRetrieve: false,
  kbList: [],
  indexingKbId: null,
  indexProgress: null,
  setGlobalAutoRetrieve: (globalAutoRetrieve) => set({ globalAutoRetrieve }),
  setKbList: (kbList) => set({ kbList }),
  setIndexingKbId: (indexingKbId) => set({ indexingKbId }),
  setIndexProgress: (indexProgress) => set({ indexProgress }),
}));
