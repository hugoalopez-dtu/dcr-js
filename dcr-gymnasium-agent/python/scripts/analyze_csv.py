import csv, os, sys

LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")

def t(v):
    return str(v).strip().lower() in {"1", "true"}

def analyze(filepath):
    rows = list(csv.DictReader(open(filepath)))
    n = len(rows)
    if n == 0:
        print(f"{os.path.basename(filepath)}: EMPTY")
        return
    acc  = sum(t(r.get("accepting", ""))      for r in rows)
    goal = sum(t(r.get("goal_reached", ""))   for r in rows)
    mx   = sum(t(r.get("max_step_reached", "")) for r in rows)
    steps = [int(r["steps"]) for r in rows if r.get("steps", "").isdigit()]
    avg_steps = sum(steps) / len(steps) if steps else 0
    rews = []
    for r in rows:
        try:
            rews.append(float(r.get("total_reward", r.get("reward", ""))))
        except (ValueError, TypeError):
            pass
    avg_rew = sum(rews) / len(rews) if rews else None

    print(f"\nFILE: {os.path.basename(filepath)}")
    print(f"  rows           : {n}")
    print(f"  accepting      : {acc:>5}  ({acc/n:.2%})")
    print(f"  goal_reached   : {goal:>5}  ({goal/n:.2%})")
    print(f"  max_step_reached: {mx:>4}  ({mx/n:.2%})")
    print(f"  avg_steps/ep   : {avg_steps:.1f}")
    if avg_rew is not None:
        print(f"  avg_reward     : {avg_rew:.4f}")
    print(f"  columns        : {list(rows[0].keys())}")

if len(sys.argv) > 1:
    for path in sys.argv[1:]:
        analyze(path)
else:
    # analyze all CSVs in logs/
    files = sorted(
        [f for f in os.listdir(LOG_DIR) if f.endswith(".csv")],
        key=lambda x: os.path.getmtime(os.path.join(LOG_DIR, x))
    )
    for f in files:
        analyze(os.path.join(LOG_DIR, f))
