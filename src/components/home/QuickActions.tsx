import type { QuickCard } from "@core/types";
import styles from "@pages/home/HomePanel.module.css";

interface QuickActionsProps {
  cards: QuickCard[];
  cardIndex: number;
  cardsPerRow: number;
  onCardClick: (card: QuickCard) => void;
  onRefresh: () => void;
  isStreaming: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

function QuickActions({
  cards,
  cardIndex,
  cardsPerRow,
  onCardClick,
  onRefresh,
  isStreaming,
  t,
}: QuickActionsProps) {
  const visibleCards = cards.slice(cardIndex * cardsPerRow, (cardIndex + 1) * cardsPerRow);

  return (
    <div className={styles.homeCardsSection}>
      <div className={styles.homeCardsGrid}>
        {visibleCards.map((card, i) => (
          <div
            key={`${card.id}-${i}`}
            className={styles.homeCard}
            onClick={() => {
              if (!isStreaming) onCardClick(card);
            }}
          >
            <span className={styles.homeCardIcon}>{card.icon}</span>
            <div className={styles.homeCardInfo}>
              <span className={styles.homeCardName}>{t(`home.card.${card.id}`) || card.name}</span>
              <span className={styles.homeCardDesc}>
                {t(`home.card.${card.id}Desc`) || card.prompt.slice(0, 30)}
              </span>
            </div>
          </div>
        ))}
      </div>
      {cards.length > cardsPerRow && (
        <button className={styles.homeRefreshBtn} onClick={onRefresh} title={t("home.cardRefresh")}>
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
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span>{t("home.cardRefresh")}</span>
        </button>
      )}
    </div>
  );
}

export default QuickActions;
