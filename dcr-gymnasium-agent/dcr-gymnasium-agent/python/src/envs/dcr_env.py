import gymnasium as gym
from gymnasium import spaces
import numpy as np
import os
import sys

# Make imports work whether package is installed or running from src/ directly
if __package__ is None:
    # add project src/ to path
    this_dir = os.path.dirname(__file__)
    src_root = os.path.abspath(os.path.join(this_dir, ".."))
    if src_root not in sys.path:
        sys.path.insert(0, src_root)

from utils.node_connector import connect_to_dcr_environment

def state_to_obs(state, event_list):
    obs = []
    for ev in event_list:
        obs.append(1 if ev in state.get("included", []) else 0)
        obs.append(1 if ev in state.get("executed", []) else 0)
        obs.append(1 if ev in state.get("pending", []) else 0)
    return np.array(obs, dtype=np.int8)

def state_to_mask(state, event_list):
    # Mask 1 if event is valind (pending/allowed). We prefer server-provided mask when available.
    # Fallback: mark events with pending==1 as valid.
    mask = []
    for ev in event_list:
        mask.append(1 if ev in state.get("pending", []) else 0)
    return mask

class DCRGymEnv(gym.Env):
    metadata = {"render.modes": []}

    def __init__(self, node_url="http://localhost:5001"):
        super().__init__()
        self.node = connect_to_dcr_environment(node_url)
        init = self.node["reset"]()
        events = init["events"]
        self.event_list = events
        self.label_map = init.get("labelMap", {}) if isinstance(init, dict) else {}
        n = len(self.event_list)
        obs_dim = n * 3
        self.observation_space = spaces.Box(low=0, high=1, shape=(obs_dim,), dtype=np.int8)
        self.action_space = spaces.Discrete(n)

        # store action mask if server provided it
        self.action_mask = init.get("actionMask") if isinstance(init, dict) else None
        if self.action_mask is None:
            # fallback: compute from initial state
            self.action_mask = state_to_mask(init.get("state", {}), self.event_list)


    def _state_to_obs(self, state):
        arr = []
        for ev in self.event_list:
            included = 1 if ev in state.get("included", []) else 0
            executed = 1 if ev in state.get("executed", []) else 0
            pending = 1 if ev in state.get("pending", []) else 0
            arr.extend([included, executed, pending])
        return np.array(arr, dtype=np.int8)

    def reset(self, seed=None, options=None):
        r = self.node["reset"]()
        obs = self._state_to_obs(r["state"])
        self.label_map = r.get("labelMap", self.label_map)
        # update action mask from server reset response
        self.action_mask = r.get("actionMask", state_to_mask(r.get("state", {}), self.event_list))
        return obs, {}

    def step(self, action):
        ev = self.event_list[action]
        r = self.node["send_action"](ev)
        # server returns augmented result and possibly actionMask
        result = r.get("result", {})
        obs = self._state_to_obs(result.get("state", {}))
        # prefer the pedagogical stepReward returned by server; fallback to engine reward
        reward = result.get("stepReward", result.get("reward", 0))
        done = bool(result.get("done", False))
        # update action mask if server returned it, else recompute from state
        self.action_mask = r.get("actionMask") or state_to_mask(result.get("state", {}), self.event_list)
        info = {"engine_result": result, "action_mask": self.action_mask}
        return obs, reward, done, False, info

    def close(self):
        pass