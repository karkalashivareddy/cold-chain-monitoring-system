-- ===========================================================================
-- FROSTGUARD — database views
-- Applied after Prisma migrations by `npm run db:sql`.
-- ===========================================================================

-- @statement
DROP VIEW IF EXISTS v_active_excursions;

-- @statement
CREATE VIEW v_active_excursions AS
SELECT
  e.id,
  e.orgId,
  e.severity,
  e.type,
  e.status,
  e.startedAt,
  e.endedAt,
  e.minTemp,
  e.maxTemp,
  e.readingsCount,
  s.deviceId,
  s.name AS sensorName,
  su.name AS storageUnitName,
  w.name AS warehouseName,
  sh.code AS shipmentCode,
  i.code AS incidentCode,
  i.status AS incidentStatus
FROM temperature_excursions e
JOIN sensors s ON s.id = e.sensorId
LEFT JOIN storage_units su ON su.id = e.storageUnitId
LEFT JOIN warehouses w ON w.id = su.warehouseId
LEFT JOIN shipments sh ON sh.id = e.shipmentId
LEFT JOIN incidents i ON i.excursionId = e.id
WHERE e.status IN ('OPEN', 'RECOVERED');

-- @statement
DROP VIEW IF EXISTS v_shipment_risk;

-- @statement
CREATE VIEW v_shipment_risk AS
SELECT
  sh.id,
  sh.orgId,
  sh.code,
  sh.status,
  sh.destinationName,
  sh.riskScore,
  sh.progressPercent,
  COUNT(DISTINCT e.id) AS totalExcursions,
  SUM(e.status = 'OPEN') AS openExcursions,
  SUM(e.severity = 'CRITICAL') AS criticalExcursions
FROM shipments sh
LEFT JOIN temperature_excursions e ON e.shipmentId = sh.id
GROUP BY sh.id, sh.orgId, sh.code, sh.status, sh.destinationName, sh.riskScore, sh.progressPercent;

-- @statement
DROP VIEW IF EXISTS v_warehouse_performance;

-- @statement
CREATE VIEW v_warehouse_performance AS
SELECT
  w.id AS warehouseId,
  w.orgId,
  w.name AS warehouseName,
  COUNT(DISTINCT su.id) AS storageUnits,
  COUNT(DISTINCT b.id) AS batchesStored,
  COUNT(DISTINCT e.id) AS excursions30d
FROM warehouses w
LEFT JOIN storage_units su ON su.warehouseId = w.id
LEFT JOIN batches b ON b.storageUnitId = su.id
LEFT JOIN temperature_excursions e ON e.storageUnitId = su.id
  AND e.startedAt >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY w.id, w.orgId, w.name;

-- @statement
DROP VIEW IF EXISTS v_device_health;

-- @statement
CREATE VIEW v_device_health AS
SELECT
  s.id AS sensorId,
  s.orgId,
  s.deviceId,
  s.name,
  s.status,
  s.lastSeenAt,
  s.calibrationDueAt,
  MAX(r.recordedAt) AS lastReadingAt,
  COUNT(r.id) AS readings7d,
  TIMESTAMPDIFF(MINUTE, MAX(r.recordedAt), UTC_TIMESTAMP()) AS minutesSinceReading
FROM sensors s
LEFT JOIN sensor_readings r ON r.sensorId = s.id
  AND r.recordedAt >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY s.id, s.orgId, s.deviceId, s.name, s.status, s.lastSeenAt, s.calibrationDueAt;

-- @statement
DROP VIEW IF EXISTS v_active_incidents;

-- @statement
CREATE VIEW v_active_incidents AS
SELECT
  i.id,
  i.orgId,
  i.code,
  i.title,
  i.severity,
  i.status,
  i.riskScore,
  i.openedAt,
  u.fullName AS assigneeName,
  e.sensorId,
  e.startedAt AS excursionStartedAt,
  e.minTemp,
  e.maxTemp
FROM incidents i
LEFT JOIN users u ON u.id = i.assigneeId
LEFT JOIN temperature_excursions e ON e.id = i.excursionId
WHERE i.status IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING');
