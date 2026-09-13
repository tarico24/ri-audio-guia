import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const DIR = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());

function scorePlace(p) {
  const type = (p.type || "").toLowerCase();
  const cls = (p.class || "").toLowerCase();
  const name = (p.display_name || "").toLowerCase();

  let score = 0;

  if (cls === "tourism") score += 50;
  if (cls === "historic") score += 70;

  if (
    type.includes("cathedral") ||
    name.includes("catedral")
  ) score += 100;

  if (
    type.includes("castle") ||
    name.includes("alcazaba") ||
    name.includes("castillo")
  ) score += 90;

  if (
    type.includes("museum") ||
    name.includes("museo")
  ) score += 75;

  if (
    name.includes("teatro romano") ||
    name.includes("roman theatre")
  ) score += 90;

  if (
    type.includes("monument") ||
    type.includes("attraction")
  ) score += 55;

  if (
    name.includes("plaza") ||
    name.includes("square")
  ) score += 25;

  if (
    name.includes("placa") ||
    name.includes("cementerio") ||
    name.includes("busto")
  ) score -= 100;

  return score;
}

async function nominatimSearch(query, limit = 10) {
  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?format=jsonv2&limit=${limit}` +
    `&addressdetails=1&extratags=1&namedetails=1` +
    `&q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "es",
      "User-Agent": "RI-Audio-Guia/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim ${response.status}`);
  }

  return response.json();
}

app.get("/api/places", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const city = String(req.query.city || "").trim();

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({
      error: "Coordenadas incorrectas"
    });
  }

  try {
    let cityName = city;

    if (!cityName) {
      const reverse = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
        {
          headers: {
            "Accept-Language": "es",
            "User-Agent": "RI-Audio-Guia/1.0"
          }
        }
      );

      if (reverse.ok) {
        const data = await reverse.json();

        cityName =
          data.address?.city ||
          data.address?.town ||
          data.address?.municipality ||
          data.address?.village ||
          "";
      }
    }

    const searches = [
      `turismo ${cityName}`,
      `monumentos ${cityName}`,
      `museos ${cityName}`,
      `historic ${cityName}`,
      `attractions ${cityName}`
    ];

    const all = [];

    for (const query of searches) {
      try {
        const results = await nominatimSearch(query, 10);
        all.push(...results);
      } catch (e) {
        console.error(e);
      }
    }

    const seen = new Set();

    const places = all
      .map(p => {
        const name =
          p.namedetails?.["name:es"] ||
          p.namedetails?.name ||
          p.name ||
          p.display_name?.split(",")[0];

        if (!name) return null;

        return {
          name,
          lat: Number(p.lat),
          lon: Number(p.lon),
          score: scorePlace(p),
          wikipedia:
            p.extratags?.wikipedia || "",
          description:
            p.extratags?.description || ""
        };
      })
      .filter(p =>
        p &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon)
      )
      .sort((a, b) => b.score - a.score)
      .filter(p => {
        const key = p.name.toLowerCase();

        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      })
      .slice(0, 10);

    return res.json({ places });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "No se pudieron obtener los lugares turísticos"
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
    `RI Audio Guía funcionando en puerto ${PORT}`
  );
});
