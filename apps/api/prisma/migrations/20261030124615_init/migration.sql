-- CreateTable
CREATE TABLE `organizations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `organizations_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(200) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `fullName` VARCHAR(160) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(40) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `roles_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `permissions_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `roleId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,

    INDEX `role_permissions_permissionId_idx`(`permissionId`),
    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `memberships` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `memberships_userId_idx`(`userId`),
    INDEX `memberships_roleId_idx`(`roleId`),
    UNIQUE INDEX `memberships_orgId_userId_key`(`orgId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `familyId` VARCHAR(40) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `replacedById` VARCHAR(40) NULL,
    `userAgent` VARCHAR(255) NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_tokenHash_key`(`tokenHash`),
    INDEX `refresh_tokens_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `refresh_tokens_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_temperature_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `minTemp` DECIMAL(5, 2) NOT NULL,
    `maxTemp` DECIMAL(5, 2) NOT NULL,
    `warningMargin` DECIMAL(4, 2) NOT NULL DEFAULT 0.50,
    `criticalMinTemp` DECIMAL(5, 2) NULL,
    `criticalMaxTemp` DECIMAL(5, 2) NULL,
    `persistenceReadings` INTEGER NOT NULL DEFAULT 2,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `product_temperature_profiles_orgId_name_key`(`orgId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `description` TEXT NULL,
    `manufacturer` VARCHAR(160) NULL,
    `storageType` VARCHAR(20) NOT NULL DEFAULT 'FRIDGE',
    `minTemp` DECIMAL(5, 2) NOT NULL,
    `maxTemp` DECIMAL(5, 2) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `temperatureProfileId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `products_orgId_name_idx`(`orgId`, `name`),
    UNIQUE INDEX `products_orgId_code_key`(`orgId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `contactEmail` VARCHAR(200) NULL,
    `country` VARCHAR(120) NULL,

    UNIQUE INDEX `suppliers_orgId_code_key`(`orgId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batches` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NULL,
    `batchNumber` VARCHAR(60) NOT NULL,
    `manufacturedAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `remainingQuantity` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'QUARANTINE',
    `storageUnitId` VARCHAR(191) NULL,
    `temperatureProfileId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `batches_orgId_status_idx`(`orgId`, `status`),
    INDEX `batches_expiresAt_idx`(`expiresAt`),
    INDEX `batches_storageUnitId_idx`(`storageUnitId`),
    UNIQUE INDEX `batches_orgId_productId_batchNumber_key`(`orgId`, `productId`, `batchNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warehouses` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `addressLine` VARCHAR(240) NULL,
    `city` VARCHAR(120) NULL,
    `country` VARCHAR(120) NULL,
    `latitude` DECIMAL(9, 6) NULL,
    `longitude` DECIMAL(9, 6) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `warehouses_orgId_code_key`(`orgId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `storage_units` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `capacityUnits` INTEGER NOT NULL,
    `minTemp` DECIMAL(5, 2) NOT NULL,
    `maxTemp` DECIMAL(5, 2) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPERATIONAL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `storage_units_warehouseId_idx`(`warehouseId`),
    UNIQUE INDEX `storage_units_orgId_code_key`(`orgId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sensors` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(60) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `model` VARCHAR(120) NULL,
    `firmwareVersion` VARCHAR(40) NULL,
    `sensorType` VARCHAR(40) NOT NULL DEFAULT 'TEMPERATURE_HUMIDITY',
    `apiKeyHash` VARCHAR(255) NOT NULL,
    `apiKeyPrefix` VARCHAR(16) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
    `lastSeenAt` DATETIME(3) NULL,
    `calibrationDueAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sensors_deviceId_key`(`deviceId`),
    INDEX `sensors_orgId_status_idx`(`orgId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sensor_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `sensorId` VARCHAR(191) NOT NULL,
    `storageUnitId` VARCHAR(191) NULL,
    `shipmentId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,

    INDEX `sensor_assignments_sensorId_endedAt_idx`(`sensorId`, `endedAt`),
    INDEX `sensor_assignments_storageUnitId_idx`(`storageUnitId`),
    INDEX `sensor_assignments_shipmentId_idx`(`shipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sensor_readings` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `orgId` VARCHAR(191) NOT NULL,
    `sensorId` VARCHAR(191) NOT NULL,
    `temperature` DECIMAL(5, 2) NOT NULL,
    `humidity` DECIMAL(5, 2) NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sequenceNumber` INTEGER NOT NULL,
    `isSimulated` BOOLEAN NOT NULL DEFAULT false,
    `source` VARCHAR(20) NOT NULL DEFAULT 'DEVICE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sensor_readings_orgId_recordedAt_idx`(`orgId`, `recordedAt`),
    INDEX `sensor_readings_sensorId_recordedAt_idx`(`sensorId`, `recordedAt`),
    UNIQUE INDEX `sensor_readings_sensorId_sequenceNumber_key`(`sensorId`, `sequenceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_simulations` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `sensorId` VARCHAR(191) NOT NULL,
    `scenario` VARCHAR(30) NOT NULL,
    `intervalMs` INTEGER NOT NULL DEFAULT 3000,
    `status` VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `stoppedAt` DATETIME(3) NULL,
    `lastTickAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,

    INDEX `device_simulations_orgId_status_idx`(`orgId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicles` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `plateNumber` VARCHAR(30) NOT NULL,
    `model` VARCHAR(120) NULL,
    `type` VARCHAR(40) NOT NULL DEFAULT 'REFRIGERATED_TRUCK',
    `capacityKg` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `vehicles_orgId_plateNumber_key`(`orgId`, `plateNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drivers` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(160) NOT NULL,
    `licenseNumber` VARCHAR(60) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `drivers_orgId_licenseNumber_key`(`orgId`, `licenseNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipments` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `originWarehouseId` VARCHAR(191) NOT NULL,
    `destinationName` VARCHAR(160) NOT NULL,
    `destinationCity` VARCHAR(120) NULL,
    `destinationLat` DECIMAL(9, 6) NOT NULL,
    `destinationLng` DECIMAL(9, 6) NOT NULL,
    `originLat` DECIMAL(9, 6) NOT NULL,
    `originLng` DECIMAL(9, 6) NOT NULL,
    `vehicleId` VARCHAR(191) NULL,
    `driverId` VARCHAR(191) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    `plannedDepartureAt` DATETIME(3) NULL,
    `dispatchedAt` DATETIME(3) NULL,
    `estimatedArrivalAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `currentLat` DECIMAL(9, 6) NULL,
    `currentLng` DECIMAL(9, 6) NULL,
    `progressPercent` INTEGER NOT NULL DEFAULT 0,
    `riskScore` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shipments_code_key`(`code`),
    INDEX `shipments_orgId_status_idx`(`orgId`, `status`),
    INDEX `shipments_orgId_createdAt_idx`(`orgId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipment_items` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `shipment_items_batchId_idx`(`batchId`),
    UNIQUE INDEX `shipment_items_shipmentId_batchId_key`(`shipmentId`, `batchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipment_events` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `lat` DECIMAL(9, 6) NULL,
    `lng` DECIMAL(9, 6) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shipment_events_shipmentId_occurredAt_idx`(`shipmentId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `temperature_excursions` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `sensorId` VARCHAR(191) NOT NULL,
    `storageUnitId` VARCHAR(191) NULL,
    `shipmentId` VARCHAR(191) NULL,
    `batchId` VARCHAR(191) NULL,
    `type` VARCHAR(30) NOT NULL,
    `severity` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `minTemp` DECIMAL(5, 2) NOT NULL,
    `maxTemp` DECIMAL(5, 2) NOT NULL,
    `durationSeconds` INTEGER NOT NULL DEFAULT 0,
    `readingsCount` INTEGER NOT NULL DEFAULT 1,
    `peakReadingId` BIGINT NULL,
    `dedupeKey` VARCHAR(160) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `temperature_excursions_dedupeKey_key`(`dedupeKey`),
    INDEX `temperature_excursions_orgId_status_idx`(`orgId`, `status`),
    INDEX `temperature_excursions_orgId_startedAt_idx`(`orgId`, `startedAt`),
    INDEX `temperature_excursions_shipmentId_idx`(`shipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alerts` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `excursionId` VARCHAR(191) NULL,
    `type` VARCHAR(40) NOT NULL,
    `severity` VARCHAR(20) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `message` VARCHAR(600) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `dedupeKey` VARCHAR(160) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acknowledgedAt` DATETIME(3) NULL,
    `acknowledgedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,

    UNIQUE INDEX `alerts_dedupeKey_key`(`dedupeKey`),
    INDEX `alerts_orgId_status_createdAt_idx`(`orgId`, `status`, `createdAt`),
    INDEX `alerts_orgId_severity_idx`(`orgId`, `severity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `incidents` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `alertId` VARCHAR(191) NULL,
    `excursionId` VARCHAR(191) NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NOT NULL,
    `severity` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `assigneeId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `riskScore` INTEGER NOT NULL DEFAULT 0,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acknowledgedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolutionNotes` TEXT NULL,
    `rootCause` TEXT NULL,
    `outcome` VARCHAR(40) NULL,

    UNIQUE INDEX `incidents_code_key`(`code`),
    UNIQUE INDEX `incidents_alertId_key`(`alertId`),
    UNIQUE INDEX `incidents_excursionId_key`(`excursionId`),
    INDEX `incidents_orgId_status_openedAt_idx`(`orgId`, `status`, `openedAt`),
    INDEX `incidents_assigneeId_idx`(`assigneeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `incident_actions` (
    `id` VARCHAR(191) NOT NULL,
    `incidentId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(60) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `incident_actions_incidentId_createdAt_idx`(`incidentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance_logs` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `storageUnitId` VARCHAR(191) NOT NULL,
    `sensorId` VARCHAR(191) NULL,
    `type` VARCHAR(60) NOT NULL,
    `performedAt` DATETIME(3) NOT NULL,
    `performedBy` VARCHAR(160) NOT NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',

    INDEX `maintenance_logs_orgId_performedAt_idx`(`orgId`, `performedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `orgId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(80) NOT NULL,
    `entityType` VARCHAR(60) NOT NULL,
    `entityId` VARCHAR(60) NULL,
    `metadata` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `requestId` VARCHAR(60) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_orgId_createdAt_idx`(`orgId`, `createdAt`),
    INDEX `audit_logs_orgId_entityType_entityId_idx`(`orgId`, `entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_logs` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `channel` VARCHAR(20) NOT NULL DEFAULT 'IN_APP',
    `subject` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_logs_orgId_createdAt_idx`(`orgId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox_events` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NULL,
    `topic` VARCHAR(80) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `outbox_events_status_availableAt_idx`(`status`, `availableAt`),
    INDEX `outbox_events_orgId_createdAt_idx`(`orgId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotency_records` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NULL,
    `scope` VARCHAR(60) NOT NULL,
    `key` VARCHAR(160) NOT NULL,
    `requestHash` VARCHAR(64) NOT NULL,
    `responseCode` INTEGER NULL,
    `responseBody` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `idempotency_records_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `idempotency_records_scope_key_key`(`scope`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_temperature_profiles` ADD CONSTRAINT `product_temperature_profiles_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_temperatureProfileId_fkey` FOREIGN KEY (`temperatureProfileId`) REFERENCES `product_temperature_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batches` ADD CONSTRAINT `batches_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batches` ADD CONSTRAINT `batches_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batches` ADD CONSTRAINT `batches_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batches` ADD CONSTRAINT `batches_storageUnitId_fkey` FOREIGN KEY (`storageUnitId`) REFERENCES `storage_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batches` ADD CONSTRAINT `batches_temperatureProfileId_fkey` FOREIGN KEY (`temperatureProfileId`) REFERENCES `product_temperature_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warehouses` ADD CONSTRAINT `warehouses_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `storage_units` ADD CONSTRAINT `storage_units_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `storage_units` ADD CONSTRAINT `storage_units_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sensors` ADD CONSTRAINT `sensors_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sensor_assignments` ADD CONSTRAINT `sensor_assignments_sensorId_fkey` FOREIGN KEY (`sensorId`) REFERENCES `sensors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sensor_assignments` ADD CONSTRAINT `sensor_assignments_storageUnitId_fkey` FOREIGN KEY (`storageUnitId`) REFERENCES `storage_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sensor_assignments` ADD CONSTRAINT `sensor_assignments_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sensor_readings` ADD CONSTRAINT `sensor_readings_sensorId_fkey` FOREIGN KEY (`sensorId`) REFERENCES `sensors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_simulations` ADD CONSTRAINT `device_simulations_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_simulations` ADD CONSTRAINT `device_simulations_sensorId_fkey` FOREIGN KEY (`sensorId`) REFERENCES `sensors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_simulations` ADD CONSTRAINT `device_simulations_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drivers` ADD CONSTRAINT `drivers_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_originWarehouseId_fkey` FOREIGN KEY (`originWarehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `drivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipment_items` ADD CONSTRAINT `shipment_items_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipment_items` ADD CONSTRAINT `shipment_items_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipment_events` ADD CONSTRAINT `shipment_events_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipment_events` ADD CONSTRAINT `shipment_events_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `temperature_excursions` ADD CONSTRAINT `temperature_excursions_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `temperature_excursions` ADD CONSTRAINT `temperature_excursions_sensorId_fkey` FOREIGN KEY (`sensorId`) REFERENCES `sensors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `temperature_excursions` ADD CONSTRAINT `temperature_excursions_storageUnitId_fkey` FOREIGN KEY (`storageUnitId`) REFERENCES `storage_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `temperature_excursions` ADD CONSTRAINT `temperature_excursions_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_excursionId_fkey` FOREIGN KEY (`excursionId`) REFERENCES `temperature_excursions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_acknowledgedById_fkey` FOREIGN KEY (`acknowledgedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `alerts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_excursionId_fkey` FOREIGN KEY (`excursionId`) REFERENCES `temperature_excursions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incident_actions` ADD CONSTRAINT `incident_actions_incidentId_fkey` FOREIGN KEY (`incidentId`) REFERENCES `incidents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incident_actions` ADD CONSTRAINT `incident_actions_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_logs` ADD CONSTRAINT `maintenance_logs_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_logs` ADD CONSTRAINT `maintenance_logs_storageUnitId_fkey` FOREIGN KEY (`storageUnitId`) REFERENCES `storage_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_logs` ADD CONSTRAINT `maintenance_logs_sensorId_fkey` FOREIGN KEY (`sensorId`) REFERENCES `sensors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_logs` ADD CONSTRAINT `notification_logs_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_logs` ADD CONSTRAINT `notification_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outbox_events` ADD CONSTRAINT `outbox_events_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `idempotency_records` ADD CONSTRAINT `idempotency_records_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
