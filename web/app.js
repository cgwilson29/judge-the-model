// Starter Node app: three plain sections that read results/ and show correct numbers.
//
// Run locally:  bash run_app.sh   (your agent writes it; it runs node web/server.mjs, then open http://localhost:8766/)
// Build each section up to its required minimum (see the activity website). Keep every number
// coming from m11.js, and label every table and plot "Training" or "Test".
import * as m11 from "./m11.js";

const TRAIN = "Training";
const TEST = "Test";
const SECTIONS = ["1. Beyond Accuracy", "2. A Threshold for the Job", "3. Training vs. Test"];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const int = (n) => n.toLocaleString("en-US");
const state = { section: SECTIONS[0], key: "readmission", model: "logreg", thr: 0.5, cardMode: "single", cardModel: "logreg" };
const cache = {};

// ---------------- LCARS audio (Web Audio API) ----------------
let audioCtx = null;
let audioReady = false;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function chirp(freq = 880, type = "square", gain = 0.08, duration = 0.06) {
  if (!audioReady) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function initAudio() {
  ensureAudio();
  audioReady = true;
}

function createWarpStreaks() {
  const container = document.querySelector(".warp-streaks");
  if (!container) return;
  const count = 10;
  for (let i = 0; i < count; i++) {
    const streak = document.createElement("div");
    streak.className = "warp-streak";
    const angle = (i / count) * 360;
    streak.style.setProperty("--angle", angle + "deg");
    // Stagger start times and vary durations
    const duration = 1.2 + Math.random() * 1.0;
    const delay = Math.random() * 2.0;
    streak.style.animation = `warp-streak ${duration.toFixed(2)}s linear ${delay.toFixed(2)}s infinite`;
    // Vary color: mostly blue, occasional orange
    streak.style.background = i % 4 === 0
      ? "linear-gradient(to bottom, transparent, #ff9900, transparent)"
      : "linear-gradient(to bottom, transparent, #5cb8ff, transparent)";
    // Vary length slightly
    streak.style.height = (120 + Math.random() * 80) + "vw";
    container.appendChild(streak);
  }
}

// ---------------- LCARS canvas widget (Canvas 2D animation) ----------------
const canvas = $("lcars-canvas");
const ctx = canvas && canvas.getContext("2d");
let sweepAngle = 0;
let blips = [];
let animFrame = null;

function initBlips() {
  blips = [];
  for (let i = 0; i < 6; i++) {
    blips.push({
      x: Math.random(),
      y: Math.random(),
      life: Math.random(),
      speed: 0.02 + Math.random() * 0.03,
      color: i % 2 === 0 ? "#ff9900" : "#5cb8ff"
    });
  }
}

function drawLcarsWidget() {
  if (!canvas || !ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2 - 8;
  const r = Math.min(cx, cy) - 6;

  ctx.clearRect(0, 0, w, h);

  // Outer ring
  ctx.strokeStyle = "#ff9900";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshairs
  ctx.strokeStyle = "#222222";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
  ctx.stroke();

  // Rotating sweep line
  sweepAngle += 0.06;
  const sx = cx + Math.cos(sweepAngle) * r;
  const sy = cy + Math.sin(sweepAngle) * r;
  ctx.strokeStyle = "#5cb8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(sx, sy);
  ctx.stroke();

  // Sweep glow
  ctx.strokeStyle = "rgba(92, 184, 255, 0.35)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(sx, sy);
  ctx.stroke();

  // Blips
  blips.forEach((b) => {
    b.life += b.speed;
    if (b.life > 1) b.life = 0;
    const bx = cx + Math.cos(b.life * Math.PI * 2) * (r * 0.72);
    const by = cy + Math.sin(b.life * Math.PI * 2) * (r * 0.72);
    ctx.fillStyle = b.color;
    ctx.globalAlpha = 1 - b.life;
    ctx.beginPath();
    ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // Digital readout: current threshold
  ctx.fillStyle = "#5cb8ff";
  ctx.font = "bold 11px 'Courier New', Courier, monospace";
  ctx.textAlign = "center";
  ctx.fillText(`THR ${state.thr.toFixed(2)}`, cx, cy + r + 14);

  animFrame = requestAnimationFrame(drawLcarsWidget);
}

function startLcarsAnimation() {
  if (!canvas || !ctx) return;
  initBlips();
  cancelAnimationFrame(animFrame);
  drawLcarsWidget();
}

function stopLcarsAnimation() {
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = null;
}

async function load(name) {
  if (!(name in cache)) {
    // ../results/ is next to web/ on GitHub Pages; web/server.mjs serves it at the same address.
    const r = await fetch(`../results/${name}.json`);
    cache[name] = r.ok ? await r.json() : null;
  }
  return cache[name];
}

const caption = (text) => `<p class="caption">${esc(text)}</p>`;

// rows: array of objects; the first column is the row header.
function table(rows) {
  const cols = Object.keys(rows[0]);
  const head = cols.map((c) => `<th scope="col">${esc(c)}</th>`).join("");
  const body = rows.map((r) => "<tr>" + cols.map((c, i) => i === 0 ? `<th scope="row">${esc(r[c])}</th>`
    : `<td class="num">${esc(r[c])}</td>`).join("") + "</tr>").join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// ---- small card: one model's confusion matrix + metrics at one threshold ----
function modelCard(model, label, part, p, y, thr) {
  const c = m11.confusion(p, y, thr);
  const m = m11.metrics(c);
  const labelLine = `<div class="card-head"><strong>${esc(m11.MODEL_LABEL[model])}</strong> <span class="badge">${esc(label)} · threshold ${thr.toFixed(2)}</span></div>`;
  const groups = `
    <div class="card-grid">
      <div class="card-cell"><div class="stat-big">${int(c.tp)}</div><div class="stat-label">correctly flagged positives</div></div>
      <div class="card-cell"><div class="stat-big">${int(c.fn)}</div><div class="stat-label">missed positives</div></div>
      <div class="card-cell"><div class="stat-big">${int(c.fp)}</div><div class="stat-label">false alarms</div></div>
      <div class="card-cell"><div class="stat-big">${int(c.tn)}</div><div class="stat-label">correctly cleared negatives</div></div>
    </div>
  `;
  const metrics = `
    <table>
      <tr><th scope="row">Accuracy</th><td class="num">${m11.fmtPct(m.accuracy)}</td></tr>
      <tr><th scope="row">Sensitivity / TPR</th><td class="num">${m11.fmtPct(m.sensitivity)}</td></tr>
      <tr><th scope="row">Specificity</th><td class="num">${m11.fmtPct(m.specificity)}</td></tr>
      <tr><th scope="row">False positive rate</th><td class="num">${m11.fmtPct(m.fpr)}</td></tr>
      <tr><th scope="row">Precision</th><td class="num">${m11.fmtPct(m.precision)}</td></tr>
      <tr><th scope="row">F1</th><td class="num">${m11.fmtPct(m.f1)}</td></tr>
    </table>
  `;
  return `<div class="card">${labelLine}${groups}${metrics}</div>`;
}

async function recommendations() {
  const recs = (await load("decisions"))?.recommendations || {};
  const any = Object.values(recs).some(Boolean);
  $("recommendations").insertAdjacentHTML("beforeend", any
    ? m11.DATASETS.map((k) => `<p><strong>${esc(m11.DATASET_LABEL[k])}:</strong> ${recs[k] ? esc(recs[k]) : "<em>not written yet</em>"}</p>`).join("")
    : caption("No recommendations yet: fill in Recommendations in DECISIONS.md, run python -m analysis, then commit and push."));
}

// ---- 1. Beyond Accuracy (one card at a time, with an all-at-once view) ----
function positiveClassNote(key) {
  return key === "readmission"
    ? "Positive class: readmitted within 30 days of discharge (target == 1)."
    : "Positive class: doctor diagnosis or HbA1c ≥ 6.5% (target == 1).";
}

function beyondAccuracyControls(res) {
  const models = m11.MODELS.filter((m) => m in res.models);
  const options = models.map((m) => `<option value="${m}" ${m === state.cardModel ? "selected" : ""}>${esc(m11.MODEL_LABEL[m])}</option>`).join("");
  const toggleLabel = state.cardMode === "single" ? "Show all models at once" : "Show one model at a time";
  return `
    <div class="slider" style="margin-bottom: 12px; gap: 10px;">
      <label>Model <select id="card-model">${options}</select></label>
      <button id="card-toggle" type="button" class="lcars-button">${esc(toggleLabel)}</button>
    </div>
  `;
}

function beyondAccuracy(res) {
  const models = m11.MODELS.filter((m) => m in res.models);
  const parts = [];
  if (state.cardMode === "all") {
    for (const model of models) {
      const [p, y] = m11.preds(res, model, "test");
      parts.push(modelCard(model, TEST, "test", p, y, 0.5));
    }
  } else {
    const model = state.cardModel;
    if (model in res.models) {
      const [p, y] = m11.preds(res, model, "test");
      parts.push(modelCard(model, TEST, "test", p, y, 0.5));
    }
  }
  return `
    ${caption(`${TEST} · every model at threshold 0.50. ${positiveClassNote(state.key)}`)}
    ${beyondAccuracyControls(res)}
    <div class="cards">${parts.join("")}</div>
    <p class="caption">Accuracy alone misleads when the positive class is rare: a model that clears everyone looks accurate but misses every positive. Read each card as four groups of patients, not one percentage.</p>
  `;
}

// ---- 2. A Threshold for the Job (ROC curve + live slider) ----
function svgROC(roc, w, h) {
  const pad = 36;
  const plotW = w - 2 * pad, plotH = h - 2 * pad;
  const scaleX = (x) => pad + x * plotW;
  const scaleY = (y) => pad + (1 - y) * plotH;
  let d = `M${scaleX(0)},${scaleY(0)}`;
  for (let i = 0; i < roc.fpr.length; i++) d += ` L${scaleX(roc.fpr[i])},${scaleY(roc.tpr[i])}`;
  return `<svg viewBox="0 0 ${w} ${h}" class="roc-svg" role="img" aria-label="ROC curve">
    <line x1="${scaleX(0)}" y1="${scaleY(0)}" x2="${scaleX(1)}" y2="${scaleY(1)}" class="diag" />
    <polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${roc.fpr.map((f, i) => `${scaleX(f)},${scaleY(roc.tpr[i])}`).join(" ")}" />
    <circle cx="${scaleX(0)}" cy="${scaleY(0)}" r="4" fill="var(--accent)" />
    <circle cx="${scaleX(1)}" cy="${scaleY(1)}" r="4" fill="var(--accent)" />
    <g class="axis">
      <line x1="${pad}" y1="${scaleY(0)}" x2="${pad}" y2="${scaleY(1)}" />
      <line x1="${scaleX(0)}" y1="${scaleY(1)}" x2="${scaleX(1)}" y2="${scaleY(1)}" />
      <text x="${pad - 8}" y="${scaleY(0) + 4}" text-anchor="end">0</text>
      <text x="${pad - 8}" y="${scaleY(1) + 4}" text-anchor="end">1</text>
      <text x="${scaleX(0) - 4}" y="${pad - 8}" text-anchor="end">0</text>
      <text x="${scaleX(1) - 4}" y="${pad - 8}" text-anchor="end">1</text>
    </g>
  </svg>`;
}

function buildThresholdTable(thr, m, m05, delta) {
  return `
    <table>
      <tr><th></th><th>At ${thr.toFixed(2)}</th><th>At 0.50</th><th>Change vs 0.50</th></tr>
      <tr><th scope="row">Sensitivity / TPR</th><td class="num">${m11.fmtPct(m.sensitivity)}</td><td class="num">${m11.fmtPct(m05.sensitivity)}</td><td class="num">${delta(m.sensitivity, m05.sensitivity)}</td></tr>
      <tr><th scope="row">Specificity</th><td class="num">${m11.fmtPct(m.specificity)}</td><td class="num">${m11.fmtPct(m05.specificity)}</td><td class="num">${delta(m.specificity, m05.specificity)}</td></tr>
      <tr><th scope="row">Precision</th><td class="num">${m11.fmtPct(m.precision)}</td><td class="num">${m11.fmtPct(m05.precision)}</td><td class="num">${delta(m.precision, m05.precision)}</td></tr>
      <tr><th scope="row">False positive rate</th><td class="num">${m11.fmtPct(m.fpr)}</td><td class="num">${m11.fmtPct(m05.fpr)}</td><td class="num">${delta(m.fpr, m05.fpr)}</td></tr>
      <tr><th scope="row">Flagged per 100</th><td class="num">${m.flagged_per_100 !== null ? m.flagged_per_100.toFixed(1) : "undefined"}</td><td class="num">${m05.flagged_per_100 !== null ? m05.flagged_per_100.toFixed(1) : "undefined"}</td><td class="num">—</td></tr>
    </table>
  `;
}

function thresholdSlider(thr) {
  return `
    <div class="slider">
      <label>Threshold <output id="thr-out">${thr.toFixed(2)}</output></label>
      <input type="range" id="thr-slider" min="0" max="1" step="0.01" value="${thr}">
    </div>
  `;
}

// Lightweight update of threshold-dependent parts (slider element stays intact for fluid dragging).
function updateThresholdDisplay(res, model) {
  const [p, y] = m11.preds(res, model, "test");
  const thr = state.thr;
  const roc = m11.roc(p, y);
  const c = m11.confusion(p, y, thr);
  const m = m11.metrics(c);
  const c05 = m11.confusion(p, y, 0.5);
  const m05 = m11.metrics(c05);
  const delta = (a, b) => {
    if (a === null || b === null) return "";
    const d = (a - b) * 100;
    return d >= 0 ? `+${d.toFixed(1)}%` : `${d.toFixed(1)}%`;
  };
  $("thr-out").textContent = thr.toFixed(2);
  $("thr-slider").value = thr;
  $("thr-roc").innerHTML = svgROC(roc, 700, 460);
  $("thr-metrics").innerHTML = buildThresholdTable(thr, m, m05, delta);
}

function thresholdPage(res, model) {
  const [p, y] = m11.preds(res, model, "test");
  const roc = m11.roc(p, y);
  const auroc = m11.auroc(p, y);
  const thr = state.thr;
  const c = m11.confusion(p, y, thr);
  const m = m11.metrics(c);
  const c05 = m11.confusion(p, y, 0.5);
  const m05 = m11.metrics(c05);
  const delta = (a, b) => {
    if (a === null || b === null) return "";
    const d = (a - b) * 100;
    return d >= 0 ? `+${d.toFixed(1)}%` : `${d.toFixed(1)}%`;
  };
  return `
    <div class="box" style="margin-bottom: 16px;">
      ${caption(`${TEST} · ${m11.MODEL_LABEL[model]} — AUROC ${m11.fmtNum(auroc)} (ranking, not accuracy)`)}
      <div id="thr-roc" style="max-height: 340px; overflow: auto;">${svgROC(roc, 560, 320)}</div>
      <p class="caption">ROC curve: each point is a threshold. The diagonal is chance guessing. AUROC is the area under it.</p>
    </div>
    ${thresholdSlider(thr)}
    <div id="thr-metrics">${buildThresholdTable(thr, m, m05, delta)}</div>
    <p class="caption">The threshold is a decision separate from the model. Moving it trades missed positives against false alarms — there is no single "best" threshold for every job.</p>
  `;
}

function threshold(res, model) {
  return thresholdPage(res, model);
}

// ---- 3. Training vs. Test (paired bar chart + table, single page) ----
function svgBarChart(summary, w, h) {
  const pad = { t: 30, r: 30, b: 50, l: 60 };
  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
  const models = Object.keys(summary);
  const n = models.length;
  const barW = plotW / n / 2.4;
  const maxV = 1.0;
  const scaleX = (i) => pad.l + (i + 0.3) * (plotW / n);
  const scaleY = (v) => pad.t + (1 - v / maxV) * plotH;
  let bars = "";
  let labels = "";
  let gaps = "";
  models.forEach((m, i) => {
    const v = summary[m];
    const trainX = scaleX(i) - barW / 2 - 4;
    const testX = scaleX(i) + barW / 2 + 4;
    const trainH = plotH - (scaleY(v.train) - pad.t);
    const testH = plotH - (scaleY(v.test) - pad.t);
    bars += `<rect x="${trainX}" y="${scaleY(v.train)}" width="${barW}" height="${trainH}" fill="var(--train)" class="bar-train" />`;
    bars += `<rect x="${testX}" y="${scaleY(v.test)}" width="${barW}" height="${testH}" fill="var(--test)" class="bar-test" />`;
    labels += `<text x="${scaleX(i)}" y="${pad.t + plotH + 20}" text-anchor="middle" font-size="11">${esc(m11.MODEL_LABEL[m])}</text>`;
    const gap = v.gap !== null ? v.gap : 0;
    if (gap > 0.15) {
      gaps += `<text x="${scaleX(i)}" y="${scaleY(Math.max(v.train, v.test)) - 6}" text-anchor="middle" fill="var(--pos)" font-size="11" font-weight="700">⚠</text>`;
    }
  });
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  let yaxis = "";
  ticks.forEach((t) => {
    const y = scaleY(t);
    yaxis += `<line x1="${pad.l - 6}" x2="${pad.l}" y1="${y}" y2="${y}" class="axis" />`;
    yaxis += `<text x="${pad.l - 10}" y="${y + 4}" text-anchor="end" font-size="11">${t}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="bar-svg" role="img" aria-label="Training vs test AUROC by model">
    <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + plotH}" class="axis" />
    <line x1="${pad.l}" y1="${pad.t + plotH}" x2="${pad.l + plotW}" y2="${pad.t + plotH}" class="axis" />
    ${yaxis}
    ${bars}
    ${labels}
    ${gaps}
  </svg>`;
}

function trainVsTest(res) {
  const s = m11.aurocSummary(res);
  const parts = [];
  for (const model of m11.MODELS) {
    if (!(model in s)) continue;
    const v = s[model];
    const gap = v.gap !== null ? (v.gap * 100).toFixed(1) : "undefined";
    const flag = v.gap !== null && v.gap > 0.15 ? `⇔ potential training memorization (gap ${gap} pts)` : "—";
    parts.push(`<tr><th scope="row">${esc(m11.MODEL_LABEL[model])}</th><td class="num">${m11.fmtNum(v.train)}</td><td class="num">${m11.fmtNum(v.test)}</td><td class="num">${gap} pts</td><td class="flag-cell">${flag === "—" ? "—" : `<span class="flash-warn">${esc(flag)}</span>`}</td></tr>`);
  }
  return `
    ${caption(`${TRAIN} vs ${TEST} · AUROC on rows the model learned from, and on rows it never saw. A training result is never a test result.`)}
    <div class="box" style="margin-bottom: 16px; max-height: 320px; overflow: auto;">${svgBarChart(s, 640, 280)}</div>
    <table>
      <tr><th>Model</th><th>${TRAIN}</th><th>${TEST}</th><th>Gap</th><th>Flag</th></tr>
      ${parts.join("")}
    </table>
    <p class="caption">Training flatters every model. A large gap (e.g. random forest on readmission) means the model memorised its training patients and will not generalise to new ones.</p>
  `;
}

const RENDER = Object.fromEntries(SECTIONS.map((s, i) => [s, [beyondAccuracy, threshold, trainVsTest][i]]));

// ---- page ----------------------------------------------------------------------
async function render() {
  const { section, key, model } = state;
  const res = await load(key);
  $("section-title").textContent = section;
  const content = $("content");
  if (!res) {
    $("context").textContent = "";
    content.innerHTML = `<p class="warn">No results for ${esc(m11.DATASET_LABEL[key])} yet: run <code>python -m analysis</code>, then commit and push <code>results/</code>.</p>`;
    return;
  }
  $("context").textContent = `${m11.DATASET_LABEL[key]}: ${int(res.train.n)} training rows (${int(res.train.n_pos)} positive), `
    + `${int(res.test.n)} test rows (${int(res.test.n_pos)} positive).`;
  [...$("model").options].forEach((o) => { o.text = m11.MODEL_LABEL[o.value] + (o.value in res.models ? "" : " (not trained yet)"); });
  content.innerHTML = model in res.models ? RENDER[section](res, model)
    : `<p class="warn">${esc(m11.MODEL_LABEL[model])} has no results yet: run <code>python -m analysis</code>, then commit and push <code>results/</code>.</p>`;

  // Section 1 controls: card model dropdown + all/one toggle
  if (section === SECTIONS[0]) {
    const cardModel = $("card-model");
    const cardToggle = $("card-toggle");
    if (cardModel && cardToggle) {
      cardModel.onchange = (e) => { state.cardModel = e.target.value; chirp(660, "square", 0.05, 0.05); render(); };
      cardToggle.onclick = () => {
        state.cardMode = state.cardMode === "single" ? "all" : "single";
        chirp(880, "square", 0.08, 0.08);
        render();
      };
    }
  }

  // Section 2: wire up the slider once; on input, update only the threshold-dependent
  // parts (metrics table + ROC chart) so the slider element itself is never destroyed
  // mid-drag, keeping the drag fluid.
  if (section === SECTIONS[1]) {
    const slider = $("thr-slider");
    const out = $("thr-out");
    if (slider && out) {
      slider.oninput = (e) => {
        state.thr = Number(e.target.value);
        updateThresholdDisplay(res, model);
      };
      slider.onchange = () => chirp(1000, "square", 0.06, 0.06);
    }
  }
}

function init() {
  const sectionSelect = $("section-select");
  sectionSelect.innerHTML = SECTIONS.map((s, i) => `<option value="${i}" ${i === SECTIONS.indexOf(state.section) ? "selected" : ""}>${esc(s)}</option>`).join("");
  $("dataset").innerHTML = m11.DATASETS.map((k) => `<option value="${k}">${esc(m11.DATASET_LABEL[k])}</option>`).join("");
  $("model").innerHTML = m11.MODELS.map((m) => `<option value="${m}">${esc(m11.MODEL_LABEL[m])}</option>`).join("");
  $("dataset").value = state.key;
  $("model").value = state.model;

  // Section dropdown
  sectionSelect.addEventListener("change", (e) => {
    state.section = SECTIONS[Number(e.target.value)];
    chirp(700, "square", 0.05, 0.05);
    render();
  });
  $("dataset").addEventListener("change", (e) => {
    state.key = e.target.value;
    chirp(750, "square", 0.05, 0.05);
    render();
  });
  $("model").addEventListener("change", (e) => {
    state.model = e.target.value;
    chirp(800, "square", 0.05, 0.05);
    render();
  });

  // Initialize audio on first user interaction
  document.body.addEventListener("click", initAudio, { once: true });
  document.body.addEventListener("keydown", initAudio, { once: true });

  // Start LCARS canvas animation
  startLcarsAnimation();

  // Generate warp streaks
  createWarpStreaks();

  recommendations();
  render();
}

init();
