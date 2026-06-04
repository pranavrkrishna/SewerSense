import { create } from 'zustand';

export interface MapLayer {
  id: string;
  name: string;
  data: any; // GeoJSON data
  bounds?: [number, number, number, number];
  visible: boolean;
  color: string;
  symbologyField?: string;
  symbologyMap?: Record<string, string>; // value -> color mapping
  labelField?: string;
  cloudField?: string;
  cloudColor?: string;
}

interface MapState {
  layers: MapLayer[];
  setLayers: (layers: MapLayer[]) => void;
  addLayer: (layer: MapLayer) => void;
  toggleLayerVisibility: (id: string) => void;
  removeLayer: (id: string) => void;
  setLayerSymbology: (id: string, field: string, map: Record<string, string>) => void;
  setLayerLabelField: (id: string, field: string) => void;
  setLayerCloudField: (id: string, field: string) => void;
  setLayerCloudColor: (id: string, color: string) => void;
  baseMap: 'theme' | 'satellite' | 'osm';
  setBaseMap: (map: 'theme' | 'satellite' | 'osm') => void;
  reorderLayer: (startIndex: number, endIndex: number) => void;
  activeAttributeLayerId: string | null;
  setActiveAttributeLayerId: (id: string | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  layers: [],
  baseMap: 'theme',
  setBaseMap: (map) => set({ baseMap: map }),
  setLayers: (layers) => set({ layers }),
  addLayer: (layer) => set((state) => {
    // Prevent duplicate layers on WS broadcast if already added
    if (state.layers.some(l => l.id === layer.id)) return state;
    return { layers: [...state.layers, layer] };
  }),
  toggleLayerVisibility: (id) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    })),
  removeLayer: (id) =>
    set((state) => ({
      layers: state.layers.filter((l) => l.id !== id),
    })),
  setLayerSymbology: (id, field, map) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, symbologyField: field, symbologyMap: map } : l
      ),
    })),
  setLayerLabelField: (id, field) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, labelField: field } : l
      ),
    })),
  setLayerCloudField: (id, field) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, cloudField: field } : l
      ),
    })),
  setLayerCloudColor: (id, color) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, cloudColor: color } : l
      ),
    })),
  reorderLayer: (startIndex, endIndex) =>
    set((state) => {
      const result = Array.from(state.layers);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return { layers: result };
    }),
  activeAttributeLayerId: null,
  setActiveAttributeLayerId: (id) => set({ activeAttributeLayerId: id }),
}));
