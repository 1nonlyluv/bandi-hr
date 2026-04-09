import { useEffect, useMemo, useState } from "react";
import { HeaderNav } from "../components/HeaderNav";
import {
  ADMIN_ASSIGNMENT_OPTIONS,
  ADMIN_SPECIAL_ROLE_OPTIONS,
  adminDraftToScheduleData,
  clearPublishedViewerOverride,
  countMissingAssignments,
  downloadJson,
  fromAssignmentChoice,
  getAdminMonthDays,
  getAdminMonthKeys,
  getAdminRepository,
  getAssignment,
  getAssignmentDisplayLabel,
  getAssignmentTone,
  getDerivedRemarkHints,
  loadAdminDraft,
  publishAdminDraftToViewer,
  resetAdminDraft,
  saveAdminDraft,
  sortEmployees,
  toAssignmentChoice,
  updateTimestamp,
  type AdminDraft,
  type AdminEmployee,
  type AdminTab,
} from "../lib/admin";
import { formatDateLabel } from "../lib/date";

type SelectedCell = {
  date: string;
  employeeId: string;
} | null;

type EmployeeForm = {
  id: string | null;
  name: string;
  position: string;
  groupName: string;
  sortOrder: number;
  isActive: boolean;
  specialRole: "" | "KITCHEN_TEACHER";
};

function blankEmployeeForm(nextSortOrder: number): EmployeeForm {
  return {
    id: null,
    name: "",
    position: "",
    groupName: "",
    sortOrder: nextSortOrder,
    isActive: true,
    specialRole: "",
  };
}

function adminDateParts(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return {
    weekdayShort: new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(parsed),
    dayNumber: parsed.getDate(),
  };
}

export function AdminPage() {
  const [draft, setDraft] = useState<AdminDraft>(() => loadAdminDraft());
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const monthKeys = useMemo(() => getAdminMonthKeys(draft), [draft]);
  const [activeMonth, setActiveMonth] = useState(monthKeys[monthKeys.length - 1] ?? "");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(() => blankEmployeeForm(1));
  const [publishMessage, setPublishMessage] = useState("");
  const repository = getAdminRepository();

  useEffect(() => {
    saveAdminDraft(draft);
    if (repository.mode === "local") {
      publishAdminDraftToViewer(draft);
    }
  }, [draft, repository.mode]);

  useEffect(() => {
    if (!monthKeys.includes(activeMonth)) {
      setActiveMonth(monthKeys[monthKeys.length - 1] ?? "");
    }
  }, [activeMonth, monthKeys]);

  const monthDays = useMemo(() => getAdminMonthDays(draft, activeMonth), [activeMonth, draft]);
  const sortedEmployees = useMemo(() => sortEmployees(draft.employees), [draft.employees]);
  const normalizedEmployeeQuery = employeeQuery.trim().toLowerCase();
  const filteredEmployees = useMemo(
    () =>
      sortedEmployees.filter((employee) => {
        if (!showInactiveEmployees && !employee.isActive) return false;
        if (!normalizedEmployeeQuery) return true;
        return [employee.name, employee.position, employee.groupName].some((value) => value.toLowerCase().includes(normalizedEmployeeQuery));
      }),
    [normalizedEmployeeQuery, showInactiveEmployees, sortedEmployees],
  );
  const activeEmployees = useMemo(() => sortedEmployees.filter((employee) => employee.isActive), [sortedEmployees]);
  const selectedDay = monthDays.find((day) => day.date === selectedDate) ?? monthDays[0] ?? null;
  const selectedAssignment = selectedCell ? getAssignment(draft, selectedCell.date, selectedCell.employeeId) : null;
  const selectedAssignmentEmployee =
    selectedCell ? draft.employees.find((employee) => employee.id === selectedCell.employeeId) ?? null : null;
  const currentMonthMissingAssignments = activeMonth ? countMissingAssignments(draft, activeMonth) : 0;
  const currentMonthNotes = monthDays.filter((day) => day.remarks || day.holidayName).length;
  const derivedHints = selectedDay ? getDerivedRemarkHints(draft, selectedDay.date) : [];

  useEffect(() => {
    if (!selectedDay && monthDays[0]) {
      setSelectedDate(monthDays[0].date);
    }
    if (selectedDay && !selectedDate) {
      setSelectedDate(selectedDay.date);
    }
  }, [monthDays, selectedDate, selectedDay]);

  useEffect(() => {
    if (!employeeForm.id) return;
    const employee = draft.employees.find((item) => item.id === employeeForm.id);
    if (!employee) return;
    setEmployeeForm({
      id: employee.id,
      name: employee.name,
      position: employee.position,
      groupName: employee.groupName,
      sortOrder: employee.sortOrder,
      isActive: employee.isActive,
      specialRole: employee.specialRole,
    });
  }, [draft.employees, employeeForm.id]);

  const dashboardStats = [
    { label: "활성 직원", value: `${activeEmployees.length}명`, note: "입력 대상 기준" },
    { label: "관리 월", value: `${monthKeys.length}개`, note: "현재 초안에 포함" },
    { label: "이번 달 누락", value: `${currentMonthMissingAssignments}칸`, note: "일요일 제외" },
    { label: "이번 달 비고", value: `${currentMonthNotes}일`, note: "공휴일/수동 비고 포함" },
  ];

  function mutateDraft(updater: (current: AdminDraft) => AdminDraft) {
    setDraft((current) => updateTimestamp(updater(current)));
  }

  function handleDayChange<K extends "remarks" | "holidayName" | "kitchenDutyGroup" | "isHoliday" | "isSundayClosed">(
    date: string,
    field: K,
    value: AdminDraft["days"][number][K],
  ) {
    mutateDraft((current) => ({
      ...current,
      days: current.days.map((day) => {
        if (day.date !== date) return day;
        const nextDay = { ...day, [field]: value };
        if (field === "isSundayClosed" && value === true) {
          nextDay.kitchenDutyGroup = "";
        }
        return nextDay;
      }),
    }));
  }

  function handleAssignmentChoice(date: string, employeeId: string, choice: Parameters<typeof fromAssignmentChoice>[2]) {
    mutateDraft((current) => {
      const nextAssignment = fromAssignmentChoice(date, employeeId, choice);
      const filtered = current.assignments.filter(
        (assignment) => !(assignment.date === date && assignment.employeeId === employeeId),
      );
      return {
        ...current,
        assignments: nextAssignment ? [...filtered, nextAssignment] : filtered,
      };
    });
  }

  function startNewEmployee() {
    const nextSortOrder = Math.max(0, ...draft.employees.map((employee) => employee.sortOrder)) + 1;
    setEmployeeForm(blankEmployeeForm(nextSortOrder));
  }

  function handleEmployeeSave() {
    const trimmedName = employeeForm.name.trim();
    if (!trimmedName) return;

    if (employeeForm.id) {
      mutateDraft((current) => ({
        ...current,
        employees: current.employees.map((employee) =>
          employee.id === employeeForm.id
            ? {
                ...employee,
                name: trimmedName,
                position: employeeForm.position.trim(),
                groupName: employeeForm.groupName.trim(),
                sortOrder: employeeForm.sortOrder,
                isActive: employeeForm.isActive,
                specialRole: employeeForm.specialRole,
              }
            : employee,
        ),
      }));
      return;
    }

    const newId = `${trimmedName}|${employeeForm.position.trim() || "직원"}|${Date.now()}`;
    mutateDraft((current) => ({
      ...current,
      employees: [
        ...current.employees,
        {
          id: newId,
          name: trimmedName,
          position: employeeForm.position.trim(),
          groupName: employeeForm.groupName.trim(),
          sortOrder: employeeForm.sortOrder,
          isActive: employeeForm.isActive,
          specialRole: employeeForm.specialRole,
        },
      ],
    }));
    setEmployeeForm(blankEmployeeForm(employeeForm.sortOrder + 1));
  }

  function handleEmployeeSelect(employee: AdminEmployee) {
    setEmployeeForm({
      id: employee.id,
      name: employee.name,
      position: employee.position,
      groupName: employee.groupName,
      sortOrder: employee.sortOrder,
      isActive: employee.isActive,
      specialRole: employee.specialRole,
    });
  }

  function renderDashboard() {
    return (
      <section className="admin-panel-stack">
        <section className="admin-hero-card">
          <div>
            <p className="eyebrow">Admin Draft</p>
            <h1>반디근무 관리자 입력 앱 초안</h1>
            <p className="admin-copy">
              현재는 로컬 초안 저장 모드입니다. 화면과 입력 흐름을 먼저 검증하고, 이후 DB/API 계층만 교체하는 구조로 설계했습니다.
            </p>
          </div>
          <div className="admin-status-box">
            <span>현재 작업 월</span>
            <strong>{activeMonth || "-"}</strong>
            <small>마지막 저장 {new Date(draft.lastUpdatedAt).toLocaleString("ko-KR")}</small>
          </div>
        </section>

        <section className="admin-stat-grid">
          {dashboardStats.map((stat) => (
            <article key={stat.label} className="admin-stat-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.note}</small>
            </article>
          ))}
        </section>

        <section className="admin-summary-grid">
          <article className="admin-sheet-card">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">Month Overview</p>
                <h2>월별 초안 현황</h2>
              </div>
            </div>
            <div className="admin-month-overview">
              {monthKeys.map((monthKey) => (
                <button
                  key={monthKey}
                  type="button"
                  className={`admin-month-pill ${monthKey === activeMonth ? "active" : ""}`}
                  onClick={() => {
                    setActiveMonth(monthKey);
                    setActiveTab("month");
                  }}
                >
                  <strong>{monthKey}</strong>
                  <span>누락 {countMissingAssignments(draft, monthKey)}칸</span>
                </button>
              ))}
            </div>
          </article>

          <article className="admin-sheet-card">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">Roadmap</p>
                <h2>연결 단계</h2>
              </div>
            </div>
            <ol className="admin-roadmap">
              <li>admin 초안 입력 확인</li>
              <li>DB 저장 계층 연결</li>
              <li>현재 뷰어용 JSON 발행</li>
              <li>엑셀 export 연결</li>
              <li>API 뷰어 전환</li>
            </ol>
          </article>
        </section>
      </section>
    );
  }

  function renderEmployees() {
    return (
      <section className="admin-two-column">
        <article className="admin-sheet-card">
          <div className="admin-section-head">
            <div>
              <p className="eyebrow">Employees</p>
              <h2>직원 관리</h2>
            </div>
            <button type="button" className="admin-action-button" onClick={startNewEmployee}>
              새 직원
            </button>
          </div>

          <div className="admin-list-toolbar">
            <input placeholder="이름, 직위, 소속 검색" value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} />
            <label className="admin-check-row compact">
              <input
                type="checkbox"
                checked={showInactiveEmployees}
                onChange={(event) => setShowInactiveEmployees(event.target.checked)}
              />
              비활성 포함
            </label>
          </div>

          <div className="admin-employee-list">
            {filteredEmployees.map((employee) => (
              <button
                key={employee.id}
                type="button"
                className={`admin-employee-row ${employeeForm.id === employee.id ? "active" : ""}`}
                onClick={() => handleEmployeeSelect(employee)}
              >
                <strong>{employee.name}</strong>
                <span>{employee.position || "직위 미입력"}</span>
                <small>{employee.groupName || "소속 미입력"}</small>
                <em>{employee.isActive ? "활성" : "비활성"}</em>
              </button>
            ))}
          </div>
        </article>

        <article className="admin-sheet-card">
          <div className="admin-section-head">
            <div>
              <p className="eyebrow">Editor</p>
              <h2>{employeeForm.id ? "직원 수정" : "직원 추가"}</h2>
            </div>
          </div>

          <div className="admin-form-grid">
            <label>
              이름
              <input value={employeeForm.name} onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              직위
              <input value={employeeForm.position} onChange={(event) => setEmployeeForm((current) => ({ ...current, position: event.target.value }))} />
            </label>
            <label>
              소속
              <input value={employeeForm.groupName} onChange={(event) => setEmployeeForm((current) => ({ ...current, groupName: event.target.value }))} />
            </label>
            <label>
              정렬 순서
              <input
                type="number"
                value={employeeForm.sortOrder}
                onChange={(event) => setEmployeeForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))}
              />
            </label>
            <label>
              특수 역할
              <select
                value={employeeForm.specialRole}
                onChange={(event) =>
                  setEmployeeForm((current) => ({ ...current, specialRole: event.target.value as EmployeeForm["specialRole"] }))
                }
              >
                {ADMIN_SPECIAL_ROLE_OPTIONS.map((option) => (
                  <option key={option.value || "blank"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-check-row">
              <input
                type="checkbox"
                checked={employeeForm.isActive}
                onChange={(event) => setEmployeeForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              사용 중
            </label>
          </div>

          <div className="admin-form-actions">
            <button type="button" className="admin-primary-button" onClick={handleEmployeeSave}>
              저장
            </button>
            <button type="button" className="admin-secondary-button" onClick={startNewEmployee}>
              새 폼
            </button>
          </div>
        </article>
      </section>
    );
  }

  function renderMonthEditor() {
    return (
      <section className="admin-panel-stack">
        <section className="admin-sheet-card">
          <div className="admin-section-head">
            <div>
              <p className="eyebrow">Monthly Editor</p>
              <h2>월간 편집</h2>
            </div>
            <div className="admin-toolbar">
              <select value={activeMonth} onChange={(event) => setActiveMonth(event.target.value)}>
                {monthKeys.map((monthKey) => (
                  <option key={monthKey} value={monthKey}>
                    {monthKey}
                  </option>
                ))}
              </select>
              <input placeholder="직원 검색" value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} />
              <div className="admin-inline-meta">누락 {currentMonthMissingAssignments}칸</div>
            </div>
          </div>
        </section>

        <section className="admin-editor-layout">
          <article className="admin-sheet-card admin-grid-card">
            <div className="admin-grid-shell">
              <table className="admin-grid">
                <thead>
                  <tr>
                    <th className="sticky-col">직원</th>
                    {monthDays.map((day) => {
                      const parts = adminDateParts(day.date);
                      return (
                        <th key={day.date}>
                          <button
                            type="button"
                            className={`admin-day-header ${selectedDay?.date === day.date ? "active" : ""}`}
                            onClick={() => {
                              setSelectedDate(day.date);
                              setSelectedCell(null);
                            }}
                          >
                            <strong>{parts.dayNumber}</strong>
                            <span>{parts.weekdayShort}</span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.filter((employee) => employee.isActive).map((employee) => (
                    <tr key={employee.id}>
                      <th className="sticky-col">
                        <div className="admin-grid-employee">
                          <strong>{employee.name}</strong>
                          <span>{employee.position || "-"}</span>
                        </div>
                      </th>
                      {monthDays.map((day) => {
                        const assignment = getAssignment(draft, day.date, employee.id);
                        const isSelected = selectedCell?.date === day.date && selectedCell.employeeId === employee.id;
                        return (
                          <td key={`${employee.id}-${day.date}`}>
                            <button
                              type="button"
                              className={`assignment-chip ${getAssignmentTone(assignment, day.isSundayClosed)} ${isSelected ? "selected" : ""}`}
                              onClick={() => {
                                setSelectedDate(day.date);
                                if (day.isSundayClosed) {
                                  setSelectedCell(null);
                                  return;
                                }
                                setSelectedCell({ date: day.date, employeeId: employee.id });
                              }}
                            >
                              {getAssignmentDisplayLabel(assignment, day.isSundayClosed) || "·"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="admin-inspector">
            <article className="admin-sheet-card">
              <div className="admin-section-head">
                <div>
                  <p className="eyebrow">Day Detail</p>
                  <h2>{selectedDay ? formatDateLabel(selectedDay.date) : "날짜 선택"}</h2>
                </div>
              </div>

              {selectedDay ? (
                <div className="admin-form-grid">
                  <label className="admin-check-row">
                    <input
                      type="checkbox"
                      checked={selectedDay.isSundayClosed}
                      onChange={(event) => handleDayChange(selectedDay.date, "isSundayClosed", event.target.checked)}
                    />
                    일요일/휴관 처리
                  </label>
                  <label className="admin-check-row">
                    <input
                      type="checkbox"
                      checked={selectedDay.isHoliday}
                      onChange={(event) => handleDayChange(selectedDay.date, "isHoliday", event.target.checked)}
                    />
                    공휴일
                  </label>
                  <label>
                    공휴일명
                    <input
                      value={selectedDay.holidayName}
                      onChange={(event) => handleDayChange(selectedDay.date, "holidayName", event.target.value)}
                    />
                  </label>
                  <label>
                    주방 담당 반
                    <input
                      value={selectedDay.kitchenDutyGroup}
                      disabled={selectedDay.isSundayClosed}
                      onChange={(event) => handleDayChange(selectedDay.date, "kitchenDutyGroup", event.target.value)}
                    />
                  </label>
                  <label className="full-span">
                    비고
                    <textarea value={selectedDay.remarks} onChange={(event) => handleDayChange(selectedDay.date, "remarks", event.target.value)} />
                  </label>
                  <div className="admin-hint-box full-span">
                    <span>자동 비고 힌트</span>
                    <p>{derivedHints.length ? derivedHints.join(" · ") : "현재 자동 규칙으로 추가될 비고가 없습니다."}</p>
                  </div>
                </div>
              ) : (
                <p className="detail-empty">날짜를 선택해 주세요.</p>
              )}
            </article>

            <article className="admin-sheet-card">
              <div className="admin-section-head">
                <div>
                  <p className="eyebrow">Assignment</p>
                  <h2>{selectedAssignmentEmployee ? `${selectedAssignmentEmployee.name} 배정` : "직원 셀 선택"}</h2>
                </div>
              </div>

              {selectedCell && selectedAssignmentEmployee ? (
                <div className="admin-form-grid">
                  <div className="admin-hint-box full-span">
                    <span>선택 셀</span>
                    <p>{formatDateLabel(selectedCell.date)} / {selectedAssignmentEmployee.name}</p>
                  </div>
                  <label className="full-span">
                    상태
                    <select
                      value={toAssignmentChoice(selectedAssignment)}
                      onChange={(event) => handleAssignmentChoice(selectedCell.date, selectedCell.employeeId, event.target.value as typeof ADMIN_ASSIGNMENT_OPTIONS[number]["value"])}
                    >
                      {ADMIN_ASSIGNMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="admin-choice-grid full-span">
                    {ADMIN_ASSIGNMENT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`admin-choice-button ${toAssignmentChoice(selectedAssignment) === option.value ? "active" : ""}`}
                        onClick={() => handleAssignmentChoice(selectedCell.date, selectedCell.employeeId, option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="admin-hint-box full-span">
                    <span>원시 코드</span>
                    <p>{selectedAssignment?.rawCode || "-"}</p>
                  </div>
                </div>
              ) : (
                <p className="detail-empty">월간 표에서 직원 셀을 선택하면 여기에서 배정을 바꿀 수 있습니다.</p>
              )}
            </article>
          </aside>
        </section>
      </section>
    );
  }

  function renderPublish() {
    return (
      <section className="admin-panel-stack">
        <section className="admin-summary-grid">
          <article className="admin-sheet-card">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">Legacy Publish</p>
                <h2>현재 뷰어 연결</h2>
              </div>
            </div>
            <p className="admin-copy">
              이 경로는 지금의 `schedule.json` 기반 뷰어를 계속 사용하는 방식입니다. 현재 로컬 모드에서는 초안 수정 사항이 자동으로 현재 뷰어 미리보기에 동기화됩니다.
            </p>
            <div className="admin-form-actions">
              <button
                type="button"
                className="admin-primary-button"
                onClick={() => {
                  publishAdminDraftToViewer(draft);
                  setPublishMessage("현재 뷰어에 admin 초안을 반영했습니다.");
                }}
              >
                현재 뷰어에 반영
              </button>
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => {
                  const payload = adminDraftToScheduleData(draft);
                  downloadJson(`schedule-${activeMonth || "all"}.json`, payload);
                }}
              >
                viewer용 JSON 다운로드
              </button>
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => {
                  clearPublishedViewerOverride();
                  setPublishMessage("뷰어 오버라이드를 해제했습니다. 기본 생성 데이터로 돌아갑니다.");
                }}
              >
                뷰어 오버라이드 해제
              </button>
              <button type="button" className="admin-secondary-button" onClick={() => downloadJson(`bandihr-admin-draft-${activeMonth || "all"}.json`, draft)}>
                초안 JSON 다운로드
              </button>
            </div>
            <div className="admin-badge-row">
              <span className="admin-badge">저장 계층: {repository.mode}</span>
              <span className="admin-badge muted">즉시 반영 확인은 홈으로 이동</span>
            </div>
            {publishMessage ? <p className="admin-publish-message">{publishMessage}</p> : null}
          </article>

          <article className="admin-sheet-card">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">Excel Export</p>
                <h2>엑셀 출력 연결</h2>
              </div>
            </div>
            <p className="admin-copy">
              현재는 화면과 draft 모델을 먼저 확정하는 단계입니다. 다음 구현에서는 이 draft를 기존 양식 `.xlsx`로 내보내는 exporter를 연결합니다.
            </p>
            <div className="admin-badge-row">
              <span className="admin-badge muted">다음 단계 예정</span>
            </div>
          </article>
        </section>

        <section className="admin-summary-grid">
          <article className="admin-sheet-card">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">Future API</p>
                <h2>API 뷰어 전환 준비</h2>
              </div>
            </div>
            <ul className="admin-checklist">
              <li>공통 도메인 규칙 분리</li>
              <li>DB 저장소 연결</li>
              <li>발행 상태(`draft/published`) 관리</li>
              <li>뷰어 데이터 소스 adapter 연결</li>
            </ul>
          </article>

          <article className="admin-sheet-card">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">Reset</p>
                <h2>초안 초기화</h2>
              </div>
            </div>
            <p className="admin-copy">현재 로컬 초안을 지우고, 지금의 생성된 스케줄 데이터 기준으로 다시 시작합니다.</p>
            <div className="admin-form-actions">
              <button
                type="button"
                className="admin-secondary-button danger"
                onClick={() => {
                  const next = resetAdminDraft();
                  setDraft(next);
                  setActiveMonth(getAdminMonthKeys(next)[getAdminMonthKeys(next).length - 1] ?? "");
                  setSelectedCell(null);
                }}
              >
                초안 초기화
              </button>
            </div>
          </article>
        </section>
      </section>
    );
  }

  return (
    <main className="page-shell admin-shell">
      <HeaderNav hideNav />

      <section className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-top">
            <p className="eyebrow">Admin Workspace</p>
            <h1>반디근무 관리</h1>
            <p className="admin-copy">현재 뷰어를 유지하면서, 차후 DB/API 연결로 전환할 수 있도록 분리한 관리자 초안입니다.</p>
          </div>

          <nav className="admin-tab-list">
            {[
              ["dashboard", "대시보드"],
              ["employees", "직원 관리"],
              ["month", "월간 편집"],
              ["publish", "발행"],
            ].map(([key, label]) => (
              <button key={key} type="button" className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key as AdminTab)}>
                {label}
              </button>
            ))}
          </nav>

          <div className="admin-sidebar-foot">
            <span>저장 계층</span>
            <strong>{repository.mode === "local" ? "로컬 초안 저장" : "API 저장"}</strong>
            <small>차후 adapter 교체 예정</small>
          </div>

          <div className="admin-sidebar-foot">
            <span>소스 파일</span>
            <strong>{draft.sourceFile}</strong>
            <small>{new Date(draft.sourceGeneratedAt).toLocaleString("ko-KR")}</small>
          </div>
        </aside>

        <section className="admin-main">
          {activeTab === "dashboard" ? renderDashboard() : null}
          {activeTab === "employees" ? renderEmployees() : null}
          {activeTab === "month" ? renderMonthEditor() : null}
          {activeTab === "publish" ? renderPublish() : null}
        </section>
      </section>
    </main>
  );
}
