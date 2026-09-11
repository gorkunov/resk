All four round-1 comments are addressed; one is declined with a reason below.

- **"The route hardcodes `max: 10`, use the config."** The limit is now read from
  [config.rateLimit](diff:src/config.ts#L14-L18) instead of the literal in
  [POST /auth/refresh](diff:src/routes/auth.ts#L8). Both the window and the maximum come from the
  environment, with the old values as defaults.
- **"Is the unsalted hash safe?"** Kept as is: the secret is 32 random bytes, so a salt adds
  nothing against precomputation. I added a comment saying so next to
  [hashSecret()](diff:src/auth/refresh.ts#L13-L15). Happy to switch to HMAC with a server key if you
  prefer defence in depth.
- **"Nothing purges expired rows."** Declined for this change: a purge needs a scheduler we do not
  have yet. The [expiry index](diff:db/migrations/20260911_add_refresh_tokens.sql#L9-L10) makes the
  later cleanup query cheap; I opened a follow-up task.
- **"Add a test for the unknown-token path."** Added to
  [user.service.test.ts](diff:tests/user.service.test.ts#L8-L29) alongside the expiry case.

Also changed: [remove()](diff:src/services/user.ts#L38-L39) now revokes refresh tokens before
sessions, so a crash between the two calls cannot leave a usable refresh token behind.
