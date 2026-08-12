async function testOSRM() {
  const coords = [
    [-100.1913019576708, 25.781916821487062], // Local (lon, lat)
    [-100.311599217528, 25.6868664299343],    // Alberto Parra
    [-100.305622755245, 25.6820552668266],    // Fernando Garza
    [-100.278533417264, 25.6900069379909]     // Marcos Flores
  ];
  
  const coordinatesStr = coords.map(c => `${c[0]},${c[1]}`).join(';');
  const url = `http://localhost:5000/table/v1/driving/${coordinatesStr}?annotations=distance`;
  
  console.log("Querying OSRM:", url);
  try {
    const res = await fetch(url);
    const json = await res.json();
    console.log("OSRM Response structure:");
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error("OSRM query failed:", err);
  }
}

testOSRM();
