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
  ProjectTemplateDetail,
  CreateProjectFromTemplateRequest,
  ChannelStatusResult,
  QrCodeResult,
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

  async listProviders(
    locale?: string
  ): Promise<{ id: string; name: string; value: string; baseUrl: string; apiKey: string }[]> {
    return invoke("list_providers", locale ? { locale } : undefined);
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

  async listAiRoles(locale?: string): Promise<AiRoleItem[]> {
    return invoke<AiRoleItem[]>("list_ai_roles", locale ? { locale } : undefined);
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

  async addProjectMember(projectId: string, roleId: string): Promise<void> {
    return invoke("add_project_member", { req: { projectId, roleId } });
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
    _senderName?: string,
    _senderRole?: string
  ): Promise<void> {
    return invoke("create_project_message", {
      req: {
        projectId,
        content,
        messageType: "text",
      },
    });
  },

  async chatWithProjectRoles(projectId: string, message: string): Promise<string> {
    return invoke<string>("chat_with_project_roles", { projectId, message });
  },

  async chatWithProjectRole(projectId: string, roleId: string, message: string): Promise<string> {
    return invoke<string>("chat_with_project_role", { projectId, roleId, message });
  },

  async approveProjectArtifact(id: string, comment?: string): Promise<void> {
    return invoke("approve_project_artifact", { id, comment });
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
    projectId: string,
    fromRoleId: string,
    artifactType?: string,
    conditionResult?: string
  ): Promise<void> {
    return invoke("trigger_workflow_execution", {
      projectId,
      fromRoleId,
      artifactType,
      conditionResult,
    });
  },

  async runWorkflowAutoChat(projectId: string, workflowId: string, input: string): Promise<void> {
    return invoke("run_workflow_auto_chat", { projectId, workflowId, input });
  },

  async listSkills(): Promise<SkillsResult> {
    return invoke<SkillsResult>("list_hermes_skills");
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

  async addTaskComment(taskId: string, roleId: string, content: string): Promise<void> {
    return invoke("add_task_comment", { req: { taskId, roleId, content } });
  },

  async listTaskComments(taskId: string): Promise<void> {
    return invoke("list_task_comments", { taskId });
  },

  async linkTasks(fromTaskId: string, toTaskId: string, linkType: string): Promise<void> {
    return invoke("link_tasks", { fromTaskId, toTaskId, linkType });
  },

  async unlinkTasks(linkId: string): Promise<void> {
    return invoke("unlink_tasks", { linkId });
  },

  async listTaskLinks(taskId: string): Promise<void> {
    return invoke("list_task_links", { taskId });
  },

  async listTaskEvents(taskId: string): Promise<void> {
    return invoke("list_task_events", { taskId });
  },

  async startWorkflowRun(
    projectId: string,
    initialMessage: string,
    groupId?: string,
    taskId?: string
  ): Promise<void> {
    return invoke("start_workflow_run", {
      projectId,
      initialMessage,
      groupId: groupId || null,
      taskId: taskId || null,
    });
  },

  async pauseWorkflowRun(runId: string): Promise<void> {
    return invoke("pause_workflow_run", { runId });
  },

  async resumeWorkflowRun(runId: string): Promise<void> {
    return invoke("resume_workflow_run", { runId });
  },

  async confirmWorkflowStep(runId: string, approved: boolean, comment?: string): Promise<void> {
    return invoke("confirm_workflow_step", { runId, approved, comment });
  },

  async listWorkflowRuns(projectId: string): Promise<void> {
    return invoke("list_workflow_runs", { projectId });
  },

  async getWorkflowRunStatus(runId: string): Promise<void> {
    return invoke("get_workflow_run_status", { runId });
  },

  async createArtifactVersion(artifactId: string): Promise<void> {
    return invoke("create_artifact_version", { artifactId });
  },

  async listArtifactVersions(artifactId: string): Promise<void> {
    return invoke("list_artifact_versions", { artifactId });
  },

  async diffArtifactVersions(fromId: string, toId: string): Promise<void> {
    return invoke("diff_artifact_versions", { fromId, toId });
  },

  async bindRoleSkill(roleId: string, skillName: string): Promise<void> {
    return invoke("bind_role_skill", { roleId, skillName });
  },

  async unbindRoleSkill(id: string): Promise<void> {
    return invoke("unbind_role_skill", { id });
  },

  async listRoleSkills(roleId: string): Promise<void> {
    return invoke("list_role_skills", { roleId });
  },

  async bindMemberSkill(projectId: string, memberId: string, skillName: string): Promise<void> {
    return invoke("bind_member_skill", { projectId, memberId, skillName });
  },

  async unbindMemberSkill(id: string): Promise<void> {
    return invoke("unbind_member_skill", { id });
  },

  async listMemberSkills(projectId: string, memberId: string): Promise<void> {
    return invoke("list_member_skills", { projectId, memberId });
  },

  async listProjectActivities(projectId: string, limit?: number): Promise<void> {
    return invoke("list_project_activities", { projectId, limit });
  },

  async getProjectStats(projectId: string): Promise<void> {
    return invoke("get_project_stats", { projectId });
  },

  async createProjectMemory(
    projectId: string,
    roleId: string,
    content: string,
    category?: string,
    importance?: number
  ): Promise<void> {
    return invoke("create_project_memory", {
      req: { projectId, roleId, content, category, importance },
    });
  },

  async listProjectMemories(projectId: string, roleId?: string, category?: string): Promise<void> {
    return invoke("list_project_memories", { projectId, roleId, category });
  },

  async deleteProjectMemory(id: string): Promise<void> {
    return invoke("delete_project_memory", { id });
  },

  async listProjectFileRecords(projectId: string): Promise<any[]> {
    return invoke("list_project_file_records", { projectId });
  },

  async createProjectFileRecord(req: {
    projectId: string;
    roleId: string;
    taskId?: string;
    filePath: string;
    fileName: string;
    fileExt?: string;
    fileSize?: number;
    description?: string;
  }): Promise<any> {
    return invoke("create_project_file_record", { req });
  },

  async deleteProjectFileRecord(id: string): Promise<void> {
    return invoke("delete_project_file_record", { id });
  },

  async cleanupInvalidFileRecords(projectId: string): Promise<number> {
    return invoke("cleanup_invalid_file_records", { projectId });
  },

  async scanProjectFiles(projectId: string, roleId?: string): Promise<any[]> {
    return invoke("scan_project_files", { projectId, roleId });
  },

  async recordChatFiles(projectId: string, roleId: string, taskId?: string): Promise<void> {
    return invoke("record_chat_files", { projectId, roleId, taskId: taskId || "" });
  },

  async listProjectBoards(projectId: string): Promise<any[]> {
    return invoke("list_project_boards", { projectId });
  },

  async createProjectBoard(req: {
    projectId: string;
    name: string;
    description?: string;
  }): Promise<any> {
    return invoke("create_project_board", { req });
  },

  async updateProjectBoard(
    id: string,
    req: {
      name?: string;
      description?: string;
      sortOrder?: number;
    }
  ): Promise<void> {
    return invoke("update_project_board", { id, req });
  },

  async deleteProjectBoard(id: string): Promise<void> {
    return invoke("delete_project_board", { id });
  },

  async archiveProjectTask(id: string): Promise<void> {
    return invoke("archive_project_task", { id });
  },

  async updateMessageTokens(
    messageId: string,
    projectId: string,
    promptTokens: number,
    completionTokens: number
  ): Promise<void> {
    return invoke("update_message_tokens", {
      messageId,
      projectId,
      promptTokens,
      completionTokens,
    });
  },

  async preprocessSkillTemplate(
    projectId: string,
    roleId: string,
    template: string
  ): Promise<string> {
    return invoke("preprocess_skill_template", { projectId, roleId, template });
  },

  async listProjectTemplates(locale?: string): Promise<ProjectTemplateDetail[]> {
    return invoke<ProjectTemplateDetail[]>(
      "list_project_templates",
      locale ? { locale } : undefined
    );
  },

  async createProjectFromTemplate(
    req: CreateProjectFromTemplateRequest,
    locale?: string
  ): Promise<ProjectItem> {
    return invoke<ProjectItem>("create_project_from_template", { req, locale });
  },

  async listChannelStatuses(): Promise<ChannelStatusResult[]> {
    return invoke<ChannelStatusResult[]>("list_channel_statuses");
  },

  async channelSetupQr(channelType: string): Promise<QrCodeResult> {
    return invoke<QrCodeResult>("channel_setup_qr", { channelType });
  },

  async channelSetupToken(channelType: string, config: Record<string, unknown>): Promise<void> {
    return invoke("channel_setup_token", { channelType, config });
  },

  async channelDisconnect(channelType: string): Promise<void> {
    return invoke("channel_disconnect", { channelType });
  },

  async channelSetHome(channelType: string): Promise<void> {
    return invoke("channel_set_home", { channelType });
  },

  async channelCheckStatus(channelType: string): Promise<ChannelStatusResult> {
    return invoke<ChannelStatusResult>("channel_check_status", { channelType });
  },

  async channelConfirmQr(channelType: string): Promise<void> {
    return invoke("channel_confirm_qr", { channelType });
  },

  async restartGateway(): Promise<void> {
    return invoke("restart_gateway");
  },
};
