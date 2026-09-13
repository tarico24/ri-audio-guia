import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const VERSION = "0.6.3";
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
  const [loading, setLoading] = useState(false);

  const mapRef = useRef(null);
  const requestRef = useRef(null);
  const searchNumberRef = useRef(0);
  const layersRef = useRef(null);

  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js");
  }, []);

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

  useEffect(() => {
    if (!map || !layersRef.current) return;

    const layer = layersRef.current;
    layer.clearLayers();

    const route = [];

    places.forEach((p, i) => {
      addMarker(
        layer,
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
        layer,
        p,
        COLORS.museum,
        "🏛",
        `Museo: ${p.name}`
      )
    );

    shoppingCenters.forEach(p =>
      addMarker(
        layer,
        p,
        COLORS.mall,
        "🛍",
        `Centro comercial: ${p.name}`
      )
    );

    shoppingAreas.forEach(p =>
      addMarker(
        layer,
        p,
        COLORS.shopping,
        "▣",
        `Zona de compras: ${p.name}`
      )
    );

    markets.forEach(p =>
      addMarker(
        layer,
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
      }).addTo(layer);

      map.fitBounds(route, {
        padding: [35, 35],
        maxZoom: 15
      });
    } else if (city) {
      map.setView(
        [city.lat, city.lon],
        14
      );
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
    if (
      !Number.isFinite(Number(p.lat)) ||
      !Number.isFinite(Number(p.lon))
    ) {
      return;
    }

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

    L.marker(
      [Number(p.lat), Number(p.lon)],
      { icon }
    )
      .addTo(target)
      .bindPopup(popup);
  }

  function cancelPreviousRequest() {
    if (requestRef.current) {
      try {
        requestRef.current.abort();
      } catch {}
    }

    requestRef.current = null;
  }

  async function fetchWithTimeout(
    url,
    timeout = 8000
  ) {
    cancelPreviousRequest();

    const controller = new AbortController();
    requestRef.current = controller;

    const timer = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          "Accept-Language": "es"
        }
      });
    } finally {
      clearTimeout(timer);

      if (requestRef.current === controller) {
        requestRef.current = null;
      }
    }
  }

  function clearCityData() {
    setPlaces([]);
    setMuseums([]);
    setShoppingCenters([]);
    setShoppingAreas([]);
    setMarkets([]);
  }

  async function loadPlaces(c, searchNumber) {
    clearCityData();

    setMsg(`Preparando ${c.shortName}…`);

    try {
      const r = await fetchWithTimeout(
        `/api/places?lat=${encodeURIComponent(c.lat)}&lon=${encodeURIComponent(c.lon)}&city=${encodeURIComponent(c.shortName)}`,
        10000
      );

      if (searchNumber !== searchNumberRef.current) {
        return;
      }

      if (!r.ok) {
        throw new Error("Servidor");
      }

      const data = await r.json();

      if (searchNumber !== searchNumberRef.current) {
        return;
      }

      /*
        Si el servidor conoce un centro mejor,
        lo utilizamos para el mapa.
      */

      if (
        data.center &&
        Number.isFinite(Number(data.center.lat)) &&
        Number.isFinite(Number(data.center.lon))
      ) {
        setCity(old => {
          if (!old) return old;

          return {
            ...old,
            lat: Number(data.center.lat),
            lon: Number(data.center.lon)
          };
        });
      }

      setPlaces(data.places || []);
      setMuseums(data.museums || []);
      setShoppingCenters(data.shoppingCenters || []);
      setShoppingAreas(data.shoppingAreas || []);
      setMarkets(data.markets || []);

      if (data.places?.length) {
        setMsg(
          `${data.places.length} imprescindibles preparados`
        );
      } else {
        setMsg(
          `Todavía no disponemos de una selección completa para ${c.shortName}.`
        );
      }
    } catch (e) {
      if (searchNumber !== searchNumberRef.current) {
        return;
      }

      if (e?.name === "AbortError") {
        setMsg(
          `La búsqueda de ${c.shortName} ha tardado demasiado. Puedes buscar otra ciudad.`
        );
      } else {
        console.error(e);

        setMsg(
          `No se han podido cargar los lugares de ${c.shortName}. Puedes buscar otra ciudad.`
        );
      }
    } finally {
      if (searchNumber === searchNumberRef.current) {
        setLoading(false);
      }
    }
  }

  async function search() {
    const query = q.trim();

    if (!query || loading) {
      /*
        Aunque una búsqueda esté cargando,
        permitimos una nueva: la anterior se cancela.
      */
      if (!query) return;
    }

    const searchNumber =
      ++searchNumberRef.current;

    cancelPreviousRequest();
    setLoading(true);
    clearCityData();

    setMsg(`Buscando ${query}…`);

    try {
      const r = await fetchWithTimeout(
        `${NOMINATIM}/search?format=jsonv2&limit=5&addressdetails=1&featuretype=city&q=${encodeURIComponent(query)}`,
        7000
      );

      if (searchNumber !== searchNumberRef.current) {
        return;
      }

      if (!r.ok) {
        throw new Error("Búsqueda");
      }

      const data = await r.json();

      if (searchNumber !== searchNumberRef.current) {
        return;
      }

      if (!data.length) {
        setMsg(`No encuentro "${query}".`);
        setLoading(false);
        return;
      }

      /*
        Priorizamos ciudades, pueblos y municipios.
      */

      const x =
        data.find(item =>
          [
            "city",
            "town",
            "municipality",
            "village"
          ].includes(item.addresstype)
        ) || data[0];

      const shortName =
        x.address?.city ||
        x.address?.town ||
        x.address?.municipality ||
        x.address?.village ||
        x.name ||
        x.display_name.split(",")[0];

      const c = {
        name: x.display_name,
        shortName,
        lat: Number(x.lat),
        lon: Number(x.lon)
      };

      setCity(c);
      remember(c.name);

      await loadPlaces(
        c,
        searchNumber
      );
    } catch (e) {
      if (searchNumber !== searchNumberRef.current) {
        return;
      }

      if (e?.name === "AbortError") {
        setMsg(
          `La búsqueda de "${query}" ha tardado demasiado. Inténtalo de nuevo.`
        );
      } else {
        console.error(e);
        setMsg(
          `No se ha podido buscar "${query}".`
        );
      }

      setLoading(false);
    }
  }

  function locate() {
    const searchNumber =
      ++searchNumberRef.current;

    cancelPreviousRequest();
    setLoading(true);
    clearCityData();

    setMsg("Localizando…");

    navigator.geolocation?.getCurrentPosition(
      async pos => {
        if (
          searchNumber !==
          searchNumberRef.current
        ) {
          return;
        }

        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;

          const r = await fetchWithTimeout(
            `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
            7000
          );

          if (
            searchNumber !==
            searchNumberRef.current
          ) {
            return;
          }

          const x = await r.json();

          const shortName =
            x.address?.city ||
            x.address?.town ||
            x.address?.municipality ||
            x.address?.village ||
            x.display_name?.split(",")[0] ||
            "Mi ubicación";

          const c = {
            name: x.display_name || shortName,
            shortName,
            lat,
            lon
          };

          setCity(c);
          remember(c.name);

          await loadPlaces(
            c,
            searchNumber
          );
        } catch (e) {
          if (
            searchNumber !==
            searchNumberRef.current
          ) {
            return;
          }

          setMsg(
            "No he podido identificar tu ubicación."
          );

          setLoading(false);
        }
      },
      () => {
        if (
          searchNumber ===
          searchNumberRef.current
        ) {
          setMsg(
            "No se ha podido acceder a tu ubicación."
          );

          setLoading(false);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  }

  function remember(name) {
    let h = JSON.parse(
      localStorage.getItem("riHistory") || "[]"
    );

    h = [
      name,
      ...h.filter(x => x !== name)
    ].slice(0, 5);

    localStorage.setItem(
      "riHistory",
      JSON.stringify(h)
    );
  }

  async function speak(p) {
    speechSynthesis.cancel();

    setMsg(
      `Preparando audioguía: ${p.name}`
    );

    let text = p.description || "";

    if (p.wikipedia) {
      try {
        const title = p.wikipedia.includes(":")
          ? p.wikipedia
              .split(":")
              .slice(1)
              .join(":")
          : p.wikipedia;

        const controller =
          new AbortController();

        const timer = setTimeout(
          () => controller.abort(),
          6000
        );

        const r = await fetch(
          `/api/wiki?title=${encodeURIComponent(title)}`,
          { signal: controller.signal }
        );

        clearTimeout(timer);

        const data = await r.json();

        if (data.extract) {
          text = data.extract;
        }
      } catch {}
    }

    if (!text) {
      text =
        `${p.name}. Este lugar forma parte de RI Audio Guía. ` +
        `Estamos preparando una explicación turística ampliada para este punto.`;
    }

    const u =
      new SpeechSynthesisUtterance(text);

    u.lang = "es-ES";
    u.rate = 0.95;

    const voices =
      speechSynthesis.getVoices();

    const voice =
      voices.find(
        v =>
          v.lang === "es-ES" &&
          /Jorge|Pablo|Daniel/i.test(v.name)
      ) ||
      voices.find(
        v => v.lang === "es-ES"
      );

    if (voice) {
      u.voice = voice;
    }

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
            onChange={e =>
              setQ(e.target.value)
            }
            onKeyDown={e =>
              e.key === "Enter" &&
              search()
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
          {loading ? "Cambiar ciudad" : "Buscar"}
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
          className={
            activeTab === "resumen"
              ? "active"
              : ""
          }
          onClick={() =>
            scrollTo("resumen")
          }
        >
          🗺 Resumen
        </button>

        <button
          onClick={() =>
            scrollTo("ruta")
          }
        >
          ⤴ Ruta
        </button>

        <button
          onClick={() =>
            scrollTo("lugares")
          }
        >
          📍 Lugares
        </button>

        <button
          onClick={() =>
            scrollTo("museos")
          }
        >
          🏛 Museos
        </button>

        <button
          onClick={() =>
            scrollTo("compras")
          }
        >
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
          <div className="welcome-icon">
            🎧
          </div>

          <h1>RI Audio Guía</h1>

          <p>
            Busca una ciudad y descubre
            sus lugares imprescindibles,
            museos, compras y mercados.
          </p>
        </section>
      ) : (
        <div
          id="resumen"
          className="city-layout"
        >
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
                  Historia, cultura y vida
                  en cada esquina
                </p>
              </div>
            </div>

            <section
              id="lugares"
              className="essentials-panel"
            >
              <h2>
                10 imprescindibles de{" "}
                {cityName}
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
                      <strong>
                        {p.name}
                      </strong>

                      <small>
                        Imprescindible para
                        conocer la ciudad
                      </small>
                    </div>

                    <button
                      className="audio-btn"
                      onClick={() =>
                        speak(p)
                      }
                    >
                      ▶ Audio
                    </button>
                  </div>
                ))}

                {!places.length && (
                  <div className="empty">
                    {loading
                      ? "Preparando la ciudad…"
                      : "Estamos mejorando la selección de esta ciudad."}
                  </div>
                )}
              </div>
            </section>

            <section
              id="ruta"
              className="route-card"
            >
              <div className="route-icon">
                🚶
              </div>

              <div>
                <strong>
                  Ruta optimizada
                </strong>

                <small>
                  {places.length} paradas
                </small>
              </div>

              <button
                onClick={() =>
                  map &&
                  places.length &&
                  map.fitBounds(
                    places.map(p => [
                      p.lat,
                      p.lon
                    ]),
                    {
                      padding: [30, 30]
                    }
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
          🎧{" "}
          <strong>RI Audio Guía</strong>
          <span>
            {" "}
            · Descubre cada ciudad a tu
            ritmo
          </span>
        </div>

        <div>
          Versión {VERSION} · {DATE} ·{" "}
          {AUTHOR} · Datos cartográficos
          © OpenStreetMap
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
                  onClick={() =>
                    onAudio(p)
                  }
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
