let currentTab = 'media';
let tipoMedia = 'izquierda', tipoProp = 'izquierda', tipoCSV = 'izquierda';
let csvData = null, chartInstances = {};

// ── STATS HELPERS ─────────────────────────────────────────────
function normalPDF(x){ return Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI); }
function normalCDF(z){ const t=1/(1+0.2315419*Math.abs(z)); const p=t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429)))); const c=1-normalPDF(z)*p; return z>=0?c:1-c; }
function zCritical(alpha,tipo){ const m={'0.01':2.326,'0.05':1.645,'0.10':1.282}; const d={'0.01':2.576,'0.05':1.960,'0.10':1.645}; return tipo==='doble'?(d[alpha]||1.96):(m[alpha]||1.645); }
function pValue(z,tipo){ if(tipo==='derecha') return 1-normalCDF(z); if(tipo==='izquierda') return normalCDF(z); return 2*(1-normalCDF(Math.abs(z))); }
function mean(arr){ return arr.reduce((a,b)=>a+b,0)/arr.length; }
function std(arr){ const m=mean(arr); return Math.sqrt(arr.reduce((a,b)=>a+(b-m)**2,0)/(arr.length-1)); }
function min(arr){ return Math.min(...arr); }
function max(arr){ return Math.max(...arr); }
function median(arr){ const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }

// ── TABS ──────────────────────────────────────────────────────
function switchTab(t){
  currentTab=t;
  document.querySelectorAll('.tab').forEach((b,i)=>b.classList.toggle('active',(i===0&&t==='media')||(i===1&&t==='proporcion')));
  document.getElementById('form-media').style.display=t==='media'?'':'none';
  document.getElementById('form-proporcion').style.display=t==='proporcion'?'':'none';
  document.getElementById('results-panel').classList.remove('show');
}

function setTipo(ctx,val,btn){
  if(ctx==='media') tipoMedia=val;
  else if(ctx==='prop') tipoProp=val;
  else tipoCSV=val;
  const id=ctx==='media'?'m-tipo':ctx==='prop'?'p-tipo':'csv-tipo';
  document.getElementById(id).querySelectorAll('.radio-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

// ── CSV HANDLING ──────────────────────────────────────────────
function handleFile(file){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const lines=e.target.result.trim().split('\n');
    const headers=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
    const rows=lines.slice(1).map(l=>{
      const cols=l.split(',').map(c=>c.trim().replace(/^"|"$/g,''));
      const obj={};
      headers.forEach((h,i)=>obj[h]=cols[i]);
      return obj;
    });
    csvData={headers,rows};
    setupCSVUI(file.name);
  };
  reader.readAsText(file);
}

function setupCSVUI(fname){
  const h=csvData.headers;
  // populate selects
  ['col-group','col-value'].forEach(id=>{
    const s=document.getElementById(id); s.innerHTML='';
    h.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c; s.appendChild(o); });
  });
  // guess group col (categorical) and value col (numeric)
  const firstRow=csvData.rows[0];
  let gCol=h[1]||h[0], vCol=h[2]||h[1];
  h.forEach(c=>{ if(isNaN(parseFloat(firstRow[c]))) gCol=c; else vCol=c; });
  document.getElementById('col-group').value=gCol;
  document.getElementById('col-value').value=vCol;
  // unique group values
  const groupVals=[...new Set(csvData.rows.map(r=>r[gCol]))].filter(Boolean);
  ['val-a','val-b'].forEach((id,i)=>{
    const s=document.getElementById(id); s.innerHTML='';
    groupVals.forEach((v,j)=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; if(j===i) o.selected=true; s.appendChild(o); });
  });
  // show pills
  const nums=csvData.rows.map(r=>parseFloat(r[vCol])).filter(v=>!isNaN(v));
  const refMean=mean(nums);
  document.getElementById('csv-ref').value=refMean.toFixed(2);
  const pills=groupVals.map((v,i)=>{
    const cnt=csvData.rows.filter(r=>r[gCol]===v).length;
    return `<span class="pill ${i===0?'pill-a':'pill-b'}">${v}: ${cnt} obs.</span>`;
  }).join('');
  document.getElementById('group-pills').innerHTML=pills;
  document.getElementById('csv-file-name').textContent=fname;
  document.getElementById('csv-preview').style.display='block';
  document.getElementById('upload-zone').style.display='none';
  document.getElementById('col-mapping').style.display='block';
  document.getElementById('manual-form').style.display='none';
  document.getElementById('csv-params').style.display='block';
  document.getElementById('manual-label').style.display='none';
}

function clearCSV(){
  csvData=null;
  document.getElementById('csv-preview').style.display='none';
  document.getElementById('upload-zone').style.display='block';
  document.getElementById('col-mapping').style.display='none';
  document.getElementById('manual-form').style.display='block';
  document.getElementById('csv-params').style.display='none';
  document.getElementById('results-panel').classList.remove('show');
  document.getElementById('csv-input').value='';
}

// ── CHART HELPERS ─────────────────────────────────────────────
function destroyChart(id){ if(chartInstances[id]){ chartInstances[id].destroy(); delete chartInstances[id]; } }

function drawNormalChart(canvasId, zStat, zcrit, tipo, rechaza){
  destroyChart(canvasId);
  const pts=260, xMin=-4, xMax=4;
  const pdfData=[];
  for(let i=0;i<=pts;i++){ const x=xMin+(xMax-xMin)*i/pts; pdfData.push({x,y:normalPDF(x)}); }
  const isDark=matchMedia('(prefers-color-scheme: dark)').matches;
  const rC='rgba(162,45,45,0.32)', sC=isDark?'rgba(180,180,180,0.08)':'rgba(180,180,180,0.16)';
  const lC=isDark?'#b4b2a9':'#888780', cC='#D85A30', stC=rechaza?'#A32D2D':'#3B6D11';
  const tC=isDark?'#b4b2a9':'#5F5E5A', gC=isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)';
  function seg(x1,x2,fc){ return{type:'line',data:pdfData.filter(p=>p.x>=x1&&p.x<=x2),borderColor:'transparent',borderWidth:0,fill:{target:'origin',above:fc},pointRadius:0,tension:0.4}; }
  let ds=[];
  if(tipo==='izquierda'){ ds.push(seg(xMin,-zcrit,rC)); ds.push(seg(-zcrit,xMax,sC)); }
  else if(tipo==='derecha'){ ds.push(seg(xMin,zcrit,sC)); ds.push(seg(zcrit,xMax,rC)); }
  else { ds.push(seg(xMin,-zcrit,rC)); ds.push(seg(-zcrit,zcrit,sC)); ds.push(seg(zcrit,xMax,rC)); }
  ds.push({type:'line',data:pdfData.map(p=>({x:p.x,y:p.y})),borderColor:lC,borderWidth:1.5,fill:false,pointRadius:0,tension:0.4});
  const ctx=document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId]=new Chart(ctx,{type:'line',data:{datasets:ds},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{type:'linear',min:xMin,max:xMax,ticks:{stepSize:1,color:tC,font:{size:10}},grid:{color:gC},title:{display:true,text:'Z',color:tC,font:{size:11}}},y:{min:0,max:0.44,ticks:{display:false},grid:{display:false},border:{display:false}}},parsing:{xAxisKey:'x',yAxisKey:'y'},animation:{duration:400}},plugins:[{id:'vlines',afterDraw(chart){const{ctx,scales:{x,y}}=chart;const dV=(val,col,dash,lbl,side)=>{const px=x.getPixelForValue(val);ctx.save();ctx.beginPath();ctx.setLineDash(dash);ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.moveTo(px,y.getPixelForValue(0));ctx.lineTo(px,y.getPixelForValue(0.44));ctx.stroke();ctx.setLineDash([]);ctx.font='10px sans-serif';ctx.fillStyle=col;ctx.textAlign=side==='right'?'left':'right';ctx.fillText(lbl,px+(side==='right'?4:-4),y.getPixelForValue(0.39));ctx.restore();};if(tipo==='izquierda'||tipo==='doble') dV(-zcrit,cC,[4,3],`-${zcrit.toFixed(3)}`,'right');if(tipo==='derecha'||tipo==='doble') dV(zcrit,cC,[4,3],`${zcrit.toFixed(3)}`,'left');const cz=Math.max(xMin+0.1,Math.min(xMax-0.1,zStat));dV(cz,stC,[],`z=${zStat.toFixed(3)}`,zStat>=0?'left':'right');}}]});
}

function drawBoxChart(canvasId, grpA, grpB, lblA, lblB){
  destroyChart(canvasId);
  const isDark=matchMedia('(prefers-color-scheme: dark)').matches;
  const tC=isDark?'#b4b2a9':'#5F5E5A', gC=isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)';
  const ctx=document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId]=new Chart(ctx,{type:'bar',data:{labels:[lblA,lblB],datasets:[{label:'Media',data:[mean(grpA),mean(grpB)],backgroundColor:['rgba(29,158,117,0.5)','rgba(55,138,221,0.5)'],borderColor:['#1D9E75','#378ADD'],borderWidth:1.5},{label:'Min',data:[min(grpA),min(grpB)],backgroundColor:'transparent',borderWidth:0,type:'scatter',pointStyle:'line',radius:6,borderColor:['#1D9E75','#378ADD']},{label:'Max',data:[max(grpA),max(grpB)],backgroundColor:'transparent',borderWidth:0,type:'scatter',pointStyle:'line',radius:6,borderColor:['#1D9E75','#378ADD']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.raw.toFixed(2)}`}}},scales:{x:{ticks:{color:tC,font:{size:11}},grid:{display:false}},y:{ticks:{color:tC,font:{size:10}},grid:{color:gC}}},animation:{duration:400}}});
}

// ── SINGLE Z TEST ─────────────────────────────────────────────
function runZTest(n, xbar, sigma, mu0, alpha, tipo, label){
  const se=sigma/Math.sqrt(n);
  const z=(xbar-mu0)/se;
  const zcrit=zCritical(alpha,tipo);
  const pval=pValue(z,tipo);
  const alphaNum=parseFloat(alpha);
  let rechaza;
  if(tipo==='derecha') rechaza=z>zcrit;
  else if(tipo==='izquierda') rechaza=z<-zcrit;
  else rechaza=Math.abs(z)>zcrit;
  const sym=tipo==='izquierda'?'<':tipo==='derecha'?'>':'≠';
  const steps=[
    {t:'Hipótesis',c:`H₀: μ = ${mu0} &nbsp;|&nbsp; H₁: μ ${sym} ${mu0}`},
    {t:'Error estándar',c:`σ/√n = ${sigma.toFixed(4)} / √${n} = <strong>${se.toFixed(4)}</strong>`},
    {t:'Estadístico Z',c:`z = (x̄ − μ₀) / SE = (${xbar.toFixed(4)} − ${mu0}) / ${se.toFixed(4)} = <strong>${z.toFixed(4)}</strong>`},
    {t:'Valor crítico',c:`z<sub>α</sub> = ${tipo==='doble'?'±':''}${zcrit.toFixed(3)} (α = ${alpha})`},
    {t:'Valor p',c:`p-valor = <strong>${pval.toFixed(4)}</strong>`},
    {t:'Decisión',c:rechaza?`<strong>Se rechaza H₀</strong> — p = ${pval.toFixed(4)} < α = ${alpha}`:`<strong>No se rechaza H₀</strong> — p = ${pval.toFixed(4)} ≥ α = ${alpha}`}
  ];
  return {z,zcrit,pval,rechaza,steps,se,n,xbar,sigma,mu0,alpha,tipo};
}

function renderTestResult(prefix, result, groupName, canvasId){
  const {z,zcrit,pval,rechaza,steps,alpha,tipo}=result;
  document.getElementById(`${prefix}-metrics`).innerHTML=`
    <div class="metric"><div class="metric-label">Estadístico Z</div><div class="metric-value">${z.toFixed(4)}</div></div>
    <div class="metric"><div class="metric-label">Valor crítico</div><div class="metric-value">${tipo==='doble'?'±':''}${zcrit.toFixed(3)}</div></div>
    <div class="metric"><div class="metric-label">p-valor</div><div class="metric-value">${pval.toFixed(4)}</div></div>
    <div class="metric"><div class="metric-label">α</div><div class="metric-value">${alpha}</div></div>`;
  const v=document.getElementById(`${prefix}-verdict`);
  v.className='verdict '+(rechaza?'reject':'fail');
  v.textContent=rechaza?`✗ Se rechaza H₀ — Evidencia significativa (p = ${pval.toFixed(4)} < α = ${alpha})`:`✓ No se rechaza H₀ — Sin evidencia suficiente (p = ${pval.toFixed(4)} ≥ α = ${alpha})`;
  document.getElementById(`${prefix}-steps`).innerHTML=steps.map((s,i)=>`<div class="step"><div class="step-num">${i+1}</div><div class="step-text"><strong>${s.t}:</strong> ${s.c}</div></div>`).join('');
  drawNormalChart(canvasId,z,zcrit,tipo,rechaza);
}

// ── COMPARISON Z TEST (two independent samples) ───────────────
function runComparison(arrA, arrB, alpha, tipo, lblA, lblB){
  const nA=arrA.length, nB=arrB.length;
  const mA=mean(arrA), mB=mean(arrB);
  const sA=std(arrA), sB=std(arrB);
  const se=Math.sqrt(sA**2/nA+sB**2/nB);
  const z=(mA-mB)/se;
  const zcrit=zCritical(alpha,tipo);
  const pval=pValue(z,tipo);
  const alphaNum=parseFloat(alpha);
  let rechaza;
  if(tipo==='derecha') rechaza=z>zcrit;
  else if(tipo==='izquierda') rechaza=z<-zcrit;
  else rechaza=Math.abs(z)>zcrit;
  const sym=tipo==='izquierda'?'<':tipo==='derecha'?'>':'≠';
  const steps=[
    {t:'Hipótesis',c:`H₀: μ<sub>${lblA}</sub> = μ<sub>${lblB}</sub> &nbsp;|&nbsp; H₁: μ<sub>${lblA}</sub> ${sym} μ<sub>${lblB}</sub>`},
    {t:'Medias',c:`x̄<sub>${lblA}</sub> = ${mA.toFixed(4)}, &nbsp; x̄<sub>${lblB}</sub> = ${mB.toFixed(4)}`},
    {t:'Desv. estándar',c:`s<sub>${lblA}</sub> = ${sA.toFixed(4)}, &nbsp; s<sub>${lblB}</sub> = ${sB.toFixed(4)}`},
    {t:'Error estándar',c:`SE = √(s<sub>A</sub>²/n<sub>A</sub> + s<sub>B</sub>²/n<sub>B</sub>) = <strong>${se.toFixed(4)}</strong>`},
    {t:'Estadístico Z',c:`z = (x̄<sub>A</sub> − x̄<sub>B</sub>) / SE = (${mA.toFixed(4)} − ${mB.toFixed(4)}) / ${se.toFixed(4)} = <strong>${z.toFixed(4)}</strong>`},
    {t:'Valor crítico',c:`z<sub>α</sub> = ${tipo==='doble'?'±':''}${zcrit.toFixed(3)} (α = ${alpha})`},
    {t:'Valor p',c:`p-valor = <strong>${pval.toFixed(4)}</strong>`},
    {t:'Decisión',c:rechaza?`<strong>Se rechaza H₀</strong> — Diferencia significativa entre grupos (p = ${pval.toFixed(4)} < α = ${alpha})`:`<strong>No se rechaza H₀</strong> — No hay diferencia significativa (p = ${pval.toFixed(4)} ≥ α = ${alpha})`}
  ];
  return {z,zcrit,pval,rechaza,steps,alpha,tipo};
}

// ── MAIN RUNNER ───────────────────────────────────────────────
function runAll(){
  const panel=document.getElementById('results-panel');
  panel.classList.remove('show');

  if(csvData){
    runCSVMode();
  } else {
    runManualMode();
  }
  panel.classList.add('show');
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}

function runManualMode(){
  // hide CSV sections
  ['csv-compare-section','res-a-section','res-b-section','sep-ab','res-comp-section'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById('res-single-section').style.display='block';

  let z, alpha, tipo, steps, rechaza, zcrit, pval;
  if(currentTab==='media'){
    const n=parseFloat(document.getElementById('m-n').value);
    const xbar=parseFloat(document.getElementById('m-xbar').value);
    const sigma=parseFloat(document.getElementById('m-sigma').value);
    const mu0=parseFloat(document.getElementById('m-mu0').value);
    alpha=document.getElementById('m-alpha').value;
    tipo=tipoMedia;
    if([n,xbar,sigma,mu0].some(isNaN)||n<1||sigma<=0){ alert('Completa todos los campos.'); return; }
    const r=runZTest(n,xbar,sigma,mu0,alpha,tipo,'');
    z=r.z; zcrit=r.zcrit; pval=r.pval; rechaza=r.rechaza; steps=r.steps;
    document.getElementById('res-single-title').textContent='Resultados — Prueba Z para la media';
  } else {
    const n=parseFloat(document.getElementById('p-n').value);
    const phat=parseFloat(document.getElementById('p-phat').value);
    const p0=parseFloat(document.getElementById('p-p0').value);
    alpha=document.getElementById('p-alpha').value;
    tipo=tipoProp;
    if([n,phat,p0].some(isNaN)||n<1||phat<0||phat>1||p0<=0||p0>=1){ alert('Completa todos los campos.'); return; }
    const se=Math.sqrt(p0*(1-p0)/n);
    z=(phat-p0)/se;
    zcrit=zCritical(alpha,tipo);
    pval=pValue(z,tipo);
    const alphaNum=parseFloat(alpha);
    if(tipo==='derecha') rechaza=z>zcrit;
    else if(tipo==='izquierda') rechaza=z<-zcrit;
    else rechaza=Math.abs(z)>zcrit;
    const sym=tipo==='izquierda'?'<':tipo==='derecha'?'>':'≠';
    steps=[
      {t:'Hipótesis',c:`H₀: p = ${p0} &nbsp;|&nbsp; H₁: p ${sym} ${p0}`},
      {t:'Error estándar',c:`SE = √(p₀·(1−p₀)/n) = <strong>${se.toFixed(4)}</strong>`},
      {t:'Estadístico Z',c:`z = (p̂ − p₀) / SE = <strong>${z.toFixed(4)}</strong>`},
      {t:'Valor crítico',c:`z<sub>α</sub> = ${tipo==='doble'?'±':''}${zcrit.toFixed(3)}`},
      {t:'Valor p',c:`p-valor = <strong>${pval.toFixed(4)}</strong>`},
      {t:'Decisión',c:rechaza?`<strong>Se rechaza H₀</strong> — p = ${pval.toFixed(4)} < α = ${alpha}`:`<strong>No se rechaza H₀</strong> — p = ${pval.toFixed(4)} ≥ α = ${alpha}`}
    ];
    document.getElementById('res-single-title').textContent='Resultados — Prueba Z para la proporción';
  }

  document.getElementById('res-metrics').innerHTML=`
    <div class="metric"><div class="metric-label">Estadístico Z</div><div class="metric-value">${z.toFixed(4)}</div></div>
    <div class="metric"><div class="metric-label">Valor crítico</div><div class="metric-value">${tipo==='doble'?'±':''}${zcrit.toFixed(3)}</div></div>
    <div class="metric"><div class="metric-label">p-valor</div><div class="metric-value">${pval.toFixed(4)}</div></div>
    <div class="metric"><div class="metric-label">α</div><div class="metric-value">${alpha}</div></div>`;
  const v=document.getElementById('res-verdict');
  v.className='verdict '+(rechaza?'reject':'fail');
  v.textContent=rechaza?`✗ Se rechaza H₀ — p = ${pval.toFixed(4)} < α = ${alpha}`:`✓ No se rechaza H₀ — p = ${pval.toFixed(4)} ≥ α = ${alpha}`;
  document.getElementById('res-steps').innerHTML=steps.map((s,i)=>`<div class="step"><div class="step-num">${i+1}</div><div class="step-text"><strong>${s.t}:</strong> ${s.c}</div></div>`).join('');
  drawNormalChart('distChart',z,zcrit,tipo,rechaza);
}

function runCSVMode(){
  document.getElementById('res-single-section').style.display='none';
  const gCol=document.getElementById('col-group').value;
  const vCol=document.getElementById('col-value').value;
  const lblA=document.getElementById('val-a').value;
  const lblB=document.getElementById('val-b').value;
  const alpha=document.getElementById('csv-alpha').value;
  const tipo=tipoCSV;
  const ref=parseFloat(document.getElementById('csv-ref').value);

  const getVals=(lbl)=>csvData.rows.filter(r=>r[gCol]===lbl).map(r=>parseFloat(r[vCol])).filter(v=>!isNaN(v));
  const arrA=getVals(lblA), arrB=getVals(lblB);
  if(!arrA.length||!arrB.length){ alert('No se encontraron datos para los grupos seleccionados.'); return; }

  const mA=mean(arrA), mB=mean(arrB);
  const sA=std(arrA), sB=std(arrB);

  // Descriptive stats
  document.getElementById('csv-compare-section').style.display='block';
  document.getElementById('compare-cards').innerHTML=`
    <div class="compare-card grp-a">
      <div class="compare-card-title">${lblA}</div>
      <div class="stat-row"><span class="stat-key">n</span><span class="stat-val">${arrA.length}</span></div>
      <div class="stat-row"><span class="stat-key">Media</span><span class="stat-val">${mA.toFixed(4)}</span></div>
      <div class="stat-row"><span class="stat-key">Desv. estándar</span><span class="stat-val">${sA.toFixed(4)}</span></div>
      <div class="stat-row"><span class="stat-key">Mínimo</span><span class="stat-val">${min(arrA).toFixed(2)}</span></div>
      <div class="stat-row"><span class="stat-key">Mediana</span><span class="stat-val">${median(arrA).toFixed(2)}</span></div>
      <div class="stat-row"><span class="stat-key">Máximo</span><span class="stat-val">${max(arrA).toFixed(2)}</span></div>
    </div>
    <div class="compare-card grp-b">
      <div class="compare-card-title">${lblB}</div>
      <div class="stat-row"><span class="stat-key">n</span><span class="stat-val">${arrB.length}</span></div>
      <div class="stat-row"><span class="stat-key">Media</span><span class="stat-val">${mB.toFixed(4)}</span></div>
      <div class="stat-row"><span class="stat-key">Desv. estándar</span><span class="stat-val">${sB.toFixed(4)}</span></div>
      <div class="stat-row"><span class="stat-key">Mínimo</span><span class="stat-val">${min(arrB).toFixed(2)}</span></div>
      <div class="stat-row"><span class="stat-key">Mediana</span><span class="stat-val">${median(arrB).toFixed(2)}</span></div>
      <div class="stat-row"><span class="stat-key">Máximo</span><span class="stat-val">${max(arrB).toFixed(2)}</span></div>
    </div>`;
  drawBoxChart('boxChart',arrA,arrB,lblA,lblB);

  // Individual tests
  const rA=runZTest(arrA.length,mA,sA,ref,alpha,tipo,lblA);
  document.getElementById('res-a-section').style.display='block';
  document.getElementById('res-a-title').textContent=`Prueba de hipótesis — ${lblA}`;
  renderTestResult('res-a',rA,lblA,'chartA');

  document.getElementById('sep-ab').style.display='block';

  const rB=runZTest(arrB.length,mB,sB,ref,alpha,tipo,lblB);
  document.getElementById('res-b-section').style.display='block';
  document.getElementById('res-b-title').textContent=`Prueba de hipótesis — ${lblB}`;
  renderTestResult('res-b',rB,lblB,'chartB');

  // Between-group comparison
  const rComp=runComparison(arrA,arrB,alpha,tipo,lblA,lblB);
  document.getElementById('res-comp-section').style.display='block';
  document.getElementById('res-comp-metrics').innerHTML=`
    <div class="metric"><div class="metric-label">Estadístico Z</div><div class="metric-value">${rComp.z.toFixed(4)}</div></div>
    <div class="metric"><div class="metric-label">Valor crítico</div><div class="metric-value">${tipo==='doble'?'±':''}${rComp.zcrit.toFixed(3)}</div></div>
    <div class="metric"><div class="metric-label">p-valor</div><div class="metric-value">${rComp.pval.toFixed(4)}</div></div>
    <div class="metric"><div class="metric-label">Diferencia</div><div class="metric-value">${(mA-mB).toFixed(4)}</div></div>`;
  const vc=document.getElementById('res-comp-verdict');
  vc.className='verdict '+(rComp.rechaza?'reject':'fail');
  vc.textContent=rComp.rechaza?`✗ Se rechaza H₀ — Los grupos difieren significativamente (p = ${rComp.pval.toFixed(4)} < α = ${alpha})`:`✓ No se rechaza H₀ — No hay diferencia significativa entre grupos (p = ${rComp.pval.toFixed(4)} ≥ α = ${alpha})`;
  document.getElementById('res-comp-steps').innerHTML=rComp.steps.map((s,i)=>`<div class="step"><div class="step-num">${i+1}</div><div class="step-text"><strong>${s.t}:</strong> ${s.c}</div></div>`).join('');
  drawNormalChart('chartComp',rComp.z,rComp.zcrit,tipo,rComp.rechaza);
}