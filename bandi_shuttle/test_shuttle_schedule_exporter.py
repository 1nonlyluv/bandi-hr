import io
import json
import unittest
import zipfile
from pathlib import Path

from shuttle_schedule_exporter import export_response_filename, export_template_workbook, export_workbook
from shuttle_schedule_parser import parse_schedule


ROOT = Path(__file__).resolve().parent
SAMPLE = ROOT / "등송영표_sample.xlsx"


class ShuttleScheduleExporterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.parsed = parse_schedule(SAMPLE)

    def test_export_workbook_all_creates_valid_xlsx_zip(self) -> None:
        content = export_workbook(self.parsed, "all")
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            names = set(archive.namelist())
            self.assertIn("[Content_Types].xml", names)
            self.assertIn("xl/workbook.xml", names)
            self.assertIn("xl/worksheets/sheet1.xml", names)
            workbook_xml = archive.read("xl/workbook.xml").decode("utf-8")
            self.assertIn("등송영표", workbook_xml)

    def test_export_workbook_vehicle_creates_multiple_sheets(self) -> None:
        content = export_workbook(self.parsed, "vehicle")
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            workbook_xml = archive.read("xl/workbook.xml").decode("utf-8")
            self.assertIn("1호차", workbook_xml)
            self.assertIn("7호차", workbook_xml)
            self.assertIn("xl/worksheets/sheet6.xml", archive.namelist())

    def test_response_filenames_follow_requested_scope(self) -> None:
        self.assertEqual(export_response_filename("등송영표_sample.xlsx", "original", "all"), "등송영표_sample.xlsx")
        self.assertEqual(export_response_filename("등송영표_sample.xlsx", "edited", "all"), "등송영표_sample_수정본.xlsx")
        self.assertEqual(export_response_filename("등송영표_sample.xlsx", "edited", "vehicle"), "등송영표_sample_수정본_호차별.xlsx")

    def test_template_export_updates_original_sheet_values(self) -> None:
        edited = json.loads(json.dumps(self.parsed))
        edited["vehicles"][0]["pickup_assignment"]["driver"] = "최재영"
        edited["vehicles"][0]["pickup_rounds"][0]["entries"][0]["name"] = "테스트어르신"
        content = export_template_workbook(SAMPLE, edited)
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            sheet_xml = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
            self.assertIn("최재영", sheet_xml)
            self.assertIn("테스트어르신", sheet_xml)
            self.assertIn("<mergeCells", sheet_xml)
            self.assertNotIn("xl/calcChain.xml", archive.namelist())
            workbook_rels = archive.read("xl/_rels/workbook.xml.rels").decode("utf-8")
            self.assertNotIn("calcChain", workbook_rels)


if __name__ == "__main__":
    unittest.main()
