#!/usr/bin/env python3
"""Generate the fixed-seed TSP instance used by 巡回者的困境.

The initial tour is a nearest-neighbour tour deliberately tangled with 60
random segment reversals.  It is then improved with greedy 2-opt moves (best
improving move over a 14-nearest-neighbour candidate set), recording 200
accepted moves and a checkpoint tour every 10 moves.

Every accepted move swaps the two boundary edges of a reversed segment, so
the undirected edge set changes by exactly four entries (two removed, two
added).

The lower bound is the Euclidean MST weight.  For any tour, deleting one edge
leaves a spanning tree, so MST <= optimal tour <= tour.  It is a valid but
loose bound; the gap is reported as (tour - MST) / MST.
"""

import json
import math
import random
import time
from pathlib import Path

SEED = 20261116
N = 800
MOVES = 200
CHECKPOINT_EVERY = 10
K_NEAREST = 14
PERTURBATIONS = 60
MARGIN = 0.025


def build_points():
    rng = random.Random(SEED)
    return [
        (
            rng.uniform(MARGIN, 1.0 - MARGIN),
            rng.uniform(MARGIN, 1.0 - MARGIN),
        )
        for _ in range(N)
    ]


def distance_matrix(points):
    n = len(points)
    dist = [[0.0] * n for _ in range(n)]
    for a in range(n):
        ax, ay = points[a]
        row = dist[a]
        for b in range(a + 1, n):
            bx, by = points[b]
            d = math.hypot(ax - bx, ay - by)
            row[b] = d
            dist[b][a] = d
    return dist


def nearest_neighbour_tour(dist, start):
    n = len(dist)
    tour = [start]
    unvisited = set(range(n))
    unvisited.remove(start)
    while unvisited:
        a = tour[-1]
        row = dist[a]
        b = min(unvisited, key=lambda city: row[city])
        tour.append(b)
        unvisited.remove(b)
    return tour


def perturb_tour(tour, count, seed):
    """Reverse random segments to make the initial tour visibly tangled."""
    n = len(tour)
    rng = random.Random(seed)
    out = list(tour)
    applied = 0
    attempts = 0
    while applied < count and attempts < count * 40:
        attempts += 1
        i = rng.randrange(n)
        j = rng.randrange(n)
        if i > j:
            i, j = j, i
        if j - i < 2 or (i == 0 and j == n - 1):
            continue
        out[i + 1 : j + 1] = out[i + 1 : j + 1][::-1]
        applied += 1
    if applied < count:
        raise RuntimeError(f"only applied {applied}/{count} perturbations")
    return out


def tour_length(tour, dist):
    n = len(tour)
    return sum(dist[tour[i]][tour[(i + 1) % n]] for i in range(n))


def mst_weight(points, dist):
    """Prim's algorithm on the complete Euclidean graph."""
    n = len(points)
    inf = float("inf")
    best = [inf] * n
    used = [False] * n
    best[0] = 0.0
    total = 0.0
    for _ in range(n):
        u = -1
        low = inf
        for i in range(n):
            if not used[i] and best[i] < low:
                low = best[i]
                u = i
        used[u] = True
        total += low
        row = dist[u]
        for i in range(n):
            if not used[i] and row[i] < best[i]:
                best[i] = row[i]
    return total


def nearest_neighbours(dist, k):
    n = len(dist)
    out = []
    for a in range(n):
        row = dist[a]
        order = sorted(range(n), key=lambda b: (row[b], b))
        out.append([b for b in order if b != a][:k])
    return out


def optimize(points, dist, initial, moves):
    n = len(points)
    tour = list(initial)
    pos = [0] * n
    for i, city in enumerate(tour):
        pos[city] = i
    nbr = nearest_neighbours(dist, K_NEAREST)

    length = tour_length(tour, dist)
    steps = []
    checkpoints = [
        {"step": 0, "length": round(length, 5), "tour": list(tour)}
    ]
    started = time.time()

    while len(steps) < moves:
        best_delta = 0.0
        best_i = -1
        best_j = -1
        for a in range(n):
            ia = pos[a]
            row = dist[a]
            for c in nbr[a]:
                ic = pos[c]
                i, j = (ia, ic) if ia < ic else (ic, ia)
                if j - i < 2 or (i == 0 and j == n - 1):
                    continue
                ea = tour[i]
                eb = tour[i + 1]
                ec = tour[j]
                ed = tour[(j + 1) % n]
                if ea == ec or eb == ed:
                    continue
                delta = dist[ea][ec] + dist[eb][ed] - dist[ea][eb] - dist[ec][ed]
                if delta < best_delta - 1e-12:
                    best_delta = delta
                    best_i = i
                    best_j = j

        if best_i < 0:
            raise RuntimeError(f"no improving 2-opt move after {len(steps)} moves")

        i, j = best_i, best_j
        tour[i + 1 : j + 1] = tour[i + 1 : j + 1][::-1]
        for k in range(i + 1, j + 1):
            pos[tour[k]] = k

        length += best_delta
        steps.append([i, j, round(length, 5)])

        if len(steps) % CHECKPOINT_EVERY == 0:
            actual = tour_length(tour, dist)
            if abs(actual - length) > 1e-8:
                raise RuntimeError(
                    f"length drift at step {len(steps)}: {length} vs {actual}"
                )
            checkpoints.append(
                {
                    "step": len(steps),
                    "length": round(actual, 5),
                    "tour": list(tour),
                }
            )
            if len(steps) % 100 == 0:
                print(
                    f"  {len(steps):3d} moves  length={actual:7.3f}  "
                    f"({time.time() - started:5.1f}s)",
                    flush=True,
                )

    return tour, length, steps, checkpoints


def main():
    t0 = time.time()
    print(f"seed={SEED} n={N} moves={MOVES}", flush=True)
    points = build_points()
    dist = distance_matrix(points)
    print("distance matrix done", flush=True)

    start_rng = random.Random(SEED + 7)
    start = start_rng.randrange(N)
    initial = perturb_tour(
        nearest_neighbour_tour(dist, start),
        PERTURBATIONS,
        SEED + 99 + PERTURBATIONS,
    )
    initial_length = tour_length(initial, dist)
    lower_bound = mst_weight(points, dist)
    print(
        f"initial={initial_length:.3f}  MST={lower_bound:.3f}  "
        f"initial gap={(initial_length - lower_bound) / lower_bound:.3f}",
        flush=True,
    )

    final, final_length, steps, checkpoints = optimize(
        points, dist, initial, MOVES
    )
    final_gap = (final_length - lower_bound) / lower_bound
    print(
        f"final={final_length:.3f}  gap={final_gap:.3f}  "
        f"checkpoints={len(checkpoints)}  {time.time() - t0:.1f}s",
        flush=True,
    )

    data = {
        "seed": SEED,
        "n": N,
        "points": [[round(x, 5), round(y, 5)] for x, y in points],
        "initialTour": initial,
        "steps": steps,
        "checkpointStep": CHECKPOINT_EVERY,
        "checkpoints": checkpoints,
        "lowerBound": round(lower_bound, 5),
        "lowerBoundMethod": "Euclidean MST",
        "initialLength": round(initial_length, 5),
        "finalLength": round(final_length, 5),
    }

    out = Path(__file__).with_name("data.json")
    text = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    out.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KiB)", flush=True)


if __name__ == "__main__":
    main()
