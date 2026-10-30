# Entity Relationship Diagram

The diagram captures the main relations defined in the current Prisma schema. Some optional relations are omitted for readability; consult `apps/api/prisma/schema.prisma` for exact columns, keys, and delete actions.

```mermaid
erDiagram
  ORGANIZATION ||--o{ MEMBERSHIP : has
  USER ||--o{ MEMBERSHIP : joins
  ROLE ||--o{ MEMBERSHIP : assigns
  ROLE ||--o{ ROLE_PERMISSION : grants
  PERMISSION ||--o{ ROLE_PERMISSION : includes
  ORGANIZATION ||--o{ PRODUCT : owns
  TEMPERATURE_PROFILE o|--o{ PRODUCT : configures
  PRODUCT ||--o{ BATCH : identifies
  SUPPLIER o|--o{ BATCH : supplies
  STORAGE_UNIT o|--o{ BATCH : stores
  ORGANIZATION ||--o{ WAREHOUSE : owns
  WAREHOUSE ||--o{ STORAGE_UNIT : contains
  ORGANIZATION ||--o{ SENSOR : owns
  SENSOR ||--o{ SENSOR_ASSIGNMENT : assigned
  STORAGE_UNIT o|--o{ SENSOR_ASSIGNMENT : monitors
  SHIPMENT o|--o{ SENSOR_ASSIGNMENT : monitors
  SENSOR ||--o{ SENSOR_READING : reports
  ORGANIZATION ||--o{ SHIPMENT : owns
  SHIPMENT ||--o{ SHIPMENT_ITEM : contains
  BATCH ||--o{ SHIPMENT_ITEM : allocated
  SHIPMENT ||--o{ SHIPMENT_EVENT : records
  SENSOR ||--o{ EXCURSION : detects
  EXCURSION ||--o{ ALERT : raises
  EXCURSION o|--o| INCIDENT : investigated
  ALERT o|--o| INCIDENT : initiates
  INCIDENT ||--o{ INCIDENT_ACTION : records
  ORGANIZATION ||--o{ AUDIT_LOG : records
  ORGANIZATION o|--o{ OUTBOX_EVENT : publishes
```

## Cardinality notes

- A `Membership` joins one user to one organization and role; permissions are resolved through role-permission mappings.
- A product can reference a temperature profile; a batch can override/select a profile and optionally occupy a storage unit.
- A sensor has readings and time-bounded assignments to a storage unit or shipment.
- A shipment has multiple batches through `ShipmentItem` and an ordered event history.
- An excursion can create an alert and can be linked to an incident; incidents retain action rows and human disposition fields.
- `AuditLog`, `OutboxEvent`, `IdempotencyRecord`, notifications and simulations provide platform/process evidence.

This is an implementation diagram, not a claim of GS1 EPCIS conformance.
