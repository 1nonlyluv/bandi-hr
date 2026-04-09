from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import time

from build_shuttle_webapp import (
    DEFAULT_ADMIN_LABEL,
    DEFAULT_ADMIN_PIN,
    build_webapp,
    collect_schedule_files,
    is_monthly_schedule_workbook,
    monthly_workbook_sort_key,
)


DEFAULT_OUTPUT = "webapp/index.html"


@dataclass(frozen=True)
class FileStamp:
    size: int
    mtime_ns: int


def default_source_path() -> str:
    monthly_files = [
        path
        for path in sorted(Path.cwd().glob("*.xlsx"), key=monthly_workbook_sort_key)
        if is_monthly_schedule_workbook(path)
    ]
    if monthly_files:
        return monthly_files[-1].name
    return "등송영표 3월.xlsx"


DEFAULT_SOURCE = default_source_path()


def current_stamp(path: Path) -> FileStamp | None:
    try:
        stat = path.stat()
    except FileNotFoundError:
        return None
    return FileStamp(size=stat.st_size, mtime_ns=stat.st_mtime_ns)


def current_stamps(source_path: str | Path) -> dict[Path, FileStamp]:
    stamps: dict[Path, FileStamp] = {}
    for path in collect_schedule_files(source_path):
        stamp = current_stamp(path)
        if stamp is not None:
            stamps[path] = stamp
    return stamps


def wait_for_stable_files(source_path: str | Path, *, settle_seconds: float, poll_seconds: float) -> dict[Path, FileStamp]:
    stable_for = 0.0
    previous = current_stamps(source_path)
    while True:
        time.sleep(poll_seconds)
        current = current_stamps(source_path)
        if current == previous and current:
            stable_for += poll_seconds
            if stable_for >= settle_seconds:
                return current
        else:
            stable_for = 0.0
            previous = current


def wait_for_stable_file(path: Path, *, settle_seconds: float, poll_seconds: float) -> FileStamp | None:
    settled = wait_for_stable_files(path, settle_seconds=settle_seconds, poll_seconds=poll_seconds)
    return settled.get(path.resolve())


def watch_and_rebuild(
    source_path: str | Path,
    output_path: str | Path,
    *,
    admin_pin: str = DEFAULT_ADMIN_PIN,
    admin_label: str = DEFAULT_ADMIN_LABEL,
    interval_seconds: float = 2.0,
    settle_seconds: float = 2.0,
    build_on_start: bool = True,
) -> None:
    source = Path(source_path).resolve()
    output = Path(output_path).resolve()
    print(f"[watch] source={source}")
    print(f"[watch] output={output}")
    print(f"[watch] watching {len(collect_schedule_files(source))} workbook(s)")

    last_built_stamps: dict[Path, FileStamp] = {}
    if build_on_start and current_stamps(source):
        build_webapp(source, output, admin_pin=admin_pin, admin_label=admin_label)
        last_built_stamps = current_stamps(source)
        print(f"[watch] initial build complete: {output}")

    while True:
        stamps = current_stamps(source)
        if not stamps:
            time.sleep(interval_seconds)
            continue
        if stamps != last_built_stamps:
            print("[watch] change detected, waiting for file to settle...")
            settled = wait_for_stable_files(source, settle_seconds=settle_seconds, poll_seconds=min(interval_seconds, 0.5))
            try:
                build_webapp(source, output, admin_pin=admin_pin, admin_label=admin_label)
            except Exception as error:  # noqa: BLE001
                print(f"[watch] rebuild failed: {error}")
                last_built_stamps = settled
            else:
                last_built_stamps = settled
                print(f"[watch] rebuild complete: {output}")
        time.sleep(interval_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(description="Watch the shuttle workbook and rebuild the webapp on changes.")
    parser.add_argument(
        "xlsx_path",
        nargs="?",
        default=DEFAULT_SOURCE,
        help="Workbook path to watch. Defaults to '등송영표 3월.xlsx'.",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help="HTML output path. Defaults to webapp/index.html",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="Polling interval in seconds. Defaults to 2.0.",
    )
    parser.add_argument(
        "--settle",
        type=float,
        default=2.0,
        help="Required stable time after a detected change before rebuilding. Defaults to 2.0.",
    )
    parser.add_argument(
        "--skip-initial-build",
        action="store_true",
        help="Do not rebuild immediately on startup.",
    )
    parser.add_argument(
        "--admin-pin",
        default=DEFAULT_ADMIN_PIN,
        help="Admin PIN passed through to the webapp build.",
    )
    parser.add_argument(
        "--admin-label",
        default=DEFAULT_ADMIN_LABEL,
        help="Admin label passed through to the webapp build.",
    )
    args = parser.parse_args()
    watch_and_rebuild(
        args.xlsx_path,
        args.output,
        admin_pin=args.admin_pin,
        admin_label=args.admin_label,
        interval_seconds=args.interval,
        settle_seconds=args.settle,
        build_on_start=not args.skip_initial_build,
    )


if __name__ == "__main__":
    main()
