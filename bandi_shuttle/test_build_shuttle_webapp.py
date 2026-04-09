import tempfile
import unittest
from datetime import date
from pathlib import Path
import re
import json

from build_shuttle_webapp import build_schedule_bundle, build_webapp, render_html
from shuttle_schedule_parser import parse_schedule


ROOT = Path(__file__).resolve().parent
SAMPLE = ROOT / "등송영표_sample.xlsx"
ALT = ROOT / "등송영표(3월18일).xlsx"
MARCH = ROOT / "등송영표 3월.xlsx"


class ShuttleWebAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.bundle, cls.parsed = build_schedule_bundle(SAMPLE)
        cls.html = render_html(cls.parsed, schedule_bundle=cls.bundle)

    def test_renders_key_sections(self) -> None:
        self.assertIn("brand-text\">반디<", self.html)
        self.assertIn("./반디로고.png", self.html)
        self.assertIn('href="./index.html"', self.html)
        self.assertIn("menu-toggle", self.html)
        self.assertIn("menu-panel", self.html)
        self.assertIn("등영", self.html)
        self.assertIn("송영", self.html)
        self.assertIn("자가 등영", self.html)
        self.assertIn("자가 송영", self.html)
        self.assertIn("월별 캘린더", self.html)
        self.assertIn("hero-date-display", self.html)
        self.assertIn("mobile-side-tabs", self.html)
        self.assertIn("mobile-side-tab", self.html)
        self.assertIn("관리자 로그인", self.html)
        self.assertIn("원본 내보내기", self.html)
        self.assertIn("수정본 내보내기", self.html)
        self.assertIn("수정 초기화", self.html)
        self.assertIn('id="resident-search"', self.html)
        self.assertIn("어르신 찾기", self.html)

    def test_renders_vehicle_metadata_and_schedule_text(self) -> None:
        self.assertIn("1호차", self.html)
        self.assertIn("716호1749", self.html)
        self.assertIn("현대캐피탈", self.html)
        self.assertIn("스케줄 보기", self.html)
        self.assertIn("차량 출발 순서", self.html)
        self.assertIn("entry-card ${entry.absent ? \"is-absent\" : \"\"}", self.html)
        self.assertIn("function updateEntryFromForm", self.html)
        self.assertIn("function updateAssignmentFromForm", self.html)
        self.assertIn("downloadExport", self.html)
        self.assertIn("./export", self.html)
        self.assertIn("assignment-driver", self.html)
        self.assertIn("assignmentOptionsMarkup", self.html)
        self.assertIn("결석 ${card.absentCount}명", self.html)
        self.assertIn("${card.roundCount}회차", self.html)
        self.assertIn('data-action="set-mobile-side"', self.html)
        self.assertIn("담당자 적용", self.html)
        self.assertIn("self_pickup", self.html)
        self.assertIn("self_dropoff", self.html)
        self.assertIn("function markOppositeSideAbsentByName", self.html)
        self.assertIn("appDialog.addEventListener(\"change\"", self.html)
        self.assertIn("formatClock(entry.time)", self.html)
        self.assertIn("RESIDENT_NAMES", self.html)
        self.assertIn("function openResidentSearch()", self.html)
        self.assertIn("open-search-result", self.html)
        self.assertNotIn("등송영표_sample.xlsx</p>", self.html)
        self.assertNotIn("등송영표 (2.13)</p>", self.html)

    def test_staff_options_follow_role_rules(self) -> None:
        driver_match = re.search(r"driver:\s*(\[[^\]]+\])", self.html)
        companion_match = re.search(r"companion:\s*(\[[^\]]+\])", self.html)
        self.assertIsNotNone(driver_match)
        self.assertIsNotNone(companion_match)
        driver_list = json.loads(driver_match.group(1))
        companion_list = json.loads(companion_match.group(1))
        self.assertIn("최재영", driver_list)
        self.assertIn("이기찬", driver_list)
        self.assertNotIn("김중순", driver_list)
        self.assertIn("신은희", companion_list)
        self.assertIn("강선진", companion_list)
        self.assertIn("김중순", companion_list)

    def test_embedded_schedule_json_is_parseable(self) -> None:
        match = re.search(
            r'<script id="schedule-data" type="application/json">(.*?)</script>',
            self.html,
            re.DOTALL,
        )
        self.assertIsNotNone(match)
        embedded = match.group(1)
        parsed = json.loads(embedded)
        self.assertIn("2026-02-13", parsed)
        self.assertEqual(parsed["2026-02-13"]["sheet_name"], "등송영표 (2.13)")

    def test_build_schedule_bundle_expands_multisheet_workbook(self) -> None:
        bundle, primary = build_schedule_bundle(ALT)
        self.assertIn("2026-03-17", bundle)
        self.assertIn("2026-03-18", bundle)
        self.assertEqual(primary["sheet_name"], "등송영표 (3.17)")

    def test_build_schedule_bundle_supports_year_month_day_sheet_names(self) -> None:
        bundle, _primary = build_schedule_bundle(MARCH)
        self.assertIn("2026-03-19", bundle)
        self.assertIn("2026-03-20", bundle)
        self.assertIn("2026-04-01", bundle)
        self.assertIn("2026-04-03", bundle)

    def test_builds_calendar_page(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "index.html"
            build_webapp(SAMPLE, output)
            calendar_html = output.with_name("calendar.html").read_text(encoding="utf-8")
            self.assertIn("월별 캘린더", calendar_html)
            self.assertIn("셔틀 홈", calendar_html)
            self.assertIn("month-select", calendar_html)
            self.assertIn("등영 인원", calendar_html)
            self.assertIn("./index.html?date=${selectedDate}", calendar_html)
            self.assertTrue(output.with_name("반디로고.png").exists())


if __name__ == "__main__":
    unittest.main()
