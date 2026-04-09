import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderNav } from "../components/HeaderNav";
import { RosterTable } from "../components/RosterTable";
import { formatDateLabel, formatMetric, formatWeekdayLabel, isSaturdayIso } from "../lib/date";
import { getDaysForMonthFromData, getInitialMonthFromData, useScheduleData } from "../lib/schedule";
import type { DaySummary } from "../types";

function defaultDetailTab(day: DaySummary | null) {
  if (!day) return "off" as const;
  return isSaturdayIso(day.date) ? "work" : "off";
}

export function CalendarPage() {
  const navigate = useNavigate();
  const schedule = useScheduleData();
  const initialMonth = getInitialMonthFromData(schedule);
  const [activeMonth, setActiveMonth] = useState(initialMonth?.key ?? "");

  const days = useMemo(() => getDaysForMonthFromData(schedule, activeMonth), [activeMonth, schedule]);
  const [selectedDate, setSelectedDate] = useState(days.find((day) => !day.isSundayClosed)?.date ?? days[0]?.date ?? "");
  const selectedDay =
    days.find((day) => day.date === selectedDate) ??
    days.find((day) => !day.isSundayClosed) ??
    days[0] ??
    null;
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
    if (!days.length) {
      setSelectedDate("");
      return;
    }

    if (!days.some((day) => day.date === selectedDate)) {
      setSelectedDate(days.find((day) => !day.isSundayClosed)?.date ?? days[0]?.date ?? "");
    }
  }, [days, selectedDate]);

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
    <main className="page-shell">
      <HeaderNav hideNav />

      <section className="calendar-layout">
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
              <div className="calendar-grid">
                {days.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    className={`day-card ${day.isSundayClosed ? "closed" : ""} ${day.isHoliday || day.isSundayClosed ? "special-day" : ""} ${
                      selectedDay?.date === day.date ? "selected" : ""
                    }`}
                    onClick={() => setSelectedDate(day.date)}
                  >
                    <span className="day-number">
                      {new Date(day.date).getDate()} <small>{formatWeekdayLabel(day.date)}</small>
                    </span>
                    <span className="day-meta">{day.isSundayClosed ? "센터 휴무" : `근무 ${day.workDisplayText}`}</span>
                    {day.isSundayClosed ? null : <span className="day-meta">{`휴무 ${formatMetric(day.offCount)}`}</span>}
                    <span className={`day-note ${day.remarks ? "" : "empty"}`}>{day.remarks || "\u00A0"}</span>
                  </button>
                ))}
              </div>
            </div>

            <aside className="calendar-detail">
              {!selectedDay ? (
                <p className="detail-empty">선택 가능한 날짜가 없습니다.</p>
              ) : (
                <>
                  <p className="eyebrow">선택 날짜</p>
                  <h2>{formatDateLabel(selectedDay.date)}</h2>
                  <div className="detail-note-box">
                    <span>비고</span>
                    <p>{selectedDay.remarks || "-"}</p>
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
                        <strong>{formatMetric(selectedDay.actualWorkCount)}</strong>
                      </div>
                      <div>
                        <span>교육</span>
                        <strong>{formatMetric(selectedDay.trainingCount)}</strong>
                      </div>
                      <div>
                        <span>휴무</span>
                        <strong>{formatMetric(selectedDay.offCount)}</strong>
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
