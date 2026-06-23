"""
Run Diaz et al. CSP+COP solver on the Loan Application graph (flat cost/duration,
no role choice) to obtain a ground-truth Pareto front comparable to the one already
established for Expense Report, closing the asymmetry in Chapter 6 where Expense
Report has a "Ground Truth and Baseline Comparison" subsection and Loan Application
does not.

Reuses the deadline-aware enumeration loop from run_graph09_incumbent.py (so a 300s
budget retains the best incumbent front instead of losing everything on a hard kill),
but with dcrjs_converter (real cost/duration values parsed from the XML) instead of
tobias_converter (synthetic cost/duration assignment for the unrelated mined-graph
format).

Usage:
    cd dcrGraph/source
    venv/bin/python run_loanapp_ground_truth.py <xml_path> [--K N] [--timeout 300]
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from minizinc import Instance, Model, Solver, Status, Result
from dcrjs_converter import parse_dcrjs_xml, build_extended_graph


def pareto_filter_alphas(alphas, traces, acts_of_trace):
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
        return {"hasSolution": False, "hitDeadline": False, "iterations": 0,
                "elapsed_s": time.time() - t0}

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
    ap.add_argument("--K", type=int, default=None)
    ap.add_argument("--timeout", type=int, default=300)
    args = ap.parse_args()

    parsed = parse_dcrjs_xml(args.xml_path)
    graph = build_extended_graph(parsed, K=args.K)

    print("=" * 60)
    print(f"Loan Application ground truth -- {os.path.basename(args.xml_path)}")
    print(f"events={graph['num_events']} relations={graph['num_relations']} "
          f"activities={graph['num_activities']} K={graph['K']}")
    print("Objectives: minimize cost (flat, no role choice) and duration")
    print("=" * 60)

    out = {
        "graph": os.path.basename(args.xml_path),
        "num_events": graph["num_events"],
        "num_relations": graph["num_relations"],
        "K": graph["K"],
    }
    out.update(solve_with_deadline(graph, args.timeout))
    print("RESULT_JSON:" + json.dumps(out))

    print(f"\nElapsed: {out['elapsed_s']:.2f}s  hitDeadline={out['hitDeadline']}  "
          f"iterations={out.get('iterations')}  candidatesFound={out.get('candidatesFound')}")
    print(f"Pareto points: {len(out.get('pareto_front', []))}")
    for p in out.get("pareto_front", []):
        print(f"  cost={p['cost']:<6} duration={p['duration']:<6} trace={p['trace']}")

    out_path = os.path.join(os.path.dirname(__file__), "loanapp_ground_truth_result.json")
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
