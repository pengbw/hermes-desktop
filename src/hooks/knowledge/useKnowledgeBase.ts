import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { KnowledgeBase, KnowledgeFile } from "@core/types";

export function useKnowledgeBase() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const selectedKbRef = useRef<KnowledgeBase | null>(null);
  const [indexingKbId, setIndexingKbId] = useState<string | null>(null);
  const [indexProgress, setIndexProgress] = useState<{
    status: string;
    current: number;
    total: number;
    file: string;
  } | null>(null);

  const updateSelectedKb = useCallback((kb: KnowledgeBase | null) => {
    selectedKbRef.current = kb;
    setSelectedKb(kb);
  }, []);

  const loadKnowledgeBases = useCallback(async () => {
    try {
      const list = await invoke<KnowledgeBase[]>("list_knowledge_bases");
      setKnowledgeBases(list);
      if (selectedKbRef.current) {
        const updated = list.find((kb) => kb.id === selectedKbRef.current!.id);
        if (updated) updateSelectedKb(updated);
      }
    } catch (e) {
// console.error("Failed to load knowledge bases:", e);
    }
  }, [updateSelectedKb]);

  const createKnowledgeBase = useCallback(
    async (req: {
      name: string;
      description: string;
      icon: string;
      directories: string;
      embeddingModel: string;
      retrievalMode: string;
      maxContextChunks: number;
      autoRetrieve: boolean;
    }) => {
      const result = await invoke<KnowledgeBase>("create_knowledge_base", { req });
      await loadKnowledgeBases();
      return result;
    },
    [loadKnowledgeBases]
  );

  const updateKnowledgeBase = useCallback(
    async (req: Partial<KnowledgeBase> & { id: string }) => {
      await invoke("update_knowledge_base", { req });
      await loadKnowledgeBases();
    },
    [loadKnowledgeBases]
  );

  const deleteKnowledgeBase = useCallback(
    async (id: string) => {
      await invoke("delete_knowledge_base", { id });
      if (selectedKbRef.current?.id === id) {
        updateSelectedKb(null);
      }
      await loadKnowledgeBases();
    },
    [loadKnowledgeBases, updateSelectedKb]
  );

  const indexKnowledgeBase = useCallback(async (id: string) => {
    setIndexingKbId(id);
    try {
      await invoke("index_knowledge_base", { id });
    } catch (e) {
// console.error("Failed to index knowledge base:", e);
    } finally {
      setIndexingKbId(null);
    }
  }, []);

  useEffect(() => {
    loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  return {
    knowledgeBases,
    selectedKb,
    selectedKbRef,
    indexingKbId,
    indexProgress,
    setIndexProgress,
    updateSelectedKb,
    loadKnowledgeBases,
    createKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBase,
    indexKnowledgeBase,
  };
}

export function useKnowledgeFiles(kbId: string | null) {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);

  const loadFiles = useCallback(async () => {
    if (!kbId) {
      setFiles([]);
      return;
    }
    try {
      const result = await invoke<KnowledgeFile[]>("list_knowledge_files", {
        knowledgeBaseId: kbId,
      });
      setFiles(result);
    } catch (e) {
// console.error("Failed to load knowledge files:", e);
    }
  }, [kbId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const previewFile = useCallback(async (fileId: string) => {
    const result = await invoke<{
      file_name: string;
      file_ext: string;
      type: string;
      content: string | null;
      truncated: boolean;
    }>("preview_knowledge_file", { fileId });
    const chunks = await invoke<{ id: string; chunk_index: number; content: string }[]>(
      "get_file_chunks",
      { fileId }
    );
    return {
      id: fileId,
      name: result.file_name,
      ext: result.file_ext,
      content: result.content || "",
      type: result.type,
      truncated: result.truncated,
      chunks,
    };
  }, []);

  return {
    files,
    loadFiles,
    previewFile,
  };
}

export function useKnowledgeSearch() {
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  const search = useCallback(async (kbId: string, query: string, limit?: number) => {
    setIsSearching(true);
    try {
      const results = await invoke("search_knowledge_base", { id: kbId, query, limit });
      setSearchResults(results);
      return results;
    } catch (e) {
// console.error("Search failed:", e);
      return null;
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setSearchResults(null);
  }, []);

  return {
    searchResults,
    isSearching,
    search,
    clearResults,
  };
}
