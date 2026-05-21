import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { QuickCard } from "@core/types";

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
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {visibleCards.map((card, i) => (
          <Card
            key={`${card.id}-${i}`}
            className={`cursor-pointer transition-all duration-200 hover:border-primary hover:shadow-md hover:-translate-y-0.5 ${
              isStreaming ? "opacity-50 pointer-events-none" : ""
            }`}
            onClick={() => {
              if (!isStreaming) onCardClick(card);
            }}
          >
            <CardContent className="flex flex-col items-center text-center gap-2 p-4">
              <span className="text-2xl leading-none">{card.icon}</span>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">
                  {t(`home.card.${card.id}`) || card.name}
                </span>
                <span className="text-xs text-muted-foreground line-clamp-2">
                  {t(`home.card.${card.id}Desc`) || card.prompt.slice(0, 30)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {cards.length > cardsPerRow && (
        <Button
          variant="ghost"
          size="sm"
          className="self-end text-muted-foreground hover:text-primary"
          onClick={onRefresh}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          {t("home.cardRefresh")}
        </Button>
      )}
    </div>
  );
}

export default QuickActions;
