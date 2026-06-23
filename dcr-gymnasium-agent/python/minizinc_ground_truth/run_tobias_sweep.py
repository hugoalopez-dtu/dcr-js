"""
Fase 1 -- MiniZinc feasibility sweep over the Tobias mined-graph benchmark set.

For each graph (small -> large), converts it, assigns synthetic cost/duration
(seed=1), and runs the CSP+COP Pareto solver under a hard wall-clock timeout in
a subprocess, so a graph that hangs or OOMs cannot block the rest of the sweep.

Usage:
    cd dcrGraph/source
    venv/bin/python run_tobias_sweep.py <graphs_dir> [--timeout 300]
"""
import sys
import os
import json
import time
import signal
import argparse
import subprocess

GRAPH_ORDER = [
    "04 BPI Challenge 2013 - Incidents.xml",
    "01 Data-Driven Process Discover - Artificial Event Log - 0 Noise.xml",
    "05 Synthetic Event Logs - Review Example Large.xml",
    "03 BPI Challenge 2020 - Request For Payment.xml",
    "11 BPI Challenge 2019.xml",
    "09 Large Bank Transaction Process - All Without Noise.xml",
]


def run_graph(graphs_dir, filename, timeout_s, venv_python):
    path = os.path.join(graphs_dir, filename)
    here = os.path.dirname(os.path.abspath(__file__))
    cmd = [venv_python, "run_one_graph.py", path]
    t0 = time.time()
    row = {"graph": filename}
    proc = subprocess.Popen(cmd, cwd=here, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, start_new_session=True)
    try:
        stdout, stderr = proc.communicate(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        proc.wait()
        # fzn-gecode is spawned by the minizinc CLI in its own process group on
        # macOS, so killpg above doesn't reach it -- sweep it up separately.
        subprocess.run(["pkill", "-9", "-f", "fzn-gecode"], capture_output=True)
        row["status"] = "timeout"
        row["wall_s"] = round(time.time() - t0, 1)
        return row
    elapsed = time.time() - t0
    row["wall_s"] = round(elapsed, 1)

    json_line = None
    for line in stdout.splitlines():
        if line.startswith("RESULT_JSON:"):
            json_line = line[len("RESULT_JSON:"):]
            break

    if json_line is None:
        row["status"] = "error"
        row["error"] = (stderr or stdout)[-2000:]
        return row

    parsed = json.loads(json_line)
    row.update(parsed)
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("graphs_dir")
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--venv-python", default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "venv", "bin", "python3"))
    args = ap.parse_args()

    results = []
    for filename in GRAPH_ORDER:
        path = os.path.join(args.graphs_dir, filename)
        if not os.path.exists(path):
            print(f"SKIP (not found): {filename}")
            continue
        print(f"=== Running {filename} (timeout={args.timeout}s) ===", flush=True)
        row = run_graph(args.graphs_dir, filename, args.timeout, args.venv_python)
        print(json.dumps(row, indent=2), flush=True)
        results.append(row)

    print("\n\n=== SUMMARY TABLE ===")
    header = ["graph", "act", "rel", "density", "status", "time_s", "pareto_pts"]
    print(" | ".join(header))
    for r in results:
        act = r.get("num_events", "?")
        rel = r.get("num_relations", "?")
        density = round(rel / act, 1) if isinstance(act, int) and isinstance(rel, int) and act else "?"
        time_s = r.get("minizinc_solve_s", r.get("wall_s", "?"))
        pareto = r.get("num_pareto_points", "-")
        print(" | ".join(str(x) for x in [r["graph"], act, rel, density, r["status"], time_s, pareto]))

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tobias_sweep_results.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results written to {out_path}")


if __name__ == "__main__":
    main()
