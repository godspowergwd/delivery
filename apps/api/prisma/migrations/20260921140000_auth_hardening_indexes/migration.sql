-- Authentication + performance hardening. Additive only: this migration never
-- drops a column, rewrites a row or touches existing data, so it is safe to run
-- against the live database. Statements are idempotent so a partially applied
-- state can never break a deployment.

-- AlterTable: optional POS friendly sign-in name (unique when set, NULL keeps
-- every existing account working with email-only sign-in).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;

-- CreateIndex: nightly "recent sign-ins" reporting and session audits.
CREATE INDEX IF NOT EXISTS "User_lastLoginAt_idx" ON "User"("lastLoginAt");

-- CreateIndex: unique index behind login-by-username.
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

-- CreateIndex: pruning sessions that expired without being revoked.
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex: per-account audit trail (Admin > Logs filtered by user).
CREATE INDEX IF NOT EXISTS "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");
