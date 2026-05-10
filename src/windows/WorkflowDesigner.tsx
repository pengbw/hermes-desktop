import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type OnNodesChange,
  type OnEdgesChange,
  MarkerType,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";
import { invoke } from "@tauri-apps/api/core";

interface AiRoleItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  responsibilities: string;
  soulContent: string;
  sortOrder: number;
  isBuiltin: boolean;
}

interface WorkflowData {
  id: string;
  projectId: string;
  fromRoleId: string | null;
  toRoleId: string;
  artifactType: string;
  transitionType: string;
  sortOrder: number;
}

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

type FlowNode = RoleNodeType | ConditionNodeType;

function RoleNode({ data, selected }: NodeProps<RoleNodeType>) {
  const isUser = data.roleId === "builtin_user";
  return (
    <div className={`wf-role-node ${isUser ? "wf-user-node" : ""} ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="wf-handle" />
      <div className="wf-role-node-header">
        <span className="wf-role-icon">{data.icon}</span>
        <span className="wf-role-label">{data.label}</span>
        {isUser && <span className="wf-user-badge">YOU</span>}
      </div>
      {data.artifactType && (
        <div className="wf-role-artifact">📦 {data.artifactType}</div>
      )}
      <div className={`wf-role-transition type-${data.transitionType}`}>
        {data.transitionType === "need_confirm" ? "🔒 需确认" : "🔄 自动"}
      </div>
      <Handle type="source" position={Position.Bottom} className="wf-handle" />
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps<ConditionNodeType>) {
  return (
    <div className={`wf-condition-node ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="wf-handle" />
      <div className="wf-condition-diamond">◆</div>
      <div className="wf-condition-label">{data.label}</div>
      {data.conditionDesc && (
        <div className="wf-condition-desc">{data.conditionDesc}</div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className="wf-handle wf-handle-yes"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="no"
        className="wf-handle wf-handle-no"
      />
    </div>
  );
}

const nodeTypes = {
  roleNode: RoleNode,
  conditionNode: ConditionNode,
};

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const layoutGraph = (nodes: FlowNode[], edges: Edge[]) => {
  dagreGraph.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });
  nodes.forEach((node) => {
    const w = node.type === "conditionNode" ? 160 : 200;
    const h = node.type === "conditionNode" ? 100 : 80;
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

function WorkflowDesignerInner({
  projectId,
  roles,
  t,
}: {
  projectId: string;
  roles: AiRoleItem[];
  t: (key: string) => string;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addForm, setAddForm] = useState({
    fromRoleId: "",
    toRoleId: "",
    artifactType: "",
    transitionType: "auto_push",
  });
  const reactFlow = useReactFlow();

  const loadWorkflows = useCallback(async () => {
    try {
      const list = await invoke<WorkflowData[]>("list_project_workflows", {
        projectId,
      });
      setWorkflows(list);
      const { nodes: flowNodes, edges: flowEdges } = buildFlowFromWorkflows(
        list,
        roles
      );
      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (err) {
      console.error("Failed to load workflows:", err);
    }
  }, [projectId, roles, setNodes, setEdges]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      setSelectedNode(node);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleAddWorkflow = async () => {
    if (!addForm.toRoleId) return;
    try {
      await invoke("add_project_workflow", {
        req: {
          projectId,
          fromRoleId: addForm.fromRoleId || null,
          toRoleId: addForm.toRoleId,
          artifactType: addForm.artifactType || undefined,
          transitionType: addForm.transitionType || undefined,
        },
      });
      setAddForm({
        fromRoleId: "",
        toRoleId: "",
        artifactType: "",
        transitionType: "auto_push",
      });
      setShowAddPanel(false);
      await loadWorkflows();
      invoke("sync_workflow_to_file", { projectId }).catch(console.error);
    } catch (err) {
      console.error("Failed to add workflow:", err);
    }
  };

  const handleDeleteWorkflow = async (wfId: string) => {
    try {
      await invoke("remove_project_workflow", { id: wfId });
      await loadWorkflows();
      invoke("sync_workflow_to_file", { projectId }).catch(console.error);
    } catch (err) {
      console.error("Failed to remove workflow:", err);
    }
  };

  const handleAutoLayout = () => {
    const layouted = layoutGraph(nodes, edges);
    setNodes(layouted);
    setTimeout(() => reactFlow.fitView({ padding: 0.2 }), 50);
  };

  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const minimapNodeColor = (node: FlowNode) => {
    if (node.id === "start") return "#95a5a6";
    if (node.type === "conditionNode") return "#f39c12";
    return "#6c5ce7";
  };

  return (
    <div className="wf-designer">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange as OnNodesChange}
        onEdgesChange={onEdgesChange as OnEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e0e0e0" gap={20} />
        <Controls position="bottom-right" />
        <MiniMap
          nodeColor={minimapNodeColor as any}
          maskColor="rgba(0,0,0,0.1)"
          style={{ width: 140, height: 100 }}
        />
        <Panel position="top-right" className="wf-toolbar">
          <button
            className="wf-toolbar-btn"
            onClick={handleAutoLayout}
            title={t("studio.wf.autoLayout")}
          >
            🔀 {t("studio.wf.autoLayout")}
          </button>
          <button
            className="wf-toolbar-btn"
            onClick={async () => {
              try {
                await invoke("sync_workflow_to_file", { projectId });
              } catch (err) {
                console.error("Failed to sync workflow:", err);
              }
            }}
            title="同步工作流到配置文件"
          >
            💾 同步
          </button>
          <button
            className="wf-toolbar-btn wf-toolbar-btn-primary"
            onClick={() => setShowAddPanel(!showAddPanel)}
          >
            + {t("studio.wf.addStep")}
          </button>
        </Panel>
        {showAddPanel && (
          <Panel position="top-left" className="wf-add-panel">
            <h4>{t("studio.wf.addStep")}</h4>
            <div className="wf-add-field">
              <label>{t("studio.wf.fromRole")}</label>
              <select
                value={addForm.fromRoleId}
                onChange={(e) =>
                  setAddForm({ ...addForm, fromRoleId: e.target.value })
                }
              >
                <option value="">{t("studio.workflowStart")}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.icon} {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="wf-add-field">
              <label>{t("studio.wf.toRole")}</label>
              <select
                value={addForm.toRoleId}
                onChange={(e) =>
                  setAddForm({ ...addForm, toRoleId: e.target.value })
                }
              >
                <option value="">{t("studio.selectRole")}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.icon} {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="wf-add-field">
              <label>{t("studio.wf.artifactType")}</label>
              <input
                className="wf-add-input"
                placeholder={t("studio.artifactTypePlaceholder")}
                value={addForm.artifactType}
                onChange={(e) =>
                  setAddForm({ ...addForm, artifactType: e.target.value })
                }
              />
            </div>
            <div className="wf-add-field">
              <label>{t("studio.wf.transitionType")}</label>
              <div className="wf-add-radio-group">
                <label className="wf-add-radio">
                  <input
                    type="radio"
                    name="transitionType"
                    value="auto_push"
                    checked={addForm.transitionType === "auto_push"}
                    onChange={() =>
                      setAddForm({ ...addForm, transitionType: "auto_push" })
                    }
                  />
                  🔄 {t("studio.autoPush")}
                </label>
                <label className="wf-add-radio">
                  <input
                    type="radio"
                    name="transitionType"
                    value="need_confirm"
                    checked={addForm.transitionType === "need_confirm"}
                    onChange={() =>
                      setAddForm({
                        ...addForm,
                        transitionType: "need_confirm",
                      })
                    }
                  />
                  🔒 {t("studio.needConfirm")}
                </label>
              </div>
            </div>
            {addForm.transitionType === "need_confirm" && (
              <div className="wf-add-hint">
                {t("studio.wf.confirmHint")}
              </div>
            )}
            <div className="wf-add-actions">
              <button
                className="wf-toolbar-btn wf-toolbar-btn-primary"
                onClick={handleAddWorkflow}
              >
                {t("studio.create")}
              </button>
              <button
                className="wf-toolbar-btn"
                onClick={() => setShowAddPanel(false)}
              >
                {t("studio.cancel")}
              </button>
            </div>
          </Panel>
        )}
        {selectedNode && selectedNode.type === "roleNode" &&
          selectedNode.id !== "start" && (
            <Panel position="bottom-left" className="wf-detail-panel">
              <div className="wf-detail-header">
                <span>
                  {(selectedNode.data as RoleNodeType["data"]).icon}{" "}
                  {(selectedNode.data as RoleNodeType["data"]).label}
                </span>
                <button
                  className="wf-detail-close"
                  onClick={() => setSelectedNode(null)}
                >
                  ✕
                </button>
              </div>
              <div className="wf-detail-body">
                {(selectedNode.data as RoleNodeType["data"]).artifactType && (
                  <p>
                    <strong>{t("studio.wf.artifactType")}:</strong>{" "}
                    {(selectedNode.data as RoleNodeType["data"]).artifactType}
                  </p>
                )}
                <p>
                  <strong>{t("studio.wf.transitionType")}:</strong>{" "}
                  {(selectedNode.data as RoleNodeType["data"]).transitionType ===
                  "need_confirm"
                    ? "🔒 " + t("studio.needConfirm")
                    : "🔄 " + t("studio.autoPush")}
                </p>
                <div className="wf-detail-workflows">
                  <strong>{t("studio.wf.relatedSteps")}:</strong>
                  {workflows
                    .filter(
                      (w) =>
                        w.fromRoleId === selectedNode.id ||
                        w.toRoleId === selectedNode.id
                    )
                    .map((w) => (
                      <div key={w.id} className="wf-detail-wf-item">
                        <span>
                          {w.fromRoleId
                            ? roleMap.get(w.fromRoleId)?.icon +
                              " " +
                              roleMap.get(w.fromRoleId)?.name
                            : t("studio.workflowStart")}
                          → [{w.artifactType || "-"}] →
                          {roleMap.get(w.toRoleId)?.icon}{" "}
                          {roleMap.get(w.toRoleId)?.name}
                        </span>
                        <button
                          className="wf-detail-delete"
                          onClick={() => handleDeleteWorkflow(w.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </Panel>
          )}
        {nodes.length === 0 && !showAddPanel && (
          <Panel position="top-center" className="wf-empty-hint">
            <p>{t("studio.noWorkflows")}</p>
            <button
              className="wf-toolbar-btn wf-toolbar-btn-primary"
              onClick={() => setShowAddPanel(true)}
            >
              + {t("studio.wf.addStep")}
            </button>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export default function WorkflowDesigner(props: {
  projectId: string;
  roles: AiRoleItem[];
  t: (key: string) => string;
}) {
  return (
    <ReactFlowProvider>
      <WorkflowDesignerInner {...props} />
    </ReactFlowProvider>
  );
}
