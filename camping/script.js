(function(){
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
})();