import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useKnowledgeBase, useKnowledgeFiles, useKnowledgeSearch } from "../useKnowledgeBase";

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

const mockKb = {
  id: "kb-1",
  name: "Test KB",
  description: "A test knowledge base",
  icon: "📚",
  directories: "[]",
  embeddingModel: "local",
  retrievalMode: "off",
  maxContextChunks: 8,
  autoRetrieve: false,
  status: "ready",
  fileCount: 0,
  chunkCount: 0,
  createdAt: 1000,
  updatedAt: 1000,
};

const mockFile = {
  id: "file-1",
  knowledgeBaseId: "kb-1",
  filePath: "/test/doc.txt",
  fileName: "doc.txt",
  fileExt: "txt",
  fileSize: 1024,
  chunkCount: 3,
  indexStatus: "indexed",
  modifiedAt: 1000,
  createdAt: 1000,
  updatedAt: 1000,
};

describe("useKnowledgeBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads knowledge bases on mount", async () => {
    mockInvoke.mockResolvedValueOnce([mockKb]);

    const { result } = renderHook(() => useKnowledgeBase());

    await waitFor(() => {
      expect(result.current.knowledgeBases).toHaveLength(1);
    });

    expect(mockInvoke).toHaveBeenCalledWith("list_knowledge_bases");
    expect(result.current.knowledgeBases).toEqual([mockKb]);
  });

  it("creates a knowledge base", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce(mockKb);
    mockInvoke.mockResolvedValueOnce([mockKb]);

    const { result } = renderHook(() => useKnowledgeBase());

    await waitFor(() => {
      expect(result.current.knowledgeBases).toEqual([]);
    });

    await act(async () => {
      await result.current.createKnowledgeBase({
        name: "Test KB",
        description: "A test knowledge base",
        icon: "📚",
        directories: "[]",
        embeddingModel: "local",
        retrievalMode: "off",
        maxContextChunks: 8,
        autoRetrieve: false,
      });
    });

    expect(mockInvoke).toHaveBeenCalledWith("create_knowledge_base", {
      req: expect.objectContaining({ name: "Test KB" }),
    });
  });

  it("deletes a knowledge base", async () => {
    mockInvoke.mockResolvedValueOnce([mockKb]);
    mockInvoke.mockResolvedValueOnce(undefined);
    mockInvoke.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useKnowledgeBase());

    await waitFor(() => {
      expect(result.current.knowledgeBases).toHaveLength(1);
    });

    act(() => {
      result.current.updateSelectedKb(mockKb);
    });

    await act(async () => {
      await result.current.deleteKnowledgeBase("kb-1");
    });

    expect(mockInvoke).toHaveBeenCalledWith("delete_knowledge_base", { id: "kb-1" });
    expect(result.current.selectedKb).toBeNull();
  });

  it("updates a knowledge base", async () => {
    mockInvoke.mockResolvedValueOnce([mockKb]);
    mockInvoke.mockResolvedValueOnce(undefined);
    mockInvoke.mockResolvedValueOnce([{ ...mockKb, name: "Updated KB" }]);

    const { result } = renderHook(() => useKnowledgeBase());

    await waitFor(() => {
      expect(result.current.knowledgeBases).toHaveLength(1);
    });

    await act(async () => {
      await result.current.updateKnowledgeBase({ id: "kb-1", name: "Updated KB" });
    });

    expect(mockInvoke).toHaveBeenCalledWith("update_knowledge_base", {
      req: { id: "kb-1", name: "Updated KB" },
    });
  });

  it("indexes a knowledge base", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useKnowledgeBase());

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.indexKnowledgeBase("kb-1");
    });

    expect(mockInvoke).toHaveBeenCalledWith("index_knowledge_base", { id: "kb-1" });
    expect(result.current.indexingKbId).toBeNull();
  });

  it("handles index errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockRejectedValueOnce(new Error("Index failed"));

    const { result } = renderHook(() => useKnowledgeBase());

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.indexKnowledgeBase("kb-1");
    });

    expect(result.current.indexingKbId).toBeNull();
    consoleSpy.mockRestore();
  });

  it("updates selectedKb when list refreshes", async () => {
    mockInvoke.mockResolvedValueOnce([mockKb]);

    const { result } = renderHook(() => useKnowledgeBase());

    await waitFor(() => {
      expect(result.current.knowledgeBases).toHaveLength(1);
    });

    act(() => {
      result.current.updateSelectedKb(mockKb);
    });

    expect(result.current.selectedKb).toEqual(mockKb);

    mockInvoke.mockResolvedValueOnce([{ ...mockKb, name: "Updated KB" }]);

    await act(async () => {
      await result.current.loadKnowledgeBases();
    });

    expect(result.current.selectedKb?.name).toBe("Updated KB");
  });
});

describe("useKnowledgeFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads files when kbId is provided", async () => {
    mockInvoke.mockResolvedValueOnce([mockFile]);

    const { result } = renderHook(() => useKnowledgeFiles("kb-1"));

    await waitFor(() => {
      expect(result.current.files).toHaveLength(1);
    });

    expect(mockInvoke).toHaveBeenCalledWith("list_knowledge_files", {
      knowledgeBaseId: "kb-1",
    });
  });

  it("clears files when kbId is null", async () => {
    const { result } = renderHook(() => useKnowledgeFiles(null));

    await waitFor(() => {
      expect(result.current.files).toEqual([]);
    });
  });

  it("previews a file", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce({
      file_name: "doc.txt",
      file_ext: "txt",
      type: "text",
      content: "Hello world",
      truncated: false,
    });
    mockInvoke.mockResolvedValueOnce([{ id: "chunk-1", chunk_index: 0, content: "Hello world" }]);

    const { result } = renderHook(() => useKnowledgeFiles("kb-1"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
    });

    let preview: any;
    await act(async () => {
      preview = await result.current.previewFile("file-1");
    });

    expect(preview.name).toBe("doc.txt");
    expect(preview.chunks).toHaveLength(1);
  });
});

describe("useKnowledgeSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches knowledge base", async () => {
    const mockResults = { results: [{ content: "found", score: 0.9 }] };
    mockInvoke.mockResolvedValueOnce(mockResults);

    const { result } = renderHook(() => useKnowledgeSearch());

    await act(async () => {
      await result.current.search("kb-1", "test query");
    });

    expect(mockInvoke).toHaveBeenCalledWith("search_knowledge_base", {
      id: "kb-1",
      query: "test query",
      limit: undefined,
    });
    expect(result.current.searchResults).toEqual(mockResults);
    expect(result.current.isSearching).toBe(false);
  });

  it("handles search errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInvoke.mockRejectedValueOnce(new Error("Search failed"));

    const { result } = renderHook(() => useKnowledgeSearch());

    await act(async () => {
      await result.current.search("kb-1", "test");
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.searchResults).toBeNull();
    consoleSpy.mockRestore();
  });

  it("clears search results", async () => {
    const mockResults = { results: [] };
    mockInvoke.mockResolvedValueOnce(mockResults);

    const { result } = renderHook(() => useKnowledgeSearch());

    await act(async () => {
      await result.current.search("kb-1", "test");
    });

    expect(result.current.searchResults).toEqual(mockResults);

    act(() => {
      result.current.clearResults();
    });

    expect(result.current.searchResults).toBeNull();
  });
});
