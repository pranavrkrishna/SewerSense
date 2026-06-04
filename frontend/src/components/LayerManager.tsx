"use client";

import React, { useState, useEffect } from 'react';
import { useMapStore, MapLayer } from '../store/mapStore';
import { Upload, Eye, EyeOff, Trash2, Maximize, Palette, Map as MapIcon, Table, Info, GripVertical } from 'lucide-react';

export default function LayerManager() {
  const { 
    layers, 
    removeLayer, 
    toggleLayerVisibility, 
    setLayerSymbology, 
    setLayerLabelField,
    setLayerCloudField,
    baseMap, 
    setBaseMap,
    reorderLayer,
    setActiveAttributeLayerId
  } = useMapStore();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epsgOverride, setEpsgOverride] = useState("");
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);

  // Drag and Drop State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, layer: MapLayer } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setIsUploading(true);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    if (epsgOverride.trim() !== "") {
      formData.append("epsg_override", epsgOverride.trim());
    }

    try {
      const hostname = window.location.hostname;
      const response = await fetch(`http://${hostname}:8000/upload/shapefile`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Upload failed");
      }

      const data = await response.json();
      
      // We do not call addLayer locally anymore!
      // The backend will broadcast a "new_layer" WebSocket event 
      // which AppSync.tsx will pick up and add to the store automatically!
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const getAttributeFields = (layer: MapLayer) => {
    if (!layer.data || !layer.data.features || layer.data.features.length === 0) return [];
    return Object.keys(layer.data.features[0].properties || {});
  };

  const handleSymbologyChange = (layer: MapLayer, field: string) => {
    if (!field) {
      setLayerSymbology(layer.id, "", {});
      return;
    }
    
    // Get unique values for this field
    const uniqueValues = new Set<string>();
    layer.data.features.forEach((f: any) => {
      const val = f.properties?.[field];
      if (val !== undefined && val !== null) {
        uniqueValues.add(String(val));
      }
    });

    // Generate random color for each
    const symbologyMap: Record<string, string> = {};
    uniqueValues.forEach(val => {
      // Use predefined palette or random
      symbologyMap[val] = `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
    });

    const hostname = window.location.hostname;
    fetch(`http://${hostname}:8000/layers/${layer.id}/symbology`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbologyField: field, symbologyMap })
    }).catch(err => console.error("Failed to update symbology", err));

    // Optimistic local update
    setLayerSymbology(layer.id, field, symbologyMap);
  };

  const handleLabelChange = async (layer: MapLayer, field: string) => {
    setLayerLabelField(layer.id, field);
    try {
      const hostname = window.location.hostname;
      await fetch(`http://${hostname}:8000/layers/${layer.id}/label`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelField: field })
      });
    } catch (err) {
      console.error("Failed to update label on server:", err);
    }
  };

  const handleCloudChange = async (layer: MapLayer, field: string) => {
    setLayerCloudField(layer.id, field);
    try {
      const hostname = window.location.hostname;
      // Local UI state for now
    } catch (err) {
      console.error("Failed to update cloud on server:", err);
    }
  };

  const handleCloudColorChange = (layer: MapLayer, color: string) => {
    const { setLayerCloudColor } = useMapStore.getState();
    setLayerCloudColor(layer.id, color);
  };

  const handleDeleteLayer = async (id: string) => {
    const hostname = window.location.hostname;
    try {
      await fetch(`http://${hostname}:8000/layers/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to delete layer", err);
    }
    // Optimistic local removal
    removeLayer(id);
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Map Layers</h2>
        
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Force Coordinate System (Optional)
          </label>
          <input 
            type="text" 
            placeholder="e.g. 32643 for UTM Zone 43N" 
            className="w-full text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded outline-none px-3 py-2 border mb-3 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            value={epsgOverride}
            onChange={(e) => setEpsgOverride(e.target.value)}
          />

          <label className="block w-full cursor-pointer bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 py-2 px-4 rounded text-center transition-colors">
            <span className="flex items-center justify-center gap-2">
              <Upload size={18} />
              {isUploading ? "Uploading..." : "Upload Shapefile"}
            </span>
            <input 
              type="file" 
              multiple 
              accept=".shp,.shx,.dbf,.prj,.sbn,.sbx,.cpg,.xml" 
              className="hidden" 
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        <div className="mt-4 border-t border-gray-200 dark:border-gray-800 pt-4">
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            <MapIcon size={14} /> Base Map Style
          </label>
          <select
            className="w-full text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded outline-none px-3 py-2 border focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            value={baseMap}
            onChange={(e) => setBaseMap(e.target.value as any)}
          >
            <option value="theme">Default (Dark/Light Theme)</option>
            <option value="satellite">Satellite Imagery (ESRI)</option>
            <option value="osm">OpenStreetMap (Light)</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 relative">
        {layers.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm italic text-center mt-4">No layers loaded.</p>
        ) : (
          layers.map((layer, index) => {
            const fields = getAttributeFields(layer);
            const isExpanded = expandedLayerId === layer.id;
            const isDragging = draggedIndex === index;
            const isDropTarget = dropTargetIndex === index;
            
            return (
              <div 
                key={layer.id} 
                draggable
                onDragStart={(e) => {
                  setDraggedIndex(index);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTargetIndex(index);
                }}
                onDragLeave={() => setDropTargetIndex(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedIndex !== null && draggedIndex !== index) {
                    reorderLayer(draggedIndex, index);
                  }
                  setDraggedIndex(null);
                  setDropTargetIndex(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.pageX, y: e.pageY, layer });
                }}
                className={`bg-gray-50 dark:bg-gray-800/50 rounded-lg border overflow-hidden transition-all duration-200 cursor-context-menu
                  ${isDragging ? 'opacity-50 scale-95 shadow-none' : 'shadow-sm hover:shadow-md'}
                  ${isDropTarget ? (draggedIndex! < index ? 'border-b-2 border-b-blue-500 border-t-gray-200 dark:border-t-gray-700' : 'border-t-2 border-t-blue-500 border-b-gray-200 dark:border-b-gray-700') : 'border-gray-200 dark:border-gray-700'}
                `}
              >
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <GripVertical size={16} className="text-gray-400 cursor-grab active:cursor-grabbing flex-none hover:text-gray-600" />
                    <div 
                      className="w-4 h-4 rounded-full flex-none shadow-sm" 
                      style={{ backgroundColor: layer.color }}
                    />
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate pr-2" title={layer.name}>
                      {layer.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => toggleLayerVisibility(layer.id)}
                      className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                      title="Toggle Visibility"
                    >
                      {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button 
                      onClick={() => setExpandedLayerId(isExpanded ? null : layer.id)}
                      className={`p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors ${isExpanded ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'text-gray-500 dark:text-gray-400'}`}
                      title="Style by Attribute"
                    >
                      <Palette size={16} />
                    </button>
                    <button 
                      onClick={() => layer.bounds && window.dispatchEvent(new CustomEvent('zoom-to-bounds', { detail: layer.bounds }))}
                      className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                      title="Zoom to Layer"
                    >
                      <Maximize size={16} />
                    </button>
                    <button 
                      onClick={() => handleDeleteLayer(layer.id)}
                      className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                      title="Delete Layer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {isExpanded && fields.length > 0 && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Style by Attribute
                    </label>
                    <select
                      className="w-full text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded outline-none px-2 py-1 border focus:border-blue-500"
                      value={layer.symbologyField || ""}
                      onChange={(e) => handleSymbologyChange(layer, e.target.value)}
                    >
                      <option value="">-- Single Color --</option>
                      {fields.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>

                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mt-3 mb-1">
                      Label by Attribute
                    </label>
                    <select
                      className="w-full text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded outline-none px-2 py-1 border focus:border-blue-500"
                      value={layer.labelField || ""}
                      onChange={(e) => handleLabelChange(layer, e.target.value)}
                    >
                      <option value="">-- No Labels --</option>
                      {fields.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>

                    {layer.symbologyField && layer.symbologyMap && (
                      <div className="mt-3 space-y-1 max-h-32 overflow-y-auto pr-1">
                        {Object.entries(layer.symbologyMap).map(([val, col]) => (
                          <div key={val} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <div className="w-3 h-3 rounded-full flex-none shadow-sm" style={{ backgroundColor: col }} />
                            <span className="truncate" title={val}>{val}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Custom Context Menu */}
        {contextMenu && (
          <div 
            className="fixed bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg w-56 z-50 overflow-hidden py-1"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800 uppercase tracking-wider truncate">
              {contextMenu.layer.name}
            </div>
            <button 
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors"
              onClick={() => setActiveAttributeLayerId(contextMenu.layer.id)}
            >
              <Table size={16} className="text-blue-500" />
              View Attribute Table
            </button>
            <button 
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors"
              onClick={() => {
                const fields = getAttributeFields(contextMenu.layer).length;
                const features = contextMenu.layer.data?.features?.length || 0;
                alert(`Properties for ${contextMenu.layer.name}:\n\n- Features: ${features}\n- Attributes per feature: ${fields}\n- Geometry Type: ${contextMenu.layer.data?.features?.[0]?.geometry?.type || 'Unknown'}\n- Visible: ${contextMenu.layer.visible ? 'Yes' : 'No'}`);
              }}
            >
              <Info size={16} className="text-purple-500" />
              View Properties
            </button>
            <div className="border-t border-gray-100 dark:border-gray-800 my-1"></div>
            <button 
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors"
              onClick={() => setExpandedLayerId(contextMenu.layer.id === expandedLayerId ? null : contextMenu.layer.id)}
            >
              <Palette size={16} className="text-indigo-500" />
              {contextMenu.layer.id === expandedLayerId ? 'Hide Symbology' : 'Style by Attribute'}
            </button>
            <button 
              className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
              onClick={() => handleDeleteLayer(contextMenu.layer.id)}
            >
              <Trash2 size={16} />
              Remove Layer
            </button>
            <div className="border-t border-gray-100 dark:border-gray-800 my-1"></div>
            <div className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block uppercase tracking-wider">
                Floating Cloud Label
              </label>
              <select
                className="w-full text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md outline-none px-2 py-1.5 focus:border-blue-500 transition-colors cursor-pointer mb-2"
                value={contextMenu.layer.cloudField || ""}
                onChange={(e) => {
                  handleCloudChange(contextMenu.layer, e.target.value);
                  // Don't close so they can pick color!
                }}
              >
                <option value="">-- Off --</option>
                {getAttributeFields(contextMenu.layer).map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              {contextMenu.layer.cloudField && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-[10px] text-gray-500 font-medium">Text Color:</span>
                  <input
                    type="color"
                    className="w-8 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                    value={contextMenu.layer.cloudColor || "#2563eb"}
                    onChange={(e) => handleCloudColorChange(contextMenu.layer, e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
