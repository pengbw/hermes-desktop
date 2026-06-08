import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "@stores/uiStore";
import type { Tab } from "@stores/types";

describe("uiStore", () => {
  beforeEach(() => {
    useUiStore.setState({
      activeTab: "home",
      showAvatar: false,
      isInputFocused: false,
      isHovering: false,
    });
  });

  it("初始 activeTab 应该是 'home'", () => {
    expect(useUiStore.getState().activeTab).toBe("home");
  });

  it("setActiveTab 应该更新 activeTab", () => {
    useUiStore.getState().setActiveTab("chat");
    expect(useUiStore.getState().activeTab).toBe("chat");
  });

  it("setShowAvatar 应该设置 showAvatar", () => {
    useUiStore.getState().setShowAvatar(true);
    expect(useUiStore.getState().showAvatar).toBe(true);
  });

  it("toggleAvatar 应该切换 showAvatar", () => {
    useUiStore.getState().toggleAvatar();
    expect(useUiStore.getState().showAvatar).toBe(true);
    useUiStore.getState().toggleAvatar();
    expect(useUiStore.getState().showAvatar).toBe(false);
  });

  it("setIsInputFocused 应该设置 isInputFocused", () => {
    useUiStore.getState().setIsInputFocused(true);
    expect(useUiStore.getState().isInputFocused).toBe(true);
  });

  it("setIsHovering 应该设置 isHovering", () => {
    useUiStore.getState().setIsHovering(true);
    expect(useUiStore.getState().isHovering).toBe(true);
  });

  it("支持 6 种 Tab", () => {
    const tabs: Tab[] = ["home", "chat", "studio", "knowledge", "settings", "skills"];
    for (const t of tabs) {
      useUiStore.getState().setActiveTab(t);
      expect(useUiStore.getState().activeTab).toBe(t);
    }
  });
});
