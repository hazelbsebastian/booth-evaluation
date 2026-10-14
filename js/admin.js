// Admin dashboard: login, per-topic open/closed, passkeys, tally, responses, export
(function () {
  const cfg = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);
  const SESSION_KEY = "eval_admin_key";
  const TOPIC_KEY = "eval_admin_topic";
  const ALL = "__all__";
  let rows = [], keys = [], status = {};

  const columns = [
    { id: "timestamp", label: "Date/Time", short: "Date/Time" },
    { id: "topicName", label: "Topic", short: "Topic" },
    { id: "passkey", label: "Passkey", short: "Passkey" },
    { id: "name", label: "Name", short: "Name" },
    { id: "email", label: "Email", short: "Email" },
    { id: "college", label: "College", short: "College" },
    { id: "yearLevel", label: "Year Level", short: "Year" }
  ]
    .concat(cfg.QUESTIONS.map((q, i) => ({ id: q.id, label: `Q${i + 1}. ${q.label}`, short: `Q${i + 1}`, rating: true })))
    .concat(cfg.FEEDBACK.map((q) => ({ id: q.id, label: q.label, short: q.short, wrap: true })));

  if (API.isDemo) $("demoNotice").classList.remove("hidden");
  $("eventTitle").textContent = (cfg.EVENT && cfg.EVENT.title) || "Dashboard";

  // ---------- Helpers ----------
  function toast(msg, isError) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function el(tag, text, cls) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function adminKey() { return sessionStorage.getItem(SESSION_KEY); }
  function currentTopicId() { return $("topicSelect").value; }
  function currentTopic() { return API.topicById(currentTopicId()); }

  function fmtDate(v) {
    const d = new Date(v);
    return isNaN(d) ? (v || "") : d.toLocaleString();
  }

  function topicNameOf(id) {
    const t = API.topicById(id);
    return t ? t.name : id;
  }

  // ---------- Login & loading ----------
  async function load() {
    const d = await API.adminData(adminKey());
    rows = (d.rows || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    keys = d.keys || [];
    status = d.status || {};
    render();
  }

  async function login(k) {
    $("loginBtn").disabled = true;
    $("loginError").textContent = "";
    sessionStorage.setItem(SESSION_KEY, k);
    try {
      await load();
      $("loginView").classList.add("hidden");
      $("dashView").classList.remove("hidden");
    } catch (err) {
      sessionStorage.removeItem(SESSION_KEY);
      $("loginError").textContent = err.message;
    } finally {
      $("loginBtn").disabled = false;
    }
  }

  // ---------- Topic picker ----------
  function buildTopicSelect() {
    const sel = $("topicSelect");
    cfg.TOPICS.forEach((t) => sel.add(new Option(t.name, t.id)));
    sel.add(new Option("All topics (results only)", ALL));
    let saved = null;
    try { saved = localStorage.getItem(TOPIC_KEY); } catch (e) { /* ignore */ }
    sel.value = saved && (saved === ALL || API.topicById(saved)) ? saved : (cfg.TOPICS[0] ? cfg.TOPICS[0].id : ALL);
  }

  function selectTopic(id) {
    $("topicSelect").value = id;
    try { localStorage.setItem(TOPIC_KEY, id); } catch (e) { /* ignore */ }
    render();
  }

  $("topicSelect").addEventListener("change", () => selectTopic(currentTopicId()));

  $("topicOpen").addEventListener("change", async () => {
    const box = $("topicOpen");
    const topic = currentTopicId();
    const want = box.checked;
    box.disabled = true;
    try {
      status = await API.setTopicOpen(adminKey(), topic, want);
      toast(`${topicNameOf(topic)}: evaluation ${want ? "OPEN" : "CLOSED"}.`);
    } catch (err) {
      box.checked = !want;
      toast("Could not change status: " + err.message, true);
    } finally {
      box.disabled = false;
      render();
    }
  });

  // ---------- Filtering ----------
  function topicRows() {
    const t = currentTopicId();
    return t === ALL ? rows : rows.filter((r) => r.topic === t);
  }

  function topicKeys() {
    const t = currentTopicId();
    return t === ALL ? keys : keys.filter((k) => k.topic === t);
  }

  function tableRows() {
    const q = $("search").value.trim().toLowerCase();
    const list = topicRows();
    if (!q) return list;
    return list.filter((r) => ["name", "email", "college", "yearLevel", "passkey"]
      .some((k) => String(r[k] || "").toLowerCase().includes(q)));
  }

  // ---------- Render ----------
  function render() {
    const isAll = currentTopicId() === ALL;
    const open = !isAll && status[currentTopicId()] === true;
    $("topicSwitchWrap").classList.toggle("hidden", isAll);
    $("keysCard").classList.toggle("hidden", isAll);
    $("topicOpen").checked = open;
    $("openLabel").textContent = open ? "Evaluation OPEN" : "Evaluation CLOSED";
    $("openLabel").className = open ? "is-open" : "is-closed";

    renderOverview();
    renderStats();
    if (!isAll) renderKeys();
    renderTally();
    renderSummary();
    renderTable();
  }

  function renderOverview() {
    const box = $("topicOverview");
    box.innerHTML = "";
    cfg.TOPICS.forEach((t) => {
      const b = el("button", undefined, "topic-tile" + (t.id === currentTopicId() ? " active" : ""));
      b.type = "button";
      const open = status[t.id] === true;
      const used = keys.filter((k) => k.topic === t.id && k.usedAt).length;
      const total = keys.filter((k) => k.topic === t.id).length;
      const n = rows.filter((r) => r.topic === t.id).length;
      b.append(
        el("span", open ? "● Open" : "○ Closed", "tile-status " + (open ? "is-open" : "is-closed")),
        el("span", t.name, "tile-name"),
        el("span", `${n} response${n === 1 ? "" : "s"} · ${used}/${total} keys used`, "tile-meta")
      );
      b.addEventListener("click", () => selectTopic(t.id));
      box.appendChild(b);
    });
  }

  function avg(list, id) {
    const vals = list.map((r) => Number(r[id])).filter((n) => n >= 1 && n <= 5);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  function renderStats() {
    const list = topicRows();
    const today = new Date().toDateString();
    const todayCount = list.filter((r) => new Date(r.timestamp).toDateString() === today).length;
    const overall = cfg.QUESTIONS.length ? cfg.QUESTIONS.reduce((s, q) => s + avg(list, q.id), 0) / cfg.QUESTIONS.length : 0;
    const satisfied = list.filter((r) => Number(r.q10) >= 4).length;
    $("stats").innerHTML = "";
    [
      [list.length, "Attendees (evaluations)"],
      [todayCount, "Submitted today"],
      [overall ? overall.toFixed(2) : "–", "Overall average (out of 5)"],
      [list.length ? Math.round((satisfied / list.length) * 100) + "%" : "–", "Satisfied overall (Q10 ≥ 4)"]
    ].forEach(([n, l]) => {
      const s = el("div", undefined, "stat");
      s.append(el("div", String(n), "num"), el("div", l, "lbl"));
      $("stats").appendChild(s);
    });
  }

  // ---------- Passkeys ----------
  function renderKeys() {
    const list = topicKeys();
    const used = list.filter((k) => k.usedAt).length;
    const left = list.length - used;
    const stats = $("keyStats");
    stats.innerHTML = "";
    [[list.length, "generated"], [used, "used"], [left, "left"]].forEach(([n, l]) => {
      const d = el("div", undefined, "key-stat");
      d.append(el("b", String(n)), el("span", l));
      stats.appendChild(d);
    });
    const meter = el("div", undefined, "key-meter");
    meter.title = `${used} of ${list.length} keys used`;
    const fill = el("div");
    fill.style.width = list.length ? (used / list.length) * 100 + "%" : "0";
    meter.appendChild(fill);
    stats.appendChild(meter);

    const grid = $("keyGrid");
    grid.innerHTML = "";
    const showUsed = $("showUsed").checked;
    const visible = list
      .filter((k) => showUsed || !k.usedAt)
      .sort((a, b) => (a.usedAt ? 1 : 0) - (b.usedAt ? 1 : 0) || String(b.createdAt).localeCompare(String(a.createdAt)));
    visible.forEach((k) => {
      const chip = el("span", k.key, "key-chip" + (k.usedAt ? " used" : ""));
      chip.title = k.usedAt ? `Used by ${k.usedBy || "?"} · ${fmtDate(k.usedAt)}` : "Unused";
      grid.appendChild(chip);
    });
    if (!visible.length) {
      grid.appendChild(el("p", list.length ? "All keys for this topic have been used. Generate more above." : "No keys yet. Generate some above.", "muted"));
    }
  }

  $("showUsed").addEventListener("change", renderKeys);

  $("genForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const max = cfg.MAX_KEYS_PER_BATCH || 200;
    const count = Math.floor(Number($("genCount").value));
    if (!(count >= 1 && count <= max)) return toast(`Enter a number from 1 to ${max}.`, true);
    const t = currentTopic();
    const btn = $("genBtn");
    btn.disabled = true;
    btn.textContent = "Generating…";
    try {
      const fresh = await API.generateKeys(adminKey(), t.id, t.name, count);
      keys = keys.concat(fresh);
      render();
      toast(`${fresh.length} new passkeys for ${t.name}.`);
    } catch (err) {
      toast("Could not generate keys: " + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "+ Generate";
    }
  });

  $("printKeysBtn").addEventListener("click", () => {
    const t = currentTopic();
    const unused = topicKeys().filter((k) => !k.usedAt);
    if (!unused.length) return toast("No unused keys to print.", true);
    const url = new URL("index.html", location.href).href;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const slips = unused.map((k) => `
      <div class="slip">
        <div class="topic">${esc(t.name)}</div>
        <div class="key">${esc(k.key)}</div>
        <div class="url">${esc(url)}</div>
        <div class="note">One-time passkey for the evaluation &amp; e-certificate</div>
      </div>`).join("");
    const w = window.open("", "_blank");
    if (!w) return toast("Allow pop-ups to print the keys.", true);
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Passkeys – ${esc(t.name)}</title>
      <style>
        @page { size: A4; margin: 10mm; }
        body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #1e1b2e; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); }
        .slip { border: 1px dashed #888; padding: 10px 8px; text-align: center; break-inside: avoid; }
        .topic { font-size: 11px; font-weight: 600; color: #4b3aa3; }
        .key { font: 700 26px Consolas, "Courier New", monospace; letter-spacing: 4px; margin: 6px 0; }
        .url { font-size: 9px; color: #555; word-break: break-all; }
        .note { font-size: 9px; color: #777; margin-top: 2px; }
      </style></head><body><div class="grid">${slips}</div>
      <script>window.onload = function () { window.print(); };<\/script></body></html>`);
    w.document.close();
  });

  $("keysCsvBtn").addEventListener("click", () => {
    const t = currentTopic();
    const list = topicKeys();
    const lines = [["Passkey", "Topic", "Created", "Status", "Used at", "Used by"].join(",")];
    list.forEach((k) => lines.push([k.key, t.name, fmtDate(k.createdAt), k.usedAt ? "Used" : "Unused",
      k.usedAt ? fmtDate(k.usedAt) : "", k.usedBy || ""].map(csvCell).join(",")));
    download(`Passkeys_${safeName(t.name)}.csv`, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  });

  // ---------- Tally (horizontal bars, one hue) ----------
  function tally(list, field, categories, sortByCount) {
    const counts = new Map(categories.map((c) => [c.toLowerCase(), { label: c, n: 0 }]));
    list.forEach((r) => {
      const v = String(r[field] || "").trim() || "Not specified";
      const k = v.toLowerCase();
      if (!counts.has(k)) counts.set(k, { label: v, n: 0 });
      counts.get(k).n++;
    });
    const out = Array.from(counts.values());
    return sortByCount ? out.sort((a, b) => b.n - a.n) : out;
  }

  function drawBars(container, data, total) {
    container.innerHTML = "";
    const max = Math.max(1, ...data.map((d) => d.n));
    data.forEach((d) => {
      const row = el("div", undefined, "hbar" + (d.n ? "" : " zero"));
      const pct = total ? Math.round((d.n / total) * 100) : 0;
      row.dataset.tip = `${d.label}: ${d.n} attendee${d.n === 1 ? "" : "s"} (${pct}%)`;
      const label = el("span", d.label, "hbar-label");
      const track = el("span", undefined, "hbar-track");
      const bar = el("span", undefined, "hbar-fill");
      bar.style.width = `calc((100% - 44px) * ${d.n / max})`;
      const val = el("span", String(d.n), "hbar-value");
      track.append(bar, val);
      row.append(label, track);
      container.appendChild(row);
    });
  }

  function renderTally() {
    const list = topicRows();
    const isAll = currentTopicId() === ALL;
    $("tallySub").textContent = `${list.length} attendee${list.length === 1 ? "" : "s"} · ${isAll ? "all topics" : topicNameOf(currentTopicId())}`;
    drawBars($("byCollege"), tally(list, "college", cfg.COLLEGES || [], true), list.length);
    drawBars($("byYear"), tally(list, "yearLevel", cfg.YEAR_LEVELS || [], false), list.length);
  }

  // shared tooltip for bars: follows the mouse, or shows on tap (phones)
  const tip = $("chartTip");
  function showTip(e) {
    const row = e.target.closest && e.target.closest(".hbar");
    if (!row) return tip.classList.add("hidden");
    tip.textContent = row.dataset.tip;
    tip.classList.remove("hidden");
    const x = Math.max(8, Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8));
    tip.style.left = x + "px";
    tip.style.top = e.clientY + 16 + "px";
  }
  document.addEventListener("mousemove", showTip);
  document.addEventListener("click", (e) => {
    showTip(e);
    clearTimeout(showTip.timer);
    showTip.timer = setTimeout(() => tip.classList.add("hidden"), 2500);
  });
  window.addEventListener("scroll", () => tip.classList.add("hidden"), { passive: true });

  // ---------- Rating summary ----------
  function renderSummary() {
    const list = topicRows();
    const summary = $("summary");
    summary.innerHTML = "";
    cfg.QUESTIONS.forEach((q, i) => {
      const a = avg(list, q.id);
      const row = el("div", undefined, "bar-row");
      const top = el("div", undefined, "top");
      top.append(el("span", `${i + 1}. ${q.short}`), el("b", a ? a.toFixed(2) : "–"));
      top.title = q.label;
      const bar = el("div", undefined, "bar");
      const fill = el("div");
      fill.style.width = (a / 5) * 100 + "%";
      bar.appendChild(fill);
      row.append(top, bar);
      summary.appendChild(row);
    });
  }

  // ---------- Table ----------
  function renderTable() {
    const list = tableRows();
    const table = $("table");
    table.innerHTML = "";

    const thead = el("thead"), htr = el("tr");
    htr.appendChild(el("th", "#"));
    columns.forEach((c) => {
      const th = el("th", c.short);
      th.title = c.label;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = el("tbody");
    list.forEach((r, i) => {
      const tr = el("tr");
      tr.appendChild(el("td", String(i + 1)));
      columns.forEach((c) => {
        const v = c.id === "timestamp" ? fmtDate(r[c.id]) : String(r[c.id] ?? "");
        tr.appendChild(el("td", v, c.rating ? "num" : c.wrap ? "wrap" : ""));
      });
      tbody.appendChild(tr);
    });
    if (!list.length) {
      const tr = el("tr"), td = el("td", "No responses yet.", "center muted");
      td.colSpan = columns.length + 1;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    $("countLabel").textContent = `Showing ${list.length} of ${topicRows().length} response(s)`;
  }

  // ---------- Export ----------
  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function csvCell(v) {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // prevent formula injection in Excel
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function safeName(s) { return String(s).replace(/[^\w-]+/g, "_"); }

  function fileBase() {
    const t = currentTopicId();
    return safeName(t === ALL ? "All_Topics" : topicNameOf(t)) + "_" + new Date().toISOString().slice(0, 10);
  }

  $("csvBtn").addEventListener("click", () => {
    const list = tableRows();
    const lines = [columns.map((c) => csvCell(c.label)).join(",")];
    list.forEach((r) => lines.push(columns.map((c) => csvCell(c.id === "timestamp" ? fmtDate(r[c.id]) : r[c.id])).join(",")));
    // BOM so Excel opens UTF-8 (ñ, accents) correctly
    download(fileBase() + ".csv", "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  });

  $("jsonBtn").addEventListener("click", () =>
    download(fileBase() + ".json", JSON.stringify(tableRows(), null, 2), "application/json"));

  // ---------- Events ----------
  $("search").addEventListener("input", renderTable);

  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    login($("adminKey").value);
  });

  $("refreshBtn").addEventListener("click", async () => {
    $("refreshBtn").disabled = true;
    try { await load(); toast("Refreshed."); }
    catch (err) { toast(err.message, true); }
    finally { $("refreshBtn").disabled = false; }
  });

  $("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    rows = []; keys = []; status = {};
    $("adminKey").value = "";
    $("dashView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
  });

  buildTopicSelect();
  const saved = adminKey();
  if (saved) login(saved);
})();
