// Draws the e-certificate on a canvas (so it can use web fonts and logos),
// then wraps it in an A4 landscape PDF with jsPDF.
(function () {
  const cfg = window.APP_CONFIG;
  const PX_W = 2480, PX_H = 1754;   // ~210 dpi
  const W = 297, H = 210;           // drawing units = millimetres
  const C = {
    ink: "#111111",
    text: "#2b2b2b",
    purpleDeep: "#2a0b5c",
    purple: "#5b1fb0",
    violet: "#8e3ce0",
    bar: "#111111"
  };
  const SERIF = '"Bodoni Moda", "Didot", "Times New Roman", serif';
  const SANS = '"DM Sans", "Segoe UI", Arial, sans-serif';
  const SCRIPT = '"Great Vibes", "Segoe Script", cursive';

  async function loadFonts() {
    if (!document.fonts) return;
    await Promise.all([
      `500 40px "Bodoni Moda"`, `400 40px "DM Sans"`, `700 40px "DM Sans"`, `40px "Great Vibes"`
    ].map((f) => document.fonts.load(f).catch(() => null)));
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load image: " + src));
      img.src = src;
    });
  }

  async function tryImage(src) {
    if (!src) return null;
    try { return await loadImage(src); } catch (e) { return null; }
  }

  function fitFont(ctx, text, weight, family, maxSize, minSize, maxW) {
    let size = maxSize;
    do { ctx.font = `${weight} ${size}px ${family}`; size -= 0.5; }
    while (ctx.measureText(text).width > maxW && size > minSize);
  }

  // ---------- Background ----------
  function background(ctx) {
    ctx.fillStyle = "#fdfdfe";
    ctx.fillRect(0, 0, W, H);

    // faint diamond pattern
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.PI / 4);
    const s = 34;
    for (let i = -8; i <= 8; i++) {
      for (let j = -8; j <= 8; j++) {
        if ((i + j) % 2 === 0) continue;
        ctx.fillStyle = (i * 3 + j) % 3 === 0 ? "rgba(90,90,120,0.035)" : "rgba(90,90,120,0.02)";
        ctx.fillRect(i * s, j * s, s, s);
      }
    }
    ctx.restore();
  }

  // One corner ornament, drawn for the top-left and mirrored for the others.
  function corner(ctx) {
    const grad = ctx.createLinearGradient(0, 0, 70, 70);
    grad.addColorStop(0, C.purpleDeep);
    grad.addColorStop(1, C.purple);

    // dark base triangle
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(66, 0); ctx.lineTo(0, 62);
    ctx.closePath(); ctx.fill();

    // bright stripe along the diagonal
    const g2 = ctx.createLinearGradient(66, 0, 0, 62);
    g2.addColorStop(0, C.violet);
    g2.addColorStop(1, C.purple);
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.moveTo(52, 0); ctx.lineTo(66, 0); ctx.lineTo(0, 62); ctx.lineTo(0, 49);
    ctx.closePath(); ctx.fill();

    // thin outer accent band
    ctx.fillStyle = "rgba(142,60,224,0.55)";
    ctx.beginPath();
    ctx.moveTo(70, 0); ctx.lineTo(80, 0); ctx.lineTo(0, 75); ctx.lineTo(0, 66);
    ctx.closePath(); ctx.fill();

    // white dot grid
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 6; c++) {
        ctx.beginPath();
        ctx.arc(8 + c * 3.4, 7 + r * 3.4, 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function corners(ctx) {
    [[1, 1, 0, 0], [-1, 1, W, 0], [1, -1, 0, H], [-1, -1, W, H]].forEach(([sx, sy, tx, ty]) => {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(sx * 0.8, sy * 0.8);
      corner(ctx);
      ctx.restore();
    });
    // black side bars
    ctx.fillStyle = C.bar;
    ctx.fillRect(3, 62, 2.4, 90);
    ctx.fillRect(W - 5.4, 58, 2.4, 92);
  }

  // ---------- Ornament divider ----------
  function divider(ctx, y) {
    const cx = W / 2;
    ctx.save();
    ctx.strokeStyle = C.ink;
    ctx.fillStyle = C.ink;
    // tapered lines
    [[-1], [1]].forEach(([d]) => {
      ctx.beginPath();
      ctx.moveTo(cx + d * 9, y - 0.35);
      ctx.lineTo(cx + d * 52, y);
      ctx.lineTo(cx + d * 9, y + 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath(); ctx.arc(cx + d * 7.6, y, 0.8, 0, Math.PI * 2); ctx.fill();
    });
    // knot
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.ellipse(cx - 2.6, y, 2.6, 1.5, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 2.6, y, 2.6, 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, y - 2.2); ctx.lineTo(cx + 1.2, y); ctx.lineTo(cx, y + 2.2); ctx.lineTo(cx - 1.2, y);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------- Rich text (bold runs) with centered word wrap ----------
  function richParagraph(ctx, runs, cx, y, maxW, size, lineH) {
    const font = (bold) => `${bold ? 700 : 400} ${size}px ${SANS}`;
    const words = [];
    runs.forEach((r) => {
      r.text.split(/(\s+)/).forEach((t) => { if (t) words.push({ t, bold: r.bold }); });
    });
    const lines = [[]];
    let width = 0;
    words.forEach((w) => {
      ctx.font = font(w.bold);
      const ww = ctx.measureText(w.t).width;
      const isSpace = /^\s+$/.test(w.t);
      if (!isSpace && width + ww > maxW && lines[lines.length - 1].length) {
        lines.push([]);
        width = 0;
      }
      if (isSpace && !lines[lines.length - 1].length) return;
      lines[lines.length - 1].push({ t: w.t, bold: w.bold, w: ww });
      width += ww;
    });
    ctx.textAlign = "left";
    lines.forEach((line) => {
      while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop();
      const total = line.reduce((a, w) => a + w.w, 0);
      let x = cx - total / 2;
      line.forEach((w) => {
        ctx.font = font(w.bold);
        ctx.fillText(w.t, x, y);
        x += w.w;
      });
      y += lineH;
    });
    return y;
  }

  // ---------- Default design ----------
  async function drawDefault(ctx, name, topic) {
    const signatories = (cfg.CERT_SIGNATORIES || []).filter((p) => p && p.name).slice(0, 2);
    const [logoL, logoR, ...sigs] = await Promise.all([
      tryImage(cfg.CERT_LOGO_LEFT), tryImage(cfg.CERT_LOGO_RIGHT),
      ...signatories.map((p) => tryImage(p.signature))
    ]);
    const s = { title: topic.name, date: (cfg.EVENT || {}).date, eventType: cfg.CERT_EVENT_TYPE };

    background(ctx);
    corners(ctx);

    // logos
    const LOGO = 38;
    if (logoL) ctx.drawImage(logoL, 49 - LOGO / 2, 49 - LOGO / 2, LOGO, LOGO);
    if (logoR) ctx.drawImage(logoR, W - 49 - LOGO / 2, 49 - LOGO / 2, LOGO, LOGO);

    ctx.fillStyle = C.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // CERTIFICATE
    fitFont(ctx, "CERTIFICATE", 500, SERIF, 23, 16, 146);
    ctx.fillText("CERTIFICATE", W / 2, 52);

    // OF PARTICIPATION
    ctx.font = `700 6.4px ${SANS}`;
    ctx.fillText("OF PARTICIPATION", W / 2, 64);

    divider(ctx, 73.5);

    // presented to
    ctx.fillStyle = C.text;
    ctx.font = `400 5px ${SANS}`;
    ctx.fillText("This certificate is proudly presented to:", W / 2, 86);

    // name
    ctx.fillStyle = C.ink;
    fitFont(ctx, name, 400, SCRIPT, 19, 10, 225);
    ctx.fillText(name, W / 2, 111);

    // body
    const title = (s.title || "").toUpperCase();
    const date = API.formatDate(s.date);
    const kind = (s.eventType || "event").trim();
    const runs = [
      { text: "for actively participating in the " },
      { text: title, bold: true },
      { text: date ? ` held on ${date}, ` : ", " },
      { text: `in recognition of their active participation and valuable contribution to the ${kind}.` }
    ];
    ctx.fillStyle = C.text;
    richParagraph(ctx, runs, W / 2, 128, 225, 4.6, 7.4);

    // given this ...
    const dayOf = API.formatDayOf(s.date);
    if (dayOf || date) {
      ctx.textAlign = "center";
      ctx.font = `400 4.6px ${SANS}`;
      ctx.fillText(dayOf ? `Given this ${dayOf}.` : `Given on ${date}.`, W / 2, 157);
    }

    // signatories
    const signers = signatories.map((p, i) => ({ name: p.name, title: p.title, sig: sigs[i] }));
    const xs = signers.length === 2 ? [100, 197] : [W / 2];
    signers.forEach((p, i) => {
      const x = xs[i];
      if (p.sig) {
        const h = 14, w = Math.min(50, (p.sig.width / p.sig.height) * h);
        ctx.drawImage(p.sig, x - w / 2, 164, w, h);
      }
      ctx.strokeStyle = "rgba(17,17,17,0.6)";
      ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.moveTo(x - 30, 179); ctx.lineTo(x + 30, 179); ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = C.ink;
      fitFont(ctx, p.name, 700, SANS, 3.8, 2.8, 70);
      ctx.fillText(p.name, x, 184);
      if (p.title) {
        ctx.fillStyle = C.text;
        fitFont(ctx, p.title, 400, SANS, 3.5, 2.6, 80);
        ctx.fillText(p.title, x, 189);
      }
    });
  }

  async function drawTemplate(ctx, name, topic) {
    const img = await loadImage(topic.certificate);
    ctx.drawImage(img, 0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = cfg.CERT_NAME_COLOR || C.ink;
    fitFont(ctx, name, 400, SCRIPT, 19, 10, 225);
    ctx.fillText(name, W / 2, topic.nameY || 105);
  }

  window.Certificate = {
    // topic: an entry from APP_CONFIG.TOPICS (uses its certificate image if set)
    async render(name, topic) {
      topic = topic || {};
      await loadFonts();
      const canvas = document.createElement("canvas");
      canvas.width = PX_W;
      canvas.height = PX_H;
      const ctx = canvas.getContext("2d");
      ctx.scale(PX_W / W, PX_H / H);
      if (topic.certificate) await drawTemplate(ctx, name, topic);
      else await drawDefault(ctx, name, topic);
      return canvas;
    },

    savePdf(canvas, name) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, W, H);
      const safe = name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") || "Participant";
      doc.save(`Certificate_${safe}.pdf`);
    }
  };
})();
