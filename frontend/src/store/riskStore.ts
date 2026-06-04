import { create } from 'zustand';

export interface RiskSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
  veryLow: number;
  averageScore: number;
  parameterAverages: Record<string, number>;
  highRiskFeatures: any[];
}

interface RiskState {
  baseLayerId: string;
  mappings: Record<string, { layerId: string; column: string }>;
  resultSummary: RiskSummary | null;
  
  setBaseLayerId: (id: string) => void;
  setMappings: (paramName: string, field: "layerId" | "column", value: string) => void;
  setResultSummary: (summary: RiskSummary | null) => void;
}

export const useRiskStore = create<RiskState>((set) => ({
  baseLayerId: "",
  mappings: {},
  resultSummary: null,

  setBaseLayerId: (id) => set({ baseLayerId: id }),
  setMappings: (paramName, field, value) =>
    set((state) => ({
      mappings: {
        ...state.mappings,
        [paramName]: {
          ...state.mappings[paramName],
          [field]: value,
          ...(field === "layerId" && { column: "none" }),
        },
      },
    })),
  setResultSummary: (summary) => set({ resultSummary: summary }),
}));
