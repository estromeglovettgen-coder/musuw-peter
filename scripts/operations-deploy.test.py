#!/usr/bin/env python3
"""Behavioral contracts for artifact rejection and operations-only rollback."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("artifact", ROOT / "scripts/operations-artifact.py")
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)
FIRST = "a" * 40
SECOND = "b" * 40

class DeploymentContracts(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.root = Path(self.scratch.name)
        self.source = self.root / "source"
        for name, content in {
            "bin/node": "test node binary",
            "scripts/musuw-admin-server.mjs": "export const safe = true",
            "weknora/frontend/dist/operations.html": "<html>operations</html>",
        }.items():
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)

    def tearDown(self):
        for path in self.root.rglob("*"):
            if not path.is_symlink():
                path.chmod(0o755 if path.is_dir() else 0o644)
        self.scratch.cleanup()

    def archive(self, revision=FIRST):
        manifest = self.source / artifact.MANIFEST
        manifest.unlink(missing_ok=True)
        target = self.root / (revision + ".tgz")
        artifact.build(self.source, target, revision)
        return target

    def unpack(self, archive, revision=FIRST):
        destination = self.root / "unpacked"
        if destination.exists():
            shutil.rmtree(destination)
        destination.mkdir()
        artifact.extract(archive, destination, revision)
        return destination

    def test_complete_manifest_and_authorized_revision(self):
        archive = self.archive()
        self.assertIn("operations", (self.unpack(archive) / "weknora/frontend/dist/operations.html").read_text())
        with self.assertRaisesRegex(ValueError, "revision"):
            self.unpack(archive, SECOND)

    def test_same_content_rebuild_has_same_immutable_digest(self):
        archive = self.archive()
        original = archive.read_bytes()
        os.utime(self.source / "bin/node", (123456789, 123456789))
        self.assertEqual(self.archive().read_bytes(), original)

    def test_paths_links_and_unmanifested_files_are_rejected(self):
        good = self.archive()
        with tarfile.open(good) as source:
            originals = [(member, source.extractfile(member).read()) for member in source.getmembers()]
        for name, kind in [
            ("../escape", tarfile.REGTYPE),
            ("/tmp/escape", tarfile.REGTYPE),
            ("node_modules/escape", tarfile.SYMTYPE),
            ("node_modules/escape", tarfile.LNKTYPE),
            ("node_modules/unmanifested", tarfile.REGTYPE),
            ("node_modules/pipe", tarfile.FIFOTYPE),
            ("scripts/operations-deploy-gate", tarfile.REGTYPE),
        ]:
            with self.subTest(name=name, kind=kind):
                bad = self.root / "bad.tgz"
                with tarfile.open(bad, "w:gz") as output:
                    for member, body in originals:
                        output.addfile(member, io.BytesIO(body))
                    added = tarfile.TarInfo(name)
                    added.type = kind
                    added.linkname = "../../escape"
                    output.addfile(added, io.BytesIO(b""))
                with self.assertRaises(ValueError):
                    self.unpack(bad)
                self.assertFalse((self.root / "escape").exists())

    def test_modified_file_checksum_is_rejected(self):
        archive = self.archive()
        bad = self.root / "modified.tgz"
        with tarfile.open(archive) as source, tarfile.open(bad, "w:gz") as output:
            for member in source.getmembers():
                body = source.extractfile(member).read()
                if member.name == "bin/node":
                    body = b"modified"
                    member.size = len(body)
                output.addfile(member, io.BytesIO(body))
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.unpack(bad)

    @unittest.skipIf(os.geteuid() == 0, "gate simulation requires an unprivileged runner")
    def test_gate_rejection_and_failed_release_restore_prior_version(self):
        server = self.root / "server"
        releases = server / "opt/musuw-operations/releases"
        releases.mkdir(parents=True)
        runtime = releases.parent / "runtime"
        runtime.mkdir()
        (runtime / "production.env").write_text("# no credentials in tests\n")
        libexec = server / "usr/local/libexec"
        libexec.mkdir(parents=True)
        shutil.copyfile(ROOT / "scripts/operations-artifact.py", libexec / "musuw-operations-artifact.py")
        fake = self.root / "fake-bin"
        fake.mkdir()
        wrappers = {
            "flock": "#!/bin/sh\nexit 0\n",
            "timeout": '#!/bin/sh\nshift\nexec "$@"\n',
            "systemctl": '#!/bin/sh\ncase "$1" in restart|is-active) test "$(basename "$(readlink "$MUSUW_OPERATIONS_GATE_TEST_ROOT/opt/musuw-operations/current")")" != "$FAIL_REVISION";; stop) exit 0;; *) exit 1;; esac\n',
            "curl": '#!/bin/sh\nprintf \'%s\\n\' \'{"status":"ok","environment":"PRODUCTION"}\'\n',
        }
        if not shutil.which("sha256sum"):
            wrappers["sha256sum"] = '#!/bin/sh\nexec shasum -a 256 "$@"\n'
        for name, body in wrappers.items():
            (fake / name).write_text(body)
            (fake / name).chmod(0o755)
        env = {**os.environ, "MUSUW_OPERATIONS_GATE_TEST_MODE": "1",
               "MUSUW_OPERATIONS_GATE_TEST_ROOT": str(server),
               "FAIL_REVISION": SECOND, "PATH": str(fake) + os.pathsep + os.environ["PATH"]}
        def deploy(archive, revision, checksum=None):
            digest = checksum or hashlib.sha256(archive.read_bytes()).hexdigest()
            return subprocess.run(["bash", str(ROOT / "scripts/operations-deploy-gate"), "deploy", revision, digest],
                                  input=archive.read_bytes(), env=env, capture_output=True)
        first = self.archive()
        bad_checksum = deploy(first, FIRST, "0" * 64)
        self.assertNotEqual(bad_checksum.returncode, 0)
        self.assertIn(b"checksum mismatch", bad_checksum.stderr)
        invalid_revision = deploy(first, "main")
        self.assertNotEqual(invalid_revision.returncode, 0)
        self.assertFalse((releases.parent / "current").exists())
        result = deploy(first, FIRST)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual((releases.parent / "current").resolve(), (releases / FIRST).resolve())
        second = self.archive(SECOND)
        result = deploy(second, SECOND)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"previous release restored", result.stderr)
        self.assertEqual((releases.parent / "current").resolve(), (releases / FIRST).resolve())
        # No application path can be created or switched by this independent gate.
        self.assertFalse((server / "opt/weknora").exists())

if __name__ == "__main__":
    unittest.main()
