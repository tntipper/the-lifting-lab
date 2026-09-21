"""Disabled exact reader for the existing Supabase CLI Keychain item."""
import base64
import os
import re
import subprocess
import sys

APPROVED_NATIVE_READ = True
SERVICE = "Supabase CLI"
ACCOUNT = "supabase"

def unavailable():
    raise RuntimeError("Generation-14 native credential transport unavailable")

def normalize(value):
    if not isinstance(value, str) or len(value) > 256:
        unavailable()
    if value.startswith("go-keyring-base64:"):
        try:
            value = base64.b64decode(value[len("go-keyring-base64:"):], validate=True).decode("utf-8")
        except Exception:
            unavailable()
    if not re.fullmatch(r"sbp_(?:oauth_|v0_)?[a-f0-9]{40}", value):
        unavailable()
    return value

def read_exact():
    if not APPROVED_NATIVE_READ or sys.platform != "darwin":
        unavailable()
    if any(name in os.environ for name in ("SUPABASE_PROFILE", "SUPABASE_HOME", "SUPABASE_ACCESS_TOKEN", "SUPABASE_NO_KEYRING")):
        unavailable()
    token_bytes = None
    error_bytes = None
    try:
        result = subprocess.run(
            ["/usr/bin/security", "find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
            timeout=40,
            check=False,
        )
        token_bytes = bytearray(result.stdout)
        error_bytes = bytearray(result.stderr)
        if result.returncode != 0 or error_bytes:
            unavailable()
        while token_bytes and token_bytes[-1] in (10, 13):
            token_bytes[-1] = 0
            token_bytes.pop()
        if len(token_bytes) < 1 or len(token_bytes) > 256:
            unavailable()
        return normalize(token_bytes.decode("utf-8"))
    finally:
        if token_bytes is not None: token_bytes[:] = b"\0" * len(token_bytes)
        if error_bytes is not None: error_bytes[:] = b"\0" * len(error_bytes)

def main():
    if len(sys.argv) != 1:
        unavailable()
    output = bytearray(read_exact().encode("utf-8"))
    try:
        while output:
            written = os.write(1, output)
            output[:written] = b"\0" * written
            del output[:written]
    finally:
        output[:] = b"\0" * len(output)

if __name__ == "__main__":
    try: main()
    except BaseException: os._exit(1)
