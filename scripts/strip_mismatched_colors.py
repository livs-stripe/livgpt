#!/usr/bin/env python3
"""Remove per-product color claims that don't match the product image.

Each subcategory ships only 3-5 generic studio photos, but the generator assigned
each product a RANDOM color (in its title suffix, `color` field, and a
"Shown in <Color>." description sentence) with no relationship to the image it
points at -- so an "Olive" mug could render a navy photo. With a handful of
shared images per subcategory there is no way to make a specific color truthful,
so we drop the color claim entirely rather than assert a wrong one.

Idempotent. Covers all 7 merchants: meridian-travel and fern-and-field were
excluded while they were still being generated, but they are live in the catalog
now and hit the same mismatch. Run after any regeneration of the mock catalog.
"""
import csv
import json
import os

MERCHANT_SLUGS = [
    "harbor-and-home", "lumen-beauty", "northwind-apparel",
    "summit-outdoors", "voltedge-electronics",
    "meridian-travel", "fern-and-field",
]
SELLER_IDS = {
    "profile_harbor_and_home", "profile_lumen_beauty",
    "profile_northwind_apparel", "profile_summit_outdoors",
    "profile_voltedge_electronics",
    "profile_meridian_travel", "profile_fern_and_field",
}
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


def fix_bundle(path: str) -> int:
    with open(path) as f:
        data = json.load(f)
    changed = 0
    for p in data:
        if p.get("sellerId") not in SELLER_IDS:
            continue
        name = strip_title(p.get("name", ""))
        desc = strip_desc(p.get("description", ""))
        if name != p.get("name") or desc != p.get("description"):
            p["name"], p["description"] = name, desc
            changed += 1
    if not changed:
        return 0
    with open(path, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
        f.write("\n")
    return changed


def main():
    for slug in MERCHANT_SLUGS:
        for fname in ("products.csv", "feed.csv"):
            path = os.path.join("mock-catalog", slug, fname)
            if os.path.exists(path):
                print(f"{slug}/{fname}: stripped color from {fix_csv(path)} rows")
    n = fix_bundle("lib/mock-catalog-data.json")
    print(f"lib/mock-catalog-data.json: stripped color from {n} products")


if __name__ == "__main__":
    main()
