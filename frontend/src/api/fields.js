import { apiUrl, authHeader } from './client';

export async function getFields(token, advertiserId) {
  const res = await fetch(apiUrl(`/advertisers/${advertiserId}/fields`), { headers: authHeader(token) });
  return res;
}
