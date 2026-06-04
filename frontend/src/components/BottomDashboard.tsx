"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRiskStore } from '../store/riskStore';
import { AlertTriangle, Crosshair, ChevronUp, ChevronDown } from 'lucide-react';

export default function BottomDashboard() {
  const { resultSummary } = useRiskStore();
  const [height, setHeight] = useState(250);
  const [leftWidth, setLeftWidth] = useState(350);
  const [isDraggingHeight, setIsDraggingHeight] = useState(false);
  const [isResizingCol, setIsResizingCol] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedAssetIdx, setExpandedAssetIdx] = useState<number | null>(null);
  
  const dragStart = useRef({ x: 0, y: 0, startWidth: 0, startHeight: 0 });

  useEffect(() => {
    const handleMouseMoveHeight = (e: MouseEvent) => {
      if (!isDraggingHeight) return;
      const deltaY = dragStart.current.y - e.clientY;
      setHeight(Math.max(150, Math.min(dragStart.current.startHeight + deltaY, 500)));
    };
    const handleMouseUpHeight = () => { setIsDraggingHeight(false); };

    if (isDraggingHeight) {
      window.addEventListener('mousemove', handleMouseMoveHeight);
      window.addEventListener('mouseup', handleMouseUpHeight);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveHeight);
      window.removeEventListener('mouseup', handleMouseUpHeight);
    };
  }, [isDraggingHeight]);

  useEffect(() => {
    const handleMouseMoveCol = (e: MouseEvent) => {
      if (!isResizingCol) return;
      const deltaX = e.clientX - dragStart.current.x;
      setLeftWidth(Math.max(200, Math.min(dragStart.current.startWidth + deltaX, window.innerWidth - 300)));
    };
    const handleMouseUpCol = () => { setIsResizingCol(false); };

    if (isResizingCol) {
      window.addEventListener('mousemove', handleMouseMoveCol);
      window.addEventListener('mouseup', handleMouseUpCol);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveCol);
      window.removeEventListener('mouseup', handleMouseUpCol);
    };
  }, [isResizingCol]);

  if (!resultSummary) return null;

  const avgScore = resultSummary.averageScore || 0;
  // Scale score from 0-5 to a 0-180 degree rotation for the speedometer
  const maxScore = 5;
  const rotation = (Math.min(avgScore, maxScore) / maxScore) * 180;
  
  // Determine color based on average score
  const getScoreColor = (score: number) => {
    if (score >= 4) return "#ef4444"; // Red
    if (score >= 3) return "#f97316"; // Orange
    if (score >= 2) return "#eab308"; // Yellow
    return "#22c55e"; // Green
  };

  const gaugeColor = getScoreColor(avgScore);

  return (
    <div 
      className={`relative z-30 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-[0_-4px_15px_rgba(0,0,0,0.05)] flex flex-col ${(!isDraggingHeight && !isResizingCol) ? 'transition-all duration-300' : ''}`}
      style={{ height: isCollapsed ? '40px' : `${height}px` }}
    >
      {/* Resizer Handle */}
      {!isCollapsed && (
        <div 
          className="absolute top-0 left-0 right-0 h-2 -mt-1 cursor-row-resize hover:bg-blue-500/50 z-50 flex items-center justify-center transition-colors"
          onMouseDown={(e) => { 
            e.preventDefault(); 
            dragStart.current = { ...dragStart.current, y: e.clientY, startHeight: height };
            setIsDraggingHeight(true); 
          }}
        >
          <div className="bg-gray-300 dark:bg-gray-700 h-1 w-12 rounded-full pointer-events-none" />
        </div>
      )}

      {/* Header bar (always visible) */}
      <div className="h-10 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 bg-gray-50 dark:bg-gray-800 flex-none cursor-pointer"
           onClick={() => setIsCollapsed(!isCollapsed)}>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <AlertTriangle size={16} className={avgScore > 3 ? "text-red-500" : "text-gray-500"} /> 
          System Risk Dashboard
        </span>
        <button className="p-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors">
          {isCollapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Main Content */}
      {!isCollapsed && (
        <div className="flex-1 flex overflow-hidden">
          
          {/* Speedometer Gauge Column */}
          <div 
            className="flex flex-col items-center justify-center p-4"
            style={{ width: `${leftWidth}px`, flexShrink: 0 }}
          >
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Network Average Risk</div>
            
            <div className="relative w-48 h-24 overflow-visible mt-4 mb-6">
              {/* Background Arc */}
              <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible">
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" className="text-gray-200 dark:text-gray-800" />
                
                {/* Foreground Arc (The Masked Colored Arc) */}
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={gaugeColor} strokeWidth="15" strokeLinecap="round" 
                      strokeDasharray="125.66" 
                      strokeDashoffset={125.66 - (125.66 * (rotation / 180))} 
                      className="transition-all duration-1000 ease-out" />
              </svg>
              
              {/* Score Text */}
              <div className="absolute bottom-0 left-0 right-0 text-center flex flex-col items-center translate-y-6">
                <span className="text-3xl font-black leading-none" style={{ color: gaugeColor }}>{avgScore.toFixed(2)}</span>
                <span className="text-xs text-gray-400 font-medium">/ 5.00</span>
              </div>
            </div>
            
            {/* Network Averages Bars */}
            <div className="w-full mt-2 mb-4 space-y-4 px-4 sm:px-8">
              {Object.entries(resultSummary.parameterAverages || {}).map(([param, avg]) => {
                const barColor = getScoreColor(avg);
                return (
                <div key={param} className="space-y-1.5 group">
                  <div className="flex justify-between text-[10px] sm:text-xs font-bold tracking-wide">
                    <span className="truncate pr-2 text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200 transition-colors">{param}</span>
                    <span className="flex-none font-mono" style={{ color: barColor }}>
                      {avg.toFixed(1)} <span className="text-gray-400 dark:text-gray-600 font-normal">/ 5.0</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-800/80 rounded-full overflow-hidden shadow-inner relative">
                    <div 
                      className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-1000 bg-gradient-to-r from-transparent" 
                      style={{ 
                        width: `${(avg / 5) * 100}%`, 
                        backgroundColor: barColor,
                        boxShadow: `0 0 10px ${barColor}60`
                      }}
                    >
                      <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-white/0 via-white/20 to-white/0" style={{ transform: 'translateX(-100%)', animation: 'shimmer 2s infinite' }} />
                    </div>
                  </div>
                </div>
              )})}
            </div>
          </div>

          {/* Vertical Resizer */}
          <div 
            className="w-2 cursor-col-resize hover:bg-blue-500/50 flex-none z-10 flex items-center justify-center transition-colors border-l border-r border-transparent dark:border-gray-800 border-x-gray-200"
            onMouseDown={(e) => { 
              e.preventDefault(); 
              dragStart.current = { ...dragStart.current, x: e.clientX, startWidth: leftWidth };
              setIsResizingCol(true); 
            }}
          >
            <div className="bg-gray-300 dark:bg-gray-600 w-0.5 h-8 rounded-full pointer-events-none" />
          </div>

          {/* High Risk Assets List Column */}
          <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/50 dark:bg-gray-800/10 min-w-0">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 flex-none">
              <span className="text-sm font-bold text-red-600 dark:text-red-500 flex items-center gap-2">
                <AlertTriangle size={16} /> Critical Assets
              </span>
              <span className="text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
                {resultSummary.highRiskFeatures.length} At Risk
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2">
              {resultSummary.highRiskFeatures.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 italic">
                  No high risk assets detected.
                </div>
              ) : (
                resultSummary.highRiskFeatures.slice(0, 5).map((f, idx) => {
                  const props = f.properties;
                  const name = props.LABEL || props.Label || props.label || props.name || props.Name || props.NAME || props.id || props.ID || `Asset #${idx + 1}`;
                  const score = Number(props.Total_Risk_Score).toFixed(2);
                  
                  return (
                    <div 
                      key={idx}
                      onClick={() => setExpandedAssetIdx(expandedAssetIdx === idx ? null : idx)}
                      className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-red-100 dark:border-red-900/30 shadow-sm cursor-pointer hover:shadow-md hover:border-red-300 dark:hover:border-red-700 transition-all flex flex-col"
                    >
                      <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-500 flex-none group-hover:scale-110 transition-transform">
                            <AlertTriangle size={14} />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{name}</span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate">{props.Risk_Category}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4 flex-none ml-2">
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-bold text-red-600 dark:text-red-400">{score}</span>
                            <span className="text-[10px] text-gray-400">Score</span>
                          </div>
                          <div className="text-gray-400 group-hover:text-blue-500 transition-colors hidden sm:block">
                            {expandedAssetIdx === idx ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Breakdown */}
                      {expandedAssetIdx === idx && (
                        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3 animate-in slide-in-from-top-2">
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Risk Factor Breakdown</h4>
                          {Object.keys(props)
                            .filter(k => k.startsWith('RiskParam_'))
                            .map(k => {
                              const paramName = k.replace('RiskParam_', '');
                              const paramScore = props[k] || 0;
                              const barColor = getScoreColor(paramScore);
                              return (
                                <div key={k} className="flex items-center gap-3 group/item">
                                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 group-hover/item:text-gray-800 dark:group-hover/item:text-gray-200 w-24 truncate transition-colors">{paramName}</span>
                                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800/80 rounded-full overflow-hidden shadow-inner relative">
                                    <div 
                                      className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-1000" 
                                      style={{ 
                                        width: `${(paramScore / 5) * 100}%`, 
                                        backgroundColor: barColor,
                                        boxShadow: `0 0 8px ${barColor}60`
                                      }}
                                    ></div>
                                  </div>
                                  <span className="text-[10px] font-mono font-bold w-8 text-right" style={{ color: barColor }}>{Number(paramScore).toFixed(1)}</span>
                                </div>
                              );
                          })}
                          
                          <button 
                            className="mt-3 w-full py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
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
                              window.dispatchEvent(new CustomEvent('zoom-to-bounds', { detail: [minX, minY, maxX, maxY] }));
                            }}
                          >
                             <Crosshair size={14} /> Zoom to Map
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}
