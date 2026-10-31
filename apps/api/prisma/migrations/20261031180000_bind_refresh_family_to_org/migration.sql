-- Bind each opaque refresh-token family to the organization selected at login.
-- Existing browser sessions are revoked so a legacy family cannot be silently
-- assigned to a different tenant during the backfill.
ALTER TABLE `refresh_tokens` ADD COLUMN `orgId` VARCHAR(191) NULL;

UPDATE `refresh_tokens` AS rt
JOIN `memberships` AS m ON m.`userId` = rt.`userId`
SET rt.`orgId` = m.`orgId`
WHERE rt.`orgId` IS NULL
  AND m.`orgId` = (
    SELECT MIN(m2.`orgId`) FROM `memberships` AS m2 WHERE m2.`userId` = rt.`userId`
  );

UPDATE `refresh_tokens`
SET `revokedAt` = COALESCE(`revokedAt`, CURRENT_TIMESTAMP(3));

DELETE FROM `refresh_tokens` WHERE `orgId` IS NULL;

ALTER TABLE `refresh_tokens` MODIFY `orgId` VARCHAR(191) NOT NULL;
CREATE INDEX `refresh_tokens_orgId_userId_idx` ON `refresh_tokens`(`orgId`, `userId`);
ALTER TABLE `refresh_tokens`
  ADD CONSTRAINT `refresh_tokens_orgId_fkey`
  FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
