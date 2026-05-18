import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  WorkflowRun,
  WorkflowRunStep as _WorkflowRunStep,
  WorkflowRunStatus,
  AiRoleItem,
} from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";

interface WorkflowRunPanelProps {
  projectId: string;
  allRoles: AiRoleItem[];
}

const RUN_STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  running: { label: "运行中", color: "#fdcb6e", icon: "🔄" },
  paused: { label: "已暂停", color: "#74b9ff", icon: "⏸" },
  completed: { label: "已完成", color: "#00b894", icon: "✅" },
  rejected: { label: "已拒绝", color: "#e17055", icon: "❌" },
};

const STEP_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "等待中", color: "#b2bec3" },
  running: { label: "执行中", color: "#fdcb6e" },
  completed: { label: "已完成", color: "#00b894" },
  rejected: { label: "已拒绝", color: "#e17055" },
};

function WorkflowRunPanel({ projectId, allRoles }: WorkflowRunPanelProps) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<WorkflowRunStatus | null>(null);
  const [startMessage, setStartMessage] = useState("");
  const [confirmComment, setConfirmComment] = useState("");
  const [showStartForm, setShowStartForm] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      const data = await invoke<WorkflowRun[]>("list_workflow_runs", { projectId });
      setRuns(data);
    } catch (err) {
// console.error("Failed to load workflow runs:", err);
    }
  }, [projectId]);

  const loadRunStatus = useCallback(async (runId: string) => {
    try {
      const data = await invoke<WorkflowRunStatus>("get_workflow_run_status", { runId });
      setRunStatus(data);
    } catch (err) {
// console.error("Failed to load run status:", err);
    }
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (selectedRunId) {
      loadRunStatus(selectedRunId);
    } else {
      setRunStatus(null);
    }
  }, [selectedRunId, loadRunStatus]);

  useEffect(() => {
    const unlisten = listen("workflow_run_started", () => loadRuns());
    const unlisten2 = listen("workflow_step_confirmed", () => {
      loadRuns();
      if (selectedRunId) loadRunStatus(selectedRunId);
    });
    const unlisten3 = listen("workflow_run_paused", () => {
      loadRuns();
      if (selectedRunId) loadRunStatus(selectedRunId);
    });
    const unlisten4 = listen("workflow_run_resumed", () => {
      loadRuns();
      if (selectedRunId) loadRunStatus(selectedRunId);
    });
    const unlisten5 = listen("workflow_auto_push_completed", () => {
      loadRuns();
      if (selectedRunId) loadRunStatus(selectedRunId);
    });
    const unlisten6 = listen("artifacts_updated", () => {
      loadRuns();
      if (selectedRunId) loadRunStatus(selectedRunId);
    });
    return () => {
      unlisten.then((fn) => fn());
      unlisten2.then((fn) => fn());
      unlisten3.then((fn) => fn());
      unlisten4.then((fn) => fn());
      unlisten5.then((fn) => fn());
      unlisten6.then((fn) => fn());
    };
  }, [loadRuns, loadRunStatus, selectedRunId]);

  const handleStartRun = async () => {
    if (!startMessage.trim()) return;
    try {
      const run = await invoke<WorkflowRun>("start_workflow_run", {
        projectId,
        initialMessage: startMessage.trim(),
        groupId: null,
        taskId: null,
      });
      setStartMessage("");
      setShowStartForm(false);
      await loadRuns();
      setSelectedRunId(run.id);
    } catch (err) {
// console.error("Failed to start workflow run:", err);
      alert("启动工作流失败: " + err);
    }
  };

  const handlePause = async (runId: string) => {
    try {
      await invoke("pause_workflow_run", { runId });
      await loadRuns();
      if (selectedRunId === runId) await loadRunStatus(runId);
    } catch (err) {
// console.error("Failed to pause:", err);
    }
  };

  const handleResume = async (runId: string) => {
    try {
      await invoke("resume_workflow_run", { runId });
      await loadRuns();
      if (selectedRunId === runId) await loadRunStatus(runId);
    } catch (err) {
// console.error("Failed to resume:", err);
    }
  };

  const handleConfirmStep = async (runId: string, approved: boolean) => {
    if (!approved && !confirmComment.trim()) {
      alert("请先填写驳回意见");
      return;
    }
    try {
      await invoke("confirm_workflow_step", {
        runId,
        approved,
        comment: confirmComment.trim() || undefined,
      });
      setConfirmComment("");
      await loadRuns();
      await loadRunStatus(runId);
    } catch (err) {
// console.error("Failed to confirm step:", err);
    }
  };

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return "系统";
    const role = allRoles.find((r) => r.id === roleId);
    if (role) return `${role.icon} ${role.name}`;
    return roleId.slice(0, 8) + "...";
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const activeRuns = runs.filter((r) => r.status === "running" || r.status === "paused");
  const pastRuns = runs.filter((r) => r.status === "completed" || r.status === "rejected");

  return (
    <div className={styles.wfRunPanel}>
      <div className={styles.wfRunHeader}>
        <h3>🔄 工作流运行</h3>
        <button className={styles.wfRunStartBtn} onClick={() => setShowStartForm(!showStartForm)}>
          {showStartForm ? "取消" : "🚀 启动新运行"}
        </button>
      </div>

      {showStartForm && (
        <div className={styles.wfRunStartForm}>
          <div className={styles.wfRunStartField}>
            <label>初始消息</label>
            <textarea
              value={startMessage}
              onChange={(e) => setStartMessage(e.target.value)}
              placeholder="描述工作流的初始输入，如：请完成产品需求文档..."
              rows={3}
              className={styles.taskDetailTextarea}
            />
          </div>
          <button
            className={styles.wfRunStartSubmit}
            onClick={handleStartRun}
            disabled={!startMessage.trim()}
          >
            启动
          </button>
        </div>
      )}

      <div className={styles.wfRunContent}>
        <div className={styles.wfRunList}>
          {activeRuns.length > 0 && (
            <div className={styles.wfRunSection}>
              <div className={styles.wfRunSectionTitle}>活跃运行</div>
              {activeRuns.map((run) => {
                const statusInfo = RUN_STATUS_MAP[run.status] || {
                  label: run.status,
                  color: "#999",
                  icon: "❓",
                };
                return (
                  <div
                    key={run.id}
                    className={`${styles.wfRunItem} ${selectedRunId === run.id ? styles.wfRunItemActive : ""}`}
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <div className={styles.wfRunItemHeader}>
                      <span className={styles.wfRunItemIcon}>{statusInfo.icon}</span>
                      <span className={styles.wfRunItemId}>{run.id.slice(0, 8)}</span>
                      <span className={styles.wfRunItemStatus} style={{ color: statusInfo.color }}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className={styles.wfRunItemMeta}>
                      <span>步骤 {run.currentStep + 1}</span>
                      <span>{formatTime(run.startedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className={styles.wfRunSection}>
            <div className={styles.wfRunSectionTitle}>历史运行</div>
            {pastRuns.length === 0 && activeRuns.length === 0 && (
              <div className={styles.taskDetailEmpty}>暂无工作流运行记录</div>
            )}
            {pastRuns.map((run) => {
              const statusInfo = RUN_STATUS_MAP[run.status] || {
                label: run.status,
                color: "#999",
                icon: "❓",
              };
              return (
                <div
                  key={run.id}
                  className={`${styles.wfRunItem} ${selectedRunId === run.id ? styles.wfRunItemActive : ""}`}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <div className={styles.wfRunItemHeader}>
                    <span className={styles.wfRunItemIcon}>{statusInfo.icon}</span>
                    <span className={styles.wfRunItemId}>{run.id.slice(0, 8)}</span>
                    <span className={styles.wfRunItemStatus} style={{ color: statusInfo.color }}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className={styles.wfRunItemMeta}>
                    <span>{formatTime(run.startedAt)}</span>
                    {run.completedAt && <span>→ {formatTime(run.completedAt)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {runStatus && (
          <div className={styles.wfRunDetail}>
            <div className={styles.wfRunDetailHeader}>
              <h4>运行详情 {runStatus.run.id.slice(0, 8)}</h4>
              <div className={styles.wfRunDetailActions}>
                {runStatus.run.status === "running" && (
                  <button
                    className={styles.wfRunActionBtn}
                    onClick={() => handlePause(runStatus.run.id)}
                  >
                    ⏸ 暂停
                  </button>
                )}
                {runStatus.run.status === "paused" && (
                  <button
                    className={styles.wfRunActionBtn}
                    onClick={() => handleResume(runStatus.run.id)}
                  >
                    ▶ 继续
                  </button>
                )}
              </div>
            </div>

            <div className={styles.wfRunDetailInfo}>
              <div className={styles.taskDetailField}>
                <label>状态</label>
                <span style={{ color: RUN_STATUS_MAP[runStatus.run.status]?.color || "#999" }}>
                  {RUN_STATUS_MAP[runStatus.run.status]?.icon}{" "}
                  {RUN_STATUS_MAP[runStatus.run.status]?.label || runStatus.run.status}
                </span>
              </div>
              <div className={styles.taskDetailField}>
                <label>当前步骤</label>
                <span>
                  {runStatus.run.currentStep + 1} / {runStatus.steps.length}
                </span>
              </div>
              <div className={styles.taskDetailField}>
                <label>开始时间</label>
                <span>{formatTime(runStatus.run.startedAt)}</span>
              </div>
              {runStatus.run.completedAt && (
                <div className={styles.taskDetailField}>
                  <label>完成时间</label>
                  <span>{formatTime(runStatus.run.completedAt)}</span>
                </div>
              )}
            </div>

            <div className={styles.wfRunSteps}>
              <div className={styles.wfRunStepsTitle}>执行步骤</div>
              {runStatus.steps.map((step, idx) => {
                const stepStatus = STEP_STATUS_MAP[step.status] || {
                  label: step.status,
                  color: "#999",
                };
                const isCurrentStep = idx === runStatus.run.currentStep;
                const isPendingConfirm =
                  isCurrentStep &&
                  runStatus.run.status === "running" &&
                  step.action === "need_confirm";

                return (
                  <div
                    key={step.id}
                    className={`${styles.wfRunStep} ${isCurrentStep ? styles.wfRunStepCurrent : ""}`}
                  >
                    <div className={styles.wfRunStepHeader}>
                      <div className={styles.wfRunStepIndicator}>
                        {step.status === "completed" && "✅"}
                        {step.status === "running" && "🔄"}
                        {step.status === "rejected" && "❌"}
                        {step.status === "pending" && "⏳"}
                      </div>
                      <div className={styles.wfRunStepInfo}>
                        <span className={styles.wfRunStepRole}>
                          {step.action === "start" ? "🚀 开始" : getRoleName(step.roleId)}
                        </span>
                        <span
                          className={styles.wfRunStepStatus}
                          style={{ color: stepStatus.color }}
                        >
                          {stepStatus.label}
                        </span>
                        {step.action === "need_confirm" && (
                          <span className={styles.wfRunStepAction}>🔒 需确认</span>
                        )}
                        {step.action === "auto_push" && (
                          <span className={styles.wfRunStepAction}>🔄 自动</span>
                        )}
                        {step.action === "start" && (
                          <span className={styles.wfRunStepAction}>🏁 起始</span>
                        )}
                      </div>
                    </div>

                    {step.input && (
                      <div className={styles.wfRunStepInput}>
                        <label>输入</label>
                        <div className={styles.wfRunStepContent}>{step.input}</div>
                      </div>
                    )}

                    {step.output && (
                      <div className={styles.wfRunStepOutput}>
                        <label>输出</label>
                        <div className={styles.wfRunStepContent}>{step.output}</div>
                      </div>
                    )}

                    <div className={styles.wfRunStepTimes}>
                      {step.startedAt && <span>开始: {formatTime(step.startedAt)}</span>}
                      {step.completedAt && <span>完成: {formatTime(step.completedAt)}</span>}
                    </div>

                    {isPendingConfirm && (
                      <div className={styles.wfRunStepConfirm}>
                        <div className={styles.wfRunStepConfirmLabel}>⚠️ 此步骤需要确认</div>
                        <textarea
                          value={confirmComment}
                          onChange={(e) => setConfirmComment(e.target.value)}
                          placeholder={
                            isPendingConfirm
                              ? "通过：评语可选；驳回：评语必填"
                              : "添加备注（可选）..."
                          }
                          rows={4}
                          className={styles.taskDetailTextarea}
                          style={{ resize: "vertical" }}
                        />
                        <div className={styles.wfRunStepConfirmActions}>
                          <button
                            className={styles.wfRunConfirmApprove}
                            onClick={() => handleConfirmStep(runStatus.run.id, true)}
                          >
                            ✅ 通过
                          </button>
                          <button
                            className={styles.wfRunConfirmReject}
                            onClick={() => handleConfirmStep(runStatus.run.id, false)}
                          >
                            ❌ 驳回
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!runStatus && (
          <div className={styles.wfRunDetailEmpty}>
            <div className={styles.wfRunDetailEmptyIcon}>📋</div>
            <div>选择一个运行查看详情</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkflowRunPanel;
