import crypto from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { env } from "../src/config/env";
import { hashPassword } from "../src/security/password";
import { ROLE_KEYS, ROLE_PERMISSIONS, PERMISSIONS } from "@frostguard/shared";

const prisma = new PrismaClient();

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

const ago = (ms: number) => new Date(now - ms);
const ahead = (ms: number) => new Date(now + ms);

const ROLE_LABELS: Record<string, { name: string; description: string }> = {
  owner: { name: "Owner", description: "Full control of the organization, billing and members." },
  admin: { name: "Administrator", description: "Manages operations, devices, users and settings." },
  manager: { name: "Operations Manager", description: "Plans shipments, resolves incidents and reviews analytics." },
  operator: { name: "Cold-Chain Operator", description: "Handles daily monitoring, telemetry and incident response." },
  auditor: { name: "Compliance Auditor", description: "Read-only access to evidence, reports and audit trails." },
  viewer: { name: "Viewer", description: "Read-only operational visibility." },
};

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  [PERMISSIONS.ORG_MANAGE]: "Manage organization profile, ownership and settings",
  [PERMISSIONS.USER_READ]: "View members and roles",
  [PERMISSIONS.USER_MANAGE]: "Invite, remove and re-role members",
  [PERMISSIONS.PRODUCT_READ]: "View products and temperature profiles",
  [PERMISSIONS.PRODUCT_WRITE]: "Create and update products",
  [PERMISSIONS.BATCH_READ]: "View batches and traceability",
  [PERMISSIONS.BATCH_WRITE]: "Register and update batches",
  [PERMISSIONS.WAREHOUSE_READ]: "View warehouses and storage units",
  [PERMISSIONS.WAREHOUSE_WRITE]: "Manage warehouses, units and maintenance",
  [PERMISSIONS.DEVICE_READ]: "View devices and assignments",
  [PERMISSIONS.DEVICE_MANAGE]: "Provision, rotate and revoke devices",
  [PERMISSIONS.TELEMETRY_READ]: "Read telemetry history",
  [PERMISSIONS.TELEMETRY_WRITE]: "Ingest telemetry and run simulations",
  [PERMISSIONS.SHIPMENT_READ]: "View shipments and map",
  [PERMISSIONS.SHIPMENT_WRITE]: "Create and update shipments",
  [PERMISSIONS.SHIPMENT_DISPATCH]: "Dispatch and deliver shipments",
  [PERMISSIONS.INCIDENT_READ]: "View alerts and incidents",
  [PERMISSIONS.INCIDENT_WRITE]: "Acknowledge, assign and annotate incidents",
  [PERMISSIONS.INCIDENT_RESOLVE]: "Resolve incidents with documented outcome",
  [PERMISSIONS.ANALYTICS_READ]: "Access dashboards and analytics",
  [PERMISSIONS.REPORT_READ]: "Export CSV and PDF evidence",
  [PERMISSIONS.AUDIT_READ]: "Read the immutable audit trail",
  [PERMISSIONS.SETTINGS_MANAGE]: "Manage organization-wide settings",
};

function deviceKey(deviceId: string) {
  const key = `fgd_demo_${deviceId.toLowerCase()}_2026`;
  return {
    key,
    hash: crypto.createHash("sha256").update(key).digest("hex"),
    prefix: key.slice(0, 12),
  };
}

async function seedRbac() {
  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }
  for (const key of ROLE_KEYS) {
    const label = ROLE_LABELS[key]!;
    const role = await prisma.role.upsert({
      where: { key },
      update: { name: label.name, description: label.description },
      create: { key, name: label.name, description: label.description },
    });
    const permissionKeys = ROLE_PERMISSIONS[key];
    const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }
}

type SeedUser = { email: string; fullName: string; roleKey: string };

async function seedOrganization(params: {
  name: string;
  slug: string;
  timezone: string;
  users: SeedUser[];
}) {
  const organization = await prisma.organization.create({
    data: { name: params.name, slug: params.slug, timezone: params.timezone },
  });
  const roles = await prisma.role.findMany();
  const roleByKey = new Map(roles.map((r) => [r.key, r]));

  const password = env.SEED_DEMO_PASSWORD;
  const memberships: Record<string, string> = {};
  for (const u of params.users) {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, passwordHash, isActive: true },
      create: { email: u.email, fullName: u.fullName, passwordHash },
    });
    await prisma.membership.upsert({
      where: { orgId_userId: { orgId: organization.id, userId: user.id } },
      update: { roleId: roleByKey.get(u.roleKey)!.id },
      create: { orgId: organization.id, userId: user.id, roleId: roleByKey.get(u.roleKey)!.id },
    });
    memberships[u.email] = user.id;
  }
  return { organization, memberships };
}

async function main() {
  console.log("Seeding FROSTGUARD demonstration dataset…");
  await seedRbac();

  // Remove previous demo tenants so the seed is deterministic and re-runnable.
  await prisma.organization.deleteMany({ where: { slug: { in: ["northline", "meridian"] } } });
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: "@northline.demo" } },
        { email: { endsWith: "@meridian.demo" } },
      ],
    },
  });

  /* ---------------------------------------------------------------------- */
  /*  Tenant A — Northline Biologics                                        */
  /* ---------------------------------------------------------------------- */
  const { organization: orgA, memberships: usersA } = await seedOrganization({
    name: "Northline Biologics",
    slug: "northline",
    timezone: "Asia/Kolkata",
    users: [
      { email: "owner@northline.demo", fullName: "Aarav Mehta", roleKey: "owner" },
      { email: "manager@northline.demo", fullName: "Priya Nair", roleKey: "manager" },
      { email: "operator@northline.demo", fullName: "Rohan Verma", roleKey: "operator" },
      { email: "auditor@northline.demo", fullName: "Sana Iqbal", roleKey: "auditor" },
      { email: "viewer@northline.demo", fullName: "Dev Kapoor", roleKey: "viewer" },
    ],
  });

  const biologics = await prisma.temperatureProfile.create({
    data: {
      orgId: orgA.id,
      name: "Biologics 2–8 °C",
      minTemp: new Prisma.Decimal(2),
      maxTemp: new Prisma.Decimal(8),
      warningMargin: new Prisma.Decimal(1),
      criticalMinTemp: new Prisma.Decimal(-2),
      criticalMaxTemp: new Prisma.Decimal(12),
      persistenceReadings: 2,
      isDefault: true,
    },
  });
  const frozen = await prisma.temperatureProfile.create({
    data: {
      orgId: orgA.id,
      name: "Frozen −30 to −20 °C",
      minTemp: new Prisma.Decimal(-30),
      maxTemp: new Prisma.Decimal(-20),
      warningMargin: new Prisma.Decimal(1),
      criticalMinTemp: new Prisma.Decimal(-40),
      criticalMaxTemp: new Prisma.Decimal(-10),
      persistenceReadings: 2,
    },
  });
  const ultraLow = await prisma.temperatureProfile.create({
    data: {
      orgId: orgA.id,
      name: "Ultra-low −80 to −60 °C",
      minTemp: new Prisma.Decimal(-80),
      maxTemp: new Prisma.Decimal(-60),
      warningMargin: new Prisma.Decimal(2),
      criticalMinTemp: new Prisma.Decimal(-90),
      criticalMaxTemp: new Prisma.Decimal(-50),
      persistenceReadings: 2,
    },
  });

  const supplierHelix = await prisma.supplier.create({
    data: { orgId: orgA.id, code: "SUP-HELIX", name: "Helix BioSciences", contactEmail: "quality@helix.example", country: "Germany" },
  });
  const supplierNordic = await prisma.supplier.create({
    data: { orgId: orgA.id, code: "SUP-NORDIC", name: "Nordic Plasma Alliance", contactEmail: "coldchain@nordic.example", country: "Sweden" },
  });
  const supplierCryo = await prisma.supplier.create({
    data: { orgId: orgA.id, code: "SUP-CRYO", name: "CryoCell Laboratories", contactEmail: "logistics@cryocell.example", country: "India" },
  });

  const productMrna = await prisma.product.create({
    data: {
      orgId: orgA.id,
      code: "BNT-162",
      name: "mRNA Vaccine BNT-162",
      category: "Vaccine",
      description: "Lipid nanoparticle mRNA vaccine requiring a strict 2–8 °C chain.",
      manufacturer: "Helix BioSciences",
      storageType: "FRIDGE",
      minTemp: new Prisma.Decimal(2),
      maxTemp: new Prisma.Decimal(8),
      temperatureProfileId: biologics.id,
    },
  });
  const productInsulin = await prisma.product.create({
    data: {
      orgId: orgA.id,
      code: "INS-100",
      name: "Insulin Glargine 100 IU/mL",
      category: "Biologic",
      description: "Recombinant insulin pen cartridges.",
      manufacturer: "Northline Pharma",
      storageType: "FRIDGE",
      minTemp: new Prisma.Decimal(2),
      maxTemp: new Prisma.Decimal(8),
      temperatureProfileId: biologics.id,
    },
  });
  const productPlasma = await prisma.product.create({
    data: {
      orgId: orgA.id,
      code: "PLS-FFP",
      name: "Fresh Frozen Plasma",
      category: "Blood Product",
      description: "Leukodepleted fresh frozen plasma units.",
      manufacturer: "Nordic Plasma Alliance",
      storageType: "FREEZER",
      minTemp: new Prisma.Decimal(-30),
      maxTemp: new Prisma.Decimal(-20),
      temperatureProfileId: frozen.id,
    },
  });
  const productCarT = await prisma.product.create({
    data: {
      orgId: orgA.id,
      code: "CAR-T",
      name: "CAR-T Cell Therapy",
      category: "Advanced Therapy",
      description: "Autologous CAR-T infusion product, vapour-phase nitrogen storage.",
      manufacturer: "CryoCell Laboratories",
      storageType: "ULTRA_LOW",
      minTemp: new Prisma.Decimal(-80),
      maxTemp: new Prisma.Decimal(-60),
      temperatureProfileId: ultraLow.id,
    },
  });

  const [whHyd, whBlr, whMaa] = await Promise.all([
    prisma.warehouse.create({
      data: {
        orgId: orgA.id,
        code: "WH-HYD",
        name: "Hyderabad Central Biobank",
        addressLine: "Plot 42, Genome Valley, Shamirpet",
        city: "Hyderabad",
        country: "India",
        latitude: new Prisma.Decimal("17.385044"),
        longitude: new Prisma.Decimal("78.486671"),
      },
    }),
    prisma.warehouse.create({
      data: {
        orgId: orgA.id,
        code: "WH-BLR",
        name: "Bengaluru Distribution Hub",
        addressLine: "18 Peenya Industrial Area",
        city: "Bengaluru",
        country: "India",
        latitude: new Prisma.Decimal("12.971599"),
        longitude: new Prisma.Decimal("77.594566"),
      },
    }),
    prisma.warehouse.create({
      data: {
        orgId: orgA.id,
        code: "WH-MAA",
        name: "Chennai Port Cold Terminal",
        addressLine: "Berth 12, Chennai Port Trust",
        city: "Chennai",
        country: "India",
        latitude: new Prisma.Decimal("13.082680"),
        longitude: new Prisma.Decimal("80.270718"),
      },
    }),
  ]);

  const [unitHydCold, unitHydFreezer, unitHydUltra, unitBlrCold, unitBlrFreezer, unitMaaCold] =
    await Promise.all([
      prisma.storageUnit.create({
        data: {
          orgId: orgA.id, warehouseId: whHyd.id, code: "SU-HYD-C1", name: "Cold Room A",
          type: "COLD_ROOM", capacityUnits: 4800,
          minTemp: new Prisma.Decimal(2), maxTemp: new Prisma.Decimal(8), status: "OPERATIONAL",
        },
      }),
      prisma.storageUnit.create({
        data: {
          orgId: orgA.id, warehouseId: whHyd.id, code: "SU-HYD-F1", name: "Freezer Bay 1",
          type: "FREEZER", capacityUnits: 1200,
          minTemp: new Prisma.Decimal(-30), maxTemp: new Prisma.Decimal(-20), status: "OPERATIONAL",
        },
      }),
      prisma.storageUnit.create({
        data: {
          orgId: orgA.id, warehouseId: whHyd.id, code: "SU-HYD-U1", name: "ULT Cryo Vault",
          type: "ULTRA_LOW", capacityUnits: 600,
          minTemp: new Prisma.Decimal(-80), maxTemp: new Prisma.Decimal(-60), status: "OPERATIONAL",
        },
      }),
      prisma.storageUnit.create({
        data: {
          orgId: orgA.id, warehouseId: whBlr.id, code: "SU-BLR-C1", name: "Cold Room B",
          type: "COLD_ROOM", capacityUnits: 3600,
          minTemp: new Prisma.Decimal(2), maxTemp: new Prisma.Decimal(8), status: "OPERATIONAL",
        },
      }),
      prisma.storageUnit.create({
        data: {
          orgId: orgA.id, warehouseId: whBlr.id, code: "SU-BLR-F1", name: "Freezer Bay 2",
          type: "FREEZER", capacityUnits: 900,
          minTemp: new Prisma.Decimal(-30), maxTemp: new Prisma.Decimal(-20), status: "OPERATIONAL",
        },
      }),
      prisma.storageUnit.create({
        data: {
          orgId: orgA.id, warehouseId: whMaa.id, code: "SU-MAA-C1", name: "Transit Cold Room",
          type: "COLD_ROOM", capacityUnits: 2400,
          minTemp: new Prisma.Decimal(2), maxTemp: new Prisma.Decimal(8), status: "MAINTENANCE",
        },
      }),
    ]);

  const sensorSpecs = [
    { deviceId: "FGS-HYD-C1A", name: "Cold Room A · Sensor 1", unit: unitHydCold.id, status: "ONLINE", base: 4.6, spread: 0.4 },
    { deviceId: "FGS-HYD-F1A", name: "Freezer Bay 1 · Sensor 1", unit: unitHydFreezer.id, status: "ONLINE", base: -24.3, spread: 0.6 },
    { deviceId: "FGS-HYD-U1A", name: "ULT Cryo Vault · Sensor 1", unit: unitHydUltra.id, status: "ONLINE", base: -71.5, spread: 0.9 },
    { deviceId: "FGS-BLR-C1A", name: "Cold Room B · Sensor 1", unit: unitBlrCold.id, status: "ONLINE", base: 5.1, spread: 0.5 },
    { deviceId: "FGS-BLR-F1A", name: "Freezer Bay 2 · Sensor 1", unit: unitBlrFreezer.id, status: "ONLINE", base: -23.1, spread: 0.7 },
    { deviceId: "FGS-MAA-C1A", name: "Transit Cold Room · Sensor 1", unit: unitMaaCold.id, status: "OFFLINE", base: 6.2, spread: 0.3 },
  ] as const;

  const sensors: Array<{ id: string; deviceId: string; name: string; base: number; spread: number; unitId: string }> = [];
  for (const spec of sensorSpecs) {
    const credential = deviceKey(spec.deviceId);
    const sensor = await prisma.sensor.create({
      data: {
        orgId: orgA.id,
        deviceId: spec.deviceId,
        name: spec.name,
        model: "FrostGuard Sentinel T2",
        firmwareVersion: "2.8.1",
        sensorType: "TEMPERATURE_HUMIDITY",
        apiKeyHash: credential.hash,
        apiKeyPrefix: credential.prefix,
        status: spec.status,
        lastSeenAt: spec.status === "OFFLINE" ? ago(31 * HOUR) : ago(2 * 60_000),
        calibrationDueAt: ahead(120 * DAY),
      },
    });
    await prisma.sensorAssignment.create({
      data: { sensorId: sensor.id, storageUnitId: spec.unit },
    });
    sensors.push({ id: sensor.id, deviceId: spec.deviceId, name: spec.name, base: spec.base, spread: spec.spread, unitId: spec.unit });
  }

  const vanSensorSpecs = [
    { deviceId: "FGS-VAN-01", name: "Reefer Van TN-09 · Sensor", base: 4.9, spread: 0.5 },
    { deviceId: "FGS-VAN-02", name: "Reefer Van KA-05 · Sensor", base: 5.4, spread: 0.6 },
  ] as const;
  const vanSensors: Array<{ id: string; deviceId: string; base: number; spread: number }> = [];
  for (const spec of vanSensorSpecs) {
    const credential = deviceKey(spec.deviceId);
    const sensor = await prisma.sensor.create({
      data: {
        orgId: orgA.id,
        deviceId: spec.deviceId,
        name: spec.name,
        model: "FrostGuard Transit T3",
        firmwareVersion: "3.1.0",
        sensorType: "TEMPERATURE_HUMIDITY",
        apiKeyHash: credential.hash,
        apiKeyPrefix: credential.prefix,
        status: "ONLINE",
        lastSeenAt: ago(3 * 60_000),
        calibrationDueAt: ahead(90 * DAY),
      },
    });
    vanSensors.push({ id: sensor.id, deviceId: spec.deviceId, base: spec.base, spread: spec.spread });
  }

  const [vehicle1, vehicle2] = await Promise.all([
    prisma.vehicle.create({
      data: { orgId: orgA.id, plateNumber: "TS-09-UV-4421", model: "Tata Ultra 1918 Reefer", type: "REFRIGERATED_TRUCK", capacityKg: 7500 },
    }),
    prisma.vehicle.create({
      data: { orgId: orgA.id, plateNumber: "KA-05-MH-8812", model: "Ashok Leyland Boss Reefer", type: "REFRIGERATED_TRUCK", capacityKg: 6200 },
    }),
  ]);
  const [driver1, driver2] = await Promise.all([
    prisma.driver.create({
      data: { orgId: orgA.id, fullName: "Imran Shaikh", licenseNumber: "TS-2021-884512", phone: "+91 98490 11223" },
    }),
    prisma.driver.create({
      data: { orgId: orgA.id, fullName: "Lakshmi Rao", licenseNumber: "KA-2019-773410", phone: "+91 99001 44556" },
    }),
  ]);

  const batchMrnaA = await prisma.batch.create({
    data: {
      orgId: orgA.id, productId: productMrna.id, supplierId: supplierHelix.id, batchNumber: "BNT-2026-041",
      manufacturedAt: ago(52 * DAY), expiresAt: ahead(130 * DAY), quantity: 1200, remainingQuantity: 980,
      status: "AVAILABLE", storageUnitId: unitHydCold.id, temperatureProfileId: biologics.id,
    },
  });
  const batchMrnaB = await prisma.batch.create({
    data: {
      orgId: orgA.id, productId: productMrna.id, supplierId: supplierHelix.id, batchNumber: "BNT-2026-042",
      manufacturedAt: ago(24 * DAY), expiresAt: ahead(160 * DAY), quantity: 800, remainingQuantity: 800,
      status: "AVAILABLE", storageUnitId: unitHydCold.id, temperatureProfileId: biologics.id,
    },
  });
  const batchInsulin = await prisma.batch.create({
    data: {
      orgId: orgA.id, productId: productInsulin.id, supplierId: supplierHelix.id, batchNumber: "INS-2026-118",
      manufacturedAt: ago(70 * DAY), expiresAt: ahead(210 * DAY), quantity: 2400, remainingQuantity: 2100,
      status: "AVAILABLE", storageUnitId: unitBlrCold.id, temperatureProfileId: biologics.id,
    },
  });
  const batchInsulinExpiring = await prisma.batch.create({
    data: {
      orgId: orgA.id, productId: productInsulin.id, supplierId: supplierHelix.id, batchNumber: "INS-2026-077",
      manufacturedAt: ago(300 * DAY), expiresAt: ahead(9 * DAY), quantity: 400, remainingQuantity: 260,
      status: "AVAILABLE", storageUnitId: unitBlrCold.id, temperatureProfileId: biologics.id,
    },
  });
  const batchPlasma = await prisma.batch.create({
    data: {
      orgId: orgA.id, productId: productPlasma.id, supplierId: supplierNordic.id, batchNumber: "PLS-2026-007",
      manufacturedAt: ago(38 * DAY), expiresAt: ahead(320 * DAY), quantity: 300, remainingQuantity: 240,
      status: "AVAILABLE", storageUnitId: unitHydFreezer.id, temperatureProfileId: frozen.id,
    },
  });
  const batchCarT = await prisma.batch.create({
    data: {
      orgId: orgA.id, productId: productCarT.id, supplierId: supplierCryo.id, batchNumber: "CAR-T-2026-003",
      manufacturedAt: ago(12 * DAY), expiresAt: ahead(48 * DAY), quantity: 120, remainingQuantity: 120,
      status: "QUARANTINE", storageUnitId: unitHydUltra.id, temperatureProfileId: ultraLow.id,
    },
  });
  await prisma.batch.create({
    data: {
      orgId: orgA.id, productId: productInsulin.id, supplierId: supplierHelix.id, batchNumber: "INS-2026-131",
      manufacturedAt: ago(5 * DAY), expiresAt: ahead(240 * DAY), quantity: 600, remainingQuantity: 600,
      status: "QUARANTINE", storageUnitId: unitHydCold.id, temperatureProfileId: biologics.id,
    },
  });

  /* ---------------------------------------------------------------------- */
  /*  Shipments                                                             */
  /* ---------------------------------------------------------------------- */
  const shipmentInTransit = await prisma.shipment.create({
    data: {
      orgId: orgA.id, code: "SHP-2026-0002", originWarehouseId: whBlr.id,
      destinationName: "St. Mary's Medical Center", destinationCity: "Mumbai",
      destinationLat: new Prisma.Decimal("19.076090"), destinationLng: new Prisma.Decimal("72.877701"),
      originLat: new Prisma.Decimal("12.971599"), originLng: new Prisma.Decimal("77.594566"),
      currentLat: new Prisma.Decimal("16.852400"), currentLng: new Prisma.Decimal("74.581480"),
      vehicleId: vehicle1.id, driverId: driver1.id, status: "IN_TRANSIT",
      plannedDepartureAt: ago(9 * HOUR), dispatchedAt: ago(8.5 * HOUR),
      estimatedArrivalAt: ahead(5 * HOUR), progressPercent: 42, riskScore: 68,
      notes: "Priority oncology shipment. Maintain 2–8 °C throughout.",
      items: { create: [{ batchId: batchInsulin.id, quantity: 300 }] },
      events: {
        create: [
          { type: "DEPARTED", message: "Departed Bengaluru Distribution Hub", lat: new Prisma.Decimal("12.971599"), lng: new Prisma.Decimal("77.594566"), occurredAt: ago(8.5 * HOUR), createdById: usersA["manager@northline.demo"] },
          { type: "CHECKPOINT", message: "Crossed Chitradurga checkpoint. Reefer at 5.1 °C.", lat: new Prisma.Decimal("14.225100"), lng: new Prisma.Decimal("76.398100"), occurredAt: ago(6 * HOUR), createdById: usersA["operator@northline.demo"] },
          { type: "TEMPERATURE_CHECK", message: "Temperature rising above the 2–8 °C envelope. Excursion raised.", lat: new Prisma.Decimal("16.852400"), lng: new Prisma.Decimal("74.581480"), occurredAt: ago(1.2 * HOUR), createdById: usersA["operator@northline.demo"] },
          { type: "DELAY", message: "Traffic delay near Kolhapur; revised ETA communicated.", lat: new Prisma.Decimal("16.700000"), lng: new Prisma.Decimal("74.243300"), occurredAt: ago(50 * 60_000), createdById: usersA["manager@northline.demo"] },
        ],
      },
    },
  });
  await prisma.shipment.create({
    data: {
      orgId: orgA.id, code: "SHP-2026-0001", originWarehouseId: whHyd.id,
      destinationName: "Apollo Research Hospital", destinationCity: "Chennai",
      destinationLat: new Prisma.Decimal("13.060422"), destinationLng: new Prisma.Decimal("80.249583"),
      originLat: new Prisma.Decimal("17.385044"), originLng: new Prisma.Decimal("78.486671"),
      currentLat: new Prisma.Decimal("17.385044"), currentLng: new Prisma.Decimal("78.486671"),
      status: "PLANNED", plannedDepartureAt: ahead(18 * HOUR), estimatedArrivalAt: ahead(30 * HOUR),
      items: { create: [{ batchId: batchMrnaA.id, quantity: 200 }] },
      events: { create: [{ type: "NOTE", message: "Shipment planned; awaiting cold-chain packing verification.", createdById: usersA["manager@northline.demo"] }] },
    },
  });
  await prisma.shipment.create({
    data: {
      orgId: orgA.id, code: "SHP-2026-0003", originWarehouseId: whHyd.id,
      destinationName: "Chennai Central Hospital", destinationCity: "Chennai",
      destinationLat: new Prisma.Decimal("13.082680"), destinationLng: new Prisma.Decimal("80.270718"),
      originLat: new Prisma.Decimal("17.385044"), originLng: new Prisma.Decimal("78.486671"),
      currentLat: new Prisma.Decimal("13.082680"), currentLng: new Prisma.Decimal("80.270718"),
      status: "DELIVERED", plannedDepartureAt: ago(2 * DAY), dispatchedAt: ago(47 * HOUR),
      estimatedArrivalAt: ago(23 * HOUR), deliveredAt: ago(24 * HOUR), progressPercent: 100,
      items: { create: [{ batchId: batchPlasma.id, quantity: 60 }] },
      events: {
        create: [
          { type: "DEPARTED", message: "Departed Hyderabad Central Biobank", occurredAt: ago(47 * HOUR), createdById: usersA["operator@northline.demo"] },
          { type: "DELIVERED", message: "Delivered to Chennai Central Hospital — 60 units accepted.", occurredAt: ago(24 * HOUR), createdById: usersA["operator@northline.demo"] },
        ],
      },
    },
  });
  const shipmentDelayed = await prisma.shipment.create({
    data: {
      orgId: orgA.id, code: "SHP-2026-0004", originWarehouseId: whMaa.id,
      destinationName: "Pune Children's Hospital", destinationCity: "Pune",
      destinationLat: new Prisma.Decimal("18.520430"), destinationLng: new Prisma.Decimal("73.856744"),
      originLat: new Prisma.Decimal("13.082680"), originLng: new Prisma.Decimal("80.270718"),
      currentLat: new Prisma.Decimal("17.659900"), currentLng: new Prisma.Decimal("75.906400"),
      vehicleId: vehicle2.id, driverId: driver2.id, status: "DELAYED",
      plannedDepartureAt: ago(18 * HOUR), dispatchedAt: ago(17 * HOUR),
      estimatedArrivalAt: ago(2 * HOUR), progressPercent: 78, riskScore: 76,
      items: { create: [{ batchId: batchMrnaB.id, quantity: 150 }] },
      events: {
        create: [
          { type: "DEPARTED", message: "Departed Chennai Port Cold Terminal", occurredAt: ago(17 * HOUR), createdById: usersA["operator@northline.demo"] },
          { type: "DELAY", message: "Vehicle delayed by highway closure near Solapur.", occurredAt: ago(3 * HOUR), createdById: usersA["manager@northline.demo"] },
        ],
      },
    },
  });
  await prisma.shipment.create({
    data: {
      orgId: orgA.id, code: "SHP-2026-0005", originWarehouseId: whHyd.id,
      destinationName: "Vijayawada Cancer Centre", destinationCity: "Vijayawada",
      destinationLat: new Prisma.Decimal("16.506174"), destinationLng: new Prisma.Decimal("80.648015"),
      originLat: new Prisma.Decimal("17.385044"), originLng: new Prisma.Decimal("78.486671"),
      currentLat: new Prisma.Decimal("17.000000"), currentLng: new Prisma.Decimal("79.200000"),
      status: "DISPATCHED", dispatchedAt: ago(2 * HOUR), estimatedArrivalAt: ahead(4 * HOUR),
      progressPercent: 18, items: { create: [{ batchId: batchCarT.id, quantity: 20 }] },
    },
  });
  await prisma.shipment.create({
    data: {
      orgId: orgA.id, code: "SHP-2026-0006", originWarehouseId: whBlr.id,
      destinationName: "Mysuru District Hospital", destinationCity: "Mysuru",
      destinationLat: new Prisma.Decimal("12.295810"), destinationLng: new Prisma.Decimal("76.639380"),
      originLat: new Prisma.Decimal("12.971599"), originLng: new Prisma.Decimal("77.594566"),
      currentLat: new Prisma.Decimal("12.295810"), currentLng: new Prisma.Decimal("76.639380"),
      status: "DELIVERED", dispatchedAt: ago(4 * DAY), estimatedArrivalAt: ago(3.8 * DAY),
      deliveredAt: ago(3.5 * DAY), progressPercent: 100,
      items: { create: [{ batchId: batchInsulinExpiring.id, quantity: 40 }] },
    },
  });

  await prisma.sensorAssignment.create({
    data: { sensorId: vanSensors[0]!.id, shipmentId: shipmentInTransit.id },
  });
  await prisma.sensorAssignment.create({
    data: { sensorId: vanSensors[1]!.id, shipmentId: shipmentDelayed.id },
  });

  /* ---------------------------------------------------------------------- */
  /*  Telemetry (all seeded readings are marked as simulated)               */
  /* ---------------------------------------------------------------------- */
  const readingRows: Prisma.SensorReadingCreateManyInput[] = [];
  let readingCount = 0;

  for (const sensor of sensors) {
    const points = 96;
    for (let i = 0; i < points; i++) {
      const recordedAt = new Date(now - (points - i) * 15 * 60_000);
      const drift = Math.sin(i / 7) * sensor.spread + Math.cos(i / 13) * sensor.spread * 0.4;
      const offline = sensor.deviceId === "FGS-MAA-C1A";
      if (offline && i > points - 9) continue; // last two hours silent
      readingRows.push({
        orgId: orgA.id,
        sensorId: sensor.id,
        temperature: new Prisma.Decimal((sensor.base + drift).toFixed(2)),
        humidity: new Prisma.Decimal((46 + Math.sin(i / 9) * 3).toFixed(2)),
        recordedAt,
        receivedAt: recordedAt,
        sequenceNumber: 1000 + i,
        isSimulated: true,
        source: "SEED",
        createdAt: recordedAt,
      });
      readingCount += 1;
    }
  }

  for (const [index, sensor] of vanSensors.entries()) {
    const points = 36; // last 9 hours
    for (let i = 0; i < points; i++) {
      const recordedAt = new Date(now - (points - i) * 15 * 60_000);
      const warm = index === 0 ? Math.max(0, i - 20) * 0.18 : Math.max(0, i - 18) * 0.2;
      const value = sensor.base + Math.sin(i / 5) * sensor.spread + warm;
      readingRows.push({
        orgId: orgA.id,
        sensorId: sensor.id,
        temperature: new Prisma.Decimal(value.toFixed(2)),
        humidity: new Prisma.Decimal((49 + Math.cos(i / 8) * 4).toFixed(2)),
        recordedAt,
        receivedAt: recordedAt,
        sequenceNumber: 2000 + i,
        isSimulated: true,
        source: "SEED",
        createdAt: recordedAt,
      });
      readingCount += 1;
    }
  }

  await prisma.sensorReading.createMany({ data: readingRows });
  const peakVan1 = await prisma.sensorReading.findFirst({
    where: { sensorId: vanSensors[0]!.id },
    orderBy: { temperature: "desc" },
  });
  const peakVan2 = await prisma.sensorReading.findFirst({
    where: { sensorId: vanSensors[1]!.id },
    orderBy: { temperature: "desc" },
  });

  /* ---------------------------------------------------------------------- */
  /*  Excursions, alerts and incidents                                      */
  /* ---------------------------------------------------------------------- */
  const excursion1 = await prisma.excursion.create({
    data: {
      orgId: orgA.id, sensorId: vanSensors[0]!.id, shipmentId: shipmentInTransit.id,
      type: "WARNING", severity: "WARNING", status: "OPEN",
      startedAt: ago(100 * 60_000), minTemp: new Prisma.Decimal("8.12"), maxTemp: new Prisma.Decimal("9.46"),
      durationSeconds: 6000, readingsCount: 7, peakReadingId: peakVan1?.id ?? null,
      dedupeKey: "seed:van-01:warning:2026-10-30T10:00",
    },
  });
  const excursion2 = await prisma.excursion.create({
    data: {
      orgId: orgA.id, sensorId: vanSensors[1]!.id, shipmentId: shipmentDelayed.id,
      type: "CRITICAL", severity: "CRITICAL", status: "OPEN",
      startedAt: ago(140 * 60_000), minTemp: new Prisma.Decimal("2.30"), maxTemp: new Prisma.Decimal("13.20"),
      durationSeconds: 8400, readingsCount: 11, peakReadingId: peakVan2?.id ?? null,
      dedupeKey: "seed:van-02:critical:2026-10-30T09:00",
    },
  });
  const excursion3 = await prisma.excursion.create({
    data: {
      orgId: orgA.id, sensorId: sensors[0]!.id, storageUnitId: unitHydCold.id,
      type: "CRITICAL", severity: "CRITICAL", status: "CLOSED",
      startedAt: ago(3 * DAY), endedAt: ago(3 * DAY - 2 * HOUR),
      minTemp: new Prisma.Decimal("1.10"), maxTemp: new Prisma.Decimal("13.80"),
      durationSeconds: 7200, readingsCount: 8,
      dedupeKey: "seed:hyd-c1:critical:2026-10-27T03:00",
    },
  });
  await prisma.excursion.create({
    data: {
      orgId: orgA.id, sensorId: sensors[1]!.id, storageUnitId: unitHydFreezer.id,
      type: "WARNING", severity: "WARNING", status: "RECOVERED",
      startedAt: ago(6 * DAY), endedAt: ago(6 * DAY - 45 * 60_000),
      minTemp: new Prisma.Decimal("-20.40"), maxTemp: new Prisma.Decimal("-19.10"),
      durationSeconds: 2700, readingsCount: 4,
      dedupeKey: "seed:hyd-f1:warning:2026-10-24T11:00",
    },
  });

  await prisma.alert.create({
    data: {
      orgId: orgA.id, excursionId: excursion1.id, type: "TEMPERATURE_EXCURSION", severity: "WARNING",
      title: "Temperature excursion on Reefer Van TN-09 · Sensor",
      message: "9.46 °C recorded against a permitted range of 2.0–8.0 °C during transit to Mumbai.",
      status: "OPEN", dedupeKey: "seed:alert:van-01:open", createdAt: ago(100 * 60_000),
    },
  });
  const alert2 = await prisma.alert.create({
    data: {
      orgId: orgA.id, excursionId: excursion2.id, type: "TEMPERATURE_EXCURSION", severity: "CRITICAL",
      title: "Critical temperature excursion on Reefer Van KA-05 · Sensor",
      message: "13.20 °C recorded against a permitted range of 2.0–8.0 °C. Shipment to Pune Children's Hospital is at risk.",
      status: "OPEN", dedupeKey: "seed:alert:van-02:open", createdAt: ago(140 * 60_000),
    },
  });
  const alert3 = await prisma.alert.create({
    data: {
      orgId: orgA.id, excursionId: excursion3.id, type: "TEMPERATURE_EXCURSION", severity: "CRITICAL",
      title: "Critical temperature excursion on Cold Room A · Sensor 1",
      message: "13.80 °C recorded in Cold Room A after a compressor fault.",
      status: "RESOLVED", dedupeKey: "seed:alert:hyd-c1:resolved", createdAt: ago(3 * DAY),
      acknowledgedAt: ago(3 * DAY - 20 * 60_000), acknowledgedById: usersA["manager@northline.demo"],
      resolvedAt: ago(3 * DAY - 2 * HOUR),
    },
  });

  const openIncident = await prisma.incident.create({
    data: {
      orgId: orgA.id, code: "INC-2026-0007", alertId: alert2.id, excursionId: excursion2.id,
      title: "Critical excursion — Pune pediatric vaccine delivery",
      description: "Reefer van KA-05 exceeded the 2–8 °C envelope for more than two hours. Batch BNT-2026-042 is exposed. Immediate disposition required.",
      severity: "CRITICAL", status: "OPEN", assigneeId: usersA["manager@northline.demo"],
      createdById: usersA["operator@northline.demo"], riskScore: 86, openedAt: ago(140 * 60_000),
      actions: {
        create: [
          { actorId: usersA["operator@northline.demo"], action: "OPENED", notes: "Automatically opened from persisted critical excursion.", createdAt: ago(140 * 60_000) },
        ],
      },
    },
  });
  await prisma.incident.create({
    data: {
      orgId: orgA.id, code: "INC-2026-0003", alertId: alert3.id, excursionId: excursion3.id,
      title: "Cold Room A compressor failure — recovered",
      description: "Compressor failure pushed Cold Room A to 13.8 °C. Facility engineering replaced the compressor and the room recovered.",
      severity: "CRITICAL", status: "RESOLVED", assigneeId: usersA["manager@northline.demo"],
      createdById: usersA["owner@northline.demo"], riskScore: 91,
      openedAt: ago(3 * DAY), acknowledgedAt: ago(3 * DAY - 20 * 60_000),
      resolvedAt: ago(3 * DAY - 2 * HOUR),
      resolutionNotes: "Compressor replaced and validated over four consecutive readings. Affected batch quarantined pending quality review.",
      rootCause: "Mechanical compressor failure",
      outcome: "EQUIPMENT_REPAIRED",
      actions: {
        create: [
          { actorId: usersA["operator@northline.demo"], action: "OPENED", createdAt: ago(3 * DAY) },
          { actorId: usersA["manager@northline.demo"], action: "ACKNOWLEDGED", notes: "Facilities engineer dispatched.", createdAt: ago(3 * DAY - 20 * 60_000) },
          { actorId: usersA["manager@northline.demo"], action: "RESOLVED", notes: "Compressor replaced and validated.", createdAt: ago(3 * DAY - 2 * HOUR) },
        ],
      },
    },
  });

  await prisma.alert.create({
    data: {
      orgId: orgA.id, excursionId: excursion1.id, type: "SHIPMENT_RISK", severity: "WARNING",
      title: "Delivery risk elevated for SHP-2026-0002",
      message: "Open excursion plus a traffic delay raised the shipment risk score to 68.",
      status: "ACKNOWLEDGED", dedupeKey: "seed:alert:shipment-risk:0002",
      createdAt: ago(50 * 60_000), acknowledgedAt: ago(45 * 60_000),
      acknowledgedById: usersA["manager@northline.demo"],
    },
  });

  await prisma.notificationLog.createMany({
    data: [
      {
        orgId: orgA.id, userId: usersA["manager@northline.demo"], channel: "IN_APP",
        subject: `Incident ${openIncident.code} assigned to you`, body: openIncident.title,
        status: "SENT", sentAt: ago(139 * 60_000),
      },
      {
        orgId: orgA.id, userId: usersA["owner@northline.demo"], channel: "IN_APP",
        subject: "Critical excursion detected", body: alert2.title,
        status: "SENT", sentAt: ago(140 * 60_000),
      },
    ],
  });

  await prisma.maintenanceLog.create({
    data: {
      orgId: orgA.id, storageUnitId: unitMaaCold.id, sensorId: sensors[5]!.id,
      type: "PREVENTIVE_SERVICE", performedAt: ago(2 * DAY), performedBy: "Facility Engineering",
      notes: "Scheduled condenser cleaning; unit held out of service. Gateway offline during works.",
      status: "IN_PROGRESS",
    },
  });

  await prisma.auditLog.createMany({
    data: [
      { orgId: orgA.id, actorId: usersA["owner@northline.demo"], action: "organization.seeded", entityType: "organization", entityId: orgA.id, metadata: { source: "seed" }, createdAt: ago(30 * DAY) },
      { orgId: orgA.id, actorId: usersA["manager@northline.demo"], action: "shipment.dispatched", entityType: "shipment", entityId: shipmentInTransit.id, metadata: { code: shipmentInTransit.code }, createdAt: ago(8.5 * HOUR) },
      { orgId: orgA.id, actorId: null, action: "excursion.opened", entityType: "excursion", entityId: excursion2.id, metadata: { severity: "CRITICAL", automatic: true }, createdAt: ago(140 * 60_000) },
      { orgId: orgA.id, actorId: usersA["manager@northline.demo"], action: "incident.resolved", entityType: "incident", entityId: "INC-2026-0003", metadata: { outcome: "EQUIPMENT_REPAIRED" }, createdAt: ago(3 * DAY - 2 * HOUR) },
      { orgId: orgA.id, actorId: usersA["operator@northline.demo"], action: "telemetry.ingested", entityType: "sensor", entityId: vanSensors[0]!.id, metadata: { simulated: true, readings: 36 }, createdAt: ago(20 * 60_000) },
    ],
  });

  /* ---------------------------------------------------------------------- */
  /*  Tenant B — isolation fixture                                          */
  /* ---------------------------------------------------------------------- */
  const { organization: orgB, memberships: usersB } = await seedOrganization({
    name: "Meridian Cold Logistics",
    slug: "meridian",
    timezone: "UTC",
    users: [{ email: "owner@meridian.demo", fullName: "Maya Fernandes", roleKey: "owner" }],
  });
  const profileB = await prisma.temperatureProfile.create({
    data: {
      orgId: orgB.id, name: "Vaccine 2–8 °C", minTemp: new Prisma.Decimal(2), maxTemp: new Prisma.Decimal(8),
      criticalMinTemp: new Prisma.Decimal(-2), criticalMaxTemp: new Prisma.Decimal(12),
      persistenceReadings: 2, isDefault: true,
    },
  });
  const productB = await prisma.product.create({
    data: {
      orgId: orgB.id, code: "FLU-04", name: "Seasonal Influenza Vaccine", category: "Vaccine",
      minTemp: new Prisma.Decimal(2), maxTemp: new Prisma.Decimal(8), temperatureProfileId: profileB.id,
    },
  });
  const whB = await prisma.warehouse.create({
    data: {
      orgId: orgB.id, code: "WH-PUN", name: "Pune Vaccine Depot", city: "Pune", country: "India",
      latitude: new Prisma.Decimal("18.520430"), longitude: new Prisma.Decimal("73.856744"),
    },
  });
  const unitB = await prisma.storageUnit.create({
    data: {
      orgId: orgB.id, warehouseId: whB.id, code: "SU-PUN-C1", name: "Pune Cold Room",
      type: "COLD_ROOM", capacityUnits: 2000, minTemp: new Prisma.Decimal(2), maxTemp: new Prisma.Decimal(8),
    },
  });
  const credentialB = deviceKey("FGS-PUN-C1A");
  const sensorB = await prisma.sensor.create({
    data: {
      orgId: orgB.id, deviceId: "FGS-PUN-C1A", name: "Pune Cold Room · Sensor 1",
      apiKeyHash: credentialB.hash, apiKeyPrefix: credentialB.prefix, status: "ONLINE", lastSeenAt: ago(5 * 60_000),
    },
  });
  await prisma.sensorAssignment.create({ data: { sensorId: sensorB.id, storageUnitId: unitB.id } });
  await prisma.batch.create({
    data: {
      orgId: orgB.id, productId: productB.id, batchNumber: "FLU-2026-311",
      manufacturedAt: ago(20 * DAY), expiresAt: ahead(200 * DAY), quantity: 500, remainingQuantity: 500,
      status: "AVAILABLE", storageUnitId: unitB.id, temperatureProfileId: profileB.id,
    },
  });
  await prisma.sensorReading.createMany({
    data: Array.from({ length: 24 }, (_, i) => {
      const recordedAt = new Date(now - (24 - i) * HOUR);
      return {
        orgId: orgB.id, sensorId: sensorB.id,
        temperature: new Prisma.Decimal((5 + Math.sin(i / 3) * 0.4).toFixed(2)),
        humidity: new Prisma.Decimal("48.00"),
        recordedAt, receivedAt: recordedAt, sequenceNumber: 3000 + i,
        isSimulated: true, source: "SEED", createdAt: recordedAt,
      };
    }),
  });

  console.log("\n✔ Seed complete\n");
  console.log(`  Organizations: Northline Biologics (${orgA.id}), Meridian Cold Logistics (${orgB.id})`);
  console.log(`  Users (password: ${env.SEED_DEMO_PASSWORD}):`);
  for (const u of [
    "owner@northline.demo",
    "manager@northline.demo",
    "operator@northline.demo",
    "auditor@northline.demo",
    "viewer@northline.demo",
    "owner@meridian.demo",
  ]) {
    console.log(`    - ${u}`);
  }
  console.log(`  Readings seeded: ${readingCount + 24} (all marked isSimulated=true, source=SEED)`);
  console.log("  Demo device keys (development only):");
  for (const spec of [...sensorSpecs, ...vanSensorSpecs]) {
    console.log(`    - ${spec.deviceId}: ${deviceKey(spec.deviceId).key}`);
  }
  console.log(`    - FGS-PUN-C1A: ${credentialB.key}`);
  void usersB;
}

main()
  .catch((err) => {
    console.error("Seed failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
