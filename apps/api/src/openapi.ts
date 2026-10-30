type SecurityName = "bearerAccess" | "accessCookie" | "refreshCookie" | "deviceKey";

type OperationOptions = {
  id: string;
  summary: string;
  tag: string;
  auth?: SecurityName[];
  parameters?: Array<Record<string, unknown>>;
  body?: boolean;
  bodyRequired?: boolean;
  success?: "200" | "201" | "200-201";
  successContentType?: string;
  successDescription?: string;
};

const pathParameter = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string" },
});

function operation({ id, summary, tag, auth = ["bearerAccess", "accessCookie"], parameters = [], body, bodyRequired = true, success = "200", successContentType, successDescription = "Successful operation." }: OperationOptions) {
  const successfulCodes = success === "200-201" ? ["200", "201"] : [success ?? "200"];
  const responses: Record<string, unknown> = Object.fromEntries(successfulCodes.map((code) => [
    code,
    {
      description: successDescription,
      ...(successContentType
        ? { content: { [successContentType]: { schema: { type: "string", ...(successContentType === "application/pdf" ? { format: "binary" } : {}) } } } }
        : {}),
    },
  ]));
  Object.assign(responses, {
    "400": { description: "Request validation failed." },
    "401": { description: "Authentication or device credential failed." },
    "403": { description: "The authenticated principal lacks the required permission." },
    "404": { description: "Resource was not found in the caller's organization." },
    "409": { description: "The requested state transition conflicts with current data." },
    "500": { description: "Unexpected server error; response includes a request ID." },
  });

  return {
    operationId: id,
    summary,
    tags: [tag],
    ...(auth.length ? { security: auth.map((name) => ({ [name]: [] })) } : { security: [] }),
    ...(parameters.length ? { parameters } : {}),
    ...(body
      ? {
          requestBody: {
            required: bodyRequired,
            description: "JSON request validated by the endpoint's Zod/shared domain schema.",
            content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
          },
        }
      : {}),
    responses,
  };
}

const id = (name: string) => [pathParameter(name)];
const get = (id: string, summary: string, tag: string, parameters?: Array<Record<string, unknown>>, options: Partial<OperationOptions> = {}) =>
  operation({ id, summary, tag, parameters, ...options });
const post = (id: string, summary: string, tag: string, options: Partial<OperationOptions> = {}) =>
  operation({ id, summary, tag, body: true, ...options });
const patch = (id: string, summary: string, tag: string, parameters: Array<Record<string, unknown>>) =>
  operation({ id, summary, tag, parameters, body: true });

/** API inventory is kept beside the Express mount table and smoke-tested through the public endpoint. */
export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "FROSTGUARD API",
    version: "1.0.0",
    description:
      "Cold-chain monitoring and traceability API. Authenticated operations are organization-scoped and require server-side permissions. Persisted timestamps are UTC. Excursions trigger investigation; they do not independently determine product disposition.",
  },
  servers: [{ url: "/api/v1", description: "Version 1 API" }],
  tags: [
    { name: "Authentication" }, { name: "Products" }, { name: "Batches" }, { name: "Warehouses" },
    { name: "Storage units" }, { name: "Devices" }, { name: "Telemetry" }, { name: "Simulations" },
    { name: "Shipments" }, { name: "Alerts" }, { name: "Incidents" }, { name: "Dashboard" },
    { name: "Analytics" }, { name: "Audit" }, { name: "Users" }, { name: "Reports" },
    { name: "DBMS" }, { name: "Health" },
  ],
  paths: {
    "/": { get: operation({ id: "getApiInfo", summary: "API metadata and documentation links", tag: "Health", auth: [] }) },
    "/auth/login": { post: operation({ id: "login", summary: "Create a user session", tag: "Authentication", auth: [], body: true, success: "200" }) },
    "/auth/refresh": { post: operation({ id: "refreshSession", summary: "Rotate the refresh-token family using an HttpOnly cookie or request token", tag: "Authentication", auth: [], body: true, bodyRequired: false }) },
    "/auth/logout": { post: operation({ id: "logout", summary: "Revoke the refresh-token family using an HttpOnly cookie or request token", tag: "Authentication", auth: [], body: true, bodyRequired: false }) },
    "/auth/me": { get: get("getCurrentSession", "Read the current user's organization membership", "Authentication") },
    "/products": {
      get: get("listProducts", "List organization products", "Products"),
      post: post("createProduct", "Create a product and its temperature profile", "Products", { success: "201" }),
    },
    "/products/{id}": {
      get: get("getProduct", "Read a product", "Products", id("id")),
      patch: patch("updateProduct", "Update a product", "Products", id("id")),
      delete: operation({ id: "archiveProduct", summary: "Archive a product", tag: "Products", parameters: id("id") }),
    },
    "/batches": {
      get: get("listBatches", "List batches", "Batches"),
      post: post("createBatch", "Create a traceable batch", "Batches", { success: "201" }),
    },
    "/batches/{id}": {
      get: get("getBatch", "Read a batch", "Batches", id("id")),
      patch: patch("updateBatch", "Update a batch", "Batches", id("id")),
    },
    "/batches/{id}/traceability": { get: get("getBatchTraceability", "Read batch event history", "Batches", id("id")) },
    "/warehouses": {
      get: get("listWarehouses", "List warehouses", "Warehouses"),
      post: post("createWarehouse", "Create a warehouse", "Warehouses", { success: "201" }),
    },
    "/warehouses/{id}": {
      get: get("getWarehouse", "Read a warehouse", "Warehouses", id("id")),
      patch: patch("updateWarehouse", "Update a warehouse", "Warehouses", id("id")),
    },
    "/storage-units": {
      get: get("listStorageUnits", "List storage units", "Storage units"),
      post: post("createStorageUnit", "Create a storage unit", "Storage units", { success: "201" }),
    },
    "/storage-units/{id}": {
      get: get("getStorageUnit", "Read a storage unit", "Storage units", id("id")),
      patch: patch("updateStorageUnit", "Update a storage unit", "Storage units", id("id")),
    },
    "/storage-units/{id}/maintenance": { post: post("addStorageMaintenance", "Record storage-unit maintenance", "Storage units", { parameters: id("id") }) },
    "/devices": {
      get: get("listDevices", "List registered devices", "Devices"),
      post: post("registerDevice", "Register a device", "Devices", { success: "201" }),
    },
    "/devices/stats": { get: get("getDeviceStats", "Read device health counts", "Devices") },
    "/devices/{id}": {
      get: get("getDevice", "Read device details", "Devices", id("id")),
      patch: patch("updateDevice", "Update device status or metadata", "Devices", id("id")),
    },
    "/devices/{id}/rotate-key": { post: post("rotateDeviceKey", "Rotate a device credential", "Devices", { parameters: id("id"), body: false }) },
    "/devices/{id}/revoke": { post: post("revokeDevice", "Revoke a device credential", "Devices", { parameters: id("id"), body: false }) },
    "/telemetry/readings": {
      post: operation({ id: "ingestTelemetry", summary: "Ingest an authenticated device reading", tag: "Telemetry", auth: ["deviceKey"], body: true, success: "200-201" }),
      get: get("listTelemetryReadings", "Query organization telemetry history", "Telemetry"),
    },
    "/telemetry/latest": { get: get("getLatestTelemetry", "Read latest sensor readings", "Telemetry") },
    "/telemetry/series": { get: get("getTelemetrySeries", "Read aggregated temperature history", "Telemetry") },
    "/simulations": { get: get("listSimulations", "List active telemetry simulations", "Simulations") },
    "/simulations/devices/{sensorId}/start": { post: post("startSimulation", "Start a labelled telemetry simulation", "Simulations", { parameters: id("sensorId"), success: "201" }) },
    "/simulations/devices/{sensorId}/stop": { post: post("stopSimulation", "Stop a telemetry simulation", "Simulations", { parameters: id("sensorId"), body: false }) },
    "/simulations/devices/{sensorId}/reset": { post: post("resetSimulation", "Reset a telemetry simulation", "Simulations", { parameters: id("sensorId"), body: false }) },
    "/shipments": {
      get: get("listShipments", "List shipments", "Shipments"),
      post: post("createShipment", "Create a shipment and reserve batch stock", "Shipments", { success: "201" }),
    },
    "/shipments/map": { get: get("getShipmentMap", "Read shipment locations and provenance", "Shipments") },
    "/shipments/{id}": { get: get("getShipment", "Read a shipment", "Shipments", id("id")) },
    "/shipments/{id}/dispatch": { post: post("dispatchShipment", "Dispatch a stock-reserved shipment", "Shipments", { parameters: id("id"), body: false }) },
    "/shipments/{id}/deliver": { post: post("deliverShipment", "Record shipment delivery", "Shipments", { parameters: id("id") }) },
    "/shipments/{id}/position": { patch: patch("updateShipmentPosition", "Record shipment position and progress", "Shipments", id("id")) },
    "/shipments/{id}/events": { post: post("addShipmentEvent", "Record a shipment event", "Shipments", { parameters: id("id") }) },
    "/shipments/{id}/cancel": { post: post("cancelShipment", "Cancel a shipment and release eligible reservations", "Shipments", { parameters: id("id"), body: false }) },
    "/alerts": { get: get("listAlerts", "List organization alerts", "Alerts") },
    "/alerts/{id}/acknowledge": { post: post("acknowledgeAlert", "Acknowledge an alert", "Alerts", { parameters: id("id") }) },
    "/incidents": { get: get("listIncidents", "List organization incidents", "Incidents") },
    "/incidents/stats": { get: get("getIncidentStats", "Read incident counts", "Incidents") },
    "/incidents/{id}": { get: get("getIncident", "Read an incident and investigation history", "Incidents", id("id")) },
    "/incidents/{id}/acknowledge": { post: post("acknowledgeIncident", "Acknowledge an incident", "Incidents", { parameters: id("id") }) },
    "/incidents/{id}/assign": { post: post("assignIncident", "Assign an incident", "Incidents", { parameters: id("id") }) },
    "/incidents/{id}/investigate": { post: post("startIncidentInvestigation", "Start incident investigation", "Incidents", { parameters: id("id") }) },
    "/incidents/{id}/resolve": { post: post("resolveIncident", "Resolve an incident with human-reviewed disposition", "Incidents", { parameters: id("id") }) },
    "/incidents/{id}/notes": { post: post("addIncidentNote", "Add an incident investigation note", "Incidents", { parameters: id("id"), success: "201" }) },
    "/dashboard": { get: get("getDashboard", "Read dashboard metrics", "Dashboard") },
    "/dashboard/overview": { get: get("getOverview", "Read operational overview", "Dashboard") },
    "/dashboard/temperature-trends": { get: get("getTemperatureTrends", "Read temperature trend aggregates", "Dashboard") },
    "/analytics": { get: get("getAnalytics", "Read organization analytics", "Analytics") },
    "/analytics/risk": { get: get("getRiskAnalytics", "Read operational risk indicators", "Analytics") },
    "/analytics/warehouses": { get: get("getWarehouseAnalytics", "Read warehouse performance", "Analytics") },
    "/analytics/devices": { get: get("getDeviceAnalytics", "Read device reliability", "Analytics") },
    "/analytics/expiring": { get: get("getExpiringBatches", "Read batches approaching expiry", "Analytics") },
    "/analytics/delivery": { get: get("getDeliveryAnalytics", "Read delivery performance", "Analytics") },
    "/audit-logs": { get: get("listAuditLogs", "Read the organization audit trail", "Audit") },
    "/users": {
      get: get("listMembers", "List organization members", "Users"),
      post: post("createMember", "Add a member to the organization", "Users", { success: "201" }),
    },
    "/users/assignable": { get: get("listAssignableMembers", "List members eligible for incident assignment", "Users") },
    "/users/{userId}/role": { patch: patch("updateMemberRole", "Update a member role", "Users", id("userId")) },
    "/users/{userId}": { delete: operation({ id: "removeMember", summary: "Remove a member from the organization", tag: "Users", parameters: id("userId") }) },
    "/reports/temperature": { get: get("exportTemperatureReport", "Export temperature readings as CSV", "Reports", undefined, { successContentType: "text/csv", successDescription: "CSV attachment." }) },
    "/reports/shipments": { get: get("exportShipmentReport", "Export shipment records as CSV", "Reports", undefined, { successContentType: "text/csv", successDescription: "CSV attachment." }) },
    "/reports/incidents": { get: get("exportIncidentReport", "Export incident records as CSV", "Reports", undefined, { successContentType: "text/csv", successDescription: "CSV attachment." }) },
    "/reports/batch/{id}": { get: get("exportBatchTraceability", "Export batch traceability events", "Reports", id("id"), { successContentType: "text/csv", successDescription: "CSV attachment." }) },
    "/reports/summary.pdf": { get: get("exportOperationsSummary", "Export operations summary as PDF", "Reports", undefined, { successContentType: "application/pdf", successDescription: "PDF attachment." }) },
    "/dbms/overview": { get: get("getDatabaseOverview", "Read database overview", "DBMS") },
    "/dbms/tables": { get: get("getDatabaseTables", "Read table statistics", "DBMS") },
    "/dbms/views": { get: get("getDatabaseViews", "List database views", "DBMS") },
    "/dbms/triggers": { get: get("getDatabaseTriggers", "List database triggers", "DBMS") },
    "/dbms/routines": { get: get("getDatabaseRoutines", "List stored routines", "DBMS") },
    "/dbms/explain": { get: get("explainDatabaseQuery", "Explain an allowlisted query plan", "DBMS") },
    "/dbms/explain-reservation": { get: get("explainReservation", "Explain shipment reservation query plan", "DBMS") },
    "/dbms/incident-summary": { get: get("getIncidentSummary", "Read database incident summary", "DBMS") },
    "/dbms/verify-rollback": { post: post("verifyRollback", "Run the database rollback demonstration", "DBMS", { body: false }) },
    "/health/live": { get: operation({ id: "healthLive", summary: "Check process liveness", tag: "Health", auth: [] }) },
    "/health/ready": { get: operation({ id: "healthReady", summary: "Check database-backed readiness", tag: "Health", auth: [] }) },
  },
  components: {
    securitySchemes: {
      bearerAccess: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Short-lived in-memory access token." },
      accessCookie: { type: "apiKey", in: "cookie", name: "fg_access", description: "HttpOnly access cookie." },
      refreshCookie: { type: "apiKey", in: "cookie", name: "fg_refresh", description: "HttpOnly rotating refresh cookie; login and refresh also set it." },
      deviceKey: { type: "apiKey", in: "header", name: "x-device-key", description: "Credential issued for one registered device." },
    },
  },
} as const;
