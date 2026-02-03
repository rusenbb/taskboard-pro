/*
TaskBoard Pro - Obsidian Plugin
*/
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => TaskBoardPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/types.ts
var COLUMN_ID_REGEX = /^[\w-]+$/;
var RESERVED_COLUMN_IDS = ["archived"];
function validateColumnId(id, existingIds, currentId) {
  const trimmedId = id.trim().toLowerCase();
  if (!trimmedId) {
    return "Column ID cannot be empty";
  }
  if (!COLUMN_ID_REGEX.test(trimmedId)) {
    return "Column ID can only contain letters, numbers, underscores, and hyphens";
  }
  if (RESERVED_COLUMN_IDS.includes(trimmedId)) {
    return `"${trimmedId}" is a reserved ID`;
  }
  const otherIds = currentId ? existingIds.filter((id2) => id2 !== currentId) : existingIds;
  if (otherIds.includes(trimmedId)) {
    return "Column ID must be unique";
  }
  return null;
}
var DEFAULT_SETTINGS = {
  columns: [
    { id: "todo", name: "To Do" },
    { id: "doing", name: "Doing" },
    { id: "done", name: "Done" }
  ],
  excludeFolders: [".obsidian", "templates"],
  includeFolders: [],
  // Empty = scan entire vault
  includeCompleted: false,
  // Three-file system defaults
  useThreeFileSystem: false,
  recurringTasksFile: "Tasks/recurring.md",
  todoFile: "Tasks/todo.md",
  archiveFile: "Tasks/archive.md"
};

// src/services/TaskScanner.ts
var import_obsidian = require("obsidian");

// src/services/TaskParser.ts
var TaskParser = class {
  /**
   * Check if a line is a task
   */
  static isTask(line) {
    return this.TASK_REGEX.test(line);
  }
  /**
   * Parse a task line into a Task object
   */
  static parse(line, filePath, lineNumber) {
    const match = line.match(this.TASK_REGEX);
    if (!match)
      return null;
    const [, , checkbox, content] = match;
    const completed = checkbox.toLowerCase() === "x";
    const dueMatch = content.match(this.DUE_DATE_REGEX);
    const scheduledMatch = content.match(this.SCHEDULED_REGEX);
    const doneMatch = content.match(this.DONE_DATE_REGEX);
    const recurrenceMatch = content.match(this.RECURRENCE_REGEX);
    const tags = content.match(this.TAG_REGEX) || [];
    const statusMatch = content.match(this.STATUS_TAG_REGEX);
    const status = statusMatch ? statusMatch[1] : null;
    const text = this.cleanText(content);
    const id = `${filePath}:${lineNumber}`;
    return {
      id,
      filePath,
      lineNumber,
      rawText: line,
      text,
      completed,
      dueDate: dueMatch ? dueMatch[1] : null,
      scheduledDate: scheduledMatch ? scheduledMatch[1] : null,
      doneDate: doneMatch ? doneMatch[1] : null,
      recurrence: recurrenceMatch ? recurrenceMatch[1].trim() : null,
      isRecurring: !!recurrenceMatch,
      tags,
      status
    };
  }
  /**
   * Remove emoji metadata from task text for display
   */
  static cleanText(content) {
    return content.replace(this.DUE_DATE_REGEX, "").replace(this.SCHEDULED_REGEX, "").replace(this.DONE_DATE_REGEX, "").replace(this.RECURRENCE_REGEX, "").replace(this.TAG_REGEX, "").replace(/\s+/g, " ").trim();
  }
};
// Regex patterns for Tasks plugin format
TaskParser.TASK_REGEX = /^(\s*)[-*+]\s*\[([ xX])\]\s*(.*)$/;
TaskParser.DUE_DATE_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/;
TaskParser.SCHEDULED_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})/;
TaskParser.DONE_DATE_REGEX = /✅\s*(\d{4}-\d{2}-\d{2})/;
TaskParser.RECURRENCE_REGEX = /🔁\s*([^📅⏳✅]+)/;
TaskParser.TAG_REGEX = /#[\w/-]+/g;
TaskParser.STATUS_TAG_REGEX = /#status\/([\w-]+)/;

// src/services/TaskScanner.ts
var TaskScanner = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
  }
  /**
   * Get tasks based on current settings (three-file or vault-wide)
   */
  async getTasks() {
    if (this.settings.useThreeFileSystem) {
      return this.scanConfiguredFiles();
    }
    return this.scanVault();
  }
  /**
   * Scan only the configured recurring and todo files (three-file mode)
   */
  async scanConfiguredFiles() {
    const tasks = [];
    const filePaths = [
      this.settings.recurringTasksFile,
      this.settings.todoFile
    ];
    for (const filePath of filePaths) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file && file instanceof import_obsidian.TFile) {
        const fileTasks = await this.scanFile(file);
        tasks.push(...fileTasks);
      } else {
        console.warn(`TaskBoard: Configured file not found: ${filePath}`);
      }
    }
    console.log(`TaskBoard: Scanned ${filePaths.length} configured files, found ${tasks.length} tasks`);
    return tasks;
  }
  /**
   * Scan the archive file for archived tasks
   */
  async scanArchiveFile() {
    const filePath = this.settings.archiveFile;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof import_obsidian.TFile)) {
      console.warn(`TaskBoard: Archive file not found: ${filePath}`);
      return [];
    }
    const tasks = await this.scanFile(file);
    console.log(`TaskBoard: Scanned archive file, found ${tasks.length} archived tasks`);
    return tasks;
  }
  /**
   * Scan all markdown files in the vault and extract tasks
   */
  async scanVault() {
    const tasks = [];
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (this.isExcluded(file.path)) {
        continue;
      }
      const fileTasks = await this.scanFile(file);
      tasks.push(...fileTasks);
    }
    console.log(`TaskBoard: Scanned ${files.length} files, found ${tasks.length} tasks`);
    return tasks;
  }
  /**
   * Scan a single file for tasks
   */
  async scanFile(file) {
    const tasks = [];
    try {
      const content = await this.app.vault.cachedRead(file);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (TaskParser.isTask(line)) {
          const task = TaskParser.parse(line, file.path, i + 1);
          if (task) {
            tasks.push(task);
          }
        }
      }
    } catch (error) {
      console.error(`TaskBoard: Error scanning ${file.path}:`, error);
    }
    return tasks;
  }
  /**
   * Check if a path should be excluded
   */
  isExcluded(path) {
    const isInExcluded = this.settings.excludeFolders.some(
      (folder) => path.startsWith(folder + "/") || path === folder
    );
    if (isInExcluded)
      return true;
    if (this.settings.includeFolders && this.settings.includeFolders.length > 0) {
      const isInIncluded = this.settings.includeFolders.some(
        (folder) => path.startsWith(folder + "/") || path === folder
      );
      return !isInIncluded;
    }
    return false;
  }
  /**
   * Filter tasks by status (for column display)
   * This is the primary method used by columns - simpler than filterTasks()
   */
  static filterTasksByStatus(tasks, statusId, includeCompleted = false) {
    const showCompleted = includeCompleted || statusId === "done";
    let filteredTasks = tasks.filter((t) => !t.tags.includes("#archived"));
    filteredTasks = showCompleted ? filteredTasks : filteredTasks.filter((t) => !t.completed);
    if (statusId === "done") {
      return filteredTasks.filter((t) => t.status === "done" || t.completed);
    }
    return filteredTasks.filter((t) => t.status === statusId);
  }
  /**
   * Filter tasks by column filter string
   * Supports: status:xxx, tag:xxx, due:today, due:overdue
   * @deprecated Use filterTasksByStatus() for column filtering
   */
  static filterTasks(tasks, filter, includeCompleted = false) {
    const [filterType, filterValue] = filter.split(":");
    const showCompleted = includeCompleted || filterValue === "done";
    let filteredTasks = tasks.filter((t) => !t.tags.includes("#archived"));
    filteredTasks = showCompleted ? filteredTasks : filteredTasks.filter((t) => !t.completed);
    switch (filterType) {
      case "status":
        if (filterValue === "done") {
          return filteredTasks.filter((t) => t.status === "done" || t.completed);
        }
        return filteredTasks.filter((t) => t.status === filterValue);
      case "tag":
        return filteredTasks.filter((t) => t.tags.includes(`#${filterValue}`));
      case "due":
        return this.filterByDue(filteredTasks, filterValue);
      case "completed":
        return tasks.filter((t) => t.completed === (filterValue === "true"));
      case "recurring":
        return filteredTasks.filter((t) => t.isRecurring === (filterValue === "true"));
      default:
        return filteredTasks;
    }
  }
  /**
   * Filter tasks by due date
   */
  static filterByDue(tasks, value) {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    return tasks.filter((task) => {
      if (!task.dueDate)
        return value === "none";
      const dueDate = new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24));
      switch (value) {
        case "today":
          return diffDays === 0;
        case "tomorrow":
          return diffDays === 1;
        case "week":
          return diffDays >= 0 && diffDays <= 7;
        case "overdue":
          return diffDays < 0;
        case "none":
          return !task.dueDate;
        default:
          return true;
      }
    });
  }
};

// src/services/TaskUpdater.ts
var import_obsidian2 = require("obsidian");

// node_modules/rrule/dist/esm/weekday.js
var ALL_WEEKDAYS = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU"
];
var Weekday = (
  /** @class */
  function() {
    function Weekday2(weekday, n) {
      if (n === 0)
        throw new Error("Can't create weekday with n == 0");
      this.weekday = weekday;
      this.n = n;
    }
    Weekday2.fromStr = function(str) {
      return new Weekday2(ALL_WEEKDAYS.indexOf(str));
    };
    Weekday2.prototype.nth = function(n) {
      return this.n === n ? this : new Weekday2(this.weekday, n);
    };
    Weekday2.prototype.equals = function(other) {
      return this.weekday === other.weekday && this.n === other.n;
    };
    Weekday2.prototype.toString = function() {
      var s = ALL_WEEKDAYS[this.weekday];
      if (this.n)
        s = (this.n > 0 ? "+" : "") + String(this.n) + s;
      return s;
    };
    Weekday2.prototype.getJsWeekday = function() {
      return this.weekday === 6 ? 0 : this.weekday + 1;
    };
    return Weekday2;
  }()
);

// node_modules/rrule/dist/esm/helpers.js
var isPresent = function(value) {
  return value !== null && value !== void 0;
};
var isNumber = function(value) {
  return typeof value === "number";
};
var isWeekdayStr = function(value) {
  return typeof value === "string" && ALL_WEEKDAYS.includes(value);
};
var isArray = Array.isArray;
var range = function(start, end) {
  if (end === void 0) {
    end = start;
  }
  if (arguments.length === 1) {
    end = start;
    start = 0;
  }
  var rang = [];
  for (var i = start; i < end; i++)
    rang.push(i);
  return rang;
};
var repeat = function(value, times) {
  var i = 0;
  var array = [];
  if (isArray(value)) {
    for (; i < times; i++)
      array[i] = [].concat(value);
  } else {
    for (; i < times; i++)
      array[i] = value;
  }
  return array;
};
var toArray = function(item) {
  if (isArray(item)) {
    return item;
  }
  return [item];
};
function padStart(item, targetLength, padString) {
  if (padString === void 0) {
    padString = " ";
  }
  var str = String(item);
  targetLength = targetLength >> 0;
  if (str.length > targetLength) {
    return String(str);
  }
  targetLength = targetLength - str.length;
  if (targetLength > padString.length) {
    padString += repeat(padString, targetLength / padString.length);
  }
  return padString.slice(0, targetLength) + String(str);
}
var split = function(str, sep, num) {
  var splits = str.split(sep);
  return num ? splits.slice(0, num).concat([splits.slice(num).join(sep)]) : splits;
};
var pymod = function(a, b) {
  var r = a % b;
  return r * b < 0 ? r + b : r;
};
var divmod = function(a, b) {
  return { div: Math.floor(a / b), mod: pymod(a, b) };
};
var empty = function(obj) {
  return !isPresent(obj) || obj.length === 0;
};
var notEmpty = function(obj) {
  return !empty(obj);
};
var includes = function(arr, val) {
  return notEmpty(arr) && arr.indexOf(val) !== -1;
};

// node_modules/rrule/dist/esm/dateutil.js
var datetime = function(y, m, d, h, i, s) {
  if (h === void 0) {
    h = 0;
  }
  if (i === void 0) {
    i = 0;
  }
  if (s === void 0) {
    s = 0;
  }
  return new Date(Date.UTC(y, m - 1, d, h, i, s));
};
var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var ONE_DAY = 1e3 * 60 * 60 * 24;
var MAXYEAR = 9999;
var ORDINAL_BASE = datetime(1970, 1, 1);
var PY_WEEKDAYS = [6, 0, 1, 2, 3, 4, 5];
var isLeapYear = function(year) {
  return year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
};
var isDate = function(value) {
  return value instanceof Date;
};
var isValidDate = function(value) {
  return isDate(value) && !isNaN(value.getTime());
};
var daysBetween = function(date1, date2) {
  var date1ms = date1.getTime();
  var date2ms = date2.getTime();
  var differencems = date1ms - date2ms;
  return Math.round(differencems / ONE_DAY);
};
var toOrdinal = function(date) {
  return daysBetween(date, ORDINAL_BASE);
};
var fromOrdinal = function(ordinal) {
  return new Date(ORDINAL_BASE.getTime() + ordinal * ONE_DAY);
};
var getMonthDays = function(date) {
  var month = date.getUTCMonth();
  return month === 1 && isLeapYear(date.getUTCFullYear()) ? 29 : MONTH_DAYS[month];
};
var getWeekday = function(date) {
  return PY_WEEKDAYS[date.getUTCDay()];
};
var monthRange = function(year, month) {
  var date = datetime(year, month + 1, 1);
  return [getWeekday(date), getMonthDays(date)];
};
var combine = function(date, time) {
  time = time || date;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds()));
};
var clone = function(date) {
  var dolly = new Date(date.getTime());
  return dolly;
};
var cloneDates = function(dates) {
  var clones = [];
  for (var i = 0; i < dates.length; i++) {
    clones.push(clone(dates[i]));
  }
  return clones;
};
var sort = function(dates) {
  dates.sort(function(a, b) {
    return a.getTime() - b.getTime();
  });
};
var timeToUntilString = function(time, utc) {
  if (utc === void 0) {
    utc = true;
  }
  var date = new Date(time);
  return [
    padStart(date.getUTCFullYear().toString(), 4, "0"),
    padStart(date.getUTCMonth() + 1, 2, "0"),
    padStart(date.getUTCDate(), 2, "0"),
    "T",
    padStart(date.getUTCHours(), 2, "0"),
    padStart(date.getUTCMinutes(), 2, "0"),
    padStart(date.getUTCSeconds(), 2, "0"),
    utc ? "Z" : ""
  ].join("");
};
var untilStringToDate = function(until) {
  var re = /^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})Z?)?$/;
  var bits = re.exec(until);
  if (!bits)
    throw new Error("Invalid UNTIL value: ".concat(until));
  return new Date(Date.UTC(parseInt(bits[1], 10), parseInt(bits[2], 10) - 1, parseInt(bits[3], 10), parseInt(bits[5], 10) || 0, parseInt(bits[6], 10) || 0, parseInt(bits[7], 10) || 0));
};
var dateTZtoISO8601 = function(date, timeZone) {
  var dateStr = date.toLocaleString("sv-SE", { timeZone });
  return dateStr.replace(" ", "T") + "Z";
};
var dateInTimeZone = function(date, timeZone) {
  var localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  var dateInLocalTZ = new Date(dateTZtoISO8601(date, localTimeZone));
  var dateInTargetTZ = new Date(dateTZtoISO8601(date, timeZone !== null && timeZone !== void 0 ? timeZone : "UTC"));
  var tzOffset = dateInTargetTZ.getTime() - dateInLocalTZ.getTime();
  return new Date(date.getTime() - tzOffset);
};

// node_modules/rrule/dist/esm/iterresult.js
var IterResult = (
  /** @class */
  function() {
    function IterResult2(method, args) {
      this.minDate = null;
      this.maxDate = null;
      this._result = [];
      this.total = 0;
      this.method = method;
      this.args = args;
      if (method === "between") {
        this.maxDate = args.inc ? args.before : new Date(args.before.getTime() - 1);
        this.minDate = args.inc ? args.after : new Date(args.after.getTime() + 1);
      } else if (method === "before") {
        this.maxDate = args.inc ? args.dt : new Date(args.dt.getTime() - 1);
      } else if (method === "after") {
        this.minDate = args.inc ? args.dt : new Date(args.dt.getTime() + 1);
      }
    }
    IterResult2.prototype.accept = function(date) {
      ++this.total;
      var tooEarly = this.minDate && date < this.minDate;
      var tooLate = this.maxDate && date > this.maxDate;
      if (this.method === "between") {
        if (tooEarly)
          return true;
        if (tooLate)
          return false;
      } else if (this.method === "before") {
        if (tooLate)
          return false;
      } else if (this.method === "after") {
        if (tooEarly)
          return true;
        this.add(date);
        return false;
      }
      return this.add(date);
    };
    IterResult2.prototype.add = function(date) {
      this._result.push(date);
      return true;
    };
    IterResult2.prototype.getValue = function() {
      var res = this._result;
      switch (this.method) {
        case "all":
        case "between":
          return res;
        case "before":
        case "after":
        default:
          return res.length ? res[res.length - 1] : null;
      }
    };
    IterResult2.prototype.clone = function() {
      return new IterResult2(this.method, this.args);
    };
    return IterResult2;
  }()
);
var iterresult_default = IterResult;

// node_modules/tslib/tslib.es6.mjs
var extendStatics = function(d, b) {
  extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
    d2.__proto__ = b2;
  } || function(d2, b2) {
    for (var p in b2)
      if (Object.prototype.hasOwnProperty.call(b2, p))
        d2[p] = b2[p];
  };
  return extendStatics(d, b);
};
function __extends(d, b) {
  if (typeof b !== "function" && b !== null)
    throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
  extendStatics(d, b);
  function __() {
    this.constructor = d;
  }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}
var __assign = function() {
  __assign = Object.assign || function __assign2(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s)
        if (Object.prototype.hasOwnProperty.call(s, p))
          t[p] = s[p];
    }
    return t;
  };
  return __assign.apply(this, arguments);
};
function __spreadArray(to, from, pack) {
  if (pack || arguments.length === 2)
    for (var i = 0, l = from.length, ar; i < l; i++) {
      if (ar || !(i in from)) {
        if (!ar)
          ar = Array.prototype.slice.call(from, 0, i);
        ar[i] = from[i];
      }
    }
  return to.concat(ar || Array.prototype.slice.call(from));
}

// node_modules/rrule/dist/esm/callbackiterresult.js
var CallbackIterResult = (
  /** @class */
  function(_super) {
    __extends(CallbackIterResult2, _super);
    function CallbackIterResult2(method, args, iterator) {
      var _this = _super.call(this, method, args) || this;
      _this.iterator = iterator;
      return _this;
    }
    CallbackIterResult2.prototype.add = function(date) {
      if (this.iterator(date, this._result.length)) {
        this._result.push(date);
        return true;
      }
      return false;
    };
    return CallbackIterResult2;
  }(iterresult_default)
);
var callbackiterresult_default = CallbackIterResult;

// node_modules/rrule/dist/esm/nlp/i18n.js
var ENGLISH = {
  dayNames: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ],
  monthNames: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ],
  tokens: {
    SKIP: /^[ \r\n\t]+|^\.$/,
    number: /^[1-9][0-9]*/,
    numberAsText: /^(one|two|three)/i,
    every: /^every/i,
    "day(s)": /^days?/i,
    "weekday(s)": /^weekdays?/i,
    "week(s)": /^weeks?/i,
    "hour(s)": /^hours?/i,
    "minute(s)": /^minutes?/i,
    "month(s)": /^months?/i,
    "year(s)": /^years?/i,
    on: /^(on|in)/i,
    at: /^(at)/i,
    the: /^the/i,
    first: /^first/i,
    second: /^second/i,
    third: /^third/i,
    nth: /^([1-9][0-9]*)(\.|th|nd|rd|st)/i,
    last: /^last/i,
    for: /^for/i,
    "time(s)": /^times?/i,
    until: /^(un)?til/i,
    monday: /^mo(n(day)?)?/i,
    tuesday: /^tu(e(s(day)?)?)?/i,
    wednesday: /^we(d(n(esday)?)?)?/i,
    thursday: /^th(u(r(sday)?)?)?/i,
    friday: /^fr(i(day)?)?/i,
    saturday: /^sa(t(urday)?)?/i,
    sunday: /^su(n(day)?)?/i,
    january: /^jan(uary)?/i,
    february: /^feb(ruary)?/i,
    march: /^mar(ch)?/i,
    april: /^apr(il)?/i,
    may: /^may/i,
    june: /^june?/i,
    july: /^july?/i,
    august: /^aug(ust)?/i,
    september: /^sep(t(ember)?)?/i,
    october: /^oct(ober)?/i,
    november: /^nov(ember)?/i,
    december: /^dec(ember)?/i,
    comma: /^(,\s*|(and|or)\s*)+/i
  }
};
var i18n_default = ENGLISH;

// node_modules/rrule/dist/esm/nlp/totext.js
var contains = function(arr, val) {
  return arr.indexOf(val) !== -1;
};
var defaultGetText = function(id) {
  return id.toString();
};
var defaultDateFormatter = function(year, month, day) {
  return "".concat(month, " ").concat(day, ", ").concat(year);
};
var ToText = (
  /** @class */
  function() {
    function ToText2(rrule, gettext, language, dateFormatter) {
      if (gettext === void 0) {
        gettext = defaultGetText;
      }
      if (language === void 0) {
        language = i18n_default;
      }
      if (dateFormatter === void 0) {
        dateFormatter = defaultDateFormatter;
      }
      this.text = [];
      this.language = language || i18n_default;
      this.gettext = gettext;
      this.dateFormatter = dateFormatter;
      this.rrule = rrule;
      this.options = rrule.options;
      this.origOptions = rrule.origOptions;
      if (this.origOptions.bymonthday) {
        var bymonthday = [].concat(this.options.bymonthday);
        var bynmonthday = [].concat(this.options.bynmonthday);
        bymonthday.sort(function(a, b) {
          return a - b;
        });
        bynmonthday.sort(function(a, b) {
          return b - a;
        });
        this.bymonthday = bymonthday.concat(bynmonthday);
        if (!this.bymonthday.length)
          this.bymonthday = null;
      }
      if (isPresent(this.origOptions.byweekday)) {
        var byweekday = !isArray(this.origOptions.byweekday) ? [this.origOptions.byweekday] : this.origOptions.byweekday;
        var days = String(byweekday);
        this.byweekday = {
          allWeeks: byweekday.filter(function(weekday) {
            return !weekday.n;
          }),
          someWeeks: byweekday.filter(function(weekday) {
            return Boolean(weekday.n);
          }),
          isWeekdays: days.indexOf("MO") !== -1 && days.indexOf("TU") !== -1 && days.indexOf("WE") !== -1 && days.indexOf("TH") !== -1 && days.indexOf("FR") !== -1 && days.indexOf("SA") === -1 && days.indexOf("SU") === -1,
          isEveryDay: days.indexOf("MO") !== -1 && days.indexOf("TU") !== -1 && days.indexOf("WE") !== -1 && days.indexOf("TH") !== -1 && days.indexOf("FR") !== -1 && days.indexOf("SA") !== -1 && days.indexOf("SU") !== -1
        };
        var sortWeekDays = function(a, b) {
          return a.weekday - b.weekday;
        };
        this.byweekday.allWeeks.sort(sortWeekDays);
        this.byweekday.someWeeks.sort(sortWeekDays);
        if (!this.byweekday.allWeeks.length)
          this.byweekday.allWeeks = null;
        if (!this.byweekday.someWeeks.length)
          this.byweekday.someWeeks = null;
      } else {
        this.byweekday = null;
      }
    }
    ToText2.isFullyConvertible = function(rrule) {
      var canConvert = true;
      if (!(rrule.options.freq in ToText2.IMPLEMENTED))
        return false;
      if (rrule.origOptions.until && rrule.origOptions.count)
        return false;
      for (var key in rrule.origOptions) {
        if (contains(["dtstart", "tzid", "wkst", "freq"], key))
          return true;
        if (!contains(ToText2.IMPLEMENTED[rrule.options.freq], key))
          return false;
      }
      return canConvert;
    };
    ToText2.prototype.isFullyConvertible = function() {
      return ToText2.isFullyConvertible(this.rrule);
    };
    ToText2.prototype.toString = function() {
      var gettext = this.gettext;
      if (!(this.options.freq in ToText2.IMPLEMENTED)) {
        return gettext("RRule error: Unable to fully convert this rrule to text");
      }
      this.text = [gettext("every")];
      this[RRule.FREQUENCIES[this.options.freq]]();
      if (this.options.until) {
        this.add(gettext("until"));
        var until = this.options.until;
        this.add(this.dateFormatter(until.getUTCFullYear(), this.language.monthNames[until.getUTCMonth()], until.getUTCDate()));
      } else if (this.options.count) {
        this.add(gettext("for")).add(this.options.count.toString()).add(this.plural(this.options.count) ? gettext("times") : gettext("time"));
      }
      if (!this.isFullyConvertible())
        this.add(gettext("(~ approximate)"));
      return this.text.join("");
    };
    ToText2.prototype.HOURLY = function() {
      var gettext = this.gettext;
      if (this.options.interval !== 1)
        this.add(this.options.interval.toString());
      this.add(this.plural(this.options.interval) ? gettext("hours") : gettext("hour"));
    };
    ToText2.prototype.MINUTELY = function() {
      var gettext = this.gettext;
      if (this.options.interval !== 1)
        this.add(this.options.interval.toString());
      this.add(this.plural(this.options.interval) ? gettext("minutes") : gettext("minute"));
    };
    ToText2.prototype.DAILY = function() {
      var gettext = this.gettext;
      if (this.options.interval !== 1)
        this.add(this.options.interval.toString());
      if (this.byweekday && this.byweekday.isWeekdays) {
        this.add(this.plural(this.options.interval) ? gettext("weekdays") : gettext("weekday"));
      } else {
        this.add(this.plural(this.options.interval) ? gettext("days") : gettext("day"));
      }
      if (this.origOptions.bymonth) {
        this.add(gettext("in"));
        this._bymonth();
      }
      if (this.bymonthday) {
        this._bymonthday();
      } else if (this.byweekday) {
        this._byweekday();
      } else if (this.origOptions.byhour) {
        this._byhour();
      }
    };
    ToText2.prototype.WEEKLY = function() {
      var gettext = this.gettext;
      if (this.options.interval !== 1) {
        this.add(this.options.interval.toString()).add(this.plural(this.options.interval) ? gettext("weeks") : gettext("week"));
      }
      if (this.byweekday && this.byweekday.isWeekdays) {
        if (this.options.interval === 1) {
          this.add(this.plural(this.options.interval) ? gettext("weekdays") : gettext("weekday"));
        } else {
          this.add(gettext("on")).add(gettext("weekdays"));
        }
      } else if (this.byweekday && this.byweekday.isEveryDay) {
        this.add(this.plural(this.options.interval) ? gettext("days") : gettext("day"));
      } else {
        if (this.options.interval === 1)
          this.add(gettext("week"));
        if (this.origOptions.bymonth) {
          this.add(gettext("in"));
          this._bymonth();
        }
        if (this.bymonthday) {
          this._bymonthday();
        } else if (this.byweekday) {
          this._byweekday();
        }
        if (this.origOptions.byhour) {
          this._byhour();
        }
      }
    };
    ToText2.prototype.MONTHLY = function() {
      var gettext = this.gettext;
      if (this.origOptions.bymonth) {
        if (this.options.interval !== 1) {
          this.add(this.options.interval.toString()).add(gettext("months"));
          if (this.plural(this.options.interval))
            this.add(gettext("in"));
        } else {
        }
        this._bymonth();
      } else {
        if (this.options.interval !== 1) {
          this.add(this.options.interval.toString());
        }
        this.add(this.plural(this.options.interval) ? gettext("months") : gettext("month"));
      }
      if (this.bymonthday) {
        this._bymonthday();
      } else if (this.byweekday && this.byweekday.isWeekdays) {
        this.add(gettext("on")).add(gettext("weekdays"));
      } else if (this.byweekday) {
        this._byweekday();
      }
    };
    ToText2.prototype.YEARLY = function() {
      var gettext = this.gettext;
      if (this.origOptions.bymonth) {
        if (this.options.interval !== 1) {
          this.add(this.options.interval.toString());
          this.add(gettext("years"));
        } else {
        }
        this._bymonth();
      } else {
        if (this.options.interval !== 1) {
          this.add(this.options.interval.toString());
        }
        this.add(this.plural(this.options.interval) ? gettext("years") : gettext("year"));
      }
      if (this.bymonthday) {
        this._bymonthday();
      } else if (this.byweekday) {
        this._byweekday();
      }
      if (this.options.byyearday) {
        this.add(gettext("on the")).add(this.list(this.options.byyearday, this.nth, gettext("and"))).add(gettext("day"));
      }
      if (this.options.byweekno) {
        this.add(gettext("in")).add(this.plural(this.options.byweekno.length) ? gettext("weeks") : gettext("week")).add(this.list(this.options.byweekno, void 0, gettext("and")));
      }
    };
    ToText2.prototype._bymonthday = function() {
      var gettext = this.gettext;
      if (this.byweekday && this.byweekday.allWeeks) {
        this.add(gettext("on")).add(this.list(this.byweekday.allWeeks, this.weekdaytext, gettext("or"))).add(gettext("the")).add(this.list(this.bymonthday, this.nth, gettext("or")));
      } else {
        this.add(gettext("on the")).add(this.list(this.bymonthday, this.nth, gettext("and")));
      }
    };
    ToText2.prototype._byweekday = function() {
      var gettext = this.gettext;
      if (this.byweekday.allWeeks && !this.byweekday.isWeekdays) {
        this.add(gettext("on")).add(this.list(this.byweekday.allWeeks, this.weekdaytext));
      }
      if (this.byweekday.someWeeks) {
        if (this.byweekday.allWeeks)
          this.add(gettext("and"));
        this.add(gettext("on the")).add(this.list(this.byweekday.someWeeks, this.weekdaytext, gettext("and")));
      }
    };
    ToText2.prototype._byhour = function() {
      var gettext = this.gettext;
      this.add(gettext("at")).add(this.list(this.origOptions.byhour, void 0, gettext("and")));
    };
    ToText2.prototype._bymonth = function() {
      this.add(this.list(this.options.bymonth, this.monthtext, this.gettext("and")));
    };
    ToText2.prototype.nth = function(n) {
      n = parseInt(n.toString(), 10);
      var nth;
      var gettext = this.gettext;
      if (n === -1)
        return gettext("last");
      var npos = Math.abs(n);
      switch (npos) {
        case 1:
        case 21:
        case 31:
          nth = npos + gettext("st");
          break;
        case 2:
        case 22:
          nth = npos + gettext("nd");
          break;
        case 3:
        case 23:
          nth = npos + gettext("rd");
          break;
        default:
          nth = npos + gettext("th");
      }
      return n < 0 ? nth + " " + gettext("last") : nth;
    };
    ToText2.prototype.monthtext = function(m) {
      return this.language.monthNames[m - 1];
    };
    ToText2.prototype.weekdaytext = function(wday) {
      var weekday = isNumber(wday) ? (wday + 1) % 7 : wday.getJsWeekday();
      return (wday.n ? this.nth(wday.n) + " " : "") + this.language.dayNames[weekday];
    };
    ToText2.prototype.plural = function(n) {
      return n % 100 !== 1;
    };
    ToText2.prototype.add = function(s) {
      this.text.push(" ");
      this.text.push(s);
      return this;
    };
    ToText2.prototype.list = function(arr, callback, finalDelim, delim) {
      var _this = this;
      if (delim === void 0) {
        delim = ",";
      }
      if (!isArray(arr)) {
        arr = [arr];
      }
      var delimJoin = function(array, delimiter, finalDelimiter) {
        var list = "";
        for (var i = 0; i < array.length; i++) {
          if (i !== 0) {
            if (i === array.length - 1) {
              list += " " + finalDelimiter + " ";
            } else {
              list += delimiter + " ";
            }
          }
          list += array[i];
        }
        return list;
      };
      callback = callback || function(o) {
        return o.toString();
      };
      var realCallback = function(arg) {
        return callback && callback.call(_this, arg);
      };
      if (finalDelim) {
        return delimJoin(arr.map(realCallback), delim, finalDelim);
      } else {
        return arr.map(realCallback).join(delim + " ");
      }
    };
    return ToText2;
  }()
);
var totext_default = ToText;

// node_modules/rrule/dist/esm/nlp/parsetext.js
var Parser = (
  /** @class */
  function() {
    function Parser2(rules) {
      this.done = true;
      this.rules = rules;
    }
    Parser2.prototype.start = function(text) {
      this.text = text;
      this.done = false;
      return this.nextSymbol();
    };
    Parser2.prototype.isDone = function() {
      return this.done && this.symbol === null;
    };
    Parser2.prototype.nextSymbol = function() {
      var best;
      var bestSymbol;
      this.symbol = null;
      this.value = null;
      do {
        if (this.done)
          return false;
        var rule = void 0;
        best = null;
        for (var name_1 in this.rules) {
          rule = this.rules[name_1];
          var match = rule.exec(this.text);
          if (match) {
            if (best === null || match[0].length > best[0].length) {
              best = match;
              bestSymbol = name_1;
            }
          }
        }
        if (best != null) {
          this.text = this.text.substr(best[0].length);
          if (this.text === "")
            this.done = true;
        }
        if (best == null) {
          this.done = true;
          this.symbol = null;
          this.value = null;
          return;
        }
      } while (bestSymbol === "SKIP");
      this.symbol = bestSymbol;
      this.value = best;
      return true;
    };
    Parser2.prototype.accept = function(name) {
      if (this.symbol === name) {
        if (this.value) {
          var v = this.value;
          this.nextSymbol();
          return v;
        }
        this.nextSymbol();
        return true;
      }
      return false;
    };
    Parser2.prototype.acceptNumber = function() {
      return this.accept("number");
    };
    Parser2.prototype.expect = function(name) {
      if (this.accept(name))
        return true;
      throw new Error("expected " + name + " but found " + this.symbol);
    };
    return Parser2;
  }()
);
function parseText(text, language) {
  if (language === void 0) {
    language = i18n_default;
  }
  var options = {};
  var ttr = new Parser(language.tokens);
  if (!ttr.start(text))
    return null;
  S();
  return options;
  function S() {
    ttr.expect("every");
    var n = ttr.acceptNumber();
    if (n)
      options.interval = parseInt(n[0], 10);
    if (ttr.isDone())
      throw new Error("Unexpected end");
    switch (ttr.symbol) {
      case "day(s)":
        options.freq = RRule.DAILY;
        if (ttr.nextSymbol()) {
          AT();
          F();
        }
        break;
      case "weekday(s)":
        options.freq = RRule.WEEKLY;
        options.byweekday = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
        ttr.nextSymbol();
        AT();
        F();
        break;
      case "week(s)":
        options.freq = RRule.WEEKLY;
        if (ttr.nextSymbol()) {
          ON();
          AT();
          F();
        }
        break;
      case "hour(s)":
        options.freq = RRule.HOURLY;
        if (ttr.nextSymbol()) {
          ON();
          F();
        }
        break;
      case "minute(s)":
        options.freq = RRule.MINUTELY;
        if (ttr.nextSymbol()) {
          ON();
          F();
        }
        break;
      case "month(s)":
        options.freq = RRule.MONTHLY;
        if (ttr.nextSymbol()) {
          ON();
          F();
        }
        break;
      case "year(s)":
        options.freq = RRule.YEARLY;
        if (ttr.nextSymbol()) {
          ON();
          F();
        }
        break;
      case "monday":
      case "tuesday":
      case "wednesday":
      case "thursday":
      case "friday":
      case "saturday":
      case "sunday":
        options.freq = RRule.WEEKLY;
        var key = ttr.symbol.substr(0, 2).toUpperCase();
        options.byweekday = [RRule[key]];
        if (!ttr.nextSymbol())
          return;
        while (ttr.accept("comma")) {
          if (ttr.isDone())
            throw new Error("Unexpected end");
          var wkd = decodeWKD();
          if (!wkd) {
            throw new Error("Unexpected symbol " + ttr.symbol + ", expected weekday");
          }
          options.byweekday.push(RRule[wkd]);
          ttr.nextSymbol();
        }
        AT();
        MDAYs();
        F();
        break;
      case "january":
      case "february":
      case "march":
      case "april":
      case "may":
      case "june":
      case "july":
      case "august":
      case "september":
      case "october":
      case "november":
      case "december":
        options.freq = RRule.YEARLY;
        options.bymonth = [decodeM()];
        if (!ttr.nextSymbol())
          return;
        while (ttr.accept("comma")) {
          if (ttr.isDone())
            throw new Error("Unexpected end");
          var m = decodeM();
          if (!m) {
            throw new Error("Unexpected symbol " + ttr.symbol + ", expected month");
          }
          options.bymonth.push(m);
          ttr.nextSymbol();
        }
        ON();
        F();
        break;
      default:
        throw new Error("Unknown symbol");
    }
  }
  function ON() {
    var on = ttr.accept("on");
    var the = ttr.accept("the");
    if (!(on || the))
      return;
    do {
      var nth = decodeNTH();
      var wkd = decodeWKD();
      var m = decodeM();
      if (nth) {
        if (wkd) {
          ttr.nextSymbol();
          if (!options.byweekday)
            options.byweekday = [];
          options.byweekday.push(RRule[wkd].nth(nth));
        } else {
          if (!options.bymonthday)
            options.bymonthday = [];
          options.bymonthday.push(nth);
          ttr.accept("day(s)");
        }
      } else if (wkd) {
        ttr.nextSymbol();
        if (!options.byweekday)
          options.byweekday = [];
        options.byweekday.push(RRule[wkd]);
      } else if (ttr.symbol === "weekday(s)") {
        ttr.nextSymbol();
        if (!options.byweekday) {
          options.byweekday = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
        }
      } else if (ttr.symbol === "week(s)") {
        ttr.nextSymbol();
        var n = ttr.acceptNumber();
        if (!n) {
          throw new Error("Unexpected symbol " + ttr.symbol + ", expected week number");
        }
        options.byweekno = [parseInt(n[0], 10)];
        while (ttr.accept("comma")) {
          n = ttr.acceptNumber();
          if (!n) {
            throw new Error("Unexpected symbol " + ttr.symbol + "; expected monthday");
          }
          options.byweekno.push(parseInt(n[0], 10));
        }
      } else if (m) {
        ttr.nextSymbol();
        if (!options.bymonth)
          options.bymonth = [];
        options.bymonth.push(m);
      } else {
        return;
      }
    } while (ttr.accept("comma") || ttr.accept("the") || ttr.accept("on"));
  }
  function AT() {
    var at = ttr.accept("at");
    if (!at)
      return;
    do {
      var n = ttr.acceptNumber();
      if (!n) {
        throw new Error("Unexpected symbol " + ttr.symbol + ", expected hour");
      }
      options.byhour = [parseInt(n[0], 10)];
      while (ttr.accept("comma")) {
        n = ttr.acceptNumber();
        if (!n) {
          throw new Error("Unexpected symbol " + ttr.symbol + "; expected hour");
        }
        options.byhour.push(parseInt(n[0], 10));
      }
    } while (ttr.accept("comma") || ttr.accept("at"));
  }
  function decodeM() {
    switch (ttr.symbol) {
      case "january":
        return 1;
      case "february":
        return 2;
      case "march":
        return 3;
      case "april":
        return 4;
      case "may":
        return 5;
      case "june":
        return 6;
      case "july":
        return 7;
      case "august":
        return 8;
      case "september":
        return 9;
      case "october":
        return 10;
      case "november":
        return 11;
      case "december":
        return 12;
      default:
        return false;
    }
  }
  function decodeWKD() {
    switch (ttr.symbol) {
      case "monday":
      case "tuesday":
      case "wednesday":
      case "thursday":
      case "friday":
      case "saturday":
      case "sunday":
        return ttr.symbol.substr(0, 2).toUpperCase();
      default:
        return false;
    }
  }
  function decodeNTH() {
    switch (ttr.symbol) {
      case "last":
        ttr.nextSymbol();
        return -1;
      case "first":
        ttr.nextSymbol();
        return 1;
      case "second":
        ttr.nextSymbol();
        return ttr.accept("last") ? -2 : 2;
      case "third":
        ttr.nextSymbol();
        return ttr.accept("last") ? -3 : 3;
      case "nth":
        var v = parseInt(ttr.value[1], 10);
        if (v < -366 || v > 366)
          throw new Error("Nth out of range: " + v);
        ttr.nextSymbol();
        return ttr.accept("last") ? -v : v;
      default:
        return false;
    }
  }
  function MDAYs() {
    ttr.accept("on");
    ttr.accept("the");
    var nth = decodeNTH();
    if (!nth)
      return;
    options.bymonthday = [nth];
    ttr.nextSymbol();
    while (ttr.accept("comma")) {
      nth = decodeNTH();
      if (!nth) {
        throw new Error("Unexpected symbol " + ttr.symbol + "; expected monthday");
      }
      options.bymonthday.push(nth);
      ttr.nextSymbol();
    }
  }
  function F() {
    if (ttr.symbol === "until") {
      var date = Date.parse(ttr.text);
      if (!date)
        throw new Error("Cannot parse until date:" + ttr.text);
      options.until = new Date(date);
    } else if (ttr.accept("for")) {
      options.count = parseInt(ttr.value[0], 10);
      ttr.expect("number");
    }
  }
}

// node_modules/rrule/dist/esm/types.js
var Frequency;
(function(Frequency2) {
  Frequency2[Frequency2["YEARLY"] = 0] = "YEARLY";
  Frequency2[Frequency2["MONTHLY"] = 1] = "MONTHLY";
  Frequency2[Frequency2["WEEKLY"] = 2] = "WEEKLY";
  Frequency2[Frequency2["DAILY"] = 3] = "DAILY";
  Frequency2[Frequency2["HOURLY"] = 4] = "HOURLY";
  Frequency2[Frequency2["MINUTELY"] = 5] = "MINUTELY";
  Frequency2[Frequency2["SECONDLY"] = 6] = "SECONDLY";
})(Frequency || (Frequency = {}));
function freqIsDailyOrGreater(freq) {
  return freq < Frequency.HOURLY;
}

// node_modules/rrule/dist/esm/nlp/index.js
var fromText = function(text, language) {
  if (language === void 0) {
    language = i18n_default;
  }
  return new RRule(parseText(text, language) || void 0);
};
var common = [
  "count",
  "until",
  "interval",
  "byweekday",
  "bymonthday",
  "bymonth"
];
totext_default.IMPLEMENTED = [];
totext_default.IMPLEMENTED[Frequency.HOURLY] = common;
totext_default.IMPLEMENTED[Frequency.MINUTELY] = common;
totext_default.IMPLEMENTED[Frequency.DAILY] = ["byhour"].concat(common);
totext_default.IMPLEMENTED[Frequency.WEEKLY] = common;
totext_default.IMPLEMENTED[Frequency.MONTHLY] = common;
totext_default.IMPLEMENTED[Frequency.YEARLY] = ["byweekno", "byyearday"].concat(common);
var toText = function(rrule, gettext, language, dateFormatter) {
  return new totext_default(rrule, gettext, language, dateFormatter).toString();
};
var isFullyConvertible = totext_default.isFullyConvertible;

// node_modules/rrule/dist/esm/datetime.js
var Time = (
  /** @class */
  function() {
    function Time2(hour, minute, second, millisecond) {
      this.hour = hour;
      this.minute = minute;
      this.second = second;
      this.millisecond = millisecond || 0;
    }
    Time2.prototype.getHours = function() {
      return this.hour;
    };
    Time2.prototype.getMinutes = function() {
      return this.minute;
    };
    Time2.prototype.getSeconds = function() {
      return this.second;
    };
    Time2.prototype.getMilliseconds = function() {
      return this.millisecond;
    };
    Time2.prototype.getTime = function() {
      return (this.hour * 60 * 60 + this.minute * 60 + this.second) * 1e3 + this.millisecond;
    };
    return Time2;
  }()
);
var DateTime = (
  /** @class */
  function(_super) {
    __extends(DateTime2, _super);
    function DateTime2(year, month, day, hour, minute, second, millisecond) {
      var _this = _super.call(this, hour, minute, second, millisecond) || this;
      _this.year = year;
      _this.month = month;
      _this.day = day;
      return _this;
    }
    DateTime2.fromDate = function(date) {
      return new this(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.valueOf() % 1e3);
    };
    DateTime2.prototype.getWeekday = function() {
      return getWeekday(new Date(this.getTime()));
    };
    DateTime2.prototype.getTime = function() {
      return new Date(Date.UTC(this.year, this.month - 1, this.day, this.hour, this.minute, this.second, this.millisecond)).getTime();
    };
    DateTime2.prototype.getDay = function() {
      return this.day;
    };
    DateTime2.prototype.getMonth = function() {
      return this.month;
    };
    DateTime2.prototype.getYear = function() {
      return this.year;
    };
    DateTime2.prototype.addYears = function(years) {
      this.year += years;
    };
    DateTime2.prototype.addMonths = function(months) {
      this.month += months;
      if (this.month > 12) {
        var yearDiv = Math.floor(this.month / 12);
        var monthMod = pymod(this.month, 12);
        this.month = monthMod;
        this.year += yearDiv;
        if (this.month === 0) {
          this.month = 12;
          --this.year;
        }
      }
    };
    DateTime2.prototype.addWeekly = function(days, wkst) {
      if (wkst > this.getWeekday()) {
        this.day += -(this.getWeekday() + 1 + (6 - wkst)) + days * 7;
      } else {
        this.day += -(this.getWeekday() - wkst) + days * 7;
      }
      this.fixDay();
    };
    DateTime2.prototype.addDaily = function(days) {
      this.day += days;
      this.fixDay();
    };
    DateTime2.prototype.addHours = function(hours, filtered, byhour) {
      if (filtered) {
        this.hour += Math.floor((23 - this.hour) / hours) * hours;
      }
      for (; ; ) {
        this.hour += hours;
        var _a = divmod(this.hour, 24), dayDiv = _a.div, hourMod = _a.mod;
        if (dayDiv) {
          this.hour = hourMod;
          this.addDaily(dayDiv);
        }
        if (empty(byhour) || includes(byhour, this.hour))
          break;
      }
    };
    DateTime2.prototype.addMinutes = function(minutes, filtered, byhour, byminute) {
      if (filtered) {
        this.minute += Math.floor((1439 - (this.hour * 60 + this.minute)) / minutes) * minutes;
      }
      for (; ; ) {
        this.minute += minutes;
        var _a = divmod(this.minute, 60), hourDiv = _a.div, minuteMod = _a.mod;
        if (hourDiv) {
          this.minute = minuteMod;
          this.addHours(hourDiv, false, byhour);
        }
        if ((empty(byhour) || includes(byhour, this.hour)) && (empty(byminute) || includes(byminute, this.minute))) {
          break;
        }
      }
    };
    DateTime2.prototype.addSeconds = function(seconds, filtered, byhour, byminute, bysecond) {
      if (filtered) {
        this.second += Math.floor((86399 - (this.hour * 3600 + this.minute * 60 + this.second)) / seconds) * seconds;
      }
      for (; ; ) {
        this.second += seconds;
        var _a = divmod(this.second, 60), minuteDiv = _a.div, secondMod = _a.mod;
        if (minuteDiv) {
          this.second = secondMod;
          this.addMinutes(minuteDiv, false, byhour, byminute);
        }
        if ((empty(byhour) || includes(byhour, this.hour)) && (empty(byminute) || includes(byminute, this.minute)) && (empty(bysecond) || includes(bysecond, this.second))) {
          break;
        }
      }
    };
    DateTime2.prototype.fixDay = function() {
      if (this.day <= 28) {
        return;
      }
      var daysinmonth = monthRange(this.year, this.month - 1)[1];
      if (this.day <= daysinmonth) {
        return;
      }
      while (this.day > daysinmonth) {
        this.day -= daysinmonth;
        ++this.month;
        if (this.month === 13) {
          this.month = 1;
          ++this.year;
          if (this.year > MAXYEAR) {
            return;
          }
        }
        daysinmonth = monthRange(this.year, this.month - 1)[1];
      }
    };
    DateTime2.prototype.add = function(options, filtered) {
      var freq = options.freq, interval = options.interval, wkst = options.wkst, byhour = options.byhour, byminute = options.byminute, bysecond = options.bysecond;
      switch (freq) {
        case Frequency.YEARLY:
          return this.addYears(interval);
        case Frequency.MONTHLY:
          return this.addMonths(interval);
        case Frequency.WEEKLY:
          return this.addWeekly(interval, wkst);
        case Frequency.DAILY:
          return this.addDaily(interval);
        case Frequency.HOURLY:
          return this.addHours(interval, filtered, byhour);
        case Frequency.MINUTELY:
          return this.addMinutes(interval, filtered, byhour, byminute);
        case Frequency.SECONDLY:
          return this.addSeconds(interval, filtered, byhour, byminute, bysecond);
      }
    };
    return DateTime2;
  }(Time)
);

// node_modules/rrule/dist/esm/parseoptions.js
function initializeOptions(options) {
  var invalid = [];
  var keys = Object.keys(options);
  for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
    var key = keys_1[_i];
    if (!includes(defaultKeys, key))
      invalid.push(key);
    if (isDate(options[key]) && !isValidDate(options[key])) {
      invalid.push(key);
    }
  }
  if (invalid.length) {
    throw new Error("Invalid options: " + invalid.join(", "));
  }
  return __assign({}, options);
}
function parseOptions(options) {
  var opts = __assign(__assign({}, DEFAULT_OPTIONS), initializeOptions(options));
  if (isPresent(opts.byeaster))
    opts.freq = RRule.YEARLY;
  if (!(isPresent(opts.freq) && RRule.FREQUENCIES[opts.freq])) {
    throw new Error("Invalid frequency: ".concat(opts.freq, " ").concat(options.freq));
  }
  if (!opts.dtstart)
    opts.dtstart = new Date((/* @__PURE__ */ new Date()).setMilliseconds(0));
  if (!isPresent(opts.wkst)) {
    opts.wkst = RRule.MO.weekday;
  } else if (isNumber(opts.wkst)) {
  } else {
    opts.wkst = opts.wkst.weekday;
  }
  if (isPresent(opts.bysetpos)) {
    if (isNumber(opts.bysetpos))
      opts.bysetpos = [opts.bysetpos];
    for (var i = 0; i < opts.bysetpos.length; i++) {
      var v = opts.bysetpos[i];
      if (v === 0 || !(v >= -366 && v <= 366)) {
        throw new Error("bysetpos must be between 1 and 366, or between -366 and -1");
      }
    }
  }
  if (!(Boolean(opts.byweekno) || notEmpty(opts.byweekno) || notEmpty(opts.byyearday) || Boolean(opts.bymonthday) || notEmpty(opts.bymonthday) || isPresent(opts.byweekday) || isPresent(opts.byeaster))) {
    switch (opts.freq) {
      case RRule.YEARLY:
        if (!opts.bymonth)
          opts.bymonth = opts.dtstart.getUTCMonth() + 1;
        opts.bymonthday = opts.dtstart.getUTCDate();
        break;
      case RRule.MONTHLY:
        opts.bymonthday = opts.dtstart.getUTCDate();
        break;
      case RRule.WEEKLY:
        opts.byweekday = [getWeekday(opts.dtstart)];
        break;
    }
  }
  if (isPresent(opts.bymonth) && !isArray(opts.bymonth)) {
    opts.bymonth = [opts.bymonth];
  }
  if (isPresent(opts.byyearday) && !isArray(opts.byyearday) && isNumber(opts.byyearday)) {
    opts.byyearday = [opts.byyearday];
  }
  if (!isPresent(opts.bymonthday)) {
    opts.bymonthday = [];
    opts.bynmonthday = [];
  } else if (isArray(opts.bymonthday)) {
    var bymonthday = [];
    var bynmonthday = [];
    for (var i = 0; i < opts.bymonthday.length; i++) {
      var v = opts.bymonthday[i];
      if (v > 0) {
        bymonthday.push(v);
      } else if (v < 0) {
        bynmonthday.push(v);
      }
    }
    opts.bymonthday = bymonthday;
    opts.bynmonthday = bynmonthday;
  } else if (opts.bymonthday < 0) {
    opts.bynmonthday = [opts.bymonthday];
    opts.bymonthday = [];
  } else {
    opts.bynmonthday = [];
    opts.bymonthday = [opts.bymonthday];
  }
  if (isPresent(opts.byweekno) && !isArray(opts.byweekno)) {
    opts.byweekno = [opts.byweekno];
  }
  if (!isPresent(opts.byweekday)) {
    opts.bynweekday = null;
  } else if (isNumber(opts.byweekday)) {
    opts.byweekday = [opts.byweekday];
    opts.bynweekday = null;
  } else if (isWeekdayStr(opts.byweekday)) {
    opts.byweekday = [Weekday.fromStr(opts.byweekday).weekday];
    opts.bynweekday = null;
  } else if (opts.byweekday instanceof Weekday) {
    if (!opts.byweekday.n || opts.freq > RRule.MONTHLY) {
      opts.byweekday = [opts.byweekday.weekday];
      opts.bynweekday = null;
    } else {
      opts.bynweekday = [[opts.byweekday.weekday, opts.byweekday.n]];
      opts.byweekday = null;
    }
  } else {
    var byweekday = [];
    var bynweekday = [];
    for (var i = 0; i < opts.byweekday.length; i++) {
      var wday = opts.byweekday[i];
      if (isNumber(wday)) {
        byweekday.push(wday);
        continue;
      } else if (isWeekdayStr(wday)) {
        byweekday.push(Weekday.fromStr(wday).weekday);
        continue;
      }
      if (!wday.n || opts.freq > RRule.MONTHLY) {
        byweekday.push(wday.weekday);
      } else {
        bynweekday.push([wday.weekday, wday.n]);
      }
    }
    opts.byweekday = notEmpty(byweekday) ? byweekday : null;
    opts.bynweekday = notEmpty(bynweekday) ? bynweekday : null;
  }
  if (!isPresent(opts.byhour)) {
    opts.byhour = opts.freq < RRule.HOURLY ? [opts.dtstart.getUTCHours()] : null;
  } else if (isNumber(opts.byhour)) {
    opts.byhour = [opts.byhour];
  }
  if (!isPresent(opts.byminute)) {
    opts.byminute = opts.freq < RRule.MINUTELY ? [opts.dtstart.getUTCMinutes()] : null;
  } else if (isNumber(opts.byminute)) {
    opts.byminute = [opts.byminute];
  }
  if (!isPresent(opts.bysecond)) {
    opts.bysecond = opts.freq < RRule.SECONDLY ? [opts.dtstart.getUTCSeconds()] : null;
  } else if (isNumber(opts.bysecond)) {
    opts.bysecond = [opts.bysecond];
  }
  return { parsedOptions: opts };
}
function buildTimeset(opts) {
  var millisecondModulo = opts.dtstart.getTime() % 1e3;
  if (!freqIsDailyOrGreater(opts.freq)) {
    return [];
  }
  var timeset = [];
  opts.byhour.forEach(function(hour) {
    opts.byminute.forEach(function(minute) {
      opts.bysecond.forEach(function(second) {
        timeset.push(new Time(hour, minute, second, millisecondModulo));
      });
    });
  });
  return timeset;
}

// node_modules/rrule/dist/esm/parsestring.js
function parseString(rfcString) {
  var options = rfcString.split("\n").map(parseLine).filter(function(x) {
    return x !== null;
  });
  return __assign(__assign({}, options[0]), options[1]);
}
function parseDtstart(line) {
  var options = {};
  var dtstartWithZone = /DTSTART(?:;TZID=([^:=]+?))?(?::|=)([^;\s]+)/i.exec(line);
  if (!dtstartWithZone) {
    return options;
  }
  var tzid = dtstartWithZone[1], dtstart = dtstartWithZone[2];
  if (tzid) {
    options.tzid = tzid;
  }
  options.dtstart = untilStringToDate(dtstart);
  return options;
}
function parseLine(rfcString) {
  rfcString = rfcString.replace(/^\s+|\s+$/, "");
  if (!rfcString.length)
    return null;
  var header = /^([A-Z]+?)[:;]/.exec(rfcString.toUpperCase());
  if (!header) {
    return parseRrule(rfcString);
  }
  var key = header[1];
  switch (key.toUpperCase()) {
    case "RRULE":
    case "EXRULE":
      return parseRrule(rfcString);
    case "DTSTART":
      return parseDtstart(rfcString);
    default:
      throw new Error("Unsupported RFC prop ".concat(key, " in ").concat(rfcString));
  }
}
function parseRrule(line) {
  var strippedLine = line.replace(/^RRULE:/i, "");
  var options = parseDtstart(strippedLine);
  var attrs = line.replace(/^(?:RRULE|EXRULE):/i, "").split(";");
  attrs.forEach(function(attr) {
    var _a = attr.split("="), key = _a[0], value = _a[1];
    switch (key.toUpperCase()) {
      case "FREQ":
        options.freq = Frequency[value.toUpperCase()];
        break;
      case "WKST":
        options.wkst = Days[value.toUpperCase()];
        break;
      case "COUNT":
      case "INTERVAL":
      case "BYSETPOS":
      case "BYMONTH":
      case "BYMONTHDAY":
      case "BYYEARDAY":
      case "BYWEEKNO":
      case "BYHOUR":
      case "BYMINUTE":
      case "BYSECOND":
        var num = parseNumber(value);
        var optionKey = key.toLowerCase();
        options[optionKey] = num;
        break;
      case "BYWEEKDAY":
      case "BYDAY":
        options.byweekday = parseWeekday(value);
        break;
      case "DTSTART":
      case "TZID":
        var dtstart = parseDtstart(line);
        options.tzid = dtstart.tzid;
        options.dtstart = dtstart.dtstart;
        break;
      case "UNTIL":
        options.until = untilStringToDate(value);
        break;
      case "BYEASTER":
        options.byeaster = Number(value);
        break;
      default:
        throw new Error("Unknown RRULE property '" + key + "'");
    }
  });
  return options;
}
function parseNumber(value) {
  if (value.indexOf(",") !== -1) {
    var values = value.split(",");
    return values.map(parseIndividualNumber);
  }
  return parseIndividualNumber(value);
}
function parseIndividualNumber(value) {
  if (/^[+-]?\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}
function parseWeekday(value) {
  var days = value.split(",");
  return days.map(function(day) {
    if (day.length === 2) {
      return Days[day];
    }
    var parts = day.match(/^([+-]?\d{1,2})([A-Z]{2})$/);
    if (!parts || parts.length < 3) {
      throw new SyntaxError("Invalid weekday string: ".concat(day));
    }
    var n = Number(parts[1]);
    var wdaypart = parts[2];
    var wday = Days[wdaypart].weekday;
    return new Weekday(wday, n);
  });
}

// node_modules/rrule/dist/esm/datewithzone.js
var DateWithZone = (
  /** @class */
  function() {
    function DateWithZone2(date, tzid) {
      if (isNaN(date.getTime())) {
        throw new RangeError("Invalid date passed to DateWithZone");
      }
      this.date = date;
      this.tzid = tzid;
    }
    Object.defineProperty(DateWithZone2.prototype, "isUTC", {
      get: function() {
        return !this.tzid || this.tzid.toUpperCase() === "UTC";
      },
      enumerable: false,
      configurable: true
    });
    DateWithZone2.prototype.toString = function() {
      var datestr = timeToUntilString(this.date.getTime(), this.isUTC);
      if (!this.isUTC) {
        return ";TZID=".concat(this.tzid, ":").concat(datestr);
      }
      return ":".concat(datestr);
    };
    DateWithZone2.prototype.getTime = function() {
      return this.date.getTime();
    };
    DateWithZone2.prototype.rezonedDate = function() {
      if (this.isUTC) {
        return this.date;
      }
      return dateInTimeZone(this.date, this.tzid);
    };
    return DateWithZone2;
  }()
);

// node_modules/rrule/dist/esm/optionstostring.js
function optionsToString(options) {
  var rrule = [];
  var dtstart = "";
  var keys = Object.keys(options);
  var defaultKeys2 = Object.keys(DEFAULT_OPTIONS);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] === "tzid")
      continue;
    if (!includes(defaultKeys2, keys[i]))
      continue;
    var key = keys[i].toUpperCase();
    var value = options[keys[i]];
    var outValue = "";
    if (!isPresent(value) || isArray(value) && !value.length)
      continue;
    switch (key) {
      case "FREQ":
        outValue = RRule.FREQUENCIES[options.freq];
        break;
      case "WKST":
        if (isNumber(value)) {
          outValue = new Weekday(value).toString();
        } else {
          outValue = value.toString();
        }
        break;
      case "BYWEEKDAY":
        key = "BYDAY";
        outValue = toArray(value).map(function(wday) {
          if (wday instanceof Weekday) {
            return wday;
          }
          if (isArray(wday)) {
            return new Weekday(wday[0], wday[1]);
          }
          return new Weekday(wday);
        }).toString();
        break;
      case "DTSTART":
        dtstart = buildDtstart(value, options.tzid);
        break;
      case "UNTIL":
        outValue = timeToUntilString(value, !options.tzid);
        break;
      default:
        if (isArray(value)) {
          var strValues = [];
          for (var j = 0; j < value.length; j++) {
            strValues[j] = String(value[j]);
          }
          outValue = strValues.toString();
        } else {
          outValue = String(value);
        }
    }
    if (outValue) {
      rrule.push([key, outValue]);
    }
  }
  var rules = rrule.map(function(_a) {
    var key2 = _a[0], value2 = _a[1];
    return "".concat(key2, "=").concat(value2.toString());
  }).join(";");
  var ruleString = "";
  if (rules !== "") {
    ruleString = "RRULE:".concat(rules);
  }
  return [dtstart, ruleString].filter(function(x) {
    return !!x;
  }).join("\n");
}
function buildDtstart(dtstart, tzid) {
  if (!dtstart) {
    return "";
  }
  return "DTSTART" + new DateWithZone(new Date(dtstart), tzid).toString();
}

// node_modules/rrule/dist/esm/cache.js
function argsMatch(left, right) {
  if (Array.isArray(left)) {
    if (!Array.isArray(right))
      return false;
    if (left.length !== right.length)
      return false;
    return left.every(function(date, i) {
      return date.getTime() === right[i].getTime();
    });
  }
  if (left instanceof Date) {
    return right instanceof Date && left.getTime() === right.getTime();
  }
  return left === right;
}
var Cache = (
  /** @class */
  function() {
    function Cache2() {
      this.all = false;
      this.before = [];
      this.after = [];
      this.between = [];
    }
    Cache2.prototype._cacheAdd = function(what, value, args) {
      if (value) {
        value = value instanceof Date ? clone(value) : cloneDates(value);
      }
      if (what === "all") {
        this.all = value;
      } else {
        args._value = value;
        this[what].push(args);
      }
    };
    Cache2.prototype._cacheGet = function(what, args) {
      var cached = false;
      var argsKeys = args ? Object.keys(args) : [];
      var findCacheDiff = function(item2) {
        for (var i2 = 0; i2 < argsKeys.length; i2++) {
          var key = argsKeys[i2];
          if (!argsMatch(args[key], item2[key])) {
            return true;
          }
        }
        return false;
      };
      var cachedObject = this[what];
      if (what === "all") {
        cached = this.all;
      } else if (isArray(cachedObject)) {
        for (var i = 0; i < cachedObject.length; i++) {
          var item = cachedObject[i];
          if (argsKeys.length && findCacheDiff(item))
            continue;
          cached = item._value;
          break;
        }
      }
      if (!cached && this.all) {
        var iterResult = new iterresult_default(what, args);
        for (var i = 0; i < this.all.length; i++) {
          if (!iterResult.accept(this.all[i]))
            break;
        }
        cached = iterResult.getValue();
        this._cacheAdd(what, cached, args);
      }
      return isArray(cached) ? cloneDates(cached) : cached instanceof Date ? clone(cached) : cached;
    };
    return Cache2;
  }()
);

// node_modules/rrule/dist/esm/masks.js
var M365MASK = __spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray([], repeat(1, 31), true), repeat(2, 28), true), repeat(3, 31), true), repeat(4, 30), true), repeat(5, 31), true), repeat(6, 30), true), repeat(7, 31), true), repeat(8, 31), true), repeat(9, 30), true), repeat(10, 31), true), repeat(11, 30), true), repeat(12, 31), true), repeat(1, 7), true);
var M366MASK = __spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray([], repeat(1, 31), true), repeat(2, 29), true), repeat(3, 31), true), repeat(4, 30), true), repeat(5, 31), true), repeat(6, 30), true), repeat(7, 31), true), repeat(8, 31), true), repeat(9, 30), true), repeat(10, 31), true), repeat(11, 30), true), repeat(12, 31), true), repeat(1, 7), true);
var M28 = range(1, 29);
var M29 = range(1, 30);
var M30 = range(1, 31);
var M31 = range(1, 32);
var MDAY366MASK = __spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray([], M31, true), M29, true), M31, true), M30, true), M31, true), M30, true), M31, true), M31, true), M30, true), M31, true), M30, true), M31, true), M31.slice(0, 7), true);
var MDAY365MASK = __spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray([], M31, true), M28, true), M31, true), M30, true), M31, true), M30, true), M31, true), M31, true), M30, true), M31, true), M30, true), M31, true), M31.slice(0, 7), true);
var NM28 = range(-28, 0);
var NM29 = range(-29, 0);
var NM30 = range(-30, 0);
var NM31 = range(-31, 0);
var NMDAY366MASK = __spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray([], NM31, true), NM29, true), NM31, true), NM30, true), NM31, true), NM30, true), NM31, true), NM31, true), NM30, true), NM31, true), NM30, true), NM31, true), NM31.slice(0, 7), true);
var NMDAY365MASK = __spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray([], NM31, true), NM28, true), NM31, true), NM30, true), NM31, true), NM30, true), NM31, true), NM31, true), NM30, true), NM31, true), NM30, true), NM31, true), NM31.slice(0, 7), true);
var M366RANGE = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366];
var M365RANGE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
var WDAYMASK = function() {
  var wdaymask = [];
  for (var i = 0; i < 55; i++)
    wdaymask = wdaymask.concat(range(7));
  return wdaymask;
}();

// node_modules/rrule/dist/esm/iterinfo/yearinfo.js
function rebuildYear(year, options) {
  var firstyday = datetime(year, 1, 1);
  var yearlen = isLeapYear(year) ? 366 : 365;
  var nextyearlen = isLeapYear(year + 1) ? 366 : 365;
  var yearordinal = toOrdinal(firstyday);
  var yearweekday = getWeekday(firstyday);
  var result = __assign(__assign({ yearlen, nextyearlen, yearordinal, yearweekday }, baseYearMasks(year)), { wnomask: null });
  if (empty(options.byweekno)) {
    return result;
  }
  result.wnomask = repeat(0, yearlen + 7);
  var firstwkst;
  var wyearlen;
  var no1wkst = firstwkst = pymod(7 - yearweekday + options.wkst, 7);
  if (no1wkst >= 4) {
    no1wkst = 0;
    wyearlen = result.yearlen + pymod(yearweekday - options.wkst, 7);
  } else {
    wyearlen = yearlen - no1wkst;
  }
  var div = Math.floor(wyearlen / 7);
  var mod = pymod(wyearlen, 7);
  var numweeks = Math.floor(div + mod / 4);
  for (var j = 0; j < options.byweekno.length; j++) {
    var n = options.byweekno[j];
    if (n < 0) {
      n += numweeks + 1;
    }
    if (!(n > 0 && n <= numweeks)) {
      continue;
    }
    var i = void 0;
    if (n > 1) {
      i = no1wkst + (n - 1) * 7;
      if (no1wkst !== firstwkst) {
        i -= 7 - firstwkst;
      }
    } else {
      i = no1wkst;
    }
    for (var k = 0; k < 7; k++) {
      result.wnomask[i] = 1;
      i++;
      if (result.wdaymask[i] === options.wkst)
        break;
    }
  }
  if (includes(options.byweekno, 1)) {
    var i = no1wkst + numweeks * 7;
    if (no1wkst !== firstwkst)
      i -= 7 - firstwkst;
    if (i < yearlen) {
      for (var j = 0; j < 7; j++) {
        result.wnomask[i] = 1;
        i += 1;
        if (result.wdaymask[i] === options.wkst)
          break;
      }
    }
  }
  if (no1wkst) {
    var lnumweeks = void 0;
    if (!includes(options.byweekno, -1)) {
      var lyearweekday = getWeekday(datetime(year - 1, 1, 1));
      var lno1wkst = pymod(7 - lyearweekday.valueOf() + options.wkst, 7);
      var lyearlen = isLeapYear(year - 1) ? 366 : 365;
      var weekst = void 0;
      if (lno1wkst >= 4) {
        lno1wkst = 0;
        weekst = lyearlen + pymod(lyearweekday - options.wkst, 7);
      } else {
        weekst = yearlen - no1wkst;
      }
      lnumweeks = Math.floor(52 + pymod(weekst, 7) / 4);
    } else {
      lnumweeks = -1;
    }
    if (includes(options.byweekno, lnumweeks)) {
      for (var i = 0; i < no1wkst; i++)
        result.wnomask[i] = 1;
    }
  }
  return result;
}
function baseYearMasks(year) {
  var yearlen = isLeapYear(year) ? 366 : 365;
  var firstyday = datetime(year, 1, 1);
  var wday = getWeekday(firstyday);
  if (yearlen === 365) {
    return {
      mmask: M365MASK,
      mdaymask: MDAY365MASK,
      nmdaymask: NMDAY365MASK,
      wdaymask: WDAYMASK.slice(wday),
      mrange: M365RANGE
    };
  }
  return {
    mmask: M366MASK,
    mdaymask: MDAY366MASK,
    nmdaymask: NMDAY366MASK,
    wdaymask: WDAYMASK.slice(wday),
    mrange: M366RANGE
  };
}

// node_modules/rrule/dist/esm/iterinfo/monthinfo.js
function rebuildMonth(year, month, yearlen, mrange, wdaymask, options) {
  var result = {
    lastyear: year,
    lastmonth: month,
    nwdaymask: []
  };
  var ranges = [];
  if (options.freq === RRule.YEARLY) {
    if (empty(options.bymonth)) {
      ranges = [[0, yearlen]];
    } else {
      for (var j = 0; j < options.bymonth.length; j++) {
        month = options.bymonth[j];
        ranges.push(mrange.slice(month - 1, month + 1));
      }
    }
  } else if (options.freq === RRule.MONTHLY) {
    ranges = [mrange.slice(month - 1, month + 1)];
  }
  if (empty(ranges)) {
    return result;
  }
  result.nwdaymask = repeat(0, yearlen);
  for (var j = 0; j < ranges.length; j++) {
    var rang = ranges[j];
    var first = rang[0];
    var last = rang[1] - 1;
    for (var k = 0; k < options.bynweekday.length; k++) {
      var i = void 0;
      var _a = options.bynweekday[k], wday = _a[0], n = _a[1];
      if (n < 0) {
        i = last + (n + 1) * 7;
        i -= pymod(wdaymask[i] - wday, 7);
      } else {
        i = first + (n - 1) * 7;
        i += pymod(7 - wdaymask[i] + wday, 7);
      }
      if (first <= i && i <= last)
        result.nwdaymask[i] = 1;
    }
  }
  return result;
}

// node_modules/rrule/dist/esm/iterinfo/easter.js
function easter(y, offset) {
  if (offset === void 0) {
    offset = 0;
  }
  var a = y % 19;
  var b = Math.floor(y / 100);
  var c = y % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = Math.floor(19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = Math.floor(32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31);
  var day = (h + l - 7 * m + 114) % 31 + 1;
  var date = Date.UTC(y, month - 1, day + offset);
  var yearStart = Date.UTC(y, 0, 1);
  return [Math.ceil((date - yearStart) / (1e3 * 60 * 60 * 24))];
}

// node_modules/rrule/dist/esm/iterinfo/index.js
var Iterinfo = (
  /** @class */
  function() {
    function Iterinfo2(options) {
      this.options = options;
    }
    Iterinfo2.prototype.rebuild = function(year, month) {
      var options = this.options;
      if (year !== this.lastyear) {
        this.yearinfo = rebuildYear(year, options);
      }
      if (notEmpty(options.bynweekday) && (month !== this.lastmonth || year !== this.lastyear)) {
        var _a = this.yearinfo, yearlen = _a.yearlen, mrange = _a.mrange, wdaymask = _a.wdaymask;
        this.monthinfo = rebuildMonth(year, month, yearlen, mrange, wdaymask, options);
      }
      if (isPresent(options.byeaster)) {
        this.eastermask = easter(year, options.byeaster);
      }
    };
    Object.defineProperty(Iterinfo2.prototype, "lastyear", {
      get: function() {
        return this.monthinfo ? this.monthinfo.lastyear : null;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Iterinfo2.prototype, "lastmonth", {
      get: function() {
        return this.monthinfo ? this.monthinfo.lastmonth : null;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Iterinfo2.prototype, "yearlen", {
      get: function() {
        return this.yearinfo.yearlen;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Iterinfo2.prototype, "yearordinal", {
      get: function() {
        return this.yearinfo.yearordinal;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Iterinfo2.prototype, "mrange", {
      get: function() {
        return this.yearinfo.mrange;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Iterinfo2.prototype, "wdaymask", {
      get: function() {
        return this.yearinfo.wdaymask;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Iterinfo2.prototype, "mmask", {
      get: function() {
        return this.yearinfo.mmask;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Iterinfo2.prototype, "wnomask", {
      get: function() {
        return this.yearinfo.wnomask;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Iterinfo2.prototype, "nwdaymask", {
      get: function() {
        return this.monthinfo ? this.monthinfo.nwdaymask : [];
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Iterinfo2.prototype, "nextyearlen", {
      get: function() {
        return this.yearinfo.nextyearlen;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Iterinfo2.prototype, "mdaymask", {
      get: function() {
        return this.yearinfo.mdaymask;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(Iterinfo2.prototype, "nmdaymask", {
      get: function() {
        return this.yearinfo.nmdaymask;
      },
      enumerable: false,
      configurable: true
    });
    Iterinfo2.prototype.ydayset = function() {
      return [range(this.yearlen), 0, this.yearlen];
    };
    Iterinfo2.prototype.mdayset = function(_, month) {
      var start = this.mrange[month - 1];
      var end = this.mrange[month];
      var set = repeat(null, this.yearlen);
      for (var i = start; i < end; i++)
        set[i] = i;
      return [set, start, end];
    };
    Iterinfo2.prototype.wdayset = function(year, month, day) {
      var set = repeat(null, this.yearlen + 7);
      var i = toOrdinal(datetime(year, month, day)) - this.yearordinal;
      var start = i;
      for (var j = 0; j < 7; j++) {
        set[i] = i;
        ++i;
        if (this.wdaymask[i] === this.options.wkst)
          break;
      }
      return [set, start, i];
    };
    Iterinfo2.prototype.ddayset = function(year, month, day) {
      var set = repeat(null, this.yearlen);
      var i = toOrdinal(datetime(year, month, day)) - this.yearordinal;
      set[i] = i;
      return [set, i, i + 1];
    };
    Iterinfo2.prototype.htimeset = function(hour, _, second, millisecond) {
      var _this = this;
      var set = [];
      this.options.byminute.forEach(function(minute) {
        set = set.concat(_this.mtimeset(hour, minute, second, millisecond));
      });
      sort(set);
      return set;
    };
    Iterinfo2.prototype.mtimeset = function(hour, minute, _, millisecond) {
      var set = this.options.bysecond.map(function(second) {
        return new Time(hour, minute, second, millisecond);
      });
      sort(set);
      return set;
    };
    Iterinfo2.prototype.stimeset = function(hour, minute, second, millisecond) {
      return [new Time(hour, minute, second, millisecond)];
    };
    Iterinfo2.prototype.getdayset = function(freq) {
      switch (freq) {
        case Frequency.YEARLY:
          return this.ydayset.bind(this);
        case Frequency.MONTHLY:
          return this.mdayset.bind(this);
        case Frequency.WEEKLY:
          return this.wdayset.bind(this);
        case Frequency.DAILY:
          return this.ddayset.bind(this);
        default:
          return this.ddayset.bind(this);
      }
    };
    Iterinfo2.prototype.gettimeset = function(freq) {
      switch (freq) {
        case Frequency.HOURLY:
          return this.htimeset.bind(this);
        case Frequency.MINUTELY:
          return this.mtimeset.bind(this);
        case Frequency.SECONDLY:
          return this.stimeset.bind(this);
      }
    };
    return Iterinfo2;
  }()
);
var iterinfo_default = Iterinfo;

// node_modules/rrule/dist/esm/iter/poslist.js
function buildPoslist(bysetpos, timeset, start, end, ii, dayset) {
  var poslist = [];
  for (var j = 0; j < bysetpos.length; j++) {
    var daypos = void 0;
    var timepos = void 0;
    var pos = bysetpos[j];
    if (pos < 0) {
      daypos = Math.floor(pos / timeset.length);
      timepos = pymod(pos, timeset.length);
    } else {
      daypos = Math.floor((pos - 1) / timeset.length);
      timepos = pymod(pos - 1, timeset.length);
    }
    var tmp = [];
    for (var k = start; k < end; k++) {
      var val = dayset[k];
      if (!isPresent(val))
        continue;
      tmp.push(val);
    }
    var i = void 0;
    if (daypos < 0) {
      i = tmp.slice(daypos)[0];
    } else {
      i = tmp[daypos];
    }
    var time = timeset[timepos];
    var date = fromOrdinal(ii.yearordinal + i);
    var res = combine(date, time);
    if (!includes(poslist, res))
      poslist.push(res);
  }
  sort(poslist);
  return poslist;
}

// node_modules/rrule/dist/esm/iter/index.js
function iter(iterResult, options) {
  var dtstart = options.dtstart, freq = options.freq, interval = options.interval, until = options.until, bysetpos = options.bysetpos;
  var count = options.count;
  if (count === 0 || interval === 0) {
    return emitResult(iterResult);
  }
  var counterDate = DateTime.fromDate(dtstart);
  var ii = new iterinfo_default(options);
  ii.rebuild(counterDate.year, counterDate.month);
  var timeset = makeTimeset(ii, counterDate, options);
  for (; ; ) {
    var _a = ii.getdayset(freq)(counterDate.year, counterDate.month, counterDate.day), dayset = _a[0], start = _a[1], end = _a[2];
    var filtered = removeFilteredDays(dayset, start, end, ii, options);
    if (notEmpty(bysetpos)) {
      var poslist = buildPoslist(bysetpos, timeset, start, end, ii, dayset);
      for (var j = 0; j < poslist.length; j++) {
        var res = poslist[j];
        if (until && res > until) {
          return emitResult(iterResult);
        }
        if (res >= dtstart) {
          var rezonedDate = rezoneIfNeeded(res, options);
          if (!iterResult.accept(rezonedDate)) {
            return emitResult(iterResult);
          }
          if (count) {
            --count;
            if (!count) {
              return emitResult(iterResult);
            }
          }
        }
      }
    } else {
      for (var j = start; j < end; j++) {
        var currentDay = dayset[j];
        if (!isPresent(currentDay)) {
          continue;
        }
        var date = fromOrdinal(ii.yearordinal + currentDay);
        for (var k = 0; k < timeset.length; k++) {
          var time = timeset[k];
          var res = combine(date, time);
          if (until && res > until) {
            return emitResult(iterResult);
          }
          if (res >= dtstart) {
            var rezonedDate = rezoneIfNeeded(res, options);
            if (!iterResult.accept(rezonedDate)) {
              return emitResult(iterResult);
            }
            if (count) {
              --count;
              if (!count) {
                return emitResult(iterResult);
              }
            }
          }
        }
      }
    }
    if (options.interval === 0) {
      return emitResult(iterResult);
    }
    counterDate.add(options, filtered);
    if (counterDate.year > MAXYEAR) {
      return emitResult(iterResult);
    }
    if (!freqIsDailyOrGreater(freq)) {
      timeset = ii.gettimeset(freq)(counterDate.hour, counterDate.minute, counterDate.second, 0);
    }
    ii.rebuild(counterDate.year, counterDate.month);
  }
}
function isFiltered(ii, currentDay, options) {
  var bymonth = options.bymonth, byweekno = options.byweekno, byweekday = options.byweekday, byeaster = options.byeaster, bymonthday = options.bymonthday, bynmonthday = options.bynmonthday, byyearday = options.byyearday;
  return notEmpty(bymonth) && !includes(bymonth, ii.mmask[currentDay]) || notEmpty(byweekno) && !ii.wnomask[currentDay] || notEmpty(byweekday) && !includes(byweekday, ii.wdaymask[currentDay]) || notEmpty(ii.nwdaymask) && !ii.nwdaymask[currentDay] || byeaster !== null && !includes(ii.eastermask, currentDay) || (notEmpty(bymonthday) || notEmpty(bynmonthday)) && !includes(bymonthday, ii.mdaymask[currentDay]) && !includes(bynmonthday, ii.nmdaymask[currentDay]) || notEmpty(byyearday) && (currentDay < ii.yearlen && !includes(byyearday, currentDay + 1) && !includes(byyearday, -ii.yearlen + currentDay) || currentDay >= ii.yearlen && !includes(byyearday, currentDay + 1 - ii.yearlen) && !includes(byyearday, -ii.nextyearlen + currentDay - ii.yearlen));
}
function rezoneIfNeeded(date, options) {
  return new DateWithZone(date, options.tzid).rezonedDate();
}
function emitResult(iterResult) {
  return iterResult.getValue();
}
function removeFilteredDays(dayset, start, end, ii, options) {
  var filtered = false;
  for (var dayCounter = start; dayCounter < end; dayCounter++) {
    var currentDay = dayset[dayCounter];
    filtered = isFiltered(ii, currentDay, options);
    if (filtered)
      dayset[currentDay] = null;
  }
  return filtered;
}
function makeTimeset(ii, counterDate, options) {
  var freq = options.freq, byhour = options.byhour, byminute = options.byminute, bysecond = options.bysecond;
  if (freqIsDailyOrGreater(freq)) {
    return buildTimeset(options);
  }
  if (freq >= RRule.HOURLY && notEmpty(byhour) && !includes(byhour, counterDate.hour) || freq >= RRule.MINUTELY && notEmpty(byminute) && !includes(byminute, counterDate.minute) || freq >= RRule.SECONDLY && notEmpty(bysecond) && !includes(bysecond, counterDate.second)) {
    return [];
  }
  return ii.gettimeset(freq)(counterDate.hour, counterDate.minute, counterDate.second, counterDate.millisecond);
}

// node_modules/rrule/dist/esm/rrule.js
var Days = {
  MO: new Weekday(0),
  TU: new Weekday(1),
  WE: new Weekday(2),
  TH: new Weekday(3),
  FR: new Weekday(4),
  SA: new Weekday(5),
  SU: new Weekday(6)
};
var DEFAULT_OPTIONS = {
  freq: Frequency.YEARLY,
  dtstart: null,
  interval: 1,
  wkst: Days.MO,
  count: null,
  until: null,
  tzid: null,
  bysetpos: null,
  bymonth: null,
  bymonthday: null,
  bynmonthday: null,
  byyearday: null,
  byweekno: null,
  byweekday: null,
  bynweekday: null,
  byhour: null,
  byminute: null,
  bysecond: null,
  byeaster: null
};
var defaultKeys = Object.keys(DEFAULT_OPTIONS);
var RRule = (
  /** @class */
  function() {
    function RRule2(options, noCache) {
      if (options === void 0) {
        options = {};
      }
      if (noCache === void 0) {
        noCache = false;
      }
      this._cache = noCache ? null : new Cache();
      this.origOptions = initializeOptions(options);
      var parsedOptions = parseOptions(options).parsedOptions;
      this.options = parsedOptions;
    }
    RRule2.parseText = function(text, language) {
      return parseText(text, language);
    };
    RRule2.fromText = function(text, language) {
      return fromText(text, language);
    };
    RRule2.fromString = function(str) {
      return new RRule2(RRule2.parseString(str) || void 0);
    };
    RRule2.prototype._iter = function(iterResult) {
      return iter(iterResult, this.options);
    };
    RRule2.prototype._cacheGet = function(what, args) {
      if (!this._cache)
        return false;
      return this._cache._cacheGet(what, args);
    };
    RRule2.prototype._cacheAdd = function(what, value, args) {
      if (!this._cache)
        return;
      return this._cache._cacheAdd(what, value, args);
    };
    RRule2.prototype.all = function(iterator) {
      if (iterator) {
        return this._iter(new callbackiterresult_default("all", {}, iterator));
      }
      var result = this._cacheGet("all");
      if (result === false) {
        result = this._iter(new iterresult_default("all", {}));
        this._cacheAdd("all", result);
      }
      return result;
    };
    RRule2.prototype.between = function(after, before, inc, iterator) {
      if (inc === void 0) {
        inc = false;
      }
      if (!isValidDate(after) || !isValidDate(before)) {
        throw new Error("Invalid date passed in to RRule.between");
      }
      var args = {
        before,
        after,
        inc
      };
      if (iterator) {
        return this._iter(new callbackiterresult_default("between", args, iterator));
      }
      var result = this._cacheGet("between", args);
      if (result === false) {
        result = this._iter(new iterresult_default("between", args));
        this._cacheAdd("between", result, args);
      }
      return result;
    };
    RRule2.prototype.before = function(dt, inc) {
      if (inc === void 0) {
        inc = false;
      }
      if (!isValidDate(dt)) {
        throw new Error("Invalid date passed in to RRule.before");
      }
      var args = { dt, inc };
      var result = this._cacheGet("before", args);
      if (result === false) {
        result = this._iter(new iterresult_default("before", args));
        this._cacheAdd("before", result, args);
      }
      return result;
    };
    RRule2.prototype.after = function(dt, inc) {
      if (inc === void 0) {
        inc = false;
      }
      if (!isValidDate(dt)) {
        throw new Error("Invalid date passed in to RRule.after");
      }
      var args = { dt, inc };
      var result = this._cacheGet("after", args);
      if (result === false) {
        result = this._iter(new iterresult_default("after", args));
        this._cacheAdd("after", result, args);
      }
      return result;
    };
    RRule2.prototype.count = function() {
      return this.all().length;
    };
    RRule2.prototype.toString = function() {
      return optionsToString(this.origOptions);
    };
    RRule2.prototype.toText = function(gettext, language, dateFormatter) {
      return toText(this, gettext, language, dateFormatter);
    };
    RRule2.prototype.isFullyConvertibleToText = function() {
      return isFullyConvertible(this);
    };
    RRule2.prototype.clone = function() {
      return new RRule2(this.origOptions);
    };
    RRule2.FREQUENCIES = [
      "YEARLY",
      "MONTHLY",
      "WEEKLY",
      "DAILY",
      "HOURLY",
      "MINUTELY",
      "SECONDLY"
    ];
    RRule2.YEARLY = Frequency.YEARLY;
    RRule2.MONTHLY = Frequency.MONTHLY;
    RRule2.WEEKLY = Frequency.WEEKLY;
    RRule2.DAILY = Frequency.DAILY;
    RRule2.HOURLY = Frequency.HOURLY;
    RRule2.MINUTELY = Frequency.MINUTELY;
    RRule2.SECONDLY = Frequency.SECONDLY;
    RRule2.MO = Days.MO;
    RRule2.TU = Days.TU;
    RRule2.WE = Days.WE;
    RRule2.TH = Days.TH;
    RRule2.FR = Days.FR;
    RRule2.SA = Days.SA;
    RRule2.SU = Days.SU;
    RRule2.parseString = parseString;
    RRule2.optionsToString = optionsToString;
    return RRule2;
  }()
);

// node_modules/rrule/dist/esm/iterset.js
function iterSet(iterResult, _rrule, _exrule, _rdate, _exdate, tzid) {
  var _exdateHash = {};
  var _accept = iterResult.accept;
  function evalExdate(after, before) {
    _exrule.forEach(function(rrule) {
      rrule.between(after, before, true).forEach(function(date) {
        _exdateHash[Number(date)] = true;
      });
    });
  }
  _exdate.forEach(function(date) {
    var zonedDate2 = new DateWithZone(date, tzid).rezonedDate();
    _exdateHash[Number(zonedDate2)] = true;
  });
  iterResult.accept = function(date) {
    var dt = Number(date);
    if (isNaN(dt))
      return _accept.call(this, date);
    if (!_exdateHash[dt]) {
      evalExdate(new Date(dt - 1), new Date(dt + 1));
      if (!_exdateHash[dt]) {
        _exdateHash[dt] = true;
        return _accept.call(this, date);
      }
    }
    return true;
  };
  if (iterResult.method === "between") {
    evalExdate(iterResult.args.after, iterResult.args.before);
    iterResult.accept = function(date) {
      var dt = Number(date);
      if (!_exdateHash[dt]) {
        _exdateHash[dt] = true;
        return _accept.call(this, date);
      }
      return true;
    };
  }
  for (var i = 0; i < _rdate.length; i++) {
    var zonedDate = new DateWithZone(_rdate[i], tzid).rezonedDate();
    if (!iterResult.accept(new Date(zonedDate.getTime())))
      break;
  }
  _rrule.forEach(function(rrule) {
    iter(iterResult, rrule.options);
  });
  var res = iterResult._result;
  sort(res);
  switch (iterResult.method) {
    case "all":
    case "between":
      return res;
    case "before":
      return res.length && res[res.length - 1] || null;
    case "after":
    default:
      return res.length && res[0] || null;
  }
}

// node_modules/rrule/dist/esm/rrulestr.js
var DEFAULT_OPTIONS2 = {
  dtstart: null,
  cache: false,
  unfold: false,
  forceset: false,
  compatible: false,
  tzid: null
};
function parseInput(s, options) {
  var rrulevals = [];
  var rdatevals = [];
  var exrulevals = [];
  var exdatevals = [];
  var parsedDtstart = parseDtstart(s);
  var dtstart = parsedDtstart.dtstart;
  var tzid = parsedDtstart.tzid;
  var lines = splitIntoLines(s, options.unfold);
  lines.forEach(function(line) {
    var _a;
    if (!line)
      return;
    var _b = breakDownLine(line), name = _b.name, parms = _b.parms, value = _b.value;
    switch (name.toUpperCase()) {
      case "RRULE":
        if (parms.length) {
          throw new Error("unsupported RRULE parm: ".concat(parms.join(",")));
        }
        rrulevals.push(parseString(line));
        break;
      case "RDATE":
        var _c = (_a = /RDATE(?:;TZID=([^:=]+))?/i.exec(line)) !== null && _a !== void 0 ? _a : [], rdateTzid = _c[1];
        if (rdateTzid && !tzid) {
          tzid = rdateTzid;
        }
        rdatevals = rdatevals.concat(parseRDate(value, parms));
        break;
      case "EXRULE":
        if (parms.length) {
          throw new Error("unsupported EXRULE parm: ".concat(parms.join(",")));
        }
        exrulevals.push(parseString(value));
        break;
      case "EXDATE":
        exdatevals = exdatevals.concat(parseRDate(value, parms));
        break;
      case "DTSTART":
        break;
      default:
        throw new Error("unsupported property: " + name);
    }
  });
  return {
    dtstart,
    tzid,
    rrulevals,
    rdatevals,
    exrulevals,
    exdatevals
  };
}
function buildRule(s, options) {
  var _a = parseInput(s, options), rrulevals = _a.rrulevals, rdatevals = _a.rdatevals, exrulevals = _a.exrulevals, exdatevals = _a.exdatevals, dtstart = _a.dtstart, tzid = _a.tzid;
  var noCache = options.cache === false;
  if (options.compatible) {
    options.forceset = true;
    options.unfold = true;
  }
  if (options.forceset || rrulevals.length > 1 || rdatevals.length || exrulevals.length || exdatevals.length) {
    var rset_1 = new RRuleSet(noCache);
    rset_1.dtstart(dtstart);
    rset_1.tzid(tzid || void 0);
    rrulevals.forEach(function(val2) {
      rset_1.rrule(new RRule(groomRruleOptions(val2, dtstart, tzid), noCache));
    });
    rdatevals.forEach(function(date) {
      rset_1.rdate(date);
    });
    exrulevals.forEach(function(val2) {
      rset_1.exrule(new RRule(groomRruleOptions(val2, dtstart, tzid), noCache));
    });
    exdatevals.forEach(function(date) {
      rset_1.exdate(date);
    });
    if (options.compatible && options.dtstart)
      rset_1.rdate(dtstart);
    return rset_1;
  }
  var val = rrulevals[0] || {};
  return new RRule(groomRruleOptions(val, val.dtstart || options.dtstart || dtstart, val.tzid || options.tzid || tzid), noCache);
}
function rrulestr(s, options) {
  if (options === void 0) {
    options = {};
  }
  return buildRule(s, initializeOptions2(options));
}
function groomRruleOptions(val, dtstart, tzid) {
  return __assign(__assign({}, val), { dtstart, tzid });
}
function initializeOptions2(options) {
  var invalid = [];
  var keys = Object.keys(options);
  var defaultKeys2 = Object.keys(DEFAULT_OPTIONS2);
  keys.forEach(function(key) {
    if (!includes(defaultKeys2, key))
      invalid.push(key);
  });
  if (invalid.length) {
    throw new Error("Invalid options: " + invalid.join(", "));
  }
  return __assign(__assign({}, DEFAULT_OPTIONS2), options);
}
function extractName(line) {
  if (line.indexOf(":") === -1) {
    return {
      name: "RRULE",
      value: line
    };
  }
  var _a = split(line, ":", 1), name = _a[0], value = _a[1];
  return {
    name,
    value
  };
}
function breakDownLine(line) {
  var _a = extractName(line), name = _a.name, value = _a.value;
  var parms = name.split(";");
  if (!parms)
    throw new Error("empty property name");
  return {
    name: parms[0].toUpperCase(),
    parms: parms.slice(1),
    value
  };
}
function splitIntoLines(s, unfold) {
  if (unfold === void 0) {
    unfold = false;
  }
  s = s && s.trim();
  if (!s)
    throw new Error("Invalid empty string");
  if (!unfold) {
    return s.split(/\s/);
  }
  var lines = s.split("\n");
  var i = 0;
  while (i < lines.length) {
    var line = lines[i] = lines[i].replace(/\s+$/g, "");
    if (!line) {
      lines.splice(i, 1);
    } else if (i > 0 && line[0] === " ") {
      lines[i - 1] += line.slice(1);
      lines.splice(i, 1);
    } else {
      i += 1;
    }
  }
  return lines;
}
function validateDateParm(parms) {
  parms.forEach(function(parm) {
    if (!/(VALUE=DATE(-TIME)?)|(TZID=)/.test(parm)) {
      throw new Error("unsupported RDATE/EXDATE parm: " + parm);
    }
  });
}
function parseRDate(rdateval, parms) {
  validateDateParm(parms);
  return rdateval.split(",").map(function(datestr) {
    return untilStringToDate(datestr);
  });
}

// node_modules/rrule/dist/esm/rruleset.js
function createGetterSetter(fieldName) {
  var _this = this;
  return function(field) {
    if (field !== void 0) {
      _this["_".concat(fieldName)] = field;
    }
    if (_this["_".concat(fieldName)] !== void 0) {
      return _this["_".concat(fieldName)];
    }
    for (var i = 0; i < _this._rrule.length; i++) {
      var field_1 = _this._rrule[i].origOptions[fieldName];
      if (field_1) {
        return field_1;
      }
    }
  };
}
var RRuleSet = (
  /** @class */
  function(_super) {
    __extends(RRuleSet3, _super);
    function RRuleSet3(noCache) {
      if (noCache === void 0) {
        noCache = false;
      }
      var _this = _super.call(this, {}, noCache) || this;
      _this.dtstart = createGetterSetter.apply(_this, ["dtstart"]);
      _this.tzid = createGetterSetter.apply(_this, ["tzid"]);
      _this._rrule = [];
      _this._rdate = [];
      _this._exrule = [];
      _this._exdate = [];
      return _this;
    }
    RRuleSet3.prototype._iter = function(iterResult) {
      return iterSet(iterResult, this._rrule, this._exrule, this._rdate, this._exdate, this.tzid());
    };
    RRuleSet3.prototype.rrule = function(rrule) {
      _addRule(rrule, this._rrule);
    };
    RRuleSet3.prototype.exrule = function(rrule) {
      _addRule(rrule, this._exrule);
    };
    RRuleSet3.prototype.rdate = function(date) {
      _addDate(date, this._rdate);
    };
    RRuleSet3.prototype.exdate = function(date) {
      _addDate(date, this._exdate);
    };
    RRuleSet3.prototype.rrules = function() {
      return this._rrule.map(function(e) {
        return rrulestr(e.toString());
      });
    };
    RRuleSet3.prototype.exrules = function() {
      return this._exrule.map(function(e) {
        return rrulestr(e.toString());
      });
    };
    RRuleSet3.prototype.rdates = function() {
      return this._rdate.map(function(e) {
        return new Date(e.getTime());
      });
    };
    RRuleSet3.prototype.exdates = function() {
      return this._exdate.map(function(e) {
        return new Date(e.getTime());
      });
    };
    RRuleSet3.prototype.valueOf = function() {
      var result = [];
      if (!this._rrule.length && this._dtstart) {
        result = result.concat(optionsToString({ dtstart: this._dtstart }));
      }
      this._rrule.forEach(function(rrule) {
        result = result.concat(rrule.toString().split("\n"));
      });
      this._exrule.forEach(function(exrule) {
        result = result.concat(exrule.toString().split("\n").map(function(line) {
          return line.replace(/^RRULE:/, "EXRULE:");
        }).filter(function(line) {
          return !/^DTSTART/.test(line);
        }));
      });
      if (this._rdate.length) {
        result.push(rdatesToString("RDATE", this._rdate, this.tzid()));
      }
      if (this._exdate.length) {
        result.push(rdatesToString("EXDATE", this._exdate, this.tzid()));
      }
      return result;
    };
    RRuleSet3.prototype.toString = function() {
      return this.valueOf().join("\n");
    };
    RRuleSet3.prototype.clone = function() {
      var rrs = new RRuleSet3(!!this._cache);
      this._rrule.forEach(function(rule) {
        return rrs.rrule(rule.clone());
      });
      this._exrule.forEach(function(rule) {
        return rrs.exrule(rule.clone());
      });
      this._rdate.forEach(function(date) {
        return rrs.rdate(new Date(date.getTime()));
      });
      this._exdate.forEach(function(date) {
        return rrs.exdate(new Date(date.getTime()));
      });
      return rrs;
    };
    return RRuleSet3;
  }(RRule)
);
function _addRule(rrule, collection) {
  if (!(rrule instanceof RRule)) {
    throw new TypeError(String(rrule) + " is not RRule instance");
  }
  if (!includes(collection.map(String), String(rrule))) {
    collection.push(rrule);
  }
}
function _addDate(date, collection) {
  if (!(date instanceof Date)) {
    throw new TypeError(String(date) + " is not Date instance");
  }
  if (!includes(collection.map(Number), Number(date))) {
    collection.push(date);
    sort(collection);
  }
}
function rdatesToString(param, rdates, tzid) {
  var isUTC = !tzid || tzid.toUpperCase() === "UTC";
  var header = isUTC ? "".concat(param, ":") : "".concat(param, ";TZID=").concat(tzid, ":");
  var dateString = rdates.map(function(rdate) {
    return timeToUntilString(rdate.valueOf(), isUTC);
  }).join(",");
  return "".concat(header).concat(dateString);
}

// src/services/RecurrenceService.ts
var RecurrenceService = class {
  /**
   * Parse a recurrence text like "every day" or "every week on Monday"
   * and return the next occurrence date after the reference date
   */
  static getNextOccurrence(recurrenceText, referenceDate) {
    try {
      const cleanText = recurrenceText.toLowerCase().replace(/^every\s+/, "").trim();
      const rule = this.textToRRule(cleanText, referenceDate);
      if (!rule)
        return null;
      const nextDate = rule.after(referenceDate, false);
      return nextDate;
    } catch (error) {
      console.error("RecurrenceService: Error parsing recurrence:", error);
      return null;
    }
  }
  /**
   * Convert human-readable text to RRule
   */
  static textToRRule(text, dtstart) {
    try {
      const patterns = {
        "day": { freq: RRule.DAILY },
        "daily": { freq: RRule.DAILY },
        "week": { freq: RRule.WEEKLY },
        "weekly": { freq: RRule.WEEKLY },
        "month": { freq: RRule.MONTHLY },
        "monthly": { freq: RRule.MONTHLY },
        "year": { freq: RRule.YEARLY },
        "yearly": { freq: RRule.YEARLY }
      };
      const dayMap = {
        "monday": RRule.MO,
        "tuesday": RRule.TU,
        "wednesday": RRule.WE,
        "thursday": RRule.TH,
        "friday": RRule.FR,
        "saturday": RRule.SA,
        "sunday": RRule.SU
      };
      let options = { dtstart };
      const intervalMatch = text.match(/^(\d+)\s*(day|week|month|year)s?$/);
      if (intervalMatch) {
        const interval = parseInt(intervalMatch[1]);
        const unit = intervalMatch[2];
        options = { ...options, ...patterns[unit], interval };
        return new RRule(options);
      }
      const weekdayMatch = text.match(/(?:week\s+on\s+)?(\w+day)/i);
      if (weekdayMatch) {
        const dayName = weekdayMatch[1].toLowerCase();
        if (dayMap[dayName]) {
          options = {
            ...options,
            freq: RRule.WEEKLY,
            byweekday: [dayMap[dayName]]
          };
          return new RRule(options);
        }
      }
      const monthDayMatch = text.match(/month\s+on\s+the\s+(\d+)(?:st|nd|rd|th)?/i);
      if (monthDayMatch) {
        const dayOfMonth = parseInt(monthDayMatch[1]);
        options = {
          ...options,
          freq: RRule.MONTHLY,
          bymonthday: [dayOfMonth]
        };
        return new RRule(options);
      }
      const weeksMatch = text.match(/^(\d+)\s*weeks?$/);
      if (weeksMatch) {
        options = {
          ...options,
          freq: RRule.WEEKLY,
          interval: parseInt(weeksMatch[1])
        };
        return new RRule(options);
      }
      for (const [key, value] of Object.entries(patterns)) {
        if (text.includes(key)) {
          options = { ...options, ...value };
          return new RRule(options);
        }
      }
      try {
        return RRule.fromText(text);
      } catch (e) {
        return null;
      }
    } catch (error) {
      console.error("RecurrenceService: Error creating RRule:", error);
      return null;
    }
  }
  /**
   * Format a date as YYYY-MM-DD
   */
  static formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  /**
   * Create a new task line with updated due date for next occurrence
   */
  static createNextRecurringTaskLine(originalLine, recurrenceText, currentDueDate) {
    const currentDate = new Date(currentDueDate);
    if (isNaN(currentDate.getTime())) {
      console.error("RecurrenceService: Invalid current due date");
      return null;
    }
    const nextDate = this.getNextOccurrence(recurrenceText, currentDate);
    if (!nextDate) {
      console.error("RecurrenceService: Could not calculate next occurrence");
      return null;
    }
    const nextDateStr = this.formatDate(nextDate);
    let newLine = originalLine.replace(/\[[xX]\]/, "[ ]").replace(/📅\s*\d{4}-\d{2}-\d{2}/, `\u{1F4C5} ${nextDateStr}`).replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "").replace(/#archived/g, "").replace(/\s+/g, " ").trim();
    newLine = newLine.replace(/#status\/[\w-]+/, "#status/todo");
    if (!newLine.includes("#status/")) {
      newLine = newLine + " #status/todo";
    }
    return newLine;
  }
};

// src/services/TaskUpdater.ts
var TaskUpdater = class {
  constructor(app) {
    this.app = app;
  }
  /**
   * Update a task's status tag in its source file
   */
  async updateTaskStatus(task, newStatus) {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!file || !(file instanceof import_obsidian2.TFile)) {
        console.error("TaskBoard: File not found:", task.filePath);
        return false;
      }
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const lineIndex = task.lineNumber - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) {
        console.error("TaskBoard: Line number out of range");
        return false;
      }
      let line = lines[lineIndex];
      line = line.replace(/#status\/[\w-]+/g, "").replace(/\s+/g, " ").trim();
      line = line + ` #status/${newStatus}`;
      lines[lineIndex] = line;
      await this.app.vault.modify(file, lines.join("\n"));
      console.log(`TaskBoard: Updated task status to ${newStatus}`);
      return true;
    } catch (error) {
      console.error("TaskBoard: Error updating task:", error);
      return false;
    }
  }
  /**
   * Toggle task completion (checkbox)
   */
  async toggleTaskCompletion(task, completed) {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!file || !(file instanceof import_obsidian2.TFile)) {
        console.error("TaskBoard: File not found:", task.filePath);
        return false;
      }
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const lineIndex = task.lineNumber - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) {
        console.error("TaskBoard: Line number out of range");
        return false;
      }
      let line = lines[lineIndex];
      if (completed) {
        line = line.replace(/\[\s\]/, "[x]");
        if (!line.includes("\u2705")) {
          const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          line = line + ` \u2705 ${today}`;
        }
      } else {
        line = line.replace(/\[[xX]\]/, "[ ]");
        line = line.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "").replace(/\s+/g, " ").trim();
      }
      lines[lineIndex] = line;
      await this.app.vault.modify(file, lines.join("\n"));
      console.log(`TaskBoard: Toggled task completion to ${completed}`);
      return true;
    } catch (error) {
      console.error("TaskBoard: Error toggling task:", error);
      return false;
    }
  }
  /**
   * Move task to a new status and optionally complete it
   */
  async moveTask(task, newStatus, markComplete = false) {
    if (markComplete && task.isRecurring && task.recurrence && task.dueDate) {
      return await this.completeRecurringTask(task, newStatus);
    }
    const statusUpdated = await this.updateTaskStatus(task, newStatus);
    if (!statusUpdated)
      return false;
    if (markComplete !== task.completed) {
      return await this.toggleTaskCompletion(
        { ...task, rawText: "" },
        // Re-read from file
        markComplete
      );
    }
    return true;
  }
  /**
   * Complete a recurring task - marks current as done and creates new instance
   */
  async completeRecurringTask(task, newStatus) {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!file || !(file instanceof import_obsidian2.TFile)) {
        console.error("TaskBoard: File not found:", task.filePath);
        return false;
      }
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const lineIndex = task.lineNumber - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) {
        console.error("TaskBoard: Line number out of range");
        return false;
      }
      const currentLine = lines[lineIndex];
      const newTaskLine = RecurrenceService.createNextRecurringTaskLine(
        currentLine,
        task.recurrence,
        task.dueDate
      );
      if (!newTaskLine) {
        console.error("TaskBoard: Could not create next recurring instance");
        return await this.toggleTaskCompletion(task, true);
      }
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      let completedLine = currentLine.replace(/\[\s\]/, "[x]").replace(/#status\/[\w-]+/, `#status/${newStatus}`);
      if (!completedLine.includes("\u2705")) {
        completedLine = completedLine + ` \u2705 ${today}`;
      }
      lines[lineIndex] = completedLine;
      lines.splice(lineIndex, 0, newTaskLine);
      await this.app.vault.modify(file, lines.join("\n"));
      console.log("TaskBoard: Recurring task completed, new instance created");
      return true;
    } catch (error) {
      console.error("TaskBoard: Error completing recurring task:", error);
      return false;
    }
  }
  /**
   * Archive a task - adds #archived tag so it disappears from board
   * (Used when three-file system is disabled)
   */
  async archiveTask(task) {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!file || !(file instanceof import_obsidian2.TFile)) {
        console.error("TaskBoard: File not found:", task.filePath);
        return false;
      }
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const lineIndex = task.lineNumber - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) {
        console.error("TaskBoard: Line number out of range");
        return false;
      }
      let line = lines[lineIndex];
      line = line.replace(/#status\/[\w-]+/g, "").replace(/\s+/g, " ").trim();
      line = line + " #archived";
      lines[lineIndex] = line;
      await this.app.vault.modify(file, lines.join("\n"));
      console.log("TaskBoard: Task archived");
      return true;
    } catch (error) {
      console.error("TaskBoard: Error archiving task:", error);
      return false;
    }
  }
  /**
   * Archive a task to a dedicated file (three-file system)
   * Moves the task line from source file to archive file with metadata
   */
  async archiveTaskToFile(task, archiveFilePath) {
    try {
      const sourceFile = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!sourceFile || !(sourceFile instanceof import_obsidian2.TFile)) {
        console.error("TaskBoard: Source file not found:", task.filePath);
        return false;
      }
      const sourceContent = await this.app.vault.read(sourceFile);
      const sourceLines = sourceContent.split("\n");
      const lineIndex = task.lineNumber - 1;
      if (lineIndex < 0 || lineIndex >= sourceLines.length) {
        console.error("TaskBoard: Line number out of range");
        return false;
      }
      let archivedLine = sourceLines[lineIndex];
      archivedLine = archivedLine.replace(/#status\/[\w-]+/g, "").replace(/\s+/g, " ").trim();
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      archivedLine = archivedLine + ` #archived \u{1F4E5} ${today}`;
      const archiveFile = this.app.vault.getAbstractFileByPath(archiveFilePath);
      let archiveContent = "";
      if (archiveFile && archiveFile instanceof import_obsidian2.TFile) {
        archiveContent = await this.app.vault.read(archiveFile);
      } else {
        const folderPath = archiveFilePath.substring(0, archiveFilePath.lastIndexOf("/"));
        if (folderPath) {
          const folder = this.app.vault.getAbstractFileByPath(folderPath);
          if (!folder) {
            await this.app.vault.createFolder(folderPath);
          }
        }
        archiveContent = "# Archive\n\nCompleted and archived tasks are stored here.\n";
      }
      if (!archiveContent.endsWith("\n")) {
        archiveContent += "\n";
      }
      archiveContent += archivedLine + "\n";
      if (archiveFile && archiveFile instanceof import_obsidian2.TFile) {
        await this.app.vault.modify(archiveFile, archiveContent);
      } else {
        await this.app.vault.create(archiveFilePath, archiveContent);
      }
      sourceLines.splice(lineIndex, 1);
      await this.app.vault.modify(sourceFile, sourceLines.join("\n"));
      console.log("TaskBoard: Task archived to file");
      return true;
    } catch (error) {
      console.error("TaskBoard: Error archiving task to file:", error);
      return false;
    }
  }
  /**
   * Set or update the due date for a task
   */
  async setTaskDueDate(task, date) {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!file || !(file instanceof import_obsidian2.TFile)) {
        console.error("TaskBoard: File not found:", task.filePath);
        return false;
      }
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const lineIndex = task.lineNumber - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) {
        console.error("TaskBoard: Line number out of range");
        return false;
      }
      let line = lines[lineIndex];
      const dueDatePattern = /📅\s*\d{4}-\d{2}-\d{2}/;
      if (dueDatePattern.test(line)) {
        line = line.replace(dueDatePattern, `\u{1F4C5} ${date}`);
      } else {
        const statusMatch = line.match(/#status\/[\w-]+/);
        if (statusMatch) {
          const statusIndex = line.indexOf(statusMatch[0]);
          line = line.slice(0, statusIndex) + `\u{1F4C5} ${date} ` + line.slice(statusIndex);
        } else {
          line = line + ` \u{1F4C5} ${date}`;
        }
      }
      line = line.replace(/\s+/g, " ").trim();
      lines[lineIndex] = line;
      await this.app.vault.modify(file, lines.join("\n"));
      console.log(`TaskBoard: Set task due date to ${date}`);
      return true;
    } catch (error) {
      console.error("TaskBoard: Error setting task due date:", error);
      return false;
    }
  }
  /**
   * Unarchive a task - move from archive file back to todo file
   */
  async unarchiveTask(task, archiveFilePath, todoFilePath) {
    try {
      const archiveFile = this.app.vault.getAbstractFileByPath(archiveFilePath);
      if (!archiveFile || !(archiveFile instanceof import_obsidian2.TFile)) {
        console.error("TaskBoard: Archive file not found:", archiveFilePath);
        return false;
      }
      const archiveContent = await this.app.vault.read(archiveFile);
      const archiveLines = archiveContent.split("\n");
      const lineIndex = task.lineNumber - 1;
      if (lineIndex < 0 || lineIndex >= archiveLines.length) {
        console.error("TaskBoard: Line number out of range in archive");
        return false;
      }
      let restoredLine = archiveLines[lineIndex];
      restoredLine = restoredLine.replace(/\[[xX]\]/, "[ ]");
      restoredLine = restoredLine.replace(/#archived/g, "").replace(/📥\s*\d{4}-\d{2}-\d{2}/g, "").replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "").replace(/\s+/g, " ").trim();
      restoredLine = restoredLine + " #status/todo";
      const todoFile = this.app.vault.getAbstractFileByPath(todoFilePath);
      let todoContent = "";
      if (todoFile && todoFile instanceof import_obsidian2.TFile) {
        todoContent = await this.app.vault.read(todoFile);
      } else {
        const folderPath = todoFilePath.substring(0, todoFilePath.lastIndexOf("/"));
        if (folderPath) {
          const folder = this.app.vault.getAbstractFileByPath(folderPath);
          if (!folder) {
            await this.app.vault.createFolder(folderPath);
          }
        }
        todoContent = "# To Do\n\nActive tasks go here.\n";
      }
      if (!todoContent.endsWith("\n")) {
        todoContent += "\n";
      }
      todoContent += restoredLine + "\n";
      if (todoFile && todoFile instanceof import_obsidian2.TFile) {
        await this.app.vault.modify(todoFile, todoContent);
      } else {
        await this.app.vault.create(todoFilePath, todoContent);
      }
      archiveLines.splice(lineIndex, 1);
      await this.app.vault.modify(archiveFile, archiveLines.join("\n"));
      console.log("TaskBoard: Task unarchived");
      return true;
    } catch (error) {
      console.error("TaskBoard: Error unarchiving task:", error);
      return false;
    }
  }
};

// src/utils/DateUtils.ts
var DateUtils = class {
  /**
   * Get today's date as YYYY-MM-DD string
   */
  static today() {
    return this.formatDate(/* @__PURE__ */ new Date());
  }
  /**
   * Format a Date object to YYYY-MM-DD string
   */
  static formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  /**
   * Parse YYYY-MM-DD string to Date object (at midnight local time)
   */
  static parseDate(dateStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  /**
   * Get the date range for a preset filter
   */
  static getPresetRange(preset) {
    if (preset === "all") {
      return null;
    }
    const now = /* @__PURE__ */ new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const from = this.formatDate(today);
    switch (preset) {
      case "today":
        return { from, to: from };
      case "this_week": {
        const dayOfWeek = today.getDay();
        const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + daysUntilSunday);
        return { from, to: this.formatDate(endOfWeek) };
      }
      case "this_month": {
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { from, to: this.formatDate(endOfMonth) };
      }
      case "this_quarter": {
        const currentMonth = today.getMonth();
        const quarterEndMonth = Math.floor(currentMonth / 3) * 3 + 2;
        const endOfQuarter = new Date(today.getFullYear(), quarterEndMonth + 1, 0);
        return { from, to: this.formatDate(endOfQuarter) };
      }
      case "this_year": {
        return { from, to: `${today.getFullYear()}-12-31` };
      }
      case "custom":
        return { from, to: from };
      default:
        return null;
    }
  }
  /**
   * Check if a date string (YYYY-MM-DD) is within the given range (inclusive)
   * If dateStr is null/undefined, it's treated as "today"
   */
  static isInRange(dateStr, fromDate, toDate) {
    const effectiveDate = dateStr || this.today();
    const date = this.parseDate(effectiveDate);
    const from = this.parseDate(fromDate);
    const to = this.parseDate(toDate);
    date.setHours(0, 0, 0, 0);
    from.setHours(0, 0, 0, 0);
    to.setHours(0, 0, 0, 0);
    return date >= from && date <= to;
  }
  /**
   * Create a default TimeFilter (preset: 'all')
   */
  static defaultFilter() {
    const today = this.today();
    return {
      preset: "all",
      fromDate: today,
      toDate: today
    };
  }
  /**
   * Create a TimeFilter for a given preset
   */
  static createFilter(preset) {
    const range2 = this.getPresetRange(preset);
    return {
      preset,
      fromDate: (range2 == null ? void 0 : range2.from) || this.today(),
      toDate: (range2 == null ? void 0 : range2.to) || this.today()
    };
  }
  /**
   * Ensure from <= to, swap if necessary
   */
  static normalizeRange(from, to) {
    const fromDate = this.parseDate(from);
    const toDate = this.parseDate(to);
    if (fromDate > toDate) {
      return { from: to, to: from };
    }
    return { from, to };
  }
};

// src/main.ts
var VIEW_TYPE_TASKBOARD = "taskboard-view";
var TaskBoardPlugin = class extends import_obsidian3.Plugin {
  async onload() {
    console.log("TaskBoard Pro: Loading plugin");
    await this.loadSettings();
    this.registerView(
      VIEW_TYPE_TASKBOARD,
      (leaf) => new TaskBoardView(leaf, this)
    );
    this.addRibbonIcon("kanban", "Open TaskBoard", () => {
      this.activateView();
    });
    this.addCommand({
      id: "open-taskboard",
      name: "Open TaskBoard",
      callback: () => {
        this.activateView();
      }
    });
    this.addCommand({
      id: "refresh-taskboard",
      name: "Refresh TaskBoard",
      callback: () => {
        this.refreshBoard();
      }
    });
    this.addSettingTab(new TaskBoardSettingTab(this.app, this));
    console.log("TaskBoard Pro: Plugin loaded successfully");
  }
  onunload() {
    console.log("TaskBoard Pro: Unloading plugin");
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_TASKBOARD);
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_TASKBOARD, active: true });
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
  async refreshBoard() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASKBOARD);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view && view.refresh) {
        await view.refresh();
      }
    }
  }
};
var TaskBoardView = class extends import_obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.tasks = [];
    this.archivedTasks = [];
    this.draggedTask = null;
    // Time filter state (not persisted - resets when view reopens)
    this.timeFilter = DateUtils.defaultFilter();
    // Tag filter state
    this.selectedTags = /* @__PURE__ */ new Set();
    this.availableTags = [];
    // Archive section state
    this.showArchive = false;
    // Unscheduled tasks visibility
    this.showUnscheduled = false;
    this.plugin = plugin;
    this.taskUpdater = new TaskUpdater(this.app);
  }
  getViewType() {
    return VIEW_TYPE_TASKBOARD;
  }
  getDisplayText() {
    return "TaskBoard";
  }
  getIcon() {
    return "kanban";
  }
  async onOpen() {
    await this.refresh();
  }
  async refresh() {
    const scanner = new TaskScanner(this.app, this.plugin.settings);
    this.tasks = await scanner.getTasks();
    if (this.plugin.settings.useThreeFileSystem && this.showArchive) {
      this.archivedTasks = await scanner.scanArchiveFile();
    } else {
      this.archivedTasks = [];
    }
    this.availableTags = this.collectAvailableTags(this.tasks);
    this.render();
  }
  /**
   * Collect unique tags from tasks (excluding status and archived tags)
   */
  collectAvailableTags(tasks) {
    const tagSet = /* @__PURE__ */ new Set();
    for (const task of tasks) {
      for (const tag of task.tags) {
        if (tag.startsWith("#status/") || tag === "#archived") {
          continue;
        }
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }
  /**
   * Apply tag filter to tasks (OR logic - show tasks with ANY selected tag)
   */
  applyTagFilter(tasks) {
    if (this.selectedTags.size === 0) {
      return tasks;
    }
    return tasks.filter(
      (task) => task.tags.some((tag) => this.selectedTags.has(tag))
    );
  }
  render() {
    const container = this.containerEl.children[1];
    container.empty();
    const board = container.createEl("div", { cls: "taskboard-container" });
    const header = board.createEl("div", { cls: "taskboard-header" });
    const headerRow = header.createEl("div", { cls: "taskboard-header-row" });
    headerRow.createEl("h2", { text: "TaskBoard Pro" });
    const headerButtons = headerRow.createEl("div", { cls: "taskboard-header-buttons" });
    if (this.plugin.settings.useThreeFileSystem) {
      const archiveBtn = headerButtons.createEl("button", {
        cls: "taskboard-archive-toggle-btn" + (this.showArchive ? " active" : ""),
        text: this.showArchive ? "Hide Archive" : "Show Archive"
      });
      archiveBtn.addEventListener("click", async () => {
        this.showArchive = !this.showArchive;
        await this.refresh();
      });
    }
    const refreshBtn = headerButtons.createEl("button", {
      cls: "taskboard-refresh-btn",
      text: "\u21BB Refresh"
    });
    refreshBtn.addEventListener("click", () => this.refresh());
    let filteredTasks = this.applyTimeFilter(this.tasks);
    filteredTasks = this.applyTagFilter(filteredTasks);
    header.createEl("p", { text: `${filteredTasks.length} of ${this.tasks.length} tasks` });
    this.renderFilterBar(board, filteredTasks.length);
    const columnsContainer = board.createEl("div", { cls: "taskboard-columns" });
    for (const col of this.plugin.settings.columns) {
      this.renderColumn(columnsContainer, col, filteredTasks);
    }
    if (this.showArchive && this.plugin.settings.useThreeFileSystem) {
      this.renderArchiveSection(board);
    }
    const status = board.createEl("div", { cls: "taskboard-status" });
    status.createEl("span", { text: "Drag & drop to change status" });
  }
  /**
   * Render the archive section with unarchive buttons
   */
  renderArchiveSection(container) {
    const archiveSection = container.createEl("div", { cls: "taskboard-archive-section" });
    const header = archiveSection.createEl("div", { cls: "taskboard-archive-header" });
    header.createEl("span", { text: `Archived Tasks (${this.archivedTasks.length})` });
    const list = archiveSection.createEl("div", { cls: "taskboard-archive-list" });
    if (this.archivedTasks.length === 0) {
      list.createEl("div", {
        cls: "taskboard-archive-empty",
        text: "No archived tasks"
      });
      return;
    }
    for (const task of this.archivedTasks) {
      const row = list.createEl("div", { cls: "taskboard-archive-row" });
      row.createEl("span", { cls: "taskboard-archive-text", text: task.text });
      if (task.dueDate) {
        row.createEl("span", {
          cls: "taskboard-archive-date",
          text: `\u{1F4C5} ${task.dueDate}`
        });
      }
      const unarchiveBtn = row.createEl("button", {
        cls: "taskboard-unarchive-btn",
        text: "Unarchive"
      });
      unarchiveBtn.addEventListener("click", async () => {
        await this.unarchiveTask(task);
      });
    }
  }
  /**
   * Render the time filter bar
   */
  renderFilterBar(container, taskCount) {
    const filterBar = container.createEl("div", { cls: "taskboard-filter-bar" });
    const presetsRow = filterBar.createEl("div", { cls: "taskboard-filter-presets" });
    const presets = [
      { id: "today", label: "Today" },
      { id: "this_week", label: "This Week" },
      { id: "this_month", label: "This Month" },
      { id: "this_quarter", label: "This Quarter" },
      { id: "this_year", label: "This Year" },
      { id: "all", label: "All" }
    ];
    for (const preset of presets) {
      const btn = presetsRow.createEl("button", {
        cls: "taskboard-filter-preset-btn" + (this.timeFilter.preset === preset.id ? " active" : ""),
        text: preset.label
      });
      btn.addEventListener("click", () => this.setFilterPreset(preset.id));
    }
    const dateRow = filterBar.createEl("div", { cls: "taskboard-filter-dates" });
    const fromLabel = dateRow.createEl("label", { cls: "taskboard-filter-date-label" });
    fromLabel.createEl("span", { text: "From:" });
    const fromInput = fromLabel.createEl("input", {
      type: "date",
      cls: "taskboard-filter-date-input",
      value: this.timeFilter.fromDate
    });
    fromInput.addEventListener("change", (e) => {
      const target = e.target;
      this.setCustomDateRange(target.value, this.timeFilter.toDate);
    });
    const toLabel = dateRow.createEl("label", { cls: "taskboard-filter-date-label" });
    toLabel.createEl("span", { text: "To:" });
    const toInput = toLabel.createEl("input", {
      type: "date",
      cls: "taskboard-filter-date-input",
      value: this.timeFilter.toDate
    });
    toInput.addEventListener("change", (e) => {
      const target = e.target;
      this.setCustomDateRange(this.timeFilter.fromDate, target.value);
    });
    dateRow.createEl("span", {
      cls: "taskboard-filter-count",
      text: `Showing: ${taskCount} tasks`
    });
    if (this.availableTags.length > 0) {
      this.renderTagFilter(filterBar);
    }
    if (this.timeFilter.preset !== "all") {
      this.renderUnscheduledToggle(filterBar);
    }
  }
  /**
   * Render the unscheduled tasks toggle
   */
  renderUnscheduledToggle(container) {
    const toggleRow = container.createEl("div", { cls: "taskboard-unscheduled-toggle-row" });
    const toggleBtn = toggleRow.createEl("button", {
      cls: "taskboard-unscheduled-toggle-btn" + (this.showUnscheduled ? " active" : ""),
      text: this.showUnscheduled ? "Hide Unscheduled" : "Show Unscheduled"
    });
    toggleBtn.addEventListener("click", () => {
      this.showUnscheduled = !this.showUnscheduled;
      this.render();
    });
    const unscheduledCount = this.tasks.filter((t) => !t.dueDate).length;
    if (unscheduledCount > 0) {
      toggleRow.createEl("span", {
        cls: "taskboard-unscheduled-count",
        text: `(${unscheduledCount} unscheduled)`
      });
    }
  }
  /**
   * Render the tag filter chips
   */
  renderTagFilter(container) {
    const tagRow = container.createEl("div", { cls: "taskboard-filter-tags" });
    tagRow.createEl("span", { cls: "taskboard-filter-tags-label", text: "Tags:" });
    const chipsContainer = tagRow.createEl("div", { cls: "taskboard-tag-chips" });
    for (const tag of this.availableTags) {
      const isSelected = this.selectedTags.has(tag);
      const chip = chipsContainer.createEl("button", {
        cls: "taskboard-tag-chip" + (isSelected ? " selected" : ""),
        text: tag
      });
      chip.addEventListener("click", () => this.toggleTagFilter(tag));
    }
    if (this.selectedTags.size > 0) {
      const clearBtn = tagRow.createEl("button", {
        cls: "taskboard-tag-clear-btn",
        text: "Clear"
      });
      clearBtn.addEventListener("click", () => this.clearTagFilter());
    }
  }
  /**
   * Toggle a tag in the filter
   */
  toggleTagFilter(tag) {
    if (this.selectedTags.has(tag)) {
      this.selectedTags.delete(tag);
    } else {
      this.selectedTags.add(tag);
    }
    this.render();
  }
  /**
   * Clear all selected tags
   */
  clearTagFilter() {
    this.selectedTags.clear();
    this.render();
  }
  /**
   * Set filter to a preset
   */
  setFilterPreset(preset) {
    this.timeFilter = DateUtils.createFilter(preset);
    this.render();
  }
  /**
   * Set custom date range (marks preset as 'custom')
   */
  setCustomDateRange(from, to) {
    const normalized = DateUtils.normalizeRange(from, to);
    this.timeFilter = {
      preset: "custom",
      fromDate: normalized.from,
      toDate: normalized.to
    };
    this.render();
  }
  /**
   * Apply time filter to tasks
   */
  applyTimeFilter(tasks) {
    if (this.timeFilter.preset === "all") {
      return tasks;
    }
    return tasks.filter((task) => {
      if (!task.dueDate) {
        return this.showUnscheduled;
      }
      return DateUtils.isInRange(task.dueDate, this.timeFilter.fromDate, this.timeFilter.toDate);
    });
  }
  renderColumn(container, config, tasks) {
    const column = container.createEl("div", {
      cls: "taskboard-column",
      attr: { "data-column-id": config.id }
    });
    const headerEl = column.createEl("div", { cls: "taskboard-column-header" });
    const columnTasks = TaskScanner.filterTasksByStatus(
      tasks,
      config.id,
      this.plugin.settings.includeCompleted
    );
    const headerLeft = headerEl.createEl("div", { cls: "taskboard-column-header-left" });
    headerLeft.createEl("span", { text: config.name });
    headerLeft.createEl("span", {
      cls: "taskboard-column-count",
      text: `(${columnTasks.length})`
    });
    if (this.plugin.settings.useThreeFileSystem) {
      const addBtn = headerEl.createEl("button", {
        cls: "taskboard-add-task-btn",
        attr: { title: `Add task to ${config.name}` }
      });
      addBtn.innerHTML = "+";
      addBtn.addEventListener("click", () => {
        new AddTaskModal(
          this.app,
          config.id,
          config.name,
          this.plugin.settings.todoFile,
          () => this.refresh()
        ).open();
      });
    }
    const cardContainer = column.createEl("div", {
      cls: "taskboard-cards",
      attr: { "data-column-id": config.id }
    });
    this.setupDropZone(cardContainer, config);
    if (columnTasks.length === 0) {
      cardContainer.createEl("div", {
        cls: "taskboard-card-empty",
        text: "Drop tasks here"
      });
    } else {
      for (const task of columnTasks) {
        this.renderCard(cardContainer, task, config.id === "done");
      }
    }
  }
  setupDropZone(dropZone, config) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.addClass("taskboard-drop-active");
    });
    dropZone.addEventListener("dragleave", (e) => {
      dropZone.removeClass("taskboard-drop-active");
    });
    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropZone.removeClass("taskboard-drop-active");
      if (!this.draggedTask)
        return;
      const task = this.draggedTask;
      const newStatus = config.id;
      const isDoneColumn = config.id === "done";
      if (task.status === newStatus) {
        this.draggedTask = null;
        return;
      }
      new import_obsidian3.Notice(`Moving task to ${config.name}...`);
      const success = await this.taskUpdater.moveTask(task, newStatus, isDoneColumn);
      if (success) {
        if (isDoneColumn && task.isRecurring) {
          new import_obsidian3.Notice("Recurring task completed - new instance created!");
        } else {
          new import_obsidian3.Notice(`Task moved to ${config.name}`);
        }
        await this.refresh();
      } else {
        new import_obsidian3.Notice("Failed to move task");
      }
      this.draggedTask = null;
    });
  }
  renderCard(container, task, showArchive = false) {
    const card = container.createEl("div", {
      cls: "taskboard-card" + (task.completed ? " taskboard-card-completed" : ""),
      attr: {
        draggable: "true",
        "data-task-id": task.id
      }
    });
    card.addEventListener("dragstart", (e) => {
      this.draggedTask = task;
      card.addClass("taskboard-card-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
      }
    });
    card.addEventListener("dragend", () => {
      card.removeClass("taskboard-card-dragging");
      this.draggedTask = null;
      this.containerEl.querySelectorAll(".taskboard-drop-active").forEach((el) => {
        el.removeClass("taskboard-drop-active");
      });
    });
    const headerEl = card.createEl("div", { cls: "taskboard-card-header" });
    headerEl.createEl("div", { cls: "taskboard-card-text", text: task.text });
    if (showArchive) {
      const archiveBtn = headerEl.createEl("button", {
        cls: "taskboard-archive-btn",
        attr: { title: "Archive task" }
      });
      archiveBtn.innerHTML = "\u{1F4E6}";
      archiveBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.archiveTask(task);
      });
    }
    const metaEl = card.createEl("div", { cls: "taskboard-card-meta" });
    if (task.dueDate) {
      const dueEl = metaEl.createEl("span", { cls: "taskboard-card-due" });
      dueEl.createEl("span", { text: "\u{1F4C5} " });
      dueEl.createEl("span", { text: this.formatDate(task.dueDate) });
    } else {
      const scheduleContainer = metaEl.createEl("div", { cls: "taskboard-quick-schedule" });
      const todayBtn = scheduleContainer.createEl("button", {
        cls: "taskboard-quick-schedule-btn",
        text: "Today"
      });
      todayBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.scheduleTaskForToday(task);
      });
      const tomorrowBtn = scheduleContainer.createEl("button", {
        cls: "taskboard-quick-schedule-btn",
        text: "Tomorrow"
      });
      tomorrowBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.scheduleTaskForTomorrow(task);
      });
      const pickerBtn = scheduleContainer.createEl("button", {
        cls: "taskboard-quick-schedule-btn taskboard-quick-schedule-picker",
        text: "\u{1F4C5}"
      });
      pickerBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openDatePickerForTask(task);
      });
    }
    if (task.isRecurring) {
      metaEl.createEl("span", { cls: "taskboard-card-recurring", text: "\u{1F501}" });
    }
    if (task.completed) {
      metaEl.createEl("span", { cls: "taskboard-card-done", text: "\u2705" });
    }
    const sourceEl = card.createEl("div", { cls: "taskboard-card-source" });
    const link = sourceEl.createEl("a", {
      text: this.getFileName(task.filePath),
      cls: "taskboard-card-link"
    });
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openTaskFile(task);
    });
  }
  async archiveTask(task) {
    new import_obsidian3.Notice("Archiving task...");
    let success;
    if (this.plugin.settings.useThreeFileSystem) {
      success = await this.taskUpdater.archiveTaskToFile(
        task,
        this.plugin.settings.archiveFile
      );
    } else {
      success = await this.taskUpdater.archiveTask(task);
    }
    if (success) {
      new import_obsidian3.Notice("Task archived");
      await this.refresh();
    } else {
      new import_obsidian3.Notice("Failed to archive task");
    }
  }
  async unarchiveTask(task) {
    new import_obsidian3.Notice("Restoring task...");
    const success = await this.taskUpdater.unarchiveTask(
      task,
      this.plugin.settings.archiveFile,
      this.plugin.settings.todoFile
    );
    if (success) {
      new import_obsidian3.Notice("Task restored to To Do");
      await this.refresh();
    } else {
      new import_obsidian3.Notice("Failed to restore task");
    }
  }
  formatDate(dateStr) {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(dateStr);
    taskDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((taskDate.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24));
    if (diffDays === 0)
      return "Today";
    if (diffDays === 1)
      return "Tomorrow";
    if (diffDays === -1)
      return "Yesterday";
    if (diffDays < -1)
      return `${Math.abs(diffDays)} days ago`;
    if (diffDays <= 7)
      return `In ${diffDays} days`;
    return dateStr;
  }
  getFileName(path) {
    const parts = path.split("/");
    return parts[parts.length - 1].replace(".md", "");
  }
  async openTaskFile(task) {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (file) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file, {
        eState: { line: task.lineNumber - 1 }
      });
    }
  }
  /**
   * Schedule a task for today
   */
  async scheduleTaskForToday(task) {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    await this.scheduleTask(task, today);
  }
  /**
   * Schedule a task for tomorrow
   */
  async scheduleTaskForTomorrow(task) {
    const tomorrow = /* @__PURE__ */ new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];
    await this.scheduleTask(task, dateStr);
  }
  /**
   * Open date picker modal for a task
   */
  openDatePickerForTask(task) {
    new ScheduleTaskModal(
      this.app,
      task,
      this.taskUpdater,
      () => this.refresh()
    ).open();
  }
  /**
   * Schedule a task with a specific date
   */
  async scheduleTask(task, date) {
    new import_obsidian3.Notice("Scheduling task...");
    const success = await this.taskUpdater.setTaskDueDate(task, date);
    if (success) {
      new import_obsidian3.Notice(`Task scheduled for ${this.formatDate(date)}`);
      await this.refresh();
    } else {
      new import_obsidian3.Notice("Failed to schedule task");
    }
  }
  async onClose() {
  }
};
var TaskBoardSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "TaskBoard Pro Settings" });
    containerEl.createEl("h3", { text: "Columns" });
    containerEl.createEl("p", {
      text: "Manage your board columns. Each column maps to a #status/{id} tag.",
      cls: "setting-item-description"
    });
    const columnListEl = containerEl.createEl("div", { cls: "taskboard-settings-columns" });
    this.renderColumnList(columnListEl);
    new import_obsidian3.Setting(containerEl).addButton((btn) => btn.setButtonText("+ Add Column").setCta().onClick(() => this.addColumn()));
    containerEl.createEl("h3", { text: "Task Files" });
    new import_obsidian3.Setting(containerEl).setName("Use three-file system").setDesc("Instead of scanning the vault, use dedicated files for recurring tasks, to-do items, and archive.").addToggle((toggle) => toggle.setValue(this.plugin.settings.useThreeFileSystem).onChange(async (value) => {
      this.plugin.settings.useThreeFileSystem = value;
      await this.plugin.saveSettings();
      await this.plugin.refreshBoard();
      this.display();
    }));
    if (this.plugin.settings.useThreeFileSystem) {
      new import_obsidian3.Setting(containerEl).setName("Recurring tasks file").setDesc("File containing recurring task templates").addText((text) => text.setPlaceholder("Tasks/recurring.md").setValue(this.plugin.settings.recurringTasksFile).onChange(async (value) => {
        this.plugin.settings.recurringTasksFile = this.normalizePath(value);
        await this.plugin.saveSettings();
      }));
      new import_obsidian3.Setting(containerEl).setName("To-do file").setDesc("File for active tasks").addText((text) => text.setPlaceholder("Tasks/todo.md").setValue(this.plugin.settings.todoFile).onChange(async (value) => {
        this.plugin.settings.todoFile = this.normalizePath(value);
        await this.plugin.saveSettings();
      }));
      new import_obsidian3.Setting(containerEl).setName("Archive file").setDesc("File for archived/completed tasks").addText((text) => text.setPlaceholder("Tasks/archive.md").setValue(this.plugin.settings.archiveFile).onChange(async (value) => {
        this.plugin.settings.archiveFile = this.normalizePath(value);
        await this.plugin.saveSettings();
      }));
      new import_obsidian3.Setting(containerEl).setName("Create missing files").setDesc("Create the configured files if they don't exist").addButton((btn) => btn.setButtonText("Create Files").onClick(async () => {
        await this.createConfiguredFiles();
      }));
    }
    containerEl.createEl("h3", { text: "Scanning" });
    containerEl.createEl("p", {
      text: this.plugin.settings.useThreeFileSystem ? "These settings are ignored when using three-file system." : "Configure which folders to scan for tasks.",
      cls: "setting-item-description"
    });
    new import_obsidian3.Setting(containerEl).setName("Include only these folders").setDesc("Comma-separated list of folders to scan. Leave empty to scan entire vault.").addText((text) => text.setPlaceholder("7-Kanban-Boards, Projects").setValue(this.plugin.settings.includeFolders.join(", ")).onChange(async (value) => {
      this.plugin.settings.includeFolders = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
      await this.plugin.saveSettings();
      await this.plugin.refreshBoard();
    }));
    new import_obsidian3.Setting(containerEl).setName("Excluded folders").setDesc("Comma-separated list of folders to exclude").addText((text) => text.setPlaceholder(".obsidian, templates").setValue(this.plugin.settings.excludeFolders.join(", ")).onChange(async (value) => {
      this.plugin.settings.excludeFolders = value.split(",").map((s) => s.trim());
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Include completed tasks").setDesc("Show completed tasks in the board").addToggle((toggle) => toggle.setValue(this.plugin.settings.includeCompleted).onChange(async (value) => {
      this.plugin.settings.includeCompleted = value;
      await this.plugin.saveSettings();
      await this.plugin.refreshBoard();
    }));
  }
  /**
   * Render the sortable column list
   */
  renderColumnList(container) {
    container.empty();
    const columns = this.plugin.settings.columns;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const row = container.createEl("div", { cls: "taskboard-settings-column-row" });
      const reorderBtns = row.createEl("div", { cls: "taskboard-settings-reorder" });
      const upBtn = reorderBtns.createEl("button", {
        text: "\u25B2",
        cls: "taskboard-settings-reorder-btn",
        attr: { disabled: i === 0 ? "true" : null, title: "Move up" }
      });
      upBtn.addEventListener("click", () => this.moveColumn(i, -1));
      const downBtn = reorderBtns.createEl("button", {
        text: "\u25BC",
        cls: "taskboard-settings-reorder-btn",
        attr: { disabled: i === columns.length - 1 ? "true" : null, title: "Move down" }
      });
      downBtn.addEventListener("click", () => this.moveColumn(i, 1));
      const nameInput = row.createEl("input", {
        type: "text",
        cls: "taskboard-settings-column-name",
        value: col.name,
        attr: { placeholder: "Column name" }
      });
      nameInput.addEventListener("change", async (e) => {
        const target = e.target;
        col.name = target.value || col.id;
        await this.plugin.saveSettings();
        await this.plugin.refreshBoard();
      });
      row.createEl("span", {
        cls: "taskboard-settings-column-tag",
        text: `#status/${col.id}`
      });
      const editIdBtn = row.createEl("button", {
        text: "Edit ID",
        cls: "taskboard-settings-edit-id-btn",
        attr: { title: "Change status ID" }
      });
      editIdBtn.addEventListener("click", () => this.editColumnId(i));
      const deleteBtn = row.createEl("button", {
        text: "Delete",
        cls: "taskboard-settings-delete-btn",
        attr: {
          disabled: columns.length <= 1 ? "true" : null,
          title: columns.length <= 1 ? "Cannot delete last column" : "Delete column"
        }
      });
      deleteBtn.addEventListener("click", () => this.deleteColumn(i));
    }
  }
  /**
   * Add a new column
   */
  async addColumn() {
    const existingIds = this.plugin.settings.columns.map((c) => c.id);
    let newId = "new";
    let counter = 1;
    while (existingIds.includes(newId)) {
      newId = `new-${counter}`;
      counter++;
    }
    this.plugin.settings.columns.push({
      id: newId,
      name: "New Column"
    });
    await this.plugin.saveSettings();
    await this.plugin.refreshBoard();
    this.display();
  }
  /**
   * Move a column up or down
   */
  async moveColumn(index, direction) {
    const columns = this.plugin.settings.columns;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= columns.length)
      return;
    [columns[index], columns[newIndex]] = [columns[newIndex], columns[index]];
    await this.plugin.saveSettings();
    await this.plugin.refreshBoard();
    this.display();
  }
  /**
   * Edit a column's ID (with warning modal)
   */
  editColumnId(index) {
    const col = this.plugin.settings.columns[index];
    const existingIds = this.plugin.settings.columns.map((c) => c.id);
    new EditColumnIdModal(
      this.app,
      col.id,
      existingIds,
      async (newId) => {
        col.id = newId;
        await this.plugin.saveSettings();
        await this.plugin.refreshBoard();
        this.display();
      }
    ).open();
  }
  /**
   * Delete a column (with confirmation)
   */
  async deleteColumn(index) {
    const columns = this.plugin.settings.columns;
    if (columns.length <= 1) {
      new import_obsidian3.Notice("Cannot delete the last column");
      return;
    }
    const col = columns[index];
    new ConfirmDeleteModal(
      this.app,
      col.name,
      col.id,
      async () => {
        columns.splice(index, 1);
        await this.plugin.saveSettings();
        await this.plugin.refreshBoard();
        this.display();
      }
    ).open();
  }
  /**
   * Normalize a file path (remove leading slash, ensure .md extension)
   */
  normalizePath(path) {
    let normalized = path.trim();
    if (normalized.startsWith("/")) {
      normalized = normalized.substring(1);
    }
    if (!normalized.endsWith(".md")) {
      normalized = normalized + ".md";
    }
    return normalized;
  }
  /**
   * Create the configured task files if they don't exist
   */
  async createConfiguredFiles() {
    const settings = this.plugin.settings;
    const filesToCreate = [
      { path: settings.recurringTasksFile, header: "# Recurring Tasks\n\nTasks with recurrence patterns (\u{1F501}) go here.\n" },
      { path: settings.todoFile, header: "# To Do\n\nActive tasks go here.\n" },
      { path: settings.archiveFile, header: "# Archive\n\nCompleted and archived tasks are stored here.\n" }
    ];
    let created = 0;
    let skipped = 0;
    for (const { path, header } of filesToCreate) {
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing) {
        skipped++;
        continue;
      }
      const folderPath = path.substring(0, path.lastIndexOf("/"));
      if (folderPath) {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
          await this.app.vault.createFolder(folderPath);
        }
      }
      await this.app.vault.create(path, header);
      created++;
    }
    if (created > 0) {
      new import_obsidian3.Notice(`Created ${created} file(s)`);
    }
    if (skipped > 0 && created === 0) {
      new import_obsidian3.Notice("All files already exist");
    }
    await this.plugin.refreshBoard();
  }
};
var EditColumnIdModal = class extends import_obsidian3.Modal {
  constructor(app, currentId, existingIds, onSave) {
    super(app);
    this.currentId = currentId;
    this.existingIds = existingIds;
    this.onSave = onSave;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Edit Column ID" });
    contentEl.createEl("p", {
      text: "Warning: Changing the column ID will affect which tasks appear in this column. Tasks with the old #status/" + this.currentId + " tag will no longer appear here.",
      cls: "mod-warning"
    });
    let newIdValue = this.currentId;
    let errorEl;
    new import_obsidian3.Setting(contentEl).setName("Status ID").setDesc("Alphanumeric, underscores, and hyphens only").addText((text) => {
      text.setValue(this.currentId).setPlaceholder("e.g., in-review").onChange((value) => {
        newIdValue = value.trim().toLowerCase();
        const error = validateColumnId(newIdValue, this.existingIds, this.currentId);
        if (error) {
          errorEl.setText(error);
          errorEl.show();
        } else {
          errorEl.hide();
        }
      });
    });
    errorEl = contentEl.createEl("p", { cls: "taskboard-settings-error" });
    errorEl.hide();
    new import_obsidian3.Setting(contentEl).addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close())).addButton((btn) => btn.setButtonText("Save").setCta().onClick(() => {
      const error = validateColumnId(newIdValue, this.existingIds, this.currentId);
      if (error) {
        new import_obsidian3.Notice(error);
        return;
      }
      this.onSave(newIdValue);
      this.close();
    }));
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
var AddTaskModal = class extends import_obsidian3.Modal {
  constructor(app, columnId, columnName, todoFilePath, onTaskCreated) {
    super(app);
    this.columnId = columnId;
    this.columnName = columnName;
    this.todoFilePath = todoFilePath;
    this.onTaskCreated = onTaskCreated;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("taskboard-add-task-modal");
    contentEl.createEl("h3", { text: "Add New Task" });
    let taskText = "";
    let dueDate = "";
    new import_obsidian3.Setting(contentEl).setName("Task").setDesc("What needs to be done?").addText((text) => {
      text.setPlaceholder("Enter task description").onChange((value) => {
        taskText = value;
      });
      setTimeout(() => text.inputEl.focus(), 10);
    });
    new import_obsidian3.Setting(contentEl).setName("Due date").setDesc("Optional - when is this due?").addText((text) => {
      text.inputEl.type = "date";
      text.onChange((value) => {
        dueDate = value;
      });
    });
    contentEl.createEl("p", {
      cls: "taskboard-add-task-info",
      text: `Task will be added to: ${this.todoFilePath}`
    });
    new import_obsidian3.Setting(contentEl).addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close())).addButton((btn) => btn.setButtonText("Add Task").setCta().onClick(async () => {
      if (!taskText.trim()) {
        new import_obsidian3.Notice("Please enter a task description");
        return;
      }
      await this.createTask(taskText.trim(), dueDate);
      this.close();
    }));
  }
  async createTask(text, dueDate) {
    try {
      let taskLine = `- [ ] ${text}`;
      if (dueDate) {
        taskLine += ` \u{1F4C5} ${dueDate}`;
      }
      taskLine += ` #status/${this.columnId}`;
      const file = this.app.vault.getAbstractFileByPath(this.todoFilePath);
      let content = "";
      if (file && file instanceof import_obsidian3.TFile) {
        content = await this.app.vault.read(file);
      } else {
        const folderPath = this.todoFilePath.substring(0, this.todoFilePath.lastIndexOf("/"));
        if (folderPath) {
          const folder = this.app.vault.getAbstractFileByPath(folderPath);
          if (!folder) {
            await this.app.vault.createFolder(folderPath);
          }
        }
        content = "# To Do\n\nActive tasks go here.\n";
      }
      if (!content.endsWith("\n")) {
        content += "\n";
      }
      content += taskLine + "\n";
      if (file && file instanceof import_obsidian3.TFile) {
        await this.app.vault.modify(file, content);
      } else {
        await this.app.vault.create(this.todoFilePath, content);
      }
      new import_obsidian3.Notice(`Task added to ${this.columnName}`);
      this.onTaskCreated();
    } catch (error) {
      console.error("TaskBoard: Error creating task:", error);
      new import_obsidian3.Notice("Failed to create task");
    }
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
var ScheduleTaskModal = class extends import_obsidian3.Modal {
  constructor(app, task, taskUpdater, onScheduled) {
    super(app);
    this.task = task;
    this.taskUpdater = taskUpdater;
    this.onScheduled = onScheduled;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("taskboard-schedule-modal");
    contentEl.createEl("h3", { text: "Schedule Task" });
    contentEl.createEl("p", {
      cls: "taskboard-schedule-task-text",
      text: this.task.text
    });
    let selectedDate = "";
    new import_obsidian3.Setting(contentEl).setName("Due date").setDesc("When should this task be due?").addText((text) => {
      text.inputEl.type = "date";
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      text.setValue(today);
      selectedDate = today;
      text.onChange((value) => {
        selectedDate = value;
      });
      setTimeout(() => text.inputEl.focus(), 10);
    });
    new import_obsidian3.Setting(contentEl).addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close())).addButton((btn) => btn.setButtonText("Schedule").setCta().onClick(async () => {
      if (!selectedDate) {
        new import_obsidian3.Notice("Please select a date");
        return;
      }
      await this.scheduleTask(selectedDate);
      this.close();
    }));
  }
  async scheduleTask(date) {
    new import_obsidian3.Notice("Scheduling task...");
    const success = await this.taskUpdater.setTaskDueDate(this.task, date);
    if (success) {
      new import_obsidian3.Notice("Task scheduled");
      this.onScheduled();
    } else {
      new import_obsidian3.Notice("Failed to schedule task");
    }
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
var ConfirmDeleteModal = class extends import_obsidian3.Modal {
  constructor(app, columnName, columnId, onConfirm) {
    super(app);
    this.columnName = columnName;
    this.columnId = columnId;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Delete Column?" });
    contentEl.createEl("p", {
      text: `Are you sure you want to delete the "${this.columnName}" column?`
    });
    contentEl.createEl("p", {
      text: `Tasks with #status/${this.columnId} will remain in your files but won't appear on the board.`,
      cls: "mod-warning"
    });
    new import_obsidian3.Setting(contentEl).addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close())).addButton((btn) => btn.setButtonText("Delete").setWarning().onClick(() => {
      this.onConfirm();
      this.close();
    }));
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
