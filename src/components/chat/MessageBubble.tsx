import { memo, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import MarkdownRenderer from "@components/MarkdownRenderer";
import AudioPlayer from "@components/chat/AudioPlayer";
import { useI18n } from "@contexts/I18nContext";
import type { Message, AttachedFile, KnowledgeSource } from "@core/types";
import styles from "./MessageBubble.module.css";

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
  // 跟踪 TTS 播放的 ObjectURL，确保停止或组件卸载时释放
  const ttsObjectUrlRef = useRef<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const isVoiceMessage = message.messageType === "voice";
  console.log("[MessageBubble]", message.id, message.role, "type:", message.messageType, "voice:", isVoiceMessage, "audio:", message.audioPath);

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
        // base64 → Blob → ObjectURL，比 data: URI 更稳定
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
        // play() 返回 Promise，浏览器自动播放策略可能拒绝
        audio.play().catch(() => {
          setTtsPlaying(false);
          setTtsPaused(false);
          releaseTtsUrl();
        });
        setTtsPlaying(true);
        setTtsPaused(false);
      } else {
        console.warn("TTS failed:", result.error);
      }
    } catch (err) {
      console.warn("TTS error:", err);
    } finally {
      setTtsLoading(false);
    }
  }, [message.content, ttsPlaying, ttsPaused]);

  const releaseTtsUrl = useCallback(() => {
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
  }, []);

  const handleTtsStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    releaseTtsUrl();
    setTtsPlaying(false);
    setTtsPaused(false);
  }, [releaseTtsUrl]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (isVoiceMessage && message.content) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  }, [isVoiceMessage, message.content]);

  const handleTranscriptClick = useCallback(() => {
    setShowTranscript(true);
    setContextMenu(null);
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <div
      className={`${styles.messageRow} ${message.role === "user" ? styles.messageRowUser : styles.messageRowAssistant}`}
    >
      <div className={styles.messageAvatar}>
        {message.role === "user" ? (
          "👤"
        ) : (
          <img src="/bot.svg" alt="bot" className={styles.messageAvatarImg} />
        )}
      </div>
      {isVoiceMessage ? (
        <div
          className={styles.voiceMessageOnly}
          onContextMenu={handleContextMenu}
        >
          <AudioPlayer
            audioPath={message.audioPath}
            audioDuration={message.audioDuration}
            isUser={message.role === "user"}
          />
          {showTranscript && message.content && (
            <div className={styles.voiceTranscriptText}>
              {message.role === "assistant" ? (
                <MarkdownRenderer content={message.content} />
              ) : (
                message.content
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`${styles.messageBubble} ${message.role === "user" ? styles.messageBubbleUser : styles.messageBubbleAssistant}`}
        >
        {message.thinking && (
          <div className={styles.thinkingBlock}>
            <span className={`${styles.thinkingLabel} ${styles.thinkingLabelDone}`}>
              {t("chat.thinkingProcess")}
            </span>
            <pre className={styles.thinkingContent}>{message.thinking}</pre>
          </div>
        )}
        {msgFiles.length > 0 && (
          <div className={styles.messageFiles}>
            {msgFiles.map((f, i) => (
              <div
                key={i}
                className={`${styles.messageFileItem} ${message.role === "user" ? styles.messageFileItemUser : styles.messageFileItemAssistant}`}
              >
                <svg
                  width="12"
                  height="12"
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
                <span className={styles.messageFileName}>{f.name}</span>
              </div>
            ))}
          </div>
        )}
        {message.content ? (
          <div className={styles.messageText}>
            {message.role === "assistant" ? (
              <MarkdownRenderer content={message.content} />
            ) : (
              message.content
            )}
          </div>
        ) : (
          message.role === "assistant" && <div className={styles.messageEmpty}>未收到回复</div>
        )}
        {message.role === "assistant" && message.content && ttsEnabled && (
          <div className={styles.messageActions}>
            <button
              className={`${styles.actionBtn} ${(ttsPlaying || ttsPaused) ? styles.actionBtnActive : ""}`}
              onClick={handleTts}
              disabled={ttsLoading}
              title={ttsPaused ? t("chat.ttsResume") : ttsPlaying ? t("chat.ttsPause") : t("chat.ttsPlay")}
            >
              {ttsLoading ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" strokeDasharray="30 30" strokeDashoffset="0">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                  </circle>
                </svg>
              ) : ttsPlaying ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : ttsPaused ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6 3 20 12 6 21" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>
            {(ttsPlaying || ttsPaused) && (
              <button
                className={styles.actionBtn}
                onClick={handleTtsStop}
                title={t("chat.ttsStop")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            )}
          </div>
        )}
        {message.knowledgeSources && message.knowledgeSources.length > 0 && (
          <div className={styles.knowledgeSources}>
            <div className={styles.knowledgeSourcesHeader}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span>{t("chat.knowledgeSources")}</span>
            </div>
            {message.knowledgeSources.map((src: KnowledgeSource, idx: number) => (
              <div key={idx} className={styles.knowledgeSourceItem}>
                <div className={styles.knowledgeSourceMeta}>
                  {src.kb_name && <span className={styles.knowledgeSourceKb}>{src.kb_name}</span>}
                  {src.file_name && (
                    <span className={styles.knowledgeSourceFile}>{src.file_name}</span>
                  )}
                  {src.score != null && (
                    <span className={styles.knowledgeSourceScore}>
                      {(src.score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className={styles.knowledgeSourcePreview}>
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
        <div className={styles.contextMenuOverlay} onClick={handleCloseContextMenu}>
          <div
            className={styles.contextMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button className={styles.contextMenuItem} onClick={handleTranscriptClick}>
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
