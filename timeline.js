/* =========================================================
   timeline.js
   Frise chronologique : place tous les Events sur l'axe L.l.
   Lecture seule — réutilise core/schema.js, core/store.js et
   core/github.js exactement comme wiki.js, sans rien dupliquer.
   ========================================================= */
import { TYPE_ORDER, TYPE_META } from './core/schema.js';
import { readJsonFile } from './core/store.js';
import { getGithubConfig, githubLoadFile } from './core/github.js';

let world = null;
let selectedId = null;

function resolveNom(id){
  if(!world || !id) return id;
  for(const t of TYPE_ORDER){
    if(world[t] && world[t][id]) return world[t][id].nom || id;
  }
  return id;
}
function resolveLieuNom(id){
  if(!world || !id) return null;
  if(world.lieux && world.lieux[id]) return world.lieux[id].nom || id;
  if(world.regions && world.regions[id]) return world.regions[id].nom || id;
  return id;
}
function hasNumericDate(ev){
  return ev.date && typeof ev.date.L === 'number';
}
function isOutOfTime(ev){
  return ev.date && ev.date.L === 'X';
}
function isUnknownDate(ev){
  return ev.date && (ev.date.L === '?' || ev.date.l === '?');
}
function dateLabel(ev){
  const d = ev.date || {};
  const L = d.L!==undefined ? d.L : '?';
  const l = d.l!==undefined ? d.l : '?';
  return L+'.'+l;
}

function updateStatus(text){
  document.getElementById('fileStatus').textContent = text || '';
}

function render(){
  const root = document.getElementById('timelineRoot');
  root.innerHTML = '';
  if(!world){
    root.innerHTML = '<p class="tool-empty">Charge un monde (fichier local ou GitHub) pour voir sa frise.</p>';
    return;
  }
  const events = Object.values(world.events || {});
  const dated = events.filter(hasNumericDate);
  const outOfTime = events.filter(isOutOfTime);
  const unknown = events.filter(isUnknownDate);

  const wrap = document.createElement('div'); wrap.className='tl-wrap';

  // ---- Axe principal ----
  const scrollWrap = document.createElement('div'); scrollWrap.className='tl-axis-scroll';
  const axis = document.createElement('div'); axis.className='tl-axis'; axis.id='tlAxis';
  for(let L=1; L<=12; L++){
    const pct = ((L-1)/12)*100;
    const tick = document.createElement('div'); tick.className='tl-tick'; tick.style.left=pct+'%';
    axis.appendChild(tick);
    const label = document.createElement('div'); label.className='tl-tick-label'; label.style.left=pct+'%'; label.textContent=L;
    axis.appendChild(label);
  }
  const endTick = document.createElement('div'); endTick.className='tl-tick'; endTick.style.left='100%'; axis.appendChild(endTick);

  // Regroupe les événements de date identique pour les empiler verticalement (évite le chevauchement)
  const groups = new Map();
  dated.forEach(ev=>{
    const key = ev.date.L+'.'+(ev.date.l||0);
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  });
  groups.forEach(list=>{
    const L = list[0].date.L, l = list[0].date.l||0;
    const pct = ((L-1) + l/12) / 12 * 100;
    list.forEach((ev, idx)=>{
      const marker = document.createElement('div');
      marker.className = 'tl-marker' + (ev.marquant ? ' marquant' : '') + (ev.id===selectedId ? ' selected' : '');
      marker.style.left = pct+'%';
      marker.style.top = (20 + idx*22)+'px';
      marker.title = ev.nom + ' (' + dateLabel(ev) + ')';
      marker.onclick = ()=>{ selectedId = ev.id; render(); };
      axis.appendChild(marker);
    });
  });
  scrollWrap.appendChild(axis);
  wrap.appendChild(scrollWrap);

  // ---- Listes annexes : hors chronologie / dates inconnues ----
  const lists = document.createElement('div'); lists.className='tl-lists';
  lists.appendChild(buildListColumn('Hors chronologie (X.X)', outOfTime));
  lists.appendChild(buildListColumn('Dates inconnues', unknown));
  wrap.appendChild(lists);

  // ---- Détail de l'événement sélectionné ----
  wrap.appendChild(buildDetail());

  root.appendChild(wrap);
}

function buildListColumn(title, list){
  const col = document.createElement('div'); col.className='tl-list-col';
  const h3 = document.createElement('h3'); h3.textContent = title+' ('+list.length+')';
  col.appendChild(h3);
  const ul = document.createElement('ul');
  if(list.length===0){
    const li = document.createElement('li'); li.textContent='Aucun.'; li.style.fontStyle='italic'; li.style.color='var(--text-muted)';
    ul.appendChild(li);
  } else {
    list.forEach(ev=>{
      const li = document.createElement('li');
      const btn = document.createElement('button'); btn.className='link-like'; btn.textContent = ev.nom || '(sans nom)';
      btn.onclick = ()=>{ selectedId = ev.id; render(); };
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }
  col.appendChild(ul);
  return col;
}

function buildDetail(){
  const box = document.createElement('aside'); box.className='tl-detail';
  const ev = selectedId && world.events ? world.events[selectedId] : null;
  if(!ev){
    box.innerHTML = '<p style="color:var(--text-muted); font-style:italic; margin:0;">Clique un événement sur la frise (ou dans une liste) pour voir son détail ici.</p>';
    return box;
  }
  const h2 = document.createElement('h2'); h2.textContent = ev.nom || '(sans nom)';
  const meta = document.createElement('div'); meta.className='tl-meta';
  meta.textContent = 'Événement · '+ev.id+(ev.marquant ? ' · marquant' : '');
  box.append(h2, meta);
  const dl = document.createElement('dl');
  function row(label, value){
    if(!value) return;
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    dl.append(dt, dd);
  }
  row('Date', dateLabel(ev));
  row('Lieu', resolveLieuNom(ev.lieu));
  row('Personnages', (ev.characters||[]).map(resolveNom).join(', '));
  row('Tags', (ev.tags||[]).join(', '));
  if((ev.anecdotes||[]).length) row('Anecdotes', ev.anecdotes.join(' — '));
  box.appendChild(dl);
  return box;
}

/* ---------- Chargement (identique dans l'esprit à wiki.js, en plus léger) ---------- */
function loadWorld(data, label){
  world = data;
  selectedId = null;
  updateStatus(label);
  render();
}
document.getElementById('btnLoad').onclick = ()=> document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = (e)=>{
  const f = e.target.files[0]; if(!f) return;
  readJsonFile(f).then(data=> loadWorld(data, f.name)).catch(err=> alert('Fichier JSON invalide : '+err.message));
  e.target.value = '';
};
document.getElementById('btnGithub').onclick = async ()=>{
  const cfg = getGithubConfig();
  if(!cfg.ownerRepo || !cfg.token || !cfg.path){
    alert("Aucun dépôt GitHub configuré. Ouvre d'abord l'Éditeur (wiki.html) et configure GitHub depuis son bouton \u00abGitHub\u00bb — la configuration est ensuite partagée avec cette page.");
    return;
  }
  updateStatus('Chargement depuis GitHub…');
  try{
    const text = await githubLoadFile(cfg);
    loadWorld(JSON.parse(text), cfg.path.split('/').pop()+' (GitHub)');
  }catch(e){
    updateStatus('');
    alert('Erreur : '+e.message);
  }
};

render();
