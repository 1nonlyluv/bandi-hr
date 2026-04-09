import tempfile
import time
import unittest
from pathlib import Path

from watch_shuttle_updates import current_stamp, current_stamps, wait_for_stable_file


class WatchShuttleUpdatesTests(unittest.TestCase):
    def test_current_stamp_reads_size_and_mtime(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "sample.txt"
            path.write_text("abc", encoding="utf-8")
            stamp = current_stamp(path)
            self.assertIsNotNone(stamp)
            self.assertEqual(stamp.size, 3)
            self.assertGreater(stamp.mtime_ns, 0)

    def test_wait_for_stable_file_returns_after_same_stamp(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "sample.txt"
            path.write_text("abc", encoding="utf-8")
            start = time.time()
            stamp = wait_for_stable_file(path, settle_seconds=0.2, poll_seconds=0.05)
            elapsed = time.time() - start
            self.assertIsNotNone(stamp)
            self.assertGreaterEqual(elapsed, 0.2)

    def test_current_stamps_collects_monthly_workbooks(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            march = root / "등송영표 3월.xlsx"
            april = root / "등송영표 4월.xlsx"
            sample = root / "등송영표_sample.xlsx"
            march.write_text("march", encoding="utf-8")
            april.write_text("april", encoding="utf-8")
            sample.write_text("sample", encoding="utf-8")
            stamps = current_stamps(april)
            self.assertEqual(set(stamps), {march.resolve(), april.resolve()})


if __name__ == "__main__":
    unittest.main()
