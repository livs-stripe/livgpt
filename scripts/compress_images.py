#!/usr/bin/env python3
"""Normalise catalog images to Stripe's product-feed requirements.

Stripe's product feed accepts **JPEG or PNG only** (not WebP) and recommends a
minimum of 800x800px:
https://docs.stripe.com/agentic-commerce/product-feed  (`image_link`)

So this converts everything to progressive JPEG at 800x800, which is both the
recommended minimum and a ~15x size saving over the original 1024px PNGs.

Idempotent. A file is only rewritten when it is not already a JPEG at or below
the target edge, so re-running never recompresses (and never degrades) an
already-processed image.

By default only the one-image-per-product merchants are processed; the others
still use `.png` `image_link` values and must keep their PNGs.

Usage:
    python3 scripts/compress_images.py                  # the 3 live merchants
    python3 scripts/compress_images.py --all            # every merchant
    python3 scripts/compress_images.py --dry-run
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_ROOT = os.path.join(ROOT, "public", "mock-catalog", "images")

LIVE_MERCHANTS = (
    "harbor-and-home",
    "lumen-beauty",
    "northwind-apparel",
    "voltedge-electronics",
)
MAX_EDGE = 800
QUALITY = 82
SRC_EXTS = (".png", ".webp", ".jpeg", ".jpg")


def needs_work(path: str) -> bool:
    """True unless this is already a JPEG no larger than MAX_EDGE."""
    if os.path.splitext(path)[1].lower() != ".jpg":
        return True
    try:
        with Image.open(path) as im:
            return max(im.size) > MAX_EDGE
    except Exception:
        return True


def convert(path: str, dry_run: bool) -> tuple[int, int]:
    """Returns (bytes_before, bytes_after)."""
    before = os.path.getsize(path)
    dest = os.path.splitext(path)[0] + ".jpg"
    if dry_run:
        return before, before
    with Image.open(path) as im:
        im = im.convert("RGB")
        if max(im.size) > MAX_EDGE:
            im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
        # Write via a temp file so an interrupted run can't leave a truncated
        # image where a valid one used to be.
        tmp = dest + ".tmp"
        im.save(tmp, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    os.replace(tmp, dest)
    if os.path.abspath(path) != os.path.abspath(dest):
        os.remove(path)
    return before, os.path.getsize(dest)


def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    merchants = (
        sorted(os.listdir(IMG_ROOT)) if "--all" in args else list(LIVE_MERCHANTS)
    )

    grand_before = grand_after = 0
    for merchant in merchants:
        mdir = os.path.join(IMG_ROOT, merchant)
        if not os.path.isdir(mdir):
            continue
        before = after = converted = skipped = 0
        for name in sorted(os.listdir(mdir)):
            path = os.path.join(mdir, name)
            if os.path.splitext(name)[1].lower() not in SRC_EXTS:
                continue
            if not needs_work(path):
                skipped += 1
                sz = os.path.getsize(path)
                before += sz
                after += sz
                continue
            b, a = convert(path, dry_run)
            before += b
            after += a
            converted += 1
        grand_before += before
        grand_after += after
        print(
            f"{merchant:22s} converted {converted:4d}, already ok {skipped:4d}, "
            f"{before/1e6:7.1f} MB -> {after/1e6:6.1f} MB"
        )

    saved = grand_before - grand_after
    pct = (saved / grand_before * 100) if grand_before else 0
    print(
        f"\n{'TOTAL':22s} {grand_before/1e6:7.1f} MB -> {grand_after/1e6:6.1f} MB "
        f"(saved {saved/1e6:.1f} MB, {pct:.0f}%)"
        + ("  [dry run, nothing written]" if dry_run else "")
    )


if __name__ == "__main__":
    main()
