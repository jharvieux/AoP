# Data Classification & Privacy Inventory

> **Classification Date:** 2026-07-19  
> **Scope:** Pre-launch review per external code audit (engagement 2026-07-18).  
> **Threat Model:** Low PII footprint; no PHI, no PCI (Stripe holds card data).

## PII-Bearing Columns

### User Identity

- **`profiles.display_name`** (text)  
  User-chosen account name. Direct PII.
  - Cascade: deletes when `auth.users` is deleted ✓
  - Retention: N/A (cascades on account deletion)

- **`auth.users.email`** (managed by Supabase Auth)  
  Email address. Direct PII, managed by Supabase Auth and not in AoP's schema.
  - Retention: Subject to Supabase Auth's lifecycle; AoP does not manage.

### Device Push Tokens

- **`push_tokens.token`** (text)  
  Device-linked identifier (APNs/FCM). Sensitive: leaking enables targeted push/abuse and is intrinsically linked to a physical device.
  - Platform: `ios`, `android`, or `web`
  - Updated: server-side timestamp on each re-registration
  - Cascade: deletes when `auth.users` is deleted ✓ (references `auth.users (id) on delete cascade`)
  - RLS: Correctly restricted to own-row-only (user can only see/manage their own tokens)
  - Retention: Per discussion, **define pre-launch** (recommendation: tie to user consent + device re-registration cycle, or purge unregistered tokens after N days)

### Payment/Purchase Linkage

- **`entitlements.source`** (text)  
  Payment source identifier: `stripe`, `apple_iap`, `google_iap`, or `grant`. Reveals purchase origin and implies payment method.
  - Additional sensitive column: `entitlements.key` (e.g., `remove_ads`) indicates entitlement type.
  - Cascade: deletes when `profiles` is deleted (cascade from `auth.users`) ✓
  - Retention: **Define pre-launch**; tie to entitlement expiry or user consent timeline.

### User-Generated Content

- **`match_chat.body`** (text, 1–500 chars)  
  Chat message content, user-typed during in-match communication. Indirect PII (may contain slurs, strategy reveals, or personal mentions).
  - Channel: `all` (match-wide) or `alliance` (alliance-members-only)
  - Author: identified by `seat` (not direct user_id; seat references `match_players.user_id` indirectly)
  - **Cascade behavior:** `match_chat.match_id` cascades from `matches` on match deletion. **BUT:** when a user is deleted, `match_players.user_id` is set to NULL (not deleted); `match_chat` rows remain with stale seat associations.
  - **Retention:** **Define pre-launch** (recommendation: either purge all chat for a deleted user retroactively, or impose a TTL on `match_chat` rows regardless of user deletion).

## JSON Containers (Flagged for Verification)

### `matches.settings` (jsonb)

Game configuration container per `docs/MULTIPLAYER.md §3`. Stores:

- `mapSize` — map generation parameter
- `maxPlayers` — seat count
- `turnTimerSeconds` — turn time limit (seconds) or `null`
- `betrayalTruceRounds` — host-chosen betrayal window
- `captainCaptivityRounds` — host-chosen captivity window
- `topology` — grid topology selector
- `roundLimit` — host-chosen round cap

**PII Review:** None observed. Container holds only game parameters; no user names, emails, or device identifiers. Safe to denormalize.

---

## Deletion Cascade Summary

### When `auth.users` is deleted:

1. ✓ `profiles` row deleted (cascade from auth.users)
2. ✓ `push_tokens` rows deleted (cascade from auth.users)
3. ✓ `entitlements` rows deleted (cascade from profiles)
4. ✓ `match_players.user_id` set to NULL (on delete set null)
5. ✓ `matches.created_by` set to NULL if user created a match (on delete set null)
6. ✓ `match_spectators.granted_by` set to NULL if user granted spectator access (on delete set null)
7. ⚠️ `match_chat` rows persist with stale seat associations (no cascade behavior)

### Verified by:

- `20260707070003_account_deletion_fk_cleanup.sql` (match_players, matches, match_spectators FK updates)
- `20260702000000_initial_schema.sql` (profiles, entitlements cascade)
- `20260705000003_push_tokens.sql` (push_tokens cascade)

---

## Findings & Gaps

### Critical

- **`match_chat` retention on user deletion:** When a user is deleted, their chat messages remain in the database, orphaned (author's `match_players` row is set to NULL, breaking the semantic link). This may violate GDPR/CCPA right-to-erasure expectations. **Action:** Either (a) add a retroactive purge of all `match_chat` rows authored by a deleted user, or (b) implement a TTL on chat (e.g., purge after 30 days regardless of user status).

### Medium

- **Push-token retention policy:** No documented TTL or consent lifecycle. Device tokens can accumulate indefinitely, increasing the stored device-identifier footprint. **Action:** Define a retention policy (e.g., purge tokens not registered for >90 days, or tie to explicit user consent).

- **Entitlements retention policy:** No documented retention window. Payment history is retained indefinitely. **Action:** Define a retention policy (e.g., purge after 1 year, or after entitlement expiry + N days for audit/chargeback).

### Low

- **Match-chat content moderation:** No documented moderation or PII-filtering policy for user-generated chat. Users could inject personally identifiable information into messages. **Action:** Document the moderation strategy (manual review, auto-filter, or acceptance of user responsibility).

---

## Recommendations Before Launch

1. **Implement chat deletion on user deletion:** Add a migration to enforce `match_chat` rows deletion (or mark for anonymization) when the associated `match_players` row is deleted.
2. **Define push-token retention:** Set a policy (e.g., auto-purge unregistered tokens after 90 days).
3. **Define entitlements retention:** Set a policy (e.g., purge 1 year after grant or expiry).
4. **Update DSAR (Data Subject Access Request) workflow:** Document which tables are included in export (confirm chat and push tokens are exported or excluded intentionally).
5. **Document user-content moderation:** Clarify whether match chat is moderated, filtered, or stored as-is.

---

## Compliance Checklist

| Item                     | Status        | Notes                                                           |
| ------------------------ | ------------- | --------------------------------------------------------------- |
| No PHI stored            | ✓ Pass        | No health data.                                                 |
| No PCI stored            | ✓ Pass        | Stripe holds cards; only source/entitlement ref here.           |
| PII documented           | ✓ Pass        | All PII columns listed above.                                   |
| Deletion cascade for PII | ⚠️ Partial    | profiles, push_tokens, entitlements OK; match_chat gap.         |
| Retention policy         | ✗ Not defined | Push tokens, entitlements, chat need explicit TTL/policy.       |
| RLS enforced             | ✓ Pass        | push_tokens RLS = own-row-only. Chat RLS per §11 (listen-only). |
| Encryption at rest       | Assumed       | Supabase default. Verify with ops.                              |

---

**Next:** Review with privacy/legal before launch. Update this document post-review.
