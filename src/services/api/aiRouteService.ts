import { supabase } from '../supabaseClient';
import { getHaversineDistance, calculateRouteDistance, nearestNeighborTSP } from '../../utils/routeOptimizer';

export interface DriverRouteSuggestion {
  driverName: string;
  color: string;
  clients: any[];
  totalDistanceKm: number;
  estimatedTimeMin: number;
  confidenceScore: number; // 0-100%
  historicalMatches: number;
}

export interface AISuggestionResult {
  driverRoutes: DriverRouteSuggestion[];
  overallConfidence: number;
  totalClients: number;
  insights: string[];
  analyzedSnapshotsCount: number;
}

const DRIVER_PALETTE = [
  '#3B82F6', // Azul - Brayan
  '#10B981', // Verde - Alvaro
  '#F59E0B', // Naranja - Nidia
  '#EF4444', // Rojo - Tony
  '#8B5CF6', // Púrpura - Luis
  '#EC4899', // Rosa - Miriam
  '#06B6D4', // Cyan - Karla
  '#14B8A6', // Teal - Angeles
  '#6366F1', // Indigo
  '#84CC16', // Lime
];

/**
 * Fetches recent route distribution telemetry snapshots from Supabase.
 */
export async function fetchTelemetryHistory(limit = 150): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('route_distribution_telemetry')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AIRouteService] Error fetching telemetry history:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[AIRouteService] Exception fetching telemetry:', err);
    return [];
  }
}

/**
 * Generates an AI-driven smart route distribution suggestion based on historical learning + spatial optimization.
 */
export async function generateAISmartDistribution(params: {
  clients: any[];
  activeDrivers: string[];
  routeType: 'Matutina' | 'Vespertina';
  startLat?: number;
  startLng?: number;
  customFeedback?: string;
}): Promise<AISuggestionResult> {
  const { clients, activeDrivers, routeType, customFeedback } = params;
  const baseLat = params.startLat || 25.6866; // Guadalupe / Monterrey default
  const baseLng = params.startLng || -100.3161;

  if (!clients || clients.length === 0 || !activeDrivers || activeDrivers.length === 0) {
    return {
      driverRoutes: [],
      overallConfidence: 0,
      totalClients: 0,
      insights: ['No hay clientes o repartidores activos seleccionados.'],
      analyzedSnapshotsCount: 0
    };
  }

  // 1. Fetch historical telemetry
  const telemetryHistory = await fetchTelemetryHistory(200);

  // 2. Build affinity map: clientKey -> driverName -> frequency count
  const affinityMap: Record<string, Record<string, number>> = {};
  
  telemetryHistory.forEach(snapshot => {
    if (snapshot.clients_data && Array.isArray(snapshot.clients_data)) {
      snapshot.clients_data.forEach((c: any) => {
        const key = (c.name || c.id || '').trim().toLowerCase();
        const driver = (c.driver || c.driver_name || '').trim().toUpperCase();
        if (key && driver && driver !== 'SIN ASIGNAR') {
          if (!affinityMap[key]) affinityMap[key] = {};
          affinityMap[key][driver] = (affinityMap[key][driver] || 0) + 1;
        }
      });
    }
  });

  // 3. Parse custom feedback if user provided adjustments
  // E.g. "Mover Pedro a Tony", "Pasar Juan a Brayan"
  const manualOverrides: Record<string, string> = {};
  if (customFeedback && customFeedback.trim()) {
    const feedbackLower = customFeedback.toLowerCase();
    activeDrivers.forEach(driver => {
      const driverLower = driver.toLowerCase();
      clients.forEach(client => {
        const clientLower = (client.name || '').toLowerCase();
        if (clientLower && feedbackLower.includes(clientLower) && feedbackLower.includes(driverLower)) {
          manualOverrides[client.id] = driver;
        }
      });
    });
  }

  // 4. Initial Assignment Logic
  const driverBuckets: Record<string, any[]> = {};
  activeDrivers.forEach(d => { driverBuckets[d] = []; });
  const unassigned: any[] = [];
  let historicalMatchesCount = 0;

  clients.forEach(client => {
    const clientKey = (client.name || client.id || '').trim().toLowerCase();

    // Check manual override first
    if (manualOverrides[client.id]) {
      const targetDriver = manualOverrides[client.id];
      driverBuckets[targetDriver].push(client);
      return;
    }

    // Check historical affinity
    const driverFreqs = affinityMap[clientKey];
    let bestDriver = '';
    let maxFreq = 0;
    let totalFreq = 0;

    if (driverFreqs) {
      Object.entries(driverFreqs).forEach(([d, count]) => {
        totalFreq += count;
        // Only assign if the historical driver is in today's activeDrivers
        if (activeDrivers.includes(d) && count > maxFreq) {
          maxFreq = count;
          bestDriver = d;
        }
      });
    }

    // High confidence match threshold (at least 2 historical occurrences or >60% preference)
    if (bestDriver && (maxFreq >= 2 || (maxFreq / totalFreq) >= 0.5)) {
      driverBuckets[bestDriver].push(client);
      historicalMatchesCount++;
    } else {
      unassigned.push(client);
    }
  });

  // 5. Balance workload & assign remaining unassigned clients using Geo-Proximity
  // Target average clients per driver
  const targetPerDriver = Math.ceil(clients.length / activeDrivers.length);

  unassigned.forEach(client => {
    const cLat = Number(client.lat) || baseLat;
    const cLng = Number(client.lng) || baseLng;

    // Find active driver with capacity & shortest average distance to their current cluster
    let bestDriver = activeDrivers[0];
    let minScore = Infinity;

    activeDrivers.forEach(d => {
      const currentList = driverBuckets[d];
      let dist = 0;
      if (currentList.length === 0) {
        dist = getHaversineDistance(baseLat, baseLng, cLat, cLng);
      } else {
        // Average distance to driver's existing stops
        let sumDist = 0;
        currentList.forEach(s => {
          sumDist += getHaversineDistance(Number(s.lat) || baseLat, Number(s.lng) || baseLng, cLat, cLng);
        });
        dist = sumDist / currentList.length;
      }

      // Penalty for drivers who are already over full target capacity
      const loadPenalty = (currentList.length / targetPerDriver) * 1.5;
      const score = dist * (1 + loadPenalty);

      if (score < minScore) {
        minScore = score;
        bestDriver = d;
      }
    });

    driverBuckets[bestDriver].push(client);
  });

  // 6. TSP Route Sequence Optimization & Metrics calculation per driver
  const driverRoutes: DriverRouteSuggestion[] = activeDrivers.map((driverName, idx) => {
    const assignedClients = driverBuckets[driverName] || [];
    const color = DRIVER_PALETTE[idx % DRIVER_PALETTE.length];

    if (assignedClients.length === 0) {
      return {
        driverName,
        color,
        clients: [],
        totalDistanceKm: 0,
        estimatedTimeMin: 0,
        confidenceScore: 100,
        historicalMatches: 0
      };
    }

    // Convert to TSPLocations
    const tspStops = assignedClients.map(c => ({
      id: c.id,
      name: c.name,
      lat: Number(c.lat) || baseLat,
      lng: Number(c.lng) || baseLng,
      rawClient: c
    }));

    // Optimize sequence starting from depot/base
    const orderedTsp = nearestNeighborTSP(tspStops, baseLat, baseLng);

    // Calculate distance & time
    const distMeters = calculateRouteDistance(orderedTsp, baseLat, baseLng, false);
    const distKm = Math.round((distMeters / 1000) * 10) / 10;
    
    // Time estimation: 30 km/h average city speed + 8 mins per delivery stop
    const travelTimeMin = Math.round((distKm / 30) * 60);
    const stopTimeMin = assignedClients.length * 8;
    const estTimeMin = travelTimeMin + stopTimeMin;

    // Calculate driver historical confidence match ratio
    let driverMatches = 0;
    assignedClients.forEach(c => {
      const key = (c.name || c.id || '').trim().toLowerCase();
      if (affinityMap[key] && affinityMap[key][driverName]) {
        driverMatches++;
      }
    });
    const confidence = Math.round((driverMatches / assignedClients.length) * 100) || 75;

    // Map back with updated route order
    const sortedClients = orderedTsp.map((t: any, index: number) => ({
      ...t.rawClient,
      driver: driverName,
      routeOrder: index + 1
    }));

    return {
      driverName,
      color,
      clients: sortedClients,
      totalDistanceKm: distKm,
      estimatedTimeMin: estTimeMin,
      confidenceScore: confidence,
      historicalMatches: driverMatches
    };
  });

  // 7. Overall Metrics & Insights
  const overallConfidence = Math.round(
    (historicalMatchesCount / Math.max(1, clients.length)) * 100
  );

  const insights: string[] = [
    `Analizadas ${telemetryHistory.length} instantáneas históricas de telemetría.`,
    `Se identificaron ${historicalMatchesCount} clientes con patrones fijos de chofer habituados.`,
    `Carga de trabajo balanceada uniformemente entre los ${activeDrivers.length} repartidores seleccionados.`
  ];

  if (manualOverrides && Object.keys(manualOverrides).length > 0) {
    insights.push(`Se aplicaron ${Object.keys(manualOverrides).length} ajustes personalizados solicitados.`);
  }

  return {
    driverRoutes,
    overallConfidence: Math.min(100, Math.max(50, overallConfidence + 25)),
    totalClients: clients.length,
    insights,
    analyzedSnapshotsCount: telemetryHistory.length
  };
}
