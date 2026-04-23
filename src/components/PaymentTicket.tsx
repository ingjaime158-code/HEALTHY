import React, { useRef, useState } from 'react';
import { Trip } from '../services/dataService';
import jsPDF from 'jspdf';
import { formatCurrency } from '../utils/format';

interface PaymentTicketProps {
    trip: Trip | null;
    open?: boolean;
    onClose: () => void;
}

// Helper: convert image URL to base64
const loadImageAsBase64 = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } else {
                reject('No canvas context');
            }
        };
        img.onerror = reject;
        img.src = url;
    });
};

const PaymentTicket: React.FC<PaymentTicketProps> = ({ trip, onClose }) => {
    const ticketRef = useRef<HTMLDivElement>(null);
    const [downloading, setDownloading] = useState(false);

    if (!trip) return null;

    const totalCost = (trip.cost || 0) + (trip.waitTimeCost || 0) + (trip.tollCost || 0);

    const parsedStops = (() => {
        try {
            if (Array.isArray(trip.stops)) return trip.stops;
            if (typeof trip.stops === 'string') return JSON.parse(trip.stops || '[]');
        } catch { }
        return [];
    })();

    const calcDistance = (lat1?: number, lon1?: number, lat2?: number, lon2?: number) => {
        if (!lat1 || !lon1 || !lat2 || !lon2) return null;
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const routeSegments = [];
    if (parsedStops.length === 0) {
        routeSegments.push({
            origin: trip.origin,
            dest: trip.destination,
            km: trip.distance || trip.distanceKm,
            cost: trip.cost
        });
    } else {
        const points = [
            { address: trip.origin, lat: trip.originLat, lng: trip.originLng },
            ...parsedStops,
            { address: trip.destination, lat: trip.destLat, lng: trip.destLng }
        ];

        let totalKmAcc = 0;
        const tempSegments = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];
            const dist = calcDistance(p1.lat, p1.lng, p2.lat, p2.lng);
            if (dist != null) totalKmAcc += dist;

            tempSegments.push({
                origin: p1.address,
                dest: p2.address,
                km: dist,
                cost: null
            });
        }

        const exactTotalKm = trip.distance || trip.distanceKm;
        const totalTripKmNum = exactTotalKm ? Number(exactTotalKm) : totalKmAcc;

        if (totalKmAcc > 0 && totalTripKmNum > 0 && exactTotalKm) {
            const ratio = totalTripKmNum / totalKmAcc;
            tempSegments.forEach(seg => {
                if (seg.km != null) {
                    seg.km = seg.km * ratio;
                }
            });
        }

        routeSegments.push(...tempSegments);

        // Fila extra para mostrar la suma o el total explícito
        routeSegments.push({
            origin: '',
            dest: 'TOTAL',
            km: totalTripKmNum || (totalKmAcc > 0 ? totalKmAcc : null),
            cost: trip.cost
        });
    }

    const formatTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '--';


    const handleDownloadPDF = async () => {
        setDownloading(true);
        try {
            // Letter size: 216 x 279 mm
            const pdf = new jsPDF('p', 'mm', 'letter');
            const w = 216;
            const pageH = 279;
            const m = 18; // margin

            // Load logo
            let logoBase64 = '';
            try {
                logoBase64 = await loadImageAsBase64('/LOGO2.jpg');
            } catch { /* fallback without logo */ }

            // ========== HEADER (fondo negro) ==========
            pdf.setFillColor(17, 17, 17);
            pdf.rect(0, 0, w, 48, 'F');

            // Decorative circles in header
            pdf.setFillColor(30, 30, 30);
            pdf.circle(-5, 5, 20, 'F');
            pdf.circle(w + 5, 0, 15, 'F');

            // Logo
            if (logoBase64) {
                pdf.addImage(logoBase64, 'PNG', m - 5, 9, 60, 30);
            }

            // HEALTHY DREAM text
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(36);
            pdf.setFont('helvetica', 'bold');
            pdf.text('HEALTHY DREAM', w / 2 + 20, 24);

            // Subtitle
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'normal');
            pdf.text('COMERCIALIZADORA Y TRANSPORTE', w / 2 + 20, 31);
            pdf.text('INTEGRAL ÓPTIMO', w / 2 + 20, 36);

            // ========== SLOGAN + FOLIO ==========
            let y = 58;
            pdf.setTextColor(160, 140, 90);
            pdf.setFontSize(13);
            pdf.setFont('helvetica', 'italic');
            pdf.text('TU SITIO DE CONFIANZA', m, y);

            // FOLIO (ahora mapeado a remisionFolio si existe)
            pdf.setTextColor(200, 50, 50);
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.text('FOLIO:', w - m - 40, y);
            pdf.setTextColor(100, 100, 100);
            pdf.text(trip.remisionFolio || '____', w - m - 25, y);
            y += 10;

            // ========== DATOS DEL VIAJE ==========
            const labelX = m;
            const drawField = (label: string, value: string, x: number, yPos: number, labelW: number = 0) => {
                pdf.setTextColor(30, 30, 30);
                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'bold');
                pdf.text(label, x, yPos);
                const lw = labelW || pdf.getTextWidth(label) + 2;
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(50, 50, 50);
                pdf.text(value, x + lw, yPos);
                // Underline
                pdf.setDrawColor(180, 180, 180);
                pdf.setLineWidth(0.2);
                const lineStart = x + lw;
                const lineEnd = x + lw + Math.max(pdf.getTextWidth(value) + 5, 30);
                pdf.line(lineStart, yPos + 1, lineEnd, yPos + 1);
            };

            // EMPRESA / ID ENTREGA
            drawField('EMPRESA:', trip.client || trip.unitName || 'Particular', labelX, y, 25);
            pdf.setTextColor(200, 50, 50);
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.text('ID ENTREGA:', w / 2 + 10, y);
            pdf.setTextColor(50, 50, 50);
            pdf.setFont('courier', 'bold');
            pdf.text((trip.id || '').substring(0, 8).toUpperCase(), w / 2 + 32, y);
            y += 7;

            // DIRECCIÓN
            drawField('DIRECCIÓN:', (trip.origin || 'No especificado').substring(0, 60), labelX + 10, y, 28);
            y += 5;
            // Paradas intermedias
            const tripStops: { address: string; lat: number; lng: number }[] = (() => {
                try {
                    if (Array.isArray(trip.stops)) return trip.stops;
                    if (typeof (trip as any).stops === 'string') return JSON.parse((trip as any).stops || '[]');
                } catch { }
                return [];
            })();
            if (tripStops.length > 0) {
                tripStops.forEach((stop: any, idx) => {
                    pdf.setTextColor(234, 88, 12); // orange-600
                    pdf.setFontSize(7);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(`PARADA ${idx + 1}:`, labelX + 10, y);
                    pdf.setTextColor(50, 50, 50);
                    pdf.setFont('helvetica', 'normal');
                    
                    let stopText = (stop.address || '').substring(0, 50);
                    if (stop.completedAt) {
                         const sTime = formatTime(stop.completedAt);
                         stopText += ` (Hora: ${sTime})`;
                    }
                    pdf.text(stopText, labelX + 38, y);
                    y += 4;
                });
            }
            // Segunda línea de dirección (destino)
            pdf.setTextColor(50, 50, 50);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            const destLabel = tripStops.length > 0 ? 'DESTINO FINAL:' : '';
            const destAddr = (trip.destination || '').substring(0, 60);
            if (destAddr) {
                if (destLabel) {
                    pdf.setTextColor(30, 30, 30);
                    pdf.setFontSize(7);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(destLabel, labelX + 10, y);
                    pdf.setTextColor(50, 50, 50);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(destAddr, labelX + 38, y);
                } else {
                    pdf.text(destAddr, labelX + 38, y);
                }
                pdf.setDrawColor(180, 180, 180);
                pdf.line(labelX + 38, y + 1, w - m, y + 1);
            }
            y += 8;

            // CEL / FECHA / HORA
            drawField('CEL:', trip.passengerPhone || '--', labelX + 10, y, 14);
            drawField('FECHA:', trip.date || '--', w / 2 - 20, y, 18);
            drawField('HORA:', trip.time || '--', w / 2 + 30, y, 16);
            y += 7;

            // PROGRAMADO / INICIO / FIN
            drawField('PROGRAMADO:', formatTime(trip.scheduledAt), labelX + 10, y, 29);
            drawField('INICIO:', formatTime(trip.tripStartedAt), w / 2 - 5, y, 15);
            drawField('FINALIZÓ:', formatTime(trip.createdAt || trip.time), w / 2 + 30, y, 21);
            y += 7;

            // DESTINATARIO / CONFIRMÓ
            drawField('DESTINATARIO:', trip.passengerName || 'Desconocido', labelX + 10, y, 26);
            drawField('CONFIRMÓ:', trip.confirmedBy || '--', w / 2 + 10, y, 26);
            y += 7;

            // USUARIO / BASE / CHOFER
            drawField('USUARIO:', String(trip.createdBy || '--'), labelX + 10, y, 22);
            drawField('BASE:', trip.unitName || '--', w / 2 - 15, y, 16);
            const driverName = trip.driver && trip.driver !== 'Unknown' ? trip.driver : '--';
            drawField('CHOFER:', driverName, w / 2 + 30, y, 20);
            y += 10;

            // ========== TABLA 1: RUTA ==========
            const tX = m;
            const tW = w - m * 2;
            const col1 = [tW * 0.28, tW * 0.28, tW * 0.22, tW * 0.22];

            // Header
            pdf.setFillColor(50, 50, 50);
            pdf.rect(tX, y, tW, 7, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'bold');
            let cx = tX + 2;
            ['PUNTO DE SALIDA', 'DESTINO', 'KILÓMETROS', 'IMPORTE'].forEach((h, i) => {
                pdf.text(h, cx, y + 5);
                cx += col1[i];
            });
            y += 7;

            // Data rows (4 filas mínimo)
            pdf.setDrawColor(160, 160, 160);
            const numRows = Math.max(4, routeSegments.length);
            for (let r = 0; r < numRows; r++) {
                pdf.rect(tX, y, tW, 8, 'S');
                // Líneas verticales internas
                let vx = tX;
                col1.forEach(cw => {
                    vx += cw;
                    pdf.line(vx, y, vx, y + 8);
                });

                if (r < routeSegments.length) {
                    const segment = routeSegments[r];
                    pdf.setTextColor(40, 40, 40);
                    pdf.setFontSize(7);
                    pdf.setFont('helvetica', 'normal');
                    cx = tX + 2;
                    pdf.text((segment.origin || '--').split(',')[0].substring(0, 25), cx, y + 5);
                    cx += col1[0];
                    pdf.text((segment.dest || '--').split(',')[0].substring(0, 25), cx, y + 5);
                    cx += col1[1];
                    if (segment.km != null) {
                        pdf.text(`${Number(segment.km).toFixed(1)} km`, cx, y + 5);
                    }
                    cx += col1[2];
                    if (segment.cost != null) {
                        pdf.text(formatCurrency(segment.cost), cx, y + 5);
                    }
                }
                y += 8;
            }
            y += 3;

            // ========== TABLA 2: TIEMPO DE ESPERA ==========
            const col2 = [tW * 0.30, tW * 0.30, tW * 0.10, tW * 0.30];
            pdf.setFillColor(50, 50, 50);
            pdf.rect(tX, y, tW, 7, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'bold');
            cx = tX + 2;
            ['TIEMPO DE ESPERA', 'COSTO POR MINUTO', '', 'TOTAL'].forEach((h, i) => {
                pdf.text(h, cx, y + 5);
                cx += col2[i];
            });
            y += 7;

            // Data row
            pdf.setDrawColor(160, 160, 160);
            pdf.rect(tX, y, tW, 10, 'S');
            let vx2 = tX;
            col2.forEach(cw => {
                vx2 += cw;
                pdf.line(vx2, y, vx2, y + 10);
            });
            pdf.setTextColor(40, 40, 40);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            cx = tX + 2;
            // Desglose: gracia fija de 20 min + minutos cobrados
            const GRACE_MINS = 20;
            const totalWait = trip.waitTimeMinutes || 0;
            const billedMins = totalWait > GRACE_MINS ? totalWait - GRACE_MINS : 0;
            const waitLabel = totalWait > 0
                ? (billedMins > 0 ? `(${GRACE_MINS} + ${billedMins}) min` : `${totalWait} min`)
                : '';
            pdf.text(waitLabel, cx, y + 6);
            cx += col2[0];
            const costPerMin = (trip.waitTimeCost && billedMins > 0)
                ? formatCurrency(trip.waitTimeCost / billedMins) : '';
            pdf.text(costPerMin, cx, y + 6);
            cx += col2[1] + col2[2];
            pdf.text(trip.waitTimeCost ? formatCurrency(trip.waitTimeCost) : '', cx, y + 6);
            y += 10;
            y += 3;

            // ========== TABLA 3: COSTOS EXTRAS ==========
            const col3 = [tW * 0.25, tW * 0.35, tW * 0.10, tW * 0.30];
            pdf.setFillColor(50, 50, 50);
            pdf.rect(tX, y, tW, 7, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'bold');
            cx = tX + 2;
            ['COSTOS EXTRAS', 'DETALLES', '', 'TOTAL'].forEach((h, i) => {
                pdf.text(h, cx, y + 5);
                cx += col3[i];
            });
            y += 7;

            // Data row
            pdf.rect(tX, y, tW, 10, 'S');
            let vx3 = tX;
            col3.forEach(cw => {
                vx3 += cw;
                pdf.line(vx3, y, vx3, y + 10);
            });
            pdf.setTextColor(40, 40, 40);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            cx = tX + 2;
            pdf.text(trip.tollCost && trip.tollCost > 0 ? 'Casetas / Peajes' : '', cx, y + 6);
            cx += col3[0];
            pdf.text(trip.tollCost && trip.tollCost > 0 ? 'Autopista' : '', cx, y + 6);
            cx += col3[1] + col3[2];
            pdf.text(trip.tollCost ? formatCurrency(trip.tollCost) : '', cx, y + 6);
            y += 10;
            y += 8;

            // ========== TOTAL BOX ==========
            const totalBoxW = 45;
            const totalBoxX = w / 2 - 5;
            pdf.setFillColor(50, 50, 50);
            pdf.roundedRect(totalBoxX, y, totalBoxW, 10, 1, 1, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.text('TOTAL', totalBoxX + totalBoxW / 2, y + 7, { align: 'center' });
            y += 10;

            // Total value
            pdf.setTextColor(30, 30, 30);
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text(formatCurrency(totalCost), totalBoxX + totalBoxW / 2, y + 8, { align: 'center' });
            y += 22;

            // ========== FIRMA ==========
            pdf.setDrawColor(60, 60, 60);
            pdf.setLineWidth(0.5);
            pdf.line(w / 2 - 35, y, w / 2 + 35, y);
            y += 5;
            pdf.setFillColor(245, 245, 245);
            pdf.setDrawColor(120, 120, 120);
            const firmaW = 55;
            pdf.rect(w / 2 - firmaW / 2, y - 1, firmaW, 7, 'FD');
            pdf.setTextColor(50, 50, 50);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.text('FIRMA DE AUTORIZADO', w / 2, y + 4, { align: 'center' });

            // ========== FOOTER ==========
            const footerH = 16;
            const footerY = pageH - footerH;
            pdf.setFillColor(17, 17, 17);
            pdf.rect(0, footerY, w, footerH, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            pdf.text('CONTACTO@HEALTHYDREAM.COM', m + 15, footerY + 10);
            pdf.text('81 8181 5200', w - m - 30, footerY + 10);

            // Mail icon (simple envelope)
            pdf.setDrawColor(255, 255, 255);
            pdf.setLineWidth(0.4);
            const eX = m + 5;
            const eY = footerY + 6;
            pdf.rect(eX, eY, 7, 5, 'S');
            pdf.line(eX, eY, eX + 3.5, eY + 3);
            pdf.line(eX + 7, eY, eX + 3.5, eY + 3);

            // Phone icon (simple rectangle)
            const pX = w - m - 40;
            const pY = footerY + 6;
            pdf.roundedRect(pX, pY, 4, 6, 0.5, 0.5, 'S');

            // Watermark "HEALTHY DREAM" en la esquina derecha (simulado)
            pdf.setTextColor(240, 240, 240);
            pdf.setFontSize(60);
            pdf.setFont('helvetica', 'bold');
            pdf.text('HD', w - m + 5, pageH / 2 + 40, { angle: 90 });

            // Build filename
            let fileName = '';
            const shortId = (trip.id || '').substring(0, 8).toUpperCase();
            if (!trip.businessId) {
                const dName = (trip.driver && trip.driver !== 'Unknown') ? trip.driver : 'Chofer';
                const sanitized = dName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '').trim().replace(/\s+/g, '_');
                fileName = `${sanitized}-${shortId}.pdf`;
            } else {
                const bName = (trip.client && trip.client !== 'Unknown')
                    ? trip.client
                    : (trip.unitName || 'General');
                const sanitized = bName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '').trim().replace(/\s+/g, '_');
                fileName = `${sanitized}-${shortId}.pdf`;
            }

            pdf.save(fileName);
        } catch (err) {
            console.error('Error generating PDF:', err);
            alert('Error al generar el PDF. Intenta de nuevo.');
        }
        setDownloading(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col relative"
                onClick={e => e.stopPropagation()}
            >
                {/* Scrollable ticket preview */}
                <div ref={ticketRef} className="overflow-y-auto max-h-[80vh]">
                    {/* Header */}
                    <div className="bg-[#111] px-5 py-4 relative overflow-hidden">
                        <div className="absolute -left-4 -top-4 w-16 h-16 rounded-full bg-[#1a1a1a]"></div>
                        <div className="absolute -right-3 -top-3 w-12 h-12 rounded-full bg-[#1a1a1a]"></div>
                        <div className="flex items-center gap-3 relative z-10">
                            <img src="/LOGO2.jpg" alt="HEALTHY DREAM" className="h-16 w-auto object-contain" />
                            <div>
                                <h2 className="text-white text-2xl font-black tracking-[0.15em]">HEALTHY DREAM</h2>
                                <p className="text-white/40 text-[7px] font-medium uppercase tracking-wider leading-tight">Comercializadora y Transporte<br/>Integral Óptimo</p>
                            </div>
                        </div>
                    </div>

                    {/* Slogan + FOLIO */}
                    <div className="px-5 pt-4 pb-2 flex justify-between items-baseline">
                        <p className="text-[#a08c5a] text-sm font-semibold italic tracking-wider">TU SITIO DE CONFIANZA</p>
                        <p className="text-red-500 text-[11px] font-bold">FOLIO: <span className="text-slate-500">{trip.remisionFolio || '____'}</span></p>
                    </div>

                    {/* Body */}
                    <div className="px-5 pb-4 text-[11px] space-y-1.5">
                        {/* EMPRESA / ID ENTREGA */}
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <span className="font-black text-slate-700">EMPRESA:</span>
                                <span className="ml-1 text-slate-600 border-b border-slate-300 pb-0.5">{trip.client || trip.unitName || 'Particular'}</span>
                            </div>
                            <div>
                                <span className="font-black text-red-500">ID ENTREGA:</span>
                                <span className="ml-1 font-mono font-bold text-slate-700 border-b border-slate-300 pb-0.5">{(trip.id || '').substring(0, 8).toUpperCase()}</span>
                            </div>
                        </div>

                        {/* DIRECCIÓN */}
                        <div>
                            <span className="font-black text-slate-700">DIRECCIÓN:</span>
                            <span className="ml-1 text-slate-600 border-b border-slate-300 pb-0.5 text-[10px]">{(trip.origin || '--').substring(0, 55)}</span>
                        </div>
                        {trip.stops && (() => {
                            const stops: any[] = (() => {
                                try {
                                    if (Array.isArray(trip.stops)) return trip.stops;
                                    if (typeof trip.stops === 'string') return JSON.parse(trip.stops as unknown as string || '[]');
                                } catch { }
                                return [];
                            })();
                            return stops.length > 0 ? stops.map((stop, idx) => (
                                <div key={idx} className="pl-[70px] text-[10px] text-orange-500 border-b border-orange-200 pb-0.5 font-medium">
                                    <span className="font-black">PARADA {idx + 1}:</span> {(stop.address || '').substring(0, 45)} {stop.completedAt ? <span className="text-orange-400 opacity-80">(Hora: {formatTime(stop.completedAt)})</span> : ''}
                                </div>
                            )) : null;
                        })()}
                        <div className="pl-[70px] text-[10px] text-slate-500 border-b border-slate-200 pb-0.5">
                            {trip.stops && Array.isArray(trip.stops) && trip.stops.length > 0 && <span className="font-black text-slate-700">DESTINO FINAL: </span>}
                            {(trip.destination || '').substring(0, 55)}
                        </div>

                        {/* CEL / FECHA / HORA */}
                        <div className="flex gap-3 pt-1">
                            <div><span className="font-black text-slate-700">CEL:</span> <span className="text-slate-600 border-b border-slate-300">{trip.passengerPhone || '--'}</span></div>
                            <div><span className="font-black text-slate-700">FECHA:</span> <span className="text-slate-600 border-b border-slate-300">{trip.date || '--'}</span></div>
                            <div><span className="font-black text-slate-700">HORA:</span> <span className="text-slate-600 border-b border-slate-300">{trip.time || '--'}</span></div>
                        </div>

                        {/* PROGRAMADO / INICIO / FIN */}
                        <div className="flex gap-3 pt-1">
                            <div className="flex-1"><span className="font-black text-slate-700">PROGRAMADO:</span> <span className="text-slate-600 border-b border-slate-300 whitespace-nowrap">{formatTime(trip.scheduledAt)}</span></div>
                            <div className="flex-1"><span className="font-black text-slate-700">INICIO:</span> <span className="text-slate-600 border-b border-slate-300 whitespace-nowrap">{formatTime(trip.tripStartedAt)}</span></div>
                            <div className="flex-1"><span className="font-black text-slate-700">FINALIZÓ:</span> <span className="text-slate-600 border-b border-slate-300 whitespace-nowrap">{formatTime(trip.createdAt || trip.time)}</span></div>
                        </div>

                        {/* DESTINATARIO / CONFIRMÓ */}
                        <div className="flex gap-4">
                            <div className="flex-1"><span className="font-black text-slate-700">DESTINATARIO:</span> <span className="text-slate-600 border-b border-slate-300">{trip.passengerName || '--'}</span></div>
                            <div className="flex-1"><span className="font-black text-slate-700">CONFIRMÓ:</span> <span className="text-slate-600 border-b border-slate-300">{trip.confirmedBy || '--'}</span></div>
                        </div>

                        {/* USUARIO / BASE / CHOFER */}
                        <div className="flex gap-3">
                            <div><span className="font-black text-slate-700">USUARIO:</span> <span className="text-slate-600 border-b border-slate-300">{trip.createdBy || '--'}</span></div>
                            <div><span className="font-black text-slate-700">BASE:</span> <span className="text-slate-600 border-b border-slate-300">{trip.unitName || '--'}</span></div>
                            <div><span className="font-black text-slate-700">CHOFER:</span> <span className="text-slate-600 border-b border-slate-300">{trip.driver && trip.driver !== 'Unknown' ? trip.driver : '--'}</span></div>
                        </div>

                        {/* TABLA 1: Ruta */}
                        <table className="w-full mt-3 border-collapse text-[9px]">
                            <thead>
                                <tr className="bg-[#333] text-white">
                                    <th className="border border-slate-400 px-1.5 py-1 text-left font-bold uppercase">Punto de Salida</th>
                                    <th className="border border-slate-400 px-1.5 py-1 text-left font-bold uppercase">Destino</th>
                                    <th className="border border-slate-400 px-1.5 py-1 text-center font-bold uppercase">Kilómetros</th>
                                    <th className="border border-slate-400 px-1.5 py-1 text-right font-bold uppercase">Importe</th>
                                </tr>
                            </thead>
                            <tbody>
                                {routeSegments.map((segment, idx) => (
                                    <tr key={`seg-${idx}`}>
                                        <td className="border border-slate-300 px-1.5 py-1.5 text-slate-700">{(segment.origin || '--').split(',')[0].substring(0, 20)}</td>
                                        <td className="border border-slate-300 px-1.5 py-1.5 text-slate-700">{(segment.dest || '--').split(',')[0].substring(0, 20)}</td>
                                        <td className="border border-slate-300 px-1.5 py-1.5 text-center text-slate-700 font-bold">{segment.km != null ? `${Number(segment.km).toFixed(1)}` : ''}</td>
                                        <td className="border border-slate-300 px-1.5 py-1.5 text-right text-slate-900 font-bold">{segment.cost != null ? formatCurrency(segment.cost) : ''}</td>
                                    </tr>
                                ))}
                                {/* Fill remaining rows up to 4 if needed */}
                                {Array.from({ length: Math.max(0, 4 - routeSegments.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`}><td className="border border-slate-300 px-1.5 py-1.5">&nbsp;</td><td className="border border-slate-300 px-1.5 py-1.5"></td><td className="border border-slate-300 px-1.5 py-1.5"></td><td className="border border-slate-300 px-1.5 py-1.5"></td></tr>
                                ))}
                            </tbody>
                        </table>

                        {/* TABLA 2: Tiempo de Espera */}
                        <table className="w-full border-collapse text-[9px]">
                            <thead>
                                <tr className="bg-[#333] text-white">
                                    <th className="border border-slate-400 px-1.5 py-1 text-left font-bold uppercase">Tiempo de Espera</th>
                                    <th className="border border-slate-400 px-1.5 py-1 text-left font-bold uppercase">Costo por Minuto</th>
                                    <th className="border border-slate-400 px-1.5 py-1 text-right font-bold uppercase">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const GRACE_MINS = 20;
                                    const totalWait = trip.waitTimeMinutes || 0;
                                    const billedMins = totalWait > GRACE_MINS ? totalWait - GRACE_MINS : 0;
                                    const waitLabel = totalWait > 0
                                        ? (billedMins > 0 ? `(${GRACE_MINS} + ${billedMins}) min` : `${totalWait} min`)
                                        : '';
                                    const costPerMin = (trip.waitTimeCost && billedMins > 0)
                                        ? formatCurrency(trip.waitTimeCost / billedMins) : '';
                                    return (
                                        <tr>
                                            <td className="border border-slate-300 px-1.5 py-2 text-slate-700">{waitLabel}</td>
                                            <td className="border border-slate-300 px-1.5 py-2 text-slate-700">{costPerMin}</td>
                                            <td className="border border-slate-300 px-1.5 py-2 text-right text-slate-900 font-bold">
                                                {trip.waitTimeCost ? formatCurrency(trip.waitTimeCost) : ''}
                                            </td>
                                        </tr>
                                    );
                                })()}
                            </tbody>
                        </table>

                        {/* TABLA 3: Costos Extras */}
                        <table className="w-full border-collapse text-[9px]">
                            <thead>
                                <tr className="bg-[#333] text-white">
                                    <th className="border border-slate-400 px-1.5 py-1 text-left font-bold uppercase">Costos Extras</th>
                                    <th className="border border-slate-400 px-1.5 py-1 text-left font-bold uppercase">Detalles</th>
                                    <th className="border border-slate-400 px-1.5 py-1 text-right font-bold uppercase">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-slate-300 px-1.5 py-2 text-slate-700">{trip.tollCost && trip.tollCost > 0 ? 'Casetas / Peajes' : ''}</td>
                                    <td className="border border-slate-300 px-1.5 py-2 text-slate-700">{trip.tollCost && trip.tollCost > 0 ? 'Autopista' : ''}</td>
                                    <td className="border border-slate-300 px-1.5 py-2 text-right text-slate-900 font-bold">{trip.tollCost ? formatCurrency(trip.tollCost) : ''}</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* TOTAL */}
                        <div className="flex justify-end mt-2">
                            <div className="flex items-center gap-3">
                                <div className="bg-[#333] text-white px-5 py-1.5 rounded text-xs font-black uppercase tracking-wider">TOTAL</div>
                                <span className="text-lg font-black text-slate-900">{formatCurrency(totalCost)}</span>
                            </div>
                        </div>

                        {/* Firma */}
                        <div className="mt-10 flex flex-col items-center gap-1.5">
                            <div className="w-44 border-t-2 border-slate-500"></div>
                            <div className="border border-slate-400 px-4 py-1 text-[9px] font-black text-slate-600 uppercase tracking-wider">
                                Firma de Autorizado
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-[#111] px-5 py-3 flex justify-between items-center text-white text-[9px]">
                        <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[12px]">mail</span>
                            CONTACTO@HEALTHYDREAM.COM
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[12px]">phone</span>
                            81 8181 5200
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors shadow-sm"
                    >
                        Cerrar
                    </button>
                    <button
                        onClick={handleDownloadPDF}
                        disabled={downloading}
                        className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white bg-[#111] hover:bg-[#222] transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                        {downloading ? 'Generando...' : 'Descargar PDF'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentTicket;
