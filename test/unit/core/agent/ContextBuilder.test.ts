import { describe, it, expect } from "vitest";
import {
  buildRoleSystemPrompt,
  type RoleContext,
  type ProjectContext,
} from "@core/agent/ContextBuilder";

const baseRole: RoleContext = {
  name: "frontend-developer",
  nickname: "Frontend",
  soul: "Be a great engineer",
  responsibilities: "Build UI components",
};

const baseProject: ProjectContext = {
  name: "Hermes",
  description: "AI desktop app",
  guidelines: "Follow CLAUDE.md",
  rule: "Clean code",
};

describe("ContextBuilder.buildRoleSystemPrompt", () => {
  it("应该包含项目名、角色名、职责和灵魂", () => {
    const prompt = buildRoleSystemPrompt({
      role: baseRole,
      project: baseProject,
    });
    expect(prompt).toContain("Hermes");
    expect(prompt).toContain("Frontend");
    expect(prompt).toContain("frontend-developer");
    expect(prompt).toContain("Build UI components");
    expect(prompt).toContain("Be a great engineer");
    expect(prompt).toContain("AI desktop app");
  });

  it("当 role.nickname 为空时回退到 name", () => {
    const prompt = buildRoleSystemPrompt({
      role: { ...baseRole, nickname: "" },
      project: baseProject,
    });
    expect(prompt).toContain("frontend-developer");
  });

  it("当项目 guidelines 为空时不应出现 '项目执行规则' 段", () => {
    const prompt = buildRoleSystemPrompt({
      role: baseRole,
      project: { ...baseProject, guidelines: "" },
    });
    expect(prompt).not.toContain("项目执行规则");
  });

  it("当项目 rule 为空时不应出现 '项目规则' 段", () => {
    const prompt = buildRoleSystemPrompt({
      role: baseRole,
      project: { ...baseProject, rule: "" },
    });
    expect(prompt).not.toContain("项目规则");
  });

  it("应该包含其他角色列表", () => {
    const prompt = buildRoleSystemPrompt({
      role: baseRole,
      project: baseProject,
      otherRolesNames: "Backend, QA",
    });
    expect(prompt).toContain("Backend, QA");
  });

  it("previousReplies 应该追加提示语", () => {
    const prompt = buildRoleSystemPrompt({
      role: baseRole,
      project: baseProject,
      previousReplies: "earlier discussion",
    });
    expect(prompt).toContain("专业角度");
  });

  it("delegateFrom 应该追加委派上下文", () => {
    const prompt = buildRoleSystemPrompt({
      role: baseRole,
      project: baseProject,
      delegateFrom: "PM",
      delegateFromResponsibilities: "requirements",
    });
    expect(prompt).toContain("PM");
    expect(prompt).toContain("requirements");
  });

  it("角色 mood = 'energetic' 应该附加情绪提示", () => {
    const prompt = buildRoleSystemPrompt({
      role: { ...baseRole, mood: "energetic" },
      project: baseProject,
    });
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("角色 mood = 未知值时不附加情绪", () => {
    const baseLen = buildRoleSystemPrompt({ role: baseRole, project: baseProject }).length;
    const prompt = buildRoleSystemPrompt({
      role: { ...baseRole, mood: "unknown-mood" },
      project: baseProject,
    });
    expect(prompt.length).toBe(baseLen);
  });

  it("应该以角色身份回答的指令收尾", () => {
    const prompt = buildRoleSystemPrompt({ role: baseRole, project: baseProject });
    expect(prompt).toMatch(/请以「Frontend」的身份回答/);
  });
});
