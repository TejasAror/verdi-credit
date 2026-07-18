import { EvidenceSource, ProjectType } from '@prisma/client';

/**
 * Deterministic helpers shared by the Stage 3 mock algorithms.
 *
 * Everything is seeded so that a given (project, evidence) set always yields
 * the same numbers — re-runs are reproducible and unit tests are stable. When
 * the real models are integrated, these helpers are no longer used by the
 * algorithm bodies but the seeding approach (seed = hash of ids) is a good
 * pattern to keep for caching/audit.
 */

/** FNV-1a style string hash → unsigned 32-bit int. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic pseudo-random in [0, 1) from an integer seed.
 * Mulberry32 PRNG.
 */
export function seededRandom(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Base NDVI around which a vegetation project hovers (mock assumption). */
export function baseNdviForType(projectType: ProjectType): number {
  switch (projectType) {
    case ProjectType.REFORESTATION:
      return 0.55;
    case ProjectType.SOIL_CARBON:
      return 0.35;
    case ProjectType.RENEWABLE_ENERGY:
      return 0.2;
    default:
      return 0.4;
  }
}

/** Source weighting: satellite strongest, geo-upload weaker, weather a proxy. */
export function sourceWeight(source: EvidenceSource): number {
  switch (source) {
    case EvidenceSource.SENTINEL2:
    case EvidenceSource.LANDSAT:
    case EvidenceSource.NASA_EARTHDATA:
      return 1.0;
    case EvidenceSource.GEO_UPLOAD:
      return 0.7;
    case EvidenceSource.OPENWEATHER:
      return 0.3;
    default:
      return 0.5;
  }
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes the area of a GeoJSON Polygon (or coordinate array) in hectares.
 *
 * Uses a spherical-excess approximation via the shoelace formula on a local
 * equirectangular projection around the polygon centroid. Good enough for a
 * mock; a real implementation would use PostGIS ST_Area(geography).
 *
 * Returns 0 when the polygon cannot be parsed.
 */
export function polygonAreaHa(polygon: unknown): number {
  try {
    const coords = extractRing(polygon);
    if (!coords || coords.length < 3) return 0;

    // Centroid for local projection.
    let cx = 0;
    let cy = 0;
    for (const [lng, lat] of coords) {
      cx += lng;
      cy += lat;
    }
    cx /= coords.length;
    cy /= coords.length;

    const R = 6378137; // Earth radius (m)
    const rad = Math.PI / 180;
    const kx = (R * rad) * Math.cos(cy * rad); // m per degree lng at centroid
    const ky = R * rad; // m per degree lat

    // Shoelace in projected meters.
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const [lng1, lat1] = coords[i];
      const [lng2, lat2] = coords[(i + 1) % coords.length];
      const x1 = (lng1 - cx) * kx;
      const y1 = (lat1 - cy) * ky;
      const x2 = (lng2 - cx) * kx;
      const y2 = (lat2 - cy) * ky;
      area += x1 * y2 - x2 * y1;
    }
    const areaM2 = Math.abs(area) / 2;
    return areaM2 / 10_000; // m² → ha
  } catch {
    return 0;
  }
}

/** Extracts the outer ring [ [lng,lat], ... ] from a GeoJSON polygon-ish shape. */
function extractRing(polygon: unknown): [number, number][] | null {
  if (!polygon || typeof polygon !== 'object') return null;

  // GeoJSON Polygon: { type: 'Polygon', coordinates: [ [ [lng,lat], ... ], ... ] }
  const p = polygon as Record<string, unknown>;
  if (p.type === 'Polygon' && Array.isArray(p.coordinates) && Array.isArray(p.coordinates[0])) {
    return p.coordinates[0] as [number, number][];
  }
  // Bare coordinates array of [lng,lat] pairs.
  if (Array.isArray(polygon)) {
    const arr = polygon as unknown[];
    if (arr.length > 0 && Array.isArray(arr[0])) {
      return arr as [number, number][];
    }
  }
  return null;
}

/** Point-in-polygon test (ray casting) for anomaly detection. */
export function pointInPolygon(
  lng: number,
  lat: number,
  polygon: unknown,
): boolean {
  const ring = extractRing(polygon);
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
