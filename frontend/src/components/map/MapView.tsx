```tsx
'use client'

import Map from 'react-map-gl/maplibre'

export default function MapView() {
  return (
    <div className="w-full h-screen">
      <Map
        initialViewState={{
          longitude: 76.9366,
          latitude: 8.5241,
          zoom: 12
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://demotiles.maplibre.org/style.json"
      />
    </div>
  )
}
```
