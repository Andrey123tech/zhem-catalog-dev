export async function sendOrderToInbox(payload) {
  try {
    const resp = await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await resp.json().catch(()=>({}));
    if (!resp.ok) throw new Error(json?.error || `HTTP ${resp.status}`);
    return { ok:true, json };
  } catch (e) {
    console.warn("Inbox send failed:", e);
    return { ok:false, error: String(e?.message || e) };
  }
}
