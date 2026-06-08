import styles from "./KnowledgePanel.module.css";

import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "@contexts/ToastContext";
import KnowledgeBaseList from "@components/knowledge/KnowledgeBaseList";
import KnowledgeFileList from "@components/knowledge/KnowledgeFileList";
import KnowledgeSearch from "@components/knowledge/KnowledgeSearch";
import ProjectIconPicker from "@components/knowledge/ProjectIconPicker";
import KbIcon from "@components/knowledge/KbIcon";
import type { KnowledgeBase, KnowledgeFile } from "@core/types";
import { useKnowledgeStore } from "../../stores/knowledgeStore";

function KnowledgePanel({ t }: { t: (key: string) => string }) {
  const toast = useToast();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [kbSearchQuery, setKbSearchQuery] = useState("");
  const [kbPage, setKbPage] = useState(1);
  const kbPageSize = 15;
  const selectedKbRef = useRef<KnowledgeBase | null>(null);
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [kbFiles, setKbFiles] = useState<KnowledgeFile[]>([]);
  const [kbFilePage, setKbFilePage] = useState(1);
  const kbFilePageSize = 12;
  const [kbGlobalConfig, setKbGlobalConfig] = useState<Record<string, string | number | boolean>>(
    {}
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    source?: string;
    results?: KnowledgeFile[] | string;
  } | null>(null);
  const indexingKbId = useKnowledgeStore((s) => s.indexingKbId);
  const indexProgress = useKnowledgeStore((s) => s.indexProgress);
  const setIndexingKbId = useKnowledgeStore((s) => s.setIndexingKbId);
  const setIndexProgress = useKnowledgeStore((s) => s.setIndexProgress);
  const [previewFile, setPreviewFile] = useState<{
    id: string;
    name: string;
    ext: string;
    content: string;
    type: string;
    truncated: boolean;
  } | null>(null);
  const [previewChunks, setPreviewChunks] = useState<
    { id: string; chunk_index: number; content: string }[]
  >([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: "📚",
    directories: [] as string[],
  });
  const [newDir, setNewDir] = useState("");

  const updateSelectedKb = (kb: KnowledgeBase | null) => {
    selectedKbRef.current = kb;
    setSelectedKb(kb);
  };

  const handlePreviewFile = async (fileId: string, _fileName: string) => {
    try {
      const result = await invoke<{
        file_name: string;
        file_ext: string;
        type: string;
        content: string | null;
        truncated: boolean;
      }>("preview_knowledge_file", { fileId });
      setPreviewFile({
        id: fileId,
        name: result.file_name,
        ext: result.file_ext,
        content: result.content || "",
        type: result.type,
        truncated: result.truncated,
      });
      const chunks = await invoke<{ id: string; chunk_index: number; content: string }[]>(
        "get_file_chunks",
        { fileId }
      );
      setPreviewChunks(chunks);
    } catch {
      // console.error("Failed to preview file:", e);
    }
  };

  const loadKnowledgeBases = async () => {
    try {
      const list = await invoke<KnowledgeBase[]>("list_knowledge_bases");
      setKnowledgeBases(list);
      if (selectedKbRef.current) {
        const updated = list.find((kb) => kb.id === selectedKbRef.current!.id);
        if (updated) updateSelectedKb(updated);
      }
    } catch {
      // console.error("Failed to load knowledge bases:", e);
    }
    try {
      const config =
        await invoke<Record<string, string | number | boolean>>("get_knowledge_config");
      // console.log("[kb] loaded config:", config);
      setKbGlobalConfig(config);
    } catch {
      // console.error("Failed to load kb config:", e);
    }
  };

  const loadKbFiles = async (kbId: string) => {
    try {
      const files = await invoke<KnowledgeFile[]>("list_knowledge_files", {
        knowledgeBaseId: kbId,
      });
      setKbFiles(files);
    } catch {
      // console.error("Failed to load knowledge files:", e);
    }
  };

  useEffect(() => {
    loadKnowledgeBases();
  }, []);

  useEffect(() => {
    if (indexProgress?.status === "done") {
      loadKnowledgeBases();
      if (selectedKbRef.current?.id) loadKbFiles(selectedKbRef.current.id);
    }
  }, [indexProgress?.status]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingKbs = new Set<string>();
    const unlisten = listen<{ kb_id: string }>("kb-file-changed", (event) => {
      const { kb_id } = event.payload;
      pendingKbs.add(kb_id);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        for (const id of pendingKbs) {
          try {
            await invoke("index_knowledge_base", { id });
          } catch {
            // console.warn("[kb] auto-reindex failed:", e);
          }
        }
        pendingKbs.clear();
      }, 3000);
    });
    return () => {
      unlisten.then((fn) => fn());
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, []);

  useEffect(() => {
    if (selectedKb) {
      loadKbFiles(selectedKb.id);
    }
  }, [selectedKb]);

  const handleCreate = async () => {
    try {
      const result = await invoke<KnowledgeBase>("create_knowledge_base", {
        req: {
          name: form.name,
          description: form.description || undefined,
          icon: form.icon || undefined,
          directories: JSON.stringify(form.directories),
          retrievalMode: (kbGlobalConfig.defaultRetrievalMode as string) || "off",
        },
      });
      setShowCreateModal(false);
      resetForm();
      loadKnowledgeBases();
      const shouldAutoIndex = result.retrievalMode !== "off" || kbGlobalConfig.globalAutoRetrieve;
      console.log("[kb] handleCreate auto-index check:", {
        retrievalMode: result.retrievalMode,
        globalAutoRetrieve: kbGlobalConfig.globalAutoRetrieve,
        shouldAutoIndex,
        directoriesLen: form.directories.length,
      });
      if (result?.id && form.directories.length > 0 && shouldAutoIndex) {
        setIndexingKbId(result.id);
        setIndexProgress({ status: "scanning", current: 0, total: 0, file: "" });
        try {
          await invoke("index_knowledge_base", { id: result.id });
        } catch {
          // console.error("Auto-index failed:", e);
          setIndexingKbId(null);
          setIndexProgress(null);
        }
      }
    } catch {
      // console.error("Failed to create knowledge base:", e);
    }
  };

  const handleUpdate = async () => {
    if (!editingKbId) return;
    try {
      const payload = {
        id: editingKbId,
        name: form.name,
        description: form.description,
        icon: form.icon,
        directories: JSON.stringify(form.directories),
      };
      await invoke("update_knowledge_base", { req: payload });
      setShowEditModal(false);
      setEditingKbId(null);
      loadKnowledgeBases();
      if (selectedKb?.id === editingKbId) {
        updateSelectedKb({
          ...selectedKb,
          name: form.name,
          description: form.description,
          icon: form.icon,
          directories: JSON.stringify(form.directories),
        });
      }
    } catch (e) {
      toast.error("更新知识库失败: " + e);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await invoke("delete_knowledge_base", { id: deleteTargetId });
      if (selectedKb?.id === deleteTargetId) updateSelectedKb(null);
      loadKnowledgeBases();
    } catch {
      // console.error("Failed to delete knowledge base:", e);
    } finally {
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
    }
  };

  const handleIndex = async (id: string) => {
    setIndexingKbId(id);
    setIndexProgress({ status: "scanning", current: 0, total: 0, file: "" });
    try {
      await invoke("index_knowledge_base", { id });
    } catch {
      // console.error("Failed to index knowledge base:", e);
      setIndexingKbId(null);
      setIndexProgress(null);
    }
  };

  const handleSearch = async () => {
    if (!selectedKb || !searchQuery.trim()) return;
    try {
      const result = await invoke<{ source?: string; results?: KnowledgeFile[] | string }>(
        "search_knowledge_base",
        {
          id: selectedKb.id,
          query: searchQuery,
          limit: 20,
        }
      );
      setSearchResults(result);
    } catch {
      // console.error("Failed to search knowledge base:", e);
    }
  };

  const resetForm = () => {
    setForm({ name: "", description: "", icon: "📚", directories: [] });
    setNewDir("");
  };

  const openEditModal = (kb: KnowledgeBase) => {
    setEditingKbId(kb.id);
    setForm({
      name: kb.name,
      description: kb.description,
      icon: kb.icon,
      directories: JSON.parse(kb.directories || "[]"),
    });
    setShowEditModal(true);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusLabel = (status: string) => {
    if (status === "indexing") return t("kb.indexing");
    if (status === "ready") return t("kb.ready");
    return status;
  };

  const getFileIcon = (ext: string) => {
    const iconMap: Record<string, string> = {
      md: "📝",
      txt: "📄",
      pdf: "📕",
      docx: "📘",
      doc: "📘",
      json: "🔧",
      csv: "📊",
      xls: "📊",
      xlsx: "📊",
      py: "🐍",
      rs: "🦀",
      ts: "🔷",
      tsx: "🔷",
      js: "🟨",
      jsx: "🟨",
      go: "🔵",
      java: "☕",
      c: "⚙️",
      cpp: "⚙️",
      h: "⚙️",
      html: "🌐",
      css: "🎨",
      yaml: "📋",
      yml: "📋",
      toml: "📋",
      xml: "📋",
    };
    return iconMap[ext.toLowerCase()] || "📄";
  };

  return (
    <div className={styles.knowledgePanel}>
      {!selectedKb ? (
        <KnowledgeBaseList
          knowledgeBases={knowledgeBases}
          searchQuery={kbSearchQuery}
          onSearchChange={setKbSearchQuery}
          page={kbPage}
          pageSize={kbPageSize}
          onPageChange={setKbPage}
          indexingKbId={indexingKbId}
          indexProgress={indexProgress}
          onSelect={updateSelectedKb}
          onIndex={handleIndex}
          onEdit={openEditModal}
          onDelete={handleDelete}
          onCreate={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          statusLabel={statusLabel}
          t={t}
        />
      ) : (
        <div className={styles.kbDetailView}>
          <div className={styles.kbDetailHeader}>
            <button
              className={styles.kbBackBtn}
              onClick={() => {
                updateSelectedKb(null);
                setSearchResults(null);
                setSearchQuery("");
              }}
              title={t("kb.backToList")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className={styles.kbDetailTitle}>
              <span className={styles.kbDetailIcon}>
                <KbIcon icon={selectedKb.icon} />
              </span>
              <h2>{selectedKb.name}</h2>
              <span
                className={`${styles.kbDetailStatus} ${styles["kbDetailStatus" + selectedKb.status.charAt(0).toUpperCase() + selectedKb.status.slice(1)] || ""}`}
              >
                {statusLabel(selectedKb.status)}
              </span>
            </div>
            <div className={styles.kbDetailActions}>
              <button
                className="px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium cursor-pointer transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleIndex(selectedKb.id)}
                disabled={!!indexingKbId}
              >
                {indexingKbId === selectedKb.id ? t("kb.indexing") : t("kb.reindex")}
              </button>
              <button
                className="px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium cursor-pointer transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98]"
                onClick={async () => {
                  try {
                    const { open } = await import("@tauri-apps/plugin-dialog");
                    const selected = await open({
                      multiple: false,
                      filters: [{ name: "JSON", extensions: ["json"] }],
                    });
                    if (!selected) return;
                    const filePath = typeof selected === "string" ? selected : selected;
                    const { readFile } = await import("@tauri-apps/plugin-fs");
                    const data = await readFile(filePath as string);
                    const text = new TextDecoder().decode(data);
                    const json = JSON.parse(text);
                    await invoke("import_knowledge_base", { id: selectedKb.id, data: json });
                    loadKnowledgeBases();
                  } catch {
                    // console.error("Import failed:", e);
                  }
                }}
              >
                {t("kb.import")}
              </button>
            </div>
          </div>

          <div className={styles.kbDetailStats}>
            <div className={styles.kbStatCard}>
              <span className={styles.kbStatValue}>{selectedKb.fileCount}</span>
              <span className={styles.kbStatLabel}>{t("kb.fileCount")}</span>
            </div>
            <div className={styles.kbStatCard}>
              <span className={styles.kbStatValue}>{selectedKb.chunkCount}</span>
              <span className={styles.kbStatLabel}>{t("kb.chunkCount")}</span>
            </div>
            <div className={styles.kbStatCard}>
              <span className={styles.kbStatValue}>
                {kbGlobalConfig.defaultEmbeddingModel === "cloud"
                  ? "☁️ Cloud"
                  : kbGlobalConfig.defaultEmbeddingModel === "ollama"
                    ? "🦙 Ollama"
                    : "💻 Local"}
              </span>
              <span className={styles.kbStatLabel}>{t("kb.embeddingModel")}</span>
            </div>
            <div className={styles.kbStatCard}>
              <span className={styles.kbStatValue}>
                {t(`kb.retrievalMode.${kbGlobalConfig.defaultRetrievalMode || "off"}`)}
              </span>
              <span className={styles.kbStatLabel}>{t("kb.retrievalMode")}</span>
            </div>
          </div>

          {indexingKbId === selectedKb.id && indexProgress && (
            <div className={styles.kbIndexProgress}>
              <div className={styles.kbIndexProgressHeader}>
                <span className={styles.kbIndexProgressStatus}>
                  {indexProgress.status === "scanning"
                    ? "📂 扫描文件中..."
                    : indexProgress.status === "indexing"
                      ? `📄 ${indexProgress.file}`
                      : indexProgress.status === "embedding"
                        ? `🧮 嵌入向量: ${indexProgress.file}`
                        : "✅ 索引完成"}
                </span>
                {indexProgress.total > 0 && (
                  <span className={styles.kbIndexProgressCount}>
                    {(() => {
                      if (indexProgress.chunkTotal && indexProgress.chunkTotal > 0) {
                        const filePct = (indexProgress.current - 1) / indexProgress.total;
                        const chunkPct =
                          (indexProgress.chunk || 0) /
                          indexProgress.chunkTotal /
                          indexProgress.total;
                        return `${Math.round((filePct + chunkPct) * 100)}%`;
                      }
                      return `${Math.round((indexProgress.current / indexProgress.total) * 100)}%`;
                    })()}
                    ({indexProgress.current}/{indexProgress.total})
                  </span>
                )}
              </div>
              {indexProgress.total > 0 && (
                <div className={styles.kbIndexProgressBar}>
                  <div
                    className={styles.kbIndexProgressFill}
                    style={{
                      width: `${(() => {
                        if (indexProgress.chunkTotal && indexProgress.chunkTotal > 0) {
                          const filePct = (indexProgress.current - 1) / indexProgress.total;
                          const chunkPct =
                            (indexProgress.chunk || 0) /
                            indexProgress.chunkTotal /
                            indexProgress.total;
                          return (filePct + chunkPct) * 100;
                        }
                        return (indexProgress.current / indexProgress.total) * 100;
                      })()}%`,
                    }}
                  />
                  <span className={styles.kbIndexProgressPercent}>
                    {(() => {
                      if (indexProgress.chunkTotal && indexProgress.chunkTotal > 0) {
                        const filePct = (indexProgress.current - 1) / indexProgress.total;
                        const chunkPct =
                          (indexProgress.chunk || 0) /
                          indexProgress.chunkTotal /
                          indexProgress.total;
                        return `${Math.round((filePct + chunkPct) * 100)}%`;
                      }
                      return `${Math.round((indexProgress.current / indexProgress.total) * 100)}%`;
                    })()}
                  </span>
                </div>
              )}
            </div>
          )}

          {(() => {
            const dirs: string[] = JSON.parse(selectedKb.directories || "[]");
            return dirs.length > 0 ? (
              <div className={styles.kbDetailDirs}>
                <h3>📁 {t("kb.directories")}</h3>
                <div className={styles.kbDirTags}>
                  {dirs.map((dir, i) => (
                    <span key={i} className={styles.kbDirTag} title={dir}>
                      {dir}
                    </span>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          <KnowledgeSearch
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onSearch={handleSearch}
            searchResults={searchResults}
            getFileIcon={getFileIcon}
            formatSize={formatSize}
            t={t}
          />

          <div className={styles.kbFilesSection}>
            <KnowledgeFileList
              files={kbFiles}
              page={kbFilePage}
              pageSize={kbFilePageSize}
              onPageChange={setKbFilePage}
              onPreviewFile={handlePreviewFile}
              getFileIcon={getFileIcon}
              formatSize={formatSize}
              t={t}
            />
          </div>

          {previewFile && (
            <div
              className={styles.kbModalOverlay}
              onClick={() => {
                setPreviewFile(null);
                setPreviewChunks([]);
              }}
            >
              <div className={styles.kbPreviewModal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.kbPreviewModalHeader}>
                  <h3>
                    {getFileIcon(previewFile.ext)} {previewFile.name}
                  </h3>
                  <button
                    className={styles.kbPreviewModalClose}
                    onClick={() => {
                      setPreviewFile(null);
                      setPreviewChunks([]);
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className={styles.kbPreviewModalBody}>
                  {previewFile.type === "text" ? (
                    <div className={styles.kbPreviewModalContent}>
                      <pre>{previewFile.content}</pre>
                      {previewFile.truncated && (
                        <div className={styles.kbPreviewModalTruncated}>
                          {t("kb.fileTruncated")}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={styles.kbPreviewModalBinary}>{t("kb.binaryFile")}</div>
                  )}
                  {previewChunks.length > 0 && (
                    <div className={styles.kbPreviewModalChunks}>
                      <h4>
                        {t("kb.chunks")} ({previewChunks.length})
                      </h4>
                      {previewChunks.map((chunk) => (
                        <div key={chunk.id} className={styles.kbChunkItem}>
                          <span className={styles.kbChunkIndex}>#{chunk.chunk_index}</span>
                          <pre className={styles.kbChunkContent}>{chunk.content}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showDeleteConfirm && (
        <div
          className={styles.kbModalOverlay}
          onClick={() => {
            setShowDeleteConfirm(false);
            setDeleteTargetId(null);
          }}
        >
          <div className={styles.kbConfirmModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.kbConfirmIcon}>⚠️</div>
            <div className={styles.kbConfirmMsg}>{t("kb.deleteConfirm")}</div>
            <div className={styles.kbConfirmActions}>
              <button
                className={styles.kbBtn + " " + styles.kbBtnCancel}
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteTargetId(null);
                }}
              >
                {t("kb.cancel")}
              </button>
              <button className={styles.kbBtn + " " + styles.kbBtnDanger} onClick={confirmDelete}>
                {t("kb.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {(showCreateModal || showEditModal) && (
        <div
          className={styles.kbModalOverlay}
          onClick={() => {
            setShowCreateModal(false);
            setShowEditModal(false);
          }}
        >
          <div className={styles.kbModal} onClick={(e) => e.stopPropagation()}>
            <h2>{showCreateModal ? t("kb.create") : t("kb.edit")}</h2>
            <div className={styles.kbForm}>
              <div className={styles.kbFormGroup}>
                <label>{t("kb.icon")}</label>
                <ProjectIconPicker
                  value={form.icon}
                  onChange={(icon) => setForm({ ...form, icon })}
                />
              </div>
              <div className={styles.kbFormGroup}>
                <label>{t("kb.name")}</label>
                <input
                  type="text"
                  placeholder={t("kb.namePlaceholder")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className={styles.kbFormGroup}>
                <label>{t("kb.description")}</label>
                <textarea
                  placeholder={t("kb.descriptionPlaceholder")}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className={styles.kbFormGroup}>
                <label>{t("kb.directories")}</label>
                <p className={styles.kbHint}>{t("kb.directoriesHint")}</p>
                <div className={styles.kbDirList}>
                  {form.directories.map((dir, i) => (
                    <div key={i} className={styles.kbDirItem}>
                      <span className={styles.kbDirPath}>📁 {dir}</span>
                      <button
                        className={styles.kbDirRemove}
                        onClick={() => {
                          setForm({
                            ...form,
                            directories: form.directories.filter((_, j) => j !== i),
                          });
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div className={styles.kbDirAdd}>
                    <input
                      type="text"
                      placeholder="C:\Users\docs 或 ~/notes"
                      value={newDir}
                      onChange={(e) => setNewDir(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newDir.trim()) {
                          setForm({ ...form, directories: [...form.directories, newDir.trim()] });
                          setNewDir("");
                        }
                      }}
                    />
                    <button
                      onClick={async () => {
                        try {
                          const { open } = await import("@tauri-apps/plugin-dialog");
                          const selected = await open({
                            directory: true,
                            title: t("kb.selectDirectory"),
                            multiple: false,
                          });
                          if (selected) {
                            const path =
                              typeof selected === "string"
                                ? selected
                                : (selected as { path: string }).path || String(selected);
                            setForm({ ...form, directories: [...form.directories, path] });
                          }
                        } catch {
                          if (newDir.trim()) {
                            setForm({ ...form, directories: [...form.directories, newDir.trim()] });
                            setNewDir("");
                          }
                        }
                      }}
                    >
                      📂
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.kbModalActions}>
              <button
                className={styles.kbBtn + " " + styles.kbBtnCancel}
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                }}
              >
                {t("kb.cancel")}
              </button>
              <button
                className={styles.kbBtn + " " + styles.kbBtnSave}
                onClick={() => {
                  if (showCreateModal) handleCreate();
                  else handleUpdate();
                }}
                disabled={!form.name.trim()}
              >
                {t("kb.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default KnowledgePanel;
