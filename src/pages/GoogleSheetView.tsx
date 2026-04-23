import React from 'react';

interface GoogleSheetViewProps {
    title: string;
    sheetUrl: string;
    icon: string;
}

const GoogleSheetView: React.FC<GoogleSheetViewProps> = ({ title, sheetUrl, icon }) => {
    return (
        <div className="flex flex-col h-full w-full bg-[#f8fafc] overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm">
                        <span className="material-symbols-outlined text-[24px]">{icon}</span>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 leading-tight">{title}</h2>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Gestión de Rutas • Google Sheets</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <a 
                        href={sheetUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all shadow-md active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                        Abrir en Google Sheets
                    </a>
                </div>
            </div>

            {/* Sheet Container */}
            <div className="flex-1 p-4 relative">
                <div className="w-full h-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden relative">
                    <iframe 
                        src={sheetUrl.includes('/edit') ? sheetUrl.replace('/edit', '/edit?rm=minimal') : sheetUrl} 
                        className="w-full h-full border-none"
                        title={title}
                        allowFullScreen
                    ></iframe>
                    
                    {/* Overlay warning if sheetUrl is placeholder */}
                    {sheetUrl.includes('YOUR_SHEET_ID') && (
                        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-8 text-center z-10">
                            <div className="max-w-md bg-white p-8 rounded-3xl shadow-2xl border border-white/20">
                                <span className="material-symbols-outlined text-6xl text-amber-500 mb-4">warning</span>
                                <h3 className="text-2xl font-black text-slate-800 mb-2">Configuración Requerida</h3>
                                <p className="text-slate-600 mb-6 font-medium">
                                    Para visualizar y editar la hoja de cálculo, debes configurar el ID de tu Google Sheet en el archivo <code>App.tsx</code>.
                                </p>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left mb-6 font-mono text-[10px] text-slate-500 overflow-hidden truncate">
                                    VITE_MORNING_SHEET_ID=tu_id_aqui
                                </div>
                                <button 
                                    onClick={() => window.open('https://docs.google.com/spreadsheets/', '_blank')}
                                    className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all shadow-lg"
                                >
                                    Ir a mis hojas de cálculo
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GoogleSheetView;
