import { Fragment, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { latLngBounds, type LatLngExpression } from "leaflet";
import type { ShipmentMapPoint } from "@/lib/types";
import { cn } from "@/lib/cn";

// Standard OSM raster tiles are the no-key development default. They are a
// best-effort service; do not prefetch and follow the published tile policy.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type MapCoordinate = { lat: number; lng: number };

function valid(point: MapCoordinate | null | undefined): point is MapCoordinate {
  return Boolean(point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180);
}

function FitPoints({ points, fitKey }: { points: LatLngExpression[]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = latLngBounds(points);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [34, 34], maxZoom: 9, animate: false });
  }, [map, fitKey, points]);
  return null;
}

function BaseMap({ children, center, zoom, height, className, label }: {
  children: React.ReactNode; center: LatLngExpression; zoom: number; height: number; className?: string; label: string;
}) {
  const [tileUnavailable, setTileUnavailable] = useState(false);
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-line/70 bg-deep", className)} style={{ height }} role="region" aria-label={label}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false} className="size-full" attributionControl style={{ height: "100%", width: "100%" }}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} eventHandlers={{ loading: () => setTileUnavailable(false), tileerror: () => setTileUnavailable(true) }} />
        {children}
      </MapContainer>
      {tileUnavailable ? <div role="status" aria-live="polite" className="pointer-events-none absolute left-14 right-3 top-3 z-[1000] rounded-lg border border-amber/40 bg-abyss/95 px-3 py-2 text-xs text-amber shadow-lg">Basemap tiles are unavailable. Shipment coordinates remain visible without geographic context.</div> : null}
    </div>
  );
}

export function RouteMap({ origin, destination, current, height = 320, className }: {
  origin: MapCoordinate | null; destination: MapCoordinate | null; current?: MapCoordinate | null; height?: number; className?: string;
}) {
  const points = useMemo(() => [origin, destination, current].filter(valid), [origin, destination, current]);
  const fitKey = points.map((point) => `${point.lat},${point.lng}`).join("|");
  const fitPoints = useMemo(() => points.map((point) => [point.lat, point.lng] as LatLngExpression), [points]);
  const center: LatLngExpression = points[0] ? [points[0].lat, points[0].lng] : [20.5937, 78.9629];
  return (
    <BaseMap center={center} zoom={points.length > 1 ? 5 : 6} height={height} className={className} label="Shipment route map">
      <FitPoints points={fitPoints} fitKey={fitKey} />
      {valid(origin) && valid(destination) ? <Polyline positions={[[origin.lat, origin.lng], [destination.lat, destination.lng]]} pathOptions={{ color: "#35c6f4", weight: 2, opacity: 0.68, dashArray: "6 7" }} /> : null}
      {valid(origin) ? <CircleMarker center={[origin.lat, origin.lng]} radius={7} pathOptions={{ color: "#07111f", fillColor: "#27d3b0", fillOpacity: 0.95, weight: 2 }}><Tooltip direction="top">Origin warehouse</Tooltip></CircleMarker> : null}
      {valid(destination) ? <CircleMarker center={[destination.lat, destination.lng]} radius={7} pathOptions={{ color: "#07111f", fillColor: "#a78bfa", fillOpacity: 0.95, weight: 2 }}><Tooltip direction="top">Destination</Tooltip></CircleMarker> : null}
      {valid(current) ? <CircleMarker center={[current.lat, current.lng]} radius={9} pathOptions={{ color: "#07111f", fillColor: "#35c6f4", fillOpacity: 1, weight: 3 }}><Tooltip direction="top" offset={[0, -10]} permanent>Last reported position</Tooltip></CircleMarker> : null}
    </BaseMap>
  );
}

export function FleetMapCanvas({ shipments, selectedId, focusKey, onSelect, height = 460, className }: {
  shipments: ShipmentMapPoint[]; selectedId?: string | null; focusKey?: string; onSelect?: (shipment: ShipmentMapPoint) => void; height?: number; className?: string;
}) {
  const allPoints = useMemo(() => shipments.flatMap((shipment) => [shipment.origin, shipment.destination, shipment.current].filter(valid)), [shipments]);
  const selected = shipments.find((shipment) => shipment.id === selectedId);
  const selectedPoints = useMemo(() => selected ? [selected.origin, selected.destination, selected.current].filter(valid) : [], [selected]);
  const focusedPoints = useMemo(() => focusKey && selected ? selectedPoints : allPoints, [focusKey, selected, selectedPoints, allPoints]);
  const fitKey = `${focusKey ?? "all"}:${focusedPoints.map((point) => `${point.lat},${point.lng}`).join("|")}`;
  const fitPositions = useMemo(() => focusedPoints.map((point) => [point.lat, point.lng] as LatLngExpression), [focusedPoints]);
  const center: LatLngExpression = focusedPoints[0] ? [focusedPoints[0].lat, focusedPoints[0].lng] : [20.5937, 78.9629];
  return (
    <BaseMap center={center} zoom={5} height={height} className={className} label="Fleet map. Direct geographic connections, not road routes.">
      <FitPoints points={fitPositions} fitKey={fitKey} />
      {shipments.map((shipment) => {
        if (!valid(shipment.origin) || !valid(shipment.destination)) return null;
        const selectedRoute = shipment.id === selectedId;
        const color = shipment.openExcursions.some((excursion) => excursion.severity === "CRITICAL") ? "#ff647c" : shipment.openExcursions.length ? "#f5b942" : "#27d3b0";
        return <Polyline key={`route-${shipment.id}`} positions={[[shipment.origin.lat, shipment.origin.lng], [shipment.destination.lat, shipment.destination.lng]]} pathOptions={{ color: selectedRoute ? "#35c6f4" : color, weight: selectedRoute ? 3.5 : 1.5, opacity: selectedRoute ? 0.96 : 0.48, dashArray: "5 6" }} eventHandlers={onSelect ? { click: () => onSelect(shipment) } : undefined} />;
      })}
      {shipments.map((shipment) => {
        if (!valid(shipment.origin) || !valid(shipment.destination)) return null;
        const handlers = onSelect ? { click: () => onSelect(shipment) } : undefined;
        return <Fragment key={`endpoints-${shipment.id}`}>
          <CircleMarker center={[shipment.origin.lat, shipment.origin.lng]} radius={5} pathOptions={{ color: "#07111f", fillColor: "#27d3b0", fillOpacity: 0.95, weight: 2 }} eventHandlers={handlers}><Tooltip direction="top">Origin · {shipment.originName}</Tooltip></CircleMarker>
          <CircleMarker center={[shipment.destination.lat, shipment.destination.lng]} radius={5} pathOptions={{ color: "#07111f", fillColor: "#a78bfa", fillOpacity: 0.95, weight: 2 }} eventHandlers={handlers}><Tooltip direction="top">Destination · {shipment.destinationName}</Tooltip></CircleMarker>
        </Fragment>;
      })}
      {shipments.map((shipment) => {
        if (!valid(shipment.current)) return null;
        const selectedMarker = shipment.id === selectedId;
        const markerColor = shipment.openExcursions.some((excursion) => excursion.severity === "CRITICAL") ? "#ff647c" : shipment.openExcursions.length ? "#f5b942" : "#35c6f4";
        return (
          <CircleMarker key={`marker-${shipment.id}`} center={[shipment.current.lat, shipment.current.lng]} radius={selectedMarker ? 10 : 7} pathOptions={{ color: "#07111f", fillColor: markerColor, fillOpacity: 1, weight: selectedMarker ? 3 : 2 }} eventHandlers={onSelect ? { click: () => onSelect(shipment) } : undefined}>
            <Tooltip direction="top" offset={[0, -8]}>
              <span className="font-mono">{shipment.code}</span> · {shipment.destinationName}<br />
              {shipment.status} · risk {shipment.riskScore}<br />
              {shipment.positionSource === "SIMULATED" ? "Simulated position" : "Operator-reported position"}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </BaseMap>
  );
}
