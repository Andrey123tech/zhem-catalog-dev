export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  // Healthcheck — НЕ трогаем env, просто отвечаем
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, endpoint: "/api/inbox" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const OWNER = process.env.GITHUB_OWNER;
  const REPO  = process.env.GITHUB_REPO;
  const TOKEN = process.env.GITHUB_TOKEN;
  const BRANCH = process.env.INBOX_BRANCH || "manager";
  const PATH = process.env.INBOX_PATH || "data/manager_inbox.json";

  if (!OWNER || !REPO || !TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "Missing env: GITHUB_OWNER/GITHUB_REPO/GITHUB_TOKEN"
    });
  }

  function makeOrderNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2,"0");
  const y = String(d.getFullYear()).slice(2);
  const m = pad(d.getMonth()+1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `ZHM-${y}${m}${day}-${hh}${mm}${ss}`;
}
