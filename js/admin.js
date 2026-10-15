// Admin dashboard: login, per-topic open/closed, passkeys, tally, pre/post responses, export
(function () {
  const cfg = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);
  const SESSION_KEY = "eval_admin_key";
  const TOPIC_KEY = "eval_admin_topic";
  const ALL = "__all__";
  let rows = [], preRows = [], keys = [], status = {};

  const baseColumns = [
    { id: "timestamp", label: "Date/Time", short: "Date/Time" },
    { id: "topicName", label: "Topic", short: "Topic" },
    { id: "passkey", label: "Passkey", short: "Passkey" },
    { id: "name", label: "Name", short: "Name" },
    { id: "email", label: "Email", short: "Email" },
    { id: "college", label: "College", short: "College" },
    { id: "yearLevel", label: "Year Level", short: "Year" }
  ];

  // Post-evaluation columns
  const columns = baseColumns
    .concat(cfg.QUESTIONS.map((q, i) => ({ id: q.id, label: `Q${i + 1}. ${q.label}`, short: `Q${i + 1}`, rating: true })))
    .concat(cfg.FEEDBACK.map((q) => ({ id: q.id, label: q.label, short: q.short, wrap: true })));

  // Pre-evaluation statements differ per topic; "All topics" shows them as P1, P2, ...
  function preQuestionsFor(topicId) {
    const pre = cfg.PRE_QUESTIONS || {};
    if (topicId !== ALL) return pre[topicId] || [];
    const n = Math.max(0, ...Object.values(pre).map((list) => list.length));
    return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, short: `P${i + 1}`, label: `P${i + 1} (differs per topic)` }));
  }

  function preColumns() {
    return baseColumns
      .concat(preQuestionsFor(currentTopicId()).map((q, i) => ({ id: q.id, label: `P${i + 1}. ${q.label}`, short: `P${i + 1}`, rating: true })))
      .concat((cfg.PRE_FEEDBACK || []).map((q) => ({ id: q.id, label: q.label, short: q.short, wrap: true })));
  }

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
    preRows = (d.preRows || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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

  function topicPreRows() {
    const t = currentTopicId();
    return t === ALL ? preRows : preRows.filter((r) => r.topic === t);
  }

  // Everyone who attended: their pre-evaluation, or the post-evaluation if there's no pre row
  function attendeeRows() {
    const pre = topicPreRows();
    const seen = new Set(pre.map((r) => r.passkey));
    return pre.concat(topicRows().filter((r) => !seen.has(r.passkey)));
  }

  function topicKeys() {
    const t = currentTopicId();
    return t === ALL ? keys : keys.filter((k) => k.topic === t);
  }

  function searchRows(list, input) {
    const q = input.value.trim().toLowerCase();
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
    renderPreSummary();
    renderPreTable();
  }

  function tableRows() { return searchRows(topicRows(), $("search")); }
  function preTableRows() { return searchRows(topicPreRows(), $("preSearch")); }

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
      const pre = preRows.filter((r) => r.topic === t.id).length;
      b.append(
        el("span", open ? "● Open" : "○ Closed", "tile-status " + (open ? "is-open" : "is-closed")),
        el("span", t.name, "tile-name"),
        el("span", `${pre} pre · ${n} post · ${used}/${total} keys finished`, "tile-meta")
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
    const overall = cfg.QUESTIONS.length ? cfg.QUESTIONS.reduce((s, q) => s + avg(list, q.id), 0) / cfg.QUESTIONS.length : 0;
    const satisfied = list.filter((r) => Number(r.q10) >= 4).length;
    $("stats").innerHTML = "";
    [
      [attendeeRows().length, "Attendees (pre-evaluations)"],
      [list.length, "Post-evaluations"],
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
    const started = list.filter((k) => k.preAt && !k.usedAt).length;
    const left = list.length - used - started;
    const stats = $("keyStats");
    stats.innerHTML = "";
    [[list.length, "generated"], [left, "not used"], [started, "pre done"], [used, "finished"]].forEach(([n, l]) => {
      const d = el("div", undefined, "key-stat");
      d.append(el("b", String(n)), el("span", l));
      stats.appendChild(d);
    });
    const meter = el("div", undefined, "key-meter");
    meter.title = `${used} of ${list.length} keys finished`;
    const fill = el("div");
    fill.style.width = list.length ? (used / list.length) * 100 + "%" : "0";
    meter.appendChild(fill);
    stats.appendChild(meter);

    const grid = $("keyGrid");
    grid.innerHTML = "";
    const showUsed = $("showUsed").checked;
    const visible = list
      .filter((k) => showUsed || !k.usedAt)
      .sort((a, b) => keyOrder(a) - keyOrder(b) || String(b.createdAt).localeCompare(String(a.createdAt)));
    visible.forEach((k) => {
      const chip = el("span", k.key, "key-chip" + (k.usedAt ? " used" : k.preAt ? " started" : ""));
      chip.title = k.usedAt ? `Finished by ${k.usedBy || "?"} · ${fmtDate(k.usedAt)}`
        : k.preAt ? `Pre-evaluation done ${fmtDate(k.preAt)} · waiting for post-evaluation` : "Not used yet";
      grid.appendChild(chip);
    });
    if (!visible.length) {
      grid.appendChild(el("p", list.length ? "All keys for this topic are finished. Generate more above." : "No keys yet. Generate some above.", "muted"));
    }
  }

  function keyOrder(k) { return k.usedAt ? 2 : k.preAt ? 1 : 0; }

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
    const unused = topicKeys().filter((k) => !k.usedAt && !k.preAt);
    if (!unused.length) return toast("No unused keys to print.", true);
    const url = new URL("index.html", location.href).href;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const slips = unused.map((k) => `
      <div class="slip">
        <div class="topic">${esc(t.name)}</div>
        <div class="key">${esc(k.key)}</div>
        <div class="url">${esc(url)}</div>
        <div class="note">Use before the demo (pre-evaluation) and again after (post-evaluation &amp; e-certificate)</div>
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
    const lines = [["Passkey", "Topic", "Created", "Status", "Pre-evaluation at", "Finished at", "Finished by"].join(",")];
    list.forEach((k) => lines.push([k.key, t.name, fmtDate(k.createdAt), k.usedAt ? "Finished" : k.preAt ? "Pre done" : "Not used",
      k.preAt ? fmtDate(k.preAt) : "", k.usedAt ? fmtDate(k.usedAt) : "", k.usedBy || ""].map(csvCell).join(",")));
    download(`Passkeys_${safeName(t.name)}.csv`, BOM + lines.join("\r\n"), "text/csv;charset=utf-8");
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
    const list = attendeeRows();
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

  function renderPreSummary() {
    const t = currentTopicId();
    const box = $("preSummary");
    box.innerHTML = "";
    if (t === ALL) {
      box.appendChild(el("p", "Pick a topic to see the average for each of its pre-evaluation statements.", "muted"));
      return;
    }
    const list = topicPreRows();
    preQuestionsFor(t).forEach((q, i) => {
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
      box.appendChild(row);
    });
  }

  // ---------- Tables ----------
  function renderTable() {
    const list = tableRows();
    drawTable($("table"), columns, list);
    $("countLabel").textContent = `Showing ${list.length} of ${topicRows().length} response(s)`;
  }

  function renderPreTable() {
    const list = preTableRows();
    drawTable($("preTable"), preColumns(), list);
    $("preCountLabel").textContent = `Showing ${list.length} of ${topicPreRows().length} pre-evaluation(s)`;
  }

  function drawTable(table, cols, list) {
    table.innerHTML = "";

    const thead = el("thead"), htr = el("tr");
    htr.appendChild(el("th", "#"));
    cols.forEach((c) => {
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
      cols.forEach((c) => {
        const v = c.id === "timestamp" ? fmtDate(r[c.id]) : String(r[c.id] ?? "");
        tr.appendChild(el("td", v, c.rating ? "num" : c.wrap ? "wrap" : ""));
      });
      tbody.appendChild(tr);
    });
    if (!list.length) {
      const tr = el("tr"), td = el("td", "No responses yet.", "center muted");
      td.colSpan = cols.length + 1;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
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

  const BOM = String.fromCharCode(0xFEFF); // so Excel opens UTF-8 (ñ, accents) correctly

  function safeName(s) { return String(s).replace(/[^\w-]+/g, "_"); }

  function fileBase() {
    const t = currentTopicId();
    return safeName(t === ALL ? "All_Topics" : topicNameOf(t)) + "_" + new Date().toISOString().slice(0, 10);
  }

  function downloadCsv(list, base, cols) {
    cols = cols || columns;
    const lines = [cols.map((c) => csvCell(c.label)).join(",")];
    list.forEach((r) => lines.push(cols.map((c) => csvCell(c.id === "timestamp" ? fmtDate(r[c.id]) : r[c.id])).join(",")));
    download(base + ".csv", BOM + lines.join("\r\n"), "text/csv;charset=utf-8");
  }

  $("csvBtn").addEventListener("click", () => downloadCsv(tableRows(), "Post_" + fileBase()));
  $("preCsvBtn").addEventListener("click", () => downloadCsv(preTableRows(), "Pre_" + fileBase(), preColumns()));

  $("jsonBtn").addEventListener("click", () =>
    download(fileBase() + ".json", JSON.stringify(tableRows(), null, 2), "application/json"));

  // ---------- Clear data (with confirmation) ----------
  const dialog = $("clearDialog");

  function clearTarget() {
    return document.querySelector('input[name="clearScope"]:checked').value === "*" ? "*" : currentTopicId();
  }

  function rowsFor(list, t) { return t === "*" ? list : list.filter((x) => x.topic === t); }

  function updateClear() {
    const t = clearTarget();
    const r = rowsFor(rows, t).length, p = rowsFor(preRows, t).length, k = rowsFor(keys, t).length;
    const where = t === "*" ? "ALL topics" : topicNameOf(t);
    $("clearSummary").textContent =
      `This will permanently delete ${p} pre-evaluation${p === 1 ? "" : "s"}, ${r} post-evaluation${r === 1 ? "" : "s"} ` +
      `and ${k} passkey${k === 1 ? "" : "s"} ` +
      `for ${where}, and switch ${t === "*" ? "every topic" : "this topic"} to CLOSED.`;
    $("clearGo").disabled = $("clearConfirm").value.trim().toUpperCase() !== "DELETE";
  }

  $("clearBtn").addEventListener("click", () => {
    const isAll = currentTopicId() === ALL;
    const topicRadio = document.querySelector('input[name="clearScope"][value="topic"]');
    topicRadio.disabled = isAll;
    (isAll ? document.querySelector('input[name="clearScope"][value="*"]') : topicRadio).checked = true;
    $("clearTopicName").textContent = isAll ? "(pick a topic first)" : topicNameOf(currentTopicId());
    $("clearConfirm").value = "";
    $("clearError").textContent = "";
    updateClear();
    dialog.showModal();
    setTimeout(() => $("clearConfirm").focus(), 50);
  });

  document.querySelectorAll('input[name="clearScope"]').forEach((r) => r.addEventListener("change", updateClear));
  $("clearConfirm").addEventListener("input", updateClear);
  $("clearCancel").addEventListener("click", () => dialog.close());
  $("clearForm").addEventListener("submit", (e) => e.preventDefault()); // pressing Enter never deletes

  $("clearBackupBtn").addEventListener("click", () => {
    const t = clearTarget();
    const base = safeName(t === "*" ? "All_Topics" : topicNameOf(t)) + "_" + new Date().toISOString().slice(0, 10);
    downloadCsv(rowsFor(rows, t), "BACKUP_Post_" + base);
    // second file a moment later so the browser doesn't drop it
    setTimeout(() => downloadCsv(rowsFor(preRows, t), "BACKUP_Pre_" + base, preColumns()), 300);
  });

  $("clearGo").addEventListener("click", async () => {
    if ($("clearConfirm").value.trim().toUpperCase() !== "DELETE") return;
    const t = clearTarget();
    const btn = $("clearGo");
    btn.disabled = true;
    btn.textContent = "Deleting…";
    try {
      const res = await API.clearData(adminKey(), t);
      dialog.close();
      await load();
      toast(`Cleared ${res.removedPre} pre-evaluation(s), ${res.removedResponses} post-evaluation(s) and ${res.removedKeys} passkey(s).`);
    } catch (err) {
      $("clearError").textContent = "Could not clear data: " + err.message;
    } finally {
      btn.textContent = "Delete permanently";
      updateClear();
    }
  });

  // ---------- Events ----------
  $("search").addEventListener("input", renderTable);
  $("preSearch").addEventListener("input", renderPreTable);

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
    rows = []; preRows = []; keys = []; status = {};
    $("adminKey").value = "";
    $("dashView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
  });

  buildTopicSelect();
  const saved = adminKey();
  if (saved) login(saved);
})();
