import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  ClipboardCheck,
  Database,
  GitBranch,
  KeyRound,
  Layers,
  LockKeyhole,
  Menu,
  Package,
  Radio,
  ShieldCheck,
  Siren,
  Snowflake,
  Thermometer,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge, Button } from "@/components/ui";

const PIPELINE = [
  { icon: Package, title: "Product", copy: "Master data, storage class and permitted temperature range." },
  { icon: Boxes, title: "Batch", copy: "Manufactured and expiry dates, quantity and storage assignment." },
  { icon: Warehouse, title: "Storage unit", copy: "Cold room, freezer or fridge with its own validated envelope." },
  { icon: Radio, title: "Sensor", copy: "Registered device, hashed credential, assignment history." },
  { icon: Activity, title: "Telemetry", copy: "UTC readings written atomically with sequence and provenance." },
  { icon: Siren, title: "Excursion", copy: "Server-side threshold evaluation creates evidence, not guesses." },
  { icon: ClipboardCheck, title: "Incident", copy: "Acknowledgement, investigation, resolution and audit trail." },
];

const CAPABILITIES = [
  {
    icon: Activity,
    title: "Telemetry with provenance",
    copy: "Every reading carries its source and a simulated flag. Seeded demo data is labelled everywhere it appears, and the ingest path never presents generated values as measured ones.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant isolation by construction",
    copy: "Organization scope is applied server-side on every query. Roles gate actions at the API; the interface only reflects what the server already allows.",
  },
  {
    icon: GitBranch,
    title: "One traceable thread",
    copy: "Move from a product to its batches, storage history, shipment legs, temperature evidence, excursions and the incident that closed the loop.",
  },
  {
    icon: Database,
    title: "Database, not decoration",
    copy: "MySQL 8 with InnoDB, normalized constraints, views, triggers and stored procedures. The database lab exposes real plans and rollback behaviour.",
  },
];

const SECURITY = [
  { icon: KeyRound, title: "Argon2id credentials", copy: "Passwords are hashed with Argon2id. Device keys are stored hashed and can be rotated or revoked." },
  { icon: LockKeyhole, title: "Rotating sessions", copy: "Short-lived access tokens, httpOnly refresh cookies, rotation with family revocation and CSRF checks." },
  { icon: ShieldCheck, title: "Server-enforced RBAC", copy: "Six roles map to explicit permissions. Cross-organization reads are rejected, not hidden in the client." },
  { icon: ClipboardCheck, title: "Append-only audit", copy: "Authentication, membership, telemetry and incident actions are recorded with actor, request ID and IP." },
];

const DEMO = {
  email: "owner@northline.demo",
  password: "Frostguard#2026",
  organizationSlug: "northline",
};

export default function LandingPage() {
  const { status } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const consoleHref = status === "authenticated" ? "/app" : "/login";
  const consoleLabel = status === "authenticated" ? "Open console" : "Enter console";

  return (
    <div className="min-h-screen bg-abyss">
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-abyss/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="FROSTGUARD home">
            <span className="flex size-9 items-center justify-center rounded-xl border border-cyan/30 bg-cyan/10">
              <Snowflake className="size-5 text-cyan" aria-hidden />
            </span>
            <span className="leading-none">
              <span className="block text-sm font-semibold tracking-[0.18em] text-ice">FROSTGUARD</span>
              <span className="mt-1 block text-[9px] uppercase tracking-[0.22em] text-mist">Cold-chain intelligence</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-xs text-mist md:flex" aria-label="Primary">
            <a href="#platform" className="transition-colors hover:text-ice">Platform</a>
            <a href="#traceability" className="transition-colors hover:text-ice">Traceability</a>
            <a href="#security" className="transition-colors hover:text-ice">Security</a>
            <a href="#evidence" className="transition-colors hover:text-ice">Database</a>
          </nav>

          <div className="flex items-center gap-2">
            {status !== "authenticated" ? (
              <Link to="/login" className="hidden text-xs text-mist transition-colors hover:text-ice sm:block">Sign in</Link>
            ) : null}
            <Link to={consoleHref}>
              <Button size="sm">{consoleLabel}<ArrowRight className="size-3.5" aria-hidden /></Button>
            </Link>
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-xl border border-line/70 text-mist transition-colors hover:border-cyan/40 hover:text-ice focus-visible:outline-offset-4 md:hidden"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-primary-navigation"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
            </button>
          </div>
        </div>
        <nav
          id="mobile-primary-navigation"
          hidden={!mobileMenuOpen}
          className="border-t border-line/60 bg-abyss/95 px-5 py-3 backdrop-blur-xl md:hidden"
          aria-label="Mobile primary"
        >
          <ul className="mx-auto grid max-w-7xl gap-1 sm:grid-cols-2">
            {[
              ["Platform", "#platform"],
              ["Traceability", "#traceability"],
              ["Security", "#security"],
              ["Database", "#evidence"],
            ].map(([label, href]) => (
              <li key={href}>
                <a
                  href={href}
                  className="block rounded-lg px-3 py-3 text-sm text-mist transition-colors hover:bg-white/5 hover:text-ice focus-visible:text-ice"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative isolate overflow-hidden pt-16">
          <img
            src="/illustrations/cold-room.svg"
            alt="Stainless-steel racks inside a temperature-controlled cold storage room"
            className="absolute inset-0 -z-20 size-full object-cover"
            fetchPriority="high"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-abyss/80 via-abyss/92 to-abyss" aria-hidden />
          <div className="absolute inset-0 -z-10 aurora opacity-90" aria-hidden />
          <div className="absolute inset-0 -z-10 grid-field opacity-30" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 top-16 -z-10 h-px overflow-hidden" aria-hidden>
            <span className="animate-sweep block h-px w-1/3 bg-gradient-to-r from-transparent via-cyan/70 to-transparent" />
          </div>

          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-28 lg:pt-28">
            <div className="animate-rise">
              <p className="eyebrow">Cold-chain intelligence · traceability · response</p>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-ice sm:text-5xl xl:text-6xl">
                Every degree.
                <br />
                Every handoff.
                <br />
                <span className="text-gradient">Accounted for.</span>
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-relaxed text-mist sm:text-base">
                FROSTGUARD unifies product master data, batch traceability, storage conditions and in-transit
                telemetry into a single operational record — then turns deviations into alerts, incidents and
                audit evidence.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to={consoleHref}>
                  <Button size="lg">{consoleLabel}<ArrowRight className="size-4" aria-hidden /></Button>
                </Link>
                <a href="#traceability">
                  <Button variant="secondary" size="lg">See the chain<ArrowUpRight className="size-4" aria-hidden /></Button>
                </a>
              </div>

              <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-mist">
                {["MySQL 8 · InnoDB", "Socket.IO after commit", "RBAC + tenant isolation", "UTC timestamps"].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check className="size-3.5 text-teal" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="animate-rise lg:justify-self-end" style={{ animationDelay: "140ms" }}>
              <div className="panel relative w-full max-w-md p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-mist">Reference data path</p>
                    <p className="mt-1 text-sm font-semibold text-ice">Commit, then broadcast</p>
                  </div>
                  <Badge tone="info"><Activity className="size-3" aria-hidden /> Event-driven</Badge>
                </div>

                <ol className="mt-5 space-y-3 text-xs">
                  {[
                    { label: "Sensor reading received", detail: "Device credential verified · tenant resolved", icon: Radio },
                    { label: "MySQL transaction commits", detail: "Reading, excursion evaluation and outbox row", icon: Database },
                    { label: "Outbox worker publishes", detail: "Socket.IO topics only after the commit", icon: Layers },
                    { label: "Console updates", detail: "Dashboard, alerts and incident queue", icon: Activity },
                  ].map((step, index) => (
                    <li key={step.label} className="flex gap-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-cyan/25 bg-cyan/10 text-cyan">
                        <step.icon className="size-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 border-b border-line/40 pb-3 last:border-0 last:pb-0">
                        <p className="font-medium text-ice">{step.label}</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-mist">{step.detail}</p>
                      </div>
                      <span className="stat-value text-[10px] text-mist/60">0{index + 1}</span>
                    </li>
                  ))}
                </ol>

                <p className="mt-4 border-t border-line/40 pt-3 text-[10px] leading-relaxed text-mist">
                  Architecture summary — not live telemetry. The dashboard itself is populated from committed MySQL rows.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Audience strip */}
        <section className="border-y border-white/5 bg-deep/60">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between lg:px-8">
            <p className="text-[10px] uppercase tracking-[0.22em] text-mist">Designed for regulated cold chains</p>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ice/80">
              <li>Biologics &amp; vaccines</li>
              <li className="hidden text-line sm:block" aria-hidden>|</li>
              <li>Clinical trial material</li>
              <li className="hidden text-line sm:block" aria-hidden>|</li>
              <li>Pharmaceutical distribution</li>
              <li className="hidden text-line sm:block" aria-hidden>|</li>
              <li>Temperature-sensitive food</li>
            </ul>
          </div>
        </section>

        {/* Traceability flow */}
        <section id="traceability" className="scroll-mt-24">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <p className="eyebrow">The chain of custody</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ice sm:text-4xl">
                One thread from product intake to incident resolution.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-mist">
                Each stage is a real record in MySQL with enforced relationships. Nothing in this chain is a static
                mock-up: the same rows feed the dashboard, the alert queue and the traceability page.
              </p>
            </div>

            <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE.map((step, index) => (
                <li key={step.title} className="panel panel-interactive group relative p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-xl border border-cyan/25 bg-cyan/10 text-cyan">
                      <step.icon className="size-4" aria-hidden />
                    </span>
                    <span className="stat-value text-[10px] text-mist/60">0{index + 1}</span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-ice">{step.title}</h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-mist">{step.copy}</p>
                  {index < PIPELINE.length - 1 ? (
                    <span className="absolute -right-1.5 top-9 hidden size-3 text-cyan/50 lg:block" aria-hidden>
                      <ArrowRight className="size-3" />
                    </span>
                  ) : null}
                </li>
              ))}
              <li className="panel relative overflow-hidden p-5">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan/10 via-transparent to-teal/10" aria-hidden />
                <div className="relative">
                  <Badge tone="success"><ShieldCheck className="size-3" aria-hidden /> Closed loop</Badge>
                  <h3 className="mt-4 text-sm font-semibold text-ice">Evidence retained</h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-mist">
                    Resolution requires an outcome and notes, then closes the linked alert and excursion in the same
                    transaction.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* Platform */}
        <section id="platform" className="scroll-mt-24 border-y border-white/5 bg-deep/40">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div className="relative">
                <div className="overflow-hidden rounded-3xl border border-line/70">
                  <img
                    src="/illustrations/control-system.svg"
                    alt="Operators monitoring process control screens in an industrial control room"
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-t from-abyss/80 via-transparent to-transparent" aria-hidden />
                </div>
                <div className="panel absolute -bottom-6 left-5 right-5 p-4 sm:left-8 sm:right-auto sm:max-w-xs">
                  <p className="flex items-center gap-2 text-xs font-medium text-ice">
                    <span className="size-2 animate-pulse-slow rounded-full bg-teal" aria-hidden />
                    Exception-first operations
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-mist">
                    Alerts are raised after the producing transaction commits, so the queue never leads the database.
                  </p>
                </div>
              </div>

              <div>
                <p className="eyebrow">The platform</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ice sm:text-4xl">
                  Built for the shift that has to answer for the deviation.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-mist">
                  FROSTGUARD is an operational console, not a reporting façade. It is designed around the questions
                  asked during an audit: what was the product, where was it stored, which sensor saw what, and who
                  decided what happened next.
                </p>

                <ul className="mt-8 space-y-5">
                  {CAPABILITIES.map((item) => (
                    <li key={item.title} className="flex gap-3.5">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-teal/25 bg-teal/10 text-teal">
                        <item.icon className="size-4" aria-hidden />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-ice">{item.title}</h3>
                        <p className="mt-1 text-[11px] leading-relaxed text-mist">{item.copy}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* In transit */}
        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="eyebrow">In transit</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ice sm:text-4xl">
                The cold chain does not stop at the loading dock.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-mist">
                Shipments carry their own sensors, checkpoints and risk score. Route maps plot committed coordinates
                from shipment events — there is no interpolated position pretending to be a live GPS fix.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Truck, title: "Dispatch to delivery", copy: "Status transitions are server-enforced and audited." },
                  { icon: Thermometer, title: "Transport envelope", copy: "Excursions can be attached to a shipment, not just a room." },
                  { icon: Siren, title: "Risk with reasons", copy: "Scores expose the contributing conditions instead of a bare number." },
                  { icon: ClipboardCheck, title: "Checkpoint evidence", copy: "Events record who reported what, where and when." },
                ].map((item) => (
                  <div key={item.title} className="panel-soft p-4">
                    <item.icon className="size-4 text-cyan" aria-hidden />
                    <p className="mt-2.5 text-xs font-medium text-ice">{item.title}</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-mist">{item.copy}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-line/70">
              <img
                src="/illustrations/reefer-route.svg"
                alt="Refrigerated trailer truck used for temperature-controlled transport"
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-abyss via-abyss/20 to-transparent" aria-hidden />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <Badge tone="violet">Provenance visible</Badge>
                <p className="mt-2 max-w-sm text-xs leading-relaxed text-ice/90">
                  Simulated telemetry is labelled as simulated. Measured telemetry keeps its source. The interface
                  does not blur the two.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="scroll-mt-24 border-y border-white/5 bg-deep/40">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <p className="eyebrow">Security posture</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ice sm:text-4xl">
                  Authorization belongs on the server.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-mist">
                  The interface reflects permissions; it does not create them. Every protected route re-checks the
                  session, the role and the organization scope before touching data.
                </p>
              </div>
              <Badge tone="success"><LockKeyhole className="size-3" aria-hidden /> Defense in depth</Badge>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SECURITY.map((item) => (
                <div key={item.title} className="panel panel-interactive p-5">
                  <span className="flex size-9 items-center justify-center rounded-xl border border-teal/25 bg-teal/10 text-teal">
                    <item.icon className="size-4" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-ice">{item.title}</h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-mist">{item.copy}</p>
                </div>
              ))}
            </div>

            <p className="mt-6 text-[10px] leading-relaxed text-mist/70">
              Implemented controls are documented in <span className="font-mono text-mist">docs/SECURITY.md</span> with
              code references. This build has not undergone an external penetration test.
            </p>
          </div>
        </section>

        {/* Database evidence */}
        <section id="evidence" className="scroll-mt-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-28">
            <div>
              <p className="eyebrow">Database evidence</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ice sm:text-4xl">
                Ask the database what it actually did.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-mist">
                The database lab is connected to the live schema. It lists the real tables, views, triggers and
                routines, renders MySQL&apos;s own EXPLAIN output, and demonstrates transaction rollback with an explicit
                result — including whether the write was rolled back atomically.
              </p>

              <dl className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  { term: "Engine", detail: "InnoDB, MySQL 8" },
                  { term: "Timestamps", detail: "UTC across the schema" },
                  { term: "Delivery", detail: "Transactional outbox → Socket.IO" },
                  { term: "Auditing", detail: "Append-only, tenant-scoped" },
                ].map((item) => (
                  <div key={item.term} className="panel-soft p-4">
                    <dt className="text-[10px] uppercase tracking-wider text-mist">{item.term}</dt>
                    <dd className="mt-1 text-xs text-ice">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="panel overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-line/50 px-5 py-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-mist">
                  <span className="size-2 rounded-full bg-rose/70" aria-hidden />
                  <span className="size-2 rounded-full bg-amber/70" aria-hidden />
                  <span className="size-2 rounded-full bg-teal/70" aria-hidden />
                  <span className="ml-2">schema objects</span>
                </div>
                <Badge tone="neutral">read-only view</Badge>
              </div>
              <div className="space-y-3 p-5 font-mono text-[11px] leading-relaxed">
                <p className="text-mist"><span className="text-violet">view</span> v_active_excursions</p>
                <p className="text-mist"><span className="text-violet">view</span> v_shipment_risk</p>
                <p className="text-mist"><span className="text-violet">view</span> v_warehouse_performance</p>
                <p className="text-mist"><span className="text-violet">view</span> v_device_health</p>
                <p className="text-mist"><span className="text-violet">view</span> v_active_incidents</p>
                <p className="text-cyan"><span className="text-violet">procedure</span> sp_reserve_batch_stock</p>
                <p className="text-cyan"><span className="text-violet">procedure</span> sp_incident_summary</p>
                <p className="text-teal"><span className="text-violet">trigger</span> batch stock guards · audit trail</p>
                <p className="mt-4 border-t border-line/40 pt-3 text-[10px] text-mist/60">
                  Names shown are the objects defined in database/sql and exposed by GET /dbms/*.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Demo CTA */}
        <section className="relative isolate overflow-hidden border-t border-white/5">
          <img
            src="/illustrations/traceability.svg"
            alt="Pharmaceutical production line with vials moving through a filling process"
            className="absolute inset-0 -z-20 size-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-abyss via-abyss/92 to-abyss/70" aria-hidden />
          <div className="absolute inset-0 -z-10 aurora opacity-60" aria-hidden />

          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-8 lg:py-24">
            <div>
              <p className="eyebrow">Demonstration environment</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ice sm:text-4xl">
                Walk the whole loop with a seeded tenant.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-mist">
                The demo organization is populated with warehouses, cold rooms, devices, batches, shipments and
                historical excursions. Seeded telemetry is simulated and explicitly labelled. Everything you create
                afterwards is written to MySQL through the real API.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/login">
                  <Button size="lg">Enter operations console<ArrowRight className="size-4" aria-hidden /></Button>
                </Link>
                <Link to="/login">
                  <Button variant="secondary" size="lg">Sign in with demo account</Button>
                </Link>
              </div>
            </div>

            <div className="panel p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ice">Demo credentials</p>
                <Badge tone="violet">Simulated data</Badge>
              </div>
              <dl className="mt-4 space-y-2 font-mono text-[11px]">
                <div className="flex items-center justify-between gap-4 border-b border-line/40 pb-2">
                  <dt className="text-mist">email</dt>
                  <dd className="truncate text-ice">{DEMO.email}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-line/40 pb-2">
                  <dt className="text-mist">password</dt>
                  <dd className="truncate text-ice">{DEMO.password}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-mist">organization</dt>
                  <dd className="truncate text-ice">{DEMO.organizationSlug}</dd>
                </div>
              </dl>
              <p className="mt-4 border-t border-line/40 pt-3 text-[10px] leading-relaxed text-mist">
                Roles available in the demo tenant include owner, manager, operator, auditor and viewer. Use the demo
                button on the sign-in page to fill the form.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-abyss">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg border border-cyan/25 bg-cyan/10">
                <Snowflake className="size-4 text-cyan" aria-hidden />
              </span>
              <span className="text-xs font-semibold tracking-[0.18em] text-ice">FROSTGUARD</span>
            </Link>
            <nav className="flex flex-wrap items-center gap-5 text-[11px] text-mist" aria-label="Footer">
              <a href="#platform" className="hover:text-ice">Platform</a>
              <a href="#security" className="hover:text-ice">Security</a>
              <a href="#evidence" className="hover:text-ice">Database</a>
              <Link to="/login" className="hover:text-ice">Sign in</Link>
            </nav>

          </div>

          <div className="flex flex-col gap-2 border-t border-white/5 pt-5 text-[10px] text-mist/60 sm:flex-row sm:items-center sm:justify-between">
            <p>FROSTGUARD cold-chain monitoring &amp; traceability. Private demonstration build.</p>
            <p>Authorized personnel only · activity is logged · not for clinical decision-making</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
