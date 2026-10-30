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
const state = { section: SECTIONS[0], key: "readmission", model: "logreg", thr: 0.5 };
const cache = {};

async function load(name) {
  if (!(name in cache)) {
    // ../results/ is next to web/ on GitHub Pages; web/server.mjs serves it at the same address.
    const r = await fetch(`../results/${name}.json`);
    cache[name] = r.ok ? await r.json() : null;
  }
  return cache[name];
}

const caption = (text) => `<p class="caption">${esc(text)}</p>`;
const starterNote = (text) => `<p class="info">Starter display: ${esc(text)} Build this section up to its required minimum.</p>`;

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

// ---- 1. Beyond Accuracy (card-based, every model at 0.50) ----
function positiveClassNote(key) {
  return key === "readmission"
    ? "Positive class: readmitted within 30 days of discharge (target == 1)."
    : "Positive class: doctor diagnosis or HbA1c ≥ 6.5% (target == 1).";
}

function beyondAccuracy(res) {
  const parts = [];
  for (const model of m11.MODELS) {
    if (!(model in res.models)) continue;
    const [p, y] = m11.preds(res, model, "test");
    parts.push(modelCard(model, TEST, "test", p, y, 0.5));
  }
  return `
    ${caption(`${TEST} · every model at threshold 0.50. ${positiveClassNote(state.key)}`)}<div class="cards">${parts.join("")}</div>
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
  const diag = `M${scaleX(0)},${scaleY(0)} L${scaleX(1)},${scaleY(1)}`;
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

function thresholdControl(res, model) {
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
    <div class="cols">
      <div class="box" style="flex: 1">
        ${caption(`${TEST} · ${m11.MODEL_LABEL[model]} — AUROC ${m11.fmtNum(auroc)} (ranking, not accuracy)`)}
        ${svgROC(roc, 520, 360)}
        <p class="caption">ROC curve: each point is a threshold. The diagonal is chance guessing. AUROC is the area under it.</p>
      </div>
      <div class="box" style="flex: 1; display: flex; flex-direction: column">
        <div class="slider">
          <label>Threshold <output id="thr-out">${thr.toFixed(2)}</output></label>
          <input type="range" id="thr-slider" min="0" max="1" step="0.01" value="${thr}">
        </div>
        <table>
          <tr><th></th><th>At ${thr.toFixed(2)}</th><th>At 0.50</th><th>Change vs 0.50</th></tr>
          <tr><th scope="row">Sensitivity / TPR</th><td class="num">${m11.fmtPct(m.sensitivity)}</td><td class="num">${m11.fmtPct(m05.sensitivity)}</td><td class="num">${delta(m.sensitivity, m05.sensitivity)}</td></tr>
          <tr><th scope="row">Specificity</th><td class="num">${m11.fmtPct(m.specificity)}</td><td class="num">${m11.fmtPct(m05.specificity)}</td><td class="num">${delta(m.specificity, m05.specificity)}</td></tr>
          <tr><th scope="row">Precision</th><td class="num">${m11.fmtPct(m.precision)}</td><td class="num">${m11.fmtPct(m05.precision)}</td><td class="num">${delta(m.precision, m05.precision)}</td></tr>
          <tr><th scope="row">False positive rate</th><td class="num">${m11.fmtPct(m.fpr)}</td><td class="num">${m11.fmtPct(m05.fpr)}</td><td class="num">${delta(m.fpr, m05.fpr)}</td></tr>
          <tr><th scope="row">Flagged per 100</th><td class="num">${m.flagged_per_100 !== null ? m.flagged_per_100.toFixed(1) : "undefined"}</td><td class="num">${m05.flagged_per_100 !== null ? m05.flagged_per_100.toFixed(1) : "undefined"}</td><td class="num">—</td></tr>
        </table>
        <p class="caption">The threshold is a decision separate from the model. Moving it trades missed positives against false alarms — there is no single "best" threshold for every job.</p>
      </div>
    </div>
  `;
}

function threshold(res, model) {
  return thresholdControl(res, model);
}

// ---- 3. Training vs. Test (paired bar chart) ----
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
    const flag = gap > 0.15 ? `<text x="${scaleX(i)}" y="${scaleY(Math.max(v.train, v.test)) - 6}" text-anchor="middle" fill="var(--pos)" font-size="10" font-weight="600">⚠ gap ${(gap * 100).toFixed(0)} pts</text>` : "";
    gaps += flag;
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
    const flag = v.gap !== null && v.gap > 0.15 ? " — large gap: may have memorised training patients" : "";
    parts.push(`<tr><th scope="row">${esc(m11.MODEL_LABEL[model])}</th><td class="num">${m11.fmtNum(v.train)}</td><td class="num">${m11.fmtNum(v.test)}</td><td class="num">${gap} pts</td><td>${flag ? `<span class="warn">${esc(flag)}</span>` : "—"}</td></tr>`);
  }
  return `
    ${caption(`${TRAIN} vs ${TEST} · AUROC on rows the model learned from, and on rows it never saw. A training result is never a test result.`)}
    <div class="cols">
      <div class="box" style="flex: 2">${svgBarChart(s, 700, 340)}</div>
      <div class="box" style="flex: 1">
        <table>
          <tr><th>Model</th><th>${TRAIN}</th><th>${TEST}</th><th>Gap</th><th>Flag</th></tr>
          ${parts.join("")}
        </table>
        <p class="caption">Training flatters every model. A large gap (e.g. random forest on readmission) means the model memorised its training patients and will not generalise to new ones.</p>
      </div>
    </div>
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
  // wire up the threshold slider only when on section 2
  if (section === SECTIONS[1]) {
    const slider = $("thr-slider");
    const out = $("thr-out");
    if (slider && out) {
      slider.oninput = (e) => {
        state.thr = Number(e.target.value);
        out.textContent = state.thr.toFixed(2);
        render();
      };
    }
  }
}

function init() {
  $("sections").innerHTML = SECTIONS.map((s, i) => `<label class="radio"><input type="radio" name="section" value="${i}"
    ${s === state.section ? "checked" : ""}>${esc(s)}</label>`).join("");
  $("dataset").innerHTML = m11.DATASETS.map((k) => `<option value="${k}">${esc(m11.DATASET_LABEL[k])}</option>`).join("");
  $("model").innerHTML = m11.MODELS.map((m) => `<option value="${m}">${esc(m11.MODEL_LABEL[m])}</option>`).join("");
  $("dataset").value = state.key;
  $("model").value = state.model;
  $("sections").addEventListener("change", (e) => { state.section = SECTIONS[Number(e.target.value)]; render(); });
  $("dataset").addEventListener("change", (e) => { state.key = e.target.value; render(); });
  $("model").addEventListener("change", (e) => { state.model = e.target.value; render(); });
  recommendations();
  render();
}

init();