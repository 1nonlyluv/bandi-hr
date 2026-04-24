import rawData from "../data/generated/schedule.json";
import type { DaySummary, DutyKind, EmployeeDayRecord, LeaveType, MonthSummary, ScheduleData } from "../types";

const ADMIN_STORAGE_KEY = "bandihr-admin-draft:v1";
export const VIEWER_OVERRIDE_STORAGE_KEY = "bandihr-viewer-override:v1";
export const VIEWER_OVERRIDE_UPDATED_EVENT = "bandihr:viewer-override-updated";

export type AdminTab = "dashboard" | "employees" | "month" | "publish";
export type AdminSpecialRole = "" | "KITCHEN_TEACHER";
export type AdminAssignmentChoice =
  | "NONE"
  | "WORK"
  | "TRAINING"
  | "OFF:휴무(지정)"
  | "OFF:휴무(신청)"
  | "OFF:연차"
  | "OFF:오전반차"
  | "OFF:오후반차"
  | "OFF:오전연차반차"
  | "OFF:오후연차반차"
  | "OFF:경조사";

export type AdminEmployee = {
  id: string;
  name: string;
  position: string;
  groupName: string;
  sortOrder: number;
  isActive: boolean;
  specialRole: AdminSpecialRole;
};

export type AdminDayDraft = {
  date: string;
  monthKey: string;
  isSundayClosed: boolean;
  isHoliday: boolean;
  holidayName: string;
  remarks: string;
  kitchenDutyGroup: string;
};

export type AdminAssignment = {
  date: string;
  employeeId: string;
  dutyKind: DutyKind;
  leaveType: LeaveType | "";
  rawCode: string;
};

export type AdminDraft = {
  sourceFile: string;
  sourceGeneratedAt: string;
  lastUpdatedAt: string;
  employees: AdminEmployee[];
  days: AdminDayDraft[];
  assignments: AdminAssignment[];
};

export type AdminRepository = {
  mode: "local" | "api";
  loadDraft(seed: AdminDraft): AdminDraft;
  saveDraft(draft: AdminDraft): void;
  resetDraft(seed: AdminDraft): AdminDraft;
  publishViewer(data: ScheduleData): void;
  clearViewerPublish(): void;
  loadViewerPublish(): ScheduleData | null;
};

export const ADMIN_ASSIGNMENT_OPTIONS: Array<{ value: AdminAssignmentChoice; label: string }> = [
  { value: "NONE", label: "미지정" },
  { value: "WORK", label: "근무" },
  { value: "TRAINING", label: "교육" },
  { value: "OFF:휴무(지정)", label: "휴무(지정)" },
  { value: "OFF:휴무(신청)", label: "휴무(신청)" },
  { value: "OFF:연차", label: "연차" },
  { value: "OFF:오전반차", label: "오전반차" },
  { value: "OFF:오후반차", label: "오후반차" },
  { value: "OFF:오전연차반차", label: "오전연차반차" },
  { value: "OFF:오후연차반차", label: "오후연차반차" },
  { value: "OFF:경조사", label: "경조사" },
];

export const ADMIN_SPECIAL_ROLE_OPTIONS: Array<{ value: AdminSpecialRole; label: string }> = [
  { value: "", label: "일반" },
  { value: "KITCHEN_TEACHER", label: "주방 선생님" },
];

function dedupeEmployees(schedule: ScheduleData) {
  const employeeMap = new Map<string, AdminEmployee>();

  for (const day of schedule.days) {
    for (const employee of day.allEmployees) {
      if (employeeMap.has(employee.employeeId)) continue;
      employeeMap.set(employee.employeeId, {
        id: employee.employeeId,
        name: employee.name,
        position: employee.position,
        groupName: employee.groupName,
        sortOrder: employeeMap.size + 1,
        isActive: true,
        specialRole: employee.name === "김계순" ? "KITCHEN_TEACHER" : "",
      });
    }
  }

  return [...employeeMap.values()];
}

function buildAssignments(records: EmployeeDayRecord[], date: string) {
  return records.map<AdminAssignment>((record) => ({
    date,
    employeeId: record.employeeId,
    dutyKind: record.dutyKind,
    leaveType: record.leaveType ?? "",
    rawCode: record.rawCode ?? "",
  }));
}

function getBaseScheduleData() {
  return rawData as ScheduleData;
}

function getLocalRepository(): AdminRepository {
  return {
    mode: "local",
    loadDraft(seed) {
      if (typeof window === "undefined") return seed;
      try {
        const raw = window.localStorage.getItem(ADMIN_STORAGE_KEY);
        if (!raw) return seed;
        const parsed = JSON.parse(raw) as AdminDraft;
        if (!parsed || !Array.isArray(parsed.employees) || !Array.isArray(parsed.days) || !Array.isArray(parsed.assignments)) {
          return seed;
        }
        return parsed;
      } catch {
        return seed;
      }
    },
    saveDraft(draft) {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(draft));
    },
    resetDraft(seed) {
      this.saveDraft(seed);
      return seed;
    },
    publishViewer(data) {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(VIEWER_OVERRIDE_STORAGE_KEY, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent(VIEWER_OVERRIDE_UPDATED_EVENT));
    },
    clearViewerPublish() {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(VIEWER_OVERRIDE_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(VIEWER_OVERRIDE_UPDATED_EVENT));
    },
    loadViewerPublish() {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(VIEWER_OVERRIDE_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as ScheduleData;
      } catch {
        return null;
      }
    },
  };
}

export function getAdminRepository(): AdminRepository {
  return getLocalRepository();
}

export function createAdminSeed(schedule = getBaseScheduleData()): AdminDraft {
  const employees = dedupeEmployees(schedule);
  const assignments = schedule.days.flatMap((day) => buildAssignments(day.allEmployees, day.date));

  return {
    sourceFile: schedule.sourceFile,
    sourceGeneratedAt: schedule.generatedAt,
    lastUpdatedAt: schedule.generatedAt,
    employees,
    days: schedule.days.map((day) => ({
      date: day.date,
      monthKey: day.date.slice(0, 7),
      isSundayClosed: day.isSundayClosed,
      isHoliday: day.isHoliday,
      holidayName: day.holidayName,
      remarks: day.remarks,
      kitchenDutyGroup: day.kitchenDutyGroup,
    })),
    assignments,
  };
}

export function loadAdminDraft(): AdminDraft {
  const seed = createAdminSeed();
  return getAdminRepository().loadDraft(seed);
}

export function saveAdminDraft(draft: AdminDraft) {
  getAdminRepository().saveDraft(draft);
}

export function resetAdminDraft() {
  const seed = createAdminSeed();
  return getAdminRepository().resetDraft(seed);
}

export function getAdminMonthKeys(draft: AdminDraft) {
  return [...new Set(draft.days.map((day) => day.monthKey))].sort();
}

export function getAdminMonthDays(draft: AdminDraft, monthKey: string) {
  return draft.days.filter((day) => day.monthKey === monthKey).sort((left, right) => left.date.localeCompare(right.date));
}

export function getAssignmentKey(date: string, employeeId: string) {
  return `${date}::${employeeId}`;
}

export function getAssignment(draft: AdminDraft, date: string, employeeId: string) {
  return draft.assignments.find((assignment) => assignment.date === date && assignment.employeeId === employeeId) ?? null;
}

export function sortEmployees(employees: AdminEmployee[]) {
  return [...employees].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.name.localeCompare(right.name, "ko-KR");
  });
}

export function toAssignmentChoice(assignment: AdminAssignment | null): AdminAssignmentChoice {
  if (!assignment) return "NONE";
  if (assignment.dutyKind === "WORK") return "WORK";
  if (assignment.dutyKind === "TRAINING") return "TRAINING";
  if (assignment.dutyKind === "OFF") {
    return `OFF:${assignment.leaveType || "휴무(지정)"}` as AdminAssignmentChoice;
  }
  return "NONE";
}

export function fromAssignmentChoice(date: string, employeeId: string, choice: AdminAssignmentChoice): AdminAssignment | null {
  switch (choice) {
    case "NONE":
      return null;
    case "WORK":
      return { date, employeeId, dutyKind: "WORK", leaveType: "", rawCode: "D" };
    case "TRAINING":
      return { date, employeeId, dutyKind: "TRAINING", leaveType: "", rawCode: "교육" };
    case "OFF:휴무(지정)":
      return { date, employeeId, dutyKind: "OFF", leaveType: "휴무(지정)", rawCode: "●" };
    case "OFF:휴무(신청)":
      return { date, employeeId, dutyKind: "OFF", leaveType: "휴무(신청)", rawCode: "●" };
    case "OFF:연차":
      return { date, employeeId, dutyKind: "OFF", leaveType: "연차", rawCode: "▲" };
    case "OFF:오전반차":
      return { date, employeeId, dutyKind: "OFF", leaveType: "오전반차", rawCode: "●D" };
    case "OFF:오후반차":
      return { date, employeeId, dutyKind: "OFF", leaveType: "오후반차", rawCode: "D●" };
    case "OFF:오전연차반차":
      return { date, employeeId, dutyKind: "OFF", leaveType: "오전연차반차", rawCode: "▲D" };
    case "OFF:오후연차반차":
      return { date, employeeId, dutyKind: "OFF", leaveType: "오후연차반차", rawCode: "D▲" };
    case "OFF:경조사":
      return { date, employeeId, dutyKind: "OFF", leaveType: "경조사", rawCode: "경조사" };
    default:
      return null;
  }
}

export function getAssignmentDisplayLabel(assignment: AdminAssignment | null, isSundayClosed = false) {
  if (isSundayClosed) return "휴무";
  const choice = toAssignmentChoice(assignment);
  switch (choice) {
    case "WORK":
      return "근";
    case "TRAINING":
      return "교";
    case "OFF:휴무(지정)":
      return "휴";
    case "OFF:휴무(신청)":
      return "신";
    case "OFF:연차":
      return "연";
    case "OFF:오전반차":
      return "오전";
    case "OFF:오후반차":
      return "오후";
    case "OFF:오전연차반차":
      return "오전연";
    case "OFF:오후연차반차":
      return "오후연";
    case "OFF:경조사":
      return "경조";
    default:
      return "";
  }
}

export function getAssignmentTone(assignment: AdminAssignment | null, isSundayClosed = false) {
  if (isSundayClosed) return "closed";
  if (!assignment) return "empty";
  if (assignment.dutyKind === "WORK") return "work";
  if (assignment.dutyKind === "TRAINING") return "training";
  return "off";
}

export function countMissingAssignments(draft: AdminDraft, monthKey: string) {
  const activeEmployees = draft.employees.filter((employee) => employee.isActive);
  const days = getAdminMonthDays(draft, monthKey).filter((day) => !day.isSundayClosed);
  let missing = 0;

  for (const day of days) {
    for (const employee of activeEmployees) {
      if (!getAssignment(draft, day.date, employee.id)) {
        missing += 1;
      }
    }
  }

  return missing;
}

export function getDerivedRemarkHints(draft: AdminDraft, date: string) {
  const day = draft.days.find((item) => item.date === date);
  if (!day || day.isSundayClosed) return [] as string[];
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const hints: string[] = [];

  if (weekday >= 1 && weekday <= 5) {
    const kitchenTeacher = draft.employees.find((employee) => employee.specialRole === "KITCHEN_TEACHER" && employee.isActive);
    if (kitchenTeacher) {
      const assignment = getAssignment(draft, date, kitchenTeacher.id);
      if (assignment?.dutyKind === "OFF") {
        hints.push("주방 선생님 휴무");
      }
    }
  }

  return hints;
}

function normalizeWeight(value: number) {
  const normalized = Math.round(value * 2) / 2;
  return Number.isInteger(normalized) ? normalized : Number(normalized.toFixed(1));
}

function formatWeight(value: number) {
  return `${normalizeWeight(value)}`;
}

function mergeRemarkParts(parts: string[]) {
  const unique: string[] = [];
  for (const part of parts.map((value) => value.trim()).filter(Boolean)) {
    if (!unique.includes(part)) {
      unique.push(part);
    }
  }
  return unique.join(" · ");
}

function assignmentToRecord(employee: AdminEmployee, assignment: AdminAssignment | null): EmployeeDayRecord {
  const base = {
    employeeId: employee.id,
    name: employee.name,
    position: employee.position,
    groupName: employee.groupName,
    specialDisplayTag: undefined,
  };

  if (!assignment) {
    return {
      ...base,
      dutyKind: "WORK",
      leaveType: undefined,
      rawCode: "",
      workWeight: 0,
      offWeight: 0,
      trainingWeight: 0,
    };
  }

  if (assignment.dutyKind === "TRAINING") {
    return {
      ...base,
      dutyKind: "TRAINING",
      leaveType: undefined,
      rawCode: assignment.rawCode || "교육",
      workWeight: 0,
      offWeight: 0,
      trainingWeight: 1,
      specialDisplayTag: "교육",
    };
  }

  if (assignment.dutyKind === "WORK") {
    return {
      ...base,
      dutyKind: "WORK",
      leaveType: undefined,
      rawCode: assignment.rawCode || "D",
      workWeight: 1,
      offWeight: 0,
      trainingWeight: 0,
    };
  }

  switch (assignment.leaveType) {
    case "오전반차":
    case "오후반차":
    case "오전연차반차":
    case "오후연차반차":
      return {
        ...base,
        dutyKind: "OFF",
        leaveType: assignment.leaveType,
        rawCode: assignment.rawCode,
        workWeight: 0.5,
        offWeight: 0.5,
        trainingWeight: 0,
        specialDisplayTag: undefined,
      };
    default:
      return {
        ...base,
        dutyKind: "OFF",
        leaveType: assignment.leaveType || "휴무(지정)",
        rawCode: assignment.rawCode,
        workWeight: 0,
        offWeight: 1,
        trainingWeight: 0,
        specialDisplayTag: assignment.leaveType === "경조사" ? "경조" : undefined,
      };
  }
}

export function adminDraftToScheduleData(draft: AdminDraft): ScheduleData {
  const employees = sortEmployees(draft.employees).filter((employee) => employee.isActive);
  const days = [...draft.days]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map<DaySummary>((day) => {
      const holidayName = day.isHoliday ? day.holidayName : "";
      const remarks = mergeRemarkParts([day.remarks, holidayName, ...getDerivedRemarkHints(draft, day.date)]);

      if (day.isSundayClosed) {
        return {
          date: day.date,
          isSundayClosed: true,
          isHoliday: day.isHoliday,
          actualWorkCount: 0,
          trainingCount: 0,
          offCount: 0,
          workDisplayText: "-",
          kitchenDutyGroup: "",
          holidayName,
          remarks,
          actualWorkEmployeeCount: 0,
          totalWorkEmployeeCount: 0,
          workEmployees: [],
          offEmployees: [],
          allEmployees: [],
        };
      }

      const allEmployees = employees.map((employee) => assignmentToRecord(employee, getAssignment(draft, day.date, employee.id)));
      const workEmployees = allEmployees.filter((row) => row.workWeight > 0 || row.trainingWeight > 0 || row.leaveType === "경조사");
      const offEmployees = allEmployees.filter((row) => row.offWeight > 0 && row.leaveType !== "경조사");
      const actualWorkCount = normalizeWeight(allEmployees.reduce((sum, row) => sum + row.workWeight, 0));
      const trainingCount = normalizeWeight(allEmployees.reduce((sum, row) => sum + row.trainingWeight, 0));
      const offCount = normalizeWeight(offEmployees.reduce((sum, row) => sum + row.offWeight, 0));
      const actualWorkEmployeeCount = allEmployees.filter((row) => row.workWeight > 0).length;
      const totalWorkEmployeeCount = workEmployees.length;

      return {
        date: day.date,
        isSundayClosed: false,
        isHoliday: day.isHoliday,
        actualWorkCount,
        trainingCount,
        offCount,
        workDisplayText:
          totalWorkEmployeeCount > actualWorkEmployeeCount
            ? `${formatWeight(actualWorkEmployeeCount)}(${formatWeight(totalWorkEmployeeCount)})`
            : formatWeight(actualWorkEmployeeCount),
        kitchenDutyGroup: day.kitchenDutyGroup,
        holidayName,
        remarks,
        actualWorkEmployeeCount,
        totalWorkEmployeeCount,
        workEmployees,
        offEmployees,
        allEmployees,
      };
    });

  const months = [...new Set(days.map((day) => day.date.slice(0, 7)))]
    .sort()
    .map<MonthSummary>((monthKey) => {
      const [year, month] = monthKey.split("-").map(Number);
      return {
        key: monthKey,
        label: `${year}년 ${month}월`,
        dates: days.filter((day) => day.date.startsWith(monthKey)).map((day) => day.date),
      };
    });

  return {
    generatedAt: draft.lastUpdatedAt,
    sourceFile: draft.sourceFile,
    months,
    days,
  };
}

export function publishAdminDraftToViewer(draft: AdminDraft) {
  const payload = adminDraftToScheduleData(draft);
  getAdminRepository().publishViewer(payload);
  return payload;
}

export function loadPublishedViewerOverride() {
  return getAdminRepository().loadViewerPublish();
}

export function clearPublishedViewerOverride() {
  getAdminRepository().clearViewerPublish();
}

export function updateTimestamp<T extends AdminDraft>(draft: T): T {
  return { ...draft, lastUpdatedAt: new Date().toISOString() };
}

export function downloadJson(filename: string, data: unknown) {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
