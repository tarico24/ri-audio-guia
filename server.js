import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const DIR = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());

const VERSION = "0.4.0";

function distanceKm(a, b, c, d) {
  const R = 6371;
  const x = (c - a) * Math.PI / 180;
  const y = (d - b) * Math.PI / 180;

  const q =
    Math.sin(x / 2) ** 2 +
    Math.cos(a * Math.PI / 180) *
    Math.cos(c * Math.PI / 180) *
    Math.sin(y / 2) ** 2;

  return R * 2 * Math.atan2(
    Math.sqrt(q),
    Math.sqrt(1 - q)
  );
}

async function nominatim(q, limit = 10) {
  const url =
    "https://nominatim.openstreetmap.org/search" +
    "?format=jsonv2" +
    `&limit=${limit}` +
    "&addressdetails=1" +
    "&extratags=1" +
    "&namedetails=1" +
    `&q=${encodeURIComponent(q)}`;

  const r = await fetch(url, {
    headers: {
      "Accept-Language": "es",
      "User-Agent": `RI-Audio-Guia/${VERSION}`
    }
  });

  if (!r.ok) throw new Error(`Nominatim ${r.status}`);

  return r.json();
}

async function wikipediaSearch(query, limit = 10) {
  const url =
    "https://es.wikipedia.org/w/api.php" +
    "?action=query" +
    "&format=json" +
    "&origin=*" +
    "&prop=coordinates|pageprops|extracts" +
    "&exintro=1" +
    "&explaintext=1" +
    "&redirects=1" +
    `&generator=search&gsrlimit=${limit}` +
    `&gsrsearch=${encodeURIComponent(query)}`;

  const r = await fetch(url, {
    headers: {
      "User-Agent": `RI-Audio-Guia/${VERSION}`
    }
  });

  if (!r.ok) return [];

  const data = await r.json();

  return Object.values(data.query?.pages || {});
}

function badTouristName(name) {
  return /metro de |s\.?\s?a\.?$|empresa|oficina|parking|aparcamiento|gasolinera|hospital|clínica|supermercado|estación de servicio/i.test(
    name
  );
}

function osmPlace(p, category, lat, lon) {
  const name =
    p.namedetails?.["name:es"] ||
    p.namedetails?.name ||
    p.name ||
    p.display_name?.split(",")[0];

  const plat = Number(p.lat);
  const plon = Number(p.lon);

  if (
    !name ||
    !Number.isFinite(plat) ||
    !Number.isFinite(plon)
  ) return null;

  const distance = distanceKm(
    lat,
    lon,
    plat,
    plon
  );

  if (distance > 20) return null;

  if (
    category === "visit" &&
    badTouristName(name)
  ) return null;

  let score = 100 - distance;

  const text =
    `${name} ${p.type || ""} ${p.class || ""}`
      .toLowerCase();

  if (p.extratags?.wikipedia) score += 180;
  if (p.extratags?.wikidata) score += 100;

  if (
    /catedral|cathedral|palacio|palace|alcazaba|castillo|castle|basílica|basilica/.test(text)
  ) score += 120;

  if (/museo|museum/.test(text)) score += 80;

  if (
    /monumento|monument|historic|histórico|teatro|theatre|parque|park|plaza/.test(text)
  ) score += 55;

  if (
    /placa|cementerio|busto|memorial/.test(text)
  ) score -= 200;

  return {
    name,
    lat: plat,
    lon: plon,
    category,
    score,
    wikipedia: p.extratags?.wikipedia || "",
    description: p.extratags?.description || ""
  };
}

async function osmSearch(
  queries,
  category,
  lat,
  lon
) {
  const result = [];

  for (const q of queries) {
    try {
      const data = await nominatim(q, 10);

      for (const p of data) {
        const x = osmPlace(
          p,
          category,
          lat,
          lon
        );

        if (x) result.push(x);
      }
    } catch (e) {
      console.error(e);
    }
  }

  return result;
}

async function wikiTourism(city, lat, lon) {
  const searches = [
    `"${city}" monumento`,
    `"${city}" museo`,
    `"${city}" palacio`,
    `"${city}" turismo`
  ];

  const result = [];

  for (const q of searches) {
    try {
      const pages = await wikipediaSearch(q, 10);

      for (const page of pages) {
        const coord = page.coordinates?.[0];

        if (!coord) continue;

        const d = distanceKm(
          lat,
          lon,
          coord.lat,
          coord.lon
        );

        if (d > 20) continue;
        if (badTouristName(page.title)) continue;

        let score = 250 - d;

        const text =
          `${page.title} ${page.extract || ""}`
            .toLowerCase();

        if (
          /catedral|palacio|alcazaba|castillo|basílica/.test(text)
        ) score += 100;

        if (/museo/.test(text)) score += 70;
        if (/monumento/.test(text)) score += 60;

        result.push({
          name: page.title,
          lat: coord.lat,
          lon: coord.lon,
          category: "visit",
          score,
          wikipedia: `es:${page.title}`,
          description: page.extract || ""
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  return result;
}

function unique(list) {
  const seen = new Set();

  return list
    .sort((a, b) => b.score - a.score)
    .filter(p => {
      const key = p.name
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

app.get("/api/places", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return res.status(400).json({
      error: "Coordenadas incorrectas"
    });
  }

  try {
    const reverse = await fetch(
      "https://nominatim.openstreetmap.org/reverse" +
      `?format=jsonv2&lat=${lat}&lon=${lon}`,
      {
        headers: {
          "Accept-Language": "es",
          "User-Agent": `RI-Audio-Guia/${VERSION}`
        }
      }
    );

    const rd = reverse.ok
      ? await reverse.json()
      : {};

    const city =
      rd.address?.city ||
      rd.address?.town ||
      rd.address?.municipality ||
      rd.address?.village ||
      "";

    const country =
      rd.address?.country || "";

    const location = `${city}, ${country}`;

    const [
      wiki,
      osm,
      streets,
      markets,
      malls
    ] = await Promise.all([
      wikiTourism(city, lat, lon),

      osmSearch(
        [
          `atracción turística ${location}`,
          `monumento ${location}`,
          `museo ${location}`,
          `palacio ${location}`,
          `catedral ${location}`
        ],
        "visit",
        lat,
        lon
      ),

      osmSearch(
        [
          `calle comercial ${location}`,
          `zona comercial ${location}`,
          `shopping street ${location}`
        ],
        "shopping",
        lat,
        lon
      ),

      osmSearch(
        [
          `mercado municipal ${location}`,
          `mercado central ${location}`,
          `mercado de abastos ${location}`
        ],
        "market",
        lat,
        lon
      ),

      osmSearch(
        [
          `centro comercial ${location}`,
          `shopping centre ${location}`,
          `shopping mall ${location}`
        ],
        "mall",
        lat,
        lon
      )
    ]);

    const tourist = unique([
      ...wiki,
      ...osm
    ]);

    const shopping = unique(streets);
    const market = unique(markets);
    const shoppingCenters = unique(malls)
      .slice(0, 5);

    const final = [];
    const used = new Set();

    function add(p) {
      if (!p) return;

      const key = p.name.toLowerCase();

      if (used.has(key)) return;

      used.add(key);
      final.push(p);
    }

    // Los imprescindibles turísticos primero.
    for (const p of tourist) {
      if (final.length >= 8) break;
      add(p);
    }

    // Garantizamos mercado principal.
    add(market[0]);

    // Garantizamos calle/zona de compras.
    add(shopping[0]);

    // Completamos hasta 10 si fuese necesario.
    for (const p of [
      ...tourist,
      ...market,
      ...shopping
    ]) {
      if (final.length >= 10) break;
      add(p);
    }

    return res.json({
      version: VERSION,
      city,
      places: final
        .slice(0, 10)
        .map((p, i) => ({
          ...p,
          order: i + 1
        })),

      shoppingCenters: shoppingCenters.map(
        (p, i) => ({
          ...p,
          order: i + 1
        })
      )
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        "No se pudieron obtener los lugares"
    });
  }
});

app.get("/api/wiki", async (req, res) => {
  const title = String(
    req.query.title || ""
  ).trim();

  if (!title) {
    return res.json({ extract: "" });
  }

  try {
    const r = await fetch(
      "https://es.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(title),
      {
        headers: {
          "User-Agent": `RI-Audio-Guia/${VERSION}`
        }
      }
    );

    if (!r.ok) {
      return res.json({ extract: "" });
    }

    const data = await r.json();

    res.json({
      extract: data.extract || ""
    });
  } catch {
    res.json({ extract: "" });
  }
});

app.use(
  express.static(
    path.join(DIR, "dist")
  )
);

app.get("/{*splat}", (req, res) => {
  res.sendFile(
    path.join(DIR, "dist", "index.html")
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `RI Audio Guía v${VERSION} funcionando en puerto ${PORT}`
  );
});
