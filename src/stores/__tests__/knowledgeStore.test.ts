import { describe, it, expect, beforeEach } from "vitest";
import { useKnowledgeStore } from "../knowledgeStore";

describe("knowledgeStore", () => {
  beforeEach(() => {
    useKnowledgeStore.setState({ globalAutoRetrieve: false, kbList: [] });
  });

  it("has correct initial state", () => {
    const state = useKnowledgeStore.getState();
    expect(state.globalAutoRetrieve).toBe(false);
    expect(state.kbList).toEqual([]);
  });

  it("sets global auto retrieve", () => {
    useKnowledgeStore.getState().setGlobalAutoRetrieve(true);
    expect(useKnowledgeStore.getState().globalAutoRetrieve).toBe(true);
  });

  it("sets kb list", () => {
    const list = [
      { id: "1", name: "Docs", icon: "📚", status: "ready" },
      { id: "2", name: "Code", icon: "💻", status: "indexing" },
    ];
    useKnowledgeStore.getState().setKbList(list);
    expect(useKnowledgeStore.getState().kbList).toEqual(list);
  });
});
