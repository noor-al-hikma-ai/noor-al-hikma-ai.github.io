const retryAfter = new Map<string, number>();

export async function requestLiveModel(endpoint: string, payload: unknown): Promise<unknown> {
  let origin: string | undefined;
  try {
    origin = new URL(endpoint, window.location.href).origin;
    if ((retryAfter.get(origin) ?? 0) > Date.now()) return null;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) return await response.json();
    // The gateway can fail independently of the model. Let the browser keep
    // working locally for a short period after a transport outage.
    if (response.status === 503 || (response.status >= 500 && !response.headers.get("content-type")?.includes("application/json"))) {
      retryAfter.set(origin, Date.now() + 20_000);
    }
  } catch {
    if (origin) retryAfter.set(origin, Date.now() + 20_000);
  }
  return null;
}
