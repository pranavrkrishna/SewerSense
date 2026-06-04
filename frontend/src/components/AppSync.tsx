"use client";

import React, { useEffect } from 'react';
import { useMapStore } from '../store/mapStore';

export default function AppSync() {
  const { setLayers, addLayer, removeLayer, setLayerSymbology, setLayerLabelField } = useMapStore();

  useEffect(() => {
    const hostname = window.location.hostname;
    
    // 1. Fetch initial layers
    const fetchLayers = async () => {
      try {
        const res = await fetch(`http://${hostname}:8000/layers`);
        if (res.ok) {
          const data = await res.json();
          setLayers(data);
        }
      } catch (err) {
        console.error("Failed to fetch layers", err);
      }
    };
    fetchLayers();

    // 2. Connect global WebSocket for syncing
    const ws = new WebSocket(`ws://${hostname}:8000/ws/sensor`);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_layer") {
          addLayer(data.layer);
        } else if (data.type === "delete_layer") {
          removeLayer(data.id);
        } else if (data.type === "update_symbology") {
          setLayerSymbology(data.id, data.symbologyField, data.symbologyMap);
        } else if (data.type === "update_label") {
          setLayerLabelField(data.id, data.labelField);
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    };

    return () => {
      ws.close();
    };
  }, [setLayers, addLayer, removeLayer, setLayerSymbology, setLayerLabelField]);

  return null; // This component doesn't render anything visually
}
