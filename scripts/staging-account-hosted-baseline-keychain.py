"""Exact, disabled Keychain reader for the hosted-baseline session only."""
import os
import subprocess
import sys

APPROVED_NATIVE_READ = False
_SELECTORS = {
    "supabase": ("Supabase CLI", "supabase"),
    "vercel": ("TLL Hosted Baseline Vercel API", "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"),
    "vercel-bypass": ("TLL Hosted Baseline Preview Bypass", "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"),
}

def unavailable():
    raise RuntimeError("Staging hosted baseline keychain unavailable")

def read_exact_credential(selector):
    if not APPROVED_NATIVE_READ or sys.platform != "darwin" or selector not in _SELECTORS:
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
    if len(value) < 8 or len(value) > 4096 or b"\x00" in value or any(byte < 33 or byte > 126 for byte in value):
        value[:] = b"\0" * len(value)
        unavailable()
    return value

def main():
    if len(sys.argv) != 2:
        unavailable()
    output = read_exact_credential(sys.argv[1])
    try:
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
