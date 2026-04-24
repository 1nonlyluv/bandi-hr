import type { DaySummary } from "../types";

type Props = {
  day: DaySummary;
  onOpenWorkDetails: () => void;
  onOpenOffDetails: () => void;
};

export function SummaryCards({ day, onOpenWorkDetails, onOpenOffDetails }: Props) {
  const workValue = day.isSundayClosed ? "-" : day.workDisplayText;
  const [primaryWorkValue, secondaryWorkValue] = workValue.includes("(")
    ? [workValue.slice(0, workValue.indexOf("(")), workValue.slice(workValue.indexOf("("))]
    : [workValue, ""];
  const noteLines = day.remarks ? day.remarks.split("\n") : [];

  return (
    <div className="metric-grid">
      <button
        type="button"
        className={`metric-card metric-work ${day.isSundayClosed ? "disabled" : "clickable"}`}
        onClick={day.isSundayClosed ? undefined : onOpenWorkDetails}
      >
        <div className="metric-label">근무자</div>
        <div className="metric-value">
          <span>{primaryWorkValue}</span>
          {secondaryWorkValue ? <small>{secondaryWorkValue}</small> : null}
        </div>
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
      </article>

      <article className="metric-card metric-note-card accent">
        <div className="metric-label">비고</div>
        <div className="metric-note">
          {noteLines.length ? (
            noteLines.map((line, index) => (
              <div key={`${line}-${index}`} className={index === 0 || /^(교육|경조|주방 휴무|노동절|설날|추석|삼일절|광복절|개천절|한글날|어린이날|현충일|성탄절)/.test(line) ? "metric-note-head" : "metric-note-line"}>
                {line}
              </div>
            ))
          ) : (
            "-"
          )}
        </div>
      </article>
    </div>
  );
}
