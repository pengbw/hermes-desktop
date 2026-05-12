import { describe, it, expect, beforeEach } from "vitest";
import { useVrmStore } from "../vrmStore";

describe("vrmStore", () => {
  beforeEach(() => {
    useVrmStore.getState().reset();
  });

  it("has correct initial state", () => {
    const state = useVrmStore.getState();
    expect(state.isLoaded).toBe(false);
    expect(state.loadError).toBeNull();
    expect(state.currentExpression).toBe("neutral");
    expect(state.activeGesture).toBeNull();
  });

  it("sets is loaded", () => {
    useVrmStore.getState().setIsLoaded(true);
    expect(useVrmStore.getState().isLoaded).toBe(true);
  });

  it("sets load error", () => {
    useVrmStore.getState().setLoadError("Failed to load VRM");
    expect(useVrmStore.getState().loadError).toBe("Failed to load VRM");
  });

  it("clears load error with null", () => {
    useVrmStore.getState().setLoadError("error");
    useVrmStore.getState().setLoadError(null);
    expect(useVrmStore.getState().loadError).toBeNull();
  });

  it("sets current expression", () => {
    useVrmStore.getState().setCurrentExpression("happy");
    expect(useVrmStore.getState().currentExpression).toBe("happy");
  });

  it("sets active gesture", () => {
    useVrmStore.getState().setActiveGesture("wave");
    expect(useVrmStore.getState().activeGesture).toBe("wave");
  });

  it("clears active gesture with null", () => {
    useVrmStore.getState().setActiveGesture("wave");
    useVrmStore.getState().setActiveGesture(null);
    expect(useVrmStore.getState().activeGesture).toBeNull();
  });

  it("resets to initial state", () => {
    useVrmStore.getState().setIsLoaded(true);
    useVrmStore.getState().setLoadError("error");
    useVrmStore.getState().setCurrentExpression("happy");
    useVrmStore.getState().setActiveGesture("wave");

    useVrmStore.getState().reset();

    const state = useVrmStore.getState();
    expect(state.isLoaded).toBe(false);
    expect(state.loadError).toBeNull();
    expect(state.currentExpression).toBe("neutral");
    expect(state.activeGesture).toBeNull();
  });
});
