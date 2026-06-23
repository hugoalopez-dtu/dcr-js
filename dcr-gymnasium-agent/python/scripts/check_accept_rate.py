"""
Quick gate check for the graph-09 diagnostic run: did acceptance rate ever
rise above 0, and is it trending up?

Usage:
    python scripts/check_accept_rate.py scripts/logs/train_trace_Mined09_diag_s1_a0p0_b0p0_kunlim.csv
"""
import sys
import pandas as pd

def main(csv_path):
    df = pd.read_csv(csv_path)
    episodes = df[df["done"] == True].copy()
    episodes["accepting"] = episodes["accepting"].astype(str).str.lower().isin(["true", "1"])

    n = len(episodes)
    print(f"Total episodes: {n}")
    if n == 0:
        print("No completed episodes found -- run may have crashed early.")
        return

    overall_rate = episodes["accepting"].mean()
    print(f"Overall accept rate: {overall_rate:.1%}")

    last20 = episodes.tail(max(1, n // 5))
    last_rate = last20["accepting"].mean()
    print(f"Accept rate, last 20% of episodes ({len(last20)} eps): {last_rate:.1%}")
    print(f"Mean episode length, last 20%: {last20['episode_steps'].mean():.1f} "
          f"(target chain length = 51)")

    accepted = episodes[episodes["accepting"]]
    if len(accepted):
        print(f"\nFirst accepting episode: #{accepted.iloc[0]['episode']}, "
              f"step_count={accepted.iloc[0]['episode_steps']}")
        print(f"Accepted episode lengths -- min/median/max: "
              f"{accepted['episode_steps'].min()}/{accepted['episode_steps'].median()}/"
              f"{accepted['episode_steps'].max()}")
    else:
        print("\nNo accepting episode found in this run.")


if __name__ == "__main__":
    main(sys.argv[1])
