/* Ich lerne Deutsch — Verfasser-Bereich logic */

const API = "https://api.github.com";
const SETTINGS_KEY = "ild_settings_v1";

/* ---------- shared render helpers (same logic as main.js) ---------- */
function escapeHTML(str){
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function splitParagraphs(rawText){
  return rawText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}
function renderParagraphHTML(rawParagraph, words){
  let marked = rawParagraph;
  if (words && words.length){
    const sorted = [...words].filter(Boolean).sort((a,b) => b.length - a.length);
    sorted.forEach(w => {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<![\\p{L}\\p{N}])(${esc})(?![\\p{L}\\p{N}])`, "giu");
      marked = marked.replace(re, "\uE000$1\uE001");
    });
  }
  let escaped = escapeHTML(marked);
  escaped = escaped.split("\uE000").join('<mark class="hl">').split("\uE001").join("</mark>");
  return escaped;
}
function renderContentHTML(rawContent, words){
  return splitParagraphs(rawContent).map(p => `<p>${renderParagraphHTML(p, words)}</p>`).join("");
}

/* ---------- slug / id ---------- */
function slugify(title){
  const map = { ä:"ae", ö:"oe", ü:"ue", ß:"ss", Ä:"ae", Ö:"oe", Ü:"ue" };
  const cleaned = title.replace(/[äöüßÄÖÜ]/g, c => map[c] || c);
  return cleaned
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "eintrag";
}

/* ---------- base64 <-> utf8 (handles ä ö ü ß correctly) ---------- */
function utf8FromBase64(b64){
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}
function base64FromUtf8(str){
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

/* ---------- settings persistence ---------- */
function loadSettings(){
  try{ return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
  catch{ return {}; }
}
function saveSettingsToStorage(s){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function applySettingsToForm(){
  const s = loadSettings();
  document.getElementById("gh-owner").value = s.owner || "";
  document.getElementById("gh-repo").value = s.repo || "";
  document.getElementById("gh-branch").value = s.branch || "main";
  document.getElementById("gh-token").value = s.token || "";
}

document.getElementById("save-settings").addEventListener("click", () => {
  const s = {
    owner: document.getElementById("gh-owner").value.trim(),
    repo: document.getElementById("gh-repo").value.trim(),
    branch: document.getElementById("gh-branch").value.trim() || "main",
    token: document.getElementById("gh-token").value.trim()
  };
  saveSettingsToStorage(s);
  showStatus("সেটিংস সেভ হয়েছে।", "ok");
});

/* ---------- status helper ---------- */
function showStatus(msg, kind){
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = "status show " + (kind || "info");
}

/* ---------- gather form into article object ---------- */
function buildArticle(){
  const title = document.getElementById("title").value.trim();
  const date = document.getElementById("date").value || new Date().toISOString().slice(0,10);
  const category = document.getElementById("category").value.trim();
  const content = document.getElementById("content").value.trim();
  const highlightWords = document.getElementById("highlight").value
    .split(",").map(w => w.trim()).filter(Boolean);
  const id = `${slugify(title)}-${Date.now().toString(36)}`;
  return { id, title, date, category, highlightWords, content };
}

/* ---------- preview ---------- */
document.getElementById("preview-btn").addEventListener("click", () => {
  const a = buildArticle();
  if (!a.title || !a.content){
    showStatus("প্রিভিউ দেখার জন্য Titel ও Inhalt পূরণ করো।", "err");
    return;
  }
  document.getElementById("preview-title").textContent = a.title;
  document.getElementById("preview-body").innerHTML = renderContentHTML(a.content, a.highlightWords);
  document.getElementById("preview-box").classList.remove("hidden");
});

/* ---------- download-only fallback ---------- */
function downloadJSON(filename, dataObj){
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("download-btn").addEventListener("click", async () => {
  const article = buildArticle();
  if (!article.title || !article.content){
    showStatus("Titel ও Inhalt আগে পূরণ করো।", "err");
    return;
  }
  try{
    const res = await fetch("./articles.json", { cache: "no-store" });
    const current = res.ok ? await res.json() : [];
    current.unshift(article);
    downloadJSON("articles.json", current);
    showStatus("articles.json ডাউনলোড হয়েছে — এটা তোমার GitHub repo-তে আপলোড/কমিট করে দিও।", "ok");
  } catch (err){
    showStatus("বিদ্যমান articles.json পড়তে সমস্যা হয়েছে। নতুন ফাইল ডাউনলোড হচ্ছে শুধু এই আর্টিকেলসহ।", "err");
    downloadJSON("articles.json", [article]);
  }
});

/* ---------- GitHub Contents API publish ---------- */
async function getCurrentFile(owner, repo, branch, token){
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/contents/articles.json?ref=${encodeURIComponent(branch)}`,
    { headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" } }
  );
  if (!res.ok){
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub-Fehler beim Laden (${res.status})`);
  }
  const data = await res.json();
  return { sha: data.sha, articles: JSON.parse(utf8FromBase64(data.content)) };
}

async function publishToGitHub(owner, repo, branch, token, article){
  const { sha, articles } = await getCurrentFile(owner, repo, branch, token);
  articles.unshift(article);
  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/articles.json`, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `Neuer Artikel: ${article.title}`,
      content: base64FromUtf8(JSON.stringify(articles, null, 2)),
      sha, branch
    })
  });
  if (!res.ok){
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub-Fehler beim Speichern (${res.status})`);
  }
}

/* ---------- submit ---------- */
document.getElementById("article-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const article = buildArticle();
  if (!article.title || !article.content){
    showStatus("Titel ও Inhalt লেখা বাধ্যতামূলক।", "err");
    return;
  }

  const s = loadSettings();
  if (!s.owner || !s.repo || !s.token){
    showStatus("GitHub-Einstellungen (Benutzername/Repo/Token) সেট করা নেই — তাই শুধু JSON ডাউনলোড করে দিচ্ছি, এটা ম্যানুয়ালি কমিট করো।", "info");
    const res = await fetch("./articles.json", { cache: "no-store" }).catch(() => null);
    const current = res && res.ok ? await res.json() : [];
    current.unshift(article);
    downloadJSON("articles.json", current);
    return;
  }

  const btn = document.getElementById("publish-btn");
  btn.disabled = true;
  showStatus("পাবলিশ হচ্ছে... (Wird veröffentlicht...)", "info");
  try{
    await publishToGitHub(s.owner, s.repo, s.branch || "main", s.token, article);
    showStatus("✅ Veröffentlicht! প্রকাশিত হয়েছে — GitHub Pages আপডেট হতে ১-২ মিনিট সময় নিতে পারে।", "ok");
    document.getElementById("article-form").reset();
    document.getElementById("preview-box").classList.add("hidden");
  } catch (err){
    showStatus("❌ পাবলিশ করতে সমস্যা হয়েছে: " + err.message + " — তাই বিকল্প হিসেবে JSON ডাউনলোড করে দিচ্ছি।", "err");
    const res = await fetch("./articles.json", { cache: "no-store" }).catch(() => null);
    const current = res && res.ok ? await res.json() : [];
    current.unshift(article);
    downloadJSON("articles.json", current);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- init ---------- */
applySettingsToForm();
document.getElementById("date").value = new Date().toISOString().slice(0,10);
