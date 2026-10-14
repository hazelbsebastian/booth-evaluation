// Participant flow: Landing -> Passkey -> Attendance -> Evaluation -> Certificate
(function () {
  const cfg = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);
  const VIEWS = ["viewLanding", "viewPasskey", "viewAttendance", "viewEvaluation", "viewDone"];
  // pass: the accepted passkey, topic: its topic from config (has the certificate)
  const state = { pass: null, topic: null, attendee: null, certCanvas: null };

  const ICONS = {
    date: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    venue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    org: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 21h18M5 21V9l7-5 7 5v12M10 21v-5h4v5"/></svg>'
  };

  function toast(msg, isError) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  // ---------- Views ----------
  function show(view) {
    VIEWS.forEach((v) => $(v).classList.toggle("hidden", v !== view));
    const step = { viewPasskey: 1, viewAttendance: 2, viewEvaluation: 3, viewDone: 4 }[view] || 0;
    $("steps").classList.toggle("hidden", !step);
    $("steps").querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("active", i + 1 === step);
      li.classList.toggle("done", i + 1 < step);
      if (i + 1 === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    $("topicChip").classList.toggle("hidden", !step || !state.topic);
    $("band").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Event info ----------
  function renderEvent() {
    const s = cfg.EVENT || {};
    $("eventTitle").textContent = s.title || "Post-Event Evaluation";
    document.title = (s.title ? s.title + " – " : "") + "Post-Event Evaluation";

    const meta = $("eventMeta");
    meta.innerHTML = "";
    [["date", API.formatDate(s.date)], ["venue", s.venue], ["org", s.organizer]].forEach(([icon, text]) => {
      if (!text) return;
      const span = document.createElement("span");
      span.innerHTML = ICONS[icon];
      span.appendChild(document.createTextNode(text));
      meta.appendChild(span);
    });
  }

  // ---------- Build forms ----------
  function buildAttendance() {
    const field = $("collegeField");
    let el;
    if (cfg.COLLEGES && cfg.COLLEGES.length) {
      el = document.createElement("select");
      el.innerHTML = '<option value="">Select your college</option>';
      cfg.COLLEGES.forEach((c) => el.add(new Option(c, c)));
    } else {
      el = document.createElement("input");
      el.type = "text";
      el.maxLength = 120;
      el.placeholder = "e.g. College of Computer Studies";
    }
    el.id = "college";
    el.required = true;
    field.appendChild(el);

    const yl = $("yearLevel");
    yl.innerHTML = '<option value="">Select year level</option>';
    cfg.YEAR_LEVELS.forEach((y) => yl.add(new Option(y, y)));
  }

  function buildEvaluation() {
    const legend = $("scaleLegend");
    legend.innerHTML = "";
    cfg.RATING_SCALE.forEach((r) => {
      const s = document.createElement("span");
      s.innerHTML = "<b></b> – ";
      s.querySelector("b").textContent = r.value;
      s.appendChild(document.createTextNode(r.label));
      legend.appendChild(s);
    });

    const wrap = $("questions");
    cfg.QUESTIONS.forEach((q, i) => {
      const div = document.createElement("fieldset");
      div.className = "q";
      div.dataset.qid = q.id;

      const head = document.createElement("legend");
      head.className = "q-head";
      head.innerHTML = `<span class="q-num">${i + 1}</span><span class="q-text"></span>`;
      head.querySelector(".q-text").textContent = q.label;
      div.appendChild(head);

      const row = document.createElement("div");
      row.className = "likert";
      cfg.RATING_SCALE.forEach((r) => {
        const id = `${q.id}_${r.value}`;
        const input = document.createElement("input");
        input.type = "radio"; input.name = q.id; input.id = id; input.value = r.value;
        const label = document.createElement("label");
        label.htmlFor = id;
        label.title = r.label;
        label.innerHTML = `<b>${r.value}</b><span></span>`;
        label.querySelector("span").textContent = r.label;
        input.addEventListener("change", () => div.classList.remove("missing"));
        row.append(input, label);
      });
      div.appendChild(row);

      const first = cfg.RATING_SCALE[0], last = cfg.RATING_SCALE[cfg.RATING_SCALE.length - 1];
      const ends = document.createElement("div");
      ends.className = "likert-ends";
      ends.innerHTML = "<span></span><span></span>";
      ends.children[0].textContent = first.label;
      ends.children[1].textContent = last.label;
      div.appendChild(ends);

      wrap.appendChild(div);
    });

    const fb = $("feedback");
    cfg.FEEDBACK.forEach((q) => {
      const f = document.createElement("div");
      f.className = "field";
      const label = document.createElement("label");
      label.htmlFor = q.id;
      label.textContent = q.label;
      const ta = document.createElement("textarea");
      ta.id = q.id; ta.maxLength = 1000; ta.placeholder = "Write your answer here (optional)";
      f.append(label, ta);
      fb.appendChild(f);
    });
  }

  function resetForms() {
    $("viewPasskey").reset();
    $("viewAttendance").reset();
    $("viewEvaluation").reset();
    document.querySelectorAll(".invalid, .missing").forEach((el) => el.classList.remove("invalid", "missing"));
    $("passkeyError").textContent = "";
    $("attendanceError").textContent = "";
    $("evaluationError").textContent = "";
    state.pass = null;
    state.topic = null;
    updateProgress();
    state.attendee = null;
    state.certCanvas = null;
  }

  // ---------- Landing ----------
  $("roleAttendee").addEventListener("click", () => {
    show("viewPasskey");
    setTimeout(() => $("passkey").focus({ preventScroll: true }), 350);
  });

  document.querySelectorAll("[data-home]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.closest("#viewDone")) resetForms();
      show("viewLanding");
    }));

  // ---------- Passkey ----------
  $("passkey").addEventListener("input", () => {
    // Auto-format as ABC-DEF while typing
    const raw = API.normalizeKey($("passkey").value).slice(0, 6);
    $("passkey").value = raw.length > 3 ? raw.slice(0, 3) + "-" + raw.slice(3) : raw;
    $("passkey").classList.remove("invalid");
  });

  $("viewPasskey").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = $("passkey").value;
    if (API.normalizeKey(key).length !== 6) {
      $("passkey").classList.add("invalid");
      $("passkeyError").textContent = "Your passkey has 6 characters, like ABC-123.";
      return;
    }
    const btn = $("passkeyBtn");
    btn.disabled = true;
    btn.textContent = "Checking…";
    try {
      const res = await API.checkKey(key);
      state.pass = res.key;
      state.topic = API.topicById(res.topic) || { id: res.topic, name: res.topicName };
      $("topicChipName").textContent = state.topic.name;
      $("passkeyError").textContent = "";
      show("viewAttendance");
      setTimeout(() => $("fullName").focus({ preventScroll: true }), 350);
    } catch (err) {
      $("passkey").classList.add("invalid");
      $("passkeyError").textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Continue →";
    }
  });

  // ---------- Step 1 ----------
  $("viewAttendance").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = {
      name: $("fullName").value.trim().replace(/\s+/g, " "),
      email: $("email").value.trim(),
      college: $("college").value.trim(),
      yearLevel: $("yearLevel").value
    };
    const checks = [
      ["fullName", f.name.length >= 2, "Please enter your full name."],
      ["email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email), "Please enter a valid email address."],
      ["college", !!f.college, "Please enter your college."],
      ["yearLevel", !!f.yearLevel, "Please select your year level."]
    ];
    let firstError = null;
    checks.forEach(([id, ok, message]) => {
      $(id).classList.toggle("invalid", !ok);
      if (!ok && !firstError) firstError = [id, message];
    });
    if (firstError) {
      $("attendanceError").textContent = firstError[1];
      $(firstError[0]).focus();
      return;
    }
    $("attendanceError").textContent = "";
    state.attendee = f;
    show("viewEvaluation");
  });

  ["fullName", "email", "yearLevel"].forEach((id) =>
    $(id).addEventListener("input", () => $(id).classList.remove("invalid")));
  document.addEventListener("input", (e) => { if (e.target.id === "college") e.target.classList.remove("invalid"); });

  $("backBtn").addEventListener("click", () => show("viewAttendance"));

  // "3/10 answered" counter in the sticky submit bar
  function updateProgress() {
    const done = cfg.QUESTIONS.filter((q) => document.querySelector(`input[name="${q.id}"]:checked`)).length;
    $("evalProgress").textContent = `${done}/${cfg.QUESTIONS.length} answered`;
    $("evalProgress").classList.toggle("complete", done === cfg.QUESTIONS.length);
  }
  $("questions").addEventListener("change", updateProgress);
  $("attBackBtn").addEventListener("click", () => show("viewPasskey"));

  // ---------- Step 2 ----------
  $("viewEvaluation").addEventListener("submit", async (e) => {
    e.preventDefault();
    const answers = {};
    let firstMissing = null;
    cfg.QUESTIONS.forEach((q) => {
      const checked = document.querySelector(`input[name="${q.id}"]:checked`);
      const box = document.querySelector(`.q[data-qid="${q.id}"]`);
      box.classList.toggle("missing", !checked);
      if (!checked && !firstMissing) firstMissing = box;
      answers[q.id] = checked ? Number(checked.value) : "";
    });
    if (firstMissing) {
      $("evaluationError").textContent = "Please answer all 10 questions (the ones marked in red).";
      firstMissing.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    cfg.FEEDBACK.forEach((q) => { answers[q.id] = $(q.id).value.trim(); });
    $("evaluationError").textContent = "";

    const btn = $("submitBtn");
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      await API.submit(state.pass, Object.assign({}, state.attendee, answers));
      $("doneName").textContent = state.attendee.name;
      show("viewDone");
      await makeCertificate(true);
    } catch (err) {
      $("evaluationError").textContent = "Submission failed: " + err.message + ". Please try again.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });

  // ---------- Step 3 ----------
  async function makeCertificate(autoDownload) {
    const img = $("certPreview"), loading = $("certLoading");
    loading.classList.remove("hidden");
    img.removeAttribute("src");
    try {
      state.certCanvas = await Certificate.render(state.attendee.name, state.topic);
      img.src = state.certCanvas.toDataURL("image/jpeg", 0.85);
      loading.classList.add("hidden");
      if (autoDownload) Certificate.savePdf(state.certCanvas, state.attendee.name);
    } catch (err) {
      loading.textContent = "Could not create the certificate preview.";
      toast(err.message, true);
    }
  }

  $("downloadCert").addEventListener("click", async () => {
    if (!state.attendee) return;
    if (!state.certCanvas) return makeCertificate(true);
    Certificate.savePdf(state.certCanvas, state.attendee.name);
    toast("Downloading your certificate…");
  });

  // ---------- Init ----------
  function init() {
    buildAttendance();
    buildEvaluation();
    updateProgress();
    renderEvent();
  }

  init();
})();
