export interface RoleContext {
  name: string;
  nickname: string;
  soul: string;
  responsibilities: string;
  energy?: number;
  mood?: string;
}

export interface ProjectContext {
  name: string;
  description: string;
  guidelines: string;
  rule: string;
}

export interface ContextMessage {
  roleId: string;
  content: string;
  type: string;
}

export interface BuildSystemPromptOptions {
  role: RoleContext;
  project: ProjectContext;
  otherRolesNames?: string;
  previousReplies?: string;
  delegateFrom?: string;
  delegateFromResponsibilities?: string;
}

export function buildRoleSystemPrompt(options: BuildSystemPromptOptions): string {
  const {
    role,
    project,
    otherRolesNames,
    previousReplies,
    delegateFrom,
    delegateFromResponsibilities,
  } = options;

  const displayName = role.nickname || role.name;

  let prompt = `你是项目「${project.name}」中的AI角色。\n你的名字是「${displayName}」，角色类型是「${role.name}」。\n\n角色职责：${role.responsibilities}\n\n角色灵魂设定：\n${role.soul}\n\n项目描述：${project.description}`;

  if (project.guidelines) {
    prompt += `\n\n项目执行规则：\n${project.guidelines}`;
  }

  if (project.rule) {
    prompt += `\n\n项目规则：\n${project.rule}`;
  }

  if (role.mood) {
    const moodHint = getMoodHint(role.mood);
    if (moodHint) {
      prompt += `\n\n${moodHint}`;
    }
  }

  if (otherRolesNames) {
    prompt += `\n\n项目中其他角色：${otherRolesNames}`;
  }

  if (previousReplies) {
    prompt += `\n\n请基于以上讨论内容，从你的专业角度给出观点和建议。`;
  }

  if (delegateFrom && delegateFromResponsibilities) {
    prompt += `\n\n你刚刚收到了来自「${delegateFrom}」的委派任务。${delegateFrom}是你的上游角色，负责${delegateFromResponsibilities}。请基于上游的产出完成你的工作。`;
  }

  prompt += `\n\n请以「${displayName}」的身份回答问题，保持角色一致性。回答要专业、有针对性。`;

  return prompt;
}

function getMoodHint(mood: string): string {
  switch (mood) {
    case "energetic":
      return "你当前精力充沛，充满热情和创造力。";
    case "tired":
      return "你有些疲惫，回答可能稍显简短，但仍保持专业。";
    case "exhausted":
      return "你非常疲惫，回答会比较简洁，建议休息恢复精力。";
    default:
      return "";
  }
}

export function buildContextMessages(
  recentMessages: ContextMessage[],
  currentRoleId: string
): Array<{ role: "user" | "assistant"; content: string }> {
  return recentMessages.map((msg) => ({
    role: msg.roleId === currentRoleId ? ("assistant" as const) : ("user" as const),
    content: msg.content,
  }));
}
