import { apiUrl, jsonHeaders } from './client';

export async function login(email, passwordHash) {
  const res = await fetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password_hash: passwordHash }),
  });
  return res;
}

export async function changePassword(token, currentPassword, newPassword) {
  const res = await fetch(apiUrl('/auth/change-password'), {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  return res;
}
