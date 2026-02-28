/**
 * Centralized user identity utilities.
 * All pages should import getUserId() from here instead of defining their own.
 *
 * Current: reads from localStorage (set by useLogin).
 * Future: should read from a proper auth context with JWT validation.
 */

export interface UserData {
  id?: string | number;
  uuid?: string;
  email?: string;
  userName?: string;
  phoneNumber?: string;
  [key: string]: unknown;
}

/**
 * Get the current user's ID from localStorage.
 * Returns the most stable identifier available: id → uuid → email.
 * Returns "0" only as a last resort (unauthenticated/demo).
 */
export function getUserId(): string {
  try {
    const raw = localStorage.getItem("userData");
    if (!raw) return "0";
    const d: UserData = JSON.parse(raw);
    const id = String(d.id ?? d.uuid ?? d.email ?? "").trim();
    return id || "0";
  } catch {
    return "0";
  }
}

/**
 * Get the full user data object from localStorage.
 */
export function getUserData(): UserData | null {
  try {
    const raw = localStorage.getItem("userData");
    if (!raw) return null;
    return JSON.parse(raw) as UserData;
  } catch {
    return null;
  }
}

/**
 * Check if the user is authenticated (not demo/fallback).
 */
export function isAuthenticated(): boolean {
  const id = getUserId();
  return id !== "0" && id !== "";
}

/**
 * Get the display name for the current user.
 */
export function getUserDisplayName(): string {
  const data = getUserData();
  if (!data) return "Guest";
  return String(data.userName ?? data.email ?? "User").trim() || "User";
}

/**
 * Get the stored JWT auth token from localStorage.
 */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem("authToken");
  } catch {
    return null;
  }
}

/**
 * Store a JWT auth token in localStorage.
 */
export function setAuthToken(token: string): void {
  try {
    localStorage.setItem("authToken", token);
  } catch {
    // ignore storage errors
  }
}

/**
 * Clear all auth data (user data and token) from localStorage.
 */
export function clearAuth(): void {
  try {
    localStorage.removeItem("userData");
    localStorage.removeItem("authToken");
  } catch {
    // ignore storage errors
  }
}

/**
 * Get authorization headers for API requests.
 * Includes Bearer token if available, and always includes Content-Type.
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}
