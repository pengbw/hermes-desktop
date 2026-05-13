import { memo } from "react";
import MarkdownRenderer from "@components/MarkdownRenderer";
import { useI18n } from "@contexts/I18nContext";
import type { Message, AttachedFile, KnowledgeSource } from "@core/types";
import styles from "./MessageBubble.module.css";

interface MessageBubbleProps {
  message: Message;
}

function parseMessageFiles(filesStr?: string): AttachedFile[] {
  if (!filesStr) return [];
  try {
    return JSON.parse(filesStr);
  } catch {
    return [];
  }
}

function MessageBubbleInner({ message }: MessageBubbleProps) {
  const { t } = useI18n();
  const msgFiles = parseMessageFiles(message.files);

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
    </div>
  );
}

const MessageBubble = memo(MessageBubbleInner);

export default MessageBubble;
