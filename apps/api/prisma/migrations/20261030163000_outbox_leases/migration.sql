-- Lease fields allow independent workers to atomically claim/recover outbox rows.
ALTER TABLE `outbox_events`
  ADD COLUMN `claimToken` VARCHAR(36) NULL,
  ADD COLUMN `claimedUntil` DATETIME(3) NULL;

CREATE INDEX `outbox_events_status_claimedUntil_idx`
  ON `outbox_events` (`status`, `claimedUntil`);
