"use strict";

const DATA_KEY = "hido.training-builder.v3";
const THEME_KEY = "hido.theme.v1";
const PREVIOUS_DATA_KEY = "hido.training-builder.v2";
const LEGACY_KEY = "hido.exercise-book.v1";
const LEGACY_SETTINGS_KEY = "hido.workout-plan-settings.v1";
const MUSCLE_GROUPS = [
  "biron-ran", "dakhel-ran", "jolo-bazo", "jolo-ran", "kmar", "pahlo",
  "posht-bazo", "posht-ran", "saed bala", "saed pain", "sag-pa jolo",
  "sag-pa posht", "sar-shane", "shekam", "sine", "soreini-bozorg",
  "soreini-kochak", "zir-bagal", "zozanagei"
];
const MUSCLE_NAMES = {
  "biron-ran": "بیرون ران", "dakhel-ran": "داخل ران",
  "jolo-bazo": "جلو بازو", "jolo-ran": "جلو ران", "kmar": "کمر",
  "pahlo": "پهلو", "posht-bazo": "پشت بازو", "posht-ran": "پشت ران",
  "saed bala": "بالای ساعد", "saed pain": "پایین ساعد",
  "sag-pa jolo": "جلوی ساق پا", "sag-pa posht": "پشت ساق پا",
  "sar-shane": "سرشانه", "shekam": "شکم", "sine": "سینه",
  "soreini-bozorg": "سرینی بزرگ", "soreini-kochak": "سرینی کوچک",
  "zir-bagal": "زیر بغل", "zozanagei": "ذوزنقه‌ای"
};

const appRoot = document.getElementById("app");
const pageKind = document.body.dataset.page === "exercises" ? "exercises" : "program";
let state = loadData();
let activeDefinitionId = readDefinitionId();
let activeMuscleRole = "primary";
let svgTemplatePromise = null;
let toastTimer = null;

function createId() {
  return "hido-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function number(value) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function numberInput(value) {
  if (value === "" || value === null || typeof value === "undefined") return "";
  const numeric = Number(normalizeDigits(value));
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("fa-IR", { useGrouping: false, maximumFractionDigits: 2 }).format(numeric)
    : "";
}

function normalizeDigits(value) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return String(value)
    .replace(/[۰-۹]/g, function (digit) { return String(persian.indexOf(digit)); })
    .replace(/[٠-٩]/g, function (digit) { return String(arabic.indexOf(digit)); })
    .replace(/٫/g, ".")
    .replace(/[٬,]/g, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(normalizeDigits(value), 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function cleanWeight(value) {
  if (value === "" || value === null || typeof value === "undefined") return "";
  const parsed = Number(normalizeDigits(value));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : "";
}

function sanitizeDefinition(raw) {
  const type = raw.type === "superset" ? "superset" : "single";
  const primary = Array.isArray(raw.primary)
    ? raw.primary.filter(function (group, index, list) {
        return typeof group === "string" && MUSCLE_GROUPS.includes(group) && list.indexOf(group) === index;
      })
    : [];
  const secondary = Array.isArray(raw.secondary)
    ? raw.secondary.filter(function (group, index, list) {
        return typeof group === "string" && MUSCLE_GROUPS.includes(group) &&
          !primary.includes(group) && list.indexOf(group) === index;
      })
    : [];
  return {
    id: typeof raw.id === "string" ? raw.id : createId(),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "حرکت جدید",
    type: type,
    primary: type === "single" ? primary : [],
    secondary: type === "single" ? secondary : [],
    movements: type === "superset" && Array.isArray(raw.movements)
      ? raw.movements.filter(Boolean).map(function (movement) {
          return {
            id: typeof movement.id === "string" ? movement.id : createId(),
            exerciseId: typeof movement.exerciseId === "string" ? movement.exerciseId : "",
            type: movement.type === "time" ? "time" : "reps",
            reps: boundedInt(movement.reps, 10, 1, 1000),
            durationSeconds: boundedInt(movement.durationSeconds, 30, 1, 10800),
            weightKg: cleanWeight(movement.weightKg)
          };
        })
      : [],
    rounds: boundedInt(raw.rounds, 3, 1, 50),
    restBetweenMovementsSeconds: boundedInt(raw.restBetweenMovementsSeconds, 0, 0, 3600),
    restBetweenRoundsSeconds: boundedInt(raw.restBetweenRoundsSeconds, 90, 0, 3600)
  };
}

function sanitizeDefinitions(rawDefinitions) {
  const definitions = (Array.isArray(rawDefinitions) ? rawDefinitions : []).filter(Boolean).map(sanitizeDefinition);
  const singleIds = new Set(definitions.filter(function (definition) {
    return definition.type === "single";
  }).map(function (definition) { return definition.id; }));
  definitions.forEach(function (definition) {
    if (definition.type !== "superset") return;
    definition.movements = definition.movements.filter(function (movement) {
      return singleIds.has(movement.exerciseId);
    });
  });
  return definitions;
}

function sanitizeProgramItem(raw, definitionIds) {
  if (!raw || !definitionIds.has(raw.exerciseId)) return null;
  const item = {
    id: typeof raw.id === "string" ? raw.id : createId(),
    exerciseId: raw.exerciseId,
    type: raw.type === "time" ? "time" : "reps",
    sets: boundedInt(raw.sets, 3, 1, 50),
    reps: boundedInt(raw.reps, 10, 1, 1000),
    durationSeconds: boundedInt(raw.durationSeconds, 30, 1, 10800),
    weightKg: cleanWeight(raw.weightKg),
    restBetweenSetsSeconds: boundedInt(raw.restBetweenSetsSeconds, 90, 0, 3600)
  };
  if (typeof raw.supersetGroup === "string" && raw.supersetGroup) item.supersetGroup = raw.supersetGroup;
  if (typeof raw.restBetweenMovementsSeconds !== "undefined") {
    item.restBetweenMovementsSeconds = boundedInt(raw.restBetweenMovementsSeconds, 0, 0, 3600);
  }
  return item;
}

function normalizeSupersets(items) {
  const groups = {};
  items.forEach(function (item, index) {
    if (!item.supersetGroup) return;
    if (!groups[item.supersetGroup]) groups[item.supersetGroup] = [];
    groups[item.supersetGroup].push(index);
  });
  Object.keys(groups).forEach(function (groupId) {
    const indexes = groups[groupId];
    const isContiguous = indexes.length >= 2 && indexes.every(function (index, offset) {
      return offset === 0 || index === indexes[offset - 1] + 1;
    });
    if (!isContiguous) {
      items.forEach(function (item) {
        if (item.supersetGroup === groupId) item.supersetGroup = "";
      });
    } else {
      const first = items[indexes[0]];
      indexes.slice(1).forEach(function (index) {
        items[index].sets = first.sets;
        items[index].restBetweenSetsSeconds = first.restBetweenSetsSeconds;
        items[index].restBetweenMovementsSeconds = first.restBetweenMovementsSeconds;
      });
    }
  });
  return items;
}

function sanitizeProgram(raw, definitions) {
  const definitionIds = new Set(definitions.map(function (definition) { return definition.id; }));
  const items = Array.isArray(raw.items)
    ? raw.items.map(function (item) { return sanitizeProgramItem(item, definitionIds); }).filter(Boolean)
    : [];
  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "برنامهٔ تمرینی من",
    restBetweenExercisesSeconds: boundedInt(raw.restBetweenExercisesSeconds, 120, 0, 3600),
    items: normalizeSupersets(items)
  };
}

function migrateProgramSupersets(definitions, program) {
  const migratedItems = [];
  let changed = false;
  let index = 0;
  while (index < program.items.length) {
    const first = program.items[index];
    if (!first.supersetGroup) {
      migratedItems.push(first);
      index += 1;
      continue;
    }
    const group = [];
    while (index < program.items.length && program.items[index].supersetGroup === first.supersetGroup) {
      group.push(program.items[index]);
      index += 1;
    }
    const sourceDefinitions = group.map(function (item) {
      return definitions.find(function (definition) {
        return definition.id === item.exerciseId && definition.type === "single";
      });
    });
    if (group.length < 2 || sourceDefinitions.some(function (definition) { return !definition; })) {
      group.forEach(function (item) {
        item.supersetGroup = "";
        migratedItems.push(item);
      });
      continue;
    }
    const firstItem = group[0];
    const composite = {
      id: createId(),
      name: ("سوپرست: " + sourceDefinitions.map(function (definition) { return definition.name; }).join(" + ")).slice(0, 80),
      type: "superset",
      primary: [],
      secondary: [],
      movements: group.map(function (item) {
        return {
          id: createId(),
          exerciseId: item.exerciseId,
          type: item.type,
          reps: item.reps,
          durationSeconds: item.durationSeconds,
          weightKg: item.weightKg
        };
      }),
      rounds: firstItem.sets,
      restBetweenMovementsSeconds: firstItem.restBetweenMovementsSeconds,
      restBetweenRoundsSeconds: firstItem.restBetweenSetsSeconds
    };
    definitions.push(sanitizeDefinition(composite));
    migratedItems.push({
      id: firstItem.id,
      exerciseId: composite.id,
      type: "reps",
      sets: 3,
      reps: 10,
      durationSeconds: 30,
      weightKg: "",
      restBetweenSetsSeconds: 90,
      supersetGroup: "",
      restBetweenMovementsSeconds: 0
    });
    changed = true;
  }
  migratedItems.forEach(function (item) {
    delete item.supersetGroup;
    delete item.restBetweenMovementsSeconds;
  });
  program.items = migratedItems;
  return changed;
}

function restoreData(raw) {
  if (!raw || !Array.isArray(raw.definitions) || !raw.program) return null;
  const definitions = sanitizeDefinitions(raw.definitions);
  const program = sanitizeProgram(raw.program, definitions);
  const migrated = migrateProgramSupersets(definitions, program);
  return { data: { definitions: definitions, program: program }, migrated: migrated };
}

function loadData() {
  const storedKeys = [DATA_KEY, PREVIOUS_DATA_KEY];
  for (const key of storedKeys) {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) || "null");
      const restored = restoreData(stored);
      if (!restored) continue;
      if (key !== DATA_KEY || restored.migrated) {
        try {
          window.localStorage.setItem(DATA_KEY, JSON.stringify(restored.data));
        } catch (error) {
          // Keep the readable data in memory even if migration cannot be saved.
        }
      }
      return restored.data;
    } catch (error) {
      // Try the next saved format.
    }
  }
  try {
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_KEY) || "[]");
    if (Array.isArray(legacy) && legacy.length) {
      const definitions = sanitizeDefinitions(legacy.filter(function (item) {
        return item && typeof item.name === "string";
      }));
      const items = legacy.filter(function (item) {
        return item && typeof item.name === "string";
      }).map(function (item, index) {
        return {
          id: typeof item.id === "string" ? item.id + "-program" : createId(),
          exerciseId: definitions[index].id,
          type: item.type === "time" ? "time" : "reps",
          sets: boundedInt(item.sets, 3, 1, 50),
          reps: boundedInt(item.reps, 10, 1, 1000),
          durationSeconds: boundedInt(item.durationSeconds, 30, 1, 10800),
          weightKg: cleanWeight(item.weightKg),
          restBetweenSetsSeconds: boundedInt(item.restBetweenSetsSeconds, 90, 0, 3600),
          supersetGroup: typeof item.supersetGroup === "string" ? item.supersetGroup : "",
          restBetweenMovementsSeconds: boundedInt(item.restBetweenMovementsSeconds, 0, 0, 3600)
        };
      });
      let oldSettings = {};
      try {
        oldSettings = JSON.parse(window.localStorage.getItem(LEGACY_SETTINGS_KEY) || "{}");
      } catch (error) {
        oldSettings = {};
      }
      const program = {
        name: oldSettings.name || "برنامهٔ تمرینی من",
        restBetweenExercisesSeconds: boundedInt(oldSettings.restBetweenExercisesSeconds, 120, 0, 3600),
        items: normalizeSupersets(items)
      };
      migrateProgramSupersets(definitions, program);
      const data = { definitions: definitions, program: program };
      try {
        window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
      } catch (error) {
        // Keep the imported data in memory if browser storage is unavailable.
      }
      return data;
    }
  } catch (error) {
    // Start with an empty plan if saved data cannot be read.
  }
  return {
    definitions: [],
    program: { name: "برنامهٔ تمرینی من", restBetweenExercisesSeconds: 120, items: [] }
  };
}

function saveData() {
  try {
    window.localStorage.setItem(DATA_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    window.alert("ذخیره‌سازی در این مرورگر در دسترس نیست.");
    return false;
  }
}

function getDefinition(id) {
  return state.definitions.find(function (definition) { return definition.id === id; });
}

function getProgramItem(id) {
  return state.program.items.find(function (item) { return item.id === id; });
}

function readDefinitionId() {
  const match = window.location.hash.match(/^#definition\/(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return null;
  }
}

function renderNav() {
  return '<nav class="page-nav" aria-label="صفحه‌های hido">' +
    '<a href="./index.html" class="' + (pageKind === "program" ? "active" : "") + '">نوشتن برنامه</a>' +
    '<a href="./exercises.html" class="' + (pageKind === "exercises" ? "active" : "") + '">تعریف حرکت</a></nav>';
}

function applyTheme(theme) {
  const selectedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = selectedTheme;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = selectedTheme === "dark" ? "#111714" : "#f4f5ef";
  document.querySelectorAll("[data-action='toggle-theme']").forEach(function (button) {
    const label = selectedTheme === "dark" ? "تغییر به حالت روشن" : "تغییر به حالت تیره";
    button.textContent = selectedTheme === "dark" ? "☀" : "☾";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.setAttribute("aria-pressed", String(selectedTheme === "dark"));
  });
}

function initializeTheme() {
  let theme = "light";
  try {
    theme = window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch (error) {
    theme = "light";
  }
  applyTheme(theme);
}

document.addEventListener("click", function (event) {
  const button = event.target.closest("[data-action='toggle-theme']");
  if (!button) return;
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  try {
    window.localStorage.setItem(THEME_KEY, nextTheme);
  } catch (error) {
    // Keep the selected theme active for this page even if storage is unavailable.
  }
});

function renderProgramItem(item) {
  const definition = getDefinition(item.exerciseId);
  if (!definition) return "";
  if (definition.type === "superset") {
    const preview = definition.movements.map(function (movement, index) {
      const child = getDefinition(movement.exerciseId);
      if (!child) return "";
      const dose = movement.type === "reps"
        ? number(movement.reps) + " تکرار"
        : number(movement.durationSeconds) + " ثانیه";
      const weight = movement.weightKg === "" ? "" : " · " + number(movement.weightKg) + " کیلوگرم";
      return '<li><span>' + number(index + 1) + '. ' + escapeHtml(child.name) + '</span><small>' + dose + weight + '</small></li>';
    }).join("");
    return '<article class="program-movement compound-program-movement"><div class="program-movement-heading"><span class="pair-marker">مینی‌برنامه</span>' +
      '<strong>' + escapeHtml(definition.name) + '</strong><a href="./exercises.html#definition/' + encodeURIComponent(definition.id) + '">ویرایش سوپرست</a>' +
      '<button class="small-action remove-action" type="button" data-action="remove-program-item" data-id="' + escapeHtml(item.id) + '">حذف از برنامه</button></div>' +
      '<div class="compound-summary"><strong>' + number(definition.rounds) + ' ست سوپرست</strong><span>استراحت بین حرکت‌ها: ' + number(definition.restBetweenMovementsSeconds) + ' ثانیه</span>' +
      '<span>استراحت بین ست‌های سوپرست: ' + number(definition.restBetweenRoundsSeconds) + ' ثانیه</span></div>' +
      (definition.movements.length >= 2 && preview ? '<ol class="compound-preview">' + preview + '</ol>' : '<p class="field-help">برای استفاده در برنامه، دست‌کم دو حرکت تکی به این سوپرست اضافه کن.</p>') + '</article>';
  }
  const typeOptions = '<option value="reps" ' + (item.type === "reps" ? "selected" : "") + '>تکراری</option>' +
    '<option value="time" ' + (item.type === "time" ? "selected" : "") + '>تایمی</option>';
  const amountControl = item.type === "reps"
    ? '<label class="field-label">تکرار در هر ست<input class="number-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="reps" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(item.reps) + '"></label>'
    : '<label class="field-label">زمان هر حرکت <span>(ثانیه)</span><input class="number-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="durationSeconds" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(item.durationSeconds) + '"></label>';
  return '<article class="program-movement">' +
    '<div class="program-movement-heading"><span class="pair-marker">تکی</span>' +
    '<strong>' + escapeHtml(definition.name) + '</strong>' +
    '<a href="./exercises.html#definition/' + encodeURIComponent(definition.id) + '">ویرایش حرکت</a>' +
    '<button class="small-action remove-action" type="button" data-action="remove-program-item" data-id="' + escapeHtml(item.id) + '">حذف از برنامه</button></div>' +
    '<div class="prescription-grid">' +
    '<label class="field-label">نوع اجرا<select class="select-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="type">' + typeOptions + '</select></label>' +
    '<label class="field-label">تعداد ست<input class="number-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="sets" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(item.sets) + '"></label>' +
    amountControl +
    '<label class="field-label">وزنه <span>(کیلوگرم، اختیاری)</span><input class="number-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="weightKg" type="text" inputmode="decimal" autocomplete="off" placeholder="وزن بدن" value="' + numberInput(item.weightKg) + '"></label>' +
    '<label class="field-label">استراحت بین ست‌های این حرکت <span>(ثانیه)</span><input class="number-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="restBetweenSetsSeconds" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(item.restBetweenSetsSeconds) + '"></label>' +
    '</div></article>';
}

function renderProgramBlock(block, index, blocks) {
  const item = block.items[0];
  const definition = getDefinition(item.exerciseId);
  const isSuperset = definition && definition.type === "superset";
  return '<section class="program-block ' + (isSuperset ? "is-superset" : "") + '">' +
    '<div class="program-block-items">' + renderProgramItem(item) + '</div>' +
    '<div class="block-footer"><span>استراحت بین بلوک‌های برنامه: ' +
    number(state.program.restBetweenExercisesSeconds) + ' ثانیه</span><div class="block-actions">' +
    '<button class="small-action icon-action" type="button" data-action="move-block" data-id="' + escapeHtml(block.id) +
    '" data-direction="up" aria-label="جابجایی به بالا" ' + (index === 0 ? "disabled" : "") + '>↑</button>' +
    '<button class="small-action icon-action" type="button" data-action="move-block" data-id="' + escapeHtml(block.id) +
    '" data-direction="down" aria-label="جابجایی به پایین" ' + (index === blocks.length - 1 ? "disabled" : "") + '>↓</button></div></div></section>';
}

function getProgramBlocks() {
  return state.program.items.map(function (item) {
    return { id: item.id, groupId: "", items: [item] };
  });
}

function renderExportProgramItem(item, index) {
  const definition = getDefinition(item.exerciseId);
  if (!definition) return "";
  let details = "";

  if (definition.type === "superset") {
    const movements = definition.movements.map(function (movement, movementIndex) {
      const child = getDefinition(movement.exerciseId);
      if (!child) return "";
      const amount = movement.type === "reps"
        ? number(movement.reps) + " تکرار"
        : number(movement.durationSeconds) + " ثانیه";
      const weight = movement.weightKg === "" ? "" : " · " + number(movement.weightKg) + " کیلوگرم";
      return '<li><strong>' + number(movementIndex + 1) + ". " + escapeHtml(child.name) +
        '</strong><span>' + amount + weight + '</span></li>';
    }).join("");
    details = '<p class="summary">' + number(definition.rounds) + " دور کامل · استراحت بین حرکت‌ها: " +
      number(definition.restBetweenMovementsSeconds) + " ثانیه · استراحت بین دورها: " +
      number(definition.restBetweenRoundsSeconds) + ' ثانیه</p><ol>' + movements + "</ol>";
  } else {
    const amount = item.type === "reps"
      ? number(item.reps) + " تکرار در هر ست"
      : number(item.durationSeconds) + " ثانیه برای هر ست";
    const weight = item.weightKg === "" ? "" : " · وزنهٔ " + number(item.weightKg) + " کیلوگرم";
    details = '<p class="summary">' + number(item.sets) + " ست · " + amount + weight +
      " · استراحت بین ست‌ها: " + number(item.restBetweenSetsSeconds) + " ثانیه</p>";
  }

  const rest = index < state.program.items.length - 1
    ? '<p class="block-rest">استراحت پس از این بخش: ' +
      number(state.program.restBetweenExercisesSeconds) + " ثانیه</p>"
    : "";
  return '<section class="program-item"><h2>' + number(index + 1) + ". " +
    escapeHtml(definition.name) + '</h2>' + details + rest + "</section>";
}

async function exportProgram() {
  if (!state.program.items.length) {
    window.alert("برنامه‌ای برای خروجی گرفتن وجود ندارد.");
    return;
  }

  let fontBase64 = "";
  let fontLicense = "";
  try {
    const fontResponse = await fetch("./assets/fonts/Vazirmatn-VF.woff2");
    if (fontResponse.ok) {
      const fontBytes = new Uint8Array(await fontResponse.arrayBuffer());
      let binaryFont = "";
      for (let offset = 0; offset < fontBytes.length; offset += 32768) {
        binaryFont += String.fromCharCode.apply(null, fontBytes.subarray(offset, offset + 32768));
      }
      fontBase64 = window.btoa(binaryFont);
    }
  } catch (error) {
    fontBase64 = "";
  }
  try {
    const licenseResponse = await fetch("./assets/fonts/OFL.txt");
    if (licenseResponse.ok) fontLicense = escapeHtml(await licenseResponse.text());
  } catch (error) {
    fontLicense = "";
  }

  const embeddedFont = fontBase64
    ? "@font-face{font-family:Vazirmatn;src:url(data:font/woff2;base64," + fontBase64 +
      ") format('woff2');font-weight:100 900;font-display:swap}"
    : "";
  const licenseSection = fontLicense
    ? '<details class="license"><summary>مجوز قلم وزیرمتن</summary><pre>' + fontLicense + "</pre></details>"
    : "";
  const content = state.program.items.map(renderExportProgramItem).join("");
  const html = '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    escapeHtml(state.program.name) + " | hido</title><style>" + embeddedFont +
    'body{margin:0;background:#f4f5ef;color:#17261e;font-family:Vazirmatn,Tahoma,sans-serif;font-size:17px;line-height:1.9;font-feature-settings:"ss01"}' +
    '.sheet{max-width:760px;margin:30px auto;padding:28px;background:white;border-radius:20px;box-shadow:0 12px 36px #17261e18}' +
    'h1{margin:0 0 8px;font-size:28px}.subtitle{color:#667269;margin:0 0 22px}.program-item{padding:16px 0;border-top:1px solid #e5e8df}' +
    'h2{margin:0 0 7px;font-size:20px}.summary{margin:0 0 10px;color:#465349}.program-item ol{display:grid;gap:8px;padding:0;list-style:none}' +
    '.program-item li{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.block-rest{margin:8px 0 0;color:#667269;font-size:14px}' +
    '.toolbar{position:sticky;top:0;padding:12px;text-align:center;background:#f4f5ef}.toolbar button{min-height:44px;padding:0 18px;border:0;border-radius:12px;background:#17261e;color:white;font:inherit;font-weight:700}' +
    '.license{margin-top:20px;color:#667269;font-size:12px}.license pre{overflow:auto;white-space:pre-wrap;direction:ltr;text-align:left;font:11px monospace}' +
    '@media print{body{background:white}.toolbar{display:none}.sheet{margin:0 auto;padding:0;box-shadow:none}.program-item{break-inside:avoid}}' +
    '</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">چاپ / ذخیره به صورت PDF</button></div>' +
    '<main class="sheet"><h1>' + escapeHtml(state.program.name) + '</h1><p class="subtitle">برنامهٔ تمرینی ساخته‌شده با hido</p>' +
    content + licenseSection + "</main></body></html>";

  const filename = (state.program.name || "hido").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 70) || "hido";
  const fileUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = "hido-" + filename + ".html";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(function () { URL.revokeObjectURL(fileUrl); }, 1000);
}

function renderProgramPage() {
  const program = state.program;
  const blocks = getProgramBlocks();
  const blockHtml = blocks.map(function (block, index) {
    return renderProgramBlock(block, index, blocks);
  }).join("");
  const programDefinitions = state.definitions.filter(function (definition) {
    return definition.type === "single" || definition.movements.length >= 2;
  });
  const options = programDefinitions.map(function (definition) {
    const typeLabel = definition.type === "superset" ? "سوپرست" : "تکی";
    return '<option value="' + escapeHtml(definition.id) + '">[' + typeLabel + '] ' + escapeHtml(definition.name) + '</option>';
  }).join("");
  return '<section class="page program-page"><header class="page-heading"><p class="eyebrow">hido · برنامه‌ساز</p>' +
    '<h1>نوشتن برنامه</h1><p class="page-intro">حرکت تکی یا سوپرست آماده را به برنامه اضافه کن و ترتیب بلوک‌ها را بچین. جزئیات هر سوپرست از صفحهٔ تعریف حرکت ویرایش می‌شود.</p>' +
    '<div class="heading-actions"><button class="export-button" type="button" data-action="export-program">دریافت خروجی آفلاین</button></div></header>' +
    '<section class="plan-settings"><div class="section-heading"><div><p class="eyebrow">تنظیم برنامه</p><h2>نام و استراحت برنامه</h2></div></div>' +
    '<label class="field-label">نام برنامه<input class="text-input" data-program-field="name" maxlength="80" value="' + escapeHtml(program.name) + '"></label>' +
    '<label class="field-label">استراحت بین حرکت‌های برنامه <span>(ثانیه)</span><input class="number-input" data-program-field="restBetweenExercisesSeconds" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(program.restBetweenExercisesSeconds) + '"></label>' +
    '<p class="field-help">این استراحت بعد از حرکت تکی یا بعد از پایان یک بلوک سوپرست اعمال می‌شود.</p></section>' +
    (programDefinitions.length
      ? '<form class="add-movement-form" data-form="add-program-item"><select class="select-input" name="definition-id" required><option value="">انتخاب حرکت تعریف‌شده</option>' + options +
        '</select><button class="primary-button" type="submit">افزودن به برنامه</button></form>'
      : '<div class="empty-state"><strong>' + (state.definitions.length ? "سوپرست کامل نشده" : "اول حرکت‌ها را تعریف کن") + '</strong><p>' +
        (state.definitions.length ? "برای افزودن سوپرست به برنامه، دست‌کم دو حرکت تکی داخل تعریف ترکیبی قرار بده." : "حرکت تکی یا سوپرست ترکیبی را در صفحهٔ تعریف حرکت بساز.") +
        '</p><a class="text-link" href="./exercises.html">رفتن به تعریف حرکت‌ها ←</a></div>') +
    '<div class="section-heading movement-section-heading"><div><p class="eyebrow">چیدمان تمرین</p><h2>حرکت‌های برنامه <span class="heading-count">' + number(program.items.length) + '</span></h2></div></div>' +
    (blocks.length ? '<div class="program-block-list">' + blockHtml + '</div>' :
      '<div class="empty-state compact-empty"><strong>برنامه هنوز خالی است</strong><p>حرکت تعریف‌شده را از فهرست بالا به برنامه اضافه کن.</p></div>') +
    '</section>';
}

function renderDefinitionList() {
  const selected = activeDefinitionId ? getDefinition(activeDefinitionId) : null;
  const rows = state.definitions.map(function (definition, index) {
    const meta = definition.type === "superset"
      ? "ترکیبی · " + number(definition.movements.length) + " حرکت"
      : "تکی · " + number(definition.primary.length) + " ماهیچهٔ اصلی · " + number(definition.secondary.length) + " فرعی";
    return '<button class="exercise-row" type="button" data-action="open-definition" data-id="' + escapeHtml(definition.id) + '">' +
      '<span class="exercise-number">' + number(index + 1) + '</span><span class="exercise-copy"><strong>' +
      escapeHtml(definition.name) + '</strong><span class="exercise-meta">' + meta + '</span></span><span class="row-arrow" aria-hidden="true">‹</span></button>';
  }).join("");
  const editor = selected ? renderDefinitionEditor(selected) : "";
  return '<section class="page library-page"><header class="page-heading"><p class="eyebrow">hido · کتابخانهٔ حرکت‌ها</p>' +
    '<h1>تعریف حرکت</h1><p class="page-intro">حرکت تکی تعریف کن یا چند حرکت تکی را در یک سوپرست ترکیبی بچین.</p></header>' +
    '<form class="new-exercise-form" data-form="new-definition"><input class="text-input" name="definition-name" type="text" maxlength="80" autocomplete="off" placeholder="نام حرکت یا سوپرست" aria-label="نام حرکت" required>' +
    '<select class="select-input definition-kind-select" name="definition-type" aria-label="نوع حرکت"><option value="single">تکی</option><option value="superset">ترکیبی (سوپرست)</option></select>' +
    '<button class="primary-button" type="submit">ساخت</button></form>' +
    (selected ? editor : (state.definitions.length
      ? '<div class="exercise-list">' + rows + '</div>'
      : '<div class="empty-state"><strong>هنوز حرکتی تعریف نشده</strong><p>نام اولین حرکت را بالا بنویس و بعد ناحیه‌های درگیرش را روی نقشه انتخاب کن.</p></div>')) +
    '</section>';
}

function renderDefinitionEditor(definition) {
  const typeLabel = definition.type === "superset" ? "ترکیبی · سوپرست" : "حرکت تکی";
  const editorBody = definition.type === "superset"
    ? renderSupersetDefinitionEditor(definition)
    : '<div class="map-instructions"><span class="instruction-icon">●</span><span>نقش ماهیچه را از نوار پایین انتخاب کن؛ بعد از روی شکل یا فهرست فارسی ماهیچه‌ها را بزن.</span></div>' +
      '<div class="body-map" id="body-map"><img class="body-map-fallback" src="./full_body.svg" alt="نقشهٔ ماهیچه‌های بدن"></div>' +
      '<p class="map-note" id="map-note" role="status">ماهیچه‌های انتخاب‌شده با رنگ نقششان مشخص می‌شوند.</p>' +
      '<div class="map-legend"><span><i class="legend-dot primary-dot"></i>اصلی</span><span><i class="legend-dot secondary-dot"></i>فرعی</span></div>' +
      renderMusclePicker(definition) +
      '<div class="selection-toast" id="selection-toast" role="status" aria-live="polite"></div>' +
      '<div class="role-dock" role="group" aria-label="انتخاب نقش ماهیچه">' +
      '<button class="role-button active" type="button" data-action="select-muscle-role" data-role="primary" aria-pressed="true"><span>ماهیچهٔ اصلی</span><small><b id="primary-count">' + number(definition.primary.length) + '</b> انتخاب</small></button>' +
      '<button class="role-button" type="button" data-action="select-muscle-role" data-role="secondary" aria-pressed="false"><span>ماهیچهٔ فرعی</span><small><b id="secondary-count">' + number(definition.secondary.length) + '</b> انتخاب</small></button>' +
      '</div>';
  return '<section class="definition-editor ' + (definition.type === "superset" ? "superset-definition-editor" : "") + '"><div class="detail-top"><button class="back-button" type="button" data-action="back-to-library" aria-label="بازگشت به فهرست">←</button>' +
    '<div class="detail-title"><p class="eyebrow">ویرایش تعریف حرکت</p><h2>' + escapeHtml(definition.name) + '</h2></div>' +
    '<button class="danger-button" type="button" data-action="delete-definition" data-id="' + escapeHtml(definition.id) + '">حذف</button></div>' +
    '<p class="definition-kind-badge">' + typeLabel + '</p>' +
    '<label class="field-label">نام حرکت<input class="text-input" data-definition-field="name" maxlength="80" value="' + escapeHtml(definition.name) + '"></label>' +
    editorBody + '</section>';
}

function renderMusclePicker(definition) {
  const buttons = MUSCLE_GROUPS.map(function (group) {
    const role = definition.primary.includes(group) ? "primary" :
      definition.secondary.includes(group) ? "secondary" : "";
    const stateLabel = role === "primary" ? "اصلی" : role === "secondary" ? "فرعی" : "انتخاب";
    return '<button class="muscle-option ' + (role ? "is-" + role : "") +
      '" type="button" data-action="toggle-muscle" data-muscle="' + escapeHtml(group) +
      '" data-muscle-option aria-pressed="' + String(role === activeMuscleRole) + '">' +
      '<span>' + escapeHtml(MUSCLE_NAMES[group]) + '</span><small class="muscle-option-state">' +
      stateLabel + "</small></button>";
  }).join("");
  return '<section class="muscle-picker" aria-label="انتخاب ماهیچه از فهرست"><h3>انتخاب از فهرست فارسی</h3>' +
    '<p class="field-help">هر بار زدن، ماهیچه را به نقش انتخاب‌شده اضافه یا از همان نقش حذف می‌کند.</p>' +
    '<div class="muscle-picker-list">' + buttons + "</div></section>";
}

function renderSupersetDefinitionEditor(definition) {
  const options = state.definitions.filter(function (candidate) {
    return candidate.type === "single";
  }).map(function (candidate) {
    return '<option value="' + escapeHtml(candidate.id) + '">' + escapeHtml(candidate.name) + '</option>';
  }).join("");
  const movements = definition.movements.map(function (movement, index) {
    const child = getDefinition(movement.exerciseId);
    if (!child) return "";
    const amount = movement.type === "reps"
      ? '<label class="field-label">تکرار در هر ست<input class="number-input" data-superset-movement-id="' + escapeHtml(movement.id) + '" data-superset-movement-field="reps" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(movement.reps) + '"></label>'
      : '<label class="field-label">زمان اجرای این حرکت <span>(ثانیه)</span><input class="number-input" data-superset-movement-id="' + escapeHtml(movement.id) + '" data-superset-movement-field="durationSeconds" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(movement.durationSeconds) + '"></label>';
    return '<article class="superset-definition-movement"><div class="superset-definition-movement-heading"><span class="pair-marker">حرکت ' + number(index + 1) + '</span>' +
      '<strong>' + escapeHtml(child.name) + '</strong><div class="member-actions">' +
      '<button class="small-action icon-action" type="button" data-action="move-superset-definition-movement" data-id="' + escapeHtml(movement.id) + '" data-direction="up" aria-label="جابجایی حرکت به بالا" ' + (index === 0 ? "disabled" : "") + '>↑</button>' +
      '<button class="small-action icon-action" type="button" data-action="move-superset-definition-movement" data-id="' + escapeHtml(movement.id) + '" data-direction="down" aria-label="جابجایی حرکت به پایین" ' + (index === definition.movements.length - 1 ? "disabled" : "") + '>↓</button></div>' +
      '<button class="small-action remove-action" type="button" data-action="remove-superset-definition-movement" data-id="' + escapeHtml(movement.id) + '">حذف</button></div>' +
      '<div class="prescription-grid"><label class="field-label">نوع اجرا<select class="select-input" data-superset-movement-id="' + escapeHtml(movement.id) + '" data-superset-movement-field="type">' +
      '<option value="reps" ' + (movement.type === "reps" ? "selected" : "") + '>تکراری</option><option value="time" ' + (movement.type === "time" ? "selected" : "") + '>تایمی</option></select></label>' + amount +
      '<label class="field-label">وزنه <span>(کیلوگرم، اختیاری)</span><input class="number-input" data-superset-movement-id="' + escapeHtml(movement.id) + '" data-superset-movement-field="weightKg" type="text" inputmode="decimal" autocomplete="off" placeholder="وزن بدن" value="' + numberInput(movement.weightKg) + '"></label></div></article>';
  }).join("");
  return '<section class="superset-definition-builder"><div class="map-instructions"><span class="instruction-icon">●</span><span>این سوپرست یک مینی‌برنامه است: حرکت‌های تکی را به ترتیب اضافه کن و نسخهٔ اجرای هر کدام را جدا تنظیم کن.</span></div>' +
    '<div class="superset-definition-settings"><label class="field-label">تعداد ست سوپرست <span>(هر ست یک دور کامل)</span><input class="number-input" data-superset-field="rounds" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(definition.rounds) + '"></label>' +
    '<label class="field-label">استراحت بین حرکت‌های هر دور <span>(ثانیه)</span><input class="number-input" data-superset-field="restBetweenMovementsSeconds" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(definition.restBetweenMovementsSeconds) + '"></label>' +
    '<label class="field-label">استراحت بین ست‌های سوپرست <span>(ثانیه)</span><input class="number-input" data-superset-field="restBetweenRoundsSeconds" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(definition.restBetweenRoundsSeconds) + '"></label></div>' +
    (state.definitions.some(function (candidate) { return candidate.type === "single"; })
      ? '<form class="add-superset-movement-form" data-form="add-superset-definition-movement"><select class="select-input" name="exercise-id" aria-label="انتخاب حرکت تکی برای سوپرست" required><option value="">انتخاب حرکت تکی</option>' + options + '</select><button class="primary-button" type="submit">افزودن به سوپرست</button></form>'
      : '<div class="empty-state compact-empty"><strong>حرکت تکی‌ای برای افزودن نیست</strong><p>اول یک حرکت تکی تعریف کن، بعد آن را به سوپرست اضافه کن.</p><button class="small-action" type="button" data-action="back-to-library">بازگشت به فهرست حرکت‌ها</button></div>') +
    (definition.movements.length < 2 ? '<p class="field-help">برای استفاده در برنامه، این سوپرست باید دست‌کم دو حرکت داشته باشد.</p>' : "") +
    (definition.movements.length ? '<div class="superset-definition-list">' + movements + '</div>' :
      '<div class="empty-state compact-empty"><strong>سوپرست هنوز حرکت ندارد</strong><p>از فهرست بالا حرکت‌های تکی را به این مینی‌برنامه اضافه کن.</p></div>') + '</section>';
}

function render() {
  appRoot.innerHTML = pageKind === "exercises" ? renderDefinitionList() : renderProgramPage();
  document.title = pageKind === "exercises" ? "تعریف حرکت | hido" : state.program.name + " | hido";
  if (pageKind === "exercises" && activeDefinitionId && getDefinition(activeDefinitionId) &&
      getDefinition(activeDefinitionId).type === "single") {
    attachBodyMap(activeDefinitionId);
  }
}

function addDefinition(form) {
  const name = form.elements.namedItem("definition-name").value.trim();
  if (!name) return;
  const type = form.elements.namedItem("definition-type").value === "superset" ? "superset" : "single";
  const definition = type === "superset"
    ? { id: createId(), name: name, type: type, primary: [], secondary: [], movements: [], rounds: 3, restBetweenMovementsSeconds: 0, restBetweenRoundsSeconds: 90 }
    : { id: createId(), name: name, type: type, primary: [], secondary: [] };
  state.definitions.push(definition);
  if (!saveData()) {
    state.definitions.pop();
    return;
  }
  activeDefinitionId = definition.id;
  window.history.pushState({}, "", "#definition/" + encodeURIComponent(definition.id));
  render();
}

function addSupersetDefinitionMovement(form) {
  const definition = getDefinition(activeDefinitionId);
  const exerciseId = form.elements.namedItem("exercise-id").value;
  const child = getDefinition(exerciseId);
  if (!definition || definition.type !== "superset" || !child || child.type !== "single") return;
  definition.movements.push({ id: createId(), exerciseId: child.id, type: "reps", reps: 10, durationSeconds: 30, weightKg: "" });
  saveData();
  render();
}

function moveSupersetDefinitionMovement(movementId, direction) {
  const definition = getDefinition(activeDefinitionId);
  if (!definition || definition.type !== "superset") return;
  const index = definition.movements.findIndex(function (movement) { return movement.id === movementId; });
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= definition.movements.length) return;
  const movement = definition.movements[index];
  definition.movements[index] = definition.movements[target];
  definition.movements[target] = movement;
  saveData();
  render();
}

function removeSupersetDefinitionMovement(movementId) {
  const definition = getDefinition(activeDefinitionId);
  if (!definition || definition.type !== "superset") return;
  definition.movements = definition.movements.filter(function (movement) { return movement.id !== movementId; });
  saveData();
  render();
}

function updateSupersetDefinitionField(input) {
  const definition = getDefinition(activeDefinitionId);
  if (!definition || definition.type !== "superset") return;
  const field = input.dataset.supersetField;
  if (field === "rounds") definition.rounds = boundedInt(input.value, definition.rounds, 1, 50);
  if (field === "restBetweenMovementsSeconds") definition.restBetweenMovementsSeconds = boundedInt(input.value, definition.restBetweenMovementsSeconds, 0, 3600);
  if (field === "restBetweenRoundsSeconds") definition.restBetweenRoundsSeconds = boundedInt(input.value, definition.restBetweenRoundsSeconds, 0, 3600);
  saveData();
  render();
}

function updateSupersetDefinitionMovementField(input) {
  const definition = getDefinition(activeDefinitionId);
  if (!definition || definition.type !== "superset") return;
  const movement = definition.movements.find(function (candidate) {
    return candidate.id === input.dataset.supersetMovementId;
  });
  if (!movement) return;
  const field = input.dataset.supersetMovementField;
  if (field === "type") movement.type = input.value === "time" ? "time" : "reps";
  if (field === "reps") movement.reps = boundedInt(input.value, movement.reps, 1, 1000);
  if (field === "durationSeconds") movement.durationSeconds = boundedInt(input.value, movement.durationSeconds, 1, 10800);
  if (field === "weightKg") movement.weightKg = cleanWeight(input.value);
  saveData();
  render();
}

function createProgramItem(definitionId) {
  return {
    id: createId(),
    exerciseId: definitionId,
    type: "reps",
    sets: 3,
    reps: 10,
    durationSeconds: 30,
    weightKg: "",
    restBetweenSetsSeconds: 90
  };
}

function addProgramItem(form) {
  const definitionId = form.elements.namedItem("definition-id").value;
  if (!getDefinition(definitionId)) return;
  state.program.items.push(createProgramItem(definitionId));
  saveData();
  render();
}

function reorderBlock(blockId, direction) {
  const blocks = getProgramBlocks();
  const index = blocks.findIndex(function (block) { return block.id === blockId; });
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= blocks.length) return;
  const current = blocks[index];
  blocks[index] = blocks[target];
  blocks[target] = current;
  state.program.items = blocks.reduce(function (all, block) { return all.concat(block.items); }, []);
  saveData();
  render();
}

function removeProgramItem(itemId) {
  const item = getProgramItem(itemId);
  if (!item) return;
  state.program.items = state.program.items.filter(function (candidate) { return candidate.id !== itemId; });
  saveData();
  render();
}

function deleteDefinition(id) {
  const definition = getDefinition(id);
  if (!definition || !window.confirm("حرکت «" + definition.name + "» و ردیف‌هایش از برنامه حذف شود؟")) return;
  state.definitions = state.definitions.filter(function (item) { return item.id !== id; });
  state.definitions.forEach(function (item) {
    if (item.type === "superset") {
      item.movements = item.movements.filter(function (movement) { return movement.exerciseId !== id; });
    }
  });
  state.program.items = state.program.items.filter(function (item) { return item.exerciseId !== id; });
  saveData();
  activeDefinitionId = null;
  window.history.replaceState({}, "", "./exercises.html");
  render();
}

function updateProgramField(input) {
  const field = input.dataset.programField;
  if (field === "name") state.program.name = input.value.trim() || "برنامهٔ تمرینی من";
  if (field === "restBetweenExercisesSeconds") {
    state.program.restBetweenExercisesSeconds = boundedInt(input.value, state.program.restBetweenExercisesSeconds, 0, 3600);
  }
  saveData();
  render();
}

function updateItemField(input) {
  const item = getProgramItem(input.dataset.itemId);
  if (!item) return;
  const field = input.dataset.itemField;
  if (field === "type") item.type = input.value === "time" ? "time" : "reps";
  if (field === "sets") item.sets = boundedInt(input.value, item.sets, 1, 50);
  if (field === "reps") item.reps = boundedInt(input.value, item.reps, 1, 1000);
  if (field === "durationSeconds") item.durationSeconds = boundedInt(input.value, item.durationSeconds, 1, 10800);
  if (field === "weightKg") item.weightKg = cleanWeight(input.value);
  if (field === "restBetweenSetsSeconds") item.restBetweenSetsSeconds = boundedInt(input.value, item.restBetweenSetsSeconds, 0, 3600);
  saveData();
  render();
}

function updateDefinitionField(input) {
  const definition = getDefinition(activeDefinitionId);
  if (!definition || input.dataset.definitionField !== "name") return;
  definition.name = input.value.trim() || "حرکت جدید";
  saveData();
  render();
}

function loadSvgTemplate() {
  if (!svgTemplatePromise) {
    svgTemplatePromise = fetch("./full_body.svg").then(function (response) {
      if (!response.ok) throw new Error("Could not load SVG");
      return response.text();
    }).then(function (markup) {
      const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
      if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") {
        throw new Error("Invalid SVG");
      }
      return parsed.documentElement;
    });
  }
  return svgTemplatePromise;
}

async function attachBodyMap(definitionId) {
  const host = appRoot.querySelector("#body-map");
  if (!host) return;
  try {
    const template = await loadSvgTemplate();
    if (pageKind !== "exercises" || activeDefinitionId !== definitionId || !appRoot.querySelector("#body-map")) return;
    const svg = document.importNode(template, true);
    svg.classList.add("body-map-svg");
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "نقشهٔ قابل لمس ماهیچه‌ها");
    let count = 0;
    svg.querySelectorAll("g[class]").forEach(function (group) {
      const className = group.getAttribute("class").trim().replace(/\s+/g, " ");
      if (!MUSCLE_GROUPS.includes(className)) return;
      group.classList.add("muscle-area");
      group.dataset.muscle = className;
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", MUSCLE_NAMES[className] || "ماهیچه");
      group.setAttribute("title", MUSCLE_NAMES[className] || "ماهیچه");
      count += 1;
    });
    if (!count) throw new Error("No muscle groups in SVG");
    host.replaceChildren(svg);
    const note = appRoot.querySelector("#map-note");
    if (note) note.textContent = "برای انتخاب، ناحیهٔ موردنظر را لمس کن.";
    updateMuscleSelection(definitionId);
  } catch (error) {
    const note = appRoot.querySelector("#map-note");
    if (note) note.textContent = "برای انتخاب روی شکل، صفحه را از آدرس محلی یا HTTPS باز کن.";
  }
}

function updateMuscleSelection(definitionId) {
  const definition = getDefinition(definitionId);
  if (!definition) return;
  appRoot.querySelectorAll("#body-map [data-muscle]").forEach(function (area) {
    const primary = definition.primary.includes(area.dataset.muscle);
    const secondary = definition.secondary.includes(area.dataset.muscle);
    area.classList.toggle("is-primary", primary);
    area.classList.toggle("is-secondary", secondary);
    area.setAttribute("aria-pressed", String(primary || secondary));
  });
  appRoot.querySelectorAll("[data-muscle-option]").forEach(function (button) {
    const group = button.dataset.muscle;
    const primary = definition.primary.includes(group);
    const secondary = definition.secondary.includes(group);
    const selectedRole = primary ? "primary" : secondary ? "secondary" : "";
    const state = button.querySelector(".muscle-option-state");
    button.classList.toggle("is-primary", primary);
    button.classList.toggle("is-secondary", secondary);
    button.setAttribute("aria-pressed", String(selectedRole === activeMuscleRole));
    button.setAttribute("aria-label", MUSCLE_NAMES[group] + (selectedRole
      ? "، ماهیچهٔ " + (selectedRole === "primary" ? "اصلی" : "فرعی")
      : "، انتخاب نشده") + "؛ نقش فعال: " +
      (activeMuscleRole === "primary" ? "اصلی" : "فرعی"));
    if (state) state.textContent = selectedRole === "primary" ? "اصلی" :
      selectedRole === "secondary" ? "فرعی" : "انتخاب";
  });
  const primaryCount = appRoot.querySelector("#primary-count");
  const secondaryCount = appRoot.querySelector("#secondary-count");
  if (primaryCount) primaryCount.textContent = number(definition.primary.length);
  if (secondaryCount) secondaryCount.textContent = number(definition.secondary.length);
  appRoot.querySelectorAll("[data-action='select-muscle-role']").forEach(function (button) {
    const active = button.dataset.role === activeMuscleRole;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function toggleMuscle(group) {
  const definition = getDefinition(activeDefinitionId);
  if (!definition || !MUSCLE_GROUPS.includes(group)) return;
  const selected = definition[activeMuscleRole];
  const removing = selected.includes(group);
  const opposite = activeMuscleRole === "primary" ? "secondary" : "primary";
  if (removing) {
    definition[activeMuscleRole] = selected.filter(function (value) { return value !== group; });
  } else {
    definition[opposite] = definition[opposite].filter(function (value) { return value !== group; });
    selected.push(group);
  }
  saveData();
  updateMuscleSelection(definition.id);
  const toast = appRoot.querySelector("#selection-toast");
  if (toast) {
    toast.textContent = (MUSCLE_NAMES[group] || "ماهیچه") + (removing
      ? " از فهرست ماهیچه‌های " + (activeMuscleRole === "primary" ? "اصلی" : "فرعی") + " برداشته شد."
      : " به فهرست ماهیچه‌های " + (activeMuscleRole === "primary" ? "اصلی" : "فرعی") + " اضافه شد.");
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 1300);
  }
}

function selectDefinition(id) {
  if (!getDefinition(id)) return;
  activeDefinitionId = id;
  activeMuscleRole = "primary";
  window.history.pushState({}, "", "#definition/" + encodeURIComponent(id));
  render();
}

appRoot.addEventListener("submit", function (event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  if (form.dataset.form === "new-definition") addDefinition(form);
  if (form.dataset.form === "add-program-item") addProgramItem(form);
  if (form.dataset.form === "add-superset-definition-movement") addSupersetDefinitionMovement(form);
});

appRoot.addEventListener("change", function (event) {
  const input = event.target;
  if (input.matches("[data-program-field]")) updateProgramField(input);
  if (input.matches("[data-item-field]")) updateItemField(input);
  if (input.matches("[data-definition-field]")) updateDefinitionField(input);
  if (input.matches("[data-superset-field]")) updateSupersetDefinitionField(input);
  if (input.matches("[data-superset-movement-field]")) updateSupersetDefinitionMovementField(input);
});

appRoot.addEventListener("click", function (event) {
  const muscleArea = event.target.closest("#body-map g[data-muscle]");
  if (muscleArea) {
    toggleMuscle(muscleArea.dataset.muscle);
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  if (button.dataset.action === "open-definition") selectDefinition(button.dataset.id);
  if (button.dataset.action === "back-to-library") {
    activeDefinitionId = null;
    window.history.replaceState({}, "", "./exercises.html");
    render();
  }
  if (button.dataset.action === "delete-definition") deleteDefinition(button.dataset.id);
  if (button.dataset.action === "toggle-muscle") toggleMuscle(button.dataset.muscle);
  if (button.dataset.action === "export-program") exportProgram();
  if (button.dataset.action === "select-muscle-role") {
    activeMuscleRole = button.dataset.role === "secondary" ? "secondary" : "primary";
    updateMuscleSelection(activeDefinitionId);
  }
  if (button.dataset.action === "move-block") reorderBlock(button.dataset.id, button.dataset.direction);
  if (button.dataset.action === "move-superset-definition-movement") moveSupersetDefinitionMovement(button.dataset.id, button.dataset.direction);
  if (button.dataset.action === "remove-superset-definition-movement") removeSupersetDefinitionMovement(button.dataset.id);
  if (button.dataset.action === "remove-program-item") removeProgramItem(button.dataset.id);
});

appRoot.addEventListener("keydown", function (event) {
  const muscleArea = event.target.closest("#body-map g[data-muscle]");
  if (muscleArea && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    toggleMuscle(muscleArea.dataset.muscle);
  }
});

window.addEventListener("popstate", function () {
  activeDefinitionId = readDefinitionId();
  activeMuscleRole = "primary";
  render();
});

initializeTheme();
render();

if ("serviceWorker" in navigator) {
  const offlineStatus = document.getElementById("offline-status");
  const hadControllerAtStart = Boolean(navigator.serviceWorker.controller);
  let refreshingAfterUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadControllerAtStart || refreshingAfterUpdate) return;
    refreshingAfterUpdate = true;
    window.location.reload();
  });
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then(function (registration) {
        const checkForUpdate = function () {
          if (navigator.onLine) registration.update().catch(function () {});
        };
        checkForUpdate();
        window.addEventListener("online", checkForUpdate);
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") checkForUpdate();
        });
        return navigator.serviceWorker.ready;
      })
      .then(function () {
        if (offlineStatus) offlineStatus.textContent = "hido برای استفادهٔ آفلاین آماده است.";
      })
      .catch(function () {
        if (offlineStatus) offlineStatus.textContent = "برای آماده‌سازی آفلاین، یک‌بار به اینترنت وصل شو.";
      });
  });
} else {
  const offlineStatus = document.getElementById("offline-status");
  if (offlineStatus) offlineStatus.textContent = "این مرورگر از استفادهٔ آفلاین پشتیبانی نمی‌کند.";
}
