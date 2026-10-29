(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};

/* ================= ДОСТУП: расшифровка по PIN ================= */
function b64(s){var b=atob(s),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
async function decrypt(pin){
  var r=await fetch('d.bin?'+Date.now(),{cache:'no-store'});
  if(!r.ok) throw new Error('nofile');
  var j=await r.json();
  var km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
  var key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64(j.s),iterations:j.i,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['decrypt']);
  var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(j.v)},key,b64(j.c));
  if(j.z){ var ds=new Blob([pt]).stream().pipeThrough(new DecompressionStream('deflate-raw')); pt=await new Response(ds).arrayBuffer(); }
  return JSON.parse(new TextDecoder().decode(pt));
}
var gform=$('#gform'),gerr=$('#gerr'),gbtn=$('#gbtn');
gform.addEventListener('submit',async function(e){
  e.preventDefault();
  var pin=$('#pin').value;
  if(!pin) return;
  gbtn.disabled=true;gerr.textContent='';
  try{
    var data=await decrypt(pin);
    try{ if($('#rem').checked) localStorage.setItem('_k',pin); }catch(_){}
    start(data);
  }catch(err){
    gerr.textContent=(err&&err.message==='nofile')?'Файл данных не найден':'Неверный код';
    gbtn.disabled=false;$('#pin').select();
  }
});
$('#lock').addEventListener('click',function(){try{localStorage.removeItem('_k')}catch(_){};location.reload()});
(async function auto(){
  try{var p=localStorage.getItem('_k'); if(p){ var d=await decrypt(p); start(d);} }catch(_){ try{localStorage.removeItem('_k')}catch(__){} }
})();

/* ================= ХЕЛПЕРЫ ================= */
var RUB='₽ ';
function fmt(n){ if(n==null||isNaN(n)) return '—'; var v=Math.round(n); return (v<0?'-':'')+Math.abs(v).toLocaleString('ru-RU'); }
function fm(n){ return n==null||isNaN(n)?'—':RUB+fmt(n); }
function pc(n,d){ d=d==null?1:d; return n==null||isNaN(n)?'—':n.toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d})+'%'; }
function sd(a,b){ return (!b||b===0)?null:a/b; }
function sum(a){return a.reduce(function(s,x){return s+(x||0)},0)}
function esc(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
function find(arr,part){ for(var i=0;i<arr.length;i++){ if(arr[i].name.toLowerCase().indexOf(part.toLowerCase())>-1) return arr[i]; } return null; }
function val(arr,part){ var x=find(arr,part); return x?x.value:0; }
var C={accent:'#4F8FC7',good:'#6FB8A8',bad:'#E0866B',warn:'#D9B84A',violet:'#8B7FB8',grid:'rgba(255,255,255,.07)',dim:'#9AAEC8'};
var PAL=['#4F8FC7','#6FB8A8','#8B7FB8','#E0866B','#3D6B96','#D9B84A','#7FA8D4','#5FA8A0','#9BB8D9','#B98F6B'];

/* ================= НОРМАЛИЗАЦИЯ И АНИМАЦИЯ ================= */
function nn(s){return String(s).replace(/\s+/g,' ').trim()}
function norm(m){
  var p=m.pnl,c=m.cashflow;
  p.other_revenue=p.other_revenue||0;
  p.cogs_items.forEach(function(i){i.name=nn(i.name)});
  p.expense_groups.forEach(function(g){g.name=nn(g.name);g.items.forEach(function(i){i.name=nn(i.name)})});
  c.groups.forEach(function(g){g.name=nn(g.name);g.items.forEach(function(i){i.name=nn(i.name)})});
}
function byM(k){return M.filter(function(m){return m.month===k})[0]}
function hexA(h,a){var n=parseInt(h.slice(1),16);return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')'}
/* числа в карточках «набегают» от нуля до значения */
function animateNums(){
  if(REDUCE) return;
  $$('.kpi .v,.big').forEach(function(el){
    if(el.children.length) return;
    var text=el.textContent,mt=text.match(/(-?)(\d[\d  ]*)(,(\d+))?/);
    if(!mt) return;
    var target=parseFloat(mt[2].replace(/[\s ]/g,'')+(mt[4]?'.'+mt[4]:''))*(mt[1]?-1:1);
    if(!isFinite(target)||target===0) return;
    var dec=mt[4]?mt[4].length:0,pre=text.slice(0,mt.index),suf=text.slice(mt.index+mt[0].length),t0=null,dur=800;
    function step(t){
      if(t0===null) t0=t;
      var x=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-x,3),v=target*e;
      el.textContent=x>=1?text:pre+v.toLocaleString('ru-RU',{minimumFractionDigits:dec,maximumFractionDigits:dec})+suf;
      if(x<1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

/* ================= СОСТОЯНИЕ ================= */
var D=null, M=[], sel=[], view='overview', pnlMode='abs', gran='week', charts={}, cmpA=null, cmpB=null, cmpMetric='rev';
var VIEWS=[['overview','Обзор'],['compare','Месяц к месяцу'],['pnl','ОПиУ'],['cf','ДДС'],['checks','Средний чек'],['analytics','Аналитика']];
var REDUCE=false; try{REDUCE=window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(_){}

function start(data){
  D=data;
  M=D.months.slice().sort(function(a,b){return a.month<b.month?-1:1});
  M.forEach(function(m){ norm(m); m.k=calc(m); });
  sel=M.map(function(m){return m.month});
  $('#gate').style.display='none';$('#app').style.display='block';
  document.title=D.name||'Финансы';
  $('#vname').textContent=D.name||'';
  if(D.logo) $('#logo').src='data:image/png;base64,'+D.logo; else $('#logo').style.display='none';
  $('#nav').innerHTML=VIEWS.map(function(v,i){return '<a data-v="'+v[0]+'"><i>0'+(i+1)+'</i>'+v[1]+'</a>'}).join('');
  $$('#nav a').forEach(function(a){a.addEventListener('click',function(){view=a.dataset.v;render();window.scrollTo(0,0)})});
  $('#period').innerHTML='Данные: '+M[0].label+(M.length>1?' – '+M[M.length-1].label:'')+'<br>Месяцев: '+M.length+'<br>Валюта: ₽';
  render();
}

/* метрики месяца */
function calc(m){
  var p=m.pnl,cf=m.cashflow,k={};
  var staff=find(p.expense_groups,'Персонал'),prem=find(p.expense_groups,'Помещение'),bank=find(p.expense_groups,'банк');
  k.rev=p.total_revenue;k.cogs=p.total_cogs;k.gp=p.gross_profit;k.opex=p.total_expenses;k.op=p.operating_profit;k.net=p.net_profit;
  k.staff=staff?staff.value:0;k.prem=prem?prem.value:0;k.bank=bank?bank.value:0;
  k.food=val(p.cogs_items,'Расход продуктов');
  k.invNet=val(p.cogs_items,'Недостача')+val(p.cogs_items,'Излишки');
  k.waste=val(p.cogs_items,'Порча')+val(p.cogs_items,'Технический пролив')+val(p.cogs_items,'Списание');
  var xi=[];p.expense_groups.forEach(function(g){g.items.forEach(function(i){xi.push(i)})});
  function ex(part){return sum(xi.filter(function(i){return i.name.toLowerCase().indexOf(part.toLowerCase())>-1}).map(function(i){return i.value}))}
  k.tips=ex('Чаевые');k.contrib=ex('Налоги/Взносы');k.wages=k.staff-k.tips-k.contrib;
  k.capex=ex('Покупка оборудования')+ex('Мебель');   /* капитальные траты, проведённые в расходах */
  k.event=ex('ДР Бара');                             /* разовое мероприятие */
  k.premClean=k.prem-ex('Мебель');
  k.otherClean=val(p.expense_groups,'Прочие расходы')-ex('Покупка оборудования')-ex('ДР Бара');
  k.mkt=val(p.expense_groups,'Маркетинг');
  k.staffFood=val(p.cogs_items,'Питание персонала')+val(p.cogs_items,'Учредитель питание')+val(p.cogs_items,'Представительские');
  k.rizz=(p.other_income||0)-(p.other_expenses||0);   /* расчёты с другой компанией (RizzW) */
  k.adjOp=k.op+k.capex;
  var cfi=[];cf.groups.forEach(function(g){g.items.forEach(function(i){cfi.push(i)})});
  function cx(part){return sum(cfi.filter(function(i){return i.name.toLowerCase().indexOf(part.toLowerCase())>-1}).map(function(i){return i.value}))}
  k.opNet=cf.operating_net;k.loan=-cx('Выплата кредита');
  k.checks=sum(m.checks.map(function(r){return r.checks}));
  k.guests=sum(m.checks.map(function(r){return r.guests}));
  k.sales=sum(m.checks.map(function(r){return r.sales}));
  k.avg=sd(k.sales,k.checks);
  k.open=cf.opening;k.close=cf.closing;
  var rg=find(cf.groups,'ВЫРУЧКА'),dv=find(cf.groups,'ДИВИДЕНД');
  k.cfRev=rg?rg.value:0;k.div=-(cx('Выплаты Учредителям')+cx('Вывод учредительских'));
  k.gm=sd(k.gp,k.rev);k.nm=sd(k.net,k.rev);k.om=sd(k.op,k.rev);
  return k;
}
function S(sel_,f){ return sum(M.filter(function(m){return sel_.indexOf(m.month)>-1}).map(f)); }
function selM(){ return M.filter(function(m){return sel.indexOf(m.month)>-1}); }
function lastM(){ var s=selM(); return s[s.length-1]; }
function prevM(){ var s=selM(); return s.length>1?s[s.length-2]:null; }
function dTag(cur,prev,inv,lab){
  if(prev==null||prev===0||cur==null) return '<span class="d flat">нет базы</span>';
  var d=(cur-prev)/Math.abs(prev),good=inv?d<0:d>0,cls=Math.abs(d)<.01?'flat':(good?'up':'down');
  return '<span class="d '+cls+'">'+(d>0?'+':'')+(d*100).toFixed(1)+'% '+(lab||'к пред. мес.')+'</span>';
}
function ppTag(cur,prev,inv){
  if(prev==null||cur==null) return '<span class="d flat">нет базы</span>';
  var d=cur-prev,good=inv?d<0:d>0,cls=Math.abs(d)<.1?'flat':(good?'up':'down');
  return '<span class="d '+cls+'">'+(d>0?'+':'')+d.toFixed(1)+' п.п.</span>';
}
function flag(v,pv,hib){
  if(v==null||pv==null||pv===0) return 'na';
  var dev=(v-pv)/Math.abs(pv),mag=Math.abs(dev),dir=hib?dev>=0:dev<=0;
  if(mag<=.10) return 'good'; if(mag<=.25) return dir?'good':'warn'; return dir?'warn':'bad';
}
function spark(arr,hib){
  var n=arr.filter(function(x){return x!=null});
  if(n.length<2) return '';
  var mn=Math.min.apply(null,n),mx=Math.max.apply(null,n),w=78,h=22,pd=2,sp=(mx-mn)||1;
  var pts=arr.map(function(v,i){return v==null?null:[pd+i*(w-2*pd)/((arr.length-1)||1),h-pd-(v-mn)/sp*(h-2*pd)]}).filter(Boolean);
  var path=pts.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)}).join(' ');
  var col=((n[n.length-1]>=n[0])===hib)?C.good:C.bad;
  return '<svg width="'+w+'" height="'+h+'"><path d="'+path+'" fill="none" stroke="'+col+'" stroke-width="1.6"/></svg>';
}

/* ================= ГРАФИКИ ================= */
function mk(id,cfg){
  if(charts[id]){charts[id].destroy();delete charts[id]}
  var el=document.getElementById(id); if(!el||typeof Chart==='undefined') return;
  Chart.defaults.animation=REDUCE?false:{duration:850,easing:'easeOutQuart'};
  Chart.defaults.color=C.dim;Chart.defaults.borderColor=C.grid;Chart.defaults.font.family='-apple-system,"Segoe UI",Roboto,sans-serif';Chart.defaults.font.size=11;
  charts[id]=new Chart(el,cfg);
}
function box(id,h){return '<div class="cb" style="height:'+h+'px"><canvas id="'+id+'"></canvas></div>'}
var kfmt=function(v){return Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':Math.round(v/1000)+'k'};
function base(extra){
  var o={responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{boxWidth:10,boxHeight:10,usePointStyle:true}},tooltip:{callbacks:{label:function(c){return ' '+c.dataset.label+': '+fm(c.parsed.y!=null?c.parsed.y:c.parsed)}}}},scales:{x:{grid:{display:false}},y:{grid:{color:C.grid},ticks:{callback:kfmt}}}};
  if(extra) for(var k in extra) o[k]=extra[k];
  return o;
}

/* ================= ШАПКА С ФИЛЬТРОМ ================= */
function top(title,sub,extra){
  var chips=M.map(function(m){return '<button class="chip'+(sel.indexOf(m.month)>-1?' on':'')+'" data-m="'+m.month+'">'+esc(m.label)+'</button>'}).join('')+'<button class="chip ghost" data-all="1">все</button>';
  return '<div class="top"><div><h1>'+title+'</h1><div class="sub">'+sub+'</div></div><div class="chips">'+(extra||'')+chips+'</div></div>';
}
function bindTop(){
  $$('.chip[data-m]').forEach(function(c){c.addEventListener('click',function(){
    var m=c.dataset.m,i=sel.indexOf(m);
    if(i>-1){ if(sel.length>1) sel.splice(i,1); } else { sel.push(m); sel.sort(); }
    render();
  })});
  var all=$('.chip[data-all]'); if(all) all.addEventListener('click',function(){sel=M.map(function(m){return m.month});render()});
}

/* ================= РОУТЕР ================= */
function render(){
  $$('#nav a').forEach(function(a){a.classList.toggle('on',a.dataset.v===view)});
  var f={overview:vOverview,compare:vCompare,pnl:vPnl,cf:vCf,checks:vChecks,analytics:vAnalytics}[view];
  Object.keys(charts).forEach(function(k){charts[k].destroy();delete charts[k]});
  f(); bindTop(); animateNums();
}

/* ================= 1. ОБЗОР ================= */
function vOverview(){
  var sm=selM(),l=lastM(),p=prevM();
  var h=top('Обзор','Ключевые показатели · '+sm.map(function(m){return m.label}).join(', '));
  var rev=S(sel,function(m){return m.k.rev}),net=S(sel,function(m){return m.k.net});
  h+='<div class="kpis">'+
   kpi('Выручка · '+l.label,fm(l.k.rev),dTag(l.k.rev,p&&p.k.rev))+
   kpi('Валовая прибыль',fm(l.k.gp),'<small>'+pc(l.k.gm*100)+'</small>'.replace('<small>','<span class="d flat">').replace('</small>','</span>'))+
   kpi('Чистая прибыль',fm(l.k.net),dTag(l.k.net,p&&p.k.net))+
   kpi('Чистая маржа',pc(l.k.nm*100),ppTag(l.k.nm*100,p&&p.k.nm*100))+
   kpi('Опер. прибыль без капзатрат',fm(l.k.adjOp),dTag(l.k.adjOp,p&&p.k.adjOp))+
   kpi('Остаток денег на конец',fm(l.k.close),dTag(l.k.close,p&&p.k.close))+
   kpi('Гостей',fmt(l.k.guests),dTag(l.k.guests,p&&p.k.guests))+
   kpi('Средний чек',fm(l.k.avg),dTag(l.k.avg,p&&p.k.avg))+
  '</div>';
  if(sm.length>1) h+='<div class="fn" style="margin:-6px 0 16px">За выбранный период: выручка '+fm(rev)+', чистая прибыль '+fm(net)+' ('+pc(sd(net,rev)*100)+').</div>';
  h+='<div class="g2"><div class="panel"><h3>Выручка, расходы и прибыль</h3><div class="n">По месяцам, ₽</div>'+box('c1',280)+'</div>'+
     '<div class="panel"><h3>Структура затрат</h3><div class="n">'+esc(l.label)+' · доля от выручки</div>'+box('c2',280)+'</div></div>';
  h+='<div class="g2e"><div class="panel"><h3>Продажи по дням</h3><div class="n">Продажи (столбцы) и средний чек (линия)</div>'+box('c3',250)+'</div>'+
     '<div class="panel"><h3>Остаток денег</h3><div class="n">На начало и конец месяцев</div>'+box('c4',250)+'</div></div>';
  $('#main').innerHTML=h;
  var lb=sm.map(function(m){return m.label});
  mk('c1',{type:'bar',data:{labels:lb,datasets:[
    {label:'Выручка',data:sm.map(function(m){return m.k.rev}),backgroundColor:C.accent,borderRadius:4},
    {label:'Себестоимость',data:sm.map(function(m){return m.k.cogs}),backgroundColor:C.bad,borderRadius:4},
    {label:'Опер. расходы',data:sm.map(function(m){return m.k.opex}),backgroundColor:'#3D6B96',borderRadius:4},
    {label:'Чистая прибыль',data:sm.map(function(m){return m.k.net}),backgroundColor:C.good,borderRadius:4}]},options:base()});
  var g=l.pnl.expense_groups.map(function(x){return {n:x.name,v:x.value}});g.push({n:'Себестоимость',v:l.k.cogs});g.sort(function(a,b){return b.v-a.v});
  mk('c2',{type:'doughnut',data:{labels:g.map(function(x){return x.n}),datasets:[{data:g.map(function(x){return x.v}),backgroundColor:PAL,borderColor:'#18222F',borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'right',labels:{boxWidth:9,boxHeight:9,font:{size:10.5}}},tooltip:{callbacks:{label:function(c){return ' '+c.label+': '+fm(c.parsed)+' ('+pc(c.parsed/l.k.rev*100)+')'}}}}}});
  var rows=[];sm.forEach(function(m){m.checks.forEach(function(r){rows.push(r)})});
  mk('c3',{data:{labels:rows.map(function(r){return r.date.slice(0,5)}),datasets:[
    {type:'bar',label:'Продажи',data:rows.map(function(r){return r.sales}),backgroundColor:'rgba(79,143,199,.6)',yAxisID:'y',borderRadius:2},
    {type:'line',label:'Средний чек',data:rows.map(function(r){return r.avg_check}),borderColor:C.good,yAxisID:'y1',tension:.3,pointRadius:0,borderWidth:2}]},
    options:base({scales:{x:{grid:{display:false},ticks:{maxTicksLimit:14,font:{size:9}}},y:{grid:{color:C.grid},ticks:{callback:kfmt}},y1:{position:'right',grid:{display:false},ticks:{callback:kfmt}}}})});
  mk('c4',{type:'bar',data:{labels:lb,datasets:[
    {label:'На начало',data:sm.map(function(m){return m.k.open}),backgroundColor:'rgba(124,151,176,.6)',borderRadius:4},
    {label:'На конец',data:sm.map(function(m){return m.k.close}),backgroundColor:C.accent,borderRadius:4}]},options:base()});
}
function kpi(l,v,d){return '<div class="kpi"><div class="l">'+l+'</div><div class="v">'+v+'</div>'+d+'</div>'}

/* ================= 2. ОПиУ ================= */
function vPnl(){
  var sm=selM();
  var seg='<div class="seg"><button data-mode="abs" class="'+(pnlMode==='abs'?'on':'')+'">₽</button><button data-mode="pct" class="'+(pnlMode==='pct'?'on':'')+'">% выручки</button></div>';
  var h=top('Отчёт о прибылях и убытках','Источник: ОПиУ из iiko',seg);
  var th='<th>Статья</th>'+sm.map(function(m){return '<th>'+esc(m.label)+'</th>'}).join('')+(sm.length>1?'<th>Δ</th>':'');
  var rows='';
  function cell(v,m){ if(v==null) return '<td class="na">—</td>'; if(pnlMode==='pct'){var x=sd(v,m.k.rev);return '<td class="'+(v<0?'neg':'')+'">'+(x==null?'—':pc(x*100))+'</td>'} return '<td class="'+(v<0?'neg':'')+'">'+fmt(v)+'</td>'; }
  function row(name,fn,cls){
    var vs=sm.map(fn); var c=vs.map(function(v,i){return cell(v,sm[i])}).join('');
    var dl='';
    if(sm.length>1){ var a=vs[vs.length-2],b=vs[vs.length-1]; dl='<td>'+(a?'<span class="'+(b>=a?'pos':'neg')+'">'+(b>=a?'+':'')+((b/a-1)*100).toFixed(0)+'%</span>':'—')+'</td>'; }
    return '<tr class="'+(cls||'')+'"><td>'+esc(name)+'</td>'+c+dl+'</tr>';
  }
  function sec(t){return '<tr class="sec"><td colspan="'+(sm.length+2)+'">'+t+'</td></tr>'}
  function names(getter){var o=[],s={};sm.forEach(function(m){getter(m).forEach(function(x){if(!s[x.name]){s[x.name]=1;o.push(x.name)}})});return o}
  function by(arr,n){var x=arr.filter(function(i){return i.name===n})[0];return x?x.value:0}
  rows+=sec('Выручка')+row('Торговая выручка без скидок',function(m){return m.pnl.gross_sales},'sub')+row('Скидки',function(m){return m.pnl.discounts},'sub')+(sm.some(function(m){return m.pnl.other_revenue})?row('Прочая выручка (внесена вручную)',function(m){return m.pnl.other_revenue},'sub'):'')+row('Итого выручка',function(m){return m.pnl.total_revenue},'tot');
  rows+=sec('Себестоимость');
  names(function(m){return m.pnl.cogs_items}).forEach(function(n){rows+=row(n,function(m){return by(m.pnl.cogs_items,n)},'sub')});
  rows+=row('Итого себестоимость',function(m){return m.pnl.total_cogs},'tot')+row('Валовая прибыль',function(m){return m.pnl.gross_profit},'tot');
  rows+=sec('Расходы');
  names(function(m){return m.pnl.expense_groups}).forEach(function(gn){
    rows+=row(gn,function(m){return by(m.pnl.expense_groups,gn)},'grp');
    names(function(m){var g=m.pnl.expense_groups.filter(function(x){return x.name===gn})[0];return g?g.items:[]}).forEach(function(n){
      rows+=row(n,function(m){var g=m.pnl.expense_groups.filter(function(x){return x.name===gn})[0];return g?by(g.items,n):0},'sub');
    });
  });
  rows+=row('Итого расходы',function(m){return m.pnl.total_expenses},'tot')+row('Прибыль от основной деятельности',function(m){return m.pnl.operating_profit},'tot');
  rows+=sec('Прочее')+row('Прочие доходы',function(m){return m.pnl.other_income})+row('Прочие расходы',function(m){return m.pnl.other_expenses})+row('ЧИСТАЯ ПРИБЫЛЬ',function(m){return m.pnl.net_profit},'tot');
  h+='<div class="panel"><div class="ts"><table><thead><tr>'+th+'</tr></thead><tbody>'+rows+'</tbody></table></div><div class="fn">Δ — изменение последнего выбранного месяца к предыдущему. В режиме «% выручки» все строки делятся на итоговую выручку месяца.</div></div>';
  h+='<div class="panel"><h3>Группы расходов</h3><div class="n">Сравнение по выбранным месяцам, ₽</div>'+box('p1',320)+'</div>';
  $('#main').innerHTML=h;
  $$('.seg button').forEach(function(b){b.addEventListener('click',function(){pnlMode=b.dataset.mode;render()})});
  var gn=names(function(m){return m.pnl.expense_groups});
  mk('p1',{type:'bar',data:{labels:gn,datasets:sm.map(function(m,i){return {label:m.label,data:gn.map(function(n){return by(m.pnl.expense_groups,n)}),backgroundColor:PAL[i%PAL.length],borderRadius:4}})},
    options:base({indexAxis:'y',scales:{x:{grid:{color:C.grid},ticks:{callback:kfmt}},y:{grid:{display:false}}}})});
}

/* ================= 3. ДДС ================= */
function vCf(){
  var sm=selM(),l=lastM();
  var h=top('Движение денежных средств','Источник: ДДС · водопад показан для '+esc(l.label));
  var th='<th>Статья</th>'+sm.map(function(m){return '<th>'+esc(m.label)+'</th>'}).join('');
  function c(v){return '<td class="'+(v<0?'neg':(v>0?'pos':''))+'">'+fmt(v)+'</td>'}
  var rows='<tr class="tot"><td>Остаток на начало</td>'+sm.map(function(m){return '<td>'+fmt(m.cashflow.opening)+'</td>'}).join('')+'</tr>';
  var gnames=[];sm.forEach(function(m){m.cashflow.groups.forEach(function(g){if(gnames.indexOf(g.name)<0)gnames.push(g.name)})});
  gnames.forEach(function(gn){
    rows+='<tr class="grp"><td>'+esc(gn)+'</td>'+sm.map(function(m){var g=find(m.cashflow.groups,gn);return c(g?g.value:0)}).join('')+'</tr>';
    var inames=[];sm.forEach(function(m){var g=m.cashflow.groups.filter(function(x){return x.name===gn})[0];if(g)g.items.forEach(function(i){if(i.name!=='(без статьи)'&&inames.indexOf(i.name)<0)inames.push(i.name)})});
    inames.forEach(function(n){rows+='<tr class="sub"><td>'+esc(n)+'</td>'+sm.map(function(m){var g=m.cashflow.groups.filter(function(x){return x.name===gn})[0];var it=g&&g.items.filter(function(i){return i.name===n})[0];return it&&it.value?c(it.value):'<td class="na">—</td>'}).join('')+'</tr>'});
  });
  rows+='<tr class="tot"><td>Остаток на конец</td>'+sm.map(function(m){return '<td>'+fmt(m.cashflow.closing)+'</td>'}).join('')+'</tr>';
  h+='<div class="g2"><div class="panel"><h3>Как менялись деньги</h3><div class="n">'+esc(l.label)+': от остатка на начало к остатку на конец, ₽</div>'+box('f1',320)+'</div>'+
     '<div class="panel"><h3>Куда ушли деньги</h3><div class="n">'+esc(l.label)+' · по статьям, без выручки</div>'+box('f2',320)+'</div></div>';
  h+='<div class="panel"><div class="ts"><table><thead><tr>'+th+'</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  $('#main').innerHTML=h;
  var gs=l.cashflow.groups.filter(function(g){return g.value!==0});
  var run=l.cashflow.opening,lbls=['Начало'],data=[[0,run]],cols=['#7C97B0'];
  gs.forEach(function(g){lbls.push(g.name.replace(/^\d+\.?\s*/,''));data.push([run,run+g.value]);run+=g.value;cols.push(g.value>=0?C.good:C.bad)});
  lbls.push('Конец');data.push([0,l.cashflow.closing]);cols.push(C.accent);
  mk('f1',{type:'bar',data:{labels:lbls,datasets:[{data:data,backgroundColor:cols,borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){var d=c.raw;return ' '+fm(d[1]-d[0])+(c.dataIndex===0||c.dataIndex===lbls.length-1?' (остаток '+fm(d[1])+')':'')}}}},scales:{x:{grid:{display:false},ticks:{font:{size:9},maxRotation:60}},y:{grid:{color:C.grid},ticks:{callback:kfmt}}}}});
  var ex=gs.filter(function(g){return g.name.toUpperCase().indexOf('ВЫРУЧКА')<0&&g.value<0}).map(function(g){return {n:g.name.replace(/^\d+\.?\s*/,''),v:g.value}}).sort(function(a,b){return a.v-b.v});
  mk('f2',{type:'bar',data:{labels:ex.map(function(x){return x.n}),datasets:[{data:ex.map(function(x){return x.v}),backgroundColor:C.bad,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return ' '+fm(c.parsed.x)}}}},scales:{x:{grid:{color:C.grid},ticks:{callback:kfmt}},y:{grid:{display:false},ticks:{font:{size:10.5}}}}}});
}

/* ================= 4. СРЕДНИЙ ЧЕК ================= */
var WD=['понедельник','вторник','среда','четверг','пятница','суббота','воскресенье'],WS={понедельник:'Пн',вторник:'Вт',среда:'Ср',четверг:'Чт',пятница:'Пт',суббота:'Сб',воскресенье:'Вс'};
function vChecks(){
  var sm=selM(),l=lastM(),p=prevM();
  var seg='<div class="seg">'+[['day','дни'],['week','недели'],['month','месяцы']].map(function(x){return '<button data-g="'+x[0]+'" class="'+(gran===x[0]?'on':'')+'">'+x[1]+'</button>'}).join('')+'</div>';
  var rows=[];sm.forEach(function(m){m.checks.forEach(function(r){var q=Object.assign({},r);q.mo=m.month;q.ml=m.label;rows.push(q)})});
  var tc=sum(rows.map(function(r){return r.checks})),tg=sum(rows.map(function(r){return r.guests})),ts=sum(rows.map(function(r){return r.sales}));
  var h=top('Средний чек','Источник: отчёт по чекам · по дням, неделям и дням недели',seg);
  h+='<div class="kpis">'+kpi('Чеков',fmt(tc),'<span class="d flat">период</span>')+kpi('Гостей',fmt(tg),'<span class="d flat">период</span>')+kpi('Средний чек',fm(sd(ts,tc)),dTag(l.k.avg,p&&p.k.avg))+kpi('Средний счёт на гостя',fm(sd(ts,tg)),'<span class="d flat">период</span>')+kpi('Гостей на чек',(sd(tg,tc)||0).toFixed(2),'<span class="d flat">период</span>')+'</div>';
  h+='<div class="panel"><h3>Продажи</h3><div class="n">Сумма по периодам</div>'+box('k1',230)+'</div>';
  h+='<div class="panel"><h3>Средний чек</h3><div class="n">Динамика по тем же периодам</div>'+box('k2',230)+'</div>';
  h+='<div class="g2e"><div class="panel"><h3>Средние продажи за день недели</h3><div class="n">₽ за один день</div>'+box('k3',250)+'</div><div class="panel"><h3>Средний чек по дням недели</h3><div class="n">₽ на чек</div>'+box('k4',250)+'</div></div>';
  $('#main').innerHTML=h;
  $$('.seg button').forEach(function(b){b.addEventListener('click',function(){gran=b.dataset.g;render()})});
  var bk=[];
  if(gran==='day'){bk=rows.map(function(r){return {l:r.date.slice(0,5),s:r.sales,c:r.checks}})}
  else if(gran==='month'){sm.forEach(function(m){bk.push({l:m.label,s:m.k.sales,c:m.k.checks})})}
  else{var mp={},ord=[];rows.forEach(function(r){var a=r.date.split('.'),d=new Date(+a[2],+a[1]-1,+a[0]);d.setDate(d.getDate()-((d.getDay()+6)%7));var key=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);if(!mp[key]){mp[key]={l:('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2),s:0,c:0};ord.push(key)}mp[key].s+=r.sales;mp[key].c+=r.checks});ord.sort().forEach(function(k){bk.push(mp[k])})}
  var tl=bk.length>20?{maxTicksLimit:16,font:{size:9}}:{font:{size:10}};
  mk('k1',{type:'bar',data:{labels:bk.map(function(b){return b.l}),datasets:[{label:'Продажи',data:bk.map(function(b){return b.s}),backgroundColor:'rgba(79,143,199,.65)',borderRadius:3}]},options:base({plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return ' '+fm(c.parsed.y)}}}},scales:{x:{grid:{display:false},ticks:tl},y:{grid:{color:C.grid},ticks:{callback:kfmt}}}})});
  mk('k2',{type:'line',data:{labels:bk.map(function(b){return b.l}),datasets:[{label:'Средний чек',data:bk.map(function(b){return sd(b.s,b.c)}),borderColor:C.accent,backgroundColor:'rgba(79,143,199,.12)',fill:true,tension:.3,pointRadius:bk.length>40?0:3}]},options:base({plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return ' '+fm(c.parsed.y)}}}},scales:{x:{grid:{display:false},ticks:tl},y:{grid:{color:C.grid},ticks:{callback:function(v){return fm(v)}}}}})});
  var wd={};WD.forEach(function(w){wd[w]={s:0,c:0,n:0}});rows.forEach(function(r){var x=wd[r.weekday];if(x){x.s+=r.sales;x.c+=r.checks;x.n++}});
  var avgS=WD.map(function(w){return wd[w].n?wd[w].s/wd[w].n:0}),mx=avgS.indexOf(Math.max.apply(null,avgS));
  mk('k3',{type:'bar',data:{labels:WD.map(function(w){return WS[w]}),datasets:[{label:'Продажи',data:avgS,backgroundColor:avgS.map(function(v,i){return i===mx?C.accent:'rgba(79,143,199,.4)'}),borderRadius:5}]},options:base({plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return ' '+fm(c.parsed.y)}}}}})});
  mk('k4',{type:'bar',data:{labels:WD.map(function(w){return WS[w]}),datasets:[{label:'Средний чек',data:WD.map(function(w){return sd(wd[w].s,wd[w].c)}),backgroundColor:C.good,borderRadius:5}]},options:base({plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return ' '+fm(c.parsed.y)}}}},scales:{x:{grid:{display:false}},y:{grid:{color:C.grid}}}})});
}

/* ================= 5. МЕСЯЦ К МЕСЯЦУ ================= */
var CMP=[['rev','Выручка'],['profit','Прибыль'],['costs','Расходы, % выручки'],['checks','Чеки'],['cash','Деньги']];
function topPlain(title,sub,extra){return '<div class="top"><div><h1>'+title+'</h1><div class="sub">'+sub+'</div></div><div class="chips">'+(extra||'')+'</div></div>'}
function shadeArr(hex){return M.map(function(m){return m.month===cmpB?hexA(hex,1):(m.month===cmpA?hexA(hex,.6):hexA(hex,.25))})}
function liveSets(metric){
  var pr=function(f){return M.map(function(m){return f(m.k)})};
  var pt=function(f){return M.map(function(m){return sd(f(m.k),m.k.rev)*100})};
  var rad=M.map(function(m){return m.month===cmpB?6:(m.month===cmpA?5:3)});
  var bar=function(label,f,col){return {type:'bar',label:label,data:pr(f),backgroundColor:shadeArr(col),borderRadius:6,yAxisID:'y'}};
  var line=function(label,data,col,pct){return {type:'line',label:label,data:data,borderColor:col,backgroundColor:col,tension:.35,borderWidth:2.5,pointRadius:rad,pointHoverRadius:7,yAxisID:'y',_pct:!!pct}};
  if(metric==='rev') return [bar('Выручка',function(k){return k.rev},C.accent)];
  if(metric==='profit') return [bar('Опер. прибыль',function(k){return k.op},C.accent),bar('Чистая прибыль',function(k){return k.net},C.good),bar('Опер. без капзатрат',function(k){return k.adjOp},C.violet)];
  if(metric==='costs') return [
    line('Фудкост',pt(function(k){return k.food}),C.warn,1),
    line('Персонал',pt(function(k){return k.staff}),C.bad,1),
    line('Помещение',pt(function(k){return k.prem}),C.accent,1),
    line('Прайм-кост',pt(function(k){return k.cogs+k.staff}),C.violet,1)];
  if(metric==='checks'){var b=bar('Чеков',function(k){return k.checks},C.accent);b._int=true;
    var l=line('Средний чек',pr(function(k){return k.avg}),C.good,0);l.yAxisID='y1';return [b,l]}
  var cl=line('Остаток на конец',pr(function(k){return k.close}),C.accent,0);cl.fill=true;cl.backgroundColor=hexA(C.accent,.12);
  return [cl,bar('Операционный денежный поток',function(k){return k.opNet},C.good),bar('Выплаты учредителям и по кредиту',function(k){return k.div+k.loan},C.bad)];
}
function liveOpts(){
  return {responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{position:'bottom',labels:{boxWidth:10,boxHeight:10,usePointStyle:true}},
      tooltip:{callbacks:{label:function(c){var v=c.parsed.y;return ' '+c.dataset.label+': '+(c.dataset._pct?pc(v):(c.dataset._int?fmt(v):fm(v)))}}}},
    scales:{x:{grid:{display:false}},
      y:{grid:{color:C.grid},ticks:{callback:function(v){return cmpMetric==='costs'?v.toFixed(0)+'%':kfmt(v)}}},
      y1:{display:cmpMetric==='checks',position:'right',grid:{display:false},ticks:{callback:function(v){return fmt(v)}}}}};
}
function shortLbl(l){return l.replace(/^(\S{3})\S*\s\d\d(\d\d)$/,function(_,a,y){return a+' '+y})}
function vCompare(){
  if(!byM(cmpA)||!byM(cmpB)||cmpA===cmpB){var n=M.length;cmpB=M[n-1].month;cmpA=M[Math.max(0,n-2)].month}
  var a=byM(cmpA),b=byM(cmpB),lab='к '+a.label;
  var opts=function(cur){return M.map(function(m){return '<option value="'+m.month+'"'+(m.month===cur?' selected':'')+'>'+esc(m.label)+'</option>'}).join('')};
  var h=topPlain('Месяц к месяцу','Сверка двух месяцев: что изменилось и почему',
    '<span class="sub">база</span><select id="sa" aria-label="Базовый месяц">'+opts(cmpA)+'</select><span class="sub">→</span><select id="sb" aria-label="Сравниваемый месяц">'+opts(cmpB)+'</select>');
  h+='<div class="kpis">'+
    kpi('Выручка · '+esc(b.label),fm(b.k.rev),dTag(b.k.rev,a.k.rev,false,lab))+
    kpi('Опер. прибыль без капзатрат',fm(b.k.adjOp),dTag(b.k.adjOp,a.k.adjOp,false,lab))+
    kpi('Чистая прибыль',fm(b.k.net),dTag(b.k.net,a.k.net,false,lab))+
    kpi('Чеков',fmt(b.k.checks),dTag(b.k.checks,a.k.checks,false,lab))+
    kpi('Средний чек',fm(b.k.avg),dTag(b.k.avg,a.k.avg,false,lab))+
    kpi('Остаток денег на конец',fm(b.k.close),dTag(b.k.close,a.k.close,false,lab))+'</div>';
  h+='<div class="panel"><div class="phead"><div><h3>Динамика по всем месяцам</h3><div class="n">Яркий столбец: «'+esc(b.label)+'», средний: «'+esc(a.label)+'». Переключайте показатели.</div></div>'+
    '<div class="seg" id="cseg">'+CMP.map(function(x){return '<button data-cm="'+x[0]+'" class="'+(cmpMetric===x[0]?'on':'')+'">'+x[1]+'</button>'}).join('')+'</div></div>'+box('m1',310)+'</div>';
  h+='<div class="g2e"><div class="panel"><h3>Из чего сложилось изменение чистой прибыли</h3><div class="n">От «'+esc(a.label)+'» к «'+esc(b.label)+'», ₽. Зелёное прибавило, красное отняло.</div>'+box('m2',340)+'</div>'+
     '<div class="panel"><h3>Статьи с самыми большими изменениями</h3><div class="n">Изменение в ₽ к «'+esc(a.label)+'». Красное: расход вырос, зелёное: снизился.</div>'+box('m3',340)+'</div></div>';
  // сверка показателей
  var pcs=function(f){return function(k){return sd(f(k),k.rev)*100}};
  var ROWS=[
    ['Выручка',function(k){return k.rev},'rub',true],['Валовая прибыль',function(k){return k.gp},'rub',true],
    ['Прибыль от осн. деятельности',function(k){return k.op},'rub',true],['Опер. прибыль без капзатрат',function(k){return k.adjOp},'rub',true],
    ['Чистая прибыль',function(k){return k.net},'rub',true],
    ['Чеков',function(k){return k.checks},'int',true],['Гостей',function(k){return k.guests},'int',true],['Средний чек',function(k){return k.avg},'rub',true],
    ['Фудкост, % выручки',pcs(function(k){return k.food}),'pct',false],['Себестоимость, % выручки',pcs(function(k){return k.cogs}),'pct',false],
    ['Персонал, % выручки',pcs(function(k){return k.staff}),'pct',false],['Зарплата без чаевых и взносов, %',pcs(function(k){return k.wages}),'pct',false],
    ['Помещение, % выручки',pcs(function(k){return k.prem}),'pct',false],['Банк, % выручки',pcs(function(k){return k.bank}),'pct',false],
    ['Прайм-кост, % выручки',pcs(function(k){return k.cogs+k.staff}),'pct',false],
    ['Инвентаризация нетто, % выручки',pcs(function(k){return k.invNet}),'pct',false],['Порча, пролив, списания, %',pcs(function(k){return k.waste}),'pct',false],
    ['Остаток денег на конец',function(k){return k.close},'rub',true],['Операционный денежный поток',function(k){return k.opNet},'rub',true],
    ['Выплаты учредителям',function(k){return k.div},'rub',null],['Выплата по кредиту',function(k){return k.loan},'rub',null]];
  var TR='';
  ROWS.forEach(function(r){
    var va=r[1](a.k),vb=r[1](b.k),t=r[2],hib=r[3],d=vb-va,rel=va?d/Math.abs(va):null;
    var fa=t==='pct'?pc(va):fmt(va),fb=t==='pct'?pc(vb):fmt(vb);
    var good=hib===null?null:((d>0)===hib),neutral=hib===null||(t==='pct'?Math.abs(d)<.1:(rel!==null&&Math.abs(rel)<.01));
    var cls=neutral?'':(good?'pos':'neg');
    var ds=(d>0?'+':'')+(t==='pct'?d.toFixed(1).replace('.',',')+' п.п.':fmt(d));
    var dp=t==='pct'||rel===null?'—':(rel>0?'+':'')+(rel*100).toFixed(1).replace('.',',')+'%';
    TR+='<tr><td>'+r[0]+'</td><td>'+fa+'</td><td>'+fb+'</td><td class="'+cls+'">'+ds+'</td><td class="'+cls+'">'+dp+'</td><td><span class="dot '+(hib===null?'na':flag(vb,va,hib))+'"></span></td></tr>';
  });
  h+='<div class="panel"><h3>Сверка показателей</h3><div class="n">Все ключевые цифры двух месяцев рядом</div><div class="ts"><table><thead><tr><th>Показатель</th><th>'+esc(a.label)+'</th><th>'+esc(b.label)+'</th><th>Изменение</th><th>%</th><th></th></tr></thead><tbody>'+TR+'</tbody></table></div></div>';
  $('#main').innerHTML=h;
  var sa=$('#sa'),sb=$('#sb');
  sa.addEventListener('change',function(){cmpA=sa.value;render()});
  sb.addEventListener('change',function(){cmpB=sb.value;render()});
  mk('m1',{type:'bar',data:{labels:M.map(function(m){return shortLbl(m.label)}),datasets:liveSets(cmpMetric)},options:liveOpts()});
  $$('#cseg button').forEach(function(btn){btn.addEventListener('click',function(){
    cmpMetric=btn.dataset.cm;
    $$('#cseg button').forEach(function(x){x.classList.toggle('on',x===btn)});
    var ch=charts['m1'];if(!ch) return;
    ch.data.datasets=liveSets(cmpMetric);ch.options.scales.y1.display=(cmpMetric==='checks');ch.update();
  })});
  // водопад чистой прибыли A -> B
  var gn=[];[a,b].forEach(function(m){m.pnl.expense_groups.forEach(function(g){if(gn.indexOf(g.name)<0)gn.push(g.name)})});
  var gv=function(m,n){var g=m.pnl.expense_groups.filter(function(x){return x.name===n})[0];return g?g.value:0};
  var steps=[['Чист. прибыль '+shortLbl(a.label),a.k.net,'start'],['Выручка',b.k.rev-a.k.rev],['Себестоимость',-(b.k.cogs-a.k.cogs)]];
  gn.forEach(function(n){var d=-(gv(b,n)-gv(a,n));if(Math.abs(d)>=1) steps.push([n,d])});
  steps.push(['Прочие доходы и расходы',b.k.rizz-a.k.rizz]);
  steps.push(['Чист. прибыль '+shortLbl(b.label),b.k.net,'end']);
  var run=0,wl=[],wd=[],wc=[],wdel=[];
  steps.forEach(function(s){
    if(s[2]){wl.push(s[0]);wd.push([0,s[1]]);wc.push(C.accent);wdel.push(s[1]);run=s[1]}
    else{wl.push(s[0]);wd.push([run,run+s[1]]);wc.push(s[1]>=0?C.good:C.bad);wdel.push(s[1]);run+=s[1]}
  });
  mk('m2',{type:'bar',data:{labels:wl,datasets:[{data:wd,backgroundColor:wc,borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){var d=wdel[c.dataIndex];return c.dataIndex===0||c.dataIndex===wl.length-1?' '+fm(d):' '+(d>0?'+':'−')+fmt(Math.abs(d))+' ₽'}}}},scales:{x:{grid:{display:false},ticks:{font:{size:9.5},maxRotation:60}},y:{grid:{color:C.grid},ticks:{callback:kfmt}}}}});
  // топ изменений по статьям
  var map={};
  var addIt=function(m,key,v,isA){if(!map[key])map[key]={a:0,b:0};map[key][isA?'a':'b']+=v};
  [[a,true],[b,false]].forEach(function(pr_){var m=pr_[0],isA=pr_[1];
    m.pnl.cogs_items.forEach(function(i){addIt(m,'Себестоимость › '+i.name,i.value,isA)});
    m.pnl.expense_groups.forEach(function(g){g.items.forEach(function(i){addIt(m,g.name+' › '+i.name,i.value,isA)})});
  });
  var ch_=Object.keys(map).map(function(k){return {k:k,a:map[k].a,b:map[k].b,d:map[k].b-map[k].a}}).filter(function(x){return Math.abs(x.d)>=1})
    .sort(function(x,y){return Math.abs(y.d)-Math.abs(x.d)}).slice(0,12).sort(function(x,y){return y.d-x.d});
  mk('m3',{type:'bar',data:{labels:ch_.map(function(x){return x.k}),datasets:[{data:ch_.map(function(x){return x.d}),backgroundColor:ch_.map(function(x){return x.d>0?C.bad:C.good}),borderRadius:3}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){var x=ch_[c.dataIndex];return [' Изменение: '+(x.d>0?'+':'−')+fmt(Math.abs(x.d))+' ₽',' '+a.label+': '+fmt(x.a)+' → '+b.label+': '+fmt(x.b)]}}}},scales:{x:{grid:{color:C.grid},ticks:{callback:kfmt}},y:{grid:{display:false},ticks:{font:{size:10}}}}}});
}

/* ================= 6. АНАЛИТИКА ================= */
function median(a){var s=a.slice().sort(function(x,y){return x-y}),n=s.length;return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):0}
function vAnalytics(){
  var sm=selM(),l=lastM(),p=prevM();
  var h=top('Аналитика и сверка','Нормы, тренды, где сократить, безубыточность, контроль данных');
  var th='<th>Показатель</th>'+sm.map(function(m){return '<th>'+esc(m.label)+'</th>'}).join('')+'<th>Тренд</th>';
  function arow(label,fn,o){
    o=o||{};var vs=sm.map(fn);
    var cs=vs.map(function(v,i){
      if(v==null) return '<td class="na">—</td>';
      var pv=i?vs[i-1]:null,fl=flag(v,pv,o.hib!==false),mom='';
      if(pv!=null&&pv!==0){var d=o.pct?(v-pv):((v/pv-1)*100);mom='<span class="mom">'+(d>0?'+':'')+d.toFixed(o.pct?1:0)+(o.pct?' п.п.':'%')+' к пред.</span>'}
      return '<td><span class="dot '+fl+'"></span>'+(o.pct?pc(v):fmt(v))+mom+'</td>';
    }).join('');
    return '<tr><td>'+label+'</td>'+cs+'<td>'+spark(vs,o.hib!==false)+'</td></tr>';
  }
  var R='';
  R+=arow('Выручка',function(m){return m.k.rev});
  R+=arow('Валовая прибыль',function(m){return m.k.gp});
  R+=arow('Прибыль от осн. деятельности',function(m){return m.k.op});
  R+=arow('Опер. прибыль без капзатрат',function(m){return m.k.adjOp});
  R+=arow('Чистая прибыль',function(m){return m.k.net});
  R+=arow('Валовая маржа',function(m){return m.k.gm*100},{pct:1});
  R+=arow('Маржа осн. деятельности',function(m){return m.k.om*100},{pct:1});
  R+=arow('Чистая маржа',function(m){return m.k.nm*100},{pct:1});
  R+=arow('Фудкост (продукты / выручка)',function(m){return sd(m.k.food,m.k.rev)*100},{pct:1,hib:false});
  R+=arow('Себестоимость / выручка',function(m){return sd(m.k.cogs,m.k.rev)*100},{pct:1,hib:false});
  R+=arow('Персонал / выручка',function(m){return sd(m.k.staff,m.k.rev)*100},{pct:1,hib:false});
  R+=arow('Зарплата без чаевых и взносов / выручка',function(m){return sd(m.k.wages,m.k.rev)*100},{pct:1,hib:false});
  R+=arow('Прайм-кост (себест. + персонал)',function(m){return sd(m.k.cogs+m.k.staff,m.k.rev)*100},{pct:1,hib:false});
  R+=arow('Помещение / выручка',function(m){return sd(m.k.prem,m.k.rev)*100},{pct:1,hib:false});
  R+=arow('Банк (эквайринг и пр.) / выручка',function(m){return sd(m.k.bank,m.k.rev)*100},{pct:1,hib:false});
  R+=arow('Инвентаризация нетто / выручка',function(m){return sd(m.k.invNet,m.k.rev)*100},{pct:1,hib:false});
  R+=arow('Порча, пролив, списания / выручка',function(m){return sd(m.k.waste,m.k.rev)*100},{pct:1,hib:false});
  R+=arow('Средний чек',function(m){return m.k.avg});
  R+=arow('Гостей',function(m){return m.k.guests});
  R+=arow('Остаток денег на конец',function(m){return m.k.close});
  h+='<div class="panel"><h3>Показатели по месяцам</h3><div class="n"><span class="dot good"></span>норма или улучшение · <span class="dot warn"></span>ухудшение 10–25% · <span class="dot bad"></span>ухудшение более 25% (к предыдущему месяцу). Для затратных строк рост — это ухудшение.</div><div class="ts"><table><thead><tr>'+th+'</tr></thead><tbody>'+R+'</tbody></table></div></div>';

  // где сократить: сравнение доли в выручке с типичной долей по всем месяцам
  var SAVE=[
    ['Зарплата (без чаевых и взносов)',function(k){return k.wages}],
    ['Помещение (без мебели)',function(k){return k.premClean}],
    ['Прочие расходы (без оборудования и ДР бара)',function(k){return k.otherClean}],
    ['Недостача по инвентаризации (нетто)',function(k){return Math.max(0,k.invNet)}],
    ['Порча, пролив, списания',function(k){return k.waste}],
    ['Питание персонала, учредителя, представительские',function(k){return k.staffFood}],
    ['Банк (эквайринг и переводы)',function(k){return k.bank}],
    ['Маркетинг',function(k){return k.mkt}]];
  if(M.length>=3){
    var SV=SAVE.map(function(s){
      var sh=sd(s[1](l.k),l.k.rev),md=median(M.map(function(m){return sd(s[1](m.k),m.k.rev)}));
      return {n:s[0],v:s[1](l.k),sh:sh,md:md,pot:Math.max(0,(sh-md)*l.k.rev)};
    }).sort(function(x,y){return y.pot-x.pot});
    h+='<div class="panel"><h3>Где сократить</h3><div class="n">'+esc(l.label)+': доля статьи в выручке против типичной доли по всем вашим месяцам (медиана). «Потенциал» — сколько вы сэкономили бы, вернувшись к типичной доле. Это ориентир по вашим же данным, не отраслевая норма.</div><div class="ts"><table><thead><tr><th>Статья</th><th>'+esc(l.label)+', ₽</th><th>% выручки</th><th>Типично, %</th><th>Потенциал, ₽</th></tr></thead><tbody>'+
      SV.map(function(x){return '<tr><td>'+x.n+'</td><td>'+fmt(x.v)+'</td><td>'+pc(x.sh*100)+'</td><td>'+pc(x.md*100)+'</td><td class="'+(x.pot>0?'neg':'')+'" style="font-weight:700">'+(x.pot>0?fmt(x.pot):'—')+'</td></tr>'}).join('')+
      '</tbody></table></div><div class="fn">Чаевые не считаются: это деньги гостей. Разовые траты (оборудование, мебель, ДР бара) вынесены отдельно, чтобы не искажать долю.</div></div>';
  }

  // безубыточность по регулярным расходам
  var reg=l.k.opex-l.k.capex-l.k.event,be=sd(reg,l.k.gm),beAll=sd(l.k.opex,l.k.gm),sf=be==null?null:sd(l.k.rev-be,l.k.rev);
  h+='<div class="g2e"><div class="panel"><h3>Точка безубыточности</h3><div class="n">'+esc(l.label)+' · регулярные расходы ÷ валовая маржа</div><div class="big">'+fm(be)+'</div><div class="fn">Выручка, при которой валовой прибыли хватает на регулярные расходы (включая персонал). Из расходов исключены оборудование, мебель и ДР бара: '+fm(l.k.capex+l.k.event)+'. Со всеми расходами месяца точка была бы '+fm(beAll)+'. Весь персонал считается постоянным расходом, поэтому реальный запас чуть выше.</div></div>'+
     '<div class="panel"><h3>Запас прочности</h3><div class="n">'+esc(l.label)+' · на сколько факт выше точки</div><div class="big '+(sf!=null&&sf<0?'neg':'')+'">'+pc(sf==null?null:sf*100)+'</div><div class="fn">На сколько процентов может упасть выручка, прежде чем месяц уйдёт в операционный минус по регулярным расходам.</div></div></div>';

  // деньги против прибыли
  var cashRows='',cum=0;
  M.forEach(function(m){
    var gap=m.k.cfRev-(m.k.rev-m.pnl.other_revenue);cum+=gap;
    if(sel.indexOf(m.month)<0) return;
    cashRows+='<tr><td>'+esc(m.label)+'</td><td>'+fmt(m.k.rev)+'</td><td>'+fmt(m.k.cfRev)+'</td><td>'+fmt(gap)+'</td><td class="'+(Math.abs(cum)>m.k.rev*.05?'neg':'')+'">'+fmt(cum)+'</td><td>'+fmt(m.k.net)+'</td><td>'+fmt(m.k.opNet)+'</td><td>'+fmt(m.k.div)+'</td><td>'+(m.k.loan?fmt(m.k.loan):'—')+'</td><td class="'+((m.k.close-m.k.open)<0?'neg':'pos')+'">'+fmt(m.k.close-m.k.open)+'</td></tr>';
  });
  h+='<div class="panel"><h3>Деньги против прибыли</h3><div class="n">Чем ДДС отличается от ОПиУ и куда ушли деньги</div><div class="ts"><table><thead><tr><th>Месяц</th><th>Выручка ОПиУ</th><th>Выручка ДДС</th><th>Разница</th><th>Накопленная разница</th><th>Чистая прибыль</th><th>Операц. денежный поток</th><th>Выплаты учредителям</th><th>Выплата по кредиту</th><th>Изменение остатка</th></tr></thead><tbody>'+cashRows+'</tbody></table></div><div class="fn">ОПиУ считает продажи в день продажи, ДДС — деньги в день поступления, поэтому разница в каждом месяце нормальна (эквайринг приходит со сдвигом). Следите за накопленной разницей с первого месяца данных: она должна оставаться небольшой. Красным она подсвечена, если больше 5% выручки месяца.</div></div>';

  // выводы
  var N=[];
  function note(cls,t){N.push('<li class="'+cls+'">'+t+'</li>')}
  if(p){
    var dm=(l.k.nm-p.k.nm)*100;
    note(dm<-1?'bad':(dm>1?'good':'warn'),'Чистая маржа: '+pc(p.k.nm*100)+' → '+pc(l.k.nm*100)+' ('+(dm>0?'+':'')+dm.toFixed(1)+' п.п.).');
    var dfc=(sd(l.k.food,l.k.rev)-sd(p.k.food,p.k.rev))*100;
    if(Math.abs(dfc)>=1) note(dfc>0?'bad':'good','Фудкост '+(dfc>0?'вырос':'снизился')+' на '+Math.abs(dfc).toFixed(1)+' п.п.: '+pc(sd(p.k.food,p.k.rev)*100)+' → '+pc(sd(l.k.food,l.k.rev)*100)+'.');
    var dsf=(sd(l.k.wages,l.k.rev)-sd(p.k.wages,p.k.rev))*100;
    if(Math.abs(dsf)>=1) note(dsf>0?'bad':'good','Доля зарплаты (без чаевых и взносов) '+(dsf>0?'выросла':'снизилась')+' на '+Math.abs(dsf).toFixed(1)+' п.п. ('+pc(sd(p.k.wages,p.k.rev)*100)+' → '+pc(sd(l.k.wages,l.k.rev)*100)+').');
  }
  var inv=sd(Math.abs(l.k.invNet),l.k.rev)*100;
  if(inv>=2) note(inv>=4?'bad':'warn','Инвентаризация нетто в '+esc(l.label)+': '+fm(l.k.invNet)+' ('+pc(inv)+' выручки). Это недостача после зачёта излишков: проверьте пересортицу и период, в который попали излишки.');
  if(l.k.capex>0) note('warn','Покупка оборудования и мебели ('+fm(l.k.capex)+') проведена в расходах. Это капитальные траты: без них операционная прибыль '+fm(l.k.adjOp)+'. Для баланса их надо вынести в основные средства.');
  if(l.k.event>0.03*l.k.rev) note('warn','«ДР Бара»: '+fm(l.k.event)+' ('+pc(l.k.event/l.k.rev*100)+' выручки). Разовое мероприятие сильно меняет прибыль месяца: сравнивайте месяцы и без него.');
  if(l.k.wages>0&&l.k.contrib<0.05*l.k.wages) note('bad','Взносы с ФОТ за '+esc(l.label)+' почти не начислены ('+fm(l.k.contrib)+' при зарплате '+fm(l.k.wages)+'). Прибыль завышена, и в обязательствах баланса есть долг.');
  else if(l.k.wages>0&&l.k.contrib>0.25*l.k.wages) note('warn','Взносы с ФОТ ('+fm(l.k.contrib)+') намного выше зарплаты в пропорции '+pc(l.k.contrib/l.k.wages*100)+'. Похоже, это доплата за прошлые месяцы: прибыль месяца занижена, предыдущих завышена.');
  if(l.k.rizz!==0||l.pnl.other_income||l.pnl.other_expenses) note('warn','Расчёты с RizzW (доход '+fm(l.pnl.other_income)+', расход '+fm(l.pnl.other_expenses)+') попали в прочие доходы и расходы. Это другая компания, в прибыль Лагера их включать нельзя.');
  var paid=l.k.div+l.k.loan;
  if(l.k.opNet>0&&paid>l.k.opNet) note(l.k.close<l.k.open?'bad':'warn','Выплаты учредителям'+(l.k.loan?' и по кредиту':'')+' ('+fm(paid)+') больше операционного денежного потока ('+fm(l.k.opNet)+'): остаток денег '+(l.k.close<l.k.open?'уменьшился':'держится за счёт накоплений')+' на '+fm(Math.abs(l.k.close-l.k.open))+'.');
  var dv=sd(l.k.div,l.k.net);
  if(dv!=null&&dv>1) note('bad','Выплаты учредителям за '+esc(l.label)+' ('+fm(l.k.div)+') больше чистой прибыли месяца ('+fm(l.k.net)+').');
  if(sf!=null&&sf<.15) note(sf<0?'bad':'warn','Запас прочности '+pc(sf*100)+': выручка близка к точке безубыточности '+fm(be)+'.');
  note('warn','Налогов нет ни в ОПиУ, ни в ДДС: чистая прибыль здесь до налогов. Сверьте с вашей налоговой отчётностью.');
  h+='<div class="panel"><h3>Что бросается в глаза</h3><div class="n">Автоматические выводы по '+esc(l.label)+(p?' к '+esc(p.label):'')+'. Это подсказки для разбора, а не диагноз.</div><ul class="notes">'+N.join('')+'</ul></div>';

  // контроль данных
  var Q=[];
  M.forEach(function(m){
    var p_=m.pnl,e1=p_.total_revenue-p_.total_cogs-p_.gross_profit,e2=p_.gross_profit-p_.total_expenses-p_.operating_profit,e3=p_.operating_profit+p_.other_income-p_.other_expenses-p_.net_profit;
    var e4=m.cashflow.opening+sum(m.cashflow.groups.map(function(g){return g.value}))-m.cashflow.closing;
    var e5=m.k.rev-p_.other_revenue-m.k.sales;
    var gi=sum(p_.expense_groups.map(function(g){return g.value}))-p_.total_expenses;
    var ix=M.indexOf(m),pe=ix>0?M[ix-1].k.close-m.k.open:null;
    Q.push('<tr><td>'+esc(m.label)+'</td>'+[e1,e2,e3,e4,e5,gi].map(function(e){return '<td class="'+(Math.abs(e)>1?'neg':'pos')+'">'+(Math.abs(e)>1?fmt(e):'ок')+'</td>'}).join('')+'<td class="'+(pe!=null&&Math.abs(pe)>1?'neg':'pos')+'">'+(pe==null?'—':(Math.abs(pe)>1?fmt(pe):'ок'))+'</td></tr>');
  });
  h+='<div class="panel"><h3>Контроль данных</h3><div class="n">Все месяцы. «ок» — арифметика сходится, число — размер расхождения, ₽</div><div class="ts"><table><thead><tr><th>Месяц</th><th>Выручка − себест. = валовая</th><th>Валовая − расходы = опер.</th><th>Опер. ± прочее = чистая</th><th>Начало + ДДС = конец</th><th>Выручка ОПиУ = чеки</th><th>Группы = итого расходов</th><th>Конец пред. = начало</th></tr></thead><tbody>'+Q.join('')+'</tbody></table></div></div>';
  $('#main').innerHTML=h;
}
})();
