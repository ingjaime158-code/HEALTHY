// Self-contained script to test solveTSP manually

function getHaversineDistance(lat1, lng1, lat2, lng2) {
  if (lat1 === lat2 && lng1 === lng2) return 0;
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.3;
}

function calculateRouteDistance(route, startLat, startLng, endAtStart = false) {
  if (route.length === 0) return 0;
  let total = getHaversineDistance(startLat, startLng, route[0].lat, route[0].lng);
  for (let i = 0; i < route.length - 1; i++) {
    total += getHaversineDistance(route[i].lat, route[i].lng, route[i + 1].lat, route[i + 1].lng);
  }
  if (endAtStart) {
    total += getHaversineDistance(route[route.length - 1].lat, route[route.length - 1].lng, startLat, startLng);
  }
  return total;
}

function nearestNeighborTSP(stops, startLat, startLng, excludeStopId) {
  const unvisited = stops.filter(s => s.id !== excludeStopId);
  const route = [];
  let currentLat = startLat;
  let currentLng = startLng;
  while (unvisited.length > 0) {
    let bestDist = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < unvisited.length; i++) {
      const dist = getHaversineDistance(currentLat, currentLng, unvisited[i].lat, unvisited[i].lng);
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

function cheapestInsertionTSP(stops, startLat, startLng, endAtStart = false, excludeStopId) {
  const unvisited = stops.filter(s => s.id !== excludeStopId);
  const route = [];
  if (unvisited.length === 0) return route;
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

function optimizeTSPSequence(route, startLat, startLng, endAtStart = false, forzarUltimo = false) {
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

function solveTSP(stops, startLat, startLng, endAtStart = false) {
  const validStops = stops.filter(s => s.lat && s.lng);
  if (validStops.length === 0) return { route: [], distanceMeters: 0 };
  let furthestStop = null;
  let maxDist = -1;
  for (let i = 0; i < validStops.length; i++) {
    const dist = getHaversineDistance(startLat, startLng, validStops[i].lat, validStops[i].lng);
    if (dist > maxDist) {
      maxDist = dist;
      furthestStop = validStops[i];
    }
  }
  const excludeStopId = furthestStop?.id;
  const nnRoute = nearestNeighborTSP(validStops, startLat, startLng, excludeStopId);
  const ciRoute = cheapestInsertionTSP(validStops, startLat, startLng, endAtStart, excludeStopId);
  if (furthestStop) {
    nnRoute.push(furthestStop);
    ciRoute.push(furthestStop);
  }
  const optNNRoute = optimizeTSPSequence(nnRoute, startLat, startLng, endAtStart, true);
  const optCIRoute = optimizeTSPSequence(ciRoute, startLat, startLng, endAtStart, true);
  const nnDistOpt = calculateRouteDistance(optNNRoute, startLat, startLng, endAtStart);
  const ciDistOpt = calculateRouteDistance(optCIRoute, startLat, startLng, endAtStart);
  const optimizedRoute = nnDistOpt <= ciDistOpt ? optNNRoute : optCIRoute;
  const distance = calculateRouteDistance(optimizedRoute, startLat, startLng, endAtStart);
  return { route: optimizedRoute, distanceMeters: Math.round(distance) };
}

// Data from user's image
const startCoords = { lat: 25.781916821487062, lng: -100.1913019576708 };
const stops = [
  { id: '1', name: 'Lucía Francisca Delgado Gzz', lat: 25.7064977130287, lng: -100.350259006948 },
  { id: '2', name: 'Marco Eduardo Rodríguez Gomez', lat: 25.6796255449219, lng: -100.315859011323 },
  { id: '3', name: 'Jenny Adame Vargas y Johana Medina Gzz', lat: 25.7040542738813, lng: -100.349037928053 },
  { id: '4', name: 'Lizbeth Jiménez Contreras', lat: 25.6713371849846, lng: -100.32517611578 },
  { id: '5', name: 'Andrea Enciso Beltrán & Ricardo Mendoza Gómez', lat: 25.699956338662, lng: -100.345370457775 },
  { id: '6', name: 'Jose Antonio Guillen', lat: 25.7024447009946, lng: -100.366585088906 },
  { id: '7', name: 'Marisbel Rosas Hdz', lat: 25.6863212037611, lng: -100.329701323564 },
  { id: '8', name: 'Gabriel Macías Godoy', lat: 25.684969851881, lng: -100.334293739948 },
  { id: '9', name: 'Carlos Adrián Pérez Chavarria', lat: 25.6923650631083, lng: -100.361471486007 },
  { id: '10', name: 'Paulina Aguilera Faz y Carlos Javier Elizondo', lat: 25.6672577761612, lng: -100.377165257385 },
  { id: '11', name: 'Jacqueline Hay & Cynthia Garza', lat: 25.6566726951341, lng: -100.364799481602 }
];

console.log("=== RUNNING LOCAL SOLVE_TSP ===");
const result = solveTSP(stops, startCoords.lat, startCoords.lng, false);
result.route.forEach((s, idx) => {
  console.log(`${idx + 1}: ${s.name} (${s.lat}, ${s.lng})`);
});
console.log("Total Distance (meters):", result.distanceMeters);
