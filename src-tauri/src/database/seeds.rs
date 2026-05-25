use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

pub type LocalizedString = HashMap<String, String>;

pub fn resolve_localized<'a>(loc: &'a LocalizedString, locale: &str) -> &'a str {
    if let Some(v) = loc.get(locale) {
        return v;
    }
    if let Some(v) = loc.get("zh-CN") {
        return v;
    }
    match loc.values().next() {
        Some(v) => v,
        None => "",
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProviderSeed {
    pub value: String,
    pub name: LocalizedString,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "apiKeyEnv")]
    pub api_key_env: String,
    pub icon: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProvidersData {
    pub version: String,
    pub providers: Vec<ProviderSeed>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct QuickCardSeed {
    pub id: String,
    pub name: LocalizedString,
    pub icon: String,
    pub prompt: LocalizedString,
    pub source: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct QuickCardsData {
    pub version: String,
    pub cards: Vec<QuickCardSeed>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GestureSeed {
    pub name: String,
    pub duration: i64,
    #[serde(rename = "lookAtX")]
    pub look_at_x: f64,
    #[serde(rename = "lookAtY")]
    pub look_at_y: f64,
    pub tilt: f64,
    #[serde(rename = "poseFile")]
    pub pose_file: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GesturesData {
    pub version: String,
    pub gestures: Vec<GestureSeed>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UIStyleSeed {
    pub name: String,
    pub label: LocalizedString,
    pub description: LocalizedString,
    pub spacing: HashMap<String, String>,
    pub radius: HashMap<String, String>,
    pub shadow: HashMap<String, String>,
    #[serde(rename = "borderWidth")]
    pub border_width: String,
    #[serde(rename = "componentDensity")]
    pub component_density: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UIStylesData {
    pub version: String,
    #[serde(rename = "defaultUIStyle")]
    pub default_ui_style: String,
    pub styles: Vec<UIStyleSeed>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TemplateRoleSeed {
    pub id: String,
    pub nickname: String,
    pub icon: String,
    pub name: LocalizedString,
    pub description: LocalizedString,
    pub responsibilities: LocalizedString,
    #[serde(rename = "soulContent")]
    pub soul_content: LocalizedString,
    #[serde(rename = "avatarPreset")]
    pub avatar_preset: String,
    #[serde(rename = "avatarColor")]
    pub avatar_color: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TemplateWorkflowSeed {
    pub id: String,
    #[serde(rename = "fromRoleId")]
    pub from_role_id: Option<String>,
    #[serde(rename = "toRoleId")]
    pub to_role_id: String,
    #[serde(rename = "artifactType")]
    pub artifact_type: LocalizedString,
    #[serde(rename = "transitionType")]
    pub transition_type: String,
    #[serde(rename = "rejectToRoleId")]
    pub reject_to_role_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectTemplateSeed {
    pub id: String,
    pub icon: String,
    pub name: LocalizedString,
    pub description: LocalizedString,
    #[serde(rename = "projectRule")]
    pub project_rule: LocalizedString,
    #[serde(rename = "projectGuidelines")]
    pub project_guidelines: LocalizedString,
    pub roles: Vec<TemplateRoleSeed>,
    pub workflows: Vec<TemplateWorkflowSeed>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectTemplatesData {
    pub version: String,
    pub templates: Vec<ProjectTemplateSeed>,
}

macro_rules! define_seed_loader {
    ($fn_name:ident, $data_type:ty, $file_path:expr) => {
        pub fn $fn_name() -> &'static $data_type {
            static CACHE: OnceLock<$data_type> = OnceLock::new();
            CACHE.get_or_init(|| {
                let raw = include_str!($file_path);
                serde_json::from_str::<$data_type>(raw)
                    .unwrap_or_else(|e| panic!("Failed to parse {}: {}", $file_path, e))
            })
        }
    };
}

define_seed_loader!(load_providers, ProvidersData, "../../resources/providers.json");
define_seed_loader!(load_quick_cards, QuickCardsData, "../../resources/quick-cards.json");
define_seed_loader!(load_gestures, GesturesData, "../../resources/gestures.json");
define_seed_loader!(load_ui_styles, UIStylesData, "../../resources/ui-styles.json");
define_seed_loader!(load_project_templates, ProjectTemplatesData, "../../resources/project-templates.json");
