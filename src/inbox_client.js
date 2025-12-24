export async function sendOrderToInbox(payload) {
  try {
    const url = "/api/inbox";
    const body = JSON.stringify(payload || {});
    // 1) Лучший вариант: sendBeacon (работает даже если страница уходит на wa.me)
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(url, blob);
      // если sendBeacon вернул false — попробуем запасной fetch
      if (ok) return;
    }

    // 2) Запасной вариант: fetch с keepalive
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    });
  } catch (e) {
    // намеренно молчим — inbox не должен ломать отправку в WhatsApp
  }
}
