import { describe, it, expect, beforeEach } from "vitest";
import { useKnowledgeStore } from "@stores/knowledgeStore";

describe("knowledgeStore", () => {
  beforeEach(() => {
    useKnowledgeStore.setState({
      globalAutoRetrieve: false,
      kbList: [],
      indexingKbId: null,
      indexProgress: null,
    });
  });

  it("初始状态正确", () => {
    expect(useKnowledgeStore.getState().globalAutoRetrieve).toBe(false);
    expect(useKnowledgeStore.getState().kbList).toEqual([]);
    expect(useKnowledgeStore.getState().indexingKbId).toBeNull();
    expect(useKnowledgeStore.getState().indexProgress).toBeNull();
  });

  it("setGlobalAutoRetrieve 应该更新 globalAutoRetrieve", () => {
    useKnowledgeStore.getState().setGlobalAutoRetrieve(true);
    expect(useKnowledgeStore.getState().globalAutoRetrieve).toBe(true);
  });

  it("setKbList 应该更新 kbList", () => {
    const list = [{ id: "kb-1", name: "Test", icon: "📚", status: "ready" }];
    useKnowledgeStore.getState().setKbList(list);
    expect(useKnowledgeStore.getState().kbList).toEqual(list);
  });

  it("setIndexingKbId 应该更新 indexingKbId", () => {
    useKnowledgeStore.getState().setIndexingKbId("kb-1");
    expect(useKnowledgeStore.getState().indexingKbId).toBe("kb-1");
    useKnowledgeStore.getState().setIndexingKbId(null);
    expect(useKnowledgeStore.getState().indexingKbId).toBeNull();
  });

  it("setIndexProgress 应该更新 indexProgress", () => {
    const progress = {
      status: "scanning",
      current: 0,
      total: 10,
      file: "/tmp/a.txt",
    };
    useKnowledgeStore.getState().setIndexProgress(progress);
    expect(useKnowledgeStore.getState().indexProgress).toEqual(progress);
  });
});
