import React,{useEffect,useState} from "react";
import{createRoot}from"react-dom/client";
import L from"leaflet";
import"leaflet/dist/leaflet.css";
import"./style.css";

const NOMINATIM="https://nominatim.openstreetmap.org";
const esc=s=>encodeURIComponent(s);

function App(){
 const[q,setQ]=useState(""); const[city,setCity]=useState(null); const[places,setPlaces]=useState([]);
 const[msg,setMsg]=useState("Busca una ciudad o utiliza tu ubicación."); const[map,setMap]=useState(null);
 useEffect(()=>{navigator.serviceWorker?.register("/sw.js")},[]);
 useEffect(()=>{if(!city)return; if(map)map.remove(); const m=L.map("map").setView([city.lat,city.lon],14);
   L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(m);
   L.marker([city.lat,city.lon]).addTo(m).bindPopup(city.name).openPopup(); setMap(m);
   return()=>{};
 },[city]);
 useEffect(()=>{if(!map)return; places.forEach((p,i)=>L.marker([p.lat,p.lon]).addTo(map).bindPopup(`${i+1}. ${p.name}`))},[places,map]);

 async function search(){
  if(!q.trim())return; setMsg("Buscando ciudad…");
  try{let r=await fetch(`${NOMINATIM}/search?format=jsonv2&limit=5&addressdetails=1&q=${esc(q)}`,{headers:{"Accept-Language":"es"}});
  let d=await r.json(); if(!d.length){setMsg("No encuentro esa ciudad.");return}
  const x=d[0]; const c={name:x.display_name,lat:+x.lat,lon:+x.lon}; setCity(c); remember(c.name); await nearby(c); setMsg("Ciudad localizada.");}
  catch{setMsg("No se ha podido realizar la búsqueda.");}
 }
 async function nearby(c){
   setPlaces([]); setMsg("Localizando lugares de interés…");
   try{
    const delta=.035, viewbox=`${c.lon-delta},${c.lat+delta},${c.lon+delta},${c.lat-delta}`;
    const terms=["monument","museum","cathedral","castle","historic","square","market","theatre","park","shopping"];
    let all=[];
    for(const t of terms.slice(0,5)){
      const r=await fetch(`${NOMINATIM}/search?format=jsonv2&limit=4&bounded=1&viewbox=${viewbox}&q=${esc(t)}`,{headers:{"Accept-Language":"es"}});
      all.push(...await r.json());
    }
    const uniq=[]; const seen=new Set();
    for(const x of all){const n=x.name||x.display_name.split(",")[0]; if(n&&!seen.has(n)){seen.add(n);uniq.push({name:n,lat:+x.lat,lon:+x.lon});} if(uniq.length===10)break}
    setPlaces(uniq);
   }catch{setMsg("Ciudad localizada; no se pudieron cargar todos los puntos de interés.");}
 }
 function locate(){
  setMsg("Solicitando tu ubicación…");
  navigator.geolocation?.getCurrentPosition(async p=>{
   try{let r=await fetch(`${NOMINATIM}/reverse?format=jsonv2&lat=${p.coords.latitude}&lon=${p.coords.longitude}`,{headers:{"Accept-Language":"es"}});
   let x=await r.json(); const c={name:x.display_name,lat:p.coords.latitude,lon:p.coords.longitude};setCity(c);remember(c.name);await nearby(c);setMsg("Ubicación encontrada.");}
   catch{setMsg("He obtenido tu posición, pero no la ciudad.");}
  },()=>setMsg("No se ha podido acceder a tu ubicación."),{enableHighAccuracy:true});
 }
 function remember(n){let h=JSON.parse(localStorage.getItem("riHistory")||"[]");h=[n,...h.filter(x=>x!==n)].slice(0,5);localStorage.setItem("riHistory",JSON.stringify(h))}
 function speak(p){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(`${p.name}. Estás utilizando RI Audio Guía. La versión inicial te permite localizar el lugar y escucharlo. El contenido turístico ampliado se incorporará mediante una fuente de datos verificada.`);u.lang="es-ES";speechSynthesis.speak(u)}
 const hist=JSON.parse(localStorage.getItem("riHistory")||"[]");
 return <main>
   <header><div className="brand">RI <span>Audio Guía</span></div><div className="tag">Descubre cada ciudad a tu ritmo</div></header>
   <section className="search"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} placeholder="¿Qué ciudad quieres descubrir?"/><button onClick={search}>Buscar</button><button className="loc" onClick={locate}>◎ Usar mi ubicación</button></section>
   <p className="status">{msg}</p>
   {!city&&hist.length>0&&<section><h2>Ciudades recientes</h2>{hist.map(x=><div className="history" key={x}>{x}</div>)}</section>}
   {city&&<><h1>{city.name.split(",")[0]}</h1><div id="map"></div><section><h2>10 lugares para descubrir</h2>{places.length?places.map((p,i)=><article key={p.name}><b>{i+1}</b><div><strong>{p.name}</strong><small> Punto de interés · Ruta en el mapa</small></div><button onClick={()=>speak(p)}>▶ Audio</button></article>):<p>Preparando la selección…</p>}</section></>}
   <footer>RI Audio Guía · PWA · Datos cartográficos © OpenStreetMap</footer>
 </main>
}
createRoot(document.getElementById("root")).render(<App/>);
