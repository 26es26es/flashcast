import { apiUrl, authHeader } from './client';

export async function getAnalytics(token, advertiserId) {
  const path = advertiserId ? `/analytics?advertiser_id=${advertiserId}` : '/analytics';
  const res = await fetch(apiUrl(path), { headers: authHeader(token) });
  return res;
}
