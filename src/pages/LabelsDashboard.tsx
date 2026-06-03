import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { getBusinesses, updateBusiness, getDrivers, Driver } from '../services/dataService';
import { pushToGoogleSheets } from '../services/googleSheetsService';
import { parseCsv } from '../utils/csvParser';
import { parseClientProfile } from '../utils/clientProfile';
import { useHealthyDreamsStore } from '../store/useHealthyDreamsStore';

interface MealLabel {
  id: string;
  name: string;
  plan: string;
  route: string;
  siglas: string;
  exclusions: string;
  driver: string;
  isPlaceholder?: boolean;
}

interface PlanItem {
  id: string;
  planType: string;
  package: string;
  siglas: string;
  tiempos: number;
}

const LabelsDashboard: React.FC = () => {
  const [rawData, setRawData] = useState<string>('');
  const [parsedLabels, setParsedLabels] = useState<MealLabel[]>([]);
  const [selectedRouteTab, setSelectedRouteTab] = useState<'morning' | 'evening'>('evening'); // Default to evening which runs Sunday/Wednesday
  const [excludedDrivers, setExcludedDrivers] = useState<Set<string>>(new Set());
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Printing configurations (for fine tuning)
  const [marginTop, setMarginTop] = useState<number>(12); // in mm
  const [marginLeft, setMarginLeft] = useState<number>(8); // in mm
  const [labelWidth, setLabelWidth] = useState<number>(64); // in mm
  const [labelHeight, setLabelHeight] = useState<number>(48); // in mm
  const [colGap, setColGap] = useState<number>(5); // in mm
  const [rowGap, setRowGap] = useState<number>(3); // in mm

  // Text Styles States for each element
  const [clientTextSize, setClientTextSize] = useState<number>(12); // in pt
  const [clientTextFont, setClientTextFont] = useState<string>('Arial');
  const [clientTextWeight, setClientTextWeight] = useState<string>('black');

  const [routeTextSize, setRouteTextSize] = useState<number>(8); // in pt
  const [routeTextFont, setRouteTextFont] = useState<string>('Arial');
  const [routeTextWeight, setRouteTextWeight] = useState<string>('bold');

  const [siglasTextSize, setSiglasTextSize] = useState<number>(14); // in pt
  const [siglasTextFont, setSiglasTextFont] = useState<string>('Arial');
  const [siglasTextWeight, setSiglasTextWeight] = useState<string>('900');

  const [exclTextSize, setExclTextSize] = useState<number>(8); // in pt
  const [exclTextFont, setExclTextFont] = useState<string>('Arial');
  const [exclTextWeight, setExclTextWeight] = useState<string>('bold');

  const [driverTextSize, setDriverTextSize] = useState<number>(8); // in pt
  const [driverTextFont, setDriverTextFont] = useState<string>('Arial');
  const [driverTextWeight, setDriverTextWeight] = useState<string>('bold');

  const [planTextSize, setPlanTextSize] = useState<number>(8); // in pt
  const [planTextFont, setPlanTextFont] = useState<string>('Arial');
  const [planTextWeight, setPlanTextWeight] = useState<string>('bold');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI Collapse / Expand states
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [isKitchenOpen, setIsKitchenOpen] = useState<boolean>(false);
  const [isNoteOpen, setIsNoteOpen] = useState<boolean>(false);
  const [isDriversOpen, setIsDriversOpen] = useState<boolean>(true);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);
  const [isTextStylesOpen, setIsTextStylesOpen] = useState<boolean>(false);

  // Layout view settings
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'all' | 'single'>('single');
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
  const [previewZoom, setPreviewZoom] = useState<'sm' | 'md' | 'lg'>('md');

  // Reset page index when selecting a new route tab or modifying driver filters
  useEffect(() => {
    setActiveSheetIndex(0);
  }, [selectedRouteTab, excludedDrivers]);

  // Automatically toggle import box when there are no labels loaded
  useEffect(() => {
    if (parsedLabels.length === 0) {
      setIsImportOpen(true);
    } else {
      setIsImportOpen(false);
    }
  }, [parsedLabels.length]);

  // Zustand operational cache store
  const { 
    clients: dbClients, 
    drivers: systemDrivers, 
    isLoading: storeLoading, 
    fetchClientsAndDrivers 
  } = useHealthyDreamsStore();

  // Helper to resolve driver color (database config first, static fallback second)
  const getDriverColor = (driverName: string) => {
    const norm = driverName.trim().toUpperCase();
    const d = systemDrivers.find(drv => drv.name.trim().toUpperCase() === norm);
    if (d && d.colorHex) return d.colorHex;

    // Static fallbacks from user request mapping
    if (norm.includes('BRAYAN')) return '#3b82f6'; // Azul
    if (norm.includes('TONY') || norm.includes('ANTONIO')) return '#10b981'; // Verde
    if (norm.includes('LUIS')) return '#eab308'; // Amarillo
    if (norm.includes('KARLA')) return '#f97316'; // Naranja
    if (norm.includes('MIRIAM')) return '#ef4444'; // Rojo
    if (norm.includes('NIDIA') || norm.includes('ALVARO')) return '#ec4899'; // Rosa
    
    return '#94a3b8'; // Slate default
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  const regenerateLabelsFromClients = (clients: any[]) => {
    const list: MealLabel[] = [];
    clients.forEach((biz) => {
      const parsed = parseClientProfile(biz.email);
      const planType = parsed.planType || 'HEALTHY';
      const plansCount = parsed.plansCount || 1;
      const exclusions = parsed.exclusions || 'Ninguna';
      const siglas = parsed.siglas || 'C';
      const driver = parsed.driver || 'SIN ASIGNAR';
      const isActive = parsed.isActive !== false;
      const plans = parsed.plans || [];

      if (!isActive) return;

      const routeCode = biz.routeType === 'Matutina' ? 'M' : 'V';

      if (plans.length > 0) {
        plans.forEach((p: any, idx: number) => {
          list.push({
            id: `db-${biz.id}-${idx}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: biz.name,
            plan: p.planType.toUpperCase(),
            route: routeCode,
            exclusions: exclusions,
            siglas: p.siglas.toUpperCase(),
            driver: driver.toUpperCase()
          });
        });
      } else {
        // Fallback for legacy database entries
        for (let k = 0; k < plansCount; k++) {
          list.push({
            id: `db-${biz.id}-${k}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: biz.name,
            plan: planType.toUpperCase(),
            route: routeCode,
            exclusions: exclusions,
            siglas: siglas.toUpperCase(),
            driver: driver.toUpperCase()
          });
        }
      }
    });

    setParsedLabels(list);
  };

  const loadSystemLabels = async () => {
    try {
      const bizList = await getBusinesses();
      const list: MealLabel[] = [];
      bizList.forEach((biz) => {
        const parsed = parseClientProfile(biz.email);
        const planType = parsed.planType || 'HEALTHY';
        const plansCount = parsed.plansCount || 1;
        const exclusions = parsed.exclusions || 'Ninguna';
        const siglas = parsed.siglas || 'C';
        const driver = parsed.driver || 'SIN ASIGNAR';
        const isActive = parsed.isActive !== false;
        const plans = parsed.plans || [];
        
        if (!isActive) return;
        
        const routeCode = biz.routeType === 'Matutina' ? 'M' : 'V';

        if (plans.length > 0) {
          plans.forEach((p: any, idx: number) => {
            list.push({
              id: `db-${biz.id}-${idx}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              name: biz.name,
              plan: p.planType.toUpperCase(),
              route: routeCode,
              exclusions: exclusions,
              siglas: p.siglas.toUpperCase(),
              driver: driver.toUpperCase()
            });
          });
        } else {
          // Fallback for legacy database entries
          for (let k = 0; k < plansCount; k++) {
            list.push({
              id: `db-${biz.id}-${k}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              name: biz.name,
              plan: planType.toUpperCase(),
              route: routeCode,
              exclusions: exclusions,
              siglas: siglas.toUpperCase(),
              driver: driver.toUpperCase()
            });
          }
        }
      });
      return list;
    } catch (e) {
      console.error(e);
      return [];
    }
  };

  const refreshDbClientsAndDrivers = async () => {
    try {
      await fetchClientsAndDrivers(true);
    } catch (e) {
      console.error("Error refreshing clients and drivers:", e);
    }
  };

  useEffect(() => {
    fetchClientsAndDrivers();
  }, []);

  useEffect(() => {
    regenerateLabelsFromClients(dbClients);
  }, [dbClients]);


  // Parse TSV/CSV content
  const parseTextData = (text: string, isSilent = false) => {
    if (!text.trim()) {
      if (!isSilent) setErrorMsg('El texto ingresado está vacío.');
      return;
    }

    try {
      const parsedRows = parseCsv(text);
      if (parsedRows.length < 2) {
        if (!isSilent) setErrorMsg('Se necesitan al menos 2 filas (cabecera + datos).');
        return;
      }

      const headers = parsedRows[0].map(h => h.toUpperCase().trim());

      // Find indexes
      const nameIdx = headers.findIndex(h => h.includes('NOMBRE') || h.includes('CLIENTE'));
      const planIdx = headers.findIndex(h => h.includes('PLAN'));
      const routeIdx = headers.findIndex(h => h.includes('RUTA') || h.includes('TURNO'));
      const exclIdx = headers.findIndex(h => h.includes('EXCLUSI') || h.includes('ALERGIA'));
      const siglasIdx = headers.findIndex(h => h.includes('SIGLA'));
      const driverIdx = headers.findIndex(h => h.includes('REPARTIDOR') || h.includes('CHOFER') || h.includes('CONDUCTOR'));

      if (nameIdx === -1) {
        if (!isSilent) setErrorMsg('No se detectó la columna de Nombre (NOMBRE o CLIENTE).');
        return;
      }

      const labels: MealLabel[] = [];

      for (let i = 1; i < parsedRows.length; i++) {
        const fields = parsedRows[i];
        if (fields.length === 0 || !fields[nameIdx]) continue;

        labels.push({
          id: `label-${i}-${Date.now()}`,
          name: fields[nameIdx] || '',
          plan: planIdx >= 0 ? fields[planIdx] || 'PERSONALIZADO' : 'PLAN',
          route: routeIdx >= 0 ? fields[routeIdx] || 'V' : 'V',
          exclusions: exclIdx >= 0 ? fields[exclIdx] || '' : '',
          siglas: siglasIdx >= 0 ? fields[siglasIdx] || 'C' : 'C',
          driver: driverIdx >= 0 ? fields[driverIdx].toUpperCase() || 'SIN ASIGNAR' : 'SIN ASIGNAR'
        });
      }

      setParsedLabels(labels);
      setErrorMsg(null);
      if (!isSilent) {
        setRawData('');
        // Alert/Toast simulation
        const alertDiv = document.createElement('div');
        alertDiv.className = "fixed bottom-5 right-5 bg-emerald-600 text-white font-bold text-xs py-3 px-6 rounded-2xl shadow-2xl z-50 animate-bounce";
        alertDiv.innerText = `✅ ¡Cargados ${labels.length} registros con éxito!`;
        document.body.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 3000);
      }
    } catch (err) {
      console.error(err);
      if (!isSilent) setErrorMsg('Error al parsear los datos. Verifica el formato de columnas.');
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseTextData(text);
    };
    reader.readAsText(file, 'utf-8');
  };

  // Filter labels based on selected Route Tab
  const filteredByRouteLabels = useMemo(() => {
    return parsedLabels.filter(label => {
      const isMorning = label.route.toUpperCase().startsWith('M');
      if (selectedRouteTab === 'morning') return isMorning;
      return !isMorning; // evening starts with 'V' or anything else
    });
  }, [parsedLabels, selectedRouteTab]);

  // List of all drivers active in the current route filter
  const activeDrivers = useMemo(() => {
    const driversMap = new Map<string, number>();
    filteredByRouteLabels.forEach(l => {
      const name = l.driver.trim() || 'SIN ASIGNAR';
      driversMap.set(name, (driversMap.get(name) || 0) + 1);
    });
    return Array.from(driversMap.entries()).map(([name, count]) => ({ name, count }));
  }, [filteredByRouteLabels]);

  // Finally filtered labels ready for printing (respecting excluded drivers)
  const finalPrintLabels = useMemo(() => {
    return filteredByRouteLabels.filter(label => {
      const name = label.driver.trim() || 'SIN ASIGNAR';
      return !excludedDrivers.has(name);
    });
  }, [filteredByRouteLabels, excludedDrivers]);

  // Drivers toggling
  const toggleDriver = (driverName: string) => {
    const next = new Set(excludedDrivers);
    if (next.has(driverName)) {
      next.delete(driverName);
    } else {
      next.add(driverName);
    }
    setExcludedDrivers(next);
  };

  // Kitchen Production Consolidator Summary
  const kitchenConsolidation = useMemo(() => {
    const planCounts: { [key: string]: { total: number; siglas: { [key: string]: number } } } = {};
    const exclusionsList: { name: string; exclusions: string; plan: string; siglas: string }[] = [];

    finalPrintLabels.forEach(label => {
      // 1. Plan aggregation
      const pName = label.plan.toUpperCase();
      const sig = label.siglas.toUpperCase();
      
      if (!planCounts[pName]) {
        planCounts[pName] = { total: 0, siglas: {} };
      }
      planCounts[pName].total += 1;
      planCounts[pName].siglas[sig] = (planCounts[pName].siglas[sig] || 0) + 1;

      // 2. Exclusions collection
      if (label.exclusions && label.exclusions.trim() !== '' && label.exclusions !== 'None' && label.exclusions !== 'Ninguna') {
        exclusionsList.push({
          name: label.name,
          exclusions: label.exclusions,
          plan: label.plan,
          siglas: label.siglas
        });
      }
    });

    return { planCounts, exclusionsList };
  }, [finalPrintLabels]);

  const copyKitchenSummary = () => {
    const { planCounts, exclusionsList } = kitchenConsolidation;
    if (Object.keys(planCounts).length === 0) {
      alert("No hay datos de producción para copiar.");
      return;
    }

    let text = `=========================================\n`;
    text += `   RESUMEN DE PRODUCCIÓN PARA COCINA     \n`;
    text += `   Ruta: ${selectedRouteTab === 'morning' ? 'MATUTINA (Lun/Jue)' : 'VESPERTINA (Dom/Mie)'}\n`;
    text += `   Fecha: ${new Date().toLocaleDateString()}\n`;
    text += `=========================================\n\n`;

    text += `💡 TOTAL DE PLATOS POR PLAN:\n`;
    let grandTotal = 0;
    Object.entries(planCounts).forEach(([plan, data]) => {
      const planData = data as { total: number; siglas: { [key: string]: number } };
      text += `• ${plan}: ${planData.total} platos\n`;
      grandTotal += planData.total;
      Object.entries(planData.siglas).forEach(([sig, count]) => {
        text += `  - Siglas [${sig}]: ${count} un.\n`;
      });
    });
    text += `\nTOTAL GENERAL: ${grandTotal} platos/viandas\n\n`;

    if (exclusionsList.length > 0) {
      text += `⚠️ EXCLUSIONES / ALERGIAS CRÍTICAS (${exclusionsList.length}):\n`;
      exclusionsList.forEach((item, idx) => {
        text += `${idx + 1}. ${item.name} (${item.plan} - ${item.siglas}) -> EXCL: ${item.exclusions}\n`;
      });
    } else {
      text += `✅ No se registraron exclusiones críticas para este lote.\n`;
    }

    text += `\n=========================================`;

    navigator.clipboard.writeText(text);
    
    // Show toast
    const alertDiv = document.createElement('div');
    alertDiv.className = "fixed bottom-5 right-5 bg-indigo-600 text-white font-bold text-xs py-3 px-6 rounded-2xl shadow-2xl z-50 animate-bounce";
    alertDiv.innerText = `📋 ¡Resumen de cocina copiado al portapapeles!`;
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 3000);
  };

  // Group labels into 3x5 sheets (15 labels per page)
  const labelSheets = useMemo(() => {
    const sheets: MealLabel[][] = [];
    
    // Group final print labels by driver
    const groups: { [key: string]: MealLabel[] } = {};
    finalPrintLabels.forEach(label => {
      const key = label.driver || 'SIN ASIGNAR';
      if (!groups[key]) groups[key] = [];
      groups[key].push(label);
    });

    // Fit into 15 grids, forcing page break per driver
    Object.keys(groups).forEach(driverName => {
      const driverLabels = groups[driverName];
      let currentSheet: MealLabel[] = [];

      driverLabels.forEach(label => {
        currentSheet.push(label);
        if (currentSheet.length === 15) {
          sheets.push(currentSheet);
          currentSheet = [];
        }
      });

      // Leftovers get filled with empty placeholder labels to preserve 3x5 grid on sheet
      if (currentSheet.length > 0) {
        while (currentSheet.length < 15) {
          currentSheet.push({
            id: `placeholder-${driverName}-${currentSheet.length}`,
            name: '',
            plan: '',
            route: '',
            siglas: '',
            exclusions: '',
            driver: driverName,
            isPlaceholder: true
          });
        }
        sheets.push(currentSheet);
      }
    });

    return sheets;
  }, [finalPrintLabels]);

  // Reset active page index if it is out of bounds due to filters or route changes
  useEffect(() => {
    if (activeSheetIndex >= labelSheets.length && labelSheets.length > 0) {
      setActiveSheetIndex(labelSheets.length - 1);
    }
  }, [labelSheets.length, activeSheetIndex]);

  // Compute active sheet(s) to render in preview based on view mode (single page or all pages)
  const sheetsToRender = useMemo(() => {
    if (viewMode === 'single') {
      const activeSheet = labelSheets[activeSheetIndex];
      return activeSheet ? [{ sheet: activeSheet, idx: activeSheetIndex }] : [];
    } else {
      return labelSheets.map((sheet, idx) => ({ sheet, idx }));
    }
  }, [labelSheets, viewMode, activeSheetIndex]);

  // Generates high quality PDF using jsPDF
  const generatePDF = () => {
    if (labelSheets.length === 0) {
      alert("No hay etiquetas cargadas o seleccionadas para imprimir.");
      return;
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter' // 215.9 x 279.4 mm
    });

    labelSheets.forEach((sheet, sheetIdx) => {
      if (sheetIdx > 0) {
        doc.addPage();
      }

      // Helper to map UI fonts to standard PDF fonts (Times, Helvetica, Courier)
      const getPdfFont = (uiFont: string) => {
        const f = uiFont.toLowerCase();
        if (f.includes('times') || f.includes('serif')) return 'times';
        if (f.includes('courier') || f.includes('mono')) return 'courier';
        return 'helvetica';
      };

      const getPdfWeight = (uiWeight: string) => {
        const w = uiWeight.toLowerCase();
        if (w === 'black' || w === 'bold' || w === '900') return 'bold';
        return 'normal';
      };

      // We draw 3 columns x 5 rows
      sheet.forEach((label, idx) => {
        if (label.isPlaceholder) return; // Skip drawing empty labels

        const col = idx % 3;
        const row = Math.floor(idx / 3);

        const x = marginLeft + col * (labelWidth + colGap);
        const y = marginTop + row * (labelHeight + rowGap);

        // --- DRAW SINGLE LABEL ---

        // 1. Draw outer thin black border
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.1);
        doc.rect(x, y, labelWidth, labelHeight);

        // 2. Draw Siglas (Top Left)
        doc.setTextColor(0, 0, 0);
        doc.setFont(getPdfFont(siglasTextFont), getPdfWeight(siglasTextWeight));
        doc.setFontSize(siglasTextSize);
        doc.text(label.siglas, x + 3, y + 6);

        // 3. Draw Plan (Top Right, italicized)
        doc.setTextColor(50, 60, 80);
        doc.setFont(getPdfFont(planTextFont), 'italic');
        doc.setFontSize(planTextSize);
        doc.text(label.plan, x + labelWidth - 3, y + 6, { align: 'right' });

        // 4. Draw Client Name (Large, centered horizontally & vertically)
        doc.setFont(getPdfFont(clientTextFont), getPdfWeight(clientTextWeight));
        doc.setFontSize(clientTextSize);
        doc.setTextColor(0, 0, 0);

        const wrappedName = doc.splitTextToSize(label.name, labelWidth - 6);
        const nameLines = Array.isArray(wrappedName) ? wrappedName.length : 1;
        const lineSpacing = clientTextSize * 0.352778; // pt to mm
        const totalHeight = nameLines * lineSpacing;
        
        // Centering name vertically in the label card middle area
        const centerY = y + (labelHeight / 2) - (totalHeight / 2) + (lineSpacing / 2);
        doc.text(wrappedName, x + labelWidth / 2, centerY, { align: 'center' });

        // 5. Exclusions (Centered below client name if present)
        if (label.exclusions && label.exclusions !== 'None' && label.exclusions !== 'Ninguna') {
          doc.setFont(getPdfFont(exclTextFont), getPdfWeight(exclTextWeight));
          doc.setFontSize(exclTextSize);
          doc.setTextColor(220, 38, 38); // Red-600
          const wrappedExcl = doc.splitTextToSize(`Excl: ${label.exclusions}`, labelWidth - 6);
          doc.text(wrappedExcl, x + labelWidth / 2, centerY + (totalHeight / 2) + 2.5, { align: 'center' });
        }

        // 6. Draw Route code (Bottom Left: V or M)
        const routeCode = label.route.substring(0, 1).toUpperCase();
        doc.setFont(getPdfFont(routeTextFont), getPdfWeight(routeTextWeight));
        doc.setFontSize(routeTextSize);
        doc.setTextColor(0, 0, 0);
        doc.text(routeCode, x + 3, y + labelHeight - 4);

        // 7. Draw Driver color circle (Bottom Right)
        const color = getDriverColor(label.driver);
        const rgb = hexToRgb(color) || { r: 150, g: 150, b: 150 };
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.setDrawColor(100, 116, 139); // Slate border
        doc.setLineWidth(0.15);
        doc.circle(x + labelWidth - 5, y + labelHeight - 5.5, 2.2, 'FD'); // 4.4mm diameter circle
      });
    });

    // Save and open download
    const filename = `etiquetas_${selectedRouteTab}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
  };

  // Direct print using browser print engine (HTML CSS custom grid)
  const printDirectly = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f8fafc] overflow-y-auto p-4 md:p-6 custom-scrollbar">
      
      {/* ── PRINT-ONLY STYLES ────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          /* Hide sidebar, headers, inputs */
          body * {
            visibility: hidden;
          }
          #print-area-wrapper, #print-area-wrapper * {
            visibility: visible;
          }
          #print-area-wrapper {
            position: absolute;
            left: 0;
            top: 0;
            width: 215.9mm;
            height: auto;
            margin: 0;
            padding: 0;
            background: white !important;
          }
          .print-page {
            width: 215.9mm;
            height: 279.4mm;
            page-break-after: always;
            box-sizing: border-box;
            background: white !important;
            position: relative;
          }
          /* Absolute grid offsets calibrated by sliders */
          .print-grid {
            display: grid;
            grid-template-columns: repeat(3, ${labelWidth}mm);
            grid-template-rows: repeat(5, ${labelHeight}mm);
            column-gap: ${colGap}mm;
            row-gap: ${rowGap}mm;
            padding-top: ${marginTop}mm;
            padding-left: ${marginLeft}mm;
            box-sizing: border-box;
          }
          .print-label {
            width: ${labelWidth}mm;
            height: ${labelHeight}mm;
            border: 0.15mm solid #000;
            box-sizing: border-box;
            position: relative;
            background: white !important;
            color: #000 !important;
            font-family: Arial, sans-serif;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 3mm;
          }
          .print-label-header-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            width: 100%;
          }
          .print-label-siglas {
            font-size: ${siglasTextSize}pt;
            font-family: ${siglasTextFont}, sans-serif;
            font-weight: ${siglasTextWeight === 'black' ? '900' : siglasTextWeight};
            color: #000 !important;
            line-height: 1;
          }
          .print-label-plan {
            font-size: ${planTextSize}pt;
            font-family: ${planTextFont}, sans-serif;
            font-weight: ${planTextWeight === 'black' ? '900' : planTextWeight};
            font-style: italic;
            text-transform: uppercase;
            color: #323c50 !important;
            line-height: 1;
          }
          .print-label-body {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            min-height: 0;
            padding: 1mm 0;
          }
          .print-label-name {
            font-size: ${clientTextSize}pt;
            font-family: ${clientTextFont}, sans-serif;
            font-weight: ${clientTextWeight === 'black' ? '900' : clientTextWeight};
            color: #000 !important;
            line-height: 1.2;
            word-wrap: break-word;
            max-width: 100%;
          }
          .print-label-excl {
            font-size: ${exclTextSize}pt;
            font-family: ${exclTextFont}, sans-serif;
            font-weight: ${exclTextWeight === 'black' ? '900' : exclTextWeight};
            color: #dc2626 !important;
            margin-top: 1.2mm;
            line-height: 1.1;
            word-wrap: break-word;
            max-width: 100%;
          }
          .print-label-footer {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            width: 100%;
            margin-top: auto;
          }
          .print-label-footer-route {
            font-size: ${routeTextSize}pt;
            font-family: ${routeTextFont}, sans-serif;
            font-weight: ${routeTextWeight === 'black' ? '900' : routeTextWeight};
            color: #000 !important;
            line-height: 1;
          }
          .print-label-footer-driver-color {
            width: 4.4mm;
            height: 4.4mm;
            border-radius: 50%;
            border: 0.15mm solid #64748b;
            box-sizing: border-box;
            display: inline-block;
          }
        }
      `}</style>
      
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 print:hidden">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-2xl text-blue-600 bg-blue-50 p-1.5 rounded-xl shadow-sm">label</span>
            Generador de Etiquetas
          </h1>
          <p className="text-slate-500 font-medium text-[10px] ml-1 mt-0.5">Carga pedidos y genera cuadrículas de etiquetas adhesivas de forma automática</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Direct Link to Clients Management */}
          <Link
            to="/clientes"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#051024] hover:bg-black text-white font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition-all hover:-translate-y-0.5"
          >
            <span className="material-symbols-outlined text-[14px] text-emerald-400">group</span>
            Clientes
            <span className="text-[8px] font-black px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/20">
              {dbClients.length}
            </span>
          </Link>

          <button 
            onClick={async () => {
              await refreshDbClientsAndDrivers();
              const alertDiv = document.createElement('div');
              alertDiv.className = "fixed bottom-5 right-5 bg-emerald-600 text-white font-bold text-xs py-3 px-6 rounded-2xl shadow-2xl z-50 animate-bounce";
              alertDiv.innerText = `🔄 ¡Sincronizados todos los clientes y choferes del sistema!`;
              document.body.appendChild(alertDiv);
              setTimeout(() => alertDiv.remove(), 3000);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">sync</span>
            Sincronizar
          </button>

          <button 
            onClick={() => setIsImportOpen(!isImportOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition-all ${isImportOpen ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            <span className="material-symbols-outlined text-[14px]">content_paste</span>
            {isImportOpen ? 'Cerrar' : 'Importar'}
          </button>

          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">upload_file</span>
            Subir
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
            }} 
            accept=".csv,.txt,.tsv" 
            className="hidden" 
          />

          <button 
            onClick={generatePDF}
            disabled={labelSheets.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-md transition-all ${labelSheets.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700 hover:-translate-y-0.5'}`}
          >
            <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
            PDF
          </button>

          <button 
            onClick={printDirectly}
            disabled={labelSheets.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-md transition-all ${labelSheets.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700 hover:-translate-y-0.5'}`}
          >
            <span className="material-symbols-outlined text-[14px]">print</span>
            Imprimir
          </button>
        </div>
      </div>

      {/* ── COLLAPSIBLE COGNITIVE OPERATIONAL NOTE ───────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-3 px-4 mb-4 print:hidden shadow-sm transition-all duration-200">
        <div 
          onClick={() => setIsNoteOpen(!isNoteOpen)}
          className="flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-blue-600 text-[18px] bg-white p-1 rounded-lg shadow-sm">calendar_month</span>
            <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-wide">📅 Horario de Reparto y Turnos Operativos</h4>
          </div>
          <span className="material-symbols-outlined text-slate-400 select-none text-sm">
            {isNoteOpen ? 'expand_less' : 'expand_more'}
          </span>
        </div>
        {isNoteOpen && (
          <p className="text-[11px] text-slate-600 mt-2 leading-relaxed border-t border-blue-100/50 pt-2 animate-fadeIn">
            Las etiquetas se cargan de forma consolidada desde Excel/CSV o directamente desde la base de datos de clientes. Recuerda las frecuencias operativas:
            <span className="mx-1 text-blue-600 font-bold">Ruta Vespertina</span> (se produce e imprime los <span className="underline">Domingos y Miércoles</span>) y
            <span className="mx-1 text-indigo-600 font-bold">Ruta Matutina</span> (se produce e imprime los <span className="underline">Lunes y Jueves</span>). Usa los tabs inferiores para alternar entre turnos.
          </p>
        )}
      </div>

      {/* ── INPUT SECTION (PASTE/DROP AREA) - COLLAPSIBLE ───────────────────── */}
      {isImportOpen && (
        <div className="w-full mb-6 print:hidden animate-fadeIn">
          <div className="flex flex-col bg-white rounded-3xl shadow-md border border-slate-100 p-5 w-full">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="material-symbols-outlined text-blue-600 text-base">content_paste</span>
                Importación Rápida
              </h3>
              <span className="text-[9px] bg-slate-100 text-slate-500 py-0.5 px-2.5 rounded-full font-bold">
                Excel / CSV Soportado
              </span>
            </div>

            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`flex-1 flex flex-col relative rounded-xl border border-dashed transition-all p-2.5 min-h-[110px] ${dragActive ? 'border-blue-500 bg-blue-50/20' : 'border-slate-200 hover:border-slate-300'}`}
            >
              {rawData.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center pointer-events-none">
                  <span className="material-symbols-outlined text-3xl text-slate-300 animate-pulse">copy_all</span>
                  <p className="text-[11px] font-bold text-slate-600 mt-2">Copia las celdas de Excel y pégalas aquí (Ctrl+V)</p>
                  <p className="text-[9px] text-slate-400 mt-0.5 max-w-sm">o arrastra y suelta tu archivo de etiquetas CSV directamente en este recuadro</p>
                </div>
              )}

              <textarea
                value={rawData}
                onChange={(e) => {
                  setRawData(e.target.value);
                  parseTextData(e.target.value);
                }}
                placeholder=""
                className="w-full flex-1 h-24 text-xs font-mono bg-slate-50 border border-slate-100 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white resize-none"
              />
            </div>

            {errorMsg && (
              <div className="mt-3 bg-rose-50 border border-rose-100 text-rose-600 px-3 py-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">error</span>
                {errorMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CENTRAL DASHBOARD WRAPPER ────────────────────────────────────────── */}
      {parsedLabels.length > 0 ? (
        <div className="flex flex-col gap-6 print:hidden">
          
          {/* Main Controls, Route tabs & Driver lists */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Sidebar Column: Collapsible Accordion sections */}
            {!isSidebarCollapsed && (
              <div className="lg:col-span-1 flex flex-col gap-4 lg:sticky lg:top-4 h-fit max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 pb-4 scrollbar-hide">
                
                {/* 1. Drivers list panel */}
                <div className="bg-white rounded-3xl shadow-md border border-slate-100 overflow-hidden flex flex-col shrink-0">
                  <div 
                    onClick={() => setIsDriversOpen(!isDriversOpen)}
                    className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-600 text-base">local_shipping</span>
                      Filtrar Choferes
                    </h3>
                    <span className="material-symbols-outlined text-slate-400 select-none text-sm">
                      {isDriversOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>
                  
                  {isDriversOpen && (
                    <div className="p-4 flex flex-col gap-1.5">
                      <div className="flex-grow flex flex-col gap-1.5 overflow-y-auto max-h-[180px] custom-scrollbar pr-1">
                        {activeDrivers.length === 0 ? (
                          <p className="text-[10px] text-slate-400 italic text-center py-4">No se detectaron repartidores</p>
                        ) : (
                          activeDrivers.map(({ name, count }) => {
                            const isExcluded = excludedDrivers.has(name);
                            return (
                              <button 
                                key={name}
                                onClick={() => toggleDriver(name)}
                                className={`w-full flex items-center justify-between p-2 rounded-lg border text-left font-bold text-[11px] transition-all ${isExcluded 
                                  ? 'border-slate-100 bg-slate-50 text-slate-400 line-through opacity-70' 
                                  : 'border-slate-100 bg-white hover:border-slate-200 text-slate-700 shadow-sm'}`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${isExcluded ? 'bg-slate-300' : 'bg-blue-600'}`}></span>
                                  <span className="truncate">{name}</span>
                                </div>
                                <span className={`px-1.5 py-0.2 rounded font-black text-[9px] shrink-0 ${isExcluded ? 'bg-slate-200 text-slate-400' : 'bg-blue-50 text-blue-600'}`}>
                                  {count} u.
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>

                      {activeDrivers.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-100 flex gap-1.5 shrink-0">
                          <button 
                            onClick={() => setExcludedDrivers(new Set())}
                            className="flex-1 py-1.5 text-center bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-wider transition-colors"
                          >
                            Activar Todos
                          </button>
                          <button 
                            onClick={() => setExcludedDrivers(new Set(activeDrivers.map(d => d.name)))}
                            className="flex-1 py-1.5 text-center bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-wider transition-colors"
                          >
                            Excluir Todos
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Calibration panel */}
                <div className="bg-white rounded-3xl shadow-md border border-slate-100 overflow-hidden flex flex-col shrink-0">
                  <div 
                    onClick={() => setIsCalibrationOpen(!isCalibrationOpen)}
                    className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-600 text-base">settings_suggest</span>
                      Calibración de Plantilla
                    </h3>
                    <span className="material-symbols-outlined text-slate-400 select-none text-sm">
                      {isCalibrationOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>

                  {isCalibrationOpen && (
                    <div className="p-4 flex flex-col gap-3 text-[10px] text-slate-600">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between font-bold uppercase text-slate-500">
                          <span>Margen Superior</span>
                          <span className="text-blue-600 font-mono font-black">{marginTop} mm</span>
                        </div>
                        <input 
                          type="range" min="0" max="30" step="0.5" 
                          value={marginTop} onChange={(e) => setMarginTop(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between font-bold uppercase text-slate-500">
                          <span>Margen Izquierdo</span>
                          <span className="text-blue-600 font-mono font-black">{marginLeft} mm</span>
                        </div>
                        <input 
                          type="range" min="0" max="30" step="0.5" 
                          value={marginLeft} onChange={(e) => setMarginLeft(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between font-bold uppercase text-slate-500">
                          <span>Ancho de Etiqueta</span>
                          <span className="text-blue-600 font-mono font-black">{labelWidth} mm</span>
                        </div>
                        <input 
                          type="range" min="40" max="90" step="0.5" 
                          value={labelWidth} onChange={(e) => setLabelWidth(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between font-bold uppercase text-slate-500">
                          <span>Alto de Etiqueta</span>
                          <span className="text-blue-600 font-mono font-black">{labelHeight} mm</span>
                        </div>
                        <input 
                          type="range" min="30" max="70" step="0.5" 
                          value={labelHeight} onChange={(e) => setLabelHeight(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-2 mt-1">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold uppercase text-slate-500">Espaciado H</span>
                          <input 
                            type="range" min="0" max="15" step="0.5" 
                            value={colGap} onChange={(e) => setColGap(parseFloat(e.target.value))}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          />
                          <span className="text-[9px] font-mono font-black text-blue-600 mt-0.5">{colGap} mm</span>
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="font-bold uppercase text-slate-500">Espaciado V</span>
                          <input 
                            type="range" min="0" max="15" step="0.5" 
                            value={rowGap} onChange={(e) => setRowGap(parseFloat(e.target.value))}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          />
                          <span className="text-[9px] font-mono font-black text-blue-600 mt-0.5">{rowGap} mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Text Styles panel */}
                <div className="bg-white rounded-3xl shadow-md border border-slate-100 overflow-hidden flex flex-col shrink-0">
                  <div 
                    onClick={() => setIsTextStylesOpen(!isTextStylesOpen)}
                    className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-600 text-base">format_size</span>
                      Estilo de Textos
                    </h3>
                    <span className="material-symbols-outlined text-slate-400 select-none text-sm">
                      {isTextStylesOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>

                  {isTextStylesOpen && (
                    <div className="p-4 flex flex-col gap-3 text-[9px] text-slate-600">
                      <div className="border-b border-slate-100 pb-2.5 space-y-1">
                        <span className="font-black uppercase tracking-wider text-blue-600">Nombre de Cliente</span>
                        <div className="grid grid-cols-3 gap-1">
                          <select value={clientTextSize} onChange={(e) => setClientTextSize(parseFloat(e.target.value))} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            {[7, 8, 9, 10, 11, 12, 13, 14].map(s => <option key={s} value={s}>{s} pt</option>)}
                          </select>
                          <select value={clientTextFont} onChange={(e) => setClientTextFont(e.target.value)} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            <option value="Arial">Arial</option>
                            <option value="Times New Roman">Serif</option>
                            <option value="Courier New">Mono</option>
                          </select>
                          <select value={clientTextWeight} onChange={(e) => setClientTextWeight(e.target.value)} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            <option value="normal">Normal</option>
                            <option value="bold">Bold</option>
                            <option value="black">Black</option>
                          </select>
                        </div>
                      </div>

                      <div className="border-b border-slate-100 pb-2.5 space-y-1">
                        <span className="font-black uppercase tracking-wider text-blue-600">Plan Alimenticio</span>
                        <div className="grid grid-cols-3 gap-1">
                          <select value={planTextSize} onChange={(e) => setPlanTextSize(parseFloat(e.target.value))} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            {[6, 7, 8, 9, 10, 11, 12].map(s => <option key={s} value={s}>{s} pt</option>)}
                          </select>
                          <select value={planTextFont} onChange={(e) => setPlanTextFont(e.target.value)} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            <option value="Arial">Arial</option>
                            <option value="Times New Roman">Serif</option>
                            <option value="Courier New">Mono</option>
                          </select>
                          <select value={planTextWeight} onChange={(e) => setPlanTextWeight(e.target.value)} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            <option value="normal">Normal</option>
                            <option value="bold">Bold</option>
                          </select>
                        </div>
                      </div>

                      <div className="border-b border-slate-100 pb-2.5 space-y-1">
                        <span className="font-black uppercase tracking-wider text-blue-600">Siglas (Comida)</span>
                        <div className="grid grid-cols-3 gap-1">
                          <select value={siglasTextSize} onChange={(e) => setSiglasTextSize(parseFloat(e.target.value))} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            {[10, 12, 14, 16, 18, 20, 22].map(s => <option key={s} value={s}>{s} pt</option>)}
                          </select>
                          <select value={siglasTextFont} onChange={(e) => setSiglasTextFont(e.target.value)} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            <option value="Arial">Arial</option>
                            <option value="Times New Roman">Serif</option>
                            <option value="Courier New">Mono</option>
                          </select>
                          <select value={siglasTextWeight} onChange={(e) => setSiglasTextWeight(e.target.value)} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            <option value="normal">Normal</option>
                            <option value="bold">Bold</option>
                            <option value="900">Black</option>
                          </select>
                        </div>
                      </div>

                      <div className="border-b border-slate-100 pb-2.5 space-y-1">
                        <span className="font-black uppercase tracking-wider text-blue-600">Exclusiones</span>
                        <div className="grid grid-cols-3 gap-1">
                          <select value={exclTextSize} onChange={(e) => setExclTextSize(parseFloat(e.target.value))} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            {[6, 7, 7.5, 8, 9, 10].map(s => <option key={s} value={s}>{s} pt</option>)}
                          </select>
                          <select value={exclTextFont} onChange={(e) => setExclTextFont(e.target.value)} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            <option value="Arial">Arial</option>
                            <option value="Times New Roman">Serif</option>
                            <option value="Courier New">Mono</option>
                          </select>
                          <select value={exclTextWeight} onChange={(e) => setExclTextWeight(e.target.value)} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            <option value="normal">Normal</option>
                            <option value="bold">Bold</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="font-black uppercase tracking-wider text-blue-600">Chofer / Repartidor</span>
                        <div className="grid grid-cols-3 gap-1">
                          <select value={driverTextSize} onChange={(e) => setDriverTextSize(parseFloat(e.target.value))} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            {[6, 7, 7.5, 8, 9].map(s => <option key={s} value={s}>{s} pt</option>)}
                          </select>
                          <select value={driverTextFont} onChange={(e) => setDriverTextFont(e.target.value)} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            <option value="Arial">Arial</option>
                            <option value="Times New Roman">Serif</option>
                            <option value="Courier New">Mono</option>
                          </select>
                          <select value={driverTextWeight} onChange={(e) => setDriverTextWeight(e.target.value)} className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] text-slate-700 focus:outline-none">
                            <option value="normal">Normal</option>
                            <option value="bold">Bold</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
            
            {/* Grid preview panel */}
            <div className={isSidebarCollapsed ? "lg:col-span-4 flex flex-col gap-4" : "lg:col-span-3 flex flex-col gap-4"}>
              
              {/* Unified Route Tabs & Metrics Toolbar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2">
                  {/* Sidebar Toggle Button */}
                  <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className="flex items-center justify-center p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 transition-all shrink-0"
                    title={isSidebarCollapsed ? "Mostrar panel lateral" : "Ocultar panel lateral"}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isSidebarCollapsed ? 'menu_open' : 'menu'}
                    </span>
                  </button>

                  {/* Route Selector Tabs */}
                  <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/50">
                    <button
                      onClick={() => setSelectedRouteTab('evening')}
                      className={`py-1.5 px-3 rounded-lg transition-all duration-200 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 ${selectedRouteTab === 'evening' 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-[14px]">wb_sunny</span>
                      Vespertina (Dom/Mie)
                    </button>
                    <button
                      onClick={() => setSelectedRouteTab('morning')}
                      className={`py-1.5 px-3 rounded-lg transition-all duration-200 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 ${selectedRouteTab === 'morning' 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-[14px]">wb_twilight</span>
                      Matutina (Lun/Jue)
                    </button>
                  </div>
                </div>

                {/* Metrics Badges */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2 text-[10px] font-bold text-slate-500 lg:justify-end">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-blue-600 text-sm">tag</span>
                    <span>Hojas: <span className="text-slate-800 font-extrabold">{labelSheets.length}</span> <span className="text-slate-400 font-normal">({labelSheets.length * 15} esp.)</span></span>
                  </div>
                  <div className="hidden sm:block h-3 w-px bg-slate-200"></div>
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-emerald-600 text-sm">checklist</span>
                    <span>Etiquetas: <span className="text-slate-800 font-extrabold">{finalPrintLabels.length} u.</span></span>
                  </div>
                  <div className="hidden sm:block h-3 w-px bg-slate-200"></div>
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-amber-600 text-sm">person_remove</span>
                    <span>Excluidos: <span className="text-slate-800 font-extrabold">{excludedDrivers.size}</span></span>
                  </div>
                </div>
              </div>

              {/* 🍳 KITCHEN CONSOLIDATION PANEL (Collapsible) */}
              <div className="bg-[#051024] text-white rounded-3xl shadow-md border border-white/5 relative overflow-hidden transition-all duration-300">
                {/* Decorative glows */}
                <div className="absolute -top-32 -right-32 w-72 h-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-32 -left-32 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

                <div 
                  onClick={() => setIsKitchenOpen(!isKitchenOpen)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 relative z-10 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-2xl text-emerald-400 bg-emerald-500/10 p-1.5 rounded-xl border border-emerald-500/20 shadow-inner">
                      soup_kitchen
                    </span>
                    <div>
                      <h3 className="text-xs font-black tracking-tight text-white uppercase flex items-center gap-1.5">
                        🧑‍🍳 Consolidación de Cocina
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.2 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                          {finalPrintLabels.length} Viandas
                        </span>
                      </h3>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                        {isKitchenOpen ? 'Resumen de producción, viandas y alérgenos de la ruta activa.' : 'Haga clic aquí para expandir el desglose de producción y alérgenos.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                    {isKitchenOpen && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyKitchenSummary();
                        }}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/20 text-white font-black text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition-all active:scale-[0.98] shrink-0"
                      >
                        <span className="material-symbols-outlined text-[14px] text-emerald-400">content_copy</span>
                        Copiar
                      </button>
                    )}
                    <span className="material-symbols-outlined text-white/50 select-none text-sm">
                      {isKitchenOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>
                </div>

                {isKitchenOpen && (
                  <div className="p-4 pt-0 border-t border-white/5 relative z-10 animate-fadeIn">
                    {finalPrintLabels.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-4">
                        No hay etiquetas activas para consolidar. Carga registros o activa repartidores.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
                          <div>
                            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-xs">restaurant</span>
                              Distribución de Viandas
                            </h4>

                            <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[160px] custom-scrollbar pr-1">
                              {Object.entries(kitchenConsolidation.planCounts).map(([plan, data]) => {
                                const planData = data as { total: number; siglas: { [key: string]: number } };
                                const isHealthy = plan.includes('HEALTHY');
                                const isSlim = plan.includes('SLIM');
                                const isStrong = plan.includes('STRONG');
                                const barColor = isHealthy ? 'bg-emerald-500' : isSlim ? 'bg-blue-500' : isStrong ? 'bg-amber-500' : 'bg-indigo-500';
                                const badgeColor = isHealthy ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : isSlim ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : isStrong ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
                                
                                const percent = Math.round((planData.total / finalPrintLabels.length) * 100);

                                return (
                                  <div key={plan} className="flex flex-col gap-1 p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                                    <div className="flex justify-between items-center text-[11px] font-bold">
                                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.2 rounded-full border ${badgeColor}`}>
                                        {plan}
                                      </span>
                                      <span className="text-slate-200">
                                        {planData.total} viandas <span className="text-[9px] text-slate-500">({percent}%)</span>
                                      </span>
                                    </div>

                                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }}></div>
                                    </div>

                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {Object.entries(planData.siglas).map(([sig, count]) => (
                                        <span key={sig} className="text-[9px] font-black font-mono px-1.5 py-0.2 rounded bg-white/5 text-slate-300 border border-white/5 flex items-center gap-1">
                                          <span className="text-slate-500">{sig}:</span>
                                          <span className="text-white">{count} u.</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-white/5 flex justify-between items-center text-[10px] font-bold text-slate-400">
                            <span>Total de Viandas:</span>
                            <span className="text-sm font-black text-white">{finalPrintLabels.length} u.</span>
                          </div>
                        </div>

                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
                          <div>
                            <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-xs">warning</span>
                              Exclusiones y Alergias Activas
                            </h4>

                            <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[160px] custom-scrollbar pr-1">
                              {kitchenConsolidation.exclusionsList.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-6 text-center opacity-60">
                                  <span className="material-symbols-outlined text-2xl text-emerald-400 mb-1">check_circle</span>
                                  <p className="text-[10px] font-bold text-slate-300">¡Limpieza total de alérgenos!</p>
                                  <p className="text-[9px] text-slate-500">Ningún cliente activo tiene exclusiones.</p>
                                </div>
                              ) : (
                                kitchenConsolidation.exclusionsList.map((item, idx) => (
                                  <div key={`${item.name}-${idx}`} className="flex items-start justify-between gap-2 p-2 bg-rose-500/10 border border-rose-500/25 rounded-lg">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] font-black text-slate-200 truncate">{item.name}</span>
                                        <span className="text-[8px] font-black font-mono uppercase bg-white/10 text-rose-300 px-1 py-0.2 rounded border border-white/5 shrink-0">
                                          {item.siglas}
                                        </span>
                                      </div>
                                      <p className="text-[10px] font-bold text-rose-400 mt-0.5 flex items-start gap-1">
                                        <span className="material-symbols-outlined text-[10px] mt-0.5 shrink-0">block</span>
                                        <span className="truncate">{item.exclusions}</span>
                                      </p>
                                    </div>
                                    <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider shrink-0 mt-0.5">
                                      {item.plan}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-white/5 flex justify-between items-center text-[10px] font-bold text-slate-400">
                            <span>Clientes con Alergias:</span>
                            <span className="text-[10px] font-black text-rose-400 bg-rose-500/15 border border-rose-500/25 px-2 py-0.5 rounded-full">
                              {kitchenConsolidation.exclusionsList.length} alertas
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Interactive labels grid preview */}
              <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-5 flex-1">
                
                {/* Preview Panel Header Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600 text-lg bg-blue-50 p-1 rounded-lg">preview</span>
                    <h3 className="text-xs font-black text-slate-750 uppercase tracking-widest">
                      Previsualización de Hojas
                    </h3>
                  </div>

                  {/* View Controls & Zoom Controls Group */}
                  <div className="flex flex-wrap items-center gap-3">
                    
                    {/* View Mode Toggle */}
                    <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/50">
                      <button
                        onClick={() => setViewMode('single')}
                        className={`py-1 px-2.5 rounded-md transition-all text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${viewMode === 'single'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        <span className="material-symbols-outlined text-[13px]">auto_awesome_motion</span>
                        Una por Hoja
                      </button>
                      <button
                        onClick={() => setViewMode('all')}
                        className={`py-1 px-2.5 rounded-md transition-all text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${viewMode === 'all'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        <span className="material-symbols-outlined text-[13px]">table_rows</span>
                        Ver Todas
                      </button>
                    </div>

                    {/* Zoom Levels */}
                    <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/50">
                      <button
                        onClick={() => setPreviewZoom('sm')}
                        className={`py-1 px-2.5 rounded-md transition-all text-[9px] font-black uppercase tracking-wider ${previewZoom === 'sm'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'}`}
                        title="Zoom Out (Compacto)"
                      >
                        P
                      </button>
                      <button
                        onClick={() => setPreviewZoom('md')}
                        className={`py-1 px-2.5 rounded-md transition-all text-[9px] font-black uppercase tracking-wider ${previewZoom === 'md'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'}`}
                        title="Zoom Medio (Normal)"
                      >
                        M
                      </button>
                      <button
                        onClick={() => setPreviewZoom('lg')}
                        className={`py-1 px-2.5 rounded-md transition-all text-[9px] font-black uppercase tracking-wider ${previewZoom === 'lg'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'}`}
                        title="Zoom In (Grande)"
                      >
                        G
                      </button>
                    </div>

                  </div>
                </div>

                {/* Pagination (Only in single sheet view mode) */}
                {viewMode === 'single' && labelSheets.length > 0 && (
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200/60 p-2 rounded-xl mb-4 animate-fadeIn">
                    <button 
                      disabled={activeSheetIndex === 0}
                      onClick={() => setActiveSheetIndex(activeSheetIndex - 1)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-[10px] rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <span className="material-symbols-outlined text-[14px]">chevron_left</span>
                      Anterior
                    </button>
                    
                    <div className="text-center flex items-center justify-center gap-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                        Hoja {activeSheetIndex + 1} de {labelSheets.length}
                      </span>
                      <span className="text-slate-300 text-xs">|</span>
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100/50">
                        Repartidor: {labelSheets[activeSheetIndex]?.[0]?.driver || 'SIN ASIGNAR'}
                      </span>
                    </div>

                    <button 
                      disabled={activeSheetIndex === labelSheets.length - 1}
                      onClick={() => setActiveSheetIndex(activeSheetIndex + 1)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-[10px] rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Siguiente
                      <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                    </button>
                  </div>
                )}

                {labelSheets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <span className="material-symbols-outlined text-4xl text-slate-200">local_shipping</span>
                    <p className="text-xs font-bold text-slate-500 mt-3">No hay etiquetas activas en esta ruta</p>
                    <p className="text-[9px] text-slate-400 mt-1 max-w-xs">Asegúrate de tener choferes activos en la ruta y no tener a todos excluidos en la barra lateral.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6 overflow-y-auto max-h-[75vh] custom-scrollbar pr-1">
                    {sheetsToRender.map(({ sheet, idx }) => (
                      <div key={`sheet-preview-${idx}`} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm">
                        {viewMode === 'all' && (
                          <div className="flex justify-between items-center mb-3 pb-1.5 border-b border-slate-200/60">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                              Hoja {idx + 1} de {labelSheets.length}
                            </span>
                            <span className="text-[9px] font-black text-blue-600 uppercase tracking-wider bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100/50">
                              Repartidor: {sheet[0]?.driver}
                            </span>
                          </div>
                        )}

                        {/* Physical grid mapping preview based on zoom */}
                        <div className={
                          previewZoom === 'sm' ? "grid grid-cols-4 lg:grid-cols-5 gap-1.5 animate-fadeIn" :
                          previewZoom === 'lg' ? "grid grid-cols-1 sm:grid-cols-2 gap-3.5 animate-fadeIn" :
                          "grid grid-cols-3 gap-2.5 animate-fadeIn" // md (default)
                        }>
                          {sheet.map((label) => {
                            if (label.isPlaceholder) {
                              return (
                                <div key={label.id} className="aspect-[4/3] rounded-lg border border-dashed border-slate-200 flex items-center justify-center opacity-30 bg-white">
                                  <span className="text-[8px] font-bold text-slate-300 uppercase">Vacío</span>
                                </div>
                              );
                            }

                            const planLower = label.plan.toLowerCase();
                            const planBadgeColor = 
                              planLower.includes('healthy') ? 'bg-emerald-500 text-white' :
                              planLower.includes('slim') ? 'bg-blue-500 text-white' :
                              planLower.includes('strong') ? 'bg-amber-500 text-white' : 'bg-indigo-500 text-white';

                            const siglasFontWeight = siglasTextWeight === 'black' ? '900' : siglasTextWeight;
                            const planFontWeight = planTextWeight;
                            const clientFontWeight = clientTextWeight === 'black' ? '900' : clientTextWeight;
                            const exclFontWeight = exclTextWeight;
                            const routeFontWeight = routeTextWeight;
                            const driverFontWeight = driverTextWeight;

                            // Scale factors for preview labels based on Zoom
                            const sizeMultiplier = 
                              previewZoom === 'sm' ? 0.78 :
                              previewZoom === 'lg' ? 1.25 : 1.0;

                            const isHasExclusions = label.exclusions && label.exclusions !== 'None' && label.exclusions !== 'Ninguna';

                            return (
                              <div 
                                key={label.id} 
                                className={`aspect-[4/3] bg-white rounded-lg border shadow-sm flex flex-col justify-between hover:shadow-md transition-all relative overflow-hidden group ${
                                  isHasExclusions 
                                    ? 'border-rose-200 hover:border-rose-300 bg-rose-50/15' 
                                    : 'border-slate-200 hover:border-slate-300'
                                }`}
                                style={{
                                  padding: `${2.2 * sizeMultiplier}mm`
                                }}
                              >
                                <div className="flex justify-between items-start mt-0.5 w-full min-w-0">
                                  <span 
                                    className="text-black leading-none shrink-0"
                                    style={{ 
                                      fontSize: `${(siglasTextSize - 1.5) * sizeMultiplier}px`, 
                                      fontFamily: siglasTextFont, 
                                      fontWeight: siglasFontWeight 
                                    }}
                                  >
                                    {label.siglas}
                                  </span>
                                  <span 
                                    className="text-slate-500 uppercase italic truncate max-w-[65%] text-right font-bold"
                                    style={{ 
                                      fontSize: `${(planTextSize - 1.2) * sizeMultiplier}px`, 
                                      fontFamily: planTextFont, 
                                      fontWeight: planFontWeight 
                                    }}
                                    title={label.plan}
                                  >
                                    {label.plan}
                                  </span>
                                </div>

                                <div className="flex-grow flex flex-col justify-center items-center text-center my-1 min-w-0 w-full">
                                  <h4 
                                    className="text-black leading-tight font-bold w-full break-words"
                                    style={{ 
                                      fontSize: `${(clientTextSize - 1.5) * sizeMultiplier}px`, 
                                      fontFamily: clientTextFont, 
                                      fontWeight: clientFontWeight 
                                    }}
                                    title={label.name}
                                  >
                                    {label.name}
                                  </h4>
                                  {isHasExclusions && (
                                    <p 
                                      className="text-rose-600 truncate mt-1 font-bold bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 flex items-center gap-1 w-fit max-w-full"
                                      style={{ 
                                        fontSize: `${(exclTextSize - 0.7) * sizeMultiplier}px`, 
                                        fontFamily: exclTextFont, 
                                        fontWeight: exclFontWeight 
                                      }}
                                      title={`Exclusiones: ${label.exclusions}`}
                                    >
                                      <span className="material-symbols-outlined text-[10px] font-bold text-rose-500">block</span>
                                      Excl: {label.exclusions}
                                    </p>
                                  )}
                                </div>

                                <div className="flex justify-between items-end pt-1 w-full min-w-0">
                                  <span 
                                    className="text-black font-bold shrink-0"
                                    style={{ 
                                      fontSize: `${(routeTextSize - 0.8) * sizeMultiplier}px`, 
                                      fontFamily: routeTextFont, 
                                      fontWeight: routeFontWeight 
                                    }}
                                  >
                                    {label.route.substring(0, 1).toUpperCase()}
                                  </span>
                                  <span 
                                    className="rounded-full border border-slate-400 shrink-0 cursor-help"
                                    style={{ 
                                      backgroundColor: getDriverColor(label.driver),
                                      width: `${4.4 * sizeMultiplier}mm`,
                                      height: `${4.4 * sizeMultiplier}mm`,
                                    }}
                                    title={label.driver}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>
      ) : (
        <div className="flex flex-col items-center justify-center bg-white rounded-3xl shadow-md border border-slate-100 p-12 text-center print:hidden">
          <span className="material-symbols-outlined text-5xl text-slate-200">content_paste_off</span>
          <h3 className="text-sm font-black text-slate-800 mt-3 uppercase tracking-wide">Sin Datos Activos</h3>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed mt-2">
            No has cargado ni pegado datos aún. Utiliza el cuadro de importación rápida superior para pegar filas de Excel o subir tu archivo de etiquetas.
          </p>
        </div>
      )}

      {/* ── HIDDEN PRINT AREA (USED BY WINDOW.PRINT()) ──────────────────────── */}
      <div id="print-area-wrapper" className="hidden">
        {labelSheets.map((sheet, sheetIdx) => (
          <div key={`print-sheet-${sheetIdx}`} className="print-page">
            <div className="print-grid">
              {sheet.map((label) => {
                if (label.isPlaceholder) {
                  return <div key={label.id} className="print-label" style={{ border: 'none', visibility: 'hidden' }}></div>;
                }

                const planLower = label.plan.toLowerCase();
                const planClass = 
                  planLower.includes('healthy') ? 'healthy' :
                  planLower.includes('slim') ? 'slim' :
                  planLower.includes('strong') ? 'strong' : '';

                return (
                  <div key={label.id} className="print-label">
                    <div className="print-label-header-row">
                      <span className="print-label-siglas">{label.siglas}</span>
                      <span className="print-label-plan">{label.plan}</span>
                    </div>
                    
                    <div className="print-label-body">
                      <div className="print-label-name">{label.name}</div>
                      {label.exclusions && label.exclusions !== 'None' && label.exclusions !== 'Ninguna' && (
                        <div className="print-label-excl">
                          Excl: {label.exclusions}
                        </div>
                      )}
                    </div>
                    
                    <div className="print-label-footer">
                      <span className="print-label-footer-route">
                        {label.route.substring(0, 1).toUpperCase()}
                      </span>
                      <span 
                        className="print-label-footer-driver-color"
                        style={{ backgroundColor: getDriverColor(label.driver) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

export default LabelsDashboard;
