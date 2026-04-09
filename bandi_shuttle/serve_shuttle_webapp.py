from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from shuttle_schedule_exporter import content_disposition, export_response_filename, export_template_workbook, export_workbook


class ShuttleHandler(SimpleHTTPRequestHandler):
    web_root: Path

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=str(self.web_root), **kwargs)

    def do_POST(self) -> None:
        if self.path != "/export":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON")
            return

        kind = payload.get("kind")
        scope = payload.get("scope")
        if kind not in {"original", "edited"} or scope not in {"all", "vehicle"}:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid export options")
            return

        schedule_data = payload.get("data")
        source_xlsx = None
        if isinstance(schedule_data, dict):
            source_file = schedule_data.get("source_file")
            if isinstance(source_file, str):
                candidate = Path(source_file).resolve()
                if candidate.exists() and candidate.suffix.lower() == ".xlsx":
                    source_xlsx = candidate
        if source_xlsx is None:
            self.send_error(HTTPStatus.BAD_REQUEST, "Missing source workbook")
            return

        if kind == "original" and scope == "all":
            content = source_xlsx.read_bytes()
            filename = source_xlsx.name
        else:
            if not isinstance(schedule_data, dict):
                self.send_error(HTTPStatus.BAD_REQUEST, "Missing schedule data")
                return
            if scope == "all":
                content = export_template_workbook(source_xlsx, schedule_data)
            else:
                content = export_workbook(schedule_data, scope)
            filename = export_response_filename(source_xlsx.name, kind, scope)

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.send_header("Content-Disposition", content_disposition(filename))
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve shuttle webapp with XLSX export support.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--web-root", default="webapp")
    args = parser.parse_args()

    web_root = Path(args.web_root).resolve()
    ShuttleHandler.web_root = web_root

    server = ThreadingHTTPServer((args.host, args.port), ShuttleHandler)
    try:
        print(f"Serving {web_root} on http://{args.host}:{args.port}")
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
