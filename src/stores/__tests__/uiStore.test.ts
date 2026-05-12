import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "../uiStore";

describe("uiStore", () => {
  beforeEach(() => {
    useUiStore.setState({
      activeTab: "home",
      showAvatar: false,
      isInputFocused: false,
      isHovering: false,
    });
  });

  it("has correct initial state", () => {
    const state = useUiStore.getState();
    expect(state.activeTab).toBe("home");
    expect(state.showAvatar).toBe(false);
    expect(state.isInputFocused).toBe(false);
    expect(state.isHovering).toBe(false);
  });

  it("sets active tab", () => {
    useUiStore.getState().setActiveTab("chat");
    expect(useUiStore.getState().activeTab).toBe("chat");
  });

  it("sets all tab types", () => {
    const tabs = ["home", "chat", "studio", "knowledge", "settings", "skills"] as const;
    tabs.forEach((tab) => {
      useUiStore.getState().setActiveTab(tab);
      expect(useUiStore.getState().activeTab).toBe(tab);
    });
  });

  it("sets show avatar", () => {
    useUiStore.getState().setShowAvatar(true);
    expect(useUiStore.getState().showAvatar).toBe(true);
  });

  it("toggles avatar", () => {
    expect(useUiStore.getState().showAvatar).toBe(false);
    useUiStore.getState().toggleAvatar();
    expect(useUiStore.getState().showAvatar).toBe(true);
    useUiStore.getState().toggleAvatar();
    expect(useUiStore.getState().showAvatar).toBe(false);
  });

  it("sets input focused", () => {
    useUiStore.getState().setIsInputFocused(true);
    expect(useUiStore.getState().isInputFocused).toBe(true);
  });

  it("sets hovering", () => {
    useUiStore.getState().setIsHovering(true);
    expect(useUiStore.getState().isHovering).toBe(true);
  });
});
