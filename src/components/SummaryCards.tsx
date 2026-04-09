import type { DaySummary } from "../types";

type Props = {
  day: DaySummary;
  onOpenWorkDetails: () => void;
  onOpenOffDetails: () => void;
};

export function SummaryCards({ day, onOpenWorkDetails, onOpenOffDetails }: Props) {
  return (
    <div className="metric-grid">
      <button
        type="button"
        className={`metric-card metric-work ${day.isSundayClosed ? "disabled" : "clickable"}`}
        onClick={day.isSundayClosed ? undefined : onOpenWorkDetails}
      >
        <div className="metric-label">근무자</div>
        <div className="metric-value">{day.isSundayClosed ? "-" : day.workDisplayText}</div>
        <div className="metric-subtext">{day.isSundayClosed ? "센터 휴무" : "상세 보기"}</div>
      </button>

      <button
        type="button"
        className={`metric-card metric-off accent ${day.isSundayClosed ? "disabled" : "clickable"}`}
        onClick={day.isSundayClosed ? undefined : onOpenOffDetails}
      >
        <div className="metric-label">휴무자</div>
        <div className="metric-value">{day.isSundayClosed ? "-" : day.offEmployees.length}</div>
        <div className="metric-subtext">{day.isSundayClosed ? "센터 휴무" : "상세 보기"}</div>
      </button>

      <article className="metric-card metric-kitchen">
        <div className="metric-label">금주의 주방 담당 반</div>
        <div className="metric-value">{day.kitchenDutyGroup}</div>
        <div className="metric-subtext">주간 순환 담당</div>
      </article>

      <article className="metric-card metric-note-card accent">
        <div className="metric-label">비고</div>
        <div className="metric-note">{day.remarks || "-"}</div>
      </article>
    </div>
  );
}
