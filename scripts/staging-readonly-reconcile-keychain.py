"""Disabled exact Keychain reader for the reconciliation token only."""
import base64
import ctypes
import os
import re
import sys

APPROVED_NATIVE_READ = True
SERVICE = "Supabase CLI"
ACCOUNT = "supabase"

def unavailable():
    raise RuntimeError("Staging read-only reconciliation unavailable")

def normalize_token(value):
    if not isinstance(value, str) or len(value) > 256:
        unavailable()
    if value.startswith("go-keyring-base64:"):
        try:
            value = base64.b64decode(value[18:], validate=True).decode("utf-8")
        except Exception:
            unavailable()
    if not re.fullmatch(r"sbp_(?:oauth_|v0_)?[a-f0-9]{40}", value):
        unavailable()
    return value

def read_exact_native_token():
    if not APPROVED_NATIVE_READ or sys.platform != "darwin":
        unavailable()
    if any(name in os.environ for name in ("SUPABASE_PROFILE", "SUPABASE_HOME", "SUPABASE_ACCESS_TOKEN", "SUPABASE_NO_KEYRING")):
        unavailable()
    security = ctypes.CDLL("/System/Library/Frameworks/Security.framework/Security")
    cf = ctypes.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
    ptr = ctypes.c_void_p
    cf.CFStringCreateWithCString.argtypes = [ptr, ctypes.c_char_p, ctypes.c_uint32]
    cf.CFStringCreateWithCString.restype = ptr
    cf.CFDictionaryCreate.argtypes = [ptr, ctypes.POINTER(ptr), ctypes.POINTER(ptr), ctypes.c_long, ptr, ptr]
    cf.CFDictionaryCreate.restype = ptr
    cf.CFDataGetLength.argtypes = [ptr]; cf.CFDataGetLength.restype = ctypes.c_long
    cf.CFDataGetBytePtr.argtypes = [ptr]; cf.CFDataGetBytePtr.restype = ptr
    cf.CFRelease.argtypes = [ptr]
    security.SecItemCopyMatching.argtypes = [ptr, ctypes.POINTER(ptr)]
    security.SecItemCopyMatching.restype = ctypes.c_int32
    constant = lambda name: ptr.in_dll(security, name).value
    service = cf.CFStringCreateWithCString(None, SERVICE.encode(), 0x08000100)
    account = cf.CFStringCreateWithCString(None, ACCOUNT.encode(), 0x08000100)
    query = None; result = ptr(); token_bytes = None
    try:
        if not service or not account:
            unavailable()
        keys = (ptr * 5)(*[constant(name) for name in ("kSecClass", "kSecAttrService", "kSecAttrAccount", "kSecMatchLimit", "kSecReturnData")])
        values = (ptr * 5)(constant("kSecClassGenericPassword"), service, account, constant("kSecMatchLimitOne"), ptr.in_dll(cf, "kCFBooleanTrue").value)
        query = cf.CFDictionaryCreate(None, keys, values, 5, None, None)
        if not query or security.SecItemCopyMatching(query, ctypes.byref(result)) != 0 or not result.value:
            unavailable()
        length = cf.CFDataGetLength(result)
        if length < 1 or length > 256:
            unavailable()
        token_bytes = bytearray(ctypes.string_at(cf.CFDataGetBytePtr(result), length))
        return normalize_token(token_bytes.decode("utf-8"))
    finally:
        if token_bytes is not None:
            token_bytes[:] = b"\0" * len(token_bytes)
        if result.value: cf.CFRelease(result)
        if query: cf.CFRelease(query)
        if service: cf.CFRelease(service)
        if account: cf.CFRelease(account)

def main():
    if len(sys.argv) != 1: unavailable()
    token = read_exact_native_token()
    output = bytearray(token.encode("utf-8"))
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
