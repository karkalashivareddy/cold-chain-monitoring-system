import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PERMISSIONS } from "@frostguard/shared";
import { AppShell, AccessDenied, PermissionGate, RequireAuth } from "@/components/layout/AppShell";
import { PageSkeleton } from "@/components/ui";

const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Products = lazy(() => import("@/pages/Products"));
const Batches = lazy(() => import("@/pages/Batches"));
const BatchDetail = lazy(() => import("@/pages/BatchDetail"));
const Warehouses = lazy(() => import("@/pages/Warehouses"));
const StorageUnits = lazy(() => import("@/pages/StorageUnits"));
const Devices = lazy(() => import("@/pages/Devices"));
const Shipments = lazy(() => import("@/pages/Shipments"));
const ShipmentDetail = lazy(() => import("@/pages/ShipmentDetail"));
const FleetMap = lazy(() => import("@/pages/FleetMap"));
const Incidents = lazy(() => import("@/pages/Incidents"));
const IncidentDetail = lazy(() => import("@/pages/IncidentDetail"));
const Alerts = lazy(() => import("@/pages/Alerts"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Audit = lazy(() => import("@/pages/Audit"));
const Settings = lazy(() => import("@/pages/Settings"));
const Dbms = lazy(() => import("@/pages/Dbms"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function gate(permission: string, element: ReactNode) {
  return (
    <PermissionGate permission={permission} fallback={<AccessDenied />}>
      {element}
    </PermissionGate>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-abyss p-6 lg:p-10"><PageSkeleton /></div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={gate(PERMISSIONS.ANALYTICS_READ, <Dashboard />)} />
          <Route path="products" element={gate(PERMISSIONS.PRODUCT_READ, <Products />)} />
          <Route path="batches" element={gate(PERMISSIONS.BATCH_READ, <Batches />)} />
          <Route path="batches/:id" element={gate(PERMISSIONS.BATCH_READ, <BatchDetail />)} />
          <Route path="warehouses" element={gate(PERMISSIONS.WAREHOUSE_READ, <Warehouses />)} />
          <Route path="storage-units" element={gate(PERMISSIONS.WAREHOUSE_READ, <StorageUnits />)} />
          <Route path="devices" element={gate(PERMISSIONS.DEVICE_READ, <Devices />)} />
          <Route path="shipments" element={gate(PERMISSIONS.SHIPMENT_READ, <Shipments />)} />
          <Route path="shipments/:id" element={gate(PERMISSIONS.SHIPMENT_READ, <ShipmentDetail />)} />
          <Route path="map" element={gate(PERMISSIONS.SHIPMENT_READ, <FleetMap />)} />
          <Route path="incidents" element={gate(PERMISSIONS.INCIDENT_READ, <Incidents />)} />
          <Route path="incidents/:id" element={gate(PERMISSIONS.INCIDENT_READ, <IncidentDetail />)} />
          <Route path="alerts" element={gate(PERMISSIONS.INCIDENT_READ, <Alerts />)} />
          <Route path="analytics" element={gate(PERMISSIONS.ANALYTICS_READ, <Analytics />)} />
          <Route path="audit" element={gate(PERMISSIONS.AUDIT_READ, <Audit />)} />
          <Route path="settings" element={gate(PERMISSIONS.USER_READ, <Settings />)} />
          <Route path="dbms" element={gate(PERMISSIONS.ANALYTICS_READ, <Dbms />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export function RedirectToApp() {
  return <Navigate to="/app" replace />;
}
