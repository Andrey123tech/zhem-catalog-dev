export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"Method not allowed" });

  const OWNER = process.env.GITHUB_OWNER;
  const REPO  = process.env.GITHUB_REPO;
  const TOKEN = process.env.GITHUB_TOKEN;
  const BRANCH = process.env.INBOX_BRANCH || "manager";
  const PATH = process.env.INBOX_PATH || "data/manager_inbox.json";

  if (!OWNER || !REPO || !TOKEN) {
    return res.status(500).json({ ok:false, error:"Missing env: GITHUB_OWNER/GITHUB_REPO/GITHUB_TOKEN" });
  }

  const ghHeaders = {
    "Authorization": `Bearer ${TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(PATH)}?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { headers: ghHeaders });

  if (r.status === 404) return res.status(200).json({ ok:true, items: [] });
  if (r.status !== 200) {
    const t = await r.text();
    return res.status(500).json({ ok:false, error:"GitHub GET failed", status:r.status, details:t.slice(0,400) });
  }

  const json = await r.json();
  const raw = Buffer.from(json.content || "", "base64").toString("utf8").trim();
  let items = [];
  try { items = raw ? JSON.parse(raw) : []; } catch { items = []; }

  // новые сверху
  items.sort((a,b)=> String(b.createdAt||"").localeCompare(String(a.createdAt||"")));

  res.status(200).json({ ok:true, items });
}
