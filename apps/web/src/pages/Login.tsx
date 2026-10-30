import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Snowflake, TriangleAlert } from "lucide-react";
import { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Field, Input } from "@/components/ui";

const DEMO = {
  email: "owner@northline.demo",
  password: "Frostguard#2026",
  organizationSlug: "northline",
};

export default function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") return <Navigate to="/app" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email address and password.");
      return;
    }
    setSubmitting(true);
    try {
      await login({
        email: email.trim(),
        password,
        ...(organizationSlug.trim() ? { organizationSlug: organizationSlug.trim() } : {}),
      });
      navigate("/app", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function useDemo() {
    setEmail(DEMO.email);
    setPassword(DEMO.password);
    setOrganizationSlug(DEMO.organizationSlug);
    setError(null);
  }

  return (
    <div className="grid min-h-screen bg-abyss lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        <img
          src="/illustrations/login-coldchain.svg"
          alt="Pharmaceutical vials stored in a temperature-controlled laboratory"
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-abyss via-abyss/85 to-abyss/30" />
        <div className="absolute inset-0 aurora opacity-70" />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-cyan/30 bg-cyan/10">
              <Snowflake className="size-5 text-cyan" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-[0.18em] text-ice">FROSTGUARD</span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-[0.22em] text-mist">Cold-chain intelligence</span>
            </span>
          </Link>

          <div className="max-w-lg animate-rise">
            <p className="eyebrow">Operations console</p>
            <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-ice xl:text-4xl">
              Every degree, every movement, <span className="text-gradient">accounted for.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-mist">
              One thread from product intake to patient delivery: telemetry, excursions, incident command and
              traceability evidence, isolated per organization.
            </p>
            <ul className="mt-8 grid gap-3 text-xs text-mist">
              {[
                "Argon2id credentials with rotating refresh tokens",
                "Server-enforced RBAC and tenant isolation",
                "Append-only audit evidence for every action",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <ShieldCheck className="size-4 shrink-0 text-teal" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[10px] uppercase tracking-[0.2em] text-mist/60">
            Authorized personnel only · activity is logged
          </p>
        </div>
      </aside>

      <main className="relative flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="absolute inset-0 grid-field opacity-40 lg:hidden" aria-hidden />
        <div className="relative w-full max-w-md animate-rise">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl border border-cyan/30 bg-cyan/10">
                <Snowflake className="size-5 text-cyan" aria-hidden />
              </span>
              <span className="text-sm font-semibold tracking-[0.18em] text-ice">FROSTGUARD</span>
            </Link>
            <Link to="/" className="text-xs text-mist hover:text-ice">
              Back to site
            </Link>
          </div>

          <p className="eyebrow">Secure sign-in</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ice">Access the operations console</h2>
          <p className="mt-1.5 text-sm text-mist">
            Use your organization account. Sessions are bound to a single tenant.
          </p>

          <form className="mt-8 space-y-4" onSubmit={onSubmit} noValidate>
            <Field label="Work email" htmlFor="email" required>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mist/60" aria-hidden />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="password" required>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mist/60" aria-hidden />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  className="px-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-mist hover:bg-white/5 hover:text-ice"
                >
                  {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </div>
            </Field>

            <Field
              label="Organization slug"
              htmlFor="organizationSlug"
              hint="Optional when your email belongs to exactly one organization."
            >
              <Input
                id="organizationSlug"
                name="organizationSlug"
                autoComplete="organization"
                placeholder="northline"
                value={organizationSlug}
                onChange={(e) => setOrganizationSlug(e.target.value)}
              />
            </Field>

            {error ? (
              <div className="flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/10 p-3 text-xs text-rose" role="alert">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              Enter console
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>

          <div className="mt-6 rounded-2xl border border-line/70 bg-surface/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-ice">Demonstration dataset</p>
                <p className="mt-0.5 text-[11px] text-mist">
                  Seeded Northline Biologics owner account. Simulated telemetry is labelled.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={useDemo}>
                Use demo
              </Button>
            </div>
            <dl className="mt-3 grid gap-1 font-mono text-[10px] text-mist/80">
              <div className="flex justify-between gap-4">
                <dt>email</dt>
                <dd className="truncate text-ice/80">{DEMO.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>password</dt>
                <dd className="truncate text-ice/80">{DEMO.password}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>org</dt>
                <dd className="truncate text-ice/80">{DEMO.organizationSlug}</dd>
              </div>
            </dl>
          </div>

          <p className="mt-6 text-center text-[10px] text-mist/60">
            Protected by rate limiting, CSRF checks and audit logging.{" "}
            <Link to="/" className="text-mist underline-offset-2 hover:text-ice hover:underline">
              Return to overview
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
