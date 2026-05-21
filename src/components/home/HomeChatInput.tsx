import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
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
} from "lucide-react";

interface HomeChatInputProps {
  sendMessage: (
    cardPrompt: string,
    userText: string,
    homeFiles?: AttachedFile[],
    kbIds?: string[],
    voiceInfo?: { audioPath: string; audioDuration: number }
  ) => Promise<void>;
  isStreaming: boolean;
  placeholder: string;
  voiceEnabled: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

function HomeChatInput({
  sendMessage,
  isStreaming,
  placeholder,
  voiceEnabled,
  t,
}: HomeChatInputProps) {
  const [homeInput, setHomeInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { voiceState, installError, progressText, micError, toggleRecording, installStt } =
    useVoiceInput({
      onResult: () => {},
      onFinalResult: (text, audioPath, audioDuration) => {
        if (audioPath) {
          sendMessage("", text.trim(), undefined, undefined, {
            audioPath,
            audioDuration: audioDuration ?? 0,
          });
        } else {
          setHomeInput(text);
        }
      },
    });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const lastCompositionEndRef = useRef(0);
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

  const getVoiceTooltip = () => {
    switch (voiceState) {
      case "checking":
        return "...";
      case "transcribing":
        return t("chat.voiceTranscribing") || "Transcribing...";
      case "installing":
        return progressText || t("chat.voiceInstalling") || "Installing...";
      case "install-error":
        return installError || t("chat.voiceInstallHint") || "Click to retry";
      case "not-installed":
        return t("chat.voiceInstallHint") || "Click to install voice recognition";
      case "mic-error":
        return micError || "Microphone error - click to retry";
      case "recording":
        return t("chat.voiceStop");
      default:
        return t("chat.voiceStart");
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
    isStreaming ||
    voiceState === "checking" ||
    voiceState === "transcribing" ||
    voiceState === "installing";

  return (
    <div
      className={`w-full max-w-3xl mx-auto relative ${isDragging ? "ring-2 ring-primary ring-offset-2 rounded-xl" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 rounded-xl border-2 border-dashed border-primary">
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
              <span className="max-w-[120px] truncate">{f.name}</span>
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

      <div className="relative rounded-xl border bg-card shadow-sm">
        <Textarea
          ref={textareaRef}
          value={homeInput}
          onChange={(e) => setHomeInput(e.target.value)}
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
          placeholder={placeholder}
          rows={1}
          disabled={isStreaming}
          className="min-h-[96px] resize-none border-0 bg-transparent px-4 py-3 pr-24 pb-14 focus-visible:ring-0 focus-visible:ring-offset-0"
        />

        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
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
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              title="上传附件"
              disabled={isStreaming}
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 text-muted-foreground hover:text-foreground ${pendingKbIds.length > 0 ? "text-primary" : ""}`}
                onClick={() => setShowKbSelector(!showKbSelector)}
                title={t("chat.kbRetrieve")}
                disabled={isStreaming || kbGlobalAutoRetrieve}
              >
                <BookOpen className="h-4 w-4" />
                {pendingKbIds.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
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
                  <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">
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
                            <span className="text-xs w-4">
                              {isSelected ? "✓" : ""}
                            </span>
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
                  className={`h-8 w-8 text-muted-foreground hover:text-foreground ${voiceState === "recording" ? "text-red-500" : ""} ${voiceState === "mic-error" || voiceState === "install-error" ? "text-red-500" : ""}`}
                  title={getVoiceTooltip()}
                  disabled={isVoiceDisabled}
                  onClick={
                    voiceState === "not-installed" || voiceState === "install-error"
                      ? installStt
                      : toggleRecording
                  }
                >
                  {getVoiceIcon()}
                </Button>
                {voiceEnabled &&
                  progressText &&
                  (voiceState === "installing" || voiceState === "transcribing") && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {progressText}
                    </span>
                  )}
              </>
            )}
          </div>

          <Button
            size="sm"
            variant="default"
            className="h-8 px-3 !bg-primary !text-primary-foreground hover:!bg-primary/90 hover:!scale-105 active:!scale-95 transition-all duration-200 ease-out"
            onClick={handleSend}
            disabled={isStreaming || (!homeInput.trim() && attachedFiles.length === 0)}
          >
            <Send className="h-3.5 w-3.5 mr-1" />
            {t("chat.send") || "发送"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default HomeChatInput;
