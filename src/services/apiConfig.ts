/**
 * Centralized API configuration.
 *
 * Local dev: falls back to http://localhost:8000 / ws://localhost:8000
 * Docker:    set VITE_API_BASE_URL="" (empty) so requests go through the
 *            nginx reverse proxy on the same origin (/api/*, /ws/*).
 */

const envApi = import.meta.env.VITE_API_BASE_URL;
const envWs = import.meta.env.VITE_WS_BASE_URL;

export const API_BASE_URL: string =
  envApi !== undefined && envApi !== ""
    ? envApi.replace(/\/+$/, "")
    : envApi === ""
      ? ""
      : "http://localhost:8000";

export const WS_BASE_URL: string =
  envWs !== undefined && envWs !== ""
    ? envWs.replace(/\/+$/, "")
    : envWs === ""
      ? ""
      : API_BASE_URL.replace(/^http/, "ws");
