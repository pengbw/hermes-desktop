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
      } catch (err) {
        console.error("Failed to load activities:", err);
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
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  if (activities.length === 0) return null;

  return (
    <div className={styles.studioDetailSection}>
      <div className={styles.studioDetailSectionHeader}>
        <h3>📊 项目动态</h3>
      </div>
      <div className={styles.activityFeed}>
        {activities.map((act) => (
          <div key={act.id} className={styles.activityItem}>
            <span className={styles.activityIcon}>{ACTION_ICONS[act.action] || "📌"}</span>
            <span className={styles.activityRole}>
              {act.roleId ? getRoleName(act.roleId) : "系统"}
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
  getTagLabel,
  getTagClass,
  t,
}: ProjectDetailProps) {
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const [projectDetailTab, setProjectDetailTab] = useState<
    "overview" | "taskmgmt" | "kanban" | "members" | "workflows" | "chat"
  >("overview");
  const [chatInput, setChatInput] = useState("");
  const [chatTargetRole, setChatTargetRole] = useState<string>("");
  const [projectChatStreaming, setProjectChatStreaming] = useState(false);
  const [projectChatStreamed, setProjectChatStreamed] = useState("");
  const [autoDelegateRunning, setAutoDelegateRunning] = useState(false);
  const [overviewSubTab, setOverviewSubTab] = useState<"tasks" | "artifacts" | "members">("tasks");
  const [taskSubTab, setTaskSubTab] = useState<"list" | "pending">("list");
  const [chatRoleSkills, setChatRoleSkills] = useState<string[]>([]);
  const [projectFileRecords, setProjectFileRecords] = useState<ProjectFileRecord[]>([]);

  const fileRecordsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFileRecords = useCallback(() => {
    if (fileRecordsTimerRef.current) clearTimeout(fileRecordsTimerRef.current);
    fileRecordsTimerRef.current = setTimeout(() => {
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
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [project.id, onTasksUpdate, onArtifactsUpdate, onMembersUpdate]);

  const sortedMembers = useMemo(() => {
    const roleOrder = new Map<string, number>();
    let order = 0;
    for (const wf of projectWorkflows) {
      if (
        wf.fromRoleId &&
        wf.fromRoleId !== "start" &&
        wf.fromRoleId !== "end" &&
        !roleOrder.has(wf.fromRoleId)
      ) {
        roleOrder.set(wf.fromRoleId, order++);
      }
      if (
        wf.toRoleId &&
        wf.toRoleId !== "start" &&
        wf.toRoleId !== "end" &&
        !roleOrder.has(wf.toRoleId)
      ) {
        roleOrder.set(wf.toRoleId, order++);
      }
    }
    return [...projectMembers].sort((a, b) => {
      const oa = roleOrder.get(a.roleId) ?? 999;
      const ob = roleOrder.get(b.roleId) ?? 999;
      return oa - ob;
    });
  }, [projectMembers, projectWorkflows]);

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
    } catch (err) {
      console.error("Failed to send message:", err);
    }

    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentionedRoleIds: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentionedRoleIds.push(match[1]);
    }
    const cleanContent = content.replace(mentionRegex, (_m, _id, display) => `@${display}`);

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
            } catch (err) {
              console.error("Failed to save AI message:", err);
            }
          }
          const msgs = await invoke<ProjectMessage[]>("list_project_messages", {
            projectId: project.id,
          });
          onMessagesUpdate(msgs);
          setProjectChatStreaming(false);
          setProjectChatStreamed("");
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
      } catch (err) {
        console.error("Failed to chat with roles:", err);
        setProjectChatStreaming(false);
        setProjectChatStreamed("");
        unlisten();
      }
      return;
    }

    const targetRole = mentionedRoleIds[0] || chatTargetRole || projectMembers[0]?.roleId;
    if (!targetRole) return;

    setProjectChatStreaming(true);
    setProjectChatStreamed("");

    const eventId = `project_chat_${project.id}_${Date.now()}`;

    const unlisten = await listen<{ chunk: string; done: boolean; fullContent?: string }>(
      eventId,
      async (event) => {
        if (event.payload.done) {
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
          } catch (err) {
            console.error("Failed to save AI message:", err);
          }
          setProjectChatStreaming(false);
          setProjectChatStreamed("");
          loadFileRecords();
          unlisten();
        } else {
          setProjectChatStreamed((prev) => prev + event.payload.chunk);
        }
      }
    );

    try {
      await invoke("chat_with_project_role", {
        projectId: project.id,
        roleId: targetRole,
        message: cleanContent,
        eventId,
      });
    } catch (err) {
      console.error("Failed to chat with role:", err);
      setProjectChatStreaming(false);
      setProjectChatStreamed("");
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
                {tab === "overview" && "🏢 概览"}
                {tab === "taskmgmt" && "📋 任务"}
                {tab === "kanban" && "📊 看板"}
                {tab === "members" && "👥 成员"}
                {tab === "workflows" && "🔄 工作流"}
                {tab === "chat" && "💬 对话"}
              </button>
            )
          )}
        </div>

        <div className={styles.studioDetailBody}>
          {projectDetailTab === "taskmgmt" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
                  📋 任务列表
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
                  🔔 待办审核
                </button>
              </div>
              {taskSubTab === "list" ? (
                <TaskManagement
                  tasks={projectTasks}
                  projectId={project.id}
                  projectMembers={projectMembers}
                  allRoles={allRoles}
                  onTasksUpdate={onTasksUpdate}
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
                    <h3>📋 项目概括</h3>
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
                      title="双击进入任务管理"
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
                    <button
                      className={
                        styles.studioOverviewTab +
                        " " +
                        (overviewSubTab === "members" ? styles.active : "")
                      }
                      onClick={() => setOverviewSubTab("members")}
                    >
                      👥 人员{" "}
                      <span className={styles.studioOverviewTabCount}>{projectMembers.length}</span>
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
                                triage: { label: "待分类", color: "#b2bec3", icon: "📥" },
                                todo: { label: "待办", color: "#636e72", icon: "📋" },
                                ready: { label: "就绪", color: "#0984e3", icon: "🟢" },
                                running: { label: "进行中", color: "#fdcb6e", icon: "🔄" },
                                done: { label: "已完成", color: "#00b894", icon: "✅" },
                                blocked: { label: "阻塞", color: "#e17055", icon: "🚫" },
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
                                      {task.assignee && (
                                        <span className={styles.studioArtifactListItemRole}>
                                          {getRoleName(task.assignee)}
                                        </span>
                                      )}
                                      {task.priority > 0 && (
                                        <span className={styles.studioArtifactListItemRole}>
                                          {task.priority >= 3
                                            ? "🔴高"
                                            : task.priority <= 1
                                              ? "🟢低"
                                              : "🟡中"}
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
                          <div className={styles.studioArtifactGroupList}>
                            {(() => {
                              const grouped = projectFileRecords.reduce(
                                (acc, rec) => {
                                  const key = rec.roleId || "_unassigned";
                                  if (!acc[key]) acc[key] = [];
                                  acc[key].push(rec);
                                  return acc;
                                },
                                {} as Record<string, ProjectFileRecord[]>
                              );
                              return Object.entries(grouped).map(([roleId, files]) => {
                                const isUnassigned = roleId === "_unassigned";
                                const role = isUnassigned
                                  ? null
                                  : allRoles.find((r) => r.id === roleId);
                                const roleName = isUnassigned ? "未分配" : getRoleName(roleId);
                                const extIcon: Record<string, string> = {
                                  md: "📝",
                                  txt: "📄",
                                  json: "📋",
                                  yaml: "📋",
                                  yml: "📋",
                                  ts: "💻",
                                  tsx: "💻",
                                  js: "💻",
                                  jsx: "💻",
                                  py: "🐍",
                                  html: "🌐",
                                  css: "🎨",
                                  svg: "🖼️",
                                  png: "🖼️",
                                  jpg: "🖼️",
                                  pdf: "📕",
                                  doc: "📘",
                                  docx: "📘",
                                  xls: "📗",
                                  xlsx: "📗",
                                };
                                return (
                                  <div key={roleId} className={styles.studioArtifactGroup}>
                                    <div className={styles.studioArtifactGroupHeader}>
                                      <span className={styles.studioArtifactGroupIcon}>
                                        {isUnassigned ? "📁" : role?.icon || "🤖"}
                                      </span>
                                      <span className={styles.studioArtifactGroupName}>
                                        {roleName}
                                      </span>
                                      <span className={styles.studioArtifactGroupCount}>
                                        {files.length} 文件
                                      </span>
                                    </div>
                                    <div className={styles.studioArtifactGroupFiles}>
                                      {files.map((file) => {
                                        const icon = extIcon[file.fileExt] || "📄";
                                        const sizeStr =
                                          file.fileSize > 1024 * 1024
                                            ? `${(file.fileSize / 1024 / 1024).toFixed(1)}MB`
                                            : file.fileSize > 1024
                                              ? `${(file.fileSize / 1024).toFixed(1)}KB`
                                              : `${file.fileSize}B`;
                                        return (
                                          <div
                                            key={file.id}
                                            className={styles.studioArtifactFileItem}
                                            onClick={() => {
                                              if (file.filePath) {
                                                onPreviewFile(file.filePath, file.fileName);
                                              }
                                            }}
                                            style={{ cursor: "pointer" }}
                                          >
                                            <span className={styles.studioArtifactFileIcon}>
                                              {icon}
                                            </span>
                                            <div className={styles.studioArtifactFileInfo}>
                                              <span className={styles.studioArtifactFileName}>
                                                {file.fileName}
                                              </span>
                                              <div className={styles.studioArtifactFileMeta}>
                                                <span className={styles.studioArtifactFileSize}>
                                                  {sizeStr}
                                                </span>
                                                {file.description && (
                                                  <span className={styles.studioArtifactFileDesc}>
                                                    {file.description}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <span className={styles.studioArtifactFileTag}>
                                              {roleName}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </>
                    )}

                    {overviewSubTab === "members" && (
                      <>
                        {sortedMembers.length === 0 ? (
                          <p className={styles.studioEmpty}>暂无成员</p>
                        ) : (
                          <div className={styles.studioArtifactList}>
                            {sortedMembers.map((member) => {
                              const role = allRoles.find((r) => r.id === member.roleId);
                              const memberArtifact = projectArtifacts.find(
                                (a) => a.roleId === member.roleId
                              );
                              const isWorking =
                                memberArtifact?.status === "in_progress" ||
                                memberArtifact?.status === "pending";
                              const isWaitingApproval = memberArtifact?.status === "submitted";
                              return (
                                <div key={member.id} className={styles.studioArtifactListItem}>
                                  <div className={styles.studioArtifactListItemInfo}>
                                    <div className={styles.studioArtifactListItemTitle}>
                                      {getRoleName(member.roleId)}
                                    </div>
                                    <div className={styles.studioArtifactListItemMeta}>
                                      <span className={styles.studioArtifactListItemRole}>
                                        {role?.name || "AI角色"}
                                      </span>
                                      {isWorking && (
                                        <span
                                          className={styles.studioArtifactListItemPath}
                                          style={{ color: "#0984e3" }}
                                        >
                                          工作中
                                        </span>
                                      )}
                                      {isWaitingApproval && (
                                        <span
                                          className={styles.studioArtifactListItemPath}
                                          style={{ color: "#fdcb6e" }}
                                        >
                                          待审批
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span
                                    className={styles.studioArtifactListItemStatus}
                                    style={{
                                      color: isWorking
                                        ? "#0984e3"
                                        : isWaitingApproval
                                          ? "#fdcb6e"
                                          : "#00b894",
                                    }}
                                  >
                                    {isWorking ? "忙碌" : isWaitingApproval ? "待审批" : "空闲"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
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
                          const memberArtifact = projectArtifacts.find(
                            (a) => a.roleId === member.roleId
                          );
                          const hasActiveTask = projectTasks.some(
                            (t) =>
                              t.assignee === member.roleId &&
                              (t.status === "ready" || t.status === "running")
                          );
                          const hasSubmittedArtifact = projectArtifacts.some(
                            (a) => a.roleId === member.roleId && a.status === "submitted"
                          );
                          const isWorking =
                            memberArtifact?.status === "in_progress" ||
                            memberArtifact?.status === "pending" ||
                            hasActiveTask;
                          const isWaitingApproval = hasSubmittedArtifact && !hasActiveTask;
                          const memberStatus = isWorking
                            ? ("working" as const)
                            : isWaitingApproval
                              ? ("waiting_approval" as const)
                              : ("idle" as const);
                          return {
                            id: member.id,
                            name: getRoleName(member.roleId),
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
                    <MentionsInput
                      className={`${styles.studioChatMentions} chatMentions`}
                      value={chatInput}
                      onChange={(_e, newValue: string) => setChatInput(newValue)}
                      placeholder={
                        projectChatStreaming ? "AI 正在回复..." : "输入消息，@ 提及角色..."
                      }
                      disabled={projectChatStreaming}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          chatInput.trim() &&
                          !projectChatStreaming
                        ) {
                          e.preventDefault();
                          handleProjectChatSend(chatInput.trim());
                          setChatInput("");
                        }
                      }}
                      style={{
                        control: {
                          backgroundColor: "var(--bg-secondary)",
                          fontSize: 13,
                          minHeight: 36,
                          border: "1px solid var(--border-color)",
                          borderRadius: 8,
                          padding: "6px 10px",
                          color: "var(--text-primary)",
                        },
                        highlighter: {
                          padding: "6px 10px",
                          border: "1px solid transparent",
                        },
                        input: {
                          padding: "6px 10px",
                          border: "1px solid transparent",
                          outline: "none",
                        },
                        suggestions: {
                          list: {
                            backgroundColor: "var(--bg-primary)",
                            border: "1px solid var(--border-color)",
                            borderRadius: 6,
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
                    <button
                      className={styles.studioChatSendBtn}
                      disabled={projectChatStreaming || !chatInput.trim()}
                      onClick={() => {
                        if (chatInput.trim() && !projectChatStreaming) {
                          handleProjectChatSend(chatInput.trim());
                          setChatInput("");
                        }
                      }}
                    >
                      {projectChatStreaming ? "..." : "发送"}
                    </button>
                  </div>
                  {projectWorkflows.length > 0 && projectMembers.length > 1 && (
                    <button
                      className={styles.studioChatAutoBtn}
                      disabled={autoDelegateRunning || projectChatStreaming}
                      onClick={async () => {
                        if (autoDelegateRunning) return;
                        setAutoDelegateRunning(true);
                        try {
                          const firstMember = projectMembers[0];
                          if (!firstMember) return;
                          const startRoleId = chatTargetRole || firstMember.roleId;
                          const message =
                            chatInput.trim() ||
                            "请开始执行你的工作任务，完成后将产出传递给下游角色。";
                          await invoke("run_workflow_auto_chat", {
                            projectId: project.id,
                            startRoleId,
                            initialMessage: message,
                            eventId: `auto-chat-${Date.now()}`,
                          });
                          const msgs = await invoke<ProjectMessage[]>("list_project_messages", {
                            projectId: project.id,
                          });
                          onMessagesUpdate(msgs);
                          setChatInput("");
                        } catch (err) {
                          console.error("Auto delegate failed:", err);
                        } finally {
                          setAutoDelegateRunning(false);
                        }
                      }}
                    >
                      {autoDelegateRunning ? "🔄 协作中..." : "🤝 自动协作"}
                    </button>
                  )}
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
