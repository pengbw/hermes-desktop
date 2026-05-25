import { useState, useCallback } from "react";
import type { QuickCard } from "@core/types";
import { getBuiltinCards } from "@seeds";
import { CARDS_STORAGE_KEY } from "@constants/config";
import { Badge } from "@/components/ui/badge";
import styles from "./CardManagerPanel.module.css";

function loadCustomCards(): QuickCard[] {
  try {
    const stored = localStorage.getItem(CARDS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCustomCards(cards: QuickCard[]) {
  localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
}

function CardManagerPanel({
  t,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [cards, setCards] = useState<QuickCard[]>(loadCustomCards());
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", icon: "📌", prompt: "" });
  const [viewingCard, setViewingCard] = useState<QuickCard | null>(null);

  const closeView = () => setViewingCard(null);

  const handleSave = useCallback(() => {
    if (!form.name.trim() || !form.prompt.trim()) return;
    const now = Date.now();
    const newCards = cards.slice();
    if (editId) {
      const idx = newCards.findIndex((c) => c.id === editId);
      if (idx >= 0) {
        newCards[idx] = { ...newCards[idx], name: form.name, icon: form.icon, prompt: form.prompt };
      }
    } else {
      newCards.push({
        id: `custom_${now}`,
        name: form.name,
        icon: form.icon,
        prompt: form.prompt,
        source: "custom",
      });
    }
    setCards(newCards);
    saveCustomCards(newCards);
    closeModal();
  }, [form, editId, cards]);

  const handleDelete = (id: string) => {
    const newCards = cards.filter((c) => c.id !== id);
    setCards(newCards);
    saveCustomCards(newCards);
  };

  const handleEdit = (card: QuickCard) => {
    setEditId(card.id);
    setForm({ name: card.name, icon: card.icon, prompt: card.prompt });
    setShowModal(true);
  };

  const openNewCard = () => {
    setEditId(null);
    setForm({ name: "", icon: "📌", prompt: "" });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditId(null);
    setForm({ name: "", icon: "📌", prompt: "" });
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className={styles.cardManagerHeader}>
        <h3>{t("card.title")}</h3>
        <button className={styles.cardAddBtn} onClick={openNewCard}>
          {t("card.add")}
        </button>
      </div>

      <div className={styles.cardManagerBuiltin}>
        <h4>{t("card.builtin")}</h4>
        <div className={styles.cardManagerGrid}>
          {getBuiltinCards().map((card) => (
            <div
              key={card.id}
              className={styles.cardManagerItem + " " + styles.builtin + " cursor-pointer"}
              onClick={() => setViewingCard(card)}
            >
              <span className={styles.cardManagerIcon}>{card.icon}</span>
              <span className={styles.cardManagerName}>{t(`home.card.${card.id}`)}</span>
              <span className={styles.cardManagerDesc}>{t(`home.card.${card.id}Desc`)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.cardManagerCustom}>
        <h4>{t("card.custom")}</h4>
        {cards.length === 0 ? (
          <div className={styles.cardManagerEmpty}>{t("card.empty")}</div>
        ) : (
          <div className={styles.cardManagerGrid}>
            {cards.map((card) => (
              <div
                key={card.id}
                className={styles.cardManagerItem + " " + styles.custom + " cursor-pointer"}
                onClick={() => setViewingCard(card)}
              >
                <span className={styles.cardManagerIcon}>{card.icon}</span>
                <span className={styles.cardManagerName}>{card.name}</span>
                <span className={styles.cardManagerDesc}>{card.prompt.slice(0, 50)}...</span>
                <div className={styles.cardManagerActions} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleEdit(card)}>✏️</button>
                  <button onClick={() => handleDelete(card.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className={styles.cardModalOverlay} onClick={closeModal}>
          <div className={styles.cardModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.cardModalHeader}>
              <h3>{editId ? t("card.edit") : t("card.add")}</h3>
              <button className={styles.cardModalClose} onClick={closeModal}>
                ✕
              </button>
            </div>
            <div className={styles.cardModalBody}>
              <div className={styles.cardFormRow}>
                <label>{t("card.name")}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t("card.nameHolder")}
                  autoFocus
                />
              </div>
              <div className={styles.cardFormRow}>
                <label>{t("card.icon")}</label>
                <input
                  type="text"
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  placeholder={t("card.iconHolder")}
                  maxLength={4}
                />
              </div>
              <div className={styles.cardFormRow}>
                <label>{t("card.prompt")}</label>
                <textarea
                  value={form.prompt}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                  placeholder={t("card.promptHolder")}
                  rows={5}
                />
              </div>
            </div>
            <div className={styles.cardModalFooter}>
              <button className={styles.cardFormBtn + " " + styles.save} onClick={handleSave}>
                {editId ? t("card.saveEdit") : t("card.save")}
              </button>
              <button className={styles.cardFormBtn + " " + styles.cancel} onClick={closeModal}>
                {t("card.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
      {viewingCard && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
          onClick={closeView}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-[480px] max-h-[80vh] flex flex-col shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-base font-semibold text-foreground m-0">{t("card.detail")}</h3>
              <button
                className="border-none bg-transparent text-lg cursor-pointer text-muted-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
                onClick={closeView}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full text-lg shrink-0 bg-muted">
                  {viewingCard.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-foreground">{viewingCard.name}</div>
                </div>
                {viewingCard.source === "builtin" && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-px">
                    {t("card.builtin")}
                  </Badge>
                )}
                {viewingCard.source === "custom" && (
                  <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-px">
                    {t("card.custom")}
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="text-[13px] font-medium text-muted-foreground mb-1.5">
                    {t("card.prompt")}
                  </div>
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {viewingCard.prompt || "-"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CardManagerPanel;
