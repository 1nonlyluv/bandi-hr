export type LeaveType =
  | "휴무(지정)"
  | "휴무(신청)"
  | "연차"
  | "오전반차"
  | "오후반차"
  | "오전연차반차"
  | "오후연차반차"
  | "경조사";

export type DutyKind = "WORK" | "TRAINING" | "OFF" | "CLOSED";

export type DutyWeight = 0 | 0.5 | 1;

export type EmployeeDayRecord = {
  employeeId: string;
  name: string;
  position: string;
  groupName: string;
  dutyKind: DutyKind;
  leaveType?: LeaveType;
  rawCode: string;
  workWeight: DutyWeight;
  offWeight: DutyWeight;
  trainingWeight: DutyWeight;
  specialDisplayTag?: "교육" | "경조";
};

export type DaySummary = {
  date: string;
  isSundayClosed: boolean;
  isHoliday: boolean;
  actualWorkCount: number;
  trainingCount: number;
  offCount: number;
  workDisplayText: string;
  kitchenDutyGroup: string;
  holidayName: string;
  remarks: string;
  actualWorkEmployeeCount: number;
  totalWorkEmployeeCount: number;
  workEmployees: EmployeeDayRecord[];
  offEmployees: EmployeeDayRecord[];
  allEmployees: EmployeeDayRecord[];
};

export type MonthSummary = {
  key: string;
  label: string;
  dates: string[];
};

export type ScheduleData = {
  generatedAt: string;
  sourceGeneratedAt?: string;
  sourceFile: string;
  months: MonthSummary[];
  days: DaySummary[];
};
