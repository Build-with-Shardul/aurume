// Thin Browserbase REST helpers: create a cloud-browser session, get its live-view
// URL (to watch/replay), and end it. The agent connects to the session over CDP.
const BASE = "https://api.browserbase.com";

export type BrowserbaseSession = { id: string; connectUrl: string };

export async function createSession(apiKey: string, projectId: string): Promise<BrowserbaseSession> {
  const res = await fetch(`${BASE}/v1/sessions`, {
    method: "POST",
    headers: { "X-BB-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Browserbase create-session ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as { id: string; connectUrl?: string };
  const connectUrl = data.connectUrl || `wss://connect.browserbase.com?apiKey=${encodeURIComponent(apiKey)}&sessionId=${data.id}`;
  return { id: data.id, connectUrl };
}

/** Live-view / debugger URL to embed or open (works while the session is live and as a replay after). */
export async function getLiveViewUrl(apiKey: string, sessionId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/v1/sessions/${sessionId}/debug`, { headers: { "X-BB-API-Key": apiKey } });
    if (!res.ok) return null;
    const data = (await res.json()) as { debuggerFullscreenUrl?: string; debuggerUrl?: string };
    return data.debuggerFullscreenUrl || data.debuggerUrl || null;
  } catch {
    return null;
  }
}

export async function endSession(apiKey: string, projectId: string, sessionId: string): Promise<void> {
  try {
    await fetch(`${BASE}/v1/sessions/${sessionId}`, {
      method: "POST",
      headers: { "X-BB-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, status: "REQUEST_RELEASE" }),
    });
  } catch {
    /* best effort */
  }
}
