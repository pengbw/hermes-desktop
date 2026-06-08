import { describe, it, expect, beforeEach } from "vitest";
import { useVrmStore } from "@stores/vrmStore";

describe("vrmStore", () => {
  beforeEach(() => {
    useVrmStore.setState({
      isLoaded: false,
      loadError: null,
      currentExpression: "neutral",
      activeGesture: null,
    });
  });

  it("初始状态正确", () => {
    expect(useVrmStore.getState().isLoaded).toBe(false);
    expect(useVrmStore.getState().loadError).toBeNull();
    expect(useVrmStore.getState().currentExpression).toBe("neutral");
    expect(useVrmStore.getState().activeGesture).toBeNull();
  });

  it("setIsLoaded 应该更新 isLoaded", () => {
    useVrmStore.getState().setIsLoaded(true);
    expect(useVrmStore.getState().isLoaded).toBe(true);
  });

  it("setLoadError 应该更新 loadError", () => {
    useVrmStore.getState().setLoadError("VRM fail");
    expect(useVrmStore.getState().loadError).toBe("VRM fail");
  });

  it("setLoadError(null) 应该清除错误", () => {
    useVrmStore.getState().setLoadError("x");
    useVrmStore.getState().setLoadError(null);
    expect(useVrmStore.getState().loadError).toBeNull();
  });

  it("setCurrentExpression 应该更新表情", () => {
    useVrmStore.getState().setCurrentExpression("happy");
    expect(useVrmStore.getState().currentExpression).toBe("happy");
  });

  it("setActiveGesture 应该更新动作", () => {
    useVrmStore.getState().setActiveGesture("wave");
    expect(useVrmStore.getState().activeGesture).toBe("wave");
    useVrmStore.getState().setActiveGesture(null);
    expect(useVrmStore.getState().activeGesture).toBeNull();
  });

  it("reset 应该重置所有状态", () => {
    useVrmStore.getState().setIsLoaded(true);
    useVrmStore.getState().setLoadError("err");
    useVrmStore.getState().setCurrentExpression("happy");
    useVrmStore.getState().setActiveGesture("wave");
    useVrmStore.getState().reset();
    expect(useVrmStore.getState().isLoaded).toBe(false);
    expect(useVrmStore.getState().loadError).toBeNull();
    expect(useVrmStore.getState().currentExpression).toBe("neutral");
    expect(useVrmStore.getState().activeGesture).toBeNull();
  });
});
