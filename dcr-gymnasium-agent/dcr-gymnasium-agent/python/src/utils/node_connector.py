def connect_to_dcr_environment(env_url="http://localhost:5001"):
    import requests

    def reset():
        r = requests.post(f"{env_url}/reset")
        r.raise_for_status()
        return r.json()

    def get_state():
        r = requests.get(f"{env_url}/state")
        r.raise_for_status()
        return r.json()

    def send_action(action):
        r = requests.post(f"{env_url}/action", json={"action": action})
        r.raise_for_status()
        return r.json()

    return {
        "reset": reset,
        "get_state": get_state,
        "send_action": send_action
    }