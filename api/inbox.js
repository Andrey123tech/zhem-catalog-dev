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
    return res.status(500).json({ ok:false, error:"Missing env: GITHUB_OWNER/GITHUB_REPO/GITHUB_TOKEN" });
  }

  const item = req.body || {};

function pad(n,len){ n=String(n); return n.length>=len ? n : "0".repeat(len-n.length)+n; }
function makeOrderNo(){
  const d=new Date();
  const yy=String(d.getFullYear()).slice(-2);
  const mm=pad(d.getMonth()+1,2);
  const dd=pad(d.getDate(),2);
  const hh=pad(d.getHours(),2);
  const mi=pad(d.getMinutes(),2);
  const rnd=pad(Math.floor(Math.random()*1000),3); // 000-999
  return `${yy}${mm}${dd}-${hh}${mi}-${rnd}`;
}

  const d=new Date();
  const pad=(n)=>String(n).padStart(2,"0");
  const y=String(d.getFullYear()).slice(2);
  const m=pad(d.getMonth()+1);
  const day=pad(d.getDate());
  const hh=pad(d.getHours());
  const mm=pad(d.getMinutes());
  const rnd=Math.random().toString(36).slice(2,5).toUpperCase();
  const orderNo=`ZHM---`;

const entry = {
    id: `inbox_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    clientName: item.clientName || "",
    clientPhone: item.clientPhone || "",
    source: item.source || "catalog",
    orderNo: orderNo,
    items: (Array.isArray(item.items) && item.items.length)
      ? item.items
      : parseOrderText(item.orderText || ""),
    note: item.note || ""
  };

function parseOrderText(txt) {
  if (!txt || typeof txt !== "string") return [];
  const lines = txt.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (!line.includes(";")) continue;
    const [category, sku, size, qty] = line.split(";").map(s => s && s.trim());
    if (!sku || !qty) continue;
    out.push({
      category: category || "",
      sku,
      size: size === "-" ? "" : size,
      qty: Number(qty) || 0
    });
  }
  return out;
}


  const ghHeaders = {
    "Authorization": `Bearer ${TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(PATH)}`;

  // 1) читаем текущий файл
  const getUrl = `${apiBase}?ref=${encodeURIComponent(BRANCH)}`;
  const getResp = await fetch(getUrl, { headers: ghHeaders });

  let sha = null;
  let arr = [];

  if (getResp.status === 200) {
    const json = await getResp.json();
    sha = json.sha;
    const raw = Buffer.from(json.content || "", "base64").toString("utf8").trim();
    try { arr = raw ? JSON.parse(raw) : []; } catch { arr = []; }
  } else if (getResp.status === 404) {
    // файла нет — создадим новый
    arr = [];
    sha = null;
  } else {
    const t = await getResp.text();
    return res.status(500).json({ ok:false, error:"GitHub GET failed", status:getResp.status, details:t.slice(0,400) });
  }

  arr.push(entry);

  // 2) пишем обновлённый файл
  const newContent = Buffer.from(JSON.stringify(arr, null, 2), "utf8").toString("base64");
  const putBody = {
    message: `inbox: add order ${entry.id}`,
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
    return res.status(500).json({ ok:false, error:"GitHub PUT failed", status:putResp.status, details:t.slice(0,500) });
  }

  return res.status(200).json({ ok:true, saved:true, id: entry.id, count: arr.length });
}
