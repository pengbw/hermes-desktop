import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  sendNotification,
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { useI18n } from "../../contexts/I18nContext";
import type {
  ProjectItem,
  ProjectMember,
  ProjectArtifact,
  ProjectWorkflow,
  ProjectTask,
  ProjectMessage,
  AiRoleItem,
} from "@core/types";
import FilePreviewModal from "../../windows/FilePreviewModal";
import ProjectList from "../../components/studio/ProjectList";
import ProjectDetail from "../../components/studio/ProjectDetail";
import NewProjectModal from "../../components/studio/NewProjectModal";
import EditProjectModal from "../../components/studio/EditProjectModal";
import ProjectSettingsModal from "../../components/studio/ProjectSettingsModal";
import styles from "./StudioPanel.module.css";

function StudioPanel() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "ungrouped">("all");
  const [viewMode, setViewMode] = useState<"card" | "list">("list");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 12;
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [projectArtifacts, setProjectArtifacts] = useState<ProjectArtifact[]>([]);
  const [projectWorkflows, setProjectWorkflows] = useState<ProjectWorkflow[]>([]);
  const [allRoles, setAllRoles] = useState<AiRoleItem[]>([]);
  const [projectMembersMap, setProjectMembersMap] = useState<Record<string, ProjectMember[]>>({});
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null);
  const [projectMessages, setProjectMessages] = useState<ProjectMessage[]>([]);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);

  useEffect(() => {
    let permissionGranted = false;
    const setupNotification = async () => {
      try {
        permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === "granted";
        }
      } catch {}
    };
    setupNotification();

    const unlisten = listen<{
      projectId: string;
      action: string;
      roleId: string;
      detail: string;
    }>("project_activity", async (event) => {
      if (selectedProject && event.payload.projectId === selectedProject.id) return;
      const importantActions = [
        "artifact_approved",
        "artifact_rejected",
        "task_claimed",
        "workflow_completed",
      ];
      if (importantActions.includes(event.payload.action) && permissionGranted) {
        try {
          sendNotification({
            title: "Hermes Studio",
            body: event.payload.detail || `${event.payload.action}`,
          });
        } catch {}
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      const list = await invoke<ProjectItem[]>("list_projects");
      setProjects(list);
      const membersMap: Record<string, ProjectMember[]> = {};
      await Promise.all(
        list.map(async (project) => {
          try {
            const members = await invoke<ProjectMember[]>("list_project_members", {
              projectId: project.id,
            });
            membersMap[project.id] = members;
          } catch {
            membersMap[project.id] = [];
          }
        })
      );
      setProjectMembersMap(membersMap);
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllRoles = async () => {
    try {
      const list = await invoke<AiRoleItem[]>("list_ai_roles");
      setAllRoles(list);
    } catch (err) {
      console.error("Failed to load roles:", err);
    }
  };

  useEffect(() => {
    loadProjects();
    loadAllRoles();
  }, []);

  const handleEditProject = (project: ProjectItem) => {
    setEditingProject(project);
    setShowEditProject(true);
  };

  const handleToggleFavorite = async (e: React.MouseEvent, project: ProjectItem) => {
    e.stopPropagation();
    try {
      await invoke("update_project", {
        req: { id: project.id, isFavorite: !project.isFavorite },
      });
      loadProjects();
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  const handleDeleteProject = async (project: ProjectItem) => {
    try {
      await invoke("delete_project", { id: project.id });
      if (selectedProject?.id === project.id) {
        setSelectedProject(null);
      }
      loadProjects();
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };

  const handleArchiveProject = async (project: ProjectItem) => {
    try {
      await invoke("update_project", { req: { id: project.id, status: "archived" } });
      loadProjects();
    } catch (err) {
      console.error("Failed to archive project:", err);
    }
  };

  const handleSelectProject = async (project: ProjectItem) => {
    setSelectedProject(project);
    try {
      const [members, artifacts, messages, workflows, tasks] = await Promise.all([
        invoke<ProjectMember[]>("list_project_members", { projectId: project.id }),
        invoke<ProjectArtifact[]>("list_project_artifacts", { projectId: project.id }),
        invoke<ProjectMessage[]>("list_project_messages", { projectId: project.id }),
        invoke<ProjectWorkflow[]>("list_project_workflows", { projectId: project.id }),
        invoke<ProjectTask[]>("list_project_tasks", { projectId: project.id }),
      ]);
      setProjectMembers(members);
      setProjectArtifacts(artifacts);
      setProjectMessages(messages);
      setProjectWorkflows(workflows);
      setProjectTasks(tasks);
      invoke("recover_role_energy").catch(console.error);
    } catch (err) {
      console.error("Failed to load project data:", err);
    }
  };

  const handleOpenSettings = (projectId: string) => {
    setSettingsProjectId(projectId);
  };

  const getRoleName = (roleId: string) => {
    const role = allRoles.find((r) => r.id === roleId);
    return role ? `${role.icon} ${role.name}` : roleId;
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedProject) return;
    try {
      await invoke("create_project_message", {
        projectId: selectedProject.id,
        roleId: "builtin_user",
        content,
        messageType: "text",
      });
      const msgs = await invoke<ProjectMessage[]>("list_project_messages", {
        projectId: selectedProject.id,
      });
      setProjectMessages(msgs);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const getTagLabel = (tag: string) => {
    if (tag === "key_project") return t("studio.tag.keyProject");
    if (tag === "normal") return t("studio.tag.normal");
    return "";
  };

  const getTagClass = (tag: string) => {
    if (tag === "key_project") return styles.tagKey;
    if (tag === "normal") return styles.tagNormal;
    return "";
  };

  const handleImportProject = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await invoke("import_project", { data });
        loadProjects();
      } catch (err) {
        console.error("Import failed:", err);
      }
    };
    input.click();
  };

  if (loading) {
    return (
      <div className={`panel ${styles.studioPanel}`}>
        <div className={styles.skillsLoading}>
          <span className={styles.loadingSpinner}>⏳</span>
          <p>{t("studio.loading")}</p>
        </div>
      </div>
    );
  }

  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        projectMembers={projectMembers}
        projectArtifacts={projectArtifacts}
        projectWorkflows={projectWorkflows}
        projectTasks={projectTasks}
        projectMessages={projectMessages}
        allRoles={allRoles}
        onBack={() => setSelectedProject(null)}
        onMembersUpdate={setProjectMembers}
        onArtifactsUpdate={setProjectArtifacts}
        onTasksUpdate={setProjectTasks}
        onMessagesUpdate={setProjectMessages}
        onSendMessage={handleSendMessage}
        onPreviewFile={(path, name) => setPreviewFile({ path, name })}
        getRoleName={getRoleName}
        getTagLabel={getTagLabel}
        getTagClass={getTagClass}
        t={t}
      />
    );
  }

  const settingsProject = settingsProjectId
    ? projects.find((p) => p.id === settingsProjectId)
    : null;

  return (
    <>
      <ProjectList
        projects={projects}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        pageSize={PAGE_SIZE}
        allRoles={allRoles}
        projectMembersMap={projectMembersMap}
        onNewProject={() => setShowNewProject(true)}
        onSelectProject={handleSelectProject}
        onToggleFavorite={handleToggleFavorite}
        onContextMenu={() => {}}
        onEditProject={handleEditProject}
        onOpenSettings={handleOpenSettings}
        onArchiveProject={handleArchiveProject}
        onDeleteProject={handleDeleteProject}
        onImportProject={handleImportProject}
        t={t}
      />

      <NewProjectModal
        visible={showNewProject}
        onClose={() => setShowNewProject(false)}
        onCreated={() => {
          loadProjects();
          loadAllRoles();
        }}
        t={t}
      />

      <EditProjectModal
        visible={showEditProject}
        project={editingProject}
        onClose={() => {
          setShowEditProject(false);
          setEditingProject(null);
        }}
        onSaved={loadProjects}
        t={t}
      />

      <ProjectSettingsModal
        visible={!!settingsProjectId}
        projectId={settingsProjectId}
        project={settingsProject || null}
        allRoles={allRoles}
        projectMembersMap={projectMembersMap}
        onClose={() => setSettingsProjectId(null)}
        onProjectsUpdate={loadProjects}
        t={t}
      />

      {previewFile && (
        <FilePreviewModal
          filePath={previewFile.path}
          fileName={previewFile.name}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
}

export default StudioPanel;
