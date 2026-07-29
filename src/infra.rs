use std::time::Duration;
use axum::{
    extract::{ws::{Message as WsMessage, WebSocket, WebSocketUpgrade}, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use redis::AsyncCommands;

use crate::AppState;
use crate::handlers::hash_password;

pub(crate) const LATENCY_WINDOW: usize = 4096;

pub(crate) struct DecisionMetrics {
    requests: std::sync::atomic::AtomicU64,
    errors: std::sync::atomic::AtomicU64,

    latencies: std::sync::Mutex<LatencyRing>,
    started: std::time::Instant,
}

pub(crate) struct LatencyRing {
    samples: Vec<u64>,
    next: usize,
}

impl DecisionMetrics {
    pub(crate) fn new() -> Self {
        Self {
            requests: std::sync::atomic::AtomicU64::new(0),
            errors: std::sync::atomic::AtomicU64::new(0),
            latencies: std::sync::Mutex::new(LatencyRing {
                samples: Vec::with_capacity(LATENCY_WINDOW),
                next: 0,
            }),
            started: std::time::Instant::now(),
        }
    }

    pub(crate) fn record(&self, elapsed: Duration, is_error: bool) {
        use std::sync::atomic::Ordering::Relaxed;
        self.requests.fetch_add(1, Relaxed);
        if is_error {
            self.errors.fetch_add(1, Relaxed);
        }

        let micros = elapsed.as_micros().min(u64::MAX as u128) as u64;
        if let Ok(mut ring) = self.latencies.lock() {
            if ring.samples.len() < LATENCY_WINDOW {
                ring.samples.push(micros);
            } else {
                let slot = ring.next;
                ring.samples[slot] = micros;
                ring.next = (slot + 1) % LATENCY_WINDOW;
            }
        }
    }

    pub(crate) fn percentiles(&self) -> (f64, f64) {
        let Ok(ring) = self.latencies.lock() else {
            return (0.0, 0.0);
        };
        if ring.samples.is_empty() {
            return (0.0, 0.0);
        }

        let mut sorted = ring.samples.clone();
        sorted.sort_unstable();

        let at = |q: f64| -> f64 {
            let rank = (q * sorted.len() as f64).ceil() as usize;
            let idx = rank.saturating_sub(1).min(sorted.len() - 1);
            sorted[idx] as f64 / 1000.0
        };
        (at(0.95), at(0.99))
    }
}

pub(crate) async fn sync_budgets_to_redis(pool: &sqlx::PgPool, mut conn: redis::aio::MultiplexedConnection) {
    let rows = match sqlx::query(
        r#"
        SELECT c.id, c.total_budget::float,
               COALESCE(SUM(i.cost), 0)::float AS spent
        FROM campaigns c
        LEFT JOIN impressions_log i ON i.campaign_id = c.id
        WHERE c.status = 'active'
        GROUP BY c.id, c.total_budget
        "#
    )
    .fetch_all(pool)
    .await {
        Ok(r) => r,
        Err(e) => { eprintln!("sync_budgets_to_redis query error: {:?}", e); return; }
    };

    for row in rows.iter() {
        let id: i32 = sqlx::Row::get(row, 0);
        let total: f64 = sqlx::Row::get(row, 1);
        let spent: f64 = sqlx::Row::get(row, 2);
        let remaining = (total - spent).max(0.0);
        let key = format!("campaign:{}:budget", id);
        let _: Result<(), _> = conn.set(key, remaining).await;
    }

    println!("Reflected {} campaign budgets from PostgreSQL into Redis.", rows.len());
}

pub(crate) fn parse_u64_field(v: &serde_json::Value) -> u64 {
    if let Some(n) = v.as_u64() {
        return n;
    }
    if let Some(s) = v.as_str() {
        return s.parse::<u64>().unwrap_or(0);
    }
    0
}

pub(crate) async fn health_check(State(state): State<AppState>) -> Result<(StatusCode, String), StatusCode> {
    let row: (i32,) = sqlx::query_as("SELECT 1")
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if row.0 == 1 {
        Ok((StatusCode::OK, "Database connection healthy!".to_string()))
    } else {
        Err(StatusCode::INTERNAL_SERVER_ERROR)
    }
}

pub(crate) async fn migrate_plaintext_passwords(pool: &sqlx::PgPool) {
    let rows = match sqlx::query("SELECT id, password_hash FROM users WHERE password_hash NOT LIKE '$argon2%'")
        .fetch_all(pool)
        .await {
        Ok(r) => r,
        Err(e) => { eprintln!("password migration query error: {:?}", e); return; }
    };

    let mut migrated = 0;
    for row in rows.iter() {
        let id: i32 = sqlx::Row::get(row, 0);
        let plain: String = sqlx::Row::get(row, 1);
        if let Ok(hashed) = hash_password(&plain) {
            if sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
                .bind(&hashed)
                .bind(id)
                .execute(pool)
                .await
                .is_ok()
            {
                migrated += 1;
            }
        }
    }

    if migrated > 0 {
        println!("Hashed {} plaintext password(s) with Argon2.", migrated);
    }
}

pub(crate) async fn migrate_campaign_status(pool: &sqlx::PgPool) {
    let stmts = [
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active'",
        "CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(advertiser_id, status)",
    ];
    for sql in stmts {
        if let Err(e) = sqlx::query(sql).execute(pool).await {
            eprintln!("campaign status migration error: {:?}", e);
        }
    }
}

pub(crate) async fn migrate_campaign_targeting(pool: &sqlx::PgPool) {
    let stmts: Vec<&str> = [
        targeting_demographic_columns(),
        targeting_geo_columns(),
        targeting_personality_columns(),
        targeting_commerce_columns(),
    ]
    .concat();
    for sql in stmts {
        if let Err(e) = sqlx::query(sql).execute(pool).await {
            eprintln!("campaign targeting migration error: {:?}", e);
        }
    }
}

fn targeting_demographic_columns() -> Vec<&'static str> {
    vec![
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_age_min INT NOT NULL DEFAULT 13",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_age_max INT NOT NULL DEFAULT 80",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_genders TEXT[] NOT NULL DEFAULT '{male,female,nonbinary}'",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_income_min INT NOT NULL DEFAULT 1",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_income_max INT NOT NULL DEFAULT 10",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_household_min INT NOT NULL DEFAULT 1",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_household_max INT NOT NULL DEFAULT 10",
    ]
}

fn targeting_geo_columns() -> Vec<&'static str> {
    vec![
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_locations TEXT[] NOT NULL DEFAULT '{}'",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_languages TEXT[] NOT NULL DEFAULT '{}'",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_interests TEXT[] NOT NULL DEFAULT '{}'",
    ]
}

fn targeting_personality_columns() -> Vec<&'static str> {
    vec![
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS want_risk_taker BOOLEAN",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS want_relaxed BOOLEAN",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS want_open_new BOOLEAN",
    ]
}

fn targeting_commerce_columns() -> Vec<&'static str> {
    vec![
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_shopper VARCHAR(16) NOT NULL DEFAULT 'any'",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_price_min INT NOT NULL DEFAULT 1",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_price_max INT NOT NULL DEFAULT 10",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_media TEXT[] NOT NULL DEFAULT '{}'",
    ]
}

pub(crate) async fn migrate_dynamic_fields(pool: &sqlx::PgPool) {
    let stmts = [
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_fields JSONB",
    ];
    for sql in stmts {
        if let Err(e) = sqlx::query(sql).execute(pool).await {
            eprintln!("dynamic fields migration error: {:?}", e);
        }
    }
}

pub(crate) async fn metrics_summary(State(state): State<AppState>) -> Json<serde_json::Value> {
    use std::sync::atomic::Ordering::Relaxed;

    let requests = state.metrics.requests.load(Relaxed);
    let errors = state.metrics.errors.load(Relaxed);
    let (p95, p99) = state.metrics.percentiles();

    let uptime = state.metrics.started.elapsed().as_secs_f64().max(1.0);
    let error_rate = if requests == 0 {
        0.0
    } else {
        errors as f64 / requests as f64
    };

    Json(serde_json::json!({
        "rps": (requests as f64 / uptime * 100.0).round() / 100.0,
        "decision_latency_p95_ms": (p95 * 100.0).round() / 100.0,
        "decision_latency_p99_ms": (p99 * 100.0).round() / 100.0,
        "error_rate_pct": (error_rate * 100.0).round() / 100.0,
        "total_requests": requests,
        "total_errors": errors,
        "uptime_seconds": uptime.round(),
    }))
}

pub(crate) async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

pub(crate) async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.decision_tx.subscribe();

    loop {
        tokio::select! {
            result = rx.recv() => {
                match result {
                    Ok(event) => {
                        let msg = serde_json::to_string(&event).unwrap();
                        if socket.send(WsMessage::Text(msg.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        continue;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(5)) => {
                if socket.send(WsMessage::Ping(vec![].into())).await.is_err() {
                    break;
                }
            }
        }
    }
}
