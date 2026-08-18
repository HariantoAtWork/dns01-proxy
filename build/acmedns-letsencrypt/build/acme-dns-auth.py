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

# Configuration
ACMEDNS_URL = os.environ.get("ACMEDNS_URL", "https://auth.acme-dns.io")
STORAGE_PATH = os.environ.get("STORAGE_PATH", "/config/clientstorage.json")
ALLOW_FROM = []
FORCE_REGISTER = False


class AcmeDnsClient:
    def __init__(self, acmedns_url):
        self.acmedns_url = acmedns_url

    def register_account(self, allowfrom):
        """Register a new account with acme-dns"""
        reg_data = {"allowfrom": allowfrom}
        res = requests.post(urljoin(self.acmedns_url, "/register"), json=reg_data)
        if res.status_code == 201:
            return res.json()
        else:
            raise Exception("Could not register account: {}".format(res.text))

    def update_txt_record(self, account, txt):
        """Update the TXT record for the account"""
        # Get the server URL from account if available, otherwise use default
        # This allows mixing different acme-dns servers in the same clientstorage.json
        # (e.g., http://auth.mizu.work and https://auth.acme-dns.io)
        server_url = account.get("server_url", self.acmedns_url)
        
        update = {"subdomain": account["subdomain"], "txt": txt}
        headers = {"X-Api-User": account["username"], "X-Api-Key": account["password"]}
        res = requests.post(
            urljoin(server_url, "/update"), headers=headers, json=update
        )
        if res.status_code == 200:
            return True
        else:
            raise Exception("Could not update TXT record: {}".format(res.text))


def load_storage():
    """Load existing acme-dns accounts from storage"""
    if os.path.exists(STORAGE_PATH):
        with open(STORAGE_PATH, "r") as f:
            return json.load(f)
    return {}


def save_storage(storage):
    """Save acme-dns accounts to storage"""
    with open(STORAGE_PATH, "w") as f:
        json.dump(storage, f, indent=2)


def main():
    # Get the domain and validation string from environment variables
    domain = os.environ.get("CERTBOT_DOMAIN")
    validation = os.environ.get("CERTBOT_VALIDATION")

    if not domain or not validation:
        print("Error: CERTBOT_DOMAIN and CERTBOT_VALIDATION must be set")
        sys.exit(1)

    # Strip wildcard prefix for storage key
    storage_key = domain.lstrip("*.")

    # Load existing accounts
    storage = load_storage()
    client = AcmeDnsClient(ACMEDNS_URL)

    # Check if we need to register a new account
    if storage_key not in storage or FORCE_REGISTER:
        print(f"Registering new acme-dns account for {domain}")
        account = client.register_account(ALLOW_FROM)
        storage[storage_key] = account
        save_storage(storage)
        
        print("\n" + "=" * 80)
        print(f"IMPORTANT: Please add the following CNAME record to your DNS:")
        print(f"_acme-challenge.{storage_key} CNAME {account['fulldomain']}")
        print("=" * 80 + "\n")
    else:
        account = storage[storage_key]

    # Update the TXT record
    print(f"Updating TXT record for {domain}")
    client.update_txt_record(account, validation)
    print(f"Successfully updated TXT record for {domain}")


if __name__ == "__main__":
    main()

