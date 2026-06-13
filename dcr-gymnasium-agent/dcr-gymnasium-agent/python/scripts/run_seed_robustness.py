"""
Seed robustness for tab:seed_variance (sec:policy_generalisation).

Retrain the 6 headline (alpha, beta) configs on the CALIBRATION-parameterised
LoanApp_junior_senior graph, with the exact protocol of Analysis 2 (Safe RL /
shield ON, 100k timesteps, ent_coef=0.1), for seeds s=2, s=3, s=4.
(s=1 results are reused from the existing GenGap_s1_* training runs.)

No evaluation step here -- the metrics for tab:seed_variance (final illegal
rate, Pareto points, mean cost/duration) are extracted from the per-episode
train_trace_exp_*.csv that train_agent.py already writes, via seed_metrics.py.

Like run_generalisation_gap.py, the cluster appears to kill jobs after
~12-13 min regardless of -W, so this script trains ONE (seed, config) pair
per invocation (the first not-yet-trained one) and exits; submit_seedrob.sh
self-resubmits until all 18 runs (3 seeds x 6 configs) are done.

Run on the cluster:
  cd dcr-gymnasium-agent/dcr-gymnasium-agent/python
  python scripts/run_seed_robustness.py
"""
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[4]  # repo root
NODE_ADAPTER_DIR = ROOT / "node-adapter"
PYTHON_PROJECT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = Path(__file__).resolve().parent
GAP_DIR = SCRIPTS_DIR / "logs" / "generalisation_gap"
MODELS_DIR = PYTHON_PROJECT_DIR / "models" / "seed_robustness"
TRAIN_LOGS_DIR = PYTHON_PROJECT_DIR / "models" / "scripts" / "logs"
TENSORBOARD_DIR = ROOT / "dcr_tensorboard"
PORT = "5001"
NODE_URL = f"http://localhost:{PORT}"

CALIB_XML = GAP_DIR / "LoanApp_junior_senior_calib.xml"

TOTAL_STEPS = int(os.environ.get("DCR_STEPS", 100000))
ENT_COEF = float(os.environ.get("DCR_ENT_COEF", 0.1))

SEEDS = [int(s) for s in os.environ.get("DCR_SEEDS", "2,3,4").split(",")]

PARETO_WEIGHTS = [
    (0.0, 0.0),
    (1.0, 0.0),
    (0.0, 1.0),
    (0.5, 0.5),
    (2.0, 0.5),
    (0.5, 2.0),
]


def weight_tag(alpha, beta):
    return f"a{alpha}_b{beta}".replace(".", "p")


def free_adapter_port():
    subprocess.run(
        f"lsof -ti:{PORT} | xargs -r kill -9", shell=True, check=False
    )
    time.sleep(1)


def wait_for_adapter(url, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.post(f"{url}/reset", timeout=2)
            if r.ok:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def start_adapter(xml_path, alpha, beta, run_log: Path):
    free_adapter_port()
    env = os.environ.copy()
    env["DCR_XML"] = str(xml_path)
    env["PORT"] = PORT
    env["COST_WEIGHT"] = str(alpha)
    env["DURATION_WEIGHT"] = str(beta)
    env["STEP_PENALTY"] = "-1.5"
    env["MAX_EPISODE_STEPS"] = "300"
    lf = open(run_log, "a")
    proc = subprocess.Popen(
        ["node", "dist/server.mjs"],
        cwd=str(NODE_ADAPTER_DIR), env=env, stdout=lf, stderr=subprocess.STDOUT,
    )
    if not wait_for_adapter(NODE_URL):
        proc.kill()
        proc.wait()
        lf.close()
        raise RuntimeError("node-adapter did not become healthy in time")
    return proc, lf


def stop_adapter(proc, lf):
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    lf.close()
    free_adapter_port()


def run_config(seed, alpha, beta):
    tag = weight_tag(alpha, beta)
    exp_id = f"Seed_s{seed}_{tag}"
    run_log = MODELS_DIR / f"run_{exp_id}_{int(time.time())}.log"
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n=== Seed robustness: seed={seed} alpha={alpha} beta={beta} ===")

    proc, lf = start_adapter(CALIB_XML, alpha, beta, run_log)
    try:
        train_cmd = [
            sys.executable, "src/agents/train_agent.py",
            "--exp-id", exp_id,
            "--steps", str(TOTAL_STEPS),
            "--node-url", NODE_URL,
            "--out-dir", str(MODELS_DIR),
            "--tb-log-dir", str(TENSORBOARD_DIR),
            "--ent-coef", str(ENT_COEF),
            "--seed", str(seed),
        ]
        env = os.environ.copy()
        env["DCR_XML"] = str(CALIB_XML)
        env["COST_WEIGHT"] = str(alpha)
        env["DURATION_WEIGHT"] = str(beta)
        ret = subprocess.run(train_cmd, cwd=str(PYTHON_PROJECT_DIR), env=env, stderr=subprocess.STDOUT)
        if ret.returncode != 0:
            raise RuntimeError(f"Training failed for {exp_id}")
    finally:
        stop_adapter(proc, lf)

    print(f"[DONE] {exp_id}")


MIN_COMPLETE_LINES = 90000  # full run = TOTAL_STEPS rows + header, ~100353 for 100k steps


def is_done(seed, alpha, beta):
    tag = weight_tag(alpha, beta)
    exp_id = f"Seed_s{seed}_{tag}"
    for f in TRAIN_LOGS_DIR.glob(f"train_trace_exp_{exp_id}_*.csv"):
        with open(f) as fh:
            n_lines = sum(1 for _ in fh)
        if n_lines >= MIN_COMPLETE_LINES:
            return True
    return False


def main():
    assert CALIB_XML.exists(), "Calibration XML not found — run generate_generalisation_xmls.py first."
    TENSORBOARD_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    for seed in SEEDS:
        for alpha, beta in PARETO_WEIGHTS:
            if is_done(seed, alpha, beta):
                continue
            run_config(seed, alpha, beta)
            return

    print("[ALL DONE] All (seed, config) training runs already completed.")


if __name__ == "__main__":
    main()
