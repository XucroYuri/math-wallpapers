#!/usr/bin/env python3
"""Summarise screenshots/audit/*.png: brightness, contrast, colour variety."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "screenshots" / "audit"


def stats(path):
    im = Image.open(path).convert("RGB").resize((192, 108))
    pixels = list(im.getdata())
    lum = [0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in pixels]
    mean = sum(lum) / len(lum)
    lo = min(lum)
    hi = max(lum)
    near_black = sum(1 for v in lum if v < 4) / len(lum)
    unique = len(set(pixels))
    return {
        "mean": round(mean, 2),
        "min": round(lo, 1),
        "max": round(hi, 1),
        "near_black": round(near_black, 3),
        "unique": unique,
    }


def main():
    report_path = AUDIT / "report.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else []
    by_slug = {entry["slug"]: entry for entry in report}
    rows = []
    for png in sorted(AUDIT.glob("*.png")):
        slug = png.name.split("-")[0]
        s = stats(png)
        rows.append((png.name, slug, s))
    print(f"{'file':42} {'mean':>6} {'max':>6} {'black%':>7} {'colors':>7}")
    for name, slug, s in rows:
        flag = ""
        if s["mean"] < 2.0:
            flag = "  <-- near-black"
        if s["unique"] < 20:
            flag += "  <-- low variety"
        print(f"{name:42} {s['mean']:6.2f} {s['max']:6.1f} {s['near_black']*100:7.1f} {s['unique']:7d}{flag}")
    if by_slug:
        print("\nerrors:")
        for slug, entry in by_slug.items():
            if entry.get("errors"):
                print(f"  {slug}: {' | '.join(entry['errors'])}")


if __name__ == "__main__":
    main()
