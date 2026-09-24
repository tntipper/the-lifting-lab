"""Exact, disabled Keychain reader for staging provider normalization only."""
import os
import subprocess
import sys

APPROVED_NATIVE_READ = False
_SELECTORS = {
    "supabase": ("Supabase CLI", "supabase"),
    "vercel": ("TLL Hosted Baseline Vercel API", "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"),
    "vercel-bypass": ("TLL Hosted Baseline Preview Bypass", "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"),
}
EXIT_CODES = {"guard": 11, "timeout": 12, "command": 13, "format": 14, "output": 15, "internal": 16}


class CredentialReadFailure(RuntimeError):
    def __init__(self, category):
        super().__init__("Staging provider normalization Keychain unavailable")
        self.category = category


def unavailable(category="internal"):
    raise CredentialReadFailure(category)


def read_exact_credential(selector):
    if not APPROVED_NATIVE_READ or sys.platform != "darwin" or selector not in _SELECTORS:
        unavailable("guard")
    service, account = _SELECTORS[selector]
    try:
        result = subprocess.run(
            ["/usr/bin/security", "find-generic-password", "-w", "-s", service, "-a", account],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, timeout=10, check=True,
        )
    except subprocess.TimeoutExpired:
        unavailable("timeout")
    except subprocess.CalledProcessError:
        unavailable("command")
    except BaseException:
        unavailable("internal")
    value = bytearray(result.stdout.rstrip(b"\n"))
    if len(value) < 8 or len(value) > 4096 or b"\x00" in value or any(byte < 33 or byte > 126 for byte in value):
        value[:] = b"\0" * len(value)
        unavailable("format")
    return value


def main():
    if len(sys.argv) != 2:
        unavailable("guard")
    output = read_exact_credential(sys.argv[1])
    try:
        while output:
            try:
                count = os.write(1, output)
            except OSError:
                unavailable("output")
            if count <= 0:
                unavailable("output")
            output[:count] = b"\0" * count
            del output[:count]
    finally:
        output[:] = b"\0" * len(output)


if __name__ == "__main__":
    try:
        main()
    except CredentialReadFailure as error:
        os._exit(EXIT_CODES[error.category])
    except BaseException:
        os._exit(EXIT_CODES["internal"])
