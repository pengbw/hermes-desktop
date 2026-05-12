import { useState } from "react";
import type { QuickCard } from "@core/types";
import { BUILTIN_CARDS } from "@constants/builtinCards";
import { CARDS_STORAGE_KEY } from "@constants/config";
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
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", icon: "📌", prompt: "" });

  const handleSave = () => {
    if (!form.name.trim() || !form.prompt.trim()) return;
    const newCards = cards.slice();
    if (editId) {
      const idx = newCards.findIndex((c) => c.id === editId);
      if (idx >= 0) {
        newCards[idx] = { ...newCards[idx], name: form.name, icon: form.icon, prompt: form.prompt };
      }
    } else {
      newCards.push({
        id: `custom_${Date.now()}`,
        name: form.name,
        icon: form.icon,
        prompt: form.prompt,
        source: "custom",
      });
    }
    setCards(newCards);
    saveCustomCards(newCards);
    setShowForm(false);
    setEditId(null);
    setForm({ name: "", icon: "📌", prompt: "" });
  };

  const handleDelete = (id: string) => {
    const newCards = cards.filter((c) => c.id !== id);
    setCards(newCards);
    saveCustomCards(newCards);
  };

  const handleEdit = (card: QuickCard) => {
    setEditId(card.id);
    setForm({ name: card.name, icon: card.icon, prompt: card.prompt });
    setShowForm(true);
  };

  return (
    <div className={styles.settingsSectionCard}>
      <div className={styles.settingsSection}>
        <div className={styles.cardManagerHeader}>
          <h3>{t("card.title")}</h3>
          <button
            className={styles.cardAddBtn}
            onClick={() => {
              setEditId(null);
              setForm({ name: "", icon: "📌", prompt: "" });
              setShowForm(true);
            }}
          >
            {t("card.add")}
          </button>
        </div>

        {showForm && (
          <div className="card-form">
            <div className={styles.cardFormRow}>
              <label>{t("card.name")}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("card.nameHolder")}
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
                rows={3}
              />
            </div>
            <div className={styles.cardFormActions}>
              <button className={styles.cardFormBtn + " " + styles.save} onClick={handleSave}>
                {t("card.save")}
              </button>
              <button
                className={styles.cardFormBtn + " " + styles.cancel}
                onClick={() => {
                  setShowForm(false);
                  setEditId(null);
                }}
              >
                {t("modal.cancel")}
              </button>
            </div>
          </div>
        )}

        <div className={styles.cardManagerBuiltin}>
          <h4>{t("card.builtin")}</h4>
          <div className={styles.cardManagerGrid}>
            {BUILTIN_CARDS.map((card) => (
              <div key={card.id} className={styles.cardManagerItem + " " + styles.builtin}>
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
                <div key={card.id} className={styles.cardManagerItem + " " + styles.custom}>
                  <span className={styles.cardManagerIcon}>{card.icon}</span>
                  <span className={styles.cardManagerName}>{card.name}</span>
                  <span className={styles.cardManagerDesc}>{card.prompt.slice(0, 50)}...</span>
                  <div className={styles.cardManagerActions}>
                    <button onClick={() => handleEdit(card)}>✏️</button>
                    <button onClick={() => handleDelete(card.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CardManagerPanel;
