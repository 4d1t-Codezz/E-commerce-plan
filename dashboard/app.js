"use strict";
/* Daybreak HQ. Static dashboard: research data is encrypted (data.enc.json) and unlocked with the shared password.
   Anything you add (ads, price checks, products) is saved in this browser; use Setup > Export to share it. */

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n, d = 2) => (n == null || isNaN(n) ? "–" : (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const money0 = (n) => money(n, 0);
const pct = (n, d = 1) => (n == null || isNaN(n) ? "–" : (n * 100).toFixed(d) + "%");
const tag = (c) => ({ ver: '<span class="tag ver">Verified</span>', est: '<span class="tag est">Estimate</span>', ai: '<span class="tag ai">Predicted</span>', demo: '<span class="tag demo">Demo</span>', none: '<span class="tag none">Not checked</span>' }[c] || "");
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 864e5));

let DATA = null;
const LS = "dbhq-v1";
function loadLocal() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } }
let local = Object.assign({ ads: [], prices: {}, products: [], sat: {}, weights: null, sim: {} }, loadLocal());
function save() { try { localStorage.setItem(LS, JSON.stringify(local)); } catch {} }

/* ---------- login / decrypt ---------- */
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function unlock(pass) {
  const r = await fetch("data.enc.json", { cache: "no-store" });
  const e = await r.json();
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(e.salt), iterations: e.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(e.iv) }, key, b64(e.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function start(pass, who) {
  DATA = await unlock(pass);
  try { sessionStorage.setItem("dbhq-p", pass); localStorage.setItem("dbhq-who", who); } catch {}
  $("#login").hidden = true; $("#app").hidden = false;
  $("#meName").textContent = who;
  route();
}
$("#loginForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const btn = $("#loginBtn"), err = $("#loginErr");
  btn.disabled = true; btn.textContent = "Checking…"; err.hidden = true;
  try { await start($("#pw").value, $("#who").value); }
  catch { err.textContent = "That password didn't work. Check with your partner and try again."; err.hidden = false; }
  btn.disabled = false; btn.textContent = "Sign in";
});
$("#logout").addEventListener("click", () => { try { sessionStorage.removeItem("dbhq-p"); } catch {} location.hash = ""; location.reload(); });
(async () => {
  let p = null, w = null;
  try { p = sessionStorage.getItem("dbhq-p"); w = localStorage.getItem("dbhq-who"); } catch {}
  if (w) $("#who").value = w;
  if (p) { try { await start(p, w || "Aditya"); } catch {} }
})();

/* ---------- routing ---------- */
const VIEWS = [
  ["overview", "Overview"], ["ads", "Competitor ads"], ["products", "Products"], ["prices", "Prices"],
  ["simulator", "Price & growth"], ["store", "Store metrics"], ["setup", "Setup"],
];
function route() {
  if (!DATA) return;
  const id = (location.hash || "#overview").slice(1);
  const v = VIEWS.find((x) => x[0] === id) ? id : "overview";
  $("#nav").innerHTML = VIEWS.map(([k, n]) => `<a href="#${k}" class="${k === v ? "on" : ""}">${n}</a>`).join("");
  const view = $("#view");
  view.innerHTML = RENDER[v]();
  (BIND[v] || (() => {}))(view);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ---------- shared math ---------- */
const FEE_PCT = 0.029, FEE_FIXED = 0.30;
function unitEcon({ price, cost, ship = 0, refund = 0.05, other = 0 }) {
  const fees = price * FEE_PCT + FEE_FIXED;
  const contrib = price * (1 - refund) - cost - ship - fees - other;
  return { fees, contrib, beRoas: contrib > 0 ? price / contrib : Infinity, maxCpa: contrib, margin: contrib / price };
}
function allProducts() {
  const custom = local.products || [];
  return DATA.products.concat(custom);
}
function defaultWeights() { return { demand: 25, comp: 20, margin: 20, ads: 25, ship: 10 }; }
function weights() { return local.weights || defaultWeights(); }
function scoreOf(p) {
  const w = weights(), tot = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const m = (p.sell - p.cost) / p.sell; // 0..1
  const marginScore = Math.max(0, Math.min(10, (m - 0.5) / 0.35 * 10)); // 50% -> 0, 85% -> 10
  const sat = local.sat[p.id];
  const comp = sat ? 10 - satIndex(sat) / 10 : p.comp;
  const s = (w.demand * p.demand + w.comp * comp + w.margin * marginScore + w.ads * p.ads + w.ship * p.ship) / tot;
  return Math.round(s * 10);
}
function satIndex(s) {
  // 0 = wide open, 100 = crowded. Inputs come from Meta Ad Library + Amazon checks.
  const adv = Math.min(1, (s.advertisers || 0) / 40);
  const big = Math.min(1, (s.bigListings || 0) / 15);
  const brand = s.bigBrand ? 1 : 0;
  const price = Math.min(1, Math.max(0, (45 - (s.lowPrice || 45)) / 25));
  return Math.round((adv * 0.35 + big * 0.25 + brand * 0.2 + price * 0.2) * 100);
}
function satLabel(i) { return i < 35 ? ["Open", "good"] : i < 65 ? ["Competitive", "warn"] : ["Saturated", "bad"]; }

/* small SVG line chart, drawn at the real container width so text stays 1:1 */
function chartW() { const v = document.getElementById("view"); return Math.max(300, Math.min(1088, (v ? v.clientWidth : 1100) - 32)); }
function lineChart(series, { w = chartW(), h = 220, xLabels = [], yFmt = (v) => v, marker = null, zero = true } = {}) {
  const pad = { l: 54, r: 14, t: 12, b: 26 };
  const all = series.flatMap((s) => s.pts.map((p) => p[1]));
  let lo = Math.min(...all), hi = Math.max(...all);
  if (zero) lo = Math.min(0, lo);
  if (hi === lo) hi = lo + 1;
  const xs = series[0].pts.map((p) => p[0]); const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (x) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const Y = (y) => pad.t + (1 - (y - lo) / (hi - lo)) * (h - pad.t - pad.b);
  const ticks = 4; let g = "";
  for (let i = 0; i <= ticks; i++) {
    const v = lo + ((hi - lo) * i) / ticks, y = Y(v);
    g += `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y}" y2="${y}"/><text x="${pad.l - 6}" y="${y + 4}" text-anchor="end">${esc(yFmt(v))}</text>`;
  }
  xLabels.forEach(([x, t]) => { const a = x === x0 ? "start" : x === x1 ? "end" : "middle"; g += `<text x="${X(x)}" y="${h - 8}" text-anchor="${a}">${esc(t)}</text>`; });
  if (lo < 0) g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--muted)" stroke-dasharray="3 3"/>`;
  series.forEach((s) => {
    const d = s.pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
    if (s.fill) g += `<path d="${d}L${X(s.pts.at(-1)[0])},${Y(Math.max(lo, 0))}L${X(s.pts[0][0])},${Y(Math.max(lo, 0))}Z" fill="${s.color}" opacity=".1"/>`;
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ""}/>`;
    const e = s.pts.at(-1); g += `<circle cx="${X(e[0])}" cy="${Y(e[1])}" r="3" fill="${s.color}"/>`;
  });
  if (marker) g += `<line x1="${X(marker[0])}" x2="${X(marker[0])}" y1="${pad.t}" y2="${h - pad.b}" stroke="var(--fg)" stroke-dasharray="2 3"/><circle cx="${X(marker[0])}" cy="${Y(marker[1])}" r="4.5" fill="var(--fg)"/><text x="${X(marker[0]) + 6}" y="${pad.t + 10}" style="fill:var(--fg)">${esc(marker[2] || "")}</text>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${g}</svg>`;
}

/* ---------- views ---------- */
const RENDER = {}, BIND = {};

RENDER.overview = () => {
  const c = DATA.current, u = unitEcon({ price: c.sell, cost: c.cost, ship: c.shipping });
  const ranked = allProducts().map((p) => ({ ...p, s: scoreOf(p) })).sort((a, b) => b.s - a.s);
  const cur = ranked.find((p) => p.id === c.id); const rank = ranked.indexOf(cur) + 1;
  const pivots = ranked.filter((p) => p.id !== c.id).slice(0, 3);
  const winners = local.ads.filter((a) => daysBetween(a.first, a.last || today()) >= 30).length;
  const checked = DATA.competitors.filter((x) => (local.prices[x.brand] || []).length).length;
  const bfDays = daysBetween(today(), "2026-11-27");
  return `
  <section>
    <div class="head"><div><h1>${esc(c.name)}</h1><p class="muted">${esc(c.angle)}.</p></div>
    <p class="small muted">${bfDays} days to Black Friday · data updated ${esc(DATA.updated)}</p></div>
    <div class="stats">
      <div class="stat"><span class="k">Sell price ${tag("est")}</span><span class="v">${money0(c.sell)}</span><span class="s">planned, set in Price & growth</span></div>
      <div class="stat"><span class="k">Supplier cost ${tag("est")}</span><span class="v">${money0(c.cost)}</span><span class="s">confirm on TeemDrop</span></div>
      <div class="stat"><span class="k">Profit before ads</span><span class="v">${money(u.contrib)}</span><span class="s">after fees + 5% refunds</span></div>
      <div class="stat"><span class="k">Break-even ROAS</span><span class="v">${u.beRoas.toFixed(2)}</span><span class="s">max CPA ${money(u.maxCpa)}</span></div>
      <div class="stat"><span class="k">Product score ${tag("ai")}</span><span class="v">${cur ? cur.s : "–"}</span><span class="s">#${rank} of ${ranked.length} tracked</span></div>
    </div>
  </section>
  <div class="cols">
    <section>
      <h2>Research to do</h2>
      <ol class="list">${c.todo.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
      <p class="small"><a href="${esc(c.teemdrop)}" target="_blank" rel="noopener">Open the TeemDrop listing</a></p>
    </section>
    <section>
      <h2>Where research stands</h2>
      <div class="tbl"><table>
        <tr><td>Competitor ads logged</td><td class="r">${local.ads.length}</td><td><a href="#ads">Log ads</a></td></tr>
        <tr><td>Ads running 30+ days</td><td class="r">${winners}</td><td class="muted small">the ones worth copying</td></tr>
        <tr><td>Competitor prices checked</td><td class="r">${checked} / ${DATA.competitors.length}</td><td><a href="#prices">Check prices</a></td></tr>
        <tr><td>Products in database</td><td class="r">${ranked.length}</td><td><a href="#products">See ranking</a></td></tr>
        <tr><td>Store connected</td><td class="r">No</td><td><a href="#setup">Setup</a></td></tr>
      </table></div>
    </section>
  </div>
  <section>
    <div class="head"><h2>Backup products if this one stalls ${tag("ai")}</h2><a href="#products" class="small">Full ranking</a></div>
    <div class="tbl"><table>
      <tr><th>Product</th><th class="r">Score</th><th class="r">Sell</th><th class="r">Cost</th><th>Why</th></tr>
      ${pivots.map((p) => `<tr><td>${esc(p.name)}</td><td class="r score">${p.s}</td><td class="r">${money0(p.sell)}</td><td class="r">${money0(p.cost)}</td><td class="small">${esc(p.note)}</td></tr>`).join("")}
    </table></div>
  </section>`;
};

/* ---- competitor ads ---- */
RENDER.ads = () => {
  const kw = DATA.adKeywords.map((k) => `<a target="_blank" rel="noopener" href="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=keyword_unordered&q=${encodeURIComponent(k)}">${esc(k)}</a>`).join("");
  const brands = DATA.competitors.map((c) => `<a target="_blank" rel="noopener" href="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=keyword_unordered&q=${encodeURIComponent(c.brand.replace(/\s*\(.*\)/, ""))}">${esc(c.brand)}</a>`).join("");
  const ads = local.ads.map((a, i) => ({ ...a, i, days: daysBetween(a.first, a.last || today()) })).sort((a, b) => b.days - a.days);
  const rows = ads.map((a) => {
    const st = a.days >= 30 ? ["Proven", "good"] : a.days >= 14 ? ["Promising", "warn"] : ["Testing", ""];
    return `<tr><td><span class="dot ${st[1]}"></span>${st[0]}</td><td class="r">${a.days}</td><td>${esc(a.brand)}</td><td>${esc(a.format)}</td><td>${esc(a.hook)}</td><td class="small">${esc(a.notes)}</td>
    <td>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">Open</a>` : ""}</td><td><button class="x" data-del="${a.i}" title="Remove">✕</button></td></tr>`;
  }).join("");
  // pattern tally: which hooks/formats show up in long-running ads, weighted by days live
  const tally = (key) => {
    const m = {}; ads.forEach((a) => { const k = (a[key] || "").trim(); if (k) m[k] = (m[k] || 0) + a.days; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  const th = tally("hook"), tf = tally("format"), maxD = Math.max(1, ...th.map((x) => x[1]), ...tf.map((x) => x[1]));
  const tallyHtml = (t) => t.length ? t.map(([k, v]) => `<div class="range"><div class="lab"><span>${esc(k)}</span><b>${v} ad-days</b></div><div class="bar"><i style="width:${(v / maxD) * 100}%"></i></div></div>`).join("") : `<p class="muted small">Log a few ads to see patterns.</p>`;
  return `
  <section>
    <div class="head"><div><h1>Competitor ads</h1>
    <p class="muted">Meta doesn't share results for other people's ads in the US, so the best signal is how long an ad has been running. Brands keep paying for ads that make money. 30+ days usually means it works.</p></div></div>
    <div class="box">
      <h3>Search the Meta Ad Library</h3>
      <div class="small muted">By keyword</div><div class="chips">${kw}</div>
      <div class="small muted">By brand</div><div class="chips">${brands}</div>
      <p class="note">In the Ad Library, each ad shows "Started running on". Paste that date below. Multiple versions of the same ad is another sign it's working.</p>
    </div>
  </section>
  <section>
    <h2>Log an ad</h2>
    <form id="adForm" class="form">
      <label>Brand<input id="adBrand" required placeholder="PetLab Co."></label>
      <label>Started running<input id="adFirst" type="date" required></label>
      <label>Still running on<input id="adLast" type="date"></label>
      <label>Format<select id="adFormat"><option>UGC video</option><option>Founder / owner story</option><option>Before / after video</option><option>Vet / expert</option><option>Static image</option><option>Carousel</option><option>Slideshow</option></select></label>
      <label>Hook (first 3 seconds)<input id="adHook" placeholder="My 13 year old dog can climb stairs again"></label>
      <label>Ad link<input id="adUrl" type="url" placeholder="https://www.facebook.com/ads/library/?id=…"></label>
      <label class="wide">Notes (offer, CTA, landing page, price)<input id="adNotes" placeholder="Buy 2 get 1 free, links to an advertorial page"></label>
      <div><button type="submit">Add ad</button></div>
    </form>
  </section>
  <section>
    <div class="head"><h2>Ad log</h2><span class="small muted">Sorted by days running · saved in this browser</span></div>
    ${ads.length ? `<div class="tbl"><table><tr><th>Status</th><th class="r">Days</th><th>Brand</th><th>Format</th><th>Hook</th><th>Notes</th><th></th><th></th></tr>${rows}</table></div>`
      : `<div class="empty">No ads logged yet. Search the Ad Library above, then add any ad that started running 2+ weeks ago.</div>`}
  </section>
  <div class="cols">
    <section><h2>What long-running ads have in common</h2><p class="small muted">Hooks and formats weighted by how long the ads have run. Built from your log.</p>${tallyHtml(th)}<h3 style="margin-top:6px">Formats</h3>${tallyHtml(tf)}</section>
    <section><h2>Angles to look for ${tag("ai")}</h2>
      <div class="tbl"><table>${DATA.hooks.map((h) => `<tr><td><b>${esc(h.name)}</b><div class="small">${esc(h.desc)}</div><div class="small muted">${esc(h.why)}</div></td></tr>`).join("")}</table></div>
    </section>
  </div>`;
};
BIND.ads = (v) => {
  $("#adFirst", v).max = today();
  $("#adForm", v).addEventListener("submit", (e) => {
    e.preventDefault();
    local.ads.push({ brand: $("#adBrand").value.trim(), first: $("#adFirst").value, last: $("#adLast").value || "", format: $("#adFormat").value, hook: $("#adHook").value.trim(), url: $("#adUrl").value.trim(), notes: $("#adNotes").value.trim(), added: today() });
    save(); route();
  });
  v.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { local.ads.splice(+b.dataset.del, 1); save(); route(); }));
};

/* ---- products ---- */
let prodSort = "s";
RENDER.products = () => {
  const w = weights();
  const list = allProducts().map((p) => ({ ...p, s: scoreOf(p), m: p.sell - p.cost }));
  list.sort((a, b) => (prodSort === "name" ? a.name.localeCompare(b.name) : (b[prodSort] ?? 0) - (a[prodSort] ?? 0)));
  const rows = list.map((p) => {
    const sat = local.sat[p.id]; const si = sat ? satIndex(sat) : null; const sl = si != null ? satLabel(si) : null;
    return `<tr class="${p.current ? "cur" : ""}">
      <td><b>${esc(p.name)}</b>${p.current ? ' <span class="small muted">current</span>' : ""}<div class="small muted">${esc(p.by)} · ${esc(p.market)}</div></td>
      <td class="r score">${p.s}<div class="bar"><i style="width:${p.s}%"></i></div></td>
      <td class="r">${money0(p.sell)}</td><td class="r">${money(p.cost)}</td><td class="r">${money0(p.m)}</td>
      <td class="r">${p.demand}</td><td class="r">${p.comp}</td><td class="r">${p.ads}</td><td class="r">${p.ship}</td>
      <td>${sl ? `<span class="${sl[1]}">${sl[0]}</span> <span class="small muted">${si}</span>` : '<span class="small muted">–</span>'}</td>
      <td>${tag(p.conf)}</td>
      <td>${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">Amazon</a>` : ""}</td></tr>`;
  }).join("");
  const sl = (k, n) => `<div class="range"><div class="lab"><span>${n}</span><b id="w_${k}_v">${w[k]}</b></div><input type="range" id="w_${k}" min="0" max="50" value="${w[k]}"></div>`;
  const opts = allProducts().map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  return `
  <section>
    <div class="head"><div><h1>Product research</h1><p class="muted">Every product you and Jasper looked at, scored out of 100. Sub-scores are 1 to 10 and come from the research notes, so treat them as estimates until checked. Click a column to sort.</p></div></div>
    <div class="tbl"><table id="prodTbl">
      <tr><th class="sort" data-k="name">Product</th><th class="sort r" data-k="s">Score</th><th class="sort r" data-k="sell">Sell</th><th class="sort r" data-k="cost">Cost</th><th class="sort r" data-k="m">Margin</th>
      <th class="sort r" data-k="demand">Demand</th><th class="sort r" data-k="comp">Room</th><th class="sort r" data-k="ads">Ad potential</th><th class="sort r" data-k="ship">Shipping</th><th>Saturation</th><th>Data</th><th></th></tr>
      ${rows}
    </table></div>
    <p class="small muted">Room = how much space competitors leave (10 = wide open). Ad potential = emotional pain + can you show it working in a video.</p>
  </section>
  <div class="cols">
    <section class="box">
      <h3>What matters most in the score</h3>
      ${sl("demand", "Demand")}${sl("comp", "Room in the market")}${sl("margin", "Margin")}${sl("ads", "Ad potential")}${sl("ship", "Shipping reliability")}
      <div><button class="sec" id="wReset" type="button">Reset weights</button></div>
    </section>
    <section class="box">
      <h3>Saturation check</h3>
      <p class="small muted">Fill this in after searching Meta Ad Library and Amazon. It replaces the "Room" estimate for that product.</p>
      <form id="satForm" class="form">
        <label class="wide">Product<select id="satP">${opts}</select></label>
        <label>Brands running ads<input id="satAdv" type="number" min="0" placeholder="12"></label>
        <label>Amazon listings with 1k+ reviews<input id="satBig" type="number" min="0" placeholder="8"></label>
        <label>Lowest real price ($)<input id="satLow" type="number" min="0" step="0.01" placeholder="25"></label>
        <label>Big brand owns it?<select id="satBrand"><option value="0">No</option><option value="1">Yes</option></select></label>
        <div><button type="submit">Save check</button></div>
      </form>
      <p id="satOut" class="small"></p>
    </section>
  </div>
  <section>
    <h2>Add a product</h2>
    <form id="newProd" class="form">
      <label class="wide">Name<input id="npName" required placeholder="Dog paw balm"></label>
      <label>Sell ($)<input id="npSell" type="number" step="0.01" required></label>
      <label>Cost ($)<input id="npCost" type="number" step="0.01" required></label>
      <label>Demand 1-10<input id="npDem" type="number" min="1" max="10" value="5"></label>
      <label>Room 1-10<input id="npComp" type="number" min="1" max="10" value="5"></label>
      <label>Ad potential 1-10<input id="npAds" type="number" min="1" max="10" value="5"></label>
      <label>Shipping 1-10<input id="npShip" type="number" min="1" max="10" value="6"></label>
      <label class="wide">Notes / link<input id="npNote" placeholder="TeemDrop link, competitor, ideas"></label>
      <div><button type="submit">Add product</button></div>
    </form>
  </section>`;
};
BIND.products = (v) => {
  v.querySelectorAll("th.sort").forEach((th) => th.addEventListener("click", () => { prodSort = th.dataset.k; route(); }));
  ["demand", "comp", "margin", "ads", "ship"].forEach((k) => {
    const el = $("#w_" + k, v);
    el.addEventListener("input", () => { $("#w_" + k + "_v").textContent = el.value; });
    el.addEventListener("change", () => { local.weights = Object.assign(weights(), { [k]: +el.value }); save(); route(); });
  });
  $("#wReset", v).addEventListener("click", () => { local.weights = null; save(); route(); });
  const fillSat = () => {
    const s = local.sat[$("#satP").value] || {};
    $("#satAdv").value = s.advertisers ?? ""; $("#satBig").value = s.bigListings ?? ""; $("#satLow").value = s.lowPrice ?? ""; $("#satBrand").value = s.bigBrand ? "1" : "0";
    if (s.advertisers != null) { const i = satIndex(s), l = satLabel(i); $("#satOut").innerHTML = `Saturation <b class="${l[1]}">${i}/100, ${l[0]}</b>, checked ${esc(s.date)}`; } else $("#satOut").textContent = "";
  };
  $("#satP", v).value = DATA.current.id; fillSat();
  $("#satP", v).addEventListener("change", fillSat);
  $("#satForm", v).addEventListener("submit", (e) => {
    e.preventDefault();
    local.sat[$("#satP").value] = { advertisers: +$("#satAdv").value || 0, bigListings: +$("#satBig").value || 0, lowPrice: +$("#satLow").value || 45, bigBrand: $("#satBrand").value === "1", date: today() };
    save(); route();
  });
  $("#newProd", v).addEventListener("submit", (e) => {
    e.preventDefault();
    local.products.push({ id: "c" + Date.now(), name: $("#npName").value.trim(), by: $("#meName").textContent, sell: +$("#npSell").value, cost: +$("#npCost").value, demand: +$("#npDem").value, comp: +$("#npComp").value, ads: +$("#npAds").value, ship: +$("#npShip").value, market: "", note: $("#npNote").value.trim(), conf: "est", link: "" });
    save(); route();
  });
};

/* ---- competitor prices ---- */
RENDER.prices = () => {
  const ours = DATA.current.sell;
  const rows = DATA.competitors.map((c, i) => {
    const h = local.prices[c.brand] || []; const last = h.at(-1); const prev = h.at(-2);
    const price = last ? last.price : c.price; const conf = last ? "ver" : c.conf;
    const per = last && last.count ? last.price / last.count : null;
    const chg = last && prev ? last.price - prev.price : null;
    return `<tr><td><b>${esc(c.brand)}</b><div class="small muted">${esc(c.product)}</div></td>
      <td class="r">${price != null ? money(price) : "–"}</td><td>${tag(conf)}</td>
      <td class="r">${per != null ? money(per) : "–"}</td>
      <td class="r ${chg > 0 ? "bad" : chg < 0 ? "good" : ""}">${chg != null ? (chg > 0 ? "+" : "") + money(chg) : "–"}</td>
      <td class="small">${last ? esc(last.offer || "") : esc(c.note)}</td>
      <td class="small muted">${last ? esc(last.date) : "never"}</td>
      <td><a href="${esc(c.site)}" target="_blank" rel="noopener">Look up</a></td></tr>`;
  }).join("");
  const priced = DATA.competitors.map((c) => { const l = (local.prices[c.brand] || []).at(-1); return l ? l.price : c.price; }).filter((x) => x != null);
  const avg = priced.length ? priced.reduce((a, b) => a + b, 0) / priced.length : null;
  const opts = DATA.competitors.map((c) => `<option>${esc(c.brand)}</option>`).join("");
  const hist = DATA.competitors.filter((c) => (local.prices[c.brand] || []).length > 1);
  return `
  <section>
    <div class="head"><div><h1>Competitor prices</h1><p class="muted">Check each brand's price about once a week and log it. Once a price is logged it counts as verified. Prices without a check are from the research notes.</p></div></div>
    <div class="stats">
      <div class="stat"><span class="k">Our planned price</span><span class="v">${money0(ours)}</span></div>
      <div class="stat"><span class="k">Average competitor</span><span class="v">${avg ? money(avg) : "–"}</span><span class="s">${priced.length} of ${DATA.competitors.length} have a price</span></div>
      <div class="stat"><span class="k">We are</span><span class="v">${avg ? (ours >= avg ? "+" : "") + pct((ours - avg) / avg, 0) : "–"}</span><span class="s">vs average</span></div>
    </div>
    <div class="tbl"><table><tr><th>Brand</th><th class="r">Price</th><th>Data</th><th class="r">Per chew</th><th class="r">Change</th><th>Offer / note</th><th>Checked</th><th></th></tr>${rows}</table></div>
  </section>
  <section>
    <h2>Log a price check</h2>
    <form id="priceForm" class="form">
      <label>Brand<select id="pfBrand">${opts}</select></label>
      <label>Price ($)<input id="pfPrice" type="number" step="0.01" required></label>
      <label>Chews in pack<input id="pfCount" type="number" min="1" placeholder="60"></label>
      <label class="wide">Offer / discount<input id="pfOffer" placeholder="Subscribe & save 15%, BOGO"></label>
      <div><button type="submit">Save price</button></div>
    </form>
  </section>
  ${hist.length ? `<section><h2>Price history</h2>${hist.map((c) => { const h = local.prices[c.brand]; return `<h3>${esc(c.brand)}</h3>${lineChart([{ pts: h.map((x, i) => [i, x.price]), color: "var(--accent)" }], { h: 160, xLabels: h.map((x, i) => [i, x.date.slice(5)]), yFmt: (v) => "$" + v.toFixed(0), zero: false })}`; }).join("")}</section>` : ""}`;
};
BIND.prices = (v) => {
  $("#priceForm", v).addEventListener("submit", (e) => {
    e.preventDefault(); const b = $("#pfBrand").value;
    (local.prices[b] = local.prices[b] || []).push({ date: today(), price: +$("#pfPrice").value, count: +$("#pfCount").value || null, offer: $("#pfOffer").value.trim() });
    save(); route();
  });
};

/* ---- simulator ---- */
const SIM_DEF = { price: 42, cost: 9, ship: 0, refund: 5, cpc: 0.8, cvr: 2.5, elastic: 1.3, b2: 25, b3: 15, budget: 50, growth: 30, decay: 15, weeks: 8 };
function sim() { return Object.assign({}, SIM_DEF, { price: DATA.current.sell, cost: DATA.current.cost }, local.sim); }
RENDER.simulator = () => {
  const s = sim();
  const f = (k, n, step = 1, min = 0) => `<label>${n}<input type="number" id="s_${k}" value="${s[k]}" step="${step}" min="${min}"></label>`;
  return `
  <section>
    <div class="head"><div><h1>Price & growth</h1><p class="muted">Change any number and everything below updates. Ad numbers default to typical dropshipping results until the store is live ${tag("est")}.</p></div><button class="sec" id="simReset" type="button">Reset</button></div>
    <form id="simForm" class="form">
      ${f("price", "Sell price ($)", 1)}${f("cost", "Product cost ($)", 0.5)}${f("ship", "Shipping you pay ($)", 0.5)}${f("refund", "Refunds (%)", 1)}
      ${f("cpc", "Cost per click ($)", 0.05)}${f("cvr", "Conversion rate (%)", 0.1)}${f("b2", "Take 2-pack (%)", 1)}${f("b3", "Take 3-pack (%)", 1)}${f("elastic", "Price sensitivity", 0.1)}
    </form>
  </section>
  <div id="simOut" class="stack"></div>
  <section>
    <h2>Growth projection</h2>
    <form id="growForm" class="form">
      ${f("budget", "Starting ad budget / day ($)", 5)}${f("growth", "Raise budget each week (%)", 5)}${f("decay", "CPA gets worse per budget doubling (%)", 5)}${f("weeks", "Weeks", 1, 1)}
    </form>
    <div id="growOut"></div>
  </section>`;
};
function simCalc(s) {
  const one = s.price, two = s.price * 2 * 0.85, three = s.price * 3 * 0.75; // 15% / 25% off bundles
  const t2 = s.b2 / 100, t3 = s.b3 / 100, t1 = Math.max(0, 1 - t2 - t3);
  const aov = t1 * one + t2 * two + t3 * three, units = t1 + 2 * t2 + 3 * t3;
  const refund = s.refund / 100;
  const fees = aov * FEE_PCT + FEE_FIXED;
  const contrib = aov * (1 - refund) - units * (s.cost + s.ship) - fees;
  const cpa = s.cpc / (s.cvr / 100);
  return { aov, units, fees, contrib, cpa, beRoas: aov / contrib, roas: aov / cpa, profit: contrib - cpa, maxCpa: contrib };
}
function drawSim() {
  const s = sim(), r = simCalc(s);
  const status = r.profit > 0 ? ["good", "Profitable"] : ["bad", "Losing money"];
  // price curve: conversion drops as price rises (elasticity), per 1,000 clicks
  const pts = [];
  for (let p = 25; p <= 80; p += 1) {
    const cvr = s.cvr * Math.pow(p / s.price, -s.elastic);
    const rr = simCalc({ ...s, price: p, cvr });
    pts.push([p, 1000 * (cvr / 100) * rr.contrib - 1000 * s.cpc]);
  }
  const best = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  $("#simOut").innerHTML = `
  <section>
    <div class="stats">
      <div class="stat"><span class="k">Average order</span><span class="v">${money(r.aov)}</span><span class="s">${r.units.toFixed(2)} units / order</span></div>
      <div class="stat"><span class="k">Profit before ads</span><span class="v">${money(r.contrib)}</span><span class="s">fees ${money(r.fees)}</span></div>
      <div class="stat"><span class="k">Break-even ROAS</span><span class="v">${r.beRoas.toFixed(2)}</span><span class="s">max CPA ${money(r.maxCpa)}</span></div>
      <div class="stat"><span class="k">Expected CPA</span><span class="v">${money(r.cpa)}</span><span class="s">ROAS ${r.roas.toFixed(2)}</span></div>
      <div class="stat"><span class="k">Profit per order</span><span class="v ${status[0]}">${money(r.profit)}</span><span class="s">${status[1]}</span></div>
    </div>
  </section>
  <section>
    <div class="head"><h2>Profit per 1,000 ad clicks by price ${tag("ai")}</h2><span class="small muted">Best price in this model: <b>${money0(best[0])}</b></span></div>
    ${lineChart([{ pts, color: "var(--accent)", fill: true }], { xLabels: [25, 35, 45, 55, 65, 75].map((x) => [x, "$" + x]), yFmt: (v) => money0(v), marker: [best[0], best[1], money0(best[0])] })}
    <p class="note">Assumes conversion falls as price goes up ("price sensitivity" ${s.elastic}; 1 = none, 2 = very sensitive). Bundles are priced 15% off for 2 and 25% off for 3. Real buyers may be less price sensitive for a pet health product. Test two prices once ads are live.</p>
  </section>`;
  // growth
  const weeks = Math.max(1, Math.min(26, Math.round(s.weeks)));
  let budget = s.budget, cum = 0; const rows = [], cumPts = [[0, 0]];
  for (let w = 1; w <= weeks; w++) {
    const spend = budget * 7;
    const cpa = r.cpa * Math.pow(1 + s.decay / 100, Math.log2(budget / s.budget));
    const orders = spend / cpa, rev = orders * r.aov, profit = orders * r.contrib - spend;
    cum += profit; cumPts.push([w, cum]);
    rows.push(`<tr><td>Week ${w}</td><td class="r">${money0(budget)}</td><td class="r">${money0(spend)}</td><td class="r">${money(cpa)}</td><td class="r">${Math.round(orders)}</td><td class="r">${money0(rev)}</td><td class="r ${profit >= 0 ? "good" : "bad"}">${money0(profit)}</td><td class="r">${money0(cum)}</td></tr>`);
    budget *= 1 + s.growth / 100;
  }
  $("#growOut").innerHTML = `
    ${lineChart([{ pts: cumPts, color: cum >= 0 ? "var(--good)" : "var(--bad)", fill: true }], { h: 180, xLabels: cumPts.map((p) => [p[0], p[0] ? "W" + p[0] : ""]), yFmt: money0 })}
    <div class="tbl"><table><tr><th>Week</th><th class="r">Budget/day</th><th class="r">Ad spend</th><th class="r">CPA</th><th class="r">Orders</th><th class="r">Revenue</th><th class="r">Profit</th><th class="r">Total profit</th></tr>${rows.join("")}</table></div>
    <p class="note">Profit here is after product, shipping, Shopify fees, refunds and ads. It doesn't include apps, domain or samples. CPA usually rises as you spend more, which the "gets worse" setting models.</p>`;
}
BIND.simulator = (v) => {
  const onIn = (e) => { const k = e.target.id.slice(2); if (!k) return; local.sim[k] = +e.target.value; save(); drawSim(); };
  $("#simForm", v).addEventListener("input", onIn); $("#growForm", v).addEventListener("input", onIn);
  $("#simReset", v).addEventListener("click", () => { local.sim = {}; save(); route(); });
  drawSim();
};

/* ---- store metrics (demo) ---- */
const BENCH = {
  ctr: { n: "CTR", good: 1.5, ok: 1.0, up: true, fmt: (v) => v.toFixed(2) + "%", tip: "Under 1% means the hook isn't stopping the scroll." },
  cpc: { n: "CPC", good: 1.0, ok: 2.0, up: false, fmt: (v) => money(v), tip: "Over $2 usually means weak creative or a narrow audience." },
  cpm: { n: "CPM", good: 20, ok: 35, up: false, fmt: (v) => money(v), tip: "Rises in Q4. Over $35 is expensive even for Black Friday." },
  atcr: { n: "Add to cart rate", good: 8, ok: 5, up: true, fmt: (v) => v.toFixed(1) + "%", tip: "Under 5% means the product page isn't convincing people." },
  cvr: { n: "Conversion rate", good: 2.5, ok: 1.2, up: true, fmt: (v) => v.toFixed(2) + "%", tip: "Under 1.2% points at price, trust or checkout problems." },
  aov: { n: "AOV", good: 52, ok: 42, up: true, fmt: (v) => money(v), tip: "Bundles are the fastest way to lift this." },
};
function grade(k, v) { const b = BENCH[k]; return b.up ? (v >= b.good ? "good" : v >= b.ok ? "warn" : "bad") : (v <= b.good ? "good" : v <= b.ok ? "warn" : "bad"); }
function demoDays() {
  let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const out = [];
  for (let d = 0; d < 14; d++) {
    const spend = 40 + d * 6 + rnd() * 10, cpm = 14 + rnd() * 6, imp = (spend / cpm) * 1000;
    const ctr = 1.6 + rnd() * 0.8 - (d > 10 ? 0.6 : 0), clicks = imp * ctr / 100;
    const visits = clicks * 0.9, atc = visits * (0.09 + rnd() * 0.03), co = atc * (0.5 + rnd() * 0.1), orders = co * (0.55 + rnd() * 0.1);
    const aov = 44 + rnd() * 8;
    out.push({ d, spend, imp, clicks, visits, atc, co, orders, rev: orders * aov });
  }
  return out;
}
RENDER.store = () => {
  const days = demoDays(), sum = (k, arr = days) => arr.reduce((a, b) => a + b[k], 0);
  const last7 = days.slice(7), prev7 = days.slice(0, 7);
  const m = (arr) => ({ ctr: sum("clicks", arr) / sum("imp", arr) * 100, cpc: sum("spend", arr) / sum("clicks", arr), cpm: sum("spend", arr) / sum("imp", arr) * 1000, atcr: sum("atc", arr) / sum("visits", arr) * 100, cvr: sum("orders", arr) / sum("visits", arr) * 100, aov: sum("rev", arr) / sum("orders", arr) });
  const cur = m(last7), prv = m(prev7);
  const c = DATA.current; const u = unitEcon({ price: cur.aov, cost: c.cost * 1.1 });
  const orders = sum("orders", last7), rev = sum("rev", last7), spend = sum("spend", last7);
  const net = orders * u.contrib - spend, roas = rev / spend;
  const grades = Object.keys(BENCH).map((k) => grade(k, cur[k]));
  const health = Math.round(grades.reduce((a, g) => a + (g === "good" ? 100 : g === "warn" ? 60 : 20), 0) / grades.length * 0.7 + (roas >= u.beRoas ? 30 : 10));
  const tiles = Object.keys(BENCH).map((k) => {
    const g = grade(k, cur[k]), ch = (cur[k] - prv[k]) / prv[k];
    return `<div class="stat"><span class="k"><span class="dot ${g}"></span>${BENCH[k].n}</span><span class="v">${BENCH[k].fmt(cur[k])}</span><span class="s">${ch >= 0 ? "▲" : "▼"} ${pct(Math.abs(ch), 0)} vs prior week</span></div>`;
  }).join("");
  const problems = Object.keys(BENCH).filter((k) => grade(k, cur[k]) !== "good").map((k) => `<li><b class="${grade(k, cur[k])}">${BENCH[k].n} ${BENCH[k].fmt(cur[k])}</b>. ${BENCH[k].tip}</li>`);
  if ((cur.ctr - prv.ctr) / prv.ctr < -0.08) problems.unshift(`<li><b class="warn">CTR fell ${pct((prv.ctr - cur.ctr) / prv.ctr, 0)} this week</b>. Usually creative fatigue. Launch 2-3 new hooks before CPA climbs.</li>`);
  if (roas < u.beRoas) problems.unshift(`<li><b class="bad">ROAS ${roas.toFixed(2)} is under break-even ${u.beRoas.toFixed(2)}</b>. Ads are losing money right now.</li>`);
  const fv = sum("visits", last7), steps = [["Visitors", fv], ["Added to cart", sum("atc", last7)], ["Reached checkout", sum("co", last7)], ["Purchased", orders]];
  const ads = [
    ["Stairs before/after · UGC", 120, 9, 450], ["Owner story · 13yr lab", 95, 5, 236], ["Vet explains · static", 80, 2, 92], ["Price vs Cosequin · carousel", 60, 3, 141], ["Ingredient close-up", 45, 0, 0],
  ].map(([n, sp, o, r]) => ({ n, sp, o, r, roas: r / sp, cpa: o ? sp / o : null, profit: o * u.contrib - sp })).sort((a, b) => b.profit - a.profit);
  const curve = days.map((d) => [d.d, d.rev / d.spend]);
  return `
  <section>
    <div class="head"><div><h1>Store metrics ${tag("demo")}</h1><p class="muted">Simulated numbers so you can see how this page works. It switches to real data once Shopify and Meta are connected (see Setup). Targets are standard dropshipping benchmarks.</p></div></div>
    <div class="stats">
      <div class="stat"><span class="k">Store health</span><span class="v">${health}/100</span><span class="s">last 7 days</span></div>
      <div class="stat"><span class="k">Revenue</span><span class="v">${money0(rev)}</span><span class="s">${Math.round(orders)} orders</span></div>
      <div class="stat"><span class="k">Ad spend</span><span class="v">${money0(spend)}</span><span class="s">ROAS ${roas.toFixed(2)}</span></div>
      <div class="stat"><span class="k">Net profit</span><span class="v ${net >= 0 ? "good" : "bad"}">${money0(net)}</span><span class="s">after product, fees, refunds, ads</span></div>
      <div class="stat"><span class="k">Break-even ROAS</span><span class="v">${u.beRoas.toFixed(2)}</span><span class="s">max CPA ${money(u.maxCpa)}</span></div>
    </div>
    <div class="stats">${tiles}</div>
  </section>
  <div class="cols">
    <section><h2>Problems found</h2>${problems.length ? `<ul class="list">${problems.join("")}</ul>` : '<p class="muted">Nothing below target.</p>'}</section>
    <section><h2>Funnel, last 7 days</h2><div class="funnel">${steps.map(([n, v]) => `<div class="row"><span>${n}</span><div class="track"><i style="width:${(v / fv) * 100}%"></i></div><span class="num r">${Math.round(v)} · ${pct(v / fv, 1)}</span></div>`).join("")}</div>
    <p class="note">Biggest drop: ${(() => { let w = 0, wi = 1; for (let i = 1; i < steps.length; i++) { const d = 1 - steps[i][1] / steps[i - 1][1]; if (d > w) { w = d; wi = i; } } return `${steps[wi - 1][0].toLowerCase()} to ${steps[wi][0].toLowerCase()} (${pct(w, 0)} lost)`; })()}.</p></section>
  </div>
  <section><h2>ROAS by day</h2>${lineChart([{ pts: curve, color: "var(--accent)" }, { pts: curve.map((p) => [p[0], u.beRoas]), color: "var(--bad)", dash: true }], { h: 180, xLabels: [[0, "14d ago"], [7, "7d ago"], [13, "yesterday"]], yFmt: (v) => v.toFixed(1), zero: false })}<p class="small muted">Dashed line is break-even.</p></section>
  <section><h2>Ads ranked by profit</h2><div class="tbl"><table><tr><th>Ad</th><th class="r">Spend</th><th class="r">Orders</th><th class="r">CPA</th><th class="r">ROAS</th><th class="r">Profit</th></tr>
    ${ads.map((a) => `<tr><td>${esc(a.n)}</td><td class="r">${money0(a.sp)}</td><td class="r">${a.o}</td><td class="r">${a.cpa ? money(a.cpa) : "–"}</td><td class="r">${a.roas.toFixed(2)}</td><td class="r ${a.profit >= 0 ? "good" : "bad"}">${money0(a.profit)}</td></tr>`).join("")}</table></div></section>`;
};

/* ---- setup ---- */
RENDER.setup = () => `
  <section>
    <h1>Setup</h1>
    <p class="muted" style="max-width:68ch">This site is static (GitHub Pages), so it can't hold API keys safely. Live store and ad numbers need a small private backend that pulls from Shopify and Meta and saves the results here. That's the next build step.</p>
    <div class="tbl"><table>
      <tr><th>Source</th><th>What it gives us</th><th>How</th><th>Status</th></tr>
      <tr><td>Shopify</td><td>Orders, AOV, add to cart, checkouts, refunds</td><td>Custom app in Shopify admin, Admin API token</td><td><span class="tag none">Not connected</span></td></tr>
      <tr><td>Meta Ads</td><td>Spend, CPM, CPC, CTR, purchases, per-ad results</td><td>Meta Marketing API, system user token</td><td><span class="tag none">Not connected</span></td></tr>
      <tr><td>Meta Ad Library</td><td>Competitor ads and how long they've run (no results)</td><td>Manual search for now, API needs ID verification</td><td><span class="tag est">Manual</span></td></tr>
      <tr><td>TeemDrop</td><td>Cost, shipping times, stock</td><td>No public API. Log by hand.</td><td><span class="tag est">Manual</span></td></tr>
      <tr><td>Google Trends / TikTok</td><td>Search interest, video views</td><td>Paid tools or scraping. Later.</td><td><span class="tag none">Later</span></td></tr>
    </table></div>
  </section>
  <section class="box">
    <h3>Share what you've logged</h3>
    <p class="small muted">Ads, price checks, products and settings are saved in this browser only. Export them and send the file to your partner, who can import it. Importing replaces what's in their browser.</p>
    <div class="chips"><button type="button" id="exp">Export my data</button> <label class="sec" style="display:inline-flex;align-items:center;gap:8px">Import<input type="file" id="imp" accept="application/json" style="width:auto;border:0;padding:0"></label></div>
    <p id="impMsg" class="small"></p>
  </section>`;
BIND.setup = (v) => {
  $("#exp", v).addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(local, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `daybreak-hq-${today()}.json`; a.click();
  });
  $("#imp", v).addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); local = Object.assign({ ads: [], prices: {}, products: [], sat: {}, weights: null, sim: {} }, d); save(); $("#impMsg").textContent = "Imported."; }
    catch { $("#impMsg").textContent = "That file isn't a Daybreak HQ export."; }
  });
};
