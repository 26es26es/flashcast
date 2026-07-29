export const API_BASE = 'http://localhost:8000';
export const WS_URL = 'ws://localhost:8000/ws';

export const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

export const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? authHeader(token) : {}),
});

export const apiUrl = (path) => `${API_BASE}${path}`;
