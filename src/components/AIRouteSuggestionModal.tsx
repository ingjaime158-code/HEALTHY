import React, { useState, useEffect, useMemo } from 'react';
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
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
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
  const [mapMode, setMapMode] = useState<'google' | 'tile'>('google');

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
                Mapa Real de Calles + OSRM + Telemetría Histórica
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

              {/* REAL MAP COMPONENT (GOOGLE MAPS REAL MAP) */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-indigo-400" />
                    Mapa Real de Rutas Sugeridas - Zona Metropolitana de Monterrey
                  </span>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 mr-2">
                      <button
                        onClick={() => setMapMode('google')}
                        className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 ${
                          mapMode === 'google' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <MapIcon className="w-3 h-3" />
                        Mapa Interactivo Real
                      </button>
                      <button
                        onClick={() => setMapMode('tile')}
                        className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 ${
                          mapMode === 'tile' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Layers className="w-3 h-3" />
                        Vista Satélite/Calles
                      </button>
                    </div>

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

                {/* Real Google Map / Tile Map Display */}
                <InteractiveRealMapVisualizer 
                  driverRoutes={aiResult.driverRoutes}
                  hoveredClientId={hoveredClientId}
                  setHoveredClientId={setHoveredClientId}
                  mapMode={mapMode}
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
 * Auto Bounds Fitter component for Google Map
 */
const MapBoundsFitter: React.FC<{ points: Array<{ lat: number; lng: number }> }> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length === 0 || typeof google === 'undefined') return;
    try {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: 25.7819168, lng: -100.191302 }); // Base
      points.forEach(p => {
        if (p.lat && p.lng) bounds.extend({ lat: p.lat, lng: p.lng });
      });
      map.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
    } catch (e) {
      console.warn('[MapBoundsFitter] Exception fitting map bounds:', e);
    }
  }, [map, points]);
  return null;
};

/**
 * Interactive Real Map Component:
 * Renders an actual interactive Google Map with street tiles, terrain, highways, real-time zoom/pan, 
 * base marker, and custom colored pins for every driver delivery!
 */
const InteractiveRealMapVisualizer: React.FC<{
  driverRoutes: DriverRouteSuggestion[];
  hoveredClientId: string | null;
  setHoveredClientId: (id: string | null) => void;
  mapMode: 'google' | 'tile';
}> = ({ driverRoutes, hoveredClientId, setHoveredClientId, mapMode }) => {

  const clientPoints = useMemo(() => {
    const pts: Array<{
      id: string;
      name: string;
      lat: number;
      lng: number;
      driverName: string;
      color: string;
      order: number;
    }> = [];

    driverRoutes.forEach(dr => {
      dr.clients.forEach((c, idx) => {
        const lat = Number(c.lat);
        const lng = Number(c.lng);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat > 20 && lat < 30) {
          pts.push({
            id: c.id,
            name: c.name,
            lat,
            lng,
            driverName: dr.driverName,
            color: dr.color,
            order: idx + 1
          });
        }
      });
    });

    return pts;
  }, [driverRoutes]);

  return (
    <div className="relative h-72 md:h-80 w-full bg-slate-950 rounded-lg border border-slate-800/90 overflow-hidden shadow-inner">
      
      {/* 1. REAL GOOGLE MAP VIEW */}
      <Map
        id="ai-suggestion-google-map"
        defaultCenter={{ lat: 25.7819168, lng: -100.191302 }}
        defaultZoom={11}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeId={mapMode === 'tile' ? 'hybrid' : 'roadmap'}
        className="w-full h-full"
      >
        <MapBoundsFitter points={clientPoints} />

        {/* Base Depot Marker */}
        <AdvancedMarker 
          position={{ lat: 25.7819168, lng: -100.191302 }} 
          title="BASE DE CHOFERES (Apodaca/Guadalupe)"
        >
          <div className="bg-indigo-600 border-2 border-white text-white font-bold text-xs px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1 animate-bounce">
            🏢 BASE
          </div>
        </AdvancedMarker>

        {/* Client Markers with Custom Colors & Stop Numbers */}
        {clientPoints.map(p => {
          const isHovered = hoveredClientId === p.id;
          return (
            <AdvancedMarker
              key={p.id}
              position={{ lat: p.lat, lng: p.lng }}
              title={`${p.driverName} - #${p.order} ${p.name}`}
            >
              <div 
                onMouseEnter={() => setHoveredClientId(p.id)}
                onMouseLeave={() => setHoveredClientId(null)}
                className={`w-7 h-7 rounded-full text-white font-black text-xs flex items-center justify-center border-2 border-slate-900 shadow-md transition-transform cursor-pointer ${
                  isHovered ? 'scale-150 z-50 ring-4 ring-white/60' : 'hover:scale-125'
                }`}
                style={{ backgroundColor: p.color }}
              >
                {p.order}
              </div>
            </AdvancedMarker>
          );
        })}
      </Map>

    </div>
  );
};
