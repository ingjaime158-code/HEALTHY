import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
    const navigate = useNavigate();

    return (
        <div className="flex h-screen w-full items-center justify-center bg-[#051024] relative overflow-hidden font-display">
            {/* Background decoration */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-red-600/10 blur-[100px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/10 blur-[100px]"></div>
            </div>

            <div className="relative z-10 text-center max-w-md px-8">
                <div className="mb-6">
                    <span className="text-8xl font-black text-white/10 select-none">404</span>
                </div>
                <h1 className="text-2xl font-bold text-white mb-3">Página no encontrada</h1>
                <p className="text-blue-200/60 text-sm mb-8">
                    La página que buscas no existe o fue movida.
                </p>
                <button
                    onClick={() => navigate('/')}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium text-sm transition-all border border-white/10 flex items-center gap-2 mx-auto"
                >
                    <span className="material-symbols-outlined text-[18px]">home</span>
                    Volver al Inicio
                </button>
            </div>
        </div>
    );
};

export default NotFound;
