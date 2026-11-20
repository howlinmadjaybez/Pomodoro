import { data } from "./storage.js";

const $ = (id) => document.getElementById(id);
const toast = (message) => window.dispatchEvent(new CustomEvent("app-toast", { detail: message }));

function localDate(timestamp) {
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localTime(timestamp) {
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

// Single-line, semicolon-delimited text, safe to paste into spreadsheets.
function field(value) {
  return String(value ?? "")
    .replace(/[;\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^[=+@-]/, (match) => "'" + match);
}

function buildReport(start, end) {
  const headings = ["Дата", "Початок", "Завершення", "Режим", "Назва", "План (хв)", "Факт (хв)", "Статус"];
  const sessions = data.history
    .filter((item) => {
      const date = localDate(item.endedAt);
      return date && date >= start && date <= end;
    })
    .slice()
    .sort((a, b) => a.endedAt - b.endedAt);

  const rows = sessions.map((item) => [
    localDate(item.endedAt),
    localTime(item.startedAt),
    localTime(item.endedAt),
    item.mode === "work" ? "Робота" : "Перерва",
    item.name,
    Number.isFinite(item.plannedMs) ? (item.plannedMs / 60000).toFixed(2) : "",
    Number.isFinite(item.actualMs) ? (item.actualMs / 60000).toFixed(2) : "",
    item.status === "completed" ? "Завершено" : item.status === "stopped" ? "Зупинено" : item.status
  ]);

  return { count: rows.length, text: [headings, ...rows].map((row) => row.map(field).join(";")).join("\n") };
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return true; } catch { /* fallback */ }
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.append(input);
  input.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { /* unsupported */ }
  input.remove();
  return ok;
}

export function initReports() {
  const dialog = $("reportDialog");
  const start = $("reportStart");
  const end = $("reportEnd");

  $("reportButton").addEventListener("click", () => {
    const today = localDate(Date.now());
    const monthStart = `${today.slice(0, 7)}-01`;
    start.value = monthStart;
    end.value = today;
    dialog.showModal();
  });

  $("reportCancel").addEventListener("click", () => dialog.close());

  $("reportCopy").addEventListener("click", async () => {
    if (!start.value || !end.value) { toast("Обери обидві дати."); return; }
    if (start.value > end.value) { toast("Дата початку не може бути пізнішою за дату кінця."); return; }
    const { count, text } = buildReport(start.value, end.value);
    if (!count) { toast("За обраний період немає завершених або зупинених сесій."); return; }
    const ok = await copyText(text);
    if (ok) { dialog.close(); toast(`Скопійовано ${count} сесій у буфер обміну.`); }
    else toast("Не вдалося скопіювати. Відкрий сайт через localhost або HTTPS і спробуй ще раз.");
  });
}
