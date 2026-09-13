import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const DIR = path.dirname(fileURLToPath(import.meta.url));

const VERSION = "0.6.1";
const NOMINATIM = "https://nominatim.openstreetmap.org";

app.use(express.json());

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function normalize(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

async function nominatimSearch(query, limit = 5) {
  const url =
    `${NOMINATIM}/search?format=jsonv2` +
    `&limit=${limit}` +
    `&addressdetails=1` +
    `&extratags=1` +
    `&namedetails=1` +
    `&q=${encodeURIComponent(query)}`;

  const r = await fetch(url, {
    headers: {
      "Accept-Language": "es",
      "User-Agent": `RI-Audio-Guia/${VERSION}`
    }
  });

  if (!r.ok) {
    throw new Error(`Nominatim ${r.status}`);
  }

  const data = await r.json();

  /*
    Nominatim público limita las peticiones.
    Dejamos una pausa para no bombardear el servicio.
  */
  await sleep(1050);

  return data;
}

function makePlace(
  p,
  category,
  centerLat,
  centerLon,
  maxDistance = 12
) {
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
  ) {
    return null;
  }

  const distance = distanceKm(
    centerLat,
    centerLon,
    lat,
    lon
  );

  if (distance > maxDistance) {
    return null;
  }

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

function unique(list) {
  const seen = new Set();

  return list.filter(item => {
    const key = normalize(item.name)
      .replace(/[^\p{L}\p{N}]/gu, "");

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

/*
  SELECCIÓN EDITORIAL.

  Para ciudades ya revisadas usamos los lugares
  realmente importantes, no una clasificación
  automática de Nominatim.
*/

const CURATED = {
  madrid: {
    essentials: [
      "Puerta del Sol",
      "Plaza Mayor de Madrid",
      "Palacio Real de Madrid",
      "Catedral de la Almudena",
      "Gran Vía Madrid",
      "Plaza de Cibeles Madrid",
      "Banco de España Madrid",
      "Plaza de España Madrid",
      "Templo de Debod",
      "Parque del Retiro Madrid"
    ],

    museums: [
      "Museo del Prado",
      "Museo Nacional Centro de Arte Reina Sofía",
      "Museo Thyssen-Bornemisza",
      "Museo Arqueológico Nacional Madrid",
      "Museo Cerralbo Madrid"
    ],

    shopping: [
      "Gran Vía Madrid",
      "Calle de Preciados Madrid",
      "Calle de Serrano Madrid",
      "Barrio de Salamanca Madrid",
      "El Rastro Madrid"
    ],

    markets: [
      "Mercado de San Miguel Madrid"
    ],

    malls: [
      "Centro Comercial Príncipe Pío Madrid",
      "Centro Comercial La Vaguada Madrid",
      "ABC Serrano Madrid",
      "Plaza Río 2 Madrid"
    ]
  },

  malaga: {
    /*
      Calle Larios y Plaza de la Constitución
      entran expresamente en los 10 principales.
    */
    essentials: [
      "Alcazaba de Málaga",
      "Catedral de Málaga",
      "Plaza de la Constitución Málaga",
      "Calle Marqués de Larios Málaga",
      "Teatro Romano de Málaga",
      "Plaza de la Merced Málaga",
      "Castillo de Gibralfaro Málaga",
      "Muelle Uno Málaga",
      "Playa de la Malagueta Málaga",
      "Mercado Central de Atarazanas Málaga"
    ],

    museums: [
      "Museo Picasso Málaga",
      "Centre Pompidou Málaga",
      "Museo Carmen Thyssen Málaga",
      "Museo de Málaga",
      "Museo Automovilístico y de la Moda Málaga"
    ],

    shopping: [
      "Calle Marqués de Larios Málaga",
      "Plaza de la Constitución Málaga",
      "Calle Nueva Málaga",
      "Alameda Principal Málaga",
      "Soho Málaga"
    ],

    markets: [
      "Mercado Central de Atarazanas Málaga"
    ],

    malls: [
      "Larios Centro Málaga",
      "Vialia Centro Comercial Málaga",
      "Plaza Mayor Málaga",
      "Málaga Nostrum"
    ]
  },

  toledo: {
    essentials: [
      "Catedral Primada de Toledo",
      "Alcázar de Toledo",
      "Plaza de Zocodover Toledo",
      "Monasterio de San Juan de los Reyes Toledo",
      "Sinagoga de Santa María la Blanca Toledo",
      "Sinagoga del Tránsito Toledo",
      "Iglesia de Santo Tomé Toledo",
      "Puerta de Bisagra Toledo",
      "Puente de San Martín Toledo",
      "Mirador del Valle Toledo"
    ],

    museums: [
      "Museo del Greco Toledo",
      "Museo de Santa Cruz Toledo",
      "Museo Sefardí Toledo",
      "Museo de los Concilios Toledo"
    ],

    shopping: [
      "Calle Comercio Toledo",
      "Plaza de Zocodover Toledo",
      "Calle Santo Tomé Toledo"
    ],

    markets: [],

    malls: []
  }
};

async function resolveOne(
  name,
  city,
  country,
  category,
  centerLat,
  centerLon
) {
  /*
    Probamos primero la consulta completa.
  */

  const queries = [
    `${name}, ${city}, ${country}`,
    `${name}, ${country}`,
    name
  ];

  for (const query of queries) {
    try {
      const data = await nominatimSearch(
        query,
        5
      );

      const candidates = data
        .map(p =>
          makePlace(
            p,
            category,
            centerLat,
            centerLon,
            15
          )
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.distance - b.distance
        );

      if (candidates.length) {
        return candidates[0];
      }
    } catch (error) {
      console.error(
        "resolveOne",
        query,
        error.message
      );
    }
  }

  return null;
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
    const item = await resolveOne(
      name,
      city,
      country,
      category,
      lat,
      lon
    );

    if (item) {
      result.push(item);
    }
  }

  return unique(result);
}

/*
  Obtiene primero el centro REAL de la ciudad.

  Esto evita usar como centro del mapa una coordenada
  administrativa situada kilómetros fuera del casco
  urbano.
*/

async function resolveCityCenter(
  city,
  country,
  fallbackLat,
  fallbackLon
) {
  if (!city) {
    return {
      lat: fallbackLat,
      lon: fallbackLon
    };
  }

  try {
    const data = await nominatimSearch(
      `${city}, ${country}`,
      10
    );

    const preferred =
      data.find(
        x =>
          ["city", "town", "municipality"].includes(
            x.addresstype
          )
      ) || data[0];

    if (preferred) {
      return {
        lat: Number(preferred.lat),
        lon: Number(preferred.lon)
      };
    }
  } catch (error) {
    console.error(
      "resolveCityCenter",
      error.message
    );
  }

  return {
    lat: fallbackLat,
    lon: fallbackLon
  };
}

async function genericPlaces(
  city,
  country,
  lat,
  lon
) {
  const queries = [
    `atracciones turísticas ${city}, ${country}`,
    `monumentos ${city}, ${country}`,
    `plaza ${city}, ${country}`,
    `castillo ${city}, ${country}`,
    `catedral ${city}, ${country}`,
    `casco histórico ${city}, ${country}`
  ];

  const result = [];

  for (const query of queries) {
    try {
      const data = await nominatimSearch(
        query,
        10
      );

      for (const p of data) {
        const item = makePlace(
          p,
          "essential",
          lat,
          lon,
          10
        );

        if (item) {
          result.push(item);
        }
      }

      if (unique(result).length >= 10) {
        break;
      }
    } catch (error) {
      console.error(
        query,
        error.message
      );
    }
  }

  return unique(result)
    .sort(
      (a, b) =>
        a.distance - b.distance
    )
    .slice(0, 10);
}

async function genericCategory(
  query,
  city,
  country,
  category,
  lat,
  lon,
  limit
) {
  try {
    const data = await nominatimSearch(
      `${query} ${city}, ${country}`,
      20
    );

    return unique(
      data
        .map(p =>
          makePlace(
            p,
            category,
            lat,
            lon,
            12
          )
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.distance - b.distance
        )
    ).slice(0, limit);
  } catch {
    return [];
  }
}

app.get("/api/places", async (req, res) => {
  const suppliedLat = Number(req.query.lat);
  const suppliedLon = Number(req.query.lon);

  if (
    !Number.isFinite(suppliedLat) ||
    !Number.isFinite(suppliedLon)
  ) {
    return res.status(400).json({
      error: "Coordenadas incorrectas"
    });
  }

  try {
    /*
      Primero averiguamos en qué ciudad estamos.
    */

    const reverse = await fetch(
      `${NOMINATIM}/reverse?format=jsonv2&lat=${suppliedLat}&lon=${suppliedLon}`,
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

    const center = await resolveCityCenter(
      city,
      country,
      suppliedLat,
      suppliedLon
    );

    const lat = center.lat;
    const lon = center.lon;

    const curated =
      CURATED[normalize(city)];

    let places = [];
    let museums = [];
    let shoppingAreas = [];
    let markets = [];
    let shoppingCenters = [];

    if (curated) {
      places = await resolveNamedPlaces(
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

      shoppingAreas = await resolveNamedPlaces(
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

      shoppingCenters = await resolveNamedPlaces(
        curated.malls,
        city,
        country,
        "mall",
        lat,
        lon
      );
    } else {
      places = await genericPlaces(
        city,
        country,
        lat,
        lon
      );

      museums = await genericCategory(
        "museos",
        city,
        country,
        "museum",
        lat,
        lon,
        5
      );

      shoppingAreas = await genericCategory(
        "calle comercial",
        city,
        country,
        "shopping",
        lat,
        lon,
        5
      );

      markets = await genericCategory(
        "mercado",
        city,
        country,
        "market",
        lat,
        lon,
        3
      );

      shoppingCenters = await genericCategory(
        "centro comercial",
        city,
        country,
        "mall",
        lat,
        lon,
        5
      );
    }

    /*
      Si una ciudad curada pierde algún resultado,
      intentamos completar hasta diez sin borrar
      los lugares editoriales encontrados.
    */

    if (places.length < 10) {
      const extras = await genericPlaces(
        city,
        country,
        lat,
        lon
      );

      places = unique([
        ...places,
        ...extras
      ]).slice(0, 10);
    }

    return res.json({
      version: VERSION,
      city,
      center: {
        lat,
        lon
      },

      places: places.map(
        (p, index) => ({
          ...p,
          order: index + 1
        })
      ),

      museums,
      shoppingAreas,
      markets,
      shoppingCenters
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
    return res.json({
      extract: ""
    });
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
      return res.json({
        extract: ""
      });
    }

    const data = await r.json();

    return res.json({
      extract: data.extract || ""
    });
  } catch {
    return res.json({
      extract: ""
    });
  }
});

app.use(
  express.static(
    path.join(DIR, "dist")
  )
);

app.get("/{*splat}", (req, res) => {
  res.sendFile(
    path.join(
      DIR,
      "dist",
      "index.html"
    )
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `RI Audio Guía v${VERSION} funcionando en puerto ${PORT}`
  );
});
