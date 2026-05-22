import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SkillCatalogResult, CatalogSkill } from "@core/types";
import skillStyles from "./SkillsPanel.module.css";

function SkillsPanel({
  t,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [catalogResult, setCatalogResult] = useState<SkillCatalogResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterInstalled, setFilterInstalled] = useState<string>("all");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [detailSkill, setDetailSkill] = useState<CatalogSkill | null>(null);
  const [detailContent, setDetailContent] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState("");
  const [skillPage, setSkillPage] = useState(1);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configSkill, setConfigSkill] = useState<CatalogSkill | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [tooltipSkill, setTooltipSkill] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{
    open: boolean;
    skillName: string;
    success: boolean;
    message: string;
  }>({ open: false, skillName: "", success: true, message: "" });
  const skillPageSize = 20;

  const loadCatalog = async (page: number = 1) => {
    setLoading(true);
    try {
      await invoke("check_and_init_skill_catalog");
      const result = await invoke<SkillCatalogResult>("list_skill_catalog", {
        search: searchQuery || undefined,
        category: activeCategory !== "all" ? activeCategory : undefined,
        source: filterSource !== "all" ? filterSource : undefined,
        installedFilter: filterInstalled !== "all" ? filterInstalled : undefined,
        page,
        pageSize: skillPageSize,
      });
      setCatalogResult(result);
      setSkillPage(page);
    } catch {
      // console.error("Failed to load skill catalog:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      await invoke<number>("load_skill_catalog_from_file");
    } catch {
      // console.error("Reload catalog failed:", err);
    }
    loadCatalog(skillPage);
  };

  useEffect(() => {
    loadCatalog(1);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCatalog(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filterSource, filterInstalled, activeCategory]);

  useEffect(() => {
    const handler = () => {
      if (menuOpen) setMenuOpen(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuOpen]);

  const handleInstall = async (skill: CatalogSkill) => {
    if (skill.configSchema && Object.keys(skill.configSchema).length > 0) {
      const hasRequired = Object.entries(skill.configSchema).some(
        ([fieldKey, field]) => field.required && !skill.userConfig[fieldKey]
      );
      if (hasRequired || Object.keys(skill.userConfig).length === 0) {
        setConfigSkill(skill);
        setConfigValues({ ...skill.userConfig });
        setShowConfigModal(true);
        return;
      }
    }

    setInstalling(skill.identifier);
    setInstallMsg("");
    try {
      const config =
        skill.userConfig && Object.keys(skill.userConfig).length > 0 ? skill.userConfig : null;
      await invoke("install_skill_from_catalog", {
        identifier: skill.identifier,
        config,
      });
      setSuccessModal({
        open: true,
        skillName: skill.name,
        success: true,
        message: t("skills.installSuccess"),
      });
      loadCatalog(skillPage);
    } catch (err: unknown) {
      setSuccessModal({
        open: true,
        skillName: skill.name,
        success: false,
        message: err instanceof Error ? err.message : String(err) || t("skills.installFail"),
      });
    } finally {
      setInstalling(null);
    }
  };

  const handleConfigInstall = async () => {
    if (!configSkill) return;
    setShowConfigModal(false);
    setInstalling(configSkill.identifier);
    setInstallMsg("");
    try {
      await invoke("install_skill_from_catalog", {
        identifier: configSkill.identifier,
        config: configValues,
      });
      setSuccessModal({
        open: true,
        skillName: configSkill.name,
        success: true,
        message: t("skills.installSuccess"),
      });
      loadCatalog(skillPage);
    } catch (err: unknown) {
      setSuccessModal({
        open: true,
        skillName: configSkill.name,
        success: false,
        message: err instanceof Error ? err.message : String(err) || t("skills.installFail"),
      });
    } finally {
      setInstalling(null);
      setConfigSkill(null);
    }
  };

  const handleUninstall = async (skill: CatalogSkill) => {
    try {
      await invoke("uninstall_skill", { name: skill.name });
      loadCatalog(skillPage);
      setMenuOpen(null);
    } catch {
      // console.error("Uninstall failed:", err);
    }
  };

  const handleInspect = async (skill: CatalogSkill) => {
    setDetailSkill(skill);
    setDetailLoading(true);
    setDetailContent("");
    try {
      const identifier = skill.category ? `${skill.category}/${skill.name}` : skill.name;
      const content = await invoke<string>("inspect_skill", { identifier });
      setDetailContent(content);
    } catch {
      setDetailContent(t("skills.detailLoadFail"));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveConfig = async (skill: CatalogSkill) => {
    try {
      await invoke("save_skill_config", {
        identifier: skill.identifier,
        config: configValues,
      });
      setShowConfigModal(false);
      setConfigSkill(null);
      loadCatalog(skillPage);
    } catch {
      // console.error("Save config failed:", err);
    }
  };

  const categories = catalogResult?.categories || [];

  const getCategoryIcon = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    return cat?.icon || "📂";
  };

  const getSkillInitial = (name: string) => name.charAt(0).toUpperCase();

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "builtin":
        return t("skills.builtinSources");
      case "hub":
        return t("skills.hubSources");
      case "local":
        return t("skills.localSources");
      case "hermes-dynamic":
        return "Hermes";
      default:
        return source;
    }
  };

  const renderPagination = () => {
    if (!catalogResult || catalogResult.totalPages <= 1) return null;
    const pages: number[] = [];
    const total = catalogResult.totalPages;
    const current = skillPage;
    let start = Math.max(1, current - 2);
    let end = Math.min(total, current + 2);
    if (end - start < 4) {
      if (start === 1) end = Math.min(total, start + 4);
      else start = Math.max(1, end - 4);
    }
    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <div className={skillStyles.skillsPagination}>
        <button
          className={skillStyles.pageBtn}
          disabled={skillPage <= 1}
          onClick={() => loadCatalog(skillPage - 1)}
        >
          ‹
        </button>
        {start > 1 && (
          <>
            <button className={skillStyles.pageBtn} onClick={() => loadCatalog(1)}>
              1
            </button>
            {start > 2 && <span className={skillStyles.pageEllipsis}>…</span>}
          </>
        )}
        {pages.map((page) => (
          <button
            key={page}
            className={`${skillStyles.pageBtn} ${page === skillPage ? skillStyles.pageBtnActive : ""}`}
            onClick={() => loadCatalog(page)}
          >
            {page}
          </button>
        ))}
        {end < total && (
          <>
            {end < total - 1 && <span className={skillStyles.pageEllipsis}>…</span>}
            <button className={skillStyles.pageBtn} onClick={() => loadCatalog(total)}>
              {total}
            </button>
          </>
        )}
        <button
          className={skillStyles.pageBtn}
          disabled={skillPage >= catalogResult.totalPages}
          onClick={() => loadCatalog(skillPage + 1)}
        >
          ›
        </button>
        <span className={skillStyles.pageInfo}>
          {catalogResult.total} {t("skills.all")}
        </span>
      </div>
    );
  };

  return (
    <div className={`panel ${skillStyles.skillsPanel}`}>
      <div className={skillStyles.skillsHeader}>
        <div className={skillStyles.skillsHeaderLeft}></div>
        <div className={skillStyles.skillsHeaderActions}>
          <button
            className="px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium cursor-pointer transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? "..." : t("skills.refresh")}
          </button>
        </div>
      </div>

      <div className={skillStyles.skillsToolbar}>
        <input
          className={skillStyles.skillsSearch}
          type="text"
          placeholder={t("skills.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className={skillStyles.skillsFilter}
          value={filterInstalled}
          onChange={(e) => setFilterInstalled(e.target.value)}
        >
          <option value="all">
            {t("skills.all")} ({catalogResult?.total ?? 0})
          </option>
          <option value="installed">
            {t("skills.installed")} ({catalogResult?.installedCount ?? 0})
          </option>
          <option value="not_installed">
            {t("skills.notInstalled")} ({catalogResult?.notInstalledCount ?? 0})
          </option>
        </select>
        <select
          className={skillStyles.skillsFilter}
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
        >
          <option value="all">{t("skills.allSources")}</option>
          <option value="builtin">{t("skills.builtinSources")}</option>
          <option value="local">{t("skills.localSources")}</option>
          <option value="hub">{t("skills.hubSources")}</option>
        </select>
        <select
          className={skillStyles.skillsFilter}
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
        >
          <option value="all">{t("skills.allCategories")}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.icon} {cat.name} ({cat.count})
            </option>
          ))}
        </select>
      </div>

      {installMsg && <div className={skillStyles.installMsg}>{installMsg}</div>}

      {loading && (
        <div className={skillStyles.skillsLoading}>
          <span className={skillStyles.loadingSpinner}>⏳</span>
          <p>{t("skills.loading")}</p>
        </div>
      )}

      {!loading && catalogResult && catalogResult.skills.length > 0 && (
        <div className={skillStyles.skillsGrid}>
          {catalogResult.skills.map((skill, index) => (
            <div
              key={skill.id}
              className={skillStyles.skillCard}
              style={{ animationDelay: `${index * 0.05}s` }}
              onMouseEnter={() => setTooltipSkill(skill.id)}
              onMouseLeave={() => setTooltipSkill(null)}
            >
              <div className={skillStyles.skillCardHeader}>
                <span
                  className={`${skillStyles.skillCornerTag} ${skill.installed ? skillStyles.skillCornerTagInstalled : skillStyles.skillCornerTagNotInstalled}`}
                >
                  {skill.installed ? t("skills.installed") : t("skills.notInstalled")}
                </span>
                <div className={skillStyles.skillCardMenuWrap}>
                  <button
                    className={skillStyles.skillCardMenuBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === skill.id ? null : skill.id);
                    }}
                  >
                    ⋮
                  </button>
                  {menuOpen === skill.id && (
                    <div className={skillStyles.skillCardMenu} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          handleInspect(skill);
                          setMenuOpen(null);
                        }}
                      >
                        {t("skills.viewDetail")}
                      </button>
                      {skill.installed && (
                        <button
                          onClick={() => {
                            handleUninstall(skill);
                          }}
                        >
                          {t("skills.uninstall")}
                        </button>
                      )}
                      {skill.configSchema && Object.keys(skill.configSchema).length > 0 && (
                        <button
                          onClick={() => {
                            setConfigSkill(skill);
                            setConfigValues({ ...skill.userConfig });
                            setShowConfigModal(true);
                            setMenuOpen(null);
                          }}
                        >
                          {t("skills.editConfig")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className={skillStyles.skillIcon}>
                  <span className={skillStyles.skillIconEmoji}>
                    {skill.category ? getCategoryIcon(skill.category) : "🔧"}
                  </span>
                  <span className={skillStyles.skillIconLetter}>{getSkillInitial(skill.name)}</span>
                </div>
                <div className={skillStyles.skillTitle}>{skill.name}</div>
                {skill.version && <div className={skillStyles.skillVersion}>v{skill.version}</div>}
              </div>
              <div className={skillStyles.skillCardBody}>
                <div className={skillStyles.skillMetaRow}>
                  <span className={skillStyles.skillMetaLabel}>Source</span>
                  <span className={skillStyles.skillMetaValue}>{getSourceLabel(skill.source)}</span>
                </div>
                {skill.categoryLabel && (
                  <div className={skillStyles.skillMetaRow}>
                    <span className={skillStyles.skillMetaLabel}>Category</span>
                    <span className={skillStyles.skillMetaValue}>{skill.categoryLabel}</span>
                  </div>
                )}
                {skill.tags.length > 0 && (
                  <div className={skillStyles.skillMetaRow}>
                    <span className={skillStyles.skillMetaLabel}>Tags</span>
                    <span className={skillStyles.skillMetaValue}>
                      {skill.tags.slice(0, 3).join(", ")}
                    </span>
                  </div>
                )}
                {skill.description && (
                  <div className={skillStyles.skillDescTooltip}>
                    {tooltipSkill === skill.id && (
                      <div className={skillStyles.descTooltipContent}>{skill.description}</div>
                    )}
                  </div>
                )}
              </div>
              <div className={skillStyles.skillCardFooter}>
                <button className={skillStyles.skillBtn} onClick={() => handleInspect(skill)}>
                  {t("skills.viewDetail")}
                </button>
                {!skill.installed ? (
                  <button
                    className={skillStyles.skillBtnPrimary}
                    disabled={installing === skill.identifier}
                    onClick={() => handleInstall(skill)}
                  >
                    {installing === skill.identifier ? "..." : t("skills.install")}
                  </button>
                ) : (
                  <button
                    className={`${skillStyles.skillBtn} ${skillStyles.skillBtnDanger}`}
                    onClick={() => handleUninstall(skill)}
                  >
                    {t("skills.uninstall")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && catalogResult && catalogResult.skills.length === 0 && (
        <div className={skillStyles.skillsEmpty}>
          <span>🔍</span>
          <p>{searchQuery ? t("skills.noResults") : t("skills.empty")}</p>
        </div>
      )}

      {renderPagination()}

      {detailSkill && (
        <div className={skillStyles.modalOverlay} onClick={() => setDetailSkill(null)}>
          <div
            className={skillStyles.modalContent + " " + skillStyles.skillDetailModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={skillStyles.modalHeader}>
              <h3>{detailSkill.name}</h3>
              <button className={skillStyles.modalClose} onClick={() => setDetailSkill(null)}>
                ×
              </button>
            </div>
            <div className={skillStyles.modalBody}>
              {detailLoading ? (
                <p>{t("skills.loading")}</p>
              ) : (
                <pre className={skillStyles.skillDetailContent}>{detailContent}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {showConfigModal && configSkill && configSkill.configSchema && (
        <div
          className={skillStyles.modalOverlay}
          onClick={() => {
            setShowConfigModal(false);
            setConfigSkill(null);
          }}
        >
          <div
            className={skillStyles.modalContent}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480 }}
          >
            <div className={skillStyles.modalHeader}>
              <h3>
                {configSkill.installed ? t("skills.editConfig") : t("skills.installConfig")} -{" "}
                {configSkill.name}
              </h3>
              <button
                className={skillStyles.modalClose}
                onClick={() => {
                  setShowConfigModal(false);
                  setConfigSkill(null);
                }}
              >
                ×
              </button>
            </div>
            <div className={skillStyles.modalBody}>
              {Object.entries(configSkill.configSchema).map(([key, field]) => (
                <div key={key} style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontWeight: 500, marginBottom: 4 }}>
                    {field.label || key}
                    {field.required && <span style={{ color: "red", marginLeft: 4 }}>*</span>}
                  </label>
                  {field.description && (
                    <p
                      style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 6px 0" }}
                    >
                      {field.description}
                    </p>
                  )}
                  {field.url && (
                    <a
                      href={field.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 12,
                        color: "var(--accent)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      {t("skills.getConfigUrl")} →
                    </a>
                  )}
                  <input
                    type={field.secret ? "password" : "text"}
                    value={configValues[key] || ""}
                    onChange={(e) => setConfigValues({ ...configValues, [key]: e.target.value })}
                    placeholder={field.label || key}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--bg-secondary)",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
                <button
                  className="px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium cursor-pointer transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98]"
                  onClick={() => {
                    setShowConfigModal(false);
                    setConfigSkill(null);
                  }}
                >
                  {t("skills.cancel")}
                </button>
                {configSkill.installed ? (
                  <button
                    className={skillStyles.installBtn}
                    onClick={() => handleSaveConfig(configSkill)}
                  >
                    {t("skills.save")}
                  </button>
                ) : (
                  <button className={skillStyles.installBtn} onClick={handleConfigInstall}>
                    {t("skills.install")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {successModal.open && (
        <div
          className={skillStyles.modalOverlay}
          onClick={() => setSuccessModal({ ...successModal, open: false })}
        >
          <div
            className={skillStyles.modalContent}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400, textAlign: "center" }}
          >
            <div className={skillStyles.modalHeader}>
              <h3>
                {successModal.success ? "✓" : "✗"}{" "}
                {successModal.success ? t("skills.installSuccess") : t("skills.installFail")}
              </h3>
              <button
                className={skillStyles.modalClose}
                onClick={() => setSuccessModal({ ...successModal, open: false })}
              >
                ×
              </button>
            </div>
            <div className={skillStyles.modalBody}>
              <p style={{ margin: "0 0 16px 0", fontSize: 14 }}>
                <strong>{successModal.skillName}</strong>
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: successModal.success ? "var(--color-text-secondary)" : "#e53935",
                  wordBreak: "break-word",
                }}
              >
                {successModal.message}
              </p>
              <div style={{ marginTop: 20 }}>
                <button
                  className="px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium cursor-pointer transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98]"
                  onClick={() => setSuccessModal({ ...successModal, open: false })}
                >
                  {t("skills.confirm")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SkillsPanel;
