/**
 * Utility to parse, serialize, and validate client profile configurations
 * that are temporarily encoded as JSON strings in the 'email' column.
 */

export interface ClientProfileConfig {
  planType: string;
  plansCount: number;
  exclusions: string;
  siglas: string;
  driver: string;
  isActive: boolean;
  extraDishes?: number;
  tiempos?: number;
  routeOrder?: number;
  plans?: Array<{
    id: string;
    planType: string;
    package: string;
    siglas: string;
    tiempos: number;
  }>;
  [key: string]: any;
}

const DEFAULT_PROFILE: ClientProfileConfig = {
  planType: 'HEALTHY',
  plansCount: 1,
  exclusions: 'Ninguna',
  siglas: 'C',
  driver: 'SIN ASIGNAR',
  isActive: true,
  extraDishes: 0,
  tiempos: 1,
  routeOrder: 9999,
  plans: []
};

/**
 * Safely parses the JSON string inside a client's email field.
 * Returns a fallback default configuration if parsing fails.
 */
export function parseClientProfile(emailJson: string | null | undefined): ClientProfileConfig {
  if (!emailJson || !emailJson.trim()) {
    return { ...DEFAULT_PROFILE };
  }

  const cleanJson = emailJson.trim();
  if (cleanJson.startsWith('{') && cleanJson.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleanJson);
      return {
        ...DEFAULT_PROFILE,
        ...parsed,
        // Ensure arrays and primitive fields are typed correctly
        plans: Array.isArray(parsed.plans) ? parsed.plans : (parsed.plans ? [parsed.plans] : [])
      };
    } catch (e) {
      console.warn('[clientProfile] Error parsing serialized profile:', e);
    }
  }

  // If the email field is NOT a JSON string but a normal email address, return defaults
  return { ...DEFAULT_PROFILE };
}

/**
 * Safely merges a client's current profile with updates and returns the JSON string.
 */
export function serializeClientProfile(currentEmailJson: string | null | undefined, updates: Partial<ClientProfileConfig>): string {
  const currentConfig = parseClientProfile(currentEmailJson);
  const updatedConfig = {
    ...currentConfig,
    ...updates
  };
  return JSON.stringify(updatedConfig);
}

/**
 * Validates a coordinate string (e.g. "25.6866,-100.3161") and returns lat/lng numbers.
 * Returns default zeros if invalid.
 */
export function parseCoordinates(coordsStr: string | null | undefined): { lat: number; lng: number } {
  if (!coordsStr) return { lat: 0, lng: 0 };
  
  const parts = coordsStr.split(',').map(p => p.trim());
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }
  return { lat: 0, lng: 0 };
}
