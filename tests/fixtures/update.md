Addressed the round 1 comments.

- **Hardcoded timeout**: the value now comes from config in
  [refreshSession()](diff:src/services/user.ts#L13-L19).
- **Retry path**: documented next to [POST /auth/refresh](diff:src/routes/auth.ts#L6-L9).

Not changed: the migration stays in this change, as discussed.
