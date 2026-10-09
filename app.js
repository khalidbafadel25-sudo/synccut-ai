let API = localStorage.getItem("synccut-api") || "";
async function ensureApi() {
  if (!API) { $("serverModal").hidden = false; msg("اربط خادمًا منشورًا على الإنترنت أولًا لتفعيل التصدير.", true); return false; }
  return true;
}
async function syncFilesToServer() {
  const pending = [...clips.filter(c => !c.id).map(c => ({file:c.file, obj:c, kind:"video"})), ...(music && !music.id ? [{file:music.file,obj:music,kind:"audio"}] : [])];
  if (!pending.length) return;
  const form = new FormData(); pending.forEach(x => form.append("files", x.file));
  const r = await fetch(API + "/api/upload", {method:"POST", body:form});
  const d = await r.json(); if (!r.ok) throw new Error(d.detail || "تعذر رفع الملفات إلى الخادم");
  pending.forEach((x,i) => { x.obj.id = d.files[i].id; });
}
const $ = id => document.getElementById(id);
let clips = [], music = null, currentIndex = 0, lastExport = null;
const input = $("fileInput"), preview = $("preview"), empty = $("emptyPreview");
function msg(text, error=false) {
  const el=$("message"); el.textContent=text; el.className="message show"+(error?" error":"");
}
function fmt(sec) {
  if (!Number.isFinite(sec)) return "00:00";
  return String(Math.floor(sec/60)).padStart(2,"0")+":"+String(Math.floor(sec%60)).padStart(2,"0");
}
function updateMeta() {
  $("projectMeta").textContent = clips.length+" مقاطع فيديو"+(music?" + موسيقى":"");
  $("clipCount").textContent = clips.length+" مقاطع";
  $("projectTitle").textContent = $("projectName").value || "مشروع جديد";
}
function applyFilters() {
  preview.style.filter=`brightness(${$("brightness").value}%) contrast(${$("contrast").value}%) saturate(${$("saturation").value}%)`;
}
function showClip(i) {
  if(!clips.length) return;
  currentIndex=(i+clips.length)%clips.length;
  preview.src=clips[currentIndex].localUrl; preview.classList.add("visible"); empty.style.display="none";
  applyFilters();
  document.querySelectorAll(".clip.video-clip").forEach((el,j)=>el.style.outline=j===currentIndex?"2px solid #b49aff":"none");
}
function renderTracks() {
  const vt=$("videoTrack"); vt.innerHTML="";
  if(!clips.length) vt.innerHTML='<div class="track-empty">أضف مقاطع الفيديو هنا</div>';
  clips.forEach((c,i)=>{
    const d=document.createElement("button"); d.className="clip video-clip"; d.type="button"; d.title=c.name; d.style.flexGrow=Math.max(1,c.duration||1);
    const s=document.createElement("span"); s.textContent=c.name; d.append(s); d.onclick=()=>showClip(i); vt.append(d);
  });
  const at=$("audioTrack"); at.innerHTML="";
  if(music){const d=document.createElement("div");d.className="clip audio-clip";d.style.flex="1";const s=document.createElement("span");s.textContent="♫ "+music.name;d.append(s);at.append(d);}
  else at.innerHTML='<div class="track-empty">أضف موسيقى أو صوتًا</div>';
  updateMeta();
}
async function uploadFiles(fileList) {
  const files=[...fileList]; if(!files.length)return;
  const accepted=files.filter(f=>f.type.startsWith("video/")||f.type.startsWith("audio/"));
  if(!accepted.length){msg("اختر فيديو أو ملفًا صوتيًا مدعومًا.",true);return;}
  for(const file of accepted){
    const kind=file.type.startsWith("video/")?"video":"audio", localUrl=URL.createObjectURL(file);
    if(kind==="video"){
      const obj={id:null,name:file.name,file,localUrl,duration:0}; clips.push(obj);
      const probe=document.createElement("video");probe.preload="metadata";probe.src=localUrl;
      probe.onloadedmetadata=()=>{obj.duration=probe.duration||1;renderTracks();};
    }else{
      if(music?.localUrl)URL.revokeObjectURL(music.localUrl);
      music={id:null,name:file.name,file,localUrl};
    }
  }
  renderTracks(); if(clips.length && !preview.classList.contains("visible"))showClip(0);
  msg("تمت إضافة الملفات للمعاينة على الجوال. اضغط «المونتاج التلقائي» لتصديرها بعد ربط الخادم.");
}
async function autoEdit() {
  if(!clips.length){msg("ارفع مقطع فيديو واحدًا على الأقل أولًا.",true);input.click();return;}
  if(!(await ensureApi())) return;
  const btn=$("autoBtn");btn.disabled=true;btn.textContent="جارٍ تجهيز الفيديو…";
  msg("جارٍ رفع المقاطع وتجهيز الفيديو. قد يستغرق ذلك وقتًا حسب حجم الملفات.");
  try{
    await syncFilesToServer();
    const r=await fetch(API+"/api/auto-edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      clips:clips.map(c=>c.id),music:music?music.id:null,music_volume:Number($("musicVolume").value)/100,beat_sync:$("beatSync").checked
    })});
    const d=await r.json();if(!r.ok)throw new Error(d.detail||"فشل المونتاج");
    lastExport=API+d.download_url;
    msg("اكتمل تجميع الفيديو! اضغط «تصدير الفيديو» لتنزيل ملف MP4.");
    $("exportBtn").onclick=()=>{if(lastExport)window.open(lastExport,"_blank");};
  } catch(e){msg("تعذر إكمال المونتاج: "+e.message,true);}
  finally{btn.disabled=false;btn.textContent="✦ مونتاج تلقائي بنقرة";}
}
async function runTool(tool) {
  if(tool==="auto"){autoEdit();return;}
  if(tool==="voice"||tool==="lipsync"){msg(tool==="voice"?"عزل الصوت المتقدم يحتاج نموذج معالجة صوتية لم يتم ربطه بعد.":"مزامنة الشفاه تحتاج نموذج AI مخصصًا لم يتم ربطه بعد.");return;}
  if(!clips.length){msg("ارفع فيديو أولًا لاستخدام هذه الأداة.",true);return;}
  if(!(await ensureApi())) return;
  const endpoint=tool==="scenes"?"/api/scene-split":"/api/silence-removal";
  msg("جارٍ تحليل الفيديو…");
  try{
    await syncFilesToServer();
    const r=await fetch(API+endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file_id:clips[currentIndex].id})});
    const d=await r.json();if(!r.ok)throw new Error(d.detail||"تعذر التحليل");
    if(tool==="scenes")msg("اكتُشفت "+d.scenes.length+" مشاهد. "+d.scenes.slice(0,5).map(s=>fmt(s.start)+"–"+fmt(s.end)).join("، "));
    else msg("اكتُشفت "+d.silence_segments.length+" فترات صمت. هذه معاينة، ولم تُقص الفترات تلقائيًا.");
  }catch(e){msg(e.message,true);}
}
$("chooseBtn").onclick=$("uploadBtn").onclick=()=>input.click();
input.onchange=()=>{uploadFiles(input.files);input.value="";};
$("autoBtn").onclick=()=>autoEdit();
$("exportBtn").onclick=()=>lastExport?window.open(lastExport,"_blank"):msg("أنشئ الفيديو أولًا باستخدام المونتاج التلقائي.");
document.querySelectorAll(".tool").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tool").forEach(x=>x.classList.remove("active"));b.classList.add("active");runTool(b.dataset.tool);
});
$("playBtn").onclick=()=>{if(!preview.src){msg("أضف مقطعًا لمعاينته.",true);return;}preview.paused?preview.play():preview.pause();};
preview.onplay=()=>{$("playBtn").textContent="Ⅱ";};
preview.onpause=()=>{$("playBtn").textContent="▶";};
preview.ontimeupdate=()=>{$("timecode").textContent=fmt(preview.currentTime)+" / "+fmt(preview.duration);};
$("prevBtn").onclick=()=>showClip(currentIndex-1);$("nextBtn").onclick=()=>showClip(currentIndex+1);
$("resetBtn").onclick=()=>{clips.forEach(c=>URL.revokeObjectURL(c.localUrl));if(music)URL.revokeObjectURL(music.localUrl);clips=[];music=null;lastExport=null;preview.pause();preview.removeAttribute("src");preview.classList.remove("visible");empty.style.display="block";renderTracks();msg("تم تفريغ المشروع الحالي.");};
$("fullscreenBtn").onclick=()=>{const area=$("previewArea");if(area.requestFullscreen)area.requestFullscreen();};
["brightness","contrast","saturation"].forEach(id=>$(id).oninput=()=>{$(id+"Val").textContent=$(id).value+"%";applyFilters();});
$("musicVolume").oninput=()=>$("musicVal").textContent=$("musicVolume").value+"%";
$("projectName").oninput=updateMeta;
document.querySelectorAll(".ratio").forEach(b=>b.onclick=()=>{document.querySelectorAll(".ratio").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");$("previewArea").dataset.ratio=b.dataset.ratio;msg("تم اختيار نسبة "+b.dataset.ratio+" للواجهة. تصدير النسب المختلفة سيُضاف لاحقًا.");});
$("zoomIn").onclick=()=>{document.querySelectorAll(".clip").forEach(x=>x.style.minWidth=(parseInt(getComputedStyle(x).minWidth)+15)+"px");};
$("zoomOut").onclick=()=>{document.querySelectorAll(".clip").forEach(x=>x.style.minWidth=Math.max(45,parseInt(getComputedStyle(x).minWidth)-15)+"px");};
$("serverOpen").onclick=()=>{$("serverModal").hidden=false;$("serverUrl").value=API;};
$("serverClose").onclick=()=>$ ("serverModal").hidden=true;
$("serverModal").onclick=e=>{if(e.target===$("serverModal"))$("serverModal").hidden=true;};
$("clearServer").onclick=()=>{API="";localStorage.removeItem("synccut-api");$("serverUrl").value="";msg("تم مسح رابط الخادم المحفوظ.");};
$("serverForm").onsubmit=async e=>{e.preventDefault();const candidate=$("serverUrl").value.trim().replace(/\/$/,"");try{const r=await fetch(candidate+"/api/health");if(!r.ok)throw new Error("الخادم لم يستجب بشكل صحيح");API=candidate;localStorage.setItem("synccut-api",API);$("serverModal").hidden=true;msg("تم الاتصال بالخادم بنجاح.");}catch(err){msg("تعذر الاتصال. تأكد من الرابط وأن الخادم منشور ويدعم CORS وHTTPS. "+err.message,true);}};
$("adminOpen").onclick=()=>{$("adminModal").hidden=false;$("adminStats").hidden=true;};
$("adminClose").onclick=()=>$("adminModal").hidden=true;
$("adminModal").onclick=e=>{if(e.target===$("adminModal"))$("adminModal").hidden=true;};
$("adminForm").onsubmit=async e=>{
  e.preventDefault();const pin=$("pin").value;
  try{
    const r=await fetch(API+"/api/admin/login",{method:"POST",headers:{"X-Admin-Pin":pin}});
    const d=await r.json();if(!r.ok)throw new Error(d.detail||"تعذر تسجيل الدخول");
    const features=Object.entries(d.features||{}).map(([k,v])=>`${k}: ${v}`).join("<br>")||"لا توجد عمليات بعد";
    $("adminStats").innerHTML=`<div class="stat"><b>${d.visitors||0}</b><small>عمليات الرفع/الزيارات المسجلة</small></div><div class="stat"><b>${d.operations||0}</b><small>عمليات الأدوات</small></div><div class="stat" style="grid-column:1/-1"><small>استخدام الأدوات</small><p>${features}</p></div><div class="stat" style="grid-column:1/-1"><small>المالك</small><b style="font-size:15px">${d.owner}</b></div>`;
    $("adminStats").hidden=false;msg("تم تسجيل الدخول إلى لوحة المالك.");
  }catch(err){msg(err.message,true);}
};
if(API) fetch(API+"/api/health").then(r=>r.json()).then(d=>{if(!d.ffmpeg)msg("الخادم متصل، لكن FFmpeg غير مثبت؛ لن يعمل تصدير الفيديو حتى تثبيته.");}).catch(()=>msg("تعذر الوصول إلى الخادم المحفوظ؛ افتح «ربط الخادم» للتحقق من الرابط.",true));
if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
