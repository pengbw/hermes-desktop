use crate::commands::helpers::{self, AppState};
use crate::database::models as db;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Emitter, Manager};

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<AppState>();
    Ok(state.db_pool.clone())
}

fn clean_context_tags(text: &str) -> String {
    let re = regex::Regex::new(r"<memory[^>]*>[\s\S]*?</memory>").unwrap();
    let result = re.replace_all(text, "").to_string();
    let re2 = regex::Regex::new(r"\[memory\][\s\S]*?\[/memory\]").unwrap();
    let result = re2.replace_all(&result, "").to_string();
    let re3 = regex::Regex::new(r"<!--\s*memory[\s\S]*?-->").unwrap();
    let result = re3.replace_all(&result, "").to_string();
    result
}

async fn record_activity(app: &AppHandle, project_id: &str, role_id: Option<&str>, action: &str, target_type: Option<&str>, target_id: Option<&str>, detail: &str) -> Result<(), String> {
    let pool = get_pool(app)?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("INSERT INTO project_activities (id, project_id, role_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(project_id)
        .bind(role_id.unwrap_or(""))
        .bind(action)
        .bind(target_type.unwrap_or(""))
        .bind(target_id.unwrap_or(""))
        .bind(detail)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("project_activity", serde_json::json!({
        "projectId": project_id,
        "action": action,
        "roleId": role_id.unwrap_or(""),
        "targetType": target_type.unwrap_or(""),
        "targetId": target_id.unwrap_or(""),
        "detail": detail,
    }));

    Ok(())
}

pub async fn seed_builtin_templates(pool: &SqlitePool) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();

    let templates = [
        ("software_dev", "软件开发", "🏗️", "产品经理→开发工程师→测试工程师→代码审查", "遵循敏捷开发流程，每个迭代产出可交付的增量。代码必须经过审查才能合并。", "1. 需求文档需明确验收标准\n2. 代码实现需包含单元测试\n3. 测试报告需覆盖功能与边界\n4. 审查反馈需具体可操作"),
        ("content_creation", "内容创作", "🎨", "策划→撰稿→编辑→审核发布", "内容创作遵循选题→大纲→初稿→修改→发布的标准流程，确保内容质量和品牌一致性。", "1. 选题需有明确目标受众和价值主张\n2. 大纲需包含核心论点和结构\n3. 初稿需语言流畅、逻辑清晰\n4. 审核需检查事实准确性和品牌调性"),
        ("data_analysis", "数据分析", "📊", "需求→数据采集→分析建模→报告输出", "数据分析项目需确保数据质量和分析方法的科学性，结论需有数据支撑。", "1. 需求分析需明确分析目标和关键指标\n2. 数据采集需记录数据来源和质量评估\n3. 分析建模需说明方法选择理由\n4. 报告需包含结论、建议和局限性说明"),
        ("marketing_campaign", "营销策划", "📢", "策略→创意→执行→效果评估", "营销策划需以数据驱动决策，每个环节需有明确的KPI和可衡量的成果指标。", "1. 策略需基于市场调研和用户洞察\n2. 创意方案需包含多种形式和渠道\n3. 执行计划需有时间线和责任分工\n4. 效果评估需对比预期与实际KPI"),
        ("game_dev", "游戏开发", "🎮", "策划→美术→程序→测试→上线", "游戏开发需以玩家体验为核心，每个系统需经过充分测试和平衡性调整。", "1. 策划文档需包含核心玩法和系统设计\n2. 美术资源需符合风格指南和性能要求\n3. 程序实现需遵循架构规范和编码标准\n4. 测试需覆盖功能、性能和兼容性"),
        ("research_project", "学术研究", "🔬", "选题→文献→实验→论文撰写", "学术研究需遵循严谨的方法论，确保研究的可复现性和学术诚信。", "1. 选题需有学术价值和创新性\n2. 文献综述需全面且批判性分析\n3. 实验设计需控制变量和偏差\n4. 论文需符合学术写作规范"),
    ];

    for (idx, (tmpl_id, name, icon, desc, rule, guidelines)) in templates.iter().enumerate() {
        let id = format!("builtin_{}", tmpl_id);
        sqlx::query(
            "INSERT INTO project_templates (id, name, icon, description, project_rule, project_guidelines, is_builtin, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon, description=excluded.description, project_rule=excluded.project_rule, project_guidelines=excluded.project_guidelines, sort_order=excluded.sort_order, updated_at=excluded.updated_at"
        )
        .bind(&id)
        .bind(name)
        .bind(icon)
        .bind(desc)
        .bind(rule)
        .bind(guidelines)
        .bind(idx as i64)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    let builtin_roles: Vec<(&str, &str, &str, &str, &str, &str, &str, &str, &str)> = vec![
        ("software_dev_pm", "产品经理", "PM", "📋", "负责需求收集、分析和文档编写，确保产品方向正确", "需求收集与分析、编写需求文档与用户故事、制定产品路线图、与开发团队沟通需求细节、验收交付成果", "你是一位经验丰富的产品经理，擅长将模糊的想法转化为清晰的需求。你注重用户体验，善于倾听各方意见并做出权衡。你会主动思考需求的边界条件和异常场景，确保开发团队有足够的信息来实现功能。输出格式规范，逻辑清晰。", "business", "#4A90D9"),
        ("software_dev_dev", "开发工程师", "Dev", "💻", "负责根据需求文档进行代码实现和技术方案设计", "技术方案设计、代码编写与实现、单元测试编写、Bug修复、技术文档撰写", "你是一位资深开发工程师，精通多种编程语言和技术栈。你注重代码质量和可维护性，遵循SOLID原则和设计模式。你会仔细阅读需求文档，遇到不明确的地方会主动提问。编码风格简洁优雅，注释清晰，测试覆盖充分。", "tech", "#50C878"),
        ("software_dev_qa", "测试工程师", "QA", "🔍", "负责功能测试、回归测试和质量保障", "测试用例设计、功能测试执行、回归测试、缺陷报告与跟踪、测试报告编写", "你是一位严谨的测试工程师，擅长发现软件中的潜在问题。你会从用户角度和使用场景出发设计测试用例，覆盖正常流程和异常场景。你的缺陷报告详细且可复现，测试报告清晰展示质量状况。你关注边界条件和性能表现。", "analyst", "#FF6B6B"),
        ("software_dev_reviewer", "代码审查员", "Reviewer", "🛡️", "负责代码审查，确保代码质量和规范一致性", "代码审查、架构评审、最佳实践建议、技术债务识别、代码规范检查", "你是一位注重代码质量的审查员，拥有丰富的代码审查经验。你关注代码的可读性、可维护性、安全性和性能。你的审查意见具体且建设性，不仅指出问题，还会提供改进建议。你理解技术债务的权衡，能在完美与实用之间找到平衡。", "expert", "#9B59B6"),
        ("content_creation_planner", "内容策划", "Planner", "💡", "负责内容选题、策略规划和方向把控", "选题策划、内容日历制定、目标受众分析、竞品内容研究、内容方向把控", "你是一位敏锐的内容策划师，善于捕捉热点话题和用户需求。你擅长从数据中发现内容机会，制定有策略的内容计划。你的选题既有深度又有传播力，能够平衡品牌调性与受众兴趣。输出的大纲结构清晰，重点突出。", "creative", "#E74C3C"),
        ("content_creation_writer", "撰稿人", "Writer", "✍️", "负责根据大纲撰写内容初稿", "内容撰写、素材收集与整理、文风把控、SEO优化、引用标注", "你是一位文笔优美的撰稿人，擅长将大纲转化为引人入胜的文章。你的文字简洁有力，善于用故事和案例阐述观点。你注重逻辑连贯性，段落过渡自然。你会根据不同平台和受众调整写作风格，同时保持内容的深度和准确性。", "writer", "#3498DB"),
        ("content_creation_editor", "编辑", "Editor", "📝", "负责内容修改润色和质量提升", "内容润色、结构调整、语言规范、格式统一、可读性优化", "你是一位严谨的编辑，对文字有极高的敏感度。你善于发现文章中的逻辑漏洞和表达不当之处，并能给出精准的修改建议。你注重内容的可读性和节奏感，确保每一段话都有存在的价值。你的修改既保留作者的原创风格，又提升整体质量。", "business", "#2ECC71"),
        ("content_creation_auditor", "审核员", "Auditor", "✅", "负责内容终审，确保合规与品质", "合规审查、事实核查、品牌调性审核、发布前终审、反馈汇总", "你是一位细致的内容审核员，对合规性和准确性有极高的标准。你会仔细核查文中的事实和数据，确保没有误导性信息。你关注内容的法律合规性和品牌一致性，审核意见明确具体，分类标注问题的优先级。", "expert", "#F39C12"),
        ("data_analysis_ba", "业务分析师", "BA", "📈", "负责业务需求分析和指标定义", "业务需求分析、KPI定义、分析目标拆解、报告解读与建议、业务方沟通", "你是一位精通业务的分析师，擅长将业务问题转化为可分析的数据问题。你了解行业指标体系，能够定义合理的KPI和分析框架。你的分析目标清晰可量化，报告中的建议切实可行。你善于用数据讲故事，让非技术人员也能理解分析结果。", "business", "#3498DB"),
        ("data_analysis_de", "数据工程师", "DE", "⚙️", "负责数据采集、清洗和管道搭建", "数据采集与集成、数据清洗与转换、数据管道搭建、数据质量保障、数据文档编写", "你是一位经验丰富的数据工程师，擅长处理各种数据源和格式。你注重数据质量和可追溯性，会详细记录数据来源、清洗规则和转换逻辑。你的数据处理脚本健壮高效，能够处理异常数据和缺失值。你会主动评估数据质量并给出改进建议。", "tech", "#27AE60"),
        ("data_analysis_ds", "数据科学家", "DS", "🧪", "负责数据建模、分析和洞察提取", "探索性数据分析、统计建模与假设检验、机器学习模型构建、可视化分析、分析报告撰写", "你是一位严谨的数据科学家，精通统计分析和机器学习方法。你注重分析方法的选择和假设的合理性，会说明方法选择的原因和局限性。你的分析过程可复现，结论有统计显著性支撑。你善于从数据中发现非显而易见的洞察，并用清晰的可视化呈现。", "analyst", "#8E44AD"),
        ("marketing_strategist", "营销策略师", "Strategist", "🎯", "负责营销策略制定和市场分析", "市场调研与分析、目标受众画像、营销策略制定、预算规划、KPI设定", "你是一位资深的营销策略师，擅长从市场数据和用户行为中提炼洞察。你的策略既有创意又有数据支撑，能够精准定位目标受众。你了解各种营销渠道的特点和适用场景，善于整合多渠道策略。你的方案总是包含清晰的目标、执行路径和衡量指标。", "business", "#E74C3C"),
        ("marketing_creative", "创意设计师", "Creative", "🎭", "负责创意方案设计和视觉呈现", "创意概念发想、视觉方案设计、文案创作、品牌调性把控、素材规范制定", "你是一位充满创意的设计师，善于将策略转化为打动人心的创意表达。你的创意既有冲击力又符合品牌调性，能够引发目标受众的情感共鸣。你注重细节和美感，输出的创意方案包含完整的视觉规范和文案。你会考虑不同渠道的适配需求。", "creative", "#9B59B6"),
        ("marketing_executor", "执行专员", "Executor", "🚀", "负责营销活动的落地执行和协调", "执行计划制定、资源协调与排期、渠道投放管理、进度跟踪、问题处理", "你是一位高效的执行专员，擅长将创意方案转化为可落地的执行计划。你注重时间管理和资源协调，能够处理多线并行的任务。你的执行计划详细具体，包含每个环节的时间节点和验收标准。遇到问题你会快速响应并提供替代方案。", "tech", "#F39C12"),
        ("marketing_analyst", "效果分析师", "Analyst", "📉", "负责营销效果追踪和数据分析", "数据埋点与采集、效果指标监控、ROI分析、归因分析、优化建议", "你是一位注重效果的分析师，擅长用数据评估营销活动的实际表现。你会建立完整的数据追踪体系，确保每个环节的效果可量化。你的分析不仅关注表面数据，还会深入挖掘归因关系。你的优化建议基于数据，具体且可操作。", "analyst", "#1ABC9C"),
        ("game_dev_designer", "游戏策划", "Designer", "🎲", "负责游戏系统设计和玩法策划", "核心玩法设计、系统设计文档、数值平衡、关卡设计、用户体验优化", "你是一位富有创造力的游戏策划，擅长设计引人入胜的游戏系统。你注重玩家体验和游戏平衡性，每个系统都有清晰的设计目标和数值支撑。你的设计文档详细且可执行，包含边界条件和异常处理。你会从玩家心理出发设计奖励和成长曲线。", "creative", "#E74C3C"),
        ("game_dev_artist", "美术设计师", "Artist", "🖌️", "负责游戏视觉设计和美术资源产出", "视觉风格定义、角色与场景设计、UI/UX设计、美术规范文档、资源优化建议", "你是一位多才多艺的美术设计师，擅长多种美术风格。你注重视觉表现力和性能优化的平衡，设计的资源既美观又高效。你的美术规范文档清晰完整，包含色彩体系、风格参考和技术规范。你会考虑不同分辨率和平台的适配需求。", "creative", "#9B59B6"),
        ("game_dev_coder", "游戏程序员", "Coder", "⌨️", "负责游戏逻辑实现和技术架构", "游戏架构设计、核心系统实现、性能优化、工具开发、技术文档", "你是一位经验丰富的游戏程序员，精通游戏引擎和性能优化。你注重代码架构的扩展性和可维护性，善于处理实时交互和网络同步等复杂问题。你的实现严格遵循策划文档，遇到技术限制会主动沟通替代方案。代码风格规范，注释清晰。", "tech", "#2ECC71"),
        ("game_dev_tester", "游戏测试员", "Tester", "🕹️", "负责游戏功能测试和品质保障", "功能测试、兼容性测试、性能测试、平衡性测试、缺陷报告与回归", "你是一位细致的游戏测试员，擅长发现游戏中的各种问题。你会从核心玩家和休闲玩家两个角度测试游戏体验，关注功能正确性、性能表现和平衡性。你的缺陷报告包含复现步骤、预期行为和实际行为。你会特别关注游戏的手感和反馈体验。", "analyst", "#F39C12"),
        ("research_pi", "研究负责人", "PI", "🎓", "负责研究方向把控和课题管理", "研究选题与方向把控、研究计划制定、资源协调、进度管理、成果审核", "你是一位资深的研究负责人，拥有丰富的科研项目管理经验。你擅长把握研究方向，确保研究的创新性和可行性。你的研究计划系统完整，包含明确的时间节点和里程碑。你注重学术规范和研究伦理，对研究质量有极高的标准。", "expert", "#2C3E50"),
        ("research_lr", "文献研究员", "LR", "📚", "负责文献检索、综述撰写和知识梳理", "文献检索与筛选、文献综述撰写、研究前沿追踪、方法论比较、知识图谱构建", "你是一位博学的文献研究员，擅长系统性地检索和梳理学术文献。你的文献综述全面且有批判性分析，能够识别研究空白和争议焦点。你注重引用的准确性和规范性，善于从大量文献中提炼核心观点和趋势。", "analyst", "#8E44AD"),
        ("research_er", "实验研究员", "ER", "🔬", "负责实验设计、数据采集和结果分析", "实验方案设计、数据采集与管理、统计分析、实验报告撰写、可复现性验证", "你是一位严谨的实验研究员，精通实验设计和统计分析方法。你注重实验的可控性和可复现性，会详细记录实验条件和参数。你的数据分析方法选择合理，结果解读客观谨慎。你会主动报告实验的局限性和潜在偏差。", "tech", "#16A085"),
    ];

    for (i, (role_id, name, nickname, icon, desc, resp, soul, preset, color)) in builtin_roles.iter().enumerate() {
        let id = format!("builtin_{}", role_id);
        sqlx::query(
            "INSERT INTO ai_roles (id, name, nickname, icon, description, responsibilities, soul_content, avatar_url, avatar_type, avatar_preset, avatar_color, sort_order, is_builtin, energy, mood, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', 'default', ?, ?, ?, 1, 100, 'neutral', ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, nickname=excluded.nickname, icon=excluded.icon, description=excluded.description, responsibilities=excluded.responsibilities, soul_content=excluded.soul_content, avatar_preset=excluded.avatar_preset, avatar_color=excluded.avatar_color, sort_order=excluded.sort_order, updated_at=excluded.updated_at"
        )
        .bind(&id)
        .bind(name)
        .bind(nickname)
        .bind(icon)
        .bind(desc)
        .bind(resp)
        .bind(soul)
        .bind(preset)
        .bind(color)
        .bind(i as i64)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    let template_workflows: Vec<(&str, &str, Option<&str>, &str, &str, &str)> = vec![
        ("software_dev_wf0", "software_dev", None, "builtin_software_dev_pm", "需求文档", "auto_push"),
        ("software_dev_wf1", "software_dev", Some("builtin_software_dev_pm"), "builtin_software_dev_dev", "需求规格", "need_confirm"),
        ("software_dev_wf2", "software_dev", Some("builtin_software_dev_dev"), "builtin_software_dev_qa", "代码实现", "auto_push"),
        ("software_dev_wf3", "software_dev", Some("builtin_software_dev_qa"), "builtin_software_dev_reviewer", "测试报告", "auto_push"),
        ("software_dev_wf4", "software_dev", Some("builtin_software_dev_reviewer"), "builtin_software_dev_dev", "审查反馈", "need_confirm"),
        ("content_creation_wf0", "content_creation", None, "builtin_content_creation_planner", "选题方向", "auto_push"),
        ("content_creation_wf1", "content_creation", Some("builtin_content_creation_planner"), "builtin_content_creation_writer", "内容大纲", "need_confirm"),
        ("content_creation_wf2", "content_creation", Some("builtin_content_creation_writer"), "builtin_content_creation_editor", "初稿", "auto_push"),
        ("content_creation_wf3", "content_creation", Some("builtin_content_creation_editor"), "builtin_content_creation_auditor", "修改稿", "auto_push"),
        ("content_creation_wf4", "content_creation", Some("builtin_content_creation_auditor"), "builtin_content_creation_editor", "审核意见", "need_confirm"),
        ("data_analysis_wf0", "data_analysis", None, "builtin_data_analysis_ba", "分析需求", "auto_push"),
        ("data_analysis_wf1", "data_analysis", Some("builtin_data_analysis_ba"), "builtin_data_analysis_de", "数据需求", "auto_push"),
        ("data_analysis_wf2", "data_analysis", Some("builtin_data_analysis_de"), "builtin_data_analysis_ds", "数据集", "need_confirm"),
        ("data_analysis_wf3", "data_analysis", Some("builtin_data_analysis_ds"), "builtin_data_analysis_ba", "分析报告", "auto_push"),
        ("marketing_wf0", "marketing_campaign", None, "builtin_marketing_strategist", "营销需求", "auto_push"),
        ("marketing_wf1", "marketing_campaign", Some("builtin_marketing_strategist"), "builtin_marketing_creative", "策略方案", "need_confirm"),
        ("marketing_wf2", "marketing_campaign", Some("builtin_marketing_creative"), "builtin_marketing_executor", "创意素材", "auto_push"),
        ("marketing_wf3", "marketing_campaign", Some("builtin_marketing_executor"), "builtin_marketing_analyst", "执行数据", "auto_push"),
        ("marketing_wf4", "marketing_campaign", Some("builtin_marketing_analyst"), "builtin_marketing_strategist", "效果报告", "need_confirm"),
        ("game_dev_wf0", "game_dev", None, "builtin_game_dev_designer", "游戏概念", "auto_push"),
        ("game_dev_wf1", "game_dev", Some("builtin_game_dev_designer"), "builtin_game_dev_artist", "设计文档", "need_confirm"),
        ("game_dev_wf2", "game_dev", Some("builtin_game_dev_artist"), "builtin_game_dev_coder", "美术资源", "auto_push"),
        ("game_dev_wf3", "game_dev", Some("builtin_game_dev_coder"), "builtin_game_dev_tester", "可玩版本", "auto_push"),
        ("game_dev_wf4", "game_dev", Some("builtin_game_dev_tester"), "builtin_game_dev_designer", "测试报告", "need_confirm"),
        ("research_wf0", "research_project", None, "builtin_research_pi", "研究选题", "auto_push"),
        ("research_wf1", "research_project", Some("builtin_research_pi"), "builtin_research_lr", "研究计划", "need_confirm"),
        ("research_wf2", "research_project", Some("builtin_research_lr"), "builtin_research_er", "文献综述", "auto_push"),
        ("research_wf3", "research_project", Some("builtin_research_er"), "builtin_research_pi", "实验结果", "need_confirm"),
    ];

    for (wf_id, tmpl_id, from_role, to_role, artifact, transition) in &template_workflows {
        let id = format!("builtin_{}", wf_id);
        let template_id = format!("builtin_{}", tmpl_id);
        let sort_order: i64 = wf_id.rsplit('_').next()
            .map(|s| s.trim_start_matches("wf").parse().unwrap_or(0))
            .unwrap_or(0);

        sqlx::query(
            "INSERT INTO template_workflows (id, template_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET from_role_id=excluded.from_role_id, to_role_id=excluded.to_role_id, artifact_type=excluded.artifact_type, transition_type=excluded.transition_type, sort_order=excluded.sort_order"
        )
        .bind(&id)
        .bind(&template_id)
        .bind(*from_role)
        .bind(to_role)
        .bind(artifact)
        .bind(transition)
        .bind(sort_order)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    sqlx::query("DELETE FROM ai_roles WHERE id = 'user'")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn list_project_templates(app: AppHandle) -> Result<Vec<db::ProjectTemplateDetail>, String> {
    let pool = get_pool(&app)?;

    let _ = seed_builtin_templates(&pool).await;

    let templates = sqlx::query_as::<_, db::ProjectTemplate>(
        "SELECT id, name, icon, description, project_rule, project_guidelines, is_builtin, sort_order, created_at, updated_at FROM project_templates ORDER BY sort_order ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for tmpl in templates {
        let workflows = sqlx::query_as::<_, db::TemplateWorkflow>(
            "SELECT id, template_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order FROM template_workflows WHERE template_id = ? ORDER BY sort_order ASC"
        )
        .bind(&tmpl.id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut role_ids: Vec<String> = Vec::new();
        for w in &workflows {
            if let Some(ref from) = w.from_role_id {
                role_ids.push(from.clone());
            }
            role_ids.push(w.to_role_id.clone());
        }
        role_ids.sort();
        role_ids.dedup();

        let mut roles = Vec::new();
        for rid in &role_ids {
            if let Some(role) = sqlx::query_as::<_, db::AiRole>(
                "SELECT id, name, nickname, icon, description, responsibilities, soul_content, avatar_url, avatar_type, avatar_preset, avatar_color, sort_order, is_builtin, energy, mood, created_at, updated_at FROM ai_roles WHERE id = ?"
            )
            .bind(rid)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?
            {
                roles.push(role);
            }
        }

        result.push(db::ProjectTemplateDetail {
            template: tmpl,
            roles,
            workflows,
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn create_project_from_template(app: AppHandle, req: db::CreateProjectFromTemplateRequest) -> Result<db::Project, String> {
    let pool = get_pool(&app)?;

    let _ = seed_builtin_templates(&pool).await;

    log::info!("create_project_from_template: template_id={}", req.template_id);

    let tmpl = sqlx::query_as::<_, db::ProjectTemplate>(
        "SELECT id, name, icon, description, project_rule, project_guidelines, is_builtin, sort_order, created_at, updated_at FROM project_templates WHERE id = ?"
    )
    .bind(&req.template_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Template not found")?;

    let template_workflows = sqlx::query_as::<_, db::TemplateWorkflow>(
        "SELECT id, template_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order FROM template_workflows WHERE template_id = ? ORDER BY sort_order ASC"
    )
    .bind(&req.template_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut role_ids: Vec<String> = Vec::new();
    for w in &template_workflows {
        if let Some(ref from) = w.from_role_id {
            role_ids.push(from.clone());
        }
        role_ids.push(w.to_role_id.clone());
    }
    role_ids.sort();
    role_ids.dedup();

    let now = chrono::Utc::now().timestamp_millis();
    let project_id = uuid::Uuid::new_v4().to_string();
    let icon = req.icon.unwrap_or_else(|| tmpl.icon.clone());
    let description = req.description.unwrap_or_else(|| tmpl.description.clone());
    let project_rule = tmpl.project_rule.clone();
    let project_guidelines = tmpl.project_guidelines.clone();
    let office_theme = req.office_theme.unwrap_or_else(|| "cozy".to_string());

    let workspace_root = sqlx::query_scalar::<_, String>("SELECT value FROM app_config WHERE key = 'workspace_root'")
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| format!("{}/hermes-workspace", dirs::home_dir().map(|h| h.to_string_lossy().to_string()).unwrap_or_else(|| ".".to_string())));
    let slug: String = req.name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let workspace_path = format!("{}/{}", workspace_root.trim_end_matches('/'), slug);
    let _ = std::fs::create_dir_all(&workspace_path);

    sqlx::query(
        "INSERT INTO projects (id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'none', ?, 0, '', ?, ?, ?, ?, ?)"
    )
    .bind(&project_id)
    .bind(&req.name)
    .bind(&description)
    .bind(&workspace_path)
    .bind(&icon)
    .bind(&project_rule)
    .bind(&project_guidelines)
    .bind(&office_theme)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    log::info!("create_project_from_template: role_ids={:?}", role_ids);

    for (i, role_id) in role_ids.iter().enumerate() {
        let member_id = uuid::Uuid::new_v4().to_string();
        log::info!("create_project_from_template: inserting member {} role_id={} project_id={}", i, role_id, project_id);
        let result = sqlx::query(
            "INSERT INTO project_members (id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, sort_order, created_at, updated_at) VALUES (?, ?, ?, '', '', '', ?, ?, ?)"
        )
        .bind(&member_id)
        .bind(&project_id)
        .bind(role_id)
        .bind(i as i64)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await;
        match result {
            Ok(r) => log::info!("create_project_from_template: member inserted rows_affected={}", r.rows_affected()),
            Err(e) => log::error!("create_project_from_template: member insert failed: {}", e),
        }
    }

    for twf in &template_workflows {
        let wf_id = uuid::Uuid::new_v4().to_string();
        let from_role_id_for_insert = twf.from_role_id.as_ref().filter(|s| !s.is_empty());

        sqlx::query(
            "INSERT INTO project_workflows (id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, '', '', '', '', ?, ?)"
        )
        .bind(&wf_id)
        .bind(&project_id)
        .bind(from_role_id_for_insert)
        .bind(&twf.to_role_id)
        .bind(&twf.artifact_type)
        .bind(&twf.transition_type)
        .bind(twf.sort_order)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    let _ = sync_workflow_to_file(app.clone(), project_id.clone()).await;

    let project = sqlx::query_as::<_, db::Project>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(project)
}

#[tauri::command]
pub async fn preprocess_skill_template(app: AppHandle, project_id: String, role_id: String, template: String) -> Result<String, String> {
    let pool = get_pool(&app)?;

    let project_name: Option<String> = sqlx::query_scalar("SELECT name FROM projects WHERE id = ?")
        .bind(&project_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let role_name: Option<String> = sqlx::query_scalar(
        "SELECT COALESCE(nickname, name) FROM ai_roles WHERE id = ?"
    )
    .bind(&role_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut result = template;
    result = result.replace("{{project_name}}", project_name.as_deref().unwrap_or(""));
    result = result.replace("{{role_name}}", role_name.as_deref().unwrap_or(""));
    result = result.replace("{{role_id}}", &role_id);
    result = result.replace("{{project_id}}", &project_id);

    Ok(result)
}
async fn extract_and_save_memory(app: AppHandle, project_id: String, role_id: String, user_message: String, assistant_content: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let api_base = helpers::hermes_api_base_from_pool(&pool).await;
    let api_key = helpers::hermes_api_key_from_pool(&pool).await;

    let memory_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM project_memories WHERE project_id = ? AND role_id = ?"
    )
    .bind(&project_id)
    .bind(&role_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if memory_count.0 >= 50 {
        return Ok(());
    }

    let combined = format!("用户：{}\n\n角色回复：{}", 
        if user_message.len() > 500 { &user_message[..500] } else { &user_message },
        if assistant_content.len() > 1000 { &assistant_content[..1000] } else { &assistant_content }
    );

    let extract_prompt = format!(
        "分析以下对话，提取值得长期记住的关键信息。只提取以下类型的信息：\n\
        1. 重要决策和结论\n\
        2. 技术方案选择及理由\n\
        3. 项目约束和规范\n\
        4. 关键事实和数据\n\n\
        如果对话中没有值得记住的信息，请回复空字符串。\n\
        如果有，请用简洁的一句话描述，格式为：类别|内容\n\
        类别可选：decision（决策）、tech（技术方案）、constraint（约束）、fact（事实）\n\
        例如：decision|采用React作为前端框架\n\
        例如：constraint|API响应时间不超过200ms\n\n\
        对话内容：\n{}", combined
    );

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "default",
        "messages": [{"role": "user", "content": extract_prompt}],
        "stream": false,
    });

    let response = client
        .post(format!("{}/chat/completions", api_base))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Ok(());
    }

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let content = json["choices"][0]["message"]["content"].as_str().unwrap_or("").trim().to_string();

    if content.is_empty() {
        return Ok(());
    }

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        let (category, memory_content) = if let Some(pos) = line.find('|') {
            let cat = &line[..pos];
            let mem = &line[pos + 1..];
            match cat {
                "decision" | "tech" | "constraint" | "fact" => (cat.to_string(), mem.to_string()),
                _ => ("general".to_string(), line.to_string()),
            }
        } else {
            ("general".to_string(), line.to_string())
        };

        if memory_content.is_empty() { continue; }

        let similar: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM project_memories WHERE project_id = ? AND role_id = ? AND content LIKE ? LIMIT 1"
        )
        .bind(&project_id)
        .bind(&role_id)
        .bind(format!("%{}%", &memory_content.chars().take(20).collect::<String>()))
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        if similar.is_some() { continue; }

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        let importance = match category.as_str() {
            "decision" => 3,
            "constraint" => 3,
            "tech" => 2,
            _ => 1,
        };

        let _ = sqlx::query(
            "INSERT INTO project_memories (id, project_id, role_id, category, content, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&project_id)
        .bind(&role_id)
        .bind(&category)
        .bind(&memory_content)
        .bind(importance)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await;
    }

    Ok(())
}

async fn is_workflow_start_role(pool: &sqlx::SqlitePool, project_id: &str, role_id: &str) -> bool {
    let start_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM project_workflows WHERE project_id = ? AND (from_role_id = '' OR from_role_id IS NULL) AND to_role_id = ?"
    )
    .bind(project_id)
    .bind(role_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    start_count > 0
}

#[tauri::command]
async fn do_dispatch_task(app: &AppHandle, pool: &sqlx::SqlitePool, task_id: &str, role_id: &str, project_id: &str, title: &str, body: &str, priority: i32, message: Option<&str>, dispatch_type: &str) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();

    let current_status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM project_tasks WHERE id = ?"
    )
    .bind(task_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    match current_status.as_deref() {
        Some("done") | Some("archived") => {
            log::info!("do_dispatch_task: skipping task={} with status={}", task_id, current_status.unwrap_or_default());
            return Ok(());
        }
        Some("running") => {
            log::info!("do_dispatch_task: task={} already running, checking for duplicate dispatch", task_id);
        }
        _ => {}
    }

    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM task_dispatches WHERE task_id = ? AND role_id = ? AND status = 'sent'"
    )
    .bind(task_id)
    .bind(role_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if existing.is_some() {
        log::info!("do_dispatch_task: already dispatched task={} to role={}", task_id, role_id);
        return Ok(());
    }

    let dispatch_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO task_dispatches (id, task_id, role_id, dispatch_type, message, status, created_at) VALUES (?, ?, ?, ?, ?, 'sent', ?)"
    )
    .bind(&dispatch_id)
    .bind(task_id)
    .bind(role_id)
    .bind(dispatch_type)
    .bind(message.unwrap_or(""))
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE project_tasks SET status = 'ready', started_at = COALESCE(started_at, ?), claim_lock = ?, claim_expire_at = ?, updated_at = ? WHERE id = ?"
    )
    .bind(now)
    .bind(role_id)
    .bind(now + 30 * 60 * 1000)
    .bind(now)
    .bind(task_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = record_activity(app, project_id, Some(role_id), "task_dispatched", Some("task"), Some(task_id), &format!("派发任务：{}", title)).await;

    let mut task_message = format!("你被分配了一个任务：\n**任务标题**：{}\n**优先级**：{}", title, match priority {
        p if p >= 3 => "高",
        p if p >= 2 => "中",
        _ => "低",
    });
    if !body.is_empty() {
        task_message.push_str(&format!("\n**任务描述**：{}", body));
    }
    if let Some(msg) = message {
        if !msg.is_empty() {
            task_message.push_str(&format!("\n**附加说明**：{}", msg));
        }
    }

    let msg_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO project_messages (id, project_id, role_id, content, message_type, created_at) VALUES (?, ?, 'builtin_user', ?, 'task_dispatch', ?)")
        .bind(&msg_id)
        .bind(project_id)
        .bind(&task_message)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    let event_id = format!("task_dispatch_{}_{}", task_id, now);

    let is_start = is_workflow_start_role(pool, project_id, role_id).await;
    log::info!("do_dispatch_task: role_id={}, project_id={}, is_workflow_start={}", role_id, project_id, is_start);

    if is_start {
        // For start roles, start the workflow run FIRST to ensure artifacts exist before delegation.
        // trigger_workflow_execution will skip auto_delegate_chat for start triggers,
        // so we handle delegation here after artifacts are created.
        let app_wf = app.clone();
        let project_id_wf = project_id.to_string();
        let initial_msg = title.to_string();
        match start_workflow_run(app_wf, project_id_wf, initial_msg).await {
            Ok(run) => log::info!("start_workflow_run: created run_id={}, status={}", run.id, run.status),
            Err(e) => log::error!("start_workflow_run: error={}", e),
        }

        // Now delegate to the role - artifacts are guaranteed to exist
        let app_clone = app.clone();
        let project_id_clone = project_id.to_string();
        let role_id_clone = role_id.to_string();
        let task_message_clone = task_message.clone();
        tauri::async_runtime::spawn(async move {
            let _ = crate::commands::project::auto_delegate_chat(
                app_clone, project_id_clone, "builtin_user".to_string(), role_id_clone, task_message_clone, event_id,
            ).await;
        });
    } else {
        // For non-start roles, delegate directly
        let app_clone = app.clone();
        let project_id_clone = project_id.to_string();
        let role_id_clone = role_id.to_string();
        let task_message_clone = task_message.clone();
        tauri::async_runtime::spawn(async move {
            let _ = crate::commands::project::auto_delegate_chat(
                app_clone, project_id_clone, "builtin_user".to_string(), role_id_clone, task_message_clone, event_id,
            ).await;
        });
    }

    let _ = app.emit("task_dispatched", serde_json::json!({
        "taskId": task_id,
        "roleId": role_id,
        "dispatchId": dispatch_id,
    }));

    Ok(())
}

#[tauri::command]
pub async fn dispatch_task_to_role(app: AppHandle, task_id: String, role_id: String, message: Option<String>) -> Result<(), String> {
    let pool = get_pool(&app)?;

    let task: Option<(String, String, String, String, i32, String)> = sqlx::query_as(
        "SELECT title, body, assignee, status, priority, project_id FROM project_tasks WHERE id = ?"
    )
    .bind(&task_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (title, body, _assignee, _status, priority, project_id) = task.ok_or("Task not found")?;

    do_dispatch_task(&app, &pool, &task_id, &role_id, &project_id, &title, &body, priority, message.as_deref(), "manual").await
}

#[tauri::command]
pub async fn list_task_dispatches(app: AppHandle, task_id: String) -> Result<Vec<db::TaskDispatch>, String> {
    let pool = get_pool(&app)?;
    let rows: Vec<(String, String, String, String, String, i64)> = sqlx::query_as(
        "SELECT id, task_id, role_id, dispatch_type, message, created_at FROM task_dispatches WHERE task_id = ? ORDER BY created_at DESC"
    )
    .bind(&task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, task_id, role_id, dispatch_type, message, created_at)| db::TaskDispatch {
        id, task_id, role_id, dispatch_type, message, status: "sent".to_string(), created_at,
    }).collect())
}

#[tauri::command]
pub async fn auto_dispatch_ready_tasks(app: AppHandle, project_id: String) -> Result<Vec<String>, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let tasks: Vec<(String, String, String, i32)> = sqlx::query_as(
        "SELECT id, title, assignee, priority FROM project_tasks WHERE project_id = ? AND status = 'ready' AND assignee != ''"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut dispatched = Vec::new();

    for (task_id, title, assignee, priority) in tasks {
        let existing: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM task_dispatches WHERE task_id = ? AND role_id = ? AND status = 'sent'"
        )
        .bind(&task_id)
        .bind(&assignee)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        if existing.is_some() {
            continue;
        }

        let dispatch_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO task_dispatches (id, task_id, role_id, dispatch_type, message, status, created_at) VALUES (?, ?, ?, 'auto', '', 'sent', ?)"
        )
        .bind(&dispatch_id)
        .bind(&task_id)
        .bind(&assignee)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query(
            "UPDATE project_tasks SET status = 'running', started_at = COALESCE(started_at, ?), claim_lock = ?, claim_expire_at = ?, updated_at = ? WHERE id = ?"
        )
        .bind(now)
        .bind(&assignee)
        .bind(now + 30 * 60 * 1000)
        .bind(now)
        .bind(&task_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let _ = record_activity(&app, &project_id, Some(&assignee), "task_auto_dispatched", Some("task"), Some(&task_id), &format!("自动派发任务：{}", title)).await;

        let body: Option<(String,)> = sqlx::query_as(
            "SELECT body FROM project_tasks WHERE id = ?"
        )
        .bind(&task_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut task_message = format!("你被自动分配了一个任务：\n**任务标题**：{}\n**优先级**：{}", title, match priority {
            p if p >= 3 => "高",
            p if p >= 2 => "中",
            _ => "低",
        });
        if let Some((b,)) = &body {
            if !b.is_empty() {
                task_message.push_str(&format!("\n**任务描述**：{}", b));
            }
        }

        let event_id = format!("task_auto_dispatch_{}_{}", task_id, now);
        let app_clone = app.clone();
        let project_id_clone = project_id.clone();
        let assignee_clone = assignee.clone();
        tauri::async_runtime::spawn(async move {
            let _ = crate::commands::project::chat_with_project_roles(
                app_clone, project_id_clone, vec![assignee_clone], task_message, event_id,
            ).await;
        });

        let _ = app.emit("task_dispatched", serde_json::json!({
            "taskId": task_id,
            "roleId": assignee,
            "dispatchId": dispatch_id,
            "dispatchType": "auto",
        }));

        if is_workflow_start_role(&pool, &project_id, &assignee).await {
            let app_wf = app.clone();
            let project_id_wf = project_id.clone();
            let assignee_wf = assignee.clone();
            tauri::async_runtime::spawn(async move {
                let _ = trigger_workflow_execution(
                    app_wf, project_id_wf, assignee_wf, None, None, Some(true),
                ).await;
            });
        }

        dispatched.push(task_id);
    }

    Ok(dispatched)
}

#[tauri::command]
pub async fn list_projects(app: AppHandle) -> Result<Vec<db::Project>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, db::Project>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at FROM projects ORDER BY is_favorite DESC, updated_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub async fn create_project(app: AppHandle, req: db::CreateProjectRequest) -> Result<db::Project, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let workspace_root: Option<String> = sqlx::query_scalar("SELECT value FROM app_config WHERE key = 'workspace_root'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let workspace_root = workspace_root.unwrap_or_else(|| {
        dirs::home_dir()
            .map(|h| h.join("hermes-workspace").to_string_lossy().to_string())
            .unwrap_or_else(|| "./hermes-workspace".to_string())
    });

    let slug: String = req.name
        .chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else if c == ' ' || c == '-' { '-' } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    let workspace_path = format!("{}/{}", workspace_root.trim_end_matches('/'), slug);

    let _ = std::fs::create_dir_all(&workspace_path);

    let description = req.description.unwrap_or_default();
    let icon = req.icon.unwrap_or_default();
    let cover_image = req.cover_image.unwrap_or_default();
    let project_rule = req.project_rule.unwrap_or_default();
    let project_guidelines = req.project_guidelines.unwrap_or_default();
    let office_theme = req.office_theme.unwrap_or_default();
    let office_layout = req.office_layout.unwrap_or_default();

    sqlx::query("INSERT INTO projects (id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'none', ?, 0, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.name)
        .bind(&description)
        .bind(&workspace_path)
        .bind(&icon)
        .bind(&cover_image)
        .bind(&project_rule)
        .bind(&project_guidelines)
        .bind(&office_theme)
        .bind(&office_layout)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::Project {
        id, name: req.name, description, workspace_path, status: "active".to_string(), tag: "none".to_string(), icon, is_favorite: 0, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_project(app: AppHandle, req: db::UpdateProjectRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let project: db::Project = sqlx::query_as::<_, db::Project>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at FROM projects WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let name = req.name.unwrap_or(project.name);
    let description = req.description.unwrap_or(project.description);
    let status = req.status.unwrap_or(project.status);
    let tag = req.tag.unwrap_or(project.tag);
    let icon = req.icon.unwrap_or(project.icon);
    let is_favorite = req.is_favorite.map(|v| if v { 1i64 } else { 0i64 }).unwrap_or(project.is_favorite);
    let cover_image = req.cover_image.unwrap_or(project.cover_image);
    let project_rule = req.project_rule.unwrap_or(project.project_rule);
    let project_guidelines = req.project_guidelines.unwrap_or(project.project_guidelines);
    let office_theme = req.office_theme.unwrap_or(project.office_theme);
    let office_layout = req.office_layout.unwrap_or(project.office_layout);

    sqlx::query("UPDATE projects SET name = ?, description = ?, status = ?, tag = ?, icon = ?, is_favorite = ?, cover_image = ?, project_rule = ?, project_guidelines = ?, office_theme = ?, office_layout = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(&description)
        .bind(&status)
        .bind(&tag)
        .bind(&icon)
        .bind(is_favorite)
        .bind(&cover_image)
        .bind(&project_rule)
        .bind(&project_guidelines)
        .bind(&office_theme)
        .bind(&office_layout)
        .bind(now)
        .bind(&req.id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_project(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_tasks WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_messages WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_artifacts WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_workflows WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_members WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_project_members(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectMember>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64, i64)>(
        "SELECT id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at FROM project_members WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at)| db::ProjectMember {
        id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn add_project_member(app: AppHandle, req: db::CreateProjectMemberRequest) -> Result<db::ProjectMember, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM project_members WHERE project_id = ?")
        .bind(&req.project_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(0) + 1;

    let profile_name = req.profile_name.unwrap_or_default();
    let custom_soul = req.custom_soul.unwrap_or_default();
    let custom_responsibilities = req.custom_responsibilities.unwrap_or_default();
    let equipment_level = req.equipment_level.unwrap_or(1);

    sqlx::query("INSERT INTO project_members (id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&profile_name)
        .bind(&custom_soul)
        .bind(&custom_responsibilities)
        .bind(equipment_level)
        .bind(sort_order)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let role: Option<(String,)> = sqlx::query_as::<_, (String,)>(
        "SELECT name FROM ai_roles WHERE id = ?"
    )
    .bind(&req.role_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some((role_name,)) = role {
        let artifact_id = uuid::Uuid::new_v4().to_string();
        let artifact_title = format!("{} - 产出物", role_name);
        let _ = sqlx::query(
            "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at) VALUES (?, ?, ?, '', 'auto', ?, '', '', 'pending', '', ?, ?)"
        )
        .bind(&artifact_id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&artifact_title)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await;
    }

    let _ = record_activity(&app, &req.project_id, Some(&req.role_id), "member_added", Some("member"), Some(&id), "加入了项目").await;

    Ok(db::ProjectMember {
        id: id.clone(), project_id: req.project_id.clone(), role_id: req.role_id.clone(), profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn remove_project_member(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    let member: Option<(String, String, String)> = sqlx::query_as(
        "SELECT id, project_id, role_id FROM project_members WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (member_id, project_id, role_id) = member.ok_or("Member not found")?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_artifacts WHERE project_id = ? AND role_id = ?")
        .bind(&project_id)
        .bind(&role_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_workflows WHERE project_id = ? AND (from_role_id = ? OR to_role_id = ?)")
        .bind(&project_id)
        .bind(&role_id)
        .bind(&role_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_messages WHERE project_id = ? AND role_id = ?")
        .bind(&project_id)
        .bind(&role_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_members WHERE id = ?")
        .bind(&member_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = record_activity(&app, &project_id, Some(&role_id), "member_removed", Some("member"), Some(&id), "离开了项目").await;

    Ok(())
}

#[tauri::command]
pub async fn update_member_equipment(app: AppHandle, member_id: String, equipment_level: i64) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE project_members SET equipment_level = ?, updated_at = ? WHERE id = ?")
        .bind(equipment_level)
        .bind(now)
        .bind(&member_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn export_project(app: AppHandle, project_id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let project: Option<db::Project> = sqlx::query_as::<_, db::Project>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let p = project.ok_or("Project not found")?;

    let members: Vec<db::ProjectMember> = {
        let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64, i64)>(
            "SELECT id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at FROM project_members WHERE project_id = ? ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at)| db::ProjectMember {
            id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at,
        }).collect()
    };

    let workflows: Vec<db::ProjectWorkflow> = {
        let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, i64, i64)>(
            "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at)| db::ProjectWorkflow {
            id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at,
        }).collect()
    };

    Ok(serde_json::json!({
        "version": 1,
        "project": {
            "name": p.name,
            "description": p.description,
            "status": p.status,
            "tag": p.tag,
            "icon": p.icon,
            "projectRule": p.project_rule,
            "projectGuidelines": p.project_guidelines,
            "officeTheme": p.office_theme,
            "officeLayout": p.office_layout,
        },
        "members": members.iter().map(|m| serde_json::json!({
            "roleId": m.role_id,
            "profileName": m.profile_name,
            "customSoul": m.custom_soul,
            "customResponsibilities": m.custom_responsibilities,
            "equipmentLevel": m.equipment_level,
            "sortOrder": m.sort_order,
        })).collect::<Vec<_>>(),
        "workflows": workflows.iter().map(|w| serde_json::json!({
            "fromRoleId": w.from_role_id,
            "toRoleId": w.to_role_id,
            "artifactType": w.artifact_type,
            "transitionType": w.transition_type,
            "sortOrder": w.sort_order,
        })).collect::<Vec<_>>(),
    }))
}

#[tauri::command]
pub async fn import_project(app: AppHandle, data: serde_json::Value) -> Result<db::Project, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let name = data["project"]["name"].as_str().unwrap_or("导入项目").to_string();
    let description = data["project"]["description"].as_str().unwrap_or("").to_string();
    let status = data["project"]["status"].as_str().unwrap_or("active").to_string();
    let tag = data["project"]["tag"].as_str().unwrap_or("none").to_string();
    let icon = data["project"]["icon"].as_str().unwrap_or("💼").to_string();
    let project_rule = data["project"]["projectRule"].as_str().unwrap_or("").to_string();
    let project_guidelines = data["project"]["projectGuidelines"].as_str().unwrap_or("").to_string();
    let office_theme = data["project"]["officeTheme"].as_str().unwrap_or("cozy").to_string();
    let office_layout = data["project"]["officeLayout"].as_str().unwrap_or("").to_string();

    let slug: String = name.chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else if c == ' ' || c == '-' { '-' } else { '-' })
        .collect::<String>()
        .split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join("-");
    let workspace_path = format!("{}/{}", dirs::home_dir().map(|h| h.join("hermes-workspace").to_string_lossy().to_string()).unwrap_or_else(|| "./hermes-workspace".to_string()).trim_end_matches('/'), slug);
    let _ = std::fs::create_dir_all(&workspace_path);

    sqlx::query("INSERT INTO projects (id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, '', ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&name)
        .bind(&description)
        .bind(&workspace_path)
        .bind(&status)
        .bind(&tag)
        .bind(&icon)
        .bind(&project_rule)
        .bind(&project_guidelines)
        .bind(&office_theme)
        .bind(&office_layout)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(members) = data["members"].as_array() {
        for (idx, m) in members.iter().enumerate() {
            let mid = uuid::Uuid::new_v4().to_string();
            let role_id = m["roleId"].as_str().unwrap_or("").to_string();
            let profile_name = m["profileName"].as_str().unwrap_or("").to_string();
            let custom_soul = m["customSoul"].as_str().unwrap_or("").to_string();
            let custom_responsibilities = m["customResponsibilities"].as_str().unwrap_or("").to_string();
            let equipment_level = m["equipmentLevel"].as_i64().unwrap_or(1);
            let sort_order = m["sortOrder"].as_i64().unwrap_or(idx as i64);

            sqlx::query("INSERT INTO project_members (id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(&mid)
                .bind(&id)
                .bind(&role_id)
                .bind(&profile_name)
                .bind(&custom_soul)
                .bind(&custom_responsibilities)
                .bind(equipment_level)
                .bind(sort_order)
                .bind(now)
                .bind(now)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    if let Some(workflows) = data["workflows"].as_array() {
        for (idx, w) in workflows.iter().enumerate() {
            let wid = uuid::Uuid::new_v4().to_string();
            let from_role_id = w["fromRoleId"].as_str().map(|s| s.to_string());
            let to_role_id = w["toRoleId"].as_str().unwrap_or("").to_string();
            let artifact_type = w["artifactType"].as_str().unwrap_or("").to_string();
            let transition_type = w["transitionType"].as_str().unwrap_or("auto_push").to_string();
            let task_id = w["taskId"].as_str().unwrap_or("").to_string();
            let condition_expr = w["conditionExpr"].as_str().unwrap_or("").to_string();
            let branch_label = w["branchLabel"].as_str().unwrap_or("").to_string();
            let parallel_group = w["parallelGroup"].as_str().unwrap_or("").to_string();
            let sort_order = w["sortOrder"].as_i64().unwrap_or(idx as i64);

            sqlx::query("INSERT INTO project_workflows (id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(&wid)
                .bind(&id)
                .bind(&from_role_id)
                .bind(&to_role_id)
                .bind(&artifact_type)
                .bind(&transition_type)
                .bind(&task_id)
                .bind(&condition_expr)
                .bind(&branch_label)
                .bind(&parallel_group)
                .bind(sort_order)
                .bind(now)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(db::Project {
        id, name, description, workspace_path, status, tag, icon, is_favorite: 0, cover_image: String::new(), project_rule, project_guidelines, office_theme, office_layout, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn list_project_workflows(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectWorkflow>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, i64, i64)>(
        "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at)| db::ProjectWorkflow {
        id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at,
    }).collect())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowExecutionResult {
    pub triggered_workflows: Vec<TriggeredWorkflow>,
    pub pending_approvals: Vec<PendingApproval>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TriggeredWorkflow {
    pub to_role_id: String,
    pub to_role_name: String,
    pub artifact_type: String,
    pub transition_type: String,
    pub artifact_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingApproval {
    pub artifact_id: String,
    pub from_role_id: String,
    pub to_role_id: String,
    pub artifact_type: String,
}

#[tauri::command]
pub async fn trigger_workflow_execution(app: AppHandle, project_id: String, from_role_id: String, artifact_type: Option<String>, condition_result: Option<String>, skip_need_confirm: Option<bool>) -> Result<WorkflowExecutionResult, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let should_skip_need_confirm = skip_need_confirm.unwrap_or(false);
    // When from_role_id is empty, it represents the start node (initial trigger)
    let is_start_trigger = from_role_id.is_empty();
    log::info!("trigger_workflow_execution: project_id={}, from_role_id={}, is_start_trigger={}, artifact_type={:?}, skip_need_confirm={}", project_id, from_role_id, is_start_trigger, artifact_type, should_skip_need_confirm);

    // Build query based on the trigger type:
    // - Start trigger (empty from_role_id): only match workflows where from_role_id is empty/NULL (start transitions)
    // - Normal role trigger: only match workflows from this role (do NOT re-match start transitions)
    let mut query_str = String::from("SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at FROM project_workflows WHERE project_id = ?");
    if is_start_trigger {
        query_str.push_str(" AND (from_role_id = '' OR from_role_id IS NULL)");
    } else {
        query_str.push_str(" AND from_role_id = ?");
    }
    let mut bind_artifact: Option<String> = None;
    if artifact_type.is_some() {
        query_str.push_str(" AND artifact_type = ?");
        bind_artifact = artifact_type.clone();
    }
    query_str.push_str(" ORDER BY sort_order ASC");
    log::info!("trigger_workflow_execution: query={}", query_str);

    let mut q = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, i64, i64)>(&query_str)
        .bind(&project_id);
    if !is_start_trigger {
        q = q.bind(&from_role_id);
    }
    if let Some(ref at) = bind_artifact {
        q = q.bind(at);
    }

    let workflows = q.fetch_all(&pool).await.map_err(|e| e.to_string())?;

    let mut triggered = Vec::new();
    let mut pending = Vec::new();

    let condition_workflows: Vec<_> = workflows.iter()
        .filter(|(_, _, _, _, _, transition_type, _, condition_expr, _, _, _, _)| {
            transition_type == "condition" && !condition_expr.is_empty()
        })
        .collect();

    let parallel_workflows: Vec<_> = workflows.iter()
        .filter(|(_, _, _, _, _, transition_type, _, _, _, parallel_group, _, _)| {
            transition_type == "parallel" && !parallel_group.is_empty()
        })
        .collect();

    let condition_or_parallel_ids: std::collections::HashSet<String> = condition_workflows.iter()
        .chain(parallel_workflows.iter())
        .map(|(id, _, _, _, _, _, _, _, _, _, _, _)| id.clone())
        .collect();

    for (_id, _project_id, _from_role_id, to_role_id, wf_artifact_type, transition_type, task_id, _condition_expr, _branch_label, _parallel_group, _sort_order, _created_at) in &workflows {
        if condition_or_parallel_ids.contains(_id) {
            continue;
        }

        let to_role: Option<(String, String)> = sqlx::query_as(
            "SELECT name, nickname FROM ai_roles WHERE id = ?"
        )
        .bind(to_role_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let to_role_name = to_role.as_ref()
            .map(|(name, nickname)| {
                if nickname.is_empty() { name.clone() } else { nickname.clone() }
            })
            .unwrap_or_else(|| to_role_id.clone());

        if !task_id.is_empty() {
            let task_title: Option<String> = sqlx::query_scalar(
                "SELECT title FROM project_tasks WHERE id = ?"
            )
            .bind(task_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

            if let Some(title) = task_title {
                let existing_dispatch: Option<(String,)> = sqlx::query_as(
                    "SELECT id FROM task_dispatches WHERE task_id = ? AND role_id = ? AND status = 'sent'"
                )
                .bind(task_id)
                .bind(to_role_id)
                .fetch_optional(&pool)
                .await
                .map_err(|e| e.to_string())?;

                if existing_dispatch.is_none() {
                    let dispatch_id = uuid::Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO task_dispatches (id, task_id, role_id, dispatch_type, message, status, created_at) VALUES (?, ?, ?, 'workflow', '', 'sent', ?)"
                    )
                    .bind(&dispatch_id)
                    .bind(task_id)
                    .bind(to_role_id)
                    .bind(now)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                    sqlx::query(
                        "UPDATE project_tasks SET status = 'ready', started_at = COALESCE(started_at, ?), claim_lock = ?, claim_expire_at = ?, updated_at = ? WHERE id = ?"
                    )
                    .bind(now)
                    .bind(to_role_id)
                    .bind(now + 30 * 60 * 1000)
                    .bind(now)
                    .bind(task_id)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                    let _ = record_activity(&app, &project_id, Some(to_role_id), "task_workflow_dispatched", Some("task"), Some(task_id), &format!("工作流驱动派发任务：{}", title)).await;
                }
            }
        }

        // Check for existing artifact to avoid duplicates
        // Look for both in_progress and pending artifacts
        let existing_artifact: Option<(String, String)> = sqlx::query_as(
            "SELECT id, status FROM project_artifacts WHERE project_id = ? AND role_id = ? AND artifact_type = ? AND status IN ('in_progress', 'pending')"
        )
        .bind(&project_id)
        .bind(to_role_id)
        .bind(wf_artifact_type)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some((existing_id, existing_status)) = existing_artifact {
            if existing_status == "pending" && !should_skip_need_confirm && transition_type == "need_confirm" {
                // Pending artifact exists and this is an approval trigger - activate it
                sqlx::query("UPDATE project_artifacts SET status = 'in_progress', updated_at = ? WHERE id = ?")
                    .bind(now)
                    .bind(&existing_id)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                log::info!("trigger_workflow_execution: activated pending artifact {} for role={}, artifact_type={}", existing_id, to_role_id, wf_artifact_type);

                triggered.push(TriggeredWorkflow {
                    to_role_id: to_role_id.clone(),
                    to_role_name,
                    artifact_type: wf_artifact_type.clone(),
                    transition_type: transition_type.clone(),
                    artifact_id: existing_id,
                });
            } else {
                log::info!("trigger_workflow_execution: skipping artifact creation for role={}, artifact_type={} (already exists, status={})", to_role_id, wf_artifact_type, existing_status);
                if existing_status == "in_progress" {
                    triggered.push(TriggeredWorkflow {
                        to_role_id: to_role_id.clone(),
                        to_role_name,
                        artifact_type: wf_artifact_type.clone(),
                        transition_type: transition_type.clone(),
                        artifact_id: existing_id,
                    });
                }
            }
            continue;
        }

        let new_artifact_id = uuid::Uuid::new_v4().to_string();
        let artifact_title = format!("{} - {}", wf_artifact_type, to_role_name);

        match transition_type.as_str() {
            "auto_push" => {
                sqlx::query(
                    "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, '', '', 'in_progress', '', ?, ?)"
                )
                .bind(&new_artifact_id)
                .bind(&project_id)
                .bind(to_role_id)
                .bind(wf_artifact_type)
                .bind(&artifact_title)
                .bind(now)
                .bind(now)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

                triggered.push(TriggeredWorkflow {
                    to_role_id: to_role_id.clone(),
                    to_role_name,
                    artifact_type: wf_artifact_type.clone(),
                    transition_type: transition_type.clone(),
                    artifact_id: new_artifact_id,
                });
            }
            "need_confirm" => {
                if should_skip_need_confirm {
                    // Auto-push event: create pending artifact, do NOT trigger downstream work
                    // Downstream will start working only after user approves the upstream artifact
                    sqlx::query(
                        "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, '', '', 'pending', '', ?, ?)"
                    )
                    .bind(&new_artifact_id)
                    .bind(&project_id)
                    .bind(to_role_id)
                    .bind(wf_artifact_type)
                    .bind(&artifact_title)
                    .bind(now)
                    .bind(now)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                    pending.push(PendingApproval {
                        artifact_id: new_artifact_id,
                        from_role_id: from_role_id.clone(),
                        to_role_id: to_role_id.clone(),
                        artifact_type: wf_artifact_type.clone(),
                    });
                } else {
                    // Approval event: upstream approved, downstream can start working
                    sqlx::query(
                        "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, '', '', 'in_progress', '', ?, ?)"
                    )
                    .bind(&new_artifact_id)
                    .bind(&project_id)
                    .bind(to_role_id)
                    .bind(wf_artifact_type)
                    .bind(&artifact_title)
                    .bind(now)
                    .bind(now)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                    triggered.push(TriggeredWorkflow {
                        to_role_id: to_role_id.clone(),
                        to_role_name: to_role_name.clone(),
                        artifact_type: wf_artifact_type.clone(),
                        transition_type: "need_confirm".to_string(),
                        artifact_id: new_artifact_id.clone(),
                    });
                }
            }
            _ => {}
        }
    }

    if !condition_workflows.is_empty() {
        let chosen_branch = condition_result.as_deref().unwrap_or("yes");
        for (_id, _project_id, _from_role_id, to_role_id, wf_artifact_type, _transition_type, task_id, _condition_expr, branch_label, _parallel_group, _sort_order, _created_at) in &condition_workflows {
            if branch_label != chosen_branch {
                continue;
            }

            let to_role: Option<(String, String)> = sqlx::query_as(
                "SELECT name, nickname FROM ai_roles WHERE id = ?"
            )
            .bind(to_role_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

            let to_role_name = to_role.as_ref()
                .map(|(name, nickname)| if nickname.is_empty() { name.clone() } else { nickname.clone() })
                .unwrap_or_else(|| to_role_id.clone());

            if !task_id.is_empty() {
                let dispatch_id = uuid::Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO task_dispatches (id, task_id, role_id, dispatch_type, message, status, created_at) VALUES (?, ?, ?, 'workflow', '', 'sent', ?)"
                )
                .bind(&dispatch_id)
                .bind(task_id)
                .bind(to_role_id)
                .bind(now)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

                let _ = record_activity(&app, &project_id, Some(to_role_id), "condition_branch_taken", Some("workflow"), None, &format!("条件分支 [{}] → {}", branch_label, to_role_name)).await;
            }

            let new_artifact_id = uuid::Uuid::new_v4().to_string();
            let artifact_title = format!("{} - {}", wf_artifact_type, to_role_name);

            sqlx::query(
                "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, '', '', 'in_progress', '', ?, ?)"
            )
            .bind(&new_artifact_id)
            .bind(&project_id)
            .bind(to_role_id)
            .bind(wf_artifact_type)
            .bind(&artifact_title)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

            triggered.push(TriggeredWorkflow {
                to_role_id: to_role_id.clone(),
                to_role_name,
                artifact_type: wf_artifact_type.clone(),
                transition_type: "condition".to_string(),
                artifact_id: new_artifact_id,
            });
        }
    }

    if !parallel_workflows.is_empty() {
        let mut parallel_groups: std::collections::HashMap<String, Vec<_>> = std::collections::HashMap::new();
        for wf in &parallel_workflows {
            let (_, _, _, _, _, _, _, _, _, parallel_group, _, _) = wf;
            parallel_groups.entry(parallel_group.clone()).or_default().push(wf);
        }

        for (_group_key, group_workflows) in parallel_groups {
            for (_id, _project_id, _from_role_id, to_role_id, wf_artifact_type, _transition_type, task_id, _condition_expr, _branch_label, _parallel_group, _sort_order, _created_at) in group_workflows {
                let to_role: Option<(String, String)> = sqlx::query_as(
                    "SELECT name, nickname FROM ai_roles WHERE id = ?"
                )
                .bind(to_role_id)
                .fetch_optional(&pool)
                .await
                .map_err(|e| e.to_string())?;

                let to_role_name = to_role.as_ref()
                    .map(|(name, nickname)| if nickname.is_empty() { name.clone() } else { nickname.clone() })
                    .unwrap_or_else(|| to_role_id.clone());

                if !task_id.is_empty() {
                    let dispatch_id = uuid::Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO task_dispatches (id, task_id, role_id, dispatch_type, message, status, created_at) VALUES (?, ?, ?, 'workflow', '', 'sent', ?)"
                    )
                    .bind(&dispatch_id)
                    .bind(task_id)
                    .bind(to_role_id)
                    .bind(now)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                    let _ = record_activity(&app, &project_id, Some(to_role_id), "parallel_branch_triggered", Some("workflow"), None, &format!("并行分支触发 → {}", to_role_name)).await;
                }

                let new_artifact_id = uuid::Uuid::new_v4().to_string();
                let artifact_title = format!("{} - {}", wf_artifact_type, to_role_name);

                sqlx::query(
                    "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, '', '', 'in_progress', '', ?, ?)"
                )
                .bind(&new_artifact_id)
                .bind(&project_id)
                .bind(to_role_id)
                .bind(wf_artifact_type)
                .bind(&artifact_title)
                .bind(now)
                .bind(now)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

                triggered.push(TriggeredWorkflow {
                    to_role_id: to_role_id.clone(),
                    to_role_name,
                    artifact_type: wf_artifact_type.clone(),
                    transition_type: "parallel".to_string(),
                    artifact_id: new_artifact_id,
                });
            }
        }
    }

    if !triggered.is_empty() {
        let app_notify = app.clone();
        let project_id_notify = project_id.clone();
        let from_role_id_notify = from_role_id.clone();
        let triggered_clone = triggered.clone();
        let skip_delegate = is_start_trigger; // Skip auto_delegate_chat for start triggers - do_dispatch_task handles initial delegation
        tauri::async_runtime::spawn(async move {
            if skip_delegate {
                log::info!("trigger_workflow_execution: skipping auto_delegate_chat for start trigger, {} workflows triggered", triggered_clone.len());
            } else {
                for tw in triggered_clone {
                    let context_msg = if tw.transition_type == "need_confirm" {
                        format!(
                            "工作流审批节点：你需要完成「{}」产物，完成后将提交审批。请基于上游产出开始你的工作。",
                            tw.artifact_type
                        )
                    } else {
                        format!(
                            "工作流自动流转：产物「{}」已从上游交付，请基于上游产出开始你的工作。",
                            tw.artifact_type
                        )
                    };
                    let event_id = format!("wf_notify_{}_{}", project_id_notify, tw.artifact_id);
                    let _ = crate::commands::project::auto_delegate_chat(
                        app_notify.clone(),
                        project_id_notify.clone(),
                        from_role_id_notify.clone(),
                        tw.to_role_id.clone(),
                        context_msg,
                        event_id,
                    ).await;
                }
            }
        });
    }

    Ok(WorkflowExecutionResult {
        triggered_workflows: triggered,
        pending_approvals: pending,
    })
}

#[tauri::command]
pub async fn add_project_workflow(app: AppHandle, req: db::CreateProjectWorkflowRequest) -> Result<db::ProjectWorkflow, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM project_workflows WHERE project_id = ?")
        .bind(&req.project_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(0) + 1;

    let artifact_type = req.artifact_type.unwrap_or_default();
    let transition_type = req.transition_type.unwrap_or("auto_push".to_string());
    let task_id = req.task_id.unwrap_or_default();
    let condition_expr = req.condition_expr.unwrap_or_default();
    let branch_label = req.branch_label.unwrap_or_default();
    let parallel_group = req.parallel_group.unwrap_or_default();

    sqlx::query("INSERT INTO project_workflows (id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.from_role_id)
        .bind(&req.to_role_id)
        .bind(&artifact_type)
        .bind(&transition_type)
        .bind(&task_id)
        .bind(&condition_expr)
        .bind(&branch_label)
        .bind(&parallel_group)
        .bind(sort_order)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectWorkflow {
        id, project_id: req.project_id, from_role_id: req.from_role_id, to_role_id: req.to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at: now,
    })
}

#[tauri::command]
pub async fn remove_project_workflow(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM project_workflows WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn sync_workflow_to_file(app: AppHandle, project_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let workflows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String, i64, i64)>(
        "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let project: Option<(String, String, String, String)> = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id, name, description, workspace_path FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let workspace_path = project.map(|p| p.3).unwrap_or_default();
    if workspace_path.is_empty() {
        return Err("Project workspace path not set".to_string());
    }

    let config_dir = std::path::PathBuf::from(&workspace_path).join(".hermes");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let config_path = config_dir.join("workflow.json");
    let workflow_data: Vec<serde_json::Value> = workflows.iter().map(|(id, pid, from, to, artifact, trans, task_id, cond_expr, br_label, par_group, sort, created)| {
        serde_json::json!({
            "id": id,
            "projectId": pid,
            "fromRoleId": from,
            "toRoleId": to,
            "artifactType": artifact,
            "transitionType": trans,
            "taskId": task_id,
            "conditionExpr": cond_expr,
            "branchLabel": br_label,
            "parallelGroup": par_group,
            "sortOrder": sort,
            "createdAt": created,
        })
    }).collect();

    let config = serde_json::json!({
        "version": "1.0",
        "projectId": project_id,
        "workflows": workflow_data,
        "updatedAt": chrono::Utc::now().to_rfc3339(),
    });

    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn load_workflow_from_file(app: AppHandle, project_id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;
    let project: Option<(String, String, String, String)> = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id, name, description, workspace_path FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let workspace_path = project.map(|p| p.3).unwrap_or_default();
    if workspace_path.is_empty() {
        return Err("Project workspace path not set".to_string());
    }

    let config_path = std::path::PathBuf::from(&workspace_path).join(".hermes").join("workflow.json");
    if !config_path.exists() {
        return Ok(serde_json::json!({ "workflows": [] }));
    }

    let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(value)
}

#[tauri::command]
pub async fn list_project_artifacts(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectArtifact>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String, i64, i64)>(
        "SELECT id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at FROM project_artifacts WHERE project_id = ? ORDER BY created_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at)| db::ProjectArtifact {
        id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_project_artifact(app: AppHandle, req: db::CreateProjectArtifactRequest) -> Result<db::ProjectArtifact, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let task_id = req.task_id.unwrap_or_default();
    let artifact_type = req.artifact_type.unwrap_or_default();
    let title = req.title.unwrap_or_default();
    let file_path = req.file_path.unwrap_or_default();
    let content = req.content.unwrap_or_default();
    let status = req.status.unwrap_or("draft".to_string());

    sqlx::query("INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&task_id)
        .bind(&artifact_type)
        .bind(&title)
        .bind(&file_path)
        .bind(&content)
        .bind(&status)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = record_activity(&app, &req.project_id, Some(&req.role_id), "artifact_submitted", Some("artifact"), Some(&id), &format!("提交了产物：{}", if title.is_empty() { artifact_type.clone() } else { title.clone() })).await;

    Ok(db::ProjectArtifact {
        id, project_id: req.project_id, role_id: req.role_id, task_id, artifact_type, title, file_path, content, status, review_comment: String::new(), created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_project_artifact_status(app: AppHandle, id: String, status: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE project_artifacts SET status = ?, updated_at = ? WHERE id = ?")
        .bind(&status)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn approve_project_artifact(app: AppHandle, id: String, comment: Option<String>) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    let review_comment = comment.unwrap_or_default();
    sqlx::query("UPDATE project_artifacts SET status = 'approved', review_comment = ?, updated_at = ? WHERE id = ?")
        .bind(&review_comment)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let (project_id, title, role_id, artifact_type): (String, String, String, String) = sqlx::query_as(
        "SELECT project_id, title, role_id, artifact_type FROM project_artifacts WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .unwrap_or((String::new(), String::new(), String::new(), String::new()));
    let _ = record_activity(&app, &project_id, Some(&role_id), "artifact_approved", Some("artifact"), Some(&id), &format!("审批通过了产物：{}", title)).await;

    // Advance workflow_run_steps from pending_approval to running for this role
    if !project_id.is_empty() && !role_id.is_empty() {
        {
            let pool_step = match get_pool(&app) {
                Ok(p) => p,
                Err(_) => {
                    log::error!("approve_project_artifact: failed to get pool for step advancement");
                    return Ok(());
                }
            };
            let now_step = chrono::Utc::now().timestamp_millis();
            let pending_steps: Vec<(String, i64)> = sqlx::query_as(
                "SELECT wr.id, wrs.step_index FROM workflow_runs wr \
                 JOIN workflow_run_steps wrs ON wr.id = wrs.run_id \
                 WHERE wr.project_id = ? AND wr.status = 'running' \
                 AND wrs.status = 'pending_approval' \
                 AND wrs.step_index = ( \
                    SELECT MIN(wrs2.step_index) FROM workflow_run_steps wrs2 \
                    WHERE wrs2.run_id = wr.id AND wrs2.status = 'pending_approval' \
                 )"
            )
            .bind(&project_id)
            .fetch_all(&pool_step)
            .await
            .unwrap_or_default();

            for (run_id, step_index) in &pending_steps {
                let _ = sqlx::query(
                    "UPDATE workflow_run_steps SET status = 'running', started_at = COALESCE(started_at, ?) WHERE run_id = ? AND step_index = ? AND status = 'pending_approval'"
                )
                .bind(now_step)
                .bind(run_id)
                .bind(step_index)
                .execute(&pool_step)
                .await;
                log::info!("approve_project_artifact: advanced step {}/{} from pending_approval to running", step_index, run_id);
            }
        }

        let app_wf = app.clone();
        let project_id_wf = project_id.clone();
        let role_id_wf = role_id.clone();
        tauri::async_runtime::spawn(async move {
            log::info!("approve_project_artifact: triggering workflow for project_id={}, from_role_id={}", project_id_wf, role_id_wf);
            match trigger_workflow_execution(
                app_wf, project_id_wf, role_id_wf, None, None, None,
            ).await {
                Ok(result) => log::info!("approve_project_artifact: triggered={}, pending={}", result.triggered_workflows.len(), result.pending_approvals.len()),
                Err(e) => log::error!("approve_project_artifact: workflow trigger error={}", e),
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn reject_project_artifact(app: AppHandle, id: String, reason: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    // Get artifact info before update
    let artifact_info: Option<(String, String, String, String, String)> = sqlx::query_as(
        "SELECT project_id, role_id, artifact_type, title, run_step_id FROM project_artifacts WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE project_artifacts SET status = 'rejected', review_comment = ?, updated_at = ? WHERE id = ?")
        .bind(&reason)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some((art_project_id, art_role_id, art_type, art_title, art_run_step_id)) = artifact_info {
        let _ = record_activity(&app, &art_project_id, Some(&art_role_id), "artifact_rejected", Some("artifact"), Some(&id), &format!("打回了产物：{}，原因：{}", art_title, reason)).await;

        if !art_project_id.is_empty() && !art_role_id.is_empty() {
            // Create a new in_progress artifact for the role to rework
            let new_artifact_id = uuid::Uuid::new_v4().to_string();
            let retry_title = format!("{} - 修改稿", art_title);
            sqlx::query(
                "INSERT INTO project_artifacts (id, project_id, role_id, artifact_type, title, content, status, run_step_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', 'in_progress', ?, ?, ?)"
            )
            .bind(&new_artifact_id)
            .bind(&art_project_id)
            .bind(&art_role_id)
            .bind(&art_type)
            .bind(&retry_title)
            .bind(&art_run_step_id)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

            // Notify the AI role to rework based on the rejection reason
            let app_notify = app.clone();
            let notify_project_id = art_project_id.clone();
            let notify_role_id = art_role_id.clone();
            let notify_title = art_title.clone();
            let notify_reason = reason.clone();
            let notify_artifact_id = new_artifact_id.clone();
            tauri::async_runtime::spawn(async move {
                let context_msg = format!(
                    "你的产物「{}」已被驳回，原因：{}\n请根据驳回意见修改完善，然后重新提交。",
                    notify_title, notify_reason
                );
                let event_id = format!("reject_retry_{}_{}", notify_project_id, notify_artifact_id);
                let _ = crate::commands::project::auto_delegate_chat(
                    app_notify,
                    notify_project_id,
                    "builtin_user".to_string(),
                    notify_role_id,
                    context_msg,
                    event_id,
                ).await;
            });

            // Emit event for frontend refresh
            let _ = app.emit("artifact-rejected", serde_json::json!({
                "artifact_id": id,
                "project_id": art_project_id,
                "role_id": art_role_id,
                "new_artifact_id": new_artifact_id,
            }));
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn list_project_messages(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectMessage>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, i64, i64, i64)>(
        "SELECT id, project_id, role_id, content, message_type, prompt_tokens, completion_tokens, created_at FROM project_messages WHERE project_id = ? ORDER BY created_at ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, content, message_type, prompt_tokens, completion_tokens, created_at)| db::ProjectMessage {
        id, project_id, role_id, content, message_type, prompt_tokens, completion_tokens, created_at,
    }).collect())
}

#[tauri::command]
pub async fn create_project_message(app: AppHandle, req: db::CreateProjectMessageRequest) -> Result<db::ProjectMessage, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let message_type = req.message_type.unwrap_or_else(|| "text".to_string());

    sqlx::query("INSERT INTO project_messages (id, project_id, role_id, content, message_type, prompt_tokens, completion_tokens, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&req.content)
        .bind(&message_type)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let content_preview = if req.content.len() > 50 { &req.content[..50] } else { &req.content };
    let _ = record_activity(&app, &req.project_id, Some(&req.role_id), "message_sent", Some("message"), Some(&id), &format!("发送了消息：{}...", content_preview)).await;

    Ok(db::ProjectMessage {
        id, project_id: req.project_id, role_id: req.role_id, content: req.content, message_type, prompt_tokens: 0, completion_tokens: 0, created_at: now,
    })
}

#[tauri::command]
pub async fn list_project_tasks(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectTask>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query(
        "SELECT id, project_id, title, body, assignee, status, priority, parent_task_id, artifact_id, result, claim_lock, claim_expire_at, started_at, completed_at, skills, max_retries, retry_count, workspace_kind, workspace_path, board_id, created_at, updated_at FROM project_tasks WHERE project_id = ? ORDER BY priority DESC, created_at ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for row in rows {
        let id: String = row.try_get("id").map_err(|e| e.to_string())?;
        let project_id: String = row.try_get("project_id").map_err(|e| e.to_string())?;
        let title: String = row.try_get("title").map_err(|e| e.to_string())?;
        let body: String = row.try_get("body").map_err(|e| e.to_string())?;
        let assignee: String = row.try_get("assignee").map_err(|e| e.to_string())?;
        let status: String = row.try_get("status").map_err(|e| e.to_string())?;
        let priority: i32 = row.try_get("priority").map_err(|e| e.to_string())?;
        let parent_task_id: Option<String> = row.try_get("parent_task_id").map_err(|e| e.to_string())?;
        let artifact_id: Option<String> = row.try_get("artifact_id").map_err(|e| e.to_string())?;
        let result: String = row.try_get("result").map_err(|e| e.to_string())?;
        let claim_lock: String = row.try_get("claim_lock").map_err(|e| e.to_string())?;
        let claim_expire_at: i64 = row.try_get("claim_expire_at").map_err(|e| e.to_string())?;
        let started_at: Option<i64> = row.try_get("started_at").map_err(|e| e.to_string())?;
        let completed_at: Option<i64> = row.try_get("completed_at").map_err(|e| e.to_string())?;
        let skills: String = row.try_get("skills").map_err(|e| e.to_string())?;
        let max_retries: i32 = row.try_get("max_retries").map_err(|e| e.to_string())?;
        let retry_count: i32 = row.try_get("retry_count").map_err(|e| e.to_string())?;
        let workspace_kind: String = row.try_get("workspace_kind").map_err(|e| e.to_string())?;
        let workspace_path: String = row.try_get("workspace_path").map_err(|e| e.to_string())?;
        let board_id: String = row.try_get("board_id").map_err(|e| e.to_string())?;
        let created_at: i64 = row.try_get("created_at").map_err(|e| e.to_string())?;
        let updated_at: i64 = row.try_get("updated_at").map_err(|e| e.to_string())?;
        tasks.push(db::ProjectTask {
            id, project_id, title, body, assignee, status, priority, parent_task_id: parent_task_id.unwrap_or_default(), artifact_id: artifact_id.unwrap_or_default(), result, claim_lock, claim_expire_at, started_at, completed_at, skills, max_retries, retry_count, workspace_kind, workspace_path, board_id, created_at, updated_at,
        });
    }
    Ok(tasks)
}

#[tauri::command]
pub async fn create_project_task(app: AppHandle, req: db::CreateProjectTaskRequest) -> Result<db::ProjectTask, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let body = req.body.unwrap_or_default();
    let assignee = req.assignee.unwrap_or_default();
    let status = req.status.unwrap_or_else(|| "todo".to_string());
    let priority = req.priority.unwrap_or(0);
    let parent_task_id = req.parent_task_id.unwrap_or_default();

    let skills = req.skills.unwrap_or_else(|| "[]".to_string());
    let max_retries = req.max_retries.unwrap_or(0);
    let workspace_kind = req.workspace_kind.unwrap_or_default();
    let workspace_path = req.workspace_path.unwrap_or_default();

    sqlx::query("INSERT INTO project_tasks (id, project_id, title, body, assignee, status, priority, parent_task_id, artifact_id, result, claim_lock, claim_expire_at, skills, max_retries, retry_count, workspace_kind, workspace_path, board_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', '', 0, ?, ?, 0, ?, ?, '', ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.title)
        .bind(&body)
        .bind(&assignee)
        .bind(&status)
        .bind(priority)
        .bind(&parent_task_id)
        .bind(&skills)
        .bind(max_retries)
        .bind(&workspace_kind)
        .bind(&workspace_path)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = record_activity(&app, &req.project_id, None, "task_created", Some("task"), Some(&id), &format!("创建了任务：{}", req.title)).await;

    if !assignee.is_empty() && status != "triage" {
        let _ = do_dispatch_task(&app, &pool, &id, &assignee, &req.project_id, &req.title, &body, priority, None, "auto").await;
    }

    let updated_task: db::ProjectTask = sqlx::query_as(
        "SELECT id, project_id, title, body, assignee, status, priority, parent_task_id, artifact_id, result, claim_lock, claim_expire_at, started_at, completed_at, skills, max_retries, retry_count, workspace_kind, workspace_path, board_id, created_at, updated_at FROM project_tasks WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(updated_task)
}

#[tauri::command]
pub async fn update_project_task(app: AppHandle, id: String, req: db::UpdateProjectTaskRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let task: Option<(String, String, String, String, i32, String, String, i32, String, String)> = sqlx::query_as(
        "SELECT title, body, assignee, status, priority, result, skills, max_retries, workspace_kind, workspace_path FROM project_tasks WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (cur_title, cur_body, cur_assignee, cur_status, cur_priority, cur_result, cur_skills, cur_max_retries, cur_workspace_kind, cur_workspace_path) = task.ok_or("Task not found")?;

    let old_status = cur_status.clone();
    let new_title = req.title.unwrap_or(cur_title);
    let new_body = req.body.unwrap_or(cur_body);
    let new_assignee = req.assignee.unwrap_or_else(|| cur_assignee.clone());
    let new_status = req.status.unwrap_or(cur_status);
    let new_priority = req.priority.unwrap_or(cur_priority);
    let new_result = req.result.unwrap_or(cur_result);
    let new_skills = req.skills.unwrap_or(cur_skills);
    let new_max_retries = req.max_retries.unwrap_or(cur_max_retries);
    let new_workspace_kind = req.workspace_kind.unwrap_or(cur_workspace_kind);
    let new_workspace_path = req.workspace_path.unwrap_or(cur_workspace_path);

    let started_at_needs_bind = new_status == "running";
    let completed_at_needs_bind = new_status == "done";

    let started_at_update = if started_at_needs_bind {
        "COALESCE(started_at, ?)".to_string()
    } else {
        "started_at".to_string()
    };
    let completed_at_update = if completed_at_needs_bind {
        format!("COALESCE(completed_at, {})", now)
    } else {
        "completed_at".to_string()
    };

    let sql = format!(
        "UPDATE project_tasks SET title = ?, body = ?, assignee = ?, status = ?, priority = ?, result = ?, skills = ?, max_retries = ?, workspace_kind = ?, workspace_path = ?, started_at = {}, completed_at = {}, updated_at = ? WHERE id = ?",
        started_at_update, completed_at_update
    );

    let mut query = sqlx::query(&sql)
        .bind(&new_title)
        .bind(&new_body)
        .bind(&new_assignee)
        .bind(&new_status)
        .bind(new_priority)
        .bind(&new_result)
        .bind(&new_skills)
        .bind(new_max_retries)
        .bind(&new_workspace_kind)
        .bind(&new_workspace_path);

    if started_at_needs_bind {
        query = query.bind(now);
    }
    if completed_at_needs_bind {
        query = query.bind(now);
    }

    query = query.bind(now).bind(&id);

    query
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if new_status == "done" && old_status != "done" {
        let project_id: Option<String> = sqlx::query_scalar(
            "SELECT project_id FROM project_tasks WHERE id = ?"
        )
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        if let Some(pid) = project_id {
            let role_id = if new_assignee.is_empty() { None } else { Some(new_assignee.as_str()) };
            let _ = record_activity(&app, &pid, role_id, "task_completed", Some("task"), Some(&id), &format!("完成了任务：{}", new_title)).await;
        }
    } else if new_status == "running" && old_status != "running" {
        let project_id: Option<String> = sqlx::query_scalar(
            "SELECT project_id FROM project_tasks WHERE id = ?"
        )
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        if let Some(pid) = project_id {
            let role_id = if new_assignee.is_empty() { None } else { Some(new_assignee.as_str()) };
            let _ = record_activity(&app, &pid, role_id, "task_started", Some("task"), Some(&id), &format!("开始执行任务：{}", new_title)).await;
        }
    }

    if !new_assignee.is_empty() && new_assignee != cur_assignee && new_status != "done" {
        let project_id: Option<String> = sqlx::query_scalar(
            "SELECT project_id FROM project_tasks WHERE id = ?"
        )
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        if let Some(pid) = project_id {
            let _ = do_dispatch_task(&app, &pool, &id, &new_assignee, &pid, &new_title, &new_body, new_priority, None, "auto").await;
        }
    }

    let project_id_for_event: String = sqlx::query_scalar(
        "SELECT project_id FROM project_tasks WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .unwrap_or_default();

    let _ = app.emit("task_updated", serde_json::json!({
        "taskId": id,
        "projectId": project_id_for_event,
    }));

    Ok(())
}

#[tauri::command]
pub async fn list_project_boards(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectBoard>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, i64, i64, i64, i64)>(
        "SELECT id, project_id, name, description, sort_order, is_default, created_at, updated_at FROM project_boards WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, name, description, sort_order, is_default, created_at, updated_at)| db::ProjectBoard {
        id, project_id, name, description, sort_order, is_default, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_project_board(app: AppHandle, req: db::CreateProjectBoardRequest) -> Result<db::ProjectBoard, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let description = req.description.unwrap_or_default();

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM project_boards WHERE project_id = ?")
        .bind(&req.project_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(-1) + 1;

    let board_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM project_boards WHERE project_id = ?")
        .bind(&req.project_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let is_default = if board_count == 0 { 1 } else { 0 };

    sqlx::query("INSERT INTO project_boards (id, project_id, name, description, sort_order, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.name)
        .bind(&description)
        .bind(sort_order)
        .bind(is_default)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectBoard {
        id, project_id: req.project_id, name: req.name, description, sort_order, is_default, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_project_board(app: AppHandle, id: String, req: db::UpdateProjectBoardRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let current: Option<(String, String, i64)> = sqlx::query_as(
        "SELECT name, description, sort_order FROM project_boards WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (cur_name, cur_desc, cur_sort) = current.ok_or("Board not found")?;
    let name = req.name.unwrap_or(cur_name);
    let description = req.description.unwrap_or(cur_desc);
    let sort_order = req.sort_order.unwrap_or(cur_sort);

    sqlx::query("UPDATE project_boards SET name = ?, description = ?, sort_order = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(&description)
        .bind(sort_order)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_project_board(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    let is_default: Option<i64> = sqlx::query_scalar("SELECT is_default FROM project_boards WHERE id = ?")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if is_default == Some(1) {
        return Err("Cannot delete default board".to_string());
    }

    sqlx::query("DELETE FROM project_boards WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn archive_project_task(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let task: Option<(String, String)> = sqlx::query_as(
        "SELECT title, status FROM project_tasks WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (title, _status) = task.ok_or("Task not found")?;

    sqlx::query("UPDATE project_tasks SET status = 'archived', updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let project_id: Option<String> = sqlx::query_scalar(
        "SELECT project_id FROM project_tasks WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(pid) = project_id {
        let _ = record_activity(&app, &pid, None, "task_archived", Some("task"), Some(&id), &format!("归档了任务：{}", title)).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn update_message_tokens(app: AppHandle, message_id: String, prompt_tokens: i64, completion_tokens: i64) -> Result<(), String> {
    let pool = get_pool(&app)?;

    sqlx::query("UPDATE project_messages SET prompt_tokens = ?, completion_tokens = ? WHERE id = ?")
        .bind(prompt_tokens)
        .bind(completion_tokens)
        .bind(&message_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_project_task(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM project_tasks WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_project_artifact(app: AppHandle, id: String, title: Option<String>, content: Option<String>, file_path: Option<String>, status: Option<String>) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let artifact: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT title, content, file_path, status FROM project_artifacts WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (cur_title, cur_content, cur_file_path, cur_status) = artifact.ok_or("Artifact not found")?;

    let new_title = title.unwrap_or(cur_title);
    let new_content = content.unwrap_or(cur_content);
    let new_file_path = file_path.unwrap_or(cur_file_path);
    let new_status = status.unwrap_or(cur_status);

    sqlx::query("UPDATE project_artifacts SET title = ?, content = ?, file_path = ?, status = ?, updated_at = ? WHERE id = ?")
        .bind(&new_title)
        .bind(&new_content)
        .bind(&new_file_path)
        .bind(&new_status)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn execute_workflow_step(app: AppHandle, project_id: String, from_role_id: Option<String>, artifact_type: Option<String>) -> Result<Vec<db::ProjectWorkflow>, String> {
    let pool = get_pool(&app)?;

    let mut query = String::from("SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at FROM project_workflows WHERE project_id = ?");
    let mut bind_from: Option<String> = None;
    let mut bind_artifact: Option<String> = None;

    if from_role_id.is_some() {
        query.push_str(" AND from_role_id = ?");
        bind_from = from_role_id.clone();
    }
    if artifact_type.is_some() {
        query.push_str(" AND artifact_type = ?");
        bind_artifact = artifact_type.clone();
    }
    query.push_str(" ORDER BY sort_order ASC");

    let mut q = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, i64, i64)>(&query)
        .bind(&project_id);
    if let Some(ref fr) = bind_from {
        q = q.bind(fr);
    }
    if let Some(ref at) = bind_artifact {
        q = q.bind(at);
    }

    let rows = q.fetch_all(&pool).await.map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at)| db::ProjectWorkflow {
        id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at,
    }).collect())
}

#[tauri::command]
pub async fn get_project_role_context(app: AppHandle, project_id: String, role_id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let role: Option<(String, String, String, String, String, String, String, i64, i64, String)> = sqlx::query_as(
        "SELECT id, name, nickname, icon, description, responsibilities, soul_content, is_builtin, energy, mood FROM ai_roles WHERE id = ?"
    )
    .bind(&role_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let role_data = role.ok_or("Role not found")?;

    let member: Option<(String, String, String, String, String, String, i64, i64, i64, i64)> = sqlx::query_as(
        "SELECT id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at FROM project_members WHERE project_id = ? AND role_id = ?"
    )
    .bind(&project_id)
    .bind(&role_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let project: Option<db::Project> = sqlx::query_as::<_, db::Project>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let project_data = project.ok_or("Project not found")?;

    let soul = member.as_ref().and_then(|m| if m.4.is_empty() { None } else { Some(m.4.clone()) })
        .unwrap_or_else(|| role_data.5.clone());
    let responsibilities = member.as_ref().and_then(|m| if m.5.is_empty() { None } else { Some(m.5.clone()) })
        .unwrap_or_else(|| role_data.4.clone());

    let workflows: Vec<db::ProjectWorkflow> = {
        let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, i64, i64)>(
            "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at FROM project_workflows WHERE project_id = ? AND (from_role_id = ? OR to_role_id = ?) ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .bind(&role_id)
        .bind(&role_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at)| db::ProjectWorkflow {
            id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at,
        }).collect()
    };

    let artifacts: Vec<db::ProjectArtifact> = {
        let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String, i64, i64)>(
            "SELECT id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at FROM project_artifacts WHERE project_id = ? AND role_id = ? ORDER BY created_at DESC"
        )
        .bind(&project_id)
        .bind(&role_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at)| db::ProjectArtifact {
            id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at,
        }).collect()
    };

    Ok(serde_json::json!({
        "role": {
            "id": role_data.0,
            "name": role_data.1,
            "nickname": role_data.2,
            "icon": role_data.3,
            "description": role_data.4,
            "responsibilities": responsibilities,
            "soul": soul,
            "energy": role_data.8,
            "mood": role_data.9,
            "equipment_level": member.as_ref().map(|m| m.6).unwrap_or(1),
        },
        "project": {
            "id": project_data.id,
            "name": project_data.name,
            "description": project_data.description,
            "workspace_path": project_data.workspace_path,
            "project_guidelines": project_data.project_guidelines,
        },
        "workflows": workflows,
        "artifacts": artifacts,
    }))
}

#[tauri::command]
pub async fn chat_with_project_role(app: AppHandle, project_id: String, role_id: String, message: String, event_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    let context = get_project_role_context(app.clone(), project_id.clone(), role_id.clone()).await?;
    let role = &context["role"];
    let project = &context["project"];

    let role_name = role["name"].as_str().unwrap_or("AI助手");
    let role_nickname = role["nickname"].as_str().unwrap_or("");
    let role_soul = role["soul"].as_str().unwrap_or("");
    let role_resp = role["responsibilities"].as_str().unwrap_or("");
    let role_energy = role["energy"].as_i64().unwrap_or(100);
    let role_mood = role["mood"].as_str().unwrap_or("neutral");
    let project_name = project["name"].as_str().unwrap_or("");
    let project_desc = project["description"].as_str().unwrap_or("");
    let project_workspace = project["workspace_path"].as_str().unwrap_or("");
    let project_guidelines = project["project_guidelines"].as_str().unwrap_or("");

    let display_name = if role_nickname.is_empty() { role_name.to_string() } else { role_nickname.to_string() };

    let mood_hint = match role_mood {
        "energetic" => "你当前精力充沛，充满热情和创造力。",
        "tired" => "你有些疲惫，回答可能稍显简短，但仍保持专业。",
        "exhausted" => "你非常疲惫，回答会比较简洁，建议休息恢复精力。",
        _ => "",
    };

    let mut system_prompt = format!(
        "你是项目「{}」中的AI角色。\n你的名字是「{}」，角色类型是「{}」。\n\n角色职责：{}\n\n角色灵魂设定：\n{}\n\n项目描述：{}",
        project_name, display_name, role_name, role_resp, role_soul, project_desc
    );

    if !project_workspace.is_empty() {
        system_prompt.push_str(&format!("\n\n【重要 - 文件路径规则】\n项目工作空间路径：{}\n所有文件产出必须保存到该目录下。\n注意：你的记忆(MEMORY)中可能包含旧的路径信息，请忽略记忆中的任何路径，始终以上述工作空间路径为准。生成文件路径时，必须以 {} 开头。", project_workspace, project_workspace));
    }

    if !mood_hint.is_empty() {
        system_prompt.push_str(&format!("\n\n当前状态：精力{}%，{}{}", role_energy, mood_hint, if role_mood == "exhausted" { "（回复可能较简短）" } else { "" }));
    }

    if !project_guidelines.is_empty() {
        system_prompt.push_str(&format!("\n\n项目执行规则：\n{}", project_guidelines));
    }

    let workflows = &context["workflows"];
    if let Some(wf_arr) = workflows.as_array() {
        let upstream: Vec<String> = wf_arr.iter()
            .filter(|w| w["toRoleId"].as_str() == Some(&role_id))
            .filter_map(|w| {
                let from = w["fromRoleId"].as_str().unwrap_or("");
                let artifact = w["artifactType"].as_str().unwrap_or("");
                if !from.is_empty() { Some(format!("{}（提供：{}）", from, if artifact.is_empty() { "产出物" } else { artifact })) } else { None }
            })
            .collect();
        let downstream: Vec<String> = wf_arr.iter()
            .filter(|w| w["fromRoleId"].as_str() == Some(&role_id))
            .filter_map(|w| {
                let to = w["toRoleId"].as_str().unwrap_or("");
                let artifact = w["artifactType"].as_str().unwrap_or("");
                if !to.is_empty() { Some(format!("{}（需交付：{}）", to, if artifact.is_empty() { "产出物" } else { artifact })) } else { None }
            })
            .collect();

        if !upstream.is_empty() || !downstream.is_empty() {
            system_prompt.push_str("\n\n工作流上下文：");
            if !upstream.is_empty() {
                system_prompt.push_str(&format!("\n你的上游角色：{}", upstream.join("、")));
            }
            if !downstream.is_empty() {
                system_prompt.push_str(&format!("\n你的下游角色：{}", downstream.join("、")));
            }
        }
    }

    system_prompt.push_str(&format!("\n\n请以「{}」的身份回答问题，保持角色一致性。回答要专业、有针对性。", display_name));

    let skills: Vec<String> = sqlx::query_scalar(
        "SELECT skill_name FROM role_skills WHERE role_id = ? AND enabled = 1"
    )
    .bind(&role_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    if !skills.is_empty() {
        let skill_names = skills.join("、");
        let mut skill_detail = format!(
            "\n\n你可使用的技能：{}\n当需要使用技能时，请在回复中说明要调用的技能和参数，格式如：[技能:技能名] 参数内容。",
            skill_names
        );

        let template_vars = serde_json::json!({
            "project_name": project_name,
            "role_name": display_name,
            "role_id": role_id,
            "project_id": project_id,
        });

        for (key, val) in template_vars.as_object().unwrap() {
            let pattern = format!("{{{{{}}}}}", key);
            if let Some(s) = val.as_str() {
                skill_detail = skill_detail.replace(&pattern, s);
            }
        }

        system_prompt.push_str(&skill_detail);
    }

    let active_tasks: Vec<(String, String, String, i32)> = sqlx::query_as(
        "SELECT title, body, status, priority FROM project_tasks WHERE project_id = ? AND assignee = ? AND status IN ('ready', 'running') ORDER BY priority DESC"
    )
    .bind(&project_id)
    .bind(&role_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    if !active_tasks.is_empty() {
        let task_lines: Vec<String> = active_tasks.iter()
            .map(|(title, body, status, priority)| {
                let p = match priority {
                    p if *p >= 3 => "高",
                    p if *p >= 2 => "中",
                    _ => "低",
                };
                let s = match status.as_str() {
                    "ready" => "就绪",
                    "running" => "进行中",
                    _ => status,
                };
                let mut line = format!("- [{}] {}（优先级：{}）", s, title, p);
                if !body.is_empty() {
                    let preview: String = body.chars().take(80).collect();
                    line.push_str(&format!("\n  描述：{}", preview));
                }
                line
            })
            .collect();
        system_prompt.push_str(&format!("\n\n你当前被分配的任务：\n{}", task_lines.join("\n")));
    }

    let memories: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT category, content, importance FROM project_memories WHERE project_id = ? AND (role_id = ? OR role_id = 'shared') ORDER BY importance DESC LIMIT 10"
    )
    .bind(&project_id)
    .bind(&role_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    if !memories.is_empty() {
        let memory_text: Vec<String> = memories.iter()
            .map(|(cat, content, imp)| {
                if cat == "general" { content.clone() }
                else { format!("[{}] {}", cat, content) }
            })
            .collect();
        system_prompt.push_str(&format!("\n\n项目记忆（重要决策和结论）：\n{}", memory_text.join("\n")));
    }

    let api_base = helpers::hermes_api_base_from_pool(&pool).await;
    let api_key = helpers::hermes_api_key_from_pool(&pool).await;

    let client = reqwest::Client::new();
    let mut messages = vec![
        serde_json::json!({
            "role": "system",
            "content": system_prompt
        }),
        serde_json::json!({
            "role": "user",
            "content": message
        })
    ];

    let recent_msgs: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT pm.role_id, pm.content, COALESCE(r.nickname, r.name, pm.role_id) FROM project_messages pm LEFT JOIN ai_roles r ON pm.role_id = r.id WHERE pm.project_id = ? ORDER BY pm.created_at DESC LIMIT 40"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .rev()
    .collect();

    let mut context_messages: Vec<serde_json::Value> = Vec::new();

    if recent_msgs.len() > 20 {
        let old_msgs: Vec<(String, String, String)> = recent_msgs[..recent_msgs.len() - 10].to_vec();
        let recent_keep: Vec<(String, String, String)> = recent_msgs[recent_msgs.len() - 10..].to_vec();

        let old_text: Vec<String> = old_msgs.iter()
            .map(|(rid, content, name)| {
                if rid == "builtin_user" { format!("用户：{}", content) }
                else if rid == &role_id { format!("{}：{}", display_name, content) }
                else { format!("{}：{}", name, content) }
            })
            .collect();
        let old_summary_input = old_text.join("\n");

        let summary_prompt = format!("请用简洁的中文总结以下对话的关键信息、决策和结论，不超过200字：\n\n{}", old_summary_input);
        let summary_body = serde_json::json!({
            "model": "default",
            "messages": [{"role": "user", "content": summary_prompt}],
            "stream": false,
        });

        let summary_response = client
            .post(format!("{}/chat/completions", api_base))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&summary_body)
            .send()
            .await;

        if let Ok(resp) = summary_response {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(summary) = json["choices"][0]["message"]["content"].as_str() {
                        context_messages.push(serde_json::json!({
                            "role": "system",
                            "content": format!("历史对话摘要：{}", summary)
                        }));
                    }
                }
            }
        }

        for (msg_role_id, msg_content, msg_role_name) in &recent_keep {
            if *msg_role_id == role_id {
                context_messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": msg_content
                }));
            } else if *msg_role_id == "builtin_user" {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": msg_content
                }));
            } else {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": format!("[{}]: {}", msg_role_name, msg_content)
                }));
            }
        }
    } else {
        for (msg_role_id, msg_content, msg_role_name) in &recent_msgs {
            if *msg_role_id == role_id {
                context_messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": msg_content
                }));
            } else if *msg_role_id == "builtin_user" {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": msg_content
                }));
            } else {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": format!("[{}]: {}", msg_role_name, msg_content)
                }));
            }
        }
    }

    if !context_messages.is_empty() {
        messages.splice(1..1, context_messages);
    }

    let body = serde_json::json!({
        "model": "default",
        "messages": messages,
        "stream": true,
    });

    let response = client
        .post(format!("{}/chat/completions", api_base))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("X-Hermes-Session-Key", format!("project-{}", project_id))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to AI service: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("AI service error: {} - {}", status, text));
    }

    let app_handle = app.clone();
    let event_id_clone = event_id.clone();
    tauri::async_runtime::spawn(async move {
        use futures_util::StreamExt;
        let mut stream = response.bytes_stream();
        let mut full_content = String::new();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(pos) = buffer.find("\n") {
                        let line = buffer[..pos].trim().to_string();
                        buffer = buffer[pos + 1..].to_string();

                        if line.starts_with("data: ") {
                            let data = &line[6..];
                            if data == "[DONE]" {
                                let _ = app_handle.emit(&event_id_clone, serde_json::json!({
                                    "chunk": "",
                                    "done": true,
                                    "fullContent": full_content,
                                }));

                                let energy_pool = get_pool(&app_handle);
                                if let Ok(pool) = energy_pool {
                                    let _ = sqlx::query("UPDATE ai_roles SET energy = MAX(0, energy - 8), updated_at = ? WHERE id = ?")
                                        .bind(chrono::Utc::now().timestamp_millis())
                                        .bind(&role_id)
                                        .execute(&pool)
                                        .await;
                                    let _ = sqlx::query("UPDATE ai_roles SET mood = CASE WHEN energy >= 70 THEN 'energetic' WHEN energy >= 40 THEN 'neutral' WHEN energy >= 20 THEN 'tired' ELSE 'exhausted' END WHERE id = ?")
                                        .bind(&role_id)
                                        .execute(&pool)
                                        .await;
                                }

                                {
                                    let rec_app = app_handle.clone();
                                    let rec_project = project_id.clone();
                                    let rec_role = role_id.clone();
                                    let rec_message = message.clone();
                                    let rec_content = full_content.clone();
                                    tauri::async_runtime::spawn(async move {
                                        let _ = record_chat_files(rec_app.clone(), rec_project.clone(), rec_role.clone()).await;
                                        let _ = extract_and_save_memory(rec_app, rec_project, rec_role, rec_message, rec_content).await;
                                    });
                                }

                                break;
                            }
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                                if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                                    full_content.push_str(content);
                                    let cleaned = clean_context_tags(content);
                                    if !cleaned.is_empty() {
                                        let _ = app_handle.emit(&event_id_clone, serde_json::json!({
                                            "chunk": cleaned,
                                            "done": false,
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    let _ = app_handle.emit(&event_id_clone, serde_json::json!({
                        "chunk": format!("\n\n[Error: {}]", e),
                        "done": true,
                    }));
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn chat_with_project_roles(app: AppHandle, project_id: String, role_ids: Vec<String>, message: String, event_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let api_base = helpers::hermes_api_base_from_pool(&pool).await;
    let api_key = helpers::hermes_api_key_from_pool(&pool).await;
    let client = reqwest::Client::new();

    let mut all_replies: Vec<(String, String, String)> = Vec::new();

    for (i, role_id) in role_ids.iter().enumerate() {
        let context = get_project_role_context(app.clone(), project_id.clone(), role_id.clone()).await?;
        let role = &context["role"];
        let project = &context["project"];

        let role_name = role["name"].as_str().unwrap_or("AI助手");
        let role_nickname = role["nickname"].as_str().unwrap_or("");
        let role_soul = role["soul"].as_str().unwrap_or("");
        let role_resp = role["responsibilities"].as_str().unwrap_or("");
        let project_name = project["name"].as_str().unwrap_or("");
        let project_desc = project["description"].as_str().unwrap_or("");
        let project_workspace = project["workspace_path"].as_str().unwrap_or("");
        let project_guidelines = project["project_guidelines"].as_str().unwrap_or("");

        let display_name = if role_nickname.is_empty() { role_name.to_string() } else { role_nickname.to_string() };

        let mut other_role_contexts: Vec<(String, serde_json::Value)> = Vec::new();
        for other_id in role_ids.iter() {
            if other_id == role_id { continue; }
            if let Ok(ctx) = get_project_role_context(app.clone(), project_id.clone(), other_id.clone()).await {
                other_role_contexts.push((other_id.clone(), ctx));
            }
        }

        let other_mentioned: Vec<String> = other_role_contexts.iter()
            .filter_map(|(_, c)| {
                let n = c["role"]["nickname"].as_str().unwrap_or("");
                let rn = c["role"]["name"].as_str().unwrap_or("");
                Some(if n.is_empty() { rn.to_string() } else { n.to_string() })
            })
            .collect();

        let mut system_prompt = format!(
            "你是项目「{}」中的AI角色。\n你的名字是「{}」，角色类型是「{}」。\n\n角色职责：{}\n\n角色灵魂设定：\n{}\n\n项目描述：{}",
            project_name, display_name, role_name, role_resp, role_soul, project_desc
        );

        if !project_workspace.is_empty() {
            system_prompt.push_str(&format!("\n\n【重要 - 文件路径规则】\n项目工作空间路径：{}\n所有文件产出必须保存到该目录下。\n注意：你的记忆(MEMORY)中可能包含旧的路径信息，请忽略记忆中的任何路径，始终以上述工作空间路径为准。生成文件路径时，必须以 {} 开头。", project_workspace, project_workspace));
        }

        if !project_guidelines.is_empty() {
            system_prompt.push_str(&format!("\n\n项目执行规则：\n{}", project_guidelines));
        }

        if !other_mentioned.is_empty() {
            system_prompt.push_str(&format!("\n\n当前正在与 {} 进行讨论。", other_mentioned.join("、")));
        }

        if !all_replies.is_empty() {
            let prev: Vec<String> = all_replies.iter()
                .map(|(name, reply, _)| format!("{}：{}", name, reply))
                .collect();
            system_prompt.push_str(&format!("\n\n其他角色的讨论：\n{}", prev.join("\n")));
            system_prompt.push_str("\n\n请基于以上讨论内容，从你的专业角度给出观点和建议。");
        }

        system_prompt.push_str(&format!("\n\n请以「{}」的身份回答问题，保持角色一致性。回答要专业、有针对性。", display_name));

        let skills: Vec<String> = sqlx::query_scalar(
            "SELECT skill_name FROM role_skills WHERE role_id = ? AND enabled = 1"
        )
        .bind(role_id)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        if !skills.is_empty() {
            system_prompt.push_str(&format!(
                "\n\n你可使用的技能：{}\n当需要使用技能时，请在回复中说明要调用的技能和参数，格式如：[技能:技能名] 参数内容。",
                skills.join("、")
            ));
        }

        let active_tasks: Vec<(String, String, String, i32)> = sqlx::query_as(
            "SELECT title, body, status, priority FROM project_tasks WHERE project_id = ? AND assignee = ? AND status IN ('ready', 'running') ORDER BY priority DESC"
        )
        .bind(&project_id)
        .bind(role_id)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        if !active_tasks.is_empty() {
            let task_lines: Vec<String> = active_tasks.iter()
                .map(|(title, body, status, priority)| {
                    let p = match priority {
                        p if *p >= 3 => "高",
                        p if *p >= 2 => "中",
                        _ => "低",
                    };
                    let s = match status.as_str() {
                        "ready" => "就绪",
                        "running" => "进行中",
                        _ => status,
                    };
                    let mut line = format!("- [{}] {}（优先级：{}）", s, title, p);
                    if !body.is_empty() {
                        let preview: String = body.chars().take(80).collect();
                        line.push_str(&format!("\n  描述：{}", preview));
                    }
                    line
                })
                .collect();
            system_prompt.push_str(&format!("\n\n你当前被分配的任务：\n{}", task_lines.join("\n")));
        }

        let mut messages = vec![
            serde_json::json!({
                "role": "system",
                "content": system_prompt
            }),
            serde_json::json!({
                "role": "user",
                "content": message
            })
        ];

        let recent_msgs: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT pm.role_id, pm.content, COALESCE(r.nickname, r.name, pm.role_id) FROM project_messages pm LEFT JOIN ai_roles r ON pm.role_id = r.id WHERE pm.project_id = ? ORDER BY pm.created_at DESC LIMIT 20"
        )
        .bind(&project_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .rev()
        .collect();

        let mut context_messages: Vec<serde_json::Value> = Vec::new();
        for (msg_role_id, msg_content, msg_role_name) in &recent_msgs {
            if *msg_role_id == *role_id {
                context_messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": msg_content
                }));
            } else if *msg_role_id == "builtin_user" {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": msg_content
                }));
            } else {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": format!("[{}]: {}", msg_role_name, msg_content)
                }));
            }
        }

        if !context_messages.is_empty() {
            messages.splice(1..1, context_messages);
        }

        let body = serde_json::json!({
            "model": "default",
            "messages": messages,
            "stream": false,
        });

        let response = client
            .post(format!("{}/chat/completions", api_base))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .header("X-Hermes-Session-Key", format!("project-{}", project_id))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to AI service: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("AI service error for role {}: {} - {}", display_name, status, text));
        }

        let resp_json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let reply = resp_json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();

        let cleaned_reply = clean_context_tags(&reply);

        let _ = app.emit(&event_id, serde_json::json!({
            "roleIndex": i,
            "roleId": role_id,
            "roleName": display_name,
            "chunk": cleaned_reply,
            "done": false,
        }));

        all_replies.push((display_name.clone(), reply.clone(), role_id.clone()));
    }

    let _ = app.emit(&event_id, serde_json::json!({
        "done": true,
        "replies": all_replies.iter().map(|(name, reply, rid)| serde_json::json!({
            "roleName": name,
            "roleId": rid,
            "content": reply,
        })).collect::<Vec<_>>(),
    }));

    {
        let rec_app = app.clone();
        let rec_project = project_id.clone();
        tauri::async_runtime::spawn(async move {
            let _ = record_chat_files(rec_app, rec_project, String::new()).await;
        });
    }

    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AutoDelegateResult {
    pub from_role_id: String,
    pub from_role_name: String,
    pub to_role_id: String,
    pub to_role_name: String,
    pub message_sent: String,
    pub reply: String,
    pub artifact_id: Option<String>,
}

#[tauri::command]
pub async fn auto_delegate_chat(app: AppHandle, project_id: String, from_role_id: String, to_role_id: String, context_message: String, event_id: String) -> Result<AutoDelegateResult, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let _ = sqlx::query(
        "UPDATE project_tasks SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ? WHERE project_id = ? AND assignee = ? AND status = 'ready'"
    )
    .bind(now)
    .bind(now)
    .bind(&project_id)
    .bind(&to_role_id)
    .execute(&pool)
    .await;

    // When from_role_id is empty (start node trigger), use "builtin_user" as the sender
    let effective_from_role_id = if from_role_id.is_empty() { "builtin_user".to_string() } else { from_role_id.clone() };

    let from_context = get_project_role_context(app.clone(), project_id.clone(), effective_from_role_id.clone()).await?;
    let to_context = get_project_role_context(app.clone(), project_id.clone(), to_role_id.clone()).await?;

    let from_role = &from_context["role"];
    let to_role = &to_context["role"];

    let from_name = from_role["nickname"].as_str().unwrap_or("").to_string();
    let from_name = if from_name.is_empty() { from_role["name"].as_str().unwrap_or("角色A").to_string() } else { from_name };
    let to_name = to_role["nickname"].as_str().unwrap_or("").to_string();
    let to_name = if to_name.is_empty() { to_role["name"].as_str().unwrap_or("角色B").to_string() } else { to_name };

    let from_resp = from_role["responsibilities"].as_str().unwrap_or("");
    let to_resp = to_role["responsibilities"].as_str().unwrap_or("");

    let recent_artifacts: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT title, artifact_type, status, content FROM project_artifacts WHERE project_id = ? AND role_id = ? ORDER BY updated_at DESC LIMIT 3"
    )
    .bind(&project_id)
    .bind(&effective_from_role_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut delegate_message = format!("来自「{}」的委派消息：\n{}", from_name, context_message);

    if !recent_artifacts.is_empty() {
        delegate_message.push_str("\n\n相关产物：");
        for (title, atype, status, content) in &recent_artifacts {
            delegate_message.push_str(&format!("\n- {}（{}，状态：{}）", title, atype, status));
            if !content.is_empty() {
                let preview = if content.len() > 200 { &content[..200] } else { content.as_str() };
                delegate_message.push_str(&format!("：{}...", preview));
            }
        }
    }

    delegate_message.push_str(&format!("\n\n请基于「{}」的产出，从你「{}」的职责角度（{}）进行分析和执行。", from_name, to_name, to_resp));

    let msg_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO project_messages (id, project_id, role_id, content, message_type, created_at) VALUES (?, ?, ?, ?, 'auto_delegate', ?)")
        .bind(&msg_id)
        .bind(&project_id)
        .bind(&effective_from_role_id)
        .bind(&delegate_message)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let api_base = helpers::hermes_api_base_from_pool(&pool).await;
    let api_key = helpers::hermes_api_key_from_pool(&pool).await;
    let client = reqwest::Client::new();

    let project = &to_context["project"];
    let project_name = project["name"].as_str().unwrap_or("");
    let project_desc = project["description"].as_str().unwrap_or("");
    let project_workspace = project["workspace_path"].as_str().unwrap_or("");
    let project_guidelines = project["project_guidelines"].as_str().unwrap_or("");
    let to_soul = to_role["soul"].as_str().unwrap_or("");

    let mut system_prompt = format!(
        "你是项目「{}」中的AI角色。\n你的名字是「{}」，角色类型是「{}」。\n\n角色职责：{}\n\n角色灵魂设定：\n{}\n\n项目描述：{}\n\n你刚刚收到了来自「{}」的委派任务。{}是你的上游角色，负责{}。请基于上游的产出完成你的工作。",
        project_name, to_name, to_role["name"].as_str().unwrap_or(""), to_resp, to_soul, project_desc, from_name, from_name, from_resp
    );

    if !project_workspace.is_empty() {
        system_prompt.push_str(&format!("\n\n【重要 - 文件路径规则】\n项目工作空间路径：{}\n所有文件产出必须保存到该目录下。\n注意：你的记忆(MEMORY)中可能包含旧的路径信息，请忽略记忆中的任何路径，始终以上述工作空间路径为准。生成文件路径时，必须以 {} 开头。", project_workspace, project_workspace));
    }

    if !project_guidelines.is_empty() {
        system_prompt.push_str(&format!("\n\n项目执行规则：\n{}", project_guidelines));
    }

    system_prompt.push_str(&format!("\n\n请以「{}」的身份回答，保持角色一致性。完成工作后请说明你的产出物。", to_name));

    let skills: Vec<String> = sqlx::query_scalar(
        "SELECT skill_name FROM role_skills WHERE role_id = ? AND enabled = 1"
    )
    .bind(&to_role_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    if !skills.is_empty() {
        system_prompt.push_str(&format!(
            "\n\n你可使用的技能：{}\n当需要使用技能时，请在回复中说明要调用的技能和参数，格式如：[技能:技能名] 参数内容。",
            skills.join("、")
        ));
    }

    let messages = vec![
        serde_json::json!({ "role": "system", "content": system_prompt }),
        serde_json::json!({ "role": "user", "content": delegate_message }),
    ];

    let body = serde_json::json!({
        "model": "default",
        "messages": messages,
        "stream": false,
    });

    let response = client
        .post(format!("{}/chat/completions", api_base))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("X-Hermes-Session-Key", format!("project-{}", project_id))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to AI service: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("AI service error: {} - {}", status, text));
    }

    let resp_json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let raw_reply = resp_json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
    let reply = clean_context_tags(&raw_reply);

    let reply_msg_id = uuid::Uuid::new_v4().to_string();
    let now2 = chrono::Utc::now().timestamp_millis();
    sqlx::query("INSERT INTO project_messages (id, project_id, role_id, content, message_type, created_at) VALUES (?, ?, ?, ?, 'auto_reply', ?)")
        .bind(&reply_msg_id)
        .bind(&project_id)
        .bind(&to_role_id)
        .bind(&reply)
        .bind(now2)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit(&event_id, serde_json::json!({
        "fromRoleId": from_role_id,
        "fromRoleName": from_name,
        "toRoleId": to_role_id,
        "toRoleName": to_name,
        "message": delegate_message,
        "reply": reply,
        "done": true,
    }));

    {
        let rec_app = app.clone();
        let rec_project = project_id.clone();
        let rec_role = to_role_id.clone();
        let rec_from_role = effective_from_role_id.clone();
        tauri::async_runtime::spawn(async move {
            let _ = record_chat_files(rec_app.clone(), rec_project.clone(), rec_role.clone()).await;

            // After role finishes work, handle workflow-associated artifacts
            let pool = match get_pool(&rec_app) {
                Ok(p) => p,
                Err(_) => return,
            };

            let now = chrono::Utc::now().timestamp_millis();

            // Check if this role is part of any workflow in this project
            let is_in_workflow: bool = sqlx::query_scalar(
                "SELECT COUNT(*) FROM project_workflows WHERE project_id = ? AND (from_role_id = ? OR to_role_id = ?)"
            )
            .bind(&rec_project)
            .bind(&rec_role)
            .bind(&rec_role)
            .fetch_one(&pool)
            .await
            .unwrap_or(0) > 0;

            if !is_in_workflow {
                let task_result = sqlx::query(
                    "UPDATE project_tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE project_id = ? AND assignee = ? AND status = 'running'"
                )
                .bind(now)
                .bind(now)
                .bind(&rec_project)
                .bind(&rec_role)
                .execute(&pool)
                .await;

                match task_result {
                    Ok(r) if r.rows_affected() > 0 => {
                        log::info!("auto_delegate_chat: role {} not in workflow, marked task as done", rec_role);
                    }
                    _ => {}
                }
            }

            // Determine how the current role's artifacts should be handled based on
            // the OUTGOING transitions (from this role to downstream roles).
            // need_confirm: mark artifact as submitted, wait for user approval before downstream starts
            // auto_push: mark artifact as approved, automatically trigger downstream

            // First, check if this role has any need_confirm outgoing transitions
            let has_need_confirm_outgoing: bool = sqlx::query_scalar(
                "SELECT COUNT(*) FROM project_workflows WHERE project_id = ? AND from_role_id = ? AND transition_type = 'need_confirm'"
            )
            .bind(&rec_project)
            .bind(&rec_role)
            .fetch_one(&pool)
            .await
            .unwrap_or(0) > 0;

            // Find all in_progress artifacts for this role
            let role_artifacts: Vec<(String, String)> = sqlx::query_as(
                "SELECT id, artifact_type FROM project_artifacts WHERE project_id = ? AND role_id = ? AND status = 'in_progress'"
            )
            .bind(&rec_project)
            .bind(&rec_role)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

            let mut has_need_confirm_submitted = false;
            let mut should_trigger_next = false;

            for (art_id, _art_type) in &role_artifacts {
                if has_need_confirm_outgoing {
                    // This role has need_confirm outgoing transitions - mark artifact as submitted
                    let result = sqlx::query("UPDATE project_artifacts SET status = 'submitted', updated_at = ? WHERE id = ? AND status = 'in_progress'")
                        .bind(now)
                        .bind(art_id)
                        .execute(&pool)
                        .await;

                    match result {
                        Ok(r) if r.rows_affected() > 0 => {
                            log::info!("auto_delegate_chat: artifact {} marked as submitted (role {} has need_confirm outgoing)", art_id, rec_role);
                            has_need_confirm_submitted = true;
                        }
                        Ok(_) => {}
                        Err(e) => {
                            log::error!("auto_delegate_chat: failed to update artifact {}: {}", art_id, e);
                        }
                    }
                } else {
                    // No need_confirm outgoing transitions - mark artifact as approved (auto_push)
                    let result = sqlx::query("UPDATE project_artifacts SET status = 'approved', updated_at = ? WHERE id = ? AND status = 'in_progress'")
                        .bind(now)
                        .bind(art_id)
                        .execute(&pool)
                        .await;

                    match result {
                        Ok(r) if r.rows_affected() > 0 => {
                            log::info!("auto_delegate_chat: artifact {} marked as approved (role {} has only auto_push outgoing)", art_id, rec_role);
                            should_trigger_next = true;
                        }
                        Ok(_) => {}
                        Err(e) => {
                            log::error!("auto_delegate_chat: failed to update artifact {}: {}", art_id, e);
                        }
                    }
                }
            }

            // Advance workflow_run_steps for need_confirm artifacts
            // The next step stays in 'pending_approval' status (waiting for user approval)
            if has_need_confirm_submitted {
                log::info!("auto_delegate_chat: role {} completed need_confirm work, advancing workflow steps to pending_approval", rec_role);

                let running_runs: Vec<(String, i64)> = sqlx::query_as(
                    "SELECT wr.id, wrs.step_index FROM workflow_runs wr \
                     JOIN workflow_run_steps wrs ON wr.id = wrs.run_id \
                     WHERE wr.project_id = ? AND wr.status = 'running' \
                     AND wrs.role_id = ? AND wrs.status = 'running'"
                )
                .bind(&rec_project)
                .bind(&rec_role)
                .fetch_all(&pool)
                .await
                .unwrap_or_default();

                for (run_id, completed_step) in &running_runs {
                    let _ = sqlx::query(
                        "UPDATE workflow_run_steps SET status = 'completed', completed_at = ? WHERE run_id = ? AND step_index = ? AND status = 'running'"
                    )
                    .bind(now)
                    .bind(run_id)
                    .bind(completed_step)
                    .execute(&pool)
                    .await;

                    let next_step = completed_step + 1;
                    let max_step: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM workflow_run_steps WHERE run_id = ?"
                    )
                    .bind(run_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap_or(0);

                    if next_step >= max_step {
                        let _ = sqlx::query(
                            "UPDATE workflow_runs SET status = 'completed', current_step = ?, completed_at = ? WHERE id = ?"
                        )
                        .bind(next_step)
                        .bind(now)
                        .bind(run_id)
                        .execute(&pool)
                        .await;

                        let _ = sqlx::query(
                            "UPDATE project_tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE project_id = ? AND status = 'running'"
                        )
                        .bind(now)
                        .bind(now)
                        .bind(&rec_project)
                        .execute(&pool)
                        .await;
                        log::info!("auto_delegate_chat: workflow completed, marked tasks as done for project {}", rec_project);
                    } else {
                        let _ = sqlx::query(
                            "UPDATE workflow_runs SET current_step = ? WHERE id = ?"
                        )
                        .bind(next_step)
                        .bind(run_id)
                        .execute(&pool)
                        .await;

                        let _ = sqlx::query(
                            "UPDATE workflow_run_steps SET status = 'pending_approval', started_at = COALESCE(started_at, ?) WHERE run_id = ? AND step_index = ? AND status = 'pending'"
                        )
                        .bind(now)
                        .bind(run_id)
                        .bind(next_step)
                        .execute(&pool)
                        .await;
                    }
                }

                let _ = rec_app.emit("need_confirm_submitted", serde_json::json!({
                    "projectId": rec_project,
                    "roleId": rec_role,
                }));
            }

            // Trigger next workflow step for auto_push artifacts via event
            if should_trigger_next {
                log::info!("auto_delegate_chat: role {} completed auto_push work, advancing workflow steps", rec_role);

                // Advance workflow_run_steps for all running runs where this role is the current step
                let running_runs: Vec<(String, i64)> = sqlx::query_as(
                    "SELECT wr.id, wrs.step_index FROM workflow_runs wr \
                     JOIN workflow_run_steps wrs ON wr.id = wrs.run_id \
                     WHERE wr.project_id = ? AND wr.status = 'running' \
                     AND wrs.role_id = ? AND wrs.status = 'running'"
                )
                .bind(&rec_project)
                .bind(&rec_role)
                .fetch_all(&pool)
                .await
                .unwrap_or_default();

                for (run_id, completed_step) in &running_runs {
                    let step_result = sqlx::query(
                        "UPDATE workflow_run_steps SET status = 'completed', completed_at = ? WHERE run_id = ? AND step_index = ? AND status = 'running'"
                    )
                    .bind(now)
                    .bind(run_id)
                    .bind(completed_step)
                    .execute(&pool)
                    .await;

                    match step_result {
                        Ok(r) if r.rows_affected() > 0 => {
                            log::info!("auto_delegate_chat: step {}/{} of run {} completed", completed_step, run_id, run_id);
                        }
                        Ok(_) => {
                            log::warn!("auto_delegate_chat: step {}/{} of run {} already processed, skipping", completed_step, run_id, run_id);
                            continue;
                        }
                        Err(e) => {
                            log::error!("auto_delegate_chat: failed to complete step {}/{} of run {}: {}", completed_step, run_id, run_id, e);
                            continue;
                        }
                    }

                    let next_step = completed_step + 1;
                    let max_step: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM workflow_run_steps WHERE run_id = ?"
                    )
                    .bind(run_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap_or(0);

                    if next_step >= max_step {
                        // Workflow completed
                        let _ = sqlx::query(
                            "UPDATE workflow_runs SET status = 'completed', current_step = ?, completed_at = ? WHERE id = ?"
                        )
                        .bind(next_step)
                        .bind(now)
                        .bind(run_id)
                        .execute(&pool)
                        .await;

                        let _ = sqlx::query(
                            "UPDATE project_tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE project_id = ? AND status = 'running'"
                        )
                        .bind(now)
                        .bind(now)
                        .bind(&rec_project)
                        .execute(&pool)
                        .await;
                        log::info!("auto_delegate_chat: workflow completed (auto_push), marked tasks as done for project {}", rec_project);
                    } else {
                        // Advance to next step
                        let _ = sqlx::query(
                            "UPDATE workflow_runs SET current_step = ? WHERE id = ?"
                        )
                        .bind(next_step)
                        .bind(run_id)
                        .execute(&pool)
                        .await;

                        let _ = sqlx::query(
                            "UPDATE workflow_run_steps SET status = 'running', started_at = COALESCE(started_at, ?) WHERE run_id = ? AND step_index = ? AND status = 'pending'"
                        )
                        .bind(now)
                        .bind(run_id)
                        .bind(next_step)
                        .execute(&pool)
                        .await;
                    }
                }

                // Emit event to trigger next workflow execution
                let _ = rec_app.emit("workflow_auto_push_completed", serde_json::json!({
                    "projectId": rec_project,
                    "roleId": rec_role,
                }));
            }

            // Emit artifact status change events
            let _ = rec_app.emit("artifacts_updated", serde_json::json!({
                "projectId": rec_project,
                "roleId": rec_role,
            }));
        });
    }

    Ok(AutoDelegateResult {
        from_role_id,
        from_role_name: from_name,
        to_role_id,
        to_role_name: to_name,
        message_sent: delegate_message,
        reply,
        artifact_id: None,
    })
}

#[tauri::command]
pub async fn run_workflow_auto_chat(app: AppHandle, project_id: String, start_role_id: String, initial_message: String, event_id: String) -> Result<Vec<AutoDelegateResult>, String> {
    let pool = get_pool(&app)?;

    let mut results: Vec<AutoDelegateResult> = Vec::new();
    let mut current_role_id = start_role_id.clone();
    let mut current_message = initial_message.clone();
    let mut visited = std::collections::HashSet::new();
    visited.insert(start_role_id.clone());

    let max_steps = 5;
    for step in 0..max_steps {
        let workflows: Vec<(String, String, String, String)> = sqlx::query_as(
            "SELECT id, from_role_id, to_role_id, transition_type FROM project_workflows WHERE project_id = ? AND from_role_id = ? AND transition_type = 'auto_push' ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .bind(&current_role_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        if workflows.is_empty() {
            break;
        }

        for (_wf_id, _from_id, to_role_id, _transition_type) in &workflows {
            if visited.contains(to_role_id) {
                continue;
            }
            visited.insert(to_role_id.clone());

            let _ = app.emit(&event_id, serde_json::json!({
                "step": step,
                "stepIndex": results.len(),
                "fromRoleId": current_role_id,
                "toRoleId": to_role_id,
                "done": false,
            }));

            let step_event_id = format!("{}-{}", event_id, results.len());
            let result = auto_delegate_chat(
                app.clone(),
                project_id.clone(),
                current_role_id.clone(),
                to_role_id.clone(),
                current_message.clone(),
                step_event_id,
            )
            .await?;

            current_message = result.reply.clone();

            let _ = app.emit(&event_id, serde_json::json!({
                "step": step,
                "stepIndex": results.len(),
                "fromRoleId": result.from_role_id,
                "fromRoleName": result.from_role_name,
                "toRoleId": result.to_role_id,
                "toRoleName": result.to_role_name,
                "reply": result.reply,
                "stepDone": true,
                "done": false,
            }));

            results.push(result);
            current_role_id = to_role_id.clone();
        }
    }

    let _ = app.emit(&event_id, serde_json::json!({
        "done": true,
        "totalSteps": results.len(),
    }));

    Ok(results)
}

#[tauri::command]
pub async fn claim_project_task(app: AppHandle, task_id: String, role_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    let expire_at = now + 30 * 60 * 1000;

    let claim_lock: String = sqlx::query_scalar("SELECT claim_lock FROM project_tasks WHERE id = ?")
        .bind(&task_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    if !claim_lock.is_empty() && claim_lock != role_id {
        let expire: i64 = sqlx::query_scalar("SELECT claim_expire_at FROM project_tasks WHERE id = ?")
            .bind(&task_id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
        if expire > now {
            return Err(format!("Task is already claimed by {}", claim_lock));
        }
    }

    sqlx::query("UPDATE project_tasks SET claim_lock = ?, claim_expire_at = ?, status = 'running', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?")
        .bind(&role_id)
        .bind(expire_at)
        .bind(now)
        .bind(now)
        .bind(&task_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("INSERT INTO task_events (id, task_id, event_type, role_id, detail, created_at) VALUES (?, ?, 'claimed', ?, '', ?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&task_id)
        .bind(&role_id)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let project_id: String = sqlx::query_scalar("SELECT project_id FROM project_tasks WHERE id = ?")
        .bind(&task_id)
        .fetch_one(&pool)
        .await
        .unwrap_or_default();
    let _ = record_activity(&app, &project_id, Some(&role_id), "task_claimed", Some("task"), Some(&task_id), "认领了任务").await;

    Ok(())
}

#[tauri::command]
pub async fn heartbeat_task_claim(app: AppHandle, task_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    let expire_at = now + 30 * 60 * 1000;

    sqlx::query("UPDATE project_tasks SET claim_expire_at = ? WHERE id = ? AND claim_lock != ''")
        .bind(expire_at)
        .bind(&task_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn release_task_claim(app: AppHandle, task_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let claim_lock: String = sqlx::query_scalar("SELECT claim_lock FROM project_tasks WHERE id = ?")
        .bind(&task_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE project_tasks SET claim_lock = '', claim_expire_at = 0, updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(&task_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("INSERT INTO task_events (id, task_id, event_type, role_id, detail, created_at) VALUES (?, ?, 'released', ?, '', ?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&task_id)
        .bind(&claim_lock)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn add_task_comment(app: AppHandle, req: db::CreateTaskCommentRequest) -> Result<db::TaskComment, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO task_comments (id, task_id, role_id, content, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.task_id)
        .bind(&req.role_id)
        .bind(&req.content)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("INSERT INTO task_events (id, task_id, event_type, role_id, detail, created_at) VALUES (?, ?, 'commented', ?, ?, ?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&req.task_id)
        .bind(&req.role_id)
        .bind(&req.content)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::TaskComment {
        id,
        task_id: req.task_id,
        role_id: req.role_id,
        content: req.content,
        created_at: now,
    })
}

#[tauri::command]
pub async fn list_task_comments(app: AppHandle, task_id: String) -> Result<Vec<db::TaskComment>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, i64)>(
        "SELECT id, task_id, role_id, content, created_at FROM task_comments WHERE task_id = ? ORDER BY created_at ASC"
    )
    .bind(&task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, task_id, role_id, content, created_at)| db::TaskComment {
        id, task_id, role_id, content, created_at,
    }).collect())
}

#[tauri::command]
pub async fn link_tasks(app: AppHandle, from_task_id: String, to_task_id: String, link_type: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO task_links (id, from_task_id, to_task_id, link_type, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&from_task_id)
        .bind(&to_task_id)
        .bind(&link_type)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn unlink_tasks(app: AppHandle, link_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM task_links WHERE id = ?")
        .bind(&link_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_task_links(app: AppHandle, task_id: String) -> Result<Vec<db::TaskLink>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, i64)>(
        "SELECT id, from_task_id, to_task_id, link_type, created_at FROM task_links WHERE from_task_id = ? OR to_task_id = ? ORDER BY created_at ASC"
    )
    .bind(&task_id)
    .bind(&task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, from_task_id, to_task_id, link_type, created_at)| db::TaskLink {
        id, from_task_id, to_task_id, link_type, created_at,
    }).collect())
}

#[tauri::command]
pub async fn list_task_events(app: AppHandle, task_id: String) -> Result<Vec<db::TaskEvent>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, String, i64)>(
        "SELECT id, task_id, event_type, role_id, detail, created_at FROM task_events WHERE task_id = ? ORDER BY created_at ASC"
    )
    .bind(&task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, task_id, event_type, role_id, detail, created_at)| db::TaskEvent {
        id, task_id, event_type, role_id, detail, created_at,
    }).collect())
}

#[tauri::command]
pub async fn start_workflow_run(app: AppHandle, project_id: String, initial_message: String) -> Result<db::WorkflowRun, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let workflows: Vec<(String, Option<String>, String, String, i64)> = sqlx::query_as(
        "SELECT id, from_role_id, to_role_id, transition_type, sort_order FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if workflows.is_empty() {
        return Err("No workflows defined for this project".to_string());
    }

    sqlx::query("INSERT INTO workflow_runs (id, project_id, workflow_id, current_step, status, context, started_at) VALUES (?, ?, NULL, 0, 'running', '{}', ?)")
        .bind(&id)
        .bind(&project_id)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // Insert "开始" step as step 0
    let start_step_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO workflow_run_steps (id, run_id, step_index, role_id, action, status, input, output) VALUES (?, ?, 0, NULL, 'start', 'completed', ?, '')")
        .bind(&start_step_id)
        .bind(&id)
        .bind(&initial_message)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // Insert workflow steps starting from step_index 1
    for (i, (_wf_id, from_role_id, to_role_id, transition_type, _sort_order)) in workflows.iter().enumerate() {
        let step_id = uuid::Uuid::new_v4().to_string();
        let role_id = Some(to_role_id.clone());
        let step_index = (i + 1) as i64; // offset by 1 because step 0 is "开始"
        sqlx::query("INSERT INTO workflow_run_steps (id, run_id, step_index, role_id, action, status, input, output) VALUES (?, ?, ?, ?, ?, 'pending', ?, '')")
            .bind(&step_id)
            .bind(&id)
            .bind(step_index)
            .bind(&role_id)
            .bind(transition_type)
            .bind(&initial_message)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Set step 1 to "running" and trigger the first real role
    sqlx::query("UPDATE workflow_run_steps SET status = 'running', started_at = ? WHERE run_id = ? AND step_index = 1")
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // Trigger the start node transition (from_role_id = "" represents the start node)
    {
        let app_trigger = app.clone();
        let project_id_trigger = project_id.clone();
        tauri::async_runtime::spawn(async move {
            log::info!("start_workflow_run: triggering start node transition for project_id={}", project_id_trigger);
            // Use empty from_role_id to represent the start node, so the "start → first_role" transition is executed
            match trigger_workflow_execution(app_trigger, project_id_trigger, String::new(), None, None, Some(true)).await {
                Ok(result) => log::info!("start_workflow_run: triggered={}, pending={}", result.triggered_workflows.len(), result.pending_approvals.len()),
                Err(e) => log::error!("start_workflow_run: trigger error={}", e),
            }
        });
    }

    let _ = app.emit("workflow_run_started", serde_json::json!({
        "runId": id,
        "projectId": project_id,
    }));

    Ok(db::WorkflowRun {
        id,
        project_id,
        workflow_id: None,
        current_step: 0,
        status: "running".to_string(),
        context: "{}".to_string(),
        started_at: now,
        completed_at: None,
    })
}

#[tauri::command]
pub async fn pause_workflow_run(app: AppHandle, run_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("UPDATE workflow_runs SET status = 'paused' WHERE id = ? AND status = 'running'")
        .bind(&run_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("workflow_run_paused", serde_json::json!({ "runId": run_id, "timestamp": now }));

    Ok(())
}

#[tauri::command]
pub async fn resume_workflow_run(app: AppHandle, run_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("UPDATE workflow_runs SET status = 'running' WHERE id = ? AND status = 'paused'")
        .bind(&run_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("workflow_run_resumed", serde_json::json!({ "runId": run_id, "timestamp": now }));

    Ok(())
}

#[tauri::command]
pub async fn confirm_workflow_step(app: AppHandle, run_id: String, approved: bool, comment: Option<String>) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let current_step: i64 = sqlx::query_scalar("SELECT current_step FROM workflow_runs WHERE id = ?")
        .bind(&run_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let project_id: String = sqlx::query_scalar("SELECT project_id FROM workflow_runs WHERE id = ?")
        .bind(&run_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if approved {
        sqlx::query("UPDATE workflow_run_steps SET status = 'completed', completed_at = ? WHERE run_id = ? AND step_index = ?")
            .bind(now)
            .bind(&run_id)
            .bind(current_step)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

        let _ = record_activity(&app, &project_id, None, "workflow_step_completed", Some("workflow"), Some(&run_id), &format!("工作流步骤 {} 已确认通过", current_step)).await;

        // Get the current step's role_id (the role that just completed) for triggering downstream
        let current_role_id: Option<String> = sqlx::query_scalar(
            "SELECT role_id FROM workflow_run_steps WHERE run_id = ? AND step_index = ?"
        )
        .bind(&run_id)
        .bind(current_step)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let next_step = current_step + 1;
        let max_step: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workflow_run_steps WHERE run_id = ?")
            .bind(&run_id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

        if next_step >= max_step {
            sqlx::query("UPDATE workflow_runs SET status = 'completed', current_step = ?, completed_at = ? WHERE id = ?")
                .bind(next_step)
                .bind(now)
                .bind(&run_id)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

            let _ = sqlx::query(
                "UPDATE project_tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE project_id = ? AND status = 'running'"
            )
            .bind(now)
            .bind(now)
            .bind(&project_id)
            .execute(&pool)
            .await;
            log::info!("confirm_workflow_step: workflow completed, marked tasks as done for project {}", project_id);

            let _ = record_activity(&app, &project_id, None, "workflow_completed", Some("workflow"), Some(&run_id), "工作流运行完成").await;
        } else {
            sqlx::query("UPDATE workflow_runs SET current_step = ? WHERE id = ?")
                .bind(next_step)
                .bind(&run_id)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

            sqlx::query("UPDATE workflow_run_steps SET status = 'running', started_at = ? WHERE run_id = ? AND step_index = ?")
                .bind(now)
                .bind(&run_id)
                .bind(next_step)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

            // Trigger workflow execution using the CURRENT step's role_id as from_role_id
            // This will find workflows from the current role to downstream roles and delegate work
            if let Some(from_role_id) = current_role_id {
                if !from_role_id.is_empty() {
                    let _ = trigger_workflow_execution(
                        app.clone(),
                        project_id.clone(),
                        from_role_id,
                        None,
                        None,
                        None,
                    ).await;
                }
            }
        }
    } else {
        // Rejected: mark step as rejected but do NOT terminate the entire run
        sqlx::query("UPDATE workflow_run_steps SET status = 'rejected', completed_at = ?, output = ? WHERE run_id = ? AND step_index = ?")
            .bind(now)
            .bind(comment.clone().unwrap_or_default())
            .bind(&run_id)
            .bind(current_step)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

        let _ = record_activity(&app, &project_id, None, "workflow_step_rejected", Some("workflow"), Some(&run_id), &format!("工作流步骤 {} 被拒绝", current_step)).await;

        // Get the rejected step's role info
        let step_info: Option<(String, String)> = sqlx::query_as(
            "SELECT role_id, action FROM workflow_run_steps WHERE run_id = ? AND step_index = ?"
        )
        .bind(&run_id)
        .bind(current_step)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some((step_role_id, step_action)) = step_info {
            if !step_role_id.is_empty() {
                // Create a new retry step at current_step position with status "pending"
                // First, shift all later steps' index by 1
                let max_step: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workflow_run_steps WHERE run_id = ?")
                    .bind(&run_id)
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                for shift_idx in (current_step + 1..max_step).rev() {
                    sqlx::query("UPDATE workflow_run_steps SET step_index = step_index + 1 WHERE run_id = ? AND step_index = ?")
                        .bind(&run_id)
                        .bind(shift_idx)
                        .execute(&pool)
                        .await
                        .map_err(|e| e.to_string())?;
                }

                // Insert retry step
                let retry_step_id = uuid::Uuid::new_v4().to_string();
                let retry_comment = comment.clone().unwrap_or_default();
                sqlx::query("INSERT INTO workflow_run_steps (id, run_id, step_index, role_id, action, status, input, output) VALUES (?, ?, ?, ?, 'need_confirm', 'pending', ?, '')")
                    .bind(&retry_step_id)
                    .bind(&run_id)
                    .bind(current_step + 1)
                    .bind(&step_role_id)
                    .bind(&format!("驳回重试：{}", retry_comment))
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                // Set current_step to the retry step
                sqlx::query("UPDATE workflow_runs SET current_step = ? WHERE id = ?")
                    .bind(current_step + 1)
                    .bind(&run_id)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                // Set retry step to running
                sqlx::query("UPDATE workflow_run_steps SET status = 'running', started_at = ? WHERE run_id = ? AND step_index = ?")
                    .bind(now)
                    .bind(&run_id)
                    .bind(current_step + 1)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                // Trigger AI to rework based on rejection comment
                let app_retry = app.clone();
                let project_id_retry = project_id.clone();
                let retry_comment_for_chat = comment.clone().unwrap_or_default();
                tauri::async_runtime::spawn(async move {
                    log::info!("confirm_workflow_step(rejected): triggering AI rework for role_id={}", step_role_id);

                    // Find the latest artifact for this role to update
                    let pool_retry = get_pool(&app_retry).unwrap();

                    // Update existing submitted artifact to rejected
                    // Then create a new in_progress artifact for the role
                    let new_artifact_id = uuid::Uuid::new_v4().to_string();
                    let now_retry = chrono::Utc::now().timestamp_millis();
                    let _ = sqlx::query(
                        "INSERT INTO project_artifacts (id, project_id, role_id, artifact_type, title, content, status, run_step_id, created_at, updated_at) \
                         SELECT ?, project_id, role_id, artifact_type, ? || ' - 修改稿', '', 'in_progress', ?, ?, ? \
                         FROM project_artifacts WHERE project_id = ? AND role_id = ? AND status = 'submitted' \
                         ORDER BY updated_at DESC LIMIT 1"
                    )
                    .bind(&new_artifact_id)
                    .bind(if step_action == "need_confirm" { "审批产物" } else { "自动产物" })
                    .bind(&retry_step_id)
                    .bind(now_retry)
                    .bind(now_retry)
                    .bind(&project_id_retry)
                    .bind(&step_role_id)
                    .execute(&pool_retry)
                    .await;

                    // Notify the role to rework
                    let context_msg = format!(
                        "你的产物被驳回，请根据以下意见修改后重新提交：\n{}",
                        retry_comment_for_chat
                    );
                    let event_id = format!("wf_retry_{}_{}", project_id_retry, retry_step_id);
                    let _ = crate::commands::project::auto_delegate_chat(
                        app_retry,
                        project_id_retry,
                        "builtin_user".to_string(),
                        step_role_id,
                        context_msg,
                        event_id,
                    ).await;
                });
            }
        }
    }

    let _ = app.emit("workflow_step_confirmed", serde_json::json!({
        "runId": run_id,
        "stepIndex": current_step,
        "approved": approved,
    }));

    Ok(())
}

#[tauri::command]
pub async fn list_workflow_runs(app: AppHandle, project_id: String) -> Result<Vec<db::WorkflowRun>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, Option<String>, i64, String, String, i64, Option<i64>)>(
        "SELECT id, project_id, workflow_id, current_step, status, context, started_at, completed_at FROM workflow_runs WHERE project_id = ? ORDER BY started_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, workflow_id, current_step, status, context, started_at, completed_at)| db::WorkflowRun {
        id, project_id, workflow_id, current_step, status, context, started_at, completed_at,
    }).collect())
}

#[tauri::command]
pub async fn get_workflow_run_status(app: AppHandle, run_id: String) -> Result<db::WorkflowRunStatus, String> {
    let pool = get_pool(&app)?;

    let run_row = sqlx::query_as::<_, (String, String, Option<String>, i64, String, String, i64, Option<i64>)>(
        "SELECT id, project_id, workflow_id, current_step, status, context, started_at, completed_at FROM workflow_runs WHERE id = ?"
    )
    .bind(&run_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Run not found")?;

    let run = db::WorkflowRun {
        id: run_row.0,
        project_id: run_row.1,
        workflow_id: run_row.2,
        current_step: run_row.3,
        status: run_row.4,
        context: run_row.5,
        started_at: run_row.6,
        completed_at: run_row.7,
    };

    let step_rows = sqlx::query_as::<_, (String, String, i64, Option<String>, String, String, String, String, Option<i64>, Option<i64>)>(
        "SELECT id, run_id, step_index, role_id, action, status, input, output, started_at, completed_at FROM workflow_run_steps WHERE run_id = ? ORDER BY step_index ASC"
    )
    .bind(&run_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let steps = step_rows.into_iter().map(|(id, run_id, step_index, role_id, action, status, input, output, started_at, completed_at)| db::WorkflowRunStep {
        id, run_id, step_index, role_id, action, status, input, output, started_at, completed_at,
    }).collect();

    Ok(db::WorkflowRunStatus { run, steps })
}

#[tauri::command]
pub async fn create_artifact_version(app: AppHandle, artifact_id: String) -> Result<db::ArtifactVersion, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let (content, file_path): (String, String) = sqlx::query_as(
        "SELECT content, file_path FROM project_artifacts WHERE id = ?"
    )
    .bind(&artifact_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let max_version: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(version) FROM artifact_versions WHERE artifact_id = ?"
    )
    .bind(&artifact_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let version = max_version.unwrap_or(0) + 1;

    sqlx::query("INSERT INTO artifact_versions (id, artifact_id, version, content, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&artifact_id)
        .bind(version)
        .bind(&content)
        .bind(&file_path)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ArtifactVersion {
        id,
        artifact_id,
        version,
        content,
        file_path,
        created_at: now,
    })
}

#[tauri::command]
pub async fn list_artifact_versions(app: AppHandle, artifact_id: String) -> Result<Vec<db::ArtifactVersion>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, i64, String, String, i64)>(
        "SELECT id, artifact_id, version, content, file_path, created_at FROM artifact_versions WHERE artifact_id = ? ORDER BY version DESC"
    )
    .bind(&artifact_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, artifact_id, version, content, file_path, created_at)| db::ArtifactVersion {
        id, artifact_id, version, content, file_path, created_at,
    }).collect())
}

#[tauri::command]
pub async fn get_artifact_version(app: AppHandle, id: String) -> Result<db::ArtifactVersion, String> {
    let pool = get_pool(&app)?;
    let row = sqlx::query_as::<_, (String, String, i64, String, String, i64)>(
        "SELECT id, artifact_id, version, content, file_path, created_at FROM artifact_versions WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Version not found")?;

    Ok(db::ArtifactVersion {
        id: row.0,
        artifact_id: row.1,
        version: row.2,
        content: row.3,
        file_path: row.4,
        created_at: row.5,
    })
}

#[tauri::command]
pub async fn diff_artifact_versions(app: AppHandle, from_id: String, to_id: String) -> Result<db::ArtifactDiff, String> {
    let from_version = get_artifact_version(app.clone(), from_id).await?;
    let to_version = get_artifact_version(app, to_id).await?;

    let from_lines: Vec<&str> = from_version.content.lines().collect();
    let to_lines: Vec<&str> = to_version.content.lines().collect();

    let mut additions = 0i64;
    let mut deletions = 0i64;
    let mut diff_text = String::new();

    let max_len = from_lines.len().max(to_lines.len());
    for i in 0..max_len {
        let from_line = from_lines.get(i);
        let to_line = to_lines.get(i);
        match (from_line, to_line) {
            (Some(_), None) => { deletions += 1; }
            (None, Some(_)) => { additions += 1; }
            (Some(f), Some(t)) if f != t => { additions += 1; deletions += 1; }
            _ => {}
        }
    }

    if from_version.content != to_version.content {
        diff_text = format!("--- v{}\n+++ v{}\n", from_version.version, to_version.version);
    }

    Ok(db::ArtifactDiff {
        from_version,
        to_version,
        additions,
        deletions,
        diff_text,
    })
}

#[tauri::command]
pub async fn bind_role_skill(app: AppHandle, role_id: String, skill_name: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT OR IGNORE INTO role_skills (id, role_id, skill_name, enabled, created_at) VALUES (?, ?, ?, 1, ?)")
        .bind(&id)
        .bind(&role_id)
        .bind(&skill_name)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn unbind_role_skill(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM role_skills WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_role_skills(app: AppHandle, role_id: String) -> Result<Vec<db::RoleSkill>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, bool, i64)>(
        "SELECT id, role_id, skill_name, enabled, created_at FROM role_skills WHERE role_id = ? ORDER BY created_at ASC"
    )
    .bind(&role_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, role_id, skill_name, enabled, created_at)| db::RoleSkill {
        id, role_id, skill_name, enabled, created_at,
    }).collect())
}

#[tauri::command]
pub async fn list_project_activities(app: AppHandle, project_id: String, limit: Option<i64>) -> Result<Vec<db::ProjectActivity>, String> {
    let pool = get_pool(&app)?;
    let limit = limit.unwrap_or(50);

    let rows = sqlx::query_as::<_, (String, String, Option<String>, String, Option<String>, Option<String>, String, i64)>(
        "SELECT id, project_id, role_id, action, target_type, target_id, detail, created_at FROM project_activities WHERE project_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .bind(&project_id)
    .bind(limit)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, action, target_type, target_id, detail, created_at)| db::ProjectActivity {
        id, project_id, role_id, action, target_type, target_id, detail, created_at,
    }).collect())
}

#[tauri::command]
pub async fn get_project_stats(app: AppHandle, project_id: String) -> Result<db::ProjectStats, String> {
    let pool = get_pool(&app)?;

    let task_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT status, COUNT(*) FROM project_tasks WHERE project_id = ? GROUP BY status"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut by_status = std::collections::HashMap::new();
    let mut total: i64 = 0;
    let mut done_count: i64 = 0;
    for (status, count) in &task_rows {
        by_status.insert(status.clone(), *count);
        total += count;
        if status == "done" {
            done_count = *count;
        }
    }
    let completion_rate = if total > 0 { done_count as f64 / total as f64 } else { 0.0 };

    let artifact_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT status, COUNT(*) FROM project_artifacts WHERE project_id = ? GROUP BY status"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut artifact_by_status = std::collections::HashMap::new();
    let mut artifact_total: i64 = 0;
    let mut approved_count: i64 = 0;
    for (status, count) in &artifact_rows {
        artifact_by_status.insert(status.clone(), *count);
        artifact_total += count;
        if status == "approved" {
            approved_count = *count;
        }
    }
    let approval_rate = if artifact_total > 0 { approved_count as f64 / artifact_total as f64 } else { 0.0 };

    let workload_rows: Vec<(String, String, i64, i64)> = sqlx::query_as(
        "SELECT t.assignee, r.name, COUNT(*), SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) FROM project_tasks t LEFT JOIN ai_roles r ON t.assignee = r.id WHERE t.project_id = ? AND t.assignee != '' GROUP BY t.assignee"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let role_workload: Vec<db::RoleWorkload> = workload_rows.into_iter().map(|(role_id, name, task_count, completed_count)| db::RoleWorkload {
        role_id,
        name,
        task_count,
        completed_count,
        avg_duration: 0,
    }).collect();

    let health_score = if total > 0 {
        ((completion_rate * 60.0) + (approval_rate * 40.0)) as i64
    } else {
        100
    };

    Ok(db::ProjectStats {
        task_stats: db::TaskStats {
            total,
            by_status,
            completion_rate,
        },
        artifact_stats: db::ArtifactStats {
            total: artifact_total,
            by_status: artifact_by_status,
            approval_rate,
        },
        role_workload,
        health_score,
    })
}

#[tauri::command]
pub async fn create_project_memory(app: AppHandle, req: db::CreateProjectMemoryRequest) -> Result<db::ProjectMemory, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let category = req.category.unwrap_or_else(|| "general".to_string());
    let importance = req.importance.unwrap_or(0);

    sqlx::query("INSERT INTO project_memories (id, project_id, role_id, category, content, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&category)
        .bind(&req.content)
        .bind(importance)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectMemory {
        id,
        project_id: req.project_id,
        role_id: req.role_id,
        category,
        content: req.content,
        importance,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn list_project_memories(app: AppHandle, project_id: String, role_id: Option<String>, category: Option<String>) -> Result<Vec<db::ProjectMemory>, String> {
    let pool = get_pool(&app)?;

    let rows = match (&role_id, &category) {
        (Some(rid), Some(cat)) => {
            sqlx::query_as::<_, (String, String, String, String, String, i64, i64, i64)>(
                "SELECT id, project_id, role_id, category, content, importance, created_at, updated_at FROM project_memories WHERE project_id = ? AND role_id = ? AND category = ? ORDER BY importance DESC, updated_at DESC"
            )
            .bind(&project_id).bind(rid).bind(cat)
            .fetch_all(&pool).await
        }
        (Some(rid), None) => {
            sqlx::query_as::<_, (String, String, String, String, String, i64, i64, i64)>(
                "SELECT id, project_id, role_id, category, content, importance, created_at, updated_at FROM project_memories WHERE project_id = ? AND role_id = ? ORDER BY importance DESC, updated_at DESC"
            )
            .bind(&project_id).bind(rid)
            .fetch_all(&pool).await
        }
        (None, Some(cat)) => {
            sqlx::query_as::<_, (String, String, String, String, String, i64, i64, i64)>(
                "SELECT id, project_id, role_id, category, content, importance, created_at, updated_at FROM project_memories WHERE project_id = ? AND category = ? ORDER BY importance DESC, updated_at DESC"
            )
            .bind(&project_id).bind(cat)
            .fetch_all(&pool).await
        }
        (None, None) => {
            sqlx::query_as::<_, (String, String, String, String, String, i64, i64, i64)>(
                "SELECT id, project_id, role_id, category, content, importance, created_at, updated_at FROM project_memories WHERE project_id = ? ORDER BY importance DESC, updated_at DESC LIMIT 50"
            )
            .bind(&project_id)
            .fetch_all(&pool).await
        }
    }.map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, category, content, importance, created_at, updated_at)| db::ProjectMemory {
        id, project_id, role_id, category, content, importance, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn delete_project_memory(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM project_memories WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_project_file_records(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectFileRecord>, String> {
    let pool = get_pool(&app)?;
    let rows: Vec<(String, String, String, String, String, String, i64, String, String, i64, i64)> = sqlx::query_as(
        "SELECT id, project_id, role_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at FROM project_file_records WHERE project_id = ? AND status = 'active' ORDER BY created_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at)| db::ProjectFileRecord {
        id, project_id, role_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_project_file_record(app: AppHandle, req: db::CreateFileRecordRequest) -> Result<db::ProjectFileRecord, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    let id = uuid::Uuid::new_v4().to_string();
    let file_ext = req.file_ext.unwrap_or_else(|| {
        req.file_name.rsplit('.').next().unwrap_or("").to_string()
    });
    let file_size = req.file_size.unwrap_or(0);
    let description = req.description.unwrap_or_default();

    sqlx::query(
        "INSERT INTO project_file_records (id, project_id, role_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)"
    )
    .bind(&id)
    .bind(&req.project_id)
    .bind(&req.role_id)
    .bind(&req.file_path)
    .bind(&req.file_name)
    .bind(&file_ext)
    .bind(file_size)
    .bind(&description)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(db::ProjectFileRecord {
        id, project_id: req.project_id, role_id: req.role_id, file_path: req.file_path, file_name: req.file_name, file_ext, file_size, description, status: "active".to_string(), created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn delete_project_file_record(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("UPDATE project_file_records SET status = 'deleted', updated_at = ? WHERE id = ?")
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn scan_project_files(app: AppHandle, project_id: String, role_id: Option<String>) -> Result<Vec<db::ProjectFileRecord>, String> {
    let pool = get_pool(&app)?;

    let workspace_path: (String,) = sqlx::query_as(
        "SELECT workspace_path FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let workspace = workspace_path.0;
    if workspace.is_empty() {
        return Err("Project workspace path not set".to_string());
    }

    let workspace_dir = std::path::Path::new(&workspace);
    if !workspace_dir.exists() {
        return Ok(vec![]);
    }

    let existing_paths: Vec<String> = sqlx::query_scalar(
        "SELECT file_path FROM project_file_records WHERE project_id = ? AND status = 'active'"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let existing_set: std::collections::HashSet<String> = existing_paths.into_iter().collect();
    let mut new_records: Vec<db::ProjectFileRecord> = Vec::new();
    let default_role = role_id.clone().unwrap_or_default();

    if let Ok(entries) = scan_dir_recursive(workspace_dir, workspace_dir) {
        for (relative_path, file_name, file_size) in entries {
            if existing_set.contains(&relative_path) {
                continue;
            }
            if file_name.starts_with('.') {
                continue;
            }
            let file_ext = file_name.rsplit('.').next().unwrap_or("").to_string();
            let now = chrono::Utc::now().timestamp_millis();
            let id = uuid::Uuid::new_v4().to_string();

            sqlx::query(
                "INSERT INTO project_file_records (id, project_id, role_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', 'active', ?, ?)"
            )
            .bind(&id)
            .bind(&project_id)
            .bind(&default_role)
            .bind(&relative_path)
            .bind(&file_name)
            .bind(&file_ext)
            .bind(file_size as i64)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

            new_records.push(db::ProjectFileRecord {
                id, project_id: project_id.clone(), role_id: default_role.clone(), file_path: relative_path, file_name, file_ext, file_size: file_size as i64, description: String::new(), status: "active".to_string(), created_at: now, updated_at: now,
            });
        }
    }

    Ok(new_records)
}

fn scan_dir_recursive(base: &std::path::Path, dir: &std::path::Path) -> Result<Vec<(String, String, u64)>, String> {
    let mut results = Vec::new();
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

        if file_name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            let sub_results = scan_dir_recursive(base, &path)?;
            results.extend(sub_results);
        } else {
            let full_path = path.to_string_lossy().to_string();
            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            results.push((full_path, file_name, size));
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn record_chat_files(app: AppHandle, project_id: String, role_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    let workspace_path: (String,) = sqlx::query_as(
        "SELECT workspace_path FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let workspace = workspace_path.0;
    if workspace.is_empty() {
        return Ok(());
    }

    let workspace_dir = std::path::Path::new(&workspace);
    if !workspace_dir.exists() {
        return Ok(());
    }

    let existing_records: Vec<(String, String)> = sqlx::query_as(
        "SELECT file_path, role_id FROM project_file_records WHERE project_id = ? AND status = 'active'"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let existing_set: std::collections::HashSet<String> = existing_records.iter().map(|(p, _)| p.clone()).collect();

    if !role_id.is_empty() {
        for (path, rid) in &existing_records {
            if rid.is_empty() {
                let _ = sqlx::query(
                    "UPDATE project_file_records SET role_id = ? WHERE project_id = ? AND file_path = ? AND status = 'active' AND (role_id IS NULL OR role_id = '')"
                )
                .bind(&role_id)
                .bind(&project_id)
                .bind(path)
                .execute(&pool)
                .await;
            }
        }
    }

    if let Ok(entries) = scan_dir_recursive(workspace_dir, workspace_dir) {
        let now = chrono::Utc::now().timestamp_millis();
        for (relative_path, file_name, file_size) in entries {
            if existing_set.contains(&relative_path) {
                continue;
            }
            if file_name.starts_with('.') {
                continue;
            }
            let file_ext = file_name.rsplit('.').next().unwrap_or("").to_string();
            let id = uuid::Uuid::new_v4().to_string();

            let _ = sqlx::query(
                "INSERT INTO project_file_records (id, project_id, role_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', 'active', ?, ?)"
            )
            .bind(&id)
            .bind(&project_id)
            .bind(&role_id)
            .bind(&relative_path)
            .bind(&file_name)
            .bind(&file_ext)
            .bind(file_size as i64)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await;
        }
    }

    Ok(())
}
