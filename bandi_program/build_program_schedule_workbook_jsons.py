from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from program_schedule_normalizer import normalize_payload
from program_schedule_parser import parse_program_workbook


def slugify(value: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z가-힣]+", "-", value.strip())
    return slug.strip("-") or "week"


def build_workbook_jsons(
    workbook_path: str | Path,
    *,
    output_dir: str | Path = "data/generated",
    prefix: str = "program_schedule_weektabs_",
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
        label = slugify(normalized.get("meta", {}).get("sourceLabel", ""))
        output_path = output_root / f"{prefix}{start_date}_{label}.json"
        output_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
        written_paths.append(output_path)
    return written_paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Build weekly program JSON files from all week tabs in a workbook.")
    parser.add_argument("xlsx_path", help="Source XLSX workbook path.")
    parser.add_argument("--output-dir", default="data/generated", help="Directory to write JSON files into.")
    parser.add_argument("--prefix", default="program_schedule_weektabs_", help="Filename prefix for generated JSON files.")
    parser.add_argument("--no-clean", action="store_true", help="Do not remove previous generated files with the same prefix.")
    args = parser.parse_args()

    written_paths = build_workbook_jsons(
        args.xlsx_path,
        output_dir=args.output_dir,
        prefix=args.prefix,
        clean=not args.no_clean,
    )
    for path in written_paths:
        print(path)


if __name__ == "__main__":
    main()
