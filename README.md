# Post-Event Evaluation & E-Certificate

A Google Forms–style attendance and evaluation site you can host free on **GitHub Pages**.

**Landing page:** choose **Participant** or **Organizer** (admin).

**Participant flow** (the same **passkey** is used twice):
- **Before the demo:** passkey → Attendance (name, email, college, year level) → **Pre-evaluation** (5 topic-specific statements + 1 optional) → "see you after the demo".
- **After the demo:** same passkey → **Post-evaluation** (10 rating questions + 2 optional) → the e-certificate for that passkey's **topic** downloads automatically.

Pre-evaluation statements are set per topic in `PRE_QUESTIONS` in `config.js`.

**Organizer flow:** `admin.html` → log in → pick a **topic** from the dropdown → switch its evaluation **open/closed**, then generate, print or download its **passkeys** → view the attendee tally, rating averages and responses → download as CSV (opens in Excel) or JSON.

### How topics and passkeys work
- Topics are listed in `TOPICS` in `config.js`. Each topic has its own certificate image, its own passkeys and its own **open/closed switch**. Closing one topic doesn't affect the others.
- A passkey looks like `K7M-Q3P`. It belongs to one topic and is used **twice**: once for the pre-evaluation, then once for the post-evaluation, after which it's finished.
- Passkeys for a closed topic are rejected until you open the topic again.
- Typical booth flow: generate keys → **Print unused keys** (prints cut-out slips) → hand one slip to each participant after the demo.

Responses are stored in a **Google Sheet** that only you own. The website never holds the data or the admin password.

```
index.html          landing + attendee flow
admin.html          admin dashboard (password protected)
config.js           ← EDIT THIS: SCRIPT_URL, colleges, year levels, questions
js/                 app logic (api, app, admin, certificate)
css/style.css       scrapbook theme
apps-script/Code.gs backend code that goes into Google Apps Script (not used by GitHub Pages)
```

---

## 1. Try it locally first (demo mode)

With XAMPP running, open http://localhost/Evaluation%20Attendance/

`SCRIPT_URL` in `config.js` is empty, so the site runs in **demo mode**. Responses are saved only in your browser, and the admin password is `admin`.

## 2. Set up the Google Sheet backend (≈5 minutes)

1. Go to https://sheets.new and create a new Google Sheet, e.g. "Evaluation Responses".
2. In the sheet, open **Extensions → Apps Script**.
3. Delete the sample code, paste in everything from `apps-script/Code.gs`, and click **Save**.
4. Click **⚙ Project Settings**. Under **Script Properties**, click **Add script property**:
   - Property: `ADMIN_KEY`
   - Value: your admin password (make it strong)
5. Click **Deploy → New deployment**. Click the gear and choose **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and approve the permissions. Choose your account, then **Advanced → Go to (project) → Allow**.
6. Copy the **Web app URL** (it ends in `/exec`) and paste it into `config.js`:
   ```js
   SCRIPT_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
   ```
7. Open `admin.html`, log in, pick a topic, switch its evaluation **open**, and generate passkeys. The sheet gets three tabs: **PreEvaluation**, **Responses** (post-evaluation) and **Keys**.

> If you change `Code.gs` later, go to **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. This keeps the same URL.

## 3. Publish on GitHub Pages

1. Create a new GitHub repository, e.g. `booth-evaluation`.
2. Upload all of the files in this folder.
3. Go to **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
4. After about a minute your site will be live:
   - Attendees: `https://<your-username>.github.io/booth-evaluation/`
   - Admin: `https://<your-username>.github.io/booth-evaluation/admin.html` (also linked from the landing page)

Tip: turn the attendee link into a QR code and display it at the booth.

## 4. Topics and certificates

Edit `TOPICS` in `config.js`:

```js
{ id: "utp", name: "UTP Cable Termination", certificate: "assets/certificates/utp-cable-termination.png", nameY: 111 },
```

- `id`: a short code. Don't change it after you've generated keys for the topic.
- `certificate`: that topic's Canva design exported as PNG with the name area left blank. Download it from Canva at the largest size for a sharp print. Use `""` to fall back to the built-in design.
- `nameY`: how far down the page the name is printed, in mm (0 = top, 210 = bottom).

## 5. Customize (`config.js`)

- **Header:** `EVENT` (title, date, venue, organizer)
- **Colleges:** `COLLEGES` (dropdown). **Year levels:** `YEAR_LEVELS`
- **Questions:** `QUESTIONS` (rated 5–1) and `FEEDBACK` (optional written answers)
- **Built-in certificate** (topics without an image): `CERT_LOGO_LEFT`, `CERT_LOGO_RIGHT`, `CERT_EVENT_TYPE`, `CERT_SIGNATORIES`

## Security notes

- Google checks the admin password on its servers. It's never in the website code.
- The repository is public but contains no responses or passwords. Anyone can see `SCRIPT_URL`, but it only lets people *submit* responses (and only with an unused passkey for an open topic), not read them.
