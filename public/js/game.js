"use strict";
(function(){
  // ---------------- config ----------------
  const SAVE_KEY="deepDelve.save.v1";
  const ORE_PRICE=2, TAP_SECS=1.5, COST_GROWTH=1.15, OFFLINE_CAP=8*3600, PRESTIGE_UNLOCK=1e6;

  // Milestone ("miner") schedule — every station doubles its output when a shaft/hoist reaches
  // one of these levels: the first miners come fast (Lv.10, 25, 50, 100), then one per 100 levels
  // up to Lv.1000. Max 13 miners = ×8192 output per station.
  const MILESTONES=[10,25,50,100,200,300,400,500,600,700,800,900,1000];
  const MILESTONE_MAX=MILESTONES.length; // 13

  const SHAFT_DEFS=[
    {unlockCost:0,      base:1.0, depth:120},
    {unlockCost:400,    base:1.7, depth:260},
    {unlockCost:4500,   base:2.9, depth:420},
    {unlockCost:45000,  base:5.0, depth:600},
    {unlockCost:5e5,    base:9,   depth:820},
    {unlockCost:5e6,    base:16,  depth:1080},
    {unlockCost:6e7,    base:28,  depth:1380},
    {unlockCost:7e8,    base:50,  depth:1720},
    {unlockCost:8e9,    base:90,  depth:2100},
    {unlockCost:1e11,   base:160, depth:2520},
    {unlockCost:1.2e12, base:290, depth:2980},
    {unlockCost:1.5e13, base:520, depth:3480},
  ];

  const RESEARCH=[
    {id:'drill', name:'Diamond Drill Bits', icon:'🔩', per:0.08, unit:'shaft dig speed',  base:700,   growth:1.50, max:60},
    {id:'winch', name:'Winch Motors',       icon:'⚙️', per:0.08, unit:'haul & sell speed',base:900,   growth:1.50, max:60},
    {id:'trade', name:'Trade Contracts',    icon:'📜', per:0.08, unit:'ore sell price',   base:1100,  growth:1.52, max:60},
    {id:'cart',  name:'Reinforced Carts',   icon:'🛒', per:0.15, unit:'all storage',      base:600,   growth:1.50, max:40},
    {id:'boss',  name:'Pit Boss Training',  icon:'👷', per:0.20, unit:'manual tap power', base:500,   growth:1.50, max:30},
    {id:'core',  name:'Deep Core Sampling', icon:'🧪', per:0.07, unit:'ALL income',       base:20000, growth:1.60, max:80},
  ];

  const PRESTIGE=[
    {id:'compound',  name:'Compound Interest', icon:'📈', per:0.05, unit:'all income',        baseCost:1, max:50},
    {id:'legacy',    name:'Legacy Drills',     icon:'⛏️', per:0.07, unit:'shaft speed',        baseCost:1, max:50},
    {id:'logistics', name:'Master Logistics',  icon:'🚚', per:0.07, unit:'haul & sell speed',  baseCost:1, max:50},
    {id:'handshake', name:'Golden Handshake',  icon:'🤝', per:0.10, unit:'ore sell price',     baseCost:2, max:50},
    {id:'headstart', name:'Head Start',        icon:'🎁', special:'headstart',                  baseCost:1, max:8},
    {id:'overclock', name:'Overclock Boosts',  icon:'⚡', special:'overclock',                  baseCost:3, max:6},
  ];

  const BOOSTS=[
    {id:'rally',    name:'Rally the Crew', icon:'📣', mult:3, dur:30, cd:180, kind:'speed'},
    {id:'goldrush', name:'Gold Rush',      icon:'💛', mult:5, dur:20, cd:240, kind:'sell'},
  ];

  const ACH=[
    {id:'first',   icon:'💰', name:'First Sale',      desc:'Earn $100 total',      reward:0.02, check:()=>S.totalEarned>=100},
    {id:'k10',     icon:'🪙', name:'Getting Started', desc:'Earn $10K total',      reward:0.02, check:()=>S.totalEarned>=1e4},
    {id:'m1',      icon:'💵', name:'Six Figures+',    desc:'Earn $1M total',       reward:0.03, check:()=>S.totalEarned>=1e6},
    {id:'b1',      icon:'🏦', name:'Mining Magnate',  desc:'Earn $1B total',       reward:0.05, check:()=>S.totalEarned>=1e9},
    {id:'t1',      icon:'💎', name:'Deep Pockets',    desc:'Earn $1T total',       reward:0.08, check:()=>S.totalEarned>=1e12},
    {id:'s3',      icon:'🕳️', name:'Expanding',       desc:'Open 3 shafts',        reward:0.03, check:()=>countUnlocked()>=3},
    {id:'s6',      icon:'⬇️', name:'Going Deep',      desc:'Open 6 shafts',        reward:0.05, check:()=>countUnlocked()>=6},
    {id:'sAll',    icon:'🌋', name:'Rock Bottom',     desc:'Open every shaft',     reward:0.12, check:()=>countUnlocked()>=SHAFT_DEFS.length},
    {id:'auto',    icon:'🤖', name:'Hands Off',       desc:'Automate the 1st chain',reward:0.03, check:()=>S.warehouse.manager&&S.elevator.manager&&S.shafts[0].manager},
    {id:'lvl50',   icon:'🏋️', name:'Overbuilt',       desc:'Any shaft to Lv.50',   reward:0.05, check:()=>S.shafts.some(x=>x.unlocked&&x.level>=50)},
    {id:'lvl100',  icon:'💪', name:'Maxed Muscle',    desc:'Any shaft to Lv.100',  reward:0.08, check:()=>S.shafts.some(x=>x.unlocked&&x.level>=100)},
    {id:'p1',      icon:'🌟', name:'Cashed Out',      desc:'Sell the mine once',   reward:0.05, check:()=>S.prestigeCount>=1},
    {id:'p5',      icon:'✨', name:'Serial Seller',   desc:'Sell the mine 5 times',reward:0.08, check:()=>S.prestigeCount>=5},
    {id:'tap1k',   icon:'👆', name:'Blister Fingers', desc:'Tap 1,000 times',      reward:0.03, check:()=>S.totalTaps>=1000},
    {id:'boost10', icon:'📣', name:'Rally Cry',       desc:'Use 10 boosts',        reward:0.03, check:()=>S.boostsUsed>=10},
  ];

  // ---------------- state ----------------
  let S;
  function freshState(){
    const research={}, tree={}, boosts={};
    RESEARCH.forEach(r=>research[r.id]=0);
    PRESTIGE.forEach(p=>tree[p.id]=0);
    BOOSTS.forEach(b=>boosts[b.id]={until:0,cdUntil:0});
    return {
      cash:0, totalEarned:0, totalRun:0, goldBars:0, prestigeCount:0,
      totalTaps:0, boostsUsed:0, sound:true, lastSave:Date.now(),
      shafts:SHAFT_DEFS.map((d,i)=>({unlocked:i===0,level:1,pile:0,manager:false})),
      elevator:{level:1,manager:false}, warehouse:{level:1,pending:0,manager:false},
      research, prestigeTree:tree, boosts, achievements:[],
    };
  }

  // ---------------- multipliers ----------------
  const rLvl=id=>S.research[id]||0;
  const pLvl=id=>S.prestigeTree[id]||0;
  const now=()=>Date.now();
  const rallyActive=()=>now()<S.boosts.rally.until;
  const grActive=()=>now()<S.boosts.goldrush.until;
  function achMult(){ let m=1; ACH.forEach(a=>{ if(S.achievements.indexOf(a.id)>=0) m+=a.reward; }); return m; }

  const mShaft=()=>(1+rLvl('drill')*0.08)*(1+pLvl('legacy')*0.07)*(rallyActive()?3:1);
  const mTransport=()=>(1+rLvl('winch')*0.08)*(1+pLvl('logistics')*0.07)*(rallyActive()?3:1);
  const mSell=()=>(1+rLvl('trade')*0.08)*(1+pLvl('handshake')*0.10)*(grActive()?5:1);
  const mCap=()=>1+rLvl('cart')*0.15;
  const mTap=()=>1+rLvl('boss')*0.20;
  const mIncome=()=>(1+rLvl('core')*0.06)*(1+pLvl('compound')*0.05)*achMult();
  const orePayout=()=>ORE_PRICE*mSell()*mIncome();
  const boostDurMult=()=>1+pLvl('overclock')*0.15;
  const boostCdRed=()=>pLvl('overclock')*12;

  // milestone "miners": how many thresholds a level has passed, and the ×2^n output multiplier
  function milestoneCount(lv){ let n=0; for(let k=0;k<MILESTONES.length;k++){ if(lv>=MILESTONES[k]) n++; else break; } return n; }
  const milestone=lv=>Math.pow(2,milestoneCount(lv));
  const nextMilestone=lv=>{ for(let k=0;k<MILESTONES.length;k++){ if(lv<MILESTONES[k]) return MILESTONES[k]; } return null; };

  // per-level upgrade cost factors (cost to go level L→L+1 is factor*COST_GROWTH^(L-1))
  const shaftUpFactor=i=>8+SHAFT_DEFS[i].base*4;
  const ELEV_UP_FACTOR=15, WH_UP_FACTOR=12;

  const shaftRate=i=>SHAFT_DEFS[i].base*S.shafts[i].level*milestone(S.shafts[i].level)*mShaft();
  const shaftCap=i=>(12+SHAFT_DEFS[i].base*6)*S.shafts[i].level*mCap();
  const shaftUpCost=i=>Math.floor(shaftUpFactor(i)*Math.pow(COST_GROWTH,S.shafts[i].level-1));
  const shaftMgrCost=i=>Math.max(50,Math.floor(SHAFT_DEFS[i].unlockCost*0.4));
  const elevRate=()=>1.8*S.elevator.level*milestone(S.elevator.level)*mTransport();
  const elevUpCost=()=>Math.floor(ELEV_UP_FACTOR*Math.pow(COST_GROWTH,S.elevator.level-1));
  const ELEV_MGR=120;
  const whRate=()=>1.6*S.warehouse.level*milestone(S.warehouse.level)*mTransport();
  const whCap=()=>30*S.warehouse.level*mCap();
  const whUpCost=()=>Math.floor(WH_UP_FACTOR*Math.pow(COST_GROWTH,S.warehouse.level-1));
  const WH_MGR=40;

  // ---- bulk-buy helpers (respect the Buy x1/x10/x100/Max toggle) ----
  let buyMult=1; // 1 | 10 | 100 | 'max'
  const stepCost=(factor,level)=>Math.floor(factor*Math.pow(COST_GROWTH,level-1));
  // how many levels the current buy mode wants, and their total cost, from `level` with `cash` on hand
  function bulkPlan(factor,level,cash,levelCap){
    let n=0,cost=0,l=level;
    const want=(buyMult==='max')?Infinity:buyMult;
    while(n<want){
      if(levelCap!=null && l>levelCap) break;
      const c=stepCost(factor,l);
      if(buyMult==='max' && cost+c>cash) break; // Max: as many as affordable
      cost+=c; l++; n++;
      if(n>1e6) break;
    }
    return {n,cost};
  }
  function affordLevels(factor,level,cash,levelCap){
    // for fixed x10/x100: buy the whole batch only if affordable; returns {n,cost,ok}
    const plan=bulkPlan(factor,level,cash,levelCap);
    if(buyMult==='max') return {n:plan.n,cost:plan.cost,ok:plan.n>0};
    return {n:plan.n,cost:plan.cost,ok:plan.n>0 && plan.cost<=cash};
  }

  function countUnlocked(){ let n=0; S.shafts.forEach(s=>{ if(s.unlocked) n++; }); return n; }
  function totalPile(){ let t=0; S.shafts.forEach(s=>{ if(s.unlocked) t+=s.pile; }); return t; }
  function totalPileCap(){ let t=0; S.shafts.forEach((s,i)=>{ if(s.unlocked) t+=shaftCap(i); }); return t; }
  function bottleneck(){
    let dig=0,any=false; S.shafts.forEach((s,i)=>{ if(s.unlocked&&s.manager){ dig+=shaftRate(i); any=true; } });
    if(!any||!S.elevator.manager||!S.warehouse.manager) return 0;
    return Math.min(dig,elevRate(),whRate())*orePayout();
  }
  function pullOre(amount){ let need=amount,got=0; for(let i=0;i<S.shafts.length;i++){ const s=S.shafts[i]; if(!s.unlocked||s.pile<=0) continue; const take=Math.min(s.pile,need); s.pile-=take; got+=take; need-=take; if(need<=1e-9) break; } return got; }
  function addCash(v){ S.cash+=v; S.totalEarned+=v; S.totalRun+=v; }

  function autoStep(dt){
    S.shafts.forEach((s,i)=>{ if(s.unlocked&&s.manager) s.pile=Math.min(shaftCap(i),s.pile+shaftRate(i)*dt); });
    if(S.elevator.manager){ const space=whCap()-S.warehouse.pending; const mv=Math.min(elevRate()*dt,space); if(mv>0) S.warehouse.pending+=pullOre(mv); }
    if(S.warehouse.manager){ const sold=Math.min(whRate()*dt,S.warehouse.pending); if(sold>0){ S.warehouse.pending-=sold; addCash(sold*orePayout()); } }
  }

  // ---------------- taps ----------------
  function tapShaft(i){ const s=S.shafts[i]; if(!s.unlocked) return; const b=s.pile; s.pile=Math.min(shaftCap(i),s.pile+shaftRate(i)*TAP_SECS*mTap()); const g=s.pile-b; if(g>0){ S.totalTaps++; floatText(rowEl[i].icon,"+"+fmt(g),"ore"); blip(360); } }
  function tapElevator(){ const space=whCap()-S.warehouse.pending; const p=pullOre(Math.min(elevRate()*TAP_SECS*mTap(),space)); if(p>0){ S.warehouse.pending+=p; S.totalTaps++; floatText(elevRow.icon,"+"+fmt(p),"ore"); blip(300); } }
  function tapWarehouse(){ const sold=Math.min(whRate()*TAP_SECS*mTap(),S.warehouse.pending); if(sold>0){ S.warehouse.pending-=sold; const c=sold*orePayout(); addCash(c); S.totalTaps++; floatText(whRow.icon,"+$"+fmt(c),"cash"); blip(520); } }

  // ---------------- purchases ----------------
  const buy=cost=>{ if(S.cash>=cost){ S.cash-=cost; return true; } return false; };
  function upgradeShaft(i){
    const s=S.shafts[i]; const plan=affordLevels(shaftUpFactor(i),s.level,S.cash); if(!plan.ok) return;
    const before=milestoneCount(s.level); S.cash-=plan.cost; s.level+=plan.n; const after=milestoneCount(s.level);
    if(after>before){ const g=after-before; toast("⛏️","Shaft "+(i+1)+" hired "+g+" new miner"+(g>1?"s":"")+" · ×"+milestone(s.level)+" output"); }
    chime(); render();
  }
  function shaftManager(i){ if(!S.shafts[i].manager&&buy(shaftMgrCost(i))){ S.shafts[i].manager=true; chime(); render(); } }
  function unlockShaft(i){ if(!S.shafts[i].unlocked&&buy(SHAFT_DEFS[i].unlockCost)){ S.shafts[i].unlocked=true; chime(); build(); render(); } }
  function upgradeElev(){ const plan=affordLevels(ELEV_UP_FACTOR,S.elevator.level,S.cash); if(!plan.ok) return; S.cash-=plan.cost; S.elevator.level+=plan.n; chime(); render(); }
  function elevManager(){ if(!S.elevator.manager&&buy(ELEV_MGR)){ S.elevator.manager=true; chime(); render(); } }
  function upgradeWh(){ const plan=affordLevels(WH_UP_FACTOR,S.warehouse.level,S.cash); if(!plan.ok) return; S.cash-=plan.cost; S.warehouse.level+=plan.n; chime(); render(); }
  function whManager(){ if(!S.warehouse.manager&&buy(WH_MGR)){ S.warehouse.manager=true; chime(); render(); } }

  const researchCost=r=>Math.floor(r.base*Math.pow(r.growth,rLvl(r.id)));
  function bulkPlanResearch(r,lv,cash){ let n=0,cost=0,l=lv; const want=(buyMult==='max')?Infinity:buyMult;
    while(n<want && l<r.max){ const c=Math.floor(r.base*Math.pow(r.growth,l)); if(buyMult==='max'&&cost+c>cash) break; cost+=c; l++; n++; } return {n,cost}; }
  function affordLevelsResearch(r,lv,cash){ const p=bulkPlanResearch(r,lv,cash); if(buyMult==='max') return {n:p.n,cost:p.cost,ok:p.n>0}; return {n:p.n,cost:p.cost,ok:p.n>0&&p.cost<=cash}; }
  function buyResearch(id){ const r=RESEARCH.find(x=>x.id===id); const lv=rLvl(id); if(lv>=r.max) return; const plan=affordLevelsResearch(r,lv,S.cash); if(!plan.ok) return; S.cash-=plan.cost; S.research[id]+=plan.n; chime(); }
  const prestigeCost=p=>p.baseCost+pLvl(p.id);
  function buyPrestige(id){ const p=PRESTIGE.find(x=>x.id===id); if(pLvl(id)>=p.max) return; const c=prestigeCost(p); if(S.goldBars>=c){ S.goldBars-=c; S.prestigeTree[id]++; chime(); } }

  const headstartCash=()=>pLvl('headstart')>0?1000*Math.pow(6,pLvl('headstart')-1):0;
  const prestigeGain=()=>Math.floor(3*Math.sqrt(S.totalRun/PRESTIGE_UNLOCK));
  function doPrestige(){
    const g=prestigeGain(); if(g<1) return;
    S.goldBars+=g; S.prestigeCount++;
    const keep={goldBars:S.goldBars,totalEarned:S.totalEarned,sound:S.sound,prestigeCount:S.prestigeCount,
      totalTaps:S.totalTaps,boostsUsed:S.boostsUsed,research:S.research,prestigeTree:S.prestigeTree,
      achievements:S.achievements,boosts:S.boosts};
    S=Object.assign(freshState(),keep);
    S.cash=headstartCash();
    chime(); build(); render(); save();
  }

  // ---------------- boosts ----------------
  function activateBoost(id){
    const def=BOOSTS.find(b=>b.id===id), b=S.boosts[id], t=now();
    if(t<b.cdUntil||t<b.until) return;
    b.until=t+def.dur*boostDurMult()*1000;
    b.cdUntil=b.until+Math.max(0,(def.cd-boostCdRed()))*1000;
    S.boostsUsed++; chime();
  }

  // ---------------- format ----------------
  const SUF=["","K","M","B","T","Qa","Qi","Sx","Sp","Oc","No","Dc","Ud","Dd","Td"];
  function fmt(n){
    if(!isFinite(n)) return "∞"; if(n<0) return "-"+fmt(-n);
    if(n<1000) return (n<10&&n%1!==0)?n.toFixed(1):Math.floor(n).toString();
    const tier=Math.floor(Math.log10(n)/3);
    if(tier>=SUF.length) return n.toExponential(2).replace("e+","e");
    const v=n/Math.pow(1000,tier);
    return (v<10?v.toFixed(2):v<100?v.toFixed(1):Math.floor(v).toString())+SUF[tier];
  }
  function humanTime(s){ if(s<60) return Math.round(s)+"s"; if(s<3600) return Math.round(s/60)+"m"; const h=Math.floor(s/3600),m=Math.round((s%3600)/60); return h+"h"+(m?" "+m+"m":""); }

  // ---------------- sound ----------------
  let actx=null;
  function ensureAudio(){ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(actx&&actx.state==="suspended") actx.resume(); }
  function tone(f,d,type,g){ if(!S.sound||!actx) return; try{ const o=actx.createOscillator(),ga=actx.createGain(); o.type=type||"triangle"; o.frequency.value=f; ga.gain.setValueAtTime(0,actx.currentTime); ga.gain.linearRampToValueAtTime(g||0.05,actx.currentTime+0.01); ga.gain.exponentialRampToValueAtTime(0.0001,actx.currentTime+d); o.connect(ga); ga.connect(actx.destination); o.start(); o.stop(actx.currentTime+d);}catch(e){} }
  const blip=f=>tone(f,0.08,"triangle",0.045);
  function chime(){ tone(660,0.09,"sine",0.06); setTimeout(()=>tone(990,0.11,"sine",0.055),70); }

  // ---------------- floating + toast ----------------
  function floatText(anchor,txt,cls){ if(!anchor) return; const host=anchor.closest(".card"); if(!host) return; const el=document.createElement("div"); el.className="float "+cls; el.textContent=txt; const hr=host.getBoundingClientRect(),ar=anchor.getBoundingClientRect(); el.style.left=(ar.left-hr.left+ar.width/2-10)+"px"; el.style.top=(ar.top-hr.top-4)+"px"; host.appendChild(el); setTimeout(()=>el.remove(),900); }
  function toast(icon,txt){ const w=document.getElementById("toasts"); const el=document.createElement("div"); el.className="toast"; el.innerHTML="<span>"+icon+"</span><span>"+txt+"</span>"; w.appendChild(el); setTimeout(()=>{ el.style.transition="opacity .4s"; el.style.opacity="0"; setTimeout(()=>el.remove(),400); },3200); }

  function checkAchievements(){
    let any=false;
    ACH.forEach(a=>{ if(S.achievements.indexOf(a.id)<0 && a.check()){ S.achievements.push(a.id); toast(a.icon,"Award: "+a.name+"  (+"+Math.round(a.reward*100)+"% income)"); chime(); any=true; } });
    return any;
  }

  // ---------------- DOM build (stations) ----------------
  const stationsEl=document.getElementById("stations");
  let rowEl=[], elevRow=null, whRow=null;
  function stationCard(cls){ const c=document.createElement("div"); c.className="card "+cls; c.innerHTML='<div class="row1"><div class="sicon"></div><div class="sinfo"><div class="sname"><span class="nm"></span><span class="lv"></span><span class="depth"></span></div><div class="ssub"></div><div class="bar"><span></span></div></div></div><div class="actions"></div>'; return {root:c,icon:c.querySelector(".sicon"),nm:c.querySelector(".nm"),lv:c.querySelector(".lv"),depth:c.querySelector(".depth"),sub:c.querySelector(".ssub"),bar:c.querySelector(".bar>span"),actions:c.querySelector(".actions")}; }
  function mkBtn(cls,html,onclick){ const b=document.createElement("button"); b.className="btn "+cls; b.innerHTML=html; b.addEventListener("click",e=>{e.stopPropagation();ensureAudio();onclick();}); return b; }

  function build(){
    stationsEl.innerHTML=""; rowEl=[];
    whRow=stationCard("surface"); whRow.icon.textContent="🏭"; whRow.nm.textContent="Warehouse"; whRow.depth.textContent="surface";
    whRow.upBtn=mkBtn("upgrade","",upgradeWh); whRow.mgrBtn=mkBtn("manager","",whManager);
    whRow.actions.append(mkBtn("work","💰 Sell",tapWarehouse),whRow.upBtn,whRow.mgrBtn); stationsEl.appendChild(whRow.root);

    elevRow=stationCard(""); elevRow.icon.textContent="🛗"; elevRow.nm.textContent="Elevator"; elevRow.depth.textContent="hoist";
    elevRow.upBtn=mkBtn("upgrade","",upgradeElev); elevRow.mgrBtn=mkBtn("manager","",elevManager);
    elevRow.actions.append(mkBtn("work","▲ Haul",tapElevator),elevRow.upBtn,elevRow.mgrBtn); stationsEl.appendChild(elevRow.root);

    for(let i=0;i<S.shafts.length;i++){
      const s=S.shafts[i];
      if(s.unlocked){
        const r=stationCard(""); r.icon.textContent="⛏️"; r.nm.textContent="Shaft "+(i+1); r.depth.textContent="-"+SHAFT_DEFS[i].depth+"m";
        r.upBtn=mkBtn("upgrade","",()=>upgradeShaft(i)); r.mgrBtn=mkBtn("manager","",()=>shaftManager(i));
        r.actions.append(mkBtn("work","⛏️ Dig",()=>tapShaft(i)),r.upBtn,r.mgrBtn);
        r.milestone=document.createElement("div"); r.milestone.className="milestone"; r.root.appendChild(r.milestone);
        stationsEl.appendChild(r.root); rowEl[i]=r;
      }else{
        const r=stationCard("locked"); r.icon.textContent="🔒"; r.nm.textContent="Shaft "+(i+1); r.depth.textContent="-"+SHAFT_DEFS[i].depth+"m";
        r.sub.textContent="A deeper, richer seam awaits."; r.bar.parentElement.style.display="none";
        r.unlockBtn=mkBtn("unlock","",()=>unlockShaft(i)); r.actions.append(r.unlockBtn);
        stationsEl.appendChild(r.root); rowEl[i]=r; break;
      }
    }
  }

  // ---------------- render main ----------------
  const cashEl=document.getElementById("cash"), rateEl=document.getElementById("rate"), gbCount=document.getElementById("gbCount");
  // bulk-aware upgrade button: reflects the Buy ×1/×10/×100/Max toggle
  function setUpgradeBulk(btn,factor,level,levelCap){
    const plan=affordLevels(factor,level,S.cash,levelCap);
    let label,cost;
    if(buyMult==='max'){ label="Max"+(plan.n?(" ×"+plan.n):""); cost=plan.n?plan.cost:stepCost(factor,level); }
    else { label=buyMult===1?"Upgrade":("Upgrade ×"+buyMult); cost=bulkPlan(factor,level,Infinity,levelCap).cost; }
    btn.innerHTML=label+'<small class="cost">$'+fmt(cost)+"</small>"; btn.disabled=!plan.ok;
  }
  function setManager(btn,owned,cost){ if(owned){ btn.className="btn manager owned"; btn.innerHTML='Manager<small>✓ auto</small>'; btn.disabled=true; }else{ btn.className="btn manager"; btn.innerHTML='Hire manager<small class="cost">$'+fmt(cost)+"</small>"; btn.disabled=S.cash<cost; } }
  const milestoneText=lv=>{ const c=milestoneCount(lv), nx=nextMilestone(lv); return "⛏️ "+c+" miner"+(c===1?"":"s")+" · ×"+milestone(lv)+" output"+(nx?" · next at Lv."+nx:" · MAX crew"); };

  // boost bar
  const boostBar=document.getElementById("boostBar"); let boostEls={};
  function buildBoostBar(){ boostBar.innerHTML=""; boostEls={}; BOOSTS.forEach(def=>{ const el=document.createElement("div"); el.className="boost"; el.innerHTML='<div class="fill"></div><div class="bname">'+def.icon+" "+def.name+'</div><div class="bstat"></div>'; el.addEventListener("click",()=>{ensureAudio();activateBoost(def.id);}); boostBar.appendChild(el); boostEls[def.id]={root:el,fill:el.querySelector(".fill"),stat:el.querySelector(".bstat")}; }); }
  function renderBoosts(){ const t=now(); BOOSTS.forEach(def=>{ const b=S.boosts[def.id], e=boostEls[def.id]; e.root.className="boost"; if(t<b.until){ e.root.classList.add("active"); const rem=(b.until-t)/1000; e.stat.textContent="×"+def.mult+" · "+Math.ceil(rem)+"s left"; e.fill.style.width=(rem/(def.dur*boostDurMult())*100)+"%"; }else if(t<b.cdUntil){ e.root.classList.add("cool"); const rem=(b.cdUntil-t)/1000; e.stat.textContent="ready in "+Math.ceil(rem)+"s"; const total=Math.max(1,(def.cd-boostCdRed())); e.fill.style.width=(100-rem/total*100)+"%"; }else{ e.root.classList.add("ready"); e.stat.textContent="Ready · ×"+def.mult+" for "+Math.round(def.dur*boostDurMult())+"s"; e.fill.style.width="100%"; } }); }

  function updateBadges(){
    const rAff=RESEARCH.some(r=>rLvl(r.id)<r.max&&S.cash>=researchCost(r));
    document.getElementById("badgeResearch").classList.toggle("show",rAff);
    const pAff=S.totalRun>=PRESTIGE_UNLOCK&&(prestigeGain()>=1||PRESTIGE.some(p=>pLvl(p.id)<p.max&&S.goldBars>=prestigeCost(p)));
    document.getElementById("badgePrestige").classList.toggle("show",pAff);
    document.getElementById("badgeAch").classList.remove("show");
  }

  function render(){
    cashEl.innerHTML='<span class="cur">$</span>'+fmt(S.cash);
    rateEl.textContent=fmt(bottleneck());
    gbCount.textContent=fmt(S.goldBars);

    const whM=milestone(S.warehouse.level);
    whRow.lv.textContent="Lv."+S.warehouse.level+(whM>1?" ×"+whM:"");
    whRow.sub.innerHTML="Sells <b>"+fmt(whRate())+"</b> ore/s · $"+fmt(whRate()*orePayout())+"/s · stock "+fmt(S.warehouse.pending)+"/"+fmt(whCap());
    whRow.bar.style.width=Math.min(100,S.warehouse.pending/whCap()*100)+"%";
    setUpgradeBulk(whRow.upBtn,WH_UP_FACTOR,S.warehouse.level); setManager(whRow.mgrBtn,S.warehouse.manager,WH_MGR);

    const elM=milestone(S.elevator.level);
    elevRow.lv.textContent="Lv."+S.elevator.level+(elM>1?" ×"+elM:"");
    elevRow.sub.innerHTML="Hauls <b>"+fmt(elevRate())+"</b> ore/s · waiting "+fmt(totalPile());
    elevRow.bar.style.width=Math.min(100,totalPileCap()?totalPile()/totalPileCap()*100:0)+"%";
    setUpgradeBulk(elevRow.upBtn,ELEV_UP_FACTOR,S.elevator.level); setManager(elevRow.mgrBtn,S.elevator.manager,ELEV_MGR);

    S.shafts.forEach((s,i)=>{ const r=rowEl[i]; if(!r) return;
      if(s.unlocked){ r.lv.textContent="Lv."+s.level; r.sub.innerHTML="Digs <b>"+fmt(shaftRate(i))+"</b> ore/s · pile "+fmt(s.pile)+"/"+fmt(shaftCap(i)); r.bar.style.width=Math.min(100,s.pile/shaftCap(i)*100)+"%"; setUpgradeBulk(r.upBtn,shaftUpFactor(i),s.level); setManager(r.mgrBtn,s.manager,shaftMgrCost(i)); if(r.milestone) r.milestone.textContent=milestoneText(s.level); }
      else if(r.unlockBtn){ r.unlockBtn.innerHTML="🔓 Open Shaft "+(i+1)+'<small class="cost">$'+fmt(SHAFT_DEFS[i].unlockCost)+"</small>"; r.unlockBtn.disabled=S.cash<SHAFT_DEFS[i].unlockCost; }
    });
    updateBadges();
  }

  // ---------------- research sheet ----------------
  const researchBody=document.getElementById("researchBody"); let researchRows=[];
  function buildResearch(){ researchBody.innerHTML=""; researchRows=[]; RESEARCH.forEach(r=>{ const row=document.createElement("div"); row.className="prow"; row.innerHTML='<div class="pi">'+r.icon+'</div><div class="pmid"><div class="ptop"><span>'+r.name+'</span><span class="plv"></span></div><div class="peff"></div></div>'; const btn=document.createElement("button"); btn.className="buybtn"; btn.addEventListener("click",()=>{buyResearch(r.id);updateResearch();render();}); row.appendChild(btn); researchBody.appendChild(row); researchRows.push({def:r,root:row,lv:row.querySelector(".plv"),eff:row.querySelector(".peff"),btn:btn}); }); }
  function updateResearch(){ researchRows.forEach(o=>{ const r=o.def,lv=rLvl(r.id),maxed=lv>=r.max; o.lv.textContent="Lv."+lv; o.eff.innerHTML="<b>+"+Math.round(lv*r.per*100)+"%</b> "+r.unit+(maxed?" (max)":" · +"+Math.round(r.per*100)+"%/lv"); o.root.classList.toggle("max",maxed); if(maxed){ o.btn.className="buybtn maxed"; o.btn.innerHTML="MAX"; o.btn.disabled=true; } else { const plan=affordLevelsResearch(r,lv,S.cash); let label,cost; if(buyMult==='max'){ label="Max"+(plan.n?(" ×"+plan.n):""); cost=plan.n?plan.cost:researchCost(r); } else { label=buyMult===1?"Upgrade":("Upgrade ×"+Math.min(buyMult,r.max-lv)); cost=bulkPlanResearch(r,lv,Infinity).cost; } o.btn.className="buybtn"; o.btn.innerHTML=label+'<span class="c">$'+fmt(cost)+"</span>"; o.btn.disabled=!plan.ok; } }); }

  // ---------------- prestige sheet ----------------
  const prestigeBody=document.getElementById("prestigeBody"); let prestigeRows=[];
  function prestigeEffectText(p){ const lv=pLvl(p.id); if(p.special==="headstart"){ const next=1000*Math.pow(6,lv); return "<b>$"+fmt(headstartCash())+"</b> starting cash"+(lv<p.max?" · next: $"+fmt(next):""); } if(p.special==="overclock"){ return "<b>+"+Math.round(lv*15)+"%</b> duration, <b>-"+(lv*12)+"s</b> cooldown"; } return "<b>+"+Math.round(lv*p.per*100)+"%</b> "+p.unit+(lv<p.max?" · +"+Math.round(p.per*100)+"%/lv":""); }
  function buildPrestige(){ prestigeBody.innerHTML=""; prestigeRows=[];
    const banner=document.createElement("div"); banner.className="prow"; banner.style.borderColor="var(--gold-deep)"; banner.innerHTML='<div class="pi">🪙</div><div class="pmid"><div class="ptop"><span>Sell the mine</span></div><div class="peff" id="sellHint"></div></div>'; const sb=document.createElement("button"); sb.className="buybtn gb"; sb.id="sellBtn"; sb.addEventListener("click",()=>{ const g=prestigeGain(); if(g<1) return; confirmModal("Sell the mine?","Collect <b>"+g+" gold bar"+(g===1?"":"s")+"</b>. Shaft levels, managers and cash reset — research, awards and this tree are kept.","Sell mine",()=>{doPrestige();buildPrestige();updatePrestige();}); }); banner.appendChild(sb); prestigeBody.appendChild(banner); prestigeRows.push({banner:true,hint:banner.querySelector("#sellHint"),btn:sb});
    PRESTIGE.forEach(p=>{ const row=document.createElement("div"); row.className="prow"; row.innerHTML='<div class="pi">'+p.icon+'</div><div class="pmid"><div class="ptop"><span>'+p.name+'</span><span class="plv"></span></div><div class="peff"></div></div>'; const btn=document.createElement("button"); btn.className="buybtn gb"; btn.addEventListener("click",()=>{buyPrestige(p.id);updatePrestige();render();}); row.appendChild(btn); prestigeBody.appendChild(row); prestigeRows.push({def:p,root:row,lv:row.querySelector(".plv"),eff:row.querySelector(".peff"),btn:btn}); });
  }
  function updatePrestige(){ document.getElementById("prestigeSub").textContent=fmt(S.goldBars)+" gold bars available";
    prestigeRows.forEach(o=>{ if(o.banner){ const g=prestigeGain(); o.hint.innerHTML=S.totalRun>=PRESTIGE_UNLOCK?("Worth <b>"+fmt(g)+" 🪙</b> now — earn more this run for a bigger payout"):("Earn <b>$"+fmt(PRESTIGE_UNLOCK)+"</b> this run to unlock (now $"+fmt(S.totalRun)+")"); o.btn.innerHTML=g>=1?("Sell<span class=\"c\">"+fmt(g)+" 🪙</span>"):"Sell"; o.btn.disabled=g<1; return; } const p=o.def,lv=pLvl(p.id),maxed=lv>=p.max; o.lv.textContent="Lv."+lv; o.eff.innerHTML=prestigeEffectText(p); o.root.classList.toggle("max",maxed); if(maxed){ o.btn.className="buybtn maxed"; o.btn.innerHTML="MAX"; o.btn.disabled=true; } else { const c=prestigeCost(p); o.btn.className="buybtn gb"; o.btn.innerHTML='Buy<span class="c">'+fmt(c)+" 🪙</span>"; o.btn.disabled=S.goldBars<c; } }); }

  // ---------------- achievements sheet ----------------
  const achBody=document.getElementById("achBody");
  function buildAch(){ achBody.innerHTML=""; ACH.forEach(a=>{ const got=S.achievements.indexOf(a.id)>=0; const el=document.createElement("div"); el.className="ach"+(got?" got":""); el.dataset.id=a.id; el.innerHTML='<div class="aic">'+(got?a.icon:"🔒")+'</div><div class="an">'+a.name+'</div><div class="ad">'+a.desc+'</div><div class="ar">+'+Math.round(a.reward*100)+"% income</div>"; achBody.appendChild(el); }); document.getElementById("achSub").textContent=S.achievements.length+" / "+ACH.length+" earned · +"+Math.round((achMult()-1)*100)+"% total"; }
  function updateAch(){ Array.from(achBody.children).forEach(el=>{ const a=ACH.find(x=>x.id===el.dataset.id); const got=S.achievements.indexOf(a.id)>=0; if(got&&!el.classList.contains("got")){ el.classList.add("got"); el.querySelector(".aic").textContent=a.icon; } }); document.getElementById("achSub").textContent=S.achievements.length+" / "+ACH.length+" earned · +"+Math.round((achMult()-1)*100)+"% total"; }

  // ---------------- sheets open/close ----------------
  function openSheet(id,buildFn,updateFn){ if(buildFn) buildFn(); if(updateFn) updateFn(); document.getElementById(id).classList.add("show"); openSheetId=id; openUpdateFn=updateFn; }
  let openSheetId=null, openUpdateFn=null;
  function closeSheet(id){ document.getElementById(id).classList.remove("show"); if(openSheetId===id){ openSheetId=null; openUpdateFn=null; } }
  // buy-multiplier toggle (×1 / ×10 / ×100 / Max)
  const BUYMULT_KEY="deepDelve.buyMult";
  const buyModeEl=document.getElementById("buyMode");
  function setBuyMult(v){ buyMult=(v==='max')?'max':(parseInt(v,10)||1); buyModeEl.querySelectorAll(".bm").forEach(x=>x.classList.toggle("on",String(x.dataset.mult)===String(buyMult))); try{localStorage.setItem(BUYMULT_KEY,String(buyMult));}catch(e){} }
  buyModeEl.querySelectorAll(".bm").forEach(b=>b.addEventListener("click",()=>{ ensureAudio(); setBuyMult(b.dataset.mult); render(); if(openSheetId==="researchScrim") updateResearch(); blip(430); }));
  try{ const bm=localStorage.getItem(BUYMULT_KEY); if(bm) setBuyMult(bm); }catch(e){}

  document.getElementById("navResearch").addEventListener("click",()=>{ensureAudio();openSheet("researchScrim",buildResearch,updateResearch);});
  document.getElementById("navPrestige").addEventListener("click",()=>{ensureAudio();openSheet("prestigeScrim",buildPrestige,updatePrestige);});
  document.getElementById("navAch").addEventListener("click",()=>{ensureAudio();openSheet("achScrim",buildAch,updateAch);});
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeSheet(b.dataset.close)));
  [ "researchScrim","prestigeScrim","achScrim" ].forEach(id=>{ document.getElementById(id).addEventListener("click",e=>{ if(e.target.id===id) closeSheet(id); }); });

  // ---------------- confirm ----------------
  let confirmCb=null;
  function confirmModal(title,msg,yes,onYes){ document.getElementById("confirmTitle").textContent=title; document.getElementById("confirmMsg").innerHTML=msg; document.getElementById("confirmYes").textContent=yes; confirmCb=onYes; document.getElementById("confirmScrim").classList.add("show"); }
  document.getElementById("confirmYes").addEventListener("click",()=>{ document.getElementById("confirmScrim").classList.remove("show"); const cb=confirmCb; confirmCb=null; if(cb) cb(); });
  document.getElementById("confirmNo").addEventListener("click",()=>{ document.getElementById("confirmScrim").classList.remove("show"); confirmCb=null; });

  // ---------------- settings / header ----------------
  function refreshSoundBtn(){ document.getElementById("soundBtn").textContent=S.sound?"🔊":"🔇"; document.getElementById("setSound").textContent=S.sound?"On":"Off"; }
  document.getElementById("soundBtn").addEventListener("click",()=>{ensureAudio();S.sound=!S.sound;refreshSoundBtn();if(S.sound)chime();save();});
  document.getElementById("setSound").addEventListener("click",()=>{S.sound=!S.sound;refreshSoundBtn();save();});
  document.getElementById("settingsBtn").addEventListener("click",()=>{ document.getElementById("setTotal").textContent="$"+fmt(S.totalEarned); document.getElementById("setPrestige").textContent=S.prestigeCount; document.getElementById("settingsScrim").classList.add("show"); });
  document.getElementById("setClose").addEventListener("click",()=>document.getElementById("settingsScrim").classList.remove("show"));
  document.getElementById("welcomeOk").addEventListener("click",()=>document.getElementById("welcomeScrim").classList.remove("show"));
  document.getElementById("setReset").addEventListener("click",()=>{ confirmModal("Reset everything?","This permanently wipes all progress, including gold bars, research and awards.","Reset",()=>{ try{localStorage.removeItem(SAVE_KEY);}catch(e){} S=freshState(); build(); render(); refreshSoundBtn(); document.getElementById("settingsScrim").classList.remove("show"); }); });

  // ---------------- save / load / offline ----------------
  function save(){ try{ S.lastSave=Date.now(); localStorage.setItem(SAVE_KEY,JSON.stringify(S)); }catch(e){} }
  function load(){ try{ const raw=localStorage.getItem(SAVE_KEY); if(!raw) return false; const d=JSON.parse(raw); S=Object.assign(freshState(),d);
      S.shafts=SHAFT_DEFS.map((def,i)=>Object.assign({unlocked:i===0,level:1,pile:0,manager:false},(d.shafts||[])[i]||{}));
      const r={}; RESEARCH.forEach(x=>r[x.id]=(d.research&&d.research[x.id])||0); S.research=r;
      const t={}; PRESTIGE.forEach(x=>t[x.id]=(d.prestigeTree&&d.prestigeTree[x.id])||0); S.prestigeTree=t;
      const bo={}; BOOSTS.forEach(x=>bo[x.id]=Object.assign({until:0,cdUntil:0},(d.boosts&&d.boosts[x.id])||{})); S.boosts=bo;
      if(!Array.isArray(S.achievements)) S.achievements=[];
      return true; }catch(e){ return false; } }
  function runOffline(){ const elapsed=Math.min(OFFLINE_CAP,(Date.now()-S.lastSave)/1000); if(elapsed<8) return; const before=S.totalEarned; let t=elapsed; while(t>0){ autoStep(Math.min(0.5,t)); t-=0.5; } const earned=S.totalEarned-before; if(earned>0.5){ document.getElementById("welcomeAmt").textContent="$"+fmt(earned); document.getElementById("welcomeTime").textContent="Away for "+humanTime(elapsed)+(elapsed>=OFFLINE_CAP?" (capped at 8h)":""); document.getElementById("welcomeScrim").classList.add("show"); } }

  // ---------------- loop ----------------
  let lastT=performance.now();
  function loop(nowt){ let dt=(nowt-lastT)/1000; lastT=nowt; if(dt>0.25) dt=0.25; autoStep(dt); if(checkAchievements()){} render(); renderBoosts(); if(openUpdateFn) openUpdateFn(); requestAnimationFrame(loop); }

  // ---------------- boot ----------------
  if(!load()) S=freshState();
  refreshSoundBtn(); runOffline(); buildBoostBar(); build(); render();
  setInterval(save,5000);
  document.addEventListener("visibilitychange",()=>{ if(document.hidden){ save(); } else { lastT=performance.now(); runOffline(); save(); } });
  window.addEventListener("beforeunload",save);
  requestAnimationFrame(loop);
})();
