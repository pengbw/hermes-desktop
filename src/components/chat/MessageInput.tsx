import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "@contexts/I18nContext";
import { useVoiceInput } from "@hooks/common";
import type { AttachedFile } from "@core/types";
import styles from "./MessageInput.module.css";

interface MessageInputProps {
  input: string;
  setInput: (v: string) => void;
  onSend: (params: {
    content?: string;
    filesJson?: string;
    model?: string;
    provider?: string;
    imagePath?: string;
    forceKbRetrieve?: boolean;
    kbIds?: string[];
    voiceInfo?: { audioPath: string; audioDuration: number };
  }) => void;
  onSttComplete?: (text: string, audioPath: string, audioDuration?: number) => void;
  isStreaming: boolean;
  voiceEnabled: boolean;
  kbGlobalAutoRetrieve: boolean;
  kbList: { id: string; name: string; icon: string; status: string }[];
  pendingKbIds: string[];
  setPendingKbIds: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function MessageInput({
  input,
  setInput,
  onSend,
  onSttComplete,
  isStreaming,
  voiceEnabled,
  kbGlobalAutoRetrieve,
  kbList,
  pendingKbIds,
  setPendingKbIds,
}: MessageInputProps) {
  const { t } = useI18n();
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  const { voiceState, installError, progressText, micError, toggleRecording, installStt } = useVoiceInput({
    onResult: () => {},
    onRecordingComplete: (audioPath) => {
      console.log("[MessageInput] onRecordingComplete, audioPath:", audioPath);
      const shouldKbRetrieve = !kbGlobalAutoRetrieve && pendingKbIds.length > 0;
      onSend({
        voiceInfo: { audioPath, audioDuration: 0 },
        forceKbRetrieve: shouldKbRetrieve,
        kbIds: shouldKbRetrieve ? pendingKbIds : undefined,
      });
      setInput("");
    },
    onSttComplete: (text, audioPath, audioDuration) => {
      if (onSttComplete) {
        onSttComplete(text, audioPath, audioDuration);
      }
    },
    onFinalResult: (text, audioPath, audioDuration) => {
      if (audioPath) {
        const shouldKbRetrieve = !kbGlobalAutoRetrieve && pendingKbIds.length > 0;
        onSend({
          content: text.trim(),
          voiceInfo: { audioPath, audioDuration: audioDuration ?? 0 },
          forceKbRetrieve: shouldKbRetrieve,
          kbIds: shouldKbRetrieve ? pendingKbIds : undefined,
        });
        setInput("");
      } else {
        setInput(text);
      }
    },
  });
  const [isDragging, setIsDragging] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelList, setModelList] = useState<{ id: string; ownedBy?: string }[]>([]);
  const [currentModel, setCurrentModel] = useState("");
  const [providers, setProviders] = useState<
    { id: string; name: string; value: string; baseUrl: string; apiKey: string }[]
  >([]);
  const [currentProvider, setCurrentProvider] = useState("");
  const [showKbSelector, setShowKbSelector] = useState(false);
  const kbSelectorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const lastCompositionEndRef = useRef(0);
  useEffect(() => {
    const loadProviders = async () => {
      try {
        const list =
          await invoke<
            { id: string; name: string; value: string; baseUrl: string; apiKey: string }[]
          >("list_providers");
        setProviders(list);
      } catch (e) {
        console.error("Failed to load providers:", e);
      }
    };
    const loadCurrentModel = async () => {
      try {
        const config = await invoke<{ model: string; provider: string }>("get_hermes_config");
        setCurrentModel(config.model);
        setCurrentProvider(config.provider);
      } catch (e) {
        console.error("Failed to load model config:", e);
      }
    };
    loadProviders();
    loadCurrentModel();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
      if (kbSelectorRef.current && !kbSelectorRef.current.contains(e.target as Node)) {
        setShowKbSelector(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!currentProvider) {
      return;
    }
    (async () => {
      try {
        const list = await invoke<{ id: string; ownedBy?: string }[]>("list_models", {
          providerValue: currentProvider,
        });
        setModelList(list);
      } catch (e) {
        console.error("Failed to load model list:", e);
        setModelList([]);
      }
    })();
  }, [currentProvider]);

  const processFiles = async (fileList: FileList): Promise<AttachedFile[]> => {
    const result: AttachedFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      try {
        const buffer = await f.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        const tempPath = await invoke<string>("save_temp_file", {
          fileName: f.name,
          fileBytes: bytes,
        });
        result.push({ name: f.name, path: tempPath });
      } catch (e) {
        console.error("Failed to save temp file:", f.name, e);
      }
    }
    return result;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = await processFiles(files);
    if (newFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    const newFiles = await processFiles(files);
    if (newFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleSend = () => {
    if (!input.trim() && attachedFiles.length === 0) return;

    const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
    const firstImage = attachedFiles.find((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext && imageExtensions.includes(ext);
    });
    const imagePath = firstImage?.path;

    const filesJson = attachedFiles.length > 0 ? JSON.stringify(attachedFiles) : undefined;
    const shouldKbRetrieve = !kbGlobalAutoRetrieve && pendingKbIds.length > 0;
    onSend({
      content: input.trim(),
      filesJson,
      model: currentModel || undefined,
      provider: currentProvider || undefined,
      imagePath,
      forceKbRetrieve: shouldKbRetrieve,
      kbIds: shouldKbRetrieve ? pendingKbIds : undefined,
    });
    setAttachedFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const timeSinceComposition = performance.now() - lastCompositionEndRef.current;
      if (timeSinceComposition < 100) {
        return;
      }
      if (e.nativeEvent.isComposing || isComposingRef.current) {
        isComposingRef.current = false;
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  const handleModelSelect = (modelId: string) => {
    setCurrentModel(modelId);
    setShowModelDropdown(false);
  };

  const handleProviderChange = async (providerValue: string) => {
    setCurrentProvider(providerValue);
    setCurrentModel("");
  };

  return (
    <div
      className={`${styles.chatInputArea} ${isDragging ? styles.chatInputAreaDragging : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className={styles.dragOverlay}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>{t("chat.dropFiles")}</span>
        </div>
      )}
      {attachedFiles.length > 0 && (
        <div className={styles.fileDisplayArea}>
          <div className={styles.fileDisplayList}>
            {attachedFiles.map((f, i) => (
              <div key={i} className={styles.fileDisplayItem}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
                <span className={styles.fileDisplayName}>{f.name}</span>
                <button className={styles.fileDisplayRemove} onClick={() => removeFile(i)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className={styles.chatInputBox}>
        <textarea
          ref={textareaRef}
          className={styles.chatInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            lastCompositionEndRef.current = performance.now();
            queueMicrotask(() => {
              isComposingRef.current = false;
            });
          }}
          placeholder={t("chat.inputPlaceholder")}
          rows={1}
          disabled={isStreaming}
        />
        <div className={styles.chatInputToolbar}>
          <div className={styles.toolbarLeft}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
            <button
              className={styles.toolbarBtn}
              onClick={() => fileInputRef.current?.click()}
              title="上传附件"
              disabled={isStreaming}
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
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button
              className={`${styles.toolbarBtn} ${styles.kbRetrieveBtn}`}
              onClick={() => setShowKbSelector(!showKbSelector)}
              title={t("chat.kbRetrieve")}
              disabled={isStreaming || kbGlobalAutoRetrieve}
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
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <line x1="9" y1="7" x2="16" y2="7" />
                <line x1="9" y1="11" x2="14" y2="11" />
              </svg>
              {pendingKbIds.length > 0 ? (
                <span className={styles.kbSelectorCount}>{pendingKbIds.length}</span>
              ) : null}
            </button>
            {showKbSelector && !kbGlobalAutoRetrieve && (
              <div
                className={styles.kbSelectorDropdown}
                ref={kbSelectorRef}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className={styles.kbSelectorHeader}>{t("chat.kbSelect")}</div>
                {kbList.filter((kb) => kb.status === "ready").length === 0 ? (
                  <div className={styles.kbSelectorEmpty}>{t("kb.empty")}</div>
                ) : (
                  kbList
                    .filter((kb) => kb.status === "ready")
                    .map((kb) => {
                      const isSelected = pendingKbIds.includes(kb.id);
                      return (
                        <div
                          key={kb.id}
                          className={`${styles.kbSelectorItem} ${isSelected ? styles.kbSelectorItemSelected : ""}`}
                          onClick={() => {
                            setPendingKbIds((prev) =>
                              isSelected ? prev.filter((id) => id !== kb.id) : [...prev, kb.id]
                            );
                          }}
                        >
                          <span className={styles.kbSelectorCheck}>{isSelected ? "✓" : ""}</span>
                          <span className={styles.kbSelectorIcon}>{kb.icon || "📚"}</span>
                          <span className={styles.kbSelectorName}>{kb.name}</span>
                        </div>
                      );
                    })
                )}
              </div>
            )}
            {voiceEnabled && (
              <button
                className={`${styles.toolbarBtn} ${styles.micBtn} ${voiceState === "recording" ? styles.micBtnActive : ""} ${voiceState === "mic-error" ? styles.micBtnError : ""}`}
                title={
                  voiceState === "checking"
                    ? "..."
                    : voiceState === "transcribing"
                      ? t("chat.voiceTranscribing") || "Sending..."
                      : voiceState === "installing"
                        ? progressText || t("chat.voiceInstalling") || "Installing..."
                        : voiceState === "install-error"
                          ? (installError || t("chat.voiceInstallHint") || "Click to retry")
                          : voiceState === "not-installed"
                            ? t("chat.voiceInstallHint") || "Click to install voice recognition"
                            : voiceState === "mic-error"
                              ? micError || "Microphone error - click to retry"
                              : voiceState === "recording"
                                ? t("chat.voiceStop")
                                : t("chat.voiceStart")
                }
                disabled={isStreaming || voiceState === "checking" || voiceState === "transcribing" || voiceState === "installing"}
                onClick={voiceState === "not-installed" || voiceState === "install-error" ? installStt : toggleRecording}
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
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            )}
            {voiceEnabled && progressText && (voiceState === "installing" || voiceState === "transcribing") && (
              <span style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>
                {progressText}
              </span>
            )}
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.modelSelector} ref={modelDropdownRef}>
              <button
                className={`${styles.toolbarBtn} ${styles.modelBtn}`}
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                title="切换模型"
                disabled={isStreaming}
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
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
                <span className={styles.modelBtnText}>{currentModel || "模型"}</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showModelDropdown && (
                <div className={styles.modelDropdown}>
                  <div className={styles.modelDropdownProvider}>
                    <select
                      value={currentProvider}
                      onChange={(e) => handleProviderChange(e.target.value)}
                    >
                      <option value="">选择供应商</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.value}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.modelDropdownList}>
                    {modelList.length > 0 ? (
                      modelList.map((m) => (
                        <button
                          key={m.id}
                          className={`${styles.modelDropdownItem} ${m.id === currentModel ? styles.modelDropdownItemActive : ""}`}
                          onClick={() => handleModelSelect(m.id)}
                        >
                          {m.id}
                          {m.ownedBy && <span className={styles.modelOwnedBy}>{m.ownedBy}</span>}
                        </button>
                      ))
                    ) : (
                      <div className={styles.modelDropdownEmpty}>请先选择供应商</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={isStreaming || (!input.trim() && attachedFiles.length === 0)}
            >
              {isStreaming ? (
                "..."
              ) : (
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
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
