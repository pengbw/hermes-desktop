import styles from "@pages/knowledge/KnowledgePanel.module.css";
import type { KnowledgeBase } from "@core/types";

interface KnowledgeBaseListProps {
  knowledgeBases: KnowledgeBase[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  indexingKbId: string | null;
  indexProgress: { status: string; current: number; total: number; file: string } | null;
  onSelect: (kb: KnowledgeBase) => void;
  onIndex: (id: string) => void;
  onEdit: (kb: KnowledgeBase) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  statusLabel: (status: string) => string;
  t: (key: string) => string;
}

export default function KnowledgeBaseList({
  knowledgeBases,
  searchQuery,
  onSearchChange,
  page,
  pageSize,
  onPageChange,
  indexingKbId,
  indexProgress,
  onSelect,
  onIndex,
  onEdit,
  onDelete,
  onCreate,
  statusLabel,
  t,
}: KnowledgeBaseListProps) {
  const filtered = knowledgeBases.filter(
    (kb) => !searchQuery || kb.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className={styles.kbListView}>
      <div className={styles.kbListHeader}>
        <div className={styles.kbListHeaderActions}>
          <div className={styles.kbSearchBox}>
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
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t("kb.search")}
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                onPageChange(1);
              }}
            />
          </div>
          <button className="px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium cursor-pointer transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98]" onClick={onCreate}>
            + {t("kb.create")}
          </button>
        </div>
      </div>
      {knowledgeBases.length === 0 ? (
        <div className={styles.kbEmpty}>
          <div className={styles.kbEmptyIcon}>📚</div>
          <p>{t("kb.empty")}</p>
          <button className="px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium cursor-pointer transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98]" onClick={onCreate}>
            + {t("kb.create")}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.kbEmpty}>
          <p>{t("kb.noSearchResult")}</p>
        </div>
      ) : (
        <>
          <div className={styles.kbGrid}>
            {paged.map((kb, index) => (
              <div
                key={kb.id}
                className={styles.kbGridCard}
                style={{ animationDelay: `${index * 0.05}s` }}
                onClick={() => onSelect(kb)}
              >
                <div className={styles.kbGridCardHeader}>
                  <span
                    className={`${styles.kbGridCornerTag} ${styles["kbGridStatus" + kb.status.charAt(0).toUpperCase() + kb.status.slice(1)] || ""}`}
                  >
                    {indexingKbId === kb.id ? "⏳" : statusLabel(kb.status)}
                  </span>
                  <div className={styles.kbGridCardIcon}>{kb.icon}</div>
                  <div className={styles.kbGridCardTitle}>{kb.name}</div>
                </div>
                <div className={styles.kbGridCardBody}>
                  <div className={styles.kbGridMetaRow}>
                    <span className={styles.kbGridMetaLabel}>{t("kb.fileCount")}</span>
                    <span className={styles.kbGridMetaValue}>{kb.fileCount}</span>
                  </div>
                  <div className={styles.kbGridMetaRow}>
                    <span className={styles.kbGridMetaLabel}>{t("kb.chunkCount")}</span>
                    <span className={styles.kbGridMetaValue}>{kb.chunkCount}</span>
                  </div>
                </div>
                <div className={styles.kbGridCardFooter}>
                  <button
                    className={styles.kbGridBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onIndex(kb.id);
                    }}
                    disabled={!!indexingKbId}
                    title={t("kb.reindex")}
                  >
                    🔄 {t("kb.reindex")}
                  </button>
                  <button
                    className={styles.kbGridBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(kb);
                    }}
                    title={t("kb.edit")}
                  >
                    ✏️ {t("kb.edit")}
                  </button>
                  <button
                    className={styles.kbGridBtn + " " + styles.kbGridBtnDanger}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(kb.id);
                    }}
                    title={t("kb.delete")}
                  >
                    🗑️ {t("kb.delete")}
                  </button>
                </div>
                {indexingKbId === kb.id && indexProgress && (
                  <div className={styles.kbGridCardProgress}>
                    <div
                      className={styles.kbGridCardProgressFill}
                      style={{
                        width:
                          indexProgress.total > 0
                            ? `${(indexProgress.current / indexProgress.total) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className={styles.kbPagination}>
              <button
                className={styles.kbPageBtn}
                disabled={safePage <= 1}
                onClick={() => onPageChange(safePage - 1)}
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={`${styles.kbPageBtn} ${p === safePage ? styles.active : ""}`}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className={styles.kbPageBtn}
                disabled={safePage >= totalPages}
                onClick={() => onPageChange(safePage + 1)}
              >
                ›
              </button>
              <span className={styles.kbPageInfo}>
                {filtered.length} {t("kb.total")}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
