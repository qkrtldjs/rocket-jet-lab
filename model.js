/* Educational lumped model. Indices are arbitrary normalized responses, not engineering predictions. */
(function(root){
  'use strict';
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const defaults=()=>({altitude:5,mach:.8,inlet:100,compressor:80,h2:48,o2:0,cooling:70});
  const rocketPreset=()=>({altitude:45,mach:4,inlet:0,compressor:0,h2:55,o2:55,cooling:90});
  function atmosphere(km){
    const z=clamp(km,0,60)*1000, bases=[0,11000,20000,32000,47000,51000], lapses=[-.0065,0,.001,.0028,0,-.0028];
    let t=288.15,p=101325;
    for(let i=0;i<bases.length;i++){
      const dh=Math.min(z,i+1<bases.length?bases[i+1]:60000)-bases[i];
      if(dh<=0)break;
      const l=lapses[i],endT=t+l*dh;
      p*=l===0?Math.exp(-9.80665*dh/(287.05287*t)):Math.pow(endT/t,-9.80665/(287.05287*l));
      t=endT;if(z<(bases[i+1]||60000))break;
    }
    return {temperature:t,pressure:p,density:p/(287.05287*t),sound:Math.sqrt(1.4*287.05287*t)};
  }
  function fresh(){return {time:0,rpm:0,heat:12,thrust:0,pressure:0,h2Mass:40,o2Mass:240,ignited:false,trip:false,burn:false,airFlow:0,h2Flow:0,o2Flow:0,airOxygen:0,ratio:0,burnRate:0,oxidizerAirFraction:0};}
  function flows(c,s){
    const a=atmosphere(c.altitude),spool=clamp(s.rpm/100,0,1);
    // Capture area 0.020 m²; compressor-assisted intake is an illustrative surrogate.
    const air=a.density*.02*(c.mach*a.sound+90*spool)*(c.inlet/100)*(.2+.8*spool);
    const h2=s.h2Mass>0?.22*c.h2/100:0,o2=s.o2Mass>0?1.32*c.o2/100:0;
    const airOxygen=air*.232,oxygen=airOxygen+o2;
    const ratio=h2>.00001?oxygen/h2:0;
    return {airFlow:air,h2Flow:h2,o2Flow:o2,airOxygen,oxygen,ratio,oxidizerAirFraction:oxygen>0?airOxygen/oxygen:0};
  }
  function canIgnite(c,s){const f=flows(c,s);if(s.trip)return {ok:false,reason:'먼저 안전 상태로 복귀하세요.'};if(f.h2Flow<.005)return {ok:false,reason:'수소 공급 밸브를 먼저 열어 주세요.'};if(f.oxygen<.008)return {ok:false,reason:'산화제가 부족합니다. 흡입구 또는 산소 밸브를 확인하세요.'};if(f.ratio<2.5||f.ratio>25)return {ok:false,reason:'공급 비율이 점화 범위를 벗어났습니다. 수소와 산화제를 조절하세요.'};return {ok:true};}
  function step(c,s,dt){
    dt=clamp(dt,0,.1);s.time+=dt;
    s.rpm+=(c.compressor-s.rpm)*(1-Math.exp(-dt/1.8));
    Object.assign(s,flows(c,s));
    const viable=s.h2Flow>=.003&&s.oxygen>=.006&&s.ratio>=1.8&&s.ratio<=32;
    const extinguished=s.ignited&&!viable;
    if(extinguished)s.ignited=false;
    s.burn=s.ignited&&viable&&!s.trip;
    s.burnRate=s.burn?Math.min(s.h2Flow,s.oxygen/8):0;
    // 8:1 is stoichiometric O₂/H₂ mass ratio, not the optimum rocket-engine operating ratio.
    const heatRelease=s.burnRate/.22;
    const airAssist=clamp(s.airFlow/6,0,1)*.08;
    const target=s.burn?clamp(heatRelease*145+airAssist*25,0,100):0;
    s.thrust+=(target-s.thrust)*(1-Math.exp(-dt/.55));
    s.pressure+=((s.burn?clamp(target*.9+heatRelease*15,0,100):0)-s.pressure)*(1-Math.exp(-dt/.7));
    const aeroHeat=clamp(c.mach*c.mach/36*(c.inlet/100)*20,0,20);
    const coolingEffect=(c.cooling/100)*clamp(s.h2Flow/.11,0,1);
    const thermalTarget=clamp(12+heatRelease*105+aeroHeat-coolingEffect*65,5,120);
    s.heat+=(thermalTarget-s.heat)*(1-Math.exp(-dt/8));
    s.h2Mass=Math.max(0,s.h2Mass-s.h2Flow*dt);
    s.o2Mass=Math.max(0,s.o2Mass-s.o2Flow*dt);
    let tripped=false;
    if(s.heat>=95&&!s.trip){s.trip=true;s.ignited=false;s.burn=false;tripped=true;}
    return {extinguished,tripped};
  }
  const api={clamp,defaults,rocketPreset,atmosphere,fresh,flows,canIgnite,step};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.EngineModel=api;
})(typeof window!=='undefined'?window:this);
