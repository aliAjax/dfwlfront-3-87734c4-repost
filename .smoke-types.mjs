// src/types.ts
var TASK_STATUSES = ["\u5F85\u6D3E", "\u6267\u884C\u4E2D", "\u5DF2\u5B8C\u6210", "\u5DF2\u53D6\u6D88"];
var STATUS_FLOW = {
  \u5F85\u6D3E: ["\u6267\u884C\u4E2D", "\u5DF2\u53D6\u6D88"],
  \u6267\u884C\u4E2D: ["\u5DF2\u5B8C\u6210", "\u5DF2\u53D6\u6D88"],
  \u5DF2\u5B8C\u6210: [],
  \u5DF2\u53D6\u6D88: []
};
var ZONES = ["\u57CE\u5317", "\u57CE\u4E1C", "\u57CE\u5357"];
var OCCUPYING_STATUSES = ["\u5F85\u6D3E", "\u6267\u884C\u4E2D"];
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return toDateString(date);
}
function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
export {
  OCCUPYING_STATUSES,
  STATUS_FLOW,
  TASK_STATUSES,
  ZONES,
  overlaps,
  shiftDate,
  toDateString,
  uid
};
