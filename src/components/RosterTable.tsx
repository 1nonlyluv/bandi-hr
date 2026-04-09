import type { EmployeeDayRecord } from "../types";

type Props = {
  rows: EmployeeDayRecord[];
  mode: "work" | "off";
  emptyText: string;
};

export function RosterTable({ rows, mode, emptyText }: Props) {
  if (!rows.length) {
    return <p className="detail-empty">{emptyText}</p>;
  }

  return (
    <table className="off-table">
      <thead>
        <tr>
          <th>이름</th>
          <th>직위</th>
          <th>소속</th>
          {mode === "off" ? <th>휴무 종류</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${mode}-${row.employeeId}-${row.rawCode}-${row.leaveType ?? "none"}`}>
            <td>{row.name}</td>
            <td>{row.position || "-"}</td>
            <td>{row.groupName || "-"}</td>
            {mode === "off" ? <td>{row.leaveType ?? "-"}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
