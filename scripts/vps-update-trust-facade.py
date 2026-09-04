#!/usr/bin/env python3
"""Update New API footer + FAQ for KeyoAPI trust facade."""
import json
import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-relay/data/new-api/one-api.db"

FOOTER = (
    '<div style="line-height:1.7">'
    "<strong>KeyoAPI</strong> · OpenAI-compatible API gateway<br/>"
    '<a href="https://www.keyoapi.xyz/pricing">Pricing</a> · '
    '<a href="https://www.keyoapi.xyz/status">Status</a> · '
    '<a href="https://www.keyoapi.xyz/faq">FAQ</a> · '
    '<a href="https://www.keyoapi.xyz/privacy-policy">Privacy Policy</a> · '
    '<a href="https://www.keyoapi.xyz/user-agreement">Terms of Service</a> · '
    '<a href="https://www.keyoapi.xyz/brand/aup.html">Acceptable Use</a> · '
    'Support: <a href="mailto:kopsail521@gmail.com">kopsail521@gmail.com</a>'
    "</div>"
)

FAQ = [
    {
        "id": 1,
        "question": "How do I get started?",
        "answer": "Sign up → Wallet top-up → create an API key → set Base URL to https://www.keyoapi.xyz/v1. Browse models at /pricing.",
    },
    {
        "id": 2,
        "question": "How do I top up?",
        "answer": "Open Wallet after login and pay via Waffo. Credits are prepaid and used for API calls.",
    },
    {
        "id": 3,
        "question": "Can I see prices without logging in?",
        "answer": "Yes. Visit /pricing. Legacy /models redirects there.",
    },
    {
        "id": 4,
        "question": "Support contact?",
        "answer": "Email kopsail521@gmail.com. We aim to reply within 3 business days. Status: /status · FAQ: /faq",
    },
]

conn = sqlite3.connect(DB)
cur = conn.cursor()


def upsert(key: str, value: str) -> None:
    row = cur.execute("SELECT 1 FROM options WHERE `key`=?", (key,)).fetchone()
    if row:
        cur.execute("UPDATE options SET value=? WHERE `key`=?", (value, key))
    else:
        cur.execute("INSERT INTO options (`key`, value) VALUES (?, ?)", (key, value))


upsert("Footer", FOOTER)
upsert("console_setting.faq", json.dumps(FAQ, ensure_ascii=False))
upsert("console_setting.faq_enabled", "true")
# legacy key if migration not run
upsert("FAQ", json.dumps(FAQ, ensure_ascii=False))
conn.commit()
conn.close()
print("DONE_TRUST_FOOTER_FAQ")
