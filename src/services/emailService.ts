import { supabase } from './supabaseClient';

export const sendInvoiceEmail = async (
    toEmail: string,
    ccEmail: string,
    invoiceData: { id: string; providerName: string; totalCost: number; productName: string },
    pdfBlob: Blob,
    xmlString: string
) => {
    try {
        // Convert Blob to Base64
        const pdfBase64 = await blobToBase64(pdfBlob);
        const xmlBase64 = btoa(unescape(encodeURIComponent(xmlString)));

        // Get the current user's JWT token for authenticated requests
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            return { success: false, error: new Error('No hay sesión activa. Inicia sesión nuevamente.') };
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

        const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
                // 'from' is now hardcoded server-side — cannot be spoofed
                to: [toEmail],
                cc: ccEmail ? [ccEmail] : undefined,
                subject: `Factura y XML - Orden #${invoiceData.id.substring(0, 8)}`,
                html: `
                    <h1>Detalle de Transacción</h1>
                    <p>Adjunto encontrarás la factura y el XML correspondientes a tu compra.</p>
                    <ul>
                      <li><strong>Proveedor:</strong> ${invoiceData.providerName}</li>
                      <li><strong>Producto:</strong> ${invoiceData.productName}</li>
                      <li><strong>Total:</strong> $${invoiceData.totalCost.toLocaleString()}</li>
                    </ul>
                    <p>Gracias por usar Healthy Dream.</p>
                `,
                attachments: [
                    {
                        filename: `Factura_${invoiceData.id.substring(0, 8)}.pdf`,
                        content: pdfBase64
                    },
                    {
                        filename: `Factura_${invoiceData.id.substring(0, 8)}.xml`,
                        content: xmlBase64
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: new Error(errorText) };
        }

        const data = await response.json();
        return { success: true, data };

    } catch (err) {
        return { success: false, error: err };
    }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            resolve(base64String.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
