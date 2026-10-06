"""Disabled, exact Supabase CLI selector for one staging read-only baseline."""
import os
import subprocess
import sys

APPROVED_MINIMUM_SUPABASE_READ = False
SERVICE = "Supabase CLI"
ACCOUNT = "supabase"


def main():
    if not APPROVED_MINIMUM_SUPABASE_READ or sys.platform != "darwin" or len(sys.argv) != 1:
        raise RuntimeError("Staging minimum Supabase Keychain read unavailable")
    result = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-w", "-s", SERVICE, "-a", ACCOUNT],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, timeout=30, check=True,
    )
    value = bytearray(result.stdout.rstrip(b"\n"))
    try:
        if not 8 <= len(value) <= 4096 or b"\x00" in value or any(byte < 33 or byte > 126 for byte in value):
            raise RuntimeError("Staging minimum Supabase Keychain read unavailable")
        while value:
            count = os.write(1, value)
            if count < 1:
                raise RuntimeError("Staging minimum Supabase Keychain read unavailable")
            value[:count] = b"\0" * count
            del value[:count]
    finally:
        value[:] = b"\0" * len(value)


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        os._exit(1)
