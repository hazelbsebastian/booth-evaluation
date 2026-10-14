// Talks to the Google Apps Script backend, or to localStorage in demo mode.
// Demo mode mirrors the server rules (one-time passkeys, per-topic open/closed).
(function () {
  const cfg = window.APP_CONFIG;
  const DEMO_ROWS = "eval_demo_responses_v2";
  const DEMO_KEYS = "eval_demo_keys";
  const DEMO_STATUS = "eval_demo_status";
  const DEMO_PASSWORD = "admin";
  const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const isDemo = !cfg.SCRIPT_URL;

  async function post(payload) {
    // text/plain avoids a CORS preflight, which Apps Script does not support.
    const res = await fetch(cfg.SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Server error (" + res.status + ")");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  // ---------- Demo storage ----------
  function readLocal(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function writeLocal(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function checkDemoAdmin(key) {
    if (key !== DEMO_PASSWORD) throw new Error('Wrong password (demo password is "admin")');
  }

  function normalizeKey(k) {
    return String(k || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function randomKey() {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const s = Array.from(bytes, (b) => KEY_ALPHABET[b % 32]).join("");
    return s.slice(0, 3) + "-" + s.slice(3);
  }

  function demoFindOpenKey(raw) {
    const key = normalizeKey(raw);
    const found = readLocal(DEMO_KEYS, []).find((k) => normalizeKey(k.key) === key);
    if (!found) throw new Error("Invalid passkey. Please check it and try again.");
    if (found.usedAt) throw new Error("This passkey has already been used.");
    if (readLocal(DEMO_STATUS, {})[found.topic] !== true) {
      throw new Error(`The evaluation for "${found.topicName}" is closed right now.`);
    }
    return found;
  }

  // ---------- Dates ----------
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  function parseIsoDate(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ""));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }

  function ordinal(n) {
    const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
    return n + s;
  }

  window.API = {
    isDemo,
    normalizeKey,

    // "2026-10-15" -> "October 15, 2026" (other text is returned unchanged)
    formatDate(v) {
      const p = parseIsoDate(v);
      return p ? `${MONTHS[p.m - 1]} ${p.d}, ${p.y}` : String(v || "");
    },

    // "2026-10-15" -> "15th day of October 2026"
    formatDayOf(v) {
      const p = parseIsoDate(v);
      return p ? `${ordinal(p.d)} day of ${MONTHS[p.m - 1]} ${p.y}` : "";
    },

    topicById(id) {
      return cfg.TOPICS.find((t) => t.id === id) || null;
    },

    // ---------- Participant ----------
    // Returns { key, topic, topicName } if the passkey is unused and its topic is open.
    async checkKey(key) {
      if (isDemo) {
        const k = demoFindOpenKey(key);
        return { key: k.key, topic: k.topic, topicName: k.topicName };
      }
      return (await post({ action: "checkKey", key })).key;
    },

    // Saves the evaluation and uses up the passkey.
    async submit(key, record) {
      if (isDemo) {
        const k = demoFindOpenKey(key);
        const now = new Date().toISOString();
        const rows = readLocal(DEMO_ROWS, []);
        rows.push(Object.assign({}, record, { timestamp: now, topic: k.topic, topicName: k.topicName, passkey: k.key }));
        writeLocal(DEMO_ROWS, rows);
        const keys = readLocal(DEMO_KEYS, []);
        const stored = keys.find((x) => x.key === k.key);
        stored.usedAt = now;
        stored.usedBy = record.name;
        writeLocal(DEMO_KEYS, keys);
        return { ok: true };
      }
      return post({ action: "submit", key, data: record });
    },

    // ---------- Admin ----------
    // Returns { rows, keys, status } where status is { topicId: true/false }.
    async adminData(adminKey) {
      if (isDemo) {
        checkDemoAdmin(adminKey);
        return { rows: readLocal(DEMO_ROWS, []), keys: readLocal(DEMO_KEYS, []), status: readLocal(DEMO_STATUS, {}) };
      }
      const d = await post({ action: "adminData", adminKey });
      return { rows: d.rows, keys: d.keys, status: d.status };
    },

    async setTopicOpen(adminKey, topic, isOpen) {
      if (isDemo) {
        checkDemoAdmin(adminKey);
        const status = readLocal(DEMO_STATUS, {});
        status[topic] = isOpen;
        writeLocal(DEMO_STATUS, status);
        return status;
      }
      return (await post({ action: "setTopicOpen", adminKey, topic, isOpen })).status;
    },

    async generateKeys(adminKey, topic, topicName, count) {
      if (isDemo) {
        checkDemoAdmin(adminKey);
        const keys = readLocal(DEMO_KEYS, []);
        const existing = new Set(keys.map((k) => normalizeKey(k.key)));
        const now = new Date().toISOString();
        const out = [];
        while (out.length < count) {
          const k = randomKey();
          if (existing.has(normalizeKey(k))) continue;
          existing.add(normalizeKey(k));
          out.push({ key: k, topic, topicName, createdAt: now, usedAt: "", usedBy: "" });
        }
        writeLocal(DEMO_KEYS, keys.concat(out));
        return out;
      }
      return (await post({ action: "generateKeys", adminKey, topic, topicName, count })).keys;
    },

    // topic: a topic id, or "*" for everything. Removes responses + passkeys and closes the topic.
    async clearData(adminKey, topic) {
      if (isDemo) {
        checkDemoAdmin(adminKey);
        const all = topic === "*";
        const rows = readLocal(DEMO_ROWS, []), keys = readLocal(DEMO_KEYS, []);
        const keptRows = all ? [] : rows.filter((r) => r.topic !== topic);
        const keptKeys = all ? [] : keys.filter((k) => k.topic !== topic);
        writeLocal(DEMO_ROWS, keptRows);
        writeLocal(DEMO_KEYS, keptKeys);
        const status = all ? {} : readLocal(DEMO_STATUS, {});
        if (!all) delete status[topic];
        writeLocal(DEMO_STATUS, status);
        return { removedResponses: rows.length - keptRows.length, removedKeys: keys.length - keptKeys.length, status };
      }
      const d = await post({ action: "clearData", adminKey, topic });
      return { removedResponses: d.removedResponses, removedKeys: d.removedKeys, status: d.status };
    }
  };
})();
