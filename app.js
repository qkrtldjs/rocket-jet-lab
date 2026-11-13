(() => {
  'use strict';
  const M=window.EngineModel,$=id=>document.getElementById(id);
  let controls=M.defaults(),state=M.fresh(),paused=false,rotorAngle=0,lastFrame=0,uiTime=0,sampleTime=0;
  let history=[],samples=[],events=[],lastStatus='',selected=null;
  const fields=['altitude','mach','inlet','compressor','h2','o2','cooling'];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(location.protocol==='file:'){
    $('engine-3d-stage').hidden=true;$('schematic-stage').hidden=false;
    $('view-3d').disabled=true;$('view-3d').classList.remove('active');$('view-3d').setAttribute('aria-pressed','false');
    $('view-2d').classList.add('active');$('view-2d').setAttribute('aria-pressed','true');document.querySelector('.model-tools').hidden=true;
  }
  const flowPaths=[...document.querySelectorAll('[data-pipe]')];
  const canvas=$('history'),ctx=canvas.getContext('2d');
  const timeText=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
  function log(text){events.unshift({time:state.time,text});events=events.slice(0,100);const list=$('events');list.replaceChildren();events.slice(0,3).forEach(e=>{const li=document.createElement('li'),time=document.createElement('time');time.textContent='T+ '+timeText(e.time);li.append(time,document.createTextNode(e.text));list.append(li);});}
  function syncInputs(){fields.forEach(key=>{$(key).value=String(controls[key]);updateControl(key);});}
  function updateControl(key){const value=controls[key],field=$(key);field.style.setProperty('--pct',100*(value-Number(field.min))/(Number(field.max)-Number(field.min))+'%');const out=$(key+'-value');if(key==='altitude')out.innerHTML=value.toFixed(1)+' <span>km</span>';else if(key==='mach')out.innerHTML=value.toFixed(1)+' <span>Mach</span>';else out.textContent=Math.round(value)+'%';}
  function preset(kind){controls=kind==='rocket'?M.rocketPreset():M.defaults();state.ignited=false;state.burn=false;syncInputs();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===kind));log((kind==='rocket'?'고고도 로켓':'저고도 공기흡입')+' 설정 적용 · 점화 대기');update();}
  fields.forEach(key=>{
    $(key).addEventListener('input',e=>{controls[key]=Number(e.target.value);updateControl(key);document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'));Object.assign(state,M.flows(controls,state));update();});
    $(key).addEventListener('change',()=>{const names={altitude:'고도',mach:'마하수',inlet:'흡입구',compressor:'압축기',h2:'수소 밸브',o2:'산소 밸브',cooling:'재생 냉각'};log(`${names[key]} → ${controls[key]}${key==='altitude'?' km':key==='mach'?'':'%'}`);});
  });
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>preset(b.dataset.preset)));
  function selectComponent(key){
    if(selected)selected.classList.remove('highlight');
    selected=document.querySelector(`[data-control="${key}"]`);if(!selected)return;
    selected.classList.add('highlight');
    if(window.innerWidth<961)selected.scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'});
    $(key).focus({preventScroll:true});
  }
  document.querySelectorAll('[data-component]').forEach(el=>{el.addEventListener('click',()=>selectComponent(el.dataset.component));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectComponent(el.dataset.component);}});});
  function shutDown(reason){controls.h2=0;controls.o2=0;controls.compressor=0;controls.inlet=0;controls.cooling=100;state.ignited=false;state.burn=false;state.trip=true;syncInputs();log(reason);update();}
  $('emergency').addEventListener('click',()=>shutDown('비상 정지 · 연료·산화제 차단 / 흡입구 폐쇄'));
  $('ignite').addEventListener('click',()=>{
    if(paused){log('일시정지 상태입니다. 먼저 재생 버튼을 누르세요.');return;}
    if(state.trip){if(state.heat>60){log('냉각 중 · 열부하 60 미만에서 안전 상태로 복귀할 수 있습니다.');return;}state.trip=false;log('안전 상태 복귀 · 밸브를 설정한 후 다시 점화하세요.');update();return;}
    if(state.ignited){state.ignited=false;state.burn=false;log('점화 OFF · 밸브는 현재 개방률을 유지합니다.');update();return;}
    const result=M.canIgnite(controls,state);if(!result.ok){log('점화 보류 · '+result.reason);return;}
    state.ignited=true;log('점화 ON · 상·하 연소실 작동');update();
  });
  $('pause').addEventListener('click',()=>{paused=!paused;document.body.classList.toggle('paused',paused);$('pause').textContent=paused?'▷':'Ⅱ';$('pause').setAttribute('aria-label',paused?'시뮬레이션 재개':'시뮬레이션 일시정지');$('pause').title=paused?'시뮬레이션 재개':'시뮬레이션 일시정지';log(paused?'시뮬레이션 일시정지':'시뮬레이션 재개');update();});
  $('reset').addEventListener('click',()=>{controls=M.defaults();state=M.fresh();history=[];samples=[];events=[];sampleTime=0;rotorAngle=0;paused=false;lastStatus='';document.body.classList.remove('paused');$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','시뮬레이션 일시정지');syncInputs();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset==='air'));log('실험 초기화 · 탱크 충전 완료');update();drawHistory();});
  function status(){
    if(paused)return {title:'일시정지',detail:'환경·장비 설정을 조절한 뒤 재개할 수 있습니다.',kind:''};
    if(state.trip)return {title:'안전 정지',detail:state.heat>60?'냉각 중 · 열부하가 낮아진 뒤 안전 상태로 복귀하세요.':'엔진 점화 버튼에서 안전 상태 복귀가 가능합니다.',kind:'trip'};
    if(state.burn){
      if(state.heat>80)return {title:'열부하 주의',detail:'냉각 강도를 높이거나 수소 공급량을 낮춰 보세요.',kind:'warn'};
      if(state.ratio<4)return {title:'산화제 부족 · 연소 중',detail:'수소 일부만 반응하고 있습니다. 공급 비율을 조절하세요.',kind:'warn'};
      if(controls.inlet<5&&state.rpm>15)return {title:'로켓 연소 · 압축기 구동 중',detail:'흡입구가 닫혀 있습니다. 압축기 구동을 줄여 보세요.',kind:'warn'};
      return {title:'연소 안정',detail:state.oxidizerAirFraction>.85?'대기 산소로 연소 중 · 탑재 산화제 절약':state.oxidizerAirFraction<.15?'탑재한 산소로 연소 중 · 외부 공기 없이 작동':'대기 산소와 탑재 산소를 함께 공급 중',kind:'on'};
    }
    if(state.h2Mass<=0)return {title:'수소 탱크 소진',detail:'초기화 버튼으로 실험을 다시 시작하세요.',kind:'warn'};
    if(state.h2Flow>.005)return {title:'점화 대기',detail:'열린 밸브로 연료가 흐르고 있습니다. 점화 또는 밸브 차단을 선택하세요.',kind:''};
    return {title:'엔진 정지',detail:'수소·산화제 공급을 설정하고 점화하세요.',kind:''};
  }
  function update(){
    const air=M.atmosphere(controls.altitude);
    $('density-value').textContent=air.density.toFixed(controls.altitude>30?4:3)+' kg/m³';$('density-bar').style.width=Math.min(100,air.density/1.225*100)+'%';
    $('rpm-value').textContent=Math.round(state.rpm)+'%';
    $('h2-flow').textContent=state.h2Flow.toFixed(3)+' kg/s';$('o2-flow').textContent=state.o2Flow.toFixed(3)+' kg/s';$('air-oxygen').textContent=state.airOxygen.toFixed(3)+' kg/s';
    $('h2-remaining').textContent=(state.h2Mass/40*100).toFixed(1)+'%';$('o2-remaining').textContent=(state.o2Mass/240*100).toFixed(1)+'%';
    const hp=state.h2Mass/40,op=state.o2Mass/240;$('h2-fill').setAttribute('y',String(137-89*hp));$('h2-fill').setAttribute('height',String(89*hp));$('o2-fill').setAttribute('y',String(137-89*op));$('o2-fill').setAttribute('height',String(89*op));
    ['thrust','pressure','heat'].forEach(k=>{$(k+'-value').innerHTML=Math.round(state[k])+'<small>/100</small>';$(k+'-bar').style.width=M.clamp(state[k],0,100)+'%';});
    $('heat-bar').style.background=state.heat>80?'#f2bc6a':'#ef9278';
    const fraction=state.oxidizerAirFraction,totalOxygen=state.airOxygen+state.o2Flow;
    $('air-contribution').style.width=(totalOxygen>0?fraction*100:0)+'%';$('lox-contribution').style.width=(totalOxygen>0?(1-fraction)*100:0)+'%';
    $('mixture-label').textContent=totalOxygen<.0001?'공급 없음':fraction>.995?'공기 100%':fraction<.005?'탑재 산소 100%':`공기 ${Math.round(fraction*100)}% / 탑재 ${Math.round((1-fraction)*100)}%`;
    $('mixture-value').textContent=state.h2Flow>.00001?state.ratio.toFixed(1):'—';
    $('mode-label').textContent=totalOxygen<.0001?'산화제 공급 없음':fraction>.85?'공기흡입 구성':fraction<.15?'로켓 구성':'혼합 공급 구성';
    const st=status();$('status-title').textContent=st.title;$('status-description').textContent=st.detail;$('status-light').className='status-light '+st.kind;
    // Announce only mode/status changes, not every telemetry frame.
    if(st.title!==lastStatus){$('engine').setAttribute('aria-label','복합 추진기관 단면도 · '+st.title);lastStatus=st.title;}
    $('timecode').textContent='T+ '+timeText(state.time);
    $('ignite-label').textContent=state.trip?'안전 상태 복귀':state.ignited?'점화 OFF':'엔진 점화';$('ignite').classList.toggle('is-lit',state.ignited);
    $('inlet-gate').style.opacity=String(.12+.88*(1-controls.inlet/100));
    document.querySelectorAll('.cooling-jacket').forEach(el=>el.style.strokeOpacity=String(.1+.7*controls.cooling/100));
    $('burning').style.opacity=state.burn?String(.35+.65*Math.min(1,state.burnRate/.14)):'0';
    flowPaths.forEach(p=>{const type=p.dataset.pipe;let amount=type==='air'?state.airFlow/5:type==='h2'?state.h2Flow/.22:type==='o2'?state.o2Flow/1.32:state.thrust/100;p.style.opacity=String(amount>.001?.35+.65*Math.min(1,amount):.07);p.dataset.active=amount>.001?'yes':'no';});
  }
  function drawHistory(){
    const w=canvas.clientWidth,h=112,dpr=Math.min(devicePixelRatio||1,2);if(!w)return;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const left=22,right=w-5,top=9,bottom=87;
    ctx.font='9px ui-monospace, monospace';ctx.lineWidth=1;ctx.textAlign='left';
    [0,50,100].forEach(v=>{const y=bottom-(bottom-top)*v/100;ctx.strokeStyle='#2a3642';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillStyle='#658093';ctx.fillText(String(v),0,y+3);});
    ctx.fillStyle='#658093';ctx.fillText('−60 s',left,105);ctx.textAlign='right';ctx.fillText('현재',right,105);
    const start=state.time-60;
    [['thrust','#72d1df'],['heat','#ef9278']].forEach(([key,color])=>{ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.beginPath();let began=false;for(const p of history){if(p.t<start)continue;const x=left+(p.t-start)/60*(right-left),y=bottom-M.clamp(p[key],0,100)/100*(bottom-top);if(!began){ctx.moveTo(x,y);began=true;}else ctx.lineTo(x,y);}ctx.stroke();});
  }
  function sample(){const row={t:state.time,altitude:controls.altitude,mach:controls.mach,inlet:controls.inlet,compressor:controls.compressor,h2:controls.h2,o2:controls.o2,cooling:controls.cooling,thrust:state.thrust,pressure:state.pressure,heat:state.heat,airFlow:state.airFlow,h2Flow:state.h2Flow,o2Flow:state.o2Flow,h2Mass:state.h2Mass,o2Mass:state.o2Mass,ignited:state.ignited};history.push(row);history=history.filter(p=>p.t>=state.time-61);samples.push(row);if(samples.length>7200)samples.shift();drawHistory();}
  function frame(now){
    const dt=lastFrame?Math.min((now-lastFrame)/1000,.05):0;lastFrame=now;
    if(!paused){const result=M.step(controls,state,dt);if(result.tripped)shutDown('열부하 한계 도달 · 자동 안전 정지');else if(result.extinguished)log('연소 소멸 · 연료 또는 산화제 공급 비율을 확인하세요.');
      rotorAngle=(rotorAngle+state.rpm*dt*8)%360;if(!reduced)$('rotor').setAttribute('transform',`rotate(${rotorAngle})`);
      if(!reduced)flowPaths.forEach(p=>{if(p.dataset.active==='yes')p.style.strokeDashoffset=String(-state.time*(p.dataset.pipe==='exhaust'?65:32));});
      if(state.time-sampleTime>=.5){sampleTime=state.time;sample();}
    }
    window.EngineVisual?.update(state,controls,paused);
    if(now-uiTime>100){uiTime=now;update();}requestAnimationFrame(frame);
  }
  $('export').addEventListener('click',()=>{
    const cols=['t','altitude','mach','inlet','compressor','h2','o2','cooling','thrust','pressure','heat','airFlow','h2Flow','o2Flow','h2Mass','o2Mass','ignited'];
    const header=['time_s','altitude_km','mach','inlet_pct','compressor_pct','h2_valve_pct','o2_valve_pct','cooling_pct','thrust_index','pressure_index','heat_index','air_kg_s','h2_kg_s','o2_kg_s','h2_remaining_kg','o2_remaining_kg','ignited'];
    const rows=(samples.length?samples:[{...state,t:state.time,...controls}]).map(r=>cols.map(k=>typeof r[k]==='number'?r[k].toFixed(4):r[k]).join(','));
    const blob=new Blob(['\uFEFF'+[header.join(','),...rows].join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='rocket-jet-experiment.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);log('현재 세션의 실험 기록을 CSV로 저장했습니다.');
  });
  const dialog=$('info-dialog');
  $('method-open').addEventListener('click',()=>{
    $('dialog-title').textContent='이 시뮬레이터가 표현하는 것';
    $('dialog-content').innerHTML=`<p>사용자 스케치의 <strong>흡입구·압축기 → 상·하 연소실 → 공통 노즐</strong> 구조를 옮긴 교육용 개념 모델입니다. 고도와 속도는 사용자가 지정하는 시험 조건이며 비행 궤적을 적분하지 않습니다.</p><h3>직접 조작할 수 있는 장비</h3><p>흡입구 개방률, 압축기 구동, 수소·산소 공급 밸브, 재생 냉각, 점화 및 비상 정지를 조작합니다. 공급관의 움직임은 흐름의 유무를 보여 주며 입자 수가 실제 분자 수나 유량을 뜻하지 않습니다.</p><h3>계산 가정</h3><ul><li>0–60 km 대기를 일정한 기온 변화율의 층으로 근사합니다. 바람·날씨·충격파는 생략합니다.</li><li>흡입 면적 0.020 m², 최대 수소 공급 0.22 kg/s, 최대 탑재 산소 공급 1.32 kg/s, 탱크 초기량 40 kg / 240 kg은 이 실험을 위한 임의 설정입니다.</li><li>공기 산소 질량비 0.232, 수소와 산소의 화학양론적 질량비 O/F=8을 사용해 반응 가능한 수소량을 제한합니다. 8:1이 실제 로켓의 최적 운전 비율이라는 뜻은 아닙니다.</li><li>압축기 응답과 추력·압력·벽면 열부하는 조작 효과를 보여 주는 상대 지수입니다. 실제 추력, 압력, 온도, 효율, 안정성은 예측하지 않습니다.</li><li>밸브가 열려 있으면 점화가 꺼져 있어도 탱크 잔량이 줄어듭니다. 냉각 제어는 수소 유량이 있을 때 효과가 커지도록 단순화했습니다.</li><li>열부하 95에서 자동 정지하고 60 미만에서 복귀할 수 있습니다. 두 값과 점화 조건은 게임·교육용 가정입니다.</li></ul><h3>이 모델로 검증하지 않는 것</h3><p>두 연소실의 실제 유동 결합, 회전축 동력 균형, 열교환기 설계, 펌프·터빈 사이클, 초음속 연소, 재료의 내열성, 장치의 제작 가능성은 별도 분석이 필요합니다. 개방률을 바꾼 결과만으로 실제 엔진 제작이나 성능을 입증할 수 없습니다.</p><h3>참고 자료</h3><p><a href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/earth-atmosphere-equation-metric/" target="_blank" rel="noopener noreferrer">NASA · 대기와 고도</a><br><a href="https://ntrs.nasa.gov/api/citations/20140002716/downloads/20140002716.pdf" target="_blank" rel="noopener noreferrer">NASA · Rocket Propulsion Fundamentals — 혼합비</a><br><a href="https://www.esa.int/Enabling_Support/Space_Transportation/Future_space_transportation/System_study_results_for_SABRE-powered_reusable_launcher" target="_blank" rel="noopener noreferrer">ESA · 공기흡입·로켓 복합 추진 연구</a></p>`;
    dialog.showModal();
  });
  $('dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
  document.addEventListener('visibilitychange',()=>{lastFrame=0;});
  new ResizeObserver(drawHistory).observe(canvas);
  syncInputs();Object.assign(state,M.flows(controls,state));log('스케치 기반 실험실 준비 완료 · 점화 대기');update();drawHistory();requestAnimationFrame(frame);
})();
