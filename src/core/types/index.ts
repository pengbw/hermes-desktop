export interface KnowledgeSource {
  content: string;
  file_name?: string;
  file_path?: string;
  score?: number;
  kb_name?: string;
  source_type: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  files?: string;
  timestamp: number;
  knowledgeSources?: KnowledgeSource[];
  emotion?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  files?: string;
  emotion?: string;
}

export interface Conversation {
  id: string;
  title: string;
  hermesSessionId?: string;
  status: string;
  kbIds?: string;
  lastActiveAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatSessionState {
  isStreaming: boolean;
  isThinking: boolean;
  thinkingContent: string;
  streamedContent: string;
  toolProgress: string;
}

export interface AttachedFile {
  name: string;
  path: string;
}

export interface QuickCard {
  id: string;
  name: string;
  icon: string;
  prompt: string;
  source: "builtin" | "custom";
}

export interface HermesConfigData {
  model: string;
  provider: string;
  base_url: string;
  max_turns: number;
  personality: string;
  show_reasoning: boolean;
  timezone: string;
  terminal_backend: string;
  terminal_timeout: number;
  compression_enabled: boolean;
  memory_enabled: boolean;
  tts_provider: string;
  workspaceRoot?: string;
  hermesApiBase?: string;
  hermesApiKey?: string;
  config_path: string;
  env_path: string;
}

export interface AvatarGesture {
  id: string;
  name: string;
  duration: number;
  lookAtX: number;
  lookAtY: number;
  tilt: number;
  targetJson: string;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface AiRoleItem {
  id: string;
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
  sortOrder: number;
  isBuiltin: boolean;
  energy: number;
  mood: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  icon: string;
  directories: string;
  embeddingModel: string;
  retrievalMode: string;
  maxContextChunks: number;
  autoRetrieve: boolean;
  status: string;
  fileCount: number;
  chunkCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeFile {
  id: string;
  knowledgeBaseId: string;
  filePath: string;
  fileName: string;
  fileExt: string;
  fileSize: number;
  chunkCount: number;
  indexStatus: string;
  modifiedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  workspacePath: string;
  status: string;
  tag: string;
  icon: string;
  isFavorite: number;
  coverImage: string;
  projectRule: string;
  projectGuidelines: string;
  officeTheme: string;
  officeLayout: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  roleId: string;
  profileName: string;
  customSoul: string;
  customResponsibilities: string;
  equipmentLevel: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectWorkflow {
  id: string;
  projectId: string;
  fromRoleId: string | null;
  toRoleId: string;
  artifactType: string;
  transitionType: string;
  taskId: string;
  conditionExpr: string;
  branchLabel: string;
  parallelGroup: string;
  isPrimary: boolean;
  groupId: string | null;
  sortOrder: number;
  createdAt: number;
}

export interface WorkflowGroup {
  id: string;
  projectId: string;
  name: string;
  isPrimary: boolean;
  parentGroupId: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectArtifact {
  id: string;
  projectId: string;
  roleId: string;
  taskId: string;
  artifactType: string;
  title: string;
  filePath: string;
  content: string;
  status: string;
  reviewComment: string;
  workflowRunId: string | null;
  stepIndex: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectMessage {
  id: string;
  projectId: string;
  roleId: string;
  content: string;
  messageType: string;
  promptTokens: number;
  completionTokens: number;
  createdAt: number;
}

export interface ProjectFileRecord {
  id: string;
  projectId: string;
  roleId: string;
  filePath: string;
  fileName: string;
  fileExt: string;
  fileSize: number;
  description: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  body: string;
  assignee: string;
  status: string;
  priority: number;
  parentTaskId: string;
  artifactId: string;
  result: string;
  claimLock: string;
  claimExpireAt: number;
  startedAt: number | null;
  completedAt: number | null;
  skills: string;
  maxRetries: number;
  retryCount: number;
  workspaceKind: string;
  workspacePath: string;
  boardId: string;
  workflowGroupId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectBoard {
  id: string;
  projectId: string;
  name: string;
  description: string;
  sortOrder: number;
  isDefault: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskComment {
  id: string;
  taskId: string;
  roleId: string;
  content: string;
  createdAt: number;
}

export interface TaskLink {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  linkType: string;
  createdAt: number;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: string;
  roleId: string | null;
  detail: string;
  createdAt: number;
}

export interface TaskDispatch {
  id: string;
  taskId: string;
  roleId: string;
  dispatchType: "manual" | "auto" | "workflow";
  message: string;
  status: "pending" | "sent" | "acknowledged" | "failed";
  createdAt: number;
}

export interface WorkflowRun {
  id: string;
  projectId: string;
  workflowId: string | null;
  currentStep: number;
  status: string;
  context: string;
  taskId: string;
  startedAt: number;
  completedAt: number | null;
}

export interface WorkflowRunStep {
  id: string;
  runId: string;
  stepIndex: number;
  roleId: string | null;
  action: string;
  status: string;
  input: string;
  output: string;
  startedAt: number | null;
  completedAt: number | null;
}

export interface WorkflowRunStatus {
  run: WorkflowRun;
  steps: WorkflowRunStep[];
}

export interface ArtifactVersion {
  id: string;
  artifactId: string;
  version: number;
  content: string;
  filePath: string;
  createdAt: number;
}

export interface ArtifactDiff {
  fromVersion: ArtifactVersion;
  toVersion: ArtifactVersion;
  additions: number;
  deletions: number;
  diffText: string;
}

export interface RoleSkill {
  id: string;
  roleId: string;
  skillName: string;
  enabled: boolean;
  createdAt: number;
}

export interface ProjectMemberSkill {
  id: string;
  projectId: string;
  memberId: string;
  skillName: string;
  enabled: boolean;
  createdAt: number;
}

export interface ProjectActivity {
  id: string;
  projectId: string;
  roleId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string;
  createdAt: number;
}

export interface TaskProgress {
  task: ProjectTask;
  workflowRun: WorkflowRunStatus | null;
  artifacts: ProjectArtifact[];
  activities: ProjectActivity[];
}

export interface PendingReviewTask {
  task: ProjectTask;
  pendingArtifacts: ProjectArtifact[];
}

export interface ProjectStats {
  taskStats: TaskStats;
  artifactStats: ArtifactStats;
  roleWorkload: RoleWorkload[];
  healthScore: number;
}

export interface TaskStats {
  total: number;
  byStatus: Record<string, number>;
  completionRate: number;
}

export interface ArtifactStats {
  total: number;
  byStatus: Record<string, number>;
  approvalRate: number;
}

export interface RoleWorkload {
  roleId: string;
  name: string;
  taskCount: number;
  completedCount: number;
  avgDuration: number;
}

export interface SkillItem {
  name: string;
  category: string;
  source: string;
  trust: string;
  enabled: boolean;
  description: string;
  version: string;
  tags: string[];
}

export interface ProjectMemory {
  id: string;
  projectId: string;
  roleId: string;
  category: string;
  content: string;
  importance: number;
  createdAt: number;
  updatedAt: number;
}

export interface SkillCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  count: number;
}

export interface SkillsResult {
  skills: SkillItem[];
  total: number;
  hub_installed: number;
  builtin: number;
  local: number;
  enabled_count: number;
  disabled_count: number;
  categories: SkillCategory[];
}

export interface BrowseSkill {
  name: string;
  description: string;
  source: string;
  trust: string;
  identifier: string;
}

export interface BrowseResult {
  skills: BrowseSkill[];
  page: number;
  total_pages: number;
  total_skills: number;
}

export interface InstallProgress {
  line: string;
  done: boolean;
  success: boolean;
}

export interface WorkflowData {
  id: string;
  projectId: string;
  fromRoleId: string | null;
  toRoleId: string;
  artifactType: string;
  transitionType: string;
  conditionExpr: string;
  branchLabel: string;
  parallelGroup: string;
  sortOrder: number;
}

export interface OfficeMember {
  id: string;
  name: string;
  icon: string;
  color: string;
  isUser: boolean;
  isWorking: boolean;
  preset?: string;
  roleId?: string;
  avatarUrl?: string;
  avatarType?: string;
}

export interface OfficeTheme {
  name: string;
  background: number;
  fog: number;
  floor: number;
  wall: number;
  wallInner: number;
  baseboard: number;
  crown: number;
  windowGlass: number;
  desk: number;
  deskTop: number;
  chair: number;
  sofa: number;
  sofaDark: number;
  cushion: number;
  meetingFloor: number;
  loungeFloor: number;
  watercoolerFloor: number;
  receptionFloor: number;
  whiteboardFloor: number;
  deskFloor: number;
  defaultFloor: number;
  ambientIntensity: number;
  dirLightColor: number;
  hemiSky: number;
  hemiGround: number;
  exposure: number;
}

export interface OfficeLayout {
  name: string;
  meetingRoom: boolean;
  lounge: boolean;
  watercooler: boolean;
}

export interface GameMember {
  id: string;
  name: string;
  color: string;
  isUser: boolean;
  isWorking: boolean;
  roleId?: string;
  status?: MemberStatus;
  avatarUrl?: string;
  avatarType?: string;
}

export type MemberStatus =
  | "idle"
  | "working"
  | "walking"
  | "resting"
  | "socializing"
  | "delivering";

export interface MemberState {
  status: MemberStatus;
  targetZone?: string;
  idleAction?: IdleAction;
  idleActionTimer: number;
}

export type IdleAction = "coffee" | "book" | "stretch" | "chat" | "wander" | "none";

export interface WorkflowStep {
  fromRoleId: string | null;
  toRoleId: string;
  artifactType: string;
  transitionType: string;
}

export interface Zone {
  key: string;
  label: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
  type: string;
}
