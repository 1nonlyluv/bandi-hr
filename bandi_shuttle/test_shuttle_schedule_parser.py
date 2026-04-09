import unittest
from pathlib import Path

from shuttle_schedule_parser import parse_schedule, parse_schedule_workbook


ROOT = Path(__file__).resolve().parent
SAMPLE = ROOT / "등송영표_sample.xlsx"
ALT = ROOT / "등송영표(3월18일).xlsx"
MARCH = ROOT / "등송영표 3월.xlsx"


class ShuttleScheduleParserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.parsed = parse_schedule(SAMPLE)
        cls.vehicles = {vehicle["vehicle_name"]: vehicle for vehicle in cls.parsed["vehicles"]}

    def test_vehicle_headers_and_metadata(self) -> None:
        self.assertEqual(list(self.vehicles), ["1호차", "2호차", "3호차", "4호차", "5호차", "7호차"])
        self.assertEqual(self.vehicles["1호차"]["display_name"], "1호차(716호1749)")
        self.assertEqual(self.vehicles["3호차"]["insurance_company"], "KB손해보험")
        self.assertEqual(self.vehicles["5호차"]["insurance_phone"], "1588-5656")
        self.assertEqual(self.vehicles["7호차"]["vehicle_number"], "163하3128")

    def test_top_level_metadata(self) -> None:
        self.assertEqual(self.parsed["sheet_name"], "등송영표 (2.13)")
        self.assertEqual(self.parsed["operation_order"], ["3", "1", "4", "5", "2"])
        self.assertEqual(self.parsed["dropoff_departure_minutes"], [28, 29, 30, 31, 32])
        self.assertEqual(self.parsed["dropoff_departure_base_time"], "16:29")
        self.assertEqual(self.parsed["totals"], {"pickup": 52, "dropoff": 52})

    def test_vehicle_round_splitting(self) -> None:
        vehicle1 = self.vehicles["1호차"]
        self.assertEqual(vehicle1["pickup_count"], 8)
        self.assertEqual(vehicle1["dropoff_count"], 9)
        self.assertEqual(len(vehicle1["pickup_rounds"]), 2)
        self.assertEqual(len(vehicle1["dropoff_rounds"]), 2)
        self.assertEqual(vehicle1["pickup_rounds"][0]["entries"][0]["name"], "문필남")
        self.assertEqual(vehicle1["pickup_rounds"][1]["entries"][0]["name"], "조정아")

    def test_ignores_vehicle_number_cells_and_6th_car(self) -> None:
        vehicle4 = self.vehicles["4호차"]
        self.assertEqual(vehicle4["vehicle_number"], "76호5003")
        self.assertNotIn("6호차", self.vehicles)

    def test_merged_cell_address_propagation(self) -> None:
        vehicle7 = self.vehicles["7호차"]
        last_round_entries = vehicle7["pickup_rounds"][-1]["entries"]
        self.assertEqual(last_round_entries[1]["name"], "최봉학")
        self.assertEqual(last_round_entries[2]["name"], "김영옥")
        self.assertEqual(last_round_entries[1]["address"], "교동마을 신창A 103/1403")
        self.assertEqual(last_round_entries[2]["address"], "교동마을 신창A 103/1403")

    def test_self_transport_and_long_term_absence_sections(self) -> None:
        self.assertEqual(self.parsed["self_pickup"]["entries"][0]["name"], "차의로")
        self.assertEqual(self.parsed["self_pickup"]["entries"][0]["time"], "자가")
        self.assertEqual(self.parsed["self_dropoff"]["entries"][1]["name"], "이기본")
        self.assertEqual(self.parsed["long_term_absences"][0]["name"], "이건희")
        self.assertEqual(self.parsed["long_term_absences"][-1]["name"], "박수암")

    def test_emphasis_detection(self) -> None:
        vehicle2 = self.vehicles["2호차"]
        highlighted_pickup = vehicle2["pickup_rounds"][0]["entries"][0]
        self.assertTrue(highlighted_pickup["emphasis"])
        self.assertIn("H", highlighted_pickup["emphasis_columns"])


class AlternateScheduleParserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        workbook_sheets = {item["sheet_name"]: item for item in parse_schedule_workbook(ALT)}
        cls.parsed_317 = workbook_sheets["등송영표 (3.17)"]
        cls.parsed_318 = workbook_sheets["등송영표 (3.18)"]
        cls.vehicles_317 = {vehicle["vehicle_name"]: vehicle for vehicle in cls.parsed_317["vehicles"]}
        cls.vehicles_318 = {vehicle["vehicle_name"]: vehicle for vehicle in cls.parsed_318["vehicles"]}

    def test_parses_compact_workbook_sheets(self) -> None:
        self.assertEqual(self.parsed_317["layout_name"], "compact")
        self.assertEqual(self.parsed_318["layout_name"], "compact")
        self.assertTrue(self.parsed_317["source_sheet_path"].endswith("sheet1.xml"))
        self.assertTrue(self.parsed_318["source_sheet_path"].endswith("sheet2.xml"))

    def test_parses_shifted_self_section_and_totals(self) -> None:
        self.assertEqual(self.parsed_318["self_pickup"]["entries"][0]["name"], "차의로")
        self.assertEqual(self.parsed_318["self_pickup"]["entries"][0]["time"], "자가")
        self.assertEqual(self.parsed_318["self_dropoff"]["entries"][0]["name"], "차의로")
        self.assertEqual(self.parsed_318["long_term_absences"][-1]["name"], "양초자")
        self.assertEqual(self.parsed_318["totals"]["pickup"], 59)
        self.assertEqual(self.parsed_318["totals"]["dropoff"], 59)

    def test_parses_order_and_base_time_from_compact_cells(self) -> None:
        self.assertEqual(self.parsed_318["operation_order"], ["1", "3", "2", "4", "5"])
        self.assertEqual(self.parsed_318["dropoff_departure_minutes"], [28, 29, 30, 31, 32])
        self.assertEqual(self.parsed_318["dropoff_departure_base_time"], "16:28")

    def test_sheet_specific_assignments_are_distinct(self) -> None:
        self.assertEqual(self.vehicles_318["1호차"]["pickup_assignment"]["driver"], "김용숙")
        self.assertEqual(self.vehicles_317["7호차"]["pickup_assignment"]["driver"], "이기찬")
        self.assertEqual(self.vehicles_318["7호차"]["pickup_assignment"]["driver"], "박정희")
        self.assertEqual(self.vehicles_317["7호차"]["dropoff_assignment"]["driver"], "최재영")
        self.assertEqual(self.vehicles_318["7호차"]["dropoff_assignment"]["driver"], "김경애")


class MarchWorkbookParserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        workbook_sheets = {item["sheet_name"]: item for item in parse_schedule_workbook(MARCH)}
        cls.parsed_319 = workbook_sheets["등송영표 (26.3.19)"]
        cls.parsed_320 = workbook_sheets["등송영표 (26.3.20)"]
        cls.vehicles_320 = {vehicle["vehicle_name"]: vehicle for vehicle in cls.parsed_320["vehicles"]}

    def test_new_sheet_name_pattern_is_preserved(self) -> None:
        self.assertEqual(self.parsed_319["sheet_name"], "등송영표 (26.3.19)")
        self.assertEqual(self.parsed_320["sheet_name"], "등송영표 (26.3.20)")

    def test_round_specific_companion_is_parsed(self) -> None:
        vehicle3 = self.vehicles_320["3호차"]
        self.assertEqual(vehicle3["dropoff_assignment"]["companion"], "오주환")
        self.assertEqual(vehicle3["dropoff_assignment"]["companion_round"], 2)
        self.assertIsNone(vehicle3["pickup_assignment"]["companion_round"])


if __name__ == "__main__":
    unittest.main()
