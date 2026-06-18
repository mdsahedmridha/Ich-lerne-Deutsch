/* Ich lerne Deutsch — public site logic */

const MONTHS_DE = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

function formatStamp(isoDate){
  const d = new Date(isoDate + "T00:00:00");
  return { day: d.getDate(), month: MONTHS_DE[d.getMonth()] };
}

function formatLedgerDate(isoDate){
  const d = new Date(isoDate + "T00:00:00");
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`;
}

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

// Wraps highlight words with private-use markers BEFORE escaping, so escaping
// can't break the regex matches, then swaps the markers for <mark> tags after.
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

function excerptOf(rawContent, words, maxLen = 150){
  const first = splitParagraphs(rawContent)[0] || "";
  const cut = first.length > maxLen ? first.slice(0, maxLen).trim() + "…" : first;
  return renderParagraphHTML(cut, words);
}

let ARTICLES = [];

async function loadArticles(){
  try{
    const res = await fetch("./articles.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    ARTICLES = data.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    renderList();
    handleRoute();
  } catch (err){
    document.getElementById("featured").innerHTML =
      `<div class="empty-state"><strong>Fehler:</strong> Die Einträge konnten nicht geladen werden. Bitte lade die Seite neu.</div>`;
  }
}

function renderList(){
  const featuredEl = document.getElementById("featured");
  const ledgerEl = document.getElementById("ledger");
  const ledgerWrap = document.getElementById("ledger-wrap");

  if (ARTICLES.length === 0){
    featuredEl.innerHTML = `<div class="empty-state">Hier entsteht der erste Eintrag. Im <a href="admin.html">Verfasser-Bereich</a> kannst du den ersten Artikel veröffentlichen.</div>`;
    ledgerWrap.classList.add("hidden");
    return;
  }

  const [latest, ...rest] = ARTICLES;
  const stamp = formatStamp(latest.date);

  featuredEl.innerHTML = `
    <div class="plate" data-id="${latest.id}">
      <div class="stamp"><span class="stamp-day">${stamp.day}</span><span class="stamp-month">${stamp.month}</span></div>
      <div>
        <span class="section-label">Neuester Eintrag</span>
        ${latest.category ? `<span class="tag">${escapeHTML(latest.category)}</span>` : ""}
        <h2>${escapeHTML(latest.title)}</h2>
        <p>${excerptOf(latest.content, latest.highlightWords)}</p>
        <span class="read-more">Weiterlesen →</span>
      </div>
    </div>`;
  featuredEl.querySelector(".plate").addEventListener("click", () => { location.hash = "#" + latest.id; });

  if (rest.length === 0){
    ledgerWrap.classList.add("hidden");
  } else {
    ledgerWrap.classList.remove("hidden");
    ledgerEl.innerHTML = rest.map(a => `
      <li data-id="${a.id}">
        <span class="ledger-date">${formatLedgerDate(a.date)}</span>
        <span class="ledger-title">${escapeHTML(a.title)}</span>
        <span class="ledger-arrow">→</span>
      </li>`).join("");
    ledgerEl.querySelectorAll("li").forEach(li => {
      li.addEventListener("click", () => { location.hash = "#" + li.dataset.id; });
    });
  }
}

function renderDetail(article){
  const stamp = formatStamp(article.date);
  document.getElementById("view-detail").innerHTML = `
    <div class="stamp"><span class="stamp-day">${stamp.day}</span><span class="stamp-month">${stamp.month}</span></div>
    <h1>${escapeHTML(article.title)}</h1>
    <p class="meta">${formatLedgerDate(article.date)}.${new Date(article.date+"T00:00:00").getFullYear()}${article.category ? " · " + escapeHTML(article.category) : ""}</p>
    <div class="body">${renderContentHTML(article.content, article.highlightWords)}</div>
    <a class="back-link" href="#">← Zurück zur Übersicht</a>`;
}

function handleRoute(){
  const id = location.hash.replace(/^#/, "");
  const listView = document.getElementById("view-list");
  const detailView = document.getElementById("view-detail");

  if (!id){
    listView.classList.remove("hidden");
    detailView.classList.add("hidden");
    return;
  }
  const article = ARTICLES.find(a => a.id === id);
  if (!article){
    listView.classList.remove("hidden");
    detailView.classList.add("hidden");
    return;
  }
  renderDetail(article);
  listView.classList.add("hidden");
  detailView.classList.remove("hidden");
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", handleRoute);
loadArticles();
