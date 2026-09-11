Session refresh moves from the client to the server. Until now the client extended its own token
lifetime, which meant a stolen token never expired. This change introduces hashed, rotating refresh
tokens, a rate-limited endpoint to exchange them, and a migration for the new table.

## Critical

**Server-side refresh.** [UserService.refreshSession()](diff:src/services/user.ts#L23-L31) replaces
the old `refresh()`. It looks the token up by hash, rejects expired or unknown tokens with
[SessionExpiredError](diff:src/services/user.ts#L6-L11), rotates the token, and only then creates a
session. The service now takes a [Clock](diff:src/services/user.ts#L14-L17) so expiry is testable.

**Client-side refresh removed.** [refreshOnClient()](diff:src/auth/token.ts#old:L7-L13) extended
a token by appending `!` to its value with no server check. The whole file
[src/auth/token.ts](diff:src/auth/token.ts) is deleted; nothing else imported it.

**New token module.** [src/auth/refresh.ts](diff:src/auth/refresh.ts) defines
[RefreshToken](diff:src/auth/refresh.ts#L4-L9) as a SHA-256 hash plus expiry; the opaque secret is
generated in [issueRefreshToken()](diff:src/auth/refresh.ts#L17-L26) and never stored.
[rotateRefreshToken()](diff:src/auth/refresh.ts#L29-L32) keeps the remaining lifetime, so rotation
does not extend a token. Please check the hashing in [hashSecret()](diff:src/auth/refresh.ts#L13-L15):
it is unsalted, which is fine for 32 random bytes but worth a second look.

**Deleting a user now revokes everything.** [remove()](diff:src/services/user.ts#L38-L39) revokes
refresh tokens and sessions before deleting the row.

## Notable

**Endpoint.** [POST /auth/refresh](diff:src/routes/auth.ts#L8-L24) reads `refreshToken` from the
body, answers [400 when it is missing](diff:src/routes/auth.ts#L10-L13) and
[401 on SessionExpiredError](diff:src/routes/auth.ts#L17-L23); other errors propagate. It is mounted
in [routes/index.ts](diff:src/routes/index.ts#L7).

**Rate limiting.** [rateLimit()](diff:src/middleware/rate-limit.ts#L9-L28) is a fixed-window,
in-memory limiter keyed by IP. Two things to decide: it is
[per instance, not shared across replicas](diff:src/middleware/rate-limit.ts#L8), and the route
[hardcodes `max: 10`](diff:src/routes/auth.ts#L8) even though
[config.rateLimit](diff:src/config.ts#L14-L18) was added for exactly this.

**Migration.** [20260911_add_refresh_tokens.sql](diff:db/migrations/20260911_add_refresh_tokens.sql)
creates `refresh_tokens` with a unique `token_hash`, cascading delete from `users`, and
[indexes on user and expiry](diff:db/migrations/20260911_add_refresh_tokens.sql#L9-L10). There is no
job yet that purges expired rows.

**Configuration.** [Config](diff:src/config.ts#L5-L6) gains `refreshTokenTtlHours` (default 30 days)
and `rateLimit`, read in [loadConfig()](diff:src/config.ts#L14-L18).

**Clock abstraction.** `src/utils/time.ts` is renamed to [src/utils/clock.ts](diff:src/utils/clock.ts)
and gains the [Clock interface](diff:src/utils/clock.ts#L1-L4) and a
[systemClock](diff:src/utils/clock.ts#L10) default; `nowSeconds` and `addHours` are unchanged.

## Minor

- Tests: [user.service.test.ts](diff:tests/user.service.test.ts#L8-L29) is rewritten around
  `refreshSession` with a fixed clock, covering rotation, expiry, and unknown tokens.
- `package.json`: version bump to 1.5.0 and a [migrate script](diff:package.json#L6-L7).
- Docs: the [README](diff:README.md#L10-L17) lists the endpoint and the new variables;
  [docs/architecture.md](diff:docs/architecture.md#L3-L4) describes the new flow.
- `assets/session-flow.png` adds a sequence diagram of the refresh flow.
