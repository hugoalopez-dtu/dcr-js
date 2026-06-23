"""
Analysis 2 — Temporal generalisation gap (sec:policy_generalisation).

For each of the 6 headline (alpha, beta) configs:
  1. Train PPO (seed=1, shield ON, same protocol as run_experiments.py) on the
     CALIBRATION-parameterised LoanApp_junior_senior graph (durations estimated
     from the first 800 cases of LoanApp_junior_senior.csv).
  2. Evaluate the frozen policy deterministically (N=500 episodes) against the
     calibration environment.
  3. Restart the adapter with the TEST-parameterised graph (durations from the
     last 200 cases) and evaluate the same frozen policy (N=500 episodes).

Run on the cluster:
  cd dcr-gymnasium-agent/python
  python scripts/generate_generalisation_xmls.py <path-to-LoanApp_junior_senior.csv>
  python scripts/run_generalisation_gap.py
"""
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[3]  # repo root
NODE_ADAPTER_DIR = ROOT / "node-adapter"
PYTHON_PROJECT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = Path(__file__).resolve().parent
GAP_DIR = SCRIPTS_DIR / "logs" / "generalisation_gap"
MODELS_DIR = PYTHON_PROJECT_DIR / "models" / "generalisation_gap"
TENSORBOARD_DIR = ROOT / "dcr_tensorboard"
PORT = "5001"
NODE_URL = f"http://localhost:{PORT}"

CALIB_XML = GAP_DIR / "LoanApp_junior_senior_calib.xml"
TEST_XML = GAP_DIR / "LoanApp_junior_senior_test.xml"

SEED = 1
TOTAL_STEPS = int(os.environ.get("DCR_STEPS", 100000))
ENT_COEF = float(os.environ.get("DCR_ENT_COEF", 0.1))
EVAL_EPISODES = int(os.environ.get("DCR_EVAL_EPISODES", 500))

PARETO_WEIGHTS = [
    (0.0, 0.0),
    (1.0, 0.0),
    (0.0, 1.0),
    (0.5, 0.5),
    (2.0, 0.5),
    (0.5, 2.0),
]

# DCR_CONFIGS: comma-separated indices into PARETO_WEIGHTS, for smoke-testing
# a subset before launching the full sweep (e.g. DCR_CONFIGS=0).
_configs_env = os.environ.get("DCR_CONFIGS", "").strip()
if _configs_env:
    _idxs = [int(i) for i in _configs_env.split(",") if i.strip() != ""]
    PARETO_WEIGHTS = [PARETO_WEIGHTS[i] for i in _idxs]


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


def free_adapter_port(port: str):
    result = subprocess.run(["lsof", f"-ti:{port}"], capture_output=True, text=True)
    if result.returncode != 0:
        return
    for pid_str in result.stdout.split():
        try:
            os.kill(int(pid_str), 9)
        except Exception:
            pass


def start_adapter(xml_path: Path, cost_weight: float, duration_weight: float, run_log: Path):
    env = os.environ.copy()
    env["DCR_XML"] = str(xml_path)
    env["PORT"] = PORT
    env["GOAL_LABEL"] = ""
    env["TB_LOG_DIR"] = str(TENSORBOARD_DIR)
    env["RESET_NOVELTY_ON_RESET"] = "0"
    env["STRICT_GOAL_TERMINATION"] = "0"
    env["MAX_EPISODE_STEPS"] = "300"
    env["COST_WEIGHT"] = str(cost_weight)
    env["DURATION_WEIGHT"] = str(duration_weight)
    env["STEP_PENALTY"] = "-1.5"
    # Shield stays ON: do NOT set SHIELD_DISABLED (Safe RL default).

    free_adapter_port(PORT)
    lf = open(run_log, "ab")
    proc = subprocess.Popen(
        ["bash", "-c", "source ~/.nvm/nvm.sh && nvm use 20 && node dist/server.mjs"],
        cwd=str(NODE_ADAPTER_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=lf,
    )
    if not wait_for_adapter(NODE_URL):
        proc.terminate()
        proc.wait(timeout=5)
        lf.close()
        raise RuntimeError(f"Node adapter failed to start with {xml_path}")
    return proc, lf


def stop_adapter(proc, lf):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    lf.close()


def weight_tag(alpha, beta):
    return f"a{alpha}_b{beta}".replace(".", "p")


def run_config(alpha, beta):
    tag = weight_tag(alpha, beta)
    exp_id = f"GenGap_s{SEED}_{tag}"
    run_log = GAP_DIR / f"run_{exp_id}_{int(time.time())}.log"
    GAP_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    calib_csv = GAP_DIR / f"eval_{exp_id}_calib.csv"
    test_csv = GAP_DIR / f"eval_{exp_id}_test.csv"
    if calib_csv.exists() and test_csv.exists():
        print(f"\n=== Config alpha={alpha} beta={beta}: already done, skipping ===")
        return

    print(f"\n=== Config alpha={alpha} beta={beta} ===")

    # --- 1. Train on calibration environment ---
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
            "--seed", str(SEED),
        ]
        env = os.environ.copy()
        env["DCR_XML"] = str(CALIB_XML)
        env["COST_WEIGHT"] = str(alpha)
        env["DURATION_WEIGHT"] = str(beta)
        ret = subprocess.run(train_cmd, cwd=str(PYTHON_PROJECT_DIR), env=env, stderr=subprocess.STDOUT)
        if ret.returncode != 0:
            raise RuntimeError(f"Training failed for {exp_id}")

        # find the model file just written
        models = sorted(MODELS_DIR.glob(f"ppo_exp_{exp_id}_*.zip"), key=lambda p: p.stat().st_mtime)
        model_path = models[-1]
        print(f"[OK] Trained model: {model_path}")

        # --- 2. Evaluate frozen policy on calibration environment ---
        eval_cmd = [
            sys.executable, "scripts/eval_frozen_policy.py",
            "--model-path", str(model_path),
            "--node-url", NODE_URL,
            "--episodes", str(EVAL_EPISODES),
            "--out-csv", str(GAP_DIR / f"eval_{exp_id}_calib.csv"),
            "--env-tag", "calib",
        ]
        subprocess.run(eval_cmd, cwd=str(PYTHON_PROJECT_DIR), check=True)
    finally:
        stop_adapter(proc, lf)

    # --- 3. Restart adapter with TEST environment, same reward weights ---
    proc, lf = start_adapter(TEST_XML, alpha, beta, run_log)
    try:
        eval_cmd = [
            sys.executable, "scripts/eval_frozen_policy.py",
            "--model-path", str(model_path),
            "--node-url", NODE_URL,
            "--episodes", str(EVAL_EPISODES),
            "--out-csv", str(GAP_DIR / f"eval_{exp_id}_test.csv"),
            "--env-tag", "test",
        ]
        subprocess.run(eval_cmd, cwd=str(PYTHON_PROJECT_DIR), check=True)
    finally:
        stop_adapter(proc, lf)

    print(f"[DONE] {exp_id}")


def main():
    assert CALIB_XML.exists() and TEST_XML.exists(), (
        "Run generate_generalisation_xmls.py first to produce calibration/test XML variants."
    )
    TENSORBOARD_DIR.mkdir(parents=True, exist_ok=True)

    # Process only the first not-yet-done config and exit. This keeps each
    # invocation short (~1 config, ~12-15 min) so it stays under whatever
    # external runtime limit is killing longer jobs (see submit_gengap.sh,
    # which resubmits itself until all configs are done).
    for alpha, beta in PARETO_WEIGHTS:
        tag = weight_tag(alpha, beta)
        exp_id = f"GenGap_s{SEED}_{tag}"
        calib_csv = GAP_DIR / f"eval_{exp_id}_calib.csv"
        test_csv = GAP_DIR / f"eval_{exp_id}_test.csv"
        if calib_csv.exists() and test_csv.exists():
            continue
        run_config(alpha, beta)
        return

    print("[ALL DONE] All configs already evaluated.")


if __name__ == "__main__":
    main()
