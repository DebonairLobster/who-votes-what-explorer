const DATA_FILE = "HoC-GE2024-results-by-constituency.csv";

const PARTIES = [
  { key: "Lab", name: "Labour", short: "Lab", color: "#df3e4f" },
  { key: "Con", name: "Conservative", short: "Con", color: "#2585c7" },
  { key: "RUK", name: "Reform UK", short: "Reform", color: "#18a6b4" },
  { key: "LD", name: "Liberal Democrat", short: "Lib Dem", color: "#f2a83b" },
  { key: "Green", name: "Green", short: "Green", color: "#48a864" },
  { key: "SNP", name: "SNP", short: "SNP", color: "#e7c82d" },
  { key: "SF", name: "Sinn Féin", short: "SF", color: "#287a4b" },
  { key: "DUP", name: "DUP", short: "DUP", color: "#a74857" },
  { key: "PC", name: "Plaid Cymru", short: "Plaid", color: "#3e8d62" },
  { key: "APNI", name: "Alliance", short: "Alliance", color: "#e9c742" },
  { key: "UUP", name: "UUP", short: "UUP", color: "#5c91bd" },
  { key: "SDLP", name: "SDLP", short: "SDLP", color: "#69b86b" },
  { key: "All other candidates", name: "Other", short: "Other", color: "#9a9c96" },
];

const $ = (selector) => document.querySelector(selector);
const formatNumber = new Intl.NumberFormat("en-GB");
const formatCompact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
let rows = [];

function parseCSV(text) {
  const parsed = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((cell) => cell !== "")) parsed.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); parsed.push(row); }
  const headers = parsed.shift();
  return parsed.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function toNumber(value) { return Number(String(value).replaceAll(",", "")) || 0; }
function share(value, total) { return total ? (value / total) * 100 : 0; }
function pct(value) { return `${value.toFixed(1)}%`; }

function normaliseData(data) {
  const numeric = ["Electorate", "Valid votes", "Invalid votes", "Majority", ...PARTIES.map((party) => party.key)];
  return data.map((item) => {
    const output = { ...item };
    numeric.forEach((key) => { output[key] = toNumber(output[key]); });
    return output;
  });
}

function areaOptions(includeUK = true) {
  const countries = [...new Set(rows.map((row) => row["Country name"]))].sort();
  const regions = [...new Set(rows.map((row) => row["Region name"]))].sort();
  let html = includeUK ? '<option value="UK">United Kingdom</option>' : "";
  html += '<optgroup label="Nations">' + countries.map((name) => `<option value="country:${name}">${name}</option>`).join("") + "</optgroup>";
  html += '<optgroup label="Regions">' + regions.map((name) => `<option value="region:${name}">${name}</option>`).join("") + "</optgroup>";
  return html;
}

function filterByArea(area) {
  if (!area || area === "UK") return rows;
  const [type, name] = area.split(":");
  return rows.filter((row) => row[type === "country" ? "Country name" : "Region name"] === name);
}

function areaName(area) { return area === "UK" ? "United Kingdom" : area.split(":").slice(1).join(":"); }

function aggregate(data) {
  const totals = Object.fromEntries(PARTIES.map((party) => [party.key, data.reduce((sum, row) => sum + row[party.key], 0)]));
  const valid = data.reduce((sum, row) => sum + row["Valid votes"], 0);
  const invalid = data.reduce((sum, row) => sum + row["Invalid votes"], 0);
  const electorate = data.reduce((sum, row) => sum + row.Electorate, 0);
  return {
    totals, valid, invalid, electorate, seats: data.length,
    turnout: electorate ? ((valid + invalid) / electorate) * 100 : 0,
    sorted: PARTIES.map((party) => ({ ...party, votes: totals[party.key], share: share(totals[party.key], valid) })).sort((a, b) => b.votes - a.votes),
  };
}

function renderDashboard() {
  const area = $("#area-filter").value;
  const name = areaName(area);
  const data = filterByArea(area);
  const stats = aggregate(data);
  const leader = stats.sorted[0];
  $("#area-title").textContent = name;
  $("#area-summary").textContent = `${stats.seats} constituencies · ${formatNumber.format(stats.electorate)} registered voters`;
  $("#leader-name").textContent = leader.name;
  $("#leader-share").textContent = `${pct(leader.share)} of the vote`;
  $("#leader-swatch").style.background = leader.color;
  $("#votes-counted").textContent = formatCompact.format(stats.valid);
  $("#votes-counted").title = formatNumber.format(stats.valid);
  $("#turnout").textContent = pct(stats.turnout);
  $("#seat-count").textContent = stats.seats;
  renderPartyBars(stats);
  renderComposition(stats);
  renderRanking();
}

function renderPartyBars(stats) {
  const visible = stats.sorted.filter((party) => party.votes > 0).slice(0, 8);
  const max = visible[0]?.share || 1;
  $("#party-bars").innerHTML = visible.map((party) => `
    <div class="bar-row" title="${party.name}: ${formatNumber.format(party.votes)} votes">
      <span class="bar-label">${party.name}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(party.share / max) * 100}%;background:${party.color}"></div></div>
      <span class="bar-value">${pct(party.share)}</span>
    </div>`).join("");
  $("#party-bars").setAttribute("aria-label", visible.map((party) => `${party.name} ${pct(party.share)}`).join(", "));
}

function renderComposition(stats) {
  const visible = stats.sorted.filter((party) => party.votes > 0);
  $("#composition-bar").innerHTML = visible.map((party) => `<div class="composition-segment" style="width:${party.share}%;background:${party.color}" title="${party.name}: ${pct(party.share)}"></div>`).join("");
  $("#composition-legend").innerHTML = visible.slice(0, 8).map((party) => `<span class="legend-item"><span class="legend-dot" style="background:${party.color}"></span>${party.short}</span>`).join("");
  $("#composition-bar").setAttribute("aria-label", visible.map((party) => `${party.name} ${pct(party.share)}`).join(", "));
}

function renderRanking() {
  const partyKey = $("#ranking-party").value;
  const areaRows = filterByArea($("#area-filter").value);
  const party = PARTIES.find((item) => item.key === partyKey);
  const ranked = areaRows.map((row) => ({ row, result: share(row[partyKey], row["Valid votes"]) })).sort((a, b) => b.result - a.result).slice(0, 5);
  $("#ranking-list").innerHTML = ranked.map(({ row, result }) => `
    <li class="ranking-item">
      <div class="rank-place"><strong title="${row["Constituency name"]}">${row["Constituency name"]}</strong><span>${row["Region name"]}</span></div>
      <span class="rank-score" style="color:${party.color}">${pct(result)}</span>
    </li>`).join("");
}

function renderComparison() {
  const aValue = $("#compare-a").value;
  const bValue = $("#compare-b").value;
  const a = aggregate(filterByArea(aValue));
  const b = aggregate(filterByArea(bValue));
  const combined = PARTIES.map((party) => ({ ...party, a: share(a.totals[party.key], a.valid), b: share(b.totals[party.key], b.valid) }))
    .filter((party) => party.a > .05 || party.b > .05)
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b)).slice(0, 8);
  const max = Math.max(...combined.flatMap((party) => [party.a, party.b]), 1);
  $("#compare-chart").innerHTML = combined.map((party) => {
    const delta = party.a - party.b;
    return `<div class="compare-row">
      <span class="compare-party">${party.name}</span>
      <div class="compare-bars">
        <div class="compare-values"><span>${pct(party.a)}</span><span>${pct(party.b)}</span></div>
        <div class="compare-track"><div class="compare-fill" style="width:${(party.a / max) * 100}%;background:${party.color}"></div></div>
        <div class="compare-track"><div class="compare-fill" style="width:${(party.b / max) * 100}%;background:${party.color};opacity:.48"></div></div>
      </div>
      <span class="compare-delta">${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts</span>
    </div>`;
  }).join("");
  $("#compare-chart").setAttribute("aria-label", `${areaName(aValue)} compared with ${areaName(bValue)}. ${combined.map((party) => `${party.name}: ${pct(party.a)} versus ${pct(party.b)}`).join(", ")}`);
}

function initialiseControls() {
  $("#area-filter").innerHTML = areaOptions();
  $("#compare-a").innerHTML = areaOptions();
  $("#compare-b").innerHTML = areaOptions();
  $("#compare-a").value = "region:London";
  $("#compare-b").value = "country:Scotland";
  $("#ranking-party").innerHTML = PARTIES.map((party) => `<option value="${party.key}">${party.name}</option>`).join("");
  $("#area-filter").addEventListener("change", renderDashboard);
  $("#ranking-party").addEventListener("change", renderRanking);
  $("#compare-a").addEventListener("change", renderComparison);
  $("#compare-b").addEventListener("change", renderComparison);
}

async function init() {
  try {
    let csvText = window.ELECTION_DATA_CSV;
    if (!csvText) {
      const response = await fetch(DATA_FILE);
      if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
      csvText = await response.text();
    }
    rows = normaliseData(parseCSV(csvText));
    if (rows.length !== 650) console.warn(`Expected 650 constituencies; loaded ${rows.length}.`);
    initialiseControls();
    renderDashboard();
    renderComparison();
    $("#loading").hidden = true;
  } catch (error) {
    console.error(error);
    $("#loading").hidden = true;
    $("#error").hidden = false;
  }
}

init();
