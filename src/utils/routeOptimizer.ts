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

  // Si la ruta vuelve al origen, optimizar como circuito cerrado estándar
  if (endAtStart) {
    const nnRoute = nearestNeighborTSP(validStops, startLat, startLng);
    const ciRoute = cheapestInsertionTSP(validStops, startLat, startLng, true);
    const optNNRoute = optimizeTSPSequence(nnRoute, startLat, startLng, true, false);
    const optCIRoute = optimizeTSPSequence(ciRoute, startLat, startLng, true, false);
    const nnDistOpt = calculateRouteDistance(optNNRoute, startLat, startLng, true);
    const ciDistOpt = calculateRouteDistance(optCIRoute, startLat, startLng, true);
    const optimizedRoute = nnDistOpt <= ciDistOpt ? optNNRoute : optCIRoute;
    const finalRoute = [...optimizedRoute, ...invalidStops];
    return {
      route: finalRoute,
      distanceMeters: Math.round(calculateRouteDistance(optimizedRoute, startLat, startLng, true))
    };
  }

  // --- Criterio Humano: Evaluación Multi-Candidato para Parada Final ---
  // Ordenar paradas válidas por distancia al origen (de mayor a menor)
  const stopsWithDist = validStops.map((stop, idx) => ({
    stop,
    idx,
    distFromOrigin: getHaversineDistance(startLat, startLng, stop.lat, stop.lng)
  }));
  stopsWithDist.sort((a, b) => b.distFromOrigin - a.distFromOrigin);

  // Probar los Top N candidatos periféricos más lejanos como posible remate
  const numCandidates = Math.min(5, validStops.length);
  const candidates = stopsWithDist.slice(0, numCandidates);

  let bestRoute: TSPLocation[] = [];
  let bestScore = Infinity;
  let bestRouteOpenDistance = 0;

  for (const candidate of candidates) {
    const furthestStop = candidate.stop;
    const excludeStopId = furthestStop.id;

    const nnRoute = nearestNeighborTSP(validStops, startLat, startLng, excludeStopId);
    const ciRoute = cheapestInsertionTSP(validStops, startLat, startLng, false, excludeStopId);

    nnRoute.push(furthestStop);
    ciRoute.push(furthestStop);

    const optNNRoute = optimizeTSPSequence(nnRoute, startLat, startLng, false, true);
    const optCIRoute = optimizeTSPSequence(ciRoute, startLat, startLng, false, true);

    const nnDistOpt = calculateRouteDistance(optNNRoute, startLat, startLng, false);
    const ciDistOpt = calculateRouteDistance(optCIRoute, startLat, startLng, false);

    const candidateRoute = nnDistOpt <= ciDistOpt ? optNNRoute : optCIRoute;
    const openDist = Math.min(nnDistOpt, ciDistOpt);

    // Distancia de retorno del punto final al origen
    const returnDist = getHaversineDistance(startLat, startLng, furthestStop.lat, furthestStop.lng);

    // Puntuación compuesta (Costo del chofer: distancia de entregas + 0.6x distancia de retorno)
    const compositeScore = openDist + returnDist * 0.6;

    if (compositeScore < bestScore) {
      bestScore = compositeScore;
      bestRoute = candidateRoute;
      bestRouteOpenDistance = openDist;
    }
  }

  const finalRoute = [...bestRoute, ...invalidStops];

  return {
    route: finalRoute,
    distanceMeters: Math.round(bestRouteOpenDistance)
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

  // Si la ruta vuelve al origen, optimizar como circuito cerrado estándar
  if (endAtStart) {
    const nnIndices = nearestNeighborTSPWithMatrix(validStops.length, distanceMatrix);
    const ciIndices = cheapestInsertionTSPWithMatrix(validStops.length, distanceMatrix, true);
    const optNNIndices = optimizeTSPSequenceWithMatrix(nnIndices, distanceMatrix, true, false);
    const optCIIndices = optimizeTSPSequenceWithMatrix(ciIndices, distanceMatrix, true, false);
    const nnDistOpt = calculateMatrixRouteDistance(optNNIndices, distanceMatrix, true);
    const ciDistOpt = calculateMatrixRouteDistance(optCIIndices, distanceMatrix, true);
    const optimizedIndices = nnDistOpt <= ciDistOpt ? optNNIndices : optCIIndices;
    const optimizedRoute = optimizedIndices.map((idx) => validStops[idx - 1]);
    const finalRoute = [...optimizedRoute, ...invalidStops];
    return {
      route: finalRoute,
      distanceMeters: Math.round(calculateMatrixRouteDistance(optimizedIndices, distanceMatrix, true))
    };
  }

  // --- Criterio Humano: Evaluación Multi-Candidato para Parada Final con Matriz ---
  // Ordenar paradas válidas por distancia vial desde el origen (índice 0 en la matriz)
  const stopsWithDist = validStops.map((stop, idx) => {
    const matrixIdx = idx + 1;
    return {
      stop,
      validIdx: idx,
      matrixIdx,
      distFromOrigin: distanceMatrix[0]?.[matrixIdx] ?? 0
    };
  });
  stopsWithDist.sort((a, b) => b.distFromOrigin - a.distFromOrigin);

  // Probar los Top N candidatos periféricos más lejanos como posible remate
  const numCandidates = Math.min(5, validStops.length);
  const candidates = stopsWithDist.slice(0, numCandidates);

  let bestIndices: number[] = [];
  let bestScore = Infinity;
  let bestRouteOpenDistance = 0;

  for (const candidate of candidates) {
    const excludeIndex = candidate.matrixIdx;

    const nnIndices = nearestNeighborTSPWithMatrix(validStops.length, distanceMatrix, excludeIndex);
    const ciIndices = cheapestInsertionTSPWithMatrix(validStops.length, distanceMatrix, false, excludeIndex);

    nnIndices.push(excludeIndex);
    ciIndices.push(excludeIndex);

    const optNNIndices = optimizeTSPSequenceWithMatrix(nnIndices, distanceMatrix, false, true);
    const optCIIndices = optimizeTSPSequenceWithMatrix(ciIndices, distanceMatrix, false, true);

    const nnDistOpt = calculateMatrixRouteDistance(optNNIndices, distanceMatrix, false);
    const ciDistOpt = calculateMatrixRouteDistance(optCIIndices, distanceMatrix, false);

    const candidateIndices = nnDistOpt <= ciDistOpt ? optNNIndices : optCIIndices;
    const openDist = Math.min(nnDistOpt, ciDistOpt);

    // Distancia de regreso del punto final al origen según la matriz
    const returnDist = distanceMatrix[candidate.matrixIdx]?.[0] ?? candidate.distFromOrigin;

    // Puntuación compuesta (Costo del chofer: distancia de entregas + 0.6x distancia de retorno)
    const compositeScore = openDist + returnDist * 0.6;

    if (compositeScore < bestScore) {
      bestScore = compositeScore;
      bestIndices = candidateIndices;
      bestRouteOpenDistance = openDist;
    }
  }

  const optimizedRoute = bestIndices.map((idx) => validStops[idx - 1]);
  const finalRoute = [...optimizedRoute, ...invalidStops];

  return {
    route: finalRoute,
    distanceMeters: Math.round(bestRouteOpenDistance)
  };
}
