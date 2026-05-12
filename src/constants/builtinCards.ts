import type { QuickCard } from "@core/types";

export const BUILTIN_CARDS: QuickCard[] = [
  {
    id: "mindmap",
    name: "思维导图",
    icon: "🧠",
    prompt:
      "请帮我生成一个关于「主题」的思维导图，用markdown格式列出清晰的层级结构，包含中心主题、主要分支和细节要点。",
    source: "builtin",
  },
  {
    id: "weekly",
    name: "周报生成",
    icon: "📊",
    prompt:
      "请根据以下工作内容，帮我生成一份结构清晰的专业周报，包含本周完成事项（分类列出）、下周工作计划、遇到的风险和解决方案三个部分。",
    source: "builtin",
  },
  {
    id: "codereview",
    name: "代码审查",
    icon: "🔍",
    prompt:
      "请对以下代码进行详细审查，从以下几个方面分析：1.逻辑缺陷和潜在bug 2.性能瓶颈和优化建议 3.安全漏洞 4.代码可读性和维护性改进建议。",
    source: "builtin",
  },
  {
    id: "translator",
    name: "翻译助手",
    icon: "🌐",
    prompt:
      "请将以下内容翻译成英文，要求：1.保持专业严谨的技术术语 2.语句流畅自然，符合英文表达习惯 3.完整保留原文信息不遗漏。",
    source: "builtin",
  },
  {
    id: "summary",
    name: "文章总结",
    icon: "📝",
    prompt:
      "请用简洁精炼的语言总结以下文章的3-5个核心观点，每个观点用一句话概括，然后给出一个整体的摘要。请保留关键数据和结论。",
    source: "builtin",
  },
  {
    id: "brainstorm",
    name: "头脑风暴",
    icon: "💡",
    prompt:
      "请针对「项目/想法」进行头脑风暴，提供10个创意方向或改进思路，每个方向附带简要说明和可行性评估（高/中/低）。",
    source: "builtin",
  },
  {
    id: "explain",
    name: "通俗解释",
    icon: "🎓",
    prompt:
      "请用通俗易懂的方式向非专业人士解释以下概念。要求：1.使用生动的比喻 2.避免使用专业术语 3.分步骤说明 4.控制在500字以内。",
    source: "builtin",
  },
  {
    id: "social",
    name: "社交媒体",
    icon: "📱",
    prompt:
      "请为以下内容生成适合发布在微博/小红书/朋友圈的社交媒体文案。要求：1.风格活泼有吸引力 2.添加合适的emoji 3.包含2-3个版本供选择 4.附带合适的#话题标签。",
    source: "builtin",
  },
];
