"""
Same purpose as run_one_graph.py, but for a synthetically generated graph
(random_dcr_generator.generate_chain_graph) instead of a Tobias XML file --
used by run_scaling_pilot.py to map where MiniZinc starts failing as a
function of #events, under a controlled, reproducible density profile.

Usage:
    venv/bin/python run_one_generated_graph.py <num_events> [--seed S] [--noise-density D] [--K N]
"""
import sys
import os
import json
import time
import argparse

sys.path.insert(0, os.path.dirname(__file__))

from random_dcr_generator import generate_chain_graph
from tobias_converter import build_extended_graph
import pymzn_MultiObj_AsFunct as solver


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("num_events", type=int)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--noise-density", type=float, default=2.0)
    ap.add_argument("--K", type=int, default=None)
    args = ap.parse_args()

    parsed = generate_chain_graph(args.num_events, seed=args.seed, noise_density=args.noise_density)
    graph = build_extended_graph(parsed, seed=args.seed, K=args.K)

    out = {
        "num_events": graph["num_events"],
        "num_relations": graph["num_relations"],
        "K": graph["K"],
    }

    t0 = time.time()
    try:
        result = solver.solveExtendedDcrGraph(graph)
        out["elapsed_s"] = time.time() - t0
        out["has_solution"] = result.get("hasSolution")
        out["num_pareto_points"] = result.get("numberOfOptimalTraces")
        out["minizinc_solve_s"] = result.get("modelsExecutionTime")
        out["explored_nodes"] = result.get("exploredNodes")
        out["status"] = "solved"
    except Exception as e:
        out["elapsed_s"] = time.time() - t0
        out["status"] = "error"
        out["error"] = repr(e)

    print("RESULT_JSON:" + json.dumps(out))


if __name__ == "__main__":
    main()
