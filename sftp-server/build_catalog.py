#!/usr/bin/env python3
"""(Re)generate sftp-server/catalog/ from mock-catalog/<slug>/products.csv.

For each of the 4 demo merchants this writes:
  catalog/<slug>/products.csv   (verbatim copy of the source shard)
  catalog/<slug>/manifest.json  (carries the REAL Stripe sandbox profile id)

The manifest carries the real Stripe profile id so the app ingests profile ids
straight from the feed (like production) instead of a hardcoded env map.

Idempotent: safe to run repeatedly; it fully rewrites catalog/ each time.
"""

from __future__ import annotations

import csv
import json
import shutil
from pathlib import Path

# slug -> REAL Stripe sandbox profile id. Only these 4 merchants are served.
PROFILE_IDS: dict[str, str] = {
    "harbor-and-home": "profile_test_61V4rlJR6SOOGr86bA6V4rlIU4SQJK89xjP3m2SoKQrI",
    "lumen-beauty": "profile_test_61V4s0tdP53DpqIXuA6V4s0tU4SQZfNb2ovpf4CVU2TI",
    "northwind-apparel": "profile_test_61V4s3wzOLA0Xsg2jA6V4s3wU4SQc5wYyQkQKKCngHku",
    "summit-outdoors": "profile_test_61V4s6BwbaSJ9V7veA6V4s6AU4SQNkjbEkRaK94bYC7E",
}

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
SOURCE_ROOT = REPO_ROOT / "mock-catalog"
CATALOG_ROOT = HERE / "catalog"


def count_rows(csv_path: Path) -> int:
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header is None:
            return 0
        return sum(1 for _ in reader)


def build() -> None:
    if CATALOG_ROOT.exists():
        shutil.rmtree(CATALOG_ROOT)
    CATALOG_ROOT.mkdir(parents=True)

    summary: list[tuple[str, str, int]] = []

    for slug, profile_id in PROFILE_IDS.items():
        src_csv = SOURCE_ROOT / slug / "products.csv"
        if not src_csv.is_file():
            raise SystemExit(f"missing source shard: {src_csv}")

        dest_dir = CATALOG_ROOT / slug
        dest_dir.mkdir(parents=True)

        dest_csv = dest_dir / "products.csv"
        shutil.copyfile(src_csv, dest_csv)

        manifest = {
            "stripe_profile_id": profile_id,
            "feed_type": "products",
            "total_shards": 1,
            "files": [{"name": "products.csv"}],
        }
        (dest_dir / "manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )

        summary.append((slug, profile_id, count_rows(dest_csv)))

    print(f"Wrote catalog for {len(summary)} merchants to {CATALOG_ROOT}\n")
    for slug, profile_id, rows in summary:
        print(f"  {slug:<20} {rows:>4} rows  {profile_id}")


if __name__ == "__main__":
    build()
