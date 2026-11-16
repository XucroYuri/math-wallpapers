#!/usr/bin/env python3
"""Offline data for the Riemann critical-line wallpaper.

Writes data.json:
  curve.re/im    zeta(1/2 + i t), t in [0, 80], 2800 samples
  zeros          first 50 nontrivial zero imaginary parts
  psi.x/stairs   exact Chebyshev psi(x) on [2, 50]
  psi.partials   explicit-formula partial sums, K = 0..50 zeros
"""

import json
import math
import os
import time

import mpmath as mp
import numpy as np

mp.mp.dps = 18

T_MIN = 0.0
T_MAX = 80.0
N_CURVE = 2800
N_ZEROS = 50

X_MIN = 2.0
X_MAX = 50.0
N_UNIFORM = 420
JUMP_EPS = 1e-4

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")


def prime_powers(limit):
    """Sorted (n, log p) for prime powers n <= limit."""
    sieve = bytearray([1]) * (limit + 1)
    sieve[0:2] = b"\x00\x00"
    for p in range(2, int(limit ** 0.5) + 1):
        if sieve[p]:
            sieve[p * p : limit + 1 : p] = b"\x00" * ((limit - p * p) // p + 1)
    out = []
    for p in range(2, limit + 1):
        if not sieve[p]:
            continue
        pk = p
        while pk <= limit:
            out.append((pk, math.log(p)))
            pk *= p
    return sorted(out)


def psi_grid():
    powers = prime_powers(int(X_MAX))
    values = np.array([n for n, _ in powers], dtype=float)
    totals = np.cumsum([l for _, l in powers])

    xs = set()
    for i in range(N_UNIFORM):
        x = X_MIN + (X_MAX - X_MIN) * i / (N_UNIFORM - 1)
        xs.add(round(x, 5))
    for n, _ in powers:
        if X_MIN < n <= X_MAX:
            xs.add(round(n - JUMP_EPS, 5))
            xs.add(round(float(n), 5))
    xs.add(X_MIN)
    xs.add(X_MAX)
    x = np.array(sorted(xs), dtype=float)

    idx = np.searchsorted(values, x, side="right") - 1
    stairs = np.where(idx >= 0, totals[np.maximum(idx, 0)], 0.0)
    return x, stairs, powers


def main():
    started = time.time()

    curve_re = np.empty(N_CURVE)
    curve_im = np.empty(N_CURVE)
    dt = (T_MAX - T_MIN) / (N_CURVE - 1)
    for i in range(N_CURVE):
        z = mp.zeta(mp.mpc(0.5, T_MIN + i * dt))
        curve_re[i] = float(z.real)
        curve_im[i] = float(z.imag)
    print(f"curve: {N_CURVE} points in {time.time() - started:.1f}s")

    zeros = [float(mp.zetazero(n).imag) for n in range(1, N_ZEROS + 1)]
    zeros.sort()
    print(f"zeros: first {zeros[0]:.6f}, last {zeros[-1]:.6f}")

    x, stairs, powers = psi_grid()
    base = (
        x
        - math.log(2.0 * math.pi)
        - 0.5 * np.log1p(-1.0 / (x * x))
    )

    partials = np.empty((N_ZEROS + 1, len(x)))
    partials[0] = base
    for j, gamma in enumerate(zeros):
        rho = mp.mpc(0.5, gamma)
        terms = np.empty(len(x))
        for i, xi in enumerate(x):
            z = mp.exp(rho * mp.log(mp.mpf(float(xi)))) / rho
            terms[i] = 2.0 * float(z.real)
        partials[j + 1] = partials[j] - terms

    err = np.abs(partials[N_ZEROS] - stairs)
    print(
        f"psi: {len(x)} x-samples, {len(powers)} prime powers, "
        f"K=50 max|err|={err.max():.3f}, mean|err|={err.mean():.3f}"
    )

    def r5(v):
        return [round(float(a), 5) for a in v]

    def r3(v):
        return [round(float(a), 3) for a in v]

    data = {
        "meta": {
            "curvePoints": N_CURVE,
            "tMin": T_MIN,
            "tMax": T_MAX,
            "zeroCount": N_ZEROS,
            "xSamples": len(x),
            "dps": mp.mp.dps,
        },
        "curve": {
            "t0": T_MIN,
            "dt": round(dt, 8),
            "re": r5(curve_re),
            "im": r5(curve_im),
        },
        "zeros": [round(z, 6) for z in zeros],
        "psi": {
            "x": [round(float(a), 5) for a in x],
            "stairs": r3(stairs),
            "partials": [r3(row) for row in partials],
        },
    }

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KiB) in {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()
