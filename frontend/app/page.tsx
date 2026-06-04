"use client";

import React, { useState } from "react";
import IoTStream from "../src/components/IoTStream";
import LayerManager from "../src/components/LayerManager";
import MapViewer from "../src/components/MapViewer";
import AppSync from "../src/components/AppSync";
import RiskCalculator from "../src/components/RiskCalculator";
import { Activity, X, Moon, Sun, ShieldAlert, Menu } from "lucide-react";
import { useTheme } from "next-themes";
import AttributeTable from "../src/components/AttributeTable";
import BottomDashboard from "../src/components/BottomDashboard";

export default function Home() {
  const [showIoT, setShowIoT] = useState(false);
  const [showRiskCalc, setShowRiskCalc] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const { theme, setTheme } = useTheme();
  
  // To avoid hydration mismatch
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <main className="flex h-screen w-full flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <AppSync />
      {/* Header */}
      <header className="h-16 flex-none flex justify-between items-center bg-white dark:bg-gray-900 px-4 md:px-6 border-b border-gray-200 dark:border-gray-800 z-30">
        <div className="flex items-center gap-3 md:gap-5 pl-2">
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <Menu size={24} />
          </button>
          <img src="/logo_dark.svg" alt="SewerSense Logo" className="h-10 md:h-12 w-auto object-contain dark:hidden transition-transform hover:scale-105" />
          <img src="/logo_white.svg" alt="SewerSense Logo" className="h-10 md:h-12 w-auto object-contain hidden dark:block transition-transform hover:scale-105" />
          <div className="flex flex-col justify-center">
            <h1 className="text-2xl md:text-3xl font-black bg-gradient-to-r from-blue-600 to-teal-400 dark:from-blue-400 dark:to-teal-300 bg-clip-text text-transparent leading-none tracking-tight">
              SewerSense
            </h1>
            <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 hidden sm:block font-semibold tracking-[0.15em] uppercase mt-1">
              Network Monitoring & Risk Assessment
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setShowRiskCalc(true)}
            className="flex items-center gap-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-3 md:px-4 py-2 rounded-lg font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors border border-red-200 dark:border-red-800"
            title="Risk Analytics"
          >
            <ShieldAlert size={18} />
            <span className="hidden md:inline">Risk Analytics</span>
          </button>
          
          <button 
            onClick={() => setShowIoT(true)}
            className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 md:px-4 py-2 rounded-lg font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            title="Live Sensors"
          >
            <Activity size={18} />
            <span className="hidden md:inline">Live Sensors</span>
          </button>
          
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar - Layer Manager */}
        {showSidebar && (
          <div className="absolute md:relative inset-y-0 left-0 w-80 sm:w-80 w-full flex-none bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 overflow-y-auto z-20 shadow-2xl md:shadow-[4px_0_15px_-3px_rgba(0,0,0,0.05)] dark:shadow-none transition-transform">
            <div className="md:hidden absolute top-4 right-4 z-30">
              <button 
                onClick={() => setShowSidebar(false)}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>
            <LayerManager />
          </div>
        )}

        {/* Map and Bottom Dashboard Container */}
        <div className="flex-1 flex flex-col relative z-0 min-w-0">
          <div className="flex-1 relative">
            <MapViewer />
          </div>
          <BottomDashboard />
        </div>

        {/* Right Sidebar - Risk Calculator */}
        {showRiskCalc && (
          <RiskCalculator onClose={() => setShowRiskCalc(false)} />
        )}
      </div>



      {/* Modal / Sliding drawer for IoT */}
      {showIoT && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
          <div className="w-[450px] bg-white dark:bg-gray-900 h-full shadow-2xl p-6 overflow-y-auto transform transition-transform border-l border-gray-200 dark:border-gray-800">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold dark:text-gray-100">Live Telemetry</h2>
              <button 
                onClick={() => setShowIoT(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full dark:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>
            <IoTStream />
          </div>
        </div>
      )}
      <AttributeTable />
    </main>
  );
}