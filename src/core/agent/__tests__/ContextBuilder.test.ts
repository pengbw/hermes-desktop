import { describe, it, expect } from "vitest";
import { buildRoleSystemPrompt, buildContextMessages } from "../ContextBuilder";
import type { RoleContext, ProjectContext, ContextMessage } from "../ContextBuilder";

const defaultRole: RoleContext = {
  name: "developer",
  nickname: "Dev",
  soul: "A passionate developer who loves clean code.",
  responsibilities: "Write and review code",
};

const defaultProject: ProjectContext = {
  name: "Hermes",
  description: "A desktop AI assistant",
  guidelines: "",
  rule: "",
};

describe("ContextBuilder", () => {
  describe("buildRoleSystemPrompt", () => {
    it("builds basic prompt with role and project", () => {
      const prompt = buildRoleSystemPrompt({
        role: defaultRole,
        project: defaultProject,
      });
      expect(prompt).toContain("Hermes");
      expect(prompt).toContain("Dev");
      expect(prompt).toContain("developer");
      expect(prompt).toContain("Write and review code");
      expect(prompt).toContain("A passionate developer");
    });

    it("uses nickname as display name", () => {
      const prompt = buildRoleSystemPrompt({
        role: { ...defaultRole, nickname: "DevBot" },
        project: defaultProject,
      });
      expect(prompt).toContain("DevBot");
    });

    it("uses name when nickname is empty", () => {
      const prompt = buildRoleSystemPrompt({
        role: { ...defaultRole, nickname: "" },
        project: defaultProject,
      });
      expect(prompt).toContain("「developer」");
    });

    it("includes project guidelines", () => {
      const prompt = buildRoleSystemPrompt({
        role: defaultRole,
        project: { ...defaultProject, guidelines: "Follow TDD" },
      });
      expect(prompt).toContain("Follow TDD");
      expect(prompt).toContain("项目执行规则");
    });

    it("includes project rule", () => {
      const prompt = buildRoleSystemPrompt({
        role: defaultRole,
        project: { ...defaultProject, rule: "No direct DB access" },
      });
      expect(prompt).toContain("No direct DB access");
      expect(prompt).toContain("项目规则");
    });

    it("includes other roles names", () => {
      const prompt = buildRoleSystemPrompt({
        role: defaultRole,
        project: defaultProject,
        otherRolesNames: "Designer, PM",
      });
      expect(prompt).toContain("Designer, PM");
      expect(prompt).toContain("其他角色");
    });

    it("includes previous replies hint", () => {
      const prompt = buildRoleSystemPrompt({
        role: defaultRole,
        project: defaultProject,
        previousReplies: "some discussion",
      });
      expect(prompt).toContain("讨论内容");
    });

    it("includes delegate info", () => {
      const prompt = buildRoleSystemPrompt({
        role: defaultRole,
        project: defaultProject,
        delegateFrom: "PM",
        delegateFromResponsibilities: "project planning",
      });
      expect(prompt).toContain("PM");
      expect(prompt).toContain("project planning");
      expect(prompt).toContain("委派任务");
    });

    it("includes mood hint for energetic", () => {
      const prompt = buildRoleSystemPrompt({
        role: { ...defaultRole, mood: "energetic" },
        project: defaultProject,
      });
      expect(prompt).toContain("精力充沛");
    });

    it("includes mood hint for tired", () => {
      const prompt = buildRoleSystemPrompt({
        role: { ...defaultRole, mood: "tired" },
        project: defaultProject,
      });
      expect(prompt).toContain("疲惫");
    });

    it("includes mood hint for exhausted", () => {
      const prompt = buildRoleSystemPrompt({
        role: { ...defaultRole, mood: "exhausted" },
        project: defaultProject,
      });
      expect(prompt).toContain("非常疲惫");
    });

    it("does not include mood hint for unknown mood", () => {
      const prompt = buildRoleSystemPrompt({
        role: { ...defaultRole, mood: "unknown" },
        project: defaultProject,
      });
      expect(prompt).not.toContain("精力充沛");
      expect(prompt).not.toContain("疲惫");
    });
  });

  describe("buildContextMessages", () => {
    it("maps messages to user/assistant roles", () => {
      const messages: ContextMessage[] = [
        { roleId: "role-a", content: "hello", type: "chat" },
        { roleId: "role-b", content: "hi there", type: "chat" },
      ];
      const result = buildContextMessages(messages, "role-a");
      expect(result[0]).toEqual({ role: "assistant", content: "hello" });
      expect(result[1]).toEqual({ role: "user", content: "hi there" });
    });

    it("handles empty messages", () => {
      const result = buildContextMessages([], "role-a");
      expect(result).toEqual([]);
    });
  });
});
