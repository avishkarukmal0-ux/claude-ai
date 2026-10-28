# 2026-10-28 — Account recovery: password reset + change password/email

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Backend/API-Routes]] · [[Frontend-Overview]] · auth (`pwaAuthService`)
**Branch:** `claude/vendora-pos-v3-KPnI0`
**Commit:** `b86be66`

## Goal
Owner asked (from the login screen) for **password reset**, **"username" (email) reset**, and social login.
Built the two that need no third-party developer apps: self-service **password reset** and in-app
**change password / change login email**. Social login (Google/Facebook) deferred — it needs the owner to
register OAuth apps + credentials and would be built honestly-disabled (the POS-cloud pattern); not started.

## What changed
**Backend**
- `models/Account.js` — added `tokenVersion` (owner equivalent of Member's; bumped on every password
  change/reset to invalidate old tokens), `resetTokenHash` + `resetTokenExpiresAt` (single-use, 1-hour), and
  `hashResetToken` (SHA-256 — a reset token is high-entropy, so a fast hash is right; bcrypt stays for passwords).
- `services/emailService.js` — `isConfigured()` (true when `SENDGRID_API_KEY` set, or in dev where send() logs).
- `services/pwaAuthService.js` —
  - Owner tokens now carry the account's `tokenVersion` (login/register/refresh); **owner refresh re-checks it**
    so a refresh token minted before a reset/change is rejected (access tokens expire on their own).
  - `requestPasswordReset(email)` — **enumeration-safe** (same response whether or not the email exists);
    stores a hashed token and, when email is configured, sends the reset link; returns `{ emailConfigured }`
    so the UI can be honest. Members are reset by their owner, so they get the generic response.
  - `resetPassword({email,token,password})` — validates an unexpired, matching (timing-safe) token, sets the
    new password, bumps `tokenVersion`, clears the token (single-use), signs the owner in.
  - `changePassword(decoded,…)` — owner OR member; verifies current password, bumps the relevant
    tokenVersion (logs OTHER sessions out), returns fresh tokens so THIS session stays in.
  - `changeEmail(decoded,…)` — owner only; verifies password, rejects an email already in use.
- `middleware/rateLimit.js` — `resetIpLimiter` + `resetEmailLimiter` (own buckets, like register).
- `routes/pwaAuthRoutes.js` — `POST /forgot-password`, `/reset-password` (public, reset-limited);
  `/change-password` (authed), `/change-email` (authed + owner).

**Frontend**
- `lib/account.js` — `forgotPassword`, `resetPassword` (activates session), `changePassword`
  (re-persists re-minted tokens, guards against a session that changed mid-request), `changeEmail`.
- `components/account/AccountView.jsx` — "Forgot your password?" on the login screen → email form (honest
  "not switched on" message when email delivery isn't configured); the emailed `/account?reset=…&email=…`
  deep link → set-new-password form → auto sign-in (clears the query param); logged-in panel gains
  **Change password** (owner + staff) and **Change login email** (owner only), each an inline confirm form.
- SW `CACHE_VERSION` v70 → **v71**.

## Decisions / security
- **Enumeration-safe** reset: never reveals which emails are registered. Returning `emailConfigured` reveals
  only whether the SERVER can send reset mail (not account existence) — needed so the UI doesn't say "check
  your email" when nothing will arrive.
- Reset tokens are **hashed at rest, single-use, 1-hour**, compared timing-safe.
- A reset/change **bumps tokenVersion** → old sessions die (owner on refresh; member on the data path too).
- No new dependencies.

## Dependency on owner setup
Reset emails only actually send when **`SENDGRID_API_KEY`** is set on the backend (+ `NOTIFY_FROM_EMAIL` /
`SENDGRID_FROM_EMAIL` for the From). Until then the flow works but the UI honestly says reset-by-email isn't
switched on. The in-app change password/email needs nothing extra.

## Verify
- `npm run build` ✓ · full vitest **616 passed (85 files)** ✓ · backend boot ✓ ·
  `pwaAuthRecovery` jest **12** + unit/POS suites **129 total** ✓.

## Follow-ups
- [ ] Owner: set `SENDGRID_API_KEY` (+ From) to enable reset emails; same key powers the digest.
- [ ] Social login (Google/Facebook) if still wanted — needs the owner's OAuth apps; build honestly-disabled.
- [ ] Optional: verify a NEW email before switching it (needs email on); today it changes on password confirm.
