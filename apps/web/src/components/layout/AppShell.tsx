import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  Database,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Package,
  Radio,
  ScrollText,
  Settings,
  ShieldCheck,
  Siren,
  Snowflake,
  Thermometer,
  TriangleAlert,
  Truck,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { PERMISSIONS } from "@frostguard/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { fmtNumber } from "@/lib/format";
import { useRealtimeBridge } from "@/lib/realtime";
import { Avatar, Badge, Button, IconButton } from "@/components/ui";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; permission?: string; end?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Command",
    items: [
      { to: "/app", label: "Overview", icon: LayoutDashboard, end: true, permission: PERMISSIONS.ANALYTICS_READ },
      { to: "/app/map", label: "Live fleet map", icon: Map, permission: PERMISSIONS.SHIPMENT_READ },
      { to: "/app/shipments", label: "Shipments", icon: Truck, permission: PERMISSIONS.SHIPMENT_READ },
      { to: "/app/incidents", label: "Incidents", icon: Siren, permission: PERMISSIONS.INCIDENT_READ },
      { to: "/app/alerts", label: "Alerts", icon: Bell, permission: PERMISSIONS.INCIDENT_READ },
    ],
  },
  {
    label: "Inventory",
    items: [
      { to: "/app/products", label: "Products", icon: Package, permission: PERMISSIONS.PRODUCT_READ },
      { to: "/app/batches", label: "Batches", icon: Boxes, permission: PERMISSIONS.BATCH_READ },
    ],
  },
  {
    label: "Facilities",
    items: [
      { to: "/app/warehouses", label: "Warehouses", icon: Warehouse, permission: PERMISSIONS.WAREHOUSE_READ },
      { to: "/app/storage-units", label: "Storage units", icon: Thermometer, permission: PERMISSIONS.WAREHOUSE_READ },
      { to: "/app/devices", label: "Devices", icon: Radio, permission: PERMISSIONS.DEVICE_READ },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/app/analytics", label: "Analytics", icon: BarChart3, permission: PERMISSIONS.ANALYTICS_READ },
      { to: "/app/audit", label: "Audit trail", icon: ScrollText, permission: PERMISSIONS.AUDIT_READ },
      { to: "/app/settings", label: "Members & settings", icon: Users, permission: PERMISSIONS.USER_READ },
      { to: "/app/dbms", label: "Database lab", icon: Database, permission: PERMISSIONS.ANALYTICS_READ },
    ],
  },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/app" className="flex items-center gap-2.5">
      <span className="relative flex size-9 items-center justify-center rounded-xl border border-cyan/30 bg-cyan/10">
        <Snowflake className="size-5 text-cyan" aria-hidden />
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/5" />
      </span>
      {!compact ? (
        <span className="leading-none">
          <span className="block text-sm font-semibold tracking-[0.16em] text-ice">FROSTGUARD</span>
          <span className="mt-1 block text-[10px] uppercase tracking-[0.2em] text-mist/80">Cold-chain intelligence</span>
        </span>
      ) : null}
    </Link>
  );
}

function RealtimeChip({ status }: { status: "connecting" | "connected" | "offline" }) {
  const config = {
    connected: { label: "Live", tone: "success" as const },
    connecting: { label: "Reconnecting", tone: "warning" as const },
    offline: { label: "Offline", tone: "danger" as const },
  }[status];
  return (
    <Badge tone={config.tone} dot className="hidden sm:inline-flex">
      {config.label}
    </Badge>
  );
}

export function AppShell() {
  const { user, logout, hasPermission } = useAuth();
  const realtime = useRealtimeBridge();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const openAlerts = useQuery({
    queryKey: ["alerts", "open-count"],
    queryFn: () => api.page("/alerts", { status: "OPEN", pageSize: 1 }),
    enabled: hasPermission(PERMISSIONS.INCIDENT_READ),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasPermission(item.permission)),
  })).filter((group) => group.items.length > 0);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo />
        <IconButton label="Close navigation" className="lg:hidden" onClick={() => setMobileOpen(false)}>
          <X className="size-4" aria-hidden />
        </IconButton>
      </div>
      <div className="hairline mx-5" />
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Main navigation">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-mist/50">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-colors",
                        isActive
                          ? "bg-cyan/10 text-ice shadow-[inset_0_0_0_1px_rgba(56,189,248,0.18)]"
                          : "text-mist hover:bg-white/[0.04] hover:text-ice"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className={cn("size-4", isActive ? "text-cyan" : "text-mist/70 group-hover:text-ice")} />
                        <span className="truncate">{item.label}</span>
                        {item.to === "/app/alerts" && (openAlerts.data?.total ?? 0) > 0 ? (
                          <span className="ml-auto rounded-full bg-rose/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose">
                            {openAlerts.data?.total}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-line/60 p-3">
        <div className="rounded-xl border border-line/70 bg-abyss/50 p-3">
          <div className="flex items-center gap-2 text-[11px] text-mist">
            <ShieldCheck className="size-3.5 text-teal" aria-hidden />
            Tenant isolation active
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-mist/70">
            Organization <span className="font-mono text-ice/80">{user?.organization.slug}</span>. Simulated telemetry is
            always labelled.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-abyss text-ice">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line/60 bg-deep/70 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-abyss/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-line bg-deep">{sidebar}</aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-line/60 bg-abyss/80 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <IconButton label="Open navigation" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="size-5" aria-hidden />
            </IconButton>
            <div className="hidden items-center gap-2 text-xs text-mist sm:flex">
              <Activity className="size-3.5 text-cyan" aria-hidden />
              <span className="font-mono">{fmtNumber(openAlerts.data?.total ?? 0)}</span> open alerts
            </div>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <RealtimeChip status={realtime} />
              <Link
                to="/app/alerts"
                aria-label="Open alerts"
                className="relative inline-flex size-9 items-center justify-center rounded-lg text-mist transition-colors hover:bg-white/5 hover:text-ice"
              >
                <Bell className="size-4" aria-hidden />
                {openAlerts.data && openAlerts.data.total > 0 ? (
                  <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-rose" aria-hidden />
                ) : null}
              </Link>
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="flex items-center gap-2 rounded-xl border border-line/70 bg-elevated/40 px-2 py-1.5 text-left transition-colors hover:border-cyan/30"
                >
                  <Avatar name={user?.fullName ?? "FROSTGUARD"} />
                  <span className="hidden min-w-0 sm:block">
                    <span className="block truncate text-xs font-semibold text-ice">{user?.fullName}</span>
                    <span className="block truncate text-[10px] capitalize text-mist">{user?.role}</span>
                  </span>
                  <ChevronDown className="size-3.5 text-mist" aria-hidden />
                </button>
                {menuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-12 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
                  >
                    <div className="border-b border-line/70 px-3 py-2.5">
                      <p className="truncate text-xs font-semibold text-ice">{user?.fullName}</p>
                      <p className="truncate text-[11px] text-mist">{user?.email}</p>
                      <p className="mt-1 truncate text-[10px] text-mist/70">{user?.organization.name}</p>
                    </div>
                    <div className="p-1">
                      <Link
                        to="/app/settings"
                        role="menuitem"
                        className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-mist hover:bg-white/5 hover:text-ice"
                      >
                        <Settings className="size-3.5" aria-hidden />
                        Members &amp; settings
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void logout().then(() => navigate("/login"))}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-mist hover:bg-rose/10 hover:text-rose"
                      >
                        <LogOut className="size-3.5" aria-hidden />
                        Sign out
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>

        <footer className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-2 border-t border-line/40 px-4 py-4 text-[10px] text-mist/60 sm:px-6 lg:px-8">
          <span>FROSTGUARD · cold-chain intelligence platform</span>
          <span className="flex items-center gap-1.5">
            <TriangleAlert className="size-3 text-amber" aria-hidden />
            Simulated readings are explicitly marked and never presented as sensor truth.
          </span>
        </footer>
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-abyss">
        <div className="flex items-center gap-3 text-sm text-mist">
          <span className="size-4 animate-spin rounded-full border-2 border-cyan/30 border-t-cyan" aria-hidden />
          Establishing secure session…
        </div>
      </div>
    );
  }
  if (status === "anonymous") {
    return <NavigateToLogin />;
  }
  return <>{children}</>;
}

function NavigateToLogin() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/login", { replace: true });
  }, [navigate]);
  return null;
}

export function PermissionGate({
  permission,
  children,
  fallback,
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) return <>{fallback ?? null}</>;
  return <>{children}</>;
}

export function AccessDenied() {
  return (
    <div className="panel mx-auto mt-16 max-w-lg p-8 text-center">
      <ShieldCheck className="mx-auto size-8 text-amber" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold text-ice">Permission required</h1>
      <p className="mt-1 text-sm text-mist">
        Your role does not include access to this area. Ask an administrator to adjust your membership.
      </p>
      <Button variant="secondary" className="mt-5" onClick={() => window.history.back()}>
        Go back
      </Button>
    </div>
  );
}
