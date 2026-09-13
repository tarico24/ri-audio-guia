useEffect(() => {
  if (!city || !mapRef.current) return;

  if (map) {
    try {
      map.remove();
    } catch {}
  }

  const m = L.map(mapRef.current, {
    zoomControl: true
  }).setView([city.lat, city.lon], 14);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution: "© OpenStreetMap",
      maxZoom: 19
    }
  ).addTo(m);

  layersRef.current = L.layerGroup().addTo(m);

  setMap(m);

  setTimeout(() => {
    try {
      m.invalidateSize();
    } catch {}
  }, 100);

  return () => {
    try {
      m.remove();
    } catch {}
  };
}, [city]);
