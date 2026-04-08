from __future__ import annotations

import argparse
import glob
import json
from pathlib import Path

from program_schedule_normalizer import normalize_payload


def load_json(path: str | Path) -> dict:
    return normalize_payload(json.loads(Path(path).read_text(encoding="utf-8")))


def build_bundle(paths: list[str]) -> dict:
    payloads = [load_json(path) for path in paths]
    if not payloads:
        raise ValueError("No payloads provided")

    days = []
    weeks = []
    seen_week_keys: set[str] = set()

    for payload in payloads:
      label = payload.get("meta", {}).get("sourceLabel", "")
      source_days = payload.get("days", [])
      if not source_days:
          continue
      week_key = source_days[0]["date"]
      if week_key not in seen_week_keys:
          weeks.append(
              {
                  "key": week_key,
                  "label": label,
                  "startDate": source_days[0]["date"],
                  "endDate": source_days[-1]["date"],
              }
          )
          seen_week_keys.add(week_key)
      for day in source_days:
          cloned = json.loads(json.dumps(day))
          cloned["weekKey"] = week_key
          cloned["weekLabel"] = label
          days.append(cloned)

    days.sort(key=lambda item: item["date"])
    weeks.sort(key=lambda item: item["startDate"])

    base = json.loads(json.dumps(payloads[0]))
    base["meta"]["sourceLabel"] = f"{weeks[0]['label']} - {weeks[-1]['label']}" if weeks else base["meta"].get("sourceLabel", "")
    base["days"] = days
    base["weeks"] = weeks
    base["flatEntries"] = []
    for day in days:
        for block in day.get("blocks", []):
            for entry in block.get("entries", []):
                base["flatEntries"].append(
                    {
                        "id": entry["id"],
                        "date": day["date"],
                        "weekday": day["weekday"],
                        "weekKey": day["weekKey"],
                        "weekLabel": day["weekLabel"],
                        "start": block["start"],
                        "end": block["end"],
                        "startMin": block["startMin"],
                        "endMin": block["endMin"],
                        "section": block["section"],
                        "title": entry["title"],
                        "subtitle": entry["subtitle"],
                        "categoryId": entry["categoryId"],
                        "groupIds": entry["groupIds"],
                        "staff": entry["staff"],
                        "staffRole": entry["staffRole"],
                        "location": entry["location"],
                        "tags": entry["tags"],
                    }
                )
    return base


def expand_json_inputs(patterns: list[str]) -> list[str]:
    expanded: list[str] = []
    for pattern in patterns:
        matches = sorted(glob.glob(pattern))
        if matches:
            expanded.extend(matches)
        else:
            expanded.append(pattern)
    deduped: list[str] = []
    seen: set[str] = set()
    for path in expanded:
        if path in seen:
            continue
        deduped.append(path)
        seen.add(path)
    return deduped


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge weekly program JSON payloads into one bundle.")
    parser.add_argument("json_paths", nargs="+", help="Input weekly JSON files.")
    parser.add_argument("--output", default="webapp/assets/program_schedule.json", help="Output bundle path.")
    args = parser.parse_args()

    bundle = build_bundle(expand_json_inputs(args.json_paths))
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(output_path)


if __name__ == "__main__":
    main()
