"""Disabled, exact two-item Keychain reader for one staging Preview build."""
import os
import subprocess
import sys

APPROVED_PREVIEW_DEPLOYMENT_READ = False
_SELECTORS = {
    "vercel": ("TLL Hosted Baseline Vercel API", "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"),
    "vercel-bypass": ("TLL Hosted Baseline Preview Bypass", "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"),
}


def unavailable():
    raise RuntimeError("Staging Preview deployment Keychain unavailable")


def main():
    if not APPROVED_PREVIEW_DEPLOYMENT_READ or sys.platform != "darwin" or len(sys.argv) != 2:
        unavailable()
    selector = sys.argv[1]
    if selector not in _SELECTORS:
        unavailable()
    service, account = _SELECTORS[selector]
    try:
        result = subprocess.run(
            ["/usr/bin/security", "find-generic-password", "-w", "-s", service, "-a", account],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, timeout=10, check=True,
        )
    except BaseException:
        unavailable()
    output = bytearray(result.stdout.rstrip(b"\n"))
    try:
        if len(output) < 8 or len(output) > 4096 or any(byte < 33 or byte > 126 for byte in output):
            unavailable()
        while output:
            count = os.write(1, output)
            output[:count] = b"\0" * count
            del output[:count]
    finally:
        output[:] = b"\0" * len(output)


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        os._exit(1)
