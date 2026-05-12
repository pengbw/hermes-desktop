import { describe, it, expect, beforeEach } from "vitest";
import { useAgentStore } from "../agentStore";

describe("agentStore", () => {
  beforeEach(() => {
    useAgentStore.setState({ installed: null, checking: false });
  });

  it("has correct initial state", () => {
    const state = useAgentStore.getState();
    expect(state.installed).toBeNull();
    expect(state.checking).toBe(false);
  });

  it("sets installed", () => {
    useAgentStore.getState().setInstalled(true);
    expect(useAgentStore.getState().installed).toBe(true);
  });

  it("sets installed to false", () => {
    useAgentStore.getState().setInstalled(false);
    expect(useAgentStore.getState().installed).toBe(false);
  });

  it("sets checking", () => {
    useAgentStore.getState().setChecking(true);
    expect(useAgentStore.getState().checking).toBe(true);
  });
});
