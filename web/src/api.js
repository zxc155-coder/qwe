// API base URL. Empty string → use relative paths (vite dev proxy / same-origin).
// In production build, set VITE_API_URL to the absolute backend origin.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const apiUrl = (path) => `${API_BASE}${path}`;
