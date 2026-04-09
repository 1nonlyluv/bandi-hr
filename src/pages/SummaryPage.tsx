import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HeaderNav } from "../components/HeaderNav";
import { RosterModal } from "../components/RosterModal";
import { SummaryCards } from "../components/SummaryCards";
import { formatHeroDate, formatYearLabel, shiftIsoDate } from "../lib/date";
import type { DaySummary } from "../types";

type Props = {
  day: DaySummary | null;
};

export function SummaryPage({ day }: Props) {
  const [activeModal, setActiveModal] = useState<"work" | "off" | null>(null);

  useEffect(() => {
    setActiveModal(null);
  }, [day?.date]);

  if (!day) {
    return (
      <main className="page-shell">
        <HeaderNav hideNav />
        <section className="empty-state">
          <h1>데이터 없음</h1>
          <p>선택한 날짜의 근무표 데이터가 없습니다.</p>
        </section>
      </main>
    );
  }

  const previousDate = shiftIsoDate(day.date, -1);
  const nextDate = shiftIsoDate(day.date, 1);

  return (
    <main className="page-shell">
      <HeaderNav hideNav />

      <section className="hero">
        <div className="hero-top">
          <h1 className="hero-title">오늘의 반디 근무표</h1>
          <p className="hero-year">{formatYearLabel(day.date)}</p>
          <div className="hero-date-row">
            <Link className="date-arrow" to={`/date/${previousDate}`} aria-label="이전 날짜">
              ←
            </Link>
            <h1 className="hero-date">{formatHeroDate(day.date)}</h1>
            <Link className="date-arrow" to={`/date/${nextDate}`} aria-label="다음 날짜">
              →
            </Link>
          </div>
          <div className="hero-actions">
            <Link className="nav-link" to="/calendar">
              월간 캘린더
            </Link>
          </div>
        </div>

        <SummaryCards day={day} onOpenWorkDetails={() => setActiveModal("work")} onOpenOffDetails={() => setActiveModal("off")} />

        {day.isSundayClosed ? (
          <div className="status-banner">일요일은 센터 휴무입니다.</div>
        ) : null}
      </section>

      <RosterModal
        title="근무자 상세"
        subtitle={formatHeroDate(day.date)}
        rows={day.workEmployees}
        mode="work"
        emptyText="근무자가 없습니다."
        isOpen={activeModal === "work"}
        onClose={() => setActiveModal(null)}
      />
      <RosterModal
        title="휴무자 상세"
        subtitle={formatHeroDate(day.date)}
        rows={day.offEmployees}
        mode="off"
        emptyText="휴무자가 없습니다."
        isOpen={activeModal === "off"}
        onClose={() => setActiveModal(null)}
      />
    </main>
  );
}
