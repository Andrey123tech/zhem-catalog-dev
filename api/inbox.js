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
    const pad = (n) => String(n).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(2);
    const mo = pad(d.getMonth() + 1);
    const da = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
    return "ZHM-" + yy + mo + da + "-" + hh + mm + "-" + rnd;
  }

  // Парсим табличный блок "Категория;Артикул;Размер;Кол-во"
  function parseOrderText(orderText) {
    if (!orderText || typeof orderText !== "string") return [];
    const lines = orderText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    // ищем строку-заголовок (может быть внутри длинного текста)
    let startIdx = lines.findIndex(l =>
      l.toLowerCase().includes("категория;") &&
      l.toLowerCase().includes("артикул;") &&
      l.toLowerCase().includes("кол-во")
    );
    if (startIdx < 0) return [];

    const out = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes(";")) continue;

      const parts = line.split(";").map(s => (s || "").trim());
      if (parts.length < 4) continue;

      const category = parts[0];
      const sku = parts[1];
      const size = parts[2] === "-" ? "" : parts[2];
      const qty = Number(parts[3]) || 0;

      // фильтр "шапки" и мусора
      if (!sku || sku.toLowerCase() === "артикул") continue;
      if (qty <= 0) continue;

      out.push({ category, sku, size, qty });
    }
    return out;
  }

  const item = req.body || {};
  const orderNo = item.orderNo || makeOrderNo();

  const entry = {
    id: "inbox_" + Date.now() + "_" + Math.random().toString(16).slice(2),
    createdAt: new Date().toISOString(),
    orderNo: orderNo,
    clientName: item.clientName || "",
    clientPhone: item.clientPhone || "",
    source: item.source || "catalog",
    note: item.note || "",
    items: (Array.isArray(item.items) && item.items.length)
      ? item.items
      : parseOrderText(item.orderText || "")
  };

  const ghHeaders = {
    "Authorization": "Bearer " + TOKEN,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  const apiBase = "https://api.github.com/repos/" + OWNER + "/" + REPO +
                  "/contents/" + encodeURIComponent(PATH);

  // 1) читаем текущий файл
  const getUrl = apiBase + "?ref=" + encodeURIComponent(BRANCH);
  const getResp = await fetch(getUrl, { headers: ghHeaders });

  let sha = null;
  let arr = [];

  if (getResp.status === 200) {
    const json = await getResp.json();
    sha = json.sha;
    const raw = Buffer.from(json.content || "", "base64").toString("utf8").trim();
    try { arr = raw ? JSON.parse(raw) : []; } catch { arr = []; }
  } else if (getResp.status === 404) {
    arr = [];
    sha = null;
  } else {
    const t = await getResp.text();
    return res.status(500).json({
      ok: false,
      error: "GitHub GET failed",
      status: getResp.status,
      details: t.slice(0, 400)
    });
  }

  arr.push(entry);

  // 2) пишем обновлённый файл
  const newContent = Buffer.from(JSON.stringify(arr, null, 2), "utf8").toString("base64");
  const putBody = {
    message: "inbox: add order " + entry.id,
    content: newContent,
    branch: BRANCH
  };
  if (sha) putBody.sha = sha;

  const putResp = await fetch(apiBase, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(putBody)
  });

  if (putResp.status < 200 || putResp.status >= 300) {
    const t = await putResp.text();
    return res.status(500).json({
      ok: false,
      error: "GitHub PUT failed",
      status: putResp.status,
      details: t.slice(0, 500)
    });
  }

  return res.status(200).json({ ok: true, saved: true, id: entry.id, count: arr.length });
}
