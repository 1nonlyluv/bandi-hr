from __future__ import annotations

import io
from datetime import datetime
from html import escape
from pathlib import Path
import re
from typing import Any
from urllib.parse import quote
import zipfile
from xml.etree import ElementTree as ET

from shuttle_schedule_parser import (
    ANY_VEHICLE_PATTERN,
    COMPACT_LEFT_SIDE,
    COMPACT_RIGHT_SIDE,
    LEFT_SIDE,
    RIGHT_SIDE,
    VALID_VEHICLES,
    XlsxSheet,
    workbook_sheet_refs,
    normalize_text,
    split_ref,
)


NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def active_count(entries: list[dict[str, Any]]) -> int:
    return sum(1 for entry in entries if not entry.get("absent"))


def flatten_rounds(rounds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [entry for round_data in rounds for entry in round_data.get("entries", [])]


def format_time(value: str | None, absent: bool) -> str:
    if absent:
        return "결석"
    if not value:
        return "-"
    if value == "결석":
        return "결석"
    if re.fullmatch(r"\d{2}:\d{2}", value):
        hour, minute = value.split(":")
        return f"{int(hour)}시 {minute}분"
    return value


def sheet_time_value(entry: dict[str, Any]) -> str | None:
    if entry.get("absent"):
        return "결석"
    return entry.get("time")


def safe_sheet_name(value: str) -> str:
    name = re.sub(r"[\\/*?:\[\]]", "_", value).strip() or "Sheet"
    return name[:31]


def rows_for_vehicle_sheet(vehicle: dict[str, Any], include_title: bool = True) -> list[list[Any]]:
    pickup_entries = flatten_rounds(vehicle["pickup_rounds"])
    dropoff_entries = flatten_rounds(vehicle["dropoff_rounds"])
    rows: list[list[Any]] = []
    if include_title:
      rows.append([vehicle["display_name"], "", "", "", "", "", vehicle["vehicle_type"], vehicle["vehicle_number"]])
      rows.append(["보험사", vehicle["insurance_company"], "", "", "", "", "전화번호", vehicle["insurance_phone"]])
      rows.append(
          [
              "등영 운전자",
              vehicle["pickup_assignment"].get("driver") or "-",
              "등영 동승자",
              vehicle["pickup_assignment"].get("companion") or "-",
              "",
              "송영 운전자",
              vehicle["dropoff_assignment"].get("driver") or "-",
              "송영 동승자",
              vehicle["dropoff_assignment"].get("companion") or "-",
          ]
      )
      rows.append([])

    rows.append(["등영", "", "", "", "", "송영", "", "", "", ""])
    rows.append(["순번", "성명", "시간", "비고", "주소", "순번", "성명", "시간", "비고", "주소"])
    max_length = max(len(pickup_entries), len(dropoff_entries), 1)
    for index in range(max_length):
        left = pickup_entries[index] if index < len(pickup_entries) else None
        right = dropoff_entries[index] if index < len(dropoff_entries) else None
        rows.append(
            [
                left.get("sequence") if left else "",
                left.get("name") if left else "",
                format_time(left.get("time"), bool(left and left.get("absent"))) if left else "",
                left.get("note") if left else "",
                left.get("address") if left else "",
                right.get("sequence") if right else "",
                right.get("name") if right else "",
                format_time(right.get("time"), bool(right and right.get("absent"))) if right else "",
                right.get("note") if right else "",
                right.get("address") if right else "",
            ]
        )

    rows.append([])
    rows.append(["등영 인원", active_count(pickup_entries), "", "", "", "송영 인원", active_count(dropoff_entries)])
    return rows


def rows_for_self_section(data: dict[str, Any], key: str, title: str) -> list[list[Any]]:
    rows = [[title], ["순번", "성명", "시간", "비고", "주소"]]
    for entry in data[key]["entries"]:
        rows.append(
            [
                entry.get("sequence"),
                entry.get("name"),
                format_time(entry.get("time"), bool(entry.get("absent"))),
                entry.get("note"),
                entry.get("address"),
            ]
        )
    if len(rows) == 2:
        rows.append(["", "명단 없음"])
    rows.append(["인원", active_count(data[key]["entries"])])
    return rows


def rows_for_long_term(data: dict[str, Any]) -> list[list[Any]]:
    rows = [["장기 결석"], ["순번", "성명", "시간", "비고", "주소"]]
    for entry in data.get("long_term_absences", []):
        rows.append(
            [
                entry.get("sequence"),
                entry.get("name"),
                format_time(entry.get("time"), bool(entry.get("absent"))),
                entry.get("note"),
                entry.get("address"),
            ]
        )
    if len(rows) == 2:
        rows.append(["", "명단 없음"])
    return rows


def build_all_sheet_rows(data: dict[str, Any]) -> list[list[Any]]:
    rows: list[list[Any]] = []
    rows.append(["오늘의 셔틀 운행표"])
    rows.append(["시트명", data.get("sheet_name") or "-"])
    rows.append(["등영 전체 인원", sum(active_count(flatten_rounds(vehicle["pickup_rounds"])) for vehicle in data["vehicles"]) + active_count(data["self_pickup"]["entries"]), "", "", "", "송영 전체 인원", sum(active_count(flatten_rounds(vehicle["dropoff_rounds"])) for vehicle in data["vehicles"]) + active_count(data["self_dropoff"]["entries"])])
    rows.append([])
    for vehicle in data["vehicles"]:
        rows.extend(rows_for_vehicle_sheet(vehicle))
        rows.append([])
    rows.extend(rows_for_self_section(data, "self_pickup", "자가 등영"))
    rows.append([])
    rows.extend(rows_for_self_section(data, "self_dropoff", "자가 송영"))
    rows.append([])
    rows.extend(rows_for_long_term(data))
    return rows


def col_letter(index: int) -> str:
    value = ""
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        value = chr(65 + remainder) + value
    return value


def cell_xml(ref: str, value: Any) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f'<c r="{ref}"><v>{value}</v></c>'
    text = escape(str(value))
    return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>'


def sheet_xml(rows: list[list[Any]], widths: list[int] | None = None) -> str:
    max_columns = max((len(row) for row in rows), default=1)
    dimension = f"A1:{col_letter(max_columns)}{max(len(rows), 1)}"
    cols_xml = ""
    if widths:
        col_defs = []
        for idx, width in enumerate(widths, start=1):
            col_defs.append(f'<col min="{idx}" max="{idx}" width="{width}" customWidth="1"/>')
        cols_xml = f"<cols>{''.join(col_defs)}</cols>"
    row_xml = []
    for row_index, row in enumerate(rows, start=1):
        cells = [cell_xml(f"{col_letter(col_index)}{row_index}", value) for col_index, value in enumerate(row, start=1)]
        row_xml.append(f'<row r="{row_index}">{"".join(cell for cell in cells if cell)}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="{dimension}"/>'
        f"{cols_xml}"
        f'<sheetData>{"".join(row_xml)}</sheetData>'
        "</worksheet>"
    )


def workbook_xml(sheet_names: list[str]) -> str:
    sheets = []
    for index, name in enumerate(sheet_names, start=1):
        sheets.append(
            f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{"".join(sheets)}</sheets>'
        "</workbook>"
    )


def workbook_rels_xml(sheet_count: int) -> str:
    rels = []
    for index in range(1, sheet_count + 1):
        rels.append(
            f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        )
    rels.append(
        f'<Relationship Id="rId{sheet_count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'{"".join(rels)}'
        "</Relationships>"
    )


def content_types_xml(sheet_count: int) -> str:
    overrides = [
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    ]
    for index in range(1, sheet_count + 1):
        overrides.append(
            f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'{"".join(overrides)}'
        "</Types>"
    )


def root_rels_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        "</Relationships>"
    )


def styles_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        "</styleSheet>"
    )


def core_xml() -> str:
    timestamp = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" '
        'xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:dcmitype="http://purl.org/dc/dcmitype/" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        '<dc:creator>Codex</dc:creator>'
        '<cp:lastModifiedBy>Codex</cp:lastModifiedBy>'
        f'<dcterms:created xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:created>'
        f'<dcterms:modified xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:modified>'
        "</cp:coreProperties>"
    )


def app_xml(sheet_names: list[str]) -> str:
    titles = "".join(f"<vt:lpstr>{escape(name)}</vt:lpstr>" for name in sheet_names)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
        '<Application>Codex</Application>'
        f'<TitlesOfParts><vt:vector size="{len(sheet_names)}" baseType="lpstr">{titles}</vt:vector></TitlesOfParts>'
        f'<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>{len(sheet_names)}</vt:i4></vt:variant></vt:vector></HeadingPairs>'
        "</Properties>"
    )


def build_xlsx_bytes(sheets: list[tuple[str, list[list[Any]]]]) -> bytes:
    sheet_names = [safe_sheet_name(name) for name, _ in sheets]
    widths = [8, 14, 12, 18, 34, 8, 14, 12, 18, 34]
    output = Path("/tmp") / "shuttle-export.xlsx"
    if output.exists():
        output.unlink()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types_xml(len(sheets)))
        archive.writestr("_rels/.rels", root_rels_xml())
        archive.writestr("xl/workbook.xml", workbook_xml(sheet_names))
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml(len(sheets)))
        archive.writestr("xl/styles.xml", styles_xml())
        archive.writestr("docProps/core.xml", core_xml())
        archive.writestr("docProps/app.xml", app_xml(sheet_names))
        for index, (_name, rows) in enumerate(sheets, start=1):
            archive.writestr(f"xl/worksheets/sheet{index}.xml", sheet_xml(rows, widths))
    return output.read_bytes()


def export_workbook(schedule_data: dict[str, Any], scope: str) -> bytes:
    if scope == "vehicle":
        sheets = [(vehicle["vehicle_name"], rows_for_vehicle_sheet(vehicle)) for vehicle in schedule_data["vehicles"]]
    else:
        sheets = [("등송영표", build_all_sheet_rows(schedule_data))]
    return build_xlsx_bytes(sheets)


def export_response_filename(source_file: str, kind: str, scope: str) -> str:
    stem = Path(source_file).stem or "등송영표_sample"
    parts = [stem]
    if kind == "edited":
        parts.append("수정본")
    if scope == "vehicle":
        parts.append("호차별")
    return "_".join(parts) + ".xlsx"


def content_disposition(filename: str) -> str:
    quoted = quote(filename)
    return f"attachment; filename*=UTF-8''{quoted}"


def detect_vehicle_headers(source_xlsx: str | Path, *, sheet_name: str | None = None, sheet_path: str | None = None) -> list[tuple[int, str]]:
    workbook = XlsxSheet(Path(source_xlsx), sheet_name=sheet_name, sheet_path=sheet_path)
    headers: list[tuple[int, str]] = []
    for row in range(1, workbook.max_row + 1):
        vehicle_name = normalize_text(workbook.value(f"B{row}", merged=False))
        if ANY_VEHICLE_PATTERN.match(vehicle_name) and vehicle_name in VALID_VEHICLES:
            headers.append((row, vehicle_name))
    return headers


def sides_for_layout(layout_name: str | None) -> tuple[Any, Any, str, str]:
    if layout_name == "compact":
        return COMPACT_LEFT_SIDE, COMPACT_RIGHT_SIDE, "C146", "D146"
    return LEFT_SIDE, RIGHT_SIDE, "F146", "G146"


class SheetEditor:
    def __init__(self, root: ET.Element) -> None:
        self.root = root
        self.sheet_data = root.find("a:sheetData", NS)
        if self.sheet_data is None:
            raise ValueError("sheetData not found")

    def _find_row(self, row_number: int) -> ET.Element | None:
        for row in self.sheet_data.findall("a:row", NS):
            if int(row.attrib.get("r", "0")) == row_number:
                return row
        return None

    def _ensure_row(self, row_number: int) -> ET.Element:
        row = self._find_row(row_number)
        if row is not None:
            return row
        row = ET.Element(f"{{{MAIN_NS}}}row", {"r": str(row_number)})
        inserted = False
        for index, existing in enumerate(self.sheet_data.findall("a:row", NS)):
            existing_number = int(existing.attrib.get("r", "0"))
            if existing_number > row_number:
                self.sheet_data.insert(index, row)
                inserted = True
                break
        if not inserted:
            self.sheet_data.append(row)
        return row

    def _find_cell(self, ref: str) -> ET.Element | None:
        _col, row_number = split_ref(ref)
        row = self._find_row(row_number)
        if row is None:
            return None
        for cell in row.findall("a:c", NS):
            if cell.attrib.get("r") == ref:
                return cell
        return None

    def _ensure_cell(self, ref: str) -> ET.Element:
        cell = self._find_cell(ref)
        if cell is not None:
            return cell
        _col, row_number = split_ref(ref)
        row = self._ensure_row(row_number)
        cell = ET.Element(f"{{{MAIN_NS}}}c", {"r": ref})
        row.append(cell)
        return cell

    def clear(self, ref: str) -> None:
        cell = self._find_cell(ref)
        if cell is None:
            return
        cell.attrib.pop("t", None)
        for child in list(cell):
            cell.remove(child)

    def set_text(self, ref: str, value: str | None) -> None:
        if value is None or value == "":
            self.clear(ref)
            return
        cell = self._ensure_cell(ref)
        cell.attrib["t"] = "inlineStr"
        for child in list(cell):
            cell.remove(child)
        is_node = ET.SubElement(cell, f"{{{MAIN_NS}}}is")
        t_node = ET.SubElement(is_node, f"{{{MAIN_NS}}}t")
        if value[:1].isspace() or value[-1:].isspace():
            t_node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t_node.text = value

    def set_number(self, ref: str, value: int | None) -> None:
        if value is None:
            self.clear(ref)
            return
        cell = self._ensure_cell(ref)
        cell.attrib.pop("t", None)
        for child in list(cell):
            cell.remove(child)
        v_node = ET.SubElement(cell, f"{{{MAIN_NS}}}v")
        v_node.text = str(value)


def assign_rows_for_rounds(original_rounds: list[dict[str, Any]], current_rounds: list[dict[str, Any]], start_row: int, end_row: int) -> dict[int, dict[str, Any]]:
    round_rows = [[entry["row"] for entry in round_data.get("entries", [])] for round_data in original_rounds]
    remaining = [row for row in range(start_row, end_row + 1) if all(row not in rows for rows in round_rows)]
    assignments: dict[int, dict[str, Any]] = {}
    used_rows: set[int] = set()

    for index, round_data in enumerate(current_rounds):
        rows = list(round_rows[index]) if index < len(round_rows) else []
        entries = round_data.get("entries", [])
        while len(rows) < len(entries) and remaining:
            rows.append(remaining.pop(0))
        for entry, row in zip(entries, rows):
            assignments[row] = entry
            used_rows.add(row)

    return assignments


def write_side(editor: SheetEditor, original_vehicle: dict[str, Any], current_vehicle: dict[str, Any], header_row: int, end_row: int, side_key: str, layout_name: str | None) -> None:
    left_side, right_side, _pickup_total_ref, _dropoff_total_ref = sides_for_layout(layout_name)
    side = left_side if side_key == "pickup" else right_side
    rounds_key = f"{side_key}_rounds"
    assignment_key = f"{side_key}_assignment"
    count_col = left_side.count_col if side_key == "pickup" else right_side.count_col

    editor.set_text(f"{side.header_person_col}{header_row}", current_vehicle[assignment_key].get("driver"))
    editor.set_text(f"{side.header_person_col}{header_row + 1}", current_vehicle[assignment_key].get("companion"))
    editor.set_number(f"{count_col}{header_row}", active_count(flatten_rounds(current_vehicle[rounds_key])))

    row_assignments = assign_rows_for_rounds(original_vehicle[rounds_key], current_vehicle[rounds_key], header_row + 2, end_row)
    data_columns = [side.seq_col, side.name_col, side.driver_col, side.companion_col, side.time_col, side.note_col, side.address_col]
    for row in range(header_row + 2, end_row + 1):
        for col in data_columns:
            editor.clear(f"{col}{row}")
        entry = row_assignments.get(row)
        if not entry:
            continue
        editor.set_number(f"{side.seq_col}{row}", entry.get("sequence"))
        editor.set_text(f"{side.name_col}{row}", entry.get("name"))
        editor.set_text(f"{side.driver_col}{row}", entry.get("driver"))
        editor.set_text(f"{side.companion_col}{row}", entry.get("companion"))
        editor.set_text(f"{side.time_col}{row}", sheet_time_value(entry))
        editor.set_text(f"{side.note_col}{row}", entry.get("note"))
        editor.set_text(f"{side.address_col}{row}", entry.get("address"))


def write_self_table(editor: SheetEditor, entries: list[dict[str, Any]], side_key: str, layout_name: str | None) -> None:
    left_side, right_side, _pickup_total_ref, _dropoff_total_ref = sides_for_layout(layout_name)
    side = left_side if side_key == "pickup" else right_side
    start_row = 123
    end_row = 133
    for row in range(start_row, end_row + 1):
        for col in [side.seq_col, side.name_col, side.driver_col, side.companion_col, side.time_col, side.note_col, side.address_col]:
            editor.clear(f"{col}{row}")
    for row, entry in zip(range(start_row, end_row + 1), entries):
        editor.set_number(f"{side.seq_col}{row}", entry.get("sequence"))
        editor.set_text(f"{side.name_col}{row}", entry.get("name"))
        editor.set_text(f"{side.time_col}{row}", sheet_time_value(entry))
        editor.set_text(f"{side.note_col}{row}", entry.get("note"))
        editor.set_text(f"{side.address_col}{row}", entry.get("address"))


def export_template_workbook(source_xlsx: str | Path, schedule_data: dict[str, Any]) -> bytes:
    source_path = Path(source_xlsx)
    sheet_name = schedule_data.get("sheet_name")
    sheet_path = schedule_data.get("source_sheet_path")
    layout_name = schedule_data.get("layout_name")
    _left_side, _right_side, pickup_total_ref, dropoff_total_ref = sides_for_layout(layout_name)
    header_rows = detect_vehicle_headers(source_path, sheet_name=sheet_name, sheet_path=sheet_path)
    worksheet_path = sheet_path if isinstance(sheet_path, str) and sheet_path else "xl/worksheets/sheet1.xml"
    with zipfile.ZipFile(source_path) as source_zip:
        sheet_root = ET.fromstring(source_zip.read(worksheet_path))
        editor = SheetEditor(sheet_root)
        ET.register_namespace("", MAIN_NS)

        current_lookup = {vehicle["vehicle_name"]: vehicle for vehicle in schedule_data["vehicles"]}
        original_lookup = {
            vehicle["vehicle_name"]: vehicle
            for vehicle in parse_original_schedule(source_path, sheet_name=sheet_name, sheet_path=sheet_path)["vehicles"]
        }
        for index, (header_row, vehicle_name) in enumerate(header_rows):
            next_header = header_rows[index + 1][0] if index + 1 < len(header_rows) else 120
            current_vehicle = current_lookup[vehicle_name]
            original_vehicle = original_lookup[vehicle_name]
            write_side(editor, original_vehicle, current_vehicle, header_row, next_header - 1, "pickup", layout_name)
            write_side(editor, original_vehicle, current_vehicle, header_row, next_header - 1, "dropoff", layout_name)

        write_self_table(editor, schedule_data["self_pickup"]["entries"], "pickup", layout_name)
        write_self_table(editor, schedule_data["self_dropoff"]["entries"], "dropoff", layout_name)
        editor.set_number(pickup_total_ref, sum(active_count(flatten_rounds(vehicle["pickup_rounds"])) for vehicle in schedule_data["vehicles"]) + active_count(schedule_data["self_pickup"]["entries"]))
        editor.set_number(dropoff_total_ref, sum(active_count(flatten_rounds(vehicle["dropoff_rounds"])) for vehicle in schedule_data["vehicles"]) + active_count(schedule_data["self_dropoff"]["entries"]))

        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for item in source_zip.infolist():
                if item.filename == "xl/calcChain.xml":
                    continue
                if item.filename == worksheet_path:
                    archive.writestr(item, ET.tostring(sheet_root, encoding="utf-8", xml_declaration=True))
                elif item.filename in {"[Content_Types].xml", "xl/_rels/workbook.xml.rels"}:
                    archive.writestr(item, remove_calc_chain_references(source_zip.read(item.filename), item.filename))
                else:
                    archive.writestr(item, source_zip.read(item.filename))
        return output.getvalue()


def parse_original_schedule(source_xlsx: str | Path, *, sheet_name: str | None = None, sheet_path: str | None = None) -> dict[str, Any]:
    from shuttle_schedule_parser import parse_schedule

    return parse_schedule(source_xlsx, sheet_name=sheet_name, sheet_path=sheet_path)


def remove_calc_chain_references(content: bytes, filename: str) -> bytes:
    if filename not in {"[Content_Types].xml", "xl/_rels/workbook.xml.rels"}:
        return content
    root = ET.fromstring(content)
    if filename == "[Content_Types].xml":
        for node in list(root):
            if node.attrib.get("PartName") == "/xl/calcChain.xml":
                root.remove(node)
    else:
        for node in list(root):
            if node.attrib.get("Type", "").endswith("/calcChain"):
                root.remove(node)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)
