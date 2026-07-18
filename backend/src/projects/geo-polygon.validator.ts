import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';

/**
 * Validates that a value is a GeoJSON Polygon (or at minimum a non-empty
 * coordinate object). Lenient for Stage 1: it ensures the field is a real
 * object/array with coordinates, while leaving strict spatial checks to the
 * GeoValidationService.
 */
@ValidatorConstraint({ name: 'isGeoPolygon', async: false })
export class IsGeoPolygonConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value !== 'object') return false;

    // Accept a GeoJSON Polygon: { type: 'Polygon', coordinates: [...] }
    const candidate = value as Record<string, unknown>;
    if (candidate.type === 'Polygon') {
      return Array.isArray(candidate.coordinates) && candidate.coordinates.length > 0;
    }

    // Also accept a bare coordinates array or coordinate object (lenient).
    return !this.isEmptyObject(candidate);
  }

  private isEmptyObject(obj: Record<string, unknown>): boolean {
    return Object.keys(obj).length === 0;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'geoPolygon must be a non-empty GeoJSON Polygon (e.g. { "type": "Polygon", "coordinates": [[[lng,lat],...]] }).';
  }
}

export function IsGeoPolygon() {
  return Validate(IsGeoPolygonConstraint);
}
