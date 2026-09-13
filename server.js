import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const DIR = path.dirname(fileURLToPath(import.meta.url));

const VERSION = "0.5.0";
const NOMINATIM = "https://nominatim.openstreetmap.org";

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
    `${NOMINATIM}/search?format=jsonv2` +
    `&limit=${limit}` +
    "&addressdetails=1&extratags=1&namedetails=1" +
    `&q=${encodeURIComponent(query)}`;

  const r = await fetch(url, {
    headers: {
      "Accept-Language": "es",
      "User-Agent": `RI-Audio-Guia/${VERSION}`
    }
  });

  if (!r.ok) throw new Error(`Nominatim ${r.status}`);

  return r.json();
}

function makePlace(p, category, centerLat, centerLon) {
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
    centerLat,
    centerLon,
    lat,
    lon
  );

  if (distance > 20) return null;

  return {
    name,
    lat,
    lon,
    category,
    wikipedia: p.extratags?.wikipedia || "",
    description: p.extratags?.description || "",
    distance
  };
}

async function searchMany(
  queries,
  category,
  lat,
  lon
) {
  const result = [];

  for (const q of queries) {
    try {
      const data = await nominatimSearch(q, 10);

      for (const p of data) {
        const item = makePlace(
          p,
          category,
          lat,
          lon
        );

        if (item) result.push(item);
      }
    } catch (e) {
      console.error(q, e.message);
    }
  }

  return result;
}

function unique(list) {
  const seen = new Set();

  return list.filter(p => {
    const key = p.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]/gu, "");

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

async function resolveNamedPlaces(
  names,
  city,
  country,
  category,
  lat,
  lon
) {
  const result = [];

  for (const name of names) {
    try {
      const data = await nominatimSearch(
        `${name}, ${city}, ${country}`,
        5
      );

      const candidates = data
        .map(p =>
          makePlace(
            p,
            category,
            lat,
            lon
          )
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.distance - b.distance
        );

      if (candidates[0]) {
        result.push(candidates[0]);
      }
    } catch (e) {
      console.error(name, e.message);
    }
  }

  return unique(result);
}

/*
  Curaduría especial para ciudades conocidas.

  Esto evita que una búsqueda genérica coloque
  museos secundarios, empresas o estaciones
  por delante de los iconos reales de la ciudad.

  Más ciudades podrán añadirse progresivamente.
*/
const CURATED = {
  madrid: {
    essentials: [
      "Puerta del Sol",
      "Palacio Real de Madrid",
      "Catedral de la Almudena",
      "Plaza Mayor",
      "Fuente de Cibeles",
      "Gran Vía",
      "Banco de España",
      "Plaza de España",
      "Templo de Debod",
      "Parque del Retiro"
    ],

    museums: [
      "Museo del Prado",
      "Museo Nacional Centro de Arte Reina Sofía",
      "Museo Thyssen-Bornemisza",
      "Museo Arqueológico Nacional",
      "Museo Cerralbo"
    ],

    shopping: [
      "Gran Vía",
      "Calle de Preciados",
      "Calle de Serrano",
      "Barrio de Salamanca",
      "El Rastro"
    ],

    markets: [
      "Mercado de San Miguel"
    ],

    malls: [
      "Príncipe Pío",
      "La Vaguada",
      "ABC Serrano",
      "Plaza Río 2"
    ]
  }
};

function cityKey(city) {
  return city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
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
      `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
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

    const curated =
      CURATED[cityKey(city)];

    let essentials = [];
    let museums = [];
    let shopping = [];
    let markets = [];
    let malls = [];

    if (curated) {
      essentials = await resolveNamedPlaces(
        curated.essentials,
        city,
        country,
        "essential",
        lat,
        lon
      );

      museums = await resolveNamedPlaces(
        curated.museums,
        city,
        country,
        "museum",
        lat,
        lon
      );

      shopping = await resolveNamedPlaces(
        curated.shopping,
        city,
        country,
        "shopping",
        lat,
        lon
      );

      markets = await resolveNamedPlaces(
        curated.markets,
        city,
        country,
        "market",
        lat,
        lon
      );

      malls = await resolveNamedPlaces(
        curated.malls,
        city,
        country,
        "mall",
        lat,
        lon
      );
    } else {
      essentials = unique(
        await searchMany(
          [
            `monumentos principales ${city}, ${country}`,
            `lugares emblemáticos ${city}, ${country}`,
            `plazas famosas ${city}, ${country}`,
            `atracciones turísticas ${city}, ${country}`
          ],
          "essential",
          lat,
          lon
        )
      ).slice(0, 10);

      museums = unique(
        await searchMany(
          [
            `museos ${city}, ${country}`
          ],
          "museum",
          lat,
          lon
        )
      ).slice(0, 5);

      shopping = unique(
        await searchMany(
          [
            `calle comercial ${city}, ${country}`,
            `zona de compras ${city}, ${country}`
          ],
          "shopping",
          lat,
          lon
        )
      ).slice(0, 5);

      markets = unique(
        await searchMany(
          [
            `mercado municipal ${city}, ${country}`,
            `mercado central ${city}, ${country}`
          ],
          "market",
          lat,
          lon
        )
      ).slice(0, 3);

      malls = unique(
        await searchMany(
          [
            `centro comercial ${city}, ${country}`
          ],
          "mall",
          lat,
          lon
        )
      ).slice(0, 5);
    }

    /*
      Si una ciudad curada devuelve algún resultado
      incompleto, completamos solamente los huecos.
    */
    if (essentials.length < 10) {
      const extra = await searchMany(
        [
          `lugares emblemáticos ${city}, ${country}`,
          `monumentos ${city}, ${country}`,
          `atracciones turísticas ${city}, ${country}`
        ],
        "essential",
        lat,
        lon
      );

      essentials = unique([
        ...essentials,
        ...extra
      ]).slice(0, 10);
    }

    return res.json({
      version: VERSION,
      city,

      places: essentials
        .slice(0, 10)
        .map((p, i) => ({
          ...p,
          order: i + 1
        })),

      museums: museums.slice(0, 5),

      shoppingAreas: shopping.slice(0, 5),

      markets: markets.slice(0, 3),

      shoppingCenters: malls.slice(0, 5)
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error:
        "No se pudieron obtener los datos de la ciudad"
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
      `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
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

    return res.json({
      extract: data.extract || ""
    });
  } catch {
    return res.json({ extract: "" });
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
