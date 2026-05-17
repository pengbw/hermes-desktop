import { useState } from "react";
import type { ProjectTask, ProjectFileRecord, AiRoleItem } from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";

const EXT_ICON: Record<string, string> = {
  md: "📝", txt: "📄", json: "📋", yaml: "📋", yml: "📋",
  ts: "💻", tsx: "💻", js: "💻", jsx: "💻", py: "🐍",
  html: "🌐", css: "🎨", svg: "🖼️", png: "🖼️", jpg: "🖼️",
  pdf: "📕", doc: "📘", docx: "📘", xls: "📗", xlsx: "📗",
};

const TASK_STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  triage: { label: "待分类", color: "#b2bec3", icon: "📥" },
  todo: { label: "待办", color: "#636e72", icon: "📋" },
  ready: { label: "就绪", color: "#0984e3", icon: "🟢" },
  running: { label: "进行中", color: "#fdcb6e", icon: "🔄" },
  done: { label: "已完成", color: "#00b894", icon: "✅" },
  blocked: { label: "阻塞", color: "#e17055", icon: "🚫" },
};

interface ArtifactTreeProps {
  tasks: ProjectTask[];
  fileRecords: ProjectFileRecord[];
  allRoles: AiRoleItem[];
  getRoleNamePure: (roleId: string) => string;
  onPreviewFile: (path: string, name: string) => void;
}

function ArtifactTree({ tasks, fileRecords, allRoles, getRoleNamePure, onPreviewFile }: ArtifactTreeProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  const toggleTask = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleRole = (key: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const taskFiles = tasks.map((task) => {
    const files = fileRecords.filter((f) => f.taskId === task.id);
    const roleGrouped = files.reduce(
      (acc, f) => {
        const key = f.roleId || "_unassigned";
        if (!acc[key]) acc[key] = [];
        acc[key].push(f);
        return acc;
      },
      {} as Record<string, ProjectFileRecord[]>
    );
    return { task, files, roleGrouped };
  });

  const unassignedFiles = fileRecords.filter((f) => !f.taskId);
  const unassignedRoleGrouped = unassignedFiles.reduce(
    (acc, f) => {
      const key = f.roleId || "_unassigned";
      if (!acc[key]) acc[key] = [];
      acc[key].push(f);
      return acc;
    },
    {} as Record<string, ProjectFileRecord[]>
  );

  const formatSize = (size: number) => {
    if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
    if (size > 1024) return `${(size / 1024).toFixed(1)}KB`;
    return `${size}B`;
  };

  const renderFileItem = (file: ProjectFileRecord) => {
    const icon = EXT_ICON[file.fileExt] || "📄";
    return (
      <div
        key={file.id}
        className={styles.artifactTreeNode + " " + styles.artifactTreeFile}
        onClick={() => {
          if (file.filePath) onPreviewFile(file.filePath, file.fileName);
        }}
        style={{ cursor: file.filePath ? "pointer" : "default" }}
      >
        <span className={styles.artifactTreeFileIcon}>{icon}</span>
        <span className={styles.artifactTreeFileName}>{file.fileName}</span>
        <span className={styles.artifactTreeFileSize}>{formatSize(file.fileSize)}</span>
      </div>
    );
  };

  const renderRoleGroup = (roleId: string, files: ProjectFileRecord[], taskKey: string) => {
    const isUnassigned = roleId === "_unassigned";
    const role = isUnassigned ? null : allRoles.find((r) => r.id === roleId);
    const roleName = isUnassigned ? "未分配" : getRoleNamePure(roleId);
    const roleKey = `${taskKey}_${roleId}`;
    const isExpanded = expandedRoles.has(roleKey);

    return (
      <div key={roleId} className={styles.artifactTreeRoleGroup}>
        <div
          className={styles.artifactTreeNode + " " + styles.artifactTreeRole}
          onClick={() => toggleRole(roleKey)}
        >
          <span className={styles.artifactTreeToggle}>{isExpanded ? "▼" : "▶"}</span>
          <span className={styles.artifactTreeRoleIcon}>
            {isUnassigned ? "📁" : role?.icon || "🤖"}
          </span>
          <span className={styles.artifactTreeRoleName}>{roleName}</span>
          <span className={styles.artifactTreeRoleCount}>{files.length}</span>
        </div>
        {isExpanded && (
          <div className={styles.artifactTreeRoleFiles}>
            {files.map(renderFileItem)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.artifactTree}>
      {taskFiles.map(({ task, files, roleGrouped }) => {
        const tsc = TASK_STATUS_CONFIG[task.status] || { label: task.status, color: "#999", icon: "📌" };
        const isExpanded = expandedTasks.has(task.id);
        return (
          <div key={task.id} className={styles.artifactTreeTaskGroup}>
            <div
              className={styles.artifactTreeNode + " " + styles.artifactTreeTask}
              onClick={() => toggleTask(task.id)}
            >
              <span className={styles.artifactTreeToggle}>{isExpanded ? "▼" : "▶"}</span>
              <span className={styles.artifactTreeTaskIcon}>{tsc.icon}</span>
              <span className={styles.artifactTreeTaskName}>{task.title}</span>
              <span className={styles.artifactTreeTaskStatus} style={{ color: tsc.color }}>
                {tsc.label}
              </span>
              <span className={styles.artifactTreeTaskCount}>{files.length} 文件</span>
            </div>
            {isExpanded && (
              <div className={styles.artifactTreeTaskChildren}>
                {files.length === 0 ? (
                  <div className={styles.artifactTreeEmpty}>暂无产物</div>
                ) : (
                  Object.entries(roleGrouped).map(([roleId, roleFiles]) =>
                    renderRoleGroup(roleId, roleFiles, task.id)
                  )
                )}
              </div>
            )}
          </div>
        );
      })}

      {unassignedFiles.length > 0 && (
        <div className={styles.artifactTreeTaskGroup}>
          <div
            className={styles.artifactTreeNode + " " + styles.artifactTreeTask}
            onClick={() => toggleTask("__unassigned")}
          >
            <span className={styles.artifactTreeToggle}>
              {expandedTasks.has("__unassigned") ? "▼" : "▶"}
            </span>
            <span className={styles.artifactTreeTaskIcon}>📁</span>
            <span className={styles.artifactTreeTaskName}>未关联任务</span>
            <span className={styles.artifactTreeTaskCount}>{unassignedFiles.length} 文件</span>
          </div>
          {expandedTasks.has("__unassigned") && (
            <div className={styles.artifactTreeTaskChildren}>
              {Object.entries(unassignedRoleGrouped).map(([roleId, roleFiles]) =>
                renderRoleGroup(roleId, roleFiles, "__unassigned")
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ArtifactTree;
