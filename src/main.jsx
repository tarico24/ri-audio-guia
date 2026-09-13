import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OVERPASS_SERVERS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];
const WIKI = "https://es.wikipedia.org/api/rest_v1/page/summary/";
const esc = encodeURIComponent;

function distance(a, b) {
  const R = 6371;
  const dLat = (b.lat-a.lat)*Math.PI/180;
  const dLon = (b.lon-a.lon)*Math.PI/180;
  const x = Math.sin(dLat/2)**2 +
    Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function optimiseRoute(points, start) {
  const remaining=[...points], ordered=[];
  let current=start;
  while(remaining.length){
    remaining.sort((a,b)=>distance(current,a)-distance(current,b));
    const next=remaining.shift();
    ordered.push(next); current=next;
  }
  return ordered;
}

function App(){
  const [q,setQ]=useState("");
  const [city,setCity]=useState(null);
  const [places,setPlaces]=useState([]);
  const [msg,setMsg]=useState("Busca una ciudad o utiliza tu ubicación.");
  const [speaking,setSpeaking]=useState(null);
  const mapRef=useRef(null);
  const layersRef=useRef([]);

  useEffect(()=>{ navigator.serviceWorker?.register("/sw.js").catch(()=>{}); },[]);

  useEffect(()=>{
    if(!city)return;
    mapRef.current?.remove();
    const m=L.map("map").setView([city.lat,city.lon],14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      attribution:"© OpenStreetMap"
    }).addTo(m);
    mapRef.current=m;
    return()=>{};
  },[city]);

  useEffect(()=>{
    const m=mapRef.current;
    if(!m || !places.length)return;
    layersRef.current.forEach(x=>x.remove());
    layersRef.current=[];
    const coords=[];
    places.forEach((p,i)=>{
      const icon=L.divIcon({
        className:"ri-number-icon",
        html:`<div style="background:#111;color:#fff;border:3px solid #fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-weight:800;box-shadow:0 2px 8px #0006">${i+1}</div>`,
        iconSize:[34,34],iconAnchor:[17,17]
      });
      const marker=L.marker([p.lat,p.lon],{icon}).addTo(m)
        .bindPopup(`<b>${i+1}. ${p.name}</b>`);
      layersRef.current.push(marker);
      coords.push([p.lat,p.lon]);
    });
    const line=L.polyline(coords,{weight:4,opacity:.7}).addTo(m);
    layersRef.current.push(line);
    m.fitBounds(L.latLngBounds(coords),{padding:[35,35]});
  },[places]);

  async function search(){
    if(!q.trim())return;
    setMsg("Buscando ciudad…");
    try{
      const r=await fetch(`${NOMINATIM}/search?format=jsonv2&limit=5&addressdetails=1&q=${esc(q)}`,{
        headers:{"Accept-Language":"es"}
      });
      const d=await r.json();
      if(!d.length){setMsg("No encuentro esa ciudad.");return;}
      const x=d[0];
      const shortName=x.address?.city||x.address?.town||x.address?.village||x.name||q;
      const c={name:x.display_name,shortName,lat:+x.lat,lon:+x.lon};
      setCity(c); remember(shortName); await loadPlaces(c);
    }catch{setMsg("No se ha podido realizar la búsqueda.");}
  }

  async function loadPlaces(c){
    setPlaces([]); setMsg(`Seleccionando los lugares imprescindibles de ${c.shortName}…`);
    const query=`[out:json][timeout:30];
    (
      nwr(around:9000,${c.lat},${c.lon})["tourism"="attraction"]["name"];
      nwr(around:9000,${c.lat},${c.lon})["tourism"="museum"]["name"];
      nwr(around:9000,${c.lat},${c.lon})["historic"]["name"];
      nwr(around:9000,${c.lat},${c.lon})["building"="cathedral"]["name"];
      nwr(around:9000,${c.lat},${c.lon})["amenity"="theatre"]["name"];
      nwr(around:9000,${c.lat},${c.lon})["place"="square"]["name"];
    );out center tags;`;
    try{
      let data=null;
      for (const endpoint of OVERPASS_SERVERS) {
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),12000);
        try {
          const r=await fetch(endpoint,{
            method:"POST",
            headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
            body:`data=${encodeURIComponent(query)}`,
            signal:controller.signal
          });
          clearTimeout(timer);
          if(!r.ok)continue;
          data=await r.json();
          if(data?.elements?.length)break;
        } catch(e) {
          clearTimeout(timer);
        }
      }
      if(!data?.elements?.length)throw new Error("Sin resultados");
      const seen=new Set();
      const candidates=data.elements.map(x=>{
        const t=x.tags||{}, name=t["name:es"]||t.name;
        const lat=x.lat??x.center?.lat, lon=x.lon??x.center?.lon;
        if(!name||lat==null||lon==null)return null;
        let score=0;
        if(t.wikipedia)score+=150;
        if(t.wikidata)score+=100;
        if(t.website)score+=10;
        if(t.historic==="castle")score+=70;
        if(t.building==="cathedral")score+=70;
        if(t.tourism==="museum")score+=55;
        if(t.tourism==="attraction")score+=45;
        if(t.historic==="archaeological_site")score+=55;
        if(t.historic==="monument")score+=35;
        if(t.amenity==="theatre")score+=25;
        if(t.place==="square")score+=20;
        const low=name.toLowerCase();
        if(/placa|memorial|cementerio|fuente|busto|estatua/.test(low))score-=60;
        return {name,lat:+lat,lon:+lon,score,wikipedia:t.wikipedia||"",
          description:t["description:es"]||t.description||""};
      }).filter(Boolean).sort((a,b)=>b.score-a.score).filter(p=>{
        const k=p.name.toLowerCase(); if(seen.has(k))return false; seen.add(k); return true;
      });
      const top=candidates.slice(0,10);
      const ordered=optimiseRoute(top,{lat:c.lat,lon:c.lon});
      setPlaces(ordered);
      setMsg(ordered.length===10?`10 lugares seleccionados en ${c.shortName}.`:
        `${ordered.length} lugares turísticos encontrados en ${c.shortName}.`);
    }catch{setMsg("No se han podido cargar los lugares turísticos.");}
  }

  async function locate(){
    if(!navigator.geolocation){setMsg("Este dispositivo no permite obtener la ubicación.");return;}
    setMsg("Solicitando tu ubicación…");
    navigator.geolocation.getCurrentPosition(async p=>{
      try{
        const lat=p.coords.latitude,lon=p.coords.longitude;
        const r=await fetch(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,{
          headers:{"Accept-Language":"es"}
        });
        const x=await r.json();
        const shortName=x.address?.city||x.address?.town||x.address?.village||x.name||"Tu ubicación";
        const c={name:x.display_name,shortName,lat,lon};
        setCity(c);remember(shortName);await loadPlaces(c);
      }catch{setMsg("He obtenido tu posición, pero no he podido identificar la ciudad.");}
    },()=>setMsg("No se ha podido acceder a tu ubicación."),{enableHighAccuracy:true});
  }

  async function wikiText(p){
    let title=p.name;
    if(p.wikipedia){
      const parts=p.wikipedia.split(":");
      title=parts.slice(1).join(":")||p.name;
    }
    try{
      const r=await fetch(WIKI+esc(title));
      if(!r.ok)return "";
      const d=await r.json();
      return d.extract||"";
    }catch{return "";}
  }

  async function speak(p,i){
    speechSynthesis.cancel();
    setSpeaking(i);setMsg(`Preparando audioguía de ${p.name}…`);
    let info=await wikiText(p);
    if(!info)info=p.description;
    if(!info)info=`${p.name} forma parte de la selección turística de ${city.shortName}. 
    Estás ante uno de los lugares destacados de la ruta. Observa el entorno, su arquitectura 
    y su relación con la ciudad mientras continúas el recorrido.`;
    const text=`Bienvenido a ${p.name}, en ${city.shortName}. ${info}
    Esta explicación utiliza información pública disponible para ofrecerte una introducción al lugar.
    Cuando quieras continuar, consulta en el mapa el siguiente punto numerado de RI Audio Guía.`;
    const u=new SpeechSynthesisUtterance(text);
    u.lang="es-ES";u.rate=.92;u.pitch=.9;
    const voices=speechSynthesis.getVoices();
    const v=voices.find(v=>v.lang?.toLowerCase()==="es-es")||
            voices.find(v=>v.lang?.toLowerCase().startsWith("es"));
    if(v)u.voice=v;
    u.onend=()=>{setSpeaking(null);setMsg("Audioguía finalizada.");};
    u.onerror=()=>{setSpeaking(null);setMsg("No se ha podido reproducir la audioguía.");};
    speechSynthesis.speak(u);setMsg(`Reproduciendo: ${p.name}`);
  }

  function stop(){speechSynthesis.cancel();setSpeaking(null);setMsg("Audio detenido.");}
  function remember(n){
    let h=JSON.parse(localStorage.getItem("riHistory")||"[]");
    h=[n,...h.filter(x=>x!==n)].slice(0,5);
    localStorage.setItem("riHistory",JSON.stringify(h));
  }
  const hist=JSON.parse(localStorage.getItem("riHistory")||"[]");

  return <main>
    <header><div className="brand">RI <span>Audio Guía</span></div>
      <div className="tag">Descubre cada ciudad a tu ritmo</div></header>
    <section className="search">
      <input value={q} onChange={e=>setQ(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&search()}
        placeholder="¿Qué ciudad quieres descubrir?"/>
      <button onClick={search}>Buscar</button>
      <button className="loc" onClick={locate}>◎ Usar mi ubicación</button>
    </section>
    <p className="status">{msg}</p>
    {!city&&hist.length>0&&<section><h2>Ciudades recientes</h2>
      {hist.map(x=><div className="history" key={x}>{x}</div>)}</section>}
    {city&&<><h1>{city.shortName}</h1><div id="map"></div>
      <section><h2>{places.length||10} lugares para descubrir</h2>
      {places.length?places.map((p,i)=><article key={`${p.name}-${i}`}>
        <b>{i+1}</b><div><strong>{p.name}</strong>
        <small>Punto de interés · Parada {i+1} de la ruta</small></div>
        <button onClick={()=>speaking===i?stop():speak(p,i)}>
          {speaking===i?"■ Parar":"▶ Audio"}</button>
      </article>):<p>Preparando la selección…</p>}</section></>}
    <footer>RI Audio Guía · PWA · Datos cartográficos © OpenStreetMap</footer>
  </main>;
}
createRoot(document.getElementById("root")).render(<App/>);
