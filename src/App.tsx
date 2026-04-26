import React, { useEffect, useState } from 'react';
// Version 1.0.1 - Forced redeploy after Vercel/GitHub sync error
import { Routes, Route, HashRouter, Navigate, useLocation } from 'react-router-dom';
import { Analytics } from "@vercel/analytics/react";
import Layout from './components/Layout';
import { initializeAuth, getCurrentUserRole, getServerValidatedRole, isAuthenticated, getCurrentUserAllowedViews } from './services/authService';
import { APIProvider } from '@vis.gl/react-google-maps';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const RoleGuard = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) => {
    const cachedRole = getCurrentUserRole();
    const [validatedRole, setValidatedRole] = useState<string | null>(cachedRole); // Instant fallback
    const [checked, setChecked] = useState(false);
    const location = useLocation();

    useEffect(() => {
        getServerValidatedRole().then(({ role }) => {
            // Only override cached role if server returns a valid role
            // If server returns null (e.g. allowed_users table empty), keep cached role
            setValidatedRole(role || cachedRole);
            setChecked(true);
        });
    }, []);

    // Check raw authentication first
    if (!isAuthenticated()) {
        return <Navigate to="/login" replace />;
    }

    // Default to 'Usuario' only if they are authenticated but role is missing from BOTH sources
    const effectiveRole = validatedRole || cachedRole || 'Usuario';

    // Per-user view restrictions: if the user has allowed_views configured,
    // use THOSE as the source of truth instead of the hardcoded allowedRoles on routes.
    // This allows an admin to grant a Usuario access to routes that normally only
    // Administrador can see.
    if (checked && effectiveRole !== 'Administrador') {
        const userViews = getCurrentUserAllowedViews();
        if (userViews.length > 0) {
            const currentPath = location.pathname;
            const hasAccess = userViews.some(v => currentPath.startsWith(v));
            if (hasAccess) {
                return children; // Explicitly allowed by admin — skip role check
            }
            // Not in allowed views — redirect to first allowed view
            return <Navigate to={userViews[0] || '/monitor'} replace />;
        }
    }

    // Fall back to role-based check (for users without custom allowedViews)
    if (checked && !allowedRoles.includes(effectiveRole)) {
        if (effectiveRole === 'Chofer') return <Navigate to="/chofer" replace />;
        if (effectiveRole === 'Usuario') return <Navigate to="/monitor" replace />;
        return <Navigate to="/monitor" replace />;
    }

    return children;
};

const FleetMonitor = React.lazy(() => import('./pages/Monitor'));
const TripManagement = React.lazy(() => import('./pages/Trips'));
const Registry = React.lazy(() => import('./pages/Registry'));
const PricingSettings = React.lazy(() => import('./pages/Settings'));
const Login = React.lazy(() => import('./pages/Login'));
const UserAccess = React.lazy(() => import('./pages/UserAccess'));
const TripTracking = React.lazy(() => import('./pages/TripTracking'));
const DriverTracker = React.lazy(() => import('./pages/DriverTracker'));
const ClientConfirmation = React.lazy(() => import('./pages/ClientConfirmation'));
const Leads = React.lazy(() => import('./pages/Leads'));
const Comercializadora = React.lazy(() => import('./pages/Comercializadora'));
const NotFound = React.lazy(() => import('./pages/NotFound'));
const GoogleSheetView = React.lazy(() => import('./pages/GoogleSheetView'));

// Placeholder Sheet IDs - User should update these in .env or here
const MORNING_SHEET_ID = import.meta.env.VITE_MORNING_SHEET_ID || "1fWjuO_bGy4cvO0-Ru-u2lbnJcD8ZJFg3ovTaD7kIDzE";
const EVENING_SHEET_ID = import.meta.env.VITE_EVENING_SHEET_ID || "1y7V-6nwmsJv_bY38PzjFhIFWaUPu8EW4IvQD23T008U";

const MORNING_SHEET_URL = `https://docs.google.com/spreadsheets/d/${MORNING_SHEET_ID}/edit?gid=1075208342#gid=1075208342`;
const EVENING_SHEET_URL = `https://docs.google.com/spreadsheets/d/${EVENING_SHEET_ID}/edit?gid=2039339913#gid=2039339913`;


const LoadingFallback = () => (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            <p className="text-sm font-medium text-gray-500">Cargando aplicación...</p>
        </div>
    </div>
);

const App = () => {
    useEffect(() => {
        initializeAuth();
    }, []);

    return (
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'routes']}>
            <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <React.Suspense fallback={<LoadingFallback />}>
                    <Routes>
                        <Route path="/" element={<Navigate to="/login" replace />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/confirmacion/:tripId" element={<ClientConfirmation />} />
                        <Route path="/tracking/:tripId" element={<TripTracking />} />
                        <Route path="/driver/:tripId" element={<DriverTracker />} />
                        <Route path="/chofer" element={
                            <div className="flex flex-col h-screen w-full items-center justify-center bg-gray-50 p-6 text-center gap-4">
                                <span className="material-symbols-outlined text-6xl text-primary">delivery_dining</span>
                                <h2 className="text-3xl font-extrabold text-gray-900">Aplicación Móvil Requerida</h2>
                                <p className="text-gray-600 font-medium max-w-md">Tu cuenta tiene el rol de <b>Repartidor</b>. Para operar, por favor abre la aplicación móvil instalada en tu dispositivo e inicia sesión.</p>
                            </div>
                        } />

                        {/* Protected Routes Wrapper */}
                        <Route element={<Layout />}>
                            <Route path="/monitor" element={
                                <RoleGuard allowedRoles={['Administrador', 'Usuario']}>
                                    <FleetMonitor />
                                </RoleGuard>
                            } />
                            <Route path="/trips/:tripId?" element={
                                <RoleGuard allowedRoles={['Administrador']}>
                                    <TripManagement />
                                </RoleGuard>
                            } />
                            <Route path="/registry/:tab?/:action?/:id?" element={
                                <RoleGuard allowedRoles={['Administrador']}>
                                    <Registry />
                                </RoleGuard>
                            } />
                            <Route path="/comercializadora/:tab?/:action?/:id?" element={
                                <RoleGuard allowedRoles={['Administrador']}>
                                    <Comercializadora />
                                </RoleGuard>
                            } />
                            <Route path="/leads" element={
                                <RoleGuard allowedRoles={['Administrador', 'Usuario']}>
                                    <Leads />
                                </RoleGuard>
                            } />
                            <Route path="/settings" element={
                                <RoleGuard allowedRoles={['Administrador']}>
                                    <PricingSettings />
                                </RoleGuard>
                            } />
                            <Route path="/access" element={
                                <RoleGuard allowedRoles={['Administrador']}>
                                    <UserAccess />
                                </RoleGuard>
                            } />


                            <Route path="/ruta-matutina" element={
                                <RoleGuard allowedRoles={['Administrador', 'Usuario']}>
                                    <GoogleSheetView 
                                        title="Ruta Matutina" 
                                        icon="wb_twilight" 
                                        sheetUrl={MORNING_SHEET_URL} 
                                    />
                                </RoleGuard>
                            } />

                            <Route path="/ruta-vespertina" element={
                                <RoleGuard allowedRoles={['Administrador', 'Usuario']}>
                                    <GoogleSheetView 
                                        title="Ruta Vespertina" 
                                        icon="wb_sunny" 
                                        sheetUrl={EVENING_SHEET_URL} 
                                    />
                                </RoleGuard>
                            } />

                        </Route>

                        {/* 404 for unmatched routes */}
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                    <Analytics />
                </React.Suspense>
            </HashRouter>
        </APIProvider>
    );
};

export default App;