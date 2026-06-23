"""
Runs the MiniZinc CSP+COP Pareto solver on a single Tobias-format DCR graph XML.
Meant to be invoked as a subprocess (optionally under `timeout`) by run_tobias_sweep.py
so that a hung/OOM solve on one graph cannot take down the whole sweep.

Usage:
    cd dcrGraph/source
    venv/bin/python run_one_graph.py <xml_path> [--K N] [--seed S]

Prints a single JSON object to stdout with the result (or an error).
"""
import sys
import os
import json
import time
import argparse

sys.path.insert(0, os.path.dirname(__file__))

from tobias_converter import parse_tobias_xml, build_extended_graph
import pymzn_MultiObj_AsFunct as solver


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xml_path")
    ap.add_argument("--K", type=int, default=None)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    parsed = parse_tobias_xml(args.xml_path)
    graph = build_extended_graph(parsed, seed=args.seed, K=args.K)

    out = {
        "graph": os.path.basename(args.xml_path),
        "num_events": graph["num_events"],
        "num_relations": graph["num_relations"],
        "num_activities": graph["num_activities"],
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

        pareto_front = []
        for acts, cost in zip(result.get("actionsOfTrace", []), result.get("costOfTrace", [])):
            trace = [a for a in acts if a != "dummyAct"]
            pareto_front.append({"cost": cost[0], "duration": cost[1], "trace": trace})
        out["pareto_front"] = pareto_front
    except Exception as e:
        out["elapsed_s"] = time.time() - t0
        out["status"] = "error"
        out["error"] = repr(e)

    print("RESULT_JSON:" + json.dumps(out))


if __name__ == "__main__":
    main()
