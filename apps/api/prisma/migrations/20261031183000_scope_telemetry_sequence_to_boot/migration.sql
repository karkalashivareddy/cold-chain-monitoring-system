-- Device sequence counters commonly reset on reboot. Scope replay protection
-- to a device boot epoch while retaining the legacy readings as one epoch.
ALTER TABLE `sensor_readings`
  ADD COLUMN `bootId` VARCHAR(64) NOT NULL DEFAULT 'legacy' AFTER `receivedAt`;

DROP INDEX `sensor_readings_sensorId_sequenceNumber_key` ON `sensor_readings`;

CREATE UNIQUE INDEX `sensor_readings_sensorId_bootId_sequenceNumber_key`
  ON `sensor_readings`(`sensorId`, `bootId`, `sequenceNumber`);

CREATE INDEX `sensor_readings_sensorId_bootId_sequenceNumber_idx`
  ON `sensor_readings`(`sensorId`, `bootId`, `sequenceNumber`);
