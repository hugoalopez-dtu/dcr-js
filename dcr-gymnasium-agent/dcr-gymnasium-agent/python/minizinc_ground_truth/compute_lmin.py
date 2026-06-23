"""
Computes L_min (length of the shortest accepting trace) for a Tobias-format
mined DCR graph, via plain BFS over the DCR marking semantics -- no MiniZinc
involved, since this is a reachability question (shortest path), not an
optimization one, and is far cheaper than the Pareto branch-and-bound search.

Semantics mirror DcrGraph_Extended.mzn exactly:
  - executed is monotonic (once true, stays true)
  - pending is only ever set by a firing response, never cleared on execution
    (acceptance instead exempts already-executed events from the pending check)
  - exclude(e,t) is skipped if the same (e,t) pair is also an include relation
    (include always wins when both fire from the same source event)
  - accepting iff no event is included AND pending AND not-yet-executed

Usage:
    cd dcrGraph/source
    venv/bin/python compute_lmin.py <xml_path> [--max-states N] [--timeout-s T]
"""
import sys
import os
import time
import argparse
from collections import deque

sys.path.insert(0, os.path.dirname(__file__))
from tobias_converter import parse_tobias_xml


def compute_lmin(parsed, max_states=2_000_000, timeout_s=120, min_real_events=0):
    event_ids = parsed["event_ids"]
    im = parsed["initial_marking"]

    conditions_by_target = {}
    responses_by_source = {}
    excludes_by_source = {}
    includes_by_source = {}
    include_pairs = set()

    for rtype, src, tgt in parsed["relations"]:
        if rtype == "condition":
            conditions_by_target.setdefault(tgt, []).append(src)
        elif rtype == "response":
            responses_by_source.setdefault(src, []).append(tgt)
        elif rtype == "exclude":
            excludes_by_source.setdefault(src, []).append(tgt)
        elif rtype == "include":
            includes_by_source.setdefault(src, []).append(tgt)
            include_pairs.add((src, tgt))

    init_included = frozenset(e for e in event_ids if im[e]["included"])
    init_executed = frozenset(e for e in event_ids if im[e]["executed"])
    init_obligated = frozenset(
        e for e in event_ids if im[e]["pending"] and e not in init_executed
    )

    def is_accepting(included, obligated):
        return not any(e in included for e in obligated)

    def is_enabled(e, included, executed):
        if e not in included:
            return False
        for src in conditions_by_target.get(e, []):
            if src not in executed and src in included:
                return False
        return True

    def fire(e, included, executed, obligated):
        new_executed = executed | {e}
        new_obligated = obligated - {e}
        for tgt in responses_by_source.get(e, []):
            if tgt not in new_executed:
                new_obligated = new_obligated | {tgt}

        new_included = set(included)
        for tgt in excludes_by_source.get(e, []):
            if (e, tgt) not in include_pairs:
                new_included.discard(tgt)
        for tgt in includes_by_source.get(e, []):
            new_included.add(tgt)

        return frozenset(new_included), new_executed, new_obligated

    start = (init_included, init_executed, init_obligated)
    if min_real_events == 0 and is_accepting(start[0], start[2]):
        return {"l_min": 0, "trace": [], "states_explored": 1, "status": "found"}

    visited = {start}
    frontier = deque([(start, [])])
    t0 = time.time()
    states_explored = 1

    while frontier:
        if time.time() - t0 > timeout_s:
            return {"l_min": None, "status": "timeout", "states_explored": states_explored}
        if states_explored > max_states:
            return {"l_min": None, "status": "max_states_exceeded", "states_explored": states_explored}

        (included, executed, obligated), trace = frontier.popleft()

        for e in event_ids:
            if not is_enabled(e, included, executed):
                continue
            new_state = fire(e, included, executed, obligated)
            new_trace = trace + [e]
            if len(new_trace) >= min_real_events and is_accepting(new_state[0], new_state[2]):
                return {
                    "l_min": len(new_trace),
                    "trace": new_trace,
                    "states_explored": states_explored,
                    "status": "found",
                }
            if new_state not in visited:
                visited.add(new_state)
                states_explored += 1
                frontier.append((new_state, new_trace))

    return {"l_min": None, "status": "unreachable", "states_explored": states_explored}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xml_path")
    ap.add_argument("--max-states", type=int, default=2_000_000)
    ap.add_argument("--timeout-s", type=float, default=120)
    ap.add_argument("--min-real-events", type=int, default=0,
                     help="force at least N real (non-dummy) events before accepting -- "
                          "mirrors the MiniZinc model, which can't represent the empty trace")
    args = ap.parse_args()

    parsed = parse_tobias_xml(args.xml_path)
    descriptions = parsed["descriptions"]
    t0 = time.time()
    result = compute_lmin(parsed, max_states=args.max_states, timeout_s=args.timeout_s,
                           min_real_events=args.min_real_events)
    result["elapsed_s"] = round(time.time() - t0, 2)
    result["graph"] = os.path.basename(args.xml_path)
    result["num_events"] = len(parsed["event_ids"])
    if result.get("trace"):
        result["trace_labels"] = [descriptions[e] for e in result["trace"]]

    import json
    print("RESULT_JSON:" + json.dumps(result))


if __name__ == "__main__":
    main()
