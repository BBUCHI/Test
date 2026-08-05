/* =========================================================
   map.js
   Carte : une grille A–J × 1–14, une case par Région, avec les Lieux
   qui s'y trouvent. Lecture seule — réutilise core/schema.js,
   core/store.js et core/github.js exactement comme wiki.js.
   ========================================================= */
import { TYPE_ORDER } from './core/schema.js';
import { readJsonFile } from './core/store.js';
import { getGithubConfig, githubLoadFile } from './core/github.js';

const LETTERS = 'ABCDEFGHIJ'.split('');
let world = null;
let selected = null; // { kind:'region'|'lieu', id }

function resolveNom(id){
  if(!world || !id) return id;
  for(const t of TYPE_ORDER){
    if(world[t] && world[t][id]) return world[t][id].nom || id;
  }
  return id;
}
function lieuxInRegion(coord){
  if(!world) return [];
  return Object.values(world.lieux || {}).filter(l => (l.regions||[]).includes(coord) && !l.situe_dans);
}
function updateStatus(text){
  document.getElementById('fileStatus').textContent = text || '';
}

function render(){
  const root = document.getElementById('mapRoot');
  root.innerHTML = '';
  if(!world){
    root.innerHTML = '<p class="tool-empty">Charge un monde (fichier local ou GitHub) pour voir sa carte.</p>';
    return;
  }
  const layout = document.createElement('div'); layout.className='map-layout';

  const scrollWrap = document.createElement('div'); scrollWrap.className='map-scroll';
  const grid = document.createElement('div'); grid.className='map-grid';

  const corner = document.createElement('div'); corner.className='map-corner'; grid.appendChild(corner);
  LETTERS.forEach(letter=>{
    const h = document.createElement('div'); h.className='map-colhead'; h.textContent = letter;
    grid.appendChild(h);
  });
  for(let row=1; row<=14; row++){
    const rh = document.createElement('div'); rh.className='map-rowhead'; rh.textContent = row;
    grid.appendChild(rh);
    LETTERS.forEach(letter=>{
      const coord = letter+row;
      const region = world.regions ? world.regions[coord] : null;
      const lieux = lieuxInRegion(coord);
      const cell = document.createElement('div');
      cell.className = 'map-cell' + (region ? ' has-region' : '') + (selected && selected.kind==='region' && selected.id===coord ? ' selected' : '');
      if(region && region.nom && region.nom !== coord){
        const nameEl = document.createElement('div'); nameEl.className='mc-name'; nameEl.textContent = region.nom;
        cell.appendChild(nameEl);
      } else {
        const coordEl = document.createElement('div'); coordEl.className='mc-name'; coordEl.style.color='var(--text-muted)'; coordEl.textContent = coord;
        cell.appendChild(coordEl);
      }
      if(lieux.length){
        const lieuxEl = document.createElement('div'); lieuxEl.className='mc-lieux'; lieuxEl.textContent = lieux.length===1 ? lieux[0].nom : lieux.length+' lieux';
        cell.appendChild(lieuxEl);
      }
      cell.onclick = ()=>{ selected = { kind:'region', id: coord }; render(); };
      grid.appendChild(cell);
    });
  }
  scrollWrap.appendChild(grid);
  layout.appendChild(scrollWrap);

  const side = document.createElement('div'); side.className='map-side';
  side.appendChild(buildDetail());
  side.appendChild(buildOutsideBox());
  layout.appendChild(side);

  root.appendChild(layout);
}

function buildDetail(){
  const box = document.createElement('div'); box.className='map-detail';
  if(!selected){
    box.innerHTML = '<p style="color:var(--text-muted); font-style:italic; margin:0;">Clique une case, un lieu, ou une entrée \u00abhors carte\u00bb pour voir le détail ici.</p>';
    return box;
  }
  if(selected.kind==='region'){
    const region = world.regions ? world.regions[selected.id] : null;
    const h2 = document.createElement('h2'); h2.textContent = (region && region.nom) || selected.id;
    const meta = document.createElement('div'); meta.className='md-meta'; meta.textContent = 'Région · '+selected.id;
    box.append(h2, meta);
    if(region && (region.tags||[]).length){
      const p = document.createElement('p'); p.style.fontSize='.82rem'; p.textContent = 'Tags : '+region.tags.join(', ');
      box.appendChild(p);
    }
    const lieux = lieuxInRegion(selected.id);
    const h3 = document.createElement('div'); h3.style.fontSize='.8rem'; h3.style.color='var(--text-muted)'; h3.style.marginTop='10px';
    h3.textContent = lieux.length ? 'Lieux dans cette région :' : 'Aucun lieu dans cette région.';
    box.appendChild(h3);
    if(lieux.length){
      const ul = document.createElement('ul');
      lieux.forEach(l=>{
        const li = document.createElement('li');
        const btn = document.createElement('button'); btn.className='link-like'; btn.textContent = l.nom || l.id;
        btn.onclick = ()=>{ selected = { kind:'lieu', id: l.id }; render(); };
        li.appendChild(btn);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
  } else if(selected.kind==='lieu'){
    const lieu = world.lieux ? world.lieux[selected.id] : null;
    if(!lieu){ box.innerHTML = '<p style="color:var(--text-muted);">Lieu introuvable.</p>'; return box; }
    const h2 = document.createElement('h2'); h2.textContent = lieu.nom || selected.id;
    const meta = document.createElement('div'); meta.className='md-meta'; meta.textContent = 'Lieu · '+selected.id+(lieu.type_lieu ? ' · '+lieu.type_lieu : '');
    box.append(h2, meta);
    if(lieu.situe_dans){
      const p = document.createElement('p'); p.style.fontSize='.82rem';
      p.textContent = 'Situé dans : '+resolveNom(lieu.situe_dans);
      box.appendChild(p);
    }
    if((lieu.regions||[]).length){
      const p = document.createElement('p'); p.style.fontSize='.82rem'; p.textContent = 'Région(s) : '+lieu.regions.join(', ');
      box.appendChild(p);
    }
    if(lieu.description && lieu.description.apparence){
      const p = document.createElement('p'); p.style.fontSize='.82rem'; p.textContent = lieu.description.apparence;
      box.appendChild(p);
    }
  }
  return box;
}

function buildOutsideBox(){
  const box = document.createElement('div'); box.className='map-outside';
  const h3 = document.createElement('h3'); h3.textContent = 'Hors carte';
  box.appendChild(h3);
  const specials = ['XX','??'].filter(c => world.regions && world.regions[c]);
  if(specials.length===0){
    const p = document.createElement('p'); p.style.color='var(--text-muted)'; p.style.fontSize='.8rem'; p.style.margin=0;
    p.textContent = 'Aucune région \u00abXX\u00bb (hors du monde) ou \u00ab??\u00bb (position inconnue) définie.';
    box.appendChild(p);
    return box;
  }
  const ul = document.createElement('ul'); ul.style.listStyle='none'; ul.style.padding='0'; ul.style.margin='0';
  specials.forEach(coord=>{
    const region = world.regions[coord];
    const lieux = lieuxInRegion(coord);
    const li = document.createElement('li'); li.style.marginBottom='6px';
    const btn = document.createElement('button'); btn.className='link-like'; btn.style.fontSize='.84rem';
    btn.textContent = (region.nom || coord) + (lieux.length ? ' ('+lieux.length+' lieu(x))' : '');
    btn.onclick = ()=>{ selected = { kind:'region', id: coord }; render(); };
    li.appendChild(btn);
    ul.appendChild(li);
  });
  box.appendChild(ul);
  return box;
}

/* ---------- Chargement ---------- */
function loadWorld(data, label){
  world = data;
  selected = null;
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
