import { invoke } from "@tauri-apps/api/core";
import type { Result } from "../../core/types/Result";
import { ok, err } from "../../core/types/Result";
import { AppError } from "../../core/errors/AppError";
import { NetworkError } from "../../core/errors/NetworkError";
import { DatabaseError } from "../../core/errors/DatabaseError";
import type {
  Conversation,
  Message,
  KnowledgeBase,
  ProjectItem,
  AiRoleItem,
  SkillsResult,
  HermesConfigData,
} from "../../core/types";
import type { InstallCheckResult } from "../../core/tauri/types";

function wrapInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<Result<T, AppError>> {
  return invoke<T>(command, args)
    .then((value) => ok(value))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("database") || message.includes("sql") || message.includes("sqlite")) {
        return err(new DatabaseError(message, { details: error }));
      }
      if (
        message.includes("network") ||
        message.includes("fetch") ||
        message.includes("timeout") ||
        message.includes("connect")
      ) {
        return err(new NetworkError(message, { details: error }));
      }
      return err(
        new AppError(message, { category: "tauri", code: "INVOKE_ERROR", details: error })
      );
    });
}

export const SafeTauriCommands = {
  async checkHermesInstalled() {
    return wrapInvoke<InstallCheckResult>("check_hermes_installed");
  },

  async toggleAvatarWindow() {
    return wrapInvoke<boolean>("toggle_avatar_window");
  },

  async listConversations() {
    return wrapInvoke<Conversation[]>("list_conversations");
  },

  async createConversation(args?: Record<string, unknown>) {
    return wrapInvoke<Conversation>("create_conversation", args);
  },

  async deleteConversation(id: string) {
    return wrapInvoke<void>("delete_conversation", { id });
  },

  async renameConversation(id: string, title: string) {
    return wrapInvoke<void>("rename_conversation", { id, title });
  },

  async listMessages(conversationId: string) {
    return wrapInvoke<Message[]>("list_messages", { conversationId });
  },

  async createMessage(args: Record<string, unknown>) {
    return wrapInvoke<Message>("create_message", args);
  },

  async listProviders() {
    return wrapInvoke<
      Array<{ id: string; name: string; value: string; baseUrl: string; apiKey: string }>
    >("list_providers");
  },

  async listKnowledgeBases() {
    return wrapInvoke<KnowledgeBase[]>("list_knowledge_bases");
  },

  async listProjects() {
    return wrapInvoke<ProjectItem[]>("list_projects");
  },

  async listAiRoles() {
    return wrapInvoke<AiRoleItem[]>("list_ai_roles");
  },

  async listSkills() {
    return wrapInvoke<SkillsResult>("list_skills");
  },

  async getConfig() {
    return wrapInvoke<HermesConfigData>("get_config");
  },

  async setConfig(key: string, value: string) {
    return wrapInvoke<void>("set_config", { key, value });
  },
};
