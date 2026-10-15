/**
 * @OnlyCurrentDoc  (only asks for access to this one spreadsheet)
 *
 * Google Apps Script backend for the Evaluation & Attendance site.
 *
 * Setup (details in README.md):
 *  1. Create a Google Sheet -> Extensions -> Apps Script, paste this file.
 *  2. Project Settings -> Script Properties -> add ADMIN_KEY = <your admin password>.
 *  3. Deploy -> New deployment -> Web app
 *       Execute as: Me
 *       Who has access: Anyone
 *  4. Copy the Web App URL into SCRIPT_URL in config.js.
 *
 * Sheets (created automatically):
 *   PreEvaluation  one row per pre-evaluation (attendance + answers before the demo)
 *   Responses      one row per post-evaluation (after the demo)
 *   Keys           one row per passkey (key, topic, topicName, createdAt, usedAt, usedBy, preAt)
 *
 * A passkey is used twice: first for the pre-evaluation (sets preAt), then for the
 * post-evaluation (sets usedAt/usedBy, after which the key is finished).
 */

const RESPONSES_SHEET = 'Responses';
const PRE_SHEET = 'PreEvaluation';
const KEYS_SHEET = 'Keys';
const KEY_HEADERS = ['key', 'topic', 'topicName', 'createdAt', 'usedAt', 'usedBy', 'preAt'];
const ATTENDEE_FIELDS = ['name', 'email', 'college', 'yearLevel'];
const STATUS_PROP = 'TOPIC_STATUS';
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const MAX_BATCH = 200;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'checkKey':
        return json_({ ok: true, key: checkKey_(body.key) });
      case 'submitPre':
        return json_(submitPre_(body.key, body.data || {}));
      case 'submit':
        return json_(submit_(body.key, body.data || {}));
      case 'adminData':
        checkAdmin_(body.adminKey);
        return json_({ ok: true, rows: readRows_(RESPONSES_SHEET), preRows: readRows_(PRE_SHEET), keys: readRows_(KEYS_SHEET), status: getStatus_() });
      case 'setTopicOpen':
        checkAdmin_(body.adminKey);
        return json_({ ok: true, status: setTopicOpen_(body.topic, body.isOpen === true) });
      case 'generateKeys':
        checkAdmin_(body.adminKey);
        return json_({ ok: true, keys: generateKeys_(body.topic, body.topicName, body.count) });
      case 'clearData':
        checkAdmin_(body.adminKey);
        return json_(Object.assign({ ok: true }, clearData_(body.topic)));
      default:
        throw new Error('Unknown action');
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doGet() {
  return json_({ ok: true, message: 'Evaluation backend is running.' });
}

// ---------- Auth ----------
function checkAdmin_(key) {
  const adminKey = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!adminKey) throw new Error('ADMIN_KEY is not set in Script Properties');
  if (!key || key !== adminKey) {
    Utilities.sleep(1000); // slow down password guessing
    throw new Error('Wrong password');
  }
}

// ---------- Topic open/closed ----------
function getStatus_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(STATUS_PROP) || '{}'); }
  catch (e) { return {}; }
}

function setTopicOpen_(topic, isOpen) {
  topic = cleanId_(topic);
  if (!topic) throw new Error('Missing topic');
  return withLock_(function () {
    const status = getStatus_();
    status[topic] = isOpen;
    PropertiesService.getScriptProperties().setProperty(STATUS_PROP, JSON.stringify(status));
    return status;
  });
}

// ---------- Passkeys ----------
function normalizeKey_(k) {
  return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Finds a passkey by reading the Keys sheet. (A faster TextFinder lookup was tried and
// returned wrong rows under heavy load in stress tests, so this full read stays.)
function findKey_(key) {
  if (key.length !== 6) return null;
  const values = getSheet_(KEYS_SHEET, KEY_HEADERS).getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (normalizeKey_(values[i][0]) === key) {
      return { row: i + 1, key: values[i][0], topic: values[i][1], topicName: values[i][2], usedAt: values[i][4], preAt: values[i][6],
               hasPreHeader: values[0][6] === 'preAt' };
    }
  }
  return null;
}

// Runs fn while holding the script lock. Waits up to `ms`, then tells the user to retry.
function withLock_(fn, ms) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ms || 30000)) throw new Error('BUSY: Lots of people are submitting right now. Please try again.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function checkKey_(raw) {
  const key = normalizeKey_(raw);
  const found = findKey_(key);
  if (!found) {
    Utilities.sleep(800); // slow down guessing
    throw new Error('Invalid passkey. Please check it and try again.');
  }
  if (found.usedAt) throw new Error('This passkey has already been used.');
  if (getStatus_()[found.topic] !== true) throw new Error('The evaluation for "' + found.topicName + '" is closed right now.');
  const out = { key: found.key, topic: found.topic, topicName: found.topicName, stage: found.preAt ? 'post' : 'pre' };
  if (found.preAt) out.attendee = findAttendee_(found.key);
  return out;
}

// Name, email, college and year level saved with this passkey's pre-evaluation.
function findAttendee_(key) {
  const values = getSheet_(PRE_SHEET).getDataRange().getValues();
  const h = values[0] || [];
  const col = h.indexOf('passkey');
  for (let i = values.length - 1; i >= 1 && col !== -1; i--) {
    if (String(values[i][col]) === String(key)) {
      const a = {};
      ATTENDEE_FIELDS.forEach(function (f) { const c = h.indexOf(f); a[f] = c === -1 ? '' : String(values[i][c]).replace(/^'/, ''); });
      return a;
    }
  }
  return null;
}

function generateKeys_(topic, topicName, count) {
  topic = cleanId_(topic);
  if (!topic) throw new Error('Missing topic');
  count = Math.max(1, Math.min(MAX_BATCH, Number(count) || 0));
  topicName = String(topicName || topic).slice(0, 200);

  return withLock_(function () {
    const sheet = getSheet_(KEYS_SHEET, KEY_HEADERS);
    const existing = {};
    sheet.getDataRange().getValues().slice(1).forEach(function (r) { existing[normalizeKey_(r[0])] = true; });
    const now = new Date();
    const rows = [];
    const out = [];
    while (rows.length < count) {
      const k = randomKey_();
      const norm = normalizeKey_(k);
      if (existing[norm]) continue;
      existing[norm] = true;
      rows.push([k, topic, topicName, now, '', '', '']);
      out.push({ key: k, topic: topic, topicName: topicName, createdAt: now.toISOString(), usedAt: '', usedBy: '', preAt: '' });
    }
    const start = sheet.getLastRow() + 1;
    sheet.getRange(start, 1, rows.length, 1).setNumberFormat('@'); // keep keys as plain text
    sheet.getRange(start, 1, rows.length, KEY_HEADERS.length).setValues(rows);
    return out;
  }, 60000);
}

function randomKey_() {
  // 6 characters from a 32-letter alphabet, using UUID randomness
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random());
  let s = '';
  for (let i = 0; i < 6; i++) s += KEY_ALPHABET.charAt((bytes[i] + 256) % 32);
  return s.slice(0, 3) + '-' + s.slice(3);
}

// ---------- Submit ----------
// Copies up to 50 answer fields from the browser into record (column names cleaned).
function addAnswers_(record, data) {
  Object.keys(data).slice(0, 50).forEach(function (k) {
    const col = String(k).replace(/[^\w]/g, '').slice(0, 40);
    if (!col || record.hasOwnProperty(col)) return;
    let v = data[k];
    if (typeof v !== 'number') v = sanitize_(String(v == null ? '' : v).slice(0, 1000));
    record[col] = v;
  });
  return record;
}

// Pre-evaluation: saves attendance + answers and marks the key as started (preAt).
function submitPre_(rawKey, data) {
  const key = normalizeKey_(rawKey);
  const name = String(data.name || '').trim();
  if (name.length < 2) throw new Error('Name is required');

  withLock_(function () {
    const found = findKey_(key);
    if (!found) throw new Error('Invalid passkey.');
    if (found.usedAt) throw new Error('This passkey has already been used.');
    if (found.preAt) throw new Error('The pre-evaluation for this passkey is already done.');
    if (getStatus_()[found.topic] !== true) throw new Error('The evaluation for "' + found.topicName + '" is closed right now.');

    const record = addAnswers_({ timestamp: new Date(), topic: found.topic, topicName: found.topicName, passkey: found.key }, data);
    appendRecord_(getSheet_(PRE_SHEET), record);

    const keys = getSheet_(KEYS_SHEET, KEY_HEADERS);
    if (!found.hasPreHeader) keys.getRange(1, 7).setValue('preAt').setFontWeight('bold');
    keys.getRange(found.row, 7).setValue(record.timestamp);
  }, 15000);
  return { ok: true };
}

// Saved one at a time under the lock. In stress tests this was the only version that stayed
// 100% correct with 100 simultaneous submissions; the browser retries "BUSY" answers.
function submit_(rawKey, data) {
  const key = normalizeKey_(rawKey);
  const name = String(data.name || '').trim();
  if (name.length < 2) throw new Error('Name is required');

  withLock_(function () {
    const found = findKey_(key);
    if (!found) throw new Error('Invalid passkey.');
    if (found.usedAt) throw new Error('This passkey has already been used.');
    if (!found.preAt) throw new Error('Please answer the pre-evaluation first.');
    if (getStatus_()[found.topic] !== true) throw new Error('The evaluation for "' + found.topicName + '" is closed right now.');

    // Topic and key always come from the Keys sheet, never from the browser.
    const record = addAnswers_({ timestamp: new Date(), topic: found.topic, topicName: found.topicName, passkey: found.key }, data);

    appendRecord_(getSheet_(RESPONSES_SHEET), record);

    // Use up the key
    getSheet_(KEYS_SHEET, KEY_HEADERS).getRange(found.row, 5, 1, 2).setValues([[record.timestamp, sanitize_(name)]]);
  }, 15000);
  return { ok: true };
}

// ---------- Clear data ----------
// topic = a topic id to clear just that topic, or '*' to clear everything.
// Removes its pre/post responses and passkeys, and switches the topic back to closed.
function clearData_(topic) {
  const all = topic === '*';
  topic = all ? '*' : cleanId_(topic);
  if (!topic) throw new Error('Missing topic');

  return withLock_(function () {
    const responses = removeRows_(getSheet_(RESPONSES_SHEET), 'topic', topic, all);
    const pre = removeRows_(getSheet_(PRE_SHEET), 'topic', topic, all);
    const keys = removeRows_(getSheet_(KEYS_SHEET, KEY_HEADERS), 'topic', topic, all);
    let status = getStatus_();
    if (all) status = {}; else delete status[topic];
    PropertiesService.getScriptProperties().setProperty(STATUS_PROP, JSON.stringify(status));
    return { removedResponses: responses, removedPre: pre, removedKeys: keys, status: status };
  }, 60000);
}

// Deletes data rows whose `column` equals `value` (or all data rows); keeps the header row.
function removeRows_(sheet, column, value, all) {
  const lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return 0;
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const col = values[0].indexOf(column);
  const data = values.slice(1);
  let keep;
  if (all) keep = [];
  else if (col === -1) keep = data;
  else keep = data.filter(function (r) { return String(r[col]) !== value; });
  const removed = data.length - keep.length;
  if (!removed) return 0;
  sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (keep.length) sheet.getRange(2, 1, keep.length, lastCol).setValues(keep);
  return removed;
}

// Call while holding the lock. Adds any new column names to the header row, then the row.
function appendRecord_(sheet, record) {
  const headers = readHeaders_(sheet);
  let changed = false;
  Object.keys(record).forEach(function (k) {
    if (headers.indexOf(k) === -1) { headers.push(k); changed = true; }
  });
  if (changed) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow(headers.map(function (h) { return record[h] !== undefined ? record[h] : ''; }));
}

function readHeaders_(sheet) {
  const lastCol = sheet.getLastColumn();
  return lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
}

// ---------- Helpers ----------
function readRows_(name) {
  const values = getSheet_(name, name === KEYS_SHEET ? KEY_HEADERS : null).getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(function (r) {
    const o = {};
    headers.forEach(function (h, i) {
      let v = r[i];
      if (v instanceof Date) v = v.toISOString();
      o[h] = v;
    });
    return o;
  });
}

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function cleanId_(s) {
  return String(s || '').replace(/[^\w-]/g, '').slice(0, 60);
}

// Prevent spreadsheet formula injection (e.g. a name starting with "=")
function sanitize_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
