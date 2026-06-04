"use client";

import React, { useState, useMemo } from 'react';
import { useMapStore } from '../store/mapStore';
import { X, ChevronLeft, ChevronRight, Hash } from 'lucide-react';

export default function AttributeTable() {
  const { layers, activeAttributeLayerId, setActiveAttributeLayerId } = useMapStore();
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 50;

  const activeLayer = useMemo(() => {
    return layers.find((l) => l.id === activeAttributeLayerId);
  }, [layers, activeAttributeLayerId]);

  const features = activeLayer?.data?.features || [];

  const columns = useMemo(() => {
    if (features.length === 0) return [];
    // Extract unique keys from the first few features to build columns
    const keys = new Set<string>();
    for (let i = 0; i < Math.min(features.length, 100); i++) {
      if (features[i].properties) {
        Object.keys(features[i].properties).forEach(k => keys.add(k));
      }
    }
    return Array.from(keys);
  }, [features]);

  if (!activeLayer) return null;

  const totalPages = Math.ceil(features.length / rowsPerPage);
  const currentFeatures = features.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col border border-gray-200 dark:border-gray-800">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 rounded-t-xl">
          <div className="flex items-center gap-2 text-gray-800 dark:text-gray-100">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: activeLayer.color }} />
            <h2 className="text-lg font-semibold truncate max-w-lg">{activeLayer.name} - Attribute Table</h2>
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Hash size={12} /> {features.length.toLocaleString()} features
            </span>
          </div>
          <button 
            onClick={() => setActiveAttributeLayerId(null)}
            className="p-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/90 whitespace-nowrap">
                  # ID
                </th>
                {columns.map((col) => (
                  <th 
                    key={col} 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/90 whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {currentFeatures.map((feature: any, idx: number) => {
                const absoluteIndex = (currentPage - 1) * rowsPerPage + idx + 1;
                return (
                  <tr key={absoluteIndex} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {absoluteIndex}
                    </td>
                    {columns.map(col => (
                      <td key={col} className="px-4 py-2 text-sm text-gray-800 dark:text-gray-300 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis">
                        {feature.properties?.[col] !== undefined && feature.properties?.[col] !== null 
                          ? String(feature.properties[col]) 
                          : <span className="text-gray-300 dark:text-gray-600 italic">null</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {currentFeatures.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No data available in this layer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 rounded-b-xl">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing <span className="font-medium text-gray-900 dark:text-gray-100">{((currentPage - 1) * rowsPerPage) + 1}</span> to <span className="font-medium text-gray-900 dark:text-gray-100">{Math.min(currentPage * rowsPerPage, features.length)}</span> of <span className="font-medium text-gray-900 dark:text-gray-100">{features.length}</span> results
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">
              Page {currentPage} of {Math.max(1, totalPages)}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-1 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
}
