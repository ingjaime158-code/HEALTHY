import React, { useEffect } from 'react';
import Sidebar from './Sidebar';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../services/authService';
import { supabase } from '../services/supabaseClient';
import { ToastProvider, useToast } from './Toast';

const LayoutContent = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);

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
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] md:hidden transition-all duration-300"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Hamburger Menu Button (Mobile Only) */}
      <button
        onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        className="fixed top-4 left-4 z-[60] md:hidden bg-blue-600 text-white p-2.5 rounded-xl shadow-lg border border-blue-400/30 flex items-center justify-center hover:bg-blue-500 transition-all active:scale-95"
      >
        <span className="material-symbols-outlined text-[24px]">
          {isMobileSidebarOpen ? 'close' : 'menu'}
        </span>
      </button>

      <Sidebar isOpenMobile={isMobileSidebarOpen} closeMobile={() => setIsMobileSidebarOpen(false)} />
      
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