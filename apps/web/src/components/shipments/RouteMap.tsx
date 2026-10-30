import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { latLngBounds, type LatLngExpression } from "leaflet";
import type { ShipmentMapPoint } from "@/lib/types";
import { cn } from "@/lib/cn";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type MapCoordinate = { lat: number; lng: number };

function valid(point: MapCoordinate | null | undefined): point is MapCoordinate {
  return Boolean(point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function FitPoints({ points, fitKey }: { points: LatLngExpression[]; fitKey: string }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    const bounds = latLngBounds(points);
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { padding: [34, 34], maxZoom: 9 });
  }, [map, fitKey, points]);

  return null;
}

function BaseMap({
  children,
  center,
  zoom,
  height,
  className,
  label,
}: {
  children: React.ReactNode;
  center: LatLngExpression;
  zoom: number;
  height: number;
  className?: string;
  label: string;
}) {
  return (
    <div
      className={cn("overflow-hidden rounded-2xl border border-line/70", className)}
      style={{ height }}
      role="region"
      aria-label={label}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        className="size-full"
        attributionControl
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        {children}
      </MapContainer>
    </div>
  );
}

export function RouteMap({
  origin,
  destination,
  current,
  height = 320,
  className,
}: {
  origin: MapCoordinate | null;
  destination: MapCoordinate | null;
  current?: MapCoordinate | null;
  height?: number;
  className?: string;
}) {
  const points = useMemo(
    () => [origin, destination, current].filter(valid),
    [origin, destination, current]
  );
  const fitKey = points.map((point) => `${point.lat},${point.lng}`).join("|");
  const center: LatLngExpression = points[0]
    ? [points[0].lat, points[0].lng]
    : [20.5937, 78.9629];

  return (
    <BaseMap center={center} zoom={points.length > 1 ? 5 : 6} height={height} className={className} label="Shipment route map">
      <FitPoints points={points.map((point) => [point.lat, point.lng])} fitKey={fitKey} />
      {valid(origin) && valid(destination) ? (
        <Polyline
          positions={[
            [origin.lat, origin.lng],
            [destination.lat, destination.lng],
          ]}
          pathOptions={{ color: "#38bdf8", weight: 2, opacity: 0.55, dashArray: "6 7" }}
        />
      ) : null}
      {valid(origin) ? (
        <CircleMarker center={[origin.lat, origin.lng]} radius={7} pathOptions={{ color: "#2dd4bf", fillColor: "#2dd4bf", fillOpacity: 0.9, weight: 2 }}>
          <Tooltip direction="top" offset={[0, -8]}>Origin warehouse</Tooltip>
        </CircleMarker>
      ) : null}
      {valid(destination) ? (
        <CircleMarker center={[destination.lat, destination.lng]} radius={7} pathOptions={{ color: "#a78bfa", fillColor: "#a78bfa", fillOpacity: 0.9, weight: 2 }}>
          <Tooltip direction="top" offset={[0, -8]}>Destination</Tooltip>
        </CircleMarker>
      ) : null}
      {valid(current) ? (
        <CircleMarker center={[current.lat, current.lng]} radius={9} pathOptions={{ color: "#07111f", fillColor: "#38bdf8", fillOpacity: 1, weight: 3 }}>
          <Tooltip direction="top" offset={[0, -10]} permanent>Current position</Tooltip>
        </CircleMarker>
      ) : null}
    </BaseMap>
  );
}

export function FleetMapCanvas({
  shipments,
  selectedId,
  onSelect,
  height = 460,
  className,
}: {
  shipments: ShipmentMapPoint[];
  selectedId?: string | null;
  onSelect?: (shipment: ShipmentMapPoint) => void;
  height?: number;
  className?: string;
}) {
  const points = useMemo(() => {
    const list: MapCoordinate[] = [];
    for (const shipment of shipments) {
      if (valid(shipment.origin)) list.push(shipment.origin);
      if (valid(shipment.destination)) list.push(shipment.destination);
    }
    return list;
  }, [shipments]);
  const fitKey = points.map((point) => `${point.lat},${point.lng}`).join("|");
  const center: LatLngExpression = points[0] ? [points[0].lat, points[0].lng] : [20.5937, 78.9629];

  return (
    <BaseMap center={center} zoom={5} height={height} className={className} label="Live fleet overview map">
      <FitPoints points={points.map((point) => [point.lat, point.lng])} fitKey={fitKey} />
      {shipments.map((shipment) => {
        const selected = shipment.id === selectedId;
        const riskColor = shipment.openExcursions.some((excursion) => excursion.severity === "CRITICAL")
          ? "#fb7185"
          : shipment.openExcursions.length > 0
            ? "#fbbf24"
            : "#2dd4bf";
        return (
          <Polyline
            key={`route-${shipment.id}`}
            positions={[
              [shipment.origin.lat, shipment.origin.lng],
              [shipment.destination.lat, shipment.destination.lng],
            ]}
            pathOptions={{
              color: selected ? "#38bdf8" : riskColor,
              weight: selected ? 3 : 1.5,
              opacity: selected ? 0.9 : 0.4,
              dashArray: selected ? undefined : "5 6",
            }}
            eventHandlers={onSelect ? { click: () => onSelect(shipment) } : undefined}
          />
        );
      })}
      {shipments.map((shipment) => {
        const position = valid(shipment.current) ? shipment.current : shipment.origin;
        const selected = shipment.id === selectedId;
        return (
          <CircleMarker
            key={`marker-${shipment.id}`}
            center={[position.lat, position.lng]}
            radius={selected ? 10 : 7}
            pathOptions={{
              color: "#07111f",
              fillColor: shipment.openExcursions.length > 0 ? "#fb7185" : "#38bdf8",
              fillOpacity: 1,
              weight: selected ? 3 : 2,
            }}
            eventHandlers={onSelect ? { click: () => onSelect(shipment) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <span className="font-mono">{shipment.code}</span> · {shipment.destinationName}
              <br />
              {shipment.status} · {shipment.progressPercent}% · risk {shipment.riskScore}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </BaseMap>
  );
}
