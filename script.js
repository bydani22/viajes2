const MAX_BYTES = 19 * 1024 * 1024;
const MAX_DIMENSION = 2200;
const MIN_QUALITY = 0.48;

const $ = id => document.getElementById(id);
let places = [];
let selectedFiles = [];
let compressedPhotos = [];

function slugify(text){
  return text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}

$("tripName").addEventListener("input", () => {
  if (!$("tripSlug").dataset.edited) $("tripSlug").value = slugify($("tripName").value);
  updateStructure();
});
$("tripSlug").addEventListener("input", () => {
  $("tripSlug").dataset.edited = "true";
  $("tripSlug").value = slugify($("tripSlug").value);
  updateStructure();
});
$("addPlace").addEventListener("click", addPlace);

function addPlace(name="", description=""){
  const id = Date.now() + Math.random();
  places.push({id,name,description});
  renderPlaces();
}
function removePlace(id){
  places = places.filter(p => p.id !== id);
  renderPlaces();
}
function renderPlaces(){
  places = Array.isArray(places) ? places.map(p => ({
    id: p?.id ?? (Date.now() + Math.random()),
    name: String(p?.name ?? ""),
    description: String(p?.description ?? "")
  })) : [];
  const box = $("places");
  box.innerHTML = "";
  places.forEach((p,i)=>{
    const row=document.createElement("div");
    row.className="place";
    row.innerHTML=`
      <input placeholder="Lugar ${i+1}" value="${escapeAttr(p.name)}">
      <input placeholder="Descripción breve" value="${escapeAttr(p.description)}">
      <button class="remove" type="button">Eliminar</button>`;
    const inputs=row.querySelectorAll("input");
    inputs[0].addEventListener("input",e=>p.name=e.target.value);
    inputs[1].addEventListener("input",e=>p.description=e.target.value);
    row.querySelector("button").addEventListener("click",()=>removePlace(p.id));
    box.appendChild(row);
  });
}
function escapeAttr(v){
  return String(v||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
}

const dropzone=document.querySelector(".dropzone");
$("photoInput").addEventListener("change",e=>handleFiles([...e.target.files]));
["dragenter","dragover"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.style.borderColor="var(--accent)"}));
["dragleave","drop"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.style.borderColor=""}));
dropzone.addEventListener("drop",e=>handleFiles([...e.dataTransfer.files]));

function handleFiles(files){
  const images=files.filter(f=>f.type.startsWith("image/"));
  selectedFiles = [...selectedFiles, ...images];
  updatePhotoInfo();
}

function updatePhotoInfo(){
  $("photoCount").textContent=`${selectedFiles.length} foto${selectedFiles.length===1?"":"s"}`;
  const raw=selectedFiles.reduce((a,f)=>a+f.size,0);
  $("photoSize").textContent=`${formatMB(raw)} MB originales`;
  $("photoMessage").textContent=selectedFiles.length
    ? "Al generar, las fotos se convertirán y comprimirán automáticamente."
    : "Todavía no has añadido fotos.";
  renderPreview();
}

function renderPreview(){
  $("preview").innerHTML="";
  selectedFiles.slice(0,80).forEach(f=>{
    const url=URL.createObjectURL(f);
    const div=document.createElement("div");
    div.className="thumb";
    div.innerHTML=`<img src="${url}" alt=""><span>${escapeHtml(f.name)}</span>`;
    $("preview").appendChild(div);
  });
  if(selectedFiles.length>80){
    const d=document.createElement("div");d.textContent=`+ ${selectedFiles.length-80} fotos`;
    d.style.padding="15px";$("preview").appendChild(d);
  }
}

function formatMB(bytes){return (bytes/1024/1024).toFixed(2)}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function loadImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("No se pudo leer "+file.name))};
    img.src=url;
  });
}

function canvasBlob(canvas,quality){
  return new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
}

async function compressFile(file, quality){
  const img=await loadImage(file);
  let scale=Math.min(1,MAX_DIMENSION/Math.max(img.naturalWidth,img.naturalHeight));
  let canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let blob=await canvasBlob(canvas,quality);
  return {blob,width:canvas.width,height:canvas.height};
}

async function compressAll(){
  compressedPhotos=[];
  if(!selectedFiles.length) return;
  $("generateMessage").textContent="Comprimiendo fotos… 0%";
  let quality=0.78;

  for(let pass=0;pass<6;pass++){
    compressedPhotos=[];
    for(let i=0;i<selectedFiles.length;i++){
      const result=await compressFile(selectedFiles[i],quality);
      compressedPhotos.push({
        name:`foto-${String(i+1).padStart(3,"0")}.webp`,
        blob:result.blob
      });
      $("generateMessage").textContent=`Comprimiendo fotos… ${Math.round(((i+1)/selectedFiles.length)*100)}%`;
      await new Promise(r=>setTimeout(r,0));
    }
    const total=compressedPhotos.reduce((a,p)=>a+p.blob.size,0);
    if(total<=MAX_BYTES || quality<=MIN_QUALITY) break;
    quality-=0.07;
  }

  let total=compressedPhotos.reduce((a,p)=>a+p.blob.size,0);
  if(total>MAX_BYTES){
    // Segunda estrategia: reducir dimensiones progresivamente.
    let originalMax=MAX_DIMENSION;
    while(total>MAX_BYTES && originalMax>1200){
      originalMax-=200;
      for(let i=0;i<selectedFiles.length;i++){
        const img=await loadImage(selectedFiles[i]);
        const scale=Math.min(1,originalMax/Math.max(img.naturalWidth,img.naturalHeight));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
        canvas.getContext("2d",{alpha:false}).drawImage(img,0,0,canvas.width,canvas.height);
        const blob=await canvasBlob(canvas,MIN_QUALITY);
        compressedPhotos[i].blob=blob;
      }
      total=compressedPhotos.reduce((a,p)=>a+p.blob.size,0);
    }
  }

  updateMeter(total);
  $("generateMessage").textContent=total<=MAX_BYTES
    ? `Fotos listas: ${formatMB(total)} MB.`
    : `No caben todas por debajo de 19 MB. Resultado: ${formatMB(total)} MB.`;
  return total;
}

function updateMeter(total){
  const pct=Math.min(100,(total/MAX_BYTES)*100);
  $("meterBar").style.width=pct+"%";
  $("photoSize").textContent=`${formatMB(total)} MB comprimidas`;
}

function updateStructure(){
  const slug=slugify($("tripSlug").value)||"mi-viaje";
  $("structurePreview").textContent=
`${slug}/
├── index.html
├── style.css
├── script.js
└── fotos/
    ├── foto-001.webp
    ├── foto-002.webp
    └── ...`;
}

async function generateZip(){
  const name=$("tripName").value.trim();
  const slug=slugify($("tripSlug").value);
  if(!name) return showError("Escribe el nombre del viaje.");
  if(!slug) return showError("Escribe un slug válido.");
  if(!selectedFiles.length) return showError("Añade al menos una foto.");

  $("generate").disabled=true;
  $("generateMessage").textContent="Preparando…";

  try{
    const total=await compressAll();
    if(total>MAX_BYTES) throw new Error("Las fotos siguen superando el límite de 19 MB. Selecciona menos fotos o vuelve a intentarlo.");
    const files={};
    files["index.html"]=buildTripHtml();
    files["style.css"]=TRIP_STYLE;
    files["script.js"]=TRIP_SCRIPT;
    for(const photo of compressedPhotos) files[`fotos/${photo.name}`]=photo.blob;

    const zip=await createZip(files);
    const blob=new Blob([zip],{type:"application/zip"});
    downloadBlob(blob,`${slug}.zip`);
    $("generateMessage").textContent=`¡Listo! ${slug}.zip descargado (${formatMB(blob.size)} MB).`;
  }catch(err){
    showError(err.message||"Ha ocurrido un error.");
  }finally{$("generate").disabled=false}
}
$("generate").addEventListener("click",generateZip);

function showError(msg){
  $("generateMessage").textContent=msg;
  $("generateMessage").style.color="var(--danger)";
  setTimeout(()=>$("generateMessage").style.color="",4000);
}

function buildTripHtml(){
  const name=escapeHtml(String($("tripName").value || "").trim());
  const date=String($("tripDate").value || "");
  const desc=escapeHtml(String($("tripDescription").value || "").trim());
  const dateText=date?new Date(date+"T12:00:00").toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"}):"";
  const placeHtml = places
  .filter(p => String(p?.name ?? "").trim() !== "")
  .map(p => {
    const placeName = String(p?.name ?? "").trim();
    const placeDescription = String(p?.description ?? "").trim();
    return `<article class="place-card"><span>✦</span><h3>${escapeHtml(placeName)}</h3><p>${escapeHtml(placeDescription)}</p></article>`;
  }).join("");
  const gallery=compressedPhotos.map((p,i)=>`<figure><img src="fotos/${p.name}" alt="Foto ${i+1}" loading="lazy"></figure>`).join("");
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css"></head>
<body><main class="trip">
<header class="trip-hero"><div class="stamp">TRIP</div><p class="trip-date">${dateText}</p><h1>${name}</h1><p>${desc}</p></header>
<section><h2>Pasaporte de lugares</h2><div class="places">${placeHtml||"<p>Aún no hay lugares añadidos.</p>"}</div></section>
<section><h2>Recuerdos</h2><div class="gallery">${gallery}</div></section>
<footer>Mi cuaderno de viaje · ${new Date().getFullYear()}</footer>
</main>
<div class="lightbox" id="lightbox">
  <button class="lb-close" id="lbClose" aria-label="Cerrar">✕</button>
  <button class="lb-btn lb-prev" id="lbPrev" aria-label="Foto anterior">‹</button>
  <div class="lightbox-inner">
    <img id="lbImg" src="" alt="">
    <span class="lightbox-counter" id="lbCounter"></span>
  </div>
  <button class="lb-btn lb-next" id="lbNext" aria-label="Foto siguiente">›</button>
</div>
<script src="script.js"></script>
</body></html>`;
}

const TRIP_STYLE=`*{box-sizing:border-box}
:root{--bg:#060c16;--surface:#101d34;--surface2:#152743;--line:#1f3355;--gold:#c9a568;--ink:#eef1f6;--muted:#8a96ac}
html{scroll-behavior:smooth}
body{margin:0;color:var(--ink);font-family:'Inter',system-ui,-apple-system,sans-serif;line-height:1.55;
background:
  radial-gradient(1100px 550px at 88% -10%,#16294a 0%,transparent 60%),
  radial-gradient(900px 500px at -10% 15%,#0f2038 0%,transparent 55%),
  var(--bg);background-attachment:fixed}
.trip{max-width:1100px;margin:auto;padding:40px 20px 80px}
.trip-hero{position:relative;background:linear-gradient(160deg,var(--surface2),var(--surface) 70%);border:1px solid var(--line);border-radius:28px;padding:64px 42px;margin-bottom:44px;overflow:hidden;box-shadow:0 30px 60px -25px #000c}
.trip-hero::before{content:"";position:absolute;inset:0;background:radial-gradient(520px 260px at 92% 0%,#c9a56833,transparent 70%);pointer-events:none}
.stamp{position:absolute;right:28px;top:28px;width:78px;height:78px;border:2px solid var(--gold);border-radius:50%;display:flex;align-items:center;justify-content:center;transform:rotate(10deg);font:800 11px/1 'Inter',sans-serif;letter-spacing:.1em;color:var(--gold)}
.trip-date{text-transform:uppercase;letter-spacing:.22em;color:var(--gold);font-size:12px;font-weight:700;margin:0 0 14px}
.trip-hero h1{font:600 clamp(42px,7vw,80px)/1.02 'Playfair Display',Georgia,serif;margin:0 0 20px;color:#fff}
.trip-hero p:last-child{max-width:640px;color:var(--muted);font-size:16.5px;line-height:1.75;margin:0}
h2{font:600 30px 'Playfair Display',Georgia,serif;margin:46px 0 20px;color:#fff;display:flex;align-items:center;gap:14px}
h2::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent)}
.places{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}
.place-card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:24px;transition:transform .25s ease,border-color .25s ease}
.place-card:hover{transform:translateY(-3px);border-color:#33507f}
.place-card span{color:var(--gold);font-size:18px}
.place-card h3{margin:14px 0 6px;font:600 19px 'Playfair Display',Georgia,serif;color:#fff}
.place-card p{color:var(--muted);line-height:1.6;margin:0}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,210px);gap:14px;justify-content:center;max-width:980px;margin:0 auto}
.gallery figure{margin:0;aspect-ratio:1;overflow:hidden;border-radius:16px;border:1px solid var(--line);cursor:pointer;position:relative;background:var(--surface)}
.gallery img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
.gallery figure::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,#000a,transparent 45%);opacity:0;transition:opacity .3s ease}
.gallery figure:hover img{transform:scale(1.07)}
.gallery figure:hover::after{opacity:1}
footer{text-align:center;color:var(--muted);margin-top:60px;font-size:12px;letter-spacing:.05em}
.lightbox{position:fixed;inset:0;background:#050a13ee;backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:999;padding:30px}
.lightbox.open{display:flex}
.lightbox-inner{display:flex;flex-direction:column;align-items:center;gap:14px;max-width:min(92vw,1100px);max-height:88vh}
.lightbox img{max-width:100%;max-height:78vh;object-fit:contain;border-radius:12px;box-shadow:0 30px 70px #000a;background:#000}
.lightbox-counter{color:var(--muted);font-size:13px;letter-spacing:.08em}
.lb-btn{position:fixed;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;border:1px solid var(--line);background:#0f1d33cc;color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,border-color .2s;z-index:1000}
.lb-btn:hover{background:var(--gold);color:#0b1626;border-color:var(--gold)}
.lb-prev{left:18px}.lb-next{right:18px}
.lb-close{position:fixed;top:18px;right:18px;width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:#0f1d33cc;color:#fff;font-size:18px;cursor:pointer;z-index:1000}
.lb-close:hover{background:var(--gold);color:#0b1626;border-color:var(--gold)}
@media(max-width:640px){.trip-hero{padding:44px 22px}.stamp{display:none}.lb-prev{left:8px}.lb-next{right:8px}.lb-btn{width:40px;height:40px}.gallery{grid-template-columns:repeat(auto-fill,150px)}}`;

const TRIP_SCRIPT=`(function(){
  var imgs=[].slice.call(document.querySelectorAll(".gallery img"));
  if(!imgs.length) return;
  var lb=document.getElementById("lightbox");
  var lbImg=document.getElementById("lbImg");
  var counter=document.getElementById("lbCounter");
  var idx=0;
  function show(i){
    idx=(i+imgs.length)%imgs.length;
    lbImg.src=imgs[idx].src;
    counter.textContent=(idx+1)+" / "+imgs.length;
  }
  function openAt(i){show(i);lb.classList.add("open");document.body.style.overflow="hidden"}
  function close(){lb.classList.remove("open");document.body.style.overflow=""}
  imgs.forEach(function(img,i){img.parentElement.addEventListener("click",function(){openAt(i)})});
  document.getElementById("lbPrev").addEventListener("click",function(){show(idx-1)});
  document.getElementById("lbNext").addEventListener("click",function(){show(idx+1)});
  document.getElementById("lbClose").addEventListener("click",close);
  lb.addEventListener("click",function(e){if(e.target===lb) close()});
  document.addEventListener("keydown",function(e){
    if(!lb.classList.contains("open")) return;
    if(e.key==="Escape") close();
    if(e.key==="ArrowLeft") show(idx-1);
    if(e.key==="ArrowRight") show(idx+1);
  });
})();`;

function downloadBlob(blob,name){
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// ZIP writer sin librerías externas: Store + CRC32.
function crc32(buf){
  let table=crc32.table;
  if(!table){table=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}crc32.table=table}
  let c=0xffffffff;for(let i=0;i<buf.length;i++)c=table[(c^buf[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;
}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concat(arrays){let len=arrays.reduce((a,x)=>a+x.length,0),out=new Uint8Array(len),p=0;for(const x of arrays){out.set(x,p);p+=x.length}return out}
async function createZip(files){
  const enc=new TextEncoder(), local=[], central=[];let offset=0;
  for(const [name,data] of Object.entries(files)){
    const bytes=data instanceof Blob?new Uint8Array(await data.arrayBuffer()):enc.encode(data);
    const nb=enc.encode(name), crc=crc32(bytes);
    const lh=concat([new Uint8Array([80,75,3,4]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(bytes.length),u32(bytes.length),u16(nb.length),u16(0),nb,bytes]);
    local.push(lh);
    const ch=concat([new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(bytes.length),u32(bytes.length),u16(nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nb]);
    central.push(ch);offset+=lh.length;
  }
  const cd=concat(central), lf=concat(local);
  const end=concat([new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(central.length),u16(central.length),u32(cd.length),u32(lf.length),u16(0)]);
  return concat([lf,cd,end]);
}

updateStructure();
addPlace();
