import { invoke } from "@tauri-apps/api/core";
import type {
  Conversation,
  Message,
  KnowledgeBase,
  KnowledgeFile,
  KnowledgeSource,
  ProjectItem,
  HermesConfigData,
  AvatarGesture,
  AiRoleItem,
  SkillsResult,
  BrowseResult,
} from "@core/types";
import type {
  InstallCheckResult,
  CreateMessageRequest,
  ChatWithHermesRequest,
  CreateConversationRequest,
  CreateProviderRequest,
  UpdateProviderRequest,
  CreateAvatarGestureRequest,
  UpdateAvatarGestureRequest,
  CreateAiRoleRequest,
  UpdateAiRoleRequest,
  UpdateProjectRequest,
  CreateProjectTaskRequest,
  UpdateProjectTaskRequest,
  KnowledgeConfig,
} from "@core/tauri/types";

export const TauriCommands = {
  async checkHermesInstalled(): Promise<InstallCheckResult> {
    return invoke<InstallCheckResult>("check_hermes_installed");
  },

  async toggleAvatarWindow(): Promise<boolean> {
    return invoke<boolean>("toggle_avatar_window");
  },

  async hideAvatarWindow(): Promise<void> {
    return invoke("hide_avatar_window");
  },

  async closeChatWindow(): Promise<void> {
    return invoke("close_chat_window");
  },

  async greet(name: string): Promise<string> {
    return invoke<string>("greet", { name });
  },

  async getConfig(): Promise<HermesConfigData> {
    return invoke<HermesConfigData>("get_config");
  },

  async setConfig(key: string, value: string): Promise<void> {
    return invoke("set_config", { key, value });
  },

  async listConversations(): Promise<Conversation[]> {
    return invoke<Conversation[]>("list_conversations");
  },

  async createConversation(req?: CreateConversationRequest): Promise<Conversation> {
    return invoke<Conversation>("create_conversation", req ? { req } : undefined);
  },

  async deleteConversation(id: string): Promise<void> {
    return invoke("delete_conversation", { id });
  },

  async renameConversation(id: string, title: string): Promise<void> {
    return invoke("rename_conversation", { id, title });
  },

  async updateConversationKbIds(id: string, kbIds: string): Promise<void> {
    return invoke("update_conversation_kb_ids", { id, kbIds });
  },

  async listMessages(conversationId: string): Promise<Message[]> {
    return invoke<Message[]>("list_messages", { conversationId });
  },

  async createMessage(req: CreateMessageRequest): Promise<Message> {
    return invoke<Message>("create_message", { req });
  },

  async chatWithHermesApi(params: ChatWithHermesRequest): Promise<string> {
    return invoke<string>("chat_with_hermes_api", { ...params });
  },

  async listProviders(): Promise<
    { id: string; name: string; value: string; baseUrl: string; apiKey: string }[]
  > {
    return invoke("list_providers");
  },

  async createProvider(req: CreateProviderRequest): Promise<void> {
    return invoke("create_provider", { req });
  },

  async updateProvider(id: string, req: Omit<UpdateProviderRequest, "id">): Promise<void> {
    return invoke("update_provider", { id, ...req });
  },

  async deleteProvider(id: string): Promise<void> {
    return invoke("delete_provider", { id });
  },

  async listAvatarGestures(): Promise<AvatarGesture[]> {
    return invoke<AvatarGesture[]>("list_avatar_gestures");
  },

  async createAvatarGesture(req: CreateAvatarGestureRequest): Promise<AvatarGesture> {
    return invoke<AvatarGesture>("create_avatar_gesture", { req });
  },

  async updateAvatarGesture(req: UpdateAvatarGestureRequest): Promise<void> {
    return invoke("update_avatar_gesture", { req });
  },

  async deleteAvatarGesture(id: string): Promise<void> {
    return invoke("delete_avatar_gesture", { id });
  },

  async listAiRoles(): Promise<AiRoleItem[]> {
    return invoke<AiRoleItem[]>("list_ai_roles");
  },

  async createAiRole(req: CreateAiRoleRequest): Promise<AiRoleItem> {
    return invoke<AiRoleItem>("create_ai_role", { req });
  },

  async updateAiRole(req: UpdateAiRoleRequest): Promise<void> {
    return invoke("update_ai_role", { req });
  },

  async deleteAiRole(id: string): Promise<void> {
    return invoke("delete_ai_role", { id });
  },

  async listKnowledgeBases(): Promise<KnowledgeBase[]> {
    return invoke<KnowledgeBase[]>("list_knowledge_bases");
  },

  async createKnowledgeBase(req: {
    name: string;
    description: string;
    icon: string;
    directories: string;
    embeddingModel: string;
    retrievalMode: string;
    maxContextChunks: number;
    autoRetrieve: boolean;
  }): Promise<KnowledgeBase> {
    return invoke<KnowledgeBase>("create_knowledge_base", { req });
  },

  async updateKnowledgeBase(req: Partial<KnowledgeBase> & { id: string }): Promise<void> {
    return invoke("update_knowledge_base", { req });
  },

  async deleteKnowledgeBase(id: string): Promise<void> {
    return invoke("delete_knowledge_base", { id });
  },

  async indexKnowledgeBase(id: string): Promise<void> {
    return invoke("index_knowledge_base", { id });
  },

  async listKnowledgeFiles(knowledgeBaseId: string): Promise<KnowledgeFile[]> {
    return invoke<KnowledgeFile[]>("list_knowledge_files", { knowledgeBaseId });
  },

  async searchKnowledgeBase(id: string, query: string, limit?: number): Promise<KnowledgeSource[]> {
    return invoke("search_knowledge_base", { id, query, limit });
  },

  async importKnowledgeBase(id: string, data: string): Promise<void> {
    return invoke("import_knowledge_base", { id, data });
  },

  async getKnowledgeConfig(): Promise<KnowledgeConfig> {
    return invoke<KnowledgeConfig>("get_knowledge_config");
  },

  async setKnowledgeConfig(config: KnowledgeConfig): Promise<void> {
    return invoke("set_knowledge_config", { config });
  },

  async installLocalEmbeddingModel(): Promise<void> {
    return invoke("install_local_embedding_model");
  },

  async listProjects(): Promise<ProjectItem[]> {
    return invoke<ProjectItem[]>("list_projects");
  },

  async createProject(req: { name: string; description: string }): Promise<ProjectItem> {
    return invoke<ProjectItem>("create_project", { req });
  },

  async updateProject(req: UpdateProjectRequest): Promise<void> {
    return invoke("update_project", { req });
  },

  async deleteProject(id: string): Promise<void> {
    return invoke("delete_project", { id });
  },

  async importProject(data: string): Promise<ProjectItem> {
    return invoke<ProjectItem>("import_project", { data });
  },

  async addProjectMember(projectId: string, name: string, role: string): Promise<void> {
    return invoke("add_project_member", { projectId, name, role });
  },

  async removeProjectMember(id: string): Promise<void> {
    return invoke("remove_project_member", { id });
  },

  async updateMemberEquipment(memberId: string, equipmentLevel: number): Promise<void> {
    return invoke("update_member_equipment", { memberId, equipmentLevel });
  },

  async createProjectMessage(
    projectId: string,
    content: string,
    senderName?: string,
    senderRole?: string
  ): Promise<void> {
    return invoke("create_project_message", { projectId, content, senderName, senderRole });
  },

  async chatWithProjectRoles(projectId: string, message: string): Promise<string> {
    return invoke<string>("chat_with_project_roles", { projectId, message });
  },

  async chatWithProjectRole(projectId: string, roleId: string, message: string): Promise<string> {
    return invoke<string>("chat_with_project_role", { projectId, roleId, message });
  },

  async approveProjectArtifact(id: string): Promise<void> {
    return invoke("approve_project_artifact", { id });
  },

  async rejectProjectArtifact(id: string, reason: string): Promise<void> {
    return invoke("reject_project_artifact", { id, reason });
  },

  async createProjectTask(req: CreateProjectTaskRequest): Promise<void> {
    return invoke("create_project_task", { req });
  },

  async updateProjectTask(id: string, req: UpdateProjectTaskRequest): Promise<void> {
    return invoke("update_project_task", { id, req });
  },

  async deleteProjectTask(id: string): Promise<void> {
    return invoke("delete_project_task", { id });
  },

  async addProjectWorkflow(
    projectId: string,
    name: string,
    description: string,
    data: string
  ): Promise<void> {
    return invoke("add_project_workflow", { projectId, name, description, data });
  },

  async removeProjectWorkflow(id: string): Promise<void> {
    return invoke("remove_project_workflow", { id });
  },

  async syncWorkflowToFile(projectId: string): Promise<void> {
    return invoke("sync_workflow_to_file", { projectId });
  },

  async triggerWorkflowExecution(
    workflowId: string,
    params?: Record<string, string>
  ): Promise<void> {
    return invoke("trigger_workflow_execution", { workflowId, params });
  },

  async runWorkflowAutoChat(projectId: string, workflowId: string, input: string): Promise<void> {
    return invoke("run_workflow_auto_chat", { projectId, workflowId, input });
  },

  async listSkills(): Promise<SkillsResult> {
    return invoke<SkillsResult>("list_skills");
  },

  async installSkill(identifier: string): Promise<void> {
    return invoke("install_skill", { identifier });
  },

  async uninstallSkill(name: string): Promise<void> {
    return invoke("uninstall_skill", { name });
  },

  async browseSkills(query?: string): Promise<BrowseResult> {
    return invoke<BrowseResult>("browse_skills", { query });
  },

  async toggleSkill(name: string, enabled: boolean): Promise<void> {
    return invoke("toggle_skill", { name, enabled });
  },
};
