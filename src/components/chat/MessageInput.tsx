import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "@contexts/I18nContext";
import { useVoiceInput } from "@hooks/common";
import type { AttachedFile } from "@core/types";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Send,
  Paperclip,
  BookOpen,
  Mic,
  MicOff,
  Loader2,
  X,
  FileText,
  Upload,
  Cpu,
  ChevronDown,
} from "lucide-react";

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

  const { voiceState, installError, progressText, micError, toggleRecording, installStt } =
    useVoiceInput({
      onResult: () => {},
      onRecordingComplete: (audioPath) => {
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
      } catch {
        /* ignore */
      }
    };
    const loadCurrentModel = async () => {
      try {
        const config = await invoke<{ model: string; provider: string }>("get_hermes_config");
        setCurrentModel(config.model);
        setCurrentProvider(config.provider);
      } catch {
        /* ignore */
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
    if (!currentProvider) return;
    (async () => {
      try {
        const list = await invoke<{ id: string; ownedBy?: string }[]>("list_models", {
          providerValue: currentProvider,
        });
        setModelList(list);
      } catch {
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
      } catch {
        /* ignore */
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
      if (timeSinceComposition < 100) return;
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

  const getVoiceTooltip = () => {
    switch (voiceState) {
      case "checking": return "...";
      case "transcribing": return t("chat.voiceTranscribing") || "Sending...";
      case "installing": return progressText || t("chat.voiceInstalling") || "Installing...";
      case "install-error": return installError || t("chat.voiceInstallHint") || "Click to retry";
      case "not-installed": return t("chat.voiceInstallHint") || "Click to install voice recognition";
      case "mic-error": return micError || "Microphone error - click to retry";
      case "recording": return t("chat.voiceStop");
      default: return t("chat.voiceStart");
    }
  };

  const getVoiceIcon = () => {
    if (voiceState === "recording") return <MicOff className="h-4 w-4 text-red-500" />;
    if (voiceState === "checking" || voiceState === "transcribing" || voiceState === "installing")
      return <Loader2 className="h-4 w-4 animate-spin" />;
    if (voiceState === "install-error" || voiceState === "mic-error")
      return <Mic className="h-4 w-4 text-red-500" />;
    return <Mic className="h-4 w-4" />;
  };

  const isVoiceDisabled =
    isStreaming || voiceState === "checking" || voiceState === "transcribing" || voiceState === "installing";

  return (
    <div
      className={`relative px-4 py-3 bg-card border-t shrink-0 transition-colors ${
        isDragging ? "border-primary bg-primary/5" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-lg m-1">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-8 w-8" />
            <span className="text-sm font-medium">{t("chat.dropFiles")}</span>
          </div>
        </div>
      )}

      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {attachedFiles.map((f, i) => (
            <div
              key={i}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted text-xs text-muted-foreground border"
            >
              <FileText className="h-3 w-3" />
              <span className="max-w-[160px] truncate">{f.name}</span>
              <button
                onClick={() => removeFile(i)}
                className="ml-1 hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative rounded-xl border bg-background shadow-sm">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => {
            lastCompositionEndRef.current = performance.now();
            queueMicrotask(() => { isComposingRef.current = false; });
          }}
          placeholder={t("chat.inputPlaceholder")}
          rows={1}
          disabled={isStreaming}
          className="min-h-[44px] resize-none border-0 bg-transparent px-3 py-2.5 pr-24 focus-visible:ring-0 focus-visible:ring-offset-0"
        />

        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              title="上传附件"
              disabled={isStreaming}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>

            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 text-muted-foreground hover:text-foreground ${pendingKbIds.length > 0 ? "text-primary" : ""}`}
                onClick={() => setShowKbSelector(!showKbSelector)}
                title={t("chat.kbRetrieve")}
                disabled={isStreaming || kbGlobalAutoRetrieve}
              >
                <BookOpen className="h-3.5 w-3.5" />
                {pendingKbIds.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-semibold">
                    {pendingKbIds.length}
                  </span>
                )}
              </Button>

              {showKbSelector && !kbGlobalAutoRetrieve && (
                <div
                  ref={kbSelectorRef}
                  className="absolute bottom-full left-0 mb-2 w-56 rounded-md border bg-popover shadow-md p-2 z-50"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="text-xs font-medium text-muted-foreground px-2 py-1.5 border-b mb-1">
                    {t("chat.kbSelect")}
                  </div>
                  {kbList.filter((kb) => kb.status === "ready").length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                      {t("kb.empty")}
                    </div>
                  ) : (
                    kbList
                      .filter((kb) => kb.status === "ready")
                      .map((kb) => {
                        const isSelected = pendingKbIds.includes(kb.id);
                        return (
                          <div
                            key={kb.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-sm transition-colors ${
                              isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                            }`}
                            onClick={() => {
                              setPendingKbIds((prev) =>
                                isSelected ? prev.filter((id) => id !== kb.id) : [...prev, kb.id]
                              );
                            }}
                          >
                            <span className="text-xs w-4">{isSelected ? "✓" : ""}</span>
                            <span>{kb.icon || "📚"}</span>
                            <span className="truncate">{kb.name}</span>
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>

            {voiceEnabled && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 text-muted-foreground hover:text-foreground ${voiceState === "recording" ? "text-red-500" : ""} ${voiceState === "mic-error" || voiceState === "install-error" ? "text-red-500" : ""}`}
                  title={getVoiceTooltip()}
                  disabled={isVoiceDisabled}
                  onClick={voiceState === "not-installed" || voiceState === "install-error" ? installStt : toggleRecording}
                >
                  {getVoiceIcon()}
                </Button>
                {voiceEnabled && progressText && (voiceState === "installing" || voiceState === "transcribing") && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{progressText}</span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <div className="relative" ref={modelDropdownRef}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                title="切换模型"
                disabled={isStreaming}
              >
                <Cpu className="h-3 w-3" />
                <span className="max-w-[80px] truncate">{currentModel || "模型"}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>

              {showModelDropdown && (
                <div className="absolute bottom-full right-0 mb-2 w-72 rounded-lg border bg-popover shadow-lg p-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="p-2 border-b mb-1">
                    <select
                      value={currentProvider}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      className="w-full h-8 px-2 text-xs rounded-md border bg-background"
                    >
                      <option value="">选择供应商</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.value}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {modelList.length > 0 ? (
                      modelList.map((m) => (
                        <button
                          key={m.id}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-md transition-colors ${
                            m.id === currentModel
                              ? "bg-accent text-accent-foreground font-medium"
                              : "hover:bg-muted text-foreground"
                          }`}
                          onClick={() => handleModelSelect(m.id)}
                        >
                          <span className="truncate">{m.id}</span>
                          {m.ownedBy && (
                            <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{m.ownedBy}</span>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                        请先选择供应商
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Button
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleSend}
              disabled={isStreaming || (!input.trim() && attachedFiles.length === 0)}
            >
              {isStreaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
