import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const DIR = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}

async function nominatimSearch(query, limit = 10) {
  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?format=jsonv2&limit=${limit}` +
    "&addressdetails=1&extratags=1&namedetails=1" +
    `&q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "es",
      "User-Agent": "RI-Audio-Guia/0.3.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim ${response.status}`);
  }

  return response.json();
}

function makePlace(p, category, cityLat, cityLon) {
  const name =
    p.namedetails?.["name:es"] ||
    p.namedetails?.name ||
    p.name ||
    p.display_name?.split(",")[0];

  const lat = Number(p.lat);
  const lon = Number(p.lon);

  if (
    !name ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) return null;

  const distance = distanceKm(
    cityLat,
    cityLon,
    lat,
    lon
  );

  // Nunca admitimos resultados de otra ciudad lejana.
  if (distance > 20) return null;

  let score = 100 - distance;

  if (p.extratags?.wikipedia) score += 100;
  if (p.extratags?.wikidata) score += 60;

  const text =
    `${name} ${p.type || ""} ${p.class || ""}`
      .toLowerCase();

  if (
    /catedral|cathedral|alcazaba|palacio|palace|castillo|castle|basílica|basilica/.test(text)
  ) score += 90;

  if (/museo|museum/.test(text)) score += 65;
  if (/teatro romano|roman theatre/.test(text)) score += 80;
  if (/monumento|monument/.test(text)) score += 45;

  if (
    /placa|cementerio|busto|memorial/.test(text)
  ) score -= 150;

  return {
    name,
    lat,
    lon,
    category,
    score,
    wikipedia: p.extratags?.wikipedia || "",
    description: p.extratags?.description || ""
  };
}

async function searchCategory(
  queries,
  category,
  cityLat,
  cityLon
) {
  const results = [];

  for (const query of queries) {
    try {
      const data = await nominatimSearch(query, 10);

      for (const p of data) {
        const place = makePlace(
          p,
          category,
          cityLat,
          cityLon
        );

        if (place) results.push(place);
      }
    } catch (e) {
      console.error(e);
    }
  }

  return results;
}

app.get("/api/places", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({
      error: "Coordenadas incorrectas"
    });
  }

  try {
    const reverse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      {
        headers: {
          "Accept-Language": "es",
          "User-Agent": "RI-Audio-Guia/0.3.0"
        }
      }
    );

    const reverseData = reverse.ok
      ? await reverse.json()
      : {};

    const city =
      reverseData.address?.city ||
      reverseData.address?.town ||
      reverseData.address?.municipality ||
      reverseData.address?.village ||
      "";

    const country =
      reverseData.address?.country || "";

    const location = `${city}, ${country}`;

    const tourist = await searchCategory(
      [
        `atracciones turísticas ${location}`,
        `monumentos ${location}`,
        `museos ${location}`,
        `lugares históricos ${location}`
      ],
      "visit",
      lat,
      lon
    );

    const shopping = await searchCategory(
      [
        `calle comercial ${location}`,
        `shopping street ${location}`,
        `zona comercial ${location}`
      ],
      "shopping",
      lat,
      lon
    );

    const markets = await searchCategory(
      [
        `mercado municipal ${location}`,
        `mercado central ${location}`,
        `market ${location}`
      ],
      "market",
      lat,
      lon
    );

    const unique = list => {
      const seen = new Set();

      return list
        .sort((a, b) => b.score - a.score)
        .filter(p => {
          const key = p.name.toLowerCase();

          if (seen.has(key)) return false;

          seen.add(key);
          return true;
        });
    };

    const visits = unique(tourist);
    const shops = unique(shopping);
    const marketList = unique(markets);

    const final = [];
    const used = new Set();

    function add(p) {
      if (!p) return;

      const key = p.name.toLowerCase();

      if (used.has(key)) return;

      used.add(key);
      final.push(p);
    }

    // Reservamos siempre una posición para compras.
    add(shops[0]);

    // Reservamos siempre una posición para mercado.
    add(marketList[0]);

    // Completamos hasta 10 con los lugares turísticos.
    for (const p of visits) {
      if (final.length >= 10) break;
      add(p);
    }

    // Si faltase alguno, utilizamos más resultados
    // comerciales o mercados cercanos.
    for (const p of [...shops, ...marketList]) {
      if (final.length >= 10) break;
      add(p);
    }

    const places = final
      .slice(0, 10)
      .map((p, i) => ({
        ...p,
        order: i + 1
      }));

    return res.json({
      city,
      places
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error:
        "No se pudieron obtener los lugares turísticos"
    });
  }
});

app.get("/api/wiki", async (req, res) => {
  const title = String(req.query.title || "").trim();

  if (!title) {
    return res.json({ extract: "" });
  }

  try {
    const response = await fetch(
      `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );

    if (!response.ok) {
      return res.json({ extract: "" });
    }

    const data = await response.json();

    return res.json({
      extract: data.extract || ""
    });
  } catch {
    return res.json({ extract: "" });
  }
});

app.use(express.static(path.join(DIR, "dist")));

app.get("/{*splat}", (req, res) => {
  res.sendFile(
    path.join(DIR, "dist", "index.html")
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `RI Audio Guía v0.3.0 funcionando en puerto ${PORT}`
  );
});
