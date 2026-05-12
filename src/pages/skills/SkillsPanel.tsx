import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SkillsResult, SkillItem, BrowseResult } from "@core/types";
import kbStyles from "@pages/knowledge/KnowledgePanel.module.css";
import cardStyles from "@pages/cards/CardManagerPanel.module.css";
import skillStyles from "./SkillsPanel.module.css";

function SkillsPanel({
  t,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [skillsResult, setSkillsResult] = useState<SkillsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [detailSkill, setDetailSkill] = useState<SkillItem | null>(null);
  const [detailContent, setDetailContent] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browsePage, setBrowsePage] = useState(1);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState("");
  const [skillPage, setSkillPage] = useState(1);
  const skillPageSize = 20;

  const loadSkills = async () => {
    setLoading(true);
    try {
      const result = await invoke<SkillsResult>("list_hermes_skills");
      setSkillsResult(result);
    } catch (err) {
      console.error("Failed to load skills:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSkillPage(1);
  }, [searchQuery, filterSource, activeCategory]);

  useEffect(() => {
    loadSkills();
  }, []);

  useEffect(() => {
    const handler = () => {
      if (menuOpen) setMenuOpen(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuOpen]);

  const loadBrowse = async (page: number = 1) => {
    setBrowseLoading(true);
    try {
      const result = await invoke<BrowseResult>("browse_skills", { page, size: 20 });
      setBrowseResult(result);
      setBrowsePage(page);
    } catch (err) {
      console.error("Failed to browse skills:", err);
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleInstall = async (identifier: string) => {
    setInstalling(identifier);
    setInstallMsg("");
    try {
      await invoke("install_skill", { identifier });
      setInstallMsg(t("skills.installSuccess"));
      loadSkills();
      if (browseResult) loadBrowse(browsePage);
    } catch (err: unknown) {
      setInstallMsg(err instanceof Error ? err.message : String(err) || t("skills.installFail"));
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (name: string) => {
    try {
      await invoke("uninstall_skill", { name });
      loadSkills();
      setMenuOpen(null);
    } catch (err) {
      console.error("Uninstall failed:", err);
    }
  };

  const handleInspect = async (skill: SkillItem) => {
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

  const filteredSkills = (skillsResult?.skills || []).filter((skill) => {
    const matchSearch =
      !searchQuery ||
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSource = filterSource === "all" || skill.source === filterSource;
    const matchCategory = activeCategory === "all" || skill.category === activeCategory;
    return matchSearch && matchSource && matchCategory;
  });

  const categories = skillsResult?.categories || [];

  const getSkillInitial = (name: string) => name.charAt(0).toUpperCase();

  const getCategoryIcon = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    return cat?.icon || "📂";
  };

  return (
    <div className={`panel ${skillStyles.skillsPanel}`}>
      <div className={skillStyles.skillsHeader}>
        <div className={skillStyles.skillsHeaderLeft}></div>
        <div className={skillStyles.skillsHeaderActions}>
          <button className={cardStyles.cardAddBtn} onClick={loadSkills} disabled={loading}>
            {loading ? "..." : t("skills.refresh")}
          </button>
          <button
            className={cardStyles.cardAddBtn}
            onClick={() => {
              setShowAddSkill(true);
              loadBrowse(1);
            }}
          >
            + {t("skills.addSkill")}
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
          <option value="all">
            {t("skills.all")} ({skillsResult?.total ?? 0})
          </option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.icon} {cat.name} ({cat.count})
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className={skillStyles.skillsLoading}>
          <span className={skillStyles.loadingSpinner}>⏳</span>
          <p>{t("skills.loading")}</p>
        </div>
      )}

      {!loading &&
        filteredSkills.length > 0 &&
        (() => {
          const totalPages = Math.max(1, Math.ceil(filteredSkills.length / skillPageSize));
          const safePage = Math.min(skillPage, totalPages);
          const pagedSkills = filteredSkills.slice(
            (safePage - 1) * skillPageSize,
            safePage * skillPageSize
          );
          return (
            <>
              <div className={skillStyles.skillsGrid}>
                {pagedSkills.map((skill) => (
                  <div key={skill.name} className={skillStyles.skillCard}>
                    <div className={skillStyles.skillCardTop}>
                      <div className={skillStyles.skillCardIcon} data-category={skill.category}>
                        <span className={skillStyles.skillIconEmoji}>
                          {getCategoryIcon(skill.category)}
                        </span>
                        <span className={skillStyles.skillIconLetter}>
                          {getSkillInitial(skill.name)}
                        </span>
                      </div>
                      <div className={skillStyles.skillCardHeader}>
                        <span className={skillStyles.skillCardName}>{skill.name}</span>
                        {skill.version && (
                          <span className={skillStyles.skillVersion}>v{skill.version}</span>
                        )}
                      </div>
                      <div className={skillStyles.skillCardMenuWrap}>
                        <button
                          className={skillStyles.skillCardMenuBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(menuOpen === skill.name ? null : skill.name);
                          }}
                        >
                          ⋮
                        </button>
                        {menuOpen === skill.name && (
                          <div
                            className={skillStyles.skillCardMenu}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                handleInspect(skill);
                                setMenuOpen(null);
                              }}
                            >
                              {t("skills.viewDetail")}
                            </button>
                            {skill.source === "hub" && (
                              <button
                                onClick={() => {
                                  handleUninstall(skill.name);
                                }}
                              >
                                {t("skills.uninstall")}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <p className={skillStyles.skillCardDesc}>
                      {skill.description || t("skills.noDesc")}
                    </p>
                    <div className={skillStyles.skillCardBottom}>
                      <div className={skillStyles.skillCardTags}>
                        <span className={`${skillStyles.sourceBadge} ${skill.source}`}>
                          {skill.source}
                        </span>
                        <span
                          className={`${skillStyles.enabledBadge} ${skill.enabled ? skillStyles.enabled : skillStyles.disabled}`}
                        >
                          {skill.enabled ? t("skills.enabled") : t("skills.disabled")}
                        </span>
                        {skill.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className={skillStyles.tagBadge}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className={kbStyles.kbPagination}>
                  <button
                    className={kbStyles.kbPageBtn}
                    disabled={safePage <= 1}
                    onClick={() => setSkillPage(safePage - 1)}
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      className={`${kbStyles.kbPageBtn} ${page === safePage ? kbStyles.active : ""}`}
                      onClick={() => setSkillPage(page)}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    className={kbStyles.kbPageBtn}
                    disabled={safePage >= totalPages}
                    onClick={() => setSkillPage(safePage + 1)}
                  >
                    ›
                  </button>
                  <span className={kbStyles.kbPageInfo}>
                    {filteredSkills.length} {t("skills.all")}
                  </span>
                </div>
              )}
            </>
          );
        })()}

      {!loading && filteredSkills.length === 0 && (
        <div className={skillStyles.skillsEmpty}>
          <span>🔍</span>
          <p>{searchQuery ? t("skills.noResults") : t("skills.empty")}</p>
        </div>
      )}

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

      {showAddSkill && (
        <div className={skillStyles.modalOverlay} onClick={() => setShowAddSkill(false)}>
          <div
            className={`${skillStyles.modalContent} ${skillStyles.addSkillModal}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={skillStyles.modalHeader}>
              <h3>{t("skills.addSkillTitle")}</h3>
              <button className={skillStyles.modalClose} onClick={() => setShowAddSkill(false)}>
                ×
              </button>
            </div>
            <div className={skillStyles.modalBody}>
              {browseLoading && <p>{t("skills.loading")}</p>}
              {browseResult &&
                browseResult.skills.map((bs) => (
                  <div key={bs.identifier || bs.name} className={skillStyles.browseSkillItem}>
                    <div className={skillStyles.browseSkillInfo}>
                      <span className={skillStyles.browseSkillName}>{bs.name}</span>
                      <span className={skillStyles.browseSkillDesc}>{bs.description}</span>
                      <div className={skillStyles.browseSkillMeta}>
                        <span className={`${skillStyles.sourceBadge} ${bs.source}`}>
                          {bs.source}
                        </span>
                        <span className={skillStyles.trustBadge}>{bs.trust}</span>
                      </div>
                    </div>
                    <button
                      className={skillStyles.installBtn}
                      disabled={installing === bs.identifier}
                      onClick={() => handleInstall(bs.identifier)}
                    >
                      {installing === bs.identifier ? "..." : t("skills.install")}
                    </button>
                  </div>
                ))}
              {browseResult && browseResult.total_pages > 1 && (
                <div className={skillStyles.browsePagination}>
                  <button disabled={browsePage <= 1} onClick={() => loadBrowse(browsePage - 1)}>
                    {t("skills.prevPage")}
                  </button>
                  <span>
                    {browsePage} / {browseResult.total_pages}
                  </span>
                  <button
                    disabled={browsePage >= browseResult.total_pages}
                    onClick={() => loadBrowse(browsePage + 1)}
                  >
                    {t("skills.nextPage")}
                  </button>
                </div>
              )}
              {installMsg && <p className={skillStyles.installMsg}>{installMsg}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SkillsPanel;
