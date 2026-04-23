import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    getProducts, addProduct, updateProduct, deleteProduct, Product,
    getTransactions, addTransaction, updateTransaction, CommercialTransaction,
    getBusinesses, Business
} from '../services/dataService';
import { getCurrentUserRole, getCurrentUserBusinessId } from '../services/authService';
import { uploadProductImage } from '../services/storageService';
import {
    getConversations, getMessages, sendMessage, startConversation, deleteConversation,
    Conversation, Message
} from '../services/chatService';

// Helper component for Gallery to avoid Hook rules violation in conditional render
const ProductGallery = ({ images, name }: { images: string[], name: string }) => {
    const [currentImgIdx, setCurrentImgIdx] = useState(0);

    if (!images || images.length === 0) return null;

    return (
        <div className="w-full h-full relative group/gallery">
            <img src={images[currentImgIdx]} alt={name} className="w-full h-full object-cover transition-opacity duration-300" />

            {/* Navigation Arrows */}
            {images.length > 1 && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); setCurrentImgIdx((prev) => (prev - 1 + images.length) % images.length); }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover/gallery:opacity-100 transition-opacity"
                    >
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setCurrentImgIdx((prev) => (prev + 1) % images.length); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover/gallery:opacity-100 transition-opacity"
                    >
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>

                    {/* Dots */}
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
                        {images.map((_, idx) => (
                            <div
                                key={idx}
                                className={`w-2 h-2 rounded-full transition-all ${idx === currentImgIdx ? 'bg-white scale-110' : 'bg-white/50'}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// Initial state constant for reset
const initialTxState = {
    id: '', // Only for edit
    providerBusinessId: '',
    providerEmail: '',
    receiverBusinessId: '',
    receiverEmail: '',
    productId: '',
    quantity: '1',
    unitCost: 0,
    totalCost: 0,
    status: 'Pendiente' as string,
    notes: '',
    commissionRate: 0,
    applyIva: true
};

const Comercializadora = () => {
    const navigate = useNavigate();
    const { tab, action, id } = useParams();
    const [searchParams] = useSearchParams();

    // Auth Context
    const role = getCurrentUserRole();
    const myBusinessId = getCurrentUserBusinessId();
    const isTrader = false; // Comerciante role removed — page is admin-only now

    // Data State
    const [products, setProducts] = useState<Product[]>([]);
    const [transactions, setTransactions] = useState<CommercialTransaction[]>([]);
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [loading, setLoading] = useState(true);

    // Tab State
    const [activeTab, setActiveTab] = useState<'inventory' | 'transactions' | 'my-products' | 'marketplace' | 'messages'>('inventory');

    // UI state
    const [searchTerm, setSearchTerm] = useState('');
    const [viewProduct, setViewProduct] = useState<Product | null>(null);

    // Filters for Catalog
    const [businessFilter, setBusinessFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('all'); // all, product, request
    const [sortOrder, setSortOrder] = useState('newest'); // newest, oldest

    // Modal Management
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

    // Unified Transaction Modal State
    const [isTxModalOpen, setIsTxModalOpen] = useState(false);
    const [txMode, setTxMode] = useState<'create' | 'edit'>('create');
    const [txForm, setTxForm] = useState(initialTxState);

    // Messaging State
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Product Form State
    const [newProduct, setNewProduct] = useState({
        name: '',
        description: '',
        businessId: '',
        priceRetail: '',
        priceWholesale: '',
        wholesaleMinQty: '',
        category: 'General',
        imageUrl: '',
        type: 'product' as 'product' | 'request'
    });

    const loadData = async () => {
        setLoading(true);
        const [pData, tData, bData] = await Promise.all([
            getProducts(),
            getTransactions(),
            getBusinesses()
        ]);
        setProducts(pData);
        setTransactions(tData);
        setBusinesses(bData);
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    // Load Conversations when entering Messages tab
    useEffect(() => {
        if (activeTab === 'messages' && myBusinessId) {
            getConversations(myBusinessId).then(convos => {
                setConversations(convos);
                // If URL has cid, select it
                const cid = searchParams.get('cid');
                if (cid) {
                    const found = convos.find(c => c.id === cid);
                    if (found) setActiveConversationId(cid);
                }
            });
        }
    }, [activeTab, myBusinessId, searchParams]);

    // Load Messages when active conversation changes
    useEffect(() => {
        if (activeConversationId) {
            getMessages(activeConversationId).then(setChatMessages);
            // Polling for demo purposes (simple implementation)
            const interval = setInterval(() => {
                getMessages(activeConversationId).then(setChatMessages);
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [activeConversationId]);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    // Sync URL to State
    useEffect(() => {
        // 1. TABS
        if (isTrader) {
            // Trader specific path mapping
            if (tab === 'mis-publicaciones') setActiveTab('my-products');
            else if (tab === 'mercado') setActiveTab('marketplace');
            else if (tab === 'mensajes') setActiveTab('messages');
            else setActiveTab('my-products'); // Default for trader
        } else {
            // Admin path mapping
            if (tab === 'catalogo') setActiveTab('inventory');
            else if (tab === 'crucesyventas') setActiveTab('transactions');
            else if (tab === 'mis-publicaciones') setActiveTab('my-products');
            else if (tab === 'mercado') setActiveTab('marketplace');
            else if (tab === 'mensajes') setActiveTab('messages');
            else setActiveTab('inventory'); // Default for admin
        }

        // 2. MODALS (Create/Edit)
        if (action === 'nuevo') {
            if (tab === 'catalogo' || tab === 'mis-publicaciones' || tab === 'mercado' || !tab) {
                setIsProductModalOpen(true);
                // Reset form
                setNewProduct({
                    name: '', description: '',
                    businessId: isTrader && myBusinessId ? myBusinessId : '',
                    priceRetail: '',
                    priceWholesale: '', wholesaleMinQty: '', category: 'General', imageUrl: '',
                    type: tab === 'mercado' ? 'request' : 'product'
                });
                setSelectedFiles(null);
            } else if (tab === 'crucesyventas') {
                setIsTxModalOpen(true);
                setTxMode('create');
                setTxForm(initialTxState);
            }
        } else if (action === 'editar' && id) {
            if (tab === 'crucesyventas') {
                const txToEdit = transactions.find(t => t.id === id);
                if (txToEdit) {
                    setIsTxModalOpen(true);
                    setTxMode('edit');
                    setTxForm({
                        id: txToEdit.id,
                        providerBusinessId: txToEdit.providerBusinessId || '',
                        providerEmail: txToEdit.providerEmail || '',
                        receiverBusinessId: txToEdit.receiverBusinessId || '',
                        receiverEmail: txToEdit.receiverEmail || '',
                        productId: txToEdit.productId || '',
                        quantity: txToEdit.quantity.toString(),
                        unitCost: txToEdit.unitCost,
                        totalCost: txToEdit.totalCost,
                        status: txToEdit.status,
                        notes: txToEdit.notes || '',
                        commissionRate: (txToEdit.commission && txToEdit.totalCost > 0) ? (txToEdit.commission / txToEdit.totalCost) * 100 : 0,
                        applyIva: (txToEdit.iva || 0) > 0
                    });
                }
            }
        } else {
            // No action -> Close modals
            setIsProductModalOpen(false);
            setIsTxModalOpen(false);
        }
    }, [tab, action, id, transactions, isTrader, myBusinessId]);

    // --- Logic for Transaction Form Calculation ---
    useEffect(() => {
        const qty = Number(txForm.quantity);
        const unitCost = Number(txForm.unitCost);
        if (!isNaN(qty) && !isNaN(unitCost)) {
            const newTotal = qty * unitCost;
            if (newTotal !== txForm.totalCost) {
                setTxForm(prev => ({ ...prev, totalCost: newTotal }));
            }
        }
    }, [txForm.quantity, txForm.unitCost]);

    const handleProductSelect = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        const qty = Number(txForm.quantity);
        const isWholesale = product.wholesaleMinQty > 0 && qty >= product.wholesaleMinQty;
        const suggestedPrice = (isWholesale && product.priceWholesale > 0) ? product.priceWholesale : product.priceRetail;

        setTxForm(prev => ({
            ...prev,
            productId: productId,
            unitCost: suggestedPrice,
        }));
    };

    // --- Detail Modal Actions ---
    const handleProductClick = (p: Product) => {
        setViewProduct(p);
    };

    const handleContactMessage = async () => {
        if (!viewProduct || !myBusinessId) return;

        const isRequest = viewProduct.type === 'request';
        // Logic: 
        // If Request (Buyer owns it), I am Seller. I contact Buyer (viewProduct.businessId).
        // If Product (Seller owns it), I am Buyer. I contact Seller (viewProduct.businessId).
        // Target is always viewProduct.businessId

        // INTERMEDIARY REFACTOR: Target 'Healthy Dream Soporte' (Fixed ID)
        // Find Support Business or use fixed ID
        const SUPPORT_ID = '00000000-0000-0000-0000-000000000000';
        // We verify it exists in loaded businesses just in case, but can proceed with ID

        const targetId = SUPPORT_ID;
        // Include original seller info in the message for context
        const sellerName = businesses.find(b => b.id === viewProduct.businessId)?.name || 'Vendedor Desconocido';

        const initialText = isRequest
            ? `Hola Soporte. Quiero contactar al solicitante "${sellerName}" sobre su solicitud "${viewProduct.name}". Me interesa proveerlo.`
            : `Hola Soporte. Me interesa el producto "${viewProduct.name}" del vendedor "${sellerName}". ¿Me pueden apoyar con la compra?`;

        const convoId = await startConversation(myBusinessId, targetId, viewProduct.id, initialText);

        if (convoId) {
            setViewProduct(null);
            // setActiveConversationId(convoId); // Handled by URL param now
            navigate(`/comercializadora/mensajes?cid=${convoId}`);
        } else {
            alert('Error al iniciar conversación.');
        }
    };

    const handleStartTransaction = () => {
        if (!viewProduct) return;

        // B2B Logic: Who is Provider? Who is Receiver?
        const isRequest = viewProduct.type === 'request';

        // Default (Product): I am buying from Owner
        let providerId = viewProduct.businessId;
        let providerEmail = businesses.find(b => b.id === providerId)?.email || '';
        let receiverId = myBusinessId || '';
        let receiverEmail = businesses.find(b => b.id === receiverId)?.email || '';

        // If Request: I am selling to Owner
        if (isRequest) {
            providerId = myBusinessId || '';
            providerEmail = businesses.find(b => b.id === providerId)?.email || '';
            receiverId = viewProduct.businessId;
            receiverEmail = businesses.find(b => b.id === receiverId)?.email || '';
        }

        setTxForm({
            ...initialTxState,
            providerBusinessId: providerId,
            providerEmail: providerEmail,
            receiverBusinessId: receiverId,
            receiverEmail: receiverEmail,
            productId: viewProduct.id,
            unitCost: isRequest ? 0 : viewProduct.priceRetail,
            totalCost: isRequest ? 0 : viewProduct.priceRetail, // Initial 1 qty
            quantity: '1'
        });

        setTxMode('create');
        setViewProduct(null); // Close detail
        setIsTxModalOpen(true); // Open TX modal
    };

    const handleToggleType = async () => {
        if (!viewProduct) return;
        const newType = viewProduct.type === 'request' ? 'product' : 'request';
        const success = await updateProduct({ id: viewProduct.id, type: newType });
        if (success) {
            await loadData();
            setViewProduct(null); // Close to refresh
        } else {
            alert('Error al actualizar el tipo de publicación.');
        }
    };

    const handleDeleteProduct = async () => {
        if (!viewProduct) return;
        if (!confirm('¿Estás seguro de eliminar esta publicación?')) return;

        const success = await deleteProduct(viewProduct.id);
        if (success) {
            await loadData();
            setViewProduct(null);
        } else {
            alert('Error al eliminar publicación.');
        }
    };

    const handleToggleStatus = async () => {
        if (!viewProduct) return;
        const newStatus = viewProduct.status === 'closed' ? 'active' : 'closed';
        const success = await updateProduct({ id: viewProduct.id, status: newStatus });

        if (success) {
            await loadData();
            setViewProduct(prev => prev ? ({ ...prev, status: newStatus }) : null);
        } else {
            alert('Error al cambiar estatus.');
        }
    };


    // --- Handlers ---
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeConversationId || !myBusinessId) return;

        const sent = await sendMessage(activeConversationId, myBusinessId, newMessage);
        if (sent) {
            setNewMessage('');
            getMessages(activeConversationId).then(setChatMessages); // Refresh
        }
    };

    const handleSaveTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!txForm.providerBusinessId || !txForm.receiverBusinessId || !txForm.productId) {
            return alert('Por favor complete los campos obligatorios (Empresas y Producto).');
        }

        const qty = Number(txForm.quantity);
        const product = products.find(p => p.id === txForm.productId);
        const productName = product ? product.name : 'Desconocido';
        const iva = txForm.applyIva ? txForm.totalCost * 0.16 : 0;
        const commission = (txForm.totalCost * (txForm.commissionRate || 0)) / 100;

        let success = false;
        const txData = {
            providerBusinessId: txForm.providerBusinessId,
            providerEmail: txForm.providerEmail,
            receiverBusinessId: txForm.receiverBusinessId,
            receiverEmail: txForm.receiverEmail,
            productId: txForm.productId,
            productName: productName,
            quantity: qty,
            unitCost: Number(txForm.unitCost),
            totalCost: Number(txForm.totalCost),
            commission: commission,
            iva: iva,
            status: txForm.status,
            notes: txForm.notes
        };

        if (txMode === 'create') {
            success = !!(await addTransaction({
                ...txData,
                transactionDate: new Date().toISOString()
            }));
        } else {
            if (!txForm.id) return;
            success = await updateTransaction({ ...txData, id: txForm.id });
        }

        if (success) {
            await loadData();
            setIsTxModalOpen(false);
            navigate('/comercializadora/crucesyventas');
        } else {
            alert('Error al guardar la transacción.');
        }
    };

    const handleCreateProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProduct.name || !newProduct.businessId) return alert('Datos incompletos');

        setUploading(true);
        let finalImageUrl = newProduct.imageUrl;
        let finalImages: string[] = [];

        // Handle URL from text input if present (optional feature not explicitly in form but good to keep in mind)
        if (finalImageUrl) finalImages.push(finalImageUrl);

        // Handle File Uploads if selected
        if (selectedFiles && selectedFiles.length > 0) {
            const uploadPromises = Array.from(selectedFiles).map((file: File) => uploadProductImage(file));
            const results = await Promise.all(uploadPromises);
            const validUrls = results.filter(url => url !== null) as string[];

            if (validUrls.length > 0) {
                finalImages = [...finalImages, ...validUrls];
                // Set the first uploaded image as the main one if we don't have one yet
                if (!finalImageUrl) finalImageUrl = validUrls[0];
            } else {
                alert('Error al subir imagenes.');
            }
        }

        const added = await addProduct({
            name: newProduct.name,
            description: newProduct.description,
            businessId: newProduct.businessId,
            priceRetail: Number(newProduct.priceRetail),
            priceWholesale: Number(newProduct.priceWholesale),
            wholesaleMinQty: Number(newProduct.wholesaleMinQty),
            category: newProduct.category,
            imageUrl: finalImageUrl,
            images: finalImages,
            type: newProduct.type
        });

        setUploading(false);

        if (added) {
            await loadData();
            setIsProductModalOpen(false);
            // Navigate back to the correct tab
            if (isTrader) {
                navigate(newProduct.type === 'request' ? '/comercializadora/mercado' : '/comercializadora/mis-publicaciones');
            } else {
                navigate('/comercializadora/catalogo');
            }

            // Reset
            setNewProduct({
                name: '', description: '',
                businessId: isTrader && myBusinessId ? myBusinessId : '',
                priceRetail: '', priceWholesale: '', wholesaleMinQty: '',
                category: 'General', imageUrl: '', type: 'product'
            });
            setSelectedFiles(null);
        } else {
            alert('Error al crear producto');
        }
    };

    const handleProviderChange = (id: string) => {
        const bus = businesses.find(b => b.id === id);
        setTxForm(prev => ({ ...prev, providerBusinessId: id, providerEmail: bus?.email || '' }));
    };

    const handleReceiverChange = (id: string) => {
        const bus = businesses.find(b => b.id === id);
        setTxForm(prev => ({ ...prev, receiverBusinessId: id, receiverEmail: bus?.email || '' }));
    };

    // Filter Products Logic
    const getFilteredProducts = () => {
        let list = products;

        // Tab Filters
        if (activeTab === 'my-products') {
            list = list.filter(p => p.businessId === myBusinessId);
        }
        // Marketplace shows all ACTIVE only
        if (activeTab === 'marketplace') {
            list = list.filter(p => p.status !== 'closed');
        }
        // Inventory shows all (including closed)

        // Catalog Filters (Only for Inventory tab)
        if (activeTab === 'inventory') {
            if (businessFilter) {
                list = list.filter(p => p.businessId === businessFilter);
            }
            if (typeFilter !== 'all') {
                list = list.filter(p => p.type === typeFilter);
            }
        }

        // Search Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            list = list.filter(p =>
                p.name.toLowerCase().includes(lower) ||
                (p.businessName && p.businessName.toLowerCase().includes(lower))
            );
        }

        // Sorting
        if (sortOrder === 'newest') {
            list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } else {
            list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        }

        return list;
    };

    const filteredProducts = getFilteredProducts();

    const handleDownloadPDF = async (tx: CommercialTransaction) => {
        const { generateInvoicePDF } = await import('../services/invoiceService');
        generateInvoicePDF(tx);
    };

    const handleDownloadXML = async (tx: CommercialTransaction) => {
        const { generateInvoiceXML } = await import('../services/invoiceService');
        generateInvoiceXML(tx);
    };


    const handleSendEmail = async (tx: CommercialTransaction) => {
        if (!confirm(`¿Enviar factura por correo a ${tx.receiverEmail}?`)) return;

        try {
            const { generateInvoicePDF, generateInvoiceXML } = await import('../services/invoiceService');
            const { sendInvoiceEmail } = await import('../services/emailService');

            // 1. Generate XML String
            const xmlString = generateInvoiceXML(tx);

            // 2. Generate PDF Blob (pass true to get blob instead of auto-download)
            // @ts-ignore - Dynamic import typing might be loose
            const pdfBlob = await generateInvoicePDF(tx, undefined, true);

            if (!pdfBlob) {
                alert('Error generando PDF para envío');
                return;
            }

            // 3. Send via Resend
            const result = await sendInvoiceEmail(
                tx.receiverEmail || '',
                tx.providerEmail || '',
                {
                    id: tx.id,
                    providerName: tx.providerName || 'Proveedor',
                    productName: tx.productName || 'Producto',
                    totalCost: tx.totalCost
                },
                pdfBlob as Blob,
                xmlString
            );

            if (result.success) {
                alert('✅ Correo enviado con éxito (Factura PDF + XML adjuntos)');
            } else {
                console.error(result.error);
                let msg = '❌ Error al enviar correo.';
                if (result.error && typeof result.error === 'object' && 'message' in result.error) {
                    // @ts-ignore
                    msg += `\nDetalle: ${result.error.message}`;
                    // @ts-ignore
                    if (JSON.stringify(result.error).includes('test emails to your own email')) {
                        msg += '\n\nNOTA: En modo prueba de Resend, solo puedes enviar correos a tu propia cuenta registrada.';
                    }
                }
                if (result.error instanceof Error) {
                    try {
                        // Attempt to parse if the message is a JSON string
                        const parsed = JSON.parse(result.error.message);
                        if (parsed && parsed.message) {
                            msg += `\n${parsed.message}`;
                        } else {
                            msg += `\n${result.error.message}`;
                        }
                    } catch (e) {
                        msg += `\n${result.error.message}`;
                    }

                    if (result.error.message.includes('test emails') || msg.includes('test emails')) {
                        msg += '\n\n💡 SOLUCIÓN: Al usar una cuenta de prueba gratuita, Resend SOLO permite enviar correos a la cuenta registrada. Edita la transacción y usa ese correo para probar.';
                    }
                }
                alert(msg);
            }

        } catch (err) {
            console.error(err);
            alert('Error inesperado al procesar el envío.');
        }
    };

    const handleExportCSV = () => {
        let headers: string[] = [];
        let rows: any[][] = [];
        let filename = `comercializadora_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;

        if (activeTab === 'inventory' || activeTab === 'my-products' || activeTab === 'marketplace') {
            const data = getFilteredProducts();
            if (data.length === 0) return alert('No hay productos para exportar.');
            headers = ['ID', 'Nombre', 'Categoría', 'Tipo', 'Precio Menudeo', 'Precio Mayoreo', 'Empresa', 'Estatus'];
            rows = data.map(p => [p.id, p.name, p.category, p.type, p.priceRetail, p.priceWholesale, businesses.find(b => b.id === p.businessId)?.name || '', p.status]);
        } else if (activeTab === 'transactions') {
            if (transactions.length === 0) return alert('No hay ventas para exportar.');
            headers = ['ID', 'Fecha', 'Producto', 'Proveedor', 'Comprador', 'Cantidad', 'Costo Unitario', 'Costo Total', 'Comisión HD', 'IVA', 'Estatus'];
            rows = transactions.map(t => [t.id, new Date(t.transactionDate).toLocaleDateString(), t.productName, t.providerName, businesses.find(b => b.id === t.receiverBusinessId)?.name || '', t.quantity, t.unitCost, t.totalCost, t.commission, t.iva, t.status]);
        } else {
            return;
        }

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(item => `"${String(item || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-background-light overflow-hidden animate-in fade-in">
            <header className="sticky top-0 z-10 bg-white/95 px-8 py-6 border-b border-gray-200 flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h2 className="text-[#111118] text-3xl font-extrabold leading-tight tracking-tight">
                        {isTrader ? 'Mi Portal Comercial' : 'Comercializadora Healthy Dream'}
                    </h2>
                    <p className="text-[#636388] text-sm font-medium">
                        {isTrader ? 'Gestiona tus productos y explora el mercado de afiliados.' : 'Gestión de productos y registro de cruces comerciales entre afiliados.'}
                    </p>
                </div>
                {/* Action Buttons */}
                <div className="flex gap-3">
                    {/* Export CSV Button */}
                    {activeTab !== 'messages' && (
                        <button
                            onClick={handleExportCSV}
                            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[18px]">download</span>
                            Exportar CSV
                        </button>
                    )}

                    {/* New Product: Visible for Trader in My Products, OR Admin in Catalog */}
                    {((activeTab === 'my-products' && isTrader) || (activeTab === 'inventory' && !isTrader)) && (
                        <button
                            onClick={() => navigate(isTrader ? '/comercializadora/mis-publicaciones/nuevo' : '/comercializadora/catalogo/nuevo')}
                            className="bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[20px]">add_box</span>
                            Nuevo Producto
                        </button>
                    )}
                    {activeTab === 'marketplace' && (
                        <button onClick={() => navigate('/comercializadora/mercado/nuevo')} className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center gap-2">
                            <span className="material-symbols-outlined text-[20px]">campaign</span>
                            Solicitar Producto
                        </button>
                    )}
                    {/* Button Removed for Inventory Tab as requested */}
                    {activeTab === 'transactions' && (
                        <button onClick={() => navigate('/comercializadora/crucesyventas/nuevo')} className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center gap-2">
                            <span className="material-symbols-outlined text-[20px]">handshake</span>
                            Registrar Cruce
                        </button>
                    )}
                </div>
            </header>

            {/* Tabs hidden - Moved to Sidebar */}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
                {/* MESSAGES TAB */}
                {activeTab === 'messages' && (
                    <div className="flex h-[calc(100vh-280px)] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        {/* Sidebar */}
                        <div className="w-1/3 border-r border-gray-200 flex flex-col">
                            <div className="p-4 border-b border-gray-100 bg-gray-50">
                                <h3 className="font-bold text-gray-700">Conversaciones</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {conversations.length === 0 && <p className="p-4 text-sm text-gray-400">No hay conversaciones activas.</p>}
                                {conversations.map(c => {
                                    // Identify partner
                                    const p1Id = c.participant_1;
                                    const p2Id = c.participant_2;
                                    let partnerName = 'Desconocido';

                                    // Resolve names using businesses state
                                    const p1Bus = businesses.find(b => b.id === p1Id);
                                    const p2Bus = businesses.find(b => b.id === p2Id);
                                    const prod = products.find(p => p.id === c.product_id);

                                    if (p1Id === myBusinessId && p2Bus) partnerName = p2Bus.name;
                                    else if (p2Id === myBusinessId && p1Bus) partnerName = p1Bus.name;

                                    return (
                                        <div
                                            key={c.id}
                                            // Handle click to set active ID and URL
                                            onClick={() => {
                                                setActiveConversationId(c.id);
                                                navigate(`/comercializadora/mensajes?cid=${c.id}`);
                                            }}
                                            className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${activeConversationId === c.id ? 'bg-blue-50 border-l-4 border-l-primary' : ''}`}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-bold text-gray-800 text-sm">{partnerName}</span>
                                                <span className="text-[10px] text-gray-400">{new Date(c.updated_at).toLocaleDateString()}</span>
                                            </div>
                                            {prod && (
                                                <div className="flex items-center gap-1 mb-1 text-xs text-indigo-600 bg-indigo-50 w-fit px-1.5 py-0.5 rounded">
                                                    <span className="material-symbols-outlined text-[12px]">inventory_2</span>
                                                    <span className="truncate max-w-[120px]">{prod.name}</span>
                                                </div>
                                            )}
                                            <p className="text-xs text-gray-500 truncate">{c.last_message || '...'}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Chat Window */}
                        <div className="flex-1 flex flex-col bg-gray-50/50">
                            {activeConversationId ? (
                                (() => {
                                    const activeConvo = conversations.find(c => c.id === activeConversationId);
                                    // Determine title (Partner Name)
                                    let chatTitle = 'Chat';
                                    if (activeConvo) {
                                        const p1 = businesses.find(b => b.id === activeConvo.participant_1);
                                        const p2 = businesses.find(b => b.id === activeConvo.participant_2);
                                        if (activeConvo.participant_1 === myBusinessId && p2) chatTitle = p2.name;
                                        else if (activeConvo.participant_2 === myBusinessId && p1) chatTitle = p1.name;
                                    }

                                    return (
                                        <>
                                            <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm">
                                                <h3 className="font-bold text-gray-800">{chatTitle}</h3>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm('¿Eliminar esta conversación? Desaparecerá para ambas partes.')) {
                                                                const success = await deleteConversation(activeConversationId);
                                                                if (success) {
                                                                    setConversations(prev => prev.filter(c => c.id !== activeConversationId));
                                                                    setActiveConversationId(null);
                                                                    navigate('/comercializadora/mensajes'); // Clear Param
                                                                } else {
                                                                    alert('Error al eliminar conversación');
                                                                }
                                                            }
                                                        }}
                                                        className="text-red-500 hover:bg-red-50 p-1 rounded"
                                                        title="Eliminar Conversación"
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">delete</span>
                                                    </button>
                                                    <button onClick={() => setActiveConversationId(null)} className="md:hidden text-gray-500"><span className="material-symbols-outlined">arrow_back</span></button>
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                                                {chatMessages.map(msg => {
                                                    const isMe = msg.sender_id === myBusinessId;
                                                    return (
                                                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                            <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-primary text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'}`}>
                                                                {msg.content}
                                                                <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-white/80' : 'text-gray-400'}`}>
                                                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                <div ref={messagesEndRef} />
                                            </div>
                                            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-200 flex gap-2">
                                                <input
                                                    className="flex-1 rounded-full border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                                                    placeholder="Escribe un mensaje..."
                                                    value={newMessage}
                                                    onChange={e => setNewMessage(e.target.value)}
                                                />
                                                <button type="submit" className="bg-primary hover:bg-primary-hover text-white p-2 rounded-full shadow-md transition-transform active:scale-95">
                                                    <span className="material-symbols-outlined text-[20px]">send</span>
                                                </button>
                                            </form>
                                        </>
                                    );
                                })()
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-2">
                                    <span className="material-symbols-outlined text-6xl opacity-20">chat_bubble</span>
                                    <p>Selecciona una conversación</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Products Grid (Shared for Inventory, My Products, Marketplace) */}
                {(activeTab === 'inventory' || activeTab === 'my-products' || activeTab === 'marketplace') && (
                    <div className="flex flex-col gap-6">
                        {/* Filters Bar - Only visible in Catalog/Inventory */}
                        {activeTab === 'inventory' && (
                            <div className="flex flex-wrap gap-4 mb-2 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-4">
                                {/* Business Filter */}
                                <div className="flex-1 min-w-[200px]">
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Empresa</label>
                                    <select
                                        className="w-full mt-1 p-2 rounded-xl border-gray-200 bg-gray-50 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                        value={businessFilter}
                                        onChange={e => setBusinessFilter(e.target.value)}
                                    >
                                        <option value="">Todas las Empresas</option>
                                        {businesses.filter(b => b.name !== 'Healthy Dream Soporte').map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Type Filter */}
                                <div className="flex-1 min-w-[150px]">
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Tipo de Publicación</label>
                                    <div className="flex bg-gray-100 p-1 rounded-xl mt-1">
                                        <button onClick={() => setTypeFilter('all')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${typeFilter === 'all' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>Todos</button>
                                        <button onClick={() => setTypeFilter('product')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${typeFilter === 'product' ? 'bg-white shadow text-primary' : 'text-gray-500 hover:text-gray-700'}`}>Venta</button>
                                        <button onClick={() => setTypeFilter('request')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${typeFilter === 'request' ? 'bg-amber-100 text-amber-700 shadow' : 'text-gray-500 hover:text-gray-700'}`}>Compra</button>
                                    </div>
                                </div>

                                {/* Sort Order */}
                                <div className="flex-1 min-w-[150px]">
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Orden</label>
                                    <select
                                        className="w-full mt-1 p-2 rounded-xl border-gray-200 bg-gray-50 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                        value={sortOrder}
                                        onChange={e => setSortOrder(e.target.value)}
                                    >
                                        <option value="newest">Más Recientes</option>
                                        <option value="oldest">Más Antiguos</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="relative max-w-md">
                            <span className="absolute left-3 top-2.5 text-gray-400 material-symbols-outlined text-[20px]">search</span>
                            <input type="text" placeholder="Buscar productos..." className="w-full pl-10 pr-4 py-2 rounded-xl border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-primary/20" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        {loading ? <p className="text-gray-400">Cargando...</p> : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredProducts.map(p => {
                                    const isRequest = p.type === 'request';
                                    return (
                                        <div
                                            key={p.id}
                                            onClick={() => handleProductClick(p)}
                                            className={`rounded-2xl border-2 shadow-sm flex flex-col overflow-hidden relative transition-all hover:scale-[1.02] cursor-pointer group ${isRequest ? 'bg-amber-100 border-amber-400 shadow-amber-100' : 'bg-white border-gray-100 hover:shadow-md'}`}
                                        >
                                            {isRequest && (
                                                <div className="absolute top-2 right-2 bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-full border border-amber-200 z-10 shadow-sm flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[14px]">campaign</span>
                                                    Solicitud
                                                </div>
                                            )}
                                            {p.status === 'closed' && (
                                                <div className="absolute top-2 left-2 bg-gray-800 text-white text-xs font-bold px-2 py-1 rounded-full z-10 shadow-sm">
                                                    AGOTADO / CERRADO
                                                </div>
                                            )}
                                            <div className={`h-40 flex items-center justify-center relative overflow-hidden ${isRequest ? 'bg-amber-200/60' : 'bg-gray-100'} ${p.status === 'closed' ? 'opacity-50 grayscale' : ''}`}>
                                                {p.imageUrl ?
                                                    <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                                                    : <span className={`material-symbols-outlined text-4xl ${isRequest ? 'text-amber-500' : 'text-gray-300'}`}>{isRequest ? 'campaign' : 'inventory_2'}</span>
                                                }
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                                                    <span className="bg-white/90 text-gray-800 px-3 py-1 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all shadow-sm">
                                                        Ver Detalle
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-5 flex flex-col flex-1">
                                                <h3 className="font-bold text-gray-900 text-lg mb-1 leading-tight">{p.name}</h3>
                                                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{p.description}</p>
                                                <div className="mt-auto pt-3 border-t border-gray-200/50 flex justify-between items-center">
                                                    {isRequest ? (
                                                        <span className="font-bold text-amber-700 text-sm flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-[16px]">handshake</span>
                                                            Busca Cotización
                                                        </span>
                                                    ) : (
                                                        <span className="font-bold text-primary text-lg">${p.priceRetail}</span>
                                                    )}
                                                    <div className="flex items-center gap-1 text-xs text-gray-400">
                                                        <span className="material-symbols-outlined text-[14px]">store</span>
                                                        <span className="truncate max-w-[100px]">{p.businessName}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {filteredProducts.length === 0 && !loading && (
                            <div className="text-center py-10 text-gray-400">No se encontraron {activeTab === 'marketplace' ? 'productos ni solicitudes' : 'productos'}.</div>
                        )}
                    </div>
                )}

                {/* Transactions View (Admin Only usually) */}
                {activeTab === 'transactions' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Folio</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Proveedor</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Cliente</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Producto</th>
                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase">Estatus</th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase">Total</th>
                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {transactions.map(tx => (
                                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-sm font-bold text-gray-700">{tx.id.substring(0, 8).toUpperCase()}</td>
                                        <td className="px-6 py-4 text-sm text-blue-600 font-bold">{tx.providerName}</td>
                                        <td className="px-6 py-4 text-sm text-indigo-600 font-bold">{tx.receiverName}</td>
                                        <td className="px-6 py-4 text-sm text-gray-700">{tx.productName}</td>
                                        <td className="px-6 py-4 text-center"><span className="px-2 py-1 rounded-full text-[10px] uppercase font-bold bg-gray-100 text-gray-700">{tx.status}</span></td>
                                        <td className="px-6 py-4 text-right text-sm font-bold text-green-600">${tx.totalCost.toLocaleString()}</td>
                                        <td className="px-6 py-4 flex justify-center gap-1">
                                            <button onClick={() => navigate(`/comercializadora/crucesyventas/editar/${tx.id}`)} className="p-1.5 hover:bg-amber-50 text-gray-400 hover:text-amber-600 rounded-lg"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                                            <button onClick={() => handleDownloadPDF(tx)} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg"><span className="material-symbols-outlined text-[18px]">picture_as_pdf</span></button>
                                            <button onClick={() => handleDownloadXML(tx)} className="p-1.5 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-lg"><span className="material-symbols-outlined text-[18px]">code</span></button>
                                            <button onClick={() => handleSendEmail(tx)} className="p-1.5 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 rounded-lg"><span className="material-symbols-outlined text-[18px]">send</span></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* PRODUCT DETAIL MODAL */}
            {viewProduct && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 animate-in fade-in" onClick={() => setViewProduct(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[80vh] md:h-auto" onClick={e => e.stopPropagation()}>
                        {/* Image Side with Gallery */}
                        <div className="w-full md:w-1/2 bg-gray-100 relative min-h-[300px] group/gallery">
                            {(viewProduct.images && viewProduct.images.length > 0) ? (
                                <ProductGallery images={viewProduct.images} name={viewProduct.name} />
                            ) : (
                                viewProduct.imageUrl ?
                                    <img src={viewProduct.imageUrl} alt={viewProduct.name} className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-8xl text-gray-300">inventory_2</span></div>
                            )}
                            {viewProduct.type === 'request' && (
                                <div className="absolute top-4 left-4 bg-amber-500 text-white px-4 py-1.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[18px]">campaign</span>
                                    Solicitud de Compra
                                </div>
                            )}
                        </div>

                        {/* Details Side */}
                        <div className="w-full md:w-1/2 p-8 flex flex-col overflow-y-auto">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{viewProduct.category}</span>
                                <button onClick={() => setViewProduct(null)} className="text-gray-400 hover:text-gray-800 transition-colors">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <h2 className="text-3xl font-extrabold text-gray-900 mb-2">{viewProduct.name}</h2>
                            <div className="flex items-center gap-2 mb-6">
                                <span className="material-symbols-outlined text-gray-400">store</span>
                                <p className="text-sm font-bold text-gray-600">{viewProduct.businessName || 'Empresa Afiliada'}</p>
                            </div>

                            <p className="text-gray-600 leading-relaxed mb-8 flex-1">
                                {viewProduct.description}
                            </p>

                            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 mb-6">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium text-gray-500">{viewProduct.type === 'request' ? 'Presupuesto' : 'Precio Menudeo'}</span>
                                    <span className="text-2xl font-bold text-gray-900">
                                        {viewProduct.type === 'request' ? 'A negociar' : `$${viewProduct.priceRetail}`}
                                    </span>
                                </div>
                                {viewProduct.type === 'product' && viewProduct.priceWholesale > 0 && (
                                    <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                        <span className="text-sm font-medium text-gray-500">Mayoreo (Min {viewProduct.wholesaleMinQty})</span>
                                        <span className="text-lg font-bold text-green-600">${viewProduct.priceWholesale}</span>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            {(viewProduct.businessId === myBusinessId || role === 'Administrador') ? (
                                <div className="p-4 bg-blue-50 text-blue-800 rounded-xl text-center text-sm font-bold border border-blue-100 flex flex-col gap-2">
                                    <span>Gestión de Publicación</span>
                                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                                        <button onClick={handleToggleType} className="bg-white border border-blue-200 text-blue-600 px-3 py-1 rounded-lg text-xs hover:bg-blue-100 transition-colors">
                                            Convertir a {viewProduct.type === 'request' ? 'Producto' : 'Solicitud'}
                                        </button>
                                        <button onClick={handleToggleStatus} className={`border px-3 py-1 rounded-lg text-xs transition-colors ${viewProduct.status === 'closed' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                            {viewProduct.status === 'closed' ? 'Reactivar Publicación' : 'Marcar Agotado / Cerrar'}
                                        </button>
                                        <button onClick={handleDeleteProduct} className="bg-white border border-red-200 text-red-500 px-3 py-1 rounded-lg text-xs hover:bg-red-50 transition-colors">
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={handleContactMessage} className="flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white py-3.5 rounded-xl font-bold transition-transform active:scale-95 shadow-lg shadow-indigo-200">
                                        <span className="material-symbols-outlined">chat</span>
                                        Mensaje
                                    </button>
                                    <button onClick={handleStartTransaction} className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white py-3.5 rounded-xl font-bold transition-transform active:scale-95 shadow-lg shadow-primary/30">
                                        <span className="material-symbols-outlined">shopping_cart_checkout</span>
                                        {viewProduct.type === 'request' ? 'Cotizar / Vender' : 'Iniciar Compra'}
                                    </button>
                                </div>
                            )}
                            <p className="text-center text-xs text-gray-400 mt-4">
                                {viewProduct.type === 'request'
                                    ? 'Contacta al comprador para ofrecer tus productos.'
                                    : 'Inicia la plataforma de cruces para formalizar el pedido.'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* UNIFIED TRANSACTION MODAL */}
            {isTxModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in" onClick={() => navigate('/comercializadora/crucesyventas')}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">{txMode === 'create' ? 'Registrar Cruce (B2B)' : 'Editar Transacción'}</h3>
                        <form onSubmit={handleSaveTransaction} className="flex flex-col gap-4">
                            {/* Provider Section */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Proveedor (Vendedor)</label>
                                <select className="w-full rounded-lg border-gray-300 text-sm mt-1" value={txForm.providerBusinessId} onChange={e => handleProviderChange(e.target.value)} required>
                                    <option value="">Seleccionar Proveedor...</option>
                                    {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Correo Proveedor</label>
                                <input type="email" className="w-full rounded-lg border-gray-300 text-sm mt-1" value={txForm.providerEmail} onChange={e => setTxForm({ ...txForm, providerEmail: e.target.value })} placeholder="email@proveedor.com" />
                            </div>

                            {/* Product Section */}
                            {txForm.providerBusinessId && (
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Producto</label>
                                    <select className="w-full rounded-lg border-gray-300 text-sm mt-1" value={txForm.productId} onChange={e => handleProductSelect(e.target.value)} required>
                                        <option value="">Seleccionar Producto...</option>
                                        {products.filter(p => p.businessId === txForm.providerBusinessId).map(p => (
                                            <option key={p.id} value={p.id}>{p.name} (${p.priceRetail})</option>
                                        ))}
                                        {/* If product owner is the receiver (Request case), we still need to allow selecting the Request itself OR a product from provider */}
                                        {/* For simplicity we list Provider's products. BUT if this started from a Request, the productId is the Request ID? */}
                                        {/* If productId is set but not in list, add it manually as option */}
                                        {txForm.productId && !products.filter(p => p.businessId === txForm.providerBusinessId).find(p => p.id === txForm.productId) && (
                                            <option value={txForm.productId}>{products.find(p => p.id === txForm.productId)?.name || 'Producto Seleccionado'} (Solicitud)</option>
                                        )}
                                    </select>
                                </div>
                            )}

                            {/* Receiver Section */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Receptor (Comprador)</label>
                                <select className="w-full rounded-lg border-gray-300 text-sm mt-1" value={txForm.receiverBusinessId} onChange={e => handleReceiverChange(e.target.value)} required>
                                    <option value="">Seleccionar Receptor...</option>
                                    {businesses.filter(b => b.id !== txForm.providerBusinessId).map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Correo Comprador</label>
                                <input type="email" className="w-full rounded-lg border-gray-300 text-sm mt-1" value={txForm.receiverEmail} onChange={e => setTxForm({ ...txForm, receiverEmail: e.target.value })} placeholder="email@cliente.com" />
                            </div>

                            {/* Costs & Qty Section */}
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-500 uppercase">Cantidad</label><input type="number" className="w-full rounded-lg border-gray-300 text-sm mt-1" value={txForm.quantity} onChange={e => setTxForm({ ...txForm, quantity: e.target.value })} min="1" required /></div>
                                <div><label className="text-xs font-bold text-gray-500 uppercase">Costo Unitario</label><input type="number" className="w-full rounded-lg border-gray-300 text-sm mt-1" value={txForm.unitCost} onChange={e => setTxForm({ ...txForm, unitCost: Number(e.target.value) })} required /></div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-500 uppercase">Subtotal</label><div className="w-full rounded-lg border-gray-300 bg-gray-100 text-sm mt-1 px-3 py-2 font-bold text-green-700">${txForm.totalCost.toLocaleString()}</div></div>

                            {/* Extras */}
                            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <div><label className="text-xs font-bold text-gray-500 uppercase">Comisión (%)</label><input type="number" className="w-full rounded-lg border-gray-300 text-sm mt-1" value={txForm.commissionRate} onChange={e => setTxForm({ ...txForm, commissionRate: Number(e.target.value) })} /></div>
                                <div><label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2 mt-4"><input type="checkbox" checked={txForm.applyIva} onChange={e => setTxForm({ ...txForm, applyIva: e.target.checked })} />Aplicar IVA (16%)</label></div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Estatus y Notas</label>
                                <select className="w-full rounded-lg border-gray-300 text-sm mt-1 mb-2" value={txForm.status} onChange={e => setTxForm({ ...txForm, status: e.target.value })}>
                                    <option value="Pendiente">Pendiente</option><option value="Pagado">Pagado</option><option value="Entregado">Entregado</option><option value="Cancelado">Cancelado</option>
                                </select>
                                <textarea className="w-full rounded-lg border-gray-300 text-sm mt-1 h-16" value={txForm.notes} onChange={e => setTxForm({ ...txForm, notes: e.target.value })} placeholder="Notas adicionales..." />
                            </div>

                            <button type="submit" className={`w-full py-3 rounded-xl font-bold mt-2 text-white shadow-lg transition-colors ${txMode === 'create' ? 'bg-green-600 hover:bg-green-700' : 'bg-primary hover:bg-primary-hover'}`}>{txMode === 'create' ? 'Registrar Cruce' : 'Guardar Cambios'}</button>
                        </form>
                    </div>
                </div>
            )}

            {/* PRODUCT MODAL (Create) */}
            {isProductModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in" onClick={() => navigate(isTrader ? (activeTab === 'marketplace' ? '/comercializadora/mercado' : '/comercializadora/mis-publicaciones') : '/comercializadora/catalogo')}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">{newProduct.type === 'request' ? 'Crear Solicitud de Compra' : 'Agregar Nuevo Producto'}</h3>
                        <form onSubmit={handleCreateProduct} className="flex flex-col gap-4">

                            {/* Type Toggle (Trader or Admin) */}
                            {(isTrader || role === 'Administrador') && (
                                <div className="flex bg-gray-100 rounded-lg p-1">
                                    <button type="button" onClick={() => setNewProduct({ ...newProduct, type: 'product' })} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${newProduct.type === 'product' ? 'bg-white shadow text-primary' : 'text-gray-500'}`}>Producto</button>
                                    <button type="button" onClick={() => setNewProduct({ ...newProduct, type: 'request' })} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${newProduct.type === 'request' ? 'bg-amber-100 text-amber-700 shadow' : 'text-gray-500'}`}>Solicitud de Compra</button>
                                </div>
                            )}

                            {/* Business logic */}
                            {!isTrader && (
                                <div><label className="text-xs font-bold text-gray-500 uppercase">Empresa</label><select className="w-full rounded-lg border-gray-300 text-sm mt-1" value={newProduct.businessId} onChange={e => setNewProduct({ ...newProduct, businessId: e.target.value })} required><option value="">Select...</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                            )}

                            <div><label className="text-xs font-bold text-gray-500 uppercase">Nombre</label><input required className="w-full rounded-lg border-gray-300 text-sm mt-1" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} /></div>
                            <div><label className="text-xs font-bold text-gray-500 uppercase">Descripción</label><textarea required className="w-full rounded-lg border-gray-300 text-sm mt-1" value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} /></div>

                            {!isTrader || newProduct.type === 'product' ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <div><label className="text-xs font-bold text-gray-500 uppercase">P. Menudeo</label><input required type="number" className="w-full rounded-lg border-gray-300 text-sm mt-1" value={newProduct.priceRetail} onChange={e => setNewProduct({ ...newProduct, priceRetail: e.target.value })} /></div>
                                    <div><label className="text-xs font-bold text-gray-500 uppercase">P. Mayoreo</label><input required type="number" className="w-full rounded-lg border-gray-300 text-sm mt-1" value={newProduct.priceWholesale} onChange={e => setNewProduct({ ...newProduct, priceWholesale: e.target.value })} /></div>
                                    <div><label className="text-xs font-bold text-gray-500 uppercase">Min Mayoreo</label><input required type="number" className="w-full rounded-lg border-gray-300 text-sm mt-1" value={newProduct.wholesaleMinQty} onChange={e => setNewProduct({ ...newProduct, wholesaleMinQty: e.target.value })} /></div>
                                </div>
                            ) : (
                                <div className="p-3 bg-amber-50 text-amber-700 text-xs rounded-lg border border-amber-100">Las solicitudes no requieren precio, pero puedes indicar un presupuesto en la descripción.</div>
                            )}

                            {/* Image Upload */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Imágenes (Máx 5)</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="w-full text-sm mt-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                    onChange={e => setSelectedFiles(e.target.files)}
                                />
                                {selectedFiles && selectedFiles.length > 0 && <p className="text-[10px] text-green-600 font-bold mt-1">{selectedFiles.length} archivo(s) seleccionado(s)</p>}
                                {newProduct.imageUrl && !selectedFiles && <p className="text-[10px] text-gray-400 mt-1">URL Actual Principal: {newProduct.imageUrl}</p>}
                            </div>

                            <button className="bg-primary text-white py-3 rounded-xl font-bold mt-2 hover:bg-primary-hover transition-colors flex justify-center items-center gap-2" disabled={uploading}>
                                {uploading && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                                {uploading ? 'Guardando...' : `Guardar ${newProduct.type === 'request' ? 'Solicitud' : 'Producto'}`}
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Comercializadora;
