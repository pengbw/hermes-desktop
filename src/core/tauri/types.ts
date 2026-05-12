export interface TauriCommandParams {
  [key: string]: unknown;
}

export interface TauriEventPayload<T = unknown> {
  event: string;
  id: number;
  payload: T;
}

export interface InstallCheckResult {
  installed: boolean;
  version: string;
  python: string;
}

export interface CreateMessageRequest {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string | null;
  files?: string;
  emotion?: string;
}

export interface ChatWithHermesRequest {
  message: string;
  conversationId: string;
  provider?: string;
  model?: string;
  aiRole?: string;
  kbIds?: string;
  files?: string;
}

export interface CreateConversationRequest {
  title?: string;
}

export interface UpdateConversationKbIdsRequest {
  id: string;
  kbIds: string;
}

export interface CreateProviderRequest {
  name: string;
  value: string;
  baseUrl: string;
  apiKey: string;
}

export interface UpdateProviderRequest {
  id: string;
  name: string;
  value: string;
  baseUrl: string;
  apiKey: string;
}

export interface CreateAvatarGestureRequest {
  name: string;
  duration: number;
  lookAtX: number;
  lookAtY: number;
  tilt: number;
  targetJson: string;
  source: string;
}

export interface UpdateAvatarGestureRequest {
  id: string;
  name?: string;
  duration?: number;
  lookAtX?: number;
  lookAtY?: number;
  tilt?: number;
  targetJson?: string;
  source?: string;
}

export interface CreateAiRoleRequest {
  name: string;
  nickname?: string;
  icon: string;
  description: string;
  responsibilities: string;
  soulContent: string;
  avatarUrl?: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarColor?: string;
}

export interface UpdateAiRoleRequest {
  id: string;
  name?: string;
  nickname?: string;
  icon?: string;
  description?: string;
  responsibilities?: string;
  soulContent?: string;
  avatarUrl?: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarColor?: string;
}

export interface UpdateProjectRequest {
  id: string;
  name?: string;
  description?: string;
  status?: string;
  tag?: string;
  icon?: string;
  isFavorite?: number;
  coverImage?: string;
  projectRule?: string;
  projectGuidelines?: string;
  officeTheme?: string;
  officeLayout?: string;
}

export interface CreateProjectTaskRequest {
  projectId: string;
  title: string;
  description: string;
  assigneeId?: string;
}

export interface UpdateProjectTaskRequest {
  status?: string;
  title?: string;
  description?: string;
  assigneeId?: string;
}

export interface KnowledgeConfig {
  defaultEmbeddingModel: string;
  defaultRetrievalMode: string;
  defaultMaxContextChunks: number;
  globalAutoRetrieve: boolean;
  cloudProvider: string;
  cloudEmbeddingModel: string;
  ollamaEndpoint: string;
  ollamaModel: string;
}
