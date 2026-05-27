import type { AiRoleItem } from "../types";

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
  body?: string;
  assignee?: string;
  status?: string;
  priority?: number;
  parentTaskId?: string;
  skills?: string;
  maxRetries?: number;
  workspaceKind?: string;
  workspacePath?: string;
}

export interface UpdateProjectTaskRequest {
  title?: string;
  body?: string;
  assignee?: string;
  status?: string;
  priority?: number;
  result?: string;
  skills?: string;
  maxRetries?: number;
  workspaceKind?: string;
  workspacePath?: string;
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

export interface TemplateWorkflow {
  id: string;
  templateId: string;
  fromRoleId: string;
  toRoleId: string;
  artifactType: string;
  transitionType: string;
  rejectToRoleId: string;
  sortOrder: number;
}

export interface ProjectTemplateDetail {
  id: string;
  name: string;
  icon: string;
  description: string;
  projectRule: string;
  projectGuidelines: string;
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  roles: AiRoleItem[];
  workflows: TemplateWorkflow[];
}

export interface CreateProjectFromTemplateRequest {
  name: string;
  description?: string;
  icon?: string;
  templateId: string;
  officeTheme?: string;
}

export interface CreateEmptyProjectRequest {
  name: string;
  description?: string;
  icon?: string;
  officeTheme?: string;
}

export interface ChannelStatusResult {
  id: string;
  channelType: string;
  displayName: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  isHome: boolean;
  errorMessage?: string;
  connectedAt?: number;
  configJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface QrCodeResult {
  qrData: string;
  qrType: string;
  expiresIn?: number;
}

export interface McpServerInfo {
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
  tool_count?: number;
  auth?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface McpToolInfo {
  name: string;
  server_name: string;
  description?: string;
}

export interface CronJob {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  schedule_display: string;
  skills: string[];
  enabled: boolean;
  state: "scheduled" | "paused" | "running" | "completed" | "error";
  next_run?: string;
  last_run?: string;
  created_at?: number;
  updated_at?: number;
}

export interface CronJobOutput {
  id: string;
  job_id: string;
  job_name: string;
  status: string;
  output: string;
  started_at?: string;
  finished_at?: string;
  duration?: number;
}
