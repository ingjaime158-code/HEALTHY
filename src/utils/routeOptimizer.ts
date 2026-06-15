/**
 * Test version of Route Optimizer with forced furthest stop logic.
 */

export interface TSPLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

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

export function nearestNeighborTSP(
  stops: TSPLocation[],
  startLat: number,
  startLng: number,
  excludeStopId?: string
): TSPLocation[] {
  const unvisited = stops.filter(s => s.id !== excludeStopId);
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

export function cheapestInsertionTSP(
  stops: TSPLocation[],
  startLat: number,
  startLng: number,
  endAtStart: boolean = false,
  excludeStopId?: string
): TSPLocation[] {
  const unvisited = stops.filter(s => s.id !== excludeStopId);
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
        const prevLat = pos > 0 ? route[pos - 1].lat : startLat;
        const prevLng = pos > 0 ? route[pos - 1].lng : startLng;

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

export function optimizeTSPSequence(
  route: TSPLocation[],
  startLat: number,
  startLng: number,
  endAtStart: boolean = false,
  forzarUltimo: boolean = false
): TSPLocation[] {
  if (route.length < 3) return [...route];

  let bestRoute = [...route];
  let bestDist = calculateRouteDistance(bestRoute, startLat, startLng, endAtStart);

  let improved = true;
  let iterations = 0;
  const maxIterations = 500;

  const limit = forzarUltimo ? bestRoute.length - 1 : bestRoute.length;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // 1. NODE RELOCATION
    for (let i = 0; i < limit; i++) {
      const node = bestRoute[i];
      for (let j = 0; j < limit; j++) {
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

    // 2. OR-OPT (Segment Relocation)
    for (const segLen of [3, 2]) {
      if (limit < segLen + 1) continue;

      let foundSegment = false;
      for (let i = 0; i <= limit - segLen; i++) {
        const segment = bestRoute.slice(i, i + segLen);
        const withoutSegment = [...bestRoute.slice(0, i), ...bestRoute.slice(i + segLen)];
        const limInsert = forzarUltimo ? withoutSegment.length - 1 : withoutSegment.length;

        for (let j = 0; j <= limInsert; j++) {
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

    // 3. CLASSIC 2-OPT
    for (let i = 0; i < limit - 1; i++) {
      for (let j = i + 1; j < limit; j++) {
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

export function solveTSP(
  stops: TSPLocation[],
  startLat: number,
  startLng: number,
  endAtStart: boolean = false
): { route: TSPLocation[]; distanceMeters: number } {
  const validStops = stops.filter(
    (s) => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng) && s.lat !== 0 && s.lng !== 0
  );

  const invalidStops = stops.filter(
    (s) => !s.lat || !s.lng || isNaN(s.lat) || isNaN(s.lng) || s.lat === 0 || s.lng === 0
  );

  if (validStops.length === 0) {
    return { route: [...invalidStops], distanceMeters: 0 };
  }

  // Identify the furthest stop from origin to force it as the endpoint
  let furthestStop: TSPLocation | null = null;
  let maxDist = -1;
  let furthestIdx = -1;
  for (let i = 0; i < validStops.length; i++) {
    const dist = getHaversineDistance(startLat, startLng, validStops[i].lat, validStops[i].lng);
    if (dist > maxDist) {
      maxDist = dist;
      furthestStop = validStops[i];
      furthestIdx = i;
    }
  }

  const excludeStopId = furthestStop?.id;
  const nnRoute = nearestNeighborTSP(validStops, startLat, startLng, excludeStopId);
  const ciRoute = cheapestInsertionTSP(validStops, startLat, startLng, endAtStart, excludeStopId);

  if (furthestStop) {
    nnRoute.push(furthestStop);
    ciRoute.push(furthestStop);
  }

  // Optimize both initial sequences and pick the best one
  const optNNRoute = optimizeTSPSequence(nnRoute, startLat, startLng, endAtStart, true);
  const optCIRoute = optimizeTSPSequence(ciRoute, startLat, startLng, endAtStart, true);

  const nnDistOpt = calculateRouteDistance(optNNRoute, startLat, startLng, endAtStart);
  const ciDistOpt = calculateRouteDistance(optCIRoute, startLat, startLng, endAtStart);

  const optimizedRoute = nnDistOpt <= ciDistOpt ? optNNRoute : optCIRoute;

  const finalRoute = [...optimizedRoute, ...invalidStops];
  const distance = calculateRouteDistance(optimizedRoute, startLat, startLng, endAtStart);

  return {
    route: finalRoute,
    distanceMeters: Math.round(distance)
  };
}

export function calculateMatrixRouteDistance(
  routeIndices: number[],
  distanceMatrix: number[][],
  endAtStart: boolean = false
): number {
  if (routeIndices.length === 0) return 0;

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

export function nearestNeighborTSPWithMatrix(
  stopsCount: number,
  distanceMatrix: number[][],
  excludeIndex?: number
): number[] {
  const unvisited = Array.from({ length: stopsCount }, (_, i) => i + 1)
    .filter(idx => idx !== excludeIndex);
  const route: number[] = [];

  let currentIdx = 0;

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
      bestIdx = 0;
    }

    const nextIdx = unvisited.splice(bestIdx, 1)[0];
    route.push(nextIdx);
    currentIdx = nextIdx;
  }

  return route;
}

export function cheapestInsertionTSPWithMatrix(
  stopsCount: number,
  distanceMatrix: number[][],
  endAtStart: boolean = false,
  excludeIndex?: number
): number[] {
  const unvisited = Array.from({ length: stopsCount }, (_, i) => i + 1)
    .filter(idx => idx !== excludeIndex);
  const route: number[] = [];

  if (unvisited.length === 0) return route;

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
        const prevIdx = pos > 0 ? route[pos - 1] : 0;
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

export function optimizeTSPSequenceWithMatrix(
  routeIndices: number[],
  distanceMatrix: number[][],
  endAtStart: boolean = false,
  forzarUltimo: boolean = false
): number[] {
  if (routeIndices.length < 3) return [...routeIndices];

  let bestRoute = [...routeIndices];
  let bestDist = calculateMatrixRouteDistance(bestRoute, distanceMatrix, endAtStart);

  let improved = true;
  let iterations = 0;
  const maxIterations = 500;

  const limit = forzarUltimo ? bestRoute.length - 1 : bestRoute.length;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // 1. NODE RELOCATION
    for (let i = 0; i < limit; i++) {
      const node = bestRoute[i];
      for (let j = 0; j < limit; j++) {
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

    // 2. OR-OPT (Segment Relocation)
    for (const segLen of [3, 2]) {
      if (limit < segLen + 1) continue;

      let foundSegment = false;
      for (let i = 0; i <= limit - segLen; i++) {
        const segment = bestRoute.slice(i, i + segLen);
        const withoutSegment = [...bestRoute.slice(0, i), ...bestRoute.slice(i + segLen)];
        const limInsert = forzarUltimo ? withoutSegment.length - 1 : withoutSegment.length;

        for (let j = 0; j <= limInsert; j++) {
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

    // 3. CLASSIC 2-OPT
    for (let i = 0; i < limit - 1; i++) {
      for (let j = i + 1; j < limit; j++) {
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

export function solveTSPWithMatrix(
  stops: TSPLocation[],
  distanceMatrix: number[][],
  endAtStart: boolean = false
): { route: TSPLocation[]; distanceMeters: number } {
  const validStops = stops.filter(
    (s) => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng) && s.lat !== 0 && s.lng !== 0
  );

  const invalidStops = stops.filter(
    (s) => !s.lat || !s.lng || isNaN(s.lat) || isNaN(s.lng) || s.lat === 0 || s.lng === 0
  );

  if (validStops.length === 0) {
    return { route: [...invalidStops], distanceMeters: 0 };
  }

  // Find the furthest stop index from origin using the matrix (index 0 is origin, indices 1..N are stops)
  let maxDist = -1;
  let furthestIdxInValidStops = -1;
  for (let i = 0; i < validStops.length; i++) {
    const matrixIdx = i + 1;
    const dist = distanceMatrix[0]?.[matrixIdx] ?? 0;
    if (dist > maxDist) {
      maxDist = dist;
      furthestIdxInValidStops = i;
    }
  }

  const excludeIndex = furthestIdxInValidStops !== -1 ? furthestIdxInValidStops + 1 : undefined;

  const nnIndices = nearestNeighborTSPWithMatrix(validStops.length, distanceMatrix, excludeIndex);
  const ciIndices = cheapestInsertionTSPWithMatrix(validStops.length, distanceMatrix, endAtStart, excludeIndex);

  if (excludeIndex !== undefined) {
    nnIndices.push(excludeIndex);
    ciIndices.push(excludeIndex);
  }

  // Optimize both initial sequences and pick the best one
  const optNNIndices = optimizeTSPSequenceWithMatrix(nnIndices, distanceMatrix, endAtStart, true);
  const optCIIndices = optimizeTSPSequenceWithMatrix(ciIndices, distanceMatrix, endAtStart, true);

  const nnDistOpt = calculateMatrixRouteDistance(optNNIndices, distanceMatrix, endAtStart);
  const ciDistOpt = calculateMatrixRouteDistance(optCIIndices, distanceMatrix, endAtStart);

  const optimizedIndices = nnDistOpt <= ciDistOpt ? optNNIndices : optCIIndices;

  const optimizedRoute = optimizedIndices.map((idx) => validStops[idx - 1]);

  const finalRoute = [...optimizedRoute, ...invalidStops];
  const distance = calculateMatrixRouteDistance(optimizedIndices, distanceMatrix, endAtStart);

  return {
    route: finalRoute,
    distanceMeters: Math.round(distance)
  };
}
