"""Disabled exact-selector Keychain access for one future staging recovery read."""
import os
import subprocess
import sys

APPROVED_BROKER_RECOVERY_READ = False
_SELECTORS = {
    "supabase": ("Supabase CLI", "supabase"),
    "vercel": ("TLL Hosted Baseline Vercel API", "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"),
    "vercel-bypass": ("TLL Hosted Baseline Preview Bypass", "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"),
}


def unavailable():
    raise RuntimeError("Staging broker recovery credential unavailable")


def main():
    if not APPROVED_BROKER_RECOVERY_READ or sys.platform != "darwin" or len(sys.argv) != 2:
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
    value = bytearray(result.stdout.rstrip(b"\n"))
    try:
        if len(value) < 8 or len(value) > 4096 or b"\x00" in value or any(byte < 33 or byte > 126 for byte in value):
            unavailable()
        while value:
            count = os.write(1, value)
            if count < 1:
                unavailable()
            value[:count] = b"\0" * count
            del value[:count]
    finally:
        value[:] = b"\0" * len(value)


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        os._exit(1)
