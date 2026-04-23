import React, { useEffect } from 'react';
import Sidebar from './Sidebar';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../services/authService';
import { supabase } from '../services/supabaseClient';
import { ToastProvider, useToast } from './Toast';

const LayoutContent = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    if (!isAuthenticated()) return;

    const channel = supabase
      .channel('global-trips')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trips' },
        (payload) => {
          const newTrip = payload.new;
          showToast(
            `📦 Nueva Entrega: ${newTrip.passenger_name || 'Desconocido'}`,
            'info'
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen w-full flex-row bg-background-light dark:bg-background-dark overflow-hidden font-display relative">
      <Sidebar />
      <main className="flex flex-1 flex-col h-full overflow-hidden relative">
        <Outlet />
      </main>
    </div>
  );
};

const Layout = () => {
  return (
    <ToastProvider>
      <LayoutContent />
    </ToastProvider>
  );
};

export default Layout;