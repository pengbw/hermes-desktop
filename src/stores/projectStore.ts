import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  ProjectItem,
  ProjectMember,
  ProjectArtifact,
  ProjectWorkflow,
  ProjectTask,
  ProjectMessage,
  ProjectBoard,
  ProjectActivity,
  ProjectMemory,
  AiRoleItem,
} from "@core/types";

interface ProjectStore {
  projects: ProjectItem[];
  selectedProject: ProjectItem | null;
  projectMembers: ProjectMember[];
  projectArtifacts: ProjectArtifact[];
  projectWorkflows: ProjectWorkflow[];
  projectTasks: ProjectTask[];
  projectMessages: ProjectMessage[];
  projectBoards: ProjectBoard[];
  projectActivities: ProjectActivity[];
  projectMemories: ProjectMemory[];
  allRoles: AiRoleItem[];
  projectMembersMap: Record<string, ProjectMember[]>;
  loading: boolean;

  loadProjects: () => Promise<void>;
  selectProject: (project: ProjectItem | null) => Promise<void>;
  loadAllRoles: () => Promise<void>;
  setProjectMembers: (members: ProjectMember[]) => void;
  setProjectArtifacts: (artifacts: ProjectArtifact[]) => void;
  setProjectWorkflows: (workflows: ProjectWorkflow[]) => void;
  setProjectTasks: (tasks: ProjectTask[]) => void;
  setProjectMessages: (messages: ProjectMessage[]) => void;
  setProjectBoards: (boards: ProjectBoard[]) => void;
  setProjectActivities: (activities: ProjectActivity[]) => void;
  setProjectMemories: (memories: ProjectMemory[]) => void;
  setProjectMembersMap: (map: Record<string, ProjectMember[]>) => void;
  setLoading: (loading: boolean) => void;
  loadProjectBoards: (projectId: string) => Promise<void>;
  loadProjectActivities: (projectId: string) => Promise<void>;
  loadProjectMemories: (projectId: string) => Promise<void>;
  createBoard: (projectId: string, name: string, description?: string) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
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

  loadProjects: async () => {
    try {
      const list = await invoke<ProjectItem[]>("list_projects");
      set({ projects: list });
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
      set({ projectMembersMap: membersMap });
    } catch (err) {
// console.error("Failed to load projects:", err);
    }
  },

  selectProject: async (project) => {
    set({ selectedProject: project });
    if (project) {
      try {
        const [members, artifacts, workflows, tasks, messages, boards, activities, memories] =
          await Promise.all([
            invoke<ProjectMember[]>("list_project_members", { projectId: project.id }),
            invoke<ProjectArtifact[]>("list_project_artifacts", { projectId: project.id }),
            invoke<ProjectWorkflow[]>("list_project_workflows", { projectId: project.id }),
            invoke<ProjectTask[]>("list_project_tasks", { projectId: project.id }),
            invoke<ProjectMessage[]>("list_project_messages", { projectId: project.id }),
            invoke<ProjectBoard[]>("list_project_boards", { projectId: project.id }),
            invoke<ProjectActivity[]>("list_project_activities", {
              projectId: project.id,
              limit: 50,
            }),
            invoke<ProjectMemory[]>("list_project_memories", { projectId: project.id }),
          ]);
        set({
          projectMembers: members,
          projectArtifacts: artifacts,
          projectWorkflows: workflows,
          projectTasks: tasks,
          projectMessages: messages,
          projectBoards: boards,
          projectActivities: activities,
          projectMemories: memories,
        });
      } catch (err) {
// console.error("Failed to load project data:", err);
      }
    } else {
      set({
        projectMembers: [],
        projectArtifacts: [],
        projectWorkflows: [],
        projectTasks: [],
        projectMessages: [],
        projectBoards: [],
        projectActivities: [],
        projectMemories: [],
      });
    }
  },

  loadAllRoles: async () => {
    try {
      const roles = await invoke<AiRoleItem[]>("list_ai_roles");
      set({ allRoles: roles });
    } catch (err) {
// console.error("Failed to load roles:", err);
    }
  },

  setProjectMembers: (members) => set({ projectMembers: members }),
  setProjectArtifacts: (artifacts) => set({ projectArtifacts: artifacts }),
  setProjectWorkflows: (workflows) => set({ projectWorkflows: workflows }),
  setProjectTasks: (tasks) => set({ projectTasks: tasks }),
  setProjectMessages: (messages) => set({ projectMessages: messages }),
  setProjectBoards: (boards) => set({ projectBoards: boards }),
  setProjectActivities: (activities) => set({ projectActivities: activities }),
  setProjectMemories: (memories) => set({ projectMemories: memories }),
  setProjectMembersMap: (map) => set({ projectMembersMap: map }),
  setLoading: (loading) => set({ loading }),

  loadProjectBoards: async (projectId) => {
    try {
      const boards = await invoke<ProjectBoard[]>("list_project_boards", { projectId });
      set({ projectBoards: boards });
    } catch (err) {
// console.error("Failed to load boards:", err);
    }
  },

  loadProjectActivities: async (projectId) => {
    try {
      const activities = await invoke<ProjectActivity[]>("list_project_activities", {
        projectId,
        limit: 50,
      });
      set({ projectActivities: activities });
    } catch (err) {
// console.error("Failed to load activities:", err);
    }
  },

  loadProjectMemories: async (projectId) => {
    try {
      const memories = await invoke<ProjectMemory[]>("list_project_memories", { projectId });
      set({ projectMemories: memories });
    } catch (err) {
// console.error("Failed to load memories:", err);
    }
  },

  createBoard: async (projectId, name, description) => {
    try {
      await invoke("create_project_board", { req: { projectId, name, description } });
      await get().loadProjectBoards(projectId);
    } catch (err) {
// console.error("Failed to create board:", err);
    }
  },

  deleteBoard: async (id) => {
    try {
      await invoke("delete_project_board", { id });
      const project = get().selectedProject;
      if (project) {
        await get().loadProjectBoards(project.id);
      }
    } catch (err) {
// console.error("Failed to delete board:", err);
    }
  },

  archiveTask: async (id) => {
    try {
      await invoke("archive_project_task", { id });
      const project = get().selectedProject;
      if (project) {
        const tasks = await invoke<ProjectTask[]>("list_project_tasks", { projectId: project.id });
        set({ projectTasks: tasks });
      }
    } catch (err) {
// console.error("Failed to archive task:", err);
    }
  },
}));
