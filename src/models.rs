use serde::{Deserialize, Serialize};
use axum::{
    extract::{FromRequestParts, FromRef},
    http::StatusCode,
    http::request::Parts,
};
use jsonwebtoken::{decode, DecodingKey, Validation};

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum FieldKind {
    Range { min: f64, max: f64, falloff: f64 },
    Categorical { options: Vec<String> },
    Boolean,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FieldSpec {
    pub(crate) key: String,
    pub(crate) label: String,
    pub(crate) description: String,
    pub(crate) weight: f64,
    pub(crate) kind: FieldKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum TargetValue {
    Range { lo: f64, hi: f64 },
    Set { values: Vec<String> },
    Want { value: Option<bool> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct CampaignField {
    pub(crate) key: String,
    pub(crate) label: String,
    #[serde(default)]
    pub(crate) description: String,
    pub(crate) weight: f64,
    pub(crate) kind: FieldKind,
    pub(crate) target: TargetValue,
    #[serde(default)]
    pub(crate) forced: bool,
}

impl CampaignField {
    pub(crate) fn spec(&self) -> FieldSpec {
        FieldSpec {
            key: self.key.clone(),
            label: self.label.clone(),
            description: self.description.clone(),
            weight: self.weight,
            kind: self.kind.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum FieldValue {
    Flag(bool),
    Number(f64),
    Text(String),
    List(Vec<String>),
}

pub(crate) fn default_field_schema() -> Vec<FieldSpec> {
    vec![
        FieldSpec {
            key: "age".into(),
            label: "Age".into(),
            description: "Viewer age in years. Campaigns target a range; users outside it match progressively less.".into(),
            weight: 0.9,
            kind: FieldKind::Range { min: 13.0, max: 80.0, falloff: 10.0 },
        },
        FieldSpec {
            key: "gender".into(),
            label: "Gender".into(),
            description: "Viewer gender. A campaign matches when the viewer's gender is in its selected set.".into(),
            weight: 0.9,
            kind: FieldKind::Categorical { options: vec!["male".into(), "female".into(), "nonbinary".into()] },
        },
        FieldSpec {
            key: "income".into(),
            label: "Income bracket".into(),
            description: "Relative income tier from 1 (lowest) to 10 (highest).".into(),
            weight: 0.8,
            kind: FieldKind::Range { min: 1.0, max: 10.0, falloff: 3.0 },
        },
        FieldSpec {
            key: "household".into(),
            label: "Household status".into(),
            description: "Household size / status tier from 1 to 10.".into(),
            weight: 0.8,
            kind: FieldKind::Range { min: 1.0, max: 10.0, falloff: 3.0 },
        },
        FieldSpec {
            key: "interests".into(),
            label: "Interests".into(),
            description: "Viewer interests. Overlap with the campaign's interests raises the match (empty targets everyone).".into(),
            weight: 0.8,
            kind: FieldKind::Categorical { options: vec!["gaming".into(), "sports".into(), "music".into(), "tech".into(), "finance".into()] },
        },
        FieldSpec {
            key: "risk_taker".into(),
            label: "Risk-taker".into(),
            description: "Whether the viewer is a risk-taker. Campaigns may require yes, no, or not care.".into(),
            weight: 0.9,
            kind: FieldKind::Boolean,
        },
        FieldSpec {
            key: "relaxed".into(),
            label: "Relaxed".into(),
            description: "Whether the viewer has a relaxed disposition.".into(),
            weight: 0.9,
            kind: FieldKind::Boolean,
        },
        FieldSpec {
            key: "open_new".into(),
            label: "Open to new".into(),
            description: "Whether the viewer is open to trying new things.".into(),
            weight: 0.9,
            kind: FieldKind::Boolean,
        },
        FieldSpec {
            key: "shopper".into(),
            label: "Shopper type".into(),
            description: "Shopping frequency of the viewer: frequent, occasional, or rare.".into(),
            weight: 0.9,
            kind: FieldKind::Categorical { options: vec!["frequent".into(), "occasional".into(), "rare".into()] },
        },
        FieldSpec {
            key: "price".into(),
            label: "Price sensitivity".into(),
            description: "Preferred price tier from 1 (cheap) to 10 (premium).".into(),
            weight: 0.9,
            kind: FieldKind::Range { min: 1.0, max: 10.0, falloff: 3.0 },
        },
        FieldSpec {
            key: "media".into(),
            label: "Media type".into(),
            description: "Where the viewer is watching: livestream, youtube, or webpage.".into(),
            weight: 0.8,
            kind: FieldKind::Categorical { options: vec!["livestream".into(), "youtube".into(), "webpage".into()] },
        },
    ]
}

#[derive(Deserialize, Serialize, Default, Clone)]
pub(crate) struct CampaignTargeting {
    pub(crate) target_age_min: Option<i32>,
    pub(crate) target_age_max: Option<i32>,
    pub(crate) target_genders: Option<Vec<String>>,
    pub(crate) target_income_min: Option<i32>,
    pub(crate) target_income_max: Option<i32>,
    pub(crate) target_household_min: Option<i32>,
    pub(crate) target_household_max: Option<i32>,
    pub(crate) target_locations: Option<Vec<String>>,
    pub(crate) target_languages: Option<Vec<String>>,
    pub(crate) target_interests: Option<Vec<String>>,
    pub(crate) want_risk_taker: Option<bool>,
    pub(crate) want_relaxed: Option<bool>,
    pub(crate) want_open_new: Option<bool>,
    pub(crate) target_shopper: Option<String>,
    pub(crate) target_price_min: Option<i32>,
    pub(crate) target_price_max: Option<i32>,
    pub(crate) target_media: Option<Vec<String>>,
}

pub(crate) struct ResolvedTargeting {
    pub(crate) age_min: i32,
    pub(crate) age_max: i32,
    pub(crate) genders: Vec<String>,
    pub(crate) income_min: i32,
    pub(crate) income_max: i32,
    pub(crate) household_min: i32,
    pub(crate) household_max: i32,
    pub(crate) locations: Vec<String>,
    pub(crate) languages: Vec<String>,
    pub(crate) interests: Vec<String>,
    pub(crate) want_risk_taker: Option<bool>,
    pub(crate) want_relaxed: Option<bool>,
    pub(crate) want_open_new: Option<bool>,
    pub(crate) shopper: String,
    pub(crate) price_min: i32,
    pub(crate) price_max: i32,
    pub(crate) media: Vec<String>,
}

impl CampaignTargeting {

    pub(crate) fn resolve(&self) -> ResolvedTargeting {
        ResolvedTargeting {
            age_min: self.target_age_min.unwrap_or(13),
            age_max: self.target_age_max.unwrap_or(80),
            genders: self.target_genders.clone()
                .unwrap_or_else(|| vec!["male".into(), "female".into(), "nonbinary".into()]),
            income_min: self.target_income_min.unwrap_or(1),
            income_max: self.target_income_max.unwrap_or(10),
            household_min: self.target_household_min.unwrap_or(1),
            household_max: self.target_household_max.unwrap_or(10),
            locations: self.target_locations.clone().unwrap_or_default(),
            languages: self.target_languages.clone().unwrap_or_default(),
            interests: self.target_interests.clone().unwrap_or_default(),
            want_risk_taker: self.want_risk_taker,
            want_relaxed: self.want_relaxed,
            want_open_new: self.want_open_new,
            shopper: self.target_shopper.clone().unwrap_or_else(|| "any".into()),
            price_min: self.target_price_min.unwrap_or(1),
            price_max: self.target_price_max.unwrap_or(10),
            media: self.target_media.clone().unwrap_or_default(),
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct CreateCampaignRequest {
    pub(crate) name: String,
    pub(crate) total_budget: f64,
    pub(crate) max_cpm: f64,
    pub(crate) target_categories: Vec<String>,
    #[serde(default)]
    pub(crate) status: Option<String>,
    #[serde(default)]
    pub(crate) target_fields: Option<Vec<CampaignField>>,
    #[serde(flatten)]
    pub(crate) targeting: CampaignTargeting,
}

#[derive(Serialize)]
pub(crate) struct CampaignStats {
    pub(crate) id: i32,
    pub(crate) name: String,
    pub(crate) total_budget: f64,
    pub(crate) max_cpm: f64,
    pub(crate) target_categories: Vec<String>,
    pub(crate) spent: f64,
    pub(crate) remaining: f64,
    pub(crate) impressions: i64,
    pub(crate) clicks: i64,
    pub(crate) is_active: bool,
    pub(crate) status: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) targeting: Option<CampaignTargeting>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) target_fields: Option<Vec<CampaignField>>,
}

#[derive(Deserialize)]
pub(crate) struct ClickRequest {
    pub(crate) campaign_id: i32,
}

#[derive(Deserialize)]
pub(crate) struct SimulateRequest {
    pub(crate) rate: u64,
    pub(crate) duration: u64,

    #[serde(default)]
    pub(crate) advertiser_id: Option<i32>,

    #[serde(default = "default_click_rate")]
    pub(crate) click_rate: f64,

    #[serde(default)]
    pub(crate) audience: Option<crate::targeting::AudienceConfig>,
}

fn default_click_rate() -> f64 {
    0.1
}

#[derive(Deserialize)]
pub(crate) struct SimulateControl {
    pub(crate) advertiser_id: Option<i32>,
}

#[derive(Deserialize)]
pub(crate) struct SimulateStatusQuery {
    pub(crate) advertiser_id: Option<i32>,
}
#[derive(Serialize, Clone)]
pub(crate) struct DecisionEvent {
    pub(crate) campaign_id: i32,
    pub(crate) campaign_name: String,
    pub(crate) cost: f64,
    pub(crate) status: String,
    pub(crate) category: String,
    pub(crate) timestamp: String,

    #[serde(default)]
    pub(crate) clicked: bool,
}

#[derive(Serialize)]
pub(crate) struct CampaignResponse {
    pub(crate) id: i32,
    pub(crate) name: String,
    pub(crate) status: String,
}

#[derive(Deserialize)]
pub(crate) struct LoginRequest {
    pub(crate) email: String,
    pub(crate) password_hash: String,
}

#[derive(Serialize)]
pub(crate) struct LoginResponse {
    pub(crate) token: String,
    pub(crate) role: String,
    pub(crate) id: i32,
    pub(crate) logo: String,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct Claims {
    pub(crate) sub: String,
    pub(crate) role: String,
    pub(crate) exp: usize,
}

pub(crate) struct AuthUser {
    pub(crate) user_id: i32,
    pub(crate) role: String,
}

impl AuthUser {
    pub(crate) fn require_operator(&self) -> Result<(), StatusCode> {
        if self.role == "operator" {
            Ok(())
        } else {
            Err(StatusCode::FORBIDDEN)
        }
    }
}

impl<S> FromRequestParts<S> for AuthUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);

        let token = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(app_state.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

        let user_id = data.claims.sub.parse::<i32>().map_err(|_| StatusCode::UNAUTHORIZED)?;

        Ok(AuthUser { user_id, role: data.claims.role })
    }
}

#[derive(Deserialize)]
pub(crate) struct DecisionRequest {
    pub(crate) category: String,

    #[serde(default)]
    pub(crate) user: Option<crate::targeting::UserProfile>,

    #[serde(default)]
    pub(crate) user_fields: Option<std::collections::HashMap<String, FieldValue>>,

    #[serde(default = "default_click_rate")]
    pub(crate) click_rate: f64,

    #[serde(default)]
    pub(crate) advertiser_id: Option<i32>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct DecisionResponse {
    pub(crate) campaign_id: i32,
    pub(crate) cost: f64,
    pub(crate) status: String,

    #[serde(default)]
    pub(crate) clicked: bool,

    #[serde(default)]
    pub(crate) click_prob: f64,
}

#[derive(Serialize)]
pub(crate) struct AnalyticsPoint {
    pub(crate) minute: String,
    pub(crate) impressions: u64,
    pub(crate) clicks: u64,
    pub(crate) spend: f64,
}

#[derive(Serialize)]
pub(crate) struct AdvertiserBudget {
    pub(crate) id: i32,
    pub(crate) advertiser_id: i32,
    pub(crate) name: String,
    pub(crate) advertiser: String,
    pub(crate) total_budget: f64,
    pub(crate) spent: f64,
    pub(crate) remaining: f64,
    pub(crate) impressions: i64,
    pub(crate) is_active: bool,
}

#[derive(Serialize)]
pub(crate) struct CompanyBudget {
    pub(crate) id: i32,
    pub(crate) email: String,
    pub(crate) name: String,
    pub(crate) logo: String,
    pub(crate) total_budget: f64,
    pub(crate) spent: f64,
    pub(crate) remaining: f64,
    pub(crate) campaigns: i64,
    pub(crate) impressions: i64,
}

#[derive(Deserialize)]
pub(crate) struct CreateAdvertiserRequest {
    pub(crate) email: String,
    pub(crate) password: String,
}

#[derive(Serialize)]
pub(crate) struct CreateAdvertiserResponse {
    pub(crate) id: i32,
    pub(crate) email: String,
}

/// The 15 built-in logos a company can pick from. Stored as a stable key;
/// the frontend maps each key to its picture.
pub(crate) const LOGO_OPTIONS: [&str; 15] = [
    "owl", "eagle", "penguin", "parrot", "flamingo",
    "fox", "tiger", "panda", "octopus", "whale",
    "walter", "dwight", "eleven", "spongebob", "homer",
];

pub(crate) fn is_valid_logo(logo: &str) -> bool {
    LOGO_OPTIONS.contains(&logo)
}

#[derive(Serialize)]
pub(crate) struct LogoResponse {
    pub(crate) logo: String,
}

#[derive(Deserialize)]
pub(crate) struct UpdateLogoRequest {
    pub(crate) logo: String,
}

#[derive(Deserialize)]
pub(crate) struct ChangePasswordRequest {
    pub(crate) current_password: String,
    pub(crate) new_password: String,
}

#[derive(Deserialize)]
pub(crate) struct UpdateCampaignRequest {
    pub(crate) name: String,
    pub(crate) max_cpm: f64,
    pub(crate) target_categories: Vec<String>,
    #[serde(default)]
    pub(crate) target_fields: Option<Vec<CampaignField>>,
    #[serde(flatten)]
    pub(crate) targeting: CampaignTargeting,
}

#[derive(Deserialize)]
pub(crate) struct AnalyticsQuery {
    pub(crate) advertiser_id: Option<i32>,
}

#[derive(Deserialize)]
pub(crate) struct AddBudgetRequest {
    pub(crate) amount: f64,
}
