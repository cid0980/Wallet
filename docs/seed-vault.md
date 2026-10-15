# Seed the shared vault directly in Firestore

The app normally offers a "Create the shared vault" form on first run. If you would
rather create it yourself, add the document once in the Firebase console.

## Steps

1. Firebase console → **Firestore Database** → **Data**.
2. **Start collection** → collection ID: `vaults` → **Next**.
3. Document ID: `main` → **Next**.
4. Add these fields (Add field, one line each). Use the `map` type where noted:

| Field | Type | Value |
| --- | --- | --- |
| `name` | string | `Our Vault` |
| `createdAt` | timestamp | click the clock icon, pick today |
| `members` | map | see below |
| `totals` | map | see below |

`members` map:

| Subfield | Type | Value |
| --- | --- | --- |
| `a.name` | string | your name |
| `a.email` | string | your sign-in email, lower case |
| `b.name` | string | your friend's name |
| `b.email` | string | your friend's sign-in email, lower case |

`totals` map:

| Subfield | Type | Value |
| --- | --- | --- |
| `earned` | number | `0` |
| `spent` | number | `0` |
| `a` | map | `received` number `0`, `spent` number `0` |
| `b` | map | `received` number `0`, `spent` number `0` |

Or paste the JSON from `docs/firestore-seed-vault.json` into the console's
**JSON** field for the document (replace the placeholder timestamp with the
console's Timestamp control).

## Rules that apply

- Only the two emails listed in `members` can read or write anything in this vault.
- Every email must match **exactly** (lower case is what the app stores).
- The app shows the same vault to both people, because both emails are members.

## Accounts

Create one email/password account per person in the app (`Create the account` on
the sign-in screen), using exactly the emails listed above. No Google sign-in and
no email verification step is involved.
