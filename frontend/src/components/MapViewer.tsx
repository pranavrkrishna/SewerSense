"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Map, { Source, Layer, MapRef, useMap } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore, MapLayer } from '../store/mapStore';
import { useTheme } from 'next-themes';

function CustomNorthArrow() {
  const { current: map } = useMap();
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    if (!map) return;
    
    const onRotate = () => setBearing(map.getBearing());
    map.on('rotate', onRotate);
    onRotate(); // Initial
    
    return () => {
      map.off('rotate', onRotate);
    };
  }, [map]);

  const resetNorth = () => {
    map?.resetNorthPitch({ duration: 1000 });
  };

  return (
    <div 
      className="absolute top-6 left-6 z-20 w-14 h-14 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md shadow-[0_4px_15px_rgba(0,0,0,0.15)] rounded-full flex items-center justify-center cursor-pointer hover:bg-white dark:hover:bg-gray-800 transition-colors group border border-gray-200 dark:border-gray-700"
      onClick={resetNorth}
      title="Reset North"
    >
      <div 
        className="relative flex items-center justify-center w-full h-full transition-transform duration-75"
        style={{ transform: `rotate(${-bearing}deg)` }}
      >
        <svg width="28" height="28" viewBox="0 0 32 32" className="drop-shadow-md group-hover:scale-110 transition-transform">
          {/* North pointing needle (Red) */}
          <path d="M16 2 L22 18 L16 15 Z" fill="#ef4444" />
          <path d="M16 2 L10 18 L16 15 Z" fill="#dc2626" />
          {/* South pointing needle (Silver/White) */}
          <path d="M16 30 L22 18 L16 15 Z" fill="#f8fafc" />
          <path d="M16 30 L10 18 L16 15 Z" fill="#94a3b8" />
        </svg>
      </div>
    </div>
  );
}

export default function MapViewer() {
  const { layers, baseMap } = useMapStore();
  const { theme } = useTheme();
  const mapRef = useRef<MapRef>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const osmStyle = useMemo(() => ({
    version: 8 as const,
    sources: {
      osm: {
        type: 'raster' as const,
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap Contributors'
      }
    },
    layers: [
      {
        id: 'osm',
        type: 'raster' as const,
        source: 'osm',
        minzoom: 0,
        maxzoom: 19
      }
    ]
  }), []);

  const esriSatelliteStyle = useMemo(() => ({
    version: 8 as const,
    sources: {
      'esri-satellite': {
        type: 'raster' as const,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }
    },
    layers: [
      {
        id: 'esri-satellite',
        type: 'raster' as const,
        source: 'esri-satellite',
        minzoom: 0,
        maxzoom: 19
      }
    ]
  }), []);

  // Determine map style based on theme
  const currentStyle = useMemo(() => {
    if (!mounted) return osmStyle;
    if (baseMap === 'satellite') return esriSatelliteStyle;
    if (baseMap === 'osm') return osmStyle;

    return theme === 'dark' 
      ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
      : osmStyle; // using OSM by default for light to avoid carto CORS issues, or positron if preferred
  }, [theme, mounted, osmStyle, esriSatelliteStyle, baseMap]);

  useEffect(() => {
    const handleZoom = (e: any) => {
      if (mapRef.current) {
        const [minLng, minLat, maxLng, maxLat] = e.detail;
        mapRef.current.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: 40, duration: 1000 }
        );
      }
    };
    window.addEventListener('zoom-to-bounds', handleZoom);
    return () => window.removeEventListener('zoom-to-bounds', handleZoom);
  }, []);

  const getColorExpression = (layer: MapLayer) => {
    if (layer.symbologyField && layer.symbologyMap && Object.keys(layer.symbologyMap).length > 0) {
      const matchExpr: any[] = ['match', ['to-string', ['get', layer.symbologyField]]];
      for (const [val, col] of Object.entries(layer.symbologyMap)) {
        matchExpr.push(val, col);
      }
      matchExpr.push(layer.color); // fallback color
      return matchExpr;
    }
    return layer.color;
  };

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: 0,
          latitude: 0,
          zoom: 1
        }}
        mapStyle={currentStyle}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Custom North Arrow */}
        <CustomNorthArrow />
        
        {/* Map over a reversed copy of layers so the top item in the UI is rendered last (on top) on the map */}
        {[...layers].reverse().map((layer) => {
          if (!layer.visible) return null;
          
          const colorExpr = getColorExpression(layer);

          return (
            <Source key={layer.id} id={layer.id} type="geojson" data={layer.data}>
              <Layer 
                id={`${layer.id}-fill`}
                type="fill"
                paint={{
                  'fill-color': colorExpr,
                  'fill-opacity': 0.6
                }}
                filter={['==', '$type', 'Polygon']}
              />
              <Layer 
                id={`${layer.id}-line`}
                type="line"
                paint={{
                  'line-color': colorExpr,
                  'line-width': 3
                }}
                filter={['==', '$type', 'LineString']}
              />
              <Layer 
                id={`${layer.id}-circle`}
                type="circle"
                paint={{
                  'circle-color': colorExpr,
                  'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, 2,
                    14, 4,
                    18, 8
                  ],
                  'circle-stroke-width': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    13, 0,
                    15, 1.5
                  ],
                  'circle-stroke-color': '#ffffff'
                }}
                filter={['==', '$type', 'Point']}
              />
              {layer.labelField && (
                <Layer
                  id={`${layer.id}-label`}
                  type="symbol"
                  minzoom={14.5}
                  layout={{
                    'text-field': ['to-string', ['get', layer.labelField]],
                    'text-size': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      14.5, 10,
                      22, 16
                    ],
                    'text-allow-overlap': false,
                    'text-anchor': 'top',
                    'text-offset': [0, 0.5]
                  }}
                  paint={{
                    'text-color': theme === 'dark' ? '#94a3b8' : '#475569',
                    'text-halo-color': theme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    'text-halo-width': 1.5,
                    'text-halo-blur': 0.5
                  }}
                />
              )}
              {layer.cloudField && (
                <Layer
                  id={`${layer.id}-cloud`}
                  type="symbol"
                  minzoom={13}
                  layout={{
                    'text-field': ['upcase', ['to-string', ['get', layer.cloudField]]],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      13, 10,
                      22, 16
                    ],
                    'text-allow-overlap': false,
                    'text-anchor': 'bottom',
                    'text-offset': [0, -0.8],
                    'text-letter-spacing': 0.05
                  }}
                  paint={{
                    'text-color': layer.cloudColor || (theme === 'dark' ? '#60a5fa' : '#2563eb'),
                    'text-halo-color': theme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                    'text-halo-width': 2,
                    'text-halo-blur': 1,
                  }}
                />
              )}
            </Source>
          );
        })}
      </Map>
    </div>
  );
}
