"""
MiniZinc-side half of the scaling study: for each #events in a list, generate
a controlled chain+noise graph (random_dcr_generator) and run the CSP+COP
Pareto solver under a hard timeout, exactly like run_tobias_sweep.py did for
the real mined graphs. Finds the #events at which MiniZinc starts failing.

Usage:
    venv/bin/python run_scaling_minizinc.py 20 40 60 80 100 --timeout 300
"""
import os
import sys
import json
import time
import signal
import argparse
import subprocess


def run_one(num_events, timeout_s, venv_python, seed=1, noise_density=2.0):
    here = os.path.dirname(os.path.abspath(__file__))
    cmd = [venv_python, "run_one_generated_graph.py", str(num_events),
           "--seed", str(seed), "--noise-density", str(noise_density)]
    t0 = time.time()
    row = {"num_events": num_events}
    proc = subprocess.Popen(cmd, cwd=here, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, start_new_session=True)
    try:
        stdout, stderr = proc.communicate(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        proc.wait()
        subprocess.run(["pkill", "-9", "-f", "fzn-gecode"], capture_output=True)
        row["status"] = "timeout"
        row["wall_s"] = round(time.time() - t0, 1)
        return row
    row["wall_s"] = round(time.time() - t0, 1)

    json_line = None
    for line in stdout.splitlines():
        if line.startswith("RESULT_JSON:"):
            json_line = line[len("RESULT_JSON:"):]
            break
    if json_line is None:
        row["status"] = "error"
        row["error"] = (stderr or stdout)[-2000:]
        return row
    row.update(json.loads(json_line))
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("event_counts", type=int, nargs="+")
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--noise-density", type=float, default=2.0)
    ap.add_argument("--venv-python", default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "venv", "bin", "python3"))
    args = ap.parse_args()

    results = []
    for n in args.event_counts:
        print(f"=== N={n} (timeout={args.timeout}s) ===", flush=True)
        row = run_one(n, args.timeout, args.venv_python, seed=args.seed,
                      noise_density=args.noise_density)
        print(json.dumps(row, indent=2), flush=True)
        results.append(row)

    print("\n=== SUMMARY ===")
    print("N | relations | status | time_s | pareto_pts")
    for r in results:
        time_s = r.get("minizinc_solve_s", r.get("wall_s", "?"))
        print(f"{r['num_events']} | {r.get('num_relations','?')} | {r['status']} | {time_s} | {r.get('num_pareto_points','-')}")

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scaling_minizinc_results.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nWritten: {out_path}")


if __name__ == "__main__":
    main()
