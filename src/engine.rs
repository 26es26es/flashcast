use std::time::{Duration, SystemTime, UNIX_EPOCH};
use axum::{extract::State, http::StatusCode, Json};
use serde_json;
use rdkafka::producer::FutureRecord;
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use rdkafka::Message;
use metrics::counter;

use std::collections::HashMap;

use crate::{AppState, GLOBAL_SIM_KEY};
use crate::models::*;
use crate::targeting::DynamicTargeting;
const NO_CLICK_COST_FRACTION: f64 = 0.25;
const MAX_MATCHED_CANDIDATES: usize = 5;

pub(crate) async fn make_decision(
    State(state): State<AppState>,
    Json(payload): Json<DecisionRequest>,
) -> Result<(StatusCode, Json<DecisionResponse>), StatusCode> {
    let metrics = state.metrics.clone();
    let started = std::time::Instant::now();
    let result = make_decision_inner(state, payload).await;
    metrics.record(started.elapsed(), result.is_err());
    result
}

pub(crate) async fn make_decision_inner(
    state: AppState,
    payload: DecisionRequest,
) -> Result<(StatusCode, Json<DecisionResponse>), StatusCode> {
    let candidates = sqlx::query(
        r#"
        SELECT c.id, c.max_cpm::float, c.name,
               c.target_age_min, c.target_age_max, c.target_genders,
               c.target_income_min, c.target_income_max,
               c.target_household_min, c.target_household_max,
               c.target_locations, c.target_languages, c.target_interests,
               c.want_risk_taker, c.want_relaxed, c.want_open_new,
               c.target_shopper, c.target_price_min, c.target_price_max, c.target_media,
               EXTRACT(EPOCH FROM (now() - c.created_at))::float / 86400.0 AS age_days,
               c.target_fields
        FROM campaigns c
        WHERE c.is_active = true AND c.status = 'active'
        AND ($2::int IS NULL OR c.advertiser_id = $2)
        AND (
            EXISTS (SELECT 1 FROM unnest(c.target_categories) cat WHERE LOWER(cat) = LOWER($1))
            OR c.target_categories = '{}'
        )
        ORDER BY c.max_cpm DESC, c.created_at ASC, RANDOM()
        "#
    )
    .bind(payload.category.clone())
    .bind(payload.advertiser_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        eprintln!("Database error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if candidates.is_empty() {
        let _ = state.decision_tx.send(DecisionEvent {
            campaign_id: 0,
            campaign_name: String::new(),
            cost: 0.0,
            status: "no_fill".to_string(),
            category: payload.category.clone(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            clicked: false,
        });
        return Ok((StatusCode::OK, Json(DecisionResponse {
            campaign_id: 0,
            cost: 0.0,
            status: "No matching campaign found".to_string(),
            clicked: false,
            click_prob: 0.0,
        })));
    }

    let mut redis_conn = state.redis.clone();
    let lua_script = redis::Script::new(r#"
        local budget_key = KEYS[1]
        local cost = tonumber(ARGV[1])
        local current_budget = tonumber(redis.call('GET', budget_key) or "0")

        if current_budget >= cost then
            redis.call('SET', budget_key, current_budget - cost)
            return 1
        else
            return 0
        end
    "#);

    let user_fields = resolve_user_fields(&payload);

    let mut ranked: Vec<RankedCandidate> = candidates.iter().filter_map(|row| {
        let campaign_id: i32 = sqlx::Row::get(row, 0);
        let max_cpm: f64 = sqlx::Row::get(row, 1);
        let campaign_name: String = sqlx::Row::get(row, 2);
        let score = match &user_fields {
            Some(user) => {
                let fields = fields_from_row(row);
                let targeting = DynamicTargeting { fields: &fields };
                if !targeting.is_eligible(user) {
                    return None;
                }
                targeting.match_score(user)
            }
            None => 1.0,
        };
        Some(RankedCandidate { campaign_id, max_cpm, campaign_name, score })
    }).collect();

    ranked.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    ranked.truncate(MAX_MATCHED_CANDIDATES);
    ranked.sort_by(|a, b| b.max_cpm.partial_cmp(&a.max_cpm).unwrap_or(std::cmp::Ordering::Equal));

    for candidate in ranked.iter() {
        let campaign_id = candidate.campaign_id;
        let campaign_name = candidate.campaign_name.clone();
        let impression_cost = candidate.max_cpm / 1000.0;
        let clicked = rand_unit() < payload.click_rate;
        let charge = if clicked { impression_cost } else { impression_cost * NO_CLICK_COST_FRACTION };

        let redis_key = format!("campaign:{}:budget", campaign_id);
        let allowed: i32 = lua_script
            .key(redis_key)
            .arg(charge)
            .invoke_async(&mut redis_conn)
            .await
            .map_err(|e| {
                eprintln!("Redis Lua Error: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        if allowed == 1 {
            counter!("flashcast_ad_impressions_total").increment(1);
            if clicked {
                counter!("flashcast_clicks_total").increment(1);
            }

            let status_label = if clicked { "Clicked" } else { "Approved" };
            let event_payload = format!(
                r#"{{"campaign_id":{},"cost":{},"status":"{}"}}"#,
                campaign_id, charge, status_label
            );
            let campaign_id_str = campaign_id.to_string();

            let record = FutureRecord::to("impressions")
                .payload(&event_payload)
                .key(&campaign_id_str);

            let _ = state.kafka_producer.send(record, Duration::from_secs(0)).await;

            sqlx::query("INSERT INTO impressions_log (campaign_id, cost, category) VALUES ($1, $2, $3)")
                .bind(campaign_id)
                .bind(charge)
                .bind(payload.category.clone())
                .execute(&state.db)
                .await
                .map_err(|e| { eprintln!("impressions_log insert error: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

            if clicked {
                let _ = sqlx::query("INSERT INTO clicks_log (campaign_id) VALUES ($1)")
                    .bind(campaign_id)
                    .execute(&state.db)
                    .await;
            }

            let _ = state.decision_tx.send(DecisionEvent {
                campaign_id,
                campaign_name,
                cost: charge,
                status: "approved".to_string(),
                category: payload.category,
                timestamp: chrono::Utc::now().to_rfc3339(),
                clicked,
            });

            return Ok((StatusCode::OK, Json(DecisionResponse {
                campaign_id,
                cost: charge,
                status: if clicked { "Clicked".to_string() } else { "Approved".to_string() },
                clicked,
                click_prob: candidate.score,
            })));
        }
    }

    if ranked.is_empty() {
        let _ = state.decision_tx.send(DecisionEvent {
            campaign_id: 0,
            campaign_name: String::new(),
            cost: 0.0,
            status: "no_fill".to_string(),
            category: payload.category,
            timestamp: chrono::Utc::now().to_rfc3339(),
            clicked: false,
        });

        return Ok((StatusCode::OK, Json(DecisionResponse {
            campaign_id: 0,
            cost: 0.0,
            status: "No eligible campaign for this viewer".to_string(),
            clicked: false,
            click_prob: 0.0,
        })));
    }

    let top = &ranked[0];

    let _ = state.decision_tx.send(DecisionEvent {
        campaign_id: top.campaign_id,
        campaign_name: top.campaign_name.clone(),
        cost: 0.0,
        status: "budget_exhausted".to_string(),
        category: payload.category,
        timestamp: chrono::Utc::now().to_rfc3339(),
        clicked: false,
    });

    Ok((StatusCode::OK, Json(DecisionResponse {
        campaign_id: 0,
        cost: 0.0,
        status: "Insufficient campaign budget".to_string(),
        clicked: false,
        click_prob: 0.0,
    })))
}
struct RankedCandidate {
    campaign_id: i32,
    max_cpm: f64,
    campaign_name: String,
    score: f64,
}

fn resolve_user_fields(payload: &DecisionRequest) -> Option<HashMap<String, FieldValue>> {
    if let Some(fields) = &payload.user_fields {
        return Some(fields.clone());
    }
    payload.user.as_ref().map(user_profile_to_fields)
}

fn user_profile_to_fields(user: &crate::targeting::UserProfile) -> HashMap<String, FieldValue> {
    let mut m = HashMap::new();
    m.insert("age".into(), FieldValue::Number(user.age as f64));
    m.insert("gender".into(), FieldValue::Text(user.gender.clone()));
    m.insert("income".into(), FieldValue::Number(user.income as f64));
    m.insert("household".into(), FieldValue::Number(user.household as f64));
    m.insert("interests".into(), FieldValue::List(user.interests.clone()));
    m.insert("risk_taker".into(), FieldValue::Flag(user.risk_taker));
    m.insert("relaxed".into(), FieldValue::Flag(user.relaxed));
    m.insert("open_new".into(), FieldValue::Flag(user.open_new));
    m.insert("shopper".into(), FieldValue::Text(user.shopper.clone()));
    m.insert("price".into(), FieldValue::Number(user.price as f64));
    m.insert("media".into(), FieldValue::Text(user.media.clone()));
    m
}

fn fields_from_row(row: &sqlx::postgres::PgRow) -> Vec<CampaignField> {
    use sqlx::Row;
    let raw: Option<serde_json::Value> = row.get(21);
    if let Some(value) = raw {
        if let Ok(fields) = serde_json::from_value::<Vec<CampaignField>>(value) {
            return fields;
        }
    }
    legacy_fields_from_row(row)
}

fn legacy_fields_from_row(row: &sqlx::postgres::PgRow) -> Vec<CampaignField> {
    use sqlx::Row;
    let range = |lo: i32, hi: i32| TargetValue::Range { lo: lo as f64, hi: hi as f64 };
    let mut targets: HashMap<String, TargetValue> = HashMap::new();
    targets.insert("age".into(), range(row.get(3), row.get(4)));
    targets.insert("gender".into(), TargetValue::Set { values: row.get(5) });
    targets.insert("income".into(), range(row.get(6), row.get(7)));
    targets.insert("household".into(), range(row.get(8), row.get(9)));
    targets.insert("interests".into(), TargetValue::Set { values: row.get(12) });
    targets.insert("risk_taker".into(), TargetValue::Want { value: row.get(13) });
    targets.insert("relaxed".into(), TargetValue::Want { value: row.get(14) });
    targets.insert("open_new".into(), TargetValue::Want { value: row.get(15) });
    let shopper: String = row.get(16);
    let shopper_target = if shopper == "any" { TargetValue::Set { values: vec![] } } else { TargetValue::Set { values: vec![shopper] } };
    targets.insert("shopper".into(), shopper_target);
    targets.insert("price".into(), range(row.get(17), row.get(18)));
    targets.insert("media".into(), TargetValue::Set { values: row.get(19) });

    default_field_schema().into_iter().filter_map(|spec| {
        targets.remove(&spec.key).map(|target| CampaignField {
            key: spec.key,
            label: spec.label,
            description: spec.description,
            weight: spec.weight,
            kind: spec.kind,
            target,
            forced: false,
        })
    }).collect()
}
pub(crate) const BATCH_MAX_ROWS: usize = 500;
pub(crate) const BATCH_MAX_WAIT: Duration = Duration::from_secs(1);

pub(crate) async fn flush_batch(http_client: &reqwest::Client, rows: &mut Vec<String>) {
    if rows.is_empty() {
        return;
    }
    let insert_query = format!(
        "INSERT INTO default.impressions (campaign_id, cost, status) VALUES {}",
        rows.join(",")
    );
    let _ = http_client
        .post("http://127.0.0.1:8123/")
        .body(insert_query)
        .send()
        .await;
    rows.clear();
}

pub(crate) async fn start_analytics_consumer() {
    let consumer: StreamConsumer = rdkafka::config::ClientConfig::new()
        .set("group.id", "flashcast_analytics_group")
        .set("bootstrap.servers", "127.0.0.1:9092")
        .set("auto.offset.reset", "earliest")
        .create()
        .expect("Failed to create Kafka consumer layer");

    consumer.subscribe(&["impressions"]).expect("Failed to subscribe to Kafka topic");
    println!("Asynchronous Analytics Consumer loop started successfully.");

    let http_client = reqwest::Client::new();
    let mut batch: Vec<String> = Vec::with_capacity(BATCH_MAX_ROWS);
    let mut batch_started: Option<std::time::Instant> = None;

    loop {
        match tokio::time::timeout(Duration::from_millis(200), consumer.recv()).await {
            Ok(Ok(message)) => {
                if let Some(Ok(payload_str)) = message.payload_view::<str>() {
                    if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(payload_str) {
                        let campaign_id = json_value["campaign_id"].as_i64().unwrap_or(0);
                        let cost = json_value["cost"].as_f64().unwrap_or(0.0);
                        let status = json_value["status"].as_str().unwrap_or("Unknown");
                        if batch.is_empty() {
                            batch_started = Some(std::time::Instant::now());
                        }
                        batch.push(format!("({}, {}, '{}')", campaign_id, cost, status));
                    }
                }
                let _ = consumer.commit_message(&message, CommitMode::Async);
            }
            Ok(Err(e)) => {
                eprintln!("Kafka consumer error: {:?}", e);
            }
            Err(_) => {}
        }

        let full = batch.len() >= BATCH_MAX_ROWS;
        let stale = batch_started.map_or(false, |t| t.elapsed() >= BATCH_MAX_WAIT);
        if !batch.is_empty() && (full || stale) {
            flush_batch(&http_client, &mut batch).await;
            batch_started = None;
        }
    }
}
fn sim_key(advertiser_id: Option<i32>) -> i32 {
    advertiser_id.unwrap_or(GLOBAL_SIM_KEY)
}

fn try_begin_sim(state: &AppState, key: i32) -> bool {
    let mut set = state.sim_running.lock().unwrap();
    if set.contains(&key) {
        false
    } else {
        set.insert(key);
        true
    }
}

fn end_sim(state: &AppState, key: i32) {
    state.sim_running.lock().unwrap().remove(&key);
}

fn is_sim_running(state: &AppState, key: i32) -> bool {
    state.sim_running.lock().unwrap().contains(&key)
}

pub(crate) async fn company_field_union(db: &sqlx::PgPool, advertiser_id: Option<i32>) -> Vec<FieldSpec> {
    let id = match advertiser_id {
        Some(id) => id,
        None => return default_field_schema(),
    };
    let rows = sqlx::query("SELECT target_fields FROM campaigns WHERE advertiser_id = $1 AND status <> 'deleted'")
        .bind(id)
        .fetch_all(db)
        .await
        .unwrap_or_default();

    let mut union: Vec<FieldSpec> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for row in rows.iter() {
        let raw: Option<serde_json::Value> = sqlx::Row::get(row, 0);
        let fields: Vec<CampaignField> = match raw.and_then(|v| serde_json::from_value(v).ok()) {
            Some(f) => f,
            None => continue,
        };
        for field in fields {
            if seen.insert(field.key.clone()) {
                union.push(field.spec());
            }
        }
    }

    if union.is_empty() { default_field_schema() } else { union }
}

pub(crate) async fn simulate_start(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<SimulateRequest>,
) -> StatusCode {
    if auth.role != "operator" {
        return StatusCode::FORBIDDEN;
    }
    let key = sim_key(payload.advertiser_id);
    if !try_begin_sim(&state, key) {
        return StatusCode::CONFLICT;
    }

    let sim_state = state.clone();
    let http_client = reqwest::Client::new();
    let categories = vec!["gaming", "sports", "music", "tech", "finance"];
    let audience = payload.audience.unwrap_or_default();
    let schema = company_field_union(&state.db, payload.advertiser_id).await;
    let click_rate = payload.click_rate.clamp(0.0, 1.0);
    let scope_advertiser = payload.advertiser_id;

    tokio::spawn(async move {
        let interval = Duration::from_secs_f64(1.0 / payload.rate as f64);
        let end = tokio::time::Instant::now() + Duration::from_secs(payload.duration);

        while tokio::time::Instant::now() < end && is_sim_running(&sim_state, key) {
            let user_fields = audience.sample_dynamic_user(&schema);
            let cat = pick_category(&user_fields, &categories);
            let client = http_client.clone();
            let payload_json = serde_json::json!({
                "category": cat,
                "user_fields": user_fields,
                "click_rate": click_rate,
                "advertiser_id": scope_advertiser,
            });
            tokio::spawn(async move {
                let _ = client
                    .post("http://127.0.0.1:8000/decisions")
                    .json(&payload_json)
                    .send()
                    .await;
            });

            tokio::time::sleep(interval).await;
        }

        end_sim(&sim_state, key);
    });

    StatusCode::OK
}

fn pick_category(user_fields: &HashMap<String, FieldValue>, categories: &[&str]) -> String {
    if let Some(FieldValue::List(interests)) = user_fields.get("interests") {
        if !interests.is_empty() {
            return interests[rand_index(interests.len())].clone();
        }
    }
    categories[rand_index(categories.len())].to_string()
}

pub(crate) async fn simulate_stop(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<SimulateControl>,
) -> StatusCode {
    if auth.role != "operator" {
        return StatusCode::FORBIDDEN;
    }
    end_sim(&state, sim_key(payload.advertiser_id));
    StatusCode::OK
}

pub(crate) async fn simulate_status(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Query(query): axum::extract::Query<SimulateStatusQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    auth.require_operator()?;
    let running = is_sim_running(&state, sim_key(query.advertiser_id));
    Ok(Json(serde_json::json!({ "running": running })))
}
pub(crate) fn rand_u64() -> u64 {
    use std::cell::Cell;
    thread_local! {
        static SEED: Cell<u64> = Cell::new(0);
    }
    SEED.with(|seed| {
        let mut s = seed.get();
        if s == 0 {
            s = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos() as u64
                ^ (&s as *const u64 as u64);
            s |= 1;
        }
        s ^= s << 13;
        s ^= s >> 7;
        s ^= s << 17;
        seed.set(s);
        s.wrapping_mul(0x2545_F491_4F6C_DD1D)
    })
}

pub(crate) fn rand_unit() -> f64 {
    (rand_u64() >> 11) as f64 / (1u64 << 53) as f64
}

pub(crate) fn rand_index(n: usize) -> usize {
    (rand_u64() % n as u64) as usize
}
