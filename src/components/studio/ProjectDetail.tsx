import { useState, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { MentionsInput, Mention } from "react-mentions";
import type {
  ProjectItem,
  ProjectMember,
  ProjectArtifact,
  ProjectWorkflow,
  ProjectTask,
  ProjectMessage,
  AiRoleItem,
} from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import WorkflowDesigner from "../../windows/WorkflowDesigner";
import MarkdownRenderer from "../../components/MarkdownRenderer";
import ArtifactView from "./ArtifactView";
import RoleManager from "./RoleManager";
import TaskBoard from "./TaskBoard";

const VirtualOffice = lazy(() => import("../../windows/VirtualOffice"));

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
    "overview" | "members" | "workflows" | "chat" | "tasks"
  >("overview");
  const [artifactViewMode, setArtifactViewMode] = useState<"kanban" | "list">("kanban");
  const [chatInput, setChatInput] = useState("");
  const [chatTargetRole, setChatTargetRole] = useState<string>("");
  const [projectChatStreaming, setProjectChatStreaming] = useState(false);
  const [projectChatStreamed, setProjectChatStreamed] = useState("");
  const [autoDelegateRunning, setAutoDelegateRunning] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ artifactId: string; open: boolean }>({
    artifactId: "",
    open: false,
  });

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [projectMessages, projectChatStreamed]);
  const [rejectReason, setRejectReason] = useState("");

  const handleArtifactApprove = async (artifactId: string, approved: boolean) => {
    try {
      if (approved) {
        await invoke("approve_project_artifact", { id: artifactId });
        const artifact = projectArtifacts.find((a) => a.id === artifactId);
        if (artifact) {
          try {
            await invoke("trigger_workflow_execution", {
              projectId: project.id,
              fromRoleId: artifact.roleId,
              artifactType: artifact.artifactType || undefined,
            });
          } catch (wfErr) {
            console.warn("No downstream workflow found:", wfErr);
          }
        }
      } else {
        setRejectModal({ artifactId, open: true });
        return;
      }
      const artifacts = await invoke<ProjectArtifact[]>("list_project_artifacts", {
        projectId: project.id,
      });
      onArtifactsUpdate(artifacts);
    } catch (err) {
      console.error("Failed to update artifact:", err);
    }
  };

  const handleArtifactReject = async () => {
    if (!rejectModal.artifactId) return;
    try {
      await invoke("reject_project_artifact", {
        id: rejectModal.artifactId,
        reason: rejectReason || "需要修改",
      });
      const artifacts = await invoke<ProjectArtifact[]>("list_project_artifacts", {
        projectId: project.id,
      });
      onArtifactsUpdate(artifacts);
    } catch (err) {
      console.error("Failed to reject artifact:", err);
    } finally {
      setRejectModal({ artifactId: "", open: false });
      setRejectReason("");
    }
  };

  const mentionData = useMemo(
    () =>
      projectMembers
        .filter((m) => m.roleId !== "builtin_user")
        .map((m) => {
          const role = allRoles.find((r) => r.id === m.roleId);
          return {
            id: m.roleId,
            display: role?.nickname || role?.name || m.roleId,
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

    const targetRole =
      mentionedRoleIds[0] ||
      chatTargetRole ||
      projectMembers.find((m) => m.roleId !== "builtin_user")?.roleId;
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
          {(["overview", "tasks", "members", "workflows", "chat"] as const).map((tab) => (
            <button
              key={tab}
              className={
                styles.studioDetailTab + " " + (projectDetailTab === tab ? styles.active : "")
              }
              onClick={() => setProjectDetailTab(tab)}
            >
              {tab === "overview" && "🏢 概览"}
              {tab === "tasks" && "📋 看板"}
              {tab === "members" && "👥 成员"}
              {tab === "workflows" && "🔄 工作流"}
              {tab === "chat" && "💬 对话"}
            </button>
          ))}
        </div>

        <div className={styles.studioDetailBody}>
          {projectDetailTab === "tasks" && (
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
                <ArtifactView
                  artifacts={projectArtifacts}
                  allRoles={allRoles}
                  viewMode={artifactViewMode}
                  onViewModeChange={setArtifactViewMode}
                  onApprove={handleArtifactApprove}
                  onPreviewFile={onPreviewFile}
                  getRoleName={getRoleName}
                  t={t}
                />
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
                          const isUser = member.roleId === "builtin_user";
                          const memberArtifact = projectArtifacts.find(
                            (a) => a.roleId === member.roleId
                          );
                          const isWorking =
                            memberArtifact?.status === "in_progress" ||
                            memberArtifact?.status === "pending";
                          return {
                            id: member.id,
                            name: getRoleName(member.roleId),
                            icon: role?.icon || "🤖",
                            color: role?.avatarColor || "#6c5ce7",
                            isUser,
                            isWorking,
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
                          if (fromRoleId && toRoleId) {
                            invoke("auto_delegate_chat", {
                              projectId: project.id,
                              fromRoleId,
                              toRoleId,
                              contextMessage: `产物「${artifactType || "工作产出"}」已交付，请基于上游产出继续工作。`,
                              eventId: `deliver-${Date.now()}`,
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
                      {projectMembers
                        .filter((m) => m.roleId !== "builtin_user")
                        .map((member) => {
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
                            {isUser ? "用户" : role?.nickname || role?.name || "未知"}
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
                              (r) =>
                                r.id ===
                                (chatTargetRole ||
                                  projectMembers.find((m) => m.roleId !== "builtin_user")?.roleId)
                            )?.avatarColor || "#6c5ce7",
                        }}
                      >
                        {allRoles.find(
                          (r) =>
                            r.id ===
                            (chatTargetRole ||
                              projectMembers.find((m) => m.roleId !== "builtin_user")?.roleId)
                        )?.icon || "🤖"}
                      </div>
                      <div className={styles.studioChatBubble}>
                        <span
                          className={styles.studioChatName}
                          style={{
                            color:
                              allRoles.find(
                                (r) =>
                                  r.id ===
                                  (chatTargetRole ||
                                    projectMembers.find((m) => m.roleId !== "builtin_user")?.roleId)
                              )?.avatarColor || "#6c5ce7",
                          }}
                        >
                          {(() => {
                            const r = allRoles.find(
                              (r) =>
                                r.id ===
                                (chatTargetRole ||
                                  projectMembers.find((m) => m.roleId !== "builtin_user")?.roleId)
                            );
                            return r?.nickname || r?.name || "AI";
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
                  {projectWorkflows.length > 0 &&
                    projectMembers.filter((m) => m.roleId !== "builtin_user").length > 1 && (
                      <button
                        className={styles.studioChatAutoBtn}
                        disabled={autoDelegateRunning || projectChatStreaming}
                        onClick={async () => {
                          if (autoDelegateRunning) return;
                          setAutoDelegateRunning(true);
                          try {
                            const firstMember = projectMembers.find(
                              (m) => m.roleId !== "builtin_user"
                            );
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

      {rejectModal.open && (
        <div
          className={styles.studioModalOverlay}
          onClick={() => {
            setRejectModal({ artifactId: "", open: false });
            setRejectReason("");
          }}
        >
          <div
            className={styles.studioModal + " " + styles.studioRejectModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>打回产物</h3>
            <p className={styles.studioRejectHint}>请输入打回原因，角色将根据原因进行修改：</p>
            <textarea
              className={styles.studioRejectTextarea}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入打回原因..."
              rows={4}
              autoFocus
            />
            <div className={styles.studioModalActions}>
              <button
                className={styles.studioModalBtn + " " + styles.cancel}
                onClick={() => {
                  setRejectModal({ artifactId: "", open: false });
                  setRejectReason("");
                }}
              >
                取消
              </button>
              <button
                className={styles.studioModalBtn + " " + styles.confirm + " " + styles.reject}
                onClick={handleArtifactReject}
              >
                确认打回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectDetail;
