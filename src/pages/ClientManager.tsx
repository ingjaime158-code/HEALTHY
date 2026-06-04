import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBusinesses, updateBusiness, addBusiness, getDrivers, Driver, Business } from '../services/dataService';
import { pushToGoogleSheets, fetchClientsFromGoogleSheet, distributeRoutesToGoogleSheets } from '../services/googleSheetsService';
import { parseCsv } from '../utils/csvParser';
import { calculateBagsForClient, getClientTiempos } from '../utils/bagCalculator';
import { parseClientProfile, serializeClientProfile, parseCoordinates } from '../utils/clientProfile';
import { useHealthyDreamsStore } from '../store/useHealthyDreamsStore';

interface PlanItem {
    id: string;
    planType: string;
    package: string;
    siglas: string;
    tiempos: number;
}


// Fetch IDs from environment or fallback
const MORNING_SHEET_ID = import.meta.env.VITE_MORNING_SHEET_ID || "1fWjuO_bGy4cvO0-Ru-u2lbnJcD8ZJFg3ovTaD7kIDzE";
const EVENING_SHEET_ID = import.meta.env.VITE_EVENING_SHEET_ID || "1y7V-6nwmsJv_bY38PzjFhIFWaUPu8EW4IvQD23T008U";

const MORNING_SHEET_URL = `https://docs.google.com/spreadsheets/d/${MORNING_SHEET_ID}/edit?gid=1075208342#gid=1075208342`;
const EVENING_SHEET_URL = `https://docs.google.com/spreadsheets/d/${EVENING_SHEET_ID}/edit?gid=2039339913#gid=2039339913`;

const DAYS_OF_WEEK = [
  { name: 'Domingo', route: 'Vespertina', desc: 'Reparto Vespertina 🌇', isDelivery: true, value: 0 },
  { name: 'Lunes', route: 'Matutina', desc: 'Reparto Matutina 🌅', isDelivery: true, value: 1 },
  { name: 'Martes', route: null, desc: 'Sin reparto ordinario 💤', isDelivery: false, value: 2 },
  { name: 'Miércoles', route: 'Vespertina', desc: 'Reparto Vespertina 🌇', isDelivery: true, value: 3 },
  { name: 'Jueves', route: 'Matutina', desc: 'Reparto Matutina 🌅', isDelivery: true, value: 4 },
  { name: 'Viernes', route: null, desc: 'Sin reparto ordinario 💤', isDelivery: false, value: 5 },
  { name: 'Sábado', route: null, desc: 'Sin reparto ordinario 💤', isDelivery: false, value: 6 },
];

const PACKAGE_TIEMPOS: Record<string, number> = {
  'Comida': 1,
  'Comida + Cena': 2,
  'Desayuno + Comida': 2,
  'Desayuno + Comida + Cena': 3,
  'Desayuno + Cena': 2,
  'Desayuno': 1,
  'Cena': 1,
  'Comida y Cena': 2,
  'Desayuno y Comida': 2,
  'Desayuno y Cena': 2,
  'Desayuno, Comida y Cena': 3,
  'Paquete Completo': 3,
  'Snack': 1,
  'Ninguno': 1
};

const PACKAGE_SIGLAS: { [key: string]: string } = {
  'Comida': 'C',
  'Cena': 'CE',
  'Comida y Cena': 'C-CE',
  'Desayuno y Comida': 'D-C',
  'Desayuno y Cena': 'D-CE',
  'Desayuno, Comida y Cena': '3T',
  'Paquete Completo': 'PC',
  'Snack': 'S',
  'Ninguno': 'C' // Fallback
};

const ClientManager: React.FC = () => {
  const navigate = useNavigate();
  
  // Zustand operational cache store
  const { 
    clients: dbClients, 
    drivers: systemDrivers, 
    isLoading: storeLoading, 
    fetchClientsAndDrivers, 
    updateClientInStore,
    setClients: setDbClients
  } = useHealthyDreamsStore();

  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Sorting and Filtering States
  const [sortField, setSortField] = useState<'name' | 'plan' | 'tiempos' | 'driver' | 'status' | null>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [driverFilter, setDriverFilter] = useState<string>('TODOS');
  const [planFilter, setPlanFilter] = useState<string>('TODOS');
  
  // Custom coordinated menu states: route tabs & active/inactive submenus
  const [selectedRoute, setSelectedRoute] = useState<'Matutina' | 'Vespertina'>(() => {
    const day = new Date().getDay();
    if (day === 0 || day === 3) return 'Vespertina';
    return 'Matutina';
  });
  const [selectedStatus, setSelectedStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  
  const [savingClientId, setSavingClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [isDistributing, setIsDistributing] = useState<boolean>(false);

  // Modal State for Column Editing
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [modalDriver, setModalDriver] = useState<string>('SIN ASIGNAR');
  const [modalExclusions, setModalExclusions] = useState<string>('Ninguna');

  // Plan builder states inside modal
  const [modalPlansList, setModalPlansList] = useState<PlanItem[]>([]);
  const [modalNewPlanType, setModalNewPlanType] = useState<string>('HEALTHY');
  const [modalNewPackage, setModalNewPackage] = useState<string>('Comida');
  const [modalNewSiglas, setModalNewSiglas] = useState<string>('C');
  const [modalNewCustomPlanName, setModalNewCustomPlanName] = useState<string>('');
  const [modalNewCustomTiempos, setModalNewCustomTiempos] = useState<number>(1);
  const [modalExtraDishes, setModalExtraDishes] = useState<number>(0);

  // Dynamic Day Detection
  const [currentDayIndex, setCurrentDayIndex] = useState<number>(new Date().getDay());

  useEffect(() => {
    if (modalNewPackage !== 'Personalizado...') {
      const defaultSiglas = PACKAGE_SIGLAS[modalNewPackage];
      if (defaultSiglas) {
        setModalNewSiglas(defaultSiglas);
      }
    }
  }, [modalNewPackage]);

  useEffect(() => {
    // Keep day index updated
    setCurrentDayIndex(new Date().getDay());
    refreshData();
  }, []);

  const refreshData = async () => {
    setLoading(true);
    try {
      await fetchClientsAndDrivers(true);
    } catch (e) {
      console.error("Error fetching clients and drivers:", e);
    } finally {
      setLoading(false);
    }
  };

  const updateClientConfig = async (bizId: string, updates: Partial<any>) => {
    setSavingClientId(bizId);
    try {
      const biz = dbClients.find(c => c.id === bizId);
      if (!biz) return;

      const updatedEmail = serializeClientProfile(biz.email, updates);

      // Save atomically using the Zustand store (optimistic update and automatic sync!)
      await updateClientInStore({
        ...biz,
        email: updatedEmail
      });
    } catch (err) {
      console.error("Error updating client config:", err);
    } finally {
      setSavingClientId(null);
    }
  };

  const toggleAllClients = async (active: boolean) => {
    setLoading(true);
    try {
      const filtered = filteredClients;
      const updatedClients = [...dbClients];

      // Update filtered clients
      for (const biz of filtered) {
        let config = {
          planType: '',
          plansCount: 1,
          exclusions: 'Ninguna',
          siglas: 'C',
          driver: 'SIN ASIGNAR',
          isActive: true
        };

        if (biz.email && biz.email.startsWith('{') && biz.email.endsWith('}')) {
          try {
            config = { ...config, ...JSON.parse(biz.email) };
          } catch (e) {}
        }

        config.isActive = active;
        const updatedEmail = JSON.stringify(config);

        // Find index in main list and update
        const idx = updatedClients.findIndex(c => c.id === biz.id);
        if (idx !== -1) {
          updatedClients[idx].email = updatedEmail;
        }

        // Save to DB
        await updateBusiness({
          ...biz,
          email: updatedEmail
        });

        // Notify Google Sheet Webhook
        pushToGoogleSheets(biz.routeType as 'Matutina' | 'Vespertina', {
          name: biz.name,
          phone: biz.phone || '',
          address: biz.location || '',
          locationLink: biz.locationLink || '',
          coords: `${biz.lat}, ${biz.lng}`,
          planType: config.planType,
          plansCount: config.plansCount,
          exclusions: config.exclusions,
          siglas: config.siglas,
          driver: config.driver === 'SIN ASIGNAR' ? undefined : config.driver,
          isActive: active,
          bags: calculateBagsForClient(biz.email),
          tiempos: getClientTiempos(biz.email)
        });
      }

      setDbClients(updatedClients);

      // Toast notification
      showFeedbackToast(`🔄 ¡Se han ${active ? 'activado' : 'desactivado'} ${filtered.length} clientes masivamente!`);
    } catch (e) {
      console.error("Error bulk toggling clients:", e);
    } finally {
      setLoading(false);
    }
  };

  const showFeedbackToast = (message: string) => {
    const alertDiv = document.createElement('div');
    alertDiv.className = "fixed bottom-5 right-5 bg-purple-600 text-white font-bold text-xs py-3 px-6 rounded-2xl shadow-2xl z-50 animate-bounce";
    alertDiv.innerText = message;
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 3000);
  };

  const handleDownloadCSV = (routeType: 'Matutina' | 'Vespertina') => {
    // 1. Get all active clients from the specified route
    const activeClients = parsedClients.filter(c => c.isActive && c.routeType === routeType);

    // 2. Sort them by name
    const sortedClients = [...activeClients].sort((a, b) => {
      return (a.name || '').localeCompare(b.name || '');
    });

    // 3. Define headers in Spanish
    const headers = [
      'Nombre del Cliente',
      'Teléfono',
      'Dirección',
      'Enlace de Google Maps',
      'Coordenadas',
      'Chofer Asignado',
      'Plan Alimenticio',
      'Platillos al Día (Tiempos)',
      'Exclusiones / Alergias',
      'Bolsas (Ciclo 3 Días - Dom/Lun)',
      'Bolsas (Ciclo 2 Días - Mié/Jue)'
    ];

    // Helper to escape CSV values containing commas or quotes
    const escapeCSVValue = (val: any) => {
      if (val === null || val === undefined) return '';
      let str = String(val).trim();
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        str = '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    // 4. Generate CSV content
    const csvRows = [headers.join(',')];

    sortedClients.forEach(biz => {
      let extraDishes = 0;
      let sumTiempos = biz.tiempos || 1;
      let planType = biz.planType || 'NINGUNO';
      
      if (biz.email && biz.email.startsWith('{') && biz.email.endsWith('}')) {
        try {
          const parsed = JSON.parse(biz.email);
          extraDishes = parsed.extraDishes || 0;
        } catch (e) {}
      }

      const dishesSunMon = (sumTiempos * 3) + extraDishes;
      const bagsSunMon = Math.ceil(dishesSunMon / 6);

      const dishesWedThu = (sumTiempos * 2) + extraDishes;
      const bagsWedThu = Math.ceil(dishesWedThu / 6);

      const row = [
        biz.name,
        biz.phone || 'SIN TELÉFONO',
        biz.location || 'SIN DIRECCIÓN',
        biz.locationLink || '',
        biz.lat && biz.lng ? `${biz.lat}, ${biz.lng}` : '',
        biz.driver || 'SIN ASIGNAR',
        planType,
        sumTiempos,
        biz.exclusions || 'Ninguna',
        bagsSunMon,
        bagsWedThu
      ];

      csvRows.push(row.map(escapeCSVValue).join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n'); // UTF-8 BOM for Excel compatibility
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    link.setAttribute('download', `clientes_activos_ruta_${routeType.toLowerCase()}_healthy_dreams_${dateStr}.csv`);
    
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGoogleSheetsSync = async () => {
    setIsSyncingSheets(true);
    try {
      showFeedbackToast(`📥 Descargando datos de Excel para Ruta ${selectedRoute}...`);
      
      const sheetClients = await fetchClientsFromGoogleSheet(selectedRoute);
      if (sheetClients.length === 0) {
        showFeedbackToast(`⚠ No se obtuvieron registros de la hoja de cálculo.`);
        setIsSyncingSheets(false);
        return;
      }

      showFeedbackToast(`🔍 Analizando ${sheetClients.length} registros y sincronizando...`);

      const latestDbClients = await getBusinesses();
      const activeRouteDbClients = latestDbClients.filter(c => c.routeType === selectedRoute);

      const normalizeName = (name: string): string => {
        if (!name) return '';
        return name.toUpperCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w\s]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      };

      let newCount = 0;
      let updatedCount = 0;

      const driverNames = systemDrivers.map(d => d.name.toUpperCase().trim());

      for (const sheetClient of sheetClients) {
        const normalizedSheetName = normalizeName(sheetClient.name);
        
        const matchedDbClient = activeRouteDbClients.find(
          c => normalizeName(c.name) === normalizedSheetName
        );

        const { lat, lng } = parseCoordinates(sheetClient.coords);

        let finalDriver = 'SIN ASIGNAR';
        const sheetDriverUpper = sheetClient.driver.trim().toUpperCase();
        if (sheetDriverUpper) {
          const matchedDriver = driverNames.find(d => d === sheetDriverUpper || d.includes(sheetDriverUpper) || sheetDriverUpper.includes(d));
          if (matchedDriver) {
            finalDriver = matchedDriver;
          }
        }

        if (matchedDbClient) {
          const dbConfig = parseClientProfile(matchedDbClient.email);

          const statusChanged = dbConfig.isActive !== sheetClient.isActive;
          const phoneChanged = (matchedDbClient.phone || '') !== sheetClient.phone;
          const addressChanged = (matchedDbClient.location || '') !== sheetClient.address;
          const isSheetLinkValid = sheetClient.locationLink && sheetClient.locationLink.startsWith('http');
          const linkChanged = isSheetLinkValid && (matchedDbClient.locationLink || '') !== sheetClient.locationLink;
          const coordsChanged = Math.abs(matchedDbClient.lat - lat) > 0.0001 || Math.abs(matchedDbClient.lng - lng) > 0.0001;
          const driverChanged = dbConfig.driver !== finalDriver;
          const planChanged = dbConfig.planType !== sheetClient.planType;
          const tiemposChanged = dbConfig.tiempos !== sheetClient.tiempos;
          const exclusionsChanged = dbConfig.exclusions !== sheetClient.exclusions;
          const bagsChanged = dbConfig.plansCount !== sheetClient.bags;

          if (statusChanged || phoneChanged || addressChanged || linkChanged || coordsChanged || driverChanged || planChanged || tiemposChanged || exclusionsChanged || bagsChanged) {
            dbConfig.isActive = sheetClient.isActive;
            dbConfig.driver = finalDriver;
            dbConfig.planType = sheetClient.planType !== undefined ? sheetClient.planType : dbConfig.planType;
            dbConfig.tiempos = sheetClient.tiempos || dbConfig.tiempos;
            dbConfig.exclusions = sheetClient.exclusions !== undefined ? sheetClient.exclusions : dbConfig.exclusions;
            dbConfig.plansCount = sheetClient.bags !== undefined ? sheetClient.bags : dbConfig.plansCount;
            
            if (planChanged || tiemposChanged) {
              const defaultSiglas = PACKAGE_SIGLAS[sheetClient.planType] || 'C';
              dbConfig.siglas = defaultSiglas;
              dbConfig.package = sheetClient.planType;
              dbConfig.plans = [{
                id: 'plan-1',
                planType: sheetClient.planType,
                package: sheetClient.planType,
                siglas: defaultSiglas,
                tiempos: sheetClient.tiempos
              }];
            }

            const updatedEmail = JSON.stringify(dbConfig);

            await updateClientInStore({
              ...matchedDbClient,
              phone: sheetClient.phone || matchedDbClient.phone,
              location: sheetClient.address || matchedDbClient.location,
              locationLink: isSheetLinkValid ? sheetClient.locationLink : matchedDbClient.locationLink,
              lat: lat || matchedDbClient.lat,
              lng: lng || matchedDbClient.lng,
              email: updatedEmail
            });
            updatedCount++;
          }
        } else {
          const defaultSiglas = PACKAGE_SIGLAS[sheetClient.planType] || 'C';
          
          const newConfig = {
            planType: sheetClient.planType,
            plansCount: sheetClient.bags !== undefined ? sheetClient.bags : 1,
            exclusions: sheetClient.exclusions || 'Ninguna',
            siglas: defaultSiglas,
            driver: finalDriver,
            isActive: sheetClient.isActive,
            extraDishes: 0,
            tiempos: sheetClient.tiempos,
            package: sheetClient.planType,
            plans: [
              {
                id: 'plan-1',
                planType: sheetClient.planType,
                package: sheetClient.planType,
                siglas: defaultSiglas,
                tiempos: sheetClient.tiempos
              }
            ]
          };

          const newEmail = JSON.stringify(newConfig);

          await addBusiness({
            name: sheetClient.name,
            type: 'Other',
            location: sheetClient.address,
            lat: lat,
            lng: lng,
            phone: sheetClient.phone,
            email: newEmail,
            rfc: '',
            routeType: selectedRoute,
            locationLink: sheetClient.locationLink
          });
          newCount++;
        }
      }

      // DESACTIVACIÓN AUTORITATIVA: Desactivar clientes de Supabase que ya no figuran activos en Excel
      const sheetActiveNamesStrict = new Set(
        sheetClients
          .filter(sc => sc.isActive)
          .map(sc => sc.name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]/g, '').trim())
      );

      const latestBusinesses = await getBusinesses();
      const activeRouteDbClientsCurrent = latestBusinesses.filter(c => c.routeType === selectedRoute);
      let autoritativeDeactivated = 0;

      for (const dbc of activeRouteDbClientsCurrent) {
        let dbConfig = parseClientProfile(dbc.email);
        const isActiveInDb = dbConfig.isActive !== false;

        if (isActiveInDb) {
          const strictDbName = dbc.name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]/g, '').trim();
          
          if (!sheetActiveNamesStrict.has(strictDbName)) {
            dbConfig.isActive = false;
            await updateBusiness({
              ...dbc,
              email: JSON.stringify(dbConfig)
            });
            autoritativeDeactivated++;
          }
        }
      }

      await fetchClientsAndDrivers(true);
      
      let toastMsg = `✅ ¡Sincronización exitosa! +${newCount} nuevos, *${updatedCount} actualizados.`;
      if (autoritativeDeactivated > 0) {
        toastMsg += ` Se desactivaron ${autoritativeDeactivated} clientes removidos de Excel.`;
      }
      showFeedbackToast(toastMsg);
    } catch (e) {
      console.error('[ClientManager] Error syncing from Google Sheets:', e);
      showFeedbackToast('❌ Error al sincronizar datos con Google Sheets.');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Helper function to extract Google Sheet ID from URL
  const extractSheetId = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const handleDistributeSheets = async () => {
    setIsDistributing(true);
    try {
      showFeedbackToast(`🌌 Iniciando distribución de hojas de choferes (${selectedRoute})...`);
      
      // 1. Filter active clients for active route and active status
      const activeClientsForRoute = parsedClients.filter(c => 
        c.routeType === selectedRoute && 
        c.isActive
      );

      if (activeClientsForRoute.length === 0) {
        showFeedbackToast(`⚠ No hay clientes activos en la ruta ${selectedRoute} para distribuir.`);
        setIsDistributing(false);
        return;
      }

      // 2. Group clients by driver
      const groupedByDriver: { [driverName: string]: any[] } = {};
      activeClientsForRoute.forEach(c => {
        const driverName = c.driver.trim().toUpperCase() || 'SIN ASIGNAR';
        if (!groupedByDriver[driverName]) {
          groupedByDriver[driverName] = [];
        }
        groupedByDriver[driverName].push(c);
      });

      // 3. Match drivers with their database profiles to get sheetId
      const distributions: Array<any> = [];
      let unconfiguredDrivers: string[] = [];

      for (const [driverName, clientsList] of Object.entries(groupedByDriver)) {
        if (driverName === 'SIN ASIGNAR') {
          console.warn(`[Distribute] Skipping ${clientsList.length} clients with no driver assigned.`);
          continue;
        }

        // Find matching driver in database list
        const matchedDriverObj = systemDrivers.find(d => 
          d.name.trim().toUpperCase() === driverName
        );

        const sheetUrl = selectedRoute === 'Matutina' 
          ? matchedDriverObj?.morningSheetUrl 
          : matchedDriverObj?.eveningSheetUrl;

        const sheetId = extractSheetId(sheetUrl);

        if (!sheetId) {
          unconfiguredDrivers.push(driverName);
          continue;
        }

        distributions.push({
          driverName,
          sheetId,
          clients: clientsList.map((c, index) => ({
            orden: index + 1,
            name: c.name,
            phone: c.phone || '',
            address: c.location || '',
            locationLink: c.locationLink || '',
            coords: c.lat && c.lng ? `${c.lat}, ${c.lng}` : '',
            planType: c.planType || 'HEALTHY',
            tiempos: c.tiempos || 1,
            exclusions: c.exclusions || 'Ninguna',
            bags: c.plansCount || 1
          }))
        });
      }

      if (distributions.length === 0) {
        showFeedbackToast(`⚠ Ninguno de los choferes tiene su hoja de cálculo configurada.`);
        setIsDistributing(false);
        return;
      }

      showFeedbackToast(`🚀 Enviando datos de reparto a las hojas de ${distributions.length} choferes...`);
      
      const success = await distributeRoutesToGoogleSheets(selectedRoute, distributions);

      if (success) {
        let feedbackMsg = `✅ ¡Hojas distribuidas con éxito! Actualizadas hojas de ${distributions.length} choferes.`;
        if (unconfiguredDrivers.length > 0) {
          feedbackMsg += ` (Ignorados: ${unconfiguredDrivers.join(', ')} por falta de hoja).`;
        }
        showFeedbackToast(feedbackMsg);
      } else {
        showFeedbackToast(`❌ Error al conectar con Google Sheets para la distribución.`);
      }
    } catch (err) {
      console.error("Error distributing sheets:", err);
      showFeedbackToast(`❌ Excepción al distribuir hojas de repartidores.`);
    } finally {
      setIsDistributing(false);
    }
  };

  // Processed list of clients to avoid duplicate JSON parsing
  const parsedClients = useMemo(() => {
    return dbClients.map(biz => {
      let planType = '';
      let plansCount = 1;
      let exclusions = 'Ninguna';
      let siglas = 'C';
      let driver = 'SIN ASIGNAR';
      let isActive = true;
      let tiempos = 1;

      if (biz.email && biz.email.startsWith('{') && biz.email.endsWith('}')) {
        try {
          const parsed = JSON.parse(biz.email);
          planType = parsed.planType !== undefined ? parsed.planType : '';
          plansCount = parseInt(parsed.plansCount) || 1;
          exclusions = parsed.exclusions || 'Ninguna';
          siglas = parsed.siglas || 'C';
          driver = parsed.driver || 'SIN ASIGNAR';
          isActive = parsed.isActive !== false;
          tiempos = parsed.tiempos || 0;
          if (tiempos === 0 && parsed.plans && Array.isArray(parsed.plans)) {
            tiempos = parsed.plans.reduce((sum: number, p: any) => sum + (p.tiempos || 1), 0);
          }
          if (tiempos === 0) tiempos = 1;
        } catch (e) {}
      }

      return {
        ...biz,
        planType,
        plansCount,
        exclusions,
        siglas,
        driver,
        isActive,
        tiempos
      };
    });
  }, [dbClients]);

  // Dynamic extraction of unique drivers and plan types
  const uniqueDrivers = useMemo(() => {
    const drivers = new Set<string>();
    parsedClients.forEach(biz => {
      if (biz.driver) {
        drivers.add(biz.driver.toUpperCase().trim());
      }
    });
    return ['TODOS', ...Array.from(drivers).sort()];
  }, [parsedClients]);

  const uniquePlans = useMemo(() => {
    const plans = new Set<string>();
    parsedClients.forEach(biz => {
      if (biz.planType) {
        plans.add(biz.planType.toUpperCase().trim());
      }
    });
    return ['TODOS', ...Array.from(plans).sort()];
  }, [parsedClients]);

  const handleSort = (field: 'name' | 'plan' | 'tiempos' | 'driver' | 'status') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter and sort clients dynamically based on multiple criteria
  const filteredClients = useMemo(() => {
    // 1. Apply filters
    const filtered = parsedClients.filter(biz => {
      // Route filter
      if (biz.routeType !== selectedRoute) return false;

      // Status filter
      const targetActive = selectedStatus === 'ACTIVE';
      if (biz.isActive !== targetActive) return false;

      // Driver filter
      if (driverFilter !== 'TODOS' && biz.driver.toUpperCase() !== driverFilter.toUpperCase()) return false;

      // Plan filter
      if (planFilter !== 'TODOS' && biz.planType.toUpperCase() !== planFilter.toUpperCase()) return false;

      // Search match
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const nameMatch = (biz.name || '').toLowerCase().includes(query);
        const addressMatch = (biz.location || '').toLowerCase().includes(query);
        const planMatch = biz.planType.toLowerCase().includes(query);
        const driverMatch = biz.driver.toLowerCase().includes(query);
        return nameMatch || addressMatch || planMatch || driverMatch;
      }

      return true;
    });

    // 2. Sort list
    if (sortField) {
      filtered.sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        if (sortField === 'name') {
          valA = a.name || '';
          valB = b.name || '';
        } else if (sortField === 'plan') {
          valA = a.planType || '';
          valB = b.planType || '';
        } else if (sortField === 'tiempos') {
          valA = a.tiempos || 0;
          valB = b.tiempos || 0;
        } else if (sortField === 'driver') {
          valA = a.driver || '';
          valB = b.driver || '';
        } else if (sortField === 'status') {
          valA = a.isActive ? 1 : 0;
          valB = b.isActive ? 1 : 0;
        }

        let comparison = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else {
          comparison = String(valA).localeCompare(String(valB), 'es', { numeric: true, sensitivity: 'base' });
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [parsedClients, searchQuery, selectedRoute, selectedStatus, driverFilter, planFilter, sortField, sortDirection]);

  const openEditModal = (client: any) => {
    setEditingClient(client);
    
    // Parse client config from biz.email JSON string
    let planType = '';
    let plansCount = 1;
    let exclusions = 'Ninguna';
    let siglas = 'C';
    let driver = 'SIN ASIGNAR';
    let extraDishes = 0;
    let plans: PlanItem[] = [];

    if (client.email && client.email.startsWith('{') && client.email.endsWith('}')) {
      try {
        const parsed = JSON.parse(client.email);
        planType = parsed.planType !== undefined ? parsed.planType : '';
        plansCount = parseInt(parsed.plansCount) || 1;
        exclusions = parsed.exclusions || 'Ninguna';
        siglas = parsed.siglas || 'C';
        driver = parsed.driver || 'SIN ASIGNAR';
        extraDishes = parseInt(parsed.extraDishes) || 0;
        
        if (parsed.plans && Array.isArray(parsed.plans)) {
          plans = parsed.plans;
        }
      } catch (e) {}
    }

    // Backwards compatibility for legacy clients that don't have the "plans" array yet
    if (plans.length === 0) {
      plans = [{
        id: 'legacy-1',
        planType: planType,
        package: 'Comida', // fallback
        siglas: siglas,
        tiempos: 1
      }];
    }

    setModalDriver(driver);
    setModalExclusions(exclusions);
    setModalPlansList(plans);
    setModalNewPlanType('HEALTHY');
    setModalNewPackage('Comida');
    setModalNewSiglas('C');
    setModalNewCustomPlanName('');
    setModalNewCustomTiempos(1);
    setModalExtraDishes(extraDishes);
  };

  const handleSaveModal = async () => {
    if (!editingClient) return;

    let isActive = true;
    if (editingClient.email && editingClient.email.startsWith('{') && editingClient.email.endsWith('}')) {
      try {
        const parsed = JSON.parse(editingClient.email);
        isActive = parsed.isActive !== false;
      } catch (e) {}
    }

    const finalPlanType = modalPlansList.map(p => p.planType).join(' + ') || 'NINGUNO';
    const finalSiglas = modalPlansList.map(p => p.siglas).join(' + ') || 'C';
    const finalPackage = modalPlansList.map(p => p.package).join(' + ') || 'Comida';
    const totalPlansCount = modalPlansList.length;
    const sumTiempos = modalPlansList.reduce((acc, plan) => acc + plan.tiempos, 0);

    // Recalculate bags
    const dishesSunMon = (sumTiempos * 3) + modalExtraDishes;
    const bagsSunMon = Math.ceil(dishesSunMon / 6);
    
    const dishesWedThu = (sumTiempos * 2) + modalExtraDishes;
    const bagsWedThu = Math.ceil(dishesWedThu / 6);
    
    const dayOfWeek = new Date().getDay();
    const isSundayOrMonday = dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 2;
    const activeBags = isSundayOrMonday ? bagsSunMon : bagsWedThu;

    // Save configuration in Supabase & update local state
    await updateClientConfig(editingClient.id, {
      planType: finalPlanType.toUpperCase(),
      plansCount: totalPlansCount,
      siglas: finalSiglas.toUpperCase(),
      driver: modalDriver.toUpperCase(),
      exclusions: modalExclusions,
      isActive: isActive,
      extraDishes: modalExtraDishes,
      tiempos: sumTiempos,
      package: finalPackage,
      plans: modalPlansList
    });

    // Notify GAS Webhook to sync Google Sheets
    pushToGoogleSheets(editingClient.routeType as 'Matutina' | 'Vespertina', {
      name: editingClient.name,
      phone: editingClient.phone || '',
      address: editingClient.location || '',
      locationLink: editingClient.locationLink || '',
      coords: `${editingClient.lat}, ${editingClient.lng}`,
      planType: finalPlanType.toUpperCase(),
      plansCount: totalPlansCount,
      exclusions: modalExclusions,
      siglas: finalSiglas.toUpperCase(),
      driver: modalDriver.toUpperCase(),
      isActive: isActive,
      bags: activeBags,
      tiempos: sumTiempos
    });

    setEditingClient(null);
    showFeedbackToast(`💾 ¡Configuración de ${editingClient.name.toUpperCase()} guardada y sincronizada!`);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f8fafc] overflow-y-auto p-4 md:p-8 custom-scrollbar">
      
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl text-purple-600 bg-purple-50 p-2 rounded-2xl shadow-sm">group</span>
            Gestión de Clientes
          </h1>
          <p className="text-slate-500 font-medium mt-1 ml-1">Activa o desactiva clientes semanalmente y sincroniza de inmediato con las hojas de ruta en Excel.</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={refreshData}
            className="flex items-center gap-2 px-5 py-3 bg-slate-900 border border-slate-800 hover:bg-black text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all hover:-translate-y-0.5"
          >
            <span className="material-symbols-outlined text-[18px]">sync</span>
            Sincronizar DB
          </button>

          <button 
            onClick={() => navigate('/etiquetas')}
            className="flex items-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg hover:shadow-purple-600/20 transition-all hover:-translate-y-0.5"
          >
            <span className="material-symbols-outlined text-[18px]">label</span>
            Generar Etiquetas
          </button>
        </div>
      </div>

      {/* ── CLIENT ACTIVATION MANAGEMENT ─────────────────────────────────────── */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-6 mb-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">group</span>
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                Planificación Semanal de Clientes
                <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full">
                  {loading ? 'Cargando...' : `${filteredClients.length} Filtrados / ${dbClients.length} Total`}
                </span>
              </h3>
              <p className="text-xs font-semibold text-slate-500">Activa/desactiva clientes y gestiona sus datos. Cambios en tiempo real con Supabase y Excel.</p>
            </div>
          </div>

        </div>

        <div className="pt-4 space-y-5">
          
          {/* ── MENUS & FILTERS ────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            
            {/* PRIMARY TABS: Route Selector */}
            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 gap-1">
              <button
                onClick={() => setSelectedRoute('Matutina')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                  selectedRoute === 'Matutina'
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/10'
                    : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">wb_twilight</span>
                Ruta Matutina (L/J)
              </button>
              <button
                onClick={() => setSelectedRoute('Vespertina')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                  selectedRoute === 'Vespertina'
                    ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md shadow-amber-500/10'
                    : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">wb_sunny</span>
                Ruta Vespertina (D/M)
              </button>
            </div>

            {/* SECONDARY SUBMENU & SEARCH */}
            <div className="flex flex-col xl:flex-row gap-4 justify-between items-stretch xl:items-center">
              
              {/* Secondary Submenu Group with Sync and Distribute Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 self-start xl:self-auto">
                {/* Secondary Submenu: Activos / Inactivos capsule-tabs */}
                <div className="flex bg-slate-100/70 p-0.5 rounded-lg border border-slate-200/50 gap-0.5 shrink-0">
                  <button
                    onClick={() => setSelectedStatus('ACTIVE')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${
                      selectedStatus === 'ACTIVE'
                        ? 'bg-white text-emerald-650 shadow-sm border border-emerald-100'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
                    Activos
                  </button>
                  <button
                    onClick={() => setSelectedStatus('INACTIVE')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${
                      selectedStatus === 'INACTIVE'
                        ? 'bg-white text-rose-650 shadow-sm border border-rose-100'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50"></span>
                    Inactivos
                  </button>
                </div>

                {/* Sincronizar Excel Button */}
                <button
                  onClick={handleGoogleSheetsSync}
                  disabled={isSyncingSheets}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${
                    isSyncingSheets 
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-200 hover:-translate-y-0.5 active:scale-95 shadow-sm'
                  }`}
                  title="Sincronizar cambios manuales de Excel (rutas/inactivos) a la base de datos"
                >
                  <span className={`material-symbols-outlined text-[14px] ${isSyncingSheets ? 'animate-spin' : ''}`}>sync</span>
                  {isSyncingSheets ? 'Sincronizando...' : 'Sincronizar con Excel'}
                </button>

                {/* Distribute Drivers Sheets Button */}
                <button
                  onClick={handleDistributeSheets}
                  disabled={isDistributing}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${
                    isDistributing 
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-100 text-purple-700 hover:from-purple-100 hover:to-indigo-100 hover:border-purple-200 hover:-translate-y-0.5 active:scale-95 shadow-sm shadow-purple-100'
                  }`}
                  title="Llenar y actualizar automáticamente las hojas de cálculo individuales de cada repartidor asignado en esta ruta"
                >
                  <span className={`material-symbols-outlined text-[14px] ${isDistributing ? 'animate-spin' : ''}`}>auto_awesome</span>
                  {isDistributing ? 'Distribuyendo...' : 'Distribuir Hojas'}
                </button>

                {/* Descargar Ruta Matutina Button */}
                <button
                  onClick={() => handleDownloadCSV('Matutina')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-100 text-blue-700 hover:bg-blue-100 hover:border-blue-200 hover:-translate-y-0.5 active:scale-95 shadow-sm rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0"
                  title="Descargar lista de todos los clientes activos de la Ruta Matutina en CSV"
                >
                  <span className="material-symbols-outlined text-[14px]">wb_twilight</span>
                  Descargar Matutina (CSV)
                </button>

                {/* Descargar Ruta Vespertina Button */}
                <button
                  onClick={() => handleDownloadCSV('Vespertina')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-100 text-amber-700 hover:bg-amber-100 hover:border-amber-200 hover:-translate-y-0.5 active:scale-95 shadow-sm rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0"
                  title="Descargar lista de todos los clientes activos de la Ruta Vespertina en CSV"
                >
                  <span className="material-symbols-outlined text-[14px]">wb_sunny</span>
                  Descargar Vespertina (CSV)
                </button>
              </div>

              {/* Search Bar */}
              <div className="flex-1 relative w-full xl:w-auto">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">search</span>
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre o dirección..."
                  className="w-full pl-9 pr-4 py-1.5 text-xs border border-slate-200 focus:border-purple-500 bg-slate-50 focus:bg-white rounded-lg focus:outline-none transition-all font-medium text-slate-800"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
            </div>

            {/* ADVANCED FILTERS ROW */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 bg-slate-50 border border-slate-100 p-1.5 px-3 rounded-xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 self-start sm:self-auto pt-1 sm:pt-0 shrink-0 select-none">
                <span className="material-symbols-outlined text-[14px] text-purple-650">filter_alt</span>
                Filtros avanzados:
              </span>
              
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5 w-full sm:w-auto flex-1">
                {/* Repartidor Select Dropdown */}
                <div className="relative flex-1 sm:max-w-[200px]">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-650 text-[14px]">sports_motorsports</span>
                  <select
                    value={driverFilter}
                    onChange={(e) => setDriverFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-purple-500 rounded-lg pl-8 pr-7 py-1.5 text-[11px] font-bold text-slate-700 focus:outline-none transition-all appearance-none cursor-pointer"
                  >
                    {uniqueDrivers.map(driver => (
                      <option key={driver} value={driver}>
                        {driver === 'TODOS' ? 'CHOFER: TODOS' : driver}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[14px]">unfold_more</span>
                </div>

                {/* Plan Select Dropdown */}
                <div className="relative flex-1 sm:max-w-[200px]">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-650 text-[14px]">restaurant</span>
                  <select
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-purple-500 rounded-lg pl-8 pr-7 py-1.5 text-[11px] font-bold text-slate-700 focus:outline-none transition-all appearance-none cursor-pointer"
                  >
                    {uniquePlans.map(plan => (
                      <option key={plan} value={plan}>
                        {plan === 'TODOS' ? 'PLAN: TODOS' : plan}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[16px]">unfold_more</span>
                </div>
                
                {/* Limpiar Filtros Button */}
                {(driverFilter !== 'TODOS' || planFilter !== 'TODOS' || searchQuery !== '') && (
                  <button
                    onClick={() => {
                      setDriverFilter('TODOS');
                      setPlanFilter('TODOS');
                      setSearchQuery('');
                    }}
                    className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-4 py-2 border border-purple-250 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all hover:-translate-y-0.5 active:scale-95 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
                    Limpiar
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* GLASSMORPHIC ROW COUNT SUMMARY CARD */}
        {!loading && (
          <div className="bg-gradient-to-r from-white to-slate-50 border border-slate-150 p-2 px-3.5 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm select-none mb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-600 bg-purple-50 p-1.5 rounded-lg shadow-sm text-[18px]">bar_chart</span>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Resumen de registros</span>
                <h4 className="text-xs font-black text-slate-800 tracking-tight mt-0.5 flex items-center gap-1.5">
                  Mostrando <strong className="text-purple-650 text-xs md:text-sm font-black">{filteredClients.length}</strong> de <strong className="text-slate-650 font-bold">{parsedClients.filter(c => c.routeType === selectedRoute && (selectedStatus === 'ACTIVE' ? c.isActive !== false : c.isActive === false)).length}</strong> clientes en la lista actual.
                </h4>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border ${
                selectedStatus === 'ACTIVE'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full ${selectedStatus === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`}></span>
                Ruta {selectedRoute === 'Matutina' ? 'Matutina 🌅' : 'Vespertina 🌇'} • {selectedStatus === 'ACTIVE' ? '🟢 Activos' : '🔴 Inactivos'}
              </span>
            </div>
          </div>
        )}

        <div className="pt-4 space-y-5">

          {/* List Loader / Grid */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-600 border-t-transparent mb-3"></div>
              <p className="text-xs font-bold text-slate-500">Cargando base de clientes...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
              <span className="material-symbols-outlined text-4xl text-slate-350">search_off</span>
              <p className="text-xs font-bold text-slate-500 mt-2">No se encontraron clientes para esta sección.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-1.5 scrollbar-thin">
              {/* Header Titles (Hidden on Mobile) */}
              <div className="hidden lg:flex items-center gap-4 px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-widest select-none">
                {/* 1. Toggle Switch Header */}
                <div className="w-12 shrink-0 text-center">Estado</div>

                {/* 2. Sortable grid column headers aligning with row contents */}
                <div className="flex-1 min-w-0 flex items-center gap-4">
                  {/* Name Column */}
                  <button 
                    onClick={() => handleSort('name')} 
                    className="w-[16%] min-w-[150px] shrink-0 flex items-center gap-1 hover:text-purple-650 transition-colors text-left font-black"
                  >
                    <span>Cliente</span>
                    <span className="material-symbols-outlined text-[14px]">
                      {sortField === 'name' ? (sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                    </span>
                  </button>

                  {/* Address Column (Non-sortable descriptive field) */}
                  <div className="flex-1 text-left">
                    Dirección
                  </div>

                  {/* Plan Column */}
                  <button 
                    onClick={() => handleSort('plan')} 
                    className="w-[15%] min-w-[130px] shrink-0 flex items-center gap-1 hover:text-purple-650 transition-colors text-left font-black"
                  >
                    <span>Plan</span>
                    <span className="material-symbols-outlined text-[14px]">
                      {sortField === 'plan' ? (sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                    </span>
                  </button>

                  {/* Tiempos Column */}
                  <button 
                    onClick={() => handleSort('tiempos')} 
                    className="w-[18%] min-w-[160px] shrink-0 flex items-center gap-1 hover:text-purple-650 transition-colors text-left font-black"
                  >
                    <span>Tiempos / Siglas</span>
                    <span className="material-symbols-outlined text-[14px]">
                      {sortField === 'tiempos' ? (sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                    </span>
                  </button>

                  {/* Repartidor Column */}
                  <button 
                    onClick={() => handleSort('driver')} 
                    className="w-[16%] min-w-[140px] shrink-0 flex items-center gap-1 hover:text-purple-650 transition-colors text-left font-black"
                  >
                    <span>Repartidor</span>
                    <span className="material-symbols-outlined text-[14px]">
                      {sortField === 'driver' ? (sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                    </span>
                  </button>
                </div>

                {/* 3. Action Button Header */}
                <div className="w-32 shrink-0 text-center">Configurar</div>
              </div>

              {/* Rows */}
              {filteredClients.map((biz) => {
                const { planType, plansCount, exclusions, siglas, driver, isActive } = biz;


                const isMorning = biz.routeType === 'Matutina';

                return (
                  <div
                    key={biz.id}
                    className={`relative flex flex-col lg:flex-row lg:items-center justify-between gap-2 md:gap-3 p-2 md:p-2.5 px-3 md:px-4 rounded-xl border transition-all ${
                      isActive 
                        ? 'bg-white border-slate-200/80 shadow-sm hover:border-purple-300 hover:shadow-md hover:shadow-purple-500/5' 
                        : 'bg-slate-50/50 border-slate-200/60 opacity-60'
                    }`}
                  >
                    {/* Saving Indicator */}
                    {savingClientId === biz.id && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 text-[8px] bg-purple-600 text-white font-bold py-0.5 px-2 rounded-full animate-pulse z-20">
                        <span>Sincronizando...</span>
                      </div>
                    )}

                    {/* Left side content: Toggle + Row Columns */}
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4 flex-1 min-w-0">
                      
                      {/* 1. Toggle Switch */}
                      <div className="pt-0.5 shrink-0 flex items-center">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={async (e) => {
                              const val = e.target.checked;
                              
                              // Reactively update locally & Supabase
                              await updateClientConfig(biz.id, { isActive: val });
                              
                              // Instantly mirror to GAS Webhook Google Sheet
                              pushToGoogleSheets(biz.routeType as 'Matutina' | 'Vespertina', {
                                name: biz.name,
                                phone: biz.phone || '',
                                address: biz.location || '',
                                locationLink: biz.locationLink || '',
                                coords: `${biz.lat}, ${biz.lng}`,
                                planType: planType,
                                plansCount: plansCount,
                                exclusions: exclusions,
                                siglas: siglas,
                                driver: driver === 'SIN ASIGNAR' ? undefined : driver,
                                isActive: val,
                                bags: calculateBagsForClient(biz.email),
                                tiempos: getClientTiempos(biz.email)
                              });
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-purple-600 animate-transition"></div>
                        </label>
                      </div>

                      {/* 2. Unified Row Columns: Name, Address, Plan, Tiempos, Driver */}
                      <div className="flex-1 min-w-0 flex flex-col lg:flex-row lg:items-center gap-2 md:gap-3">
                        
                        {/* A. Name & Route Type Column */}
                        <div className="w-full lg:w-[16%] lg:min-w-[150px] shrink-0 flex flex-col gap-0.5 min-w-0">
                          <h4 className="text-xs md:text-sm font-black text-slate-900 uppercase tracking-tight truncate" title={biz.name || ''}>
                            {(biz.name || '').toUpperCase()}
                          </h4>
                          <div>
                            <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${
                              isMorning 
                                ? 'bg-blue-50 text-blue-750 border border-blue-200' 
                                : 'bg-amber-50 text-amber-750 border border-amber-250'
                            }`}>
                              {isMorning ? '🌅 Matutina' : '🌇 Vespertina'}
                            </span>
                          </div>
                        </div>

                        {/* B. Address Card Column */}
                        <div className="w-full lg:flex-1 min-w-0 text-xs text-slate-700 font-bold flex items-start gap-2 p-1.5 px-2.5 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100/50 hover:border-slate-200 transition-all duration-200" title={biz.location}>
                          <span className="material-symbols-outlined text-[16px] text-purple-650 bg-purple-100 p-1 rounded-lg shrink-0 shadow-sm border border-purple-200/30">location_on</span>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[8px] font-black text-slate-455 uppercase tracking-widest leading-none mb-0.5">Dirección</span>
                            <span className="text-[11px] md:text-xs font-black text-slate-800 leading-tight break-words">
                              {biz.location || "Sin dirección registrada"}
                            </span>
                            {biz.locationLink && (
                              <a 
                                href={biz.locationLink} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-[9px] text-purple-650 hover:text-purple-750 hover:underline flex items-center gap-1 mt-1 font-black tracking-wide"
                              >
                                <span className="material-symbols-outlined text-[10px]">map</span>
                                Abrir mapa
                              </a>
                            )}
                          </div>
                        </div>

                        {/* C. Logistics Badges - Horizontal on Desktop */}
                        {isActive ? (
                          <>
                            {/* Plan Card */}
                            <div className="w-full lg:w-[15%] lg:min-w-[130px] shrink-0 bg-gradient-to-br from-purple-50/70 to-purple-50/30 text-purple-900 border border-purple-200/50 p-1.5 px-2.5 rounded-lg flex items-center gap-2 select-none shadow-sm hover:shadow hover:border-purple-300 transition-all duration-200">
                              <span className="material-symbols-outlined text-[16px] text-purple-650 bg-purple-100 p-1 rounded-lg border border-purple-200/20 shrink-0">restaurant</span>
                              <div className="flex flex-col text-left min-w-0">
                                <span className="text-[7px] font-black uppercase tracking-wider text-purple-500/85 leading-none">Plan</span>
                                <span className="text-[11px] font-black mt-0.5 uppercase text-purple-950 truncate">{planType || 'NINGUNO'}</span>
                              </div>
                            </div>

                            {/* Tiempos / Siglas Card */}
                            <div className="w-full lg:w-[18%] lg:min-w-[160px] shrink-0 bg-gradient-to-br from-indigo-50/70 to-indigo-50/30 text-indigo-900 border border-indigo-200/50 p-1.5 px-2.5 rounded-lg flex items-center gap-2 select-none shadow-sm hover:shadow hover:border-indigo-300 transition-all duration-200">
                              <span className="material-symbols-outlined text-[16px] text-indigo-650 bg-indigo-100 p-1 rounded-lg border border-indigo-200/20 shrink-0">nutrition</span>
                              <div className="flex flex-col text-left min-w-0">
                                <span className="text-[7px] font-black uppercase tracking-wider text-indigo-500/85 leading-none">Tiempos / Siglas</span>
                                <span className="text-[11px] font-black mt-0.5 text-indigo-950 flex items-center gap-1 truncate">
                                  <span>{plansCount} {plansCount === 1 ? 'V' : 'Vs'}</span>
                                  <span className="font-mono text-[8px] text-indigo-700 bg-white border border-indigo-200 px-1 py-0.25 rounded font-black shadow-sm shrink-0">{siglas}</span>
                                </span>
                              </div>
                            </div>

                            {/* Repartidor Card */}
                            <div className={`w-full lg:w-[16%] lg:min-w-[140px] shrink-0 border p-1.5 px-2.5 rounded-lg flex items-center gap-2 select-none shadow-sm hover:shadow transition-all duration-200 ${
                              driver === 'SIN ASIGNAR'
                                ? 'bg-gradient-to-br from-rose-50/80 to-rose-50/40 text-rose-800 border-rose-200/60 animate-pulse'
                                : 'bg-gradient-to-br from-emerald-50/70 to-emerald-50/30 text-emerald-900 border-emerald-250/50 hover:border-emerald-350'
                            }`}>
                              <span className={`material-symbols-outlined text-[16px] p-1 rounded-lg border shrink-0 ${
                                driver === 'SIN ASIGNAR' 
                                  ? 'text-rose-650 bg-rose-100 border-rose-200/20' 
                                  : 'text-emerald-650 bg-emerald-100 border-emerald-200/20'
                              }`}>
                                {driver === 'SIN ASIGNAR' ? 'warning' : 'sports_motorsports'}
                              </span>
                              <div className="flex flex-col text-left min-w-0">
                                <span className={`text-[7px] font-black uppercase tracking-wider leading-none ${
                                  driver === 'SIN ASIGNAR' ? 'text-rose-500' : 'text-emerald-650'
                                }`}>Repartidor</span>
                                <span className="text-[11px] font-black mt-0.5 uppercase text-slate-800 truncate">{driver}</span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="w-full lg:flex-1 lg:max-w-md bg-slate-100 text-slate-500 border border-slate-200 p-2 rounded-lg shrink-0 select-none flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest">
                            <span className="material-symbols-outlined text-[16px] text-slate-400">pause_circle</span>
                            <span>PAUSADO E INACTIVO</span>
                          </div>
                        )}

                      </div>
                    </div>

                    {/* 3. Action Icon to Edit Column Configurations */}
                    <div className="w-full lg:w-32 shrink-0 flex items-center justify-end lg:justify-center border-t lg:border-t-0 pt-2 lg:pt-0 border-slate-100">
                      <button
                        type="button"
                        onClick={() => openEditModal(biz)}
                        className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 w-full lg:w-auto bg-slate-900 border border-slate-800 text-white hover:bg-purple-600 hover:border-purple-500 rounded-lg transition-all shadow-sm hover:shadow-purple-500/20 active:scale-95 group font-black text-[10px] uppercase tracking-widest"
                        title="Editar Columnas Completas"
                      >
                        <span className="material-symbols-outlined text-[16px] group-hover:rotate-12 transition-transform">edit_note</span>
                        <span>Configurar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── COMPLETE COLUMNS EDITOR MODAL ────────────────────────────────────── */}
      {editingClient && (() => {
        const isMorning = editingClient.routeType === 'Matutina';

        return (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-[#051024] text-white w-full max-w-xl max-h-[90vh] rounded-[2rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              
              {/* Modal Header */}
              <div className="p-6 pb-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-purple-950/20 to-indigo-950/20 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                    <span className="material-symbols-outlined text-[22px]">edit_note</span>
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-purple-400">Editar Columnas</h3>
                    <h2 className="text-base font-black text-white truncate max-w-[280px] uppercase mt-0.5" title={editingClient.name}>
                      {editingClient.name}
                    </h2>
                  </div>
                </div>
                
                <button
                  onClick={() => setEditingClient(null)}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                
                {/* Client Information Banner */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-white/40">Datos del Cliente</span>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
                      isMorning 
                        ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' 
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    }`}>
                      {isMorning ? '🌅 Matutina (L/J)' : '🌇 Vespertina (D/M)'}
                    </span>
                  </div>
                  
                  <div className="space-y-1 mt-0.5">
                    <div className="flex items-start gap-1.5 text-[11px] font-semibold text-white/80">
                      <span className="material-symbols-outlined text-purple-400 text-[15px] shrink-0 mt-0.5">location_on</span>
                      <span>{editingClient.location}</span>
                    </div>
                  </div>
                </div>

                {/* Repartidor */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black uppercase tracking-wider text-white/55">Repartidor</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-purple-400 text-[18px]">sports_motorsports</span>
                      <select
                        className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all appearance-none"
                        value={modalDriver}
                        onChange={(e) => setModalDriver(e.target.value.toUpperCase())}
                      >
                        <option value="SIN ASIGNAR" className="bg-slate-900">SIN ASIGNAR</option>
                        {systemDrivers.map((d) => (
                          <option key={d.id} value={(d.name || '').toUpperCase()} className="bg-slate-900">
                            {(d.name || '').toUpperCase()}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none text-[16px]">unfold_more</span>
                    </div>
                  </div>
                </div>

                {/* Dynamic Plans Manager Panel */}
                <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 mt-2 space-y-4">
                  <label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">restaurant_menu</span>
                    Planes Alimenticios ({modalPlansList.length})
                  </label>

                  {modalPlansList.length === 0 ? (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg text-center font-bold">
                      No has agregado ningún plan. Debes agregar al menos uno para guardar los cambios.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                      {modalPlansList.map((plan) => (
                        <div key={plan.id} className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-lg group hover:border-blue-500/30 transition-all">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="bg-blue-500/20 text-blue-300 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                {plan.planType}
                              </span>
                              <span className="text-xs text-white font-bold">{plan.package}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-gray-400 font-mono mt-0.5">
                              <span>Siglas: <strong className="text-gray-200 font-bold">{plan.siglas}</strong></span>
                              <span>•</span>
                              <span>Platos/día: <strong className="text-gray-200 font-bold">{plan.tiempos}</strong></span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setModalPlansList(modalPlansList.filter(p => p.id !== plan.id));
                            }}
                            className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 animate-fade-in"
                            title="Eliminar este plan"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Form for adding a new plan */}
                  <div className="border-t border-white/10 pt-4 space-y-3">
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      Configurar e Incorporar Nuevo Plan
                    </label>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Tipo de Plan</label>
                        <select
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={modalNewPlanType}
                          onChange={(e) => {
                            setModalNewPlanType(e.target.value);
                            if (e.target.value !== 'PERSONALIZADO') {
                              setModalNewCustomPlanName('');
                            }
                          }}
                        >
                          <option value="HEALTHY">HEALTHY</option>
                          <option value="SLIM">SLIM</option>
                          <option value="STRONG">STRONG</option>
                          <option value="PERSONALIZADO">OTRO PLAN...</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Paquete Contratado</label>
                        <select
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={modalNewPackage}
                          onChange={(e) => {
                            const pkg = e.target.value;
                            setModalNewPackage(pkg);
                            if (pkg !== 'Personalizado...') {
                              setModalNewSiglas(PACKAGE_SIGLAS[pkg] || '');
                            }
                          }}
                        >
                          <option value="Comida">Comida (1 tiempo)</option>
                          <option value="Comida + Cena">Comida + Cena (2 tiempos)</option>
                          <option value="Desayuno + Comida">Desayuno + Comida (2 tiempos)</option>
                          <option value="Desayuno + Comida + Cena">Desayuno + Comida + Cena (3 tiempos)</option>
                          <option value="Desayuno + Cena">Desayuno + Cena (2 tiempos)</option>
                          <option value="Desayuno">Desayuno (1 tiempo)</option>
                          <option value="Cena">Cena (1 tiempo)</option>
                          <option value="Personalizado...">Personalizado / Otro...</option>
                        </select>
                      </div>
                    </div>

                    {modalNewPlanType === 'PERSONALIZADO' && (
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Nombre del Plan Personalizado</label>
                        <input
                          type="text"
                          placeholder="Ej: KETO, VEGAN..."
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase font-bold"
                          value={modalNewCustomPlanName}
                          onChange={(e) => setModalNewCustomPlanName(e.target.value)}
                        />
                      </div>
                    )}

                    {modalNewPackage === 'Personalizado...' && (
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Tiempos del Plan (Platillos por día)</label>
                        <input
                          type="number"
                          min="1"
                          placeholder="Ej: 4, 5"
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                          value={modalNewCustomTiempos}
                          onChange={(e) => setModalNewCustomTiempos(parseInt(e.target.value) || 1)}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Siglas de Comida (Referencia)</label>
                        <input
                          type="text"
                          disabled
                          placeholder="Ej: C"
                          className="w-full bg-black/20 border border-white/5 rounded-lg px-2.5 py-2 text-xs text-gray-400 uppercase font-mono cursor-not-allowed"
                          value={modalNewSiglas}
                        />
                      </div>
                      
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => {
                            const finalPlanType = modalNewPlanType === 'PERSONALIZADO' 
                              ? (modalNewCustomPlanName.trim().toUpperCase() || 'OTRO') 
                              : modalNewPlanType;
                            
                            const finalTiempos = modalNewPackage === 'Personalizado...' 
                              ? modalNewCustomTiempos 
                              : (PACKAGE_TIEMPOS[modalNewPackage] || 1);

                            const newPlanItem: PlanItem = {
                              id: Date.now().toString(),
                              planType: finalPlanType,
                              package: modalNewPackage,
                              siglas: modalNewSiglas || 'C',
                              tiempos: finalTiempos
                            };

                            setModalPlansList([...modalPlansList, newPlanItem]);

                            // Reset custom inputs
                            if (modalNewPlanType === 'PERSONALIZADO') {
                              setModalNewCustomPlanName('');
                            }
                          }}
                          className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 border border-white/5"
                        >
                          <span className="material-symbols-outlined text-[14px]">add_circle</span>
                          Agregar Plan
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exclusions / Allergies */}
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-black uppercase tracking-wider text-white/55">Exclusiones / Alergias</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-purple-400 text-[18px]">warning</span>
                    <textarea
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-white focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all placeholder-white/30 resize-none"
                      placeholder="Ninguna (Ej. Sin gluten, no picante...)"
                      value={modalExclusions}
                      onChange={(e) => setModalExclusions(e.target.value)}
                    />
                  </div>
                </div>

                {/* Real-time Bags Calculator Card */}
                {(() => {
                  const sumTiempos = modalPlansList.reduce((acc, plan) => acc + plan.tiempos, 0);
                  const dishesSunMon = (sumTiempos * 3) + modalExtraDishes;
                  const bagsSunMon = Math.ceil(dishesSunMon / 6);
                  
                  const dishesWedThu = (sumTiempos * 2) + modalExtraDishes;
                  const bagsWedThu = Math.ceil(dishesWedThu / 6);
                  
                  const isSundayOrMonday = currentDayIndex === 0 || currentDayIndex === 1 || currentDayIndex === 2;
                  
                  return (
                    <div className="bg-pink-500/5 border border-pink-500/10 rounded-xl p-4 mt-2 space-y-3">
                      <label className="block text-[10px] font-black text-pink-400 uppercase tracking-widest flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
                        Cálculo de Bolsas en Tiempo Real
                      </label>
                      
                      {/* Sunday/Monday */}
                      <div className={`flex items-center justify-between p-3 rounded-lg border transition-all ${isSundayOrMonday ? 'bg-pink-500/10 border-pink-500/30' : 'bg-black/20 border-white/5 opacity-70'}`}>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">Entrega Domingo / Lunes</span>
                            {isSundayOrMonday && (
                              <span className="bg-pink-500 text-white font-black text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">ACTIVA</span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono">
                            3 días × ({sumTiempos} platillos/día) + {modalExtraDishes} extras = {dishesSunMon} platillos
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="bg-pink-500/20 text-pink-300 font-mono font-black text-sm px-3 py-1.5 rounded-lg border border-pink-500/30 flex items-center gap-1">
                            {bagsSunMon} <span className="text-[10px] font-bold">{bagsSunMon === 1 ? 'BOLSA' : 'BOLSAS'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Wednesday/Thursday */}
                      <div className={`flex items-center justify-between p-3 rounded-lg border transition-all ${!isSundayOrMonday ? 'bg-pink-500/10 border-pink-500/30' : 'bg-black/20 border-white/5 opacity-70'}`}>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">Entrega Miércoles / Jueves</span>
                            {!isSundayOrMonday && (
                              <span className="bg-pink-500 text-white font-black text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">ACTIVA</span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono">
                            2 días × ({sumTiempos} platillos/día) + {modalExtraDishes} extras = {dishesWedThu} platillos
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="bg-pink-500/20 text-pink-300 font-mono font-black text-sm px-3 py-1.5 rounded-lg border border-pink-500/30 flex items-center gap-1">
                            {bagsWedThu} <span className="text-[10px] font-bold">{bagsWedThu === 1 ? 'BOLSA' : 'BOLSAS'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-white/10 bg-white/2 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="px-5 py-2 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                >
                  Cancelar
                </button>
                
                <button
                  type="button"
                  onClick={handleSaveModal}
                  disabled={modalPlansList.length === 0}
                  className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-lg shadow-purple-600/10 hover:shadow-purple-600/25 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[15px]">save</span>
                  Guardar Cambios
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default ClientManager;
