# Security Policy

FROSTGUARD is a prototype and is not production-certified or medically validated. Do not use it as the sole basis for release, discard, or administration decisions involving temperature-sensitive products.

## Reporting a vulnerability

Please do not publish exploitable details in a public issue. Use GitHub's private vulnerability reporting for this repository when it is enabled. Otherwise contact the repository owner through the GitHub profile and request a private reporting channel.

Include affected commit/version, impact, reproduction steps, and any proposed mitigation. Avoid sending real credentials, personal data, patient information, or production telemetry.

## Deployment expectations

- Use HTTPS and a private MySQL network.
- Use unique managed secrets and least-privilege database credentials.
- Never deploy seeded demo credentials or predictable simulator device keys.
- Keep dependencies patched and review CI dependency audit findings.
- Restrict access to logs, telemetry, audit records and exports.
- Maintain backups and validate restore procedures.

See [security controls](docs/security/SECURITY_CONTROLS.md) and [threat model](docs/security/THREAT_MODEL.md). No penetration test is claimed.
