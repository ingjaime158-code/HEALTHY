import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { logout, getCurrentUser, getCurrentUserRole, getCurrentUserName, getCurrentUserAllowedViews } from '../services/authService';

const Sidebar = ({ isOpenMobile, closeMobile }: { isOpenMobile?: boolean; closeMobile?: () => void }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const userEmail = getCurrentUser();
  const [userRole, setUserRole] = useState(getCurrentUserRole());
  const [userName, setUserName] = useState(getCurrentUserName());
  const [allowedViews, setAllowedViews] = useState<string[]>(getCurrentUserAllowedViews());

  // State for sidebar collapse (minimized mode) - only for desktop
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (closeMobile) closeMobile();
  }, [location.pathname]);

  // State for collapsible sections (true = open)
  const [sections, setSections] = useState({
    general: true,
    operaciones: true,
    admin: true
  });

  const toggleSection = (key: keyof typeof sections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    setUserRole(getCurrentUserRole());
    setUserName(getCurrentUserName());
    setAllowedViews(getCurrentUserAllowedViews());
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navGroups = [
    {
      key: 'operaciones',
      title: 'Logística',
      items: [
        { to: "/monitor", icon: "cell_tower", label: "Monitor en Vivo", roles: ['Administrador', 'Usuario'] },
        { to: "/ruta-matutina", icon: "wb_twilight", label: "Ruta Matutina", roles: ['Administrador', 'Usuario'] },
        { to: "/ruta-vespertina", icon: "wb_sunny", label: "Ruta Vespertina", roles: ['Administrador', 'Usuario'] },
      ]
    },
    {
      key: 'admin',
      title: 'Administración',
      items: [
        { to: "/access", icon: "admin_panel_settings", label: "Control de Acceso", roles: ['Administrador'] },
        { to: "/registry/choferes", icon: "id_card", label: "Repartidores", roles: ['Administrador'] },
        { to: "/registry/mapas", icon: "map", label: "Mapas", roles: ['Administrador'] },
      ]
    }
  ];

  return (
    <aside
      className={`fixed md:relative flex flex-col justify-between bg-[#051024] border-r border-white/10 shrink-0 transition-all duration-300 shadow-2xl z-50 h-screen 
        ${isOpenMobile ? 'left-0' : 'left-[-100%] md:left-0'} 
        ${isCollapsed ? 'md:w-24' : 'md:w-64'} w-72`}
    >
      {/* Edge Toggle Button (Desktop Only) */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="hidden md:flex absolute -right-3 top-8 z-50 bg-[#051024] border border-white/20 text-white rounded-full p-1 shadow-lg hover:bg-white/10 transition-colors items-center justify-center w-6 h-6"
        title={isCollapsed ? "Expandir" : "Contraer"}
      >
        <span className="material-symbols-outlined text-[14px] font-bold">
          {isCollapsed ? 'chevron_right' : 'chevron_left'}
        </span>
      </button>

      {/* Scrollable Content Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar overflow-x-hidden">

        {/* Header / Logo Area */}
        <div className="flex flex-col items-center px-4 py-6 border-b border-white/10 sticky top-0 bg-[#051024] z-10 transition-all duration-300">
          <div className="w-full flex flex-col items-center justify-center transition-all duration-300">
            {/* Always showing the logo image, scaled */}
            <img
              src="/LOGO2.jpg"
              alt="Healthy Dream Logo"
              className={`object-cover rounded-full transition-all duration-300 shadow-md ${isCollapsed ? 'w-12 h-12' : 'w-16 h-16'}`}
            />
            {/* Healthy Dream text, visible only when expanded */}
            {!isCollapsed && (
              <h1 className="text-white text-xl font-black tracking-tighter mt-2 animate-in fade-in duration-300 text-center leading-none">
                Healthy<br />Dream
              </h1>
            )}
          </div>
        </div>


        <nav className="flex flex-col gap-1 p-3">
          {navGroups.map((group) => {
            // Filter items by role and allowed views
            const filteredItems = group.items.filter(item => {
              if (!userRole) return false;
              // Admins always see everything
              if (userRole === 'Administrador') return true;
              // If user has specific allowed views configured, use those
              if (allowedViews.length > 0) return allowedViews.includes(item.to);
              // Otherwise, fall back to default role-based access
              return item.roles.includes(userRole);
            });
            if (filteredItems.length === 0) return null;

            const isOpen = sections[group.key as keyof typeof sections];

            // In collapsed mode, clean list
            if (isCollapsed) {
              return (
                <div key={group.key} className="flex flex-col gap-1 pb-2 mb-2 border-b border-white/5 last:border-0 border-dashed">
                  {filteredItems.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center justify-center w-full h-10 rounded-xl transition-all duration-200 group relative ${isActive
                          ? 'bg-white/10 text-white shadow-inner border border-white/10'
                          : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`
                      }
                      title={item.label}
                    >
                      <span className={`material-symbols-outlined text-[24px] transition-transform group-hover:scale-110 ${location.pathname === item.to ? 'text-blue-400' : ''}`}>
                        {item.icon}
                      </span>
                    </NavLink>
                  ))}
                </div>
              );
            }

            // Expanded Mode
            return (
              <div key={group.key} className="mb-2">
                <button
                  onClick={() => toggleSection(group.key as keyof typeof sections)}
                  className="w-full flex items-center justify-between px-2 py-2 text-[10px] font-bold uppercase text-white/40 hover:text-white/70 transition-colors mb-1 tracking-wider"
                >
                  {group.title}
                  <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>

                <div className={`flex flex-col gap-1 pl-1 border-l border-white/5 ml-2 transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  {filteredItems.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group text-sm ${isActive
                          ? 'bg-white/10 text-white font-bold border border-white/20 shadow-inner'
                          : 'text-white/60 hover:bg-white/5 hover:text-white font-medium hover:translate-x-1'
                        }`
                      }
                    >
                      <span className={`material-symbols-outlined text-[20px] transition-transform group-hover:scale-110 ${location.pathname === item.to ? 'text-blue-400' : ''}`}>
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Footer Area */}
      <div className="p-3 bg-[#051024] border-t border-white/10">
        <div className={`flex items-center gap-3 px-2 py-2 mb-2 rounded-xl bg-white/5 border border-white/5 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="h-9 w-9 min-w-[36px] rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md border border-white/20 cursor-default" title={userEmail || 'Usuario'}>
            {(userName || userEmail)?.substring(0, 2).toUpperCase()}
          </div>

          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden animate-in fade-in duration-300">
              <p className="text-white text-xs font-bold truncate w-32">{userName || userRole || 'Usuario'}</p>
              <p className="text-white/40 text-[10px] truncate w-32" title={userEmail || ''}>{userEmail}</p>
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className={`flex items-center gap-2 justify-center w-full py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-xs font-bold uppercase tracking-wider transition-all border border-transparent hover:border-red-500/50 ${isCollapsed ? 'px-0' : ''}`}
          title="Cerrar Sesión"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          {!isCollapsed && <span>Salir</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;