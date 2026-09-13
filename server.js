import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const DIR = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());

const SERVERS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];

function score(t, name) {
  let s = 0;

  if (t.wikipedia) s += 180;
  if (t.wikidata) s += 120;
  if (t.historic === "castle") s += 80;
  if (t.building === "cathedral") s += 80;
  if (t.tourism === "museum") s += 60;
  if (t.historic === "archaeological_site") s += 60;
  if (t.tourism === "attraction") s += 50;
  if (t.historic === "monument") s += 35;
  if (t.amenity === "theatre") s += 25;
  if (t.place === "square") s += 20;

  if (/placa|cementerio|memorial|busto/i.test(name)) s -= 80;

  return s;
}

app.get("/api/places", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: "Coordenadas incorrectas" });
  }

  const query = `[out:json][timeout:25];
  (
    nwr(around:9000,${lat},${lon})["tourism"="attraction"]["name"];
    nwr(around:9000,${lat},${lon})["tourism"="museum"]["name"];
    nwr(around:9000,${lat},${lon})["historic"]["name"];
    nwr(around:9000,${lat},${lon})["building"="cathedral"]["name"];
    nwr(around:9000,${lat},${lon})["amenity"="theatre"]["name"];
    nwr(around:9000,${lat},${lon})["place"="square"]["name"];
  );
  out center tags;`;

  for (const endpoint of SERVERS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: `data=${encodeURIComponent(query)}`
      });

      if (!response.ok) continue;

      const data = await response.json();
      const seen = new Set();

      const places = (data.elements || [])
        .map(x => {
          const t = x.tags || {};
          const name = t["name:es"] || t.name;
          const plat = x.lat ?? x.center?.lat;
          const plon = x.lon ?? x.center?.lon;

          if (!name || plat == null || plon == null) return null;

          return {
            name,
            lat: Number(plat),
            lon: Number(plon),
            score: score(t, name),
            wikipedia: t.wikipedia || "",
            description:
              t["description:es"] || t.description || ""
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .filter(p => {
          const key = p.name.toLowerCase();

          if (seen.has(key)) return false;

          seen.add(key);
          return true;
        })
        .slice(0, 10);

      if (places.length) {
        return res.json({ places });
      }
    } catch (error) {
      console.error(error);
    }
  }

  res.status(503).json({
    error: "No se pudieron obtener los lugares turísticos"
  });
});

app.get("/api/wiki", async (req, res) => {
  const title = String(req.query.title || "").trim();

  if (!title) return res.json({ extract: "" });

  try {
    const response = await fetch(
      `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );

    if (!response.ok) return res.json({ extract: "" });

    const data = await response.json();

    res.json({ extract: data.extract || "" });
  } catch {
    res.json({ extract: "" });
  }
});

app.use(express.static(path.join(DIR, "dist")));

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(DIR, "dist", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`RI Audio Guía funcionando en puerto ${PORT}`);
});
