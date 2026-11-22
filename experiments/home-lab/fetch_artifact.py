#!/usr/bin/env python3
"""Resume an official artifact download and verify it before publishing its filename."""
import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path


def fetch(spec, destination):
    destination = Path(destination).expanduser()
    destination.parent.mkdir(parents=True, exist_ok=True)
    part = destination.with_name(destination.name + '.part')
    record = destination.with_name(destination.name + '.verified.json')
    if destination.exists() and record.exists():
        saved = json.loads(record.read_text())
        stat = destination.stat()
        if saved.get('size') == stat.st_size and saved.get('mtime_ns') == stat.st_mtime_ns:
            if not spec.get('sha256') or saved.get('sha256') == spec['sha256']:
                print(f'Already verified: {destination}', flush=True)
                return saved
    existing = destination.exists()
    if existing and not (spec.get('sha256') or spec.get('md5')):
        raise RuntimeError(f'Existing file has no trusted expected digest for verification: {destination}')
    started = time.time()
    last = None
    for url in ([] if existing else spec['urls']):
        if not url.startswith('https://'):
            raise ValueError('Only HTTPS artifact URLs are accepted')
        print(f'Downloading {spec["name"]} from {url}', flush=True)
        result = subprocess.run([
            '/usr/bin/curl', '--fail', '--location', '--show-error', '--silent',
            '--proto', '=https', '--proto-redir', '=https',
            '--connect-timeout', '20', '--retry', '8', '--retry-delay', '5',
            '--retry-all-errors', '--speed-limit', '32768', '--speed-time', '90',
            '--continue-at', '-', '--output', str(part), url,
        ])
        if result.returncode == 0:
            last = url
            break
    if existing:
        last = 'existing file verified against pinned manifest'
    elif last is None:
        raise RuntimeError(f'All artifact sources failed; partial download retained: {part}')
    source = destination if existing else part
    if spec.get('size') and source.stat().st_size != spec['size']:
        raise RuntimeError(f'Unexpected size for {source}: {source.stat().st_size}')
    print(f'Checking complete artifact: {source}', flush=True)
    hashes = {'sha256': hashlib.sha256()}
    if spec.get('md5'):
        hashes['md5'] = hashlib.md5()
    with source.open('rb') as f:
        while data := f.read(8 * 1024 * 1024):
            for hasher in hashes.values():
                hasher.update(data)
    digests = {name: hasher.hexdigest() for name, hasher in hashes.items()}
    for name, actual in digests.items():
        if spec.get(name) and spec[name].lower() != actual:
            raise RuntimeError(f'{name} mismatch; final artifact not published: {part}')
    if not existing:
        os.replace(part, destination)
    stat = destination.stat()
    result = {
        'name': spec['name'], 'url': last, 'size': stat.st_size,
        'mtime_ns': stat.st_mtime_ns, **digests,
        'expected_digest_verified': bool(spec.get('sha256') or spec.get('md5')),
        'published_digest_verified': spec.get('digest_origin') == 'publisher',
        'elapsed_seconds': round(time.time() - started, 3),
    }
    record.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result), flush=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('artifact')
    parser.add_argument('destination')
    args = parser.parse_args()
    fetch(json.loads(args.manifest.read_text())[args.artifact], args.destination)
