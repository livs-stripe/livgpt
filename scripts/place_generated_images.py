#!/usr/bin/env python3
"""Move generated product images into their merchant directory.

The GenerateImage tool takes a bare filename and chooses the output directory
itself, so generated files land outside the repo tree. This script finds each
expected filename wherever it landed and moves it to
public/mock-catalog/images/<merchant>/<product_id>.<ext>.

Idempotent: files already in place are left alone. Safe to run repeatedly while
generation workers are still going -- it simply reports what is still missing.

Usage:
    python3 scripts/place_generated_images.py            # all merchants
    python3 scripts/place_generated_images.py harbor-and-home
"""
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(ROOT, "mock-catalog", "image-spec.json")

# Places the image tool is known or likely to write to, most specific first.
SEARCH_DIRS = [
    ROOT,
    os.path.join(ROOT, "public"),
    os.path.expanduser(
        "~/.cursor/projects/Users-livs-Desktop-livgpt/assets"
    ),
    os.path.expanduser("~/Downloads"),
    "/tmp",
]
# Any extension the generator might emit; compress_images.py normalises later.
EXTS = (".png", ".jpg", ".jpeg", ".webp")


def candidates(stem: str):
    for d in SEARCH_DIRS:
        if not os.path.isdir(d):
            continue
        for ext in EXTS:
            p = os.path.join(d, stem + ext)
            if os.path.isfile(p):
                yield p


def main():
    wanted = sys.argv[1:]
    specs = [s for s in json.load(open(SPEC)) if "product_id" in s]
    if wanted:
        specs = [s for s in specs if s["merchant"] in wanted]

    moved = in_place = missing = 0
    missing_ids = []
    for s in specs:
        stem = s["product_id"]
        dest_dir = os.path.join(ROOT, os.path.dirname(s["path"]))
        os.makedirs(dest_dir, exist_ok=True)
        # Already placed under any accepted extension?
        if any(os.path.isfile(os.path.join(dest_dir, stem + e)) for e in EXTS):
            in_place += 1
            continue
        src = next(candidates(stem), None)
        if src is None:
            missing += 1
            missing_ids.append(stem)
            continue
        shutil.move(src, os.path.join(dest_dir, stem + os.path.splitext(src)[1]))
        moved += 1

    print(f"moved {moved}, already in place {in_place}, missing {missing}")
    if missing_ids:
        print("\nSTILL MISSING (regenerate these):")
        for mid in missing_ids:
            print(f"  {mid}")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
