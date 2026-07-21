#!/usr/bin/env python3
"""Convert the existing per-merchant products.csv files into full Stripe
Agentic Commerce product-feed CSVs (feed.csv) that match the official template
schema, ready to upload to each merchant's Stripe account.

Reads:  mock-catalog/<slug>/products.csv   (compact internal schema)
Writes: mock-catalog/<slug>/feed.csv        (full Stripe template schema)

Only the 5 existing merchants are processed. image_link is rewritten to an
absolute public URL so Stripe can fetch the product images.
"""
import csv
import glob
import hashlib
import os

# Public base URL where the /public assets are served. Adjust to your real
# deployment domain if different (env override wins).
IMAGE_BASE_URL = os.environ.get("IMAGE_BASE_URL", "https://livgpt.vercel.app").rstrip("/")

# Full Stripe product-feed template header (column order preserved).
TEMPLATE_HEADER = [
    "id", "title", "description", "link", "brand", "gtin", "mpn", "image_link",
    "additional_image_link", "video_link", "model_3d_link", "condition",
    "google_product_category", "product_category", "age_group", "material",
    "length", "width", "height", "weight", "item_group_id", "item_group_title",
    "color", "size", "size_system", "gender", "availability", "availability_date",
    "expiration_date", "inventory_not_tracked", "inventory_quantity", "price",
    "sale_price", "sale_price_effective_date", "stripe_product_tax_code",
    "tax_behavior", "applicable_fees", "shipping", "free_shipping_threshold",
    "delete",
]

# Standard shipping + tax defaults applied to every row.
SHIPPING = "US:ALL:Standard:3-5:0.00 USD,US:ALL:Expedited:1-2:9.99 USD"
FREE_SHIPPING_THRESHOLD = "US:ALL:Standard:50.00 USD"
TAX_CODE = "txcd_99999999"
TAX_BEHAVIOR = "exclusive"

# All 7 merchants, including the 2 newer brands (meridian-travel, fern-and-field).
MERCHANTS = [
    "harbor-and-home",
    "lumen-beauty",
    "northwind-apparel",
    "summit-outdoors",
    "voltedge-electronics",
    "meridian-travel",
    "fern-and-field",
]

# (length_in, width_in, height_in, weight_lb) keyed by a keyword found in the
# product_type / google_product_category path (first match wins).
DIMS = [
    ("candle", (4, 4, 5, 1.2)),
    ("fragrance", (4, 4, 5, 1.0)),
    ("aromatherapy", (4, 4, 6, 0.9)),
    ("mug", (5, 4, 5, 1.1)),
    ("tumbler", (4, 4, 8, 1.0)),
    ("bottle", (4, 4, 10, 1.1)),
    ("cookware", (14, 11, 6, 4.2)),
    ("kitchen", (13, 5, 3, 1.4)),
    ("bedding", (15, 12, 5, 3.6)),
    ("linen", (13, 10, 3, 1.8)),
    ("storage", (16, 12, 10, 2.6)),
    ("loungewear", (12, 10, 2, 1.1)),
    ("sleepwear", (12, 10, 2, 1.1)),
    ("hoodie", (13, 11, 3, 1.8)),
    ("jacket", (14, 12, 4, 2.3)),
    ("shirt", (12, 10, 2, 0.9)),
    ("tee", (12, 10, 2, 0.9)),
    ("sock", (7, 5, 2, 0.3)),
    ("hat", (10, 9, 5, 0.5)),
    ("wallet", (5, 4, 1, 0.3)),
    ("sunglass", (6, 3, 2, 0.4)),
    ("backpack", (20, 13, 8, 2.6)),
    ("activewear", (12, 10, 2, 1.0)),
    ("yoga", (26, 5, 5, 3.0)),
    ("earbud", (4, 3, 2, 0.4)),
    ("headphone", (8, 7, 3, 0.9)),
    ("speaker", (8, 5, 5, 2.0)),
    ("watch", (4, 4, 3, 0.6)),
    ("charger", (5, 3, 2, 0.5)),
    ("keyboard", (18, 6, 2, 2.0)),
    ("serum", (2, 2, 5, 0.4)),
    ("cream", (3, 3, 4, 0.5)),
    ("cleanser", (2, 2, 6, 0.5)),
    ("lip", (1, 1, 4, 0.2)),
    ("mask", (5, 4, 1, 0.3)),
    ("beauty", (3, 3, 5, 0.5)),
    ("skin", (3, 3, 5, 0.5)),
]
DEFAULT_DIM = (8, 6, 4, 1.0)


def dims_for(category_text: str, pid: str):
    cat = category_text.lower()
    base = DEFAULT_DIM
    for kw, d in DIMS:
        if kw in cat:
            base = d
            break
    # Small deterministic jitter so items aren't all identical.
    h = int(hashlib.md5(pid.encode()).hexdigest(), 16)
    lw = round(base[3] * (0.9 + (h % 21) / 100.0), 2)  # +/-10% weight
    return base[0], base[1], base[2], lw


def gender_for(title: str, category_text: str) -> str:
    t = f"{title} {category_text}".lower()
    if "women" in t or "women's" in t or " her " in t:
        return "female"
    if "men" in t or "men's" in t:
        return "male"
    return "unisex"


def item_group_title(product_type: str, title: str) -> str:
    if product_type and ">" in product_type:
        return product_type.split(">")[-1].strip()
    if product_type:
        return product_type.strip()
    return title


def abs_image(url: str) -> str:
    if not url:
        return ""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return f"{IMAGE_BASE_URL}/{url.lstrip('/')}"


def convert(src: str, dst: str) -> int:
    with open(src, newline="") as f:
        rows = list(csv.DictReader(f))

    out = []
    for r in rows:
        gcat = r.get("google_product_category", "")
        ptype = r.get("product_type", "")
        cat_text = f"{gcat} {ptype}"
        pid = r.get("id", "")
        length, width, height, weight = dims_for(cat_text, pid)
        size = r.get("size", "")
        sale = r.get("sale_price", "")
        out.append({
            "id": pid,
            "title": r.get("title", ""),
            "description": r.get("description", ""),
            "link": r.get("link", ""),
            "brand": r.get("brand", ""),
            "gtin": r.get("gtin", ""),
            "mpn": r.get("mpn", ""),
            "image_link": abs_image(r.get("image_link", "")),
            "additional_image_link": abs_image(r.get("additional_image_link", "")),
            "video_link": "",
            "model_3d_link": "",
            "condition": r.get("condition", "new") or "new",
            "google_product_category": gcat,
            "product_category": ptype,
            "age_group": "adult",
            "material": r.get("material", ""),
            "length": f"{length} in",
            "width": f"{width} in",
            "height": f"{height} in",
            "weight": f"{weight} lb",
            "item_group_id": r.get("item_group_id", ""),
            "item_group_title": item_group_title(ptype, r.get("title", "")),
            "color": r.get("color", ""),
            "size": size,
            "size_system": "US" if size else "",
            "gender": gender_for(r.get("title", ""), cat_text),
            "availability": r.get("availability", "in_stock") or "in_stock",
            "availability_date": "",
            "expiration_date": "",
            "inventory_not_tracked": "",
            "inventory_quantity": r.get("quantity", ""),
            "price": r.get("price", ""),
            "sale_price": sale,
            "sale_price_effective_date": "2026-07-01/2026-12-31" if sale else "",
            "stripe_product_tax_code": TAX_CODE,
            "tax_behavior": TAX_BEHAVIOR,
            "applicable_fees": "",
            "shipping": SHIPPING,
            "free_shipping_threshold": FREE_SHIPPING_THRESHOLD,
            "delete": "",
        })

    with open(dst, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=TEMPLATE_HEADER, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(out)
    return len(out)


def main():
    total = 0
    for slug in MERCHANTS:
        src = os.path.join("mock-catalog", slug, "products.csv")
        if not os.path.exists(src):
            print(f"SKIP {slug}: no products.csv")
            continue
        dst = os.path.join("mock-catalog", slug, "feed.csv")
        n = convert(src, dst)
        total += n
        print(f"{slug}: {n} rows -> {dst}")
    print(f"TOTAL: {total} rows across feeds (image base: {IMAGE_BASE_URL})")


if __name__ == "__main__":
    main()
