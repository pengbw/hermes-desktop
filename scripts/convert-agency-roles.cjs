const fs = require("fs");
const path = require("path");

const mdPath = path.join(__dirname, "..", "docs", "agency-agents-full-definitions.md");
const mappingPath = path.join(__dirname, "..", "docs", "en-roles-mapping.json");
const outputBase = path.join(__dirname, "..", "src-tauri", "resources", "roles");

if (fs.existsSync(outputBase)) {
  fs.rmSync(outputBase, { recursive: true, force: true });
}
fs.mkdirSync(outputBase, { recursive: true });

const md = fs.readFileSync(mdPath, "utf-8");
const lines = md.split("\n");

const enMapping = fs.existsSync(mappingPath)
  ? JSON.parse(fs.readFileSync(mappingPath, "utf-8"))
  : {};

const DEPARTMENT_MAP = {
  "一、工程部": "engineering",
  "二、设计部": "design",
  "三、营销部": "marketing",
  "四、付费媒体部": "paid_media",
  "五、销售部": "sales",
  "六、金融部": "finance",
  "七、人力资源部": "hr",
  "八、法务部": "legal",
  "九、供应链部": "supply_chain",
  "十、产品部": "product",
  "十一、项目管理部": "project_management",
  "十二、测试部": "testing",
  "十三、支持部": "support",
  "十四、专项部": "specialized",
  "十五、空间计算部": "spatial_computing",
  "十六、游戏开发部": "game_dev",
  "十七、学术部": "academic",
};

const DEPARTMENT_LABELS = {
  engineering: { "zh-CN": "工程部", "zh-XG": "工程部", "en": "Engineering" },
  design: { "zh-CN": "设计部", "zh-XG": "設計部", "en": "Design" },
  marketing: { "zh-CN": "营销部", "zh-XG": "營銷部", "en": "Marketing" },
  paid_media: { "zh-CN": "付费媒体部", "zh-XG": "付費媒體部", "en": "Paid Media" },
  sales: { "zh-CN": "销售部", "zh-XG": "銷售部", "en": "Sales" },
  finance: { "zh-CN": "金融部", "zh-XG": "金融部", "en": "Finance" },
  hr: { "zh-CN": "人力资源部", "zh-XG": "人力資源部", "en": "Human Resources" },
  legal: { "zh-CN": "法务部", "zh-XG": "法務部", "en": "Legal" },
  supply_chain: { "zh-CN": "供应链部", "zh-XG": "供應鏈部", "en": "Supply Chain" },
  product: { "zh-CN": "产品部", "zh-XG": "產品部", "en": "Product" },
  project_management: { "zh-CN": "项目管理部", "zh-XG": "專案管理部", "en": "Project Management" },
  testing: { "zh-CN": "测试部", "zh-XG": "測試部", "en": "Testing" },
  support: { "zh-CN": "支持部", "zh-XG": "支持部", "en": "Support" },
  specialized: { "zh-CN": "专项部", "zh-XG": "專項部", "en": "Specialized" },
  spatial_computing: { "zh-CN": "空间计算部", "zh-XG": "空間計算部", "en": "Spatial Computing" },
  game_dev: { "zh-CN": "游戏开发部", "zh-XG": "遊戲開發部", "en": "Game Development" },
  academic: { "zh-CN": "学术部", "zh-XG": "學術部", "en": "Academic" },
};

const COLOR_MAP = {
  green: "#27ae60", purple: "#6c5ce7", blue: "#0984e3", red: "#d63031",
  orange: "#e17055", yellow: "#fdcb6e", pink: "#e84393", cyan: "#00cec9",
  teal: "#00b894", indigo: "#673AB7", amber: "#f39c12", lime: "#a29bfe",
  brown: "#b2675e", gray: "#636e72", grey: "#636e72", white: "#dfe6e9",
  black: "#2d3436", navy: "#2c3e50", coral: "#ff7675", violet: "#a29bfe",
  magenta: "#e84393", gold: "#f9ca24", silver: "#b2bec3", bronze: "#cd8032",
  copper: "#b87333", steel: "#4682b4", mint: "#98FB98", sky: "#87CEEB",
  rose: "#FF007F", olive: "#808000", maroon: "#800000", aqua: "#00FFFF",
  tan: "#D2B48C", turquoise: "#40E0D0", salmon: "#FA8072", plum: "#DDA0DD",
  orchid: "#DA70D6", lavender: "#E6E6FA", khaki: "#F0E68C", ivory: "#FFFFF0",
  crimson: "#DC143C", chocolate: "#D2691E", chartreuse: "#7FFF00",
  burgundy: "#800020", apricot: "#FBCEB1", azure: "#007FFF", beige: "#F5F5DC",
  cerulean: "#007BA7", cobalt: "#0047AB", emerald: "#50C878", garnet: "#722F37",
  jade: "#00A86B", mauve: "#E0B0FF", peach: "#FFCBA4", ruby: "#9B111E",
  sapphire: "#0F52BA", slate: "#708090", tangerine: "#FF9966", terracotta: "#E2725B",
};

function resolveColor(colorStr) {
  if (!colorStr) return "#6c5ce7";
  const trimmed = colorStr.trim().toLowerCase().replace("#", "");
  if (COLOR_MAP[trimmed]) return COLOR_MAP[trimmed];
  if (/^[0-9a-f]{6}$/.test(trimmed)) return "#" + trimmed;
  return "#6c5ce7";
}

function pinyinSlug(name) {
  return name
    .replace(/[\/\\]/g, "-")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .substring(0, 60);
}

const ZH_EN_MAP = {
  "AI 数据修复工程师": "ai-data-remediation-engineer",
  "AI 工程师": "ai-engineer",
  "自主优化架构师": "autonomous-optimization-architect",
  "后端架构师": "backend-architect",
  "CMS 开发者": "cms-developer",
  "代码审查员": "code-reviewer",
  "代码库入职引导工程师": "codebase-onboarding-engineer",
  "数据工程师": "data-engineer",
  "数据库优化师": "database-optimizer",
  "DevOps 自动化师": "devops-automator",
  "邮件智能工程师": "email-intelligence-engineer",
  "嵌入式固件工程师": "embedded-firmware-engineer",
  "飞书集成开发者": "feishu-integration-developer",
  "Filament 优化专家": "filament-optimization-specialist",
  "前端开发者": "frontend-developer",
  "Git 工作流大师": "git-workflow-master",
  "故障响应指挥官": "incident-response-commander",
  "最小变更工程师": "minimal-change-engineer",
  "移动应用构建师": "mobile-app-builder",
  "快速原型师": "rapid-prototyper",
  "安全工程师": "security-engineer",
  "高级开发者": "senior-developer",
  "软件架构师": "software-architect",
  "Solidity 智能合约工程师": "solidity-smart-contract-engineer",
  "SRE (站点可靠性工程师)": "sre",
  "技术文档工程师": "technical-writer",
  "威胁检测工程师": "threat-detection-engineer",
  "语音 AI 集成工程师": "voice-ai-integration-engineer",
  "微信小程序开发者": "wechat-mini-program-developer",
  "嵌入式 Linux 驱动工程师": "embedded-linux-driver-engineer",
  "IoT 方案架构师": "iot-solution-architect",
  "FPGA/ASIC 数字设计工程师": "fpga-asic-digital-design-engineer",
  "上位机工程师": "scada-hmi-engineer",
  "品牌守护者": "brand-guardian",
  "图像提示词工程师": "image-prompt-engineer",
  "包容性视觉专家": "inclusive-visuals-specialist",
  "UI 设计师": "ui-designer",
  "UX 架构师": "ux-architect",
  "UX 研究员": "ux-researcher",
  "视觉叙事师": "visual-storyteller",
  "趣味注入师": "whimsy-injector",
  "AI 引用策略师": "ai-citation-strategist",
  "应用商店优化师": "app-store-optimizer",
  "百度 SEO 专家": "baidu-seo-specialist",
  "B站内容策略师": "bilibili-content-strategist",
  "图书合著者": "book-co-author",
  "轮播增长引擎": "carousel-growth-engine",
  "中国电商运营": "china-ecommerce-operator",
  "中国市场本地化策略师": "china-market-localization-strategist",
  "内容创作者": "content-creator",
  "跨境电商专家": "cross-border-ecommerce",
  "抖音策略师": "douyin-strategist",
  "增长黑客": "growth-hacker",
  "Instagram 策展人": "instagram-curator",
  "快手策略师": "kuaishou-strategist",
  "LinkedIn 内容创作者": "linkedin-content-creator",
  "直播电商教练": "livestream-commerce-coach",
  "播客策略师": "podcast-strategist",
  "私域运营师": "private-domain-operator",
  "Reddit 社区建设者": "reddit-community-builder",
  "SEO 专家": "seo-specialist",
  "短视频剪辑教练": "short-video-editing-coach",
  "社交媒体策略师": "social-media-strategist",
  "TikTok 策略师": "tiktok-strategist",
  "Twitter 互动师": "twitter-engager",
  "视频优化专家": "video-optimization-specialist",
  "微信公众号运营": "wechat-official-account",
  "微博策略师": "weibo-strategist",
  "小红书专家": "xiaohongshu-specialist",
  "知乎策略师": "zhihu-strategist",
  "AI 搜索优化师": "agentic-search-optimizer",
  "审计师": "auditor",
  "创意策略师": "creative-strategist",
  "付费社交策略师": "paid-social-strategist",
  "PPC 策略师": "ppc-strategist",
  "程序化购买师": "programmatic-buyer",
  "搜索查询分析师": "search-query-analyst",
  "追踪专家": "tracking-specialist",
  "客户策略师": "account-strategist",
  "销售教练": "sales-coach",
  "交易策略师": "deal-strategist",
  "发现教练": "discovery-coach",
  "售前工程师": "sales-engineer",
  "外呼策略师": "outbound-strategist",
  "管道分析师": "pipeline-analyst",
  "提案策略师": "proposal-strategist",
  "记账控制器": "bookkeeper-controller",
  "财务分析师": "financial-analyst",
  "FP&A 分析师": "fpa-analyst",
  "投资研究员": "investment-researcher",
  "税务策略师": "tax-strategist",
  "招聘专员": "recruitment-specialist",
  "入职引导专员": "hr-onboarding",
  "法律文档审查": "legal-document-review",
  "客户入职": "legal-client-intake",
  "法律计费时间追踪": "legal-billing-time-tracking",
  "供应链策略师": "supply-chain-strategist",
  "行为助推引擎": "behavioral-nudge-engine",
  "反馈综合师": "feedback-synthesizer",
  "产品经理": "product-manager",
  "冲刺优先级师": "sprint-prioritizer",
  "趋势研究员": "trend-researcher",
  "实验追踪师": "experiment-tracker",
  "Jira 工作流管家": "jira-workflow-steward",
  "项目牧羊人": "project-shepherd",
  "工作室运营": "studio-operations",
  "工作室制作人": "studio-producer",
  "高级项目经理": "senior-project-manager",
  "无障碍审计师": "accessibility-auditor",
  "API 测试师": "api-tester",
  "证据收集师": "evidence-collector",
  "性能基准测试师": "performance-benchmarker",
  "现实检验师": "reality-checker",
  "测试结果分析师": "test-results-analyzer",
  "工具评估师": "tool-evaluator",
  "工作流优化师": "workflow-optimizer",
  "分析报告师": "analytics-reporter",
  "执行摘要生成器": "executive-summary-generator",
  "财务追踪师": "finance-tracker",
  "基础设施维护师": "infrastructure-maintainer",
  "法律合规检查师": "legal-compliance-checker",
  "支持响应师": "support-responder",
  "应付账款代理": "accounts-payable-agent",
  "代理身份信任": "agentic-identity-trust",
  "代理编排师": "agents-orchestrator",
  "自动化治理架构师": "automation-governance-architect",
  "区块链安全审计师": "blockchain-security-auditor",
  "合规审计师": "compliance-auditor",
  "企业培训设计师": "corporate-training-designer",
  "客户服务": "customer-service",
  "数据整合代理": "data-consolidation-agent",
  "政务数字售前顾问": "government-digital-presales-consultant",
  "医疗客户服务": "healthcare-customer-service",
  "医疗营销合规": "healthcare-marketing-compliance",
  "酒店宾客服务": "hospitality-guest-services",
  "身份图谱操作师": "identity-graph-operator",
  "语言翻译师": "language-translator",
  "贷款官员助理": "loan-officer-assistant",
  "LSP 索引工程师": "lsp-index-engineer",
  "房地产买卖师": "real-estate-buyer-seller",
  "报告分发代理": "report-distribution-agent",
  "零售客户退货": "retail-customer-returns",
  "销售数据提取代理": "sales-data-extraction-agent",
  "销售外联": "sales-outreach",
  "参谋长": "chief-of-staff",
  "土木工程师": "civil-engineer",
  "文化智能策略师": "cultural-intelligence-strategist",
  "开发者布道师": "developer-advocate",
  "文档生成器": "document-generator",
  "法国咨询市场": "french-consulting-market",
  "韩国商务导航师": "korean-business-navigator",
  "MCP 构建师": "mcp-builder",
  "模型 QA": "model-qa",
  "Salesforce 架构师": "salesforce-architect",
  "工作流架构师": "workflow-architect",
  "留学顾问": "study-abroad-advisor",
  "ZK 管家": "zk-steward",
  "macOS 空间 Metal 工程师": "macos-spatial-metal-engineer",
  "终端集成专家": "terminal-integration-specialist",
  "visionOS 空间工程师": "visionos-spatial-engineer",
  "XR 座舱交互专家": "xr-cockpit-interaction-specialist",
  "XR 沉浸式开发者": "xr-immersive-developer",
  "XR 界面架构师": "xr-interface-architect",
  "游戏音频工程师": "game-audio-engineer",
  "游戏设计师": "game-designer",
  "关卡设计师": "level-designer",
  "叙事设计师": "narrative-designer",
  "技术美术师": "technical-artist",
  "人类学家": "anthropologist",
  "地理学家": "geographer",
  "历史学家": "historian",
  "叙事学家": "narratologist",
  "心理学家": "psychologist",
  "学习规划师": "learning-planner",
  "钉钉集成开发工程师": "dingtalk-integration-developer",
  "飞书集成开发工程师": "feishu-integration-dev",
  "机械设计工程师": "mechanical-design-engineer",
  "移动应用开发者": "mobile-app-developer",
  "智能搜索优化师": "smart-search-optimizer",
  "AI 引文策略师": "ai-citation-strategist-cn",
  "图书联合作者": "book-co-author-cn",
  "轮播图增长引擎": "carousel-growth-engine-cn",
  "中国电商运营专家": "china-ecommerce-operator-cn",
  "跨境电商运营专家": "cross-border-ecommerce-cn",
  "新闻情报官": "news-intelligence-officer",
  "电商运营师": "ecommerce-operator",
  "Instagram 策展师": "instagram-curator-cn",
  "知识付费产品策划师": "knowledge-product-planner",
  "LinkedIn 内容创作专家": "linkedin-content-creator-cn",
  "直播电商主播教练": "livestream-commerce-coach-cn",
  "播客内容策略师": "podcast-strategist-cn",
  "私域流量运营师": "private-domain-operator-cn",
  "Reddit 社区运营": "reddit-community-builder-cn",
  "SEO专家": "seo-specialist-cn",
  "短视频剪辑指导师": "short-video-editing-coach-cn",
  "Twitter 互动官": "twitter-engager-cn",
  "微信公众号管理": "wechat-official-account-cn",
  "微博运营策略师": "weibo-strategist-cn",
  "微信视频号运营策略师": "wechat-video-channel-strategist",
  "小红书运营专家": "xiaohongshu-specialist-cn",
  "付费媒体审计师": "paid-media-auditor",
  "广告创意策略师": "ad-creative-strategist",
  "社交广告策略师": "social-ad-strategist",
  "PPC 竞价策略师": "ppc-bid-strategist",
  "程序化广告采买专家": "programmatic-ad-buyer",
  "搜索词分析师": "search-query-analyst-cn",
  "追踪与归因专家": "tracking-attribution-specialist",
  "客户拓展策略师": "account-expansion-strategist",
  "赢单策略师": "win-deal-strategist",
  "Discovery 教练": "discovery-coach-cn",
  "Outbound 策略师": "outbound-strategist-cn",
  "Pipeline 分析师": "pipeline-analyst-cn",
  "投标策略师": "bidding-strategist",
  "簿记与财务总监": "bookkeeper-finance-controller",
  "财务预测分析师": "financial-forecast-analyst",
  "金融风控分析师": "financial-risk-analyst",
  "发票管理专家": "invoice-management-specialist",
  "绩效管理专家": "performance-management-specialist",
  "招聘专家": "recruitment-expert",
  "合同审查专家": "contract-review-specialist",
  "制度文件撰写专家": "policy-document-specialist",
  "库存预测专家": "inventory-forecast-specialist",
  "物流路线优化师": "logistics-route-optimizer",
  "供应链采购策略师": "supply-chain-procurement-strategist",
  "供应商评估专家": "supplier-evaluation-specialist",
  "反馈分析师": "feedback-analyst",
  "Sprint 排序师": "sprint-prioritizer-cn",
  "实验追踪员": "experiment-tracker-cn",
  "Jira工作流管家": "jira-workflow-steward-cn",
  "工作室制片人": "studio-producer-cn",
  "无障碍审核员": "accessibility-auditor-cn",
  "API 测试员": "api-tester-cn",
  "嵌入式测试工程师": "embedded-test-engineer",
  "证据收集者": "evidence-collector-cn",
  "性能基准师": "performance-benchmarker-cn",
  "现实检验者": "reality-checker-cn",
  "数据分析师": "data-analyst",
  "高管摘要师": "executive-summary-generator-cn",
  "财务追踪员": "finance-tracker-cn",
  "基础设施运维师": "infrastructure-ops-specialist",
  "法务合规员": "legal-compliance-officer",
  "招聘运营专家": "recruitment-ops-specialist",
  "客服响应者": "support-responder-cn",
  "应付账款智能体": "accounts-payable-agent-cn",
  "身份信任架构师": "identity-trust-architect",
  "智能体编排者": "agent-orchestrator",
  "企业培训课程设计师": "corporate-training-designer-cn",
  "数据整合师": "data-consolidator",
  "高考志愿填报顾问": "college-admission-advisor",
  "政务数字化售前顾问": "gov-digital-presales-cn",
  "医疗客服专家": "healthcare-cs-specialist",
  "医疗健康营销合规师": "healthcare-marketing-compliance-cn",
  "酒店宾客服务专家": "hospitality-guest-services-cn",
  "HR 入职管理专家": "hr-onboarding-specialist",
  "身份图谱操作员": "identity-graph-operator-cn",
  "语言翻译专家": "language-translator-cn",
  "律所计费与工时专家": "legal-billing-specialist",
  "律所客户接案专家": "legal-client-intake-cn",
  "法律文书审查专家": "legal-document-review-cn",
  "养殖档案核对员": "livestock-record-auditor",
  "信贷经理助手": "credit-manager-assistant",
  "提示词工程师": "prompt-engineer",
  "房地产经纪助手": "real-estate-agent-assistant",
  "报告分发师": "report-distributor",
  "零售退货专家": "retail-returns-specialist",
  "销售数据提取师": "sales-data-extractor",
  "AI 治理政策专家": "ai-governance-policy-specialist",
  "幕僚长": "chief-of-staff-cn",
  "法国咨询市场专家": "french-consulting-market-cn",
  "韩国商务专家": "korean-business-expert",
  "MCP 构建器": "mcp-builder-cn",
  "会议效率专家": "meeting-efficiency-specialist",
  "模型 QA 专家": "model-qa-specialist",
  "动态定价策略师": "dynamic-pricing-strategist",
  "企业风险评估师": "enterprise-risk-assessor",
  "留学规划顾问": "study-abroad-planner",
  "技术翻译专家": "technical-translation-specialist",
  "macOS Metal 空间工程师": "macos-metal-spatial-engineer",
  "Blender 插件工程师": "blender-addon-engineer",
  "Godot 游戏脚本开发者": "godot-script-developer",
  "Godot 多人游戏工程师": "godot-multiplayer-engineer",
  "Godot Shader 开发者": "godot-shader-developer",
  "Roblox 虚拟形象创作者": "roblox-avatar-creator",
  "Roblox 体验设计师": "roblox-experience-designer",
  "Roblox 系统脚本工程师": "roblox-system-scripter",
  "技术美术": "technical-artist-cn",
  "Unity 架构师": "unity-architect",
  "Unity 编辑器工具开发者": "unity-editor-tool-developer",
  "Unity 多人游戏工程师": "unity-multiplayer-engineer",
  "Unity Shader Graph 美术师": "unity-shader-graph-artist",
  "Unreal 多人游戏架构师": "unreal-multiplayer-architect",
  "Unreal 系统工程师": "unreal-systems-engineer",
  "Unreal 技术美术": "unreal-technical-artist",
  "Unreal 世界构建师": "unreal-world-builder",
};

const ZH_EN_NAME = {
  "AI 数据修复工程师": "AI Data Remediation Engineer",
  "AI 工程师": "AI Engineer",
  "自主优化架构师": "Autonomous Optimization Architect",
  "后端架构师": "Backend Architect",
  "CMS 开发者": "CMS Developer",
  "代码审查员": "Code Reviewer",
  "代码库入职引导工程师": "Codebase Onboarding Engineer",
  "数据工程师": "Data Engineer",
  "数据库优化师": "Database Optimizer",
  "DevOps 自动化师": "DevOps Automator",
  "邮件智能工程师": "Email Intelligence Engineer",
  "嵌入式固件工程师": "Embedded Firmware Engineer",
  "飞书集成开发者": "Feishu Integration Developer",
  "Filament 优化专家": "Filament Optimization Specialist",
  "前端开发者": "Frontend Developer",
  "Git 工作流大师": "Git Workflow Master",
  "故障响应指挥官": "Incident Response Commander",
  "最小变更工程师": "Minimal Change Engineer",
  "移动应用构建师": "Mobile App Builder",
  "快速原型师": "Rapid Prototyper",
  "安全工程师": "Security Engineer",
  "高级开发者": "Senior Developer",
  "软件架构师": "Software Architect",
  "Solidity 智能合约工程师": "Solidity Smart Contract Engineer",
  "SRE (站点可靠性工程师)": "SRE (Site Reliability Engineer)",
  "技术文档工程师": "Technical Writer",
  "威胁检测工程师": "Threat Detection Engineer",
  "语音 AI 集成工程师": "Voice AI Integration Engineer",
  "微信小程序开发者": "WeChat Mini Program Developer",
  "嵌入式 Linux 驱动工程师": "Embedded Linux Driver Engineer",
  "IoT 方案架构师": "IoT Solution Architect",
  "FPGA/ASIC 数字设计工程师": "FPGA/ASIC Digital Design Engineer",
  "上位机工程师": "SCADA/HMI Engineer",
  "品牌守护者": "Brand Guardian",
  "图像提示词工程师": "Image Prompt Engineer",
  "包容性视觉专家": "Inclusive Visuals Specialist",
  "UI 设计师": "UI Designer",
  "UX 架构师": "UX Architect",
  "UX 研究员": "UX Researcher",
  "视觉叙事师": "Visual Storyteller",
  "趣味注入师": "Whimsy Injector",
  "AI 引用策略师": "AI Citation Strategist",
  "应用商店优化师": "App Store Optimizer",
  "百度 SEO 专家": "Baidu SEO Specialist",
  "B站内容策略师": "Bilibili Content Strategist",
  "图书合著者": "Book Co-Author",
  "轮播增长引擎": "Carousel Growth Engine",
  "中国电商运营": "China E-Commerce Operator",
  "中国市场本地化策略师": "China Market Localization Strategist",
  "内容创作者": "Content Creator",
  "跨境电商专家": "Cross-Border E-Commerce Specialist",
  "抖音策略师": "Douyin Strategist",
  "增长黑客": "Growth Hacker",
  "Instagram 策展人": "Instagram Curator",
  "快手策略师": "Kuaishou Strategist",
  "LinkedIn 内容创作者": "LinkedIn Content Creator",
  "直播电商教练": "Livestream Commerce Coach",
  "播客策略师": "Podcast Strategist",
  "私域运营师": "Private Domain Operator",
  "Reddit 社区建设者": "Reddit Community Builder",
  "SEO 专家": "SEO Specialist",
  "短视频剪辑教练": "Short Video Editing Coach",
  "社交媒体策略师": "Social Media Strategist",
  "TikTok 策略师": "TikTok Strategist",
  "Twitter 互动师": "Twitter Engager",
  "视频优化专家": "Video Optimization Specialist",
  "微信公众号运营": "WeChat Official Account",
  "微博策略师": "Weibo Strategist",
  "小红书专家": "Xiaohongshu Specialist",
  "知乎策略师": "Zhihu Strategist",
  "AI 搜索优化师": "Agentic Search Optimizer",
  "审计师": "Auditor",
  "创意策略师": "Creative Strategist",
  "付费社交策略师": "Paid Social Strategist",
  "PPC 策略师": "PPC Strategist",
  "程序化购买师": "Programmatic Buyer",
  "搜索查询分析师": "Search Query Analyst",
  "追踪专家": "Tracking Specialist",
  "客户策略师": "Account Strategist",
  "销售教练": "Sales Coach",
  "交易策略师": "Deal Strategist",
  "发现教练": "Discovery Coach",
  "售前工程师": "Sales Engineer",
  "外呼策略师": "Outbound Strategist",
  "管道分析师": "Pipeline Analyst",
  "提案策略师": "Proposal Strategist",
  "记账控制器": "Bookkeeper Controller",
  "财务分析师": "Financial Analyst",
  "FP&A 分析师": "FP&A Analyst",
  "投资研究员": "Investment Researcher",
  "税务策略师": "Tax Strategist",
  "招聘专员": "Recruitment Specialist",
  "入职引导专员": "HR Onboarding",
  "法律文档审查": "Legal Document Review",
  "客户入职": "Legal Client Intake",
  "法律计费时间追踪": "Legal Billing Time Tracking",
  "供应链策略师": "Supply Chain Strategist",
  "行为助推引擎": "Behavioral Nudge Engine",
  "反馈综合师": "Feedback Synthesizer",
  "产品经理": "Product Manager",
  "冲刺优先级师": "Sprint Prioritizer",
  "趋势研究员": "Trend Researcher",
  "实验追踪师": "Experiment Tracker",
  "Jira 工作流管家": "Jira Workflow Steward",
  "项目牧羊人": "Project Shepherd",
  "工作室运营": "Studio Operations",
  "工作室制作人": "Studio Producer",
  "高级项目经理": "Senior Project Manager",
  "无障碍审计师": "Accessibility Auditor",
  "API 测试师": "API Tester",
  "证据收集师": "Evidence Collector",
  "性能基准测试师": "Performance Benchmarker",
  "现实检验师": "Reality Checker",
  "测试结果分析师": "Test Results Analyzer",
  "工具评估师": "Tool Evaluator",
  "工作流优化师": "Workflow Optimizer",
  "分析报告师": "Analytics Reporter",
  "执行摘要生成器": "Executive Summary Generator",
  "财务追踪师": "Finance Tracker",
  "基础设施维护师": "Infrastructure Maintainer",
  "法律合规检查师": "Legal Compliance Checker",
  "支持响应师": "Support Responder",
  "应付账款代理": "Accounts Payable Agent",
  "代理身份信任": "Agentic Identity Trust",
  "代理编排师": "Agents Orchestrator",
  "自动化治理架构师": "Automation Governance Architect",
  "区块链安全审计师": "Blockchain Security Auditor",
  "合规审计师": "Compliance Auditor",
  "企业培训设计师": "Corporate Training Designer",
  "客户服务": "Customer Service",
  "数据整合代理": "Data Consolidation Agent",
  "政务数字售前顾问": "Government Digital Presales Consultant",
  "医疗客户服务": "Healthcare Customer Service",
  "医疗营销合规": "Healthcare Marketing Compliance",
  "酒店宾客服务": "Hospitality Guest Services",
  "身份图谱操作师": "Identity Graph Operator",
  "语言翻译师": "Language Translator",
  "贷款官员助理": "Loan Officer Assistant",
  "LSP 索引工程师": "LSP Index Engineer",
  "房地产买卖师": "Real Estate Buyer/Seller",
  "报告分发代理": "Report Distribution Agent",
  "零售客户退货": "Retail Customer Returns",
  "销售数据提取代理": "Sales Data Extraction Agent",
  "销售外联": "Sales Outreach",
  "参谋长": "Chief of Staff",
  "土木工程师": "Civil Engineer",
  "文化智能策略师": "Cultural Intelligence Strategist",
  "开发者布道师": "Developer Advocate",
  "文档生成器": "Document Generator",
  "法国咨询市场": "French Consulting Market",
  "韩国商务导航师": "Korean Business Navigator",
  "MCP 构建师": "MCP Builder",
  "模型 QA": "Model QA",
  "Salesforce 架构师": "Salesforce Architect",
  "工作流架构师": "Workflow Architect",
  "留学顾问": "Study Abroad Advisor",
  "ZK 管家": "ZK Steward",
  "macOS 空间 Metal 工程师": "macOS Spatial Metal Engineer",
  "终端集成专家": "Terminal Integration Specialist",
  "visionOS 空间工程师": "visionOS Spatial Engineer",
  "XR 座舱交互专家": "XR Cockpit Interaction Specialist",
  "XR 沉浸式开发者": "XR Immersive Developer",
  "XR 界面架构师": "XR Interface Architect",
  "游戏音频工程师": "Game Audio Engineer",
  "游戏设计师": "Game Designer",
  "关卡设计师": "Level Designer",
  "叙事设计师": "Narrative Designer",
  "技术美术师": "Technical Artist",
  "人类学家": "Anthropologist",
  "地理学家": "Geographer",
  "历史学家": "Historian",
  "叙事学家": "Narratologist",
  "心理学家": "Psychologist",
  "学习规划师": "Learning Planner",
  "钉钉集成开发工程师": "DingTalk Integration Developer",
  "飞书集成开发工程师": "Feishu Integration Developer",
  "机械设计工程师": "Mechanical Design Engineer",
  "移动应用开发者": "Mobile App Developer",
  "智能搜索优化师": "Smart Search Optimizer",
  "AI 引文策略师": "AI Citation Strategist",
  "图书联合作者": "Book Co-Author",
  "轮播图增长引擎": "Carousel Growth Engine",
  "中国电商运营专家": "China E-Commerce Operator",
  "跨境电商运营专家": "Cross-Border E-Commerce Specialist",
  "新闻情报官": "News Intelligence Officer",
  "电商运营师": "E-Commerce Operator",
  "Instagram 策展师": "Instagram Curator",
  "知识付费产品策划师": "Knowledge Product Planner",
  "LinkedIn 内容创作专家": "LinkedIn Content Creator",
  "直播电商主播教练": "Livestream Commerce Coach",
  "播客内容策略师": "Podcast Strategist",
  "私域流量运营师": "Private Domain Operator",
  "Reddit 社区运营": "Reddit Community Builder",
  "SEO专家": "SEO Specialist",
  "短视频剪辑指导师": "Short Video Editing Coach",
  "Twitter 互动官": "Twitter Engager",
  "微信公众号管理": "WeChat Official Account Manager",
  "微博运营策略师": "Weibo Strategist",
  "微信视频号运营策略师": "WeChat Video Channel Strategist",
  "小红书运营专家": "Xiaohongshu Specialist",
  "付费媒体审计师": "Paid Media Auditor",
  "广告创意策略师": "Ad Creative Strategist",
  "社交广告策略师": "Social Ad Strategist",
  "PPC 竞价策略师": "PPC Bid Strategist",
  "程序化广告采买专家": "Programmatic Ad Buyer",
  "搜索词分析师": "Search Query Analyst",
  "追踪与归因专家": "Tracking & Attribution Specialist",
  "客户拓展策略师": "Account Expansion Strategist",
  "赢单策略师": "Win-Deal Strategist",
  "Discovery 教练": "Discovery Coach",
  "Outbound 策略师": "Outbound Strategist",
  "Pipeline 分析师": "Pipeline Analyst",
  "投标策略师": "Bidding Strategist",
  "簿记与财务总监": "Bookkeeper & Finance Controller",
  "财务预测分析师": "Financial Forecast Analyst",
  "金融风控分析师": "Financial Risk Analyst",
  "发票管理专家": "Invoice Management Specialist",
  "绩效管理专家": "Performance Management Specialist",
  "招聘专家": "Recruitment Expert",
  "合同审查专家": "Contract Review Specialist",
  "制度文件撰写专家": "Policy Document Specialist",
  "库存预测专家": "Inventory Forecast Specialist",
  "物流路线优化师": "Logistics Route Optimizer",
  "供应链采购策略师": "Supply Chain Procurement Strategist",
  "供应商评估专家": "Supplier Evaluation Specialist",
  "反馈分析师": "Feedback Analyst",
  "Sprint 排序师": "Sprint Prioritizer",
  "实验追踪员": "Experiment Tracker",
  "Jira工作流管家": "Jira Workflow Steward",
  "工作室制片人": "Studio Producer",
  "无障碍审核员": "Accessibility Auditor",
  "API 测试员": "API Tester",
  "嵌入式测试工程师": "Embedded Test Engineer",
  "证据收集者": "Evidence Collector",
  "性能基准师": "Performance Benchmarker",
  "现实检验者": "Reality Checker",
  "数据分析师": "Data Analyst",
  "高管摘要师": "Executive Summary Generator",
  "财务追踪员": "Finance Tracker",
  "基础设施运维师": "Infrastructure Ops Specialist",
  "法务合规员": "Legal Compliance Officer",
  "招聘运营专家": "Recruitment Ops Specialist",
  "客服响应者": "Support Responder",
  "应付账款智能体": "Accounts Payable Agent",
  "身份信任架构师": "Identity Trust Architect",
  "智能体编排者": "Agent Orchestrator",
  "企业培训课程设计师": "Corporate Training Designer",
  "数据整合师": "Data Consolidator",
  "高考志愿填报顾问": "College Admission Advisor",
  "政务数字化售前顾问": "Gov Digital Presales Consultant",
  "医疗客服专家": "Healthcare CS Specialist",
  "医疗健康营销合规师": "Healthcare Marketing Compliance",
  "酒店宾客服务专家": "Hospitality Guest Services Specialist",
  "HR 入职管理专家": "HR Onboarding Specialist",
  "身份图谱操作员": "Identity Graph Operator",
  "语言翻译专家": "Language Translator",
  "律所计费与工时专家": "Legal Billing Specialist",
  "律所客户接案专家": "Legal Client Intake Specialist",
  "法律文书审查专家": "Legal Document Review Specialist",
  "养殖档案核对员": "Livestock Record Auditor",
  "信贷经理助手": "Credit Manager Assistant",
  "提示词工程师": "Prompt Engineer",
  "房地产经纪助手": "Real Estate Agent Assistant",
  "报告分发师": "Report Distributor",
  "零售退货专家": "Retail Returns Specialist",
  "销售数据提取师": "Sales Data Extractor",
  "AI 治理政策专家": "AI Governance Policy Specialist",
  "幕僚长": "Chief of Staff",
  "法国咨询市场专家": "French Consulting Market Specialist",
  "韩国商务专家": "Korean Business Expert",
  "MCP 构建器": "MCP Builder",
  "会议效率专家": "Meeting Efficiency Specialist",
  "模型 QA 专家": "Model QA Specialist",
  "动态定价策略师": "Dynamic Pricing Strategist",
  "企业风险评估师": "Enterprise Risk Assessor",
  "留学规划顾问": "Study Abroad Planner",
  "技术翻译专家": "Technical Translation Specialist",
  "macOS Metal 空间工程师": "macOS Metal Spatial Engineer",
  "Blender 插件工程师": "Blender Add-on Engineer",
  "Godot 游戏脚本开发者": "Godot Script Developer",
  "Godot 多人游戏工程师": "Godot Multiplayer Engineer",
  "Godot Shader 开发者": "Godot Shader Developer",
  "Roblox 虚拟形象创作者": "Roblox Avatar Creator",
  "Roblox 体验设计师": "Roblox Experience Designer",
  "Roblox 系统脚本工程师": "Roblox System Scripter",
  "技术美术": "Technical Artist",
  "Unity 架构师": "Unity Architect",
  "Unity 编辑器工具开发者": "Unity Editor Tool Developer",
  "Unity 多人游戏工程师": "Unity Multiplayer Engineer",
  "Unity Shader Graph 美术师": "Unity Shader Graph Artist",
  "Unreal 多人游戏架构师": "Unreal Multiplayer Architect",
  "Unreal 系统工程师": "Unreal Systems Engineer",
  "Unreal 技术美术": "Unreal Technical Artist",
  "Unreal 世界构建师": "Unreal World Builder",
};

const deptBoundaries = [];
for (let i = 0; i < lines.length; i++) {
  for (const [prefix, key] of Object.entries(DEPARTMENT_MAP)) {
    if (lines[i].includes(prefix)) {
      deptBoundaries.push({ line: i, key, prefix });
      break;
    }
  }
}
deptBoundaries.sort((a, b) => a.line - b.line);

function getDeptForLine(lineIdx) {
  let result = deptBoundaries[0];
  for (const b of deptBoundaries) {
    if (b.line <= lineIdx) result = b;
    else break;
  }
  return result ? result.key : "engineering";
}

const roles = [];
let i = 0;

while (i < lines.length) {
  if (
    lines[i].trim() === "---" &&
    i + 1 < lines.length &&
    lines[i + 1].startsWith("name:")
  ) {
    let j = i + 1;
    const frontMatter = {};
    while (j < lines.length && lines[j].trim() !== "---") {
      const fmLine = lines[j];
      if (fmLine.startsWith("name:")) {
        frontMatter.name = fmLine.replace(/^name:\s*/, "").trim();
      } else if (fmLine.startsWith("description:")) {
        let desc = fmLine.replace(/^description:\s*/, "").trim();
        if (desc.startsWith('"') && !desc.endsWith('"')) {
          j++;
          while (j < lines.length && !lines[j].match(/^---$/) && !lines[j].match(/^(emoji|color):/)) {
            desc += " " + lines[j].trim();
            j++;
          }
          j--;
        }
        frontMatter.description = desc.replace(/^"|"$/g, "").trim();
      } else if (fmLine.startsWith("emoji:")) {
        frontMatter.emoji = fmLine.replace(/^emoji:\s*/, "").trim();
      } else if (fmLine.startsWith("color:")) {
        frontMatter.color = fmLine.replace(/^color:\s*/, "").trim();
      }
      j++;
    }

    let contentStart = j + 1;
    let contentEnd = lines.length;

    for (let k = contentStart; k < lines.length - 1; k++) {
      if (
        lines[k].trim() === "---" &&
        k + 1 < lines.length &&
        (lines[k + 1].startsWith("name:") || lines[k + 1].startsWith("==="))
      ) {
        contentEnd = k;
        break;
      }
    }

    let soulContent = lines
      .slice(contentStart, contentEnd)
      .join("\n")
      .trim();

    const headerMatch = soulContent.match(/^#\s+.+\n*/);
    if (headerMatch) {
      soulContent = soulContent.substring(headerMatch[0].length).trim();
    }

    soulContent = soulContent.replace(/\n{3,}/g, "\n\n").trim();

    const deptKey = getDeptForLine(i);
    const roleIndex = roles.filter((r) => r.department === deptKey).length;

    if (frontMatter.name) {
      const zhName = frontMatter.name;
      const slug = ZH_EN_MAP[zhName] || pinyinSlug(zhName);
      const enName = ZH_EN_NAME[zhName] || zhName;
      const id = `${deptKey}_${slug}`;

      const enDesc = (enMapping[deptKey] || []).find(
        (e) => e.slug === slug || e.enName === enName
      );

      roles.push({
        id,
        slug,
        department: deptKey,
        name: zhName,
        enName,
        description: frontMatter.description || "",
        enDescription: enDesc ? enDesc.enDescription : "",
        emoji: frontMatter.emoji || (enDesc ? enDesc.emoji : "") || "🤖",
        color: resolveColor(frontMatter.color || (enDesc ? enDesc.color : "")),
        soulContent,
      });
    }

    i = contentEnd;
    continue;
  }

  i++;
}

console.log(`Parsed ${roles.length} roles from ${deptBoundaries.length} departments`);

for (const role of roles) {
  const dir = path.join(outputBase, role.department);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const fileName = role.slug + ".json";
  const filePath = path.join(dir, fileName);

  const nickname = role.enName.length > 12
    ? role.enName.split(" ").slice(0, 2).join(" ")
    : role.enName;

  const json = {
    id: role.id,
    templateId: role.department,
    nickname: nickname,
    icon: role.emoji,
    name: { "zh-CN": role.name, "zh-XG": role.name, en: role.enName },
    description: {
      "zh-CN": role.description,
      "zh-XG": role.description,
      en: role.enDescription,
    },
    responsibilities: { "zh-CN": "", "zh-XG": "", en: "" },
    soulContent: { "zh-CN": role.soulContent, "zh-XG": role.soulContent, en: "" },
    avatarPreset: "business",
    avatarColor: role.color,
  };

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n", "utf-8");
}

const catalog = {
  version: "1.0.0",
  departments: Object.entries(DEPARTMENT_LABELS).map(([key, label]) => ({
    id: key,
    name: label,
    roleCount: roles.filter((r) => r.department === key).length,
  })),
  totalRoles: roles.length,
};

const catalogPath = path.join(outputBase, "catalog.json");
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf-8");

console.log(`Generated ${roles.length} role JSON files`);
console.log(`Catalog written to ${catalogPath}`);

const deptCounts = {};
for (const role of roles) {
  deptCounts[role.department] = (deptCounts[role.department] || 0) + 1;
}
for (const [dept, count] of Object.entries(deptCounts)) {
  console.log(`  ${dept}: ${count} roles`);
}

const unmatched = roles.filter((r) => !ZH_EN_MAP[r.name]);
if (unmatched.length > 0) {
  console.log(`\n⚠️  ${unmatched.length} roles without explicit English mapping (using auto-slug):`);
  for (const r of unmatched) {
    console.log(`  "${r.name}" → ${r.slug}`);
  }
}
