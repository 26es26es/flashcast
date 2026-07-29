import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
const decisionApprovedCount  = new Counter('flashcast_decisions_approved');
const decisionNoFillCount    = new Counter('flashcast_decisions_no_fill');
const clickCount             = new Counter('flashcast_clicks_sent');
const decisionDuration       = new Trend('flashcast_decision_duration_ms', true);
const approvalRate           = new Rate('flashcast_approval_rate');

const BASE = 'http://localhost:8000';
const CATEGORIES = ['gaming', 'sports', 'music', 'tech', 'finance'];
const CLICK_RATE = 0.15;
const SCENARIO = __ENV.SCENARIO || 'steady';

const scenarioOptions = {
  steady: {
    executor: 'constant-vus',
    vus: 50,
    duration: '2m',
  },
  ramp: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m',  target: 100 },
      { duration: '2m',  target: 500 },
      { duration: '1m',  target: 100 },
      { duration: '30s', target: 0   },
    ],
  },
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 1000 },
      { duration: '30s', target: 1000 },
      { duration: '10s', target: 0    },
    ],
  },
  budget_verify: {
    executor: 'constant-vus',
    vus: 20,
    duration: '3m',
  },
};

export const options = {
  scenarios: {
    main: {
      ...scenarioOptions[SCENARIO],
      exec: 'defaultFunc',
    },
  },
  thresholds: {
    'flashcast_decision_duration_ms': ['p(95)<50'],

    'http_req_failed': ['rate<0.01'],
    'flashcast_approval_rate': ['rate>0.5'],
  },
};
export function defaultFunc() {
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

  const start = Date.now();
  const res = http.post(
    `${BASE}/decisions`,
    JSON.stringify({ category }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  decisionDuration.add(Date.now() - start);

  const ok = check(res, {
    'status is 200':          r => r.status === 200,
    'has campaign_id field':  r => JSON.parse(r.body).campaign_id !== undefined,
    'has status field':       r => JSON.parse(r.body).status !== undefined,
  });

  if (res.status === 200) {
    let body;
    try { body = JSON.parse(res.body); } catch { return; }

    if (body.status === 'Approved') {
      decisionApprovedCount.add(1);
      approvalRate.add(1);
      if (Math.random() < CLICK_RATE && body.campaign_id > 0) {
        const clickRes = http.post(
          `${BASE}/decisions/click`,
          JSON.stringify({ campaign_id: body.campaign_id }),
          { headers: { 'Content-Type': 'application/json' } }
        );
        check(clickRes, { 'click recorded': r => r.status === 200 });
        clickCount.add(1);
      }
    } else {
      decisionNoFillCount.add(1);
      approvalRate.add(0);
    }
  }

  sleep(0.01); 
}
export function setup() {
  console.log(`Running scenario: ${SCENARIO}`);
  console.log('Seeding a test campaign…');

  const res = http.post(
    `${BASE}/campaigns`,
    JSON.stringify({
      advertiser_id: 1,
      name: `k6 Load Test Campaign - ${new Date().toISOString()}`,
      total_budget: 999999,
      max_cpm: 10.0,
      target_categories: CATEGORIES,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (res.status === 201) {
    const camp = JSON.parse(res.body);
    console.log(`Campaign seeded: id=${camp.id}`);
    return { campaign_id: camp.id };
  } else {
    console.warn('Could not seed campaign — using existing data');
    return {};
  }
}
export function teardown(data) {
  console.log('\n══════════════════════════════════════════');
  console.log(' k6 Teardown — Budget Consistency Check');
  console.log('══════════════════════════════════════════');

  if (!data.campaign_id) {
    console.log('No campaign_id from setup, skipping.');
    return;
  }
  sleep(3);
  const statsRes = http.get(`${BASE}/campaigns/${data.campaign_id}/stats`);
  if (statsRes.status !== 200) {
    console.warn('Could not fetch campaign stats');
    return;
  }

  const stats = JSON.parse(statsRes.body);
  console.log(`  Campaign ID:         ${data.campaign_id}`);
  console.log(`  Total budget:        $${stats.total_budget}`);
  console.log(`  Postgres spend:      $${stats.spent}`);
  console.log(`  Remaining (Postgres):$${stats.remaining}`);
  console.log(`  Impressions logged:  ${stats.impressions}`);
  const analyticsRes = http.get(`${BASE}/analytics`);
  if (analyticsRes.status === 200) {
    const analytics = JSON.parse(analyticsRes.body);
    const totalClickhouseSpend = analytics.reduce((s, p) => s + p.spend, 0);
    console.log(`  ClickHouse spend:    $${totalClickhouseSpend.toFixed(6)}`);

    const drift = Math.abs(stats.spent - totalClickhouseSpend);
    console.log(`  Drift (Postgres vs ClickHouse): $${drift.toFixed(6)}`);
    if (drift < 0.001) {
      console.log('  ✓ PASS — no events lost, spend is consistent');
    } else {
      console.warn('  ✗ WARN — drift detected, some Kafka events may not have flushed yet');
    }
  }

  console.log('══════════════════════════════════════════');
}
