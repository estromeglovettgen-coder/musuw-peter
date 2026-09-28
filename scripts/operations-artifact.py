#!/usr/bin/env python3
"""Build or safely unpack the one GitHub-built operations artifact format."""
import hashlib
import gzip
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tarfile

MANIFEST = "operations-release.json"
MAX_FILES = 60000
MAX_BYTES = 3 * 1024 ** 3

def safe_path(name):
    path = PurePosixPath(name)
    if (not name or name.startswith("/") or "\\" in name
            or any(part in ("", ".", "..") for part in name.split("/"))):
        raise ValueError("unsafe archive path")
    if not (name in (MANIFEST, "package.json", "package-lock.json", "NODE-LICENSE")
            or name == "bin/node" or name == "scripts/musuw-admin-server.mjs"
            or name.startswith("node_modules/")
            or name.startswith("weknora/frontend/dist/")):
        raise ValueError("archive path outside operations allowlist")
    return path

def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

def build(source, archive, revision):
    files = {}
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise ValueError("artifact source contains symbolic link")
        if path.is_dir():
            continue
        name = path.relative_to(source).as_posix()
        safe_path(name)
        if name == MANIFEST:
            raise ValueError("artifact already has a manifest")
        if not path.is_file():
            raise ValueError("artifact source contains special file")
        files[name] = sha256(path)
    manifest = {"schema": "musuw.operations.v1", "revision": revision, "files": files}
    (source / MANIFEST).write_text(json.dumps(manifest, sort_keys=True) + "\n")
    # Identical built files yield the same digest when a workflow is retried.
    with open(archive, "wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w") as target:
            for name in sorted([*files, MANIFEST]):
                member = target.gettarinfo(str(source / name), arcname=name)
                member.uid = member.gid = member.mtime = 0
                member.uname = member.gname = ""
                member.mode = 0o755 if name == "bin/node" else 0o644
                with open(source / name, "rb") as body:
                    target.addfile(member, body)

def extract(archive, destination, revision):
    if not destination.is_dir() or any(destination.iterdir()):
        raise ValueError("artifact destination must be an empty directory")
    with tarfile.open(archive, "r:gz") as source:
        members = source.getmembers()
        if len(members) > MAX_FILES or sum(x.size for x in members) > MAX_BYTES:
            raise ValueError("artifact exceeds extraction limits")
        names = set()
        for member in members:
            safe_path(member.name)
            if not member.isfile() or member.name in names:
                raise ValueError("archive must contain unique regular files only")
            names.add(member.name)
        if MANIFEST not in names:
            raise ValueError("artifact manifest unavailable")
        manifest_member = source.getmember(MANIFEST)
        if manifest_member.size > 16 * 1024 ** 2:
            raise ValueError("artifact manifest too large")
        manifest = json.load(source.extractfile(manifest_member))
        if manifest.get("schema") != "musuw.operations.v1" or manifest.get("revision") != revision:
            raise ValueError("artifact revision does not match authorized SHA")
        files = manifest.get("files", {})
        required = {"bin/node", "scripts/musuw-admin-server.mjs", "weknora/frontend/dist/operations.html"}
        if not isinstance(files, dict) or set(files) != names - {MANIFEST} or not required <= files.keys():
            raise ValueError("artifact file manifest is incomplete")
        for name, checksum in files.items():
            if not isinstance(checksum, str) or not re.fullmatch(r"[0-9a-f]{64}", checksum):
                raise ValueError("artifact file checksum invalid")
        # Never use tar.extractall: links, metadata and special files are not accepted.
        for member in members:
            path = destination / member.name
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with open(path, "xb") as target, source.extractfile(member) as body:
                shutil.copyfileobj(body, target)
            path.chmod(0o755 if member.name == "bin/node" else 0o644)
            if member.name != MANIFEST and sha256(path) != files[member.name]:
                raise ValueError("artifact file checksum mismatch")

def main():
    if len(sys.argv) != 5 or not re.fullmatch(r"[0-9a-f]{40}", sys.argv[4]):
        raise ValueError("usage: operations-artifact.py build|extract SOURCE DEST FULL_SHA")
    action, source, destination, revision = sys.argv[1:]
    if action == "build":
        build(Path(source), Path(destination), revision)
    elif action == "extract":
        extract(Path(source), Path(destination), revision)
    else:
        raise ValueError("unknown artifact action")

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        sys.exit(f"operations artifact rejected: {error}")
