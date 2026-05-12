import { create } from "zustand";
import type { Tab } from "./types";

interface UiState {
  activeTab: Tab;
  showAvatar: boolean;
  isInputFocused: boolean;
  isHovering: boolean;
  setActiveTab: (tab: Tab) => void;
  setShowAvatar: (show: boolean) => void;
  toggleAvatar: () => void;
  setIsInputFocused: (focused: boolean) => void;
  setIsHovering: (hovering: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "home",
  showAvatar: false,
  isInputFocused: false,
  isHovering: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setShowAvatar: (show) => set({ showAvatar: show }),
  toggleAvatar: () => set((state) => ({ showAvatar: !state.showAvatar })),
  setIsInputFocused: (isInputFocused) => set({ isInputFocused }),
  setIsHovering: (isHovering) => set({ isHovering }),
}));
