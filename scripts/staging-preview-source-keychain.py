"""Disabled, exact Vercel-only Keychain selector for one Preview source read."""
import os
import subprocess
import sys

APPROVED_PREVIEW_SOURCE_READ = True
SERVICE = "TLL Hosted Baseline Vercel API"
ACCOUNT = "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"


def main():
    if not APPROVED_PREVIEW_SOURCE_READ or sys.platform != "darwin" or len(sys.argv) != 1:
        raise RuntimeError("Preview source Keychain read unavailable")
    result = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-w", "-s", SERVICE, "-a", ACCOUNT],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, timeout=10, check=True,
    )
    value = bytearray(result.stdout.rstrip(b"\n"))
    try:
        if not 8 <= len(value) <= 4096 or b"\x00" in value or any(byte < 33 or byte > 126 for byte in value):
            raise RuntimeError("Preview source Keychain read unavailable")
        while value:
            count = os.write(1, value)
            if count < 1:
                raise RuntimeError("Preview source Keychain read unavailable")
            value[:count] = b"\0" * count
            del value[:count]
    finally:
        value[:] = b"\0" * len(value)


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        os._exit(1)
