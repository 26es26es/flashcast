use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use std::time::Duration;
use rdkafka::producer::FutureProducer;
use metrics_exporter_prometheus::PrometheusBuilder;
use axum::{
    routing::{get, post, put, delete},
    Router,
};
use tower_http::cors::{Any, CorsLayer};

mod models;
mod handlers;
mod engine;
mod infra;
mod targeting;

use models::DecisionEvent;
use infra::{DecisionMetrics, sync_budgets_to_redis, migrate_plaintext_passwords,
            migrate_campaign_status, migrate_campaign_targeting, migrate_dynamic_fields,
            health_check, metrics_summary, ws_handler};
use handlers::{login, change_password, create_campaign, list_campaigns, list_all_campaigns,
               list_advertisers, create_advertiser, delete_advertiser, campaign_stats,
               update_campaign, delete_campaign, activate_campaign, purge_campaign, add_budget,
               record_click, get_analytics, get_advertiser_fields,
               list_logo_options, get_advertiser_logo, update_advertiser_logo};
use engine::{simulate_start, simulate_stop, simulate_status,
             make_decision, start_analytics_consumer};

pub(crate) type SimRegistry = std::sync::Arc<std::sync::Mutex<std::collections::HashSet<i32>>>;

pub(crate) const GLOBAL_SIM_KEY: i32 = 0;

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) db: sqlx::PgPool,
    pub(crate) redis: redis::aio::MultiplexedConnection,
    pub(crate) kafka_producer: FutureProducer,
    pub(crate) jwt_secret: String,
    pub(crate) decision_tx: tokio::sync::broadcast::Sender<DecisionEvent>,
    pub(crate) sim_running: SimRegistry,
    pub(crate) metrics: std::sync::Arc<DecisionMetrics>,
}

fn build_router(prometheus_handle: metrics_exporter_prometheus::PrometheusHandle) -> Router<AppState> {
    Router::new()
        .merge(health_routes())
        .merge(auth_routes())
        .merge(campaign_routes())
        .merge(advertiser_routes())
        .merge(decision_routes())
        .merge(analytics_routes())
        .merge(simulation_routes())
        .merge(metrics_routes(prometheus_handle))
}

fn health_routes() -> Router<AppState> {
    Router::new()
        .route("/health", get(health_check))
        .route("/ws", get(ws_handler))
}

fn auth_routes() -> Router<AppState> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/change-password", post(change_password))
}

fn campaign_routes() -> Router<AppState> {
    Router::new()
        .route("/campaigns", post(create_campaign))
        .route("/campaigns/mine", get(list_campaigns))
        .route("/campaigns/all", get(list_all_campaigns))
        .route("/campaigns/{id}/stats", get(campaign_stats))
        .route("/campaigns/{id}", put(update_campaign).delete(delete_campaign))
        .route("/campaigns/{id}/activate", post(activate_campaign))
        .route("/campaigns/{id}/purge", delete(purge_campaign))
        .route("/campaigns/{id}/budget", post(add_budget))
}

fn advertiser_routes() -> Router<AppState> {
    Router::new()
        .route("/advertisers", get(list_advertisers).post(create_advertiser))
        .route("/advertisers/{id}", delete(delete_advertiser))
        .route("/advertisers/{id}/fields", get(get_advertiser_fields))
        .route("/advertisers/logos", get(list_logo_options))
        .route("/advertisers/{id}/logo", get(get_advertiser_logo).put(update_advertiser_logo))
}

fn decision_routes() -> Router<AppState> {
    Router::new()
        .route("/decisions", post(make_decision))
        .route("/decisions/click", post(record_click))
}

fn analytics_routes() -> Router<AppState> {
    Router::new()
        .route("/analytics", get(get_analytics))
}

fn simulation_routes() -> Router<AppState> {
    Router::new()
        .route("/simulate/start", post(simulate_start))
        .route("/simulate/stop", post(simulate_stop))
        .route("/simulate/status", get(simulate_status))
}

fn metrics_routes(prometheus_handle: metrics_exporter_prometheus::PrometheusHandle) -> Router<AppState> {
    Router::new()
        .route("/metrics", get(move || std::future::ready(prometheus_handle.render())))
        .route("/metrics/summary", get(metrics_summary))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let (decision_tx, _) = tokio::sync::broadcast::channel::<DecisionEvent>(2048);
    let sim_running: SimRegistry = std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashSet::new()));
    let prometheus_handle = PrometheusBuilder::new()
        .install_recorder()
        .expect("Failed to install Prometheus recorder");
    let database_url = "postgres://flashcast_admin:supersecretpassword@127.0.0.1:5432/flashcast";

    let db_pool = PgPoolOptions::new()
        .max_connections(25)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await
        .expect("Failed to connect to the PostgreSQL database container");

    let redis_client = redis::Client::open("redis://127.0.0.1:6379/")
        .expect("Failed to create Redis client connection framework");

    let redis_conn = redis_client
        .get_multiplexed_tokio_connection()
        .await
        .expect("Failed to open the Redis multiplexed connection");

    migrate_plaintext_passwords(&db_pool).await;
    migrate_campaign_status(&db_pool).await;
    migrate_campaign_targeting(&db_pool).await;
    migrate_dynamic_fields(&db_pool).await;
    sync_budgets_to_redis(&db_pool, redis_conn.clone()).await;

    let producer: FutureProducer = rdkafka::config::ClientConfig::new()
        .set("bootstrap.servers", "127.0.0.1:9092")
        .set("message.timeout.ms", "5000")
        .create()
        .expect("Failed to create Kafka producer layer");

    let state = AppState {
        db: db_pool,
        redis: redis_conn,
        kafka_producer: producer,
        jwt_secret: "super_secret_flashcast_key_change_in_production".to_string(),
        decision_tx,
        sim_running,
        metrics: std::sync::Arc::new(DecisionMetrics::new()),
    };
    tokio::spawn(async {
        start_analytics_consumer().await;
    });
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    let app = build_router(prometheus_handle)
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    println!("Inbound Gateway listening on http://{}", addr);

    axum::serve(listener, app).await.unwrap();
}
