const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Reconfigure stdout to UTF-8 to handle Spanish accents in console
if (process.stdout.setEncoding) {
    process.stdout.setEncoding('utf8');
}

// 1. Cargar credenciales del archivo .env
const envPath = './.env';
let envContent = '';
try {
    envContent = fs.readFileSync(envPath, 'utf8');
} catch (err) {
    console.error('❌ Error cargando .env:', err.message);
    process.exit(1);
}

const env = {};
envContent.split(/\r?\n/).forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabase = createClient(
    env.VITE_SUPABASE_URL, 
    env.VITE_SUPABASE_SERVICE_ROL || env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_ANON_KEY
);

// 2. Cargar datos del Excel
const planesPath = 'C:/Users/SKYNET/.gemini/antigravity/brain/dde9d0b0-8bac-42aa-add4-0c203b96ac4f/scratch/planes_data.json';
if (!fs.existsSync(planesPath)) {
    console.error('❌ Error: No existe el JSON de planes en', planesPath);
    process.exit(1);
}

const planesData = JSON.parse(fs.readFileSync(planesPath, 'utf8'));
const listPlanes = planesData.Hoja1 || [];

// 3. Funciones auxiliares de normalización y matching
function normalizeName(name) {
    if (!name) return '';
    return name.toString().toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
      .replace(/[^A-Z]/g, '') // Solo letras
      .trim();
}

function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // sustitución
                    matrix[i][j - 1] + 1,     // inserción
                    matrix[i - 1][j] + 1      // borrado
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function findBestMatch(excelName, dbBusinesses) {
    const normExcel = normalizeName(excelName);
    if (!normExcel) return null;

    // 1. Coincidencia exacta
    for (const b of dbBusinesses) {
        if (normalizeName(b.name) === normExcel) {
            return { record: b, type: 'EXACTO' };
        }
    }

    // 2. Coincidencia por subcadenas (ignorando iniciales intermedias como " A " o " A. ")
    const cleanExcel = normExcel.replace(/\b[A-Z]\b/g, '');
    for (const b of dbBusinesses) {
        const normDB = normalizeName(b.name);
        const cleanDB = normDB.replace(/\b[A-Z]\b/g, '');
        if (cleanExcel && cleanDB && (cleanExcel === cleanDB || cleanExcel.includes(cleanDB) || cleanDB.includes(cleanExcel))) {
            return { record: b, type: 'SUBCADENA' };
        }
    }

    // 3. Coincidencia por distancia de Levenshtein (distancia <= 2)
    let bestDist = 999;
    let bestMatch = null;
    for (const b of dbBusinesses) {
        const normDB = normalizeName(b.name);
        const dist = levenshteinDistance(normExcel, normDB);
        if (dist <= 2 && dist < bestDist) {
            bestDist = dist;
            bestMatch = b;
        }
    }

    if (bestMatch) {
        return { record: bestMatch, type: 'DIFUSO' };
    }

    return null;
}

// 4. Parser de plan
function parseExcelPlan(planStr) {
    if (!planStr) return { planType: 'HEALTHY', package: 'Comida', siglas: 'C', tiempos: 1 };
    
    const original = planStr.trim();
    const upper = original.toUpperCase();
    
    // Tipo de plan
    let planType = 'HEALTHY';
    if (upper.includes('SLIM')) {
        planType = 'SLIM';
    } else if (upper.includes('STRONG')) {
        planType = 'STRONG';
    }
    
    // Limpieza de siglas y extras
    let clean = original
        .replace(/SLIM/gi, '')
        .replace(/STRONG/gi, '')
        .replace(/\(.*?\)/gi, '')
        .trim();
    
    const upperClean = clean.toUpperCase();
    let packageVal = 'Comida';
    let siglasVal = 'C';
    let tiemposVal = 1;
    
    if (upperClean.includes('D+C+C') || upperClean.includes('D+C+CE') || upperClean.includes('D + C + C')) {
        packageVal = 'Desayuno + Comida + Cena';
        siglasVal = 'D+C+C';
        tiemposVal = 3;
    } else if (upperClean.includes('D+C') || upperClean.includes('D + C')) {
        packageVal = 'Desayuno + Comida';
        siglasVal = 'D+C';
        tiemposVal = 2;
    } else if (upperClean.includes('C+C') || upperClean.includes('C + C') || upperClean.includes('C+CE') || upperClean.includes('C + CE')) {
        packageVal = 'Comida + Cena';
        siglasVal = 'C+Ce';
        tiemposVal = 2;
    } else if (upperClean.includes('D+CE') || upperClean.includes('D + CE') || upperClean.includes('D+CENA')) {
        packageVal = 'Desayuno + Cena';
        siglasVal = 'D+Ce';
        tiemposVal = 2;
    } else if (upperClean.includes('DESAYUNO') || upperClean.startsWith('DE')) {
        packageVal = 'Desayuno';
        siglasVal = 'De';
        tiemposVal = 1;
    } else if (upperClean.includes('CENA') || upperClean.startsWith('CE')) {
        packageVal = 'Cena';
        siglasVal = 'Ce';
        tiemposVal = 1;
    } else if (upperClean.includes('COMIDA') || upperClean.startsWith('C')) {
        packageVal = 'Comida';
        siglasVal = 'C';
        tiemposVal = 1;
    }
    
    return {
        planType,
        package: packageVal,
        siglas: siglasVal,
        tiempos: tiemposVal
    };
}

// 5. Estructura base de perfil
const DEFAULT_PROFILE = {
  planType: 'HEALTHY',
  plansCount: 1,
  exclusions: 'Ninguna',
  siglas: 'C',
  driver: 'SIN ASIGNAR',
  isActive: true,
  extraDishes: 0,
  tiempos: 1,
  plans: []
};

function parseProfile(emailJson) {
    if (!emailJson || !emailJson.trim()) return { ...DEFAULT_PROFILE };
    const clean = emailJson.trim();
    if (clean.startsWith('{') && clean.endsWith('}')) {
        try {
            const parsed = JSON.parse(clean);
            return {
                ...DEFAULT_PROFILE,
                ...parsed,
                plans: Array.isArray(parsed.plans) ? parsed.plans : (parsed.plans ? [parsed.plans] : [])
            };
        } catch (e) {
            // ignore
        }
    }
    return { ...DEFAULT_PROFILE };
}

// 6. Función principal
async function run() {
    console.log('📥 1. Obteniendo clientes (businesses) desde Supabase...');
    const { data: dbBusinesses, error } = await supabase
        .from('businesses')
        .select('id, name, email');
    
    if (error) {
        console.error('❌ Error cargando clientes de Supabase:', error.message);
        return;
    }
    
    console.log(`📊 Total clientes en base de datos Supabase: ${dbBusinesses.length}`);
    console.log(`📊 Total filas de planes en PLANES.xlsx: ${listPlanes.length}`);
    
    // Agrupar planes del Excel por nombre normalizado
    console.log('\n📦 2. Agrupando planes del Excel...');
    const groupedExcel = {};
    listPlanes.forEach((row, idx) => {
        const rawName = row['Unnamed: 0'];
        if (!rawName) return;
        const norm = normalizeName(rawName);
        if (!norm) return;
        
        if (!groupedExcel[norm]) {
            groupedExcel[norm] = {
                rawName: rawName.trim().replace(/\n/g, ' '),
                plans: [],
                route: row['Unnamed: 2'] || 'Sin Ruta',
                filas: []
            };
        }
        
        const parsedPlan = parseExcelPlan(row['Unnamed: 1']);
        groupedExcel[norm].plans.push(parsedPlan);
        groupedExcel[norm].filas.push(idx + 1);
    });

    console.log(`📦 Clientes únicos consolidados en Excel: ${Object.keys(groupedExcel).length}`);

    // Resultados
    const actualizados = [];
    const noEncontrados = [];

    console.log('\n🔍 3. Emparejando y preparando actualizaciones...');
    
    for (const normKey of Object.keys(groupedExcel)) {
        const excelClient = groupedExcel[normKey];
        const matchResult = findBestMatch(excelClient.rawName, dbBusinesses);

        if (matchResult) {
            const { record: dbRecord, type: matchType } = matchResult;
            
            // Construir plan consolidado
            const excelPlansList = excelClient.plans;
            let finalPlanType = '';
            let finalSiglas = '';
            let finalPackage = '';
            let finalTiempos = 0;
            let finalPlans = [];

            if (excelPlansList.length === 1) {
                const single = excelPlansList[0];
                finalPlanType = single.planType;
                finalSiglas = single.siglas;
                finalPackage = single.package;
                finalTiempos = single.tiempos;
                finalPlans = [{
                    id: 'plan-1',
                    planType: single.planType,
                    package: single.package,
                    siglas: single.siglas,
                    tiempos: single.tiempos
                }];
            } else {
                finalPlanType = excelPlansList.map(p => p.planType).join(' + ');
                finalSiglas = excelPlansList.map(p => p.siglas).join(' + ');
                finalPackage = excelPlansList.map(p => p.package).join(' + ');
                finalTiempos = excelPlansList.reduce((sum, p) => sum + p.tiempos, 0);
                finalPlans = excelPlansList.map((p, idx) => ({
                    id: `plan-${idx + 1}`,
                    planType: p.planType,
                    package: p.package,
                    siglas: p.siglas,
                    tiempos: p.tiempos
                }));
            }

            // Deserializar perfil actual
            const currentProfile = parseProfile(dbRecord.email);
            
            // Fusión segura preservando exclusions, driver, isActive, extraDishes
            const updatedProfile = {
                ...currentProfile,
                planType: finalPlanType,
                plansCount: finalPlans.length,
                siglas: finalSiglas,
                tiempos: finalTiempos,
                package: finalPackage,
                plans: finalPlans
            };

            actualizados.push({
                id: dbRecord.id,
                name: dbRecord.name,
                excelName: excelClient.rawName,
                matchType,
                filasExcel: excelClient.filas,
                oldEmail: dbRecord.email,
                newEmail: JSON.stringify(updatedProfile)
            });
        } else {
            noEncontrados.push({
                nombre: excelClient.rawName,
                filasExcel: excelClient.filas,
                planes: excelClient.plans.map(p => `${p.siglas} ${p.planType}`).join(', '),
                ruta: excelClient.route
            });
        }
    }

    console.log(`✅ Emparejados con éxito: ${actualizados.length}`);
    console.log(`❌ No encontrados en Supabase: ${noEncontrados.length}`);

    console.log('\n🚀 4. Aplicando actualizaciones en Supabase...');
    let successCount = 0;
    
    // Actualizar de forma secuencial/bloques
    for (let i = 0; i < actualizados.length; i++) {
        const item = actualizados[i];
        const { error: patchError } = await supabase
            .from('businesses')
            .update({ email: item.newEmail })
            .eq('id', item.id);

        if (patchError) {
            console.error(`  ⚠️ Error al actualizar "${item.name}" (ID: ${item.id}):`, patchError.message);
        } else {
            successCount++;
            if (successCount % 20 === 0 || successCount === actualizados.length) {
                console.log(`  -> Progresado: ${successCount}/${actualizados.length} clientes actualizados...`);
            }
        }
    }

    console.log(`\n🎉 Sincronización finalizada! Se actualizaron ${successCount} perfiles en Supabase.`);

    // Guardar bitácora del proceso
    const logPath = 'C:/Users/SKYNET/.gemini/antigravity/brain/dde9d0b0-8bac-42aa-add4-0c203b96ac4f/scratch/import_planes_log.json';
    const report = {
        timestamp: new Date().toISOString(),
        totalExcelParsed: listPlanes.length,
        uniqueClientsExcel: Object.keys(groupedExcel).length,
        totalDB: dbBusinesses.length,
        successCount,
        noEncontradosCount: noEncontrados.length,
        noEncontrados,
        actualizados: actualizados.map(a => ({
            id: a.id,
            name: a.name,
            excelName: a.excelName,
            matchType: a.matchType,
            filasExcel: a.filasExcel,
            plans: JSON.parse(a.newEmail).plans
        }))
    };

    fs.writeFileSync(logPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`💾 Reporte de sincronización guardado en ${logPath}`);
}

run();
