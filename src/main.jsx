import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const VERSION = "0.4.0";
const DATE = "13/09/2026";

function App() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState(null);
  const [places, setPlaces] = useState([]);
  const [shoppingCenters, setShoppingCenters] = useState([]);
  const [msg, setMsg] = useState(
    "Busca una ciudad o utiliza tu ubicación."
  );
  const [map, setMap] = useState(null);

  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js");
  }, []);

  useEffect(() => {
    if (!city) return;

    if (map) map.remove();

    const m = L.map("map").setView(
      [city.lat, city.lon],
      14
    );

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "© OpenStreetMap" }
    ).addTo(m);

    setMap(m);
  }, [city]);

  useEffect(() => {
    if (!map || !places.length) return;

    const routePoints = [];

    places.forEach((p, i) => {
      const isShopping =
        p.category === "shopping" ||
        p.category === "market";

      const icon = L.divIcon({
        className: "",
        html: `
          <div style="
            background:${isShopping ? "#f59e0b" : "#0ea5e9"};
            color:white;
            width:32px;
            height:32px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            font-weight:bold;
            border:3px solid white;
            box-shadow:0 2px 7px #0008;
          ">${i + 1}</div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      L.marker([p.lat, p.lon], { icon })
        .addTo(map)
        .bindPopup(`${i + 1}. ${p.name}`);

      routePoints.push([p.lat, p.lon]);
    });

    if (routePoints.length > 1) {
      L.polyline(routePoints, {
        weight: 4,
        opacity: 0.7
      }).addTo(map);
    }

    if (shoppingCenters.length) {
      shoppingCenters.forEach(p => {
        const icon = L.divIcon({
          className: "",
          html: `
            <div style="
              background:#dc2626;
              color:white;
              width:34px;
              height:34px;
              border-radius:8px;
              display:flex;
              align-items:center;
              justify-content:center;
              font-size:18px;
              border:3px solid white;
              box-shadow:0 2px 8px #0008;
            ">🛍</div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });

        L.marker([p.lat, p.lon], { icon })
          .addTo(map)
          .bindPopup(`Centro comercial: ${p.name}`);
      });
    }

    map.fitBounds(routePoints, {
      padding: [35, 35]
    });
  }, [places, shoppingCenters, map]);

  async function loadPlaces(c) {
    setPlaces([]);
    setShoppingCenters([]);
    setMsg("Seleccionando los lugares imprescindibles…");

    try {
      const r = await fetch(
        `/api/places?lat=${c.lat}&lon=${c.lon}`
      );

      if (!r.ok) throw new Error("Servidor");

      const data = await r.json();

      setPlaces(data.places || []);
      setShoppingCenters(
        data.shoppingCenters || []
      );

      if (!data.places?.length) {
        setMsg(
          "No se han encontrado suficientes lugares."
        );
        return;
      }

      setMsg(
        `${data.places.length} lugares imprescindibles seleccionados.`
      );
    } catch (e) {
      console.error(e);
      setMsg(
        "No se han podido cargar los lugares turísticos."
      );
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

      const d = await r.json();

      if (!d.length) {
        setMsg("No encuentro esa ciudad.");
        return;
      }

      const x = d[0];

      const c = {
        name: x.display_name,
        lat: Number(x.lat),
        lon: Number(x.lon)
      };

      setCity(c);
      remember(c.name);
      await loadPlaces(c);
    } catch {
      setMsg(
        "No se ha podido realizar la búsqueda."
      );
    }
  }

  function locate() {
    setMsg("Solicitando tu ubicación…");

    navigator.geolocation?.getCurrentPosition(
      async p => {
        try {
          const r = await fetch(
            `${NOMINATIM}/reverse?format=jsonv2&lat=${p.coords.latitude}&lon=${p.coords.longitude}`,
            {
              headers: {
                "Accept-Language": "es"
              }
            }
          );

          const x = await r.json();

          const c = {
            name: x.display_name,
            lat: p.coords.latitude,
            lon: p.coords.longitude
          };

          setCity(c);
          remember(c.name);
          await loadPlaces(c);
        } catch {
          setMsg(
            "He obtenido tu posición, pero no la ciudad."
          );
        }
      },
      () =>
        setMsg(
          "No se ha podido acceder a tu ubicación."
        ),
      { enableHighAccuracy: true }
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

    setMsg(`Preparando audioguía de ${p.name}…`);

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
        `${p.name}. Este lugar forma parte de la selección de RI Audio Guía. ` +
        `Actualmente no disponemos de información histórica suficientemente verificada para ofrecer una explicación más extensa.`;
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
      setMsg("Audioguía finalizada.");

    speechSynthesis.speak(u);
  }

  const hist = JSON.parse(
    localStorage.getItem("riHistory") || "[]"
  );

  return (
    <main>
      <header>
        <div className="brand">
          RI <span>Audio Guía</span>
        </div>

        <div className="tag">
          Descubre cada ciudad a tu ritmo
        </div>
      </header>

      <section className="search">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e =>
            e.key === "Enter" && search()
          }
          placeholder="¿Qué ciudad quieres descubrir?"
        />

        <button onClick={search}>
          Buscar
        </button>

        <button
          className="loc"
          onClick={locate}
        >
          ◎ Usar mi ubicación
        </button>
      </section>

      <p className="status">{msg}</p>

      {!city && hist.length > 0 && (
        <section>
          <h2>Ciudades recientes</h2>

          {hist.map(x => (
            <div className="history" key={x}>
              {x}
            </div>
          ))}
        </section>
      )}

      {city && (
        <>
          <h1>{city.name.split(",")[0]}</h1>

          <div id="map"></div>

          <section>
            <h2>10 lugares para descubrir</h2>

            {places.length ? (
              places.map((p, i) => (
                <article key={`${p.name}-${i}`}>
                  <b>{i + 1}</b>

                  <div>
                    <strong>{p.name}</strong>

                    <small>
                      {p.category === "market"
                        ? " 🛒 Mercado principal"
                        : p.category === "shopping"
                        ? " 🛍 Zona de compras"
                        : " Punto imprescindible"}
                    </small>
                  </div>

                  <button
                    onClick={() => speak(p)}
                  >
                    ▶ Audio
                  </button>
                </article>
              ))
            ) : (
              <p>Preparando la selección…</p>
            )}
          </section>

          {shoppingCenters.length > 0 && (
            <section>
              <h2 style={{ color: "#dc2626" }}>
                🛍 Centros comerciales destacados
              </h2>

              {shoppingCenters.map((p, i) => (
                <article
                  key={`mall-${p.name}-${i}`}
                  style={{
                    borderLeft: "5px solid #dc2626"
                  }}
                >
                  <b
                    style={{
                      background: "#dc2626"
                    }}
                  >
                    🛍
                  </b>

                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      Centro comercial destacado
                    </small>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      <footer>
        RI Audio Guía · Versión {VERSION} · {DATE} · Ricardo Julian Datos cartográficos © OpenStreetMap
      </footer>
    </main>
  );
}

createRoot(
  document.getElementById("root")
).render(<App />);
