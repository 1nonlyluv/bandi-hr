from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from program_schedule_normalizer import normalize_payload
from program_schedule_parser import parse_program_workbook


WEEK_LABEL_PATTERN = re.compile(r"(\d+)\s*월\s*(\d+)\s*주차")


def autodetect_workbook_path(base_dir: str | Path = ".") -> Path:
    root = Path(base_dir)
    candidates = sorted(root.glob("*2026*.xlsx"))
    preferred = [path for path in candidates if "(2026)" in path.name]
    picked = preferred[0] if preferred else (candidates[0] if candidates else None)
    if picked is None:
        raise FileNotFoundError("No 2026 workbook .xlsx file found.")
    return picked


def autodetect_workbook_paths(base_dir: str | Path = ".") -> list[Path]:
    root = Path(base_dir)
    return sorted(
        path
        for path in root.glob("*.xlsx")
        if not path.name.startswith("~$")
        and "주간프로그램" in path.name
        and "계획" in path.name
    )


def expected_label_from_filename(path: str | Path) -> str:
    match = WEEK_LABEL_PATTERN.search(Path(path).stem)
    if not match:
        return ""
    return f"{int(match.group(1))}월 {int(match.group(2))}주차"


def should_keep_payload_for_file(payload: dict, workbook_path: str | Path) -> bool:
    expected_label = expected_label_from_filename(workbook_path)
    if not expected_label:
        return True
    source_label = payload.get("meta", {}).get("sourceLabel", "")
    return source_label == expected_label


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
        if not should_keep_payload_for_file(payload, workbook_path):
            continue
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


def build_all_workbook_jsons(
    workbook_paths: list[str | Path],
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
    for workbook_path in workbook_paths:
        written_paths.extend(
            build_workbook_jsons(
                workbook_path,
                output_dir=output_root,
                prefix=prefix,
                clean=False,
            )
        )
    return sorted(set(written_paths))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build weekly program JSON files from program schedule XLSX workbooks.")
    parser.add_argument("xlsx_path", nargs="*", help="Source XLSX workbook path(s). If omitted, auto-detect program workbooks in the current directory.")
    parser.add_argument("--output-dir", default="data/generated", help="Directory to write JSON files into.")
    parser.add_argument("--prefix", default="program_schedule_workbook_", help="Filename prefix for generated JSON files.")
    parser.add_argument("--no-clean", action="store_true", help="Do not remove previous generated files with the same prefix.")
    args = parser.parse_args()

    workbook_paths = [Path(path) for path in args.xlsx_path] if args.xlsx_path else autodetect_workbook_paths(".")
    if not workbook_paths:
        workbook_paths = [autodetect_workbook_path(".")]

    written_paths = build_all_workbook_jsons(
        workbook_paths,
        output_dir=args.output_dir,
        prefix=args.prefix,
        clean=not args.no_clean,
    )
    for path in written_paths:
        print(path)


if __name__ == "__main__":
    main()
