## Critical

Token refresh moved from the client into [UserService](diff:src/services/user.ts#L13-L19). The
old client-side path in [auth/token.ts](diff:src/auth/token.ts#old:L6-L12) is deleted.

## Notable

New route [POST /auth/refresh](diff:src/routes/auth.ts#L6-L9) with a rate limit. The service now
revokes sessions in [remove()](diff:src/services/user.ts#L28).

## Minor

Renamed helpers in [utils/time.ts](diff:src/utils/time.ts), the [README](diff:README.md) mentions
the new flow, and `assets/logo.png` was added. A stale reference: [missing](diff:src/missing/file.ts).
