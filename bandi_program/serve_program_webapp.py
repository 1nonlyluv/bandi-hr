from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class ProgramHandler(SimpleHTTPRequestHandler):
    web_root: Path

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=str(self.web_root), **kwargs)


def main() -> None:
    parser = argparse.ArgumentParser(description='Serve program webapp.')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8001)
    parser.add_argument('--web-root', default='webapp')
    args = parser.parse_args()

    ProgramHandler.web_root = Path(args.web_root).resolve()
    server = ThreadingHTTPServer((args.host, args.port), ProgramHandler)
    try:
        print(f'Serving {ProgramHandler.web_root} on http://{args.host}:{args.port}')
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
