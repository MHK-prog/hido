"use strict";

const DATA_KEY = "hido.training-builder.v3";
const THEME_KEY = "hido.theme.v1";
const PREVIOUS_DATA_KEY = "hido.training-builder.v2";
const LEGACY_KEY = "hido.exercise-book.v1";
const LEGACY_SETTINGS_KEY = "hido.workout-plan-settings.v1";
const REST_DEFINITION_ID = "__hido-rest__";
const PROGRAM_THEMES = ["#2f855a", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#0891b2", "#475569", "#0f766e"];
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
const pageKind = ["exercises", "programs", "exercise-editor"].includes(document.body.dataset.page)
  ? document.body.dataset.page
  : "program";
let state = loadData();
let activeDefinitionId = readDefinitionId();
let activeProgramId = readProgramId() || (pageKind === "program" ? null : state.activeProgramId || (state.program && state.program.id) || null);
if (pageKind === "program" && !activeProgramId) {
  state.program = null;
  state.activeProgramId = null;
}
if (activeProgramId) {
  const requestedProgram = state.programs.find(function (program) { return program.id === activeProgramId; });
  if (requestedProgram) {
    state.program = requestedProgram;
    state.activeProgramId = requestedProgram.id;
    if (readProgramId()) saveData();
  }
}
let activeMuscleRole = "primary";
let svgTemplatePromise = null;
let toastTimer = null;
let composer = null;
let composerReturnAction = null;
let composerPreviousMuscleRole = "primary";
function createExerciseDraft(type) {
  if (type === "superset") {
    return {
      type: "superset",
      editing: false,
      definition: {
        id: createId(), name: "", type: "superset", primary: [], secondary: [], movements: [], rounds: 3,
      }
    };
  }
  if (type === "single") {
    return { type: "single", editing: false, definition: { id: createId(), name: "", type: "single", primary: [], secondary: [] } };
  }
  return null;
}

function restoreExerciseEditor() {
  if (pageKind !== "exercise-editor") return;
  const original = activeDefinitionId ? state.definitions.find(function (definition) { return definition.id === activeDefinitionId; }) : null;
  if (original) {
    composer = { type: original.type, definition: JSON.parse(JSON.stringify(original)), editing: true };
    return;
  }
  const selectedType = new URLSearchParams(window.location.search).get("type");
  composer = createExerciseDraft(selectedType);
}

if (pageKind === "exercise-editor") {
  restoreExerciseEditor();
}
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

function cleanDuration(value) {
  if (value === "" || value === null || typeof value === "undefined") return "";
  const parsed = Number.parseInt(normalizeDigits(value), 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(10800, parsed)) : "";
}

function normalizeProgramTheme(value) {
  return PROGRAM_THEMES.includes(String(value).toLowerCase()) ? String(value).toLowerCase() : PROGRAM_THEMES[0];
}

function countSupersetExercises(definition) {
  return definition.movements.filter(function (movement) { return movement.type !== "rest"; }).length;
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
          if (movement.type === "rest") {
            return { id: typeof movement.id === "string" ? movement.id : createId(), type: "rest", durationSeconds: cleanDuration(movement.durationSeconds) };
          }
          return {
            id: typeof movement.id === "string" ? movement.id : createId(),
            exerciseId: typeof movement.exerciseId === "string" ? movement.exerciseId : "",
            type: "reps",
            reps: boundedInt(movement.reps, 10, 1, 1000),
            weightKg: cleanWeight(movement.weightKg)
          };
        })
      : [],
    rounds: boundedInt(raw.rounds, 3, 1, 50)
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
      return movement.type === "rest" || singleIds.has(movement.exerciseId);
    });
    const firstNames = definition.movements.filter(function (movement) { return movement.type !== "rest"; }).slice(0, 2).map(function (movement) {
      const child = definitions.find(function (candidate) { return candidate.id === movement.exerciseId; });
      return child ? child.name : "";
    }).filter(Boolean);
    definition.name = firstNames.length ? firstNames.join(" + ") : "سوپرست ناتمام";
  });
  return definitions;
}

function sanitizeProgramItem(raw, definitions) {
  if (!raw) return null;
  if (raw.type === "rest" || raw.exerciseId === REST_DEFINITION_ID) {
    return { id: typeof raw.id === "string" ? raw.id : createId(), type: "rest", durationSeconds: cleanDuration(raw.durationSeconds) };
  }
  const definition = definitions.find(function (candidate) { return candidate.id === raw.exerciseId; });
  if (!definition) return null;
  if (definition.type === "superset") {
    return { id: typeof raw.id === "string" ? raw.id : createId(), exerciseId: raw.exerciseId, type: "superset" };
  }
  const item = {
    id: typeof raw.id === "string" ? raw.id : createId(),
    exerciseId: raw.exerciseId,
    type: raw.type === "time" ? "time" : "reps",
    sets: boundedInt(raw.sets, 3, 1, 50),
    reps: boundedInt(raw.reps, 10, 1, 1000),
    durationSeconds: boundedInt(raw.durationSeconds, 30, 1, 10800),
    weightKg: cleanWeight(raw.weightKg)
  };
  if (typeof raw.supersetGroup === "string" && raw.supersetGroup) item.supersetGroup = raw.supersetGroup;
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
      });
    }
  });
  return items;
}

function sanitizeProgram(raw, definitions) {
  raw = raw || {};
  const items = Array.isArray(raw.items)
    ? raw.items.map(function (item) { return sanitizeProgramItem(item, definitions); }).filter(Boolean)
    : [];
  return {
    id: typeof raw.id === "string" ? raw.id : createId(),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "برنامهٔ تمرینی من",
    themeColor: normalizeProgramTheme(raw.themeColor),
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
      name: sourceDefinitions.slice(0, 2).map(function (definition) { return definition.name; }).join(" + ").slice(0, 80),
      type: "superset",
      primary: [],
      secondary: [],
      movements: group.map(function (item) {
        return {
          id: createId(),
          exerciseId: item.exerciseId,
          type: "reps",
          reps: item.reps,
          weightKg: item.weightKg
        };
      }),
      rounds: firstItem.sets
    };
    definitions.push(sanitizeDefinition(composite));
    migratedItems.push({
      id: firstItem.id,
      exerciseId: composite.id,
      type: "superset"
    });
    changed = true;
  }
  migratedItems.forEach(function (item) {
    delete item.supersetGroup;
  });
  program.items = migratedItems;
  return changed;
}

function restoreData(raw) {
  if (!raw || !Array.isArray(raw.definitions) || (!raw.program && !Array.isArray(raw.programs))) return null;
  const definitions = sanitizeDefinitions(raw.definitions);
  const sourcePrograms = Array.isArray(raw.programs) ? raw.programs : [raw.program];
  if (raw.program && !sourcePrograms.some(function (program) {
    return program === raw.program || (raw.program.id && program.id === raw.program.id);
  })) {
    sourcePrograms.push(raw.program);
  }
  const programs = sourcePrograms.filter(Boolean).map(function (program) { return sanitizeProgram(program, definitions); });
  const sourceForLegacyCheck = Array.isArray(raw.programs) ? raw.programs : [raw.program];
  const hasLegacyRests = raw.definitions.some(function (definition) {
    return definition && ("restMode" in definition || "restBetweenMovementsSeconds" in definition || "restBetweenRoundsSeconds" in definition ||
      (Array.isArray(definition.movements) && definition.movements.some(function (movement) { return movement && "restAfterSeconds" in movement; })));
  }) || sourceForLegacyCheck.some(function (program) {
    return program && ("restBetweenExercisesSeconds" in program || (Array.isArray(program.items) && program.items.some(function (item) {
      return item && ("restBetweenSetsSeconds" in item || "restBetweenMovementsSeconds" in item);
    })));
  });
  let migrated = hasLegacyRests || !Array.isArray(raw.programs) || (raw.programs.length > 0 && !raw.activeProgramId) || Boolean(raw.program && !raw.program.id);
  programs.forEach(function (program) {
    if (migrateProgramSupersets(definitions, program)) migrated = true;
  });
  const activeId = typeof raw.activeProgramId === "string" && programs.some(function (program) { return program.id === raw.activeProgramId; })
    ? raw.activeProgramId
    : (raw.program && programs.some(function (program) { return program.id === raw.program.id; }) ? raw.program.id : programs[0] && programs[0].id);
  const activeProgram = programs.find(function (program) { return program.id === activeId; }) || null;
  return { data: { definitions: definitions, programs: programs, activeProgramId: activeId, program: activeProgram }, migrated: migrated };
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
          supersetGroup: typeof item.supersetGroup === "string" ? item.supersetGroup : ""
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
        themeColor: PROGRAM_THEMES[0],
        items: normalizeSupersets(items)
      };
      migrateProgramSupersets(definitions, program);
      const programId = createId();
      program.id = programId;
      const data = { definitions: definitions, programs: [program], activeProgramId: programId, program: program };
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
    programs: [],
    activeProgramId: null,
    program: null
  };
}

function saveData() {
  try {
    if (state.program) {
      const index = state.programs.findIndex(function (program) { return program.id === state.program.id; });
      if (index < 0) state.programs.push(state.program);
      else state.programs[index] = state.program;
      state.activeProgramId = state.program.id;
    }
    window.localStorage.setItem(DATA_KEY, JSON.stringify({
      definitions: state.definitions,
      programs: state.programs,
      activeProgramId: state.activeProgramId
    }));
    return true;
  } catch (error) {
    window.alert("ذخیره‌سازی در این مرورگر در دسترس نیست.");
    return false;
  }
}

function getDefinition(id) {
  if (id === REST_DEFINITION_ID) return { id: REST_DEFINITION_ID, name: "استراحت", type: "rest" };
  if (composer && composer.editing && composer.definition && composer.definition.id === id) return composer.definition;
  return state.definitions.find(function (definition) { return definition.id === id; });
}

function getEditableDefinition(id) {
  if (composer && composer.definition && composer.definition.id === id) return composer.definition;
  return getDefinition(id);
}

function autoSupersetName(definition) {
  if (!definition || definition.type !== "superset") return "";
  return definition.movements.filter(function (movement) { return movement.type !== "rest"; }).slice(0, 2).map(function (movement) {
    const child = getDefinition(movement.exerciseId) ||
      (composer && composer.definition && composer.definition.id === movement.exerciseId ? composer.definition : null);
    return child ? child.name : "";
  }).filter(Boolean).join(" + ");
}

function durationLabel(duration) {
  return duration === "" || duration === null || typeof duration === "undefined"
    ? "مدت مشخص نشده"
    : number(duration) + " ثانیه";
}

function getProgramItem(id) {
  return state.program && state.program.items.find(function (item) { return item.id === id; });
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

function readProgramId() {
  const match = window.location.hash.match(/^#program\/(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return null;
  }
}

function renderNav() {
  return '<nav class="page-nav" aria-label="فهرست‌های hido-co">' +
    '<a href="./programs.html" class="' + (pageKind === "programs" ? "active" : "") + '">برنامه‌ها</a>' +
    '<a href="./exercises.html" class="' + (pageKind === "exercises" ? "active" : "") + '">حرکت‌ها</a></nav>';
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
  if (item.type === "rest") {
    return '<article class="program-movement rest-program-movement"><div class="program-movement-heading"><span class="pair-marker">استراحت</span><strong>استراحت</strong>' +
      '<button class="small-action remove-action" type="button" data-action="remove-program-item" data-id="' + escapeHtml(item.id) + '">حذف از برنامه</button></div>' +
      '<label class="field-label">مدت استراحت <span>(ثانیه)</span><input class="number-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="durationSeconds" type="text" inputmode="numeric" autocomplete="off" placeholder="ثانیه را وارد کن" value="' + numberInput(item.durationSeconds) + '"></label></article>';
  }
  const definition = getDefinition(item.exerciseId);
  if (!definition) return "";
  if (definition.type === "superset") {
    const preview = definition.movements.map(function (movement, index) {
      if (movement.type === "rest") {
        return '<li class="superset-preview-rest"><span>' + number(index + 1) + '. استراحت</span><small>' + durationLabel(movement.durationSeconds) + '</small></li>';
      }
      const child = getDefinition(movement.exerciseId);
      if (!child) return "";
      const dose = number(movement.reps) + " تکرار";
      const weight = movement.weightKg === "" ? "" : " · " + number(movement.weightKg) + " کیلوگرم";
      return '<li><span>' + number(index + 1) + '. ' + escapeHtml(child.name) + '</span><small>' + dose + weight + '</small></li>';
    }).join("");
    return '<article class="program-movement compound-program-movement"><div class="program-movement-heading"><span class="pair-marker">سوپرست</span>' +
      '<strong>' + escapeHtml(definition.name) + '</strong><a href="./exercise-editor.html#definition/' + encodeURIComponent(definition.id) + '">ویرایش سوپرست</a>' +
      '<button class="small-action remove-action" type="button" data-action="remove-program-item" data-id="' + escapeHtml(item.id) + '">حذف از برنامه</button></div>' +
      '<div class="compound-summary"><strong>' + number(definition.rounds) + ' ست سوپرست</strong></div>' +
      (countSupersetExercises(definition) >= 2 && preview ? '<ol class="compound-preview">' + preview + '</ol>' : '<p class="field-help">برای استفاده در برنامه، دست‌کم دو حرکت تکی به این سوپرست اضافه کن.</p>') + '</article>';
  }
  const typeOptions = '<option value="reps" ' + (item.type === "reps" ? "selected" : "") + '>تکراری</option>' +
    '<option value="time" ' + (item.type === "time" ? "selected" : "") + '>تایمی</option>';
  const amountControl = item.type === "reps"
    ? '<label class="field-label">تکرار در هر ست<input class="number-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="reps" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(item.reps) + '"></label>'
    : '<label class="field-label">زمان هر حرکت <span>(ثانیه)</span><input class="number-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="durationSeconds" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(item.durationSeconds) + '"></label>';
  return '<article class="program-movement">' +
    '<div class="program-movement-heading"><span class="pair-marker">تکی</span>' +
    '<strong>' + escapeHtml(definition.name) + '</strong>' +
    '<a href="./exercise-editor.html#definition/' + encodeURIComponent(definition.id) + '">ویرایش حرکت</a>' +
    '<button class="small-action remove-action" type="button" data-action="remove-program-item" data-id="' + escapeHtml(item.id) + '">حذف از برنامه</button></div>' +
    '<div class="prescription-grid">' +
    '<label class="field-label">نوع اجرا<select class="select-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="type">' + typeOptions + '</select></label>' +
    '<label class="field-label">تعداد ست<input class="number-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="sets" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(item.sets) + '"></label>' +
    amountControl +
    '<label class="field-label">وزنه <span>(کیلوگرم، اختیاری)</span><input class="number-input" data-item-id="' + escapeHtml(item.id) + '" data-item-field="weightKg" type="text" inputmode="decimal" autocomplete="off" placeholder="وزن بدن" value="' + numberInput(item.weightKg) + '"></label>' +
    '</div></article>';
}

function renderProgramBlock(block, index, blocks) {
  const item = block.items[0];
  const definition = item.type === "rest" ? null : getDefinition(item.exerciseId);
  const isSuperset = definition && definition.type === "superset";
  return '<section class="program-block ' + (item.type === "rest" ? "is-rest" : isSuperset ? "is-superset" : "is-single") + '">' +
    '<div class="program-block-items">' + renderProgramItem(item) + '</div>' +
    '<div class="block-footer"><span></span><div class="block-actions">' +
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
  if (item.type === "rest") {
    return '<section class="program-item rest-item"><h2>' + number(index + 1) + '. استراحت</h2><p class="summary">مدت استراحت: ' + escapeHtml(durationLabel(item.durationSeconds)) + '</p></section>';
  }
  const definition = getDefinition(item.exerciseId);
  if (!definition) return "";
  let details = "";

  if (definition.type === "superset") {
    const movements = definition.movements.map(function (movement, movementIndex) {
      if (movement.type === "rest") return '<li><strong>' + number(movementIndex + 1) + '. استراحت</strong><span>' + escapeHtml(durationLabel(movement.durationSeconds)) + '</span></li>';
      const child = getDefinition(movement.exerciseId);
      if (!child) return "";
      const amount = number(movement.reps) + " تکرار";
      const weight = movement.weightKg === "" ? "" : " · " + number(movement.weightKg) + " کیلوگرم";
      return '<li><strong>' + number(movementIndex + 1) + ". " + escapeHtml(child.name) +
        '</strong><span>' + amount + weight + '</span></li>';
    }).join("");
    details = '<p class="summary">' + number(definition.rounds) + " ست سوپرست</p><ol>" + movements + "</ol>";
  } else {
    const amount = item.type === "reps"
      ? number(item.reps) + " تکرار در هر ست"
      : number(item.durationSeconds) + " ثانیه برای هر ست";
    const weight = item.weightKg === "" ? "" : " · وزنهٔ " + number(item.weightKg) + " کیلوگرم";
    details = '<p class="summary">' + number(item.sets) + " ست · " + amount + weight + "</p>";
  }
  return '<section class="program-item"><h2>' + number(index + 1) + ". " +
    escapeHtml(definition.name) + '</h2>' + details + "</section>";
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
    escapeHtml(state.program.name) + " | hido-co</title><style>" + embeddedFont +
    'body{margin:0;background:#f4f5ef;color:#17261e;font-family:Vazirmatn,Tahoma,sans-serif;font-size:17px;line-height:1.9;font-feature-settings:"ss01"}' +
    '.sheet{max-width:760px;margin:30px auto;padding:28px;background:white;border-radius:20px;box-shadow:0 12px 36px #17261e18}' +
    'h1{margin:0 0 8px;font-size:28px;color:' + normalizeProgramTheme(state.program.themeColor) + '}.subtitle{color:#667269;margin:0 0 22px}.program-item{padding:16px 12px 16px 0;border-top:1px solid #e5e8df;border-inline-start:4px solid ' + normalizeProgramTheme(state.program.themeColor) + '}' +
    'h2{margin:0 0 7px;font-size:20px}.summary{margin:0 0 10px;color:#465349}.program-item ol{display:grid;gap:8px;padding:0;list-style:none}' +
    '.program-item li{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.block-rest{margin:8px 0 0;color:#667269;font-size:14px}' +
    '.toolbar{position:sticky;top:0;padding:12px;text-align:center;background:#f4f5ef}.toolbar button{min-height:44px;padding:0 18px;border:0;border-radius:12px;background:#17261e;color:white;font:inherit;font-weight:700}' +
    '.license{margin-top:20px;color:#667269;font-size:12px}.license pre{overflow:auto;white-space:pre-wrap;direction:ltr;text-align:left;font:11px monospace}' +
    '@media print{body{background:white}.toolbar{display:none}.sheet{margin:0 auto;padding:0;box-shadow:none}.program-item{break-inside:avoid}}' +
    '</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">چاپ / ذخیره به صورت PDF</button></div>' +
    '<main class="sheet"><h1>' + escapeHtml(state.program.name) + '</h1><p class="subtitle">برنامهٔ تمرینی ساخته‌شده با hido-co</p>' +
    content + licenseSection + "</main></body></html>";

  const filename = (state.program.name || "hido").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 70) || "hido";
  const fileUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = "hido-co-" + filename + ".html";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(function () { URL.revokeObjectURL(fileUrl); }, 1000);
}

function buildProgramJson(program) {
  return {
    format: "hido-program",
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    program: {
      name: program.name,
      themeColor: normalizeProgramTheme(program.themeColor),
      items: program.items.map(function (item) {
        if (item.type === "rest") return { type: "rest", durationSeconds: item.durationSeconds === "" ? null : item.durationSeconds };
        const definition = getDefinition(item.exerciseId);
        if (!definition) return null;
        const primaryMuscles = definition.type === "single"
          ? definition.primary.map(function (group) { return MUSCLE_NAMES[group] || group; })
          : [];
        const secondaryMuscles = definition.type === "single"
          ? definition.secondary.map(function (group) { return MUSCLE_NAMES[group] || group; })
          : [];
        if (definition.type === "superset") {
          return {
            type: "superset",
            name: definition.name,
            rounds: definition.rounds,
            movements: definition.movements.map(function (movement) {
              if (movement.type === "rest") {
                return { type: "rest", durationSeconds: movement.durationSeconds === "" ? null : movement.durationSeconds };
              }
              const child = getDefinition(movement.exerciseId);
              if (!child) return null;
              return {
                name: child.name,
                type: "single",
                reps: movement.reps,
                weightKg: movement.weightKg,
                primaryMuscles: child.primary.map(function (group) { return MUSCLE_NAMES[group] || group; }),
                secondaryMuscles: child.secondary.map(function (group) { return MUSCLE_NAMES[group] || group; })
              };
            }).filter(Boolean)
          };
        }
        return {
          type: "single",
          name: definition.name,
          executionType: item.type,
          sets: item.sets,
          reps: item.reps,
          durationSeconds: item.durationSeconds,
          weightKg: item.weightKg,
          primaryMuscles: primaryMuscles,
          secondaryMuscles: secondaryMuscles
        };
      }).filter(Boolean)
    }
  };
}

function exportProgramJson(programId) {
  const program = programId
    ? state.programs.find(function (candidate) { return candidate.id === programId; })
    : state.program;
  if (!program) return;
  const json = JSON.stringify(buildProgramJson(program), null, 2);
  const filename = (program.name || "program").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 70) || "program";
  const fileUrl = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = "hido-co-" + filename + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(function () { URL.revokeObjectURL(fileUrl); }, 1000);
}

function renderProgramPage() {
  const program = state.program;
  if (!program) {
    return '<section class="page program-page"><header class="page-heading"><p class="eyebrow">hido-co · برنامهٔ تازه</p>' +
      '<h1>افزودن برنامه</h1><p class="page-intro">نام برنامه را وارد کن؛ استراحت‌ها را هرجا لازم است به شکل آیتم مستقل اضافه کن.</p>' +
      '<div class="heading-actions"><a class="small-action" href="./programs.html">بازگشت به فهرست برنامه‌ها</a></div></header>' +
      '<form class="plan-settings program-create-form" data-form="save-program"><label class="field-label">نام برنامه<input class="text-input" name="program-name" maxlength="80" autocomplete="off" placeholder="مثلاً تمرین بالاتنه" required></label>' +
      '<button class="primary-button" type="submit">ساخت برنامه و ادامه</button></form></section>';
  }
  const blocks = getProgramBlocks();
  const blockHtml = blocks.map(function (block, index) {
    return renderProgramBlock(block, index, blocks);
  }).join("");
  return '<section class="page program-page" style="--program-theme:' + normalizeProgramTheme(program.themeColor) + '"><header class="page-heading"><p class="eyebrow">hido-co · مربی</p>' +
    '<h1>نوشتن برنامه</h1><p class="page-intro">حرکت، سوپرست یا استراحت را اضافه کن و ترتیب بخش‌ها را بچین.</p>' +
    '<div class="heading-actions"><a class="small-action" href="./programs.html">فهرست برنامه‌ها</a><button class="export-button" type="button" data-action="export-program-json">دریافت JSON</button><button class="small-action" type="button" data-action="export-program">خروجی HTML آفلاین</button></div></header>' +
    '<section class="plan-settings"><div class="section-heading"><div><p class="eyebrow">تنظیم برنامه</p><h2>مشخصات برنامه</h2></div></div>' +
    '<label class="field-label">نام برنامه<input class="text-input" data-program-field="name" maxlength="80" value="' + escapeHtml(program.name) + '"></label>' +
    '<button class="small-action program-theme-button" type="button" data-action="open-program-theme-picker"><span class="theme-preview-dot" style="--swatch:' + normalizeProgramTheme(program.themeColor) + '"></span>تم برنامه</button></section>' +
    '<div class="program-add-actions"><button class="primary-button" type="button" data-action="open-program-movement-picker">افزودن حرکت یا استراحت</button></div>' +
    '<div class="section-heading movement-section-heading"><div><p class="eyebrow">چیدمان تمرین</p><h2>بخش‌های برنامه <span class="heading-count">' + number(program.items.length) + '</span></h2></div></div>' +
    (blocks.length ? '<div class="program-block-list">' + blockHtml + '</div>' :
      '<div class="empty-state compact-empty"><strong>برنامه هنوز خالی است</strong><p>حرکت، سوپرست یا استراحت را از فهرست بالا اضافه کن.</p></div>') +
    '</section>';
}

function renderDefinitionList() {
  function rowsFor(definitions) {
    return definitions.map(function (definition, index) {
    const meta = definition.type === "superset"
      ? "ترکیبی · " + number(countSupersetExercises(definition)) + " حرکت"
      : "تکی · " + number(definition.primary.length) + " ماهیچهٔ اصلی · " + number(definition.secondary.length) + " فرعی";
    return '<article class="exercise-row"><span class="exercise-number">' + number(index + 1) +
      '</span><span class="exercise-copy"><strong>' + escapeHtml(definition.name) + '</strong><span class="exercise-meta">' + meta + '</span></span>' +
      '<div class="exercise-row-actions"><a class="small-action icon-action" href="./exercise-editor.html#definition/' + encodeURIComponent(definition.id) + '" aria-label="ویرایش ' + escapeHtml(definition.name) + '" title="ویرایش">✎</a>' +
      '<button class="small-action icon-action remove-action" type="button" data-action="delete-definition" data-id="' + escapeHtml(definition.id) + '" aria-label="حذف ' + escapeHtml(definition.name) + '" title="حذف">🗑</button></div></article>';
    }).join("");
  }
  const singles = state.definitions.filter(function (definition) { return definition.type === "single"; });
  const supersets = state.definitions.filter(function (definition) { return definition.type === "superset"; });
  return '<section class="page library-page"><header class="page-heading"><p class="eyebrow">hido-co · کتابخانهٔ حرکت‌ها</p>' +
    '<h1>فهرست حرکت‌ها</h1><p class="page-intro">حرکت‌های تکی و سوپرست‌های تعریف‌شده را اینجا مدیریت کن.</p>' +
    '<div class="heading-actions"><a class="primary-button link-button" href="./exercise-editor.html">افزودن حرکت</a></div></header>' +
    '<section class="definition-library-section"><div class="section-heading"><div><p class="eyebrow">حرکت عادی</p><h2>حرکت‌های تکی <span class="heading-count">' + number(singles.length) + '</span></h2></div>' +
    '</div>' +
    (singles.length ? '<div class="exercise-list">' + rowsFor(singles) + '</div>' : '<div class="empty-state compact-empty"><strong>حرکت تکی‌ای نیست</strong><p>با دکمهٔ افزودن حرکت، اولین حرکت را تعریف کن.</p></div>') + '</section>' +
    '<section class="definition-library-section"><div class="section-heading"><div><p class="eyebrow">ترکیبی</p><h2>سوپرست‌ها <span class="heading-count">' + number(supersets.length) + '</span></h2></div>' +
    '</div>' +
    (supersets.length ? '<div class="exercise-list">' + rowsFor(supersets) + '</div>' : '<div class="empty-state compact-empty"><strong>سوپرستی تعریف نشده</strong><p>با دکمهٔ افزودن سوپرست، چند حرکت تکی را به ترتیب بچین.</p></div>') +
    '</section></section>';
}

function renderExerciseEditorPage() {
  if (!composer || !["single", "superset"].includes(composer.type)) {
    return '<section class="page library-page exercise-editor-page"><header class="page-heading"><p class="eyebrow">hido-co · کتابخانهٔ حرکت‌ها</p>' +
      '<h1>افزودن حرکت</h1><p class="page-intro">نوع حرکتی را که می‌خواهی تعریف کنی انتخاب کن.</p>' +
      '<div class="heading-actions"><a class="small-action" href="./exercises.html">بازگشت به فهرست حرکت‌ها</a></div></header>' +
      '<div class="exercise-type-choices"><a class="exercise-type-choice" href="./exercise-editor.html?type=single"><span class="exercise-type-icon">＋</span><span><strong>حرکت تکی</strong><small>نام حرکت و ماهیچه‌های اصلی و فرعی</small></span><span class="row-arrow">←</span></a>' +
      '<a class="exercise-type-choice is-superset" href="./exercise-editor.html?type=superset"><span class="exercise-type-icon">↔</span><span><strong>سوپرست</strong><small>چند حرکت تکی با ترتیب، ست و استراحت مشترک</small></span><span class="row-arrow">←</span></a></div></section>';
  }

  const definition = composer.definition;
  const editing = Boolean(composer.editing);
  const isSuperset = composer.type === "superset";
  const title = isSuperset ? (editing ? "ویرایش سوپرست" : "افزودن سوپرست") : (editing ? "ویرایش حرکت تکی" : "افزودن حرکت تکی");
  const header = '<header class="page-heading"><p class="eyebrow">hido-co · تعریف حرکت</p><h1>' + title + '</h1>' +
    '<p class="page-intro">' + (isSuperset ? "حرکت‌ها را به ترتیب اضافه کن؛ نام سوپرست از دو حرکت اول ساخته می‌شود." : "نام حرکت را بنویس و ماهیچه‌های اصلی و فرعی را انتخاب کن.") + '</p>' +
    '<div class="heading-actions"><a class="small-action" href="./exercises.html">بازگشت به فهرست حرکت‌ها</a></div></header>';

  if (!isSuperset) {
    return '<section class="page library-page exercise-editor-page">' + header +
      '<form class="exercise-editor-panel single-composer-form" data-form="save-single-composer">' +
      '<label class="field-label modal-name-field">نام حرکت<input class="text-input" data-single-draft-name maxlength="80" autocomplete="off" placeholder="مثلاً پرس سینه" value="' + escapeHtml(definition.name) + '" required></label>' +
      '<div class="muscle-editor">' + renderMuscleEditor(definition) + '</div>' +
      '<div class="exercise-editor-actions"><a class="small-action" href="./exercises.html">انصراف</a><button class="primary-button" type="submit">' + (editing ? "ذخیره تغییرات" : "ساخت حرکت") + '</button></div></form></section>';
  }

  const generatedName = autoSupersetName(definition) || "نام سوپرست بر اساس حرکت‌های اول و دوم ساخته می‌شود";
  return '<section class="page library-page exercise-editor-page">' + header +
    '<div class="exercise-editor-panel superset-editor-panel"><p class="auto-superset-name" data-auto-superset-name>' + escapeHtml(generatedName) + '</p>' +
    renderSupersetDefinitionEditor(definition, false) +
    '<div class="exercise-editor-actions"><a class="small-action" href="./exercises.html">انصراف</a><button class="primary-button" type="button" data-action="save-superset-composer" ' + (countSupersetExercises(definition) < 2 ? "disabled" : "") + '>' + (editing ? "ذخیره تغییرات" : "ساخت سوپرست") + '</button></div></div></section>';
}

function renderProgramListPage() {
  const cards = state.programs.map(function (program) {
    return '<article class="program-list-card" style="--program-theme:' + normalizeProgramTheme(program.themeColor) + '"><h2>' + escapeHtml(program.name) + '</h2>' +
      '<div class="program-card-actions"><a class="small-action icon-action" href="./program-editor.html#program/' + encodeURIComponent(program.id) + '" aria-label="ویرایش برنامهٔ ' + escapeHtml(program.name) + '" title="ویرایش">✎</a>' +
      '<button class="small-action icon-action remove-action" type="button" data-action="delete-program" data-id="' + escapeHtml(program.id) + '" aria-label="حذف برنامهٔ ' + escapeHtml(program.name) + '" title="حذف">🗑</button></div></article>';
  }).join("");
  return '<section class="page library-page"><header class="page-heading"><p class="eyebrow">hido-co · مربی</p><h1>برنامه‌های من</h1>' +
    '<p class="page-intro">برنامه‌ها را جدا نگه دار و هر کدام را مستقل ویرایش کن.</p></header>' +
    '<div class="section-heading program-list-heading"><div><p class="eyebrow">کتابخانه</p><h2>فهرست برنامه‌ها <span class="heading-count">' + number(state.programs.length) + '</span></h2></div>' +
    '<a class="primary-button link-button" href="./program-editor.html">افزودن برنامه</a></div>' +
    (cards ? '<div class="program-list">' + cards + '</div>' : '<div class="empty-state"><strong>هنوز برنامه‌ای نساختی</strong><p>افزودن برنامه را بزن و نامش را وارد کن.</p></div>') + '</section>';
}

function renderComposerModal() {
  if (!composer) return "";
  if (composer.type === "program-theme") {
    const selected = normalizeProgramTheme(state.program && state.program.themeColor);
    const swatches = PROGRAM_THEMES.map(function (color, index) {
      return '<button class="theme-swatch ' + (selected === color ? "is-selected" : "") + '" type="button" data-action="select-program-theme" data-theme-color="' + color + '" style="--swatch:' + color + '" aria-label="تم شمارهٔ ' + number(index + 1) + '" aria-pressed="' + String(selected === color) + '">' + (selected === color ? "✓" : "") + '</button>';
    }).join("");
    return '<div class="modal-backdrop" data-modal-backdrop><section class="composer-modal theme-picker-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title">' +
      '<div class="modal-heading"><div><p class="eyebrow">ظاهر برنامه</p><h2 id="composer-title">تم برنامه</h2></div>' +
      '<button class="small-action icon-action" type="button" data-action="close-composer" aria-label="بستن">×</button></div>' +
      '<p class="field-help">رنگ انتخابی در کارت برنامه و صفحهٔ hido-show هم نمایش داده می‌شود.</p><div class="theme-swatches" role="group" aria-label="انتخاب یکی از ده رنگ">' + swatches + '</div>' +
      '<div class="modal-actions"><button class="small-action" type="button" data-action="close-composer">بستن</button></div></section></div>';
  }
  if (composer.type === "single") {
    const definition = composer.definition;
    const editing = Boolean(composer.editing);
    return '<div class="modal-backdrop" data-modal-backdrop><section class="composer-modal single-composer-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title">' +
      '<div class="modal-heading"><div><p class="eyebrow">حرکت تکی</p><h2 id="composer-title">' + (editing ? "ویرایش حرکت" : "افزودن حرکت") + '</h2></div>' +
      '<button class="small-action icon-action" type="button" data-action="close-composer" aria-label="بستن">×</button></div>' +
      '<form class="single-composer-form" data-form="save-single-composer"><label class="field-label modal-name-field">نام حرکت<input class="text-input" data-single-draft-name maxlength="80" autocomplete="off" placeholder="مثلاً پرس سینه" value="' + escapeHtml(definition.name) + '" required></label>' +
      '<div class="muscle-editor">' + renderMuscleEditor(definition) + '</div>' +
      '<div class="modal-actions"><button class="small-action" type="button" data-action="close-composer">انصراف</button>' +
      '<button class="primary-button" type="submit">' + (editing ? "ذخیره تغییرات" : "ساخت حرکت") + '</button></div></form></section></div>';
  }
  if (composer.type === "superset") {
    const definition = composer.definition;
    const editing = Boolean(composer.editing);
    const generatedName = autoSupersetName(definition) || "نام سوپرست بر اساس حرکت‌های اول و دوم ساخته می‌شود";
    return '<div class="modal-backdrop" data-modal-backdrop><section class="composer-modal superset-composer-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title">' +
      '<div class="modal-heading"><div><p class="eyebrow">ترکیبی · سوپرست</p><h2 id="composer-title">' + (editing ? "ویرایش سوپرست" : "افزودن سوپرست") + '</h2></div>' +
      '<button class="small-action icon-action" type="button" data-action="close-composer" aria-label="بستن">×</button></div>' +
      '<p class="auto-superset-name" data-auto-superset-name>' + escapeHtml(generatedName) + '</p>' +
      renderSupersetDefinitionEditor(definition, true) +
      '<div class="modal-actions"><button class="small-action" type="button" data-action="close-composer">انصراف</button>' +
      '<button class="primary-button" type="button" data-action="save-superset-composer" ' + (countSupersetExercises(definition) < 2 ? "disabled" : "") + '>' +
      (editing ? "ذخیره تغییرات" : "ساخت سوپرست") + '</button></div></section></div>';
  }
  if (composer.type === "program-movement") {
    const singles = state.definitions.filter(function (definition) { return definition.type === "single"; });
    const supersets = state.definitions.filter(function (definition) { return definition.type === "superset" && countSupersetExercises(definition) >= 2; });
    const options = '<option value="">انتخاب حرکت</option><option value="' + REST_DEFINITION_ID + '">استراحت</option>' +
      (singles.length ? '<optgroup label="حرکت‌های تکی">' + singles.map(function (definition) {
        return '<option value="' + escapeHtml(definition.id) + '">' + escapeHtml(definition.name) + '</option>';
      }).join("") + '</optgroup>' : "") +
      (supersets.length ? '<optgroup label="سوپرست‌ها">' + supersets.map(function (definition) {
        return '<option value="' + escapeHtml(definition.id) + '">' + escapeHtml(definition.name) + '</option>';
      }).join("") + '</optgroup>' : "");
    return '<div class="modal-backdrop" data-modal-backdrop><section class="composer-modal program-picker-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title">' +
      '<div class="modal-heading"><div><p class="eyebrow">افزودن به برنامه</p><h2 id="composer-title">انتخاب حرکت</h2></div>' +
      '<button class="small-action icon-action" type="button" data-action="close-composer" aria-label="بستن">×</button></div>' +
      '<form class="program-picker-form" data-form="add-program-item"><label class="field-label">حرکت تعریف‌شده<select class="select-input" name="definition-id" required>' + options + '</select></label>' +
      '<div class="modal-actions"><button class="small-action" type="button" data-action="close-composer">انصراف</button><button class="primary-button" type="submit">افزودن به برنامه</button></div></form></section></div>';
  }
  if (composer.type === "program-creator") {
    return '<div class="modal-backdrop" data-modal-backdrop><section class="composer-modal program-creator-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title">' +
      '<div class="modal-heading"><div><p class="eyebrow">برنامهٔ تازه</p><h2 id="composer-title">افزودن برنامه</h2></div>' +
      '<button class="small-action icon-action" type="button" data-action="close-composer" aria-label="بستن">×</button></div>' +
      '<form class="program-creator-form" data-form="save-program"><label class="field-label">نام برنامه<input class="text-input" name="program-name" maxlength="80" autocomplete="off" placeholder="مثلاً تمرین بالاتنه" required></label>' +
      '<div class="modal-actions"><button class="small-action" type="button" data-action="close-composer">انصراف</button><button class="primary-button" type="submit">ساخت برنامه</button></div></form></section></div>';
  }
  return "";
}

function renderDefinitionEditor(definition) {
  const typeLabel = definition.type === "superset" ? "ترکیبی · سوپرست" : "حرکت تکی";
  const editorBody = definition.type === "superset"
    ? renderSupersetDefinitionEditor(definition, false)
    : '<div class="muscle-editor">' + renderMuscleEditor(definition) + '</div>';
  return '<section class="definition-editor ' + (definition.type === "superset" ? "superset-definition-editor" : "") + '"><div class="detail-top"><button class="back-button" type="button" data-action="back-to-library" aria-label="بازگشت به فهرست">←</button>' +
    '<div class="detail-title"><p class="eyebrow">ویرایش تعریف حرکت</p><h2>' + escapeHtml(definition.name) + '</h2></div>' +
    '<button class="danger-button" type="button" data-action="delete-definition" data-id="' + escapeHtml(definition.id) + '">حذف</button></div>' +
    '<p class="definition-kind-badge">' + typeLabel + '</p>' +
    (definition.type === "single" ? '<label class="field-label">نام حرکت<input class="text-input" data-definition-field="name" maxlength="80" value="' + escapeHtml(definition.name) + '"></label>' :
      '<p class="auto-superset-name">نام خودکار: ' + escapeHtml(autoSupersetName(definition) || definition.name) + '</p>') +
    editorBody + '</section>';
}

function renderMuscleEditor(definition) {
  return '<div class="map-instructions"><span class="instruction-icon">●</span><span>نقش ماهیچه را انتخاب کن و بعد از روی شکل یا فهرست فارسی ماهیچه‌ها را بزن.</span></div>' +
    '<div class="body-map" data-body-map-for="' + escapeHtml(definition.id) + '"><img class="body-map-fallback" src="./full_body.svg" alt="نقشهٔ ماهیچه‌های بدن"></div>' +
    '<p class="map-note" role="status">ماهیچه‌های اصلی قرمز و ماهیچه‌های فرعی زرد دیده می‌شوند.</p>' +
    '<div class="map-legend"><span><i class="legend-dot primary-dot"></i>اصلی</span><span><i class="legend-dot secondary-dot"></i>فرعی</span></div>' +
    renderMusclePicker(definition) +
    '<div class="selection-toast" role="status" aria-live="polite"></div>' +
    '<div class="role-dock" data-muscle-role-dock="' + escapeHtml(definition.id) + '" role="group" aria-label="انتخاب نقش ماهیچه">' +
    '<button class="role-button active" type="button" data-action="select-muscle-role" data-definition-id="' + escapeHtml(definition.id) + '" data-role="primary" aria-pressed="true"><span>ماهیچهٔ اصلی</span><small><b data-primary-count="' + escapeHtml(definition.id) + '">' + number(definition.primary.length) + '</b> انتخاب</small></button>' +
    '<button class="role-button" type="button" data-action="select-muscle-role" data-definition-id="' + escapeHtml(definition.id) + '" data-role="secondary" aria-pressed="false"><span>ماهیچهٔ فرعی</span><small><b data-secondary-count="' + escapeHtml(definition.id) + '">' + number(definition.secondary.length) + '</b> انتخاب</small></button>' +
    '</div>';
}

function renderMusclePicker(definition) {
  const buttons = MUSCLE_GROUPS.map(function (group) {
    const role = definition.primary.includes(group) ? "primary" :
      definition.secondary.includes(group) ? "secondary" : "";
    const stateLabel = role === "primary" ? "اصلی" : role === "secondary" ? "فرعی" : "انتخاب";
    return '<button class="muscle-option ' + (role ? "is-" + role : "") +
      '" type="button" data-action="toggle-muscle" data-muscle="' + escapeHtml(group) +
      '" data-definition-id="' + escapeHtml(definition.id) + '" data-muscle-option aria-pressed="' + String(role === activeMuscleRole) + '">' +
      '<span>' + escapeHtml(MUSCLE_NAMES[group]) + '</span><small class="muscle-option-state">' +
      stateLabel + "</small></button>";
  }).join("");
  return '<section class="muscle-picker" data-muscle-picker-for="' + escapeHtml(definition.id) + '" aria-label="انتخاب ماهیچه از فهرست"><h3>انتخاب از فهرست فارسی</h3>' +
    '<p class="field-help">هر بار زدن، ماهیچه را به نقش انتخاب‌شده اضافه یا از همان نقش حذف می‌کند.</p>' +
    '<div class="muscle-picker-list">' + buttons + "</div></section>";
}

function renderSupersetDefinitionEditor(definition, inModal) {
  const singles = state.definitions.filter(function (candidate) { return candidate.type === "single"; });
  const options = singles.map(function (candidate) {
    return '<option value="' + escapeHtml(candidate.id) + '">' + escapeHtml(candidate.name) + '</option>';
  }).join("");
  const movements = definition.movements.map(function (movement, index) {
    if (movement.type === "rest") {
      return '<article class="superset-definition-movement superset-rest-movement"><div class="superset-definition-movement-heading"><span class="pair-marker">استراحت</span>' +
        '<strong>استراحت</strong><div class="member-actions">' +
        '<button class="small-action icon-action" type="button" data-action="move-superset-definition-movement" data-superset-id="' + escapeHtml(definition.id) + '" data-id="' + escapeHtml(movement.id) + '" data-direction="up" aria-label="جابجایی استراحت به بالا" ' + (index === 0 ? "disabled" : "") + '>↑</button>' +
        '<button class="small-action icon-action" type="button" data-action="move-superset-definition-movement" data-superset-id="' + escapeHtml(definition.id) + '" data-id="' + escapeHtml(movement.id) + '" data-direction="down" aria-label="جابجایی استراحت به پایین" ' + (index === definition.movements.length - 1 ? "disabled" : "") + '>↓</button></div>' +
        '<button class="small-action remove-action" type="button" data-action="remove-superset-definition-movement" data-superset-id="' + escapeHtml(definition.id) + '" data-id="' + escapeHtml(movement.id) + '">حذف</button></div>' +
        '<label class="field-label">مدت استراحت <span>(ثانیه)</span><input class="number-input" data-superset-id="' + escapeHtml(definition.id) + '" data-superset-movement-id="' + escapeHtml(movement.id) + '" data-superset-movement-field="durationSeconds" type="text" inputmode="numeric" autocomplete="off" placeholder="ثانیه را وارد کن" value="' + numberInput(movement.durationSeconds) + '"></label></article>';
    }
    const child = getDefinition(movement.exerciseId);
    if (!child) return "";
    return '<article class="superset-definition-movement"><div class="superset-definition-movement-heading"><span class="pair-marker">حرکت ' + number(index + 1) + '</span>' +
      '<strong>' + escapeHtml(child.name) + '</strong><div class="member-actions">' +
      '<button class="small-action icon-action" type="button" data-action="move-superset-definition-movement" data-superset-id="' + escapeHtml(definition.id) + '" data-id="' + escapeHtml(movement.id) + '" data-direction="up" aria-label="جابجایی حرکت به بالا" ' + (index === 0 ? "disabled" : "") + '>↑</button>' +
      '<button class="small-action icon-action" type="button" data-action="move-superset-definition-movement" data-superset-id="' + escapeHtml(definition.id) + '" data-id="' + escapeHtml(movement.id) + '" data-direction="down" aria-label="جابجایی حرکت به پایین" ' + (index === definition.movements.length - 1 ? "disabled" : "") + '>↓</button></div>' +
      '<button class="small-action remove-action" type="button" data-action="remove-superset-definition-movement" data-superset-id="' + escapeHtml(definition.id) + '" data-id="' + escapeHtml(movement.id) + '">حذف</button></div>' +
      '<div class="prescription-grid"><label class="field-label">تکرار در هر ست سوپرست<input class="number-input" data-superset-id="' + escapeHtml(definition.id) + '" data-superset-movement-id="' + escapeHtml(movement.id) + '" data-superset-movement-field="reps" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(movement.reps) + '"></label>' +
      '<label class="field-label">وزنه <span>(کیلوگرم، اختیاری)</span><input class="number-input" data-superset-id="' + escapeHtml(definition.id) + '" data-superset-movement-id="' + escapeHtml(movement.id) + '" data-superset-movement-field="weightKg" type="text" inputmode="decimal" autocomplete="off" placeholder="وزن بدن" value="' + numberInput(movement.weightKg) + '"></label></div></article>';
  }).join("");
  return '<section class="superset-definition-builder ' + (inModal ? "is-modal-builder" : "") + '">' +
    '<div class="map-instructions"><span class="instruction-icon">●</span><span>حرکت‌ها و استراحت را به ترتیب بچین. تعداد ست‌ها برای کل سوپرست و تکرار و وزنه برای هر حرکت جداگانه است.</span></div>' +
    '<form class="add-superset-movement-form" data-form="add-superset-definition-movement" data-superset-id="' + escapeHtml(definition.id) + '"><select class="select-input" name="exercise-id" aria-label="انتخاب حرکت یا استراحت برای سوپرست" required><option value="">انتخاب حرکت یا استراحت</option><option value="' + REST_DEFINITION_ID + '">استراحت</option>' + (options ? '<optgroup label="حرکت‌های تکی">' + options + '</optgroup>' : '') + '</select><button class="primary-button" type="submit">افزودن به فهرست</button></form>' +
    '<div class="superset-definition-settings"><label class="field-label">تعداد ست سوپرست <span>(هر ست یک دور کامل)</span><input class="number-input" data-superset-id="' + escapeHtml(definition.id) + '" data-superset-field="rounds" type="text" inputmode="numeric" autocomplete="off" value="' + numberInput(definition.rounds) + '"></label></div>' +
    (countSupersetExercises(definition) < 2 ? '<p class="field-help">برای ساخت سوپرست، دست‌کم دو حرکت تکی به فهرست اضافه کن.</p>' : '') +
    (definition.movements.length ? '<div class="superset-definition-list">' + movements + '</div>' :
      '<div class="empty-state compact-empty"><strong>سوپرست هنوز موردی ندارد</strong><p>از فهرست بالا حرکت‌های تکی یا استراحت را به ترتیب اضافه کن.</p></div>') + '</section>';
}

function render() {
  document.body.classList.toggle("modal-open", Boolean(composer && pageKind === "program"));
  const pageContent = pageKind === "exercises" ? renderDefinitionList() :
    pageKind === "programs" ? renderProgramListPage() :
      pageKind === "exercise-editor" ? renderExerciseEditorPage() : renderProgramPage();
  appRoot.innerHTML = pageContent + (pageKind === "program" ? renderComposerModal() : "");
  document.title = pageKind === "exercises" ? "حرکت‌ها | hido-co" :
    pageKind === "programs" ? "برنامه‌ها | hido-co" :
      pageKind === "exercise-editor" ? "افزودن حرکت | hido-co" : (state.program ? state.program.name : "افزودن برنامه") + " | hido-co";
  if (composer && composer.type === "single") attachBodyMap(composer.definition.id);
}

function persistEditedDefinition(definition) {
  if (getDefinition(definition.id) && !(composer && composer.editing)) saveData();
  render();
}

function addSupersetDefinitionMovement(form) {
  const definition = getEditableDefinition(form.dataset.supersetId);
  const exerciseId = form.elements.namedItem("exercise-id").value;
  const child = getDefinition(exerciseId);
  if (!definition || definition.type !== "superset" || !child) return;
  if (child.type === "rest") definition.movements.push({ id: createId(), type: "rest", durationSeconds: "" });
  else if (child.type === "single") definition.movements.push({ id: createId(), exerciseId: child.id, type: "reps", reps: 10, weightKg: "" });
  else return;
  definition.name = autoSupersetName(definition) || definition.name;
  persistEditedDefinition(definition);
}

function moveSupersetDefinitionMovement(movementId, direction, definitionId) {
  const definition = getEditableDefinition(definitionId || activeDefinitionId);
  if (!definition || definition.type !== "superset") return;
  const index = definition.movements.findIndex(function (movement) { return movement.id === movementId; });
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= definition.movements.length) return;
  const movement = definition.movements[index];
  definition.movements[index] = definition.movements[target];
  definition.movements[target] = movement;
  definition.name = autoSupersetName(definition) || definition.name;
  persistEditedDefinition(definition);
}

function removeSupersetDefinitionMovement(movementId, definitionId) {
  const definition = getEditableDefinition(definitionId || activeDefinitionId);
  if (!definition || definition.type !== "superset") return;
  definition.movements = definition.movements.filter(function (movement) { return movement.id !== movementId; });
  definition.name = autoSupersetName(definition) || "سوپرست ناتمام";
  persistEditedDefinition(definition);
}

function updateSupersetDefinitionField(input) {
  const definition = getEditableDefinition(input.dataset.supersetId || activeDefinitionId);
  if (!definition || definition.type !== "superset") return;
  const field = input.dataset.supersetField;
  if (field === "rounds") definition.rounds = boundedInt(input.value, definition.rounds, 1, 50);
  persistEditedDefinition(definition);
}

function updateSupersetDefinitionMovementField(input) {
  const definition = getEditableDefinition(input.dataset.supersetId || activeDefinitionId);
  if (!definition || definition.type !== "superset") return;
  const movement = definition.movements.find(function (candidate) {
    return candidate.id === input.dataset.supersetMovementId;
  });
  if (!movement) return;
  const field = input.dataset.supersetMovementField;
  if (field === "durationSeconds" && movement.type === "rest") movement.durationSeconds = cleanDuration(input.value);
  if (field === "reps") movement.reps = boundedInt(input.value, movement.reps, 1, 1000);
  if (field === "weightKg") movement.weightKg = cleanWeight(input.value);
  persistEditedDefinition(definition);
}

function saveSingleComposer() {
  const nameField = appRoot.querySelector("[data-single-draft-name]");
  const name = nameField ? nameField.value.trim() : "";
  if (!name) {
    if (nameField) nameField.focus();
    return;
  }
  const definition = composer && composer.definition;
  if (!definition || definition.type !== "single") return;
  definition.name = name;
  const existingIndex = state.definitions.findIndex(function (item) { return item.id === definition.id; });
  const previous = existingIndex >= 0 ? state.definitions[existingIndex] : null;
  if (existingIndex >= 0) state.definitions[existingIndex] = definition;
  else state.definitions.push(definition);
  state.definitions.forEach(function (candidate) {
    if (candidate.type === "superset" && candidate.movements.some(function (movement) { return movement.exerciseId === definition.id; })) {
      candidate.name = autoSupersetName(candidate) || "سوپرست ناتمام";
    }
  });
  if (!saveData()) {
    if (previous) state.definitions[existingIndex] = previous;
    else state.definitions = state.definitions.filter(function (item) { return item.id !== definition.id; });
    return;
  }
  composer = null;
  activeMuscleRole = composerPreviousMuscleRole;
  if (pageKind === "exercise-editor") {
    window.location.href = "./exercises.html";
    return;
  }
  render();
}


function saveSupersetComposer() {
  const definition = composer && composer.definition;
  if (!definition || definition.type !== "superset" || countSupersetExercises(definition) < 2) {
    window.alert("برای ساخت سوپرست دست‌کم دو حرکت لازم است.");
    return;
  }
  definition.name = autoSupersetName(definition);
  const existingIndex = state.definitions.findIndex(function (item) { return item.id === definition.id; });
  const previous = existingIndex >= 0 ? state.definitions[existingIndex] : null;
  if (existingIndex >= 0) state.definitions[existingIndex] = definition;
  else state.definitions.push(definition);
  if (!saveData()) {
    if (previous) state.definitions[existingIndex] = previous;
    else state.definitions = state.definitions.filter(function (item) { return item.id !== definition.id; });
    return;
  }
  composer = null;
  activeMuscleRole = composerPreviousMuscleRole;
  if (pageKind === "exercise-editor") {
    window.location.href = "./exercises.html";
    return;
  }
  render();
}

function openComposer(type, definitionId) {
  composerReturnAction = document.activeElement && document.activeElement.dataset
    ? document.activeElement.dataset.action || null
    : null;
  composerPreviousMuscleRole = activeMuscleRole;
  activeMuscleRole = "primary";
  const original = definitionId ? getDefinition(definitionId) : null;
  if (type === "single") {
    composer = { type: "single", definition: original ? JSON.parse(JSON.stringify(original)) : { id: createId(), name: "", type: "single", primary: [], secondary: [] }, editing: Boolean(original) };
  } else if (type === "superset") {
    composer = {
      type: "superset",
      editing: Boolean(original),
      definition: original ? JSON.parse(JSON.stringify(original)) : {
        id: createId(), name: "", type: "superset", primary: [], secondary: [], movements: [], rounds: 3
      }
    };
  } else if (type === "program-movement") {
    composer = { type: "program-movement" };
  } else if (type === "program-theme") {
    composer = { type: "program-theme" };
  } else if (type === "program-creator") {
    composer = { type: "program-creator" };
  }
  render();
  const target = composer.type === "single" ? appRoot.querySelector("[data-single-draft-name]") :
    composer.type === "superset" ? appRoot.querySelector(".add-superset-movement-form select") :
      composer.type === "program-movement" ? appRoot.querySelector("[name='definition-id']") : appRoot.querySelector("[name='program-name']");
  if (target) target.focus();
}

function closeComposer() {
  composer = null;
  activeMuscleRole = composerPreviousMuscleRole;
  render();
  if (composerReturnAction) {
    const focusTarget = appRoot.querySelector('[data-action="' + composerReturnAction + '"]');
    if (focusTarget) focusTarget.focus();
  }
}

function createProgramItem(definitionId) {
  if (definitionId === REST_DEFINITION_ID) return { id: createId(), type: "rest", durationSeconds: "" };
  const definition = getDefinition(definitionId);
  const item = {
    id: createId(),
    exerciseId: definitionId
  };
  if (definition && definition.type === "superset") {
    item.type = "superset";
    return item;
  }
  return Object.assign(item, {
    type: "reps",
    sets: 3,
    reps: 10,
    durationSeconds: 30,
    weightKg: ""
  });
}

function addProgramItem(form) {
  const definitionId = form.elements.namedItem("definition-id").value;
  if (!getDefinition(definitionId)) return;
  state.program.items.push(createProgramItem(definitionId));
  saveData();
  composer = null;
  render();
}

function saveProgram(form) {
  const name = form.elements.namedItem("program-name").value.trim();
  if (!name) return;
  const program = {
    id: createId(),
    name: name,
    themeColor: PROGRAM_THEMES[0],
    items: []
  };
  const previousProgram = state.program;
  const previousProgramId = state.activeProgramId;
  state.programs.push(program);
  state.program = program;
  state.activeProgramId = program.id;
  if (!saveData()) {
    state.programs = state.programs.filter(function (candidate) { return candidate.id !== program.id; });
    state.program = previousProgram;
    state.activeProgramId = previousProgramId;
    return;
  }
  composer = null;
  window.location.href = "./program-editor.html#program/" + encodeURIComponent(program.id);
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

function deleteProgram(programId) {
  const program = state.programs.find(function (candidate) { return candidate.id === programId; });
  if (!program || !window.confirm("برنامهٔ «" + program.name + "» حذف شود؟")) return;
  state.programs = state.programs.filter(function (candidate) { return candidate.id !== programId; });
  if (state.program && state.program.id === programId) {
    state.program = state.programs[0] || null;
    state.activeProgramId = state.program ? state.program.id : null;
  }
  saveData();
  render();
}

function selectProgramTheme(color) {
  if (!state.program || !PROGRAM_THEMES.includes(String(color).toLowerCase())) return;
  state.program.themeColor = String(color).toLowerCase();
  composer = null;
  saveData();
  render();
}

function deleteDefinition(id) {
  const definition = getDefinition(id);
  if (!definition || !window.confirm("حرکت «" + definition.name + "» و ردیف‌های مرتبط از همهٔ برنامه‌ها حذف شود؟")) return;
  state.definitions = state.definitions.filter(function (item) { return item.id !== id; });
  state.definitions.forEach(function (item) {
    if (item.type === "superset") {
      item.movements = item.movements.filter(function (movement) { return movement.exerciseId !== id; });
      item.name = autoSupersetName(item) || "سوپرست ناتمام";
    }
  });
  state.programs.forEach(function (program) {
    program.items = program.items.filter(function (item) {
      if (item.exerciseId === id) return false;
      const referenced = state.definitions.find(function (candidate) { return candidate.id === item.exerciseId; });
      return !(referenced && referenced.type === "superset" && countSupersetExercises(referenced) < 2);
    });
  });
  if (state.program) {
    const active = state.programs.find(function (program) { return program.id === state.program.id; });
    state.program = active || null;
  }
  saveData();
  activeDefinitionId = null;
  if (pageKind === "exercise-editor") {
    window.location.href = "./exercises.html";
    return;
  }
  window.history.replaceState({}, "", "./exercises.html");
  render();
}

function updateProgramField(input) {
  const field = input.dataset.programField;
  if (field === "name") state.program.name = input.value.trim() || "برنامهٔ تمرینی من";
  saveData();
  render();
}

function updateItemField(input) {
  const item = getProgramItem(input.dataset.itemId);
  if (!item) return;
  const field = input.dataset.itemField;
  if (item.type === "rest" && field === "durationSeconds") item.durationSeconds = cleanDuration(input.value);
  if (item.type === "rest") {
    saveData();
    render();
    return;
  }
  if (field === "type") item.type = input.value === "time" ? "time" : "reps";
  if (field === "sets") item.sets = boundedInt(input.value, item.sets, 1, 50);
  if (field === "reps") item.reps = boundedInt(input.value, item.reps, 1, 1000);
  if (field === "durationSeconds") item.durationSeconds = boundedInt(input.value, item.durationSeconds, 1, 10800);
  if (field === "weightKg") item.weightKg = cleanWeight(input.value);
  saveData();
  render();
}

function updateDefinitionField(input) {
  const definition = getDefinition(activeDefinitionId);
  if (!definition || input.dataset.definitionField !== "name") return;
  definition.name = input.value.trim() || "حرکت جدید";
  state.definitions.forEach(function (candidate) {
    if (candidate.type === "superset" && candidate.movements.some(function (movement) { return movement.exerciseId === definition.id; })) {
      candidate.name = autoSupersetName(candidate) || "سوپرست ناتمام";
    }
  });
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
  const host = Array.from(appRoot.querySelectorAll(".body-map[data-body-map-for]")).find(function (candidate) {
    return candidate.dataset.bodyMapFor === definitionId;
  });
  if (!host) return;
  try {
    const template = await loadSvgTemplate();
    const definition = getEditableDefinition(definitionId);
    if (!definition || !host.isConnected) return;
    const svg = document.importNode(template, true);
    svg.classList.add("body-map-svg");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "نقشهٔ قابل لمس ماهیچه‌ها");
    let count = 0;
    svg.querySelectorAll("g[class]").forEach(function (group) {
      const className = group.getAttribute("class").trim().replace(/\s+/g, " ");
      if (!MUSCLE_GROUPS.includes(className)) return;
      group.classList.add("muscle-area");
      group.dataset.muscle = className;
      if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        group.setAttribute("tabindex", "0");
      }
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", MUSCLE_NAMES[className] || "ماهیچه");
      group.setAttribute("title", MUSCLE_NAMES[className] || "ماهیچه");
      count += 1;
    });
    if (!count) throw new Error("No muscle groups in SVG");
    host.replaceChildren(svg);
    const note = host.closest(".muscle-editor").querySelector(".map-note");
    if (note) note.textContent = "برای انتخاب، ناحیهٔ موردنظر را لمس کن.";
    updateMuscleSelection(definitionId);
  } catch (error) {
    const note = host.closest(".muscle-editor").querySelector(".map-note");
    if (note) note.textContent = "برای انتخاب روی شکل، صفحه را از آدرس محلی یا HTTPS باز کن.";
  }
}

function updateMuscleSelection(definitionId) {
  const definition = getEditableDefinition(definitionId);
  if (!definition) return;
  appRoot.querySelectorAll(".body-map[data-body-map-for]").forEach(function (host) {
    if (host.dataset.bodyMapFor !== definitionId) return;
    host.querySelectorAll("[data-muscle]").forEach(function (area) {
      const primary = definition.primary.includes(area.dataset.muscle);
      const secondary = definition.secondary.includes(area.dataset.muscle);
      area.classList.toggle("is-primary", primary);
      area.classList.toggle("is-secondary", secondary);
      area.setAttribute("aria-pressed", String(primary || secondary));
    });
  });
  appRoot.querySelectorAll("[data-muscle-option]").forEach(function (button) {
    if (button.dataset.definitionId !== definitionId) return;
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
  const primaryCount = appRoot.querySelector('[data-primary-count="' + definitionId + '"]');
  const secondaryCount = appRoot.querySelector('[data-secondary-count="' + definitionId + '"]');
  if (primaryCount) primaryCount.textContent = number(definition.primary.length);
  if (secondaryCount) secondaryCount.textContent = number(definition.secondary.length);
  appRoot.querySelectorAll("[data-action='select-muscle-role']").forEach(function (button) {
    if (button.dataset.definitionId !== definitionId) return;
    const active = button.dataset.role === activeMuscleRole;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function toggleMuscle(group, definitionId) {
  const definition = getEditableDefinition(definitionId || activeDefinitionId);
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
  if (getDefinition(definition.id) && !(composer && composer.editing)) saveData();
  updateMuscleSelection(definition.id);
  const targetEditor = Array.from(appRoot.querySelectorAll(".muscle-editor")).find(function (candidate) {
    const host = candidate.querySelector(".body-map[data-body-map-for]");
    return host && host.dataset.bodyMapFor === definition.id;
  });
  const toast = targetEditor ? targetEditor.querySelector(".selection-toast") : null;
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
  if (form.dataset.form === "save-single-composer") saveSingleComposer();
  if (form.dataset.form === "add-program-item") addProgramItem(form);
  if (form.dataset.form === "save-program") saveProgram(form);
  if (form.dataset.form === "add-superset-definition-movement") addSupersetDefinitionMovement(form);
});

appRoot.addEventListener("pointerdown", function (event) {
  const muscleArea = event.target.closest(".body-map[data-body-map-for] g[data-muscle]");
  if (muscleArea) muscleArea.classList.add("is-pressed");
});

["pointerup", "pointercancel", "pointerleave"].forEach(function (eventName) {
  appRoot.addEventListener(eventName, function () {
    appRoot.querySelectorAll(".body-map .muscle-area.is-pressed").forEach(function (area) {
      area.classList.remove("is-pressed");
    });
  });
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
  const backdrop = event.target.closest("[data-modal-backdrop]");
  if (backdrop && event.target === backdrop) {
    closeComposer();
    return;
  }
  const muscleArea = event.target.closest(".body-map[data-body-map-for] g[data-muscle]");
  if (muscleArea) {
    event.preventDefault();
    toggleMuscle(muscleArea.dataset.muscle, muscleArea.closest(".body-map").dataset.bodyMapFor);
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  if (button.dataset.action === "open-single-composer") openComposer("single", false);
  if (button.dataset.action === "open-superset-composer") openComposer("superset", false);
  if (button.dataset.action === "open-program-movement-picker") openComposer("program-movement");
  if (button.dataset.action === "open-program-theme-picker") openComposer("program-theme");
  if (button.dataset.action === "select-program-theme") selectProgramTheme(button.dataset.themeColor);
  if (button.dataset.action === "open-program-creator") openComposer("program-creator");
  if (button.dataset.action === "edit-definition") {
    const definition = state.definitions.find(function (candidate) { return candidate.id === button.dataset.id; });
    if (definition) openComposer(definition.type, definition.id);
  }
  if (button.dataset.action === "close-composer") closeComposer();
  if (button.dataset.action === "save-superset-composer") saveSupersetComposer();
  if (button.dataset.action === "back-to-library") {
    activeDefinitionId = null;
    window.history.replaceState({}, "", "./exercises.html");
    render();
  }
  if (button.dataset.action === "delete-definition") deleteDefinition(button.dataset.id);
  if (button.dataset.action === "delete-program") deleteProgram(button.dataset.id);
  if (button.dataset.action === "toggle-muscle") toggleMuscle(button.dataset.muscle, button.dataset.definitionId);
  if (button.dataset.action === "export-program") exportProgram();
  if (button.dataset.action === "export-program-json") exportProgramJson(button.dataset.programId);
  if (button.dataset.action === "select-muscle-role") {
    activeMuscleRole = button.dataset.role === "secondary" ? "secondary" : "primary";
    updateMuscleSelection(button.dataset.definitionId);
  }
  if (button.dataset.action === "move-block") reorderBlock(button.dataset.id, button.dataset.direction);
  if (button.dataset.action === "move-superset-definition-movement") moveSupersetDefinitionMovement(button.dataset.id, button.dataset.direction, button.dataset.supersetId);
  if (button.dataset.action === "remove-superset-definition-movement") removeSupersetDefinitionMovement(button.dataset.id, button.dataset.supersetId);
  if (button.dataset.action === "remove-program-item") removeProgramItem(button.dataset.id);
});

appRoot.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && composer) {
    closeComposer();
    return;
  }
  const muscleArea = event.target.closest(".body-map[data-body-map-for] g[data-muscle]");
  if (muscleArea && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    toggleMuscle(muscleArea.dataset.muscle, muscleArea.closest(".body-map").dataset.bodyMapFor);
  }
});

window.addEventListener("popstate", function () {
  activeDefinitionId = readDefinitionId();
  activeProgramId = pageKind === "program" ? readProgramId() : readProgramId() || state.activeProgramId;
  if (activeProgramId) {
    const selected = state.programs.find(function (program) { return program.id === activeProgramId; });
    if (selected) state.program = selected;
  } else if (pageKind === "program") {
    state.program = null;
  }
  activeMuscleRole = "primary";
  if (pageKind === "exercise-editor") restoreExerciseEditor();
  else composer = null;
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
        if (offlineStatus) offlineStatus.textContent = "hido-co برای استفادهٔ آفلاین آماده است.";
      })
      .catch(function () {
        if (offlineStatus) offlineStatus.textContent = "برای آماده‌سازی آفلاین، یک‌بار به اینترنت وصل شو.";
      });
  });
} else {
  const offlineStatus = document.getElementById("offline-status");
  if (offlineStatus) offlineStatus.textContent = "این مرورگر از استفادهٔ آفلاین پشتیبانی نمی‌کند.";
}
