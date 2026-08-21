#!/usr/bin/env python3

import unittest

from domains import (
    apex_name,
    challenge_zones,
    expand_line,
    find_account,
    implied_parent_wildcards,
    line_apex,
    storage_candidates,
)

CREDS = {"username": "u", "password": "p", "subdomain": "s", "fulldomain": "s.example.test"}


class DomainsTest(unittest.TestCase):
    def test_implied_label_parent(self):
        self.assertEqual(
            implied_parent_wildcards("*.label.parent.mdstn.com"),
            ["*.parent.mdstn.com"],
        )

    def test_implied_fail_label_parent(self):
        self.assertEqual(
            implied_parent_wildcards("*.fail.label.parent.mdstn.com"),
            ["*.parent.mdstn.com", "*.label.parent.mdstn.com"],
        )

    def test_expand_dedupes_root_wildcard(self):
        expanded = expand_line([
            "mdstn.com",
            "*.mdstn.com",
            "*.label.parent.mdstn.com",
        ])
        self.assertEqual(
            expanded,
            [
                "mdstn.com",
                "*.mdstn.com",
                "*.parent.mdstn.com",
                "*.label.parent.mdstn.com",
            ],
        )

    def test_expand_nested_fail(self):
        expanded = expand_line([
            "mdstn.com",
            "*.mdstn.com",
            "*.fail.label.parent.mdstn.com",
        ])
        self.assertEqual(
            expanded,
            [
                "mdstn.com",
                "*.mdstn.com",
                "*.parent.mdstn.com",
                "*.label.parent.mdstn.com",
                "*.fail.label.parent.mdstn.com",
            ],
        )

    def test_storage_walk_reaches_apex(self):
        storage = {"mdstn.com": CREDS}
        key, account = find_account(storage, "*.admin.mdstn.com")
        self.assertEqual(key, "mdstn.com")
        self.assertEqual(account, CREDS)

    def test_storage_walk_specific_key_first(self):
        storage = {
            "mdstn.com": {"subdomain": "root"},
            "admin.mdstn.com": CREDS,
        }
        key, account = find_account(storage, "*.admin.mdstn.com")
        self.assertEqual(key, "admin.mdstn.com")
        self.assertEqual(account, CREDS)

    def test_storage_walk_skips_public_acmedns_io(self):
        local = {
            "username": "local",
            "password": "p",
            "subdomain": "uuid-local",
            "fulldomain": "uuid-local.auth.uti.email",
            "server_url": "https://auth.uti.email",
        }
        public = {
            "username": "public",
            "password": "p",
            "subdomain": "uuid-public",
            "fulldomain": "uuid-public.auth.acme-dns.io",
            "server_url": "https://auth.acme-dns.io",
        }
        storage = {"oib.mdstn.com": public, "mdstn.com": local}
        skipped: list[str] = []
        key, account = find_account(
            storage,
            "oib.mdstn.com",
            prefer_url="https://auth.uti.email",
            skipped=skipped,
        )
        self.assertEqual(skipped, ["oib.mdstn.com"])
        self.assertEqual(key, "mdstn.com")
        self.assertEqual(account, local)

    def test_storage_candidates_order(self):
        keys = storage_candidates("*.fail.label.parent.mdstn.com")
        self.assertEqual(keys[0], "*.fail.label.parent.mdstn.com")
        self.assertIn("mdstn.com", keys)
        self.assertNotIn("com", keys)

    def test_challenge_zones_unique(self):
        zones = challenge_zones([
            "mdstn.com",
            "*.mdstn.com",
            "*.oib.mdstn.com",
        ])
        self.assertEqual(zones, ["mdstn.com", "oib.mdstn.com"])

    def test_apex_name(self):
        self.assertEqual(apex_name("*.admin.mdstn.com"), "admin.mdstn.com")
        self.assertEqual(apex_name("mdstn.com"), "mdstn.com")

    def test_line_apex_ignores_order(self):
        self.assertEqual(
            line_apex(["*.oib.mdstn.com", "*.admin.mdstn.com", "mdstn.com"]),
            "mdstn.com",
        )
        self.assertEqual(
            line_apex(["mdstn.com", "*.oib.mdstn.com"]),
            "mdstn.com",
        )

    def test_expand_shuffled_line_is_stable(self):
        shuffled = ["*.oib.mdstn.com", "*.admin.mdstn.com", "mdstn.com"]
        written = ["mdstn.com", "*.admin.mdstn.com", "*.oib.mdstn.com"]
        self.assertEqual(expand_line(shuffled), expand_line(written))
        self.assertEqual(
            expand_line(shuffled),
            ["mdstn.com", "*.admin.mdstn.com", "*.oib.mdstn.com"],
        )
        self.assertEqual(line_apex(shuffled), line_apex(written))


if __name__ == "__main__":
    unittest.main()
