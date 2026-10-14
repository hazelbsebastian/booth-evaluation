/**
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
 *   Responses  one row per submitted evaluation
 *   Keys       one row per passkey (key, topic, topicName, createdAt, usedAt, usedBy)
 */

const RESPONSES_SHEET = 'Responses';
const KEYS_SHEET = 'Keys';
const KEY_HEADERS = ['key', 'topic', 'topicName', 'createdAt', 'usedAt', 'usedBy'];
const STATUS_PROP = 'TOPIC_STATUS';
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const MAX_BATCH = 200;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'checkKey':
        return json_({ ok: true, key: checkKey_(body.key) });
      case 'submit':
        return json_(submit_(body.key, body.data || {}));
      case 'adminData':
        checkAdmin_(body.adminKey);
        return json_({ ok: true, rows: readRows_(RESPONSES_SHEET), keys: readRows_(KEYS_SHEET), status: getStatus_() });
      case 'setTopicOpen':
        checkAdmin_(body.adminKey);
        return json_({ ok: true, status: setTopicOpen_(body.topic, body.isOpen === true) });
      case 'generateKeys':
        checkAdmin_(body.adminKey);
        return json_({ ok: true, keys: generateKeys_(body.topic, body.topicName, body.count) });
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
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const status = getStatus_();
    status[topic] = isOpen;
    PropertiesService.getScriptProperties().setProperty(STATUS_PROP, JSON.stringify(status));
    return status;
  } finally {
    lock.releaseLock();
  }
}

// ---------- Passkeys ----------
function normalizeKey_(k) {
  return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function findKey_(key) {
  const sheet = getSheet_(KEYS_SHEET, KEY_HEADERS);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (normalizeKey_(values[i][0]) === key) {
      return { row: i + 1, key: values[i][0], topic: values[i][1], topicName: values[i][2], usedAt: values[i][4] };
    }
  }
  return null;
}

function checkKey_(raw) {
  const key = normalizeKey_(raw);
  const found = key.length >= 6 ? findKey_(key) : null;
  if (!found) {
    Utilities.sleep(800); // slow down guessing
    throw new Error('Invalid passkey. Please check it and try again.');
  }
  if (found.usedAt) throw new Error('This passkey has already been used.');
  if (getStatus_()[found.topic] !== true) throw new Error('The evaluation for "' + found.topicName + '" is closed right now.');
  return { key: found.key, topic: found.topic, topicName: found.topicName };
}

function generateKeys_(topic, topicName, count) {
  topic = cleanId_(topic);
  if (!topic) throw new Error('Missing topic');
  count = Math.max(1, Math.min(MAX_BATCH, Number(count) || 0));
  topicName = String(topicName || topic).slice(0, 200);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
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
      rows.push([k, topic, topicName, now, '', '']);
      out.push({ key: k, topic: topic, topicName: topicName, createdAt: now.toISOString(), usedAt: '', usedBy: '' });
    }
    const start = sheet.getLastRow() + 1;
    sheet.getRange(start, 1, rows.length, 1).setNumberFormat('@'); // keep keys as plain text
    sheet.getRange(start, 1, rows.length, KEY_HEADERS.length).setValues(rows);
    return out;
  } finally {
    lock.releaseLock();
  }
}

function randomKey_() {
  // 6 characters from a 32-letter alphabet, using UUID randomness
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random());
  let s = '';
  for (let i = 0; i < 6; i++) s += KEY_ALPHABET.charAt((bytes[i] + 256) % 32);
  return s.slice(0, 3) + '-' + s.slice(3);
}

// ---------- Submit ----------
function submit_(rawKey, data) {
  const key = normalizeKey_(rawKey);
  const name = String(data.name || '').trim();
  if (name.length < 2) throw new Error('Name is required');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const found = key.length >= 6 ? findKey_(key) : null;
    if (!found) throw new Error('Invalid passkey.');
    if (found.usedAt) throw new Error('This passkey has already been used.');
    if (getStatus_()[found.topic] !== true) throw new Error('The evaluation for "' + found.topicName + '" is closed right now.');

    // Topic and key always come from the Keys sheet, never from the browser.
    const record = { timestamp: new Date(), topic: found.topic, topicName: found.topicName, passkey: found.key };
    Object.keys(data).slice(0, 50).forEach(function (k) {
      const col = String(k).replace(/[^\w]/g, '').slice(0, 40);
      if (!col || record.hasOwnProperty(col)) return;
      let v = data[k];
      if (typeof v !== 'number') v = sanitize_(String(v == null ? '' : v).slice(0, 1000));
      record[col] = v;
    });

    appendRecord_(getSheet_(RESPONSES_SHEET), record);

    // Use up the key
    const keys = getSheet_(KEYS_SHEET, KEY_HEADERS);
    keys.getRange(found.row, 5, 1, 2).setValues([[record.timestamp, sanitize_(name)]]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function appendRecord_(sheet, record) {
  const lastCol = sheet.getLastColumn();
  const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
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
