"""
Capture MiniZinc's best-found-so-far solution set for graph 09 within a wall-clock
deadline, instead of hard-killing the process at timeout (which discards everything,
as run_one_graph.py / run_tobias_sweep.py do).

solveExtendedDcrGraph's enumeration loop (pymzn_MultiObj_AsFunct.py) repeatedly finds
a new feasible trace that improves on at least one objective over the previous one,
branches to exclude it, and resolves -- accumulating a growing list of candidate
(trace, cost) pairs. The original code only stops on UNSAT (proven complete
enumeration) or a 5250-iteration cap, then MiniZinc-filters the accumulated list for
Pareto-optimality. This script adds a deadline check inside that same loop: if the
deadline is hit, it breaks out of the SAT loop (instead of being killed) and Pareto-
filters whatever was accumulated so far in plain Python, returning that as an honest
"best incumbent front within budget" -- not a proven-optimal front, but a real,
non-empty comparison point for graph 09, where the standard sweep recorded nothing.

Usage:
    cd dcrGraph/source
    venv/bin/python run_graph09_incumbent.py <xml_path> --timeout 300
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from minizinc import Instance, Model, Solver, Status, Result
from tobias_converter import parse_tobias_xml, build_extended_graph


def pareto_filter_alphas(alphas, traces, acts_of_trace):
    """Minimisation on every feature; plain Python, no MiniZinc round-trip."""
    n = len(alphas)
    keep = []
    for i in range(n):
        dominated = False
        for j in range(n):
            if i == j:
                continue
            if all(alphas[j][f] <= alphas[i][f] for f in range(len(alphas[i]))) and \
               any(alphas[j][f] < alphas[i][f] for f in range(len(alphas[i]))):
                dominated = True
                break
        if not dominated:
            keep.append(i)
    # de-duplicate identical cost/duration pairs, keep first occurrence
    seen = set()
    front = []
    for i in keep:
        key = tuple(alphas[i])
        if key in seen:
            continue
        seen.add(key)
        front.append({
            "cost": alphas[i][0],
            "duration": alphas[i][1],
            "trace": [a for a in acts_of_trace[i] if a != "dummyAct"],
        })
    return front


def solve_with_deadline(extended_graph, deadline_s):
    DcrModel = Model("./DcrGraph/DcrGraph_Extended.mzn")
    gecode = Solver.lookup("gecode")
    dcrInstance = Instance(gecode, DcrModel)

    dcrInstance["K"] = extended_graph["K"]
    dcrInstance["feats"] = extended_graph["feats"]
    dcrInstance["events"] = extended_graph["events"]
    dcrInstance["InitialM"] = extended_graph["InitialM"]
    dcrInstance["Act"] = extended_graph["Act"]
    dcrInstance["conditions"] = extended_graph["conditions"]
    dcrInstance["numConditions"] = len(extended_graph["conditions"])
    dcrInstance["responses"] = extended_graph["responses"]
    dcrInstance["numResponses"] = len(extended_graph["responses"])
    dcrInstance["inclusions"] = extended_graph["inclusions"]
    dcrInstance["numInclusions"] = len(extended_graph["inclusions"])
    dcrInstance["exclusions"] = extended_graph["exclusions"]
    dcrInstance["numExclusions"] = len(extended_graph["exclusions"])
    dcrInstance["l"] = extended_graph["l"]
    dcrInstance["agg"] = extended_graph["agg"]
    dcrInstance["cost"] = extended_graph["cost"]

    t0 = time.time()
    deadline = t0 + deadline_s

    dcrResult: Result = dcrInstance.solve()
    if dcrResult.status != Status.SATISFIED:
        return {"hasSolution": False, "hitDeadline": False, "iterations": 0}

    fts = extended_graph["feats"]
    traces, alphas, acts_of_trace = [], [], []
    count = 1
    hit_deadline = False
    while dcrResult.status == Status.SATISFIED and count < 5250:
        if time.time() >= deadline:
            hit_deadline = True
            break
        traces.append(dcrResult["trace"])
        acts_of_trace.append(dcrResult["ActsOfTrace"])
        alphas.append(dcrResult["alpha"])
        count += 1
        with dcrInstance.branch() as child:
            constraintBetterFeat = f"constraint (alpha[{fts[0]}] < {dcrResult['alpha'][0]})"
            for i in range(len(fts) - 1):
                constraintBetterFeat += f" \\/ (alpha[{fts[i+1]}] < {dcrResult['alpha'][i+1]})"
            constraintBetterFeat += ";\n "
            child.add_string(constraintBetterFeat)
            child.add_string(f"constraint trace != {dcrResult['trace']}; \n")
            remaining = max(0.1, deadline - time.time())
            try:
                dcrResult = child.solve()
            except Exception:
                hit_deadline = True
                break
            if dcrResult.solution is not None:
                dcrInstance = child

    front = pareto_filter_alphas(alphas, traces, acts_of_trace) if alphas else []
    return {
        "hasSolution": len(front) > 0,
        "hitDeadline": hit_deadline,
        "provenOptimal": not hit_deadline,
        "iterations": count,
        "candidatesFound": len(alphas),
        "elapsed_s": time.time() - t0,
        "pareto_front": front,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xml_path")
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    parsed = parse_tobias_xml(args.xml_path)
    graph = build_extended_graph(parsed, seed=args.seed, K=None)

    out = {
        "graph": os.path.basename(args.xml_path),
        "num_events": graph["num_events"],
        "K": graph["K"],
    }
    out.update(solve_with_deadline(graph, args.timeout))
    print("RESULT_JSON:" + json.dumps(out))

    out_path = os.path.join(os.path.dirname(__file__), "graph09_incumbent_result.json")
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
