export async function sendOrderToInbox(payload) {
  const body = payload || {};
  const resp = await fetch("/api/inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  // если сервер упал — бросаем ошибку (чтобы клиент мог сделать fallback)
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error("inbox failed: " + resp.status + " " + t.slice(0,200));
  }

  const json = await resp.json().catch(() => ({}));
  return json; // ожидаем { ok:true, orderNo:"...", ... }
}
