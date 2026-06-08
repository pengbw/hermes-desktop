import { describe, it, expect, beforeEach, vi } from "vitest";
import { useProjectStore } from "@stores/projectStore";
import { invoke } from "@tauri-apps/api/core";
import type {
  ProjectArtifact,
  ProjectWorkflow,
  ProjectTask,
  ProjectMessage,
  ProjectBoard,
  ProjectActivity,
  ProjectMemory,
  ProjectItem,
} from "@core/types";

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

const fixtures = {
  project: {
    id: "proj-1",
    name: "Test Project",
    description: "Desc",
    icon: "📁",
    projectRule: "rule",
    isFavorite: false,
    createdAt: 1000,
    updatedAt: 1000,
  },
  member: {
    id: "m-1",
    projectId: "proj-1",
    roleId: "r-1",
    status: "active",
  },
};

describe("projectStore", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
    useProjectStore.setState({
      projects: [],
      selectedProject: null,
      projectMembers: [],
      projectArtifacts: [],
      projectWorkflows: [],
      projectTasks: [],
      projectMessages: [],
      projectBoards: [],
      projectActivities: [],
      projectMemories: [],
      allRoles: [],
      projectMembersMap: {},
      loading: true,
    });
  });

  it("初始 loading 应该为 true", () => {
    expect(useProjectStore.getState().loading).toBe(true);
  });

  it("setLoading 应该更新 loading", () => {
    useProjectStore.getState().setLoading(false);
    expect(useProjectStore.getState().loading).toBe(false);
  });

  it("setProjectMembers 应该更新 members", () => {
    useProjectStore.getState().setProjectMembers([fixtures.member]);
    expect(useProjectStore.getState().projectMembers).toEqual([fixtures.member]);
  });

  it("setProjectArtifacts 应该更新 artifacts", () => {
    const a = { id: "a-1", projectId: "proj-1" } as ProjectArtifact;
    useProjectStore.getState().setProjectArtifacts([a]);
    expect(useProjectStore.getState().projectArtifacts).toEqual([a]);
  });

  it("setProjectWorkflows 应该更新 workflows", () => {
    const w = { id: "w-1" } as ProjectWorkflow;
    useProjectStore.getState().setProjectWorkflows([w]);
    expect(useProjectStore.getState().projectWorkflows).toEqual([w]);
  });

  it("setProjectTasks 应该更新 tasks", () => {
    const t = { id: "t-1" } as ProjectTask;
    useProjectStore.getState().setProjectTasks([t]);
    expect(useProjectStore.getState().projectTasks).toEqual([t]);
  });

  it("setProjectMessages 应该更新 messages", () => {
    const m = { id: "m-1" } as ProjectMessage;
    useProjectStore.getState().setProjectMessages([m]);
    expect(useProjectStore.getState().projectMessages).toEqual([m]);
  });

  it("setProjectBoards 应该更新 boards", () => {
    const b = { id: "b-1" } as ProjectBoard;
    useProjectStore.getState().setProjectBoards([b]);
    expect(useProjectStore.getState().projectBoards).toEqual([b]);
  });

  it("setProjectActivities 应该更新 activities", () => {
    const a = { id: "a-1" } as ProjectActivity;
    useProjectStore.getState().setProjectActivities([a]);
    expect(useProjectStore.getState().projectActivities).toEqual([a]);
  });

  it("setProjectMemories 应该更新 memories", () => {
    const m = { id: "m-1" } as ProjectMemory;
    useProjectStore.getState().setProjectMemories([m]);
    expect(useProjectStore.getState().projectMemories).toEqual([m]);
  });

  it("setProjectMembersMap 应该更新 map", () => {
    const map = { "proj-1": [fixtures.member] };
    useProjectStore.getState().setProjectMembersMap(map);
    expect(useProjectStore.getState().projectMembersMap).toEqual(map);
  });

  it("loadProjects 应该设置 projects 和 membersMap", async () => {
    mockInvoke.mockResolvedValueOnce([fixtures.project]);
    mockInvoke.mockResolvedValueOnce([fixtures.member]);
    await useProjectStore.getState().loadProjects();
    expect(useProjectStore.getState().projects).toEqual([fixtures.project]);
    expect(useProjectStore.getState().projectMembersMap["proj-1"]).toEqual([fixtures.member]);
  });

  it("loadProjects 失败不应抛错", async () => {
    mockInvoke.mockReset();
    mockInvoke.mockRejectedValueOnce(new Error("fail"));
    await useProjectStore.getState().loadProjects();
    expect(useProjectStore.getState().projects).toEqual([]);
  });

  it("loadAllRoles 应该设置 allRoles", async () => {
    const roles = [{ id: "r-1", name: "Frontend" }];
    mockInvoke.mockResolvedValueOnce(roles);
    await useProjectStore.getState().loadAllRoles("zh-CN");
    expect(useProjectStore.getState().allRoles).toEqual(roles);
    expect(mockInvoke).toHaveBeenCalledWith("list_ai_roles", { locale: "zh-CN" });
  });

  it("selectProject(null) 应该清空 selectedProject", async () => {
    await useProjectStore.getState().selectProject(null);
    expect(useProjectStore.getState().selectedProject).toBeNull();
  });

  it("selectProject 设置项目并加载数据", async () => {
    mockInvoke.mockResolvedValueOnce([fixtures.member]);
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce([]);
    await useProjectStore.getState().selectProject(fixtures.project as ProjectItem);
    expect(useProjectStore.getState().selectedProject).toEqual(fixtures.project);
  });

  it("createBoard 应该调用 invoke('create_project_board')", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await useProjectStore.getState().createBoard("proj-1", "Board 1", "desc");
    expect(mockInvoke).toHaveBeenCalledWith("create_project_board", {
      req: { projectId: "proj-1", name: "Board 1", description: "desc" },
    });
  });

  it("deleteBoard 应该调用 invoke('delete_project_board')", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await useProjectStore.getState().deleteBoard("b-1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_project_board", { id: "b-1" });
  });

  it("archiveTask 应该调用 invoke('archive_project_task')", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await useProjectStore.getState().archiveTask("t-1");
    expect(mockInvoke).toHaveBeenCalledWith("archive_project_task", { id: "t-1" });
  });
});
