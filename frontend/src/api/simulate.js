import { apiUrl, authHeader, jsonHeaders } from './client';

export async function simulateStatus(token, advertiserId) {
  const q = advertiserId != null ? `?advertiser_id=${advertiserId}` : '';
  const res = await fetch(apiUrl(`/simulate/status${q}`), { headers: authHeader(token) });
  return res;
}

export async function simulateStart(token, { rate, duration, audience, advertiserId, clickRate }) {
  const res = await fetch(apiUrl('/simulate/start'), {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      rate,
      duration,
      audience,
      advertiser_id: advertiserId ?? null,
      click_rate: clickRate,
    }),
  });
  return res;
}

export async function simulateStop(token, advertiserId) {
  const res = await fetch(apiUrl('/simulate/stop'), {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ advertiser_id: advertiserId ?? null }),
  });
  return res;
}
