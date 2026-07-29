import { apiUrl, jsonHeaders, authHeader } from './client';

export async function getAdvertiserLogo(token, id) {
  const res = await fetch(apiUrl(`/advertisers/${id}/logo`), { headers: authHeader(token) });
  return res;
}

export async function updateAdvertiserLogo(token, id, logo) {
  const res = await fetch(apiUrl(`/advertisers/${id}/logo`), {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({ logo }),
  });
  return res;
}

export async function listAdvertisers() {
  const res = await fetch(apiUrl('/advertisers'));
  return res;
}

export async function createAdvertiser(email, password) {
  const res = await fetch(apiUrl('/advertisers'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  return res;
}

export async function deleteAdvertiser(id) {
  const res = await fetch(apiUrl(`/advertisers/${id}`), { method: 'DELETE' });
  return res;
}
