import json
import sys
import urllib.request

BASE_URL = "http://127.0.0.1:3333/v1"


def post(path, payload):
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    if len(sys.argv) < 2:
        print("Usage: python bridge_client.py <command> [json]")
        print("Commands: create-project, get-project-context, remember, recall, log-bug")
        sys.exit(1)

    command = sys.argv[1]
    payload = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    routes = {
        "create-project": "/create-project",
        "get-project-context": "/get-project-context",
        "remember": "/remember",
        "recall": "/recall",
        "log-bug": "/log-bug",
    }

    if command not in routes:
        raise SystemExit(f"Unknown command: {command}")

    print(json.dumps(post(routes[command], payload), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
