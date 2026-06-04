"use client";

import React, { useState, useEffect } from 'react';
import { useMapStore, MapLayer } from '../store/mapStore';
import { useRiskStore } from '../store/riskStore';
import { X, ShieldAlert, BarChart3, Settings2, Loader2, GripVertical } from 'lucide-react';

interface RiskCalculatorProps {
  onClose: () => void;
}

const PARAMETERS = [
  { name: "d/D Ratio", weight: 20 },
  { name: "Depth of Sewer", weight: 10 },
  { name: "Historical Flooding", weight: 5 },
  { name: "Flow Condition", weight: 10 },
  { name: "Solid Deposition/Vel.", weight: 50 },
  { name: "Iot Sensor Alerts" , weight: 5 },
];

export default function RiskCalculator({ onClose }: RiskCalculatorProps) {
  const { layers } = useMapStore();
  const { 
    baseLayerId, setBaseLayerId, 
    mappings, setMappings, 
    resultSummary, setResultSummary 
  } = useRiskStore();
  
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resize State
  const [width, setWidth] = useState(450);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      // We are dragging the left edge, so new width = window width - mouse X
      const newWidth = window.innerWidth - e.clientX;
      // Constrain width
      setWidth(Math.max(300, Math.min(newWidth, 800)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const getAttributeFields = (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer || !layer.data || !layer.data.features || layer.data.features.length === 0) return [];
    return Object.keys(layer.data.features[0].properties || {});
  };

  const handleMappingChange = (paramName: string, field: "layerId" | "column", value: string) => {
    setMappings(paramName, field, value);
  };

  const handleCalculate = async () => {
    if (!baseLayerId) {
      setError("Please select a Base Network Layer.");
      return;
    }
    
    setIsCalculating(true);
    setError(null);
    setResultSummary(null);

    const parameters = PARAMETERS.map(p => ({
      name: p.name,
      weight: p.weight,
      layerId: mappings[p.name]?.layerId || "none",
      column: mappings[p.name]?.column || "none"
    }));

    try {
      const hostname = window.location.hostname;
      const res = await fetch(`http://${hostname}:8000/calculate-risk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseLayerId,
          parameters
        })
      });

      if (!res.ok) {
        throw new Error("Failed to calculate risk");
      }

      const newLayer = await res.json();
      
      // Calculate dashboard summary from the returned layer
      const features = newLayer.data.features;
      let high = 0, medium = 0, low = 0, veryLow = 0;
      let totalScore = 0;
      const highRiskFeatures: any[] = [];
      const paramSums: Record<string, number> = {};
      
      features.forEach((f: any) => {
        const cat = f.properties["Risk_Category"];
        if (cat === "High Risk") high++;
        else if (cat === "Medium Risk") medium++;
        else if (cat === "Low Risk") low++;
        else if (cat === "Very Low") veryLow++;
        
        const score = f.properties.Total_Risk_Score || 0;
        totalScore += score;
        if (score > 0) {
          highRiskFeatures.push(f);
        }
        
        // Sum individual risk params
        Object.keys(f.properties).forEach(key => {
          if (key.startsWith("RiskParam_")) {
            const paramName = key.replace("RiskParam_", "");
            paramSums[paramName] = (paramSums[paramName] || 0) + (f.properties[key] || 0);
          }
        });
      });
      
      const numFeatures = features.length;
      const averageScore = numFeatures > 0 ? totalScore / numFeatures : 0;
      const parameterAverages: Record<string, number> = {};
      
      Object.keys(paramSums).forEach(paramName => {
        parameterAverages[paramName] = numFeatures > 0 ? paramSums[paramName] / numFeatures : 0;
      });
      
      // Sort high risk by score descending and take top 50
      highRiskFeatures.sort((a, b) => (b.properties.Total_Risk_Score || 0) - (a.properties.Total_Risk_Score || 0));
      const topFeatures = highRiskFeatures.slice(0, 50);
      
      setResultSummary({
        total: numFeatures,
        high, medium, low, veryLow,
        averageScore,
        parameterAverages,
        highRiskFeatures: topFeatures
      });

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div 
      className="absolute md:relative inset-y-0 right-0 z-40 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col transition-transform"
      style={{ width: `${width}px`, maxWidth: '100vw' }}
    >
      {/* Resizer Handle */}
      <div 
        className="hidden md:flex absolute top-0 bottom-0 -left-1 w-2 cursor-col-resize hover:bg-blue-500/50 z-50 items-center justify-center transition-colors"
        onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
      >
        <div className="bg-gray-300 dark:bg-gray-700 w-1 h-8 rounded-full pointer-events-none" />
      </div>

      <div className="flex flex-col h-full overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex-none">
          <div className="flex items-center gap-2 md:gap-3 text-red-600 dark:text-red-500">
            <ShieldAlert className="w-6 h-6 md:w-7 md:h-7" />
            <h2 className="text-lg md:text-2xl font-bold text-gray-800 dark:text-gray-100 truncate">Network Risk Scoring</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors dark:text-gray-300"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto flex flex-col custom-scrollbar">
          
          {/* Top Panel: Mapping */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex-none">
            <div className="flex items-center gap-2 mb-4 md:mb-6 text-gray-700 dark:text-gray-200">
              <Settings2 size={20} className="text-blue-500 flex-none" />
              <h3 className="text-lg font-semibold">Network Parameter Mapping</h3>
            </div>
            
            <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
              <label className="block text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Base Network Layer (Target)</label>
              <select
                className="w-full border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg px-3 py-2 border focus:ring-2 focus:ring-blue-500 outline-none"
                value={baseLayerId}
                onChange={(e) => setBaseLayerId(e.target.value)}
              >
                <option value="">-- Select Base Network Layer --</option>
                {layers.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-3 md:space-y-4">
              <div className="grid grid-cols-12 gap-2 md:gap-4 px-1 md:px-2 mb-1 md:mb-2 text-[10px] md:text-sm font-semibold text-gray-500 dark:text-gray-400">
                <div className="col-span-4">Risk Parameter</div>
                <div className="col-span-4">Shapefile Layer</div>
                <div className="col-span-4">Attribute Column</div>
              </div>
              
              {PARAMETERS.map((param) => {
                const selectedLayerId = mappings[param.name]?.layerId || "none";
                const fields = selectedLayerId !== "none" ? getAttributeFields(selectedLayerId) : [];
                
                return (
                  <div key={param.name} className="grid grid-cols-12 gap-2 md:gap-4 items-center bg-gray-50 dark:bg-gray-800/40 p-2 rounded-lg border border-gray-100 dark:border-gray-700/50">
                    <div className="col-span-4 text-[10px] md:text-sm font-medium text-gray-700 dark:text-gray-200 pl-1 md:pl-2">
                      {param.name} <span className="text-gray-400">({param.weight}%)</span>
                    </div>
                    <div className="col-span-4">
                      <select
                        className="w-full text-[10px] md:text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-md px-1 md:px-2 py-1 md:py-1.5 border outline-none focus:border-blue-500"
                        value={selectedLayerId}
                        onChange={(e) => handleMappingChange(param.name, "layerId", e.target.value)}
                      >
                        <option value="none">None</option>
                        {layers.map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <select
                        className="w-full text-[10px] md:text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-md px-1 md:px-2 py-1 md:py-1.5 border outline-none focus:border-blue-500"
                        value={mappings[param.name]?.column || "none"}
                        onChange={(e) => handleMappingChange(param.name, "column", e.target.value)}
                        disabled={selectedLayerId === "none"}
                      >
                        <option value="none">None</option>
                        {fields.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {error && <div className="mt-6 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">{error}</div>}
            
            <button
              onClick={handleCalculate}
              disabled={isCalculating}
              className="mt-6 w-full py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl font-bold shadow-md shadow-red-500/30 transition-all flex justify-center items-center gap-2 disabled:opacity-70"
            >
              {isCalculating ? (
                <><Loader2 className="animate-spin" size={20} /> Analyzing...</>
              ) : (
                "Calculate Risk Score"
              )}
            </button>
            
          </div>

          {/* Bottom Panel: Results */}
          <div className="flex-none bg-gray-50 dark:bg-gray-800/30 p-4">
            
            <div className="flex items-center gap-2 mb-4 md:mb-6 text-gray-700 dark:text-gray-200">
              <BarChart3 size={20} className="text-indigo-500 flex-none" />
              <h3 className="text-lg font-semibold">Risk Matrix & Results</h3>
            </div>

            <table className="w-full text-sm text-left mb-8 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg overflow-hidden">
              <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-3 py-2">Risk Score</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                <tr>
                  <td className="px-3 py-2 font-mono">4.0 - 5.0</td>
                  <td className="px-3 py-2 text-red-600 font-bold">High Risk</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">Immediate intervention</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono">3.0 - 3.9</td>
                  <td className="px-3 py-2 text-orange-500 font-bold">Medium Risk</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">Planned maintenance</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono">2.0 - 2.9</td>
                  <td className="px-3 py-2 text-yellow-500 font-bold">Low Risk</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">Routine monitoring</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono">&lt; 2.0</td>
                  <td className="px-3 py-2 text-green-500 font-bold">Very Low</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">No action required</td>
                </tr>
              </tbody>
            </table>

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-5 pb-2 border-b border-gray-100 dark:border-gray-800">
                Analysis Summary
              </h4>
              
              {resultSummary && resultSummary.total > 0 && (
                <div className="relative w-40 h-40 mx-auto mb-8">
                  <svg width="100%" height="100%" viewBox="0 0 40 40" className="transform -rotate-90">
                    {/* Background Track */}
                    <circle r="15.91549430918954" cx="20" cy="20" fill="transparent" stroke="currentColor" strokeWidth="4" className="text-gray-100 dark:text-gray-800/40" />
                    
                    {/* Inner glowing track */}
                    <circle r="15.91549430918954" cx="20" cy="20" fill="transparent" stroke="currentColor" strokeWidth="0.5" className="text-gray-300 dark:text-gray-700/50" />

                    {[
                      { value: resultSummary.veryLow, color: "#22c55e" },
                      { value: resultSummary.low, color: "#eab308" },
                      { value: resultSummary.medium, color: "#f97316" },
                      { value: resultSummary.high, color: "#ef4444" },
                    ].reduce((acc, item, i) => {
                      const percentage = (item.value / resultSummary.total) * 100;
                      if (percentage === 0) return acc;
                      
                      // Add a crisp 1% gap between slices if there are multiple slices
                      const gap = percentage < 100 ? 1 : 0;
                      const drawLength = Math.max(0, percentage - gap);
                      const strokeDasharray = `${drawLength} ${100 - drawLength}`;
                      
                      // Use positive offset
                      const offset = 100 - acc.cumulative;
                      acc.cumulative += percentage;
                      
                      acc.elements.push(
                        <circle
                          key={i}
                          r="15.91549430918954"
                          cx="20"
                          cy="20"
                          fill="transparent"
                          stroke={item.color}
                          strokeWidth="6"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={offset}
                          className="transition-all duration-1000 ease-out"
                        />
                      );
                      return acc;
                    }, { cumulative: 0, elements: [] as React.ReactNode[] }).elements}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black text-gray-800 dark:text-gray-50 tracking-tighter drop-shadow-sm">{resultSummary.total}</span>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mt-1">Assets</span>
                  </div>
                </div>
              )}
              
              <div className="text-sm space-y-4">
                <div className="flex justify-between items-center text-base font-semibold mb-6">
                  <span className="text-gray-600 dark:text-gray-400">Total Evaluated Assets:</span>
                  <span className="text-gray-900 dark:text-gray-100">{resultSummary?.total || 0}</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-green-500 flex-none shadow-sm shadow-green-500/50"></div>
                  <span className="flex-1 font-medium text-gray-700 dark:text-gray-300">Very Low Risk</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                    {resultSummary?.veryLow || 0} 
                    <span className="text-xs text-gray-500 ml-1 font-normal">
                      ({resultSummary && resultSummary.total > 0 ? ((resultSummary.veryLow / resultSummary.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-yellow-400 flex-none shadow-sm shadow-yellow-500/50"></div>
                  <span className="flex-1 font-medium text-gray-700 dark:text-gray-300">Low Risk</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                    {resultSummary?.low || 0}
                    <span className="text-xs text-gray-500 ml-1 font-normal">
                      ({resultSummary && resultSummary.total > 0 ? ((resultSummary.low / resultSummary.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-orange-500 flex-none shadow-sm shadow-orange-500/50"></div>
                  <span className="flex-1 font-medium text-gray-700 dark:text-gray-300">Medium Risk</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                    {resultSummary?.medium || 0}
                    <span className="text-xs text-gray-500 ml-1 font-normal">
                      ({resultSummary && resultSummary.total > 0 ? ((resultSummary.medium / resultSummary.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-red-500 flex-none shadow-sm shadow-red-500/50 animate-pulse"></div>
                  <span className="flex-1 font-medium text-gray-700 dark:text-gray-300">High Risk</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                    {resultSummary?.high || 0}
                    <span className="text-xs text-gray-500 ml-1 font-normal">
                      ({resultSummary && resultSummary.total > 0 ? ((resultSummary.high / resultSummary.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </span>
                </div>
              </div>
              
              {resultSummary && resultSummary.highRiskFeatures.length > 0 && (
                <div className="mt-6 border-t border-gray-100 dark:border-gray-800 pt-5">
                  <h5 className="font-semibold text-red-600 dark:text-red-500 mb-3 flex items-center gap-2">
                    <ShieldAlert size={16} /> Highest Risk Assets (Top 50)
                  </h5>
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {resultSummary.highRiskFeatures.map((f, idx) => {
                      const props = f.properties;
                      // Fallback name logic
                      const name = props.LABEL || props.Label || props.label || props.name || props.Name || props.NAME || props.id || props.ID || `Asset #${idx + 1}`;
                      const score = Number(props.Total_Risk_Score).toFixed(2);
                      const cat = props.Risk_Category;
                      
                      let bgClass = "bg-gray-50 dark:bg-gray-800 border-gray-200 text-gray-700";
                      if (cat === "High Risk") bgClass = "bg-red-50 dark:bg-red-900/20 text-red-800 border-red-100";
                      else if (cat === "Medium Risk") bgClass = "bg-orange-50 dark:bg-orange-900/20 text-orange-800 border-orange-100";
                      else if (cat === "Low Risk") bgClass = "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 border-yellow-100";
                      
                      return (
                        <div 
                          key={idx}
                          onClick={() => {
                            const coords = f.geometry.coordinates;
                            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                            const processCoords = (arr: any) => {
                              if (typeof arr[0] === 'number') {
                                minX = Math.min(minX, arr[0]);
                                minY = Math.min(minY, arr[1]);
                                maxX = Math.max(maxX, arr[0]);
                                maxY = Math.max(maxY, arr[1]);
                              } else {
                                arr.forEach(processCoords);
                              }
                            };
                            processCoords(coords);
                            
                            // Emit zoom event
                            window.dispatchEvent(new CustomEvent('zoom-to-bounds', { detail: [minX, minY, maxX, maxY] }));
                            // Close modal to see the map
                            onClose();
                          }}
                          className={`p-3 text-sm rounded-lg border cursor-pointer hover:opacity-80 transition-opacity flex justify-between items-center ${bgClass}`}
                        >
                          <span className="font-medium truncate pr-2" title={name}>{name}</span>
                          <span className="text-xs font-mono bg-white/50 dark:bg-black/20 px-2 py-1 rounded flex-none shadow-sm">
                            Score: {score}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
            
          </div>

        </div>
      </div>
    </div>
  );
}
