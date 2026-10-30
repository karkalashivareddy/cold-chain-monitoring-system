-- ===========================================================================
-- FROSTGUARD — stored procedures
-- ===========================================================================

-- @statement
DROP PROCEDURE IF EXISTS sp_reserve_batch_stock;

-- @statement
CREATE PROCEDURE sp_reserve_batch_stock(IN p_batch_id VARCHAR(40), IN p_quantity INT)
BEGIN
  DECLARE v_remaining INT;
  DECLARE v_status VARCHAR(20);

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_QUANTITY';
  END IF;

  SELECT remainingQuantity, status INTO v_remaining, v_status
  FROM batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF v_remaining IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'BATCH_NOT_FOUND';
  END IF;

  IF v_remaining < p_quantity THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INSUFFICIENT_STOCK';
  END IF;

  UPDATE batches
  SET remainingQuantity = remainingQuantity - p_quantity,
      status = IF(remainingQuantity - p_quantity = 0, 'DISPATCHED', status)
  WHERE id = p_batch_id;

  SELECT remainingQuantity AS remaining FROM batches WHERE id = p_batch_id;
END;

-- @statement
DROP PROCEDURE IF EXISTS sp_incident_summary;

-- @statement
CREATE PROCEDURE sp_incident_summary(IN p_org_id VARCHAR(40))
BEGIN
  SELECT
    status,
    severity,
    COUNT(*) AS total,
    ROUND(AVG(riskScore), 1) AS averageRiskScore,
    MIN(openedAt) AS oldestOpenedAt
  FROM incidents
  WHERE orgId = p_org_id
  GROUP BY status, severity
  ORDER BY status, severity;
END;
