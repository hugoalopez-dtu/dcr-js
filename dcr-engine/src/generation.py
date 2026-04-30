import gymnasium as gym
from gymnasium import spaces
import numpy as np

class GymDCREnvironment(gym.Env):
    def __init__(self, graph, max_steps=100):
        super().__init__()
        self.graph = graph
        self.initial_marking = self._copy_marking(graph.marking)
        self.max_steps = max_steps
        self.current_step = 0

        # Define observation space (state)
        self.observation_space = spaces.Dict({
            "included": spaces.MultiBinary(len(graph.events)),
            "executed": spaces.MultiBinary(len(graph.events)),
            "pending": spaces.MultiBinary(len(graph.events)),
        })

        # Define action space (events)
        self.action_space = spaces.Discrete(len(graph.events))

    def reset(self):
        self.graph.marking = self._copy_marking(self.initial_marking)
        self.current_step = 0
        return self._get_state(), {}

    def step(self, action):
        valid_actions = self._get_valid_actions()
        if action not in valid_actions:
            reward = -10  # Penalty for invalid action
            done = False
            return self._get_state(), reward, done, {}

        # Execute the action
        self._execute_action(action)
        self.current_step += 1

        # Compute reward
        reward = 10 if self._is_accepting() else -1
        done = self._is_accepting() or self.current_step >= self.max_steps

        return self._get_state(), reward, done, {}

    def render(self):
        print("Current State:", self._get_state())

    def _get_state(self):
        return {
            "included": np.array(list(self.graph.marking.included), dtype=np.int32),
            "executed": np.array(list(self.graph.marking.executed), dtype=np.int32),
            "pending": np.array(list(self.graph.marking.pending), dtype=np.int32),
        }

    def _get_valid_actions(self):
        enabled_events = []
        for event in self.graph.events:
            group = self.graph.subProcessMap.get(event, self.graph)
            if self._is_enabled(event, group):
                enabled_events.append(event)
        return enabled_events

    def _execute_action(self, action):
        # Use the existing execution logic
        executeS(action, self.graph)

    def _is_enabled(self, event, group):
        return isEnabledS(event, self.graph, group).enabled

    def _is_accepting(self):
        return isAcceptingS(self.graph, self.graph)

    def _copy_marking(self, marking):
        return {
            "included": set(marking.included),
            "executed": set(marking.executed),
            "pending": set(marking.pending),
        }