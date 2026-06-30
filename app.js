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

const EXTRA_PARTIES = {
  Ind: { key: "Ind", name: "Independent", short: "Ind", color: "#777b78" },
  Spk: { key: "Spk", name: "Speaker", short: "Speaker", color: "#6f7773" },
  TUV: { key: "TUV", name: "Traditional Unionist Voice", short: "TUV", color: "#315c83" },
};

const $ = (selector) => document.querySelector(selector);
const formatNumber = new Intl.NumberFormat("en-GB");
const formatCompact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
let rows = [];
let exploreMode = "area";
let mapMode = "geo";
let selectedMapId = "";
let activeComparisonChoices = [];

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
function resultClassification(row) {
  const gap = share(row.Majority, row["Valid votes"]);
  if (gap < 2) return { label: "Extremely marginal win", className: "is-extreme-marginal", gap };
  if (gap < 10) return { label: "Marginal win", className: "is-marginal", gap };
  if (gap < 20) return { label: "Semi-safe win", className: "is-semi-safe", gap };
  if (gap <= 40) return { label: "Majority win", className: "is-majority", gap };
  return { label: "Extreme majority win", className: "is-extreme-majority", gap };
}
function partyInfo(key) { return PARTIES.find((party) => party.key === key) || EXTRA_PARTIES[key] || { key, name: key || "Other", short: key || "Other", color: "#8b8e89" }; }
function partyVotes(row, key) {
  if (PARTIES.some((party) => party.key === key && party.key !== "All other candidates")) return row[key];
  return row["Of which other winner"] || row["All other candidates"];
}

function normaliseData(data) {
  const numeric = ["Electorate", "Valid votes", "Invalid votes", "Majority", "Of which other winner", ...PARTIES.map((party) => party.key)];
  return data.map((item) => {
    const output = { ...item };
    numeric.forEach((key) => { output[key] = toNumber(output[key]); });
    return output;
  });
}

function areaOptions(includeUK = true, includeConstituencies = false) {
  const countries = [...new Set(rows.map((row) => row["Country name"]))].sort();
  const regions = [...new Set(rows.map((row) => row["Region name"]))].sort();
  let html = includeUK ? '<option value="UK">United Kingdom</option>' : "";
  html += '<optgroup label="Nations">' + countries.map((name) => `<option value="country:${name}">${name}</option>`).join("") + "</optgroup>";
  html += '<optgroup label="Regions">' + regions.map((name) => `<option value="region:${name}">${name}</option>`).join("") + "</optgroup>";
  if (includeConstituencies) {
    html += '<optgroup label="Constituencies">' + [...rows].sort((a, b) => a["Constituency name"].localeCompare(b["Constituency name"]))
      .map((row) => `<option value="constituency:${row["ONS ID"]}">${row["Constituency name"]}</option>`).join("") + "</optgroup>";
  }
  return html;
}

function filterByArea(area) {
  if (!area || area === "UK") return rows;
  const [type, name] = area.split(":");
  if (type === "constituency") return rows.filter((row) => row["ONS ID"] === name);
  return rows.filter((row) => row[type === "country" ? "Country name" : "Region name"] === name);
}

function areaName(area) {
  if (area === "UK") return "United Kingdom";
  const [type, value] = area.split(":");
  if (type === "constituency") return rows.find((row) => row["ONS ID"] === value)?.["Constituency name"] || "Constituency";
  return area.split(":").slice(1).join(":");
}

function aggregate(data) {
  const totals = Object.fromEntries(PARTIES.map((party) => [party.key, data.reduce((sum, row) => sum + row[party.key], 0)]));
  const extraTotals = {};
  data.forEach((row) => {
    if (!PARTIES.some((party) => party.key === row["First party"])) extraTotals[row["First party"]] = (extraTotals[row["First party"]] || 0) + row["Of which other winner"];
  });
  const valid = data.reduce((sum, row) => sum + row["Valid votes"], 0);
  const invalid = data.reduce((sum, row) => sum + row["Invalid votes"], 0);
  const electorate = data.reduce((sum, row) => sum + row.Electorate, 0);
  return {
    totals, valid, invalid, electorate, seats: data.length,
    turnout: electorate ? ((valid + invalid) / electorate) * 100 : 0,
    sorted: [
      ...PARTIES.map((party) => ({ ...party, votes: totals[party.key], share: share(totals[party.key], valid) })),
      ...Object.entries(extraTotals).map(([key, votes]) => ({ ...partyInfo(key), votes, share: share(votes, valid) })),
    ].sort((a, b) => b.votes - a.votes),
  };
}

function renderDashboard() {
  const area = $("#area-filter").value;
  const data = filterByArea(area);
  const stats = aggregate(data);
  const local = area.startsWith("constituency:") ? data[0] : null;
  if (local && !PARTIES.some((party) => party.key === local["First party"])) applyOtherWinnerBreakdown(stats, local);
  const leader = local ? { ...partyInfo(local["First party"]), share: share(partyVotes(local, local["First party"]), local["Valid votes"]) } : stats.sorted[0];
  $("#area-title").textContent = areaName(area);
  $("#area-summary").textContent = local
    ? `${local["Region name"]} · ${formatNumber.format(local.Electorate)} registered voters`
    : `${stats.seats} constituencies · ${formatNumber.format(stats.electorate)} registered voters`;
  $("#leader-name").textContent = leader.name;
  $("#leader-share").textContent = `${pct(leader.share)} of the vote`;
  $("#leader-swatch").style.background = leader.color;
  $("#votes-counted").textContent = formatCompact.format(stats.valid);
  $("#votes-counted").title = formatNumber.format(stats.valid);
  $("#turnout").textContent = pct(stats.turnout);
  const resultStat = $("#result-stat");
  resultStat.classList.remove("is-extreme-marginal", "is-marginal", "is-semi-safe", "is-majority", "is-extreme-majority");
  if (local) {
    const classification = resultClassification(local);
    $("#result-stat-label").textContent = "Result";
    $("#seat-count").textContent = classification.label;
    $("#seat-detail").textContent = `${classification.gap.toFixed(1)} more votes in every 100`;
    resultStat.classList.add(classification.className);
  } else {
    $("#result-stat-label").textContent = "Seats";
    $("#seat-count").textContent = stats.seats;
    $("#seat-detail").textContent = "constituencies";
  }
  renderPartyBars(stats);
  renderComposition(stats);
  renderContextPanel(data, local);
  renderSeatChanges(data);
}

function applyOtherWinnerBreakdown(stats, local) {
  const winner = partyInfo(local["First party"]);
  const winnerVotes = local["Of which other winner"];
  const remainingVotes = Math.max(0, local["All other candidates"] - winnerVotes);
  stats.sorted = stats.sorted.filter((party) => party.key !== "All other candidates" && party.key !== winner.key);
  stats.sorted.push({ ...winner, votes: winnerVotes, share: share(winnerVotes, stats.valid) });
  if (remainingVotes) stats.sorted.push({ key: "remaining-other", name: "Other candidates", short: "Other", color: "#b4b6b1", votes: remainingVotes, share: share(remainingVotes, stats.valid) });
  stats.sorted.sort((a, b) => b.votes - a.votes);
}

function renderPartyBars(stats) {
  const visible = chooseDisplayedParties(stats);
  const max = Math.max(...visible.map((party) => party.share), 1);
  $("#party-bars").innerHTML = visible.map((party) => `
    <div class="bar-row" title="${party.name}: ${formatNumber.format(party.votes)} votes">
      <span class="bar-label">${party.name}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(party.share / max) * 100}%;background:${party.color}"></div></div>
      <span class="bar-value">${pct(party.share)}</span>
    </div>`).join("");
  $("#party-bars").setAttribute("aria-label", visible.map((party) => `${party.name} ${pct(party.share)}`).join(", "));
}

function renderComposition(stats) {
  const visible = chooseDisplayedParties(stats);
  $("#composition-bar").innerHTML = visible.map((party) => `<div class="composition-segment" style="width:${party.share}%;background:${party.color}" title="${party.name}: ${pct(party.share)}"></div>`).join("");
  $("#composition-legend").innerHTML = visible.map((party) => `<span class="legend-item"><span class="legend-dot" style="background:${party.color}"></span>${party.short}</span>`).join("");
  $("#composition-bar").setAttribute("aria-label", visible.map((party) => `${party.name} ${pct(party.share)}`).join(", "));
}

function chooseDisplayedParties(stats) {
  const available = stats.sorted.filter((party) => party.votes > 0 && party.key !== "All other candidates" && party.key !== "remaining-other");
  const selected = available.slice(0, 5);
  const selectedVotes = selected.reduce((sum, party) => sum + party.votes, 0);
  const otherVotes = Math.max(0, stats.valid - selectedVotes);
  return [
    ...selected,
    { key: "display-other", name: "Other", short: "Other", color: "#9a9c96", votes: otherVotes, share: share(otherVotes, stats.valid) },
  ];
}

function renderContextPanel(areaRows, local) {
  $("#ranking-control").hidden = Boolean(local);
  $("#ranking-list").hidden = Boolean(local);
  $("#local-result").hidden = !local;
  if (local) {
    const winner = partyInfo(local["First party"]);
    const runnerUp = partyInfo(local["Second party"]);
    const winnerShare = share(partyVotes(local, local["First party"]), local["Valid votes"]);
    const classification = resultClassification(local);
    const changed = local.Result.includes("gain from");
    $("#context-kicker").textContent = changed ? "Seat changed hands" : "Constituency result";
    $("#context-title").textContent = changed ? `Gained from ${partyInfo(local.Result.split(" gain from ")[1]).name}` : `${winner.name} hold`;
    $("#local-result").innerHTML = `
      <div class="local-winner" style="border-color:${winner.color}">
        <span>MP elected</span>
        <strong>${local["Member first name"]} ${local["Member surname"]}</strong>
        <em>${winner.name}</em>
      </div>
      <dl class="local-details">
        <div><dt>Winner's vote share</dt><dd>${pct(winnerShare)}</dd></div>
        <div><dt>Majority</dt><dd>${formatNumber.format(local.Majority)}</dd></div>
        <div><dt>Second party</dt><dd>${runnerUp.name}</dd></div>
      </dl>`;
  } else {
    $("#context-kicker").textContent = "Highest vote shares";
    $("#context-title").textContent = "Constituency ranking";
    renderRanking(areaRows);
  }
}

function renderRanking(areaRows = filterByArea($("#area-filter").value)) {
  const partyKey = $("#ranking-party").value;
  const party = PARTIES.find((item) => item.key === partyKey);
  const ranked = areaRows.map((row) => ({ row, result: share(row[partyKey], row["Valid votes"]) })).sort((a, b) => b.result - a.result).slice(0, 5);
  $("#ranking-list").innerHTML = ranked.map(({ row, result }) => `
    <li class="ranking-item">
      <div class="rank-place"><strong title="${row["Constituency name"]}">${row["Constituency name"]}</strong><span>${row["Region name"]}</span></div>
      <span class="rank-score" style="color:${party.color}">${pct(result)}</span>
    </li>`).join("");
}

function parseChange(row) {
  const match = row.Result.match(/^(.+?) gain from (.+)$/);
  return match ? { winner: match[1], loser: match[2], row } : null;
}

function renderSeatChanges(data) {
  const changes = data.map(parseChange).filter(Boolean);
  const holds = data.length - changes.length;
  const gains = new Map();
  const losses = new Map();
  changes.forEach(({ winner, loser }) => {
    gains.set(winner, (gains.get(winner) || 0) + 1);
    losses.set(loser, (losses.get(loser) || 0) + 1);
  });
  const gainRows = [...gains.entries()].sort((a, b) => b[1] - a[1]);
  const lossRows = [...losses.entries()].sort((a, b) => b[1] - a[1]);
  $("#changes-summary").innerHTML = `
    <article><span>Changed hands</span><strong>${changes.length}</strong></article>
    <article><span>Held by the same party</span><strong>${holds}</strong></article>
    <article><span>Largest number of gains</span><strong>${gainRows.length ? `${partyInfo(gainRows[0][0]).short} · ${gainRows[0][1]}` : "None"}</strong></article>`;
  renderChangeBars("#gains-list", gainRows);
  renderChangeBars("#losses-list", lossRows);
  $("#changes-note").textContent = `${areaName($("#area-filter").value)} · gains are based on the result classification in the source data.`;
}

function renderChangeBars(selector, entries) {
  if (!entries.length) { $(selector).innerHTML = '<p class="empty-state">No seats in this selection changed hands.</p>'; return; }
  const max = entries[0][1];
  $(selector).innerHTML = entries.map(([key, value]) => {
    const party = partyInfo(key);
    return `<div class="change-row"><span>${party.name}</span><div><i style="width:${(value / max) * 100}%;background:${party.color}"></i></div><strong>${value}</strong></div>`;
  }).join("");
}

function comparisonChoices(mode) {
  if (mode === "constituency") {
    return [...rows]
      .sort((a, b) => a["Constituency name"].localeCompare(b["Constituency name"]))
      .map((row) => ({ label: row["Constituency name"], value: `constituency:${row["ONS ID"]}` }));
  }
  const countries = [...new Set(rows.map((row) => row["Country name"]))].sort();
  const regions = [...new Set(rows.map((row) => row["Region name"]))].sort();
  return [
    { label: "United Kingdom", value: "UK" },
    ...countries.map((name) => ({ label: `${name} — nation`, value: `country:${name}` })),
    ...regions.map((name) => ({ label: `${name} — region`, value: `region:${name}` })),
  ];
}

function configureComparisons(mode) {
  activeComparisonChoices = comparisonChoices(mode);
  ["a", "b"].forEach((side) => {
    $(`#compare-${side}`).innerHTML = activeComparisonChoices.map((choice) => `<option value="${choice.value}">${choice.label}</option>`).join("");
    $(`#compare-${side}-options`).innerHTML = activeComparisonChoices.map((choice) => `<option value="${choice.label}"></option>`).join("");
  });
  let first;
  let second;
  if (mode === "constituency") {
    first = activeComparisonChoices.find((choice) => choice.label === "Bristol Central") || activeComparisonChoices[0];
    second = activeComparisonChoices.find((choice) => choice.label === "Aberdeen North") || activeComparisonChoices[1];
    $("#compare-title").textContent = "Compare two constituencies";
    $("#compare-note").textContent = "Search for any two constituencies.";
  } else {
    first = activeComparisonChoices.find((choice) => choice.value === "region:London") || activeComparisonChoices[0];
    second = activeComparisonChoices.find((choice) => choice.value === "country:Scotland") || activeComparisonChoices[1];
    $("#compare-title").textContent = "Compare two UK areas";
    $("#compare-note").textContent = "Search the UK, nations and regions.";
  }
  setComparisonChoice("a", first);
  setComparisonChoice("b", second);
  renderComparison();
}

function setComparisonChoice(side, choice) {
  $(`#compare-${side}`).value = choice.value;
  $(`#compare-${side}-search`).value = choice.label;
  $(`#compare-${side}-search`).setCustomValidity("");
}

function syncComparisonSearch(side) {
  const input = $(`#compare-${side}-search`);
  const query = input.value.trim().toLocaleLowerCase("en-GB");
  const choice = activeComparisonChoices.find((item) => item.label.toLocaleLowerCase("en-GB") === query)
    || activeComparisonChoices.find((item) => item.label.toLocaleLowerCase("en-GB").includes(query));
  if (!choice) {
    input.setCustomValidity(exploreMode === "constituency" ? "Choose a constituency from the suggestions." : "Choose a UK area from the suggestions.");
    input.reportValidity();
    return;
  }
  setComparisonChoice(side, choice);
  renderComparison();
}

function renderComparison() {
  const aValue = $("#compare-a").value;
  const bValue = $("#compare-b").value;
  const a = aggregate(filterByArea(aValue));
  const b = aggregate(filterByArea(bValue));
  const combined = comparisonBreakdown(a, b);
  const max = Math.max(...combined.flatMap((party) => [party.a, party.b]), 1);
  $("#compare-chart").innerHTML = combined.map((party) => {
    const delta = party.a - party.b;
    const higherPlace = delta >= 0 ? areaName(aValue) : areaName(bValue);
    const gapText = Math.abs(delta) < .05 ? "Same share" : `${higherPlace}: ${Math.abs(delta).toFixed(1)} more votes in every 100`;
    return `<div class="compare-row">
      <span class="compare-party">${party.name}</span>
      <div class="compare-series">
        <div class="compare-line"><span class="series-place" title="${areaName(aValue)}">${areaName(aValue)}</span><div class="compare-track"><div class="compare-fill" style="width:${(party.a / max) * 100}%;background:${party.color}"></div></div><strong>${pct(party.a)}</strong></div>
        <div class="compare-line"><span class="series-place" title="${areaName(bValue)}">${areaName(bValue)}</span><div class="compare-track"><div class="compare-fill compare-fill--second" style="width:${(party.b / max) * 100}%;background:${party.color}"></div></div><strong>${pct(party.b)}</strong></div>
      </div>
      <span class="compare-delta">${gapText}</span>
    </div>`;
  }).join("");
  $("#compare-chart").setAttribute("aria-label", `${areaName(aValue)} compared with ${areaName(bValue)}. ${combined.map((party) => `${party.name}: ${pct(party.a)} versus ${pct(party.b)}`).join(", ")}`);
}

function comparisonBreakdown(a, b) {
  const byKey = new Map();
  [...a.sorted, ...b.sorted].forEach((party) => {
    if (party.key !== "All other candidates" && party.key !== "remaining-other") byKey.set(party.key, party);
  });
  const entryFor = (key) => {
    const party = byKey.get(key) || partyInfo(key);
    const aParty = a.sorted.find((item) => item.key === key);
    const bParty = b.sorted.find((item) => item.key === key);
    return { ...party, aVotes: aParty?.votes || 0, bVotes: bParty?.votes || 0, a: share(aParty?.votes || 0, a.valid), b: share(bParty?.votes || 0, b.valid) };
  };
  const available = [...byKey.keys()].map(entryFor).filter((party) => party.a > 0 || party.b > 0).sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  const selected = available.slice(0, 5);
  return [
    ...selected,
    {
      key: "display-other", name: "Other", short: "Other", color: "#9a9c96",
      a: Math.max(0, 100 - selected.reduce((sum, party) => sum + party.a, 0)),
      b: Math.max(0, 100 - selected.reduce((sum, party) => sum + party.b, 0)),
    },
  ];
}

function findConstituency(query) {
  const cleaned = query.trim().toLocaleLowerCase("en-GB");
  if (!cleaned) return null;
  return rows.find((row) => row["Constituency name"].toLocaleLowerCase("en-GB") === cleaned)
    || rows.find((row) => row["Constituency name"].toLocaleLowerCase("en-GB").includes(cleaned));
}

function selectConstituency(row, { scroll = true } = {}) {
  const value = `constituency:${row["ONS ID"]}`;
  let option = [...$("#area-filter").options].find((item) => item.value.startsWith("constituency:"));
  if (!option) { option = document.createElement("option"); $("#area-filter").prepend(option); }
  option.value = value;
  option.textContent = `Constituency: ${row["Constituency name"]}`;
  $("#area-filter").value = value;
  $("#constituency-search").value = row["Constituency name"];
  $("#map-search").value = row["Constituency name"];
  $("#constituency-status").textContent = `Showing ${row["Constituency name"]}, ${row["Region name"]}.`;
  selectedMapId = row["ONS ID"];
  setExploreMode("constituency", false);
  renderDashboard();
  renderMap();
  if (scroll) $("#area-title").scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleConstituencySearch(event) {
  event.preventDefault();
  const match = findConstituency($("#constituency-search").value);
  if (!match) { $("#constituency-status").textContent = "No constituency matched. Try a shorter place name."; return; }
  selectConstituency(match);
}

function handleMapSearch(event) {
  event.preventDefault();
  const match = findConstituency($("#map-search").value);
  if (!match) { $("#map-note").textContent = "No constituency matched that search."; return; }
  selectConstituency(match, { scroll: false });
  $("#map-note").textContent = `Selected: ${match["Constituency name"]}. Its full result is shown above.`;
}

function setExploreMode(mode, reset = true) {
  const changed = exploreMode !== mode;
  exploreMode = mode;
  $("[data-explore-mode=\"area\"]").classList.toggle("is-active", mode === "area");
  $("[data-explore-mode=\"constituency\"]").classList.toggle("is-active", mode === "constituency");
  $("#area-control").hidden = mode !== "area";
  $("#constituency-control").hidden = mode !== "constituency";
  $("#map-section").hidden = mode !== "constituency";
  $("#changes-section").hidden = mode === "constituency";
  if (mode === "area" && reset && $("#area-filter").value.startsWith("constituency:")) {
    $("#area-filter").value = "UK";
    renderDashboard();
  }
  if (changed) configureComparisons(mode);
  if (mode === "constituency") $("#constituency-search").focus();
}

function hexPoints(cx, cy, radius) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 30);
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
}

function renderMap() {
  const data = window.CONSTITUENCY_MAP_DATA;
  if (!data) { $("#election-map").innerHTML = '<p class="empty-state">Map layout data is unavailable.</p>'; return; }
  let shapes;
  let viewBox;
  if (mapMode === "geo") {
    viewBox = "0 0 610 940";
    shapes = data.geo.map(({ id, d }) => ({ id, markup: `<path d="${d}" fill-rule="evenodd"></path>` }));
  } else {
    const positioned = data.hex.map((seat) => ({
      ...seat,
      rawX: Math.sqrt(3) * 10 * (seat.q + .5 * (Math.abs(seat.r) % 2)),
      rawY: 15 * seat.r,
    }));
    const minX = Math.min(...positioned.map((seat) => seat.rawX));
    const minY = Math.min(...positioned.map((seat) => seat.rawY));
    const maxX = Math.max(...positioned.map((seat) => seat.rawX));
    const maxY = Math.max(...positioned.map((seat) => seat.rawY));
    viewBox = `0 0 ${maxX - minX + 24} ${maxY - minY + 24}`;
    shapes = positioned.map((seat) => ({ id: seat.id, markup: `<polygon points="${hexPoints(seat.rawX - minX + 12, seat.rawY - minY + 12, 9.3)}"></polygon>` }));
  }
  const rowById = new Map(rows.map((row) => [row["ONS ID"], row]));
  $("#election-map").innerHTML = `<svg viewBox="${viewBox}" role="img" aria-label="UK constituencies coloured by winning party">${shapes.map(({ id, markup }) => {
    const row = rowById.get(id);
    if (!row) return "";
    const party = partyInfo(row["First party"]);
    return markup.replace("></", ` data-seat="${id}" class="map-seat${id === selectedMapId ? " is-selected" : ""}" style="fill:${party.color}"></`);
  }).join("")}</svg>`;
  $("#election-map").querySelectorAll(".map-seat").forEach((shape) => {
    shape.addEventListener("pointerenter", showMapTooltip);
    shape.addEventListener("pointermove", moveMapTooltip);
    shape.addEventListener("pointerleave", hideMapTooltip);
    shape.addEventListener("click", () => selectConstituency(rowById.get(shape.dataset.seat)));
  });
  renderMapLegend();
}

function showMapTooltip(event) {
  const row = rows.find((item) => item["ONS ID"] === event.currentTarget.dataset.seat);
  const party = partyInfo(row["First party"]);
  const classification = resultClassification(row);
  $("#map-tooltip").innerHTML = `<strong>${row["Constituency name"]}</strong><span>${row["Member first name"]} ${row["Member surname"]} · ${party.name}</span><span>${pct(share(partyVotes(row, row["First party"]), row["Valid votes"]))} vote share · ${formatNumber.format(row.Majority)} majority</span><span>${classification.label} · ${classification.gap.toFixed(1)} more votes in every 100 than second place</span>`;
  $("#map-tooltip").hidden = false;
  moveMapTooltip(event);
}

function moveMapTooltip(event) {
  const card = $(".map-card").getBoundingClientRect();
  const tooltip = $("#map-tooltip");
  tooltip.style.left = `${Math.min(event.clientX - card.left + 14, card.width - 255)}px`;
  tooltip.style.top = `${Math.max(8, event.clientY - card.top + 14)}px`;
}

function hideMapTooltip() { $("#map-tooltip").hidden = true; }

function renderMapLegend() {
  const counts = new Map();
  rows.forEach((row) => counts.set(row["First party"], (counts.get(row["First party"]) || 0) + 1));
  $("#map-legend").innerHTML = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => {
    const party = partyInfo(key);
    return `<span><i style="background:${party.color}"></i>${party.short} <b>${count}</b></span>`;
  }).join("");
}

function initialiseControls() {
  $("#area-filter").innerHTML = areaOptions();
  $("#ranking-party").innerHTML = PARTIES.map((party) => `<option value="${party.key}">${party.name}</option>`).join("");
  $("#constituency-options").innerHTML = [...rows].sort((a, b) => a["Constituency name"].localeCompare(b["Constituency name"])).map((row) => `<option value="${row["Constituency name"]}"></option>`).join("");
  $("#area-filter").addEventListener("change", renderDashboard);
  $("#ranking-party").addEventListener("change", () => renderRanking());
  ["a", "b"].forEach((side) => {
    const input = $(`#compare-${side}-search`);
    input.addEventListener("input", () => input.setCustomValidity(""));
    input.addEventListener("change", () => syncComparisonSearch(side));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); syncComparisonSearch(side); }
    });
    $(`#compare-${side}-clear`).addEventListener("click", () => {
      input.value = "";
      input.setCustomValidity("");
      input.focus();
    });
  });
  $("#constituency-form").addEventListener("submit", handleConstituencySearch);
  $("#map-search-form").addEventListener("submit", handleMapSearch);
  document.querySelectorAll("[data-explore-mode]").forEach((button) => button.addEventListener("click", () => setExploreMode(button.dataset.exploreMode)));
  document.querySelectorAll("[data-map-mode]").forEach((button) => button.addEventListener("click", () => {
    mapMode = button.dataset.mapMode;
    document.querySelectorAll("[data-map-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
    $("#map-note").textContent = mapMode === "geo"
      ? "Geographic boundaries show the actual area of each constituency. Select a seat to open its result."
      : "Each hexagon represents one constituency, so every seat has equal visual weight. Select a hexagon to open its result.";
    renderMap();
  }));
  configureComparisons("area");
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
    renderMap();
    $("#loading").hidden = true;
  } catch (error) {
    console.error(error);
    $("#loading").hidden = true;
    $("#error").hidden = false;
  }
}

init();
