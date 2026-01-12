---
trigger: always_on
---

Security Non-Negotiables

No Hardcoded Secrets: NEVER output API keys, passwords, or tokens in code. Use os.getenv().
Input Validation: All user inputs (CLI args, HTTP requests) must be validated and sanitized.
Safe Imports: Do not use eval() or exec() under any circumstances.