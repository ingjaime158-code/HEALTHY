// Script to perform brute-force or heuristic search to find the shortest route and compare with solveTSP

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

const startCoords = { lat: 25.781917, lng: -100.191302 };
const stops = [
  { id: '1', name: 'Lucía Francisca Delgado Gzz', lat: 25.7064977130287, lng: -100.350259006948 },
  { id: '2', name: 'Marco Eduardo Rodríguez Gomez', lat: 25.6796255449219, lng: -100.315859011323 },
  { id: '3', name: 'Jenny Adame Vargas y Johana Medina Gzz', lat: 25.7040542738813, lng: -100.349037928053 },
  { id: '4', name: 'Lizbeth Jiménez Contreras', lat: 25.6713371849846, lng: -100.325177611578 },
  { id: '5', name: 'Andrea Enciso Beltrán & Ricardo Mendoza Gómez', lat: 25.699956338662, lng: -100.345370457775 },
  { id: '6', name: 'Jose Antonio Guillen', lat: 25.7024447009946, lng: -100.366585088906 },
  { id: '7', name: 'Marisbel Rosas Hdz', lat: 25.6863212037611, lng: -100.329701323564 },
  { id: '8', name: 'Gabriel Macías Godoy', lat: 25.684969851881, lng: -100.334293739948 },
  { id: '9', name: 'Carlos Adrián Pérez Chavarria', lat: 25.6923650631083, lng: -100.361471486007 },
  { id: '10', name: 'Paulina Aguilera Faz y Carlos Javier Elizondo', lat: 25.6672577761612, lng: -100.377165257385 },
  { id: '11', name: 'Jacqueline Hay & Cynthia Garza', lat: 25.6566726951341, lng: -100.364799481602 }
];

// Let's find the permutation with the absolute minimum distance (brute force since N=11 is very small: 11! = 39.9 million)
// Actually, since 11! is 39 million, it might take a few seconds in Node. Let's do it!
let bestDist = Infinity;
let bestPerm = [];

function permute(arr, memo = []) {
  if (arr.length === 0) {
    const dist = calculateRouteDistance(memo, startCoords.lat, startCoords.lng, false);
    if (dist < bestDist) {
      bestDist = dist;
      bestPerm = [...memo];
    }
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const curr = arr.slice();
    const next = curr.splice(i, 1);
    permute(curr.slice(), memo.concat(next));
  }
}

console.log("Starting brute force search for 11 stops...");
const startTime = Date.now();
permute(stops);
console.log("Brute force completed in", (Date.now() - startTime) / 1000, "seconds");
console.log("Absolute Best Distance (meters):", bestDist);
bestPerm.forEach((s, idx) => {
  console.log(`${idx + 1}: ${s.name} (${s.lat}, ${s.lng})`);
});
