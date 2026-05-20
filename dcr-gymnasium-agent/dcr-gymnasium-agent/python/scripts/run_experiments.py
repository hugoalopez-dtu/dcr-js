# ...existing code...
import csv
import os
import sys
import shutil
import subprocess
import time
import requests
from pathlib import Path
from tensorboard.backend.event_processing.event_accumulator import EventAccumulator

# --- CONFIG: matrix across XMLs and step budgets ---
ROOT = Path(__file__).resolve().parents[4] # repo root
NODE_ADAPTER_DIR = ROOT / "node-adapter"
PYTHON_PROJECT_DIR = Path(__file__).resolve().parents[1]
TENSORBOARD_DIR = ROOT / "dcr_tensorboard"
MODELS_DIR = PYTHON_PROJECT_DIR / "models"
LOGS_DIR = PYTHON_PROJECT_DIR / "scripts" / "logs"
PORT = "5001"
NODE_URL = f"http://localhost:{PORT}"
STAGING_XML = ROOT / "node-adapter" / "staging" / "current_graph.xml"


def parse_seeds_from_env() -> list[int]:
    raw = (os.environ.get("DCR_SEEDS") or "").strip()
    if not raw:
        # Default to a single run unless explicitly requested otherwise.
        return [1]
    try:
        seeds = [int(s.strip()) for s in raw.split(",") if s.strip()]
        return seeds or [1]
    except ValueError:
        print(f"Invalid DCR_SEEDS='{raw}', falling back to seed [1]")
        return [1]


SEEDS = parse_seeds_from_env()

# --- Pareto weight sweep ---
# Each pair (alpha, beta) defines a scalarization: reward -= alpha*cost + beta*duration
# alpha=0, beta=0 → original structural agent (baseline)
# Vary the pairs to explore the cost-duration trade-off space
PARETO_WEIGHTS = [
    (0.0, 0.0),   # baseline: no cost/duration awareness
    (1.0, 0.0),   # minimise cost only
    (0.0, 1.0),   # minimise duration only
    (0.5, 0.5),   # balanced
    (2.0, 0.5),   # cost-heavy
    (0.5, 2.0),   # duration-heavy
]

EXPERIMENTS = [
    # --- Expense Report — Diaz et al. Ex2 (DEC2H 2024), for direct comparison ---
    # {
    #     "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "Expense_Report_Diaz.xml"),
    #     "exp_id": "ExpenseReport_Diaz",
    #     "total_steps": int(os.environ.get("DCR_STEPS", 100000)),
    #     "ent_coef": float(os.environ.get("DCR_ENT_COEF", 0.1)),
    # },

    # --- Loan Application — Diaz et al. (DEC2H 2024), no roles ---
    # {
    #     "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "Loan_Application_Diaz.xml"),
    #     "exp_id": "LoanApp_Diaz",
    #     "total_steps": int(os.environ.get("DCR_STEPS", 50000)),
    #     "ent_coef": float(os.environ.get("DCR_ENT_COEF", 0.1)),
    # },

    # --- Loan Application — Kirchdorfer et al. (BPM 2026), Junior/Expert roles ---
    {
        "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "LoanApp_junior_senior.xml"),
        "exp_id": "LoanApp_roles",
        "total_steps": int(os.environ.get("DCR_STEPS", 100000)),
        "ent_coef": float(os.environ.get("DCR_ENT_COEF", 0.1)),
    },

    # --- Synthetic Review with roles (Expert / Junior / System per event) ---
    # {
    #     "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "Synthetic_review_roles.xml"),
    #     "exp_id": "SynReview_roles",
    #     "total_steps": int(os.environ.get("DCR_STEPS", 150000)),
    #     "ent_coef": float(os.environ.get("DCR_ENT_COEF", 0.1)),
    # },

    # --- Baseline: Synthetic Review without roles (original cost/duration) ---
    # {
    #     "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "Synthetic_event_logs_review_example_large.xml"),
    #     "exp_id": "SynReview_baseline",
    #     "total_steps": int(os.environ.get("DCR_STEPS", 150000)),
    #     "ent_coef": 0.1,
    # },

    # --- Active experiment: xml_file omitted → uses staging/current_graph.xml sent from UI ---
    # {
    #     "exp_id": "pareto_run",
    #     "total_steps": int(os.environ.get("DCR_STEPS", 50000)),
    #     "ent_coef": float(os.environ.get("DCR_ENT_COEF", 0.1)),
    # },

    # --- Archive: uncomment to run a specific graph directly ---
    # {
    #     "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "Prescribe medicine.xml"),
    #     "exp_id": "Medicine_30k",
    #     "total_steps": 30000,
    #     "ent_coef": 0.1,
    # },
    # {
    #     "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "Sepsis Cases - Event Log.xml"),
    #     "exp_id": "Sepsis_200k",
    #     "total_steps": 200000,
    #     "ent_coef": 0.1,
    # },
    # {
    #     "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "Synthetic_event_logs_review_example_large.xml"),
    #     "exp_id": "SyntheticReview_200k_v1",
    #     "total_steps": 200000,
    #     "ent_coef": 0.1,
    # },
    # {
    #     "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "Legal Compliance by Design.xml"),
    #     "exp_id": "Pension_100k",
    #     "goal_label": "Grant public pension",
    #     "total_steps": 100000,
    #     "ent_coef": 0.1,
    # },
    # {
    #     "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "Arrange meeting.xml"),
    #     "exp_id": "Meeting_30k",
    #     "goal_label": "Hold meeting",
    #     "total_steps": 30000,
    #     "ent_coef": 0.1,
    # },
    # {
    #     "xml_file": str(ROOT / "app" / "public" / "examples" / "diagrams" / "Arrange meeting.xml"),
    #     "exp_id": "Meeting_100k",
    #     "goal_label": "Hold meeting",
    #     "total_steps": 100000,
    #     "ent_coef": 0.1,
    # },
]


# TensorBoard tags to extract
TB_TAGS = [
    "rollout/ep_rew_mean",
    "rollout/ep_len_mean",
    "train/explained_variance",
]


# ---------- Helpers ----------
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


def free_adapter_port(port: str):
    """Best-effort cleanup so the per-experiment adapter can bind reliably."""
    result = subprocess.run(["lsof", f"-ti:{port}"], capture_output=True, text=True)
    if result.returncode != 0:
        return
    for pid_str in result.stdout.split():
        try:
            os.kill(int(pid_str), 9)
            print(f"Killed process on port {port}: {pid_str}")
        except Exception:
            pass


def rotate_tensorboard_backup():
    if not TENSORBOARD_DIR.exists():
        return
    timestamp = time.strftime("%Y%m%dT%H%M%S")
    backup = TENSORBOARD_DIR.with_name(f"{TENSORBOARD_DIR.name}_backup_{timestamp}")
    try:
        shutil.move(str(TENSORBOARD_DIR), str(backup))
        print(f"Moved existing tensorboard logs to: {backup}")
    except Exception as e:
        print(f"Failed to move tensorboard dir: {e}")


def extract_scalars_from_event(event_path, tags):
    ea = EventAccumulator(str(event_path), size_guidance={"scalars": 0})
    ea.Reload()
    available = ea.Tags().get("scalars", [])
    out = []
    for tag in tags:
        if tag not in available:
            continue
        for ev in ea.Scalars(tag):
            out.append({"tag": tag, "wall_time": ev.wall_time, "step": ev.step, "value": ev.value})
    return out


def write_csv_rows(rows, out_path):
    if not rows:
        return
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["tag", "wall_time", "step", "value"])
        writer.writeheader()
        for r in sorted(rows, key=lambda x: (x["tag"], x["step"])):
            writer.writerow(r)


# ---------- Main experiment runner ----------
def run_experiment(exp, seed: int, cost_weight: float = 0.0, duration_weight: float = 0.0):
    # Use staging XML if no xml_file specified in experiment config
    xml_path = exp.get("xml_file") or str(STAGING_XML)
    xml = Path(xml_path).expanduser().resolve()
    assert xml.exists(), f"XML not found: {xml}\nHint: send a graph from the modeler UI first (robot button)."
    base_exp_id = exp["exp_id"]
    weight_tag = f"a{cost_weight}_b{duration_weight}".replace(".", "p")
    exp_id = f"{base_exp_id}_s{seed}_{weight_tag}"
    steps = int(exp["total_steps"])
    goal_label = str(exp.get("goal_label", ""))
    ent_coef = float(exp.get("ent_coef", 0.1))

    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    run_log = LOGS_DIR / f"run_{exp_id}_{int(time.time())}.log"

    print(
        f"[RUN] {exp_id} -> {xml} | steps: {steps} | goal: {goal_label} "
        f"| ent_coef: {ent_coef} | seed: {seed} | α={cost_weight} β={duration_weight}"
    )
    env = os.environ.copy()
    env["DCR_XML"] = str(xml)
    env["PORT"] = PORT
    env["GOAL_LABEL"] = goal_label
    env["TB_LOG_DIR"] = str(TENSORBOARD_DIR)
    env["RESET_NOVELTY_ON_RESET"] = "0"
    env["STRICT_GOAL_TERMINATION"] = "0"
    env["MAX_EPISODE_STEPS"] = "300"
    env["COST_WEIGHT"]     = str(cost_weight)
    env["DURATION_WEIGHT"] = str(duration_weight)
    # Step penalty: must be negative enough so non-progress legal steps are negative.
    # With baseMapped=+1 and normalised costs ≤ α+β, setting STEP_PENALTY=-1.5 ensures:
    #   no-progress step: 1 - 1.5 = -0.5  (agent wants to terminate)
    #   progress step:    1 + 2 - 1.5 = +1.5  (rewarded for resolving pending)
    env["STEP_PENALTY"]    = str(exp.get("step_penalty", -1.5))

    # Ensure previous adapter instance is not occupying the port.
    free_adapter_port(PORT)

    # start node adapter (separate process)
    with open(run_log, "ab") as lf:
        # Use bash to source nvm before running npx (required on HPC clusters)
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

            # prepare trainer command (adds entropy coefficient to encourage exploration)
            train_cmd = [
                sys.executable,
                "src/agents/train_agent.py",
                "--exp-id",
                exp_id,
                "--steps",
                str(steps),
                "--node-url",
                NODE_URL,
                "--out-dir",
                str(MODELS_DIR),
                "--tb-log-dir",
                str(TENSORBOARD_DIR),
                "--ent-coef",
                str(ent_coef),
                "--seed",
                str(seed),
            ]
            print("Launching trainer:", " ".join(train_cmd))

            # record start time and run trainer
            start_ts = int(time.time())
            ret = subprocess.run(
                train_cmd,
                cwd=str(PYTHON_PROJECT_DIR),
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=lf,
            )
            if ret.returncode != 0:
                print(f"[ERROR] Trainer failed (code {ret.returncode}). See {run_log}")
            else:
                print(f"[OK] Experiment {exp_id} finished. Logs: {run_log}")

            # collect tensorboard event files produced during this run
            candidate_dirs = set()
            if TENSORBOARD_DIR.exists():
                candidate_dirs.add(TENSORBOARD_DIR)
            # include any nested dcr_tensorboard folders
            for p in ROOT.rglob("dcr_tensorboard"):
                if p.is_dir():
                    candidate_dirs.add(p)

            event_files = []
            for tb_dir in candidate_dirs:
                for p in tb_dir.rglob("events.out.tfevents.*"):
                    try:
                        if int(p.stat().st_mtime) >= (start_ts - 5):
                            event_files.append(p)
                    except Exception:
                        pass

            all_rows = []
            for ef in event_files:
                rows = extract_scalars_from_event(ef, TB_TAGS)
                if rows:
                    csv_path = LOGS_DIR / f"{exp_id}_tb_{ef.stem}.csv"
                    write_csv_rows(rows, csv_path)
                    all_rows.extend(rows)

            if all_rows:
                summary_csv = LOGS_DIR / f"{exp_id}_summary_{int(time.time())}.csv"
                write_csv_rows(all_rows, summary_csv)
                print(f"Wrote CSVs for {exp_id}: {summary_csv}")

        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()


def main():
    print(f"Repository root: {ROOT}")
    # backup / clean existing tensorboard logs to avoid mixing runs
    #rotate_tensorboard_backup()
    # ensure fresh TB dir exists
    TENSORBOARD_DIR.mkdir(parents=True, exist_ok=True)

    for exp in EXPERIMENTS:
        for seed in SEEDS:
            for cost_w, dur_w in PARETO_WEIGHTS:
                run_experiment(exp, seed, cost_weight=cost_w, duration_weight=dur_w)
                time.sleep(2)


if __name__ == "__main__":
    main()