import assert from "node:assert/strict";

class MockClassList {
  values = new Set();
  toggle(name, force) { if (force) this.values.add(name); else this.values.delete(name); }
  add(name) { this.values.add(name); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
}

class MockElement {
  constructor(id, tag = "div") { this.id = id; this.tag = tag; this.dataset = {}; this.style = {}; this.classList = new MockClassList(); this.listeners = {}; this.options = []; this.value = ""; this.hidden = false; }
  set innerHTML(value) {
    this._innerHTML = value;
    if (this.tag === "select") {
      this.options = [...value.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map((match) => ({ value: match[1], textContent: match[2] }));
      if (this.options.length && !this.options.some((option) => option.value === this.value)) this.value = this.options[0].value;
    }
  }
  get innerHTML() { return this._innerHTML || ""; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type, extra = {}) { (this.listeners[type] || []).forEach((listener) => listener({ preventDefault() {}, key: "", currentTarget: this, ...extra })); }
  prepend(option) { this.options.unshift(option); }
  setAttribute() {}
  querySelectorAll() { return []; }
  focus() {}
  scrollIntoView() {}
  setCustomValidity(value) { this.validationMessage = value; }
  reportValidity() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 900 }; }
}

const selectIds = new Set(["area-filter", "ranking-party", "compare-a", "compare-b"]);
const ids = [
  "area-filter", "ranking-party", "compare-a", "compare-b", "compare-a-search", "compare-b-search", "compare-a-clear", "compare-b-clear", "compare-a-options", "compare-b-options",
  "constituency-options", "constituency-form", "constituency-search", "constituency-clear", "constituency-status", "dashboard-section", "map-search-form", "map-search", "map-search-clear", "map-section",
  "area-control", "constituency-control", "area-title", "area-summary", "leader-name", "leader-share", "leader-swatch", "votes-counted", "turnout",
  "result-stat", "result-stat-label", "seat-count", "seat-detail", "party-bars", "composition-bar", "composition-legend", "ranking-control", "ranking-list", "local-result", "context-kicker", "context-title",
  "changes-section", "changes-summary", "gains-list", "losses-list", "changes-note", "compare-section", "compare-title", "compare-note", "compare-chart", "election-map", "map-tooltip",
  "map-legend", "map-note", "loading", "error", "map-card",
];
const elements = new Map(ids.map((id) => [id, new MockElement(id, selectIds.has(id) ? "select" : "div")]));
elements.get("error").hidden = true;
const modeButtons = ["area", "constituency"].map((mode) => { const button = new MockElement(`mode-${mode}`, "button"); button.dataset.exploreMode = mode; return button; });
const mapButtons = ["geo", "hex"].map((mode) => { const button = new MockElement(`map-${mode}`, "button"); button.dataset.mapMode = mode; return button; });

globalThis.window = globalThis;
globalThis.document = {
  querySelector(selector) {
    if (selector === ".map-card") return elements.get("map-card");
    const modeMatch = selector.match(/^\[data-explore-mode="([^"]+)"\]$/);
    if (modeMatch) return modeButtons.find((button) => button.dataset.exploreMode === modeMatch[1]);
    return elements.get(selector.replace(/^#/, ""));
  },
  querySelectorAll(selector) { if (selector === "[data-explore-mode]") return modeButtons; if (selector === "[data-map-mode]") return mapButtons; return []; },
  createElement(tag) { return new MockElement("created", tag); },
};

await import("../data.js");
await import("../map-data.js");
await import("../app.js");
await new Promise((resolve) => setTimeout(resolve, 20));

assert.equal(elements.get("loading").hidden, true);
assert.equal(elements.get("error").hidden, true);
assert.ok((elements.get("party-bars").innerHTML.match(/class="bar-row"/g) || []).length >= 6);
assert.ok(elements.get("compare-chart").innerHTML.includes("London"));
assert.equal(elements.get("compare-a").options.some((option) => option.value.startsWith("constituency:")), false);
assert.equal((elements.get("election-map").innerHTML.match(/class="map-seat/g) || []).length, 650);

modeButtons[1].dispatch("click");
assert.equal(elements.get("dashboard-section").hidden, true);
assert.equal(elements.get("map-section").hidden, true);
assert.equal(elements.get("compare-section").hidden, true);
assert.equal(elements.get("changes-section").hidden, true);
assert.equal(elements.get("compare-a").options.every((option) => option.value.startsWith("constituency:")), true);
elements.get("compare-a-search").value = "Bristol Central";
elements.get("compare-a-search").dispatch("change");
assert.ok(elements.get("compare-a").value.startsWith("constituency:"));
elements.get("compare-a-clear").dispatch("click");
assert.equal(elements.get("compare-a-search").value, "");
elements.get("constituency-search").value = "Aberdeen North";
elements.get("constituency-form").dispatch("submit");
assert.equal(elements.get("dashboard-section").hidden, false);
assert.equal(elements.get("map-section").hidden, false);
assert.equal(elements.get("compare-section").hidden, false);
assert.equal(elements.get("local-result").hidden, false);
assert.match(elements.get("seat-count").textContent, /win$/);
assert.ok(elements.get("party-bars").innerHTML.includes("SNP"));
assert.ok((elements.get("party-bars").innerHTML.match(/class="bar-row"/g) || []).length >= 6);
elements.get("constituency-clear").dispatch("click");
assert.equal(elements.get("constituency-search").value, "");
elements.get("map-search-clear").dispatch("click");
assert.equal(elements.get("map-search").value, "");

console.log("Dashboard smoke test passed.");
