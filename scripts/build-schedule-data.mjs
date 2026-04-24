import Workbook from "exceljs/lib/doc/workbook.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import officialHolidayData from "../src/data/official-holidays.json" with { type: "json" };

const EMPLOYEE_START = 6;
const EMPLOYEE_END = 25;
const DATE_COLUMN_START = 7;
const DATE_COLUMN_END = 37;
const HOLIDAY_API_URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";
const HOLIDAY_ENV_KEY = "DATA_GO_KR_SERVICE_KEY";
const FIXED_HOLIDAYS = officialHolidayData.fixedHolidays;
const DATED_HOLIDAYS = officialHolidayData.datedHolidays;
const WANTED_OFF_FILL = "FFDAEEF3";
const MEETING_OVERRIDE_DATE = "2026-03-03";
const GROUP_RULES = [
  { start: 14, end: 17, name: "사랑반" },
  { start: 18, end: 20, name: "믿음반" },
  { start: 21, end: 24, name: "소망반" },
];
const KITCHEN_GROUPS = ["소망반", "믿음반", "사랑반"];
const KITCHEN_ANCHOR = new Date("2026-03-01T00:00:00+09:00");
const KITCHEN_TEACHER_NAME = "김계순";
const KITCHEN_TEACHER_OFF_REMARK = "주방 휴무";
const REMARK_LEGEND_VALUES = new Set([
  "근무",
  "휴무",
  "연차",
  "교육",
  "경조",
  "경조사",
  "주방담당반",
  "원하는 휴무",
  "오전반차",
  "오후반차",
  "오전연차반차",
  "오후연차반차",
  "오전반차 08:00~12:30",
  "오후반차 12:30~17:00",
  "오전연차반차 08:00~12:30",
  "오후연차반차 12:30~17:00",
  "휴무(지정)",
  "휴무(신청)",
  "▲",
  "●",
  "D●",
  "●D",
  "D▲",
  "▲D",
  "D",
]);

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIsoDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function normalizeWeight(value) {
  const normalized = Math.round(value * 2) / 2;
  return Number.isInteger(normalized) ? normalized : Number(normalized.toFixed(1));
}

function formatWeight(value) {
  return `${normalizeWeight(value)}`;
}

function monthKeyFromSheet(name) {
  const match = name.match(/(\d{2})년\s*(\d{1,2})월/);
  if (!match) return null;
  return `20${match[1]}-${match[2].padStart(2, "0")}`;
}

function colNumberToName(value) {
  let current = value;
  let result = "";
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function columnsBetween(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => colNumberToName(start + index));
}

function kitchenDutyGroup(date) {
  const weekOffset = Math.floor((date.getTime() - KITCHEN_ANCHOR.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return KITCHEN_GROUPS[((weekOffset % KITCHEN_GROUPS.length) + KITCHEN_GROUPS.length) % KITCHEN_GROUPS.length];
}

function groupNameFor(position, row) {
  if (position === "대표") return "대표";
  if (["시설장", "사무원", "사회복지사", "간호조무사"].includes(position)) return "운영지원팀";
  if (position === "조리원") return "";
  const matched = GROUP_RULES.find((rule) => row >= rule.start && row <= rule.end);
  if (position === "요양보호사" || position === "요양팀장") {
    return matched?.name ?? "";
  }
  return "";
}

function isSunday(date) {
  return date.getDay() === 0;
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function cellText(worksheet, ref) {
  try {
    const value = worksheet.getCell(ref).text?.trim();
    return value || "";
  } catch {
    return "";
  }
}

function cellFill(worksheet, ref) {
  const cell = worksheet.getCell(ref);
  const fill = cell.fill;
  if (!fill || fill.type !== "pattern" || fill.pattern !== "solid") return undefined;
  return fill.fgColor?.argb;
}

function classifyRecord(dateIso, rawCode, fill) {
  if (dateIso === MEETING_OVERRIDE_DATE) {
    return { dutyKind: "WORK", workWeight: 1, offWeight: 0, trainingWeight: 0 };
  }

  switch (rawCode) {
    case "D":
    case "직":
    case "원":
    case "회":
    case "의":
      return { dutyKind: "WORK", workWeight: 1, offWeight: 0, trainingWeight: 0 };
    case "교육":
      return { dutyKind: "TRAINING", workWeight: 0, offWeight: 0, trainingWeight: 1 };
    case "경조":
    case "경조사":
      return { dutyKind: "OFF", leaveType: "경조사", workWeight: 0, offWeight: 1, trainingWeight: 0 };
    case "▲":
      return { dutyKind: "OFF", leaveType: "연차", workWeight: 0, offWeight: 1, trainingWeight: 0 };
    case "●":
      return {
        dutyKind: "OFF",
        leaveType: fill === WANTED_OFF_FILL ? "휴무(신청)" : "휴무(지정)",
        workWeight: 0,
        offWeight: 1,
        trainingWeight: 0,
      };
    case "D●":
      return { dutyKind: "OFF", leaveType: "오후반차", workWeight: 0.5, offWeight: 0.5, trainingWeight: 0 };
    case "●D":
      return { dutyKind: "OFF", leaveType: "오전반차", workWeight: 0.5, offWeight: 0.5, trainingWeight: 0 };
    case "D▲":
      return { dutyKind: "OFF", leaveType: "오후연차반차", workWeight: 0.5, offWeight: 0.5, trainingWeight: 0 };
    case "▲D":
      return { dutyKind: "OFF", leaveType: "오전연차반차", workWeight: 0.5, offWeight: 0.5, trainingWeight: 0 };
    default:
      return { dutyKind: "WORK", workWeight: 0, offWeight: 0, trainingWeight: 0 };
  }
}

function validateTemplate(worksheet) {
  return ["B1", "G4", "G5", "C6", "E6"].every((ref) => cellText(worksheet, ref));
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isRemarkCandidate(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return false;
  if (!/[가-힣A-Za-z0-9]/.test(normalized)) return false;
  if (REMARK_LEGEND_VALUES.has(normalized)) return false;
  if (/^[\d.]+$/.test(normalized)) return false;
  return true;
}

function findRemarksRow(worksheet, columns) {
  let bestRow = null;
  let bestScore = 0;

  for (let row = EMPLOYEE_END + 1; row <= worksheet.actualRowCount; row += 1) {
    let score = 0;
    for (const column of columns) {
      if (isRemarkCandidate(cellText(worksheet, `${column}${row}`))) {
        score += 1;
      }
    }
    if (score > 0 && (score > bestScore || (score === bestScore && (bestRow === null || row > bestRow)))) {
      bestRow = row;
      bestScore = score;
    }
  }

  return bestRow;
}

function columnHasMarker(worksheet, column, marker) {
  for (let row = EMPLOYEE_END + 1; row <= Math.min(worksheet.actualRowCount, EMPLOYEE_END + 12); row += 1) {
    if (normalizeWhitespace(cellText(worksheet, `${column}${row}`)) === marker) {
      return true;
    }
  }
  return false;
}

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function extractXmlValue(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`));
  return match ? decodeXml(match[1].trim()) : "";
}

function mergeRemarkParts(parts) {
  const unique = [];
  for (const part of parts.map((value) => normalizeWhitespace(value)).filter(Boolean)) {
    if (!unique.includes(part)) {
      unique.push(part);
    }
  }
  return unique.join(" · ");
}

function formatEmployeeNoteLine(row) {
  return row.groupName ? `${row.name} (${row.groupName})` : row.name;
}

function buildSpecialNoteLines(label, rows, fallbackCount = 0) {
  const count = rows.length || fallbackCount;
  if (!count) return [];

  const lines = [`${label} ${count}`];
  if (rows.length) {
    lines.push(...rows.map(formatEmployeeNoteLine));
  }
  return lines;
}

function isKnownHolidayText(value) {
  if (!value) return false;
  return /(공휴일|삼일절|현충일|광복절|개천절|한글날|어린이날|설날|추석|성탄절|부처님 오신 날)/.test(value);
}

function buildFallbackHolidayMap(monthKeys) {
  const fallbackMap = new Map();
  const years = [...new Set(monthKeys.map((monthKey) => Number(monthKey.slice(0, 4))))].sort((left, right) => left - right);

  const addHoliday = (dateIso, name) => {
    if (!fallbackMap.has(dateIso)) {
      fallbackMap.set(dateIso, name);
    }
  };

  const addObservedHoliday = (year, month, day, holidayName) => {
    const holidayDate = new Date(year, month - 1, day);
    const weekday = holidayDate.getDay();
    if (weekday !== 0 && weekday !== 6) {
      return;
    }

    const observedName = `${holidayName} 대체공휴일`;
    const observedDate = new Date(year, month - 1, day);
    do {
      observedDate.setDate(observedDate.getDate() + 1);
    } while (observedDate.getDay() === 0 || observedDate.getDay() === 6 || fallbackMap.has(toIsoDate(observedDate)));

    addHoliday(toIsoDate(observedDate), observedName);
  };

  for (const year of years) {
    for (const holiday of FIXED_HOLIDAYS) {
      const dateIso = toIsoDate(new Date(year, holiday.month - 1, holiday.day));
      addHoliday(dateIso, holiday.name);
      if (holiday.observed) {
        addObservedHoliday(year, holiday.month, holiday.day, holiday.name);
      }
    }
  }

  for (const holiday of DATED_HOLIDAYS) {
    const year = Number(holiday.date.slice(0, 4));
    if (!years.includes(year)) continue;
    addHoliday(holiday.date, holiday.name);
  }

  return fallbackMap;
}

async function loadEnvFiles(cwd) {
  const envFiles = [".env.local", ".env"];
  for (const fileName of envFiles) {
    const envPath = path.join(cwd, fileName);
    try {
      const contents = await fs.readFile(envPath, "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index === -1) continue;
        const key = trimmed.slice(0, index).trim();
        if (!key || process.env[key]) continue;
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

async function findWorkbookFile(cwd) {
  const entries = await fs.readdir(cwd, { withFileTypes: true });
  const workbooks = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".xlsx") || entry.name.startsWith("~$")) continue;
    const stats = await fs.stat(path.join(cwd, entry.name));
    workbooks.push({ name: entry.name, modifiedAt: stats.mtimeMs });
  }

  workbooks.sort((left, right) => right.modifiedAt - left.modifiedAt);
  const workbook = workbooks[0]?.name;
  if (!workbook) {
    throw new Error("No .xlsx workbook found in project root");
  }
  return workbook;
}

async function fetchHolidayMap(monthKeys) {
  const holidayMap = buildFallbackHolidayMap(monthKeys);
  const serviceKey = process.env[HOLIDAY_ENV_KEY];
  if (!serviceKey) {
    return holidayMap;
  }

  const uniqueMonths = [...new Set(monthKeys)].sort();

  for (const monthKey of uniqueMonths) {
    const [year, month] = monthKey.split("-");
    const searchParams = new URLSearchParams({
      ServiceKey: serviceKey,
      pageNo: "1",
      numOfRows: "50",
      solYear: year,
      solMonth: month,
    });

    try {
      const response = await fetch(`${HOLIDAY_API_URL}?${searchParams.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
      const xml = await response.text();
      for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const block = match[1];
        const locdate = extractXmlValue(block, "locdate");
        const dateName = extractXmlValue(block, "dateName");
        const isHolidayFlag = extractXmlValue(block, "isHoliday");
        if (!locdate || isHolidayFlag !== "Y") continue;
        const dateIso = `${locdate.slice(0, 4)}-${locdate.slice(4, 6)}-${locdate.slice(6, 8)}`;
        holidayMap.set(dateIso, dateName);
      }
    } catch (error) {
      console.warn(`Holiday API lookup failed for ${monthKey}; continuing without API holidays.`);
      console.warn(error instanceof Error ? error.message : error);
      continue;
    }
  }

  return holidayMap;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadWorkbookFile(workbookPath) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const tempPath = path.join(os.tmpdir(), `bandihr-workbook-${process.pid}-${Date.now()}-${attempt}.xlsx`);

    try {
      await fs.copyFile(workbookPath, tempPath);
      const workbook = new Workbook();
      await workbook.xlsx.readFile(tempPath);
      await fs.rm(tempPath, { force: true });
      return workbook;
    } catch (error) {
      lastError = error;
      await fs.rm(tempPath, { force: true }).catch(() => {});
      if (attempt < 3) {
        await sleep(400);
      }
    }
  }

  throw lastError;
}

async function build() {
  const cwd = process.cwd();
  await loadEnvFiles(cwd);

  const workbookName = process.argv[2] ?? (await findWorkbookFile(cwd));
  const workbookPath = path.resolve(cwd, workbookName);
  const workbookStats = await fs.stat(workbookPath);

  const workbook = await loadWorkbookFile(workbookPath);

  const monthsByKey = new Map();
  const columns = columnsBetween(DATE_COLUMN_START, DATE_COLUMN_END);

  workbook.worksheets.forEach((worksheet) => {
    const monthKey = monthKeyFromSheet(worksheet.name);
    if (!monthKey) return;
    monthsByKey.set(monthKey, worksheet);
  });

  const monthKeys = [...monthsByKey.keys()].sort();
  const holidayMap = await fetchHolidayMap(monthKeys);
  const months = [];
  const days = [];

  for (const monthKey of monthKeys) {
    const worksheet = monthsByKey.get(monthKey);
    if (!worksheet || !validateTemplate(worksheet)) {
      console.warn(`Skipping ${worksheet?.name ?? monthKey}: template cells not found`);
      continue;
    }

    const remarksRow = findRemarksRow(worksheet, columns);
    const [year, month] = monthKey.split("-").map(Number);
    const employees = [];

    for (let row = EMPLOYEE_START; row <= EMPLOYEE_END; row += 1) {
      const name = cellText(worksheet, `C${row}`);
      if (!name) continue;
      employees.push({
        row,
        employeeId: `${name}|${cellText(worksheet, `E${row}`)}`,
        name,
        position: cellText(worksheet, `E${row}`),
        groupName: groupNameFor(cellText(worksheet, `E${row}`), row),
      });
    }

    const monthDates = [];

    for (const column of columns) {
      const dayText = cellText(worksheet, `${column}4`);
      if (!/^\d+$/.test(dayText)) continue;
      const dayNumber = Number(dayText);
      const date = new Date(year, month - 1, dayNumber);
      if (date.getMonth() !== month - 1 || date.getDate() !== dayNumber) {
        console.warn(`Invalid date for ${worksheet.name} ${column}4=${dayText}`);
        continue;
      }

      const dateIso = toIsoDate(date);
      const holidayName = holidayMap.get(dateIso) ?? "";
      const manualRemark = remarksRow ? normalizeWhitespace(cellText(worksheet, `${column}${remarksRow}`)) : "";
      const isHoliday = Boolean(holidayName || isKnownHolidayText(manualRemark));
      const hasEducationMarker = columnHasMarker(worksheet, column, "교육");
      const hasBereavementMarker = columnHasMarker(worksheet, column, "경조") || columnHasMarker(worksheet, column, "경조사");
      monthDates.push(dateIso);

      if (isSunday(date)) {
        const sundayRemarks = mergeRemarkParts([manualRemark, holidayName]);
        days.push({
          date: dateIso,
          isSundayClosed: true,
          isHoliday,
          actualWorkCount: 0,
          trainingCount: 0,
          offCount: 0,
          workDisplayText: "-",
          kitchenDutyGroup: "",
          holidayName,
          remarks: sundayRemarks,
          actualWorkEmployeeCount: 0,
          totalWorkEmployeeCount: 0,
          workEmployees: [],
          offEmployees: [],
          allEmployees: [],
        });
        continue;
      }

      const records = employees.map((employee) => {
        const rawCode = cellText(worksheet, `${column}${employee.row}`);
        const record = classifyRecord(dateIso, rawCode, cellFill(worksheet, `${column}${employee.row}`));
        return {
          employeeId: employee.employeeId,
          name: employee.name,
          position: employee.position,
          groupName: employee.groupName,
          dutyKind: record.dutyKind,
          leaveType: record.leaveType,
          rawCode,
          workWeight: normalizeWeight(record.workWeight),
          offWeight: normalizeWeight(record.offWeight),
          trainingWeight: normalizeWeight(record.trainingWeight),
          specialDisplayTag: record.dutyKind === "TRAINING" ? "교육" : record.leaveType === "경조사" ? "경조" : undefined,
        };
      });

      const trainingEmployees = records.filter((row) => row.trainingWeight > 0);
      const bereavementEmployees = records.filter((row) => row.leaveType === "경조사");
      const workEmployees = records.filter((row) => row.workWeight > 0 || row.trainingWeight > 0 || row.leaveType === "경조사");
      const offEmployees = records.filter((row) => row.offWeight > 0 && row.leaveType !== "경조사");
      const actualWorkCount = normalizeWeight(records.reduce((sum, row) => sum + row.workWeight, 0));
      const trainingCount = normalizeWeight(records.reduce((sum, row) => sum + row.trainingWeight, 0));
      const offCount = normalizeWeight(offEmployees.reduce((sum, row) => sum + row.offWeight, 0));
      const actualWorkEmployeeCount = records.filter((row) => row.workWeight > 0).length;
      const totalWorkEmployeeCount = workEmployees.length;
      const kitchenTeacherOff = isWeekday(date) && offEmployees.some((row) => row.name === KITCHEN_TEACHER_NAME);
      const headerRemark = mergeRemarkParts([manualRemark, holidayName, kitchenTeacherOff ? KITCHEN_TEACHER_OFF_REMARK : ""]);
      const educationFallbackCount = trainingEmployees.length === 0 && hasEducationMarker ? 1 : 0;
      const bereavementFallbackCount = bereavementEmployees.length === 0 && hasBereavementMarker ? 1 : 0;
      const specialNoteLines = [
        ...buildSpecialNoteLines("교육", trainingEmployees, educationFallbackCount),
        ...buildSpecialNoteLines("경조", bereavementEmployees, bereavementFallbackCount),
      ];
      const remarks = [headerRemark, ...specialNoteLines].filter(Boolean).join("\n");

      days.push({
        date: dateIso,
        isSundayClosed: false,
        isHoliday,
        actualWorkCount,
        trainingCount,
        offCount,
        workDisplayText:
          totalWorkEmployeeCount > actualWorkEmployeeCount
            ? `${formatWeight(actualWorkEmployeeCount)}(${formatWeight(totalWorkEmployeeCount)})`
            : formatWeight(actualWorkEmployeeCount),
        kitchenDutyGroup: kitchenDutyGroup(date),
        holidayName,
        remarks,
        actualWorkEmployeeCount,
        totalWorkEmployeeCount,
        workEmployees,
        offEmployees,
        allEmployees: records,
      });
    }

    months.push({
      key: monthKey,
      label: `${year}년 ${month}월`,
      dates: monthDates,
    });
  }

  days.sort((left, right) => left.date.localeCompare(right.date));
  months.sort((left, right) => left.key.localeCompare(right.key));

  const payload = {
    generatedAt: workbookStats.mtime.toISOString(),
    sourceFile: path.basename(workbookPath),
    months,
    days,
  };

  const outputDir = path.resolve(cwd, "src/data/generated");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "schedule.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Generated ${days.length} day entries from ${path.basename(workbookPath)}`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
