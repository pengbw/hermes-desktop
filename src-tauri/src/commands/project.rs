use crate::commands::helpers::{self, AppState, call_hermes_api_non_streaming};
use crate::database::models as db;
use sqlx::{Row, SqlitePool};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};

use super::project_workflow::sync_workflow_to_file;
use super::project_execution::start_workflow_run;
pub(crate) fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<AppState>();
    Ok(state.db_pool.clone())
}

struct ContextTagRegex {
    re1: regex::Regex,
    re2: regex::Regex,
    re3: regex::Regex,
}

static CTX_TAG_REGEX: OnceLock<ContextTagRegex> = OnceLock::new();

pub(crate) fn clean_context_tags(text: &str) -> String {
    let regs = CTX_TAG_REGEX.get_or_init(|| ContextTagRegex {
        re1: regex::Regex::new(r"<memory[^>]*>[\s\S]*?</memory>").unwrap(),
        re2: regex::Regex::new(r"\[memory\][\s\S]*?\[/memory\]").unwrap(),
        re3: regex::Regex::new(r"<!--\s*memory[\s\S]*?-->").unwrap(),
    });
    let result = regs.re1.replace_all(text, "").to_string();
    let result = regs.re2.replace_all(&result, "").to_string();
    regs.re3.replace_all(&result, "").to_string()
}

pub(crate) async fn record_activity(app: &AppHandle, project_id: &str, role_id: Option<&str>, action: &str, target_type: Option<&str>, target_id: Option<&str>, detail: &str) -> Result<(), String> {
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

pub(crate) async fn mark_auto_delegate_failure(
    app: &AppHandle,
    project_id: &str,
    role_id: &str,
    event_id: Option<&str>,
    error_message: &str,
    task_id: Option<&str>,
) -> Result<(), String> {
    let pool = get_pool(app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let running_task_ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM project_tasks WHERE project_id = ? AND assignee = ? AND status = 'running'"
    )
    .bind(project_id)
    .bind(role_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    if let Some(tid) = task_id {
        let _ = sqlx::query(
            "UPDATE project_tasks SET status = 'failed', result = ?, completed_at = COALESCE(completed_at, ?), updated_at = ? \
             WHERE id = ? AND status = 'running'"
        )
        .bind(error_message)
        .bind(now)
        .bind(now)
        .bind(tid)
        .execute(&pool)
        .await;
    } else {
        let _ = sqlx::query(
            "UPDATE project_tasks SET status = 'failed', result = ?, completed_at = COALESCE(completed_at, ?), updated_at = ? \
             WHERE project_id = ? AND assignee = ? AND status = 'running'"
        )
        .bind(error_message)
        .bind(now)
        .bind(now)
        .bind(project_id)
        .bind(role_id)
        .execute(&pool)
        .await;
    }

    let running_steps: Vec<(String, i64)> = sqlx::query_as(
        "SELECT wr.id, wrs.step_index FROM workflow_runs wr \
         JOIN workflow_run_steps wrs ON wr.id = wrs.run_id \
         WHERE wr.project_id = ? AND wr.status = 'running' \
         AND wrs.role_id = ? AND wrs.status = 'running'"
    )
    .bind(project_id)
    .bind(role_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    for (run_id, step_index) in &running_steps {
        let _ = sqlx::query(
            "UPDATE workflow_run_steps SET status = 'failed', completed_at = ?, output = ? \
             WHERE run_id = ? AND step_index = ? AND status = 'running'"
        )
        .bind(now)
        .bind(error_message)
        .bind(run_id)
        .bind(step_index)
        .execute(&pool)
        .await;

        let _ = sqlx::query(
            "UPDATE workflow_runs SET status = 'failed', completed_at = ? \
             WHERE id = ? AND status = 'running'"
        )
        .bind(now)
        .bind(run_id)
        .execute(&pool)
        .await;
    }

    crate::commands::helpers::debounced_emit(app, project_id, "tasks");
    crate::commands::helpers::debounced_emit(app, project_id, "workflow_steps");
    crate::commands::helpers::debounced_emit(app, project_id, "artifacts");

    // 将角色 in_progress 状态的产物标记为失败，让角色状态恢复空闲
    let _ = sqlx::query(
        "UPDATE project_artifacts SET status = 'failed', review_comment = ?, updated_at = ? WHERE project_id = ? AND role_id = ? AND status = 'in_progress'"
    )
    .bind(error_message)
    .bind(now)
    .bind(project_id)
    .bind(role_id)
    .execute(&pool)
    .await;

    for task_id in running_task_ids {
        let _ = app.emit("task_status_changed", serde_json::json!({
            "projectId": project_id,
            "taskId": task_id,
            "newStatus": "failed",
        }));
    }

    let _ = app.emit("workflow_step_changed", serde_json::json!({
        "projectId": project_id,
        "fromRoleId": role_id,
        "error": error_message,
    }));

    if let Some(eid) = event_id {
        let _ = app.emit(eid, serde_json::json!({
            "projectId": project_id,
            "toRoleId": role_id,
            "error": error_message,
            "done": true,
        }));
    }

    let _ = record_activity(
        app,
        project_id,
        Some(role_id),
        "auto_delegate_failed",
        Some("workflow"),
        None,
        error_message,
    )
    .await;

    Ok(())
}

pub(crate) async fn repair_legacy_software_dev_workflow(
    pool: &SqlitePool,
    project_id: Option<&str>,
) -> Result<(), String> {
    let mut query = String::from(
        "SELECT DISTINCT project_id FROM project_workflows \
         WHERE from_role_id = 'builtin_software_dev_reviewer' \
         AND to_role_id = 'builtin_software_dev_dev' \
         AND artifact_type = '审查反馈' \
         AND transition_type = 'need_confirm'",
    );
    if project_id.is_some() {
        query.push_str(" AND project_id = ?");
    }

    let mut q = sqlx::query_scalar::<_, String>(&query);
    if let Some(pid) = project_id {
        q = q.bind(pid);
    }

    let project_ids = q.fetch_all(pool).await.map_err(|e| e.to_string())?;

    for pid in project_ids {
        let qa_to_reviewer_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM project_workflows \
             WHERE project_id = ? \
             AND from_role_id = 'builtin_software_dev_qa' \
             AND to_role_id = 'builtin_software_dev_reviewer' \
             AND artifact_type = '测试报告'",
        )
        .bind(&pid)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

        if qa_to_reviewer_count == 0 {
            continue;
        }

        sqlx::query(
            "UPDATE project_workflows SET transition_type = 'need_confirm' \
             WHERE project_id = ? \
             AND from_role_id = 'builtin_software_dev_qa' \
             AND to_role_id = 'builtin_software_dev_reviewer' \
             AND artifact_type = '测试报告'",
        )
        .bind(&pid)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query(
            "DELETE FROM project_workflows \
             WHERE project_id = ? \
             AND from_role_id = 'builtin_software_dev_reviewer' \
             AND to_role_id = 'builtin_software_dev_dev' \
             AND artifact_type = '审查反馈' \
             AND transition_type = 'need_confirm'",
        )
        .bind(&pid)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub(crate) async fn seed_builtin_templates(pool: &SqlitePool) -> Result<(), String> {
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

    let template_workflows: Vec<(&str, &str, Option<&str>, &str, &str, &str, &str)> = vec![
        // 软件开发流程
        ("software_dev_wf0", "software_dev", Some("start"), "builtin_software_dev_pm", "需求文档", "auto_push", ""),
        ("software_dev_wf1", "software_dev", Some("builtin_software_dev_pm"), "builtin_software_dev_dev", "需求规格", "need_confirm", ""),
        ("software_dev_wf2", "software_dev", Some("builtin_software_dev_dev"), "builtin_software_dev_qa", "代码实现", "auto_push", ""),
        ("software_dev_wf3", "software_dev", Some("builtin_software_dev_qa"), "builtin_software_dev_reviewer", "测试报告", "need_confirm", "builtin_software_dev_dev"),
        ("software_dev_wf4", "software_dev", Some("builtin_software_dev_reviewer"), "end", "结束", "auto_push", ""),
       
        // 内容创作流程
        ("content_creation_wf0", "content_creation", Some("start"), "builtin_content_creation_planner", "选题方向", "auto_push", ""),
        ("content_creation_wf1", "content_creation", Some("builtin_content_creation_planner"), "builtin_content_creation_writer", "内容大纲", "need_confirm", ""),
        ("content_creation_wf2", "content_creation", Some("builtin_content_creation_writer"), "builtin_content_creation_editor", "初稿", "auto_push", ""),
        ("content_creation_wf3", "content_creation", Some("builtin_content_creation_editor"), "builtin_content_creation_auditor", "修改稿", "auto_push", ""),
        ("content_creation_wf4", "content_creation", Some("builtin_content_creation_auditor"), "end", "结束", "need_confirm", "builtin_content_creation_planner"),

        // 数据分析流程
        ("data_analysis_wf0", "data_analysis", Some("start"), "builtin_data_analysis_ba", "分析需求", "auto_push", ""),
        ("data_analysis_wf1", "data_analysis", Some("builtin_data_analysis_ba"), "builtin_data_analysis_de", "数据需求", "auto_push", ""),
        ("data_analysis_wf2", "data_analysis", Some("builtin_data_analysis_de"), "builtin_data_analysis_ds", "数据集", "need_confirm", ""),
        ("data_analysis_wf3", "data_analysis", Some("builtin_data_analysis_ds"), "builtin_data_analysis_ba", "分析报告", "auto_push", ""),
        ("data_analysis_wf4", "data_analysis", Some("builtin_data_analysis_ba"), "end", "结束", "auto_push", ""),
        // 营销流程
        ("marketing_wf0", "marketing_campaign", Some("start"), "builtin_marketing_strategist", "营销需求", "auto_push", ""),
        ("marketing_wf1", "marketing_campaign", Some("builtin_marketing_strategist"), "builtin_marketing_creative", "策略方案", "need_confirm", ""),
        ("marketing_wf2", "marketing_campaign", Some("builtin_marketing_creative"), "builtin_marketing_executor", "创意素材", "auto_push", ""),
        ("marketing_wf3", "marketing_campaign", Some("builtin_marketing_executor"), "builtin_marketing_analyst", "执行数据", "auto_push", ""),
        ("marketing_wf4", "marketing_campaign", Some("builtin_marketing_analyst"), "end", "结束", "need_confirm", ""),
     
        // 游戏开发流程
        ("game_dev_wf0", "game_dev", Some("start"), "builtin_game_dev_designer", "游戏概念", "auto_push", ""),
        ("game_dev_wf1", "game_dev", Some("builtin_game_dev_designer"), "builtin_game_dev_artist", "设计文档", "need_confirm", ""),
        ("game_dev_wf2", "game_dev", Some("builtin_game_dev_artist"), "builtin_game_dev_coder", "美术资源", "auto_push", ""),
        ("game_dev_wf3", "game_dev", Some("builtin_game_dev_coder"), "builtin_game_dev_tester", "可玩版本", "auto_push", ""),
        ("game_dev_wf4", "game_dev", Some("builtin_game_dev_tester"), "end", "结束", "need_confirm", "builtin_game_dev_coder"),
        // 研究流程
        ("research_wf0", "research_project", Some("start"), "builtin_research_pi", "研究计划", "auto_push", ""),
        ("research_wf1", "research_project", Some("builtin_research_pi"), "builtin_research_lr", "文献综述", "need_confirm", ""),
        ("research_wf2", "research_project", Some("builtin_research_lr"), "builtin_research_er", "实验报告", "auto_push", ""),
        ("research_wf3", "research_project", Some("builtin_research_er"), "end", "结束", "need_confirm", ""),
    ];

    for (wf_id, tmpl_id, from_role, to_role, artifact, transition, reject_to) in &template_workflows {
        let id = format!("builtin_{}", wf_id);
        let template_id = format!("builtin_{}", tmpl_id);
        let sort_order: i64 = wf_id.rsplit('_').next()
            .map(|s| s.trim_start_matches("wf").parse().unwrap_or(0))
            .unwrap_or(0);

        sqlx::query(
            "INSERT INTO template_workflows (id, template_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET from_role_id=excluded.from_role_id, to_role_id=excluded.to_role_id, artifact_type=excluded.artifact_type, transition_type=excluded.transition_type, reject_to_role_id=excluded.reject_to_role_id, sort_order=excluded.sort_order"
        )
        .bind(&id)
        .bind(&template_id)
        .bind(*from_role)
        .bind(to_role)
        .bind(artifact)
        .bind(transition)
        .bind(*reject_to)
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
            "SELECT id, template_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, sort_order FROM template_workflows WHERE template_id = ? ORDER BY sort_order ASC"
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
        "SELECT id, template_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, sort_order FROM template_workflows WHERE template_id = ? ORDER BY sort_order ASC"
    )
    .bind(&req.template_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut role_ids: Vec<String> = Vec::new();
    for w in &template_workflows {
        if let Some(ref from) = w.from_role_id {
            if !from.is_empty() && from != "start" && from != "end" {
                role_ids.push(from.clone());
            }
        }
        if !w.to_role_id.is_empty() && w.to_role_id != "start" && w.to_role_id != "end" {
            role_ids.push(w.to_role_id.clone());
        }
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

    // 创建主流程组
    let primary_group_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO project_workflow_groups (id, project_id, name, is_primary, is_valid, parent_group_id, sort_order, created_at, updated_at) VALUES (?, ?, '主流程', 1, 1, NULL, 0, ?, ?)"
    )
    .bind(&primary_group_id)
    .bind(&project_id)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    for twf in &template_workflows {
        let wf_id = uuid::Uuid::new_v4().to_string();
        let from_role_id_for_insert = twf.from_role_id.as_ref().filter(|s| !s.is_empty());

        sqlx::query(
            "INSERT INTO project_workflows (id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', '', '', 1, ?, ?, ?)"
        )
        .bind(&wf_id)
        .bind(&project_id)
        .bind(from_role_id_for_insert)
        .bind(&twf.to_role_id)
        .bind(&twf.artifact_type)
        .bind(&twf.transition_type)
        .bind(&twf.reject_to_role_id)
        .bind(&primary_group_id)
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
pub(crate) async fn extract_and_save_memory(app: AppHandle, project_id: String, role_id: String, user_message: String, assistant_content: String) -> Result<(), String> {
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
        if user_message.len() > 500 { user_message.chars().take(500).collect::<String>() } else { user_message.clone() },
        if assistant_content.len() > 1000 { assistant_content.chars().take(1000).collect::<String>() } else { assistant_content.clone() }
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

        let body = serde_json::json!({
            "model": "default",
            "messages": [{"role": "user", "content": extract_prompt}],
        });

        let response = match call_hermes_api_non_streaming(&api_base, &api_key, &project_id, body).await {
            Ok(resp) => resp,
            Err(e) => {
                log::warn!("extract_and_save_memory: API call failed: {}", e);
                return Ok(());
            }
        };

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
        "SELECT COUNT(*) FROM project_workflows WHERE project_id = ? AND from_role_id = 'start' AND to_role_id = ?"
    )
    .bind(project_id)
    .bind(role_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    start_count > 0
}

#[tauri::command]
pub(crate) async fn do_dispatch_task(app: &AppHandle, pool: &sqlx::SqlitePool, task_id: &str, role_id: &str, project_id: &str, title: &str, body: &str, priority: i32, message: Option<&str>, dispatch_type: &str) -> Result<(), String> {
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
        // For start roles, start the workflow run which will trigger auto_delegate_chat
        let app_wf = app.clone();
        let project_id_wf = project_id.to_string();
        let initial_msg = title.to_string();
        let task_id_for_wf = task_id.to_string();
        match start_workflow_run(app_wf, project_id_wf, initial_msg, None, Some(task_id_for_wf)).await {
            Ok(run) => log::info!("start_workflow_run: created run_id={}, status={}", run.id, run.status),
            Err(e) => log::error!("start_workflow_run: error={}", e),
        }
    } else {
        // For non-start roles, delegate directly
        let app_clone = app.clone();
        let project_id_clone = project_id.to_string();
        let role_id_clone = role_id.to_string();
        let task_message_clone = task_message.clone();
        let found_task_id_clone = Some(task_id.to_string());
        tauri::async_runtime::spawn(async move {
            let _ = crate::commands::project_execution::auto_delegate_chat(
                app_clone, project_id_clone, "builtin_user".to_string(), role_id_clone, task_message_clone, event_id, found_task_id_clone,
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
pub async fn create_empty_project(app: AppHandle, req: db::CreateEmptyProjectRequest) -> Result<db::Project, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

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

    let description = req.description.unwrap_or_default();
    let icon = req.icon.unwrap_or_default();
    let office_theme = req.office_theme.unwrap_or_else(|| "cozy".to_string());

    let project_rule = "自定义项目，由项目创建者自主定义协作规范与交付标准。".to_string();
    let project_guidelines = "1. 自行定义角色职责与工作流程\n2. 明确每个任务的验收标准\n3. 产出物需经过审核确认\n4. 保持团队协作和信息同步".to_string();

    sqlx::query(
        "INSERT INTO projects (id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'none', ?, 0, '', ?, ?, ?, ?, ?)"
    )
    .bind(&id)
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

    let _ = record_activity(&app, &id, None, "project_created", Some("project"), Some(&id), "创建自定义项目").await;

    Ok(db::Project {
        id,
        name: req.name,
        description,
        workspace_path,
        status: "active".to_string(),
        tag: "none".to_string(),
        icon,
        is_favorite: 0,
        cover_image: String::new(),
        project_rule,
        project_guidelines,
        office_theme,
        office_layout: String::new(),
        created_at: now,
        updated_at: now,
    })
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
            "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at) VALUES (?, ?, ?, '', 'auto', ?, '', '', 'pending', '', NULL, NULL, ?, ?)"
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
        let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, String, bool, Option<String>, i64, i64)>(
            "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at)| db::ProjectWorkflow {
            id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at,
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
        // 创建主流程组
        let primary_group_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO project_workflow_groups (id, project_id, name, is_primary, is_valid, parent_group_id, sort_order, created_at, updated_at) VALUES (?, ?, '主流程', 1, 1, NULL, 0, ?, ?)"
        )
        .bind(&primary_group_id)
        .bind(&id)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

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

            sqlx::query("INSERT INTO project_workflows (id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)")
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
                .bind(&primary_group_id)
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

