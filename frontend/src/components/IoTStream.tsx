"use client";

import React, { useEffect, useState, useRef } from "react";
import { Activity, AlertTriangle, CheckCircle } from "lucide-react";

export default function IoTStream() {
  const [distance, setDistance] = useState<number | null>(null);
  const [floodLimit, setFloodLimit] = useState<number>(2.0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connectWebSocket = () => {
    if (wsRef.current) return;
    
    setError(null);
    try {
      const hostname = window.location.hostname;
      const ws = new WebSocket(`ws://${hostname}:8000/ws/sensor`);
      
      ws.onopen = () => {
        setIsConnected(true);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "distance_update" && typeof data.value === "number") {
            setDistance(data.value);
          }
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };
      
      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
      };
      
      ws.onerror = (e) => {
        setError("WebSocket connection error");
        setIsConnected(false);
      };
      
      wsRef.current = ws;
    } catch (e) {
      setError("Failed to create WebSocket");
    }
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const toggleConnection = () => {
    if (isConnected) {
      disconnectWebSocket();
    } else {
      connectWebSocket();
    }
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      disconnectWebSocket();
    };
  }, []);

  const isFlooding = distance !== null && distance <= floodLimit;

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Activity className="text-blue-500" />
          Sensor Status
        </h2>
        <div className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${isConnected ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
          {isConnected ? (
            <><CheckCircle size={14} /> Connected</>
          ) : (
            "Disconnected"
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Flood Limit (cm)
          </label>
          <input
            type="number"
            step="0.1"
            value={floodLimit}
            onChange={(e) => setFloodLimit(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className={`p-4 rounded-lg flex flex-col items-center justify-center min-h-[120px] transition-colors duration-300 ${
          !isConnected 
            ? 'bg-gray-50 border border-gray-200 dark:bg-gray-800/50 dark:border-gray-700' 
            : isFlooding 
              ? 'bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]' 
              : 'bg-green-50 border border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
        }`}>
          {!isConnected ? (
            <p className="text-gray-500 dark:text-gray-400">Waiting for connection...</p>
          ) : distance === null ? (
            <p>Loading data...</p>
          ) : isFlooding ? (
            <>
              <AlertTriangle size={32} className="mb-2" />
              <p className="text-2xl font-bold">FLOODING!</p>
              <p className="text-lg">Level: {distance.toFixed(1)} cm</p>
            </>
          ) : (
            <>
              <p className="text-sm uppercase tracking-wider opacity-80 mb-1">Current Level</p>
              <p className="text-4xl font-bold">{distance.toFixed(1)} cm</p>
            </>
          )}
        </div>

        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}

        <button
          onClick={toggleConnection}
          className={`w-full py-2.5 rounded-md font-medium transition-colors ${
            isConnected
              ? 'bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isConnected ? 'Disconnect' : 'Connect to Sensor'}
        </button>
      </div>
    </div>
  );
}
