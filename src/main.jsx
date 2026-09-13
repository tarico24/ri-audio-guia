import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const VERSION = "0.6.0";
const DATE = "13/09/2026";
const AUTHOR = "Ricardo Julián";

const COLORS = {
  essential: "#18bfe8",
  museum: "#8b3dff",
  mall: "#ef3340",
  shopping: "#f59e0b",
  market: "#16a34a"
};

function App() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState(null);
  const [places, setPlaces] = useState([]);
  const [museums, setMuseums] = useState([]);
  const [shoppingCenters, setShoppingCenters] = useState([]);
  const [shoppingAreas, setShoppingAreas] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [msg, setMsg] = useState("¿Qué ciudad quieres descubrir?");
  const [activeTab, setActiveTab] = useState("resumen");
  const [map, setMap] = useState(null);

  const mapRef = useRef(null);

  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js");
  }, []);

  useEffect(() => {
    if (!city || !mapRef.current) return;

    if (map) map.remove();

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

    setMap(m);

    return () => {
      m.remove();
    };
  }, [city]);

  useEffect(() => {
    if (!map || !places.length) return;

    const route = [];

    places.forEach((p, i) => {
      addMarker(
        map,
        p,
        COLORS.essential,
        String(i + 1),
        `${i + 1}. ${p.name}`,
        true
      );

      route.push([p.lat, p.lon]);
    });

    museums.forEach(p =>
      addMarker(
        map,
        p,
        COLORS.museum,
        "🏛",
        `Museo: ${p.name}`
      )
    );

    shoppingCenters.forEach(p =>
      addMarker(
        map,
        p,
        COLORS.mall,
        "🛍",
        `Centro comercial: ${p.name}`
      )
    );

    shoppingAreas.forEach(p =>
      addMarker(
        map,
        p,
        COLORS.shopping,
        "▣",
        `Zona de compras: ${p.name}`
      )
    );

    markets.forEach(p =>
      addMarker(
        map,
        p,
        COLORS.market,
        "🛒",
        `Mercado: ${p.name}`
      )
    );

    if (route.length > 1) {
      L.polyline(route, {
        weight: 4,
        opacity: 0.8,
        color: "#159ddd"
      }).addTo(map);

      map.fitBounds(route, {
        padding: [35, 35],
        maxZoom: 15
      });
    }
  }, [
    map,
    places,
    museums,
    shoppingCenters,
    shoppingAreas,
    markets
  ]);

  function addMarker(
    target,
    p,
    color,
    text,
    popup,
    round = false
  ) {
    const icon = L.divIcon({
      className: "ri-marker-wrapper",
      html: `
        <div class="ri-marker ${round ? "round" : ""}"
             style="background:${color}">
          ${text}
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    L.marker([p.lat, p.lon], { icon })
      .addTo(target)
      .bindPopup(popup);
  }

  async function loadPlaces(c) {
    setPlaces([]);
    setMuseums([]);
    setShoppingCenters([]);
    setShoppingAreas([]);
    setMarkets([]);

    setMsg("Preparando tu audioguía…");

    try {
      const r = await fetch(
        `/api/places?lat=${c.lat}&lon=${c.lon}`
      );

      if (!r.ok) throw new Error("Servidor");

      const data = await r.json();

      setPlaces(data.places || []);
      setMuseums(data.museums || []);
      setShoppingCenters(data.shoppingCenters || []);
      setShoppingAreas(data.shoppingAreas || []);
      setMarkets(data.markets || []);

      setMsg(
        data.places?.length
          ? `${data.places.length} imprescindibles preparados`
          : "Necesitamos mejorar la selección de esta ciudad"
      );
    } catch (e) {
      console.error(e);
      setMsg("No se han podido cargar los datos de la ciudad.");
    }
  }

  async function search() {
    if (!q.trim()) return;

    setMsg("Buscando ciudad…");

    try {
      const r = await fetch(
        `${NOMINATIM}/search?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(q)}`,
        {
          headers: {
            "Accept-Language": "es"
          }
        }
      );

      const data = await r.json();

      if (!data.length) {
        setMsg("No encuentro esa ciudad.");
        return;
      }

      const x = data[0];

      const c = {
        name: x.display_name,
        shortName: x.display_name.split(",")[0],
        lat: Number(x.lat),
        lon: Number(x.lon)
      };

      setCity(c);
      remember(c.name);
      await loadPlaces(c);
    } catch {
      setMsg("No se ha podido realizar la búsqueda.");
    }
  }

  function locate() {
    setMsg("Localizando…");

    navigator.geolocation?.getCurrentPosition(
      async pos => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;

          const r = await fetch(
            `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
            {
              headers: {
                "Accept-Language": "es"
              }
            }
          );

          const x = await r.json();

          const c = {
            name: x.display_name,
            shortName:
              x.address?.city ||
              x.address?.town ||
              x.address?.municipality ||
              x.display_name.split(",")[0],
            lat,
            lon
          };

          setCity(c);
          remember(c.name);
          await loadPlaces(c);
        } catch {
          setMsg("No he podido identificar la ciudad.");
        }
      },
      () => setMsg("No se ha podido acceder a tu ubicación."),
      { enableHighAccuracy: true }
    );
  }

  function remember(name) {
    let h = JSON.parse(
      localStorage.getItem("riHistory") || "[]"
    );

    h = [name, ...h.filter(x => x !== name)].slice(0, 5);

    localStorage.setItem(
      "riHistory",
      JSON.stringify(h)
    );
  }

  async function speak(p) {
    speechSynthesis.cancel();

    setMsg(`Preparando audioguía: ${p.name}`);

    let text = p.description || "";

    if (p.wikipedia) {
      try {
        const title = p.wikipedia.includes(":")
          ? p.wikipedia.split(":").slice(1).join(":")
          : p.wikipedia;

        const r = await fetch(
          `/api/wiki?title=${encodeURIComponent(title)}`
        );

        const data = await r.json();

        if (data.extract) text = data.extract;
      } catch {}
    }

    if (!text) {
      text =
        `${p.name}. Este lugar está incluido en RI Audio Guía. ` +
        `La información turística ampliada para este punto está en preparación.`;
    }

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    u.rate = 0.95;

    const voices = speechSynthesis.getVoices();

    const voice =
      voices.find(
        v =>
          v.lang === "es-ES" &&
          /Jorge|Pablo|Daniel/i.test(v.name)
      ) ||
      voices.find(v => v.lang === "es-ES");

    if (voice) u.voice = voice;

    u.onstart = () =>
      setMsg(`Reproduciendo: ${p.name}`);

    u.onend = () =>
      setMsg("Audioguía finalizada");

    speechSynthesis.speak(u);
  }

  function scrollTo(id) {
    setActiveTab(id);

    document
      .getElementById(id)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  }

  const cityName =
    city?.shortName ||
    city?.name?.split(",")[0] ||
    "";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="logo">
          <span className="ri">RI</span>
          <span className="headphones">🎧</span>
          <strong>Audio Guía</strong>
        </div>

        <div className="slogan">
          Descubre cada ciudad a tu ritmo
        </div>

        <div className="top-actions">
          <span>♡ Mis ciudades</span>
          <span>⚙ Ajustes</span>
          <span>🇪🇸 ES</span>
        </div>
      </header>

      <section className="searchbar">
        <div className="search-input">
          <span>⌕</span>

          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e =>
              e.key === "Enter" && search()
            }
            placeholder="¿Qué ciudad quieres descubrir?"
          />

          {q && (
            <button
              className="clear"
              onClick={() => setQ("")}
            >
              ×
            </button>
          )}
        </div>

        <button
          className="search-btn"
          onClick={search}
        >
          Buscar
        </button>

        <button
          className="location-btn"
          onClick={locate}
        >
          📍 Usar mi ubicación
        </button>
      </section>

      <nav className="tabs">
        <button
          className={activeTab === "resumen" ? "active" : ""}
          onClick={() => scrollTo("resumen")}
        >
          🗺 Resumen
        </button>

        <button onClick={() => scrollTo("ruta")}>
          ⤴ Ruta
        </button>

        <button onClick={() => scrollTo("lugares")}>
          📍 Lugares
        </button>

        <button onClick={() => scrollTo("museos")}>
          🏛 Museos
        </button>

        <button onClick={() => scrollTo("compras")}>
          🛍 Compras
        </button>

        <button>
          ♧ Consejos
        </button>
      </nav>

      <div className="statusline">
        {msg}
      </div>

      {!city ? (
        <section className="welcome">
          <div className="welcome-icon">🎧</div>

          <h1>RI Audio Guía</h1>

          <p>
            Busca una ciudad y descubre sus lugares
            imprescindibles, museos, compras y mercados.
          </p>
        </section>
      ) : (
        <div id="resumen" className="city-layout">
          <section className="main-column">
            <div className="city-title-mobile">
              <h1>{cityName}</h1>
            </div>

            <div
              id="map"
              ref={mapRef}
              className="map"
            />

            <div className="category-grid">
              <CategoryCard
                id="museos"
                title="Museos principales"
                subtitle="Arte, historia y cultura"
                icon="🏛"
                color={COLORS.museum}
                items={museums}
                onAudio={speak}
                audio
              />

              <CategoryCard
                id="compras"
                title="Centros comerciales"
                subtitle="Compras y ocio"
                icon="🛍"
                color={COLORS.mall}
                items={shoppingCenters}
              />

              <CategoryCard
                title="Zonas y calles de compras"
                subtitle="Pasea, compra y disfruta"
                icon="▣"
                color={COLORS.shopping}
                items={[
                  ...shoppingAreas,
                  ...markets
                ].slice(0, 6)}
              />
            </div>
          </section>

          <aside className="side-column">
            <div className="city-hero">
              <div>
                <h1>{cityName}</h1>
                <p>
                  Historia, cultura y vida en cada esquina
                </p>
              </div>
            </div>

            <section
              id="lugares"
              className="essentials-panel"
            >
              <h2>
                10 imprescindibles de {cityName}
              </h2>

              <div className="essential-list">
                {places.map((p, i) => (
                  <div
                    className="essential-item"
                    key={`${p.name}-${i}`}
                  >
                    <span className="number">
                      {i + 1}
                    </span>

                    <div className="essential-text">
                      <strong>{p.name}</strong>
                      <small>
                        Imprescindible para conocer la ciudad
                      </small>
                    </div>

                    <button
                      className="audio-btn"
                      onClick={() => speak(p)}
                    >
                      ▶ Audio
                    </button>
                  </div>
                ))}

                {!places.length && (
                  <div className="empty">
                    Estamos mejorando la selección
                    de esta ciudad.
                  </div>
                )}
              </div>
            </section>

            <section
              id="ruta"
              className="route-card"
            >
              <div className="route-icon">🚶</div>

              <div>
                <strong>Ruta optimizada</strong>
                <small>
                  {places.length} paradas
                </small>
              </div>

              <button
                onClick={() =>
                  map &&
                  places.length &&
                  map.fitBounds(
                    places.map(p => [p.lat, p.lon]),
                    { padding: [30, 30] }
                  )
                }
              >
                🗺 Ver ruta completa
              </button>
            </section>
          </aside>
        </div>
      )}

      <footer>
        <div>
          🎧 <strong>RI Audio Guía</strong>
          <span> · Descubre cada ciudad a tu ritmo</span>
        </div>

        <div>
          Versión {VERSION} · {DATE} · {AUTHOR} ·
          Datos cartográficos © OpenStreetMap
        </div>
      </footer>
    </div>
  );
}

function CategoryCard({
  id,
  title,
  subtitle,
  icon,
  color,
  items,
  onAudio,
  audio = false
}) {
  return (
    <section
      id={id}
      className="category-card"
      style={{
        "--category-color": color
      }}
    >
      <div className="category-heading">
        <span className="category-icon">
          {icon}
        </span>

        <div>
          <h3>{title}</h3>
          <small>{subtitle}</small>
        </div>
      </div>

      <div className="category-items">
        {items.length ? (
          items.slice(0, 5).map((p, i) => (
            <div
              className="category-item"
              key={`${title}-${p.name}-${i}`}
            >
              <span className="mini-icon">
                {icon}
              </span>

              <div>
                <strong>{p.name}</strong>
                <small>{subtitle}</small>
              </div>

              {audio && (
                <button
                  className="mini-audio"
                  onClick={() => onAudio(p)}
                >
                  ▶ Audio
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="empty">
            Información en preparación
          </div>
        )}
      </div>

      <button className="view-all">
        Ver todos
      </button>
    </section>
  );
}

createRoot(
  document.getElementById("root")
).render(<App />);
