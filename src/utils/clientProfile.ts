/**
 * Utility to parse, serialize, and validate client profile configurations
 * that are encoded as JSON strings in the 'email' column.
 */

export interface ClientPlanItem {
  id: string;
  clientName?: string;
  planType: string;
  package: string;
  siglas: string;
  tiempos: number;
}

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
  package?: string;
  plans?: ClientPlanItem[];
  [key: string]: any;
}

export const PLAN_OPTIONS = [
  'NINGUNO',
  'HEALTHY',
  'SLIM',
  'STRONG',
  'SLIM/HEALTHY',
] as const;

export interface SiglasOption {
  siglas: string;
  tiempos: number;
  package: string;
  label: string;
}

export const SIGLAS_OPTIONS: SiglasOption[] = [
  { siglas: 'C', tiempos: 1, package: 'Comida', label: 'C (1T · Comida)' },
  { siglas: 'C+C', tiempos: 2, package: 'Comida + Cena', label: 'C+C (2T · Comida + Cena)' },
  { siglas: 'D+C', tiempos: 2, package: 'Desayuno + Comida', label: 'D+C (2T · Desayuno + Comida)' },
  { siglas: 'D+C+C', tiempos: 3, package: 'Desayuno + Comida + Cena', label: 'D+C+C (3T · Desayuno + Comida + Cena)' },
  { siglas: 'De', tiempos: 1, package: 'Desayuno', label: 'De (1T · Desayuno)' },
  { siglas: 'Ce', tiempos: 1, package: 'Cena', label: 'Ce (1T · Cena)' },
  { siglas: 'D+Ce', tiempos: 2, package: 'Desayuno + Cena', label: 'D+Ce (2T · Desayuno + Cena)' },
];

/**
 * Normalizes any legacy or variant siglas string to the canonical form ('C', 'C+C', 'D+C', 'D+C+C', 'De', 'Ce', 'D+Ce').
 */
export function normalizeSiglas(rawSiglas: string | null | undefined): string {
  if (!rawSiglas) return 'C';
  const clean = rawSiglas.trim().toUpperCase().replace(/\s+/g, '');

  if (clean === 'D+C+C' || clean === 'D+C+CE' || clean === '3T' || clean === 'PC') return 'D+C+C';
  if (clean === 'C+C' || clean === 'C+CE' || clean === 'C-CE' || clean === 'C-C') return 'C+C';
  if (clean === 'D+C' || clean === 'D-C' || clean === 'DE+C') return 'D+C';
  if (clean === 'D+CE' || clean === 'D-CE' || clean === 'DE+CE') return 'D+Ce';
  if (clean === 'DE' || clean === 'D' || clean === 'DESAYUNO') return 'De';
  if (clean === 'CE' || clean === 'CENA') return 'Ce';
  if (clean === 'C' || clean === 'COMIDA') return 'C';

  // Check if matches any SIGLAS_OPTIONS case-insensitively
  const matched = SIGLAS_OPTIONS.find(o => o.siglas.toUpperCase() === clean);
  if (matched) return matched.siglas;

  return rawSiglas.trim() || 'C';
}

/**
 * Returns the full SiglasOption configuration (siglas, tiempos, package, label) for a given siglas or package name.
 */
export function getSiglasConfig(siglasOrPackage: string | null | undefined): SiglasOption {
  if (!siglasOrPackage) return SIGLAS_OPTIONS[0];

  const normalized = normalizeSiglas(siglasOrPackage);
  const bySiglas = SIGLAS_OPTIONS.find(o => o.siglas.toUpperCase() === normalized.toUpperCase());
  if (bySiglas) return bySiglas;

  const upperPkg = siglasOrPackage.trim().toUpperCase();
  if (upperPkg.includes('DESAYUNO') && upperPkg.includes('COMIDA') && upperPkg.includes('CENA')) {
    return SIGLAS_OPTIONS.find(o => o.siglas === 'D+C+C')!;
  }
  if ((upperPkg.includes('COMIDA') && upperPkg.includes('CENA')) || upperPkg === 'C+C') {
    return SIGLAS_OPTIONS.find(o => o.siglas === 'C+C')!;
  }
  if ((upperPkg.includes('DESAYUNO') && upperPkg.includes('COMIDA')) || upperPkg === 'D+C') {
    return SIGLAS_OPTIONS.find(o => o.siglas === 'D+C')!;
  }
  if (upperPkg.includes('DESAYUNO') && upperPkg.includes('CENA')) {
    return SIGLAS_OPTIONS.find(o => o.siglas === 'D+Ce')!;
  }
  if (upperPkg.includes('DESAYUNO')) {
    return SIGLAS_OPTIONS.find(o => o.siglas === 'De')!;
  }
  if (upperPkg.includes('CENA')) {
    return SIGLAS_OPTIONS.find(o => o.siglas === 'Ce')!;
  }

  return SIGLAS_OPTIONS[0];
}

/**
 * Splits a client row name by '&' when multiple clients live at the same address and share a spreadsheet row.
 */
export function splitClientNames(fullName: string | null | undefined): string[] {
  if (!fullName || !fullName.trim()) return [''];
  if (fullName.includes('&')) {
    const parts = fullName
      .split('&')
      .map(part => part.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts;
  }
  return [fullName.trim()];
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
    return { ...DEFAULT_PROFILE, plans: [] };
  }

  const cleanJson = emailJson.trim();
  if (cleanJson.startsWith('{') && cleanJson.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleanJson);
      return {
        ...DEFAULT_PROFILE,
        ...parsed,
        plans: Array.isArray(parsed.plans) ? parsed.plans : (parsed.plans ? [parsed.plans] : [])
      };
    } catch (e) {
      console.warn('[clientProfile] Error parsing serialized profile:', e);
    }
  }

  return { ...DEFAULT_PROFILE, plans: [] };
}

/**
 * Returns a normalized array of ClientPlanItem for a client record.
 * When the client name contains '&' (multiple clients at the same address),
 * ensures each person separated by '&' has their own independent plan and siglas entry.
 */
export function getNormalizedClientPlans(
  emailJson: string | null | undefined,
  clientName?: string | null
): ClientPlanItem[] {
  const profile = parseClientProfile(emailJson);
  const subNames = splitClientNames(clientName);

  // Split composite top-level strings (e.g. "HEALTHY + SLIM", "C + D+C") by spaced '+'
  const topPlans = (profile.planType !== undefined ? profile.planType : 'HEALTHY')
    .split(/\s+\+\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const topSiglas = (profile.siglas || 'C')
    .split(/\s+\+\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const rawPlans = Array.isArray(profile.plans) ? profile.plans : [];

  if (subNames.length > 1) {
    const result: ClientPlanItem[] = [];
    const totalCount = Math.max(subNames.length, rawPlans.length);

    for (let i = 0; i < totalCount; i++) {
      const existing = rawPlans[i];
      const personName = existing?.clientName || subNames[i] || subNames[subNames.length - 1];

      const fallbackPlanType =
        topPlans[i] ||
        topPlans[0] ||
        (profile.planType !== undefined && !profile.planType.includes(' + ') ? profile.planType : 'HEALTHY') ||
        'NINGUNO';

      const fallbackSiglas =
        topSiglas[i] ||
        topSiglas[0] ||
        (profile.siglas && !profile.siglas.includes(' + ') ? profile.siglas : 'C') ||
        'C';

      const rawPlanType = existing?.planType !== undefined ? existing.planType : fallbackPlanType;
      const rawSig = existing?.siglas || fallbackSiglas;
      const sigCfg = getSiglasConfig(rawSig);

      result.push({
        id: existing?.id || `plan-${i + 1}`,
        clientName: personName,
        planType: (rawPlanType || 'NINGUNO').trim().toUpperCase(),
        package: sigCfg.package,
        siglas: sigCfg.siglas,
        tiempos: sigCfg.tiempos
      });
    }

    return result;
  }

  // Single client name (no '&')
  if (rawPlans.length > 0) {
    return rawPlans.map((p, idx) => {
      const sigCfg = getSiglasConfig(p.siglas || p.package || profile.siglas || 'C');
      const resolvedPlanType =
        p.planType !== undefined && p.planType !== ''
          ? p.planType
          : profile.planType !== undefined && profile.planType !== ''
          ? profile.planType
          : 'NINGUNO';
      return {
        id: p.id || `plan-${idx + 1}`,
        clientName: p.clientName || subNames[0] || '',
        planType: resolvedPlanType.trim().toUpperCase(),
        package: sigCfg.package,
        siglas: sigCfg.siglas,
        tiempos: sigCfg.tiempos
      };
    });
  }

  const sigCfg = getSiglasConfig(profile.siglas || profile.package || 'C');
  const resolvedPlanType =
    profile.planType !== undefined && profile.planType !== ''
      ? profile.planType.trim().toUpperCase()
      : 'NINGUNO';

  return [
    {
      id: 'plan-1',
      clientName: subNames[0] || '',
      planType: resolvedPlanType,
      package: sigCfg.package,
      siglas: sigCfg.siglas,
      tiempos: sigCfg.tiempos
    }
  ];
}

/**
 * Serializes an updated list of plans (and optional extra profile fields) into the email JSON string,
 * keeping top-level summary fields (planType, siglas, package, tiempos, plansCount) in sync.
 */
export function serializeClientPlansProfile(
  currentEmailJson: string | null | undefined,
  plans: ClientPlanItem[],
  extraUpdates: Partial<ClientProfileConfig> = {}
): string {
  const currentConfig = parseClientProfile(currentEmailJson);
  const normalizedPlans = plans.map((p, idx) => {
    const sigCfg = getSiglasConfig(p.siglas || p.package || 'C');
    return {
      id: p.id || `plan-${idx + 1}`,
      clientName: p.clientName,
      planType: (p.planType || 'NINGUNO').trim().toUpperCase(),
      package: sigCfg.package,
      siglas: sigCfg.siglas,
      tiempos: sigCfg.tiempos
    };
  });

  const finalPlanType = normalizedPlans.map(p => p.planType || 'NINGUNO').join(' + ') || 'NINGUNO';
  const finalSiglas = normalizedPlans.map(p => p.siglas || 'C').join(' + ') || 'C';
  const finalPackage = normalizedPlans.map(p => p.package || 'Comida').join(' + ') || 'Comida';
  const totalPlansCount = normalizedPlans.length || 1;
  const sumTiempos = normalizedPlans.reduce((acc, p) => acc + (p.tiempos || 1), 0) || 1;

  const updatedConfig: ClientProfileConfig = {
    ...currentConfig,
    ...extraUpdates,
    planType: finalPlanType,
    plansCount: totalPlansCount,
    siglas: finalSiglas,
    package: finalPackage,
    tiempos: sumTiempos,
    plans: normalizedPlans
  };

  return JSON.stringify(updatedConfig);
}

/**
 * Safely merges a client's current profile with updates and returns the JSON string.
 */
export function serializeClientProfile(
  currentEmailJson: string | null | undefined,
  updates: Partial<ClientProfileConfig>
): string {
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
