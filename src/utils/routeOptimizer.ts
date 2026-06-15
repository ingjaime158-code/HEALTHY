/**
 * Utility to optimize route sequences using a TSP (Traveling Salesperson Problem) solver.
 * Ported and adapted from the Python 'RUTAS HEALTHY' route assignment logic.
 *
 * Implements:
 * 1. Constructive Phase: Nearest Neighbor heuristic starting from the base/kitchen origin.
 * 2. Improvement Phase: Iterative local search applying:
 *    - Node Relocate (shifting a single node to another position)
 *    - Or-opt (segment relocate, shifting 2-3 consecutive nodes)
 *    - 2-opt classic (reversing subsegments to eliminate path crossings)
 */

export interface TSPLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * Calculates geodetic distance in meters between two lat/lng points using the Haversine formula.
 * Applies a 1.3x scaling factor to approximate street/road distance.
 */
export function getHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (lat1 === lat2 && lng1 === lng2) return 0;
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.3; // 1.3x road scale factor
}

/**
 * Calculates the total length of a delivery route.
 * @param route The sequence of delivery stops.
 * @param startLat Starting origin latitude.
 * @param startLng Starting origin longitude.
 * @param endAtStart If true, includes the distance from the last stop back to the origin.
 */
export function calculateRouteDistance(
  route: TSPLocation[],
  startLat: number,
  startLng: number,
  endAtStart: boolean = false
): number {
  if (route.length === 0) return 0;

  let total = getHaversineDistance(startLat, startLng, route[0].lat, route[0].lng);
  for (let i = 0; i < route.length - 1; i++) {
    total += getHaversineDistance(
      route[i].lat,
      route[i].lng,
      route[i + 1].lat,
      route[i + 1].lng
    );
  }

  if (endAtStart) {
    total += getHaversineDistance(
      route[route.length - 1].lat,
      route[route.length - 1].lng,
      startLat,
      startLng
    );
  }
  return total;
}

/**
 * Generates an initial route using the Nearest Neighbor heuristic.
 */
export function nearestNeighborTSP(
  stops: TSPLocation[],
  startLat: number,
  startLng: number
): TSPLocation[] {
  const unvisited = [...stops];
  const route: TSPLocation[] = [];

  let currentLat = startLat;
  let currentLng = startLng;

  while (unvisited.length > 0) {
    let bestDist = Infinity;
    let bestIdx = -1;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = getHaversineDistance(
        currentLat,
        currentLng,
        unvisited[i].lat,
        unvisited[i].lng
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    const nextStop = unvisited.splice(bestIdx, 1)[0];
    route.push(nextStop);
    currentLat = nextStop.lat;
    currentLng = nextStop.lng;
  }

  return route;
}

/**
 * Generates an initial route using the Cheapest Insertion heuristic.
 */
export function cheapestInsertionTSP(
  stops: TSPLocation[],
  startLat: number,
  startLng: number,
  endAtStart: boolean = false
): TSPLocation[] {
  const unvisited = [...stops];
  const route: TSPLocation[] = [];

  if (unvisited.length === 0) return route;

  // Find the closest stop to the starting origin
  let bestDistIni = Infinity;
  let bestIdxIni = -1;
  for (let i = 0; i < unvisited.length; i++) {
    const dist = getHaversineDistance(startLat, startLng, unvisited[i].lat, unvisited[i].lng);
    if (dist < bestDistIni) {
      bestDistIni = dist;
      bestIdxIni = i;
    }
  }

  route.push(unvisited.splice(bestIdxIni, 1)[0]);

  while (unvisited.length > 0) {
    let bestInsertionCost = Infinity;
    let bestPos = -1;
    let bestUnvisitedIdx = -1;

    for (let i = 0; i < unvisited.length; i++) {
      const p = unvisited[i];

      for (let pos = 0; pos <= route.length; pos++) {
        // Previous node coordinates (origin if pos === 0)
        const prevLat = pos > 0 ? route[pos - 1].lat : startLat;
        const prevLng = pos > 0 ? route[pos - 1].lng : startLng;

        // Next node coordinates (origin if closed route and pos === route.length)
        const isLastOpen = (!endAtStart && pos === route.length);
        
        let d_prev_to_p = getHaversineDistance(prevLat, prevLng, p.lat, p.lng);
        let d_p_to_next = 0;
        let d_prev_to_next = 0;

        if (!isLastOpen) {
          const nextLat = pos < route.length ? route[pos].lat : startLat;
          const nextLng = pos < route.length ? route[pos].lng : startLng;
          d_p_to_next = getHaversineDistance(p.lat, p.lng, nextLat, nextLng);
          d_prev_to_next = getHaversineDistance(prevLat, prevLng, nextLat, nextLng);
        }

        const insertionCost = d_prev_to_p + d_p_to_next - d_prev_to_next;

        if (insertionCost < bestInsertionCost) {
          bestInsertionCost = insertionCost;
          bestPos = pos;
          bestUnvisitedIdx = i;
        }
      }
    }

    const nextStop = unvisited.splice(bestUnvisitedIdx, 1)[0];
    route.splice(bestPos, 0, nextStop);
  }

  return route;
}

/**
 * Optimizes a route sequence using 2-opt and Or-opt heuristics.
 * @param route The initial sequence of stops.
 * @param startLat Origin latitude.
 * @param startLng Origin longitude.
 * @param endAtStart If true, optimizes for a closed loop (returning to start).
 */
export function optimizeTSPSequence(
  route: TSPLocation[],
  startLat: number,
  startLng: number,
  endAtStart: boolean = false
): TSPLocation[] {
  if (route.length < 3) return [...route];

  let bestRoute = [...route];
  let bestDist = calculateRouteDistance(bestRoute, startLat, startLng, endAtStart);

  let improved = true;
  let iterations = 0;
  const maxIterations = 500; // safety ceiling to prevent infinite loops

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // ── 1. NODE RELOCATION (Shifting single nodes) ──
    for (let i = 0; i < bestRoute.length; i++) {
      const node = bestRoute[i];
      for (let j = 0; j < bestRoute.length; j++) {
        if (i === j) continue;

        const candidate = [...bestRoute];
        candidate.splice(i, 1);
        candidate.splice(j, 0, node);

        const dist = calculateRouteDistance(candidate, startLat, startLng, endAtStart);
        if (dist < bestDist - 0.1) {
          bestRoute = candidate;
          bestDist = dist;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
    if (improved) continue;

    // ── 2. OR-OPT (Segment Relocation of size 2 and 3) ──
    for (const segLen of [3, 2]) {
      if (bestRoute.length < segLen + 1) continue;

      let foundSegment = false;
      for (let i = 0; i <= bestRoute.length - segLen; i++) {
        const segment = bestRoute.slice(i, i + segLen);
        const withoutSegment = [...bestRoute.slice(0, i), ...bestRoute.slice(i + segLen)];

        for (let j = 0; j <= withoutSegment.length; j++) {
          const candidate = [
            ...withoutSegment.slice(0, j),
            ...segment,
            ...withoutSegment.slice(j)
          ];
          const dist = calculateRouteDistance(candidate, startLat, startLng, endAtStart);
          if (dist < bestDist - 0.1) {
            bestRoute = candidate;
            bestDist = dist;
            improved = true;
            foundSegment = true;
            break;
          }
        }
        if (foundSegment) break;
      }
      if (improved) break;
    }
    if (improved) continue;

    // ── 3. CLASSIC 2-OPT (Reversing subsegments) ──
    for (let i = 0; i < bestRoute.length - 1; i++) {
      for (let j = i + 1; j < bestRoute.length; j++) {
        const candidate = [
          ...bestRoute.slice(0, i),
          ...bestRoute.slice(i, j + 1).reverse(),
          ...bestRoute.slice(j + 1)
        ];
        const dist = calculateRouteDistance(candidate, startLat, startLng, endAtStart);
        if (dist < bestDist - 0.1) {
          bestRoute = candidate;
          bestDist = dist;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return bestRoute;
}

/**
 * Main solver entry point that combines NN constructive heuristic and ATSP improvements.
 */
export function solveTSP(
  stops: TSPLocation[],
  startLat: number,
  startLng: number,
  endAtStart: boolean = false
): { route: TSPLocation[]; distanceMeters: number } {
  // Filter out any stops with invalid coordinates
  const validStops = stops.filter(
    (s) => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng) && s.lat !== 0 && s.lng !== 0
  );

  const invalidStops = stops.filter(
    (s) => !s.lat || !s.lng || isNaN(s.lat) || isNaN(s.lng) || s.lat === 0 || s.lng === 0
  );

  if (validStops.length === 0) {
    return { route: [...invalidStops], distanceMeters: 0 };
  }

  // Generate initial sequence using Nearest Neighbor
  const nnRoute = nearestNeighborTSP(validStops, startLat, startLng);
  // Generate initial sequence using Cheapest Insertion
  const ciRoute = cheapestInsertionTSP(validStops, startLat, startLng, endAtStart);

  // Compare distances to select the best start sequence
  const nnDist = calculateRouteDistance(nnRoute, startLat, startLng, endAtStart);
  const ciDist = calculateRouteDistance(ciRoute, startLat, startLng, endAtStart);
  const initialRoute = nnDist <= ciDist ? nnRoute : ciRoute;

  // Improve sequence
  const optimizedRoute = optimizeTSPSequence(initialRoute, startLat, startLng, endAtStart);

  // Append any invalid stops at the very end
  const finalRoute = [...optimizedRoute, ...invalidStops];
  const distance = calculateRouteDistance(optimizedRoute, startLat, startLng, endAtStart);

  return {
    route: finalRoute,
    distanceMeters: Math.round(distance)
  };
}

/**
 * Calculates the total length of a delivery route using a 2D distance matrix.
 * Index 0 in the matrix is the starting location.
 * Indices in routeIndices correspond to columns/rows in the distanceMatrix.
 */
export function calculateMatrixRouteDistance(
  routeIndices: number[],
  distanceMatrix: number[][],
  endAtStart: boolean = false
): number {
  if (routeIndices.length === 0) return 0;

  // From origin (index 0) to first stop
  let total = distanceMatrix[0]?.[routeIndices[0]] ?? 0;
  for (let i = 0; i < routeIndices.length - 1; i++) {
    const fromIdx = routeIndices[i];
    const toIdx = routeIndices[i + 1];
    total += distanceMatrix[fromIdx]?.[toIdx] ?? 0;
  }

  if (endAtStart) {
    total += distanceMatrix[routeIndices[routeIndices.length - 1]]?.[0] ?? 0;
  }
  return total;
}

/**
 * Generates an initial route using the Nearest Neighbor heuristic on a distance matrix.
 */
export function nearestNeighborTSPWithMatrix(
  stopsCount: number,
  distanceMatrix: number[][]
): number[] {
  const unvisited = Array.from({ length: stopsCount }, (_, i) => i + 1); // Indices 1 to stopsCount
  const route: number[] = [];

  let currentIdx = 0; // starts at origin (index 0)

  while (unvisited.length > 0) {
    let bestDist = Infinity;
    let bestIdx = -1;

    for (let i = 0; i < unvisited.length; i++) {
      const targetIdx = unvisited[i];
      const dist = distanceMatrix[currentIdx]?.[targetIdx] ?? Infinity;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      // Fallback if we cannot find a valid next stop
      bestIdx = 0;
    }

    const nextIdx = unvisited.splice(bestIdx, 1)[0];
    route.push(nextIdx);
    currentIdx = nextIdx;
  }

  return route;
}

/**
 * Generates an initial route using the Cheapest Insertion heuristic on a distance matrix.
 */
export function cheapestInsertionTSPWithMatrix(
  stopsCount: number,
  distanceMatrix: number[][],
  endAtStart: boolean = false
): number[] {
  const unvisited = Array.from({ length: stopsCount }, (_, i) => i + 1); // Indices 1 to stopsCount
  const route: number[] = [];

  if (unvisited.length === 0) return route;

  // Find the closest stop to the starting origin (index 0)
  let bestDistIni = Infinity;
  let bestIdxIni = -1;
  for (let i = 0; i < unvisited.length; i++) {
    const targetIdx = unvisited[i];
    const dist = distanceMatrix[0]?.[targetIdx] ?? Infinity;
    if (dist < bestDistIni) {
      bestDistIni = dist;
      bestIdxIni = i;
    }
  }

  route.push(unvisited.splice(bestIdxIni, 1)[0]);

  while (unvisited.length > 0) {
    let bestInsertionCost = Infinity;
    let bestPos = -1;
    let bestUnvisitedIdx = -1;

    for (let i = 0; i < unvisited.length; i++) {
      const targetIdx = unvisited[i];

      for (let pos = 0; pos <= route.length; pos++) {
        // Previous node index (index 0 if pos === 0)
        const prevIdx = pos > 0 ? route[pos - 1] : 0;

        // Next node index (index 0 if closed route and pos === route.length)
        const isLastOpen = (!endAtStart && pos === route.length);

        let d_prev_to_p = distanceMatrix[prevIdx]?.[targetIdx] ?? Infinity;
        let d_p_to_next = 0;
        let d_prev_to_next = 0;

        if (!isLastOpen) {
          const nextIdx = pos < route.length ? route[pos] : 0;
          d_p_to_next = distanceMatrix[targetIdx]?.[nextIdx] ?? Infinity;
          d_prev_to_next = distanceMatrix[prevIdx]?.[nextIdx] ?? Infinity;
        }

        const insertionCost = d_prev_to_p + d_p_to_next - d_prev_to_next;

        if (insertionCost < bestInsertionCost) {
          bestInsertionCost = insertionCost;
          bestPos = pos;
          bestUnvisitedIdx = i;
        }
      }
    }

    const nextIdx = unvisited.splice(bestUnvisitedIdx, 1)[0];
    route.splice(bestPos, 0, nextIdx);
  }

  return route;
}

/**
 * Optimizes a route sequence indices using 2-opt and Or-opt heuristics based on a distance matrix.
 */
export function optimizeTSPSequenceWithMatrix(
  routeIndices: number[],
  distanceMatrix: number[][],
  endAtStart: boolean = false
): number[] {
  if (routeIndices.length < 3) return [...routeIndices];

  let bestRoute = [...routeIndices];
  let bestDist = calculateMatrixRouteDistance(bestRoute, distanceMatrix, endAtStart);

  let improved = true;
  let iterations = 0;
  const maxIterations = 500; // safety ceiling

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // 1. NODE RELOCATION (Shifting single nodes)
    for (let i = 0; i < bestRoute.length; i++) {
      const node = bestRoute[i];
      for (let j = 0; j < bestRoute.length; j++) {
        if (i === j) continue;

        const candidate = [...bestRoute];
        candidate.splice(i, 1);
        candidate.splice(j, 0, node);

        const dist = calculateMatrixRouteDistance(candidate, distanceMatrix, endAtStart);
        if (dist < bestDist - 0.1) {
          bestRoute = candidate;
          bestDist = dist;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
    if (improved) continue;

    // 2. OR-OPT (Segment Relocation of size 2 and 3)
    for (const segLen of [3, 2]) {
      if (bestRoute.length < segLen + 1) continue;

      let foundSegment = false;
      for (let i = 0; i <= bestRoute.length - segLen; i++) {
        const segment = bestRoute.slice(i, i + segLen);
        const withoutSegment = [...bestRoute.slice(0, i), ...bestRoute.slice(i + segLen)];

        for (let j = 0; j <= withoutSegment.length; j++) {
          const candidate = [
            ...withoutSegment.slice(0, j),
            ...segment,
            ...withoutSegment.slice(j)
          ];
          const dist = calculateMatrixRouteDistance(candidate, distanceMatrix, endAtStart);
          if (dist < bestDist - 0.1) {
            bestRoute = candidate;
            bestDist = dist;
            improved = true;
            foundSegment = true;
            break;
          }
        }
        if (foundSegment) break;
      }
      if (improved) break;
    }
    if (improved) continue;

    // 3. CLASSIC 2-OPT (Reversing subsegments)
    for (let i = 0; i < bestRoute.length - 1; i++) {
      for (let j = i + 1; j < bestRoute.length; j++) {
        const candidate = [
          ...bestRoute.slice(0, i),
          ...bestRoute.slice(i, j + 1).reverse(),
          ...bestRoute.slice(j + 1)
        ];
        const dist = calculateMatrixRouteDistance(candidate, distanceMatrix, endAtStart);
        if (dist < bestDist - 0.1) {
          bestRoute = candidate;
          bestDist = dist;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return bestRoute;
}

/**
 * Solves TSP using a precalculated distance matrix.
 * @param stops The list of delivery locations.
 * @param distanceMatrix Distance matrix matching origin (index 0) and validStops (indices 1..N).
 * @param endAtStart If true, optimizes for a closed loop.
 */
export function solveTSPWithMatrix(
  stops: TSPLocation[],
  distanceMatrix: number[][],
  endAtStart: boolean = false
): { route: TSPLocation[]; distanceMeters: number } {
  // Filter out any stops with invalid coordinates
  const validStops = stops.filter(
    (s) => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng) && s.lat !== 0 && s.lng !== 0
  );

  const invalidStops = stops.filter(
    (s) => !s.lat || !s.lng || isNaN(s.lat) || isNaN(s.lng) || s.lat === 0 || s.lng === 0
  );

  if (validStops.length === 0) {
    return { route: [...invalidStops], distanceMeters: 0 };
  }

  // Generate initial sequence of indices using Nearest Neighbor
  const nnIndices = nearestNeighborTSPWithMatrix(validStops.length, distanceMatrix);
  // Generate initial sequence of indices using Cheapest Insertion
  const ciIndices = cheapestInsertionTSPWithMatrix(validStops.length, distanceMatrix, endAtStart);

  // Compare distances to select the best start sequence indices
  const nnDist = calculateMatrixRouteDistance(nnIndices, distanceMatrix, endAtStart);
  const ciDist = calculateMatrixRouteDistance(ciIndices, distanceMatrix, endAtStart);
  const initialIndices = nnDist <= ciDist ? nnIndices : ciIndices;

  // Improve sequence
  const optimizedIndices = optimizeTSPSequenceWithMatrix(initialIndices, distanceMatrix, endAtStart);

  // Map indices back to stops (index k corresponds to validStops[k - 1])
  const optimizedRoute = optimizedIndices.map((idx) => validStops[idx - 1]);

  // Append any invalid stops at the very end
  const finalRoute = [...optimizedRoute, ...invalidStops];
  const distance = calculateMatrixRouteDistance(optimizedIndices, distanceMatrix, endAtStart);

  return {
    route: finalRoute,
    distanceMeters: Math.round(distance)
  };
}

