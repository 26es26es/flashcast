import { apiUrl, authHeader, jsonHeaders } from './client';

export async function listMyCampaigns(token) {
  const res = await fetch(apiUrl('/campaigns/mine'), { headers: authHeader(token) });
  return res;
}

export async function listAllCampaigns(token) {
  const res = await fetch(apiUrl('/campaigns/all'), { headers: authHeader(token) });
  return res;
}

export async function createCampaign(token, body) {
  const res = await fetch(apiUrl('/campaigns'), {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  return res;
}

export async function updateCampaign(token, id, body) {
  const res = await fetch(apiUrl(`/campaigns/${id}`), {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  return res;
}

export async function deleteCampaign(token, id) {
  const res = await fetch(apiUrl(`/campaigns/${id}`), {
    method: 'DELETE',
    headers: authHeader(token),
  });
  return res;
}

export async function activateCampaign(token, id) {
  const res = await fetch(apiUrl(`/campaigns/${id}/activate`), {
    method: 'POST',
    headers: authHeader(token),
  });
  return res;
}

export async function purgeCampaign(token, id) {
  const res = await fetch(apiUrl(`/campaigns/${id}/purge`), {
    method: 'DELETE',
    headers: authHeader(token),
  });
  return res;
}

export async function adjustBudget(token, id, amount) {
  const res = await fetch(apiUrl(`/campaigns/${id}/budget`), {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ amount }),
  });
  return res;
}
