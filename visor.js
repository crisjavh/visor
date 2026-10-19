(function(){
var $=function(id){return document.getElementById(id);};
var CFG=(typeof VISOR_CONFIG!=="undefined"?VISOR_CONFIG:{});
var MM={mm:1,cm:10,m:1000};
var q=new URLSearchParams(location.search);
var file=q.get('m');                         // nombre del archivo dentro de /piezas
var unitIn=(q.get('u')||CFG.unidadPorDefecto||'cm').toLowerCase();
if(!MM[unitIn])unitIn='cm';
var loadEl=$('load'),host=$('view'),rawMM=null;

if(CFG.empresa)$('emp').textContent=CFG.empresa;
function nice(f){return decodeURIComponent(f).replace(/\.glb$/i,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();}
var title=q.get('n')||(file&&!/\.enc$/i.test(file)?nice(file):'Visor 3D');
$('ttl').textContent=title;document.title=title;

// Las medidas se muestran siempre en milímetros
function showDims(){
  ['dx','dy','dz'].forEach(function(id,i){
    $(id).textContent=rawMM?rawMM[i].toFixed(0)+' mm':'–';
  });
}
function fail(t){loadEl.hidden=false;loadEl.textContent=t;}

if(!file||/[\\\/]|\.\./.test(decodeURIComponent(file))){fail('Falta la pieza en el link. Pide un link nuevo.');return;}

function get(urls,i){
  return new Promise(function(res,rej){
    if(i>=urls.length){rej(new Error('no se pudo cargar '+urls[0].split('/').pop()));return;}
    var sc=document.createElement('script');sc.src=urls[i];
    sc.onload=res;sc.onerror=function(){get(urls,i+1).then(res,rej);};
    document.head.appendChild(sc);
  });
}
var cd='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/',jd='https://cdn.jsdelivr.net/npm/three@0.128.0/';
var libs=get([cd+'three.min.js',jd+'build/three.min.js'],0)
  .then(function(){return get([cd+'examples/js/loaders/GLTFLoader.js',jd+'examples/js/loaders/GLTFLoader.js'],0);})
  .then(function(){return get([cd+'examples/js/controls/OrbitControls.js',jd+'examples/js/controls/OrbitControls.js'],0);});
var enc=/\.enc$/i.test(file);
var buf=fetch('piezas/'+file).then(function(r){
  if(!r.ok)throw new Error('No encontramos esa pieza ('+r.status+').');
  return r.arrayBuffer();
});
var glbP;
if(!enc){
  glbP=buf;
}else{
  glbP=buf.then(function(encBuf){
    return new Promise(function(res){
      var form=$('pw'),inp=$('pwi'),err=$('pwe');
      function attempt(pass){
        return Cripto.decrypt(encBuf,pass).then(function(d){
          form.hidden=true;loadEl.hidden=false;loadEl.textContent='Cargando pieza…';
          if(d.meta&&d.meta.n){$('ttl').textContent=d.meta.n;document.title=d.meta.n;}
          if(d.meta&&MM[d.meta.u])unitIn=d.meta.u;
          res(d.glb);
        });
      }
      function ask(msg){
        loadEl.hidden=true;form.hidden=false;err.textContent=msg||'';inp.focus();
      }
      form.addEventListener('submit',function(e){
        e.preventDefault();err.textContent='';
        if(!inp.value)return;
        form.querySelector('button').disabled=true;err.textContent='Verificando…';
        attempt(inp.value).catch(function(){
          err.textContent='Contraseña incorrecta.';form.querySelector('button').disabled=false;inp.select();
        });
      });
      var m=/^#k=([A-Za-z0-9_-]+)/.exec(location.hash);
      if(m){attempt(m[1]).catch(function(){ask('El link está incompleto o dañado. Escribe la contraseña si te la enviaron.');});}
      else ask('');
    });
  });
}
Promise.all([libs,glbP]).then(function(r){start(r[1]);}).catch(function(e){fail('No se pudo cargar la pieza. '+(e&&e.message||''));});

function start(arrayBuf){
  var T=THREE;
  var renderer=new T.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputEncoding=T.sRGBEncoding;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=0.8;
  renderer.shadowMap.enabled=true;
  host.appendChild(renderer.domElement);
  var scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,1,5000);
  scene.add(new T.HemisphereLight(0xffffff,0x5c646b,0.55));
  var key=new T.DirectionalLight(0xffffff,1.0);key.castShadow=true;key.shadow.mapSize.set(1024,1024);scene.add(key);scene.add(key.target);
  var fill=new T.DirectionalLight(0xffffff,0.3);scene.add(fill);
  var controls=new T.OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=0.08;controls.screenSpacePanning=true;
  var home={pos:new T.Vector3(),target:new T.Vector3()};
  function resize(){var w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(host);resize();
  function goHome(){camera.position.copy(home.pos);controls.target.copy(home.target);controls.update();}

  new T.GLTFLoader().parse(arrayBuf,'',function(g){
    var m=g.scene;
    m.traverse(function(o){
      if(!o.isMesh)return;
      o.castShadow=true;
      (Array.isArray(o.material)?o.material:[o.material]).forEach(function(mt){
        mt.side=T.DoubleSide;
        if(/claro|vidrio|glass|cristal/i.test(mt.name||'')){mt.transparent=true;mt.opacity=0.28;mt.depthWrite=false;}
      });
    });
    scene.add(m);
    var box=new T.Box3().setFromObject(m),size=box.getSize(new T.Vector3()),ctr=box.getCenter(new T.Vector3());
    var f=MM[unitIn];rawMM=[size.x*f,size.y*f,size.z*f];showDims();
    var L=size.length();
    var ground=new T.Mesh(new T.PlaneGeometry(L*4,L*4),new T.ShadowMaterial({opacity:0.22}));
    ground.rotation.x=-Math.PI/2;ground.position.set(ctr.x,box.min.y-L*0.0003,ctr.z);ground.receiveShadow=true;scene.add(ground);
    var r=L/2;
    key.position.set(ctr.x+r,box.max.y+r*1.5,ctr.z+r);key.target.position.copy(ctr);
    var sc=r*1.6,k=key.shadow.camera;k.left=-sc;k.right=sc;k.top=sc;k.bottom=-sc;k.near=r*0.05;k.far=r*6;k.updateProjectionMatrix();
    fill.position.set(ctr.x-r,ctr.y,ctr.z-r);
    var dist=r/Math.sin(T.MathUtils.degToRad(camera.fov/2))*0.95;
    home.target.copy(ctr);home.pos.set(ctr.x+dist*0.55,ctr.y+dist*0.25,ctr.z+dist*0.8);
    camera.near=Math.max(dist/200,0.01);camera.far=dist*10;camera.updateProjectionMatrix();
    controls.minDistance=r*0.6;controls.maxDistance=dist*2.5;
    goHome();loadEl.hidden=true;
  },function(e){fail('El archivo no es un .glb válido.');});
  (function loop(){requestAnimationFrame(loop);controls.update();renderer.render(scene,camera);})();
}
})();
