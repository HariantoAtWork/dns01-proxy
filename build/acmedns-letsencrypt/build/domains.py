#!/usr/bin/env python3
"""Expand domains.txt lines and resolve clientstorage keys for nested wildcards."""

from __future__ import annotations

import sys
from urllib.parse import urlparse


PUBLIC_ACME_DNS_HOSTS = frozenset({"auth.acme-dns.io"})
INTERNAL_API_HOSTS = frozenset({"acmedns-server", "localhost", "127.0.0.1"})


def apex_name(domain: str) -> str:
    if domain.startswith("*."):
        return domain[2:]
    return domain


def implied_parent_wildcards(name: str) -> list[str]:
    """Parent *.suffix names implied by a nested wildcard (shallow first).

    Stops before the registrable apex (*.example.com); that belongs on the line explicitly.
    """
    if not name.startswith("*."):
        return []
    labels = name[2:].split(".")
    if len(labels) < 4:
        return []
    result = []
    for i in range(1, len(labels) - 1):
        suffix_labels = labels[i:]
        if len(suffix_labels) <= 2:
            continue
        result.append(f"*.{'.'.join(suffix_labels)}")
    result.reverse()
    return result


def expand_line(names: list[str]) -> list[str]:
    """Collect explicit names plus implied parents, then canonicalise display order."""
    seen: set[str] = set()
    collected: list[str] = []

    def add(entry: str) -> None:
        if entry and entry not in seen:
            seen.add(entry)
            collected.append(entry)

    for name in names:
        add(name)
        for implied in implied_parent_wildcards(name):
            add(implied)
    return canonical_sans(collected)


def line_apex(names: list[str]) -> str:
    """Shortest apex_name on the line (fewest labels, then alphabetical)."""
    apexes = [apex_name(name) for name in names if name]
    if not apexes:
        return ""
    return min(apexes, key=lambda host: (len(host.split(".")), host))


def _san_sort_key(name: str, apex: str) -> tuple:
    if name == apex:
        return (0, 0, name)
    if apex and name == f"*.{apex}":
        return (1, 0, name)
    return (2, len(apex_name(name).split(".")), name)


def canonical_sans(names: list[str]) -> list[str]:
    """Apex, then *.apex if present, then remaining names by depth then alphabetically."""
    apex = line_apex(names)
    return sorted(names, key=lambda name: _san_sort_key(name, apex))


def storage_candidates(domain: str) -> list[str]:
    """Storage keys from most specific suffix up to the registrable apex."""
    host = apex_name(domain)
    labels = host.split(".")
    if len(labels) < 2:
        return [domain] if domain else []

    keys: list[str] = []
    seen: set[str] = set()
    for i in range(len(labels) - 1):
        suffix = ".".join(labels[i:])
        for key in (f"*.{suffix}", suffix):
            if key not in seen:
                seen.add(key)
                keys.append(key)
    return keys


def hostname_from_url(url: str) -> str:
    if not url:
        return ""
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        return ""
    return host.rstrip(".").lower()


def account_matches_preferred(account: dict, prefer_url: str) -> bool:
    """Skip public acme-dns.io rows when this stack uses a different ACMEDNS_URL."""
    prefer = hostname_from_url(prefer_url)
    stored = hostname_from_url(account.get("server_url") or "")
    if not prefer:
        return True
    if stored in PUBLIC_ACME_DNS_HOSTS and prefer not in PUBLIC_ACME_DNS_HOSTS:
        return False
    if stored in INTERNAL_API_HOSTS or not stored:
        return True
    if prefer in INTERNAL_API_HOSTS:
        return stored not in PUBLIC_ACME_DNS_HOSTS
    return stored == prefer


def find_account(
    storage: dict,
    domain: str,
    prefer_url: str = "",
    skipped: list[str] | None = None,
) -> tuple[str | None, dict | None]:
    for key in storage_candidates(domain):
        account = storage.get(key)
        if not account:
            continue
        if prefer_url and not account_matches_preferred(account, prefer_url):
            if skipped is not None:
                skipped.append(key)
            continue
        return key, account
    return None, None


def challenge_zones(names: list[str]) -> list[str]:
    """Distinct _acme-challenge host suffixes (without the _acme-challenge prefix)."""
    seen: set[str] = set()
    zones: list[str] = []
    for name in names:
        zone = apex_name(name)
        if zone not in seen:
            seen.add(zone)
            zones.append(zone)
    return zones


def main() -> int:
    if len(sys.argv) < 2:
        print(
            "usage: domains.py expand|cert-name|challenge-zones|storage-candidates name ...",
            file=sys.stderr,
        )
        return 1

    command = sys.argv[1]
    names = sys.argv[2:]

    if command == "expand":
        for name in expand_line(names):
            print(name)
        return 0

    if command == "cert-name":
        print(line_apex(names))
        return 0

    if command == "challenge-zones":
        expanded = expand_line(names)
        for zone in challenge_zones(expanded):
            print(f"_acme-challenge.{zone}")
        return 0

    if command == "storage-candidates":
        if len(names) != 1:
            print("storage-candidates expects one domain", file=sys.stderr)
            return 1
        print(", ".join(storage_candidates(names[0])))
        return 0

    print(f"unknown command: {command}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
