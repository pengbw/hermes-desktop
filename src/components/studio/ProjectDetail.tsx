import { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { TauriEvents } from "@services/tauri/TauriEvents";
import { MentionsInput, Mention } from "react-mentions";
import type {
  ProjectItem,
  ProjectMember,
  ProjectArtifact,
  ProjectWorkflow,
  ProjectTask,
  ProjectMessage,
  AiRoleItem,
  ProjectActivity,
  ProjectFileRecord,
} from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import WorkflowDesigner from "../../windows/WorkflowDesigner";
import MarkdownRenderer from "../../components/MarkdownRenderer";
import RoleManager from "./RoleManager";
import TaskBoard from "./TaskBoard";
import TaskManagement from "./TaskManagement";
import PendingReviewPanel from "./PendingReviewPanel";
import ArtifactReviewReminder from "./ArtifactReviewReminder";
import ArtifactTree from "./ArtifactTree";
import { useI18n } from "../../contexts/I18nContext";

const VirtualOffice = lazy(() => import("../../windows/VirtualOffice"));

const ACTION_ICONS: Record<string, string> = {
  task_created: "📋",
  task_updated: "✏️",
  task_completed: "✅",
  task_claimed: "🤚",
  artifact_created: "📦",
  artifact_submitted: "📤",
  artifact_approved: "✅",
  artifact_rejected: "❌",
  member_added: "👤",
  member_removed: "👋",
  workflow_started: "🚀",
  workflow_completed: "🎉",
  workflow_paused: "⏸",
  comment_added: "💬",
};

function ActivityFeed({
  projectId,
  allRoles: _allRoles,
  getRoleName,
}: {
  projectId: string;
  allRoles: AiRoleItem[];
  getRoleName: (roleId: string) => string;
}) {
  const { t } = useI18n();
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await invoke<ProjectActivity[]>("list_project_activities", {
          projectId,
          limit: 20,
        });
        setActivities(data);
      } catch {
        // console.error("Failed to load activities:", err);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [projectId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (ts: number) => {
    if (!ts) return "";
    const diff = now - ts;
    if (diff < 60000) return t("studio.activity.justNow");
    if (diff < 3600000) return t("studio.activity.minutesAgo", { n: Math.floor(diff / 60000) });
    if (diff < 86400000) return t("studio.activity.hoursAgo", { n: Math.floor(diff / 3600000) });
    return new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  if (activities.length === 0) return null;

  return (
    <div className={styles.studioDetailSection}>
      <div className={styles.studioDetailSectionHeader}>
        <h3>{t("studio.activityFeed")}</h3>
      </div>
      <div className={styles.activityFeed}>
        {activities.map((act) => (
          <div key={act.id} className={styles.activityItem}>
            <span className={styles.activityIcon}>{ACTION_ICONS[act.action] || "📌"}</span>
            <span className={styles.activityRole}>
              {act.roleId ? getRoleName(act.roleId) : t("studio.activity.system")}
            </span>
            <span className={styles.activityAction}>{act.action.replace(/_/g, " ")}</span>
            {act.detail && <span className={styles.activityDetail}>{act.detail.slice(0, 60)}</span>}
            <span className={styles.activityTime}>{formatTime(act.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProjectDetailProps {
  project: ProjectItem;
  projectMembers: ProjectMember[];
  projectArtifacts: ProjectArtifact[];
  projectWorkflows: ProjectWorkflow[];
  projectTasks: ProjectTask[];
  projectMessages: ProjectMessage[];
  allRoles: AiRoleItem[];
  onBack: () => void;
  onMembersUpdate: (members: ProjectMember[]) => void;
  onArtifactsUpdate: (artifacts: ProjectArtifact[]) => void;
  onTasksUpdate: (tasks: ProjectTask[]) => void;
  onMessagesUpdate: (messages: ProjectMessage[]) => void;
  onSendMessage: (content: string) => void;
  onPreviewFile: (path: string, name: string) => void;
  getRoleName: (roleId: string) => string;
  getRoleNamePure: (roleId: string) => string;
  getTagLabel: (tag: string) => string;
  getTagClass: (tag: string) => string;
  t: (key: string) => string;
}

function ProjectDetail({
  project,
  projectMembers,
  projectArtifacts,
  projectWorkflows,
  projectTasks,
  projectMessages,
  allRoles,
  onBack,
  onMembersUpdate,
  onArtifactsUpdate,
  onTasksUpdate,
  onMessagesUpdate,
  onSendMessage,
  onPreviewFile,
  getRoleName,
  getRoleNamePure,
  getTagLabel,
  getTagClass,
  t,
}: ProjectDetailProps) {
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const [projectDetailTab, setProjectDetailTab] = useState<
    "overview" | "taskmgmt" | "kanban" | "members" | "workflows" | "chat"
  >("overview");
  const [chatInput, setChatInput] = useState("");
  const chatInputRef = useRef("");
  const projectChatEventIdRef = useRef("");
  useEffect(() => {
    chatInputRef.current = chatInput;
  }, [chatInput]);
  const [chatTargetRole, setChatTargetRole] = useState<string>("");
  const [projectChatStreaming, setProjectChatStreaming] = useState(false);
  const [projectChatStreamed, setProjectChatStreamed] = useState("");
  const [autoDelegateRunning, setAutoDelegateRunning] = useState(false);
  const [overviewSubTab, setOverviewSubTab] = useState<"tasks" | "artifacts">("tasks");
  const [taskSubTab, setTaskSubTab] = useState<"list" | "pending">("list");
  const [chatRoleSkills, setChatRoleSkills] = useState<string[]>([]);
  const [projectFileRecords, setProjectFileRecords] = useState<ProjectFileRecord[]>([]);

  const fileRecordsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFileRecords = useCallback(() => {
    if (fileRecordsTimerRef.current) clearTimeout(fileRecordsTimerRef.current);
    fileRecordsTimerRef.current = setTimeout(() => {
      invoke<number>("cleanup_invalid_file_records", { projectId: project.id }).catch(() => {});
      invoke("scan_project_files", { projectId: project.id })
        .then(() => {
          invoke<ProjectFileRecord[]>("list_project_file_records", { projectId: project.id })
            .then((records) => {
              setProjectFileRecords(records);
            })
            .catch(() => setProjectFileRecords([]));
        })
        .catch(() => {
          invoke<ProjectFileRecord[]>("list_project_file_records", { projectId: project.id })
            .then((records) => {
              setProjectFileRecords(records);
            })
            .catch(() => setProjectFileRecords([]));
        });
    }, 1500);
  }, [project.id]);

  useEffect(() => {
    loadFileRecords();
  }, [project.id]);

  useEffect(() => {
    if (chatTargetRole) {
      invoke<string[]>("list_role_skills", { roleId: chatTargetRole })
        .then((skills) => setChatRoleSkills(skills.map((s: any) => s.skillName || s)))
        .catch(() => setChatRoleSkills([]));
    } else {
      setChatRoleSkills([]);
    }
  }, [chatTargetRole]);

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [projectMessages, projectChatStreamed]);

  // Debounced data change listener: refresh corresponding data when backend pushes changes
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    TauriEvents.onProjectDataChanged((payload) => {
      if (payload.projectId !== project.id) return;
      for (const change of payload.changes) {
        if (change === "tasks") {
          invoke<ProjectTask[]>("list_project_tasks", { projectId: project.id })
            .then(onTasksUpdate)
            .catch(console.error);
        } else if (change === "artifacts") {
          invoke<ProjectArtifact[]>("list_project_artifacts", { projectId: project.id })
            .then(onArtifactsUpdate)
            .catch(console.error);
          loadFileRecords();
        } else if (change === "members") {
          invoke<ProjectMember[]>("list_project_members", { projectId: project.id })
            .then(onMembersUpdate)
            .catch(console.error);
        } else if (change === "messages") {
          invoke<ProjectMessage[]>("list_project_messages", { projectId: project.id })
            .then(onMessagesUpdate)
            .catch(console.error);
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [project.id, onTasksUpdate, onArtifactsUpdate, onMembersUpdate, onMessagesUpdate]);

  const mentionData = useMemo(
    () =>
      projectMembers.map((m) => {
        const role = allRoles.find((r) => r.id === m.roleId);
        return {
          id: m.roleId,
          display: role?.name || m.roleId,
        };
      }),
    [projectMembers, allRoles]
  );

  const renderSuggestion = (
    suggestion: { id: string | number; display?: string },
    _search: string,
    _highlightedDisplay: React.ReactNode
  ) => {
    const roleId = String(suggestion.id);
    const role = allRoles.find((r) => r.id === roleId);
    const icon = role?.icon || "🤖";
    const avatarColor = role?.avatarColor || "#6c5ce7";
    const displayName = suggestion.display || roleId;
    const name = role?.name || "";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: avatarColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
            {displayName}
          </span>
          {name && name !== displayName && (
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{name}</span>
          )}
        </div>
      </div>
    );
  };

  const renderMentionContent = (text: string) => {
    return text.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (_m, _id, display) => `@${display}`);
  };

  const handleProjectChatSend = async (content: string) => {
    if (projectChatStreaming) return;
    try {
      await invoke("create_project_message", {
        req: {
          projectId: project.id,
          roleId: "builtin_user",
          content,
          messageType: "text",
        },
      });
      const msgs = await invoke<ProjectMessage[]>("list_project_messages", {
        projectId: project.id,
      });
      onMessagesUpdate(msgs);
    } catch {
      // console.error("Failed to send message:", err);
    }

    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)(?=\s|$)/g;
    const mentionedRoleIds: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentionedRoleIds.push(match[1]);
    }
    const cleanContent = content.replace(
      /@\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, _id, display) => `@${display}`
    );

    if (mentionedRoleIds.length > 1) {
      setProjectChatStreaming(true);
      setProjectChatStreamed("");
      const eventId = `project_chat_multi_${project.id}_${Date.now()}`;
      const unlisten = await listen<{
        done: boolean;
        replies: Array<{ roleId: string; content: string }>;
        chunk?: string;
      }>(eventId, async (event) => {
        if (event.payload.done) {
          const replies = event.payload.replies || [];
          for (const reply of replies) {
            try {
              await invoke("create_project_message", {
                req: {
                  projectId: project.id,
                  roleId: reply.roleId,
                  content: reply.content,
                  messageType: "text",
                },
              });
            } catch {
              // console.error("Failed to save AI message:", err);
            }
          }
          const msgs = await invoke<ProjectMessage[]>("list_project_messages", {
            projectId: project.id,
          });
          onMessagesUpdate(msgs);
          setProjectChatStreaming(false);
          setProjectChatStreamed("");
          projectChatEventIdRef.current = "";
          loadFileRecords();
          unlisten();
        } else {
          setProjectChatStreamed((prev) => prev + (event.payload.chunk || ""));
        }
      });
      try {
        await invoke("chat_with_project_roles", {
          projectId: project.id,
          roleIds: mentionedRoleIds,
          message: cleanContent,
          eventId,
        });
      } catch {
        // console.error("Failed to chat with roles:", err);
        setProjectChatStreaming(false);
        setProjectChatStreamed("");
        projectChatEventIdRef.current = "";
        unlisten();
      }
      return;
    }

    const targetRole = mentionedRoleIds[0] || chatTargetRole || projectMembers[0]?.roleId;
    if (!targetRole) return;

    setProjectChatStreaming(true);
    setProjectChatStreamed("");

    const eventId = `project_chat_${project.id}_${Date.now()}`;
    projectChatEventIdRef.current = eventId;

    const unlisten = await listen<{
      chunk: string;
      done: boolean;
      fullContent?: string;
      cancelled?: boolean;
    }>(eventId, async (event) => {
      if (event.payload.done) {
        if (event.payload.cancelled) {
          setProjectChatStreaming(false);
          setProjectChatStreamed("");
          projectChatEventIdRef.current = "";
          unlisten();
          return;
        }
        const fullContent = event.payload.fullContent || "";
        try {
          await invoke("create_project_message", {
            req: {
              projectId: project.id,
              roleId: targetRole,
              content: fullContent,
              messageType: "text",
            },
          });
          const msgs = await invoke<ProjectMessage[]>("list_project_messages", {
            projectId: project.id,
          });
          onMessagesUpdate(msgs);
        } catch {
          // console.error("Failed to save AI message:", err);
        }
        setProjectChatStreaming(false);
        setProjectChatStreamed("");
        projectChatEventIdRef.current = "";
        loadFileRecords();
        unlisten();
      } else {
        setProjectChatStreamed((prev) => prev + event.payload.chunk);
      }
    });

    try {
      await invoke("chat_with_project_role", {
        projectId: project.id,
        roleId: targetRole,
        message: cleanContent,
        eventId,
      });
    } catch {
      // console.error("Failed to chat with role:", err);
      setProjectChatStreaming(false);
      setProjectChatStreamed("");
      projectChatEventIdRef.current = "";
      unlisten();
    }
  };

  const projectIcon = project.icon || "💼";

  return (
    <div className={`panel ${styles.studioPanel} ${styles.studioPanelProject}`}>
      <div className={styles.studioProjectDetail}>
        <div className={styles.studioProjectHeader}>
          <button
            className={styles.studioBackBtn}
            onClick={() => {
              onBack();
              setProjectDetailTab("overview");
            }}
            title={t("studio.backToList")}
          >
            ←
          </button>
          <span className={styles.studioProjectHeaderIcon}>{projectIcon}</span>
          <h2>{project.name}</h2>
          <div className={styles.studioHeaderMembers}>
            {projectMembers.slice(0, 5).map((member) => {
              const role = allRoles.find((r) => r.id === member.roleId);
              return (
                <div
                  key={member.id}
                  className={styles.studioHeaderMemberAvatar}
                  style={{ background: role?.avatarColor || "var(--color-primary, #6c5ce7)" }}
                  title={role ? `${role.icon} ${role.name}` : member.roleId}
                >
                  {role?.icon || "🤖"}
                </div>
              );
            })}
            {projectMembers.length > 5 && (
              <div className={styles.studioHeaderMemberAvatar + " " + styles.more}>
                +{projectMembers.length - 5}
              </div>
            )}
          </div>
          {project.tag && project.tag !== "none" && (
            <span className={styles.studioProjectTag + " " + getTagClass(project.tag)}>
              {getTagLabel(project.tag)}
            </span>
          )}
          <span
            className={`${styles.studioProjectStatus} ${styles["status" + project.status.charAt(0).toUpperCase() + project.status.slice(1)] || ""}`}
          >
            {project.status}
          </span>
        </div>

        <div className={styles.studioDetailTabs}>
          {(["overview", "taskmgmt", "kanban", "members", "workflows", "chat"] as const).map(
            (tab) => (
              <button
                key={tab}
                className={
                  styles.studioDetailTab + " " + (projectDetailTab === tab ? styles.active : "")
                }
                onClick={() => setProjectDetailTab(tab)}
              >
                {tab === "overview" && t("studio.overview")}
                {tab === "taskmgmt" && t("studio.tasks")}
                {tab === "kanban" && t("studio.kanban")}
                {tab === "members" && t("studio.members")}
                {tab === "workflows" && t("studio.workflows")}
                {tab === "chat" && t("studio.chat")}
              </button>
            )
          )}
        </div>

        <div className={styles.studioDetailBody}>
          {projectDetailTab === "taskmgmt" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  padding: "8px 12px",
                  borderBottom: "1px solid #e9ecef",
                }}
              >
                <button
                  onClick={() => setTaskSubTab("list")}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 4,
                    border: "1px solid #ddd",
                    background: taskSubTab === "list" ? "#6c5ce7" : "#fff",
                    color: taskSubTab === "list" ? "#fff" : "#333",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {t("studio.taskList")}
                </button>
                <button
                  onClick={() => setTaskSubTab("pending")}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 4,
                    border: "1px solid #ddd",
                    background: taskSubTab === "pending" ? "#6c5ce7" : "#fff",
                    color: taskSubTab === "pending" ? "#fff" : "#333",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {t("studio.pendingReview")}
                </button>
              </div>
              {taskSubTab === "list" ? (
                <TaskManagement
                  tasks={projectTasks}
                  projectId={project.id}
                  projectMembers={projectMembers}
                  allRoles={allRoles}
                  onTasksUpdate={onTasksUpdate}
                  projectFileRecords={projectFileRecords}
                  onPreviewFile={onPreviewFile}
                />
              ) : (
                <PendingReviewPanel
                  projectId={project.id}
                  allRoles={allRoles}
                  onReviewComplete={() => onTasksUpdate(projectTasks)}
                />
              )}
            </div>
          )}

          {projectDetailTab === "kanban" && (
            <TaskBoard
              tasks={projectTasks}
              projectId={project.id}
              projectMembers={projectMembers}
              allRoles={allRoles}
              onTasksUpdate={onTasksUpdate}
            />
          )}

          {projectDetailTab === "overview" && (
            <>
              <div className={styles.studioDetailLeft}>
                <div className={styles.studioDetailSection}>
                  <div className={styles.studioDetailSectionHeader}>
                    <h3>{t("studio.projectOverview")}</h3>
                  </div>
                  <div className={styles.studioOverviewTabs}>
                    <button
                      className={
                        styles.studioOverviewTab +
                        " " +
                        (overviewSubTab === "tasks" ? styles.active : "")
                      }
                      onClick={() => setOverviewSubTab("tasks")}
                      onDoubleClick={() => setProjectDetailTab("taskmgmt")}
                      title={t("studio.dblclickToManage")}
                    >
                      📋 任务{" "}
                      <span className={styles.studioOverviewTabCount}>{projectTasks.length}</span>
                    </button>
                    <button
                      className={
                        styles.studioOverviewTab +
                        " " +
                        (overviewSubTab === "artifacts" ? styles.active : "")
                      }
                      onClick={() => setOverviewSubTab("artifacts")}
                    >
                      📦 产物{" "}
                      <span className={styles.studioOverviewTabCount}>
                        {projectFileRecords.length}
                      </span>
                    </button>
                  </div>

                  <div className={styles.studioArtifactListSection}>
                    {overviewSubTab === "tasks" && (
                      <>
                        {projectTasks.length === 0 ? (
                          <p className={styles.studioEmpty}>暂无任务</p>
                        ) : (
                          <div className={styles.studioArtifactList}>
                            {projectTasks.map((task) => {
                              const taskStatusConfig: Record<
                                string,
                                { label: string; color: string; icon: string }
                              > = {
                                triage: {
                                  label: t("studio.taskStatus.triage"),
                                  color: "#b2bec3",
                                  icon: "📥",
                                },
                                todo: {
                                  label: t("studio.taskStatus.todo"),
                                  color: "#636e72",
                                  icon: "📋",
                                },
                                ready: {
                                  label: t("studio.taskStatus.ready"),
                                  color: "#0984e3",
                                  icon: "🟢",
                                },
                                running: {
                                  label: t("studio.taskStatus.running"),
                                  color: "#fdcb6e",
                                  icon: "🔄",
                                },
                                done: {
                                  label: t("studio.taskStatus.done"),
                                  color: "#00b894",
                                  icon: "✅",
                                },
                                failed: {
                                  label: t("studio.taskStatus.failed"),
                                  color: "#e17055",
                                  icon: "❌",
                                },
                                blocked: {
                                  label: t("studio.taskStatus.blocked"),
                                  color: "#e17055",
                                  icon: "🚫",
                                },
                              };
                              const tsc = taskStatusConfig[task.status] || {
                                label: task.status,
                                color: "#999",
                                icon: "📌",
                              };
                              return (
                                <div key={task.id} className={styles.studioArtifactListItem}>
                                  <span className={styles.studioArtifactListItemIcon}>
                                    {tsc.icon}
                                  </span>
                                  <div className={styles.studioArtifactListItemInfo}>
                                    <div className={styles.studioArtifactListItemTitle}>
                                      {task.title}
                                    </div>
                                    <div className={styles.studioArtifactListItemMeta}>
                                      {task.priority > 0 && (
                                        <span className={styles.studioArtifactListItemRole}>
                                          {task.priority >= 3
                                            ? t("studio.taskPriority.high")
                                            : task.priority <= 1
                                              ? t("studio.taskPriority.low")
                                              : t("studio.taskPriority.medium")}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span
                                    className={styles.studioArtifactListItemStatus}
                                    style={{ color: tsc.color }}
                                  >
                                    {tsc.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}

                    {overviewSubTab === "artifacts" && (
                      <>
                        {projectFileRecords.length === 0 ? (
                          <p className={styles.studioEmpty}>暂无产物</p>
                        ) : (
                          <ArtifactTree
                            tasks={projectTasks}
                            fileRecords={projectFileRecords}
                            allRoles={allRoles}
                            getRoleNamePure={getRoleNamePure}
                            onPreviewFile={(path, name) => onPreviewFile(path, name)}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.studioDetailCenter}>
                <div className={styles.studioDetailSection}>
                  <div className={styles.studioDetailSectionHeader}>
                    <h3>🏢 {t("studio.virtualOffice")}</h3>
                  </div>
                  <div className={styles.studioOfficeScene}>
                    <Suspense
                      fallback={
                        <div style={{ padding: 20, color: "#999", textAlign: "center" }}>
                          加载虚拟办公...
                        </div>
                      }
                    >
                      <VirtualOffice
                        members={projectMembers.map((member) => {
                          const role = allRoles.find((r) => r.id === member.roleId);
                          const roleArtifacts = projectArtifacts.filter(
                            (a) => a.roleId === member.roleId
                          );
                          const hasActiveTask = projectTasks.some(
                            (t) =>
                              t.assignee === member.roleId &&
                              (t.status === "ready" || t.status === "running")
                          );
                          const hasInProgressArtifact = roleArtifacts.some(
                            (a) => a.status === "in_progress"
                          );
                          const hasSubmittedArtifact = roleArtifacts.some(
                            (a) => a.status === "submitted"
                          );
                          const isWorking =
                            hasInProgressArtifact || (hasActiveTask && !hasSubmittedArtifact);
                          const isWaitingApproval = hasSubmittedArtifact;
                          const memberStatus = isWorking
                            ? ("working" as const)
                            : isWaitingApproval
                              ? ("waiting_approval" as const)
                              : ("idle" as const);
                          return {
                            id: member.id,
                            name: getRoleNamePure(member.roleId),
                            icon: role?.icon || "🤖",
                            color: role?.avatarColor || "#6c5ce7",
                            isWorking,
                            status: memberStatus,
                            preset: role?.avatarPreset,
                            roleId: member.roleId,
                          };
                        })}
                        workflows={projectWorkflows.map((wf) => ({
                          fromRoleId: wf.fromRoleId,
                          toRoleId: wf.toRoleId,
                          artifactType: wf.artifactType || "",
                          transitionType: wf.transitionType || "auto_push",
                          rejectToRoleId: wf.rejectToRoleId || "",
                        }))}
                        officeTheme={project?.officeTheme || "cozy"}
                        officeLayout={project?.officeLayout || "standard"}
                        onSpeak={(_memberId, text) => {
                          onSendMessage(text);
                        }}
                        onDeliverComplete={(fromRoleId, toRoleId, artifactType) => {
                          if (
                            fromRoleId &&
                            toRoleId &&
                            fromRoleId !== "start" &&
                            fromRoleId !== "end" &&
                            toRoleId !== "start" &&
                            toRoleId !== "end"
                          ) {
                            invoke("auto_delegate_chat", {
                              projectId: project.id,
                              fromRoleId,
                              toRoleId,
                              contextMessage: `产物「${artifactType || "工作产出"}」已交付，请基于上游产出继续工作。`,
                              eventId: `deliver-${Date.now()}`,
                              taskId: null,
                            })
                              .then(async () => {
                                const msgs = await invoke<ProjectMessage[]>(
                                  "list_project_messages",
                                  {
                                    projectId: project.id,
                                  }
                                );
                                onMessagesUpdate(msgs);
                                const artifacts = await invoke<ProjectArtifact[]>(
                                  "list_project_artifacts",
                                  {
                                    projectId: project.id,
                                  }
                                );
                                onArtifactsUpdate(artifacts);
                              })
                              .catch(console.error);
                          }
                        }}
                      />
                    </Suspense>
                  </div>
                </div>
                <ActivityFeed
                  projectId={project.id}
                  allRoles={allRoles}
                  getRoleName={getRoleName}
                />
              </div>
            </>
          )}

          {projectDetailTab === "members" && (
            <RoleManager
              projectMembers={projectMembers}
              allRoles={allRoles}
              projectId={project.id}
              onMembersUpdate={onMembersUpdate}
              onArtifactsUpdate={onArtifactsUpdate}
              getRoleName={getRoleName}
              t={t}
            />
          )}

          {projectDetailTab === "workflows" && (
            <div className={styles.studioDetailFull}>
              <div className={styles.studioDetailSection + " " + styles.studioWorkflowSection}>
                <div className={styles.studioDetailSectionHeader}>
                  <h3>🔄 {t("studio.projectTab.workflows")}</h3>
                </div>
                <div className={styles.studioWorkflowDesigner}>
                  <WorkflowDesigner
                    projectId={project.id}
                    roles={allRoles}
                    projectMembers={projectMembers}
                    t={t}
                  />
                </div>
              </div>
            </div>
          )}

          {projectDetailTab === "chat" && (
            <div className={styles.studioDetailFull}>
              <div className={styles.studioDetailSection + " " + styles.studioChatFullSection}>
                <div className={styles.studioDetailSectionHeader}>
                  <h3>💬 {t("studio.chatHistory")}</h3>
                  <div className={styles.studioChatTarget}>
                    <span className={styles.studioChatTargetLabel}>对话角色：</span>
                    <select
                      className={styles.studioSelect + " " + styles.studioSelectSm}
                      value={chatTargetRole}
                      onChange={(e) => setChatTargetRole(e.target.value)}
                    >
                      <option value="">全部角色</option>
                      {projectMembers.map((member) => {
                        const role = allRoles.find((r) => r.id === member.roleId);
                        return (
                          <option key={member.id} value={member.roleId}>
                            {role?.icon || "🤖"} {role?.name || "未知"}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                <div className={styles.studioChatMessages} ref={chatMessagesRef}>
                  {projectMessages.map((msg) => {
                    const role = allRoles.find((r) => r.id === msg.roleId);
                    const isUser = msg.roleId === "builtin_user";
                    const avatarColor = role?.avatarColor || "#6c5ce7";
                    return (
                      <div
                        key={msg.id}
                        className={
                          styles.studioChatMsg + " " + (isUser ? styles.studioChatMsgUser : "")
                        }
                      >
                        <div
                          className={styles.studioChatAvatar}
                          style={{ background: avatarColor }}
                        >
                          {isUser ? "👤" : role?.icon || "🤖"}
                        </div>
                        <div className={styles.studioChatBubble}>
                          <span className={styles.studioChatName} style={{ color: avatarColor }}>
                            {isUser ? "用户" : role?.name || "未知"}
                          </span>
                          <div className={styles.studioChatText}>
                            <MarkdownRenderer content={renderMentionContent(msg.content)} />
                          </div>
                          <span className={styles.studioChatTime}>
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {projectChatStreaming && projectChatStreamed && (
                    <div className={styles.studioChatMsg}>
                      <div
                        className={styles.studioChatAvatar}
                        style={{
                          background:
                            allRoles.find(
                              (r) => r.id === (chatTargetRole || projectMembers[0]?.roleId)
                            )?.avatarColor || "#6c5ce7",
                        }}
                      >
                        {allRoles.find(
                          (r) => r.id === (chatTargetRole || projectMembers[0]?.roleId)
                        )?.icon || "🤖"}
                      </div>
                      <div className={styles.studioChatBubble}>
                        <span
                          className={styles.studioChatName}
                          style={{
                            color:
                              allRoles.find(
                                (r) => r.id === (chatTargetRole || projectMembers[0]?.roleId)
                              )?.avatarColor || "#6c5ce7",
                          }}
                        >
                          {(() => {
                            const r = allRoles.find(
                              (r) => r.id === (chatTargetRole || projectMembers[0]?.roleId)
                            );
                            return r?.name || "AI";
                          })()}
                        </span>
                        <div className={styles.studioChatText}>
                          <MarkdownRenderer content={projectChatStreamed} />
                        </div>
                        <span className={styles.studioChatTyping}>正在输入...</span>
                      </div>
                    </div>
                  )}
                  {projectMessages.length === 0 && !projectChatStreaming && (
                    <p className={styles.studioEmpty}>暂无沟通记录，发送消息开始对话</p>
                  )}
                </div>
                <div className={styles.studioChatInputArea}>
                  {chatRoleSkills.length > 0 && (
                    <div className={styles.studioChatSkillHints}>
                      <span className={styles.studioChatSkillLabel}>可用技能：</span>
                      {chatRoleSkills.map((s) => (
                        <span
                          key={s}
                          className={styles.studioChatSkillTag}
                          onClick={() => setChatInput((prev) => prev + `[技能:${s}] `)}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className={styles.studioChatInputRow}>
                    <div className={styles.studioChatInputBox}>
                      <MentionsInput
                        className={`${styles.studioChatMentions} chatMentions`}
                        value={chatInput}
                        onChange={(_e, newValue: string) => {
                          setChatInput(newValue);
                          chatInputRef.current = newValue;
                        }}
                        allowSuggestionsAboveCursor={true}
                        placeholder={
                          projectChatStreaming
                            ? t("studio.chat.replying")
                            : t("studio.chat.placeholder")
                        }
                        disabled={projectChatStreaming}
                        onKeyDown={(e: React.KeyboardEvent) => {
                          const currentInput = chatInputRef.current;
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            currentInput.trim() &&
                            !projectChatStreaming
                          ) {
                            e.preventDefault();
                            handleProjectChatSend(currentInput.trim());
                            setChatInput("");
                            chatInputRef.current = "";
                          }
                        }}
                        style={{
                          control: {
                            fontSize: 13,
                            minHeight: 80,
                            border: "none",
                            borderRadius: 0,
                            padding: "10px 12px",
                            color: "var(--text-primary)",
                            backgroundColor: "transparent",
                          },
                          highlighter: {
                            padding: "10px 12px",
                            border: "1px solid transparent",
                          },
                          input: {
                            padding: "10px 12px",
                            border: "none",
                            outline: "none",
                          },
                          suggestions: {
                            list: {
                              backgroundColor: "var(--bg-primary)",
                              border: "1px solid var(--border-color)",
                              borderRadius: 10,
                              fontSize: 13,
                              zIndex: 9999,
                            },
                            item: {
                              padding: "6px 12px",
                              borderBottom: "1px solid var(--border-color)",
                              "&focused": {
                                backgroundColor: "var(--bg-hover)",
                              },
                            },
                          },
                        }}
                      >
                        <Mention
                          trigger="@"
                          data={mentionData}
                          markup="@[__id__](__display__)"
                          displayTransform={(_id: string, display: string) => `@${display}`}
                          renderSuggestion={renderSuggestion}
                        />
                      </MentionsInput>

                      <div className={styles.studioChatInputActions}>
                        <div className={styles.studioChatInputActionsLeft}>
                          {projectWorkflows.length > 0 && projectMembers.length > 1 && (
                            <button
                              className={styles.studioChatAutoBtn}
                              disabled={autoDelegateRunning || projectChatStreaming}
                              title={
                                autoDelegateRunning
                                  ? t("studio.chat.autoDelegating")
                                  : t("studio.chat.autoDelegateDesc")
                              }
                              onClick={async () => {
                                if (autoDelegateRunning) return;
                                setAutoDelegateRunning(true);
                                try {
                                  const firstMember = projectMembers[0];
                                  if (!firstMember) return;
                                  const startRoleId = chatTargetRole || firstMember.roleId;
                                  const message =
                                    chatInput.trim() || t("studio.chat.defaultPrompt");
                                  await invoke("run_workflow_auto_chat", {
                                    projectId: project.id,
                                    startRoleId,
                                    initialMessage: message,
                                    eventId: `auto-chat-${Date.now()}`,
                                  });
                                  const msgs = await invoke<ProjectMessage[]>(
                                    "list_project_messages",
                                    {
                                      projectId: project.id,
                                    }
                                  );
                                  onMessagesUpdate(msgs);
                                  setChatInput("");
                                } catch {
                                  // console.error("Auto delegate failed:", err);
                                } finally {
                                  setAutoDelegateRunning(false);
                                }
                              }}
                            >
                              <span className={styles.studioChatAutoBtnIcon}>
                                {autoDelegateRunning ? "⏳" : "⚡"}
                              </span>
                            </button>
                          )}
                        </div>
                        <button
                          className={`${styles.studioChatSendBtn} ${projectChatStreaming ? styles.studioChatStopBtn : ""}`}
                          disabled={!projectChatStreaming && !chatInput.trim()}
                          onClick={() => {
                            if (projectChatStreaming) {
                              if (projectChatEventIdRef.current) {
                                invoke("stop_chat_stream", {
                                  eventId: projectChatEventIdRef.current,
                                });
                              }
                            } else if (chatInput.trim()) {
                              handleProjectChatSend(chatInput.trim());
                              setChatInput("");
                              chatInputRef.current = "";
                            }
                          }}
                          title={
                            projectChatStreaming ? t("studio.chat.stop") : t("studio.chat.send")
                          }
                        >
                          {projectChatStreaming ? (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                              <rect x="1" y="1" width="12" height="12" rx="2" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path
                                d="M1 8L15 2L12 15L8.5 9.5L1 8Z"
                                fill="currentColor"
                                stroke="currentColor"
                                strokeWidth="0.8"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ArtifactReviewReminder
        projectId={project.id}
        onGoToReview={() => {
          setProjectDetailTab("taskmgmt");
          setTaskSubTab("pending");
        }}
      />
    </div>
  );
}

export default ProjectDetail;
