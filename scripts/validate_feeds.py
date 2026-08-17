#!/usr/bin/env python3
"""Validate mock-catalog/<slug>/feed.csv against Stripe's product-feed rules.

Checks, per merchant:
  - header is exactly TEMPLATE_HEADER, in order
  - expected row count
  - every row parses to exactly 40 fields
  - `id` values unique, and unique per feed
  - required fields non-blank
  - price / sale_price well formed, sale < list, sale carries an effective date
  - availability + gender within Stripe's enums
  - length limits: title<=150, description<=5000, id<=100, brand<=70
  - image_link absolute against the expected host, and unique per product
  - referenced image files exist on disk
  - no residual colour claims in title / color / description
  - every row is `in_stock` with a positive inventory_quantity

Exits non-zero if any hard check fails.

Usage:
    python3 scripts/validate_feeds.py                        # live merchants
    python3 scripts/validate_feeds.py --rows 200 voltedge-electronics
    python3 scripts/validate_feeds.py --check-urls           # also HTTP 200
"""
import csv
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate_feed_csvs import TEMPLATE_HEADER  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE_MERCHANTS = {
    "harbor-and-home": 250,
    "lumen-beauty": 250,
    "northwind-apparel": 250,
    "voltedge-electronics": 200,
}
IMAGE_HOST = "https://livgpt.vercel.app"

REQUIRED = [
    "id", "title", "description", "link", "image_link", "price",
    "availability", "brand", "condition", "google_product_category",
]
# Deliberately blank, with the reason we accept it.
INTENTIONALLY_BLANK = {
    "gtin": "no real barcodes exist for invented products; optional for Stripe",
    "additional_image_link": "one image per product by design",
    "video_link": "no product videos",
    "model_3d_link": "no 3D models",
    "availability_date": "everything is available now",
    "expiration_date": "no expiring offers",
    "inventory_not_tracked": "inventory_quantity is supplied instead",
    "applicable_fees": "no extra fees modelled",
    "delete": "no deletions in a full-catalog export",
    "sale_price": "only ~22% of rows are on sale",
    "sale_price_effective_date": "set only where sale_price is set",
    "color": "set only where the product claims a colour",
    "size": "set only for sized apparel",
    "size_system": "set only where size is set",
    "material": "set only where a real material applies",
}
AVAILABILITY = {"in_stock", "out_of_stock", "preorder", "backorder"}
GENDER = {"male", "female", "unisex"}
PRICE_RE = re.compile(r"^\d+\.\d{2} [A-Z]{3}$")
COLORS = [
    "Blush Pink", "Forest Green", "Slate Gray", "Sky Blue", "Terracotta",
    "Burgundy", "Charcoal", "Black", "Cream", "Navy", "Olive", "Sand", "White",
]


def money(raw: str) -> float:
    return float(raw.split()[0])


def check(slug: str, rows_expected: int, check_urls: bool):
    path = os.path.join(ROOT, "mock-catalog", slug, "feed.csv")
    errors, warns = [], []
    with open(path, newline="") as f:
        raw = list(csv.reader(f))
    header, body = raw[0], raw[1:]

    if header != TEMPLATE_HEADER:
        errors.append(f"header mismatch ({len(header)} cols, expected {len(TEMPLATE_HEADER)})")
    if len(body) != rows_expected:
        errors.append(f"{len(body)} rows, expected {rows_expected}")
    bad_width = [i for i, r in enumerate(body, 2) if len(r) != len(TEMPLATE_HEADER)]
    if bad_width:
        errors.append(f"{len(bad_width)} rows not {len(TEMPLATE_HEADER)} fields (first at line {bad_width[0]})")

    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))

    ids = [r["id"] for r in rows]
    dupe_ids = [k for k, v in Counter(ids).items() if v > 1]
    if dupe_ids:
        errors.append(f"{len(dupe_ids)} duplicate ids, e.g. {dupe_ids[:3]}")

    imgs = [r["image_link"] for r in rows]
    dupe_imgs = [k for k, v in Counter(imgs).items() if v > 1]
    if dupe_imgs:
        errors.append(f"{len(dupe_imgs)} image_link values used by >1 product, e.g. {dupe_imgs[:2]}")

    blanks = Counter()
    missing_files, wrong_dir, bad_price, bad_sale, bad_avail, bad_gender = [], [], [], [], [], []
    too_long = Counter()
    colour_claims = []
    oos_ids = []
    zero_qty = []

    for r in rows:
        for c in REQUIRED:
            if not (r.get(c) or "").strip():
                blanks[c] += 1
        if not PRICE_RE.match(r["price"] or ""):
            bad_price.append(r["id"])
        if r["sale_price"]:
            if not PRICE_RE.match(r["sale_price"]):
                bad_sale.append(f"{r['id']}:malformed")
            elif money(r["sale_price"]) >= money(r["price"]):
                bad_sale.append(f"{r['id']}:not-below-list")
            elif not r["sale_price_effective_date"]:
                bad_sale.append(f"{r['id']}:no-effective-date")
        elif r["sale_price_effective_date"]:
            bad_sale.append(f"{r['id']}:date-without-sale")
        if r["availability"] not in AVAILABILITY:
            bad_avail.append(r["id"])
        if r["gender"] not in GENDER:
            bad_gender.append(r["id"])
        for col, limit in (("title", 150), ("description", 5000), ("id", 100), ("brand", 70)):
            if len(r[col]) > limit:
                too_long[col] += 1

        url = r["image_link"]
        if not url.startswith(f"{IMAGE_HOST}/mock-catalog/images/{slug}/"):
            wrong_dir.append(r["id"])
        else:
            rel = url[len(IMAGE_HOST):].lstrip("/")
            if not os.path.isfile(os.path.join(ROOT, "public", rel)):
                missing_files.append(os.path.basename(rel))

        claimed = r["color"].strip()
        if claimed:
            # A colour claim is only legitimate if the title carries the same
            # colour, so the shopper never reads a colour the photo contradicts.
            if not r["title"].endswith(f"\u2013 {claimed}"):
                colour_claims.append(f"{r['id']}:color={claimed}-not-in-title")
        else:
            for c in COLORS:
                if r["title"].endswith(f"\u2013 {c}"):
                    colour_claims.append(f"{r['id']}:title-colour-without-color-field")
                    break
        # "Shown in <Colour>." is legitimate now that each product has its own
        # image generated in that colour -- but only if it agrees with `color`.
        shown = re.search(r"Shown in ([A-Z][a-z]+(?: [A-Z][a-z]+)?)\.", r["description"])
        if shown and shown.group(1) != claimed:
            colour_claims.append(f"{r['id']}:description-says-{shown.group(1)}-not-{claimed or 'blank'}")

        if r["availability"] != "in_stock":
            oos_ids.append(r["id"])
        qty = r.get("inventory_quantity") or "0"
        if qty.isdigit() and int(qty) <= 0:
            zero_qty.append(r["id"])

    for c, n in blanks.items():
        errors.append(f"{n} rows blank in required column `{c}`")
    if bad_price:
        errors.append(f"{len(bad_price)} malformed prices, e.g. {bad_price[:3]}")
    if bad_sale:
        errors.append(f"{len(bad_sale)} sale-price problems, e.g. {bad_sale[:3]}")
    if bad_avail:
        errors.append(f"{len(bad_avail)} availability outside enum, e.g. {bad_avail[:3]}")
    if bad_gender:
        errors.append(f"{len(bad_gender)} gender outside enum, e.g. {bad_gender[:3]}")
    for c, n in too_long.items():
        errors.append(f"{n} rows exceed the {c} length limit")
    if wrong_dir:
        errors.append(f"{len(wrong_dir)} image_link values outside {slug}/, e.g. {wrong_dir[:2]}")
    if missing_files:
        errors.append(
            f"{len(missing_files)} image files referenced but NOT on disk, "
            f"e.g. {missing_files[:3]}"
        )
    if colour_claims:
        errors.append(f"{len(colour_claims)} colour-claim problems, e.g. {colour_claims[:3]}")
    if oos_ids:
        errors.append(f"{len(oos_ids)} rows are not in_stock, e.g. {oos_ids[:3]}")
    if zero_qty:
        errors.append(f"{len(zero_qty)} rows have non-positive inventory_quantity, e.g. {zero_qty[:3]}")

    if check_urls:
        import concurrent.futures
        import urllib.request

        def head(url: str) -> tuple[str, object]:
            try:
                req = urllib.request.Request(url, method="HEAD")
                with urllib.request.urlopen(req, timeout=20) as resp:
                    return url, resp.status
            except Exception as exc:  # noqa: BLE001
                return url, getattr(exc, "code", str(exc))

        # Live merchants: every image. Shared-photo merchants: unique URLs only.
        to_check = imgs if slug in LIVE_MERCHANTS else list(dict.fromkeys(imgs))
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
            for url, code in pool.map(head, to_check):
                if code != 200:
                    errors.append(f"{url} -> HTTP {code}")

    return errors, warns, len(rows), len(set(ids)), len(set(imgs))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    rows_override = None
    if "--rows" in sys.argv:
        rows_override = int(sys.argv[sys.argv.index("--rows") + 1])
        args = [a for a in args if a != str(rows_override)]
    check_urls = "--check-urls" in sys.argv
    slugs = args or list(LIVE_MERCHANTS)

    all_imgs, failed = [], []
    for slug in slugs:
        rows_expected = (
            rows_override
            if rows_override is not None
            else LIVE_MERCHANTS.get(slug, 150)
        )
        errors, warns, n, n_ids, n_imgs = check(slug, rows_expected, check_urls)
        status = "PASS" if not errors else "FAIL"
        print(f"\n=== {slug}: {status}  ({n} rows, {n_ids} unique ids, {n_imgs} unique image_links)")
        for e in errors:
            print(f"    ERROR  {e}")
        for w in warns:
            print(f"    warn   {w}")
        if errors:
            failed.append(slug)
        with open(os.path.join(ROOT, "mock-catalog", slug, "feed.csv"), newline="") as f:
            all_imgs += [r["image_link"] for r in csv.DictReader(f)]

    dupes = [k for k, v in Counter(all_imgs).items() if v > 1]
    print(f"\nCross-merchant: {len(all_imgs)} image_links, {len(set(all_imgs))} unique")
    if dupes:
        print(f"    ERROR  {len(dupes)} shared across merchants, e.g. {dupes[:3]}")
        failed.append("cross-merchant")
    else:
        print("    OK     no image shared between products or merchants")

    print("\nIntentionally blank columns:")
    for c, why in INTENTIONALLY_BLANK.items():
        print(f"    {c:28s} {why}")

    if failed:
        print(f"\nFAILED: {', '.join(sorted(set(failed)))}")
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
