import MarkdownRenderer from "@components/MarkdownRenderer";
import styles from "./MessageBubble.module.css";

interface StreamingIndicatorProps {
  isStreaming: boolean;
  isThinking: boolean;
  thinkingContent: string;
  streamedContent: string;
  toolProgress: string;
}

export default function StreamingIndicator({
  isStreaming,
  isThinking,
  thinkingContent,
  streamedContent,
  toolProgress,
}: StreamingIndicatorProps) {
  if (isStreaming && streamedContent) {
    return (
      <div className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
        <div className={styles.messageAvatar}>
          <img src="/bot.svg" alt="bot" className={styles.messageAvatarImg} />
        </div>
        <div className={`${styles.messageBubble} ${styles.messageBubbleAssistant}`}>
          <div className={styles.messageText}>
            <MarkdownRenderer content={streamedContent} />
          </div>
          <span className={styles.streamingCursor}>▊</span>
        </div>
      </div>
    );
  }

  if (isThinking) {
    return (
      <div className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
        <div className={styles.messageAvatar}>
          <img src="/bot.svg" alt="bot" className={styles.messageAvatarImg} />
        </div>
        <div className={styles.thinkingBlock}>
          <span className={styles.thinkingLabel}>
            {toolProgress || "思考中"}
            {!toolProgress && (
              <span className={styles.thinkingDots}>
                <span className={styles.thinkingDot} />
                <span className={styles.thinkingDot} />
                <span className={styles.thinkingDot} />
              </span>
            )}
          </span>
          {thinkingContent && <pre className={styles.thinkingContent}>{thinkingContent}</pre>}
        </div>
      </div>
    );
  }

  return null;
}
