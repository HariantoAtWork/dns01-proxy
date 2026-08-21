#!/usr/bin/env python3
"""
acme-dns authenticator hook for Certbot
Based on: https://github.com/joohoi/acme-dns-certbot-joohoi
Supports both standard format and clientstorage.json format
"""

import json
import os
import sys

import requests
from urllib.parse import urljoin

from domains import apex_name, find_account, storage_candidates

ACMEDNS_URL = os.environ.get("ACMEDNS_URL", "https://auth.acme-dns.io")
STORAGE_PATH = os.environ.get("STORAGE_PATH", "/config/clientstorage.json")


class AcmeDnsClient:
    def __init__(self, acmedns_url):
        self.acmedns_url = acmedns_url

    def update_txt_record(self, account, txt):
        """Update the TXT record for the account"""
        server_url = account.get("server_url", self.acmedns_url)

        update = {"subdomain": account["subdomain"], "txt": txt}
        headers = {"X-Api-User": account["username"], "X-Api-Key": account["password"]}
        res = requests.post(
            urljoin(server_url, "/update"), headers=headers, json=update
        )
        if res.status_code == 200:
            return True
        raise Exception("Could not update TXT record: {}".format(res.text))


def load_storage():
    """Load existing acme-dns accounts from storage"""
    if os.path.exists(STORAGE_PATH):
        with open(STORAGE_PATH, "r") as f:
            return json.load(f)
    return {}


def main():
    domain = os.environ.get("CERTBOT_DOMAIN")
    validation = os.environ.get("CERTBOT_VALIDATION")

    if not domain or not validation:
        print("Error: CERTBOT_DOMAIN and CERTBOT_VALIDATION must be set")
        sys.exit(1)

    storage = load_storage()
    skipped: list[str] = []
    storage_key, account = find_account(
        storage, domain, prefer_url=ACMEDNS_URL, skipped=skipped
    )

    for key in skipped:
        print(
            f"Skipping stored key {key} "
            f"(server_url is not this stack's ACMEDNS_URL {ACMEDNS_URL})"
        )

    if account is None:
        candidates = ", ".join(storage_candidates(domain))
        extra = ""
        if skipped:
            extra = (
                f" Skipped {', '.join(skipped)} because those rows point at "
                "another acme-dns (often https://auth.acme-dns.io). "
                "Register the line apex against this stack and CNAME to that fulldomain."
            )
        print(
            f"No acme-dns account for {domain}. Looked for: {candidates}.{extra} "
            "Register the line apex in acmedns-client (e.g. mdstn.com for nested "
            f"wildcards on that zone), and CNAME _acme-challenge.{apex_name(domain)} "
            "to that fulldomain (nested zones can chain to the apex challenge name)."
        )
        sys.exit(1)

    if storage_key not in (domain, apex_name(domain)):
        print(f"Using stored key {storage_key} for {domain}")

    server_url = account.get("server_url", ACMEDNS_URL)
    print(f"Updating TXT record for {domain} via {server_url}")
    AcmeDnsClient(ACMEDNS_URL).update_txt_record(account, validation)
    print(f"Successfully updated TXT record for {domain}")


if __name__ == "__main__":
    main()
