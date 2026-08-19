#!/usr/bin/env python3
"""Raise acme-dns TXT slots so one account can validate a grouped SAN cert."""

from __future__ import annotations

import sys
from pathlib import Path

TXT_RECORD_SLOTS = 100

LIMIT_OLD = "SELECT Value FROM txt WHERE Subdomain=$1 LIMIT 2"
LIMIT_NEW = (
    f"SELECT Value FROM txt WHERE Subdomain=$1 AND Value != '' "
    f"ORDER BY LastUpdate DESC LIMIT {TXT_RECORD_SLOTS}"
)

INSERT_OLD = """// NewTXTValuesInTransaction creates two rows for subdomain to the txt table
func (d *acmednsdb) NewTXTValuesInTransaction(tx *sql.Tx, subdomain string) error {
	var err error
	instr := fmt.Sprintf("INSERT INTO txt (Subdomain, LastUpdate) values('%s', 0)", subdomain)
	_, _ = tx.Exec(instr)
	_, _ = tx.Exec(instr)
	return err
}
"""

INSERT_NEW = f"""// NewTXTValuesInTransaction creates {TXT_RECORD_SLOTS} rows for subdomain to the txt table
func (d *acmednsdb) NewTXTValuesInTransaction(tx *sql.Tx, subdomain string) error {{
	instr := fmt.Sprintf("INSERT INTO txt (Subdomain, LastUpdate) values('%s', 0)", subdomain)
	for i := 0; i < {TXT_RECORD_SLOTS}; i++ {{
		if _, err := tx.Exec(instr); err != nil {{
			return err
		}}
	}}
	return nil
}}
"""

INIT_OLD = """	if err == nil {
		if versionString == "0" {
			// No errors so we should now be in version 1
			insversion := fmt.Sprintf("INSERT INTO acmedns (Name, Value) values('db_version', '%d')", DBVersion)
			_, err = db.Exec(insversion)
		}
	}
	return d, err
}
"""

INIT_NEW = """	if err == nil {
		if versionString == "0" {
			// No errors so we should now be in version 1
			insversion := fmt.Sprintf("INSERT INTO acmedns (Name, Value) values('db_version', '%d')", DBVersion)
			_, err = db.Exec(insversion)
		}
	}
	if err == nil {
		err = d.ensureTXTSlots()
	}
	return d, err
}
"""

ENSURE_FN = f"""
const txtRecordSlots = {TXT_RECORD_SLOTS}

func (d *acmednsdb) ensureTXTSlots() error {{
	rows, err := d.DB.Query("SELECT Subdomain FROM records")
	if err != nil {{
		return err
	}}
	defer rows.Close()

	var subdomains []string
	for rows.Next() {{
		var subdomain string
		if err = rows.Scan(&subdomain); err != nil {{
			return err
		}}
		if subdomain != "" {{
			subdomains = append(subdomains, subdomain)
		}}
	}}
	if err = rows.Err(); err != nil {{
		return err
	}}

	countSQL := "SELECT COUNT(*) FROM txt WHERE Subdomain=$1"
	insertSQL := "INSERT INTO txt (Subdomain, LastUpdate) values($1, 0)"
	if d.Config.Database.Engine == "sqlite" || d.Config.Database.Engine == "sqlite3" {{
		countSQL = getSQLiteStmt(countSQL)
		insertSQL = getSQLiteStmt(insertSQL)
	}}

	for _, subdomain := range subdomains {{
		var count int
		if err = d.DB.QueryRow(countSQL, subdomain).Scan(&count); err != nil {{
			return err
		}}
		for count < txtRecordSlots {{
			if _, err = d.DB.Exec(insertSQL, subdomain); err != nil {{
				return err
			}}
			count++
		}}
	}}
	return nil
}}
"""


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return source.replace(old, new, 1)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_txt_slots.py path/to/db.go")

    path = Path(sys.argv[1])
    source = path.read_text()
    source = replace_once(source, LIMIT_OLD, LIMIT_NEW, "GetTXTForDomain LIMIT")
    source = replace_once(source, INSERT_OLD, INSERT_NEW, "NewTXTValuesInTransaction")
    source = replace_once(source, INIT_OLD, INIT_NEW, "Init ensureTXTSlots")
    if "func (d *acmednsdb) ensureTXTSlots()" in source:
        raise SystemExit("ensureTXTSlots already present")
    source = source.rstrip() + "\n" + ENSURE_FN
    path.write_text(source)
    print(f"patched {path} to {TXT_RECORD_SLOTS} TXT slots")


if __name__ == "__main__":
    main()
