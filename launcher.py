# Inject runtime env vars into the built static app as window._env_
# Usage: python3 /launcher.py /usr/share/nginx/html

import argparse
import os
import re
import select
import signal
import subprocess
import sys

PATCH_BY = "x-patch-by"
PATCH_SOURCE = "excalidraw-standalone"

default_envs = {
    "NODE_ENV": "production",
    "PUBLIC_URL": "",
}


def get_env_or_default(name: str):
    v = os.environ.get(name, "")
    if v == "":
        v = default_envs.get(name, "")
    return v


def get_envs():
    envs = [key for key, value in os.environ.items()]
    vite_apps = [key for key in envs if key.startswith("VITE_APP_")]
    return vite_apps + list(default_envs.keys())


def gen_env_js(root: str):
    code = "window._env_ = {"
    for name in get_envs():
        val = get_env_or_default(name)
        # escape single quotes in value
        val = val.replace("'", "\\'")
        code += f"{name}: '{val}',"
    code += "}"

    with open(os.path.join(root, "env.js"), "w") as f:
        f.write(code)
    return code


def patch_index_html(root: str, script: str):
    path = os.path.join(root, "index.html")
    with open(path, "r") as f:
        page = f.read()

    with open(os.path.join(root, "index.origin.html"), "w") as f:
        f.write(page)

    if f'{PATCH_BY}="{PATCH_SOURCE}"' in page:
        return

    pattern = r'(<script\b[^>]*>)'
    replacement = f'<script {PATCH_BY}="{PATCH_SOURCE}">{script}</script>\n\\1'
    patched, count = re.subn(pattern, replacement, page, count=1)

    if count == 0:
        print("script tag not found in index.html")
        sys.exit(1)

    with open(path, "w") as f:
        f.write(patched)


def patch_service_worker(root):
    for dirpath, dirs, files in os.walk(root):
        for file in files:
            if file.endswith(".js") or file.endswith(".js.map"):
                path = os.path.join(dirpath, file)
                with open(path, "r") as f:
                    code = f.read()
                code = code.replace(
                    "window._env_.PUBLIC_URL",
                    f"'{get_env_or_default('PUBLIC_URL')}'",
                )
                with open(path, "w") as f:
                    f.write(code)


def exec_nginx():
    cmd = ["nginx", "-g", "daemon off;"]
    p = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        stdin=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    try:
        while True:
            reads = [p.stdout.fileno(), p.stderr.fileno()]
            ret = select.select(reads, [], [], 0.1)
            for fd in ret[0]:
                if fd == p.stdout.fileno():
                    line = p.stdout.readline()
                    if line:
                        print("STDOUT:", line.strip())
                elif fd == p.stderr.fileno():
                    line = p.stderr.readline()
                    if line:
                        print("STDERR:", line.strip())
            if p.poll() is not None:
                break
    except KeyboardInterrupt:
        p.send_signal(signal.SIGINT)
        try:
            p.wait(timeout=2)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=str, help="web root path")
    args = parser.parse_args()

    root = args.root
    if not os.path.exists(os.path.join(root, "index.html")):
        print("index.html not found")
        sys.exit(1)

    code = gen_env_js(root)
    patch_index_html(root, code)
    patch_service_worker(root)
    exec_nginx()


if __name__ == "__main__":
    main()
