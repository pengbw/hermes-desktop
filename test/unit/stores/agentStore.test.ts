import { describe, it, expect, beforeEach } from "vitest";
import { useAgentStore } from "@stores/agentStore";

describe("agentStore", () => {
  beforeEach(() => {
    useAgentStore.setState({ installed: null, checking: false });
  });

  it("初始 installed 为 null, checking 为 false", () => {
    expect(useAgentStore.getState().installed).toBeNull();
    expect(useAgentStore.getState().checking).toBe(false);
  });

  it("setInstalled 应该更新 installed", () => {
    useAgentStore.getState().setInstalled(true);
    expect(useAgentStore.getState().installed).toBe(true);
    useAgentStore.getState().setInstalled(false);
    expect(useAgentStore.getState().installed).toBe(false);
    useAgentStore.getState().setInstalled(null);
    expect(useAgentStore.getState().installed).toBeNull();
  });

  it("setChecking 应该更新 checking", () => {
    useAgentStore.getState().setChecking(true);
    expect(useAgentStore.getState().checking).toBe(true);
    useAgentStore.getState().setChecking(false);
    expect(useAgentStore.getState().checking).toBe(false);
  });
});
