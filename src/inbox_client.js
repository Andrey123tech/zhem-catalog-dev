export function sendOrderToInbox(payload) {
  try {
    const url = "/api/inbox";
    const body = JSON.stringify(payload || {});

    // 1) sendBeacon - не блокирует переход на wa.me
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }

    // 2) запасной вариант
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    }).catch(() => {});
  } catch (e) {}
}
