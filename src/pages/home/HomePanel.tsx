import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { QuickCard, HermesConfigData } from "@core/types";
import { BUILTIN_CARDS } from "@constants/builtinCards";
import { CARDS_STORAGE_KEY } from "@constants/config";
import HermesStatus from "@components/home/HermesStatus";
import QuickActions from "@components/home/QuickActions";
import HomeChatInput from "@components/home/HomeChatInput";
import styles from "./HomePanel.module.css";

function loadCustomCards(): QuickCard[] {
  try {
    const stored = localStorage.getItem(CARDS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

interface HomePanelProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  sendMessage: (
    cardPrompt: string,
    userText: string,
    homeFiles?: import("@core/types").AttachedFile[],
    kbIds?: string[],
    voiceInfo?: { audioPath: string; audioDuration: number }
  ) => Promise<void>;
  isStreaming: boolean;
}

function HomePanel({ t, sendMessage, isStreaming }: HomePanelProps) {
  const [cardIndex, setCardIndex] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const customCards = loadCustomCards();
  const allCards = [...BUILTIN_CARDS, ...customCards];
  const cardsPerRow = 4;

  useEffect(() => {
    invoke<HermesConfigData>("get_hermes_config")
      .then((cfg) => setVoiceEnabled(cfg.voice_enabled))
      .catch(() => {});
  }, []);

  const handleCardClick = (card: QuickCard) => {
    sendMessage(card.prompt, "");
  };

  const handleRefresh = () => {
    const maxIndex = Math.floor((allCards.length - 1) / cardsPerRow);
    if (maxIndex <= 0) return;
    let next = cardIndex + 1;
    if (next > maxIndex) next = 0;
    setCardIndex(next);
  };

  return (
    <div className={styles.homePanel}>
      <HermesStatus t={t} />
      <QuickActions
        cards={allCards}
        cardIndex={cardIndex}
        cardsPerRow={cardsPerRow}
        onCardClick={handleCardClick}
        onRefresh={handleRefresh}
        isStreaming={isStreaming}
        t={t}
      />
      <HomeChatInput
        sendMessage={sendMessage}
        isStreaming={isStreaming}
        placeholder={t("home.cardInputPlaceholder")}
        voiceEnabled={voiceEnabled}
        t={t}
      />
    </div>
  );
}

export default HomePanel;
