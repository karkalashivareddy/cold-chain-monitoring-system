import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*  Roles & permissions                                                       */
/* -------------------------------------------------------------------------- */

export const ROLE_KEYS = [
  "owner",
  "admin",
  "manager",
  "operator",
  "auditor",
  "viewer",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const PERMISSIONS = {
  ORG_MANAGE: "org:manage",
  USER_READ: "user:read",
  USER_MANAGE: "user:manage",
  PRODUCT_READ: "product:read",
  PRODUCT_WRITE: "product:write",
  BATCH_READ: "batch:read",
  BATCH_WRITE: "batch:write",
  WAREHOUSE_READ: "warehouse:read",
  WAREHOUSE_WRITE: "warehouse:write",
  DEVICE_READ: "device:read",
  DEVICE_MANAGE: "device:manage",
  TELEMETRY_READ: "telemetry:read",
  TELEMETRY_WRITE: "telemetry:write",
  SHIPMENT_READ: "shipment:read",
  SHIPMENT_WRITE: "shipment:write",
  SHIPMENT_DISPATCH: "shipment:dispatch",
  INCIDENT_READ: "incident:read",
  INCIDENT_WRITE: "incident:write",
  INCIDENT_RESOLVE: "incident:resolve",
  ANALYTICS_READ: "analytics:read",
  REPORT_READ: "report:read",
  AUDIT_READ: "audit:read",
  SETTINGS_MANAGE: "settings:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  owner: Object.values(PERMISSIONS),
  admin: Object.values(PERMISSIONS).filter((p) => p !== PERMISSIONS.ORG_MANAGE),
  manager: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_WRITE,
    PERMISSIONS.BATCH_READ,
    PERMISSIONS.BATCH_WRITE,
    PERMISSIONS.WAREHOUSE_READ,
    PERMISSIONS.WAREHOUSE_WRITE,
    PERMISSIONS.DEVICE_READ,
    PERMISSIONS.DEVICE_MANAGE,
    PERMISSIONS.TELEMETRY_READ,
    PERMISSIONS.SHIPMENT_READ,
    PERMISSIONS.SHIPMENT_WRITE,
    PERMISSIONS.SHIPMENT_DISPATCH,
    PERMISSIONS.INCIDENT_READ,
    PERMISSIONS.INCIDENT_WRITE,
    PERMISSIONS.INCIDENT_RESOLVE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.AUDIT_READ,
  ],
  operator: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.BATCH_READ,
    PERMISSIONS.BATCH_WRITE,
    PERMISSIONS.WAREHOUSE_READ,
    PERMISSIONS.DEVICE_READ,
    PERMISSIONS.TELEMETRY_READ,
    PERMISSIONS.TELEMETRY_WRITE,
    PERMISSIONS.SHIPMENT_READ,
    PERMISSIONS.SHIPMENT_WRITE,
    PERMISSIONS.INCIDENT_READ,
    PERMISSIONS.INCIDENT_WRITE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.REPORT_READ,
  ],
  auditor: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.BATCH_READ,
    PERMISSIONS.WAREHOUSE_READ,
    PERMISSIONS.DEVICE_READ,
    PERMISSIONS.TELEMETRY_READ,
    PERMISSIONS.SHIPMENT_READ,
    PERMISSIONS.INCIDENT_READ,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.AUDIT_READ,
  ],
  viewer: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.BATCH_READ,
    PERMISSIONS.WAREHOUSE_READ,
    PERMISSIONS.DEVICE_READ,
    PERMISSIONS.SHIPMENT_READ,
    PERMISSIONS.INCIDENT_READ,
    PERMISSIONS.ANALYTICS_READ,
  ],
};

/* -------------------------------------------------------------------------- */
/*  Enumerations (mirrors Prisma enums, kept framework-agnostic)              */
/* -------------------------------------------------------------------------- */

export const BATCH_STATUSES = [
  "QUARANTINE",
  "AVAILABLE",
  "RESERVED",
  "DISPATCHED",
  "EXPIRED",
  "RECALLED",
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const STORAGE_UNIT_TYPES = [
  "FREEZER",
  "FRIDGE",
  "COLD_ROOM",
  "ULTRA_LOW",
  "AMBIENT",
] as const;
export type StorageUnitType = (typeof STORAGE_UNIT_TYPES)[number];

export const STORAGE_UNIT_STATUSES = [
  "OPERATIONAL",
  "MAINTENANCE",
  "OFFLINE",
  "DECOMMISSIONED",
] as const;

export const SENSOR_STATUSES = ["ONLINE", "OFFLINE", "MAINTENANCE", "REVOKED"] as const;

export const SHIPMENT_STATUSES = [
  "DRAFT",
  "PLANNED",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELAYED",
  "DELIVERED",
  "CANCELLED",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const EXCURSION_TYPES = [
  "WARNING",
  "CRITICAL",
  "DEVICE_OFFLINE",
  "SENSOR_MALFUNCTION",
] as const;

export const INCIDENT_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "RESOLVED",
  "CLOSED",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const ALERT_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;

export const SIMULATION_SCENARIOS = [
  "STABLE",
  "DRIFT",
  "EXCURSION",
  "DISCONNECT",
  "RECOVERY",
  "MALFUNCTION",
] as const;
export type SimulationScenario = (typeof SIMULATION_SCENARIOS)[number];

/* -------------------------------------------------------------------------- */
/*  Primitive helpers                                                        */
/* -------------------------------------------------------------------------- */

export const utcIso = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v).toISOString());

export const idSchema = z.string().min(1).max(40);
export const decimal = (min: number, max: number) =>
  z.coerce.number().min(min).max(max).multipleOf(0.01);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(40).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().max(120).optional(),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const dateRangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

/* -------------------------------------------------------------------------- */
/*  Auth                                                                     */
/* -------------------------------------------------------------------------- */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  organizationSlug: z.string().trim().min(1).max(80).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(500).optional(),
});

/* -------------------------------------------------------------------------- */
/*  Products & batches                                                       */
/* -------------------------------------------------------------------------- */

export const productBaseSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9][A-Z0-9-]*$/i, "Use letters, digits and dashes"),
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).optional().nullable(),
  manufacturer: z.string().trim().max(160).optional().nullable(),
  storageType: z.enum(STORAGE_UNIT_TYPES).default("FRIDGE"),
  minTemp: decimal(-90, 40),
  maxTemp: decimal(-90, 40),
  isActive: z.boolean().default(true),
  temperatureProfileId: idSchema.optional().nullable(),
});

export const productSchema = productBaseSchema.refine((v) => v.minTemp < v.maxTemp, {
  message: "Minimum temperature must be below maximum temperature",
  path: ["minTemp"],
});
export type ProductInput = z.infer<typeof productSchema>;

export const productUpdateSchema = productBaseSchema.partial().refine(
  (v) => v.minTemp === undefined || v.maxTemp === undefined || v.minTemp < v.maxTemp,
  { message: "Minimum temperature must be below maximum temperature", path: ["minTemp"] }
);

export const batchBaseSchema = z.object({
  productId: idSchema,
  supplierId: idSchema.optional().nullable(),
  batchNumber: z.string().trim().min(2).max(60),
  manufacturedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  storageUnitId: idSchema.optional().nullable(),
  temperatureProfileId: idSchema.optional().nullable(),
  status: z.enum(BATCH_STATUSES).default("QUARANTINE"),
});

export const batchSchema = batchBaseSchema.refine((v) => v.manufacturedAt < v.expiresAt, {
  message: "Expiry must be after manufacturing date",
  path: ["expiresAt"],
});
export type BatchInput = z.infer<typeof batchSchema>;

export const batchUpdateSchema = batchBaseSchema.partial().refine(
  (v) => v.manufacturedAt === undefined || v.expiresAt === undefined || v.manufacturedAt < v.expiresAt,
  { message: "Expiry must be after manufacturing date", path: ["expiresAt"] }
);

/* -------------------------------------------------------------------------- */
/*  Warehouses, storage units, devices                                       */
/* -------------------------------------------------------------------------- */

export const warehouseSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  addressLine: z.string().trim().max(240).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  latitude: decimal(-90, 90).optional().nullable(),
  longitude: decimal(-180, 180).optional().nullable(),
  isActive: z.boolean().default(true),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;

export const storageUnitBaseSchema = z.object({
  warehouseId: idSchema,
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  type: z.enum(STORAGE_UNIT_TYPES),
  capacityUnits: z.coerce.number().int().min(1).max(1_000_000),
  minTemp: decimal(-90, 40),
  maxTemp: decimal(-90, 40),
  status: z.enum(STORAGE_UNIT_STATUSES).default("OPERATIONAL"),
});

export const storageUnitSchema = storageUnitBaseSchema.refine((v) => v.minTemp < v.maxTemp, {
  message: "Minimum temperature must be below maximum temperature",
  path: ["minTemp"],
});
export type StorageUnitInput = z.infer<typeof storageUnitSchema>;

export const storageUnitUpdateSchema = storageUnitBaseSchema.partial().refine(
  (v) => v.minTemp === undefined || v.maxTemp === undefined || v.minTemp < v.maxTemp,
  { message: "Minimum temperature must be below maximum temperature", path: ["minTemp"] }
);

export const deviceSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .min(4)
    .max(60)
    .regex(/^[A-Z0-9][A-Z0-9-]*$/i, "Use letters, digits and dashes"),
  name: z.string().trim().min(2).max(160),
  model: z.string().trim().max(120).optional().nullable(),
  firmwareVersion: z.string().trim().max(40).optional().nullable(),
  sensorType: z.enum(["TEMPERATURE", "TEMPERATURE_HUMIDITY"]).default("TEMPERATURE_HUMIDITY"),
  storageUnitId: idSchema.optional().nullable(),
  shipmentId: idSchema.optional().nullable(),
  calibrationDueAt: z.coerce.date().optional().nullable(),
});
export type DeviceInput = z.infer<typeof deviceSchema>;

/* -------------------------------------------------------------------------- */
/*  Shipments                                                                */
/* -------------------------------------------------------------------------- */

export const shipmentSchema = z.object({
  originWarehouseId: idSchema,
  destinationName: z.string().trim().min(2).max(160),
  destinationCity: z.string().trim().max(120).optional().nullable(),
  destinationLat: decimal(-90, 90),
  destinationLng: decimal(-180, 180),
  vehicleId: idSchema.optional().nullable(),
  driverId: idSchema.optional().nullable(),
  plannedDepartureAt: z.coerce.date().optional().nullable(),
  estimatedArrivalAt: z.coerce.date().optional().nullable(),
  items: z
    .array(z.object({ batchId: idSchema, quantity: z.coerce.number().int().min(1) }))
    .min(1, "A shipment requires at least one batch"),
  notes: z.string().trim().max(1000).optional().nullable(),
});
export type ShipmentInput = z.infer<typeof shipmentSchema>;

export const shipmentEventSchema = z.object({
  type: z.enum([
    "DEPARTED",
    "CHECKPOINT",
    "TEMPERATURE_CHECK",
    "DELAY",
    "ARRIVED",
    "DELIVERED",
    "NOTE",
  ]),
  message: z.string().trim().min(2).max(500),
  lat: decimal(-90, 90).optional().nullable(),
  lng: decimal(-180, 180).optional().nullable(),
  occurredAt: z.coerce.date().optional(),
});

export const deliverShipmentSchema = z.object({
  receivedBy: z.string().trim().min(2).max(160),
  notes: z.string().trim().max(1000).optional().nullable(),
});

/* -------------------------------------------------------------------------- */
/*  Telemetry                                                                */
/* -------------------------------------------------------------------------- */

export const telemetryReadingSchema = z.object({
  deviceId: z.string().trim().min(4).max(60),
  temperature: z.number().min(-100).max(80),
  humidity: z.number().min(0).max(100).optional().nullable(),
  recordedAt: z.string().datetime({ offset: true }),
  bootId: z.string().trim().min(8).max(64).regex(/^[a-zA-Z0-9._:-]+$/),
  sequenceNumber: z.number().int().min(1),
  isSimulated: z.boolean().optional().default(false),
  nonce: z.string().min(8).max(64).optional(),
  signature: z.string().min(16).max(256).optional(),
});
export type TelemetryReadingInput = z.infer<typeof telemetryReadingSchema>;

export const simulationStartSchema = z.object({
  scenario: z.enum(SIMULATION_SCENARIOS).default("STABLE"),
  intervalMs: z.coerce.number().int().min(500).max(60_000).default(3000),
});

/* -------------------------------------------------------------------------- */
/*  Incidents                                                                */
/* -------------------------------------------------------------------------- */

export const incidentAssignSchema = z.object({ assigneeId: idSchema });
export const incidentAcknowledgeSchema = z.object({ notes: z.string().trim().max(1000).optional() });
export const incidentResolveSchema = z.object({
  resolutionNotes: z.string().trim().min(10).max(2000),
  outcome: z.enum(["PRODUCT_SAFE", "DISPATCHED_UNDER_DEVIATION", "PRODUCT_DISCARDED", "FALSE_ALARM"]),
  rootCause: z.string().trim().max(1000).optional().nullable(),
});
export const incidentNoteSchema = z.object({ notes: z.string().trim().min(2).max(1000) });

/* -------------------------------------------------------------------------- */
/*  API envelopes                                                            */
/* -------------------------------------------------------------------------- */

export type ApiMeta = {
  requestId: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
};

export type ApiSuccess<T> = { success: true; data: T; meta?: ApiMeta };
export type ApiError = {
  success: false;
  error: { code: string; message: string; details?: unknown };
  meta: { requestId: string };
};

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: RoleKey;
  organization: { id: string; name: string; slug: string; timezone: string };
  permissions: string[];
};

export const ERROR_CODES = {
  VALIDATION: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL_ERROR",
  DEVICE_AUTH: "DEVICE_AUTH_FAILED",
  IDEMPOTENT_REPLAY: "IDEMPOTENT_REPLAY",
} as const;
