-- ===========================================================================
-- FROSTGUARD — CHECK constraints and additional indexes
-- Re-running is safe: duplicate-object errors are ignored by apply-sql.ts.
-- ===========================================================================

-- @statement
ALTER TABLE temperature_excursions ADD CONSTRAINT chk_excursion_minmax CHECK (minTemp <= maxTemp);

-- @statement
ALTER TABLE sensor_readings ADD CONSTRAINT chk_reading_range CHECK (temperature >= -100 AND temperature <= 80);

-- @statement
ALTER TABLE sensor_readings ADD CONSTRAINT chk_reading_humidity CHECK (humidity IS NULL OR (humidity >= 0 AND humidity <= 100));

-- @statement
ALTER TABLE batches ADD CONSTRAINT chk_batch_quantities CHECK (remainingQuantity >= 0 AND remainingQuantity <= quantity);

-- @statement
ALTER TABLE batches ADD CONSTRAINT chk_batch_dates CHECK (expiresAt > manufacturedAt);

-- @statement
ALTER TABLE shipments ADD CONSTRAINT chk_shipment_progress CHECK (progressPercent >= 0 AND progressPercent <= 100);

-- Only explicitly sourced positions may be drawn as a shipment's current location.
-- @statement
ALTER TABLE shipments ADD CONSTRAINT chk_shipment_position_source CHECK (positionSource IN ('UNAVAILABLE', 'SIMULATED', 'OPERATOR_REPORTED', 'DELIVERY_CONFIRMED'));

-- @statement
ALTER TABLE product_temperature_profiles ADD CONSTRAINT chk_profile_range CHECK (minTemp < maxTemp);

-- @statement
ALTER TABLE alerts ADD CONSTRAINT chk_alert_severity CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL'));

-- @statement
ALTER TABLE incidents ADD CONSTRAINT chk_incident_severity CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL'));

-- @statement
CREATE INDEX idx_readings_org_sensor_seq ON sensor_readings (orgId, sensorId, sequenceNumber);

-- @statement
CREATE INDEX idx_alerts_status_severity ON alerts (status, severity, createdAt);

-- @statement
CREATE INDEX idx_shipments_org_status_created ON shipments (orgId, status, createdAt);
