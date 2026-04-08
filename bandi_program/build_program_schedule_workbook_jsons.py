from __future__ import annotations

import argparse
import json
from pathlib import Path

from program_schedule_normalizer import normalize_payload
from program_schedule_parser import parse_program_workbook


def autodetect_workbook_path(base_dir: str | Path = ".") -> Path:
    root = Path(base_dir)
    candidates = sorted(root.glob("*2026*.xlsx"))
    preferred = [path for path in candidates if "(2026)" in path.name]
    picked = preferred[0] if preferred else (candidates[0] if candidates else None)
    if picked is None:
        raise FileNotFoundError("No 2026 workbook .xlsx file found.")
    return picked


def ascii_week_suffix(value: str) -> str:
    digits = [part for part in "".join(char if char.isdigit() else " " for char in value).split() if part]
    if len(digits) >= 2:
        return f"m{digits[0]}w{digits[1]}"
    if digits:
        return f"w{digits[0]}"
    return "week"


def build_workbook_jsons(
    workbook_path: str | Path,
    *,
    output_dir: str | Path = "data/generated",
    prefix: str = "program_schedule_workbook_",
    clean: bool = True,
) -> list[Path]:
    output_root = Path(output_dir).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    if clean:
        for existing in output_root.glob(f"{prefix}*.json"):
            existing.unlink()

    written_paths: list[Path] = []
    for payload in parse_program_workbook(workbook_path):
        normalized = normalize_payload(payload)
        source_days = normalized.get("days", [])
        if not source_days:
            continue
        start_date = source_days[0]["date"]
        label = ascii_week_suffix(normalized.get("meta", {}).get("sourceLabel", ""))
        output_path = output_root / f"{prefix}{start_date}_{label}.json"
        output_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
        written_paths.append(output_path)
    return written_paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Build weekly program JSON files from all week tabs in a workbook.")
    parser.add_argument("xlsx_path", nargs="?", help="Source XLSX workbook path. If omitted, auto-detect a 2026 workbook in the current directory.")
    parser.add_argument("--output-dir", default="data/generated", help="Directory to write JSON files into.")
    parser.add_argument("--prefix", default="program_schedule_workbook_", help="Filename prefix for generated JSON files.")
    parser.add_argument("--no-clean", action="store_true", help="Do not remove previous generated files with the same prefix.")
    args = parser.parse_args()

    workbook_path = args.xlsx_path or str(autodetect_workbook_path("."))
    written_paths = build_workbook_jsons(
        workbook_path,
        output_dir=args.output_dir,
        prefix=args.prefix,
        clean=not args.no_clean,
    )
    for path in written_paths:
        print(path)


if __name__ == "__main__":
    main()
