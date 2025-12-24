export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  // Healthcheck
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
    return res.status(500).json({ ok:false, error:"Missing GitHub env vars" });
  }

  // --- аккуратный человекочитаемый номер ---
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  const y = String(d.getFullYear()).slice(2);
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const rnd = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const orderNo = `ZHM-${y}${m}${day}-${hh}${mm}-${rnd}`;

  const body = req.body || {};
  const entry = {
    id: `inbox_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    orderNo,
    clientName: body.clientName || "",
    clientPhone: body.clientPhone || "",
    source: body.source || "catalog",
    items: Array.isArray(body.items) ? body.items : [],
    note: body.note || "",
    orderText: body.orderText || ""
  };

  const ghHeaders = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;

  try {
    // читаем файл
    let sha = null;
    let arr = [];

    const getResp = await fetch(`${apiBase}?ref=${BRANCH}`, { headers: ghHeaders });

    if (getResp.status === 200) {
      const json = await getResp.json();
      sha = json.sha;
      const raw = Buffer.from(json.content || "", "base64").toString("utf8");
      arr = raw ? JSON.parse(raw) : [];
    } else if (getResp.status !== 404) {
      const t = await getResp.text();
      return res.status(500).json({ ok:false, error:"GitHub GET failed", details:t });
    }

    arr.push(entry);

    const content = Buffer.from(JSON.stringify(arr, null, 2)).toString("base64");

    const putBody = {
      message: `inbox: add ${entry.orderNo}`,
      content,
      branch: BRANCH,
      ...(sha ? { sha } : {})
    };

    const putResp = await fetch(apiBase, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(putBody)
    });

    if (!putResp.ok) {
      const t = await putResp.text();
      return res.status(500).json({ ok:false, error:"GitHub PUT failed", details:t });
    }

    return res.status(200).json({ ok:true, saved:true, orderNo });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e) });
  }
}
