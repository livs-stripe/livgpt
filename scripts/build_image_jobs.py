#!/usr/bin/env python3
"""Split the per-product image specs into N independent worker slices.

Reads:  mock-catalog/image-spec.json
Writes: scripts/image-jobs/slice-<i>-of-<n>.json   (+ index.json)

Only merchants with one-image-per-product are emitted by default. Pass
`--merchant <slug>` to emit just that merchant, and `--keep` to leave existing
slice files in place (so a new merchant can be added without wiping completed
jobs).

Usage:
    python3 scripts/build_image_jobs.py [n_slices]      # default 6
    python3 scripts/build_image_jobs.py 8 --merchant voltedge-electronics --keep
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(ROOT, "mock-catalog", "image-spec.json")
OUT_DIR = os.path.join(ROOT, "scripts", "image-jobs")


def main():
    args = sys.argv[1:]
    keep = "--keep" in args
    merchant = None
    if "--merchant" in args:
        i = args.index("--merchant")
        if i + 1 >= len(args):
            raise SystemExit("--merchant requires a slug")
        merchant = args[i + 1]
    n = 6
    for a in args:
        if a.isdigit():
            n = int(a)
            break

    specs = json.load(open(SPEC))
    jobs = [s for s in specs if "product_id" in s]
    if merchant:
        jobs = [j for j in jobs if j["merchant"] == merchant]
        if not jobs:
            raise SystemExit(f"no per-product image jobs for merchant {merchant}")

    filenames = [j["filename"] for j in jobs]
    if len(set(filenames)) != len(filenames):
        raise SystemExit("filenames are not unique; refusing to write job slices")

    os.makedirs(OUT_DIR, exist_ok=True)
    if not keep:
        for stale in os.listdir(OUT_DIR):
            if stale.endswith(".json"):
                os.remove(os.path.join(OUT_DIR, stale))

    prefix = f"{merchant}-" if merchant else ""
    slices = [[] for _ in range(n)]
    for i, j in enumerate(jobs):
        slices[i % n].append({
            "product_id": j["product_id"],
            "merchant": j["merchant"],
            "product_title": j["product_title"],
            "output_filename": j["filename"],
            "final_path": j["path"],
            "prompt": j["prompt"],
        })

    index = []
    for i, chunk in enumerate(slices, start=1):
        name = f"{prefix}slice-{i}-of-{n}.json"
        with open(os.path.join(OUT_DIR, name), "w") as f:
            json.dump({
                "slice": i,
                "of": n,
                "count": len(chunk),
                "instructions": (
                    "For each job: call GenerateImage with `description` set to "
                    "`prompt`, `filename` set to `output_filename`, and "
                    "aspect_ratio '1:1'. GenerateImage does NOT accept a "
                    "directory, so afterwards run "
                    "`python3 scripts/place_generated_images.py` to move every "
                    "generated file into its merchant directory. A call can take "
                    "25s+ and can fail (504s have happened): record any failure "
                    "and retry it, never skip silently. Sanity-check each result "
                    "against `product_title` before moving on."
                ),
                "jobs": chunk,
            }, f, indent=2)
        index.append({"file": name, "count": len(chunk)})
        print(f"{name}: {len(chunk)} jobs")

    index_name = f"{prefix}index.json" if merchant else "index.json"
    with open(os.path.join(OUT_DIR, index_name), "w") as f:
        json.dump({"total_jobs": len(jobs), "merchant": merchant, "slices": index}, f, indent=2)

    by_merchant = {}
    for j in jobs:
        by_merchant[j["merchant"]] = by_merchant.get(j["merchant"], 0) + 1
    print(f"\nTOTAL {len(jobs)} jobs, {len(set(filenames))} unique filenames")
    for k, v in sorted(by_merchant.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
