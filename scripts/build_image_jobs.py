#!/usr/bin/env python3
"""Split the per-product image specs into N independent worker slices.

Reads:  mock-catalog/image-spec.json
Writes: scripts/image-jobs/slice-<i>-of-<n>.json   (+ index.json)

Only the merchants with one-image-per-product are emitted (the three the live
SFTP feed serves). The other four still share per-subcategory photos that
already exist on disk, so they need no generation work.

Each slice is self-contained: a worker takes one file and needs no coordination
with any other worker. Slices are round-robin by merchant so every worker gets a
mix of brands rather than one worker owning a whole merchant -- that way a single
slow or failed worker does not leave one merchant entirely unillustrated.

Usage:
    python3 scripts/build_image_jobs.py [n_slices]      # default 6
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(ROOT, "mock-catalog", "image-spec.json")
OUT_DIR = os.path.join(ROOT, "scripts", "image-jobs")


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    specs = json.load(open(SPEC))
    jobs = [s for s in specs if "product_id" in s]

    filenames = [j["filename"] for j in jobs]
    if len(set(filenames)) != len(filenames):
        raise SystemExit("filenames are not unique; refusing to write job slices")

    os.makedirs(OUT_DIR, exist_ok=True)
    for stale in os.listdir(OUT_DIR):
        if stale.endswith(".json"):
            os.remove(os.path.join(OUT_DIR, stale))

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
        name = f"slice-{i}-of-{n}.json"
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

    with open(os.path.join(OUT_DIR, "index.json"), "w") as f:
        json.dump({"total_jobs": len(jobs), "slices": index}, f, indent=2)

    by_merchant = {}
    for j in jobs:
        by_merchant[j["merchant"]] = by_merchant.get(j["merchant"], 0) + 1
    print(f"\nTOTAL {len(jobs)} jobs, {len(set(filenames))} unique filenames")
    for k, v in sorted(by_merchant.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
