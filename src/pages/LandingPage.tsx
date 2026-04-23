import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { isAuthenticated } from '../services/authService';

// --- COMPONENTE DEL FORMULARIO (Actualizado) ---
const LeadForm = () => {
    // ... existing LeadForm code (unchanged) ...
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [formData, setFormData] = useState({
        contact_name: '',
        contact_email: '',
        company_name: '',
        company_address: '',
        service_type: '',
        message: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { error } = await supabase.from('leads').insert([{
                contact_name: formData.contact_name,
                contact_email: formData.contact_email,
                company_name: formData.company_name,
                company_address: formData.company_address,
                service_type: formData.service_type || 'Otro',
                message_details: formData.message
            }]);

            if (error) throw error;

            setSuccess(true);
            setFormData({
                contact_name: '',
                contact_email: '',
                company_name: '',
                company_address: '',
                service_type: '',
                message: ''
            });
        } catch (err) {
            console.error(err);
            alert('Hubo un error al enviar tu solicitud. Por favor intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="text-center py-12 bg-green-50 rounded-xl border border-green-200 animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-green-600 text-3xl">check_circle</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">¡Solicitud Recibida!</h3>
                <p className="text-slate-600">Un asesor integral te contactará en breve.</p>
                <button onClick={() => setSuccess(false)} className="mt-6 text-sm font-bold text-green-700 hover:underline">
                    Enviar otra solicitud
                </button>
            </div>
        );
    }

    return (
        <form className="space-y-4 max-w-md mx-auto" onSubmit={handleSubmit}>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tu Nombre</label>
                <input
                    type="text"
                    name="contact_name"
                    value={formData.contact_name}
                    onChange={handleChange}
                    placeholder="Ej. Juan Pérez"
                    required
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
                <input
                    type="email"
                    name="contact_email"
                    value={formData.contact_email}
                    onChange={handleChange}
                    placeholder="juan@empresa.com"
                    required
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
                    <input
                        type="text"
                        name="company_name"
                        value={formData.company_name}
                        onChange={handleChange}
                        placeholder="Nombre Legal"
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ubicación</label>
                    <input
                        type="text"
                        name="company_address"
                        value={formData.company_address}
                        onChange={handleChange}
                        placeholder="Ciudad / Zona"
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">¿Qué necesitas resolver?</label>
                <select
                    name="service_type"
                    value={formData.service_type}
                    onChange={handleChange}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                    required
                >
                    <option value="" disabled>Selecciona una opción</option>
                    <option value="integral">Solución Integral (Transporte + Insumos)</option>
                    <option value="transporte">Movilidad Corporativa / Transporte</option>
                    <option value="insumos">Abastecimiento / Compras</option>
                    <option value="logistica">Paquetería y Envíos</option>
                    <option value="otro">Consulta General</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Detalles del Requerimiento</label>
                <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Ej: Necesito transporte para 10 empleados y suministro mensual de cafetería..."
                    rows={3}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                ></textarea>
            </div>
            <button
                type="submit"
                disabled={loading}
                className={`w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-lg transition-all shadow-lg hover:translate-y-[-2px] flex items-center justify-center gap-2 ${loading ? 'opacity-70 cursor-wait' : ''}`}
            >
                {loading ? 'Procesando...' : 'Enviar'}
                {!loading && <span className="material-symbols-outlined text-[20px]">send</span>}
            </button>
        </form>
    );
}

// --- PÁGINA PRINCIPAL ---
const LandingPage = () => {
    const navigate = useNavigate();

    useEffect(() => {
        // 1. Check for OAuth Errors in URL (e.g. invalid client secret, user denied, etc.)
        const params = new URLSearchParams(window.location.search);
        const errorDescription = params.get('error_description');
        const error = params.get('error');

        if (error || errorDescription) {
            console.error("Auth Error:", error, errorDescription);
            // Redirect to login to show the error nicely
            // We decodeURI to make it readable
            navigate('/login', {
                state: {
                    errorMessage: decodeURIComponent(errorDescription || error || 'Error de autenticación desconocido')
                }
            });
            return;
        }

        // 2. Check for Hash-based errors (some providers use hash instead of query params)
        const hashParams = new URLSearchParams(window.location.hash.substring(1)); // Remove #
        const hashError = hashParams.get('error_description');
        if (hashError) {
            navigate('/login', {
                state: { errorMessage: decodeURIComponent(hashError) }
            });
            return;
        }

        // 3. If no errors, check if we are authenticated
        // ... (rest of the logic)
        if (isAuthenticated()) {
            navigate('/dashboard');
            return;
        }

        // Also check actual session async, in case local storage is cold but session exists (OAuth redirect)
        const checkSession = async () => {
            const { data } = await supabase.auth.getSession();
            if (data.session) {
                // If we have a session, we might be allowed. 
                // Let's rely on authService having run or run a quick check?
                // Since initializeAuth runs globally, we can just wait a bit or listen to state.
                // But simpler: if session exists, let's try to go to dashboard.
                // The dashboard itself (RoleGuard) or Layout will kick us out if we are not truly valid.
                // However, we want to avoid redirecting unauthorized users.
                // So we can assume if localStorage isn't set yet, we might need to wait.
            }
        };

        // Listen for the global auth state change that initializeAuth triggers
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            // If we have a session, assume we want to go to the app.
            // The App's RoleGuard will handle kicking us out if we are not allowed.
            if (session) {
                navigate('/dashboard');
            }
        });

        checkSession();

        return () => {
            authListener.subscription.unsubscribe();
        }
    }, [navigate]);

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <div className="min-h-screen font-display bg-white text-slate-800 overflow-x-hidden selection:bg-blue-600 selection:text-white">
            {/* Navbar */}
            <nav className="fixed w-full z-50 bg-[#051024]/90 backdrop-blur-md border-b border-white/10 transition-all duration-300">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        <img src="/LOGO2.jpg" alt="Healthy tracking Logo" className="h-16 w-16 rounded-full object-cover" />
                    </div>

                    <div className="hidden md:flex items-center gap-8">
                        <button onClick={() => scrollToSection('sinergia')} className="text-sm font-medium text-white/80 hover:text-blue-400 transition-colors">Por qué Healthy tracking</button>
                        <button onClick={() => scrollToSection('ecosistema')} className="text-sm font-medium text-white/80 hover:text-blue-400 transition-colors">Servicios</button>
                        <button onClick={() => scrollToSection('seguridad')} className="text-sm font-medium text-white/80 hover:text-blue-400 transition-colors">Seguridad</button>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/login')}
                            className="hidden md:flex items-center gap-2 text-sm font-semibold text-white/90 hover:text-white transition-colors"
                        >
                            <span className="material-symbols-outlined text-[20px]">login</span>
                            Acceso Portal
                        </button>
                        <button
                            onClick={() => scrollToSection('contact')}
                            className="px-6 py-2.5 bg-white text-[#051024] rounded-full text-sm font-semibold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                        >
                            Contáctanos
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section: La Promesa Unificada */}
            <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-white z-0"></div>
                <div className="absolute top-0 right-0 w-1/2 h-full bg-slate-100/50 clip-path-slant z-0"></div>

                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        {/* Left Content */}
                        <div className="space-y-8 animate-in slide-in-from-left-5 duration-700 fade-in">

                            <h1 className="text-5xl lg:text-7xl font-bold leading-tight tracking-tighter text-slate-900">
                                Potencia la Operación de tu Empresa <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-900">desde una sola Plataforma.</span>
                            </h1>
                            <p className="text-xl text-slate-600 leading-relaxed max-w-xl">
                                Centraliza tus necesidades críticas. Traslado de personal, logística de reparto y abastecimiento de insumos gestionados con la misma eficiencia y tecnología.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <button
                                    onClick={() => scrollToSection('contact')}
                                    className="px-8 py-4 bg-slate-900 text-white rounded-xl font-bold text-lg hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    Optimizar mi Operación
                                    <span className="material-symbols-outlined">arrow_forward</span>
                                </button>
                                <div className="flex items-center gap-3 px-4 text-sm text-slate-500 font-medium">
                                    <div className="flex -space-x-2">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-xs font-bold text-slate-600">
                                            <span className="material-symbols-outlined text-[16px]">verified</span>
                                        </div>
                                    </div>
                                    <span>Servicio Certificado</span>
                                </div>
                            </div>
                        </div>

                        <div className="relative animate-in slide-in-from-right-5 duration-1000 fade-in delay-200 hidden lg:block">
                            <div className="relative w-full aspect-square max-w-2xl mx-auto transform hover:scale-105 transition-transform duration-500 ease-out">
                                <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-[100px] animate-pulse"></div>
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-auto bg-white/90 backdrop-blur-2xl rounded-[3rem] shadow-2xl shadow-blue-900/10 border border-white/60 flex flex-col overflow-hidden ring-1 ring-slate-900/5">

                                    {/* Header */}
                                    <div className="px-10 py-8 border-b border-slate-100/50 flex items-center justify-between bg-gradient-to-r from-white/50 to-slate-50/50">
                                        <div>
                                            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Gestión Unificada</h3>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="relative flex h-3 w-3">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                                </span>
                                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Operación Activa</p>
                                            </div>
                                        </div>
                                        <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center border border-slate-100 ring-4 ring-slate-50">
                                            <span className="material-symbols-outlined text-slate-700 text-2xl">notifications_active</span>
                                        </div>
                                    </div>

                                    {/* List Items */}
                                    <div className="p-8 space-y-6 bg-slate-50/30">

                                        {/* Item 1: Logística Express */}
                                        <div className="group flex items-center gap-6 p-6 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 hover:border-blue-200 transition-all cursor-default relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-r from-blue-50/0 to-blue-50/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-sm group-hover:shadow-blue-200">
                                                <span className="material-symbols-outlined text-3xl">local_shipping</span>
                                            </div>
                                            <div className="flex-1 relative z-10">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-bold text-slate-800 text-lg">Envío Express CDMX</h4>
                                                    <span className="px-4 py-1.5 bg-blue-50 text-blue-700 text-xs font-black rounded-full tracking-wider border border-blue-100">EN RUTA</span>
                                                </div>
                                                <div className="flex items-center justify-between text-sm text-slate-500 font-medium">
                                                    <span className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[16px]">schedule</span>
                                                        Llegada estimada: 14:30
                                                    </span>
                                                    <div className="flex gap-1.5">
                                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce delay-75"></div>
                                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce delay-150"></div>
                                                        <div className="w-2 h-2 rounded-full bg-blue-200 animate-bounce delay-300"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Item 2: Suministros */}
                                        <div className="group flex items-center gap-6 p-6 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-amber-900/5 hover:border-amber-200 transition-all cursor-default relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-r from-amber-50/0 to-amber-50/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                            <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all duration-300 shadow-sm group-hover:shadow-amber-200">
                                                <span className="material-symbols-outlined text-3xl">inventory_2</span>
                                            </div>
                                            <div className="flex-1 relative z-10">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-bold text-slate-800 text-lg">Abastecimiento Mensual</h4>
                                                    <span className="px-4 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-black rounded-full tracking-wider border border-emerald-100">ENTREGADO</span>
                                                </div>
                                                <p className="text-sm text-slate-500 font-medium flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                                    Recibido en Almacén Central
                                                </p>
                                            </div>
                                        </div>

                                        {/* Item 3: Comida */}
                                        <div className="group flex items-center gap-6 p-6 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-rose-900/5 hover:border-rose-200 transition-all cursor-default relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-r from-rose-50/0 to-rose-50/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                            <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-all duration-300 shadow-sm group-hover:shadow-rose-200">
                                                <span className="material-symbols-outlined text-3xl">lunch_dining</span>
                                            </div>
                                            <div className="flex-1 relative z-10">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-bold text-slate-800 text-lg">Menú Corporativo</h4>
                                                    <span className="px-4 py-1.5 bg-slate-100 text-slate-600 text-xs font-black rounded-full tracking-wider border border-slate-200">CONFIRMADO</span>
                                                </div>
                                                <p className="text-sm text-slate-500 font-medium flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                                                    Programado para mañana 13:00
                                                </p>
                                            </div>
                                        </div>

                                    </div>

                                    {/* Footer Action */}
                                    <div className="px-8 py-6 bg-white border-t border-slate-100 text-center flex items-center justify-between">
                                        <div className="flex -space-x-2">
                                            <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200" title="User 1"></div>
                                            <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-300" title="User 2"></div>
                                            <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-400 flex items-center justify-center text-[10px] text-white font-bold">+5</div>
                                        </div>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                            Actualizado en tiempo real
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Sinergia Operativa (EL PORQUÉ - Unificado) */}
            <section id="sinergia" className="py-24 bg-white border-b border-slate-100">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <h2 className="text-sm font-bold text-slate-500 tracking-widest uppercase mb-2">Sinergia Operativa</h2>
                        <h3 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">¿Por qué gestionar 10 proveedores cuando puedes confiar en uno?</h3>
                        <p className="text-lg text-slate-600">
                            Elimina la fricción operativa. Unificamos tus necesidades logísticas y de abastecimiento en un solo ecosistema eficiente.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Beneficio 1 */}
                        <div className="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:shadow-lg transition-all text-center group">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-3xl text-slate-800">description</span>
                            </div>
                            <h4 className="text-xl font-bold text-slate-900 mb-3">Menos Burocracia</h4>
                            <p className="text-slate-600">Una sola alta de proveedor, un solo canal de comunicación y facturación unificada mensual.</p>
                        </div>
                        {/* Beneficio 2 */}
                        <div className="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:shadow-lg transition-all text-center group">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-3xl text-slate-800">hub</span>
                            </div>
                            <h4 className="text-xl font-bold text-slate-900 mb-3">Tecnología Compartida</h4>
                            <p className="text-slate-600">La misma plataforma inteligente para gestionar tu logística, comercialización y envíos de paquetes.</p>
                        </div>
                        {/* Beneficio 3 */}
                        <div className="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:shadow-lg transition-all text-center group">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-3xl text-slate-800">verified_user</span>
                            </div>
                            <h4 className="text-xl font-bold text-slate-900 mb-3">Estándar de Calidad</h4>
                            <p className="text-slate-600">Aplicamos los mismos protocolos de seguridad y certificación a nuestros repartidores y productos.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* El Ecosistema Healthy tracking (Servicios Mezclados - EL QUÉ) */}
            <section id="ecosistema" className="py-24 bg-slate-50 relative">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-sm font-bold text-slate-500 tracking-widest uppercase mb-2">Catálogo de Soluciones</h2>
                        <h3 className="text-3xl md:text-4xl font-bold text-slate-900">Todo lo que tu operación necesita</h3>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* 1. Movilidad */}
                        <div className="group p-8 rounded-2xl bg-white border border-slate-200 hover:border-blue-500/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full">
                            <div className="w-14 h-14 bg-indigo-50 rounded-xl flex items-center justify-center mb-6 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-3xl">directions_car</span>
                            </div>
                            <h4 className="text-xl font-bold text-slate-900 mb-3">Movilidad Corporativa</h4>
                            <p className="text-slate-600 text-sm flex-grow">Transporte de personal seguro, puntual y monitoreado. Taxis ejecutivos bajo demanda.</p>
                        </div>

                        {/* 2. Suministros */}
                        <div className="group p-8 rounded-2xl bg-white border border-slate-200 hover:border-blue-500/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full">
                            <div className="w-14 h-14 bg-amber-50 rounded-xl flex items-center justify-center mb-6 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-3xl">inventory</span>
                            </div>
                            <h4 className="text-xl font-bold text-slate-900 mb-3">Suministro Estratégico</h4>
                            <p className="text-slate-600 text-sm flex-grow">Abastecimiento integral de papelería, tecnología y consumibles de oficina.</p>
                        </div>

                        {/* 3. Logística */}
                        <div className="group p-8 rounded-2xl bg-white border border-slate-200 hover:border-blue-500/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full">
                            <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-6 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-3xl">local_shipping</span>
                            </div>
                            <h4 className="text-xl font-bold text-slate-900 mb-3">Logística Express</h4>
                            <p className="text-slate-600 text-sm flex-grow">Mensajería local rápida y manejo de cargas especiales inter-sede.</p>
                        </div>

                        {/* 4. Comedor */}
                        <div className="group p-8 rounded-2xl bg-white border border-slate-200 hover:border-blue-500/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full">
                            <div className="w-14 h-14 bg-rose-50 rounded-xl flex items-center justify-center mb-6 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-3xl">restaurant</span>
                            </div>
                            <h4 className="text-xl font-bold text-slate-900 mb-3">Servicio de envíos de comida</h4>
                            <p className="text-slate-600 text-sm flex-grow">Soluciones de alimentos, catering para eventos y box lunch corporativos.</p>
                        </div>

                        {/* 5. Compras */}
                        <div className="group p-8 rounded-2xl bg-white border border-slate-200 hover:border-blue-500/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full">
                            <div className="w-14 h-14 bg-emerald-50 rounded-xl flex items-center justify-center mb-6 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-3xl">shopping_bag</span>
                            </div>
                            <h4 className="text-xl font-bold text-slate-900 mb-3">Compras Centralizadas</h4>
                            <p className="text-slate-600 text-sm flex-grow">Gestión unificada de proveedores y sourcing de productos especiales.</p>
                        </div>

                        {/* 6. Equipamiento */}
                        <div className="group p-8 rounded-2xl bg-white border border-slate-200 hover:border-blue-500/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full">
                            <div className="w-14 h-14 bg-teal-50 rounded-xl flex items-center justify-center mb-6 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-3xl">engineering</span>
                            </div>
                            <h4 className="text-xl font-bold text-slate-900 mb-3">Equipamiento Industrial</h4>
                            <p className="text-slate-600 text-sm flex-grow">Suministro certificado de EPP, herramientas y ropa industrial.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Seguridad (Reassurance) */}
            <section id="seguridad" className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <h2 className="text-sm font-bold text-slate-500 tracking-widest uppercase mb-2">Seguridad y Confianza</h2>
                        <h3 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Eliminamos la incertidumbre</h3>
                        <p className="text-lg text-slate-600">
                            Sabemos que lo más importante es que tu operación fluya sin riesgos. Olvídate de servicios informales.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            { icon: 'security', title: 'Seguridad Total', desc: 'Unidades, conductores y productos 100% verificados.' },
                            { icon: 'schedule', title: 'Puntualidad', desc: 'Respetamos tu tiempo y el de tus entregas con seguimiento real.' },
                            { icon: 'diamond', title: 'Servicio Deluxe', desc: 'Atención premium para clientes exigentes y operaciones críticas.' }
                        ].map((item, idx) => (
                            <div key={idx} className="bg-slate-50 p-8 rounded-2xl border border-slate-100 hover:shadow-md transition-all">
                                <div className="w-12 h-12 bg-white text-slate-800 rounded-xl flex items-center justify-center mb-6 shadow-sm">
                                    <span className="material-symbols-outlined text-2xl">{item.icon}</span>
                                </div>
                                <h4 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h4>
                                <p className="text-slate-600">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA / Contact Section */}
            <section id="contact" className="py-24 bg-slate-900 text-white relative overflow-hidden">
                {/* Background decorative elements */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20 pointer-events-none">
                    <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500 rounded-full blur-[100px]"></div>
                    <div className="absolute top-1/2 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[80px]"></div>
                </div>

                <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
                    <h2 className="text-4xl lg:text-5xl font-bold mb-6 tracking-tight">Optimiza tu operación hoy</h2>
                    <p className="text-xl text-slate-300 mb-12 max-w-2xl mx-auto">
                        Deja de malabarear proveedores. Inicia la gestión integral de tu logística y abastecimiento con Healthy tracking.
                    </p>

                    <div className="bg-white text-slate-900 rounded-3xl p-8 md:p-12 shadow-2xl text-left">
                        <h3 className="text-2xl font-bold mb-6 text-center">Solicita tu Propuesta</h3>
                        <LeadForm />
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-slate-950 text-slate-400 py-12 border-t border-slate-900">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                        <div className="flex items-center gap-2">
                            <img src="/LOGO2.jpg" alt="Healthy tracking Logo" className="h-10 w-10 rounded-full object-cover opacity-80 hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="text-sm">
                            &copy; {new Date().getFullYear()} Healthy tracking. Todos los derechos reservados.
                        </div>


                    </div>
                </div>
            </footer>
        </div >
    );
};

export default LandingPage;