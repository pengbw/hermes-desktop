import styles from "@pages/studio/StudioPanel.module.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnNodesChange,
  type OnEdgesChange,
  MarkerType,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";
import { invoke } from "@tauri-apps/api/core";
import type { AiRoleItem, ProjectMember, ProjectWorkflow, WorkflowGroup } from "@core/types";

type WorkflowData = ProjectWorkflow;

type RoleNodeType = Node<{
  roleId: string;
  label: string;
  icon: string;
  description: string;
  artifactType: string;
  transitionType: string;
}>;

type ConditionNodeType = Node<{
  label: string;
  conditionDesc: string;
}>;

type ParallelNodeType = Node<{
  label: string;
}>;

type MergeNodeType = Node<{
  label: string;
}>;

type StartNodeType = Node<{
  label: string;
}>;

type EndNodeType = Node<{
  label: string;
}>;

type FlowNode =
  | RoleNodeType
  | ConditionNodeType
  | ParallelNodeType
  | MergeNodeType
  | StartNodeType
  | EndNodeType;

function RoleNode({ data, selected }: NodeProps<RoleNodeType>) {
  return (
    <div className={`${styles.wfRoleNode} ${selected ? styles.selected : ""}`}>
      <Handle type="target" position={Position.Top} className={styles.wfHandle} />
      <div className={styles.wfRoleNodeHeader}>
        <span className={styles.wfRoleIcon}>{data.icon}</span>
        <span className={styles.wfRoleLabel}>{data.label}</span>
      </div>
      {data.artifactType && <div className={styles.wfRoleArtifact}>📦 {data.artifactType}</div>}
      <div
        className={
          styles.wfRoleTransition +
          " " +
          (styles[
            "type" + data.transitionType.charAt(0).toUpperCase() + data.transitionType.slice(1)
          ] || "")
        }
      >
        {data.transitionType === "need_confirm" ? "🔒 需确认" : "🔄 自动"}
      </div>
      <Handle type="source" position={Position.Bottom} className={styles.wfHandle} />
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps<ConditionNodeType>) {
  return (
    <div className={`${styles.wfConditionNode} ${selected ? styles.selected : ""}`}>
      <Handle type="target" position={Position.Top} className={styles.wfHandle} />
      <div className={styles.wfConditionDiamond}>◆</div>
      <div className={styles.wfConditionLabel}>{data.label}</div>
      {data.conditionDesc && <div className={styles.wfConditionDesc}>{data.conditionDesc}</div>}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className={styles.wfHandle + " " + styles.wfHandleYes}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="no"
        className={styles.wfHandle + " " + styles.wfHandleNo}
      />
    </div>
  );
}

function ParallelNode({ data, selected }: NodeProps<ParallelNodeType>) {
  return (
    <div className={`${styles.wfParallelNode} ${selected ? styles.selected : ""}`}>
      <Handle type="target" position={Position.Top} className={styles.wfHandle} />
      <div className={styles.wfParallelIcon}>⊕</div>
      <div className={styles.wfParallelLabel}>{data.label}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="out1"
        className={styles.wfHandle}
        style={{ left: "30%" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out2"
        className={styles.wfHandle}
        style={{ left: "70%" }}
      />
    </div>
  );
}

function MergeNode({ data, selected }: NodeProps<MergeNodeType>) {
  return (
    <div className={`${styles.wfMergeNode} ${selected ? styles.selected : ""}`}>
      <Handle
        type="target"
        position={Position.Top}
        id="in1"
        className={styles.wfHandle}
        style={{ left: "30%" }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="in2"
        className={styles.wfHandle}
        style={{ left: "70%" }}
      />
      <div className={styles.wfMergeIcon}>⊙</div>
      <div className={styles.wfMergeLabel}>{data.label}</div>
      <Handle type="source" position={Position.Bottom} className={styles.wfHandle} />
    </div>
  );
}

function StartNode({ data, selected }: NodeProps<StartNodeType>) {
  return (
    <div className={`${styles.wfStartNode} ${selected ? styles.selected : ""}`}>
      <div className={styles.wfStartIcon}>▶</div>
      <div className={styles.wfStartLabel}>{data.label}</div>
      <Handle type="source" position={Position.Bottom} className={styles.wfHandle} />
    </div>
  );
}

function EndNode({ data, selected }: NodeProps<EndNodeType>) {
  return (
    <div className={`${styles.wfEndNode} ${selected ? styles.selected : ""}`}>
      <Handle type="target" position={Position.Top} className={styles.wfHandle} />
      <div className={styles.wfEndIcon}>⏹</div>
      <div className={styles.wfEndLabel}>{data.label}</div>
    </div>
  );
}

const nodeTypes = {
  roleNode: RoleNode,
  conditionNode: ConditionNode,
  parallelNode: ParallelNode,
  mergeNode: MergeNode,
  startNode: StartNode,
  endNode: EndNode,
};

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const layoutGraph = (nodes: FlowNode[], edges: Edge[]) => {
  dagreGraph.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 60 });
  nodes.forEach((node) => {
    let w = 130;
    let h = 60;
    if (
      node.type === "conditionNode" ||
      node.type === "parallelNode" ||
      node.type === "mergeNode"
    ) {
      w = 100;
      h = 70;
    } else if (node.type === "startNode" || node.type === "endNode") {
      w = 60;
      h = 60;
    }
    dagreGraph.setNode(node.id, { width: w, height: h });
  });
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  dagre.layout(dagreGraph);
  return nodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    return {
      ...node,
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
    };
  });
};

function buildFlowFromWorkflows(
  workflows: WorkflowData[],
  roles: AiRoleItem[]
): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = [];
  const edges: Edge[] = [];
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const visitedRoles = new Set<string>();
  const conditionCounter = { val: 0 };

  const getRole = (id: string) => roleMap.get(id);

  const addRoleNode = (roleId: string, wf: WorkflowData | null): string => {
    const role = getRole(roleId);
    if (!role) return roleId;
    if (!visitedRoles.has(roleId)) {
      visitedRoles.add(roleId);
      nodes.push({
        id: roleId,
        type: "roleNode",
        position: { x: 0, y: 0 },
        data: {
          roleId,
          label: role.name,
          icon: role.icon,
          description: role.description,
          artifactType: wf?.artifactType || "",
          transitionType: wf?.transitionType || "auto_push",
        },
      });
    } else if (wf?.artifactType || wf?.transitionType) {
      const existing = nodes.find((n) => n.id === roleId);
      if (existing && existing.type === "roleNode") {
        const d = existing.data as RoleNodeType["data"];
        if (wf.artifactType) d.artifactType = wf.artifactType;
        if (wf.transitionType) d.transitionType = wf.transitionType;
      }
    }
    return roleId;
  };

  const sorted = [...workflows].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const wf of sorted) {
    const fromId = wf.fromRoleId;
    const toId = wf.toRoleId;

    if (toId && toId !== "end") addRoleNode(toId, wf);
    if (fromId && fromId !== "start" && fromId !== "end") addRoleNode(fromId, null);
    const noTargetRoleId = wf.rejectToRoleId || "";
    if (noTargetRoleId && noTargetRoleId !== "start" && noTargetRoleId !== "end")
      addRoleNode(noTargetRoleId, null);

    if (wf.transitionType === "need_confirm" && fromId && toId) {
      const condId = `cond_${conditionCounter.val++}`;
      nodes.push({
        id: condId,
        type: "conditionNode",
        position: { x: 0, y: 0 },
        data: {
          label: "审批",
          conditionDesc: "确认通过？",
        },
      });

      edges.push({
        id: `e-${fromId}-${condId}`,
        source: fromId,
        target: condId,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#6c5ce7", strokeWidth: 2 },
        label: wf.artifactType || "产出",
        labelStyle: { fill: "#6c5ce7", fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6c5ce7" },
      });

      edges.push({
        id: `e-${condId}-${toId}-yes`,
        source: condId,
        sourceHandle: "yes",
        target: toId,
        type: "smoothstep",
        style: { stroke: "#27ae60", strokeWidth: 2 },
        label: "✅ 通过",
        labelStyle: { fill: "#27ae60", fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#27ae60" },
      });

      if (noTargetRoleId) {
        edges.push({
          id: `e-${condId}-${noTargetRoleId}-no`,
          source: condId,
          sourceHandle: "no",
          target: noTargetRoleId,
          type: "smoothstep",
          style: { stroke: "#e74c3c", strokeWidth: 2, strokeDasharray: "5 3" },
          label: "❌ 打回修改",
          labelStyle: { fill: "#e74c3c", fontWeight: 600, fontSize: 11 },
          labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
          labelBgPadding: [4, 6] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#e74c3c" },
        });
      }
    } else if (fromId && toId) {
      edges.push({
        id: `e-${fromId}-${toId}`,
        source: fromId,
        target: toId,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#6c5ce7", strokeWidth: 2 },
        label: wf.artifactType || "",
        labelStyle: { fill: "#6c5ce7", fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6c5ce7" },
      });
    } else if (!fromId && toId) {
      edges.push({
        id: `e-start-${toId}`,
        source: "start",
        target: toId,
        type: "smoothstep",
        style: { stroke: "#00b894", strokeWidth: 2 },
        label: "开始",
        labelStyle: { fill: "#00b894", fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#00b894" },
      });
    } else if (fromId && !toId) {
      edges.push({
        id: `e-${fromId}-end`,
        source: fromId,
        target: "end",
        type: "smoothstep",
        style: { stroke: "#d63031", strokeWidth: 2 },
        label: wf.artifactType || "完成",
        labelStyle: { fill: "#d63031", fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#d63031" },
      });
    }
  }

  const hasStartTarget = edges.some((e) => e.source === "start");
  if (hasStartTarget) {
    nodes.push({
      id: "start",
      type: "startNode",
      position: { x: 0, y: 0 },
      data: {
        label: "开始",
      },
    });
  }

  const hasEndSource = edges.some((e) => e.target === "end");
  if (hasEndSource) {
    nodes.push({
      id: "end",
      type: "endNode",
      position: { x: 0, y: 0 },
      data: {
        label: "结束",
      },
    });
  }

  const layouted = layoutGraph(nodes, edges);
  return { nodes: layouted, edges };
}

interface DnDData {
  type: string;
  data: Record<string, unknown>;
}

let nodeIdCounter = 0;
const getNextId = () => `dnd_node_${nodeIdCounter++}`;

function Sidebar({
  memberRoles,
  searchQuery,
  onSearchChange,
}: {
  memberRoles: AiRoleItem[];
  searchQuery: string;
  onSearchChange: (v: string) => void;
}) {
  const onDragStart = (event: React.DragEvent<HTMLDivElement>, dndData: DnDData) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(dndData));
    event.dataTransfer.effectAllowed = "move";
  };

  const filteredRoles = memberRoles.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.wfSidebar}>
      <div className={styles.wfSidebarSearch}>
        <input
          type="text"
          placeholder="搜索节点..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.wfSidebarSearchInput}
        />
      </div>

      <div className={styles.wfSidebarSection}>
        <div className={styles.wfSidebarSectionTitle}>角色节点</div>
        {filteredRoles.map((role) => (
          <div
            key={role.id}
            className={styles.wfSidebarItem + " " + styles.wfSidebarRoleItem}
            draggable
            onDragStart={(e) =>
              onDragStart(e, {
                type: "roleNode",
                data: {
                  roleId: role.id,
                  label: role.name,
                  icon: role.icon,
                  description: role.description,
                  artifactType: "",
                  transitionType: "auto_push",
                },
              })
            }
          >
            <span className={styles.wfSidebarItemIcon}>{role.icon}</span>
            <span className={styles.wfSidebarItemLabel}>{role.name}</span>
          </div>
        ))}
        {filteredRoles.length === 0 && <div className={styles.wfSidebarEmpty}>无匹配角色</div>}
      </div>

      <div className={styles.wfSidebarSection}>
        <div className={styles.wfSidebarSectionTitle}>逻辑节点</div>
        <div
          className={styles.wfSidebarItem + " " + styles.wfSidebarLogicItem}
          draggable
          onDragStart={(e) =>
            onDragStart(e, {
              type: "startNode",
              data: {
                label: "开始",
              },
            })
          }
        >
          <span className={styles.wfSidebarItemIcon}>▶</span>
          <span className={styles.wfSidebarItemLabel}>开始</span>
        </div>
        <div
          className={styles.wfSidebarItem + " " + styles.wfSidebarLogicItem}
          draggable
          onDragStart={(e) =>
            onDragStart(e, {
              type: "endNode",
              data: {
                label: "结束",
              },
            })
          }
        >
          <span className={styles.wfSidebarItemIcon}>⏹</span>
          <span className={styles.wfSidebarItemLabel}>结束</span>
        </div>
        <div
          className={styles.wfSidebarItem + " " + styles.wfSidebarLogicItem}
          draggable
          onDragStart={(e) =>
            onDragStart(e, {
              type: "conditionNode",
              data: {
                label: "条件判断",
                conditionDesc: "确认通过？",
              },
            })
          }
        >
          <span className={styles.wfSidebarItemIcon}>◆</span>
          <span className={styles.wfSidebarItemLabel}>条件判断</span>
        </div>
        <div
          className={styles.wfSidebarItem + " " + styles.wfSidebarLogicItem}
          draggable
          onDragStart={(e) =>
            onDragStart(e, {
              type: "parallelNode",
              data: {
                label: "并行分支",
              },
            })
          }
        >
          <span className={styles.wfSidebarItemIcon}>⊕</span>
          <span className={styles.wfSidebarItemLabel}>并行分支</span>
        </div>
        <div
          className={styles.wfSidebarItem + " " + styles.wfSidebarLogicItem}
          draggable
          onDragStart={(e) =>
            onDragStart(e, {
              type: "mergeNode",
              data: {
                label: "合并汇聚",
              },
            })
          }
        >
          <span className={styles.wfSidebarItemIcon}>⊙</span>
          <span className={styles.wfSidebarItemLabel}>合并汇聚</span>
        </div>
      </div>
    </div>
  );
}

function EdgeEditorModal({
  open,
  artifactType,
  transitionType,
  rejectToRoleId,
  roles,
  onArtifactTypeChange,
  onTransitionTypeChange,
  onRejectToRoleIdChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  artifactType: string;
  transitionType: string;
  rejectToRoleId: string;
  roles: AiRoleItem[];
  onArtifactTypeChange: (v: string) => void;
  onTransitionTypeChange: (v: string) => void;
  onRejectToRoleIdChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className={styles.wfEdgeEditorOverlay} onClick={onCancel}>
      <div className={styles.wfEdgeEditor} onClick={(e) => e.stopPropagation()}>
        <div className={styles.wfEdgeEditorTitle}>编辑流转关系</div>
        <div className={styles.wfAddField}>
          <label>产出物类型</label>
          <input
            className={styles.wfAddInput}
            placeholder="如：设计稿、代码、文档..."
            value={artifactType}
            onChange={(e) => onArtifactTypeChange(e.target.value)}
          />
        </div>
        <div className={styles.wfAddField}>
          <label>流转方式</label>
          <div className={styles.wfAddRadioGroup}>
            <label className={styles.wfAddRadio}>
              <input
                type="radio"
                name="edgeTransitionType"
                value="auto_push"
                checked={transitionType === "auto_push"}
                onChange={() => onTransitionTypeChange("auto_push")}
              />
              🔄 自动推送
            </label>
            <label className={styles.wfAddRadio}>
              <input
                type="radio"
                name="edgeTransitionType"
                value="need_confirm"
                checked={transitionType === "need_confirm"}
                onChange={() => onTransitionTypeChange("need_confirm")}
              />
              🔒 需确认
            </label>
            <label className={styles.wfAddRadio}>
              <input
                type="radio"
                name="edgeTransitionType"
                value="condition"
                checked={transitionType === "condition"}
                onChange={() => onTransitionTypeChange("condition")}
              />
              ◆ 条件分支
            </label>
            <label className={styles.wfAddRadio}>
              <input
                type="radio"
                name="edgeTransitionType"
                value="parallel"
                checked={transitionType === "parallel"}
                onChange={() => onTransitionTypeChange("parallel")}
              />
              ⊕ 并行执行
            </label>
          </div>
        </div>
        {transitionType === "need_confirm" && (
          <>
            <div className={styles.wfAddHint}>产出物需确认后才流转给下一角色</div>
            <div className={styles.wfAddField}>
              <label>驳回目标</label>
              <select
                value={rejectToRoleId}
                onChange={(e) => onRejectToRoleIdChange(e.target.value)}
              >
                <option value="">不驳回</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.icon} {role.name}
                  </option>
                ))}
              </select>
              <div className={styles.wfAddHint}>选择驳回时回退到哪个角色，留空则不驳回</div>
            </div>
          </>
        )}
        {transitionType === "condition" && (
          <div className={styles.wfAddHint}>根据条件判断结果选择分支（通过/打回）</div>
        )}
        {transitionType === "parallel" && (
          <div className={styles.wfAddHint}>同时触发多个下游角色并行工作</div>
        )}
        <div className={styles.wfAddActions}>
          <button
            className={styles.wfToolbarBtn + " " + styles.wfToolbarBtnPrimary}
            onClick={onConfirm}
          >
            确定
          </button>
          <button className={styles.wfToolbarBtn} onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: { label: string; action: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  return (
    <div className={styles.wfContextMenuOverlay} onClick={onClose}>
      <div
        className={styles.wfContextMenu}
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, i) => (
          <div
            key={i}
            className={`${styles.wfContextMenuItem} ${item.danger ? styles.wfContextMenuItemDanger : ""}`}
            onClick={() => {
              item.action();
              onClose();
            }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function validateWorkflow(nodes: FlowNode[], edges: Edge[]): { valid: boolean; error?: string } {
  // 1. Check for start node
  const startNodes = nodes.filter((n) => n.type === "startNode" || n.id === "start");
  if (startNodes.length === 0) return { valid: false, error: "流程缺少开始节点" };
  if (startNodes.length > 1) return { valid: false, error: "流程只能有一个开始节点" };

  // 2. Check for end node
  const endNodes = nodes.filter((n) => n.type === "endNode" || n.id === "end");
  if (endNodes.length === 0) return { valid: false, error: "流程缺少结束节点" };

  // 3. Reachability to end node
  const graph = new Map<string, string[]>();
  nodes.forEach((n) => graph.set(n.id, []));
  edges.forEach((e) => {
    if (graph.has(e.source)) {
      graph.get(e.source)!.push(e.target);
    }
  });

  for (const node of nodes) {
    if (node.type === "endNode" || node.id === "end") continue;

    const visited = new Set<string>();
    const stack = [node.id];
    let canReachEnd = false;

    while (stack.length > 0) {
      const curr = stack.pop()!;
      if (endNodes.some((n) => n.id === curr)) {
        canReachEnd = true;
        break;
      }
      if (!visited.has(curr)) {
        visited.add(curr);
        const neighbors = graph.get(curr) || [];
        for (const neighbor of neighbors) {
          stack.push(neighbor);
        }
      }
    }

    if (!canReachEnd) {
      const label = (node.data as any).label || node.id;
      return { valid: false, error: `节点 "${label}" 无法连通到结束节点，存在死胡同或未连接` };
    }
  }

  return { valid: true };
}

function WorkflowDesignerInner({
  projectId,
  roles,
  projectMembers,
  t,
}: {
  projectId: string;
  roles: AiRoleItem[];
  projectMembers: ProjectMember[];
  t: (key: string) => string;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [workflowGroups, setWorkflowGroups] = useState<WorkflowGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [edgeEditorOpen, setEdgeEditorOpen] = useState(false);
  const [edgeEditorData, setEdgeEditorData] = useState<{
    source: string;
    target: string;
    sourceHandle: string | null;
    artifactType: string;
    transitionType: string;
    rejectToRoleId: string;
    workflowId: string;
  }>({
    source: "",
    target: "",
    sourceHandle: null,
    artifactType: "",
    transitionType: "auto_push",
    rejectToRoleId: "",
    workflowId: "",
  });
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "node" | "edge";
    id: string;
  } | null>(null);

  const reactFlow = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const memberRoles = useMemo(() => {
    const memberRoleIds = new Set(projectMembers.map((m) => m.roleId));
    return roles.filter((r) => memberRoleIds.has(r.id));
  }, [roles, projectMembers]);

  const loadWorkflows = useCallback(async () => {
    try {
      const groups = await invoke<WorkflowGroup[]>("list_workflow_groups", { projectId });
      setWorkflowGroups(groups);

      // 如果没有选中的流程组，自动选中主流程组
      if (!activeGroupId && groups.length > 0) {
        const primary = groups.find((g) => g.isPrimary) || groups[0];
        setActiveGroupId(primary.id);
      }

      const list = await invoke<WorkflowData[]>("list_project_workflows", {
        projectId,
      });
      setWorkflows(list);

      // 根据选中的流程组过滤工作流
      const filtered = activeGroupId
        ? list.filter(
            (w) =>
              w.groupId === activeGroupId ||
              (!w.groupId && activeGroupId === groups.find((g) => g.isPrimary)?.id)
          )
        : list;
      const { nodes: flowNodes, edges: flowEdges } = buildFlowFromWorkflows(filtered, roles);
      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (err) {
      console.error("Failed to load workflows:", err);
    }
  }, [projectId, roles, setNodes, setEdges, activeGroupId]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: FlowNode) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge);
      setSelectedNode(null);

      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      if (
        (sourceNode?.type === "roleNode" || sourceNode?.type === "startNode") &&
        (targetNode?.type === "roleNode" || targetNode?.type === "endNode")
      ) {
        const fromRoleId =
          sourceNode.type === "startNode" ? "start" : (sourceNode as RoleNodeType).data.roleId;
        const toRoleId =
          targetNode.type === "endNode" ? "end" : (targetNode as RoleNodeType).data.roleId;

        const wf = workflows.find((w) => w.fromRoleId === fromRoleId && w.toRoleId === toRoleId);

        if (wf) {
          setEdgeEditorData({
            source: edge.source,
            target: edge.target,
            sourceHandle: (edge.sourceHandle as string) ?? null,
            artifactType: wf.artifactType || "",
            transitionType: wf.transitionType || "auto_push",
            rejectToRoleId: wf.rejectToRoleId || "",
            workflowId: wf.id,
          });
          setEdgeEditorOpen(true);
        }
      }

      if (sourceNode?.type === "roleNode" && targetNode?.type === "conditionNode") {
        const fromRoleId = (sourceNode as RoleNodeType).data.roleId;
        const wf = workflows.find(
          (w) => w.fromRoleId === fromRoleId && w.transitionType === "need_confirm"
        );
        if (wf) {
          setEdgeEditorData({
            source: fromRoleId,
            target: wf.toRoleId,
            sourceHandle: null,
            artifactType: wf.artifactType || "",
            transitionType: wf.transitionType,
            rejectToRoleId: wf.rejectToRoleId || "",
            workflowId: wf.id,
          });
          setEdgeEditorOpen(true);
        }
      }
    },
    [nodes, workflows]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setContextMenu(null);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/reactflow");
      if (!raw) return;

      let dndData: DnDData;
      try {
        dndData = JSON.parse(raw);
      } catch {
        return;
      }

      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: FlowNode = {
        id: getNextId(),
        type: dndData.type as FlowNode["type"],
        position,
        data: dndData.data as FlowNode["data"],
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlow, setNodes]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const sourceNode = nodes.find((n) => n.id === params.source);
      const isConditionNode = sourceNode?.type === "conditionNode";
      const isStartNode = sourceNode?.type === "startNode";

      if (isStartNode) {
        const targetNode = nodes.find((n) => n.id === params.target);
        const targetRole = targetNode as RoleNodeType | undefined;
        if (targetRole?.type === "roleNode") {
          const newEdge: Edge = {
            id: `e-start-${params.target}`,
            source: params.source,
            target: params.target,
            type: "smoothstep",
            style: { stroke: "#00b894", strokeWidth: 2 },
            label: "开始",
            labelStyle: { fill: "#00b894", fontWeight: 600, fontSize: 11 },
            labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
            labelBgPadding: [4, 6] as [number, number],
            labelBgBorderRadius: 4,
            markerEnd: { type: MarkerType.ArrowClosed as const, color: "#00b894" },
            data: { artifactType: "", transitionType: "auto_push" },
          };
          setEdges((eds) => addEdgeUnique(eds, newEdge));
          invoke("add_project_workflow", {
            req: {
              projectId,
              fromRoleId: "start",
              toRoleId: targetRole.data.roleId,
              artifactType: undefined,
              transitionType: "auto_push",
              groupId: activeGroupId || undefined,
            },
          })
            .then(() => {
              loadWorkflows();
              invoke("sync_workflow_to_file", { projectId }).catch(console.error);
            })
            .catch(console.error);
        }
        return;
      }

      setEdgeEditorData({
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle ?? null,
        artifactType: "",
        transitionType: isConditionNode ? "auto_push" : "auto_push",
        rejectToRoleId: "",
        workflowId: "",
      });
      setEdgeEditorOpen(true);
    },
    [nodes, projectId, loadWorkflows, setEdges]
  );

  const handleEdgeEditorConfirm = useCallback(() => {
    const {
      source,
      target,
      sourceHandle,
      artifactType,
      transitionType,
      rejectToRoleId,
      workflowId,
    } = edgeEditorData;

    const sourceNode = nodes.find((n) => n.id === source);
    const isConditionYes = sourceNode?.type === "conditionNode" && sourceHandle === "yes";
    const isConditionNo = sourceNode?.type === "conditionNode" && sourceHandle === "no";

    let edgeStyle: React.CSSProperties = { strokeWidth: 2 };
    let edgeLabel = artifactType || "";
    let edgeColor = "#6c5ce7";
    let edgeAnimated = true;
    let edgeMarkerEnd = { type: MarkerType.ArrowClosed as const, color: "#6c5ce7" };

    if (isConditionYes) {
      edgeStyle = { stroke: "#27ae60", strokeWidth: 2 };
      edgeLabel = "✅ 通过";
      edgeColor = "#27ae60";
      edgeAnimated = false;
      edgeMarkerEnd = { type: MarkerType.ArrowClosed as const, color: "#27ae60" };
    } else if (isConditionNo) {
      edgeStyle = { stroke: "#e74c3c", strokeWidth: 2, strokeDasharray: "5 3" };
      edgeLabel = "❌ 打回修改";
      edgeColor = "#e74c3c";
      edgeAnimated = false;
      edgeMarkerEnd = { type: MarkerType.ArrowClosed as const, color: "#e74c3c" };
    } else if (transitionType === "condition") {
      edgeStyle = { stroke: "#f39c12", strokeWidth: 2, strokeDasharray: "10 5" };
      edgeColor = "#f39c12";
      edgeLabel = artifactType ? `◆ ${artifactType}` : "◆ 条件分支";
      edgeAnimated = false;
      edgeMarkerEnd = { type: MarkerType.ArrowClosed as const, color: "#f39c12" };
    } else if (transitionType === "parallel") {
      edgeStyle = { stroke: "#00b894", strokeWidth: 2 };
      edgeColor = "#00b894";
      edgeLabel = artifactType ? `⊕ ${artifactType}` : "⊕ 并行执行";
      edgeAnimated = true;
      edgeMarkerEnd = { type: MarkerType.ArrowClosed as const, color: "#00b894" };
    } else if (transitionType === "need_confirm") {
      edgeStyle = { stroke: "#e67e22", strokeWidth: 2, strokeDasharray: "8 4" };
      edgeColor = "#e67e22";
      edgeLabel = artifactType ? `🔒 ${artifactType}` : "🔒 需确认";
    }

    const newEdge: Edge = {
      id: `e-${source}-${target}-${sourceHandle || "default"}`,
      source,
      target,
      sourceHandle: sourceHandle || undefined,
      type: "smoothstep",
      animated: edgeAnimated,
      style: edgeStyle,
      label: edgeLabel,
      labelStyle: { fill: edgeColor, fontWeight: 600, fontSize: 11 },
      labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
      labelBgPadding: [4, 6] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: edgeMarkerEnd,
      data: { artifactType, transitionType },
    };

    setEdges((eds) => addEdgeUnique(eds, newEdge));
    setEdgeEditorOpen(false);

    const sourceRole = sourceNode as RoleNodeType | StartNodeType | undefined;
    const targetNode = nodes.find((n) => n.id === target) as RoleNodeType | EndNodeType | undefined;

    if (
      (sourceRole?.type === "roleNode" || sourceRole?.type === "startNode") &&
      (targetNode?.type === "roleNode" || targetNode?.type === "endNode")
    ) {
      let conditionExpr = "";
      let branchLabel = "";
      let parallelGroup = "";

      if (isConditionYes) {
        branchLabel = "yes";
        conditionExpr = "approved";
      } else if (isConditionNo) {
        branchLabel = "no";
        conditionExpr = "approved";
      }

      if (transitionType === "parallel") {
        parallelGroup = `pg-${sourceRole.id}`;
      }

      const fromRoleId =
        sourceRole.type === "startNode" ? "start" : (sourceRole as RoleNodeType).data.roleId;

      const toRoleId =
        targetNode.type === "endNode" ? "end" : (targetNode as RoleNodeType).data.roleId;

      invoke("add_project_workflow", {
        req: {
          projectId,
          fromRoleId,
          toRoleId,
          artifactType: artifactType || undefined,
          transitionType: transitionType || undefined,
          rejectToRoleId: rejectToRoleId || undefined,
          conditionExpr: conditionExpr || undefined,
          branchLabel: branchLabel || undefined,
          parallelGroup: parallelGroup || undefined,
          groupId: activeGroupId || undefined,
        },
      })
        .then(async () => {
          if (workflowId) {
            try {
              await invoke("remove_project_workflow", { id: workflowId });
            } catch (err) {
              console.error("Failed to remove old workflow:", err);
            }
          }
          loadWorkflows();
          invoke("sync_workflow_to_file", { projectId }).catch(console.error);
        })
        .catch(console.error);
    }
  }, [edgeEditorData, nodes, projectId, loadWorkflows, setEdges]);

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      if (nodeId === "start") return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      if (node.type === "roleNode") {
        const roleData = node.data as RoleNodeType["data"];
        const relatedWfs = workflows.filter(
          (w) => w.fromRoleId === roleData.roleId || w.toRoleId === roleData.roleId
        );
        for (const wf of relatedWfs) {
          try {
            await invoke("remove_project_workflow", { id: wf.id });
          } catch (err) {
            console.error("Failed to remove workflow:", err);
          }
        }
      }

      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNode(null);

      if (node.type === "roleNode") {
        await loadWorkflows();
        invoke("sync_workflow_to_file", { projectId }).catch(console.error);
      }
    },
    [nodes, workflows, setNodes, setEdges, projectId, loadWorkflows]
  );

  const handleDeleteEdge = useCallback(
    async (edgeId: string) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;

      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setSelectedEdge(null);

      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      if (
        (sourceNode?.type === "roleNode" || sourceNode?.type === "startNode") &&
        (targetNode?.type === "roleNode" || targetNode?.type === "endNode")
      ) {
        const toRoleId =
          targetNode.type === "endNode" ? "end" : (targetNode as RoleNodeType).data.roleId;
        const fromRoleId =
          sourceNode.type === "startNode" ? "start" : (sourceNode as RoleNodeType).data.roleId;
        const wf = workflows.find((w) => w.fromRoleId === fromRoleId && w.toRoleId === toRoleId);
        if (wf) {
          try {
            await invoke("remove_project_workflow", { id: wf.id });
            await loadWorkflows();
            invoke("sync_workflow_to_file", { projectId }).catch(console.error);
          } catch (err) {
            console.error("Failed to remove workflow:", err);
          }
        }
      }
    },
    [edges, nodes, workflows, setEdges, projectId, loadWorkflows]
  );

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: FlowNode) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, type: "node", id: node.id });
  }, []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, type: "edge", id: edge.id });
  }, []);

  const handleAutoLayout = () => {
    const layouted = layoutGraph(nodes, edges);
    setNodes(layouted);
    setTimeout(() => reactFlow.fitView({ padding: 1 }), 50);
  };

  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const minimapNodeColor = (node: FlowNode) => {
    if (node.id === "start" || node.type === "startNode") return "#00b894";
    if (node.type === "conditionNode") return "#f39c12";
    if (node.type === "parallelNode") return "#00b894";
    if (node.type === "mergeNode") return "#0984e3";
    return "#6c5ce7";
  };

  const contextMenuItems = contextMenu
    ? contextMenu.type === "node"
      ? [{ label: "🗑️ 删除节点", action: () => handleDeleteNode(contextMenu.id), danger: true }]
      : (() => {
          const edge = edges.find((e) => e.id === contextMenu.id);
          const sourceNode = edge ? nodes.find((n) => n.id === edge.source) : null;
          const targetNode = edge ? nodes.find((n) => n.id === edge.target) : null;
          const fromRoleId =
            sourceNode?.type === "startNode" ? "start" : (sourceNode as RoleNodeType)?.data?.roleId;
          const toRoleId =
            targetNode?.type === "endNode" ? "end" : (targetNode as RoleNodeType)?.data?.roleId;
          const wf = workflows.find((w) => w.fromRoleId === fromRoleId && w.toRoleId === toRoleId);
          if (wf?.isPrimary) {
            return [{ label: "🔒 主流程不可删除", action: () => {}, danger: false }];
          }
          return [
            { label: "🗑️ 删除连线", action: () => handleDeleteEdge(contextMenu.id), danger: true },
          ];
        })()
    : [];

  return (
    <div className={styles.wfDesignerWithSidebar}>
      <Sidebar
        memberRoles={memberRoles}
        searchQuery={sidebarSearch}
        onSearchChange={setSidebarSearch}
      />
      <div className={styles.wfDesigner} ref={reactFlowWrapper}>
        {/* 流程组标签页 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "6px 12px",
            borderBottom: "1px solid #e0e0e0",
            background: "#fafafa",
            fontSize: 12,
          }}
        >
          {workflowGroups.map((g) => {
            const isEditing = editingGroupId === g.id;
            return isEditing ? (
              <input
                key={g.id}
                value={editingGroupName}
                onChange={(e) => setEditingGroupName(e.target.value)}
                onBlur={async () => {
                  const newName = editingGroupName.trim();
                  if (newName && newName !== g.name) {
                    try {
                      await invoke("update_workflow_group", { id: g.id, name: newName });
                      loadWorkflows();
                    } catch (err) {
                      console.error("Failed to rename workflow group:", err);
                    }
                  }
                  setEditingGroupId(null);
                }}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === "Escape") {
                    setEditingGroupId(null);
                  }
                }}
                autoFocus
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "2px solid #6c5ce7",
                  background: "#fff",
                  fontSize: 12,
                  outline: "none",
                  width: 100,
                }}
              />
            ) : (
              <button
                key={g.id}
                onClick={() => {
                  setActiveGroupId(g.id);
                }}
                onDoubleClick={() => {
                  if (g.isPrimary) return;
                  setEditingGroupId(g.id);
                  setEditingGroupName(g.name);
                }}
                style={{
                  padding: "4px 12px",
                  borderRadius: 4,
                  border: "1px solid #ddd",
                  background: activeGroupId === g.id ? "#6c5ce7" : "#fff",
                  color: activeGroupId === g.id ? "#fff" : "#333",
                  cursor: "pointer",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
                title={g.isPrimary ? "主流程（不可重命名）" : "双击修改名称"}
              >
                {g.name}
                {g.isPrimary && <span style={{ fontSize: 10 }}>🔒</span>}
                {!g.isPrimary && <span style={{ fontSize: 10, opacity: 0.5 }}>✏️</span>}
              </button>
            );
          })}
          <button
            onClick={async () => {
              try {
                const newGroup = await invoke<WorkflowGroup>("create_workflow_group", {
                  req: { projectId },
                });
                setActiveGroupId(newGroup.id);
                invoke("sync_workflow_to_file", { projectId }).catch(console.error);
              } catch (err) {
                console.error("Failed to create workflow group:", err);
              }
            }}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px dashed #bbb",
              background: "transparent",
              cursor: "pointer",
              fontSize: 12,
              color: "#999",
            }}
          >
            ➕ 添加流程
          </button>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange as OnNodesChange}
          onEdgesChange={onEdgesChange as OnEdgesChange}
          onNodeClick={onNodeClick as NodeMouseHandler}
          onEdgeClick={onEdgeClick as EdgeMouseHandler}
          onPaneClick={onPaneClick}
          onNodeContextMenu={onNodeContextMenu as NodeMouseHandler}
          onEdgeContextMenu={onEdgeContextMenu as EdgeMouseHandler}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 1 }}
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={["Backspace", "Delete"]}
          onNodesDelete={(deletedNodes) => {
            deletedNodes.forEach((n) => handleDeleteNode(n.id));
          }}
          onEdgesDelete={(deletedEdges) => {
            deletedEdges.forEach((e) => handleDeleteEdge(e.id));
          }}
        >
          <Background color="#e0e0e0" gap={20} />
          <Controls position="bottom-right" />
          <MiniMap
            nodeColor={minimapNodeColor as (node: Node) => string}
            maskColor="rgba(0,0,0,0.1)"
            style={{ width: 140, height: 100 }}
          />
          <Panel position="top-right" className={styles.wfToolbar}>
            <button
              className={styles.wfToolbarBtn}
              onClick={handleAutoLayout}
              title={t("studio.wf.autoLayout")}
            >
              🔀 {t("studio.wf.autoLayout")}
            </button>
            <button
              className={styles.wfToolbarBtn}
              onClick={async () => {
                const validation = validateWorkflow(nodes, edges);
                if (!validation.valid) {
                  alert("流程校验失败：\n" + validation.error);
                  return;
                }

                try {
                  const roleEdges = edges.filter((e) => {
                    const src = nodes.find((n) => n.id === e.source);
                    const tgt = nodes.find((n) => n.id === e.target);
                    return (
                      (src?.type === "roleNode" || src?.type === "startNode") &&
                      (tgt?.type === "roleNode" || tgt?.type === "endNode")
                    );
                  });
                  for (const edge of roleEdges) {
                    const srcNode = nodes.find((n) => n.id === edge.source);
                    const tgtNode = nodes.find((n) => n.id === edge.target) as
                      | RoleNodeType
                      | EndNodeType
                      | undefined;
                    if (!srcNode || !tgtNode) continue;
                    const fromRoleId =
                      srcNode.type === "startNode"
                        ? "start"
                        : (srcNode as RoleNodeType).data.roleId;
                    const toRoleId =
                      tgtNode.type === "endNode" ? "end" : (tgtNode as RoleNodeType).data.roleId;
                    const existing = workflows.find(
                      (w) => w.fromRoleId === fromRoleId && w.toRoleId === toRoleId
                    );
                    if (existing) continue;
                    await invoke("add_project_workflow", {
                      req: {
                        projectId,
                        fromRoleId,
                        toRoleId,
                        artifactType:
                          (edge.data as { artifactType?: string })?.artifactType || undefined,
                        transitionType:
                          (edge.data as { transitionType?: string })?.transitionType || undefined,
                        groupId: activeGroupId || undefined,
                      },
                    });
                  }
                  await invoke("sync_workflow_to_file", { projectId });
                  await loadWorkflows();
                  alert("同步成功");
                } catch (err) {
                  console.error("Failed to sync workflow:", err);
                  alert("同步失败: " + err);
                }
              }}
              title="同步工作流到配置文件"
            >
              💾 同步
            </button>
          </Panel>

          {selectedNode && selectedNode.type === "roleNode" && selectedNode.id !== "start" && (
            <Panel position="bottom-left" className={styles.wfDetailPanel}>
              <div className={styles.wfDetailHeader}>
                <span>
                  {(selectedNode.data as RoleNodeType["data"]).icon}{" "}
                  {(selectedNode.data as RoleNodeType["data"]).label}
                </span>
                <button className={styles.wfDetailClose} onClick={() => setSelectedNode(null)}>
                  ✕
                </button>
              </div>
              <div className={styles.wfDetailBody}>
                {(selectedNode.data as RoleNodeType["data"]).artifactType && (
                  <p>
                    <strong>{t("studio.wf.artifactType")}:</strong>{" "}
                    {(selectedNode.data as RoleNodeType["data"]).artifactType}
                  </p>
                )}
                <p>
                  <strong>{t("studio.wf.transitionType")}:</strong>{" "}
                  {(selectedNode.data as RoleNodeType["data"]).transitionType === "need_confirm"
                    ? "🔒 " + t("studio.needConfirm")
                    : "🔄 " + t("studio.autoPush")}
                </p>
                <div className={styles.wfDetailWorkflows}>
                  <strong>{t("studio.wf.relatedSteps")}:</strong>
                  {workflows
                    .filter(
                      (w) =>
                        w.fromRoleId === (selectedNode.data as RoleNodeType["data"]).roleId ||
                        w.toRoleId === (selectedNode.data as RoleNodeType["data"]).roleId
                    )
                    .map((w) => (
                      <div key={w.id} className={styles.wfDetailWfItem}>
                        <span>
                          {w.fromRoleId && w.fromRoleId !== "start" && w.fromRoleId !== "end"
                            ? roleMap.get(w.fromRoleId)?.icon +
                              " " +
                              roleMap.get(w.fromRoleId)?.name
                            : t("studio.workflowStart")}
                          → [{w.artifactType || "-"}] →
                          {w.toRoleId === "end"
                            ? "🏁 结束"
                            : `${roleMap.get(w.toRoleId)?.icon} ${roleMap.get(w.toRoleId)?.name}`}
                          {w.isPrimary && (
                            <span style={{ marginLeft: 4, fontSize: 11, color: "#e67e22" }}>
                              🔒 主流程
                            </span>
                          )}
                        </span>
                        <button
                          className={styles.wfDetailDelete}
                          onClick={() => {
                            if (w.isPrimary) return;
                            invoke("remove_project_workflow", { id: w.id })
                              .then(() => loadWorkflows())
                              .catch(console.error);
                          }}
                          disabled={w.isPrimary}
                          style={w.isPrimary ? { opacity: 0.3, cursor: "not-allowed" } : {}}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </Panel>
          )}

          {selectedEdge && (
            <Panel position="bottom-left" className={styles.wfDetailPanel}>
              <div className={styles.wfDetailHeader}>
                <span>🔗 连线属性</span>
                <button className={styles.wfDetailClose} onClick={() => setSelectedEdge(null)}>
                  ✕
                </button>
              </div>
              <div className={styles.wfDetailBody}>
                <p>
                  <strong>产出物:</strong>{" "}
                  {String((selectedEdge.data as Record<string, unknown>)?.artifactType || "-")}
                </p>
                <p>
                  <strong>流转方式:</strong>{" "}
                  {(selectedEdge.data as Record<string, unknown>)?.transitionType === "need_confirm"
                    ? "🔒 需确认"
                    : "🔄 自动推送"}
                </p>
                <div className={styles.wfDetailWfItem} style={{ marginTop: 8 }}>
                  <span>
                    {nodes.find((n) => n.id === selectedEdge.source)?.data?.label ||
                      selectedEdge.source}
                    {" → "}
                    {nodes.find((n) => n.id === selectedEdge.target)?.data?.label ||
                      selectedEdge.target}
                  </span>
                  <button
                    className={styles.wfDetailDelete}
                    onClick={() => handleDeleteEdge(selectedEdge.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {nodes.length === 0 && (
            <Panel position="top-center" className={styles.wfEmptyHint}>
              <p>{t("studio.noWorkflows")}</p>
              <p className={styles.wfEmptyHintSub}>从左侧拖拽节点到画布开始设计</p>
            </Panel>
          )}
        </ReactFlow>
      </div>

      <EdgeEditorModal
        open={edgeEditorOpen}
        artifactType={edgeEditorData.artifactType}
        transitionType={edgeEditorData.transitionType}
        rejectToRoleId={edgeEditorData.rejectToRoleId}
        roles={roles}
        onArtifactTypeChange={(v) => setEdgeEditorData((prev) => ({ ...prev, artifactType: v }))}
        onTransitionTypeChange={(v) =>
          setEdgeEditorData((prev) => ({ ...prev, transitionType: v }))
        }
        onRejectToRoleIdChange={(v) =>
          setEdgeEditorData((prev) => ({ ...prev, rejectToRoleId: v }))
        }
        onConfirm={handleEdgeEditorConfirm}
        onCancel={() => setEdgeEditorOpen(false)}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

function addEdgeUnique(edges: Edge[], newEdge: Edge): Edge[] {
  const filtered = edges.filter(
    (e) =>
      !(
        e.source === newEdge.source &&
        e.target === newEdge.target &&
        e.sourceHandle === newEdge.sourceHandle
      )
  );
  return [...filtered, newEdge];
}

export default function WorkflowDesigner(props: {
  projectId: string;
  roles: AiRoleItem[];
  projectMembers: ProjectMember[];
  t: (key: string) => string;
}) {
  return (
    <ReactFlowProvider>
      <WorkflowDesignerInner {...props} />
    </ReactFlowProvider>
  );
}
