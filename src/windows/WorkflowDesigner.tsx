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
import type { AiRoleItem, ProjectMember, ProjectWorkflow } from "@core/types";

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

type FlowNode = RoleNodeType | ConditionNodeType | ParallelNodeType | MergeNodeType;

function RoleNode({ data, selected }: NodeProps<RoleNodeType>) {
  const isUser = data.roleId === "builtin_user";
  return (
    <div
      className={`${styles.wfRoleNode} ${isUser ? styles.wfUserNode : ""} ${selected ? styles.selected : ""}`}
    >
      <Handle type="target" position={Position.Top} className={styles.wfHandle} />
      <div className={styles.wfRoleNodeHeader}>
        <span className={styles.wfRoleIcon}>{data.icon}</span>
        <span className={styles.wfRoleLabel}>{data.label}</span>
        {isUser && <span className={styles.wfUserBadge}>YOU</span>}
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

const nodeTypes = {
  roleNode: RoleNode,
  conditionNode: ConditionNode,
  parallelNode: ParallelNode,
  mergeNode: MergeNode,
};

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const layoutGraph = (nodes: FlowNode[], edges: Edge[]) => {
  dagreGraph.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 60 });
  nodes.forEach((node) => {
    const w =
      node.type === "conditionNode" || node.type === "parallelNode" || node.type === "mergeNode"
        ? 100
        : 130;
    const h =
      node.type === "conditionNode" || node.type === "parallelNode" || node.type === "mergeNode"
        ? 70
        : 60;
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

    if (toId) addRoleNode(toId, wf);
    if (fromId) addRoleNode(fromId, null);

    if (wf.transitionType === "need_confirm" && fromId && toId) {
      const condId = `cond_${conditionCounter.val++}`;
      const isUserConfirm = toId === "builtin_user";
      nodes.push({
        id: condId,
        type: "conditionNode",
        position: { x: 0, y: 0 },
        data: {
          label: isUserConfirm ? "用户审批" : "审批",
          conditionDesc: isUserConfirm ? "您确认通过？" : "确认通过？",
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

      edges.push({
        id: `e-${condId}-${fromId}-no`,
        source: condId,
        sourceHandle: "no",
        target: fromId,
        type: "smoothstep",
        style: { stroke: "#e74c3c", strokeWidth: 2, strokeDasharray: "5 3" },
        label: "❌ 打回修改",
        labelStyle: { fill: "#e74c3c", fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#e74c3c" },
      });
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
        style: { stroke: "#95a5a6", strokeWidth: 2 },
        label: "开始",
        labelStyle: { fill: "#95a5a6", fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#95a5a6" },
      });
    }
  }

  const hasStartTarget = edges.some((e) => e.source === "start");
  if (hasStartTarget) {
    nodes.push({
      id: "start",
      type: "roleNode",
      position: { x: 0, y: 0 },
      data: {
        roleId: "start",
        label: "开始",
        icon: "🚀",
        description: "",
        artifactType: "",
        transitionType: "auto_push",
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
  onArtifactTypeChange,
  onTransitionTypeChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  artifactType: string;
  transitionType: string;
  onArtifactTypeChange: (v: string) => void;
  onTransitionTypeChange: (v: string) => void;
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
          </div>
        </div>
        {transitionType === "need_confirm" && (
          <div className={styles.wfAddHint}>产出物需确认后才流转给下一角色</div>
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
  }>({
    source: "",
    target: "",
    sourceHandle: null,
    artifactType: "",
    transitionType: "auto_push",
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
      const list = await invoke<WorkflowData[]>("list_project_workflows", {
        projectId,
      });
      setWorkflows(list);
      const { nodes: flowNodes, edges: flowEdges } = buildFlowFromWorkflows(list, roles);
      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (err) {
      console.error("Failed to load workflows:", err);
    }
  }, [projectId, roles, setNodes, setEdges]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: FlowNode) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

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

      setEdgeEditorData({
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle ?? null,
        artifactType: "",
        transitionType: isConditionNode ? "auto_push" : "auto_push",
      });
      setEdgeEditorOpen(true);
    },
    [nodes]
  );

  const handleEdgeEditorConfirm = useCallback(() => {
    const { source, target, sourceHandle, artifactType, transitionType } = edgeEditorData;

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

    const sourceRole = sourceNode as RoleNodeType | undefined;
    const targetNode = nodes.find((n) => n.id === target) as RoleNodeType | undefined;

    if (sourceRole?.type === "roleNode" && targetNode?.type === "roleNode") {
      invoke("add_project_workflow", {
        req: {
          projectId,
          fromRoleId: sourceRole.data.roleId === "start" ? null : sourceRole.data.roleId || null,
          toRoleId: targetNode.data.roleId,
          artifactType: artifactType || undefined,
          transitionType: transitionType || undefined,
        },
      })
        .then(() => {
          loadWorkflows();
          invoke("sync_workflow_to_file", { projectId }).catch(console.error);
        })
        .catch(console.error);
    }
  }, [edgeEditorData, nodes, projectId, loadWorkflows, setEdges]);

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
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

      if (sourceNode?.type === "roleNode" && targetNode?.type === "roleNode") {
        const sourceData = (sourceNode as RoleNodeType).data;
        const targetData = (targetNode as RoleNodeType).data;
        const wf = workflows.find(
          (w) =>
            (w.fromRoleId === sourceData.roleId ||
              (!w.fromRoleId && sourceData.roleId === "start")) &&
            w.toRoleId === targetData.roleId
        );
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
    if (node.id === "start") return "#95a5a6";
    if (node.type === "conditionNode") return "#f39c12";
    if (node.type === "parallelNode") return "#00b894";
    if (node.type === "mergeNode") return "#0984e3";
    return "#6c5ce7";
  };

  const contextMenuItems = contextMenu
    ? contextMenu.type === "node"
      ? [{ label: "🗑️ 删除节点", action: () => handleDeleteNode(contextMenu.id), danger: true }]
      : [{ label: "🗑️ 删除连线", action: () => handleDeleteEdge(contextMenu.id), danger: true }]
    : [];

  return (
    <div className={styles.wfDesignerWithSidebar}>
      <Sidebar
        memberRoles={memberRoles}
        searchQuery={sidebarSearch}
        onSearchChange={setSidebarSearch}
      />
      <div className={styles.wfDesigner} ref={reactFlowWrapper}>
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
                try {
                  const roleEdges = edges.filter((e) => {
                    const src = nodes.find((n) => n.id === e.source);
                    const tgt = nodes.find((n) => n.id === e.target);
                    return src?.type === "roleNode" && tgt?.type === "roleNode";
                  });
                  for (const edge of roleEdges) {
                    const srcNode = nodes.find((n) => n.id === edge.source) as
                      | RoleNodeType
                      | undefined;
                    const tgtNode = nodes.find((n) => n.id === edge.target) as
                      | RoleNodeType
                      | undefined;
                    if (!srcNode || !tgtNode) continue;
                    const existing = workflows.find(
                      (w) =>
                        w.fromRoleId ===
                          (srcNode.data.roleId === "start" ? null : srcNode.data.roleId) &&
                        w.toRoleId === tgtNode.data.roleId
                    );
                    if (existing) continue;
                    await invoke("add_project_workflow", {
                      req: {
                        projectId,
                        fromRoleId:
                          srcNode.data.roleId === "start" ? null : srcNode.data.roleId || null,
                        toRoleId: tgtNode.data.roleId,
                        artifactType:
                          (edge.data as { artifactType?: string })?.artifactType || undefined,
                        transitionType:
                          (edge.data as { transitionType?: string })?.transitionType || undefined,
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
                          {w.fromRoleId
                            ? roleMap.get(w.fromRoleId)?.icon +
                              " " +
                              roleMap.get(w.fromRoleId)?.name
                            : t("studio.workflowStart")}
                          → [{w.artifactType || "-"}] →{roleMap.get(w.toRoleId)?.icon}{" "}
                          {roleMap.get(w.toRoleId)?.name}
                        </span>
                        <button
                          className={styles.wfDetailDelete}
                          onClick={() => {
                            invoke("remove_project_workflow", { id: w.id })
                              .then(() => loadWorkflows())
                              .catch(console.error);
                          }}
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
        onArtifactTypeChange={(v) => setEdgeEditorData((prev) => ({ ...prev, artifactType: v }))}
        onTransitionTypeChange={(v) =>
          setEdgeEditorData((prev) => ({ ...prev, transitionType: v }))
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
