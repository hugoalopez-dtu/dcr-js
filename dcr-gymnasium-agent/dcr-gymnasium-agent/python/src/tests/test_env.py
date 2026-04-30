import random
from envs.dcr_env import DCRGymEnv

def main():
    env = DCRGymEnv(node_url="http://localhost:5001")
    obs, _ = env.reset()
    print("obs shape:", getattr(obs, "shape", len(obs)))
    print("action_space:", env.action_space.n)
    for i in range(10):
        a = random.randrange(env.action_space.n)
        obs, reward, done, _, info = env.step(a)
        print(f"step {i+1} action={a} reward={reward} done={done} info_keys={list(info.keys())}")
        if done:
            print("Episode finished at step", i+1)
            break

if __name__ == "__main__":
    main()