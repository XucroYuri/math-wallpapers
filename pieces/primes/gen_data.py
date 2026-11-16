#!/usr/bin/env python3
"""Offline data for the prime-sky wallpaper.

Sieve to 2e6, convolve the primality vector with itself (numpy FFT) to count
Goldbach partitions, and project a sample of primes plus twin-prime pairs onto
a phyllotaxis disk. Outputs data.json next to this script.

    python3 pieces/primes/gen_data.py
"""
import json
import math
import time
from pathlib import Path

import numpy as np

LIMIT = 2_000_000
SEED = 20261116
STAR_COUNT = 12_000
TWIN_CONSTELLATIONS = 1_400
GOLDBACH_SAMPLES = 4_000
GOLDBACH_STEP = 500
GOLDEN = math.pi * (3 - math.sqrt(5))


def sieve(n: int) -> np.ndarray:
    prime = np.ones(n + 1, dtype=bool)
    prime[:2] = False
    for factor in range(2, math.isqrt(n) + 1):
        if prime[factor]:
            prime[factor * factor :: factor] = False
    return prime


def goldbach_counts(prime: np.ndarray) -> np.ndarray:
    """Unordered Goldbach partition counts for every even 2n <= LIMIT, via FFT."""
    nfft = 1
    while nfft <= 2 * LIMIT:
        nfft <<= 1
    spectrum = np.fft.rfft(prime.astype(np.float64), nfft)
    conv = np.rint(np.fft.irfft(spectrum * spectrum, nfft)[: LIMIT + 1]).astype(np.int64)
    even = np.arange(4, LIMIT + 1, 2)
    ordered = conv[even]
    # p == q (2n = 2p) is counted once in the convolution, not twice.
    diagonal = prime[even // 2].astype(np.int64)
    return (ordered + diagonal) // 2, even


def phyllotaxis(count: int, rng: np.random.Generator, phase: float):
    """Golden-angle disk slots with a small deterministic jitter."""
    index = np.arange(count)
    radius = np.sqrt((index + 0.5) / count) * 0.985
    angle = index * GOLDEN + phase
    radius += rng.normal(0, 0.0035, count)
    angle += rng.normal(0, 0.0045, count)
    radius = np.clip(radius, 0.015, 1.0)
    x = radius * np.cos(angle)
    y = radius * np.sin(angle)
    return x, y


def main() -> None:
    started = time.time()
    out_path = Path(__file__).with_name("data.json")

    prime = sieve(LIMIT)
    primes = np.flatnonzero(prime)
    twin_mask = prime[np.minimum(primes + 2, LIMIT)]
    twin_p = primes[twin_mask]
    rng = np.random.default_rng(SEED)

    # A representative sample of twin pairs; the JS reveals a subset by viewport area.
    pair_slots = np.linspace(0, len(twin_p) - 1, TWIN_CONSTELLATIONS, dtype=np.int64)
    constellation_p = twin_p[pair_slots]
    constellation_ends = np.concatenate([constellation_p, constellation_p + 2])

    candidates = np.setdiff1d(primes, constellation_ends, assume_unique=True)
    # Random prime-to-slot assignment keeps brightness independent of radius.
    star_p = rng.choice(candidates, size=STAR_COUNT, replace=False)
    star_x, star_y = phyllotaxis(STAR_COUNT, rng, phase=0.41)

    # Twin pairs become local two-star constellations: a short curved arc with
    # both primes as endpoints. The companion offset keeps every arc local.
    anchor_x, anchor_y = phyllotaxis(TWIN_CONSTELLATIONS, rng, phase=1.73)
    direction = rng.uniform(0, 2 * math.pi, TWIN_CONSTELLATIONS)
    separation = rng.uniform(0.030, 0.062, TWIN_CONSTELLATIONS)
    twin_x1 = anchor_x
    twin_y1 = anchor_y
    twin_x2 = anchor_x + separation * np.cos(direction)
    twin_y2 = anchor_y + separation * np.sin(direction)
    # Pull endpoints that drift past the rim back inside.
    end_r = np.hypot(twin_x2, twin_y2)
    scale = np.where(end_r > 1.02, 1.02 / end_r, 1.0)
    twin_x2 *= scale
    twin_y2 *= scale

    counts, even = goldbach_counts(prime)
    sample_m = 4 + np.arange(GOLDBACH_SAMPLES, dtype=np.int64) * GOLDBACH_STEP
    sample_counts = counts[(sample_m - 4) // 2]

    def rounded(values: np.ndarray) -> list[float]:
        return [round(float(v), 4) for v in values]

    data = {
        "meta": {
            "seed": SEED,
            "primeLimit": LIMIT,
            "primeCount": int(len(primes)),
            "twinCount": int(len(twin_p)),
            "goldbachSamples": GOLDBACH_SAMPLES,
            "goldbachMax": int(counts.max()),
            "constellations": TWIN_CONSTELLATIONS,
        },
        "stars": {
            "p": [int(v) for v in star_p],
            "x": rounded(star_x),
            "y": rounded(star_y),
        },
        "twins": {
            "p": [int(v) for v in constellation_p],
            "x1": rounded(twin_x1),
            "y1": rounded(twin_y1),
            "x2": rounded(twin_x2),
            "y2": rounded(twin_y2),
        },
        "goldbach": {
            "start": 4,
            "step": GOLDBACH_STEP,
            "counts": [int(v) for v in sample_counts],
        },
    }
    out_path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    size = out_path.stat().st_size
    print(
        f"wrote {out_path} ({size / 1024:.0f} KiB): "
        f"{len(primes)} primes, {len(twin_p)} twin pairs, "
        f"{STAR_COUNT} stars, {TWIN_CONSTELLATIONS} constellations, "
        f"goldbach max {counts.max()} in {time.time() - started:.2f}s"
    )


if __name__ == "__main__":
    main()
