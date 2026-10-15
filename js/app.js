// Participant flow:
//   before the demo: Landing -> Passkey -> Attendance -> Pre-evaluation -> "see you after the demo"
//   after the demo:  Landing -> Passkey (same one) -> Post-evaluation -> Certificate
(function () {
  const cfg = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);
  const VIEWS = ["viewLanding", "viewPasskey", "viewAttendance", "viewPre", "viewPreDone", "viewEvaluation", "viewDone"];
  const LAST_KEY = "eval_last_passkey"; // pre-fills the passkey when the participant comes back
  // pass: the accepted passkey, topic: its topic from config (has the certificate),
  // stage: "pre" or "post", returning: attendee came from the saved pre-evaluation
  const state = { pass: null, topic: null, stage: null, returning: false, attendee: null, certCanvas: null };

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

  function remember(key) {
    try { if (key) localStorage.setItem(LAST_KEY, key); else localStorage.removeItem(LAST_KEY); } catch (e) { /* ignore */ }
  }
  function remembered() {
    try { return localStorage.getItem(LAST_KEY) || ""; } catch (e) { return ""; }
  }

  // ---------- Views ----------
  function show(view) {
    VIEWS.forEach((v) => $(v).classList.toggle("hidden", v !== view));
    // 3.5 = steps 1-3 done, nothing active yet (waiting for the demo)
    const step = { viewPasskey: 1, viewAttendance: 2, viewPre: 3, viewPreDone: 3.5, viewEvaluation: 4, viewDone: 5 }[view] || 0;
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

  function buildScaleLegends() {
    document.querySelectorAll("[data-scale-legend]").forEach((legend) => {
      legend.innerHTML = "";
      cfg.RATING_SCALE.forEach((r) => {
        const s = document.createElement("span");
        s.innerHTML = "<b></b> – ";
        s.querySelector("b").textContent = r.value;
        s.appendChild(document.createTextNode(r.label));
        legend.appendChild(s);
      });
    });
  }

  // Rating statements (1-5) into `wrap`
  function buildRatings(wrap, questions) {
    wrap.innerHTML = "";
    questions.forEach((q, i) => {
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
  }

  // Optional text answers into `wrap`
  function buildFeedback(wrap, questions) {
    wrap.innerHTML = "";
    questions.forEach((q) => {
      const f = document.createElement("div");
      f.className = "field";
      const label = document.createElement("label");
      label.htmlFor = q.id;
      label.textContent = q.label;
      const ta = document.createElement("textarea");
      ta.id = q.id; ta.maxLength = 1000; ta.placeholder = "Write your answer here (optional)";
      f.append(label, ta);
      wrap.appendChild(f);
    });
  }

  function preQuestions() {
    return (state.topic && (cfg.PRE_QUESTIONS || {})[state.topic.id]) || [];
  }

  // Pre-evaluation statements depend on the topic, so they're built once the passkey is known.
  function buildPre() {
    buildRatings($("preQuestions"), preQuestions());
    buildFeedback($("preFeedback"), cfg.PRE_FEEDBACK || []);
    updatePreProgress();
  }

  function resetForms() {
    $("viewPasskey").reset();
    $("viewAttendance").reset();
    $("viewPre").reset();
    $("viewEvaluation").reset();
    document.querySelectorAll(".invalid, .missing").forEach((el) => el.classList.remove("invalid", "missing"));
    ["passkeyError", "attendanceError", "preError", "evaluationError"].forEach((id) => { $(id).textContent = ""; });
    state.pass = null;
    state.topic = null;
    state.stage = null;
    state.returning = false;
    updateProgress();
    state.attendee = null;
    state.certCanvas = null;
  }

  // "3/10 answered" counters in the sticky submit bars
  function showProgress(questions, el) {
    const done = questions.filter((q) => document.querySelector(`input[name="${q.id}"]:checked`)).length;
    el.textContent = `${done}/${questions.length} answered`;
    el.classList.toggle("complete", done === questions.length);
  }
  function updateProgress() { showProgress(cfg.QUESTIONS, $("evalProgress")); }
  function updatePreProgress() { showProgress(preQuestions(), $("preProgress")); }

  // Reads the ratings; marks unanswered ones in red. Returns null if any are missing.
  function collectRatings(questions, errorEl) {
    const answers = {};
    let firstMissing = null;
    questions.forEach((q) => {
      const checked = document.querySelector(`input[name="${q.id}"]:checked`);
      const box = document.querySelector(`.q[data-qid="${q.id}"]`);
      box.classList.toggle("missing", !checked);
      if (!checked && !firstMissing) firstMissing = box;
      answers[q.id] = checked ? Number(checked.value) : "";
    });
    if (firstMissing) {
      errorEl.textContent = `Please answer all ${questions.length} questions (the ones marked in red).`;
      firstMissing.scrollIntoView({ behavior: "smooth", block: "center" });
      return null;
    }
    errorEl.textContent = "";
    return answers;
  }

  // ---------- Landing ----------
  $("roleAttendee").addEventListener("click", () => {
    if (!$("passkey").value && remembered()) $("passkey").value = remembered();
    show("viewPasskey");
    setTimeout(() => $("passkey").focus({ preventScroll: true }), 350);
  });

  document.querySelectorAll("[data-home]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.closest("#viewDone, #viewPreDone")) resetForms();
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
      state.stage = res.stage === "post" ? "post" : "pre";
      $("topicChipName").textContent = state.topic.name;
      $("passkeyError").textContent = "";

      // Coming back after the demo: skip straight to the post-evaluation.
      if (state.stage === "post" && res.attendee && res.attendee.name) {
        state.attendee = res.attendee;
        state.returning = true;
        $("welcomeBack").textContent = `Welcome back, ${res.attendee.name}! `;
        show("viewEvaluation");
        return;
      }
      $("welcomeBack").textContent = "";
      if (state.stage === "pre") buildPre();
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

  // ---------- Step 2: Attendance ----------
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
    show(state.stage === "post" ? "viewEvaluation" : "viewPre");
  });

  ["fullName", "email", "yearLevel"].forEach((id) =>
    $(id).addEventListener("input", () => $(id).classList.remove("invalid")));
  document.addEventListener("input", (e) => { if (e.target.id === "college") e.target.classList.remove("invalid"); });

  $("attBackBtn").addEventListener("click", () => show("viewPasskey"));

  // ---------- Step 3: Pre-evaluation ----------
  $("preQuestions").addEventListener("change", updatePreProgress);
  $("preBackBtn").addEventListener("click", () => show("viewAttendance"));

  $("viewPre").addEventListener("submit", async (e) => {
    e.preventDefault();
    const answers = collectRatings(preQuestions(), $("preError"));
    if (!answers) return;
    (cfg.PRE_FEEDBACK || []).forEach((q) => { answers[q.id] = $(q.id).value.trim(); });

    const btn = $("preSubmitBtn");
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      await API.submitPre(state.pass, Object.assign({}, state.attendee, answers), (n) => {
        btn.textContent = `Lots of students are submitting… retrying (${n})`;
      });
      remember(state.pass);
      $("preDoneName").textContent = state.attendee.name;
      $("preDoneKey").textContent = state.pass;
      show("viewPreDone");
    } catch (err) {
      $("preError").textContent = "Submission failed: " + err.message + ". Please try again.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });

  // ---------- Step 4: Post-evaluation ----------
  $("questions").addEventListener("change", updateProgress);
  $("backBtn").addEventListener("click", () => show(state.returning ? "viewPasskey" : "viewAttendance"));

  $("viewEvaluation").addEventListener("submit", async (e) => {
    e.preventDefault();
    const answers = collectRatings(cfg.QUESTIONS, $("evaluationError"));
    if (!answers) return;
    cfg.FEEDBACK.forEach((q) => { answers[q.id] = $(q.id).value.trim(); });

    const btn = $("submitBtn");
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      await API.submit(state.pass, Object.assign({}, state.attendee, answers), (n) => {
        btn.textContent = `Lots of students are submitting… retrying (${n})`;
      });
      remember("");
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

  // ---------- Step 5: Certificate ----------
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
    buildScaleLegends();
    buildRatings($("questions"), cfg.QUESTIONS);
    buildFeedback($("feedback"), cfg.FEEDBACK);
    updateProgress();
    renderEvent();
  }

  init();
})();
