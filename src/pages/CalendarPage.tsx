import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HeaderNav } from "../components/HeaderNav";
import { RosterTable } from "../components/RosterTable";
import { formatDateLabel, formatMetric, formatWeekdayLabel, getWeekdayIndex, isSaturdayIso, toIsoDate } from "../lib/date";
import { getDaysForMonthFromData, getInitialMonthFromData, isValidIsoDateInData, useScheduleData } from "../lib/schedule";
import type { DaySummary } from "../types";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function defaultDetailTab(day: DaySummary | null) {
  if (!day) return "off" as const;
  return isSaturdayIso(day.date) ? "work" : "off";
}

function getDetailMetrics(day: DaySummary | null) {
  if (!day) {
    return { actualWork: 0, off: 0, other: 0 };
  }

  let actualWork = 0;
  let off = 0;
  let other = 0;

  for (const row of day.allEmployees) {
    if (row.dutyKind === "TRAINING") {
      other += row.trainingWeight;
      continue;
    }

    if (row.leaveType === "경조사") {
      other += row.offWeight || 1;
      continue;
    }

    if (row.workWeight > 0) {
      actualWork += row.workWeight;
    }

    if (row.offWeight > 0) {
      off += row.offWeight;
    }
  }

  return { actualWork, off, other };
}

function renderNoteLines(note: string) {
  const lines = note ? note.split("\n").filter(Boolean) : [];
  if (!lines.length) {
    return "-";
  }

  return lines.map((line, index) => (
    <div key={`${line}-${index}`} className={index === 0 ? "detail-note-head" : "detail-note-line"}>
      {line}
    </div>
  ));
}

export function CalendarPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isMobileCompact, setIsMobileCompact] = useState(false);
  const schedule = useScheduleData();
  const initialMonth = getInitialMonthFromData(schedule);
  const preferredDate = useMemo(() => {
    const requestedDate = searchParams.get("date");
    if (requestedDate && isValidIsoDateInData(schedule, requestedDate)) {
      return requestedDate;
    }

    const today = toIsoDate(new Date());
    if (isValidIsoDateInData(schedule, today)) {
      return today;
    }

    return null;
  }, [schedule, searchParams]);
  const [activeMonth, setActiveMonth] = useState(preferredDate?.slice(0, 7) ?? initialMonth?.key ?? "");

  const days = useMemo(() => getDaysForMonthFromData(schedule, activeMonth), [activeMonth, schedule]);
  const calendarCells = useMemo(() => {
    if (!days.length) return [];
    const leadingEmpty = getWeekdayIndex(days[0].date);
    const cells = [...Array.from({ length: leadingEmpty }, () => null), ...days];
    const trailingEmpty = (7 - (cells.length % 7 || 7)) % 7;
    return [...cells, ...Array.from({ length: trailingEmpty }, () => null)];
  }, [days]);
  const [selectedDate, setSelectedDate] = useState(
    () => (preferredDate && preferredDate.startsWith(activeMonth) ? preferredDate : days.find((day) => !day.isSundayClosed)?.date ?? days[0]?.date ?? ""),
  );
  const selectedDay =
    days.find((day) => day.date === selectedDate) ??
    days.find((day) => !day.isSundayClosed) ??
    days[0] ??
    null;
  const detailMetrics = useMemo(() => getDetailMetrics(selectedDay), [selectedDay]);
  const [detailTab, setDetailTab] = useState<"work" | "off">(defaultDetailTab(selectedDay));

  useEffect(() => {
    setDetailTab(defaultDetailTab(selectedDay));
  }, [selectedDay?.date]);

  useEffect(() => {
    if (!schedule.months.some((month) => month.key === activeMonth)) {
      setActiveMonth(initialMonth?.key ?? "");
    }
  }, [activeMonth, initialMonth?.key, schedule.months]);

  useEffect(() => {
    if (!preferredDate) return;
    setActiveMonth(preferredDate.slice(0, 7));
    setSelectedDate(preferredDate);
  }, [preferredDate]);

  useEffect(() => {
    if (!days.length) {
      setSelectedDate("");
      return;
    }

    if (!days.some((day) => day.date === selectedDate)) {
      setSelectedDate(days.find((day) => !day.isSundayClosed)?.date ?? days[0]?.date ?? "");
    }
  }, [days, selectedDate]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const update = () => {
      setIsMobileCompact(mediaQuery.matches);
    };

    update();
    mediaQuery.addEventListener("change", update);

    return () => {
      mediaQuery.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const handleMouseNavigation = (event: MouseEvent) => {
      if (event.button === 3 && window.history.length > 1) {
        event.preventDefault();
        navigate(-1);
      }

      if (event.button === 4) {
        event.preventDefault();
        navigate(1);
      }
    };

    window.addEventListener("mouseup", handleMouseNavigation);
    return () => {
      window.removeEventListener("mouseup", handleMouseNavigation);
    };
  }, [navigate]);

  const handleMonthChange = (nextMonth: string) => {
    const nextDays = getDaysForMonthFromData(schedule, nextMonth);
    setActiveMonth(nextMonth);
    setSelectedDate(nextDays.find((day) => !day.isSundayClosed)?.date ?? nextDays[0]?.date ?? "");
  };

  return (
    <main className="page-shell calendar-shell">
      <HeaderNav hideNav />

      <section className={`calendar-layout ${isMobileCompact ? "mobile-compact" : ""}`}>
        <div className="calendar-header">
          <div>
            <p className="eyebrow">월별 근무 캘린더</p>
            <h1>{schedule.months.find((month) => month.key === activeMonth)?.label ?? "월간 캘린더"}</h1>
          </div>

          <div className="calendar-controls">
            <select className="month-select" value={activeMonth} onChange={(event) => handleMonthChange(event.target.value)}>
              {schedule.months.map((month) => (
                <option key={month.key} value={month.key}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="calendar-scroll">
          <div className="calendar-content">
            <div className="calendar-grid-shell">
              <div className="calendar-weekdays" aria-hidden="true">
                {WEEKDAY_LABELS.map((label, index) => (
                  <span key={label} className={index === 0 ? "sunday" : ""}>
                    {label}
                  </span>
                ))}
              </div>
              <div className="calendar-grid">
                {calendarCells.map((day, index) =>
                  day ? (
                    <button
                      key={day.date}
                      type="button"
                      className={`day-card ${day.isSundayClosed ? "closed" : ""} ${day.isHoliday || day.isSundayClosed ? "special-day" : ""} ${
                        day.isHoliday ? "holiday" : ""
                      } ${selectedDay?.date === day.date ? "selected" : ""}`}
                      onClick={() => {
                        if (isMobileCompact) {
                          navigate(`/date/${day.date}`);
                          return;
                        }

                        setSelectedDate(day.date);
                      }}
                    >
                      <span className="day-number">
                        {new Date(day.date).getDate()} <small>{formatWeekdayLabel(day.date)}</small>
                      </span>
                      <span className="day-meta">{day.isSundayClosed ? "센터 휴무" : `근무 ${day.workDisplayText}`}</span>
                      {day.isSundayClosed ? null : <span className="day-meta">{`휴무 ${formatMetric(day.offCount)}`}</span>}
                      <span className={`day-note ${day.remarks ? "" : "empty"}`}>{day.remarks ? day.remarks.split("\n")[0] : "\u00A0"}</span>
                    </button>
                  ) : (
                    <div key={`empty-${index}`} className="day-card day-card-empty" aria-hidden="true" />
                  ),
                )}
              </div>
            </div>

            <aside className="calendar-detail">
              {!selectedDay ? (
                <p className="detail-empty">선택 가능한 날짜가 없습니다.</p>
              ) : (
                <>
                  <p className="eyebrow">선택 날짜</p>
                  <h2>{formatDateLabel(selectedDay.date)}</h2>
                  {selectedDay.isHoliday || selectedDay.isSundayClosed ? (
                    <div className="detail-holiday-badge">{selectedDay.holidayName || "센터 휴무"}</div>
                  ) : null}
                  <div className="detail-note-box">
                    <span>비고</span>
                    <div className="detail-note-content">{renderNoteLines(selectedDay.remarks)}</div>
                  </div>

                  {selectedDay.isSundayClosed ? (
                    <>
                      <div className="status-banner">센터 휴무</div>
                      <p className="detail-empty">일요일은 근퇴 집계를 표시하지 않습니다.</p>
                    </>
                  ) : (
                    <div className="mini-metrics">
                      <div>
                        <span>실근무</span>
                        <strong>{formatMetric(detailMetrics.actualWork)}</strong>
                      </div>
                      <div>
                        <span>휴무</span>
                        <strong>{formatMetric(detailMetrics.off)}</strong>
                      </div>
                      <div>
                        <span>기타</span>
                        <strong>{formatMetric(detailMetrics.other)}</strong>
                      </div>
                    </div>
                  )}

                  {!selectedDay.isSundayClosed ? (
                    <div className="kitchen-inline">
                      금주 주방 담당 반: <strong>{selectedDay.kitchenDutyGroup}</strong>
                    </div>
                  ) : null}

                  <div className="detail-tabs">
                    <button type="button" className={detailTab === "work" ? "active" : ""} onClick={() => setDetailTab("work")}>
                      근무자
                    </button>
                    <button type="button" className={detailTab === "off" ? "active" : ""} onClick={() => setDetailTab("off")}>
                      휴무자
                    </button>
                  </div>

                  <RosterTable
                    rows={detailTab === "work" ? selectedDay.workEmployees : selectedDay.offEmployees}
                    mode={detailTab}
                    emptyText={detailTab === "work" ? "근무자가 없습니다." : "휴무자가 없습니다."}
                  />
                </>
              )}
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
