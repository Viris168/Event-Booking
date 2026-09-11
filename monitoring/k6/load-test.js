import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────────────────────────
const errorRate   = new Rate('error_rate');
const eventsTrend = new Trend('events_list_duration');
const eventTrend  = new Trend('event_detail_duration');

// ── Load profile ──────────────────────────────────────────────────────────────
// Stages simulate real traffic ramp-up:
//   0 → 100 VUs in 30s  (users arriving)
//   hold 100 VUs for 1m (sustained load)
//   100 → 0 in 15s      (cool-down)
// Change TARGET_USERS below to switch between 100 / 1000 user tests.
const TARGET_USERS = __ENV.USERS ? parseInt(__ENV.USERS) : 100;

export const options = {
  stages: [
    { duration: '30s', target: TARGET_USERS },       // ramp up
    { duration: '1m',  target: TARGET_USERS },       // hold
    { duration: '15s', target: 0 },                  // ramp down
  ],
  thresholds: {
    // Alert if more than 5% of requests fail
    error_rate: ['rate<0.05'],
    // Alert if p95 response time exceeds 2s
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE = 'http://host.docker.internal:8080';
const EVENT_IDS = [1, 2, 3]; // real event IDs from your DB

// ── Virtual user scenario ─────────────────────────────────────────────────────
// Each VU simulates one user browsing the site:
//   1. Hit the homepage (events list)
//   2. Click into one event
//   3. Hit health endpoint (like a browser polling)
export default function () {

  // 1. Browse events list
  const listRes = http.get(`${BASE}/api/v1/events`, {
    tags: { name: 'GET /api/v1/events' },
  });
  eventsTrend.add(listRes.timings.duration);
  check(listRes, { 'events list 200': (r) => r.status === 200 });
  errorRate.add(listRes.status !== 200);

  sleep(1); // think time between pages

  // 2. View a random event detail
  const id = EVENT_IDS[Math.floor(Math.random() * EVENT_IDS.length)];
  const detailRes = http.get(`${BASE}/api/v1/events/${id}`, {
    tags: { name: 'GET /api/v1/events/{id}' },
  });
  eventTrend.add(detailRes.timings.duration);
  check(detailRes, { 'event detail 2xx': (r) => r.status >= 200 && r.status < 300 });
  errorRate.add(detailRes.status >= 400);

  sleep(1);

  // 3. Health check (background poll)
  const healthRes = http.get(`${BASE}/actuator/health`, {
    tags: { name: 'GET /actuator/health' },
  });
  check(healthRes, { 'health 200': (r) => r.status === 200 });

  sleep(Math.random() * 2); // random think time 0–2s (realistic)
}
