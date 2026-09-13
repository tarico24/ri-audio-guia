import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const DIR = path.dirname(fileURLToPath(import.meta.url));

const VERSION = "0.6.2";
const NOMINATIM = "https://nominatim.openstreetmap.org";

app.use(express.json());

function normalize(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function point(name, lat, lon, category, wikipedia = "") {
  return {
    name,
    lat,
    lon,
    category,
    wikipedia,
    description: ""
  };
}

/*
  CIUDADES CURADAS
  Coordenadas directas = respuesta rápida y estable.
*/

const CURATED = {
  malaga: {
    name: "Málaga",
    center: { lat: 36.7213, lon: -4.4214 },

    places: [
      point("Alcazaba de Málaga", 36.7215, -4.4167, "essential", "es:Alcazaba_de_Málaga"),
      point("Catedral de Málaga", 36.7200, -4.4201, "essential", "es:Catedral_de_Málaga"),
      point("Plaza de la Constitución", 36.7201, -4.4228, "essential"),
      point("Calle Marqués de Larios", 36.7188, -4.4224, "essential"),
      point("Teatro Romano de Málaga", 36.7217, -4.4170, "essential", "es:Teatro_romano_de_Málaga"),
      point("Plaza de la Merced", 36.7232, -4.4178, "essential", "es:Plaza_de_la_Merced_(Málaga)"),
      point("Castillo de Gibralfaro", 36.7236, -4.4108, "essential", "es:Castillo_de_Gibralfaro"),
      point("Muelle Uno", 36.7168, -4.4145, "essential"),
      point("Playa de la Malagueta", 36.7163, -4.4064, "essential", "es:La_Malagueta_(Málaga)"),
      point("Mercado Central de Atarazanas", 36.7180, -4.4245, "essential", "es:Mercado_Central_de_Atarazanas")
    ],

    museums: [
      point("Museo Picasso Málaga", 36.7210, -4.4184, "museum", "es:Museo_Picasso_Málaga"),
      point("Centre Pompidou Málaga", 36.7193, -4.4124, "museum", "es:Centre_Pompidou_Málaga"),
      point("Museo Carmen Thyssen Málaga", 36.7202, -4.4234, "museum", "es:Museo_Carmen_Thyssen_Málaga"),
      point("Museo de Málaga", 36.7208, -4.4158, "museum", "es:Museo_de_Málaga"),
      point("Museo Automovilístico y de la Moda", 36.6990, -4.4394, "museum")
    ],

    shoppingAreas: [
      point("Calle Marqués de Larios", 36.7188, -4.4224, "shopping"),
      point("Plaza de la Constitución", 36.7201, -4.4228, "shopping"),
      point("Calle Nueva", 36.7191, -4.4235, "shopping"),
      point("Alameda Principal", 36.7173, -4.4230, "shopping"),
      point("Soho Málaga", 36.7158, -4.4230, "shopping")
    ],

    markets: [
      point("Mercado Central de Atarazanas", 36.7180, -4.4245, "market")
    ],

    shoppingCenters: [
      point("Larios Centro", 36.7117, -4.4328, "mall"),
      point("Vialia Málaga", 36.7110, -4.4326, "mall"),
      point("Málaga Nostrum", 36.6858, -4.4586, "mall"),
      point("Plaza Mayor", 36.6563, -4.4805, "mall")
    ]
  },

  madrid: {
    name: "Madrid",
    center: { lat: 40.4168, lon: -3.7038 },

    places: [
      point("Puerta del Sol", 40.4169, -3.7035, "essential", "es:Puerta_del_Sol"),
      point("Plaza Mayor", 40.4155, -3.7074, "essential", "es:Plaza_Mayor_de_Madrid"),
      point("Palacio Real de Madrid", 40.4179, -3.7143, "essential", "es:Palacio_Real_de_Madrid"),
      point("Catedral de la Almudena", 40.4156, -3.7145, "essential", "es:Catedral_de_la_Almudena"),
      point("Gran Vía", 40.4200, -3.7060, "essential", "es:Gran_Vía"),
      point("Plaza de Cibeles", 40.4193, -3.6931, "essential", "es:Plaza_de_Cibeles"),
      point("Banco de España", 40.4181, -3.6940, "essential", "es:Banco_de_España"),
      point("Plaza de España", 40.4230, -3.7115, "essential", "es:Plaza_de_España_(Madrid)"),
      point("Templo de Debod", 40.4240, -3.7178, "essential", "es:Templo_de_Debod"),
      point("Parque del Retiro", 40.4153, -3.6844, "essential", "es:Parque_del_Retiro_de_Madrid")
    ],

    museums: [
      point("Museo del Prado", 40.4138, -3.6921, "museum", "es:Museo_del_Prado"),
      point("Museo Reina Sofía", 40.4086, -3.6944, "museum", "es:Museo_Nacional_Centro_de_Arte_Reina_Sofía"),
      point("Museo Thyssen-Bornemisza", 40.4160, -3.6949, "museum", "es:Museo_Thyssen-Bornemisza"),
      point("Museo Arqueológico Nacional", 40.4234, -3.6894, "museum"),
      point("Museo Cerralbo", 40.4237, -3.7148, "museum")
    ],

    shoppingAreas: [
      point("Gran Vía", 40.4200, -3.7060, "shopping"),
      point("Calle de Preciados", 40.4182, -3.7060, "shopping"),
      point("Calle de Serrano", 40.4254, -3.6872, "shopping"),
      point("Barrio de Salamanca", 40.4257, -3.6855, "shopping"),
      point("El Rastro", 40.4098, -3.7073, "shopping")
    ],

    markets: [
      point("Mercado de San Miguel", 40.4154, -3.7089, "market")
    ],

    shoppingCenters: [
      point("Príncipe Pío", 40.4211, -3.7205, "mall"),
      point("La Vaguada", 40.4791, -3.7084, "mall"),
      point("ABC Serrano", 40.4320, -3.6864, "mall"),
      point("Plaza Río 2", 40.3916, -3.7014, "mall")
    ]
  },

  toledo: {
    name: "Toledo",
    center: { lat: 39.8628, lon: -4.0273 },

    places: [
      point("Catedral Primada de Toledo", 39.8579, -4.0236, "essential", "es:Catedral_de_Toledo"),
      point("Alcázar de Toledo", 39.8585, -4.0206, "essential", "es:Alcázar_de_Toledo"),
      point("Plaza de Zocodover", 39.8601, -4.0216, "essential", "es:Plaza_de_Zocodover"),
      point("Monasterio de San Juan de los Reyes", 39.8575, -4.0304, "essential", "es:Monasterio_de_San_Juan_de_los_Reyes"),
      point("Santa María la Blanca", 39.8566, -4.0293, "essential", "es:Sinagoga_de_Santa_María_la_Blanca"),
      point("Sinagoga del Tránsito", 39.8557, -4.0294, "essential", "es:Sinagoga_del_Tránsito"),
      point("Iglesia de Santo Tomé", 39.8566, -4.0275, "essential", "es:Iglesia_de_Santo_Tomé_(Toledo)"),
      point("Puerta de Bisagra", 39.8634, -4.0278, "essential", "es:Puerta_de_Bisagra"),
      point("Puente de San Martín", 39.8558, -4.0349, "essential", "es:Puente_de_San_Martín_(Toledo)"),
      point("Mirador del Valle", 39.8527, -4.0205, "essential")
    ],

    museums: [
      point("Museo del Greco", 39.8557, -4.0291, "museum", "es:Museo_del_Greco"),
      point("Museo de Santa Cruz", 39.8601, -4.0204, "museum", "es:Museo_de_Santa_Cruz"),
      point("Museo Sefardí", 39.8557, -4.0294, "museum", "es:Museo_Sefardí"),
      point("Museo de los Concilios", 39.8576, -4.0254, "museum")
    ],

    shoppingAreas: [
      point("Calle Comercio", 39.8593, -4.0231, "shopping"),
      point("Plaza de Zocodover", 39.8601, -4.0216, "shopping"),
      point("Calle Santo Tomé", 39.8567, -4.0271, "shopping")
    ],

    markets: [],
    shoppingCenters: []
  }
};

function detectCuratedCity(lat, lon) {
  let best = null;
  let bestDistance = Infinity;

  for (const [key, city] of Object.entries(CURATED)) {
    const dx = lat - city.center.lat;
    const dy = lon - city.center.lon;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = key;
    }
  }

  return bestDistance < 0.35 ? best : null;
}

async function nominatimSearch(query, limit = 10) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    4500
  );

  try {
    const r = await fetch(
      `${NOMINATIM}/search?format=jsonv2&limit=${limit}&addressdetails=1&extratags=1&namedetails=1&q=${encodeURIComponent(query)}`,
      {
        headers: {
          "Accept-Language": "es",
          "User-Agent": `RI-Audio-Guia/${VERSION}`
        },
        signal: controller.signal
      }
    );

    if (!r.ok) {
      throw new Error(`Nominatim ${r.status}`);
    }

    return await r.json();
  } finally {
    clearTimeout(timeout);
  }
}

function genericPlace(p, category) {
  const lat = Number(p.lat);
  const lon = Number(p.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    name:
      p.namedetails?.["name:es"] ||
      p.namedetails?.name ||
      p.name ||
      p.display_name?.split(",")[0] ||
      "Lugar de interés",

    lat,
    lon,
    category,
    wikipedia: p.extratags?.wikipedia || "",
    description: p.extratags?.description || ""
  };
}

async function genericCity(lat, lon) {
  let cityName = "Ciudad";

  try {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      4000
    );

    const r = await fetch(
      `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      {
        headers: {
          "Accept-Language": "es",
          "User-Agent": `RI-Audio-Guia/${VERSION}`
        },
        signal: controller.signal
      }
    );

    clearTimeout(timeout);

    if (r.ok) {
      const d = await r.json();

      cityName =
        d.address?.city ||
        d.address?.town ||
        d.address?.municipality ||
        d.address?.village ||
        "Ciudad";
    }
  } catch {}

  const queries = [
    `atracciones turísticas ${cityName}`,
    `monumentos ${cityName}`,
    `museos ${cityName}`,
    `centro comercial ${cityName}`
  ];

  const results = await Promise.allSettled(
    queries.map(q => nominatimSearch(q, 10))
  );

  const attractions = [
    ...(results[0].status === "fulfilled"
      ? results[0].value
      : []),
    ...(results[1].status === "fulfilled"
      ? results[1].value
      : [])
  ]
    .map(p => genericPlace(p, "essential"))
    .filter(Boolean);

  const seen = new Set();

  const places = attractions
    .filter(p => {
      const key = normalize(p.name);

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .slice(0, 10);

  const museums =
    results[2].status === "fulfilled"
      ? results[2].value
          .map(p => genericPlace(p, "museum"))
          .filter(Boolean)
          .slice(0, 5)
      : [];

  const shoppingCenters =
    results[3].status === "fulfilled"
      ? results[3].value
          .map(p => genericPlace(p, "mall"))
          .filter(Boolean)
          .slice(0, 5)
      : [];

  return {
    city: cityName,
    center: { lat, lon },
    places,
    museums,
    shoppingAreas: [],
    markets: [],
    shoppingCenters
  };
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

  const curatedKey = detectCuratedCity(lat, lon);

  if (curatedKey) {
    const c = CURATED[curatedKey];

    return res.json({
      version: VERSION,
      city: c.name,
      center: c.center,

      places: c.places.map((p, i) => ({
        ...p,
        order: i + 1
      })),

      museums: c.museums,
      shoppingAreas: c.shoppingAreas,
      markets: c.markets,
      shoppingCenters: c.shoppingCenters
    });
  }

  try {
    const data = await genericCity(lat, lon);

    return res.json({
      version: VERSION,
      ...data,
      places: data.places.map((p, i) => ({
        ...p,
        order: i + 1
      }))
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
  const title = String(req.query.title || "").trim();

  if (!title) {
    return res.json({ extract: "" });
  }

  try {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      5000
    );

    const r = await fetch(
      `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      {
        headers: {
          "User-Agent": `RI-Audio-Guia/${VERSION}`
        },
        signal: controller.signal
      }
    );

    clearTimeout(timeout);

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
  express.static(path.join(DIR, "dist"))
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
