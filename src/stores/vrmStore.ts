import { create } from "zustand";
import type { VrmState } from "./types";

interface VrmStore extends VrmState {
  setIsLoaded: (loaded: boolean) => void;
  setLoadError: (error: string | null) => void;
  setCurrentExpression: (expression: string) => void;
  setActiveGesture: (gesture: string | null) => void;
  reset: () => void;
}

const INITIAL_VRM_STATE: VrmState = {
  isLoaded: false,
  loadError: null,
  currentExpression: "neutral",
  activeGesture: null,
};

export const useVrmStore = create<VrmStore>((set) => ({
  ...INITIAL_VRM_STATE,
  setIsLoaded: (isLoaded) => set({ isLoaded }),
  setLoadError: (loadError) => set({ loadError }),
  setCurrentExpression: (currentExpression) => set({ currentExpression }),
  setActiveGesture: (activeGesture) => set({ activeGesture }),
  reset: () => set(INITIAL_VRM_STATE),
}));
