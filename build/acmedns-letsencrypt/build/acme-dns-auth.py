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

ACMEDNS_URL = os.environ.get("ACMEDNS_URL", "https://auth.acme-dns.io")
STORAGE_PATH = os.environ.get("STORAGE_PATH", "/config/clientstorage.json")


class AcmeDnsClient:
    def __init__(self, acmedns_url):
        self.acmedns_url = acmedns_url

    def update_txt_record(self, account, txt):
        """Update the TXT record for the account"""
        # Get the server URL from account if available, otherwise use default
        # This allows mixing different acme-dns servers in the same clientstorage.json
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


def apex_name(domain):
    if domain.startswith("*."):
        return domain[2:]
    return domain


def storage_candidates(domain):
    """Exact key, apex after one `*.` prefix, then parent hostnames."""
    keys = []
    if domain.startswith("*."):
        keys.append(domain)
    apex = apex_name(domain)
    keys.append(apex)

    labels = apex.split(".")
    for index in range(1, len(labels) - 1):
        keys.append(".".join(labels[index:]))

    seen = set()
    unique = []
    for key in keys:
        if key and key not in seen:
            seen.add(key)
            unique.append(key)
    return unique


def find_account(storage, domain):
    for key in storage_candidates(domain):
        account = storage.get(key)
        if account:
            return key, account
    return None, None


def main():
    domain = os.environ.get("CERTBOT_DOMAIN")
    validation = os.environ.get("CERTBOT_VALIDATION")

    if not domain or not validation:
        print("Error: CERTBOT_DOMAIN and CERTBOT_VALIDATION must be set")
        sys.exit(1)

    storage = load_storage()
    storage_key, account = find_account(storage, domain)

    if account is None:
        candidates = ", ".join(storage_candidates(domain))
        print(
            f"No acme-dns account for {domain}. Looked for: {candidates}. "
            "Register the apex (or this hostname) in acmedns-client, and CNAME "
            f"_acme-challenge.{apex_name(domain)} to that fulldomain."
        )
        sys.exit(1)

    if storage_key not in (domain, apex_name(domain)):
        print(f"Using parent account {storage_key} for {domain}")

    print(f"Updating TXT record for {domain}")
    AcmeDnsClient(ACMEDNS_URL).update_txt_record(account, validation)
    print(f"Successfully updated TXT record for {domain}")


if __name__ == "__main__":
    main()
