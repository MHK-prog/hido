"use strict";

const SHOW_STORAGE_KEY = "hido-show.program.v1";
const showRoot = document.getElementById("show-app");
let shownProgram = loadShownProgram();
let showMessage = "";
let showMessageKind = "success";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

function toNumber(value, fallback, min, max) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const normalized = typeof value === "string"
    ? value.replace(/[۰-۹]/g, function (digit) { return String(persian.indexOf(digit)); })
      .replace(/[٠-٩]/g, function (digit) { return String(arabic.indexOf(digit)); })
      .replace(/٫/g, ".").replace(/[٬,]/g, "")
    : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function number(value) {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function safeName(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : "حرکت";
}

function safeMuscles(value) {
  return Array.isArray(value)
    ? value.filter(function (name) { return typeof name === "string" && name.trim(); }).slice(0, 30).map(safeName)
    : [];
}

function cleanWeight(value) {
  if (value === "" || value === null || typeof value === "undefined") return "";
  const parsed = Number(String(value).replace(/[۰-۹]/g, function (digit) { return String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)); })
    .replace(/[٠-٩]/g, function (digit) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)); }).replace(/٫/g, "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : "";
}

function normalizeProgramFile(payload) {
  if (!payload || payload.format !== "hido-program" || payload.schemaVersion !== 1 || !payload.program) {
    throw new Error("این فایل JSON خروجی hido-co نیست یا نسخهٔ آن پشتیبانی نمی‌شود.");
  }
  if (!Array.isArray(payload.program.items)) throw new Error("فهرست حرکت‌های برنامه در فایل پیدا نشد.");
  const items = payload.program.items.map(function (item) {
    if (!item || typeof item !== "object") return null;
    if (item.type === "superset") {
      const movements = Array.isArray(item.movements) ? item.movements.map(function (movement) {
        if (!movement || typeof movement !== "object") return null;
        return {
          name: safeName(movement.name),
          reps: toNumber(movement.reps, 10, 1, 1000),
          weightKg: cleanWeight(movement.weightKg),
          restAfterSeconds: toNumber(movement.restAfterSeconds, 0, 0, 3600),
          primaryMuscles: safeMuscles(movement.primaryMuscles),
          secondaryMuscles: safeMuscles(movement.secondaryMuscles)
        };
      }).filter(Boolean) : [];
      return {
        type: "superset",
        name: safeName(item.name),
        rounds: toNumber(item.rounds, 3, 1, 50),
        restBetweenRoundsSeconds: toNumber(item.restBetweenRoundsSeconds, 90, 0, 3600),
        restMode: ["none", "equal", "individual"].includes(item.restMode) ? item.restMode : "none",
        restBetweenMovementsSeconds: toNumber(item.restBetweenMovementsSeconds, 0, 0, 3600),
        movements: movements
      };
    }
    return {
      type: "single",
      name: safeName(item.name),
      executionType: item.executionType === "time" ? "time" : "reps",
      sets: toNumber(item.sets, 3, 1, 50),
      reps: toNumber(item.reps, 10, 1, 1000),
      durationSeconds: toNumber(item.durationSeconds, 30, 1, 10800),
      weightKg: cleanWeight(item.weightKg),
      restBetweenSetsSeconds: toNumber(item.restBetweenSetsSeconds, 90, 0, 3600),
      primaryMuscles: safeMuscles(item.primaryMuscles),
      secondaryMuscles: safeMuscles(item.secondaryMuscles)
    };
  }).filter(Boolean);
  return {
    format: "hido-program",
    schemaVersion: 1,
    program: {
      name: safeName(payload.program.name),
      restBetweenExercisesSeconds: toNumber(payload.program.restBetweenExercisesSeconds, 120, 0, 3600),
      items: items
    }
  };
}

function loadShownProgram() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SHOW_STORAGE_KEY) || "null");
    return stored ? normalizeProgramFile(stored) : null;
  } catch (error) {
    return null;
  }
}

function renderMuscles(primary, secondary) {
  if (!primary.length && !secondary.length) return "";
  return '<div class="viewer-muscles">' +
    (primary.length ? '<p><strong>اصلی:</strong> ' + primary.map(escapeHtml).join("، ") + '</p>' : "") +
    (secondary.length ? '<p><strong>فرعی:</strong> ' + secondary.map(escapeHtml).join("، ") + '</p>' : "") +
    '</div>';
}

function weightLabel(weight) {
  return weight === "" ? "بدون وزنهٔ افزوده" : number(weight) + " کیلوگرم";
}

function renderSingle(item, index, total, restBetweenExercisesSeconds) {
  const prescription = item.executionType === "reps"
    ? number(item.reps) + " تکرار در هر ست"
    : number(item.durationSeconds) + " ثانیه در هر ست";
  const rest = index < total - 1
    ? '<div class="block-footer"><span>استراحت تا حرکت بعدی</span><strong>' + number(restBetweenExercisesSeconds) + ' ثانیه</strong></div>'
    : "";
  return '<section class="program-block is-single viewer-program-block"><article class="program-movement">' +
    '<div class="program-movement-heading"><span class="pair-marker">حرکت تکی</span><strong>' + escapeHtml(item.name) + '</strong></div>' +
    '<div class="viewer-prescription"><span>' + number(item.sets) + ' ست</span><span>' + prescription + '</span><span>' + weightLabel(item.weightKg) + '</span>' +
    '<span>استراحت بین ست‌ها: ' + number(item.restBetweenSetsSeconds) + ' ثانیه</span></div>' +
    renderMuscles(item.primaryMuscles, item.secondaryMuscles) + '</article>' + rest + '</section>';
}

function supersetRestLabel(item) {
  if (item.restMode === "none") return "بدون استراحت بین حرکت‌ها";
  if (item.restMode === "equal") return "استراحت برابر بین حرکت‌ها: " + number(item.restBetweenMovementsSeconds) + " ثانیه";
  return "استراحت مجزا بین حرکت‌ها";
}

function renderSuperset(item, index, total, restBetweenExercisesSeconds) {
  const movements = item.movements.map(function (movement, movementIndex) {
    const gap = movementIndex < item.movements.length - 1
      ? item.restMode === "equal"
        ? '<p class="viewer-gap">استراحت: ' + number(item.restBetweenMovementsSeconds) + ' ثانیه</p>'
        : item.restMode === "individual"
          ? '<p class="viewer-gap">استراحت: ' + number(movement.restAfterSeconds) + ' ثانیه</p>'
          : ""
      : "";
    return '<li><div class="viewer-superset-movement"><span class="viewer-step">' + number(movementIndex + 1) +
      '</span><div class="viewer-movement-copy"><strong>' + escapeHtml(movement.name) + '</strong>' +
      renderMuscles(movement.primaryMuscles, movement.secondaryMuscles) + '</div><small>' + number(movement.reps) + ' تکرار · ' + escapeHtml(weightLabel(movement.weightKg)) + '</small></div>' + gap + '</li>';
  }).join("");
  const rest = index < total - 1
    ? '<div class="block-footer"><span>استراحت تا حرکت بعدی</span><strong>' + number(restBetweenExercisesSeconds) + ' ثانیه</strong></div>'
    : "";
  return '<section class="program-block is-superset viewer-program-block"><article class="program-movement compound-program-movement">' +
    '<div class="program-movement-heading"><span class="pair-marker">سوپرست</span><strong>' + escapeHtml(item.name) + '</strong></div>' +
    '<div class="compound-summary"><strong>' + number(item.rounds) + ' ست · هر ست یک دور کامل</strong><span>' + escapeHtml(supersetRestLabel(item)) + '</span>' +
    '<span>استراحت بین ست‌های سوپرست: ' + number(item.restBetweenRoundsSeconds) + ' ثانیه</span></div>' +
    (movements ? '<ol class="viewer-superset-list">' + movements + '</ol>' : '<p class="field-help">حرکتی در این سوپرست نیست.</p>') +
    '</article>' + rest + '</section>';
}

function renderProgram() {
  if (!shownProgram) {
    return '<div class="empty-state viewer-empty"><strong>هنوز برنامه‌ای باز نشده</strong><p>فایل JSON برنامه را از مربی بگیر و اینجا انتخاب کن.</p></div>';
  }
  const items = shownProgram.program.items;
  const blocks = items.map(function (item, index) {
    return item.type === "superset"
      ? renderSuperset(item, index, items.length, shownProgram.program.restBetweenExercisesSeconds)
      : renderSingle(item, index, items.length, shownProgram.program.restBetweenExercisesSeconds);
  }).join("");
  return '<section class="page show-program-page"><header class="page-heading"><p class="eyebrow">برنامهٔ مربی</p><h1>' +
    escapeHtml(shownProgram.program.name) + '</h1><p class="page-intro">' + number(items.length) + ' حرکت · استراحت بین حرکت‌ها: ' +
    number(shownProgram.program.restBetweenExercisesSeconds) + ' ثانیه</p></header>' +
    (items.length ? '<div class="program-block-list">' + blocks + '</div>' : '<div class="empty-state"><strong>این برنامه هنوز حرکتی ندارد</strong><p>از مربی نسخهٔ به‌روز برنامه را بگیر.</p></div>') +
    '<p class="show-attribution">فایل برنامه از hido-co دریافت شده است.</p></section>';
}

function render() {
  document.title = shownProgram ? shownProgram.program.name + " | hido-show" : "hido-show | نمایش برنامه";
  showRoot.innerHTML = '<section class="page show-page"><header class="page-heading"><p class="eyebrow">hido-show · نمایشگر برنامه</p>' +
    '<h1>برنامهٔ تمرینی</h1><p class="page-intro">فایل JSON که مربی از hido-co گرفته را انتخاب کن. برنامه در این صفحه فقط نمایش داده می‌شود.</p></header>' +
    '<form class="show-import-form" data-form="load-program-json"><label class="file-dropzone" data-file-dropzone for="show-program-file">' +
    '<input class="file-input" id="show-program-file" name="program-file" type="file" accept=".json,application/json" aria-label="انتخاب فایل JSON برنامه" required>' +
    '<span class="file-picker-icon" aria-hidden="true">↑</span><span class="file-picker-copy"><strong>فایل برنامه را انتخاب کن</strong><small data-file-name>یا فایل JSON را اینجا رها کن</small></span>' +
    '<span class="file-picker-action">انتخاب فایل</span></label><div class="file-picker-actions">' +
    '<button class="primary-button" type="submit" disabled>نمایش برنامه</button>' +
    (shownProgram ? '<button class="small-action" type="button" data-action="clear-program">بستن برنامه</button>' : "") + '</div></form>' +
    (showMessage ? '<p class="show-feedback is-' + escapeHtml(showMessageKind) + '" role="status">' + escapeHtml(showMessage) + '</p>' : "") +
    renderProgram() + '</section>';
}

function readFileText(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result || "")); };
    reader.onerror = function () { reject(new Error("خواندن فایل ناموفق بود.")); };
    reader.readAsText(file, "UTF-8");
  });
}

async function openProgramFile(file) {
  if (!file) return;
  try {
    const rawText = await readFileText(file);
    const payload = JSON.parse(rawText.replace(/^\uFEFF/, ""));
    shownProgram = normalizeProgramFile(payload);
    showMessage = "برنامهٔ «" + shownProgram.program.name + "» باز شد.";
    showMessageKind = "success";
    try {
      window.localStorage.setItem(SHOW_STORAGE_KEY, JSON.stringify(shownProgram));
    } catch (storageError) {
      showMessage += " این مرورگر نتوانست نسخهٔ آفلاین را ذخیره کند.";
      showMessageKind = "warning";
    }
  } catch (error) {
    showMessage = error instanceof SyntaxError ? "محتوای فایل، JSON معتبر نیست." : error.message || "باز کردن فایل ناموفق بود.";
    showMessageKind = "error";
  }
  render();
}

showRoot.addEventListener("change", function (event) {
  const input = event.target.closest('[name="program-file"]');
  if (!input) return;
  const file = input.files && input.files[0];
  const name = showRoot.querySelector("[data-file-name]");
  const submit = showRoot.querySelector('[data-form="load-program-json"] [type="submit"]');
  if (name) name.textContent = file ? file.name : "یا فایل JSON را اینجا رها کن";
  if (submit) submit.disabled = !file;
  const dropzone = input.closest("[data-file-dropzone]");
  if (dropzone) dropzone.classList.toggle("has-file", Boolean(file));
});

showRoot.addEventListener("dragover", function (event) {
  const dropzone = event.target.closest("[data-file-dropzone]");
  if (!dropzone) return;
  event.preventDefault();
  dropzone.classList.add("is-dragging");
});

showRoot.addEventListener("dragleave", function (event) {
  const dropzone = event.target.closest("[data-file-dropzone]");
  if (dropzone && !dropzone.contains(event.relatedTarget)) dropzone.classList.remove("is-dragging");
});

showRoot.addEventListener("drop", function (event) {
  const dropzone = event.target.closest("[data-file-dropzone]");
  if (!dropzone) return;
  event.preventDefault();
  dropzone.classList.remove("is-dragging");
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) openProgramFile(file);
});

showRoot.addEventListener("submit", function (event) {
  const form = event.target.closest('[data-form="load-program-json"]');
  if (!form) return;
  event.preventDefault();
  const input = form.elements.namedItem("program-file");
  const file = input && input.files && input.files[0];
  if (file) openProgramFile(file);
});

showRoot.addEventListener("click", function (event) {
  const button = event.target.closest('[data-action="clear-program"]');
  if (!button) return;
  shownProgram = null;
  showMessage = "برنامه از این دستگاه بسته شد.";
  showMessageKind = "success";
  try { window.localStorage.removeItem(SHOW_STORAGE_KEY); } catch (error) {}
  render();
});

function applyTheme(theme) {
  const selected = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = selected;
  document.querySelectorAll('[data-action="toggle-theme"]').forEach(function (button) {
    button.textContent = selected === "dark" ? "☀" : "☾";
    button.setAttribute("aria-label", selected === "dark" ? "تغییر به حالت روشن" : "تغییر به حالت تیره");
  });
}

document.addEventListener("click", function (event) {
  if (!event.target.closest('[data-action="toggle-theme"]')) return;
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try { window.localStorage.setItem("hido.theme.v1", next); } catch (error) {}
});

try { applyTheme(window.localStorage.getItem("hido.theme.v1")); } catch (error) { applyTheme("light"); }
render();

if ("serviceWorker" in navigator) {
  const offlineStatus = document.getElementById("show-offline-status");
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
    .then(function (registration) {
      if (navigator.onLine) registration.update().catch(function () {});
      if (offlineStatus) offlineStatus.textContent = "hido-show برای استفادهٔ آفلاین آماده است.";
    })
    .catch(function () {
      if (offlineStatus) offlineStatus.textContent = "برای آماده‌سازی آفلاین، یک‌بار به اینترنت وصل شو.";
    });
}
