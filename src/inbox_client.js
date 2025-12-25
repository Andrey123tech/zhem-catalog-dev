export async function sendOrderToInbox(payload) {
  try {
    const res = await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });

    // не ломаем WhatsApp, просто вернём ошибку как объект
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text.slice(0, 200) };
    }

    return await res.json();
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}
