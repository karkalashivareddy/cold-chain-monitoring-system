-- ===========================================================================
-- FROSTGUARD — database-enforced integrity rules
-- These triggers encode narrow invariants that must never be bypassed by any
-- application code path. Business workflow logic remains in the API services.
-- ===========================================================================

-- @statement
DROP TRIGGER IF EXISTS trg_sensor_readings_immutable;

-- @statement
CREATE TRIGGER trg_sensor_readings_immutable
BEFORE UPDATE ON sensor_readings
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'sensor_readings is append-only: historical telemetry cannot be modified';
END;

-- @statement
DROP TRIGGER IF EXISTS trg_batches_stock_guard;

-- @statement
CREATE TRIGGER trg_batches_stock_guard
BEFORE UPDATE ON batches
FOR EACH ROW
BEGIN
  IF NEW.remainingQuantity < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'remainingQuantity cannot be negative';
  END IF;
  IF NEW.remainingQuantity > NEW.quantity THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'remainingQuantity cannot exceed quantity';
  END IF;
END;

-- @statement
DROP TRIGGER IF EXISTS trg_incident_resolution_guard;

-- @statement
CREATE TRIGGER trg_incident_resolution_guard
BEFORE UPDATE ON incidents
FOR EACH ROW
BEGIN
  IF NEW.status = 'RESOLVED' AND (NEW.resolutionNotes IS NULL OR CHAR_LENGTH(NEW.resolutionNotes) < 10) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A resolved incident requires resolution notes of at least 10 characters';
  END IF;
END;

-- @statement
DROP TRIGGER IF EXISTS trg_shipment_delivery_stamp;

-- @statement
CREATE TRIGGER trg_shipment_delivery_stamp
BEFORE UPDATE ON shipments
FOR EACH ROW
BEGIN
  IF NEW.status = 'DELIVERED' AND NEW.deliveredAt IS NULL THEN
    SET NEW.deliveredAt = UTC_TIMESTAMP(3);
  END IF;
  IF NEW.progressPercent < 0 OR NEW.progressPercent > 100 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'progressPercent must be between 0 and 100';
  END IF;
END;
