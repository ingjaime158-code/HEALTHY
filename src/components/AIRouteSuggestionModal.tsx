import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Bot, 
  Users, 
  MapPin, 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  RefreshCw, 
  Sparkles, 
  Navigation, 
  Clock, 
  Route, 
  Sliders, 
  ChevronRight,
  BrainCircuit,
  Info,
  Layers,
  Map as MapIcon
} from 'lucide-react';
import { generateAISmartDistribution, AISuggestionResult, DriverRouteSuggestion } from '../services/api/aiRouteService';

interface AIRouteSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImplement: (suggestion: AISuggestionResult) => void;
  clients: any[];
  routeType: 'Matutina' | 'Vespertina';
  allAvailableDrivers: string[];
}

export const AIRouteSuggestionModal: React.FC<AIRouteSuggestionModalProps> = ({
  isOpen,
  onClose,
  onImplement,
  clients,
  routeType,
  allAvailableDrivers
}) => {
  // Modal state
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [driverCount, setDriverCount] = useState<number>(5);
  const [customDriverInput, setCustomDriverInput] = useState<string>('');
  
  // AI Calculation state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<AISuggestionResult | null>(null);
  
  // Feedback & Feedback UI state
  const [showFeedbackInput, setShowFeedbackInput] = useState<boolean>(false);
  const [userFeedbackText, setUserFeedbackText] = useState<string>('');
  const [activeDriverTab, setActiveDriverTab] = useState<string>('all');
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);

  // Default driver list
  const defaultDriversList = [
    'BRAYAN', 'ALVARO', 'NIDIA', 'TONY', 'LUIS', 'MIRIAM', 'KARLA', 'ANGELES'
  ];

  const driverPool = Array.from(new Set([...(allAvailableDrivers || []), ...defaultDriversList]));

  // Initialize driver selection on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setShowFeedbackInput(false);
      setUserFeedbackText('');
      setAiResult(null);
      const initialCount = Math.min(5, driverPool.length);
      setSelectedDrivers(driverPool.slice(0, initialCount));
      setDriverCount(initialCount);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Toggle driver selection
  const handleToggleDriver = (driverName: string) => {
    if (selectedDrivers.includes(driverName)) {
      const updated = selectedDrivers.filter(d => d !== driverName);
      setSelectedDrivers(updated);
      setDriverCount(updated.length);
    } else {
      const updated = [...selectedDrivers, driverName];
      setSelectedDrivers(updated);
      setDriverCount(updated.length);
    }
  };

  // Adjust counter
  const handleCountChange = (newCount: number) => {
    const validCount = Math.max(1, Math.min(10, newCount));
    setDriverCount(validCount);
    if (validCount <= driverPool.length) {
      setSelectedDrivers(driverPool.slice(0, validCount));
    }
  };

  // Add custom driver manually
  const handleAddCustomDriver = () => {
    if (!customDriverInput.trim()) return;
    const nameUpper = customDriverInput.trim().toUpperCase();
    if (!selectedDrivers.includes(nameUpper)) {
      setSelectedDrivers([...selectedDrivers, nameUpper]);
      setDriverCount(prev => prev + 1);
    }
    setCustomDriverInput('');
  };

  // Generate AI Suggestion
  const handleGenerateAISuggestion = async (feedback?: string) => {
    if (selectedDrivers.length === 0) {
      alert("Por favor selecciona al menos un repartidor activo.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await generateAISmartDistribution({
        clients,
        activeDrivers: selectedDrivers,
        routeType,
        startLat: 25.7819168,
        startLng: -100.191302,
        customFeedback: feedback || userFeedbackText
      });
      setAiResult(result);
      setStep(2);
    } catch (err) {
      console.error('[AIRouteSuggestionModal] Error calculating AI route:', err);
      alert("Ocurrió un error al calcular la sugerencia de IA.");
    } finally {
      setIsLoading(false);
    }
  };

  // Re-calculate with user feedback
  const handleRecalculateWithFeedback = () => {
    if (!userFeedbackText.trim()) return;
    handleGenerateAISuggestion(userFeedbackText);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-900/70 via-slate-900 to-slate-900 border-b border-slate-700/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Bot className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Asistente Inteligente de Rutas IA
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                  {routeType}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Mapa Real Interactivo de Calles + OSRM + Telemetría Histórica
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">

          {/* STEP 1: Driver Selection */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-indigo-200 flex items-start space-x-3">
                <BrainCircuit className="w-6 h-6 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-white">Configura la jornada del turno {routeType}</p>
                  <p className="text-slate-300 mt-1">
                    Indica cuántos y cuáles repartidores trabajarán hoy. La IA re-balanceará equitativamente los 
                    <strong> {clients.length} clientes</strong> activos en el mapa real de calles.
                  </p>
                </div>
              </div>

              {/* Driver Count Control */}
              <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-200 block">
                    ¿Cuántos repartidores laboran hoy?
                  </label>
                  <span className="text-xs text-slate-400">
                    Sugerencia promedio: {Math.ceil(clients.length / Math.max(1, driverCount))} clientes por chofer
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => handleCountChange(driverCount - 1)}
                    className="w-10 h-10 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-lg flex items-center justify-center transition-colors"
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-2xl font-bold text-indigo-400">
                    {driverCount}
                  </span>
                  <button
                    onClick={() => handleCountChange(driverCount + 1)}
                    className="w-10 h-10 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-lg flex items-center justify-center transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Select Active Drivers Chips */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  Selecciona los repartidores activos:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {driverPool.map(driver => {
                    const isSelected = selectedDrivers.includes(driver);
                    return (
                      <button
                        key={driver}
                        onClick={() => handleToggleDriver(driver)}
                        className={`p-3 rounded-xl border font-medium text-sm flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                            : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                        }`}
                      >
                        <span>{driver}</span>
                        {isSelected ? (
                          <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Add Custom Driver Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Agregar otro nombre de chofer..."
                  value={customDriverInput}
                  onChange={(e) => setCustomDriverInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustomDriver()}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleAddCustomDriver}
                  className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
                >
                  Agregar
                </button>
              </div>

              {/* Generate Action Button */}
              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => handleGenerateAISuggestion()}
                  disabled={isLoading || selectedDrivers.length === 0}
                  className="w-full md:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold text-base shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Calculando mapa real y balanceando carga...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generar Mapa Real Sugerido
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: AI Real Geographic Map & Balance Breakdown */}
          {step === 2 && aiResult && (
            <div className="space-y-6 animate-fade-in">

              {/* Overview Metric Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Clientes Totales</div>
                    <div className="text-lg font-bold text-white">{aiResult.totalClients}</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Route className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Choferes Activos</div>
                    <div className="text-lg font-bold text-white">{aiResult.driverRoutes.length}</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                    <BrainCircuit className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Confianza Histórica</div>
                    <div className="text-lg font-bold text-amber-300">{aiResult.overallConfidence}%</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Balance Carga</div>
                    <div className="text-lg font-bold text-emerald-400">Equilibrado</div>
                  </div>
                </div>
              </div>

              {/* OSRM Docker Indicator Badge */}
              {aiResult.osrmSource === 'osrm-local' && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 text-xs font-semibold flex items-center justify-between shadow-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    🗺️ OSRM Docker Local Activo — Ruteo en tiempo real con calles, giros y sentidos de circulación oficiales
                  </span>
                  <span className="text-[10px] bg-emerald-900/60 px-2 py-0.5 rounded text-emerald-200 uppercase font-mono">
                    http://localhost:5000
                  </span>
                </div>
              )}

              {/* REAL MAP COMPONENT (LEAFLET / OPENSTREETMAP REAL MAP VISUALIZER) */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-indigo-400" />
                    Mapa Real de Rutas Sugeridas - Zona Metropolitana de Monterrey
                  </span>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    {aiResult.driverRoutes.map(dr => (
                      <span 
                        key={dr.driverName} 
                        className="text-[11px] px-2.5 py-0.5 rounded font-bold text-white flex items-center gap-1"
                        style={{ backgroundColor: `${dr.color}33`, borderColor: dr.color, borderWidth: '1px' }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dr.color }} />
                        {dr.driverName} ({dr.clients.length})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Real Interactive Leaflet Map Visualizer */}
                <RealLeafletMapVisualizer 
                  driverRoutes={aiResult.driverRoutes}
                  hoveredClientId={hoveredClientId}
                  setHoveredClientId={setHoveredClientId}
                />
              </div>

              {/* DRIVER CARDS & BREAKDOWN */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-200">
                    Rutas y Carga Equilibrada por Chofer
                  </h3>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setActiveDriverTab('all')}
                      className={`text-xs px-3 py-1 rounded-lg border font-semibold transition-colors ${
                        activeDriverTab === 'all'
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      Todos ({aiResult.driverRoutes.length})
                    </button>
                    {aiResult.driverRoutes.map(dr => (
                      <button
                        key={dr.driverName}
                        onClick={() => setActiveDriverTab(dr.driverName)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-colors flex items-center gap-1 ${
                          activeDriverTab === dr.driverName
                            ? 'bg-slate-700 border-slate-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dr.color }} />
                        {dr.driverName} ({dr.clients.length})
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiResult.driverRoutes
                    .filter(dr => activeDriverTab === 'all' || activeDriverTab === dr.driverName)
                    .map(dr => (
                      <div 
                        key={dr.driverName}
                        className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-3 shadow-md"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: dr.color }} />
                            <span className="font-bold text-white text-base">{dr.driverName}</span>
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-950/60 border border-indigo-700/50 text-indigo-300 font-bold">
                              {dr.clients.length} clientes
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                            {dr.confidenceScore}% Coincidencia
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                          <span className="flex items-center gap-1">
                            <Navigation className="w-3.5 h-3.5 text-indigo-400" />
                            <strong>{dr.totalDistanceKm} km</strong> est.
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <strong>{Math.floor(dr.estimatedTimeMin / 60)}h {dr.estimatedTimeMin % 60}m</strong> est.
                          </span>
                          <span className="flex items-center gap-1 text-slate-400">
                            <Info className="w-3.5 h-3.5 text-cyan-400" />
                            {dr.historicalMatches} fijos
                          </span>
                        </div>

                        {/* List preview of stops */}
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {dr.clients.map((c, idx) => (
                            <div 
                              key={c.id}
                              onMouseEnter={() => setHoveredClientId(c.id)}
                              onMouseLeave={() => setHoveredClientId(null)}
                              className={`text-xs py-1.5 px-2.5 rounded transition-all flex items-center justify-between border ${
                                hoveredClientId === c.id 
                                  ? 'bg-indigo-900/40 border-indigo-500 text-white' 
                                  : 'bg-slate-900/50 border-slate-800/80 text-slate-300'
                              }`}
                            >
                              <span className="truncate max-w-[220px]">
                                <strong className="mr-1" style={{ color: dr.color }}>{idx + 1}.</strong> {c.name}
                              </span>
                              <span className="text-[10px] text-slate-400 truncate max-w-[90px]">
                                {c.tiempos ? `${c.tiempos} tiempos` : (c.planType || 'General')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Feedback Input Box (Toggled by "Sugerir cambios") */}
              {showFeedbackInput && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/40 space-y-3 animate-fade-in">
                  <label className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    ¿Qué cambios deseas sugerirle a la IA?
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ej. Mueve al cliente Farmacia San Pablo de Brayan a Tony..."
                    value={userFeedbackText}
                    onChange={(e) => setUserFeedbackText(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowFeedbackInput(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs font-medium hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleRecalculateWithFeedback}
                      disabled={isLoading || !userFeedbackText.trim()}
                      className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                      Recalcular con mis cambios
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons Bar */}
              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <button
                  onClick={() => setStep(1)}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Cambiar choferes ({selectedDrivers.length})
                </button>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {/* Button 1: Hoy no */}
                  <button
                    onClick={onClose}
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <XCircle className="w-4 h-4 text-slate-400" />
                    Hoy no
                  </button>

                  {/* Button 2: Sugerir cambios */}
                  <button
                    onClick={() => setShowFeedbackInput(!showFeedbackInput)}
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                    Sugerir cambios
                  </button>

                  {/* Button 3: Implementar */}
                  <button
                    onClick={() => onImplement(aiResult)}
                    className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
                  >
                    <CheckCircle2 className="w-4.5 h-4.5" />
                    Implementar
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};

/**
 * Real Leaflet / OpenStreetMap / Satellite Map Component.
 * 100% free, no Google Maps API Key billing errors, rendering real streets, roads, satellite imagery, 
 * base marker, and custom colored pins for every driver delivery!
 */
const RealLeafletMapVisualizer: React.FC<{
  driverRoutes: DriverRouteSuggestion[];
  hoveredClientId: string | null;
  setHoveredClientId: (id: string | null) => void;
}> = ({ driverRoutes, hoveredClientId, setHoveredClientId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapType, setMapType] = useState<'streets' | 'satellite'>('streets');
  const [leafletLoaded, setLeafletLoaded] = useState<boolean>(false);

  // Load Leaflet JS & CSS dynamically from CDN
  useEffect(() => {
    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }

    const existingCss = document.getElementById('leaflet-css');
    if (!existingCss) {
      const cssLink = document.createElement('link');
      cssLink.id = 'leaflet-css';
      cssLink.rel = 'stylesheet';
      cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(cssLink);
    }

    const existingScript = document.getElementById('leaflet-js');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => setLeafletLoaded(true);
      document.body.appendChild(script);
    } else {
      setLeafletLoaded(true);
    }
  }, []);

  // Initialize and render Leaflet map instance
  useEffect(() => {
    if (!leafletLoaded || !containerRef.current || typeof (window as any).L === 'undefined') return;
    const L = (window as any).L;

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (e) {
        // ignore cleanup
      }
      mapInstanceRef.current = null;
    }

    const map = L.map(containerRef.current, {
      center: [25.7819168, -100.191302],
      zoom: 11,
      zoomControl: true,
      attributionControl: false
    });
    mapInstanceRef.current = map;

    // Select Tile Layer
    const tileUrl = mapType === 'satellite'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

    // Base Depot Icon
    const baseIcon = L.divIcon({
      className: 'custom-base-icon',
      html: `<div style="background:#4F46E5; color:white; font-weight:bold; font-size:11px; padding:3px 8px; border-radius:8px; border:2px solid white; box-shadow:0 4px 6px rgba(0,0,0,0.3); white-space:nowrap;">🏢 BASE</div>`,
      iconSize: [60, 24],
      iconAnchor: [30, 12]
    });

    L.marker([25.7819168, -100.191302], { icon: baseIcon })
      .addTo(map)
      .bindPopup("<b>BASE DE CHOFERES</b><br>Apodaca / Guadalupe");

    const bounds = L.latLngBounds([[25.7819168, -100.191302]]);

    // Add Driver Routes & Markers
    driverRoutes.forEach(dr => {
      const routeLatLngs: [number, number][] = [[25.7819168, -100.191302]];

      dr.clients.forEach((c, idx) => {
        const lat = Number(c.lat);
        const lng = Number(c.lng);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat > 20 && lat < 30) {
          routeLatLngs.push([lat, lng]);
          bounds.extend([lat, lng]);

          const stopNum = idx + 1;
          const markerIcon = L.divIcon({
            className: 'custom-stop-icon',
            html: `<div style="background:${dr.color}; color:white; font-weight:900; font-size:11px; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #0f172a; box-shadow:0 2px 4px rgba(0,0,0,0.4); cursor:pointer;">${stopNum}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });

          const m = L.marker([lat, lng], { icon: markerIcon }).addTo(map);
          m.bindPopup(`<b>${dr.driverName} - #${stopNum}</b><br>${c.name}<br>${c.address || ''}`);

          m.on('mouseover', () => setHoveredClientId(c.id));
          m.on('mouseout', () => setHoveredClientId(null));
        }
      });

      // Draw polyline connecting stops
      if (routeLatLngs.length > 1) {
        L.polyline(routeLatLngs, {
          color: dr.color,
          weight: 3.5,
          opacity: 0.85,
          dashArray: '6, 6'
        }).addTo(map);
      }
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          // ignore cleanup
        }
        mapInstanceRef.current = null;
      }
    };
  }, [leafletLoaded, driverRoutes, mapType]);

  return (
    <div className="relative h-72 md:h-80 w-full bg-slate-950 rounded-lg border border-slate-800/90 overflow-hidden shadow-inner">
      
      {/* Map Canvas Container */}
      <div ref={containerRef} className="w-full h-full z-10" />

      {/* Layer Toggle Controls */}
      <div className="absolute top-3 right-3 z-[1000] flex bg-slate-900/90 backdrop-blur-md p-1 rounded-lg border border-slate-700/80 shadow-lg">
        <button
          onClick={() => setMapType('streets')}
          className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
            mapType === 'streets' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
          }`}
        >
          🗺️ Calles Real
        </button>
        <button
          onClick={() => setMapType('satellite')}
          className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
            mapType === 'satellite' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
          }`}
        >
          🛰️ Satélite
        </button>
      </div>

      {!leafletLoaded && (
        <div className="absolute inset-0 bg-slate-950 flex items-center justify-center text-slate-400 text-xs font-medium z-20">
          <RefreshCw className="w-5 h-5 animate-spin mr-2 text-indigo-400" />
          Cargando mapa interactivo...
        </div>
      )}
    </div>
  );
};
