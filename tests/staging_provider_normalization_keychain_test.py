"""Offline tests for categorical failure from the disabled Keychain helper."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch


SOURCE = Path(__file__).resolve().parents[1] / "scripts/staging-provider-normalization-keychain.py"


class KeychainHelperTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="tll-keychain-offline-")
        source = SOURCE.read_text()
        assert source.count('"/usr/bin/security"') == 1
        isolated = source.replace('"/usr/bin/security"', '"/bin/false"')
        assert "/usr/bin/security" not in isolated
        copy = Path(cls.temporary.name) / "isolated_keychain.py"
        copy.write_text(isolated)
        spec = importlib.util.spec_from_file_location("isolated_tll_keychain", copy)
        cls.helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.helper)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def setUp(self):
        self.helper.APPROVED_NATIVE_READ = False
        self.helper.sys = types.SimpleNamespace(platform="darwin", argv=["isolated_keychain.py", "vercel"])

    def assert_category(self, category, action):
        with self.assertRaises(self.helper.CredentialReadFailure) as raised:
            action()
        self.assertEqual(raised.exception.category, category)
        self.assertNotIn("private-token", str(raised.exception))

    def test_guard_rejects_before_subprocess(self):
        with patch.object(self.helper.subprocess, "run") as run:
            self.assert_category("guard", lambda: self.helper.read_exact_credential("vercel"))
            self.helper.APPROVED_NATIVE_READ = True
            self.assert_category("guard", lambda: self.helper.read_exact_credential("unexpected"))
            run.assert_not_called()

    def test_success_uses_exact_environment_and_returns_only_owned_buffer(self):
        self.helper.APPROVED_NATIVE_READ = True
        with patch.object(self.helper.subprocess, "run", return_value=types.SimpleNamespace(stdout=b"private-token\n")) as run:
            value = self.helper.read_exact_credential("vercel")
        self.assertEqual(value, bytearray(b"private-token"))
        args, kwargs = run.call_args
        self.assertEqual(args[0][0:3], ["/bin/false", "find-generic-password", "-w"])
        self.assertEqual(kwargs["env"], {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
        self.assertIs(kwargs["stdin"], subprocess.DEVNULL)
        self.assertIs(kwargs["stdout"], subprocess.PIPE)
        self.assertIs(kwargs["stderr"], subprocess.DEVNULL)
        self.assertEqual(kwargs["timeout"], 10)
        self.assertTrue(kwargs["check"])
        value[:] = b"\0" * len(value)

    def test_failure_categories_are_fixed_and_secret_free(self):
        self.helper.APPROVED_NATIVE_READ = True
        cases = [
            (subprocess.TimeoutExpired(["/bin/false"], 10), "timeout"),
            (subprocess.CalledProcessError(1, ["/bin/false"], output=b"private-token"), "command"),
            (OSError("private-token"), "internal"),
        ]
        for failure, category in cases:
            with self.subTest(category=category), patch.object(self.helper.subprocess, "run", side_effect=failure):
                self.assert_category(category, lambda: self.helper.read_exact_credential("vercel"))
        for output in [b"", b"bad\x00value", b"bad value", b"x" * 4097]:
            with self.subTest(output_length=len(output)), patch.object(
                self.helper.subprocess, "run", return_value=types.SimpleNamespace(stdout=output)
            ):
                self.assert_category("format", lambda: self.helper.read_exact_credential("vercel"))

    def test_output_failure_wipes_owned_buffer(self):
        owned = bytearray(b"private-token")
        with patch.object(self.helper, "read_exact_credential", return_value=owned), patch.object(
            self.helper.os, "write", side_effect=OSError("private-token")
        ):
            self.assert_category("output", self.helper.main)
        self.assertEqual(owned, bytearray(len(owned)))

    def test_zero_write_fails_and_partial_write_wipes_progressively(self):
        zero = bytearray(b"private-token")
        with patch.object(self.helper, "read_exact_credential", return_value=zero), patch.object(
            self.helper.os, "write", return_value=0
        ):
            self.assert_category("output", self.helper.main)
        self.assertEqual(zero, bytearray(len(zero)))

        partial = bytearray(b"private-token")
        chunks = []
        def write(_fd, value):
            count = min(3, len(value))
            chunks.append(bytes(value[:count]))
            return count
        with patch.object(self.helper, "read_exact_credential", return_value=partial), patch.object(
            self.helper.os, "write", side_effect=write
        ):
            self.helper.main()
        self.assertEqual(b"".join(chunks), b"private-token")
        self.assertEqual(len(partial), 0)

        partial_failure = bytearray(b"private-token")
        sent = []
        def write_then_fail(_fd, value):
            if not sent:
                sent.append(bytes(value[:3]))
                return 3
            raise OSError("private-token")
        with patch.object(self.helper, "read_exact_credential", return_value=partial_failure), patch.object(
            self.helper.os, "write", side_effect=write_then_fail
        ):
            self.assert_category("output", self.helper.main)
        self.assertEqual(sent, [b"pri"])
        self.assertEqual(partial_failure, bytearray(len(partial_failure)))

    def test_isolated_main_process_exit_codes_and_no_failure_output(self):
        original = SOURCE.read_text().replace('"/usr/bin/security"', '"/bin/false"')
        assert "/usr/bin/security" not in original
        cases = [
            ("disabled", "", 11),
            ("timeout", 'raise subprocess.TimeoutExpired(["/bin/false"], 10, output=b"private-token")', 12),
            ("command", 'raise subprocess.CalledProcessError(1, ["/bin/false"], output=b"private-token")', 13),
            ("format", 'return subprocess.CompletedProcess([], 0, stdout=b"private-token bad")', 14),
            ("output", 'return subprocess.CompletedProcess([], 0, stdout=b"private-token\\n")', 15),
            ("internal", 'raise OSError("private-token")', 16),
            ("success", 'return subprocess.CompletedProcess([], 0, stdout=b"private-token\\n")', 0),
        ]
        for label, action, expected in cases:
            with self.subTest(label=label):
                source = original
                if label != "disabled":
                    source = source.replace("APPROVED_NATIVE_READ = False", "APPROVED_NATIVE_READ = True", 1)
                    injected = ('sys.platform = "darwin"\n'
                                'def fake_run(*args, **kwargs):\n    ' + action + '\n'
                                'subprocess.run = fake_run\n')
                    if label == "output":
                        injected += 'def fail_write(*args):\n    raise OSError("private-token")\nos.write = fail_write\n'
                    source = source.replace("import sys\n", "import sys\n" + injected, 1)
                path = Path(self.temporary.name) / f"{label}_main.py"
                path.write_text(source)
                result = subprocess.run([os.sys.executable, "-I", "-S", str(path), "vercel"],
                                        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, timeout=5)
                self.assertEqual(result.returncode, expected)
                self.assertTrue(result.stdout == (b"private-token" if label == "success" else b""))
                self.assertEqual(result.stderr, b"")

    def test_exit_categories_do_not_collide(self):
        codes = self.helper.EXIT_CODES
        self.assertEqual(set(codes), {"guard", "timeout", "command", "format", "output", "internal"})
        self.assertEqual(len(set(codes.values())), len(codes))
        self.assertTrue(all(1 <= code <= 125 for code in codes.values()))


if __name__ == "__main__":
    unittest.main()
