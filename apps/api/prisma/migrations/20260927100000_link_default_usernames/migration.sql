-- Link usernames for known default accounts created before username sign-in.
-- Existing custom usernames win, and order data is not affected.
UPDATE "User" AS target
SET "username" = CASE target."email"
  WHEN 'admin@deliverysystem.app' THEN 'admin'
  WHEN 'cashier@deliverysystem.app' THEN 'cashier'
  WHEN 'inventory@deliverysystem.app' THEN 'inventory'
  WHEN 'kitchen@deliverysystem.app' THEN 'kitchen'
  WHEN 'driver@deliverysystem.app' THEN 'driver'
  WHEN 'customer@deliverysystem.app' THEN 'customer'
END
WHERE target."username" IS NULL
  AND target."email" IN (
    'admin@deliverysystem.app',
    'cashier@deliverysystem.app',
    'inventory@deliverysystem.app',
    'kitchen@deliverysystem.app',
    'driver@deliverysystem.app',
    'customer@deliverysystem.app'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "User" AS owner
    WHERE owner."username" = split_part(target."email", '@', 1)
  );