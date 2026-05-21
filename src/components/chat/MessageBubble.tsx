import { memo, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import MarkdownRenderer from "@components/MarkdownRenderer";
import AudioPlayer from "@components/chat/AudioPlayer";
import { useI18n } from "@contexts/I18nContext";
import type { Message, AttachedFile, KnowledgeSource } from "@core/types";
import { FileText, BookOpen, Volume2, VolumeX, Pause, Play, Square, Loader2 } from "lucide-react";

interface MessageBubbleProps {
  message: Message;
  ttsEnabled?: boolean;
}

function parseMessageFiles(filesStr?: string): AttachedFile[] {
  if (!filesStr) return [];
  try {
    return JSON.parse(filesStr);
  } catch {
    return [];
  }
}

function stripMarkdown(md: string): string {
  let text = md;
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/__(.+?)__/g, "$1");
  text = text.replace(/\*(.+?)\*/g, "$1");
  text = text.replace(/_(.+?)_/g, "$1");
  text = text.replace(/~~(.+?)~~/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  text = text.replace(/^[-*+]\s+/gm, "");
  text = text.replace(/^\d+\.\s+/gm, "");
  text = text.replace(/^>\s?/gm, "");
  text = text.replace(/^---+$/gm, "");
  text = text.replace(/\|/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function MessageBubbleInner({ message, ttsEnabled = false }: MessageBubbleProps) {
  const { t } = useI18n();
  const msgFiles = parseMessageFiles(message.files);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const isVoiceMessage = message.messageType === "voice";

  const releaseTtsUrl = () => {
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
  };

  const handleTts = useCallback(async () => {
    if (ttsPaused && audioRef.current) {
      audioRef.current.play();
      setTtsPaused(false);
      setTtsPlaying(true);
      return;
    }

    if (ttsPlaying && audioRef.current) {
      audioRef.current.pause();
      setTtsPaused(true);
      setTtsPlaying(false);
      return;
    }

    if (!message.content?.trim()) return;

    setTtsLoading(true);
    try {
      const result = await invoke<{
        success: boolean;
        audioData: string;
        error: string | null;
      }>("text_to_speech", {
        req: { text: stripMarkdown(message.content), voice: null },
      });

      if (result.success && result.audioData) {
        const binaryStr = atob(result.audioData);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "audio/mp3" });
        const url = URL.createObjectURL(blob);
        ttsObjectUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setTtsPlaying(false);
          setTtsPaused(false);
          releaseTtsUrl();
        };
        audio.onerror = () => {
          setTtsPlaying(false);
          setTtsPaused(false);
          releaseTtsUrl();
        };
        audio.play().catch(() => {
          setTtsPlaying(false);
          setTtsPaused(false);
          releaseTtsUrl();
        });
        setTtsPlaying(true);
        setTtsPaused(false);
      }
    } catch {
      // ignore
    } finally {
      setTtsLoading(false);
    }
  }, [message.content, ttsPlaying, ttsPaused]);

  const handleTtsStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    releaseTtsUrl();
    setTtsPlaying(false);
    setTtsPaused(false);
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isVoiceMessage && message.content) {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }
    },
    [isVoiceMessage, message.content]
  );

  const handleTranscriptClick = useCallback(() => {
    setShowTranscript(true);
    setContextMenu(null);
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-2.5 items-start ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 overflow-hidden bg-muted">
        {isUser ? (
          "👤"
        ) : (
          <img src="/bot.svg" alt="bot" className="w-full h-full object-cover" />
        )}
      </div>

      {isVoiceMessage ? (
        <div className="flex flex-col max-w-[260px]" onContextMenu={handleContextMenu}>
          <AudioPlayer
            audioPath={message.audioPath}
            audioDuration={message.audioDuration}
            isUser={isUser}
          />
          {showTranscript && message.content && (
            <div className={`mt-1.5 text-xs opacity-75 leading-relaxed break-words pt-1.5 border-t ${isUser ? "border-white/15" : "border-black/5"}`}>
              {isUser ? message.content : <MarkdownRenderer content={message.content} />}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`max-w-[70%] px-3 py-2 rounded-xl text-[13px] leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm"
          }`}
        >
          {message.thinking && (
            <div className="max-w-[70%] px-4 py-3 rounded-xl border relative overflow-hidden mb-2 bg-gradient-to-br from-blue-50 to-purple-50 border-primary/10 dark:from-blue-950/30 dark:to-purple-950/30">
              <div className="absolute top-0 left-0 w-[3px] h-full bg-gradient-to-b from-sky-400 to-purple-500 rounded-full" />
              <span className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5 font-medium tracking-wide">
                {t("chat.thinkingProcess")}
              </span>
              <pre className="font-mono text-xs text-muted-foreground m-0 whitespace-pre-wrap break-words leading-relaxed max-h-[120px] overflow-y-auto">
                {message.thinking}
              </pre>
            </div>
          )}

          {msgFiles.length > 0 && (
            <div className="flex flex-col gap-1 mb-2">
              {msgFiles.map((f, i) => (
                <div
                  key={i}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs ${
                    isUser
                      ? "bg-white/15 text-white/90"
                      : "bg-background text-primary"
                  }`}
                >
                  <FileText className="h-3 w-3" />
                  <span className="truncate max-w-[200px]">{f.name}</span>
                </div>
              ))}
            </div>
          )}

          {message.content ? (
            <div className="break-words leading-relaxed select-text">
              {isUser ? message.content : <MarkdownRenderer content={message.content} />}
            </div>
          ) : (
            isUser && <div className="text-muted-foreground text-sm italic">未收到回复</div>
          )}

          {!isUser && message.content && ttsEnabled && (
            <div className="flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className={`flex items-center justify-center w-7 h-7 rounded-md border-0 bg-transparent transition-colors ${
                  ttsPlaying || ttsPaused
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                }`}
                onClick={handleTts}
                disabled={ttsLoading}
                title={
                  ttsPaused
                    ? t("chat.ttsResume")
                    : ttsPlaying
                      ? t("chat.ttsPause")
                      : t("chat.ttsPlay")
                }
              >
                {ttsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : ttsPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : ttsPaused ? (
                  <Play className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
              {(ttsPlaying || ttsPaused) && (
                <button
                  className="flex items-center justify-center w-7 h-7 rounded-md border-0 bg-transparent text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  onClick={handleTtsStop}
                  title={t("chat.ttsStop")}
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {message.knowledgeSources && message.knowledgeSources.length > 0 && (
            <div className="mt-2 border-t border-black/5 dark:border-white/5 pt-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
                <BookOpen className="h-3 w-3" />
                <span>{t("chat.knowledgeSources")}</span>
              </div>
              {message.knowledgeSources.map((src: KnowledgeSource, idx: number) => (
                <div
                  key={idx}
                  className="px-2 py-1.5 rounded-md bg-primary/5 border border-primary/10 mb-1 transition-colors hover:bg-primary/10"
                >
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    {src.kb_name && (
                      <span className="text-xs px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-medium">
                        {src.kb_name}
                      </span>
                    )}
                    {src.file_name && (
                      <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {src.file_name}
                      </span>
                    )}
                    {src.score != null && (
                      <span className="text-xs text-green-500 font-medium ml-auto">
                        {(src.score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {src.content.slice(0, 120)}
                    {src.content.length > 120 ? "..." : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {contextMenu && (
        <div className="fixed inset-0 z-[9999]" onClick={handleCloseContextMenu}>
          <div
            className="fixed bg-popover border rounded-md py-1 min-w-[120px] shadow-lg z-[10000]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="block w-full px-3.5 py-1.5 border-0 bg-none text-sm text-left cursor-pointer transition-colors hover:bg-primary/10 hover:text-primary"
              onClick={handleTranscriptClick}
            >
              {t("chat.voiceToText")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const MessageBubble = memo(MessageBubbleInner);

export default MessageBubble;
