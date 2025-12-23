export async function loadManagerInbox() {
  const res = await fetch('/data/manager_inbox.json?_=' + Date.now());
  if (!res.ok) return [];
  return await res.json();
}
