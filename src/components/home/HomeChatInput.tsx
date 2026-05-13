import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AttachedFile } from "@core/types";
import homeStyles from "@pages/home/HomePanel.module.css";
import inputStyles from "@components/chat/MessageInput.module.css";

interface HomeChatInputProps {
  sendMessage: (
    cardPrompt: string,
    userText: string,
    homeFiles?: AttachedFile[],
    kbIds?: string[]
  ) => Promise<void>;
  isStreaming: boolean;
  placeholder: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}

function HomeChatInput({ sendMessage, isStreaming, placeholder, t }: HomeChatInputProps) {
  const [homeInput, setHomeInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showKbSelector, setShowKbSelector] = useState(false);
  const [kbGlobalAutoRetrieve, setKbGlobalAutoRetrieve] = useState(false);
  const [kbList, setKbList] = useState<
    { id: string; name: string; icon: string; status: string }[]
  >([]);
  const [pendingKbIds, setPendingKbIds] = useState<string[]>([]);
  const kbSelectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await invoke<Record<string, unknown>>("get_knowledge_config");
        setKbGlobalAutoRetrieve(!!cfg.globalAutoRetrieve);
      } catch {
        /* ignore */
      }
      try {
        const kbs =
          await invoke<{ id: string; name: string; icon: string; status: string }[]>(
            "list_knowledge_bases"
          );
        setKbList(kbs);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (kbSelectorRef.current && !kbSelectorRef.current.contains(e.target as Node)) {
        setShowKbSelector(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    if (newFiles.length > 0) setAttachedFiles((prev) => [...prev, ...newFiles]);
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
    if (newFiles.length > 0) setAttachedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleSend = () => {
    if ((!homeInput.trim() && attachedFiles.length === 0) || isStreaming) return;
    const shouldKbRetrieve = !kbGlobalAutoRetrieve && pendingKbIds.length > 0;
    sendMessage(
      "",
      homeInput.trim(),
      attachedFiles.length > 0 ? attachedFiles : undefined,
      shouldKbRetrieve ? pendingKbIds : undefined
    );
    setHomeInput("");
    setAttachedFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={`${homeStyles.homeInputArea} ${isDragging ? homeStyles.homeInputAreaDragging : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className={inputStyles.dragOverlay}>
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
        <div className={inputStyles.fileDisplayArea}>
          <div className={inputStyles.fileDisplayList}>
            {attachedFiles.map((f, i) => (
              <div key={i} className={inputStyles.fileDisplayItem}>
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
                <span className={inputStyles.fileDisplayName}>{f.name}</span>
                <button className={inputStyles.fileDisplayRemove} onClick={() => removeFile(i)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className={`${inputStyles.chatInputBox} ${homeStyles.homeInputBox}`}>
        <textarea
          ref={textareaRef}
          className={inputStyles.chatInput}
          value={homeInput}
          onChange={(e) => setHomeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          placeholder={placeholder}
          rows={1}
          disabled={isStreaming}
        />
        <div className={inputStyles.chatInputToolbar}>
          <div className={inputStyles.toolbarLeft}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
            <button
              className={inputStyles.toolbarBtn}
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
              className={`${inputStyles.toolbarBtn} ${inputStyles.kbRetrieveBtn}`}
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
                <span className={inputStyles.kbSelectorCount}>{pendingKbIds.length}</span>
              ) : null}
            </button>
            {showKbSelector && !kbGlobalAutoRetrieve && (
              <div
                className={inputStyles.kbSelectorDropdown}
                ref={kbSelectorRef}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className={inputStyles.kbSelectorHeader}>{t("chat.kbSelect")}</div>
                {kbList.filter((kb) => kb.status === "ready").length === 0 ? (
                  <div className={inputStyles.kbSelectorEmpty}>{t("kb.empty")}</div>
                ) : (
                  kbList
                    .filter((kb) => kb.status === "ready")
                    .map((kb) => {
                      const isSelected = pendingKbIds.includes(kb.id);
                      return (
                        <div
                          key={kb.id}
                          className={`${inputStyles.kbSelectorItem} ${isSelected ? inputStyles.kbSelectorItemSelected : ""}`}
                          onClick={() => {
                            setPendingKbIds((prev) =>
                              isSelected ? prev.filter((id) => id !== kb.id) : [...prev, kb.id]
                            );
                          }}
                        >
                          <span className={inputStyles.kbSelectorCheck}>
                            {isSelected ? "✓" : ""}
                          </span>
                          <span className={inputStyles.kbSelectorIcon}>{kb.icon || "📚"}</span>
                          <span className={inputStyles.kbSelectorName}>{kb.name}</span>
                        </div>
                      );
                    })
                )}
              </div>
            )}
            <button
              className={`${inputStyles.toolbarBtn} ${inputStyles.micBtn}`}
              title="语音输入（即将推出）"
              disabled
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
          </div>
          <div className={inputStyles.toolbarRight}>
            <button
              className={inputStyles.sendBtn}
              onClick={handleSend}
              disabled={isStreaming || (!homeInput.trim() && attachedFiles.length === 0)}
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
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomeChatInput;
