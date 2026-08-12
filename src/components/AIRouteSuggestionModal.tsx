import React, { useState, useEffect } from 'react';
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
  Info
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
  const [step, setStep] = useState<1 | 2>(1); // 1: Driver Selection, 2: AI Map & Recommendation
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [driverCount, setDriverCount] = useState<number>(3);
  const [customDriverInput, setCustomDriverInput] = useState<string>('');
  
  // AI Calculation state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<AISuggestionResult | null>(null);
  
  // Feedback & Feedback UI state
  const [showFeedbackInput, setShowFeedbackInput] = useState<boolean>(false);
  const [userFeedbackText, setUserFeedbackText] = useState<string>('');
  const [activeDriverTab, setActiveDriverTab] = useState<string>('all');

  // Default driver list if none passed
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
      // Pre-select top N drivers by default
      const initialCount = Math.min(driverCount, driverPool.length);
      setSelectedDrivers(driverPool.slice(0, initialCount));
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
    // Adjust selected drivers array length
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-900/60 via-slate-900 to-slate-900 border-b border-slate-700/80">
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
                Basado en {aiResult?.analyzedSnapshotsCount || 258} lecturas de telemetría y aprendizaje continuo
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
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* STEP 1: Driver Selection */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-indigo-200 flex items-start space-x-3">
                <BrainCircuit className="w-6 h-6 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-white">Configura la jornada de hoy</p>
                  <p className="text-slate-300 mt-1">
                    Indica cuántos y cuáles repartidores trabajarán en el turno <strong>{routeType}</strong>. 
                    La IA analizará los <strong>{clients.length} clientes</strong> activos y asignará las rutas de forma óptima.
                  </p>
                </div>
              </div>

              {/* Driver Count Control */}
              <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-200 block">
                    ¿Cuántos repartidores laboran hoy?
                  </label>
                  <span className="text-xs text-slate-400">Ajusta el número total de unidades en ruta</span>
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
                  Selecciona cuáles repartidores asistieron:
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
                      Analizando {clients.length} clientes con IA...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generar Mapa y Ruta Sugerida
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: AI Map & Suggested Distribution */}
          {step === 2 && aiResult && (
            <div className="space-y-6 animate-fade-in">

              {/* Stats Overview Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Clientes Totales</div>
                    <div className="text-xl font-bold text-white">{aiResult.totalClients}</div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Route className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Repartidores Activos</div>
                    <div className="text-xl font-bold text-white">{aiResult.driverRoutes.length}</div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400">
                    <BrainCircuit className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Confianza Histórica</div>
                    <div className="text-xl font-bold text-amber-300">{aiResult.overallConfidence}%</div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Snapshots Evaluados</div>
                    <div className="text-xl font-bold text-white">{aiResult.analyzedSnapshotsCount}</div>
                  </div>
                </div>
              </div>

              {/* VISUAL MAP PREVIEW PANEL */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 relative space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-indigo-400" />
                    Vista Previa del Mapa de Rutas Sugeridas por la IA
                  </span>
                  <div className="flex items-center gap-2">
                    {aiResult.driverRoutes.map(dr => (
                      <span 
                        key={dr.driverName} 
                        className="text-xs px-2.5 py-1 rounded-md font-semibold text-white flex items-center gap-1.5"
                        style={{ backgroundColor: `${dr.color}33`, borderColor: dr.color, borderWidth: '1px' }}
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dr.color }} />
                        {dr.driverName} ({dr.clients.length})
                      </span>
                    ))}
                  </div>
                </div>

                {/* SVG Route Map Visualizer */}
                <div className="relative h-64 md:h-72 w-full bg-slate-900 rounded-lg border border-slate-800 overflow-hidden flex items-center justify-center">
                  <svg className="w-full h-full" viewBox="0 0 800 350">
                    {/* Background grid lines for map feel */}
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />

                    {/* Central Base Depot Icon */}
                    <g transform="translate(400, 175)">
                      <circle r="16" fill="#6366F1" fillOpacity="0.3" className="animate-ping" />
                      <circle r="12" fill="#4F46E5" stroke="#FFFFFF" strokeWidth="2" />
                      <text x="0" y="4" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontStyle="bold">BASE</text>
                    </g>

                    {/* Driver Routes Polylines & Client Pins */}
                    {aiResult.driverRoutes.map((dr, dIdx) => {
                      const totalDr = aiResult.driverRoutes.length;
                      const angleStep = (2 * Math.PI) / Math.max(1, totalDr);
                      const baseAngle = dIdx * angleStep - Math.PI / 2;

                      // Project clients along radial clusters around base
                      const points = dr.clients.map((c, cIdx) => {
                        const radius = 60 + (cIdx * 25) + ((cIdx % 3) * 15);
                        const angle = baseAngle + (cIdx * 0.15) - 0.2;
                        const x = 400 + Math.cos(angle) * radius;
                        const y = 175 + Math.sin(angle) * radius;
                        return { x, y, client: c, order: cIdx + 1 };
                      });

                      // Construct polyline path from base -> stop 1 -> stop 2 ...
                      const pathD = points.length > 0
                        ? `M 400 175 ` + points.map(p => `L ${p.x} ${p.y}`).join(' ')
                        : '';

                      return (
                        <g key={dr.driverName}>
                          {/* Polyline route line */}
                          <path
                            d={pathD}
                            fill="none"
                            stroke={dr.color}
                            strokeWidth="2.5"
                            strokeDasharray="4 2"
                            strokeOpacity="0.85"
                          />

                          {/* Client Marker Pins */}
                          {points.map((p) => (
                            <g key={p.client.id} transform={`translate(${p.x}, ${p.y})`}>
                              <circle r="9" fill={dr.color} stroke="#0F172A" strokeWidth="2" />
                              <text x="0" y="3" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="bold">
                                {p.order}
                              </text>
                              {/* Hover text label */}
                              <text x="0" y="18" textAnchor="middle" fill="#CBD5E1" fontSize="8" className="pointer-events-none">
                                {p.client.name?.substring(0, 12)}
                              </text>
                            </g>
                          ))}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              {/* Driver Tabs & Breakdown Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-200">
                    Desglose Detallado por Repartidor
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveDriverTab('all')}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
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
                        className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors flex items-center gap-1.5 ${
                          activeDriverTab === dr.driverName
                            ? 'bg-slate-700 border-slate-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dr.color }} />
                        {dr.driverName}
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
                        className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: dr.color }} />
                            <span className="font-bold text-white text-base">{dr.driverName}</span>
                            <span className="text-xs px-2 py-0.5 rounded-md bg-slate-700 text-slate-300 font-medium">
                              {dr.clients.length} clientes
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800/40">
                            {dr.confidenceScore}% Coincidencia
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-lg">
                          <span className="flex items-center gap-1">
                            <Navigation className="w-3.5 h-3.5 text-indigo-400" />
                            {dr.totalDistanceKm} km est.
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            {Math.floor(dr.estimatedTimeMin / 60)}h {dr.estimatedTimeMin % 60}m est.
                          </span>
                          <span className="flex items-center gap-1 text-slate-300">
                            <Info className="w-3.5 h-3.5 text-cyan-400" />
                            {dr.historicalMatches} fijos históricos
                          </span>
                        </div>

                        {/* List preview of top stops */}
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {dr.clients.map((c, idx) => (
                            <div 
                              key={c.id}
                              className="text-xs py-1.5 px-2.5 rounded bg-slate-900/40 text-slate-300 flex items-center justify-between border border-slate-800/60"
                            >
                              <span className="truncate max-w-[200px]">
                                <strong className="text-indigo-400 mr-1">{idx + 1}.</strong> {c.name}
                              </span>
                              <span className="text-[10px] text-slate-500 truncate max-w-[100px]">
                                {c.tiempos || c.planType || 'General'}
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
              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Cambiar repartidores ({selectedDrivers.length})
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
