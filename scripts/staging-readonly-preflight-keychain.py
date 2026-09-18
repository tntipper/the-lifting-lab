"""Disabled exact Keychain reader. Its only lookup is Supabase CLI/supabase."""
import os
import sys

APPROVED_NATIVE_READ = False
SERVICE = "Supabase CLI"
ACCOUNT = "supabase"

def main():
    if not APPROVED_NATIVE_READ or sys.platform != "darwin":
        raise RuntimeError("disabled")
    if any(name in os.environ for name in ("SUPABASE_PROFILE", "SUPABASE_HOME", "SUPABASE_ACCESS_TOKEN", "SUPABASE_NO_KEYRING")):
        raise RuntimeError("override")
    # The reviewed native design is pinned by the Node manifest. A future,
    # separately reviewed enablement must implement SecItemCopyMatching here;
    # this package has no fallback, enumeration, write, delete or argv path.
    raise RuntimeError("review required")

if __name__ == "__main__":
    try:
        main()
    except BaseException:
        sys.exit(1)
