"""
Ablation: RL-only (PPO without DCR shielding).

Runs the same 6 weight pairs as the main experiment on LoanApp_junior_senior.xml,
but with SHIELD_DISABLED=1 so the DCR engine executes every action regardless of
compliance. This separates the PPO learning contribution from the compliance guarantee.

Logs written to: <repo>/dcr-gymnasium-agent/.../scripts/logs_rl_only/
"""
import csv
import os
import sys
import subprocess
import time
import requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
NODE_ADAPTER_DIR = ROOT / "node-adapter"
PYTHON_PROJECT_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = PYTHON_PROJECT_DIR / "models_ablation"
LOGS_DIR = PYTHON_PROJECT_DIR / "scripts" / "logs_rl_only"
PORT = "5001"
NODE_URL = f"http://localhost:{PORT}"

XML_FILE = str(ROOT / "app" / "public" / "examples" / "diagrams" / "LoanApp_junior_senior.xml")
EXP_BASE_ID = "LoanApp_roles_rl_only"
TOTAL_STEPS = int(os.environ.get("DCR_STEPS", 100000))
ENT_COEF = float(os.environ.get("DCR_ENT_COEF", 0.1))
SEED = int(os.environ.get("DCR_SEED", 1))

PARETO_WEIGHTS = [
    (0.0, 0.0),
    (1.0, 0.0),
    (0.0, 1.0),
    (0.5, 0.5),
    (2.0, 0.5),
    (0.5, 2.0),
]


def wait_for_adapter(url, timeout=25):
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


def free_port(port: str):
    result = subprocess.run(["lsof", f"-ti:{port}"], capture_output=True, text=True)
    if result.returncode != 0:
        return
    for pid_str in result.stdout.split():
        try:
            os.kill(int(pid_str), 9)
        except Exception:
            pass


def run_one(cost_w: float, dur_w: float):
    weight_tag = f"a{cost_w}_b{dur_w}".replace(".", "p")
    exp_id = f"{EXP_BASE_ID}_s{SEED}_{weight_tag}"

    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    run_log = LOGS_DIR / f"run_{exp_id}_{int(time.time())}.log"

    print(f"[RL-ONLY] {exp_id} | α={cost_w} β={dur_w} | steps={TOTAL_STEPS}")

    env = os.environ.copy()
    env["DCR_XML"]             = XML_FILE
    env["PORT"]                = PORT
    env["GOAL_LABEL"]          = ""
    env["MAX_EPISODE_STEPS"]   = "300"
    env["COST_WEIGHT"]         = str(cost_w)
    env["DURATION_WEIGHT"]     = str(dur_w)
    env["STEP_PENALTY"]        = "-1.5"
    env["RESET_NOVELTY_ON_RESET"] = "0"
    env["STRICT_GOAL_TERMINATION"] = "0"
    env["SHIELD_DISABLED"]     = "1"   # key flag: no compliance enforcement

    free_port(PORT)

    with open(run_log, "ab") as lf:
        proc = subprocess.Popen(
            ["bash", "-c", "source ~/.nvm/nvm.sh && nvm use 20 && node dist/server.mjs"],
            cwd=str(NODE_ADAPTER_DIR),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=lf,
        )
        try:
            if not wait_for_adapter(NODE_URL, timeout=30):
                proc.terminate()
                proc.wait(timeout=5)
                raise RuntimeError("Node adapter failed to start")

            train_cmd = [
                sys.executable, "src/agents/train_agent.py",
                "--exp-id", exp_id,
                "--steps", str(TOTAL_STEPS),
                "--node-url", NODE_URL,
                "--out-dir", str(MODELS_DIR),
                "--tb-log-dir", str(MODELS_DIR / "tb"),
                "--ent-coef", str(ENT_COEF),
                "--seed", str(SEED),
            ]
            print("Launching trainer:", " ".join(train_cmd))
            ret = subprocess.run(
                train_cmd,
                cwd=str(PYTHON_PROJECT_DIR),
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=lf,
            )
            if ret.returncode != 0:
                print(f"[ERROR] code {ret.returncode}. See {run_log}")
            else:
                # Move CSV from default logs/ to logs_rl_only/
                default_logs = PYTHON_PROJECT_DIR / "scripts" / "logs"
                for csv_f in sorted(default_logs.glob(f"train_trace_exp_{exp_id}_*.csv")):
                    dest = LOGS_DIR / csv_f.name
                    csv_f.rename(dest)
                    print(f"[OK] {dest}")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()


if __name__ == "__main__":
    print(f"=== RL-only ablation — SHIELD_DISABLED=1 ===")
    print(f"XML: {XML_FILE}")
    print(f"Steps: {TOTAL_STEPS} | Seed: {SEED}")
    for cost_w, dur_w in PARETO_WEIGHTS:
        run_one(cost_w, dur_w)
        time.sleep(2)
    print("Done.")
