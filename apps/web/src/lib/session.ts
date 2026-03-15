import type { SessionTokens } from "./types";

const SESSION_STORAGE_KEY = "whisper-transcricao.session.v1";

function hasWindow() {
  return typeof window !== "undefined";
}

export function getSessionTokens(): SessionTokens | null {
  if (!hasWindow()) {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SessionTokens;
    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setSessionTokens(tokens: SessionTokens) {
  if (!hasWindow()) {
    return;
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(tokens));
}

export function clearSessionTokens() {
  if (!hasWindow()) {
    return;
  }
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
