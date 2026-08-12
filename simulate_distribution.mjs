import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

async function run() {
    console.log("Fetching database clients...");
    const { data: dbClients, error } = await supabase
        .from('businesses')
        .select('*');

    if (error) {
        console.error(error);
        return;
    }

    // Map parsed clients
    const parsedClients = dbClients.map(biz => {
      let planType = '';
      let plansCount = 1;
      let exclusions = 'Ninguna';
      let siglas = 'C';
      let driver = 'SIN ASIGNAR';
      let isActive = true;
      let tiempos = 1;
      let routeOrder = 9999;

      if (biz.email && biz.email.startsWith('{') && biz.email.endsWith('}')) {
        try {
          const parsed = JSON.parse(biz.email);
          planType = parsed.planType !== undefined ? parsed.planType : '';
          plansCount = parseInt(parsed.plansCount) || 1;
          exclusions = parsed.exclusions || 'Ninguna';
          siglas = parsed.siglas || 'C';
          driver = parsed.driver || 'SIN ASIGNAR';
          isActive = parsed.isActive !== false;
          routeOrder = parsed.routeOrder !== undefined ? Number(parsed.routeOrder) : 9999;
          tiempos = parsed.tiempos || 0;
          if (tiempos === 0 && parsed.plans && Array.isArray(parsed.plans)) {
            tiempos = parsed.plans.reduce((sum, p) => sum + (p.tiempos || 1), 0);
          }
          if (tiempos === 0) tiempos = 1;
        } catch (e) {}
      }

      return {
        ...biz,
        routeType: biz.route_type,
        planType,
        plansCount,
        exclusions,
        siglas,
        driver,
        isActive,
        tiempos,
        routeOrder
      };
    });

    const selectedRoute = 'Vespertina';

    // 1. Filter active clients for active route and active status
    const activeClientsForRoute = parsedClients.filter(c => 
      c.routeType === selectedRoute && 
      c.isActive
    );

    console.log(`Total active clients for route ${selectedRoute}: ${activeClientsForRoute.length}`);

    // Sort active clients by routeOrder so they are distributed in the optimized order
    const sortedActiveClients = [...activeClientsForRoute].sort((a, b) => {
      const orderA = a.routeOrder !== undefined ? a.routeOrder : 9999;
      const orderB = b.routeOrder !== undefined ? b.routeOrder : 9999;
      return orderA - orderB;
    });

    // 2. Group clients by driver
    const groupedByDriver = {};
    sortedActiveClients.forEach(c => {
      const driverName = c.driver.trim().toUpperCase() || 'SIN ASIGNAR';
      if (!groupedByDriver[driverName]) {
        groupedByDriver[driverName] = [];
      }
      groupedByDriver[driverName].push(c);
    });

    const brayanClients = groupedByDriver['BRAYAN'] || [];
    console.log(`\n=== SORTED CLIENTS IN SIMULATED DISTRIBUTION FOR BRAYAN (Total: ${brayanClients.length}) ===`);
    brayanClients.forEach((c, idx) => {
        console.log(`${idx + 1}: Order: ${c.routeOrder} - Name: "${c.name}"`);
    });
}
run();
