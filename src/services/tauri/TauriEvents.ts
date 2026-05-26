import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { KnowledgeSource } from "@core/types";

export interface InstallProgress {
  line: string;
  done: boolean;
  success: boolean;
  progress?: number;
  step?: string;
}

export interface EmbeddingModelProgress {
  progress: number;
  message: string;
}

export interface NavigateToTabPayload {
  tab: string;
}

export interface ChatStreamEvent {
  type: "thinking" | "content" | "tool_progress" | "done" | "error";
  content: string;
}

export interface ProjectDataChangePayload {
  projectId: string;
  changes: Array<"tasks" | "artifacts" | "members" | "workflow_steps" | "messages">;
}

export interface ArtifactStatusChangePayload {
  projectId: string;
  artifactId: string;
  newStatus: string;
}

export interface TaskStatusChangePayload {
  projectId: string;
  taskId: string;
  newStatus: string;
}

export const TauriEvents = {
  onNavigateToTab(callback: (tab: string) => void): Promise<UnlistenFn> {
    return listen<NavigateToTabPayload>("navigate-to-tab", (event) => {
      callback(event.payload.tab);
    });
  },

  onInstallProgress(callback: (progress: InstallProgress) => void): Promise<UnlistenFn> {
    return listen<InstallProgress>("install-progress", (event) => {
      callback(event.payload);
    });
  },

  onEmbeddingModelProgress(
    callback: (progress: EmbeddingModelProgress) => void
  ): Promise<UnlistenFn> {
    return listen<EmbeddingModelProgress>("local-embedding-model-progress", (event) => {
      callback(event.payload);
    });
  },

  onChatStream(eventId: string, callback: (data: ChatStreamEvent) => void): Promise<UnlistenFn> {
    return listen<ChatStreamEvent>(eventId, (event) => {
      callback(event.payload);
    });
  },

  onChatThinking(eventId: string, callback: (content: string) => void): Promise<UnlistenFn> {
    return listen<string>(`${eventId}_thinking`, (event) => {
      callback(event.payload);
    });
  },

  onChatContent(eventId: string, callback: (content: string) => void): Promise<UnlistenFn> {
    return listen<string>(`${eventId}_content`, (event) => {
      callback(event.payload);
    });
  },

  onChatToolProgress(eventId: string, callback: (content: string) => void): Promise<UnlistenFn> {
    return listen<string>(`${eventId}_tool_progress`, (event) => {
      callback(event.payload);
    });
  },

  onChatDone(eventId: string, callback: () => void): Promise<UnlistenFn> {
    return listen(`${eventId}_done`, () => {
      callback();
    });
  },

  onChatError(eventId: string, callback: (error: string) => void): Promise<UnlistenFn> {
    return listen<string>(`${eventId}_error`, (event) => {
      callback(event.payload);
    });
  },

  onKnowledgeSources(
    eventId: string,
    callback: (sources: KnowledgeSource[]) => void
  ): Promise<UnlistenFn> {
    return listen<KnowledgeSource[]>(`${eventId}_knowledge_sources`, (event) => {
      callback(event.payload);
    });
  },

  onProjectDataChanged(callback: (payload: ProjectDataChangePayload) => void): Promise<UnlistenFn> {
    return listen<ProjectDataChangePayload>("project_data_changed", (event) => {
      callback(event.payload);
    });
  },

  onArtifactStatusChanged(
    callback: (payload: ArtifactStatusChangePayload) => void
  ): Promise<UnlistenFn> {
    return listen<ArtifactStatusChangePayload>("artifact_status_changed", (event) => {
      callback(event.payload);
    });
  },

  onTaskStatusChanged(callback: (payload: TaskStatusChangePayload) => void): Promise<UnlistenFn> {
    return listen<TaskStatusChangePayload>("task_status_changed", (event) => {
      callback(event.payload);
    });
  },
};
