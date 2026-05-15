import { useState, useEffect } from "react";
import type { AiRoleItem, ProjectMember } from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import type { ProjectItem } from "@core/types";

interface ProjectListProps {
  projects: ProjectItem[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilter: "all" | "ungrouped";
  onFilterChange: (f: "all" | "ungrouped") => void;
  viewMode: "card" | "list";
  onViewModeChange: (m: "card" | "list") => void;
  currentPage: number;
  onPageChange: (p: number) => void;
  pageSize: number;
  allRoles: AiRoleItem[];
  projectMembersMap: Record<string, ProjectMember[]>;
  onNewProject: () => void;
  onSelectProject: (project: ProjectItem) => void;
  onToggleFavorite: (e: React.MouseEvent, project: ProjectItem) => void;
  onContextMenu: (e: React.MouseEvent, project: ProjectItem) => void;
  onEditProject: (project: ProjectItem) => void;
  onOpenSettings: (projectId: string) => void;
  onArchiveProject: (project: ProjectItem) => void;
  onDeleteProject: (project: ProjectItem) => void;
  t: (key: string) => string;
}

function ProjectList({
  projects,
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  currentPage,
  onPageChange,
  pageSize,
  allRoles,
  projectMembersMap,
  onNewProject,
  onSelectProject,
  onToggleFavorite,
  onContextMenu: _onContextMenu,
  onEditProject,
  onOpenSettings,
  onArchiveProject,
  onDeleteProject,
  t,
}: ProjectListProps) {
  const filteredProjects = projects.filter((p) => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (activeFilter === "ungrouped" && p.tag !== "none") return false;
    return true;
  });

  const favoriteProjects = filteredProjects.filter((p) => p.isFavorite);
  const totalPages = Math.ceil(filteredProjects.length / pageSize);
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuProject, setContextMenuProject] = useState<ProjectItem | null>(null);

  useEffect(() => {
    if (!contextMenuPos) return;
    const handleClick = () => {
      setContextMenuPos(null);
      setContextMenuProject(null);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenuPos]);

  const handleContextMenu = (e: React.MouseEvent, project: ProjectItem) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenuPos({ x: rect.right, y: rect.bottom });
    setContextMenuProject(project);
  };

  return (
    <div className={`panel ${styles.studioPanel}`}>
      {contextMenuPos && contextMenuProject && (
        <div
          className={styles.studioContextMenu}
          style={{ position: "fixed", left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <button
            className={styles.studioContextMenuItem}
            onClick={() => {
              onEditProject(contextMenuProject);
              setContextMenuPos(null);
              setContextMenuProject(null);
            }}
          >
            ✏️ {t("studio.edit")}
          </button>
          <button
            className={styles.studioContextMenuItem}
            onClick={() => {
              onOpenSettings(contextMenuProject.id);
              setContextMenuPos(null);
              setContextMenuProject(null);
            }}
          >
            ⚙️ {t("studio.settings")}
          </button>
          <button
            className={styles.studioContextMenuItem}
            onClick={() => {
              if (window.confirm(t("studio.archiveConfirm"))) {
                onArchiveProject(contextMenuProject);
              }
              setContextMenuPos(null);
              setContextMenuProject(null);
            }}
          >
            📦 {t("studio.archive")}
          </button>
          <div className={styles.studioContextMenuDivider} />
          <button
            className={styles.studioContextMenuItem + " " + styles.danger}
            onClick={() => {
              if (window.confirm(t("studio.deleteConfirm"))) {
                onDeleteProject(contextMenuProject);
              }
              setContextMenuPos(null);
              setContextMenuProject(null);
            }}
          >
            🗑️ {t("studio.delete")}
          </button>
        </div>
      )}

      {favoriteProjects.length > 0 && (
        <div className={styles.studioFavoriteSection}>
          <h3 className={styles.studioSectionTitle}>⭐ {t("studio.favoriteProjects")}</h3>
          <div className={styles.studioProjectCardGrid}>
            {favoriteProjects.map((project) => (
              <div
                key={project.id}
                className={styles.studioProjectCard}
                onClick={() => onSelectProject(project)}
              >
                <div className={styles.studioProjectCardTop}>
                  <div className={styles.studioProjectCardIcon}>{project.icon || "💼"}</div>
                  <div className={styles.studioProjectCardBody}>
                    <h4 className={styles.studioProjectCardName}>{project.name}</h4>
                    <p className={styles.studioProjectCardDesc}>
                      {project.description || t("studio.noDesc")}
                    </p>
                  </div>
                  <button
                    className={
                      styles.studioProjectCardStar + " " + (project.isFavorite ? styles.active : "")
                    }
                    onClick={(e) => onToggleFavorite(e, project)}
                  >
                    {project.isFavorite ? "⭐" : "☆"}
                  </button>
                </div>
                <div className={styles.studioProjectCardTools}>
                  <span
                    className={styles.studioToolDots}
                    onClick={(e) => handleContextMenu(e, project)}
                  >
                    ⋯
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.studioAllProjectsSection}>
        <div className={styles.studioAllProjectsHeader}>
          <div className={styles.studioTabs}>
            <button
              className={styles.studioTab + " " + (activeFilter === "all" ? styles.active : "")}
              onClick={() => {
                onFilterChange("all");
                onPageChange(1);
              }}
            >
              {t("studio.allProjects")}
            </button>
            <button
              className={
                styles.studioTab + " " + (activeFilter === "ungrouped" ? styles.active : "")
              }
              onClick={() => {
                onFilterChange("ungrouped");
                onPageChange(1);
              }}
            >
              {t("studio.ungrouped")}
            </button>
          </div>
          <div className={styles.studioHeaderActions}>
            <div className={styles.studioViewToggle}>
              <button
                className={styles.studioViewBtn + " " + (viewMode === "list" ? styles.active : "")}
                onClick={() => onViewModeChange("list")}
                title="列表"
              >
                ☰
              </button>
              <button
                className={styles.studioViewBtn + " " + (viewMode === "card" ? styles.active : "")}
                onClick={() => onViewModeChange("card")}
                title="卡片"
              >
                ⊞
              </button>
            </div>
            <button className={styles.studioBtnPrimary} onClick={onNewProject}>
              + {t("studio.newProject")}
            </button>
            <div className={styles.studioSearchBox}>
              <input
                type="text"
                className={styles.studioSearchInput}
                placeholder={t("studio.searchProjects")}
                value={searchQuery}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  onPageChange(1);
                }}
              />
            </div>
          </div>
        </div>

        {viewMode === "card" ? (
          <div className={styles.studioProjectCardGrid}>
            {paginatedProjects.map((project) => (
              <div
                key={project.id}
                className={styles.studioProjectCard}
                onClick={() => onSelectProject(project)}
              >
                <div className={styles.studioProjectCardTop}>
                  <div className={styles.studioProjectCardIcon}>{project.icon || "💼"}</div>
                  <div className={styles.studioProjectCardBody}>
                    <h4 className={styles.studioProjectCardName}>{project.name}</h4>
                    <p className={styles.studioProjectCardDesc}>
                      {project.description || t("studio.noDesc")}
                    </p>
                  </div>
                  <button
                    className={
                      styles.studioProjectCardStar + " " + (project.isFavorite ? styles.active : "")
                    }
                    onClick={(e) => onToggleFavorite(e, project)}
                  >
                    {project.isFavorite ? "⭐" : "☆"}
                  </button>
                </div>
                <div className={styles.studioProjectCardTools}>
                  <span
                    className={styles.studioToolDots}
                    onClick={(e) => handleContextMenu(e, project)}
                  >
                    ⋯
                  </span>
                </div>
              </div>
            ))}
            {paginatedProjects.length === 0 && (
              <div className={styles.studioProjectCardEmpty}>
                <p>{t("studio.emptyState")}</p>
                <button className={styles.studioBtnPrimary} onClick={onNewProject}>
                  {t("studio.newProject")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.studioProjectList}>
            <div className={styles.studioProjectListHeader}>
              <span className={styles.studioListColName}>{t("studio.projectName")}</span>
              <span className={styles.studioListColDesc}>{t("studio.projectDesc")}</span>
              <span className={styles.studioListColMembers}>{t("studio.memberCount")}</span>
              <span className={styles.studioListColAction}></span>
            </div>
            {paginatedProjects.map((project) => {
              const members = projectMembersMap[project.id] || [];
              return (
                <div
                  key={project.id}
                  className={styles.studioProjectListRow}
                  onClick={() => onSelectProject(project)}
                >
                  <div className={styles.studioListColName}>
                    <div className={styles.studioListProjectIcon}>{project.icon || "💼"}</div>
                    <span className={styles.studioListProjectName}>{project.name}</span>
                  </div>
                  <div className={styles.studioListColDesc}>
                    <span className={styles.studioListProjectDesc}>
                      {project.description || t("studio.noDesc")}
                    </span>
                  </div>
                  <div className={styles.studioListColMembers}>
                    <div className={styles.studioMemberAvatars}>
                      {members.slice(0, 3).map((member) => {
                        const role = allRoles.find((r) => r.id === member.roleId);
                        return (
                          <div
                            key={member.id}
                            className={styles.studioMemberAvatar}
                            style={{
                              background: role?.avatarColor || "var(--color-primary, #6c5ce7)",
                            }}
                            title={role ? `${role.icon} ${role.name}` : member.roleId}
                          >
                            {role?.icon || "🤖"}
                          </div>
                        );
                      })}
                      {members.length > 3 && (
                        <div className={styles.studioMemberAvatar + " " + styles.more}>
                          +{members.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={styles.studioListColAction}>
                    <button
                      className={
                        styles.studioListStar + " " + (project.isFavorite ? styles.active : "")
                      }
                      onClick={(e) => onToggleFavorite(e, project)}
                    >
                      {project.isFavorite ? "⭐" : "☆"}
                    </button>
                    <button
                      className={styles.studioListActions}
                      onClick={(e) => handleContextMenu(e, project)}
                    >
                      ⋯
                    </button>
                  </div>
                </div>
              );
            })}
            {paginatedProjects.length === 0 && (
              <div className={styles.studioProjectListEmpty}>
                <p>{t("studio.emptyState")}</p>
                <button className={styles.studioBtnPrimary} onClick={onNewProject}>
                  {t("studio.newProject")}
                </button>
              </div>
            )}
          </div>
        )}

        {totalPages > 1 && (
          <div className={styles.studioPagination}>
            <button
              className={styles.studioPageBtn}
              disabled={currentPage === 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              ◀
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                className={styles.studioPageBtn + " " + (page === currentPage ? styles.active : "")}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            ))}
            <button
              className={styles.studioPageBtn}
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(currentPage + 1)}
            >
              ▶
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectList;
