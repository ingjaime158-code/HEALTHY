import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CommercialTransaction, Product } from './dataService';
import { formatCurrency } from '../utils/format';

// Mock UUID generator for "Folio Fiscal"
const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// Mock Sello
const generateSello = (length: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result + '=';
};

// REMOVED: "Este documento es una representación impresa..." as requested

// Check if we want to return the Blob (for email) or Download (default)
// We added a 3rd arg "options" implicitly or we can just change signature below.
// Let's assume the caller will import this function.
// But wait, the signature in my mind was `generateInvoicePDF(tx, product)`. 
// I will adhere to: `generateInvoicePDF = async (tx, product, returnBlob = false)`

// New Signature
export const generateInvoicePDF = async (tx: CommercialTransaction, product?: Product | null, returnBlob: boolean = false): Promise<Blob | void> => {
    const doc = new jsPDF();
    const logoUrl = '/LOGO2.jpg';

    // Mock Fiscal Data
    const folioFiscal = generateUUID().toUpperCase();
    const noCertificado = '00001000000501234567'; // Ejemplo SAT
    const noCertificadoSAT = '00001000000509876543';
    const fechaCert = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const selloCFDI = generateSello(344);
    const selloSAT = generateSello(344);
    const cadenaOriginal = `||1.1|${folioFiscal}|${fechaCert}|SFE0807172W8|${selloCFDI.substring(0, 50)}...|${noCertificadoSAT}||`;

    // We wrap image loading in promise to make it async/awaitable for Email
    await new Promise<void>((resolve) => {
        const img = new Image();
        img.src = logoUrl;
        img.onload = () => {
            const imgRatio = img.width / img.height;
            let imgW = 50;
            let imgH = 50 / imgRatio;
            if (imgH > 40) {
                imgH = 40;
                imgW = 40 * imgRatio;
            }
            doc.addImage(img, 'PNG', 15, 15, imgW, imgH);
            resolve();
        };
        img.onerror = () => { resolve(); }; // Proceed even if logo fails
    });

    renderContent(doc, tx, product, folioFiscal, noCertificado, fechaCert, selloCFDI, selloSAT, cadenaOriginal);

    if (returnBlob) {
        return doc.output('blob');
    } else {
        doc.save(`Factura_${tx.id.substring(0, 8)}.pdf`);
    }
};

// Helper extracted to keep it clean
const renderContent = (doc: jsPDF, tx: CommercialTransaction, product: Product | null | undefined, uuid: string, cert: string, dateCert: string, sello: string, satSello: string, cadena: string) => {
    const purpleColor = '#1e1b4b';

    // Header Info (Right Side)
    doc.setFontSize(14);
    doc.setTextColor(purpleColor);
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURA', 195, 20, { align: 'right' });

    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.setFont('helvetica', 'normal');

    const headerX = 140;
    const valueX = 195;
    let cY = 28;
    const inc = 5;

    doc.text('Folio:', headerX, cY); doc.text(tx.id.substring(0, 8).toUpperCase(), valueX, cY, { align: 'right' }); cY += inc;
    doc.text('Fecha Emisión:', headerX, cY); doc.text(new Date(tx.transactionDate).toLocaleString(), valueX, cY, { align: 'right' }); cY += inc;
    doc.text('Lugar Expedición:', headerX, cY); doc.text('64000', valueX, cY, { align: 'right' }); cY += inc;
    doc.text('Tipo Comprobante:', headerX, cY); doc.text('I - Ingreso', valueX, cY, { align: 'right' }); cY += inc;
    doc.text('Régimen Fiscal:', headerX, cY); doc.text('601 - General de Ley P.M.', valueX, cY, { align: 'right' }); cY += inc;
    doc.text('Exportación:', headerX, cY); doc.text('01 - No aplica', valueX, cY, { align: 'right' });

    // Divider
    doc.setDrawColor(220);
    doc.line(15, 65, 195, 65);

    // Fiscal Info (UUID) - Very Important visually
    doc.setFontSize(8);
    doc.setTextColor(purpleColor);
    doc.text(`Folio Fiscal (UUID): ${uuid}`, 15, 62);

    // From / To Box
    const boxY = 70;
    doc.setFillColor(248, 248, 252);
    doc.roundedRect(15, boxY, 85, 35, 2, 2, 'F');
    doc.roundedRect(105, boxY, 90, 35, 2, 2, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Emisor', 20, boxY + 6);
    doc.text('Receptor', 110, boxY + 6);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);

    // Emisor Data
    doc.text(tx.providerName || 'Razón Social Desconocida', 20, boxY + 12);
    doc.text(`RFC: ${tx.providerRfc || 'XAXX010101000'}`, 20, boxY + 17);
    doc.text(tx.providerEmail || '', 20, boxY + 22);

    // Receptor Data
    doc.text(tx.receiverName || 'Cliente General', 110, boxY + 12);
    doc.text(`RFC: ${tx.receiverRfc || 'XAXX010101000'}`, 110, boxY + 17);
    doc.text(`Uso CFDI: G03 - Gastos en general`, 110, boxY + 22);
    doc.text(`Regimen Fiscal: 616 - Sin obligaciones fiscales`, 110, boxY + 27);
    doc.text(`CP: 00000`, 110, boxY + 32);

    // Items Table
    autoTable(doc, {
        startY: 115,
        head: [['Clave Prod', 'Clave Unidad', 'Cant', 'Descripción', 'Valor Unitario', 'Importe']],
        body: [
            [
                '01010101',
                'H87',
                tx.quantity.toString(),
                product?.name || tx.productName,
                (tx.unitCost).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }),
                (tx.totalCost).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
            ]
        ],
        theme: 'grid',
        headStyles: { fillColor: [40, 40, 50], fontSize: 8, halign: 'center' },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            0: { halign: 'center' },
            1: { halign: 'center' },
            2: { halign: 'center' },
            4: { halign: 'right' },
            5: { halign: 'right', fontStyle: 'bold' }
        }
    });

    // Totals
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const totalXLabel = 140;
    const totalXValue = 195;
    let tY = finalY;

    doc.setFontSize(9);
    doc.setTextColor(80);

    doc.text('Subtotal:', totalXLabel, tY);
    doc.text(formatCurrency(tx.totalCost), totalXValue, tY, { align: 'right' });
    tY += 6;

    const ivaValue = tx.iva !== undefined ? tx.iva : tx.totalCost * 0.16;
    doc.text('IVA (16%):', totalXLabel, tY);
    doc.text(formatCurrency(ivaValue), totalXValue, tY, { align: 'right' });
    tY += 10;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(purpleColor);
    doc.setFontSize(11);
    doc.text('Total:', totalXLabel, tY);
    doc.text(formatCurrency(tx.totalCost + ivaValue), totalXValue, tY, { align: 'right' });

    // Amount in Text (Placeholder)
    // Real implementation would require a 'numberToText' function
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('*** (CANTIDAD EN LETRA MOCK: PESOS 00/100 M.N.) ***', 15, finalY + 5);

    // Bottom Fiscal Details (Sello, Cadena, Code)
    let footerY = 220; // Bottom area

    doc.setDrawColor(200);
    doc.line(15, footerY, 195, footerY);
    footerY += 5;

    doc.setFontSize(7);
    doc.setTextColor(80);

    // Mock QR Code Area
    doc.setFillColor('#c8c8c8');
    doc.rect(15 as any, footerY as any, 35 as any, 35 as any, 'F' as any); // QR Placeholder
    doc.text('QR', 28, footerY + 20);

    const textX = 55;
    const maxWidth = 135; // Constrain width

    doc.setFont('helvetica', 'bold');
    doc.text('Sello Digital del CFDI:', textX, footerY);
    doc.setFont('helvetica', 'normal');

    // Wrap text manually
    const selloLines = doc.splitTextToSize(sello, maxWidth);
    doc.text(selloLines as unknown as string, textX, footerY + 4);

    // Calculate dynamic Y based on text height
    footerY += 6 + (selloLines.length * 3);

    doc.setFont('helvetica', 'bold');
    doc.text('Sello del SAT:', textX, footerY);
    doc.setFont('helvetica', 'normal');
    const selloSatLines = doc.splitTextToSize(satSello, maxWidth);
    doc.text(selloSatLines as unknown as string, textX, footerY + 4);

    footerY += 6 + (selloSatLines.length * 3);

    doc.setFont('helvetica', 'bold');
    doc.text('Cadena Original del complemento de certificación digital del SAT:', 15, footerY + 5);
    doc.setFont('helvetica', 'normal');
    const cadenaLines = doc.splitTextToSize(cadena, 180); // Corrected to use fixed width number instead of string options
    doc.text(cadenaLines as unknown as string, 15, footerY + 9);

    footerY += 9 + (cadenaLines.length * 3);

    // Final Certification Info
    const noCertificadoSAT = '00001000000509876543'; // Hardcoded for view
    doc.setFont('helvetica', 'bold');
    doc.text(`No. de Serie del Certificado del SAT: ${noCertificadoSAT}`, 15, footerY + 5);
    // Use dateCert from params
    doc.text(`Fecha y hora de certificación: ${dateCert}`, 100, footerY + 5);
};

export const generateInvoiceXML = (tx: CommercialTransaction): string => {
    const iva = tx.iva !== undefined ? tx.iva : tx.totalCost * 0.16;
    const total = tx.totalCost + iva;
    const date = new Date(tx.transactionDate).toISOString().split('.')[0];
    const uuid = generateUUID();

    // Escape special XML characters to prevent injection
    const escXml = (str: string): string => {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    };

    // Standard CFDI 4.0 Structure
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante 
    Version="4.0" 
    Serie="A" 
    Folio="${escXml(tx.id.substring(0, 8))}" 
    Fecha="${date}" 
    Sello="${generateSello(200)}"
    FormaPago="01" 
    NoCertificado="00001000000501234567" 
    Certificado="${generateSello(100)}" 
    SubTotal="${tx.totalCost.toFixed(2)}" 
    Moneda="MXN" 
    Total="${total.toFixed(2)}" 
    TipoDeComprobante="I" 
    Exportacion="01" 
    MetodoPago="PUE" 
    LugarExpedicion="64000"
    xmlns:cfdi="http://www.sat.gob.mx/cfd/4" 
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
    xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd">
    <cfdi:Emisor Nombre="${escXml(tx.providerName || '')}" Rfc="${escXml(tx.providerRfc || 'XAXX010101000')}" RegimenFiscal="601"/>
    <cfdi:Receptor Nombre="${escXml(tx.receiverName || '')}" Rfc="${escXml(tx.receiverRfc || 'XAXX010101000')}" UsoCFDI="G03" DomicilioFiscalReceptor="00000" RegimenFiscalReceptor="616"/>
    <cfdi:Conceptos>
        <cfdi:Concepto ClaveProdServ="01010101" Cantidad="${tx.quantity}" ClaveUnidad="H87" Unidad="Pieza" Descripcion="${escXml(tx.productName || '')}" ValorUnitario="${tx.unitCost.toFixed(2)}" Importe="${tx.totalCost.toFixed(2)}" ObjetoImp="02">
            <cfdi:Impuestos>
                <cfdi:Traslados>
                    <cfdi:Traslado Base="${tx.totalCost.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva.toFixed(2)}"/>
                </cfdi:Traslados>
            </cfdi:Impuestos>
        </cfdi:Concepto>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="${iva.toFixed(2)}">
        <cfdi:Traslados>
            <cfdi:Traslado Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva.toFixed(2)}" Base="${tx.totalCost.toFixed(2)}"/>
        </cfdi:Traslados>
    </cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital 
            xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" 
            xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd" 
            Version="1.1" 
            UUID="${uuid}" 
            FechaTimbrado="${date}" 
            RfcProvCertif="SAT970701NN3" 
            SelloCFD="${generateSello(200)}" 
            NoCertificadoSAT="00001000000509876543" 
            SelloSAT="${generateSello(200)}"/>
    </cfdi:Complemento>
</cfdi:Comprobante>`;

    return xml;
};

// Helper for download XML (kept separate if needed, or caller uses raw string)
export const downloadXML = (xmlString: string, txId: string) => {
    const blob = new Blob([xmlString], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Factura_${txId.substring(0, 8)}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
