#!/usr/bin/env python3
"""Remove per-product color claims that don't match the product image.

Applies ONLY to merchants that still share 3-5 generic studio photos per
sub-category. For those, the generator assigns each product a RANDOM color (in
its title suffix, `color` field, and a "Shown in <Color>." description sentence)
with no relationship to the image it points at -- so an "Olive" mug could render
a navy photo. With a handful of shared images there is no way to make a specific
color truthful, so we drop the claim rather than assert a wrong one.

DELIBERATELY EXCLUDED: harbor-and-home, lumen-beauty and northwind-apparel. Each
of their products now has its own image, generated from a prompt that names the
same colour the title claims, so the claim is accurate and must be kept. Colour
consistency for those three is enforced by scripts/validate_feeds.py instead.

Idempotent, and expected to report 0 rows changed on a clean tree.
"""
import csv
import os

# Shared-image merchants only. The three live-feed merchants have one image per
# product and are validated, not stripped.
MERCHANT_SLUGS = [
    "summit-outdoors", "voltedge-electronics",
    "meridian-travel", "fern-and-field",
]
COLORS = [
    "Blush Pink", "Forest Green", "Slate Gray", "Sky Blue",  # multi-word first
    "Terracotta", "Burgundy", "Charcoal", "Black", "Cream", "Navy",
    "Olive", "Sand", "White",
]
SEPS = [" \u2013 ", " \u2014 ", " - "]  # en dash, em dash, hyphen


def strip_title(title: str) -> str:
    for sep in SEPS:
        for c in COLORS:
            if title.endswith(sep + c):
                return title[: -len(sep + c)]
    return title


def strip_desc(desc: str) -> str:
    for c in COLORS:
        token = f" Shown in {c}."
        if token in desc:
            return desc.replace(token, "")
    return desc


def fix_csv(path: str) -> int:
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = list(reader)
    changed = 0
    for r in rows:
        before = (r.get("title"), r.get("color"), r.get("description"))
        if "title" in r:
            r["title"] = strip_title(r.get("title", ""))
        if "color" in r:
            r["color"] = ""
        if "description" in r:
            r["description"] = strip_desc(r.get("description", ""))
        if (r.get("title"), r.get("color"), r.get("description")) != before:
            changed += 1
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    return changed


def main():
    total = 0
    for slug in MERCHANT_SLUGS:
        for fname in ("products.csv", "feed.csv"):
            path = os.path.join("mock-catalog", slug, fname)
            if os.path.exists(path):
                n = fix_csv(path)
                total += n
                print(f"{slug}/{fname}: stripped color from {n} rows")
    print(f"\nTOTAL rows changed: {total}")


if __name__ == "__main__":
    main()
