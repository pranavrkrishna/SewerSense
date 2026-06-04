// State
let layers = [];
let mappings = {};
let riskSummary = null;

let sensorMapLayerId = "";
let sensorMapFeatureId = "";
let sensorMapLimit = null;
let sensorMapEnabled = false;
let sensorMapPopup = null;

const PARAMETERS = [
    { name: "d/D Ratio", weight: 25 },
    { name: "Depth of Sewer", weight: 10 },
    { name: "Historical Flooding", weight: 20 },
    { name: "Flow Condition", weight: 15 },
    { name: "Solid Deposition/Vel.", weight: 10 },
    { name: "Iot Sensor Alerts" , weight: 20 },
];

// Map Initialization
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [78.9629, 20.5937], // Default India
    zoom: 4,
    attributionControl: false
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');

map.on('load', async () => {
    await fetchLayers();
    setupWebsocket();
});

map.on('style.load', () => {
    // When the base map style changes, re-render all our custom layers
    if (layers && layers.length > 0) {
        // Small delay ensures MapLibre has fully flushed the old style buffers
        setTimeout(() => {
            if (map.isStyleLoaded()) {
                renderMapLayers();
            } else {
                map.once('idle', renderMapLayers);
            }
        }, 50);
    }
});

window.changeMapStyle = function(theme) {
    let styleUrl = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    if (theme === 'light') {
        styleUrl = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
    } else if (theme === 'satellite') {
        styleUrl = {
            "version": 8,
            "glyphs": "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/fonts/{fontstack}/{range}.pbf",
            "sources": {
                "satellite-source": {
                    "type": "raster",
                    "tiles": ["https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"],
                    "tileSize": 256
                }
            },
            "layers": [{
                "id": "satellite-layer",
                "type": "raster",
                "source": "satellite-source",
                "minzoom": 0,
                "maxzoom": 22
            }]
        };
    }
    map.setStyle(styleUrl);
};

async function fetchLayers() {
    try {
        const res = await fetch('/layers');
        layers = await res.json();
        renderMapLayers();
        renderLayerList();
        renderRiskUI();
        renderMappingUI();
    } catch (e) {
        console.error("Error fetching layers:", e);
    }
}

// Upload shapefile
async function uploadShapefile(event) {
    try {
        const files = event.target.files;
        if (!files || !files.length) return;

        const btnText = document.getElementById('upload-text');
        const originalText = btnText.innerHTML;
        btnText.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-[18px] h-[18px]"></i> Uploading...';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append("files", files[i]);
        }
        
        const epsgInput = document.getElementById('epsg-override');
        if (epsgInput && epsgInput.value.trim() !== '') {
            formData.append("epsg_override", epsgInput.value.trim());
        }

        const res = await fetch('/upload/shapefile', {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            const newLayer = await res.json();
            // Server broadcasts via websocket too, but we can do optimistic update
            if (!layers.some(l => l.id === newLayer.id)) {
                layers.push(newLayer);
                
                // Zoom to bounds
                if (newLayer.bounds && newLayer.bounds.length === 4) {
                    map.fitBounds(newLayer.bounds, { padding: 50, maxZoom: 16 });
                }

                renderMapLayers();
                renderLayerList();
                renderRiskUI();
            }
        } else {
            const err = await res.json();
            alert("Upload failed: " + (err.detail || "Unknown error from server"));
        }
        
        btnText.innerHTML = originalText;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        console.error("Upload Error:", e);
        alert("Upload Error: " + e.message);
    } finally {
        if (event.target) event.target.value = '';
    }
}

function getColorExpression(layer) {
    if (!layer.symbologyField || !layer.symbologyMap || Object.keys(layer.symbologyMap).length === 0) {
        return layer.color || '#3b82f6';
    }
    const matchExpr = ['match', ['to-string', ['get', layer.symbologyField]]];
    for (const [val, col] of Object.entries(layer.symbologyMap)) {
        matchExpr.push(val, col);
    }
    matchExpr.push(layer.color || '#3b82f6'); // default
    return matchExpr;
}

function renderMapLayers() {
    if (!map.getStyle() || !map.getStyle().sources) return;

    // 1. Identify active layers
    const activeLayers = (layers || []).filter(l => l.visible);
    const activeLayerIds = activeLayers.map(l => l.id);

    // 2. Safely remove layers/sources that are NO LONGER active or were deleted
    const currentSources = map.getStyle().sources;
    Object.keys(currentSources).forEach(id => {
        if (id.startsWith('layer-') || id === 'risk-results') {
            if (!activeLayerIds.includes(id)) {
                if (map.getLayer(id + '-fill')) map.removeLayer(id + '-fill');
                if (map.getLayer(id + '-line')) map.removeLayer(id + '-line');
                if (map.getLayer(id + '-circle')) map.removeLayer(id + '-circle');
                if (map.getLayer(id + '-label')) map.removeLayer(id + '-label');
                if (map.getLayer(id + '-cloud')) map.removeLayer(id + '-cloud');
                if (map.getSource(id)) map.removeSource(id);
            }
        }
    });

    // 3. Add or update active layers (reversed so top of UI is rendered last/on top)
    const reversedLayers = [...activeLayers].reverse();

    reversedLayers.forEach(layer => {
        const colorExpr = getColorExpression(layer);

        // If source already exists, just update its data seamlessly!
        if (map.getSource(layer.id)) {
            map.getSource(layer.id).setData(layer.data);
            
            // Optionally update paint properties in case colors changed
            if (map.getLayer(layer.id + '-fill')) map.setPaintProperty(layer.id + '-fill', 'fill-color', colorExpr);
            if (map.getLayer(layer.id + '-line')) map.setPaintProperty(layer.id + '-line', 'line-color', colorExpr);
            if (map.getLayer(layer.id + '-circle')) map.setPaintProperty(layer.id + '-circle', 'circle-color', colorExpr);
            return; // Skip adding layers below
        }

        // Source doesn't exist yet, build from scratch
        map.addSource(layer.id, {
            type: 'geojson',
            data: layer.data
        });

        // Fill
        map.addLayer({
            id: layer.id + '-fill',
            type: 'fill',
            source: layer.id,
            filter: ['==', '$type', 'Polygon'],
            paint: {
                'fill-color': colorExpr,
                'fill-opacity': 0.6
            }
        });

        // Line
        map.addLayer({
            id: layer.id + '-line',
            type: 'line',
            source: layer.id,
            filter: ['==', '$type', 'LineString'],
            paint: {
                'line-color': colorExpr,
                'line-width': 3
            }
        });

        // Circle
        map.addLayer({
            id: layer.id + '-circle',
            type: 'circle',
            source: layer.id,
            filter: ['==', '$type', 'Point'],
            paint: {
                'circle-color': colorExpr,
                'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    10, 2, 14, 4, 18, 8
                ],
                'circle-stroke-width': [
                    'interpolate', ['linear'], ['zoom'],
                    13, 0, 15, 1.5
                ],
                'circle-stroke-color': '#ffffff'
            }
        });

        // Normal Labels
        if (layer.labelField) {
            map.addLayer({
                id: layer.id + '-label',
                type: 'symbol',
                source: layer.id,
                minzoom: 14.5,
                layout: {
                    'text-field': ['to-string', ['get', layer.labelField]],
                    'text-size': [
                        'interpolate', ['linear'], ['zoom'],
                        14.5, 10, 22, 16
                    ],
                    'text-allow-overlap': false,
                    'text-anchor': 'top',
                    'text-offset': [0, 0.5]
                },
                paint: {
                    'text-color': '#94a3b8',
                    'text-halo-color': 'rgba(15, 23, 42, 0.9)',
                    'text-halo-width': 1.5,
                    'text-halo-blur': 0.5
                }
            });
        }

        // Cloud Labels
        if (layer.cloudField) {
            map.addLayer({
                id: layer.id + '-cloud',
                type: 'symbol',
                source: layer.id,
                minzoom: 13,
                layout: {
                    'text-field': ['upcase', ['to-string', ['get', layer.cloudField]]],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': [
                        'interpolate', ['linear'], ['zoom'],
                        13, 10, 22, 16
                    ],
                    'text-allow-overlap': true,
                    'text-ignore-placement': true,
                    'text-anchor': 'bottom',
                    'text-offset': [0, -0.8],
                    'text-letter-spacing': 0.05
                },
                paint: {
                    'text-color': layer.cloudColor || '#60a5fa',
                    'text-halo-color': 'rgba(15, 23, 42, 0.95)',
                    'text-halo-width': 2,
                    'text-halo-blur': 1,
                }
            });
        }
    });
}

function getAttributeFields(layer) {
    if (!layer || !layer.data || !layer.data.features || !layer.data.features.length) return [];
    return Object.keys(layer.data.features[0].properties || {});
}

async function deleteLayer(id) {
    try {
        await fetch(`/layers/${id}`, { method: 'DELETE' });
        layers = layers.filter(l => l.id !== id);
        renderMapLayers();
        renderLayerList();
        renderRiskUI();
    } catch (e) {
        console.error("Error deleting", e);
    }
}

function zoomToLayer(id) {
    const layer = layers.find(l => l.id === id);
    if (layer && layer.bounds && layer.bounds.length === 4) {
        map.fitBounds(layer.bounds, { padding: 50, maxZoom: 16 });
    }
}

function toggleVisibility(id) {
    const layer = layers.find(l => l.id === id);
    if (layer) {
        layer.visible = !layer.visible;
        renderMapLayers();
        renderLayerList();
    }
}

// Global set to keep track of which layers have their legends expanded
const expandedLayers = new Set();

function toggleLegend(id) {
    const el = document.getElementById(`legend-${id}`);
    if (!el || el.innerHTML.trim() === '') return;
    if (expandedLayers.has(id)) {
        expandedLayers.delete(id);
        el.classList.add('hidden');
    } else {
        expandedLayers.add(id);
        el.classList.remove('hidden');
    }
}

function generateLegendHTML(layer) {
    if (!layer.symbologyField || !layer.symbologyMap || Object.keys(layer.symbologyMap).length === 0) {
        return '';
    }
    let html = `<div class="text-slate-400 mb-2 font-medium">Color By: <span class="text-slate-200">${layer.symbologyField}</span></div>`;
    html += `<div class="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">`;
    for (const [val, color] of Object.entries(layer.symbologyMap)) {
        html += `
            <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded flex-shrink-0" style="background-color: ${color}"></div>
                <span class="text-slate-300 truncate" title="${val}">${val}</span>
            </div>
        `;
    }
    html += `</div>`;
    return html;
}

// Render Layer Manager
function renderLayerList() {
    const container = document.getElementById('layer-list');
    container.innerHTML = '';

    layers.forEach(layer => {
        const item = document.createElement('div');
        // Added oncontextmenu styling to trigger context menu on right click
        item.className = 'bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 relative cursor-pointer hover:bg-slate-800 transition-colors shadow-sm';
        item.oncontextmenu = (e) => showContextMenu(e, layer.id, item);
        item.onclick = (e) => {
            // Prevent toggling if they clicked a button inside
            if (e.target.closest('button')) return;
            toggleLegend(layer.id);
        };
        
        // Drag and drop for reordering
        item.draggable = true;
        item.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', layer.id);
            item.classList.add('opacity-50');
        };
        item.ondragend = (e) => {
            item.classList.remove('opacity-50');
        };
        item.ondragover = (e) => {
            e.preventDefault();
            item.classList.add('border-blue-500');
        };
        item.ondragleave = (e) => {
            item.classList.remove('border-blue-500');
        };
        item.ondrop = (e) => {
            e.preventDefault();
            item.classList.remove('border-blue-500');
            const sourceId = e.dataTransfer.getData('text/plain');
            if (sourceId && sourceId !== layer.id) {
                const sourceIdx = layers.findIndex(l => l.id === sourceId);
                const targetIdx = layers.findIndex(l => l.id === layer.id);
                if (sourceIdx !== -1 && targetIdx !== -1) {
                    const [moved] = layers.splice(sourceIdx, 1);
                    layers.splice(targetIdx, 0, moved);
                    renderMapLayers();
                    renderLayerList();
                }
            }
        };
        
        const visIcon = layer.visible ? 'eye' : 'eye-off';
        const visColor = layer.visible ? 'text-blue-400' : 'text-slate-500';

        item.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 overflow-hidden pointer-events-none">
                    <div class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${layer.color}"></div>
                    <span class="text-sm font-medium truncate text-gray-200">${layer.name}</span>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="event.stopPropagation(); toggleVisibility('${layer.id}')" class="p-1 rounded hover:bg-slate-700 ${visColor} transition-colors">
                        <i data-lucide="${visIcon}" class="w-4 h-4"></i>
                    </button>
                    <button onclick="zoomToLayer('${layer.id}')" class="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title="Zoom to layer">
                        <i data-lucide="maximize" class="w-4 h-4 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400"></i>
                    </button>
                    <button onclick="event.stopPropagation(); deleteLayer('${layer.id}')" class="p-1 rounded text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors" title="Remove Layer">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
            <div id="legend-${layer.id}" class="${expandedLayers.has(layer.id) ? '' : 'hidden'} mt-3 pt-3 border-t border-slate-700/50 text-xs">
                ${generateLegendHTML(layer)}
            </div>
        `;
        container.appendChild(item);
    });

    lucide.createIcons();
}

// Global state for context menu
let currentContextMenuLayerId = null;

// Hide menu when clicking outside
document.addEventListener('click', () => {
    const menu = document.getElementById('layer-context-menu');
    if (menu) menu.classList.add('hidden');
});

function showContextMenu(e, layerId, targetEl) {
    e.stopPropagation();
    e.preventDefault();
    const menu = document.getElementById('layer-context-menu');
    currentContextMenuLayerId = layerId;
    
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;

    // Populate dropdowns
    const fields = getAttributeFields(layer);
    let options = '<option value="">-- Off --</option>';
    fields.forEach(f => {
        options += `<option value="${f}">${f}</option>`;
    });

    const symEl = document.getElementById('ctx-symbology');
    const lblEl = document.getElementById('ctx-label');
    const cldEl = document.getElementById('ctx-cloud');
    const cldColEl = document.getElementById('ctx-cloud-color-container');

    symEl.innerHTML = options;
    lblEl.innerHTML = options;
    cldEl.innerHTML = options;

    symEl.value = layer.symbologyField || "";
    lblEl.value = layer.labelField || "";
    cldEl.value = layer.cloudField || "";
    
    if (layer.cloudField) {
        cldColEl.classList.remove('hidden');
        document.getElementById('ctx-cloud-color').value = layer.cloudColor || "#60a5fa";
    } else {
        cldColEl.classList.add('hidden');
    }

    // Position menu to the right of the layer item
    menu.classList.remove('hidden');
    
    const menuRect = menu.getBoundingClientRect();
    const targetRect = targetEl ? targetEl.getBoundingClientRect() : { right: e.clientX, top: e.clientY, left: e.clientX };
    
    let left = targetRect.right + 10;
    let top = targetRect.top;
    
    if (left + menuRect.width > window.innerWidth) left = targetRect.left - menuRect.width - 10;
    if (top + menuRect.height > window.innerHeight) top = window.innerHeight - menuRect.height - 10;
    
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

// Bind context menu inputs (runs once)
document.addEventListener('DOMContentLoaded', () => {
    const menu = document.getElementById('layer-context-menu');
    if(menu) {
        document.getElementById('ctx-symbology').addEventListener('change', (e) => updateSymbology(currentContextMenuLayerId, e.target.value));
        document.getElementById('ctx-label').addEventListener('change', (e) => updateLabel(currentContextMenuLayerId, e.target.value));
        document.getElementById('ctx-cloud').addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) document.getElementById('ctx-cloud-color-container').classList.remove('hidden');
            else document.getElementById('ctx-cloud-color-container').classList.add('hidden');
            updateCloud(currentContextMenuLayerId, val);
        });
        document.getElementById('ctx-cloud-color').addEventListener('input', (e) => updateCloudColor(currentContextMenuLayerId, e.target.value));
    }
});

async function updateSymbology(layerId, field) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    
    if (!field) {
        layer.symbologyField = "";
        layer.symbologyMap = {};
    } else {
        const uniqueValues = new Set();
        layer.data.features.forEach(f => {
            const val = f.properties[field];
            if (val !== undefined && val !== null) uniqueValues.add(String(val));
        });
        const symbologyMap = {};
        uniqueValues.forEach(val => {
            symbologyMap[val] = `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
        });
        layer.symbologyField = field;
        layer.symbologyMap = symbologyMap;
        
        // Auto-expand the legend if symbology was just set
        expandedLayers.add(layerId);
        
        fetch(`/layers/${layerId}/symbology`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbologyField: field, symbologyMap })
        }).catch(e => console.error(e));
    }
    renderMapLayers();
    renderLayerList();
}

function updateCloudColor(layerId, color) {
    const layer = layers.find(l => l.id === layerId);
    if (layer) {
        layer.cloudColor = color;
        renderMapLayers();
    }
}

async function updateLabel(layerId, field) {
    const layer = layers.find(l => l.id === layerId);
    if (layer) {
        layer.labelField = field;
        renderMapLayers();
        try {
            await fetch(`/layers/${layerId}/label`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ labelField: field })
            });
        } catch(e) {}
    }
}

async function updateCloud(layerId, field) {
    const layer = layers.find(l => l.id === layerId);
    if (layer) {
        layer.cloudField = field;
        renderMapLayers();
        // Server update logic if needed
    }
}


// Render Risk UI
function renderRiskUI() {
    // Base layer select
    const baseSelect = document.getElementById('base-layer-select');
    const currentBase = baseSelect.value;
    baseSelect.innerHTML = '<option value="">Select a layer...</option>';
    
    layers.forEach(layer => {
        const opt = document.createElement('option');
        opt.value = layer.id;
        opt.textContent = layer.name;
        if (layer.id === currentBase) opt.selected = true;
        baseSelect.appendChild(opt);
    });

    // Risk Params
    const paramContainer = document.getElementById('risk-params-container');
    paramContainer.innerHTML = '';

    PARAMETERS.forEach(param => {
        const mapData = mappings[param.name] || { layerId: '', column: '' };
        
        let layerOptions = '<option value="">-- No Mapping --</option>';
        layers.forEach(layer => {
            layerOptions += `<option value="${layer.id}" ${mapData.layerId === layer.id ? 'selected' : ''}>${layer.name}</option>`;
        });

        let columnOptions = '<option value="">Select Field...</option>';
        if (mapData.layerId) {
            const l = layers.find(x => x.id === mapData.layerId);
            if (l) {
                getAttributeFields(l).forEach(f => {
                    columnOptions += `<option value="${f}" ${mapData.column === f ? 'selected' : ''}>${f}</option>`;
                });
            }
        }

        const div = document.createElement('div');
        div.className = 'bg-slate-800/50 p-3 rounded border border-slate-700/50';
        div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-semibold">${param.name}</span>
                <span class="text-xs bg-slate-700 px-2 py-0.5 rounded text-amber-400">${param.weight}%</span>
            </div>
            <div class="flex gap-2">
                <select class="flex-1 bg-slate-900 border border-slate-700 rounded text-xs p-1.5 outline-none text-slate-300" onchange="updateMapping('${param.name}', 'layerId', this.value)">
                    ${layerOptions}
                </select>
                <select class="flex-1 bg-slate-900 border border-slate-700 rounded text-xs p-1.5 outline-none text-slate-300" onchange="updateMapping('${param.name}', 'column', this.value)">
                    ${columnOptions}
                </select>
            </div>
        `;
        paramContainer.appendChild(div);
    });
}

function updateMapping(paramName, field, value) {
    if (!mappings[paramName]) mappings[paramName] = {};
    mappings[paramName][field] = value;
    
    // If layer changed, reset column
    if (field === 'layerId') {
        mappings[paramName].column = '';
    }
    
    renderRiskUI();
}

async function calculateRisk() {
    const baseLayerId = document.getElementById('base-layer-select').value;
    if (!baseLayerId) {
        alert("Please select a Base Network Layer.");
        return;
    }

    const btn = document.getElementById('calc-btn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-5 h-5"></i> Calculating...`;
    lucide.createIcons();

    const parameters = PARAMETERS.map(p => ({
        name: p.name,
        weight: p.weight,
        layerId: mappings[p.name]?.layerId || "none",
        column: mappings[p.name]?.column || "none"
    }));

    try {
        const res = await fetch('/calculate-risk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseLayerId, parameters })
        });
        
        if (res.ok) {
            const newLayer = await res.json();
            
            // Re-fetch layers entirely to get the new risk layer
            await fetchLayers();

            // Calculate local summary stats
            const features = newLayer.data.features;
            let high = 0, med = 0, low = 0, vlow = 0;
            let paramSums = {};
            
            const highRiskList = [];

            features.forEach(f => {
                const cat = f.properties["Risk_Category"];
                if (cat === "High Risk") high++;
                else if (cat === "Medium Risk") med++;
                else if (cat === "Low Risk") low++;
                else if (cat === "Very Low") vlow++;

                if ((f.properties.Total_Risk_Score || 0) > 0) {
                    highRiskList.push(f);
                }

                Object.keys(f.properties).forEach(k => {
                    if (k.startsWith("RiskParam_")) {
                        const name = k.replace("RiskParam_", "");
                        paramSums[name] = (paramSums[name] || 0) + (f.properties[k] || 0);
                    }
                });
            });

            document.getElementById('res-high').textContent = high;
            document.getElementById('res-med').textContent = med;
            document.getElementById('res-low').textContent = low;
            document.getElementById('res-vlow').textContent = vlow;
            
            // Draw Pie Chart
            const pieContainer = document.getElementById('risk-pie-chart');
            const totalAssets = high + med + low + vlow;
            if (pieContainer && totalAssets > 0) {
                const pHigh = (high / totalAssets) * 100;
                const pMed = (med / totalAssets) * 100;
                const pLow = (low / totalAssets) * 100;
                
                pieContainer.innerHTML = `
                    <div class="relative w-40 h-40 rounded-full shadow-lg border-[6px] border-white dark:border-gray-900 transition-all duration-500 hover:scale-105"
                         style="background: conic-gradient(
                            #dc2626 0% ${pHigh}%,
                            #ea580c ${pHigh}% ${pHigh + pMed}%,
                            #ca8a04 ${pHigh + pMed}% ${pHigh + pMed + pLow}%,
                            #16a34a ${pHigh + pMed + pLow}% 100%
                         );">
                         <div class="absolute inset-[15%] bg-red-50 dark:bg-[#202736] rounded-full flex flex-col items-center justify-center">
                            <span class="text-2xl font-black text-gray-800 dark:text-white">${totalAssets}</span>
                            <span class="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Total Pipes</span>
                         </div>
                    </div>
                `;
                pieContainer.classList.remove('hidden');
            }

            document.getElementById('risk-results').classList.remove('hidden');

            // Calculate overall network average risk (Total_Risk_Score)
            let totalRiskSum = 0;
            features.forEach(f => {
                totalRiskSum += (f.properties.Total_Risk_Score || 0);
            });
            const networkAvgRisk = features.length > 0 ? (totalRiskSum / features.length) : 0;

            const speedoContainer = document.getElementById('network-speedometer');
            if (speedoContainer) {
                speedoContainer.innerHTML = renderSpeedometer(networkAvgRisk);
                speedoContainer.classList.remove('hidden');
            }

            // Bottom dashboard averages
            const avgContainer = document.getElementById('network-avg-bars');
            if (avgContainer) {
                avgContainer.innerHTML = '';
                const totalFeat = features.length || 1;
                Object.keys(paramSums).forEach(name => {
                    const avgScore = paramSums[name] / totalFeat;
                    const percentage = (avgScore / 5.0) * 100;
                    
                    let color = "#ef4444"; // red
                    if (avgScore < 2) color = "#22c55e"; // green
                    else if (avgScore < 3) color = "#eab308"; // yellow
                    else if (avgScore < 4) color = "#f97316"; // orange

                    avgContainer.innerHTML += `
                        <div class="flex flex-col gap-1">
                            <div class="flex justify-between text-[10px] text-slate-300 font-medium">
                                <span>${name}</span>
                                <span style="color: ${color}">${avgScore.toFixed(2)} / 5</span>
                            </div>
                            <div class="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden relative">
                                <div class="h-full absolute left-0 top-0 transition-all duration-500" style="width: ${percentage}%; background-color: ${color}; box-shadow: 0 0 8px ${color}"></div>
                            </div>
                        </div>
                    `;
                });
            }

            // Critical assets list
            highRiskList.sort((a,b) => (b.properties.Total_Risk_Score || 0) - (a.properties.Total_Risk_Score || 0));
            const listContainer = document.getElementById('critical-assets-list');
            if (listContainer) {
                listContainer.innerHTML = '';

                let html = '';
                highRiskList.slice(0, 50).forEach((f, idx) => {
                    const score = (f.properties.Total_Risk_Score || 0).toFixed(2);
                    let name = f.properties.Asset_ID || f.properties.id || "Unknown Asset";
                    
                    let paramsHtml = '';
                    for (const key in f.properties) {
                        if (key.startsWith('RiskParam_')) {
                            const paramName = key.replace('RiskParam_', '');
                            const paramValue = f.properties[key].toFixed(2);
                            const paramPercentage = Math.max(0, Math.min(100, (parseFloat(paramValue) / 5) * 100));
                            let barColor = "bg-red-500";
                            if (paramValue < 2) barColor = "bg-green-500";
                            else if (paramValue < 3) barColor = "bg-yellow-500";
                            else if (paramValue < 4) barColor = "bg-orange-500";

                            paramsHtml += `
                                <div class="flex flex-col border-b border-gray-200 dark:border-slate-700/50 py-1.5">
                                    <div class="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                                        <span>${paramName}</span>
                                        <span class="font-bold text-gray-700 dark:text-gray-200">${paramValue}</span>
                                    </div>
                                    <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                                        <div class="${barColor} h-1.5 rounded-full" style="width: ${paramPercentage}%"></div>
                                    </div>
                                </div>
                            `;
                        }
                    }

                    const geoJsonStr = JSON.stringify(f.geometry).replace(/'/g, "&#39;");

                    html += `
                        <div class="bg-white dark:bg-slate-800/80 rounded border border-gray-200 dark:border-slate-700/50 overflow-hidden mb-2 shadow-sm dark:shadow-none">
                            <div class="p-2 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors" onclick="document.getElementById('asset-details-${idx}').classList.toggle('hidden')">
                                <span class="text-xs text-gray-800 dark:text-white truncate font-medium">${name}</span>
                                <span class="text-xs font-black text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-400/10 px-2 py-0.5 rounded">${score}</span>
                            </div>
                            <div id="asset-details-${idx}" class="hidden bg-gray-50 dark:bg-slate-900/50 p-2 pt-0 border-t border-gray-100 dark:border-transparent">
                                ${paramsHtml}
                                <button onclick='zoomToFeature(${geoJsonStr})' class="mt-2 w-full flex items-center justify-center gap-1 bg-blue-100 dark:bg-blue-600/20 hover:bg-blue-200 dark:hover:bg-blue-600/40 text-blue-700 dark:text-blue-400 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer">
                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                    Zoom to Pipe
                                </button>
                            </div>
                        </div>
                    `;
                });
                listContainer.innerHTML = html;
            }

        } else {
            alert("Calculation failed.");
        }
    } catch(e) {
        console.error(e);
        alert("Error during calculation");
    } finally {
        btn.innerHTML = originalHtml;
        lucide.createIcons();
    }
}

window.zoomToFeature = function(geometry) {
    if (geometry.type === 'Point') {
        map.flyTo({ center: geometry.coordinates, zoom: 18, duration: 1500 });
    } else if (geometry.type === 'LineString') {
        map.flyTo({ center: Math.floor(geometry.coordinates.length / 2) ? geometry.coordinates[Math.floor(geometry.coordinates.length / 2)] : geometry.coordinates[0], zoom: 17, duration: 1500 });
    } else if (geometry.type === 'Polygon') {
        map.flyTo({ center: geometry.coordinates[0][0], zoom: 16, duration: 1500 });
    }

    // Wait for the flyTo animation to finish before blinking
    map.once('moveend', () => {
        // Setup Blink Layers
        if (!map.getSource('blink-source')) {
            map.addSource('blink-source', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });
            map.addLayer({
                id: 'blink-layer',
                type: 'line',
                source: 'blink-source',
                paint: {
                    'line-color': '#ff0000', // Red
                    'line-width': 10,
                    'line-opacity': 0, // start invisible
                    'line-opacity-transition': { duration: 400 } // Smooth ramp on/off
                }
            });
            map.addLayer({
                id: 'blink-layer-poly',
                type: 'fill',
                source: 'blink-source',
                paint: {
                    'fill-color': '#ff0000',
                    'fill-opacity': 0,
                    'fill-opacity-transition': { duration: 400 }
                }
            });
        }

        // Set the geometry data to our source
        map.getSource('blink-source').setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: geometry, properties: {} }]
        });

        // Ensure visibility is on so opacity transitions can be seen
        map.setLayoutProperty('blink-layer', 'visibility', 'visible');
        map.setLayoutProperty('blink-layer-poly', 'visibility', 'visible');

        let isVisible = false;
        let cycles = 0;
        
        if (window.blinkInterval) clearInterval(window.blinkInterval);
        
        // Immediately fade in
        isVisible = true;
        map.setPaintProperty('blink-layer', 'line-opacity', 0.9);
        map.setPaintProperty('blink-layer-poly', 'fill-opacity', 0.5);

        window.blinkInterval = setInterval(() => {
            isVisible = !isVisible;
            
            map.setPaintProperty('blink-layer', 'line-opacity', isVisible ? 0.9 : 0);
            map.setPaintProperty('blink-layer-poly', 'fill-opacity', isVisible ? 0.5 : 0);
            
            if (!isVisible) cycles++;
            
            if (cycles >= 3) { // Stop after 3 full on/off cycles
                clearInterval(window.blinkInterval);
                // Ensure it's hidden at the end
                setTimeout(() => {
                    map.setPaintProperty('blink-layer', 'line-opacity', 0);
                    map.setPaintProperty('blink-layer-poly', 'fill-opacity', 0);
                }, 500);
            }
        }, 600); // 600ms allows the 400ms transition to fully complete
    });
};

// Websocket for real-time sensor
function setupWebsocket() {
    const ws = new WebSocket(`ws://${window.location.hostname}:${window.location.port}/ws/sensor`);
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'distance_update') {
            const distance = data.value;
            // Assuming max height 100cm for calculation
            const maxDepth = 100; 
            const level = maxDepth - distance;
            const percentage = Math.max(0, Math.min(100, (level / maxDepth) * 100));

            document.getElementById('sensor-gauge-text').textContent = `${distance.toFixed(1)} cm`;
            document.getElementById('sensor-gauge-fill').style.width = `${percentage}%`;
            
            // Adjust color based on level
            const fill = document.getElementById('sensor-gauge-fill');
            if (percentage > 80) fill.style.background = 'linear-gradient(90deg, #f97316, #ef4444)'; // Red
            else if (percentage > 50) fill.style.background = 'linear-gradient(90deg, #eab308, #f97316)'; // Orange
            else fill.style.background = 'linear-gradient(90deg, #3b82f6, #10b981)'; // Green/Blue

            // Sensor Mapping Flood Alarm Logic
            if (sensorMapEnabled && sensorMapLayerId && sensorMapFeatureId !== "" && sensorMapLimit !== null && !isNaN(sensorMapLimit)) {
                if (distance < sensorMapLimit) {
                    if (!sensorMapPopup) {
                        const layer = layers.find(l => l.id === sensorMapLayerId);
                        if (layer && layer.data && layer.data.features) {
                            const feature = layer.data.features[sensorMapFeatureId];
                            if (feature && feature.geometry && ['Point', 'MultiPoint'].includes(feature.geometry.type)) {
                                let coords = feature.geometry.coordinates;
                                if (feature.geometry.type === 'MultiPoint') {
                                    coords = coords[0]; // Take the first point
                                }
                                
                                const el = document.createElement('div');
                                el.className = 'flex flex-col items-center justify-center pointer-events-none z-50';
                                el.innerHTML = `
                                    <div class="relative flex items-center justify-center mb-1">
                                        <span class="animate-ping absolute inline-flex h-16 w-16 rounded-full bg-red-500 opacity-75"></span>
                                        <i data-lucide="cloud-lightning" class="relative text-white fill-red-600 w-10 h-10 drop-shadow-xl" style="filter: drop-shadow(0 0 12px rgba(220,38,38,1));"></i>
                                    </div>
                                    <div class="bg-red-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg text-center uppercase tracking-widest border-2 border-white drop-shadow-xl mt-2 animate-pulse">OVERFLOW</div>
                                `;
                                
                                sensorMapPopup = new maplibregl.Marker({
                                    element: el,
                                    anchor: 'bottom'
                                }).setLngLat(coords).addTo(map);
                                
                                if (typeof lucide !== 'undefined') lucide.createIcons();
                            }
                        }
                    }
                } else {
                    if (sensorMapPopup) {
                        sensorMapPopup.remove();
                        sensorMapPopup = null;
                    }
                }
            } else {
                if (sensorMapPopup) {
                    sensorMapPopup.remove();
                    sensorMapPopup = null;
                }
            }
        } else if (data.type === 'new_layer') {
            // Hot reload layer from external upload or processing
            if (!layers.some(l => l.id === data.layer.id)) {
                layers.push(data.layer);
                renderMapLayers();
                renderLayerList();
                renderRiskUI();
                renderMappingUI();
            }
        }
    };
    
    ws.onclose = () => {
        setTimeout(setupWebsocket, 3000); // Reconnect
    };
}

// --- Layout Resizing Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // Left Sidebar Resizer
    const resizerLeft = document.getElementById('resizer-left');
    const sidebarLeft = document.getElementById('sidebar-left');
    let isResizingLeft = false;

    if (resizerLeft && sidebarLeft) {
        resizerLeft.addEventListener('mousedown', (e) => {
            isResizingLeft = true;
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });
    }

    // Right Sidebar Resizer
    const resizerRight = document.getElementById('resizer-right');
    const sidebarRight = document.getElementById('sidebar-right');
    let isResizingRight = false;

    if (resizerRight && sidebarRight) {
        resizerRight.addEventListener('mousedown', (e) => {
            isResizingRight = true;
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });
    }

    // Bottom Dashboard Resizer
    const resizerBottom = document.getElementById('resizer-bottom');
    const bottomDashboard = document.getElementById('bottom-dashboard');
    let isResizingBottom = false;

    if (resizerBottom && bottomDashboard) {
        resizerBottom.addEventListener('mousedown', (e) => {
            isResizingBottom = true;
            document.body.style.cursor = 'row-resize';
            e.preventDefault();
        });
    }

    // Bottom Split Resizer
    const resizerSplit = document.getElementById('resizer-bottom-split');
    const panelLeft = document.getElementById('bottom-panel-left');
    let isResizingSplit = false;

    if (resizerSplit && panelLeft) {
        resizerSplit.addEventListener('mousedown', (e) => {
            isResizingSplit = true;
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });
    }

    document.addEventListener('mousemove', (e) => {
        if (isResizingLeft) {
            const newWidth = Math.max(200, Math.min(e.clientX, window.innerWidth / 2));
            sidebarLeft.style.width = `${newWidth}px`;
            if (map) map.resize();
        } else if (isResizingRight) {
            const newWidth = Math.max(250, Math.min(window.innerWidth - e.clientX, window.innerWidth / 2));
            sidebarRight.style.width = `${newWidth}px`;
            if (map) map.resize();
        } else if (isResizingBottom) {
            const newHeight = Math.max(50, Math.min(window.innerHeight - e.clientY, window.innerHeight * 0.8));
            bottomDashboard.style.height = `${newHeight}px`;
            if (map) map.resize();
        } else if (isResizingSplit) {
            const rect = bottomDashboard.getBoundingClientRect();
            // Calculate percentage of mouse relative to the bottom dashboard width
            let percentage = ((e.clientX - rect.left) / rect.width) * 100;
            percentage = Math.max(20, Math.min(percentage, 80));
            panelLeft.style.width = `${percentage}%`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizingLeft || isResizingRight || isResizingBottom || isResizingSplit) {
            isResizingLeft = false;
            isResizingRight = false;
            isResizingBottom = false;
            isResizingSplit = false;
            document.body.style.cursor = '';
            if (map) map.resize();
        }
    });
});

function renderMappingUI() {
    const layerSelect = document.getElementById('mapping-layer');
    if (!layerSelect) return;
    
    // Remember current selection
    const currentLayer = layerSelect.value;
    
    layerSelect.innerHTML = '<option value="">Select a layer...</option>';
    
    // Filter to layers that have Point features
    layers.forEach(layer => {
        let hasPoint = false;
        if(layer.data && layer.data.features && layer.data.features.length > 0) {
            const geomType = layer.data.features[0].geometry?.type;
            hasPoint = geomType === 'Point' || geomType === 'MultiPoint';
        }
        if (hasPoint) {
            const opt = document.createElement('option');
            opt.value = layer.id;
            opt.textContent = layer.name;
            if (layer.id === currentLayer) opt.selected = true;
            layerSelect.appendChild(opt);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const layerSelect = document.getElementById('mapping-layer');
    const featureSelect = document.getElementById('mapping-feature');
    const limitInput = document.getElementById('mapping-limit');
    const enableCheck = document.getElementById('mapping-enable');
    const comSelect = document.getElementById('com-port-select');

    if (comSelect) {
        fetch('/api/com_ports')
            .then(res => res.json())
            .then(ports => {
                comSelect.innerHTML = '';
                if (ports.length === 0) {
                    comSelect.innerHTML = '<option value="">No COM ports found</option>';
                } else {
                    ports.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.device;
                        opt.textContent = `${p.device} (${p.description.substring(0, 20)}...)`;
                        // Default to COM4 for now if present, else first one
                        if (p.device === 'COM4') opt.selected = true;
                        comSelect.appendChild(opt);
                    });
                }
            })
            .catch(err => console.error("Error fetching COM ports:", err));

        comSelect.addEventListener('change', (e) => {
            const port = e.target.value;
            if (!port) return;
            fetch('/api/com_port', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port })
            }).then(res => res.json())
              .then(data => console.log("Switched port to:", data.port))
              .catch(err => console.error("Error switching port:", err));
        });
    }

    if (layerSelect) {
        layerSelect.addEventListener('change', (e) => {
            sensorMapLayerId = e.target.value;
            featureSelect.innerHTML = '<option value="">Select a manhole...</option>';
            if (sensorMapLayerId) {
                featureSelect.disabled = false;
                const layer = layers.find(l => l.id === sensorMapLayerId);
                if (layer && layer.data && layer.data.features) {
                    layer.data.features.forEach((f, idx) => {
                        const opt = document.createElement('option');
                        opt.value = idx; 
                        let label = `Feature ${idx + 1}`;
                        if (f.properties.id) label = f.properties.id;
                        else if (f.properties.name) label = f.properties.name;
                        else if (f.properties.AssetID) label = f.properties.AssetID;
                        
                        opt.textContent = label;
                        featureSelect.appendChild(opt);
                    });
                    
                    // If old feature id is valid, re-select
                    if (sensorMapFeatureId !== "" && sensorMapFeatureId < layer.data.features.length) {
                        featureSelect.value = sensorMapFeatureId;
                    } else {
                        sensorMapFeatureId = "";
                    }
                }
            } else {
                featureSelect.disabled = true;
                sensorMapFeatureId = "";
            }
            updateSensorMapState();
        });
    }

    if (featureSelect) {
        featureSelect.addEventListener('change', (e) => {
            sensorMapFeatureId = e.target.value;
            updateSensorMapState();
        });
    }

    if (limitInput) {
        limitInput.addEventListener('input', (e) => {
            sensorMapLimit = parseFloat(e.target.value);
            updateSensorMapState();
        });
    }

    if (enableCheck) {
        enableCheck.addEventListener('change', (e) => {
            sensorMapEnabled = e.target.checked;
            updateSensorMapState();
        });
    }
});

function updateSensorMapState() {
    // Force websocket frame evaluation by clearing popup if disabled
    if (!sensorMapEnabled && sensorMapPopup) {
        sensorMapPopup.remove();
        sensorMapPopup = null;
    }
}


function renderSpeedometer(score) {
    const min = 0;
    const max = 5;
    const radius = 60;
    const stroke = 12;
    const normalized = Math.max(0, Math.min(1, (score - min) / (max - min)));
    const arcLength = Math.PI * radius;
    const dashOffset = arcLength * (1 - normalized);

    let color = "#ef4444"; // red
    if (score < 2) color = "#22c55e"; // green
    else if (score < 3) color = "#eab308"; // yellow
    else if (score < 4) color = "#f97316"; // orange

    return `
        <svg viewBox="0 0 160 100" class="w-full max-w-[150px] drop-shadow-md">
            <path d="M 20 80 A ${radius} ${radius} 0 0 1 140 80" 
                  fill="none" stroke="currentColor" class="text-slate-300 dark:text-slate-700" stroke-width="${stroke}" stroke-linecap="round" />
            <path d="M 20 80 A ${radius} ${radius} 0 0 1 140 80" 
                  fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
                  stroke-dasharray="${arcLength}" stroke-dashoffset="${dashOffset}" 
                  style="transition: stroke-dashoffset 1s ease-out, stroke 0.5s;" />
            <text x="80" y="70" text-anchor="middle" class="text-3xl font-black fill-slate-800 dark:fill-white">${score.toFixed(2)}</text>
            <text x="80" y="90" text-anchor="middle" class="text-xs font-bold fill-slate-500 uppercase tracking-widest">Risk</text>
        </svg>
    `;
}
