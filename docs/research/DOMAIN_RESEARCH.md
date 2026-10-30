# Cold-Chain Domain Research

**Research date:** 2026-10-30 (sources rechecked 2026-10-30)\
**Purpose:** Domain assumptions for FROSTGUARD’s prototype workflows. This is product-design research, not regulatory or medical advice.

## Findings and design implications

### Product-specific limits and excursion response

Temperature requirements belong to a product and its authorized storage/shipping profile, not to a universal platform-wide threshold. WHO material describes specific controlled temperature chain allowances for qualifying vaccines under defined, product-specific conditions; it does not imply that all products can use those conditions. UNICEF explains that different vaccines have different heat and freeze sensitivities. FROSTGUARD therefore stores limits on a product temperature profile and evaluates telemetry against the associated profile.

An out-of-range reading is an investigation trigger. CDC operational guidance says to notify the responsible coordinator, mark exposed vaccines “do not use,” keep them under appropriate storage conditions, document the event, follow local procedures, and consult the immunization program or manufacturer. WHO likewise directs documentation of excursion temperature and duration and referral to supervisor/SOP. This supports a workflow that records evidence and human disposition. FROSTGUARD must not automatically label product spoiled or safe.

### Exposure evidence and sensor confidence

An investigation needs the excursion interval, readings, magnitude, device identity, calibration status, assignment history and actions taken. Recorded time and received time should remain distinguishable. Gaps, late events, clock uncertainty, sensor outage and calibration expiry must be visible because a chart line cannot reconstruct missing measurements. Threshold alerts do not represent product stability calculations or cumulative potency loss.

### Shipment and batch traceability

Traceability connects what moved (product/batch), when, where, why/business context and who recorded each handoff. GS1 EPCIS 2.0 also covers sensor data such as temperature and supports visibility-event exchange. The current prototype has shipment events and batch association; it does not claim GS1 EPCIS conformance or interoperability.

### Device management and auditability

Device identity, assignment, last-seen, calibration and maintenance information are operational evidence. Preserve telemetry as immutable observations and append corrective actions/audit events instead of rewriting historical readings. Use UTC instants for persistence and present localized times with an explicit zone in the UI.

### Relational data and transactions

The actual schema uses Prisma with MySQL and InnoDB-oriented SQL objects. Shipment dispatch must reserve/decrement inventory atomically with the shipment state transition. Telemetry, related excursion/alert/incident records, audit and outbox writes belong in one database transaction. MySQL documents transaction characteristics and `COMMIT`/`ROLLBACK`; the application's transactional guarantees are described in `docs/database/TRANSACTION_DESIGN.md`.

## Product behavior constraints

1. Do not apply one default temperature range to every product. Require an explicit product/profile range for actionable excursions.
2. Keep temperature units explicit and validate numeric ranges at ingestion.
3. Do not declare a batch spoiled or safe from temperature thresholds alone.
4. Capture a human-reviewed disposition with investigation notes, root cause, corrective action, responsible actor and timestamp.
5. Retain the source readings and evidence used to review a disposition.
6. Distinguish device telemetry from synthetic simulator data in API and UI.
7. Do not represent simulated coordinates as actual GPS.
8. Do not claim medical validation, regulatory certification, WHO PQS status, or GS1 conformance.

## Mapping of domain guidance to the current implementation

| Domain practice | Current code behavior | Remaining limit |
|---|---|---|
| Limits depend on product and approved handling profile | Prisma TemperatureProfile belongs to an organization; products and batches may reference it. The excursion resolver applies the relevant shipment, stored-batch, product, or storage-unit envelope. | Profile thresholds are demonstration inputs. The system does not validate a product manufacturer's stability data or jurisdictional policy. |
| Out-of-range events require prompt investigation and evidence | Telemetry creates an Excursion; qualifying critical alerts create an Incident; incident actions, resolution notes, human outcome, audit, and outbox records are supported. | Notification channels are currently in-app; actual email/SMS escalation is not configured. |
| Do not disposition solely from one reading | Excursion evaluation uses configured consecutive-reading persistence. Incident resolution requires a human outcome/notes and records actor and timestamp. | The rule engine is threshold/persistence logic only; it does not estimate potency, cumulative exposure, or product suitability. |
| Preserve measurement history and identify its source | SensorReading is protected by a MySQL append-only update trigger; source is DEVICE or SIMULATOR. Device API requests cannot set the synthetic flag; trusted internal simulator calls set it. | Readings have recordedAt plus database createdAt; a separately named receivedAt and device clock-confidence field are not modeled. |
| Handle delayed telemetry deliberately | Ingestion serializes per sensor, stores a delayed lower-sequence sample as immutable history, marks it out-of-order, and does not use it to mutate live excursion or alert state. | Sequence ordering assumes devices maintain a monotonic sequence across their identity lifecycle; device replacement/reset needs an explicit re-provisioning policy. |
| Record meaningful time and accountable operator | UTC instants are persisted; incident actions and audit rows carry actor and created timestamps; excursion stores start/end/duration. | UI timezone display and event received-vs-recorded timing need a full route-level browser audit. |
| Trace product movement and sensor evidence | Batch, shipment items/events, assignments, readings, excursions, and incidents are related for traceability. | This is not an EPCIS interface, conformance test, or certified chain-of-custody exchange. |

The new late-reading behavior is covered by apps/api/tests/telemetry.test.ts; device-origin flag handling is also tested against a client-supplied isSimulated=true. These are software integrity controls, not confirmation of sensor accuracy.

## Sources

Sources accessed 2026-10-30:

1. WHO, *Vaccine Management Handbook: How to monitor temperatures in the vaccine supply chain* (2017). https://www.who.int/publications/i/item/WHO-IVB-15.04
2. WHO, *Vaccine vial monitor (VVM)* (2021). https://www.who.int/publications/m/item/vaccine-vial-monitor
3. WHO, *Controlled Temperature Chain (CTC)*. https://www.who.int/teams/immunization-vaccines-and-biologicals/essential-programme-on-immunization/supply-chain/controlled-temperature-chain-%28ctc%29
4. UNICEF Supply Division, *E006 temperature monitoring devices*. https://www.unicef.org/supply/documents/e006-temperature-monitoring-devices
5. UNICEF Supply Division, *Cold chain frequently asked questions*. https://www.unicef.org/supply/cold-chain-faq
6. CDC, *Chapter 5: Vaccine Storage and Handling* (Pink Book). https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-5-vaccine-storage-and-handling.html
7. GS1, *What is Electronic Product Code Information Services (EPCIS)?* https://support.gs1.org/support/solutions/articles/43000755325-what-is-electronic-product-code-information-services-epcis-
8. MySQL 8.4 Reference Manual, *START TRANSACTION, COMMIT, and ROLLBACK*. https://dev.mysql.com/doc/refman/8.4/en/commit.html
9. MySQL 8.4 Reference Manual, *SET TRANSACTION Statement*. https://dev.mysql.com/doc/refman/8.4/en/set-transaction.html
10. OWASP Cheat Sheet Series, *Authorization Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
11. OWASP Cheat Sheet Series, *Authentication Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
12. CDC, *Vaccine Storage and Handling Toolkit: Handling a Temperature Excursion in Your Vaccine Storage Unit* (July 2026). https://www.cdc.gov/vaccines/hcp/admin/storage/downloads/temperature-excursion-508.pdf
13. WHO, *Temperature monitoring study: a fully documented process to detect weaknesses in the supply chain* (2018). https://www.who.int/publications/i/item/WHO-IVB-18.04
14. GS1, *EPCIS Standard 2.0* (ratified June 2022). https://ref.gs1.org/standards/epcis/2.0.0

The current CDC toolkit was rechecked on 2026-10-30. It directs personnel to notify, document, correct equipment/storage issues, keep affected vaccines under appropriate conditions, and contact the immunization program or manufacturer; it does not support automatic disposition from threshold data alone. UNICEF's procurement guidance states that vaccines differ in heat/freezing sensitivity. GS1 EPCIS defines a general event-based traceability model and sensor-related fields; FROSTGUARD uses it only as a design reference, not as a claim of conformance.

Guidance may change and product instructions, local SOPs, manufacturers, competent authorities and relevant regulations take precedence for real operations.
