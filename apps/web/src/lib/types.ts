/**
 * Wire types for the FROSTGUARD API.
 *
 * Prisma `Decimal` values serialise to strings, so numeric database columns use
 * `Numeric`. The helpers in `format.ts` normalise them for display.
 */

export type Numeric = number | string;
export type Id = string;

export type Severity = "INFO" | "WARNING" | "CRITICAL";
export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "SEVERE";

export interface TemperatureProfile {
  id: Id;
  orgId: Id;
  name: string;
  minTemp: Numeric;
  maxTemp: Numeric;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: Id;
  orgId: Id;
  code: string;
  name: string;
  category: string;
  description: string | null;
  manufacturer: string | null;
  storageType: string;
  minTemp: Numeric;
  maxTemp: Numeric;
  isActive: boolean;
  temperatureProfileId: Id | null;
  temperatureProfile?: Pick<TemperatureProfile, "id" | "name" | "minTemp" | "maxTemp"> | null;
  createdAt: string;
  updatedAt: string;
  _count?: { batches: number };
}

export interface Supplier {
  id: Id;
  code: string;
  name: string;
  contactEmail: string | null;
  country: string | null;
}

export interface Warehouse {
  id: Id;
  orgId: Id;
  code: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  country: string | null;
  latitude: Numeric | null;
  longitude: Numeric | null;
  isActive: boolean;
  createdAt: string;
  storageUnits?: Array<{
    id: Id;
    code: string;
    name: string;
    type: string;
    status: string;
    minTemp: Numeric;
    maxTemp: Numeric;
    _count?: { batches: number };
    sensorAssignments?: Array<{ sensor: Pick<Sensor, "deviceId" | "status"> }>;
  }>;
  shipmentsAsOrigin?: Array<{
    id: Id;
    code: string;
    status: string;
    destinationName: string;
    createdAt: string;
  }>;
  _count?: { storageUnits: number; shipmentsAsOrigin: number };
}

export interface StorageUnit {
  id: Id;
  orgId: Id;
  warehouseId: Id;
  code: string;
  name: string;
  type: string;
  capacityUnits: number;
  minTemp: Numeric;
  maxTemp: Numeric;
  status: string;
  createdAt: string;
  warehouse?: Pick<Warehouse, "id" | "name" | "city">;
  batches?: Batch[];
  sensorAssignments?: Array<{ sensor: Sensor }>;
  excursions?: Excursion[];
  maintenanceLogs?: MaintenanceLog[];
  _count?: { batches: number };
  sensors?: Array<Pick<Sensor, "id" | "deviceId" | "status" | "lastSeenAt">>;
}

export interface MaintenanceLog {
  id: Id;
  type: string;
  performedBy: string;
  notes: string | null;
  performedAt: string;
}

export interface Batch {
  id: Id;
  orgId: Id;
  productId: Id;
  supplierId: Id | null;
  batchNumber: string;
  manufacturedAt: string;
  expiresAt: string;
  quantity: number;
  remainingQuantity: number;
  storageUnitId: Id | null;
  temperatureProfileId: Id | null;
  status: string;
  createdAt: string;
  product?: Pick<Product, "id" | "name" | "code" | "category" | "minTemp" | "maxTemp">;
  supplier?: Pick<Supplier, "id" | "name"> | null;
  storageUnit?: (Pick<StorageUnit, "id" | "code" | "name"> & { warehouse?: Pick<Warehouse, "name"> }) | null;
  temperatureProfile?: TemperatureProfile | null;
  shipmentItems?: Array<{
    id: Id;
    quantity: number;
    shipment: Pick<Shipment, "id" | "code" | "status" | "destinationName" | "dispatchedAt" | "deliveredAt">;
  }>;
}

export interface Sensor {
  id: Id;
  orgId: Id;
  deviceId: string;
  name: string;
  model: string | null;
  firmwareVersion: string | null;
  sensorType: string;
  status: string;
  apiKeyPrefix: string | null;
  calibrationDueAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  assignments?: Array<{
    id: Id;
    startedAt: string;
    endedAt: string | null;
    storageUnit?: Pick<StorageUnit, "id" | "code" | "name"> | null;
    shipment?: Pick<Shipment, "id" | "code" | "status"> | null;
  }>;
  readings?: Reading[];
  excursions?: Excursion[];
  simulations?: DeviceSimulation[];
  _count?: { excursions: number };
}

export interface Reading {
  id: Id | number;
  orgId: Id;
  sensorId: Id;
  temperature: Numeric;
  humidity: Numeric | null;
  recordedAt: string;
  sequenceNumber: number;
  isSimulated: boolean;
  source: string;
  sensor?: Pick<Sensor, "id" | "deviceId" | "name">;
}

export interface LatestReading {
  sensorId: Id;
  deviceId: string;
  name: string;
  temperature: Numeric;
  recordedAt: string;
  isSimulated: number | boolean;
  status: string;
  storageUnit: string | null;
  shipment: string | null;
}

export interface SeriesPoint {
  bucketStart: string;
  avg: number;
  min: number;
  max: number;
  count: number;
  simulated: number;
}

export interface Excursion {
  id: Id;
  orgId: Id;
  sensorId: Id;
  storageUnitId: Id | null;
  shipmentId: Id | null;
  batchId: Id | null;
  incidentId: Id | null;
  type: string;
  severity: Severity;
  status: string;
  minTemp: Numeric;
  maxTemp: Numeric;
  thresholdMin: Numeric;
  thresholdMax: Numeric;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  sensor?: Pick<Sensor, "id" | "name" | "deviceId">;
  storageUnit?: (Pick<StorageUnit, "id" | "name"> & { warehouse?: Pick<Warehouse, "name"> }) | null;
  shipment?: Pick<Shipment, "id" | "code" | "status" | "destinationName"> | null;
  incident?: Pick<Incident, "id" | "code" | "status" | "severity"> | null;
}

export interface Alert {
  id: Id;
  orgId: Id;
  excursionId: Id | null;
  incidentId: Id | null;
  code: string;
  title: string;
  message: string;
  severity: Severity;
  status: string;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  excursion?: (Excursion & { sensor?: Pick<Sensor, "name"> }) | null;
}

export interface Incident {
  id: Id;
  orgId: Id;
  code: string;
  title: string;
  description: string | null;
  severity: Severity;
  status: string;
  alertId: Id | null;
  excursionId: Id | null;
  assigneeId: Id | null;
  createdById: Id | null;
  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionNotes: string | null;
  outcome: string | null;
  rootCause: string | null;
  assignee?: { id: Id; fullName: string } | null;
  alert?: Pick<Alert, "id" | "severity" | "status"> | null;
  excursion?: (Pick<Excursion, "id" | "startedAt" | "minTemp" | "maxTemp" | "status"> & {
    sensor?: Pick<Sensor, "name" | "deviceId">;
  }) | null;
  _count?: { actions: number };
}

export interface IncidentAction {
  id: Id;
  incidentId: Id;
  actorId: Id | null;
  action: string;
  notes: string | null;
  createdAt: string;
  actor?: { id: Id; fullName: string } | null;
}

export interface IncidentDetail extends Incident {
  assignee?: { id: Id; fullName: string; email: string } | null;
  createdBy?: { id: Id; fullName: string } | null;
  alert?: Alert | null;
  excursion?:
    | (Excursion & {
        sensor?: Sensor;
        storageUnit?: (StorageUnit & { warehouse?: Warehouse }) | null;
        shipment?: Pick<Shipment, "id" | "code" | "status" | "destinationName"> | null;
      })
    | null;
  actions: IncidentAction[];
}

export interface Shipment {
  id: Id;
  orgId: Id;
  code: string;
  originWarehouseId: Id;
  destinationName: string;
  destinationCity: string | null;
  destinationLat: Numeric;
  destinationLng: Numeric;
  originLat: Numeric | null;
  originLng: Numeric | null;
  currentLat: Numeric | null;
  currentLng: Numeric | null;
  positionSource: "UNAVAILABLE" | "SIMULATED" | "OPERATOR_REPORTED" | "DELIVERY_CONFIRMED";
  positionUpdatedAt: string | null;
  vehicleId: Id | null;
  driverId: Id | null;
  status: string;
  progressPercent: number;
  riskScore: number;
  plannedDepartureAt: string | null;
  estimatedArrivalAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  createdAt: string;
  originWarehouse?: Pick<Warehouse, "id" | "name" | "city">;
  vehicle?: { id: Id; plateNumber: string; model: string | null } | null;
  driver?: { id: Id; fullName: string } | null;
  items?: ShipmentItem[];
  events?: ShipmentEvent[];
  sensorAssignments?: Array<{ sensor: Sensor & { readings?: Reading[] } }>;
  excursions?: Array<Excursion & { incident?: Pick<Incident, "id" | "code" | "status" | "severity"> | null }>;
  _count?: { items: number };
}

export interface ShipmentItem {
  id: Id;
  shipmentId: Id;
  batchId: Id;
  quantity: number;
  batch?: Batch;
}

export interface ShipmentEvent {
  id: Id;
  shipmentId: Id;
  type: string;
  message: string;
  lat: Numeric | null;
  lng: Numeric | null;
  occurredAt: string;
  createdById: Id | null;
  createdBy?: { fullName: string } | null;
}

export interface ShipmentMapPoint {
  id: Id;
  code: string;
  status: string;
  origin: { lat: number; lng: number };
  originName: string;
  destination: { lat: number; lng: number };
  current: { lat: number; lng: number } | null;
  positionSource: Shipment["positionSource"];
  positionUpdatedAt: string | null;
  progressPercent: number;
  riskScore: number;
  destinationName: string;
  temperature: number | null;
  isSimulated: boolean;
  openExcursions: Array<{ id: Id; severity: Severity; type: string }>;
  vehicleId: Id | null;
}

export interface DashboardData {
  kpis: {
    activeShipments: number;
    safeShipments: number;
    activeExcursions: number;
    criticalIncidents: number;
    connectedDevices: number;
    offlineDevices: number;
    atRiskBatches: number;
    onTimeDeliveries: number;
    deliveredShipments30d: number;
    onTimeRate: number | null;
  };
  shipmentByStatus: Record<string, number>;
  sensorByStatus: Record<string, number>;
  temperatureTrend: Array<{ bucketStart: string; avg: number; min: number; max: number; count: number }>;
  excursionFrequency: Array<{ day: string; total: number; critical: number }>;
  alertSeverity: Array<{ severity: Severity; count: number }>;
  warehousePerformance: Array<{
    id: Id;
    name: string;
    city: string | null;
    units: number;
    batches: number;
    excursions: number;
    averageTemperature: number | null;
  }>;
  riskByShipment: Array<{
    id: Id;
    code: string;
    destinationName: string;
    status: string;
    riskScore: number;
    progressPercent: number;
    excursions: Array<{ severity: Severity }>;
  }>;
  activity: { audit: AuditLog[]; alerts: Alert[] };
  topRiskUnits: Array<{
    id: Id;
    name: string;
    warehouse: string;
    excursions: number;
    open: number;
    lastTemp: number | null;
  }>;
  latestReadings: Reading[];
}

export interface AnalyticsData {
  risk: {
    shipments: Array<{
      id: Id;
      code: string;
      destinationName: string;
      status: string;
      progressPercent: number;
      riskScore: number;
      riskBand: RiskBand;
      reasons: string[];
      temperature: number | null;
      lastReadingAt: string | null;
    }>;
    buckets: Record<RiskBand, number>;
  };
  warehouses: DashboardData["warehousePerformance"];
  devices: Array<{
    id: Id;
    deviceId: string;
    name: string;
    status: string;
    lastSeenAt: string | null;
    readings: number;
    excursions: number;
    reliabilityPercent: number;
  }>;
  expiring: Batch[];
  delivery: Array<{
    month: string;
    delivered: number;
    onTime: number;
    delayed: number;
    onTimeRate: number | null;
  }>;
}

export interface AuditLog {
  id: Id | number;
  orgId: Id;
  actorId: Id | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
  actor?: { id: Id; fullName: string; email: string } | null;
}

export interface Member {
  id: Id;
  orgId: Id;
  userId: Id;
  roleId: Id;
  createdAt: string;
  user: {
    id: Id;
    email: string;
    fullName: string;
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  };
  role: { id: Id; key: string; name: string };
}

export interface AssignableMember {
  id: Id;
  fullName: string;
  email: string;
  role: string;
}

export interface DeviceSimulation {
  id: Id;
  orgId: Id;
  sensorId: Id;
  scenario: string;
  intervalMs: number;
  status: string;
  startedAt: string;
  stoppedAt: string | null;
  lastTickAt: string | null;
  createdById: Id | null;
  sensor?: Pick<Sensor, "id" | "deviceId" | "name">;
}

export interface IncidentStats {
  open: number;
  acknowledged: number;
  investigating: number;
  resolved: number;
  criticalOpen: number;
}

export interface DeviceStats {
  online: number;
  offline: number;
  maintenance: number;
  revoked: number;
  calibrationDue: number;
}

export interface DbmsOverview {
  database: string;
  tables: number;
  views: number;
  triggers: number;
  procedures: number;
  indexes: number;
  rows: number;
}

export interface DbmsTable {
  name: string;
  rows: number;
  dataLength?: number;
  indexLength?: number;
  engine?: string;
  collation?: string;
}

export interface DbmsObject {
  name: string;
  [key: string]: unknown;
}

export interface DbmsExplain {
  query: string;
  plan: Array<{ id?: number; select_type?: string; table?: string; type?: string; key?: string | null; rows?: number; Extra?: string }>;
}

export interface Traceability {
  batch: Batch & {
    product: Product;
    supplier: Supplier | null;
    storageUnit?: (StorageUnit & { warehouse: Warehouse }) | null;
    temperatureProfile?: TemperatureProfile | null;
    shipmentItems: NonNullable<Batch["shipmentItems"]>;
  };
  timeline: Array<{ at: string; type: string; title: string; detail: string }>;
  excursions: Excursion[];
  readings: Array<{ temperature: Numeric; recordedAt: string; isSimulated: boolean; sensorId: Id }>;
  shipmentIds: Id[];
}

export interface RealtimeEvent {
  topic: string;
  payload: Record<string, unknown>;
  receivedAt: string;
}
