import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

//location map

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function LocationMap({
  latitude,
  longitude,
  label = 'Punch location',
  height = 220,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined ||
      !containerRef.current
    ) {
      return undefined;
    }

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([latitude, longitude], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    L.marker([latitude, longitude], { icon: markerIcon })
      .addTo(map)
      .bindPopup(label)
      .openPopup();

    mapRef.current = map;

    const resizeId = setTimeout(() => map.invalidateSize(), 80);

    return () => {
      clearTimeout(resizeId);
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude, label]);

  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return <p className="map-missing">No GPS location saved for this punch.</p>;
  }

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-canvas" style={{ height }} />
      <p className="map-coords">
        {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
      </p>
    </div>
  );
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS is not supported on this device'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        if (err.code === 1) {
          reject(new Error('Location permission denied. Allow GPS to clock in.'));
        } else if (err.code === 2) {
          reject(new Error('Location unavailable. Try again near a window or outdoors.'));
        } else {
          reject(new Error('Timed out getting location. Try again.'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

export async function reverseGeocode(latitude, longitude) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}
