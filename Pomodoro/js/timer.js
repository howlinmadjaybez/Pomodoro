
import { data, saveData } from "./storage.js";
import { playSignal, notify } from "./audio.js";

const $ = (id) => document.getElementById(id);

let tickHandle = null;
let wakeLock = null;

const today = () => new Date().toLocaleDateString("en-CA");

const duration = (mode) =>
  (mode === "work" ? data.settings.work : data.settings.rest) * 60000;

function defaultName() {
  const count = data.history.filter(
    (x) =>
      new Date(x.startedAt).toLocaleDateString("en-CA") === today() &&
      x.mode === "work"
  ).length;

  return `Робоча сесія #${count + 1}`;
}

function currentRemaining() {
  const t = data.timer;

  if (!t) return duration("work");

  return t.status === "running"
    ? Math.max(0, t.targetTimestamp - Date.now())
    : Math.max(0, t.remainingMs);
}

function persist() {
  saveData();
  render();
}

function render() {
  const t = data.timer;
  const mode = t?.mode || "work";
  const total = t?.plannedMs || duration(mode);
  const remaining = currentRemaining();
  const elapsed = Math.max(0, total - remaining);
  const pct = total ? Math.min(1, elapsed / total) : 0;

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);

  $("timerDisplay").textContent =
    `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  $("timerSubline").textContent =
    mode === "work" ? "час для фокусу" : "час перепочити";

  $("modeLabel").textContent =
    mode === "work" ? "ЧАС ПРАЦЮВАТИ" : "ЧАС ВІДПОЧИТИ";

  $("progressRing").style.strokeDashoffset = String(622.04 * (1 - pct));
  $("progressBar").style.width = `${pct * 100}%`;
  $("progressLabel").textContent = `${Math.round(pct * 100)}%`;
  $("modeDuration").textContent = `${Math.round(total / 60000)} хв`;

  $("startPause").innerHTML =
    t?.status === "running"
      ? 'Ⅱ <span>Пауза</span>'
      : t?.status === "paused"
        ? '▶ <span>Продовжити</span>'
        : '▶ <span>Пуск</span>';

  $("stopTimer").disabled = !t;

  $("dailyCount").textContent =
    `${data.history.filter(
      (x) =>
        x.mode === "work" &&
        new Date(x.endedAt).toLocaleDateString("en-CA") === today() &&
        x.status === "completed"
    ).length} сесій сьогодні`;

  $("statusText").textContent =
    t?.status === "running"
      ? "Ти в потоці. Продовжуй!"
      : t?.status === "paused"
        ? "Таймер на паузі"
        : t
          ? "Готовий продовжити"
          : "Твій наступний крок — почати";

  document.title =
    `${$("timerDisplay").textContent} · ${mode === "work" ? "Робота" : "Перерва"}`;

  if (!$("taskName").matches(":focus")) {
    $("taskName").value = t?.name || $("taskName").value || defaultName();
  }

  $("historySessions").textContent = data.history.filter(
    (x) => new Date(x.endedAt).toLocaleDateString("en-CA") === today()
  ).length;

  const workTime = data.history
    .filter(
      (x) =>
        new Date(x.endedAt).toLocaleDateString("en-CA") === today() &&
        x.mode === "work"
    )
    .reduce((sum, x) => sum + x.actualMs, 0);

  $("historyTime").textContent = `${Math.round(workTime / 60000)} хв`;

  renderHistory();
}

function renderHistory() {
  const list = $("historyList");

  const items = data.history
    .filter(
      (x) => new Date(x.endedAt).toLocaleDateString("en-CA") === today()
    )
    .slice()
    .reverse();

  list.replaceChildren();

  if (!items.length) {
    const s = document.createElement("span");
    s.className = "history-empty";
    s.textContent =
      "Ще немає завершених сесій. Усе починається з першого фокусу.";
    list.append(s);
    return;
  }

  items.forEach((x) => {
    const el = document.createElement("div");
    el.className = "history-item";

    const strong = document.createElement("strong");
    strong.textContent = x.name;

    const span = document.createElement("span");
    span.textContent =
      `${x.mode === "work" ? "Робота" : "Перерва"} · ${Math.round(x.actualMs / 60000)} хв · ${x.status === "completed" ? "завершено" : "зупинено"}`;

    el.append(strong, span);
    list.append(el);
  });
}

function record(status, endedAt = Date.now()) {
  const t = data.timer;
  if (!t) return;

  const remaining =
    status === "completed"
      ? 0
      : t.status === "running"
        ? Math.max(0, t.targetTimestamp - endedAt)
        : t.remainingMs;

  const actualMs = Math.max(
    0,
    Math.min(t.plannedMs, t.plannedMs - remaining)
  );

  data.history.push({
    id: crypto.randomUUID?.() || String(Date.now()),
    name: t.name,
    mode: t.mode,
    plannedMs: t.plannedMs,
    actualMs,
    startedAt: t.startedAt,
    endedAt,
    status
  });

  if (data.history.length > 500) {
    data.history.shift();
  }
}

function complete() {
  const t = data.timer;
  if (!t) return;

  const ended = t.targetTimestamp;

  record("completed", ended);
  data.timer = null;
  saveData();

  if (data.settings.sound) {
    playSignal();
  }

  notify(
    "Pomodoro завершено",
    "Час змінити режим і трохи перепочити."
  );

  window.dispatchEvent(
    new CustomEvent("app-toast", {
      detail:
        "Сесія завершилась о " +
        new Date(ended).toLocaleTimeString("uk-UA", {
          hour: "2-digit",
          minute: "2-digit"
        })
    })
  );

  if (t.mode === "work" && data.settings.autoBreak) {
    const breakDuration = duration("break");
    const now = Date.now();

    data.timer = {
      status: "running",
      mode: "break",
      plannedMs: breakDuration,
      remainingMs: breakDuration,
      startedAt: now,
      targetTimestamp: now + breakDuration,
      name: "Перерва"
    };

    saveData();
  }

  render();
}

function refresh() {
  if (
    data.timer?.status === "running" &&
    data.timer.targetTimestamp <= Date.now()
  ) {
    complete();
    return;
  }

  render();
}

export function initTimer() {
  if (
    data.timer?.status === "running" &&
    data.timer.targetTimestamp <= Date.now()
  ) {
    complete();
  } else {
    render();
  }

  tickHandle = setInterval(refresh, 250);

  ["visibilitychange", "focus", "pageshow", "online"].forEach((ev) => {
    window.addEventListener(ev, refresh);
  });

  window.addEventListener("beforeunload", () => {
    clearInterval(tickHandle);
  });

  $("startPause").addEventListener("click", async () => {
    const t = data.timer;

    if (t?.status === "running") {
      t.remainingMs = Math.max(0, t.targetTimestamp - Date.now());
      t.status = "paused";
      releaseWakeLock();
    } else {
      const now = Date.now();

      if (t?.status === "paused") {
        t.status = "running";
        t.targetTimestamp = now + t.remainingMs;
      } else {
        const workDuration = duration("work");

        data.timer = {
          status: "running",
          mode: "work",
          plannedMs: workDuration,
          remainingMs: workDuration,
          startedAt: now,
          targetTimestamp: now + workDuration,
          name: $("taskName").value.trim() || defaultName()
        };
      }

      const { unlockAudio, requestNotifications } =
        await import("./audio.js");

      await unlockAudio();

      if (
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        requestNotifications();
      }

      if (data.settings.wakeLock) {
        requestWakeLock();
      }
    }

    persist();
  });

  $("stopTimer").addEventListener("click", () => {
    if (!data.timer) return;

    record("stopped");
    data.timer = null;
    releaseWakeLock();
    persist();
  });

  $("resetTimer").addEventListener("click", () => {
    if (
      data.timer?.status !== "idle" &&
      data.timer &&
      !confirm("Скинути таймер? Поточна сесія не потрапить в історію.")
    ) {
      return;
    }

    data.timer = null;
    releaseWakeLock();
    persist();
  });

  $("taskName").addEventListener("change", () => {
    if (data.timer) {
      data.timer.name = $("taskName").value.trim() || defaultName();
    }

    saveData();
  });
}

export function setDurations(work, rest) {
  data.settings.work = work;
  data.settings.rest = rest;

  if (!data.timer) {
    saveData();
    render();
  } else {
    saveData();
  }
}

export function refreshTimer() {
  render();
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch {
    // Wake Lock недоступний — таймер продовжить працювати без нього.
  }
}

function releaseWakeLock() {
  try {
    wakeLock?.release();
    wakeLock = null;
  } catch {
    // Ігноруємо помилку звільнення Wake Lock.
  }
}
