#!/usr/bin/env bash
# Stub Herdr CLI for isolated verification. Logs argv to VERIFY_HERDR_TRACE and
# returns JSON shapes Sessionizer expects. Does not start a real Herdr server.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
verify_paths
mkdir -p "$(dirname "$VERIFY_HERDR_TRACE")"
mkdir -p "$(dirname "$VERIFY_STATE")"

printf '%s\n' "$(date -Iseconds) herdr $*" >>"$VERIFY_HERDR_TRACE"

if [[ ! -f "$VERIFY_STATE" ]]; then
  echo '{"workspaces":[],"next_id":1,"pane_seq":1}' >"$VERIFY_STATE"
fi

python3 - "$VERIFY_STATE" "$@" <<'PY'
import json, os, sys

state_path, *argv = sys.argv[1:]
with open(state_path) as f:
    state = json.load(f)

def save():
    with open(state_path, "w") as f:
        json.dump(state, f)

def parse_flags(args):
    out = {}
    i = 0
    while i < len(args):
        a = args[i]
        if a.startswith("--") and i + 1 < len(args) and not args[i + 1].startswith("--"):
            out[a[2:].replace("-", "_")] = args[i + 1]
            i += 2
        elif a in ("--json", "--focus", "--no-focus", "--group", "--force"):
            out[a.lstrip("-").replace("-", "_")] = True
            i += 1
        else:
            i += 1
    return out

def next_ws_id():
    wid = f"ws{state['next_id']}"
    state["next_id"] += 1
    return wid

def find_ws(wid):
    for w in state["workspaces"]:
        if w["workspace_id"] == wid:
            return w
    return None

def git_worktree_add(repo_root, branch, checkout):
    import subprocess

    os.makedirs(os.path.dirname(checkout) or ".", exist_ok=True)
    has_branch = subprocess.run(
        ["git", "-C", repo_root, "rev-parse", "--verify", "--quiet", f"refs/heads/{branch}"],
        capture_output=True,
    ).returncode == 0
    if has_branch:
        cmd = ["git", "-C", repo_root, "worktree", "add", checkout, branch]
    else:
        cmd = ["git", "-C", repo_root, "worktree", "add", "-b", branch, checkout]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stderr.strip() or proc.stdout.strip(), file=sys.stderr)
        sys.exit(proc.returncode)

cmd = argv[0] if argv else ""
rest = argv[1:]

if cmd == "workspace":
    sub = rest[0] if rest else ""
    tail = rest[1:]
    if sub == "list":
        print(json.dumps({"result": {"workspaces": state["workspaces"]}}))
        sys.exit(0)
    if sub == "create":
        fl = parse_flags(tail)
        wid = next_ws_id()
        cwd = fl.get("cwd", os.environ.get("VERIFY_PROJECTS_DIR", "/tmp") + "/demo-app")
        label = fl.get("label", "workspace")
        ws = {
            "workspace_id": wid,
            "label": label,
            "cwd": cwd,
            "tab_count": 1,
            "pane_count": 1,
        }
        state["workspaces"].append(ws)
        save()
        print(json.dumps({"result": {"workspace": ws}}))
        sys.exit(0)
    if sub == "get":
        wid = tail[0] if tail else ""
        ws = find_ws(wid)
        print(json.dumps({"result": {"workspace": ws}}))
        sys.exit(0)
    if sub == "focus":
        sys.exit(0)
    if sub == "close":
        wid = None
        group = False
        for a in tail:
            if a == "--group":
                group = True
            elif not a.startswith("--"):
                wid = a
        if wid:
            repo = None
            target = find_ws(wid)
            if target:
                repo = (target.get("worktree") or {}).get("repo_name")
            keep = []
            for w in state["workspaces"]:
                if w.get("workspace_id") == wid:
                    continue
                if group and repo and (w.get("worktree") or {}).get("repo_name") == repo:
                    continue
                keep.append(w)
            state["workspaces"] = keep
            save()
        sys.exit(0)

if cmd == "worktree":
    sub = rest[0] if rest else ""
    tail = rest[1:]
    if sub == "create":
        fl = parse_flags(tail)
        branch = fl.get("branch", "verify-branch")
        cwd = fl.get("cwd") or os.environ.get("VERIFY_PROJECTS_DIR", "/tmp") + "/demo-app"
        checkout = os.path.join(
            os.environ.get("VERIFY_ROOT", "/tmp"),
            "worktrees",
            os.path.basename(cwd),
            branch,
        )
        wid = next_ws_id()
        ws = {
            "workspace_id": wid,
            "label": fl.get("label", branch),
            "cwd": checkout,
            "worktree": {
                "branch": branch,
                "checkout_path": checkout,
                "path": checkout,
                "repo_name": os.path.basename(cwd),
                "repo_root": cwd,
                "is_linked_worktree": True,
            },
            "tab_count": 1,
            "pane_count": 1,
        }
        git_worktree_add(cwd, branch, checkout)
        state["workspaces"].append(ws)
        save()
        print(json.dumps({"result": {"workspace": ws}}))
        sys.exit(0)
    if sub == "open":
        fl = parse_flags(tail)
        branch = fl.get("branch", "verify-branch")
        cwd = fl.get("cwd") or os.environ.get("VERIFY_PROJECTS_DIR", "/tmp") + "/demo-app"
        checkout = fl.get("path") or os.path.join(
            os.environ.get("VERIFY_ROOT", "/tmp"),
            "worktrees",
            os.path.basename(cwd),
            branch,
        )
        git_marker = os.path.join(checkout, ".git")
        if not (os.path.isdir(checkout) and os.path.exists(git_marker)):
            print(json.dumps({"error": {"message": f"no worktree checkout at {checkout}"}}), file=sys.stderr)
            sys.exit(1)
        wid = next_ws_id()
        ws = {
            "workspace_id": wid,
            "label": fl.get("label", branch),
            "cwd": checkout,
            "worktree": {
                "branch": branch,
                "checkout_path": checkout,
                "path": checkout,
            },
            "tab_count": 1,
            "pane_count": 1,
        }
        state["workspaces"].append(ws)
        save()
        print(
            json.dumps(
                {
                    "result": {
                        "workspace": ws,
                        "already_open": False,
                        "worktree": {"checkout_path": checkout, "path": checkout},
                    }
                }
            )
        )
        sys.exit(0)
    if sub == "remove":
        sys.exit(0)

if cmd == "tab":
    sub = rest[0] if rest else ""
    tail = rest[1:]
    if sub == "create":
        fl = parse_flags(tail)
        ws_id = fl.get("workspace", "ws1")
        tab_id = f"{ws_id}:t{state['pane_seq']}"
        state["pane_seq"] += 1
        save()
        tab = {"tab_id": tab_id, "workspace_id": ws_id, "label": fl.get("label", "tab")}
        print(json.dumps({"result": {"tab": tab}}))
        sys.exit(0)
    if sub in ("rename", "focus"):
        sys.exit(0)

if cmd == "pane":
    sub = rest[0] if rest else ""
    tail = rest[1:]
    if sub == "split":
        pane_id = tail[0] if tail else "p1"
        fl = parse_flags(tail[1:])
        ws_id = pane_id.split("-")[0] if "-" in pane_id else "ws1"
        new_id = f"{ws_id}-{state['pane_seq']}"
        state["pane_seq"] += 1
        save()
        pane = {
            "pane_id": new_id,
            "terminal_id": f"term-{new_id}",
            "workspace_id": ws_id,
            "tab_id": f"{ws_id}:1",
        }
        print(json.dumps({"result": {"pane": pane}}))
        sys.exit(0)
    if sub in ("run", "rename"):
        sys.exit(0)

if cmd == "plugin":
    # Pane open actions from `sessionizer open` — no-op in stub mode.
    sys.exit(0)

print(json.dumps({"error": {"message": f"mock-herdr: unhandled argv {argv!r}"}}), file=sys.stderr)
sys.exit(1)
PY
