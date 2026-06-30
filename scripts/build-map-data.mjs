import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const geoPath = path.join(os.tmpdir(), "uk-constituencies-2024.geojson");
const hexPath = path.join(os.tmpdir(), "uk-constituencies-2024.hexjson");
const geojson = JSON.parse(fs.readFileSync(geoPath, "utf8"));
const hexjson = JSON.parse(fs.readFileSync(hexPath, "utf8"));

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function simplify(points, tolerance = 0.008) {
  if (points.length <= 4) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let furthest = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = distanceToSegment(points[i], first, last);
    if (distance > furthest) { furthest = distance; index = i; }
  }
  if (furthest <= tolerance) return [first, last];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

function project([longitude, latitude]) {
  return [((longitude + 8.8) * 55).toFixed(1), ((61 - latitude) * 83).toFixed(1)];
}

function ringPath(ring) {
  const points = simplify(ring).map(project);
  if (points.length < 3) return "";
  return `M${points.map((point) => point.join(",")).join("L")}Z`;
}

function geometryPath(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((polygon) => polygon.map(ringPath)).join("");
}

const geo = geojson.features.map((feature) => ({
  id: feature.properties.PCON24CD,
  d: geometryPath(feature.geometry),
}));

const hex = Object.entries(hexjson.hexes).map(([id, value]) => ({ id, q: value.q, r: value.r }));
const payload = { geo, hex };
const output = `window.CONSTITUENCY_MAP_DATA=${JSON.stringify(payload)};\n`;
fs.writeFileSync(path.resolve("map-data.js"), output);
console.log(`Generated ${geo.length} geographic paths and ${hex.length} hex positions (${output.length} bytes).`);
