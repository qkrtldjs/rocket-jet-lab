import * as THREE from './three.module.min.js';

const $=id=>document.getElementById(id);
const stage=$('engine-3d-stage'),canvas=$('engine-3d'),schematic=$('schematic-stage');
const button3d=$('view-3d'),button2d=$('view-2d'),shellButton=$('shell-toggle');
let renderer,view='3d',snapshot={state:{rpm:0,heat:12,burn:false,airFlow:0,h2Flow:0,o2Flow:0,thrust:0,h2Mass:40,o2Mass:240,time:0},controls:{inlet:100,cooling:70},paused:false};
function setView(value){view=value;stage.hidden=value!=='3d';schematic.hidden=value!=='2d';button3d.classList.toggle('active',value==='3d');button2d.classList.toggle('active',value==='2d');button3d.setAttribute('aria-pressed',String(value==='3d'));button2d.setAttribute('aria-pressed',String(value==='2d'));document.querySelector('.model-tools').hidden=value!=='3d';}
button3d.addEventListener('click',()=>setView('3d'));button2d.addEventListener('click',()=>setView('2d'));
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});}catch(error){
  setView('2d');button3d.disabled=true;$('render-status').textContent='이 브라우저에서는 2D 단면도로 표시합니다.';
}
if(renderer)initialize();

function initialize(){
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.45;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,150);
  const assembly=new THREE.Group();assembly.position.y=-.25;scene.add(assembly);
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const temp=new THREE.Vector3(),clock=new THREE.Clock();
  let azimuth=-.28,polar=1.36,zoom=1,shellClosed=false,visualTime=0,rotorTime=0;

  // Studio reflections are generated locally; there are no external image assets.
  const envCanvas=document.createElement('canvas');envCanvas.width=1024;envCanvas.height=512;
  const ec=envCanvas.getContext('2d'),eg=ec.createLinearGradient(0,0,0,512);
  eg.addColorStop(0,'#263849');eg.addColorStop(.42,'#182430');eg.addColorStop(.6,'#0c1118');eg.addColorStop(1,'#4e6374');ec.fillStyle=eg;ec.fillRect(0,0,1024,512);
  ec.fillStyle='#dce9f3';ec.fillRect(85,60,240,85);ec.fillStyle='#829fb5';ec.fillRect(490,100,80,220);ec.fillStyle='#f1d9b8';ec.fillRect(770,50,140,100);
  const envTexture=new THREE.CanvasTexture(envCanvas);envTexture.mapping=THREE.EquirectangularReflectionMapping;envTexture.colorSpace=THREE.SRGBColorSpace;
  const pmrem=new THREE.PMREMGenerator(renderer);const envMap=pmrem.fromEquirectangular(envTexture).texture;scene.environment=envMap;envTexture.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xc8e9ff,0x17202e,2.1));
  const key=new THREE.DirectionalLight(0xf0f7ff,5);key.position.set(-4,9,9);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-9;key.shadow.camera.right=9;key.shadow.camera.top=6;key.shadow.camera.bottom=-6;key.shadow.bias=-.0002;scene.add(key);
  const rim=new THREE.DirectionalLight(0x67d7ff,3);rim.position.set(2,3,-8);scene.add(rim);
  const warm=new THREE.DirectionalLight(0xffc28a,1.6);warm.position.set(8,-1,6);scene.add(warm);
  const metal=(color,roughness=.32,metalness=.85)=>new THREE.MeshStandardMaterial({color,roughness,metalness,envMapIntensity:1.15});
  const steel=metal(0x70838f),bright=metal(0xb8c6ce,.23),dark=metal(0x273943,.4),titanium=metal(0x81949d,.3),bronze=metal(0x94714b,.35),gold=metal(0xc8a45f,.27),green=metal(0x809a6b,.28),bolt=metal(0xa9b6be,.24);
  const shellMat=metal(0x566f7e,.32);shellMat.side=THREE.DoubleSide;
  const innerMat=metal(0x334953,.45);innerMat.side=THREE.DoubleSide;
  function mesh(geometry,material,parent=assembly){const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function cyl(x,y,z,r,length,material,parent=assembly,rt=r){const g=new THREE.CylinderGeometry(rt,r,length,48,1,false);g.rotateZ(-Math.PI/2);const m=mesh(g,material,parent);m.position.set(x,y,z);return m;}
  function ring(x,y,z,r,tube,material=bright,parent=assembly){const g=new THREE.TorusGeometry(r,tube,10,64);g.rotateY(Math.PI/2);const m=mesh(g,material,parent);m.position.set(x,y,z);return m;}
  function lathe(profile,material,parent=assembly,start=Math.PI/2,angle=Math.PI){const g=new THREE.LatheGeometry(profile.map(([x,r])=>new THREE.Vector2(r,x)),80,start,angle);g.rotateZ(-Math.PI/2);return mesh(g,material,parent);}
  function tube(points,material,r=.045,parent=assembly){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');const m=mesh(new THREE.TubeGeometry(curve,80,r,10,false),material,parent);return {curve,mesh:m};}
  function bolts(x,y,z,r,count=12,parent=assembly){for(let i=0;i<count;i++){const a=i/count*Math.PI*2;cyl(x,y+Math.cos(a)*r,z+Math.sin(a)*r,.047,.075,bolt,parent);}}

  // A half casing exposes the real, manipulable engine assembly.
  const profile=[[-5.3,1.03],[-5.15,1.19],[-4.6,1.23],[-2.3,1.23],[-1.5,1.18],[-.8,1.36],[1.8,1.35],[2.8,1.05],[3.15,.82]];
  lathe(profile,shellMat);const frontShell=lathe(profile,shellMat,assembly,-Math.PI/2,Math.PI);frontShell.visible=false;
  const edgeMat=new THREE.LineBasicMaterial({color:0xb8d2dc,transparent:true,opacity:.32});
  for(const zside of [-1,1]){const p=profile.map(([x,r])=>new THREE.Vector3(x,r*zside,0));assembly.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),edgeMat));}
  [-5.2,-4.7,-2.1,-1.5,2.7].forEach((x,i)=>{ring(x,0,0,i<3?1.235:i===3?1.2:1.08,.035);if(i===0||i===3){ring(x+.08,0,0,i===0?1.235:1.2,.025,dark);bolts(x-.04,0,0,i===0?1.235:1.2,16);}});
  // Intake lip, nose cone, shaft and individually modelled twisted compressor blades.
  ring(-5.32,0,0,1.075,.09,bright);ring(-5.4,0,0,1.07,.024,dark);
  const intakeLouvers=[];
  for(let i=-4;i<=4;i++){const y=i*.215,w=2*Math.sqrt(Math.max(.03,1.04*1.04-y*y));const louver=mesh(new THREE.BoxGeometry(.025,.19,w),titanium);louver.position.set(-5.46,y,0);intakeLouvers.push(louver);}
  cyl(-3.45,0,0,.19,4.35,bright);
  const coneGeo=new THREE.ConeGeometry(.37,.85,64);coneGeo.rotateZ(Math.PI/2);const nose=mesh(coneGeo,bright);nose.position.set(-5.28,0,0);
  const rotorGroups=[];
  const bladeShape=new THREE.Shape();bladeShape.moveTo(-.1,.25);bladeShape.bezierCurveTo(-.2,.5,-.3,.8,-.12,1.05);bladeShape.lineTo(.13,1);bladeShape.bezierCurveTo(-.02,.77,.05,.46,.11,.25);bladeShape.closePath();
  const bladeGeometry=new THREE.ExtrudeGeometry(bladeShape,{depth:.028,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.012,bevelThickness:.01});
  for(let j=0;j<6;j++){
    const x=-4.92+j*.56,rotor=new THREE.Group();rotor.position.x=x;assembly.add(rotor);rotorGroups.push(rotor);
    cyl(0,0,0,.29,.19,dark,rotor);
    for(let k=0;k<20;k++){const b=mesh(bladeGeometry,j%2?steel:bright,rotor);b.rotation.x=k/20*Math.PI*2;b.scale.y=1-j*.025;}
    ring(x,0,0,1.14-j*.025,.015,dark);
    for(let k=0;k<10;k++){const a=k*Math.PI/5+.1;const guide=mesh(new THREE.BoxGeometry(.025,.5,.08),dark);guide.position.set(x+.25,.8*Math.cos(a),.8*Math.sin(a));guide.rotation.x=a;}
  }
  cyl(-1.15,0,0,.28,.65,dark);ring(-.85,0,0,.4,.055,bright);

  const glowLights=[],chamberShells=[],chamberCenters=[.63,-.63];
  const coolantMaterial=new THREE.MeshStandardMaterial({color:0x6bb5c5,emissive:0x165b6b,emissiveIntensity:.6,metalness:.65,roughness:.25,transparent:true,opacity:.65});
  chamberCenters.forEach(y=>{
    const g=new THREE.Group();g.position.set(.7,y,.18);assembly.add(g);
    const can=lathe([[-.8,.3],[-.65,.43],[.55,.43],[.92,.28]],bronze,g);chamberShells.push(can);
    ring(-.72,0,0,.4,.045,bright,g);ring(.59,0,0,.43,.032,bright,g);ring(.9,0,0,.29,.033,titanium,g);
    cyl(-.83,0,0,.32,.1,dark,g);bolts(-.9,0,0,.31,10,g);
    for(let k=0;k<12;k++){const a=k*Math.PI/6;cyl(-.76,Math.cos(a)*.22,Math.sin(a)*.22,.025,.1,gold,g);}
    for(let x=-.4;x<.58;x+=.14)ring(x,0,0,.435,.009,gold,g);
    const l=new THREE.PointLight(0xff8b3c,0,4,1.5);l.position.set(.1,0,.4);g.add(l);glowLights.push(l);
    // Cooling channels and longitudinal ribs around the chamber wall.
    for(let k=0;k<6;k++){const a=Math.PI/2+k*Math.PI/5;tube([[-.54,.46*Math.cos(a),.46*Math.sin(a)],[.2,.46*Math.cos(a),.46*Math.sin(a)],[.58,.42*Math.cos(a),.42*Math.sin(a)]],coolantMaterial,.016,g);}
    tube([[1.55,y,.2],[2.25,y,.1],[2.85,.12,0]],titanium,.21);
  });
  // Shared expansion nozzle with heat-tinted machined rings.
  const nozzleProfile=[[2.45,.48],[2.75,.42],[2.95,.32],[3.18,.39],[3.6,.57],[4.2,.83],[4.9,1.02]];
  lathe(nozzleProfile,titanium);const nozzleFront=lathe(nozzleProfile,titanium,assembly,-Math.PI/2,Math.PI);nozzleFront.visible=false;
  lathe(nozzleProfile.map(([x,r])=>[x,r-.035]),innerMat);
  ring(2.66,0,0,.48,.075,dark);ring(2.82,0,0,.39,.035,bright);bolts(2.6,0,0,.49,14);
  for(let i=0;i<15;i++){const t=i/14,x=3.15+t*1.75,r=.38+t*.64;ring(x,0,0,r,.014,i<4?bronze:titanium);}
  ring(4.91,0,0,1.025,.045,bright);
  // Mounting struts and flanged joints make the component interfaces legible.
  for(const z of [-.7,.7]){tube([[-1.6,-1.05,z],[-1.15,-1.5,z],[1.8,-1.5,z],[2.65,-.85,z]],dark,.055);}
  const valveWheels=[];
  function valve(x,y,z,material){const body=mesh(new THREE.BoxGeometry(.2,.22,.2),material);body.position.set(x,y,z);const wheel=ring(x,y,z+.16,.13,.018,material);wheel.rotation.y=0;valveWheels.push(wheel);cyl(x,y,z,.055,.33,bright);}
  const tankLabels=[];
  function tank(x,y,z,material,label){const g=new THREE.Group();g.position.set(x,y,z);assembly.add(g);cyl(0,0,0,.4,1.22,steel,g);[-.61,.61].forEach(end=>{const dome=mesh(new THREE.SphereGeometry(.4,40,24),steel,g);dome.scale.x=.48;dome.position.x=end;});[-.45,.45].forEach(end=>{ring(end,0,0,.407,.024,material,g);});cyl(0,-.47,0,.07,.23,material,g);tube([[x,y-.4,z],[x,y-.73,z],[x-.45,y-.9,z+.1]],material,.043);return g;}
  tank(-.25,2.35,-.1,gold,'H₂');tank(2.05,2.35,-.1,green,'O₂');
  // Raised supply pipework follows the two branches from the user's drawing.
  const fuelPaths=[tube([[-.7,1.45,0],[-1.1,1.35,.6],[-1.1,1.05,.8],[-.2,.66,.8]],gold,.048),tube([[-1.1,1.05,.8],[-1.15,-1.65,.8],[-.4,-1.65,.8],[-.2,-.63,.8]],gold,.048)];
  const oxygenPaths=[tube([[1.6,1.45,0],[3.2,1.55,.65],[3.25,1.05,.65],[.6,1.08,.65],[.6,.85,.6]],green,.05),tube([[3.25,1.05,.65],[3.4,-1.65,.65],[2.4,-2.05,.65],[.9,-1.75,.65],[.6,-.9,.6]],green,.05)];
  valve(-1.1,1.12,.8,gold);valve(3.23,1.13,.65,green);
  // Translucent flow particles travel through physical tubes and intake passages.
  const particleGroups=[];
  function stream(curve,color,key,count=32,r=.027){const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending});const g=new THREE.SphereGeometry(r,8,6);const inst=new THREE.InstancedMesh(g,mat,count);inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);assembly.add(inst);particleGroups.push({curve,key,inst,count,mat,speed:key==='exhaust'?.8:.3});}
  fuelPaths.forEach(p=>stream(p.curve,0xffd582,'h2',24,.032));oxygenPaths.forEach(p=>stream(p.curve,0xbceba5,'o2',28,.032));
  for(const y of [.68,-.68]){for(const z of [.15,.4,.65]){const airCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-6,y,z),new THREE.Vector3(-3.8,y,z),new THREE.Vector3(-1.7,y,z),new THREE.Vector3(-.4,y,.4)]);stream(airCurve,0x71d9ff,'air',24,.02);}}
  const exhaustCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(1.3,.6,.3),new THREE.Vector3(2.8,.1,.2),new THREE.Vector3(4.6,0,.2),new THREE.Vector3(7,0,.2)]);stream(exhaustCurve,0xffcfa0,'exhaust',40,.025);
  // Layered shader flames, with continuously moving turbulence instead of flat triangles.
  const flameUniforms={time:{value:0},power:{value:0},warm:{value:new THREE.Color(0xff8a35)}};
  const flameMaterial=new THREE.ShaderMaterial({uniforms:flameUniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec2 vUv;uniform float time;uniform float power;uniform vec3 warm;void main(){float t=vUv.y;float ripple=sin(vUv.x*50.0+t*31.0-time*8.0)*.08+sin(vUv.x*93.0-t*54.0+time*12.0)*.04;float body=pow(max(0.0,sin(t*3.14159)),.5);float diamonds=.68+.32*cos(t*49.0-time*.5);float alpha=body*(.24+ripple)*power;vec3 col=mix(warm,vec3(.38,.72,1.0),pow(t,4.0));col=mix(col,vec3(1.0,.95,.82),diamonds*.3);gl_FragColor=vec4(col*1.5,alpha);}`
  });
  const flames=new THREE.Group();assembly.add(flames);
  function flame(x,y,z,length,radius){const geo=new THREE.CylinderGeometry(.035,radius,length,64,24,true);geo.rotateZ(-Math.PI/2);const m=mesh(geo,flameMaterial,flames);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=false;const halo=m.clone();halo.scale.set(1,1.27,1.27);flames.add(halo);return m;}
  flame(6.1,0,0,2.7,.78);flame(.65,.63,.18,1.5,.29);flame(.65,-.63,.18,1.5,.29);
  const jetLight=new THREE.PointLight(0xffa14e,0,6,1.5);jetLight.position.set(4.4,0,1);assembly.add(jetLight);
  const ground=mesh(new THREE.PlaneGeometry(45,30),new THREE.ShadowMaterial({opacity:.21}),scene);ground.rotation.x=-Math.PI/2;ground.position.y=-2.65;ground.receiveShadow=true;ground.castShadow=false;
  const grid=new THREE.GridHelper(32,64,0x263f4c,0x1b303d);grid.position.y=-2.66;grid.material.transparent=true;grid.material.opacity=.3;scene.add(grid);
  const labelAnchors={h2:new THREE.Vector3(-.25,2.95,-.1),o2:new THREE.Vector3(2.05,2.95,-.1),compressor:new THREE.Vector3(-3.1,-1.55,.5),cooling:new THREE.Vector3(.7,-1.18,.7)};
  const hotspots=[...stage.querySelectorAll('[data-anchor]')];
  let width=1,height=1;
  function resize(){width=stage.clientWidth;height=stage.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(stage);
  function cameraPosition(){const d=Math.max(13.8,14.2/(2*Math.tan(camera.fov*Math.PI/360)*camera.aspect))*zoom;camera.position.set(Math.sin(azimuth)*Math.sin(polar)*d,Math.cos(polar)*d,Math.cos(azimuth)*Math.sin(polar)*d);camera.lookAt(.1,.2,0);camera.updateMatrixWorld();}
  const pointers=new Map();let dragging=false,lastPinch=0;
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragging=true;stage.classList.add('is-dragging');});
  canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(lastPinch)zoom=THREE.MathUtils.clamp(zoom*lastPinch/d,.65,1.65);lastPinch=d;}else{azimuth-= (e.clientX-old.x)*.006;polar=THREE.MathUtils.clamp(polar-(e.clientY-old.y)*.005,.45,2.5);}});
  const release=e=>{pointers.delete(e.pointerId);lastPinch=0;if(!pointers.size){dragging=false;stage.classList.remove('is-dragging');}};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom*Math.exp(e.deltaY*.001),.65,1.65);},{passive:false});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();setView('2d');button3d.disabled=true;});
  $('camera-reset').addEventListener('click',()=>{azimuth=-.28;polar=1.36;zoom=1;});
  shellButton.addEventListener('click',()=>{shellClosed=!shellClosed;frontShell.visible=shellClosed;nozzleFront.visible=shellClosed;shellButton.textContent=shellClosed?'단면 열기':'외피 닫기';shellButton.setAttribute('aria-pressed',String(shellClosed));});
  const dummy=new THREE.Object3D();
  function render(){
    requestAnimationFrame(render);const dt=Math.min(clock.getDelta(),.05);if(view!=='3d'||document.hidden)return;
    const {state:s,controls:c,paused}=snapshot;
    if(!paused){visualTime+=dt;rotorTime+=dt*(s.rpm||0)*.04;}
    cameraPosition();rotorGroups.forEach((g,i)=>g.rotation.x=reduced?0:rotorTime*(i%2?.7:1));
    const power=s.burn?Math.min(1,(s.thrust||0)/70):0;
    flames.visible=power>.005;flameUniforms.power.value=power;flameUniforms.time.value=reduced?0:visualTime;
    jetLight.intensity=power*9;glowLights.forEach(l=>l.intensity=power*6);
    particleGroups.forEach(p=>{const amount=p.key==='air'?(s.airFlow||0)/5:p.key==='h2'?(s.h2Flow||0)/.22:p.key==='o2'?(s.o2Flow||0)/1.32:(s.thrust||0)/100;
      p.inst.visible=amount>.002;p.mat.opacity=Math.min(.9,.2+amount*.6);if(!p.inst.visible)return;
      for(let i=0;i<p.count;i++){const progress=(i/p.count+(reduced?0:visualTime*p.speed*(.3+Math.min(1,amount))))%1;temp.copy(p.curve.getPointAt(progress));dummy.position.copy(temp);const size=.55+Math.min(1,amount)*.65;dummy.scale.setScalar(size);dummy.updateMatrix();p.inst.setMatrixAt(i,dummy.matrix);}p.inst.instanceMatrix.needsUpdate=true;
    });
    valveWheels[0].rotation.x=(c.h2||0)/100*Math.PI/2;valveWheels[1].rotation.x=(c.o2||0)/100*Math.PI/2;
    intakeLouvers.forEach(louver=>louver.rotation.z=(c.inlet||0)/100*Math.PI/2);
    coolantMaterial.opacity=.15+.65*(c.cooling||0)/100;coolantMaterial.emissiveIntensity=.2+.8*(c.cooling||0)/100;
    hotspots.forEach(h=>{temp.copy(labelAnchors[h.dataset.anchor]);temp.applyMatrix4(assembly.matrixWorld);temp.project(camera);h.style.left=(temp.x*.5+.5)*width+'px';h.style.top=(-temp.y*.5+.5)*height+'px';h.style.visibility=(Math.abs(temp.x)<.95&&Math.abs(temp.y)<.94&&temp.z<1)?'visible':'hidden';});
    renderer.render(scene,camera);
  }
  window.EngineVisual={update(state,controls,paused){snapshot={state,controls,paused};},setView};
  $('render-status').textContent='실시간 3D · 단면 보기';resize();render();
}
