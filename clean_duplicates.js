import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// 1. Cargar variables de entorno desde el archivo .env de forma segura
const envPath = './.env';
let envContent = '';
try {
    envContent = fs.readFileSync(envPath, 'utf8');
} catch (err) {
    console.error('Error leyendo archivo .env:', err.message);
    process.exit(1);
}

const env = {};
envContent.split(/\r?\n/).forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        env[key] = value;
    }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Falta la URL o la clave de Supabase en el archivo .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Normalizador estándar de nombres para comparación
function normalizeName(name) {
    if (!name) return '';
    return name.toString().toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
      .replace(/[^\w\s]/gi, '') // quitar puntos, comas, etc.
      .replace(/\s+/g, ' ') // normalizar espacios multiples
      .trim();
}

// Limpiador básico de direcciones para detectar solapamiento de domicilio
function cleanAddress(addr) {
    if (!addr) return '';
    return addr.toString().toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, '') // conservar solo letras y números
      .trim();
}

async function cleanDuplicates() {
    console.log('🌌 [Healthy Dreams] Diagnosticando y limpiando duplicados...');
    
    const businesses = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const { data, error } = await supabase.from('businesses').select('*').range(from, to);
        if (error) {
            console.error('❌ Error al obtener clientes de Supabase:', error.message);
            return;
        }
        businesses.push(...data);
        if (data.length < pageSize) {
            hasMore = false;
        } else {
            page++;
        }
    }
    
    console.log(`📊 Total de registros leídos en Supabase: ${businesses.length} clientes.`);
    
    // Agrupar registros duplicados
    const groups = {};
    
    businesses.forEach(b => {
        const normName = normalizeName(b.name);
        
        // Buscamos si ya existe un grupo con un nombre extremadamente similar
        let groupKey = normName;
        
        // Caso de coincidencia difusa (ej. "BENJAMIN LOPEZ BRIONES" vs "BENJAMIN LOPEZ BRIONE" o "AARONA" vs "AARON")
        for (const existingKey of Object.keys(groups)) {
            const isVerySimilar = 
                existingKey === normName ||
                existingKey.startsWith(normName) || 
                normName.startsWith(existingKey) ||
                // Distancia sutil (ej: difieren en solo una letra al final)
                (Math.abs(existingKey.length - normName.length) <= 2 && 
                 (existingKey.includes(normName.slice(0, -1)) || normName.includes(existingKey.slice(0, -1))));
            
            if (isVerySimilar) {
                // Si la dirección es la misma o muy similar, o si uno tiene la dirección vacía, asumimos que son el mismo cliente
                const hasSameAddress = 
                    cleanAddress(b.location) === cleanAddress(groups[existingKey][0].location) ||
                    cleanAddress(b.location).includes(cleanAddress(groups[existingKey][0].location)) ||
                    cleanAddress(groups[existingKey][0].location).includes(cleanAddress(b.location)) ||
                    !b.location || !groups[existingKey][0].location;
                
                // Si el nombre es exactamente idéntico, es duplicado directo
                const isExactName = existingKey === normName;
                
                if (isExactName || hasSameAddress) {
                    groupKey = existingKey;
                    break;
                }
            }
        }
        
        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        groups[groupKey].push(b);
    });
    
    let deletedCount = 0;
    const itemsToDelete = [];
    
    console.log('\n🔍 --- ANALIZANDO GRUPOS CON DUPLICIDAD ---');
    
    for (const [key, list] of Object.entries(groups)) {
        if (list.length > 1) {
            console.log(`\n👥 Grupo encontrado: "${key}" (${list.length} registros)`);
            
            // Evaluar cuál de los registros del grupo es el "BUENO" (el que conservaremos)
            // Criterios de prioridad para conservar:
            // 1. Tiene un plan asignado que no sea "NINGUNO" en el email JSON.
            // 2. Tiene un chofer asignado que no sea "SIN ASIGNAR".
            // 3. Dirección más larga y completa.
            // 4. Estatus activo (isActive: true).
            
            const scoredList = list.map(item => {
                let score = 0;
                let isActive = true;
                let planType = '';
                let driver = 'SIN ASIGNAR';
                
                if (item.email && item.email.startsWith('{') && item.email.endsWith('}')) {
                    try {
                        const parsed = JSON.parse(item.email);
                        isActive = parsed.isActive !== false;
                        planType = parsed.planType || '';
                        driver = parsed.driver || 'SIN ASIGNAR';
                    } catch (e) {}
                }
                
                // Puntuación:
                if (isActive) score += 10;
                if (planType && planType.toUpperCase() !== 'NINGUNO') score += 20;
                if (driver && driver.toUpperCase() !== 'SIN ASIGNAR') score += 15;
                if (item.location && item.location.length > 10) score += 5;
                if (item.locationLink) score += 5;
                
                return { item, score, isActive, planType, driver };
            });
            
            // Ordenar por score descendente (el mejor primero)
            scoredList.sort((a, b) => b.score - a.score);
            
            const bestRecord = scoredList[0].item;
            console.log(`   ✅ CONSERVAR: ID [${bestRecord.id}]`);
            console.log(`      - Nombre: "${bestRecord.name}"`);
            console.log(`      - Dirección: "${bestRecord.location}"`);
            console.log(`      - Plan: "${scoredList[0].planType || 'NINGUNO'}"`);
            console.log(`      - Chofer: "${scoredList[0].driver}"`);
            console.log(`      - Ruta: "${bestRecord.routeType || bestRecord.route_type}"`);
            
            // Todos los demás del grupo se marcan para borrar
            for (let idx = 1; idx < scoredList.length; idx++) {
                const badRecord = scoredList[idx].item;
                console.log(`   ❌ BORRAR: ID [${badRecord.id}]`);
                console.log(`      - Nombre: "${badRecord.name}"`);
                console.log(`      - Dirección: "${badRecord.location}"`);
                console.log(`      - Plan: "${scoredList[idx].planType || 'NINGUNO'}"`);
                console.log(`      - Chofer: "${scoredList[idx].driver}"`);
                itemsToDelete.push(badRecord.id);
            }
        }
    }
    
    if (itemsToDelete.length === 0) {
        console.log('\n🎉 ¡No se encontraron registros duplicados para eliminar! La base de datos está limpia.');
        return;
    }
    
    console.log(`\n🚀 Procediendo a eliminar de forma segura ${itemsToDelete.length} registros duplicados de Supabase...`);
    
    for (const id of itemsToDelete) {
        const { error: delError } = await supabase.from('businesses').delete().eq('id', id);
        if (delError) {
            console.error(`❌ Error eliminando registro ${id}:`, delError.message);
        } else {
            deletedCount++;
        }
    }
    
    console.log(`\n🎉 [Limpieza Completada] Se eliminaron exitosamente ${deletedCount} registros duplicados de la base de datos.`);
    console.log('🔄 Sincronizando la caché local...');
}

cleanDuplicates();
