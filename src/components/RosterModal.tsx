import { useEffect } from "react";
import { RosterTable } from "./RosterTable";
import type { EmployeeDayRecord } from "../types";

type Props = {
  title: string;
  subtitle: string;
  rows: EmployeeDayRecord[];
  mode: "work" | "off";
  emptyText: string;
  isOpen: boolean;
  onClose: () => void;
};

export function RosterModal({ title, subtitle, rows, mode, emptyText, isOpen, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{subtitle}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            닫기
          </button>
        </div>
        <RosterTable rows={rows} mode={mode} emptyText={emptyText} />
      </section>
    </div>
  );
}
