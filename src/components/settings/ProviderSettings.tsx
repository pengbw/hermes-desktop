interface Provider {
  id: string;
  name: string;
  value: string;
  baseUrl: string;
  apiKeyEnv: string;
  apiKey: string;
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface ProviderSettingsProps {
  providers: Provider[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onAdd: () => void;
  onEdit: (p: Provider) => void;
  onDelete: (id: string) => void;
  t: (key: string) => string;
}

import styles from "@pages/settings/SettingsPanel.module.css";

export default function ProviderSettings({
  providers,
  searchQuery,
  onSearchChange,
  page,
  pageSize,
  onPageChange,
  onAdd,
  onEdit,
  onDelete,
  t,
}: ProviderSettingsProps) {
  const filtered = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.value.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className={styles.settingsSectionCard}>
      <div className={styles.settingsSection}>
        <div className={styles.providerToolbar}>
          <div className={styles.providerSearchWrap}>
            <svg
              className={styles.providerSearchIcon}
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
              className={styles.providerSearchInput}
              placeholder={t("provider.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                onPageChange(1);
              }}
            />
            {searchQuery && (
              <button
                className={styles.providerSearchClear}
                onClick={() => {
                  onSearchChange("");
                  onPageChange(1);
                }}
              >
                ✕
              </button>
            )}
          </div>
          <button className={styles.providerAddBtn} onClick={onAdd}>
            + {t("provider.add")}
          </button>
        </div>
        {providers.length === 0 && (
          <div className={styles.providerEmpty}>
            <span className={styles.providerEmptyIcon}>🔌</span>
            <p>{t("provider.empty")}</p>
          </div>
        )}
        {providers.length > 0 && (
          <>
            {filtered.length === 0 && (
              <div className={styles.providerEmpty}>
                <span className={styles.providerEmptyIcon}>🔍</span>
                <p>{t("provider.noSearchResult")}</p>
              </div>
            )}
            <div className={styles.providerGrid}>
              {paged.map((p, index) => (
                <div
                  key={p.id}
                  className={styles.providerGridCard}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={styles.providerGridCardHeader}>
                    <span
                      className={`${styles.providerGridCornerTag} ${p.isBuiltin ? styles.providerGridTagBuiltin : styles.providerGridTagCustom}`}
                    >
                      {p.isBuiltin ? t("provider.builtin") : t("provider.custom")}
                    </span>
                    <div className={styles.providerGridCardIcon}>
                      {p.name === "OpenAI"
                        ? "🤖"
                        : p.name === "Anthropic"
                          ? "🧠"
                          : p.name === "Google"
                            ? "🔍"
                            : p.name === "xAI"
                              ? "🚀"
                              : p.name === "Mistral"
                                ? "🌀"
                                : p.name === "DeepSeek"
                                  ? "🔮"
                                  : "🔌"}
                    </div>
                    <div className={styles.providerGridCardTitle}>
                      {p.name}
                      <span
                        className={`${styles.providerGridKeyIcon} ${p.apiKey ? styles.providerGridKeyOk : styles.providerGridKeyMissing}`}
                      >
                        {p.apiKey ? "🔑" : "⚠️"}
                      </span>
                    </div>
                  </div>
                  <div className={styles.providerGridCardBody}>
                    <div className={styles.providerGridMetaRow}>
                      <span className={styles.providerGridMetaLabel}>ID</span>
                      <span className={styles.providerGridMetaValue}>{p.value}</span>
                    </div>
                    {p.baseUrl && (
                      <div className={styles.providerGridMetaRow}>
                        <span className={styles.providerGridMetaLabel}>URL</span>
                        <span
                          className={`${styles.providerGridMetaValue} ${styles.providerGridMetaUrl}`}
                          title={p.baseUrl}
                        >
                          {p.baseUrl}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className={styles.providerGridCardFooter}>
                    <button
                      className={`${styles.providerGridBtn} provider-grid-btn-edit`}
                      onClick={() => onEdit(p)}
                      title={t("provider.edit")}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      {t("provider.edit")}
                    </button>
                    {!p.isBuiltin && (
                      <button
                        className={`${styles.providerGridBtn} ${styles.providerGridBtnDelete}`}
                        onClick={() => onDelete(p.id)}
                        title={t("provider.delete")}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        {t("provider.delete")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className={styles.providerPagination}>
                <button
                  className={styles.providerPageBtn}
                  disabled={safePage <= 1}
                  onClick={() => onPageChange(safePage - 1)}
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    className={`${styles.providerPageBtn} ${p === safePage ? styles.providerPageBtnActive : ""}`}
                    onClick={() => onPageChange(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  className={styles.providerPageBtn}
                  disabled={safePage >= totalPages}
                  onClick={() => onPageChange(safePage + 1)}
                >
                  ›
                </button>
                <span className={styles.providerPageInfo}>
                  {filtered.length} {t("provider.total")}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export type { Provider };
