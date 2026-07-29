use std::time::{SystemTime, UNIX_EPOCH};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde_json;
use redis::AsyncCommands;
use jsonwebtoken::{encode, Header, EncodingKey};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{SaltString, rand_core::OsRng};
use metrics::counter;

use crate::AppState;
use crate::models::*;
use crate::infra::parse_u64_field;

pub(crate) async fn record_click(
    State(state): State<AppState>,
    Json(payload): Json<ClickRequest>,
) -> Result<StatusCode, StatusCode> {
    sqlx::query("INSERT INTO clicks_log (campaign_id) VALUES ($1)")
        .bind(payload.campaign_id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    counter!("flashcast_clicks_total").increment(1);
    Ok(StatusCode::OK)
}

pub(crate) async fn campaign_stats(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> Result<(StatusCode, Json<CampaignStats>), StatusCode> {
    let row = sqlx::query(
        r#"
        SELECT
            c.id, c.name, c.total_budget::float, c.is_active,
            COALESCE(imp.spent, 0)::float AS spent,
            COALESCE(imp.impressions, 0) AS impressions,
            COALESCE(clk.clicks, 0) AS clicks,
            c.max_cpm::float,
            c.target_categories,
            c.status
        FROM campaigns c
        LEFT JOIN (
            SELECT campaign_id, SUM(cost) AS spent, COUNT(*) AS impressions
            FROM impressions_log GROUP BY campaign_id
        ) imp ON imp.campaign_id = c.id
        LEFT JOIN (
            SELECT campaign_id, COUNT(*) AS clicks
            FROM clicks_log GROUP BY campaign_id
        ) clk ON clk.campaign_id = c.id
        WHERE c.id = $1
        "#
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| { eprintln!("campaign_stats error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let total: f64 = sqlx::Row::get(&row, 2);
    let spent: f64 = sqlx::Row::get(&row, 4);
    Ok((StatusCode::OK, Json(CampaignStats {
        id: sqlx::Row::get(&row, 0),
        name: sqlx::Row::get(&row, 1),
        total_budget: total,
        max_cpm: sqlx::Row::get(&row, 7),
        target_categories: sqlx::Row::get(&row, 8),
        spent,
        remaining: total - spent,
        impressions: sqlx::Row::get(&row, 5),
        clicks: sqlx::Row::get(&row, 6),
        is_active: sqlx::Row::get(&row, 3),
        status: sqlx::Row::get(&row, 9),
        targeting: None,
        target_fields: None,
    })))
}

pub(crate) async fn get_analytics(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<AnalyticsQuery>,
) -> Result<(StatusCode, Json<Vec<AnalyticsPoint>>), StatusCode> {
    let scope_advertiser = if auth.role == "operator" {
        params.advertiser_id
    } else {
        Some(auth.user_id)
    };

    let mut campaign_filter = String::new();
    if let Some(advertiser_id) = scope_advertiser {
        let rows = sqlx::query("SELECT id FROM campaigns WHERE advertiser_id = $1")
            .bind(advertiser_id)
            .fetch_all(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let ids: Vec<String> = rows.iter()
            .map(|r| { let id: i32 = sqlx::Row::get(r, 0); id.to_string() })
            .collect();

        if ids.is_empty() {
            return Ok((StatusCode::OK, Json(vec![])));
        }
        campaign_filter = format!("AND campaign_id IN ({})", ids.join(","));
    }

    let http_client = reqwest::Client::new();
    let query = format!(r#"
        SELECT
            toStartOfInterval(toTimeZone(created_at, 'Europe/Istanbul'), INTERVAL 5 SECOND) AS minute,
            count() AS impressions,
            countIf(status = 'Clicked') AS clicks,
            sum(cost) AS spend
        FROM default.impressions
        WHERE created_at >= now() - INTERVAL 10 MINUTE {}
        GROUP BY minute
        ORDER BY minute
        FORMAT JSON
    "#, campaign_filter);

    let resp = http_client
        .post("http://127.0.0.1:8123/")
        .body(query)
        .send()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let text = resp.text().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let points: Vec<AnalyticsPoint> = json["data"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|row| AnalyticsPoint {
            minute: row["minute"].as_str().unwrap_or("").to_string(),
            impressions: parse_u64_field(&row["impressions"]),
            clicks: parse_u64_field(&row["clicks"]),
            spend: row["spend"].as_f64().unwrap_or(0.0),
        })
        .collect();

    Ok((StatusCode::OK, Json(points)))
}
pub(crate) async fn list_campaigns(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<(StatusCode, Json<Vec<CampaignStats>>), StatusCode> {
    let rows = sqlx::query(
        r#"
        SELECT
            c.id, c.name, c.total_budget::float, c.is_active,
            COALESCE(imp.spent, 0)::float AS spent,
            COALESCE(imp.impressions, 0) AS impressions,
            COALESCE(clk.clicks, 0) AS clicks,
            c.max_cpm::float,
            c.target_categories,
            c.status,
            c.target_age_min, c.target_age_max, c.target_genders,
            c.target_income_min, c.target_income_max,
            c.target_household_min, c.target_household_max,
            c.target_locations, c.target_languages, c.target_interests,
            c.want_risk_taker, c.want_relaxed, c.want_open_new,
            c.target_shopper, c.target_price_min, c.target_price_max, c.target_media,
            c.target_fields
        FROM campaigns c
        LEFT JOIN (
            SELECT campaign_id, SUM(cost) AS spent, COUNT(*) AS impressions
            FROM impressions_log GROUP BY campaign_id
        ) imp ON imp.campaign_id = c.id
        LEFT JOIN (
            SELECT campaign_id, COUNT(*) AS clicks
            FROM clicks_log GROUP BY campaign_id
        ) clk ON clk.campaign_id = c.id
        WHERE c.advertiser_id = $1
        ORDER BY c.id DESC
        "#
    )
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| { eprintln!("list_campaigns error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let campaigns: Vec<CampaignStats> = rows.iter().map(|row| {
        use sqlx::Row;
        let total: f64 = row.get(2);
        let spent: f64 = row.get(4);

        let targeting = CampaignTargeting {
            target_age_min: Some(row.get(10)),
            target_age_max: Some(row.get(11)),
            target_genders: Some(row.get(12)),
            target_income_min: Some(row.get(13)),
            target_income_max: Some(row.get(14)),
            target_household_min: Some(row.get(15)),
            target_household_max: Some(row.get(16)),
            target_locations: Some(row.get(17)),
            target_languages: Some(row.get(18)),
            target_interests: Some(row.get(19)),
            want_risk_taker: row.get(20),
            want_relaxed: row.get(21),
            want_open_new: row.get(22),
            target_shopper: Some(row.get(23)),
            target_price_min: Some(row.get(24)),
            target_price_max: Some(row.get(25)),
            target_media: Some(row.get(26)),
        };
        let target_fields = row.get::<Option<serde_json::Value>, _>(27)
            .and_then(|v| serde_json::from_value(v).ok());
        CampaignStats {
            id: row.get(0),
            name: row.get(1),
            total_budget: total,
            max_cpm: row.get(7),
            target_categories: row.get(8),
            spent,
            remaining: total - spent,
            impressions: row.get(5),
            clicks: row.get(6),
            is_active: row.get(3),
            status: row.get(9),
            targeting: Some(targeting),
            target_fields,
        }
    }).collect();

    Ok((StatusCode::OK, Json(campaigns)))
}
pub(crate) fn display_name(email: &str) -> String {
    let base = email.split('@').next().unwrap_or(email).replace("_ads", "").replace('_', " ");
    base.split_whitespace()
        .map(|w| {
            let mut ch = w.chars();
            match ch.next() {
                Some(f) => f.to_uppercase().collect::<String>() + ch.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) async fn list_all_campaigns(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<(StatusCode, Json<Vec<AdvertiserBudget>>), StatusCode> {
    auth.require_operator()?;
    let rows = sqlx::query(
        r#"
        SELECT
            c.id, c.name, u.email AS advertiser, c.total_budget::float, c.is_active,
            COALESCE(imp.spent, 0)::float AS spent,
            COALESCE(imp.impressions, 0) AS impressions,
            c.advertiser_id
        FROM campaigns c
        JOIN users u ON u.id = c.advertiser_id
        LEFT JOIN (
            SELECT campaign_id, SUM(cost) AS spent, COUNT(*) AS impressions
            FROM impressions_log GROUP BY campaign_id
        ) imp ON imp.campaign_id = c.id
        ORDER BY spent DESC, c.id ASC
        "#
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| { eprintln!("list_all_campaigns error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let campaigns: Vec<AdvertiserBudget> = rows.iter().map(|row| {
        let email: String = sqlx::Row::get(row, 2);
        let total: f64 = sqlx::Row::get(row, 3);
        let spent: f64 = sqlx::Row::get(row, 5);
        AdvertiserBudget {
            id: sqlx::Row::get(row, 0),
            advertiser_id: sqlx::Row::get(row, 7),
            name: sqlx::Row::get(row, 1),
            advertiser: display_name(&email),
            total_budget: total,
            spent,
            remaining: total - spent,
            impressions: sqlx::Row::get(row, 6),
            is_active: sqlx::Row::get(row, 4),
        }
    }).collect();

    Ok((StatusCode::OK, Json(campaigns)))
}

pub(crate) async fn list_advertisers(
    State(state): State<AppState>,
) -> Result<(StatusCode, Json<Vec<CompanyBudget>>), StatusCode> {
    let rows = sqlx::query(
        r#"
        SELECT
            u.id,
            u.email,
            COALESCE(cb.total_budget, 0)::float  AS total_budget,
            COALESCE(sp.spent, 0)::float         AS spent,
            COALESCE(cb.campaigns, 0)::bigint     AS campaigns,
            COALESCE(sp.impressions, 0)::bigint   AS impressions,
            u.logo
        FROM users u
        LEFT JOIN (
            SELECT advertiser_id, SUM(total_budget) AS total_budget, COUNT(*) AS campaigns
            FROM campaigns GROUP BY advertiser_id
        ) cb ON cb.advertiser_id = u.id
        LEFT JOIN (
            SELECT c.advertiser_id, SUM(i.cost) AS spent, COUNT(i.id) AS impressions
            FROM campaigns c JOIN impressions_log i ON i.campaign_id = c.id
            GROUP BY c.advertiser_id
        ) sp ON sp.advertiser_id = u.id
        WHERE u.role = 'advertiser'
        ORDER BY spent DESC, u.id ASC
        "#
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| { eprintln!("list_advertisers error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let companies: Vec<CompanyBudget> = rows.iter().map(|row| {
        let email: String = sqlx::Row::get(row, 1);
        let total: f64 = sqlx::Row::get(row, 2);
        let spent: f64 = sqlx::Row::get(row, 3);
        CompanyBudget {
            id: sqlx::Row::get(row, 0),
            name: display_name(&email),
            logo: sqlx::Row::get(row, 6),
            email,
            total_budget: total,
            spent,
            remaining: total - spent,
            campaigns: sqlx::Row::get(row, 4),
            impressions: sqlx::Row::get(row, 5),
        }
    }).collect();

    Ok((StatusCode::OK, Json(companies)))
}

pub(crate) async fn create_advertiser(
    State(state): State<AppState>,
    Json(payload): Json<CreateAdvertiserRequest>,
) -> Result<(StatusCode, Json<CreateAdvertiserResponse>), StatusCode> {
    let existing = sqlx::query("SELECT id FROM users WHERE email = $1")
        .bind(&payload.email)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if existing.is_some() {
        return Err(StatusCode::CONFLICT);
    }

    let hashed = hash_password(&payload.password).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = sqlx::query(
        "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'advertiser') RETURNING id"
    )
    .bind(&payload.email)
    .bind(&hashed)
    .fetch_one(&state.db)
    .await
    .map_err(|e| { eprintln!("create_advertiser error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let id: i32 = sqlx::Row::get(&row, 0);
    Ok((StatusCode::CREATED, Json(CreateAdvertiserResponse { id, email: payload.email })))
}

pub(crate) async fn delete_advertiser(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> Result<StatusCode, StatusCode> {
    let campaign_rows = sqlx::query("SELECT id FROM campaigns WHERE advertiser_id = $1")
        .bind(id)
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result = sqlx::query("DELETE FROM users WHERE id = $1 AND role = 'advertiser'")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| { eprintln!("delete_advertiser error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut redis_conn = state.redis.clone();
    for row in campaign_rows.iter() {
        let campaign_id: i32 = sqlx::Row::get(row, 0);
        let key = format!("campaign:{}:budget", campaign_id);
        let _: Result<(), _> = redis::cmd("DEL").arg(&key).query_async(&mut redis_conn).await;
    }

    Ok(StatusCode::OK)
}

pub(crate) fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default().hash_password(password.as_bytes(), &salt)?.to_string())
}

pub(crate) fn verify_password(password: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok(),
        Err(_) => false,
    }
}

pub(crate) async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<(StatusCode, Json<LoginResponse>), StatusCode> {
    let user = sqlx::query(
        r#"SELECT id, password_hash, role::text, logo FROM users WHERE email = $1"#,
    )
    .bind(payload.email)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = match user {
        Some(r) => r,
        None => return Err(StatusCode::UNAUTHORIZED),
    };

    let user_id: i32 = sqlx::Row::get(&row, 0);
    let db_password_hash: String = sqlx::Row::get(&row, 1);
    let user_role: String = sqlx::Row::get(&row, 2);
    let user_logo: String = sqlx::Row::get(&row, 3);

    if !verify_password(&payload.password_hash, &db_password_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let expiration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() + 3600;

    let claims = Claims {
        sub: user_id.to_string(),
        role: user_role.clone(),
        exp: expiration as usize,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok((StatusCode::OK, Json(LoginResponse { token, role: user_role, id: user_id, logo: user_logo })))
}

pub(crate) async fn change_password(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<StatusCode, StatusCode> {
    if payload.new_password.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let row = sqlx::query("SELECT password_hash FROM users WHERE id = $1")
        .bind(auth.user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let current_hash: String = sqlx::Row::get(&row, 0);
    if !verify_password(&payload.current_password, &current_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let new_hash = hash_password(&payload.new_password).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&new_hash)
        .bind(auth.user_id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

pub(crate) async fn create_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<CreateCampaignRequest>,
) -> Result<(StatusCode, Json<CampaignResponse>), StatusCode> {

    let status = match payload.status.as_deref() {
        Some("draft") => "draft",
        _ => "active",
    };

    let t = payload.targeting.resolve();

    let target_fields_json = match &payload.target_fields {
        Some(map) => Some(serde_json::to_value(map).map_err(|_| StatusCode::BAD_REQUEST)?),
        None => None,
    };

    let row = sqlx::query(
        r#"
        INSERT INTO campaigns (
            advertiser_id, name, total_budget, max_cpm, target_categories, status,
            target_age_min, target_age_max, target_genders,
            target_income_min, target_income_max,
            target_household_min, target_household_max,
            target_locations, target_languages, target_interests,
            want_risk_taker, want_relaxed, want_open_new,
            target_shopper, target_price_min, target_price_max, target_media,
            target_fields
        )
        VALUES ($1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21, $22, $23, $24)
        RETURNING id
        "#
    )
    .bind(auth.user_id)
    .bind(payload.name.clone())
    .bind(payload.total_budget)
    .bind(payload.max_cpm)
    .bind(payload.target_categories)
    .bind(status)
    .bind(t.age_min)
    .bind(t.age_max)
    .bind(&t.genders)
    .bind(t.income_min)
    .bind(t.income_max)
    .bind(t.household_min)
    .bind(t.household_max)
    .bind(&t.locations)
    .bind(&t.languages)
    .bind(&t.interests)
    .bind(t.want_risk_taker)
    .bind(t.want_relaxed)
    .bind(t.want_open_new)
    .bind(&t.shopper)
    .bind(t.price_min)
    .bind(t.price_max)
    .bind(&t.media)
    .bind(target_fields_json)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        eprintln!("Database error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let campaign_id: i32 = sqlx::Row::get(&row, 0);

    if status == "active" {
        let mut redis_conn = state.redis.clone();
        let redis_key = format!("campaign:{}:budget", campaign_id);
        let _: () = redis_conn.set(redis_key, payload.total_budget)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    Ok((
        StatusCode::CREATED,
        Json(CampaignResponse {
            id: campaign_id,
            name: payload.name,
            status: if status == "draft" { "Saved as draft".to_string() }
                    else { "Created successfully and cached in Redis".to_string() },
        }),
    ))
}

pub(crate) async fn assert_campaign_owner(db: &sqlx::PgPool, campaign_id: i32, user_id: i32) -> Result<(), StatusCode> {
    let row = sqlx::query("SELECT advertiser_id FROM campaigns WHERE id = $1")
        .bind(campaign_id)
        .fetch_optional(db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    match row {
        Some(r) => {
            let owner: i32 = sqlx::Row::get(&r, 0);
            if owner == user_id { Ok(()) } else { Err(StatusCode::FORBIDDEN) }
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

fn assert_advertiser_access(auth: &AuthUser, advertiser_id: i32) -> Result<(), StatusCode> {
    if auth.role == "operator" || auth.user_id == advertiser_id {
        Ok(())
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}

pub(crate) async fn get_advertiser_fields(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> Result<Json<Vec<FieldSpec>>, StatusCode> {
    assert_advertiser_access(&auth, id)?;
    let union = crate::engine::company_field_union(&state.db, Some(id)).await;
    Ok(Json(union))
}

pub(crate) async fn list_logo_options() -> Json<Vec<&'static str>> {
    Json(LOGO_OPTIONS.to_vec())
}

pub(crate) async fn get_advertiser_logo(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> Result<Json<LogoResponse>, StatusCode> {
    assert_advertiser_access(&auth, id)?;

    let row = sqlx::query("SELECT logo FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| { eprintln!("get_advertiser_logo error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(LogoResponse { logo: sqlx::Row::get(&row, 0) }))
}

pub(crate) async fn update_advertiser_logo(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<i32>,
    Json(payload): Json<UpdateLogoRequest>,
) -> Result<Json<LogoResponse>, StatusCode> {
    assert_advertiser_access(&auth, id)?;

    if !is_valid_logo(&payload.logo) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let result = sqlx::query("UPDATE users SET logo = $1 WHERE id = $2")
        .bind(&payload.logo)
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| { eprintln!("update_advertiser_logo error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(LogoResponse { logo: payload.logo }))
}

pub(crate) async fn update_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<i32>,
    Json(payload): Json<UpdateCampaignRequest>,
) -> Result<StatusCode, StatusCode> {
    assert_campaign_owner(&state.db, id, auth.user_id).await?;
    let t = payload.targeting.resolve();
    let target_fields_json = match &payload.target_fields {
        Some(map) => Some(serde_json::to_value(map).map_err(|_| StatusCode::BAD_REQUEST)?),
        None => None,
    };
    let result = sqlx::query(
        r#"
        UPDATE campaigns SET
            name = $1, max_cpm = $2, target_categories = $3,
            target_age_min = $5, target_age_max = $6, target_genders = $7,
            target_income_min = $8, target_income_max = $9,
            target_household_min = $10, target_household_max = $11,
            target_locations = $12, target_languages = $13, target_interests = $14,
            want_risk_taker = $15, want_relaxed = $16, want_open_new = $17,
            target_shopper = $18, target_price_min = $19, target_price_max = $20, target_media = $21,
            target_fields = COALESCE($22, target_fields)
        WHERE id = $4
        "#
    )
    .bind(&payload.name)
    .bind(payload.max_cpm)
    .bind(&payload.target_categories)
    .bind(id)
    .bind(t.age_min)
    .bind(t.age_max)
    .bind(&t.genders)
    .bind(t.income_min)
    .bind(t.income_max)
    .bind(t.household_min)
    .bind(t.household_max)
    .bind(&t.locations)
    .bind(&t.languages)
    .bind(&t.interests)
    .bind(t.want_risk_taker)
    .bind(t.want_relaxed)
    .bind(t.want_open_new)
    .bind(&t.shopper)
    .bind(t.price_min)
    .bind(t.price_max)
    .bind(&t.media)
    .bind(target_fields_json)
    .execute(&state.db)
    .await
    .map_err(|e| { eprintln!("update_campaign error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(StatusCode::OK)
}

pub(crate) async fn add_budget(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<i32>,
    Json(payload): Json<AddBudgetRequest>,
) -> Result<StatusCode, StatusCode> {
    if payload.amount == 0.0 {
        return Err(StatusCode::BAD_REQUEST);
    }

    assert_campaign_owner(&state.db, id, auth.user_id).await?;

    let mut redis_conn = state.redis.clone();
    let key = format!("campaign:{}:budget", id);

    let adjust_script = redis::Script::new(r#"
        local key = KEYS[1]
        local delta = tonumber(ARGV[1])
        local cur = tonumber(redis.call('GET', key) or "0")
        local newv = cur + delta
        if newv < 0 then
            return -1
        end
        redis.call('SET', key, newv)
        return 1
    "#);

    let result: i64 = adjust_script
        .key(&key)
        .arg(payload.amount)
        .invoke_async(&mut redis_conn)
        .await
        .map_err(|e| { eprintln!("adjust budget redis error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result == -1 {
        return Err(StatusCode::CONFLICT);
    }

    sqlx::query("UPDATE campaigns SET total_budget = total_budget + $1 WHERE id = $2")
        .bind(payload.amount)
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| { eprintln!("add_budget error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok(StatusCode::OK)
}

pub(crate) async fn delete_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> Result<StatusCode, StatusCode> {
    assert_campaign_owner(&state.db, id, auth.user_id).await?;

    let result = sqlx::query("UPDATE campaigns SET status = 'deleted', is_active = false WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| { eprintln!("delete_campaign error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut redis_conn = state.redis.clone();
    let key = format!("campaign:{}:budget", id);
    let _: Result<(), _> = redis::cmd("DEL").arg(&key).query_async(&mut redis_conn).await;

    Ok(StatusCode::OK)
}

pub(crate) async fn purge_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> Result<StatusCode, StatusCode> {
    assert_campaign_owner(&state.db, id, auth.user_id).await?;

    let result = sqlx::query("DELETE FROM campaigns WHERE id = $1 AND status = 'deleted'")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| { eprintln!("purge_campaign error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::CONFLICT);
    }

    let mut redis_conn = state.redis.clone();
    let key = format!("campaign:{}:budget", id);
    let _: Result<(), _> = redis::cmd("DEL").arg(&key).query_async(&mut redis_conn).await;

    Ok(StatusCode::OK)
}

pub(crate) async fn activate_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> Result<StatusCode, StatusCode> {
    assert_campaign_owner(&state.db, id, auth.user_id).await?;

    let row = sqlx::query(
        r#"
        UPDATE campaigns c
        SET status = CASE WHEN c.status = 'deleted' THEN 'draft' ELSE 'active' END,
            is_active = CASE WHEN c.status = 'deleted' THEN false ELSE true END
        WHERE c.id = $1
        RETURNING c.status,
                  c.total_budget::float
                  - COALESCE((SELECT SUM(i.cost) FROM impressions_log i WHERE i.campaign_id = c.id), 0)::float
                  AS remaining
        "#
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| { eprintln!("activate_campaign error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let (new_status, remaining): (String, f64) = match row {
        Some(r) => (sqlx::Row::get(&r, 0), sqlx::Row::get(&r, 1)),
        None => return Err(StatusCode::NOT_FOUND),
    };

    let mut redis_conn = state.redis.clone();
    let key = format!("campaign:{}:budget", id);
    if new_status == "active" {
        let _: Result<(), _> = redis_conn.set(key, remaining.max(0.0)).await;
    } else {
        let _: Result<(), _> = redis::cmd("DEL").arg(&key).query_async(&mut redis_conn).await;
    }

    Ok(StatusCode::OK)
}
