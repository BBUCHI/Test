/* =========================================================
   wiki.js
   Logique propre à l'éditeur Atlas : état de la fiche courante, rendu du
   DOM (sidebar, liste, fiche, infobox, modales…), édition, recherche.
   Le modèle de données et les I/O (fichiers, GitHub) viennent de core/.
   ========================================================= */
import {
  TYPE_ORDER, TYPE_META, TYPE_TO_COLLECTION, REF_TYPE_OPTIONS, FORM_SPEC,
  isBodyOnlyField, emptyWorld, getPath, setPath, generateId, GENESIS_VERB,
  ensureRecordDefaults, normalizeWorld, STATUS_LABELS,
} from './core/schema.js';
import {
  getGithubConfig, saveGithubConfig, githubLoadFile, githubSaveFile, GITHUB_CONFIG_KEY,
} from './core/github.js';
import { readJsonFile, downloadJson } from './core/store.js';


/* =========================================================
   CONSTANTES / SCHEMA-LITE
   ========================================================= */


let world = emptyWorld();
let currentType = '__home__';
let currentId = null;
let detailMode = 'view'; // 'view' (par défaut, style article) ou 'edit' (formulaire)
let listSearchTerm = '';
let listSortBy = 'nom'; // 'nom' ou 'id'
let dirty = false;
let currentFilename = 'monde.json';

/* Ids en PREFIXE_0001, incrémentaux, à partir du plus grand numéro existant dans la collection. */
function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function labelSpan(t){ const s=document.createElement('span'); s.className='inline-label'; s.textContent=t; return s; }
function resolveLabel(id){
  if(!id) return '';
  for(const t of TYPE_ORDER){
    const coll = world[t]||{};
    if(coll[id]) return coll[id].nom || id;
  }
  return id;
}
function resolveTypedRef(v, sources){
  if(!v) return null;
  for(const src of sources){ if((world[src]||{})[v]) return v; }
  const lower = v.toLowerCase();
  for(const src of sources){
    const coll = world[src]||{};
    for(const id in coll){ if((coll[id].nom||'').toLowerCase()===lower) return id; }
  }
  return null;
}
function isRegionCoordPattern(v){
  return /^[A-J](1[0-4]|[1-9])$/i.test(v) || v==='XX' || v==='??';
}
function findRecordAnywhere(id){
  for(const t of TYPE_ORDER){ if((world[t]||{})[id]) return t; }
  return null;
}
/* Cherche une fiche par NOM exact (insensible à la casse), tous types confondus - utilisé
   par les liens narratifs [[Nom]], puisqu'un lien de texte libre ne connaît pas de "sources". */
function resolveByName(nom){
  const lower = (nom||'').trim().toLowerCase();
  if(!lower) return null;
  for(const t of TYPE_ORDER){
    const coll = world[t]||{};
    for(const id in coll){ if((coll[id].nom||'').trim().toLowerCase()===lower) return {type:t, id}; }
  }
  return null;
}
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
/* [[Nom]] ou [[Nom|Texte affiché]] */
function parseWikiLinkRaw(raw){
  const parts = raw.split('|');
  const lookupName = parts[0].trim();
  const displayText = (parts.length>1 ? parts[1] : parts[0]).trim();
  return { lookupName, displayText };
}
function makeWikiTextLink(raw){
  const { lookupName, displayText } = parseWikiLinkRaw(raw);
  const found = resolveByName(lookupName);
  const a = document.createElement('a'); a.href='#'; a.textContent = displayText || lookupName;
  if(found){
    a.className='wiki-link';
    a.onclick = (e)=>{ e.preventDefault(); currentType=found.type; currentId=found.id; detailMode='view'; renderSidebar(); renderList(); renderDetail(); };
  } else {
    a.className='wiki-link missing';
    a.title = "Cette fiche n'existe pas encore \u2014 cliquer pour la créer";
    a.onclick = (e)=>{ e.preventDefault(); openTypePickerForName(lookupName); };
  }
  return a;
}
/* Rendu inline combiné : [[liens wiki]], texte en gras/italique, code - dans une seule passe
   pour ne jamais laisser un marqueur mal interprété. */
const INLINE_MD_RE = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`/g;
function renderInlineMarkdown(container, text){
  if(!text) return;
  const re = new RegExp(INLINE_MD_RE.source, 'g');
  let lastIndex = 0, match;
  while((match = re.exec(text)) !== null){
    if(match.index > lastIndex) container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    if(match[1]!==undefined){ container.appendChild(makeWikiTextLink(match[1])); }
    else if(match[2]!==undefined){ const el=document.createElement('strong'); el.textContent=match[2]; container.appendChild(el); }
    else if(match[3]!==undefined){ const el=document.createElement('em'); el.textContent=match[3]; container.appendChild(el); }
    else if(match[4]!==undefined){ const el=document.createElement('em'); el.textContent=match[4]; container.appendChild(el); }
    else if(match[5]!==undefined){ const el=document.createElement('code'); el.textContent=match[5]; container.appendChild(el); }
    lastIndex = re.lastIndex;
  }
  if(lastIndex < text.length) container.appendChild(document.createTextNode(text.slice(lastIndex)));
}
/* Rend un texte narratif : markdown léger (gras, italique, code, listes à puces) + [[liens wiki]],
   avec les sauts de ligne préservés. Le conteneur passé doit pouvoir contenir du contenu de bloc
   (utiliser un <div>, pas un <p>, si des listes sont possibles). */
function renderNarrativeText(container, text){
  if(!text) return;
  const lines = String(text).split('\n');
  let currentList = null;
  let firstLine = true;
  lines.forEach(line=>{
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if(listMatch){
      if(!currentList){ currentList = document.createElement('ul'); currentList.className='narrative-ul'; container.appendChild(currentList); }
      const li = document.createElement('li');
      renderInlineMarkdown(li, listMatch[1]);
      currentList.appendChild(li);
      firstLine = false;
      return;
    }
    currentList = null;
    if(!firstLine) container.appendChild(document.createElement('br'));
    renderInlineMarkdown(container, line);
    firstLine = false;
  });
}
/* Modale : la fiche ciblée par un [[lien]] n'existe pas encore - on choisit son type puis on la crée. */
function openTypePickerForName(nom){
  const content = document.createElement('div');
  const h = document.createElement('h3'); h.textContent = 'Créer « '+nom+' » en tant que\u2026';
  content.appendChild(h);
  const grid = document.createElement('div'); grid.style.cssText='display:flex; flex-wrap:wrap; gap:8px; margin:12px 0;';
  TYPE_ORDER.filter(t=>t!=='regions').forEach(t=>{
    const btn = document.createElement('button'); btn.type='button'; btn.className='btn-small';
    btn.textContent = TYPE_META[t].singular;
    btn.onclick = ()=>{
      const id = generateId(t, world[t]);
      const rec = { id, nom };
      ensureRecordDefaults(t, id, rec);
      world[t][id] = rec;
      attachGenesisEvent(t, rec);
      markDirty(); closeModal();
      currentType=t; currentId=id; detailMode='edit';
      renderSidebar(); renderList(); renderDetail();
    };
    grid.appendChild(btn);
  });
  content.appendChild(grid);
  const actions = document.createElement('div'); actions.className='modal-actions';
  const cancel = document.createElement('button'); cancel.textContent='Annuler'; cancel.onclick=closeModal;
  actions.appendChild(cancel);
  content.appendChild(actions);
  showModal(content);
}
/* Recherche libre par nom (tous types, sauf Région dont l'id n'est pas un nom) - utilisée par
   l'autocomplétion des liens [[...]] pendant la frappe. */
function searchEntitiesByName(query){
  const q = (query||'').trim().toLowerCase();
  const results = [];
  TYPE_ORDER.forEach(t=>{
    if(t==='regions') return;
    Object.values(world[t]||{}).forEach(r=>{
      if(!r.nom) return;
      if(q==='' || r.nom.toLowerCase().includes(q)) results.push({ type:t, id:r.id, nom:r.nom });
    });
  });
  results.sort((a,b)=>a.nom.localeCompare(b.nom,'fr'));
  return results.slice(0,8);
}
/* Attache une autocomplétion à une textarea narrative : dès qu'on tape "[[", propose des fiches
   existantes ; cliquer une suggestion complète le lien avec "]]". */
/* Fait grandir une textarea pour toujours montrer tout son contenu, sans barre de défilement interne. */
function autoGrowTextarea(ta){
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
function attachWikiLinkAutocomplete(ta){
  let dropdown = null;
  function closeDropdown(){ if(dropdown){ dropdown.remove(); dropdown=null; } }
  function getOpenLink(){
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const openIdx = before.lastIndexOf('[[');
    if(openIdx===-1) return null;
    const between = before.slice(openIdx+2);
    if(between.includes(']]') || between.includes('\n')) return null;
    return { query: between, openIdx };
  }
  function render(){
    const info = getOpenLink();
    if(!info){ closeDropdown(); return; }
    const matches = searchEntitiesByName(info.query);
    if(!dropdown){
      dropdown = document.createElement('div'); dropdown.className='wikilink-autocomplete';
      ta.parentNode.insertBefore(dropdown, ta.nextSibling);
    }
    dropdown.innerHTML='';
    if(matches.length===0){
      const empty = document.createElement('div'); empty.className='wikilink-ac-empty';
      empty.textContent = info.query ? ('Aucune fiche « '+info.query+' » - proposée à la création au clic sur le lien') : 'Tapez pour chercher une fiche\u2026';
      dropdown.appendChild(empty);
      return;
    }
    matches.forEach(m=>{
      const item = document.createElement('div'); item.className='wikilink-ac-item';
      const nameSpan = document.createElement('span'); nameSpan.textContent = m.nom;
      const typeSpan = document.createElement('span'); typeSpan.className='wikilink-ac-type'; typeSpan.textContent = TYPE_META[m.type].singular;
      item.append(nameSpan, typeSpan);
      item.onmousedown = (e)=>{
        e.preventDefault();
        const val = ta.value;
        const before = val.slice(0, info.openIdx+2);
        const after = val.slice(info.openIdx+2+info.query.length);
        const insertion = m.nom+']]';
        ta.value = before+insertion+after;
        const newPos = (before+insertion).length;
        ta.setSelectionRange(newPos, newPos);
        ta.dispatchEvent(new Event('input', {bubbles:true}));
        closeDropdown();
        ta.focus();
      };
      dropdown.appendChild(item);
    });
  }
  ta.addEventListener('input', render);
  ta.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDropdown(); });
  ta.addEventListener('blur', ()=> setTimeout(closeDropdown, 150));
}
/* Types d'entités "basiques" (id, timeline, attributs.*) dont le texte narratif est scanné pour
   les liens [[...]] — sert au calcul des Pages liées. */
function gatherNarrativeTexts(type, record){
  const texts = [];
  const resumePath = (type==='events'||type==='regions') ? 'resume' : 'attributs.resume';
  const resumeVal = getPath(record, resumePath);
  if(resumeVal) texts.push(resumeVal);
  const desc = record.description;
  if(typeof desc==='string') texts.push(desc);
  else if(desc && typeof desc==='object') Object.values(desc).forEach(v=>{ if(v) texts.push(v); });
  const anecdotesPath = (type==='events'||type==='regions') ? 'anecdotes' : 'attributs.anecdotes';
  (getPath(record, anecdotesPath)||[]).forEach(v=>{ if(v) texts.push(v); });
  if(type!=='alignements'){
    (getPath(record, customSectionsPath(type))||[]).forEach(s=>{ if(s.contenu) texts.push(s.contenu); });
  }
  return texts;
}
function extractWikiLinkIds(texts){
  const ids = [];
  texts.forEach(text=>{
    const re = new RegExp(WIKILINK_RE.source, 'g');
    let m;
    while((m = re.exec(text)) !== null){
      const { lookupName } = parseWikiLinkRaw(m[1]);
      const found = resolveByName(lookupName);
      if(found) ids.push(found.id);
    }
  });
  return ids;
}
/* Choisit dans quel type créer une fiche manquante, en fonction des sources possibles du champ. */
function pickCreationType(sources, idHint){
  if(!sources || sources.length===0) return null;
  if(idHint && sources.includes('regions') && isRegionCoordPattern(idHint)) return 'regions';
  const nonRegion = sources.find(s=>s!=='regions');
  return nonRegion || sources[0];
}
/* Verbe d'ouverture de fiche selon le type — sert à nommer l'Event de départ créé automatiquement.
   Absent de la liste = pas de timeline affichée pour ce type (especes, regions) -> pas d'event auto. */
function attachGenesisEvent(type, rec){
  const verb = GENESIS_VERB[type];
  if(!verb) return;
  if(!rec.timeline || rec.timeline.length>0) return;
  const evtId = generateId('events', world.events);
  const evt = {
    id: evtId,
    date: {L:'?', l:'?'},
    nom: verb+' de '+(rec.nom||rec.id),
    ordre: 1,
    marquant: false,
    lieu: (type==='lieux') ? rec.id : null,
    characters: (type==='personnages') ? [rec.id] : [],
    tags: [],
    anecdotes: [],
  };
  world.events[evtId] = evt;
  rec.timeline = [{ debut: evtId, fin: null }];
}
function createStubGeneric(type, nom){
  const id = generateId(type, world[type]);
  const rec = { id, nom };
  ensureRecordDefaults(type, id, rec);
  world[type][id] = rec;
  attachGenesisEvent(type, rec);
  markDirty();
  renderSidebar();
  return id;
}
function createStubRegion(coordId){
  const id = coordId.toUpperCase()==='XX' ? 'XX' : (coordId==='??' ? '??' : coordId.toUpperCase());
  if(world.regions[id]) return id;
  const rec = { id, nom:id };
  if(id!=='XX' && id!=='??'){ rec.abs = id[0]; rec.ord = parseInt(id.slice(1),10); }
  ensureRecordDefaults('regions', id, rec);
  world.regions[id] = rec;
  markDirty();
  renderSidebar();
  return id;
}
/* Crée une fiche stub à la volée en RÉUTILISANT l'id exact déjà référencé ailleurs
   (cas d'un lien rouge / référence pendante trouvée en mode lecture). */
function createStubWithExactId(type, id){
  if(world[type][id]) return id;
  const rec = { id, nom:'' };
  ensureRecordDefaults(type, id, rec);
  world[type][id] = rec;
  attachGenesisEvent(type, rec);
  markDirty();
  renderSidebar();
  return id;
}
/* Résout une saisie (id existant, nom existant), ou CRÉE la fiche manquante à la volée
   (nouvel id généré à partir du texte tapé) — on n'a plus besoin de pré-créer les fiches
   avant de les référencer, seulement de les remplir ensuite. */
function resolveOrCreateRef(v, sources){
  if(!v) return null;
  const existing = resolveTypedRef(v, sources);
  if(existing) return existing;
  if(sources.includes('regions') && isRegionCoordPattern(v)) return createStubRegion(v);
  const creatable = sources.find(s=>s!=='regions');
  if(creatable) return createStubGeneric(creatable, v);
  return null;
}

/* =========================================================
   NORMALISATION / DEFAUTS
   ========================================================= */
function renderSidebar(){
  const nav = document.getElementById('sidebar');
  nav.innerHTML = '';
  const homeBtn = document.createElement('button');
  homeBtn.className = 'side-item'+(currentType==='__home__'?' active':'');
  const hIcon = document.createElement('span'); hIcon.className='side-icon'; hIcon.textContent='\u2302';
  const hLabel = document.createElement('span'); hLabel.className='side-label'; hLabel.textContent='Accueil';
  homeBtn.append(hIcon, hLabel);
  homeBtn.onclick = ()=>{ currentType='__home__'; currentId=null; renderSidebar(); renderList(); renderDetail(); };
  nav.appendChild(homeBtn);
  const sep0 = document.createElement('div'); sep0.style.cssText='border-top:1px solid var(--border-light); margin:10px 0;';
  nav.appendChild(sep0);
  TYPE_ORDER.forEach(t=>{
    const btn = document.createElement('button');
    btn.className = 'side-item'+(t===currentType?' active':'');
    const count = Object.keys(world[t]||{}).length;
    const iconSpan = document.createElement('span'); iconSpan.className='side-icon'; iconSpan.textContent=TYPE_META[t].icon;
    const labelSpanEl = document.createElement('span'); labelSpanEl.className='side-label'; labelSpanEl.textContent=TYPE_META[t].label;
    const countSpan = document.createElement('span'); countSpan.className='side-count'; countSpan.textContent=count;
    btn.append(iconSpan, labelSpanEl, countSpan);
    btn.onclick = ()=>{ currentType=t; currentId=null; detailMode='view'; listSearchTerm=''; renderSidebar(); renderList(); renderDetail(); };
    nav.appendChild(btn);
  });
  const sep = document.createElement('div'); sep.style.cssText='border-top:1px solid var(--border-light); margin:10px 0;';
  nav.appendChild(sep);
  const notesBtn = document.createElement('button');
  notesBtn.className = 'side-item'+(currentType==='__notes__'?' active':'');
  const nIcon = document.createElement('span'); nIcon.className='side-icon'; nIcon.textContent='\u270E';
  const nLabel = document.createElement('span'); nLabel.className='side-label'; nLabel.textContent='Bloc-notes';
  notesBtn.append(nIcon, nLabel);
  notesBtn.onclick = ()=>{ currentType='__notes__'; currentId=null; renderSidebar(); renderList(); renderDetail(); };
  nav.appendChild(notesBtn);
}

function renderList(){
  const panel = document.getElementById('listPanel');
  panel.innerHTML = '';
  if(currentType==='__home__'){
    const h = document.createElement('h2'); h.style.fontFamily='var(--font-heading)'; h.style.fontWeight='400'; h.textContent='Accueil';
    const p = document.createElement('p'); p.className='empty-hint';
    p.textContent = "Par où commencer ?";
    panel.append(h, p);
    return;
  }
  if(currentType==='__notes__'){
    const h = document.createElement('h2'); h.style.fontFamily='var(--font-heading)'; h.style.fontWeight='400'; h.textContent='Bloc-notes';
    const p = document.createElement('p'); p.className='empty-hint';
    p.textContent = "Un espace libre pour vos idées, en vrac. Sauvegardé avec le monde, mais indépendant des fiches.";
    panel.append(h, p);
    return;
  }
  const header = document.createElement('div'); header.className='list-header';
  const h = document.createElement('h2'); h.textContent = TYPE_META[currentType].label;
  const newBtn = document.createElement('button'); newBtn.className='btn-primary'; newBtn.textContent='+ Nouveau';
  newBtn.onclick = ()=> openCreateModal(currentType);
  header.append(h, newBtn);
  if(currentType==='regions'){
    const gridBtn = document.createElement('button'); gridBtn.className='btn-primary'; gridBtn.textContent='Générer A1→J14';
    gridBtn.title = 'Crée toutes les régions manquantes de la grille (A-J × 1-14)';
    gridBtn.onclick = generateFullRegionGrid;
    header.appendChild(gridBtn);
  }
  if(currentType==='events'){
    const marquantBtn = document.createElement('button'); marquantBtn.className='btn-primary'; marquantBtn.textContent='Générer les marquants 1.1→8.12';
    marquantBtn.title = 'Crée un événement marquant vide pour chaque date manquante entre 1.1 et 8.12, à compléter ensuite';
    marquantBtn.onclick = generateMarquantEventsGrid;
    header.appendChild(marquantBtn);
  }
  const search = document.createElement('input'); search.className='search-input'; search.placeholder='Rechercher...';
  search.value = listSearchTerm;
  search.oninput = ()=>{ listSearchTerm = search.value; renderListItems(itemsWrap); };
  const sortRow = document.createElement('div'); sortRow.className='sort-row';
  const sortLabel = document.createElement('span'); sortLabel.className='inline-label'; sortLabel.textContent='Trier par';
  const sortSelect = document.createElement('select'); sortSelect.className='sort-select';
  [['nom','Nom'],['id','ID']].forEach(([v,l])=>{ const o=document.createElement('option'); o.value=v; o.textContent=l; if(v===listSortBy) o.selected=true; sortSelect.appendChild(o); });
  sortSelect.onchange = ()=>{ listSortBy = sortSelect.value; renderListItems(itemsWrap); };
  sortRow.append(sortLabel, sortSelect);
  panel.append(header, search, sortRow);
  const itemsWrap = document.createElement('div'); itemsWrap.className='items-wrap';
  panel.appendChild(itemsWrap);
  renderListItems(itemsWrap);
}
function renderListItems(wrap){
  wrap.innerHTML = '';
  const coll = world[currentType]||{};
  const term = (listSearchTerm||'').toLowerCase();
  const entries = Object.values(coll).filter(r=>{
    if(!term) return true;
    const tags = (r.tags || (r.attributs&&r.attributs.tags) || []).join(' ').toLowerCase();
    return (r.nom||'').toLowerCase().includes(term) || (r.id||'').toLowerCase().includes(term) || tags.includes(term);
  }).sort((a,b)=> listSortBy==='id' ? (a.id||'').localeCompare(b.id||'','fr',{numeric:true}) : (a.nom||'').localeCompare(b.nom||'','fr'));
  if(entries.length===0){ wrap.innerHTML = '<p class="empty-hint">Aucun élément.</p>'; return; }
  entries.forEach(r=>{
    const item = document.createElement('button');
    item.className = 'list-item'+(r.id===currentId?' active':'');
    const nomSpan = document.createElement('span'); nomSpan.className='li-nom'; nomSpan.textContent = r.nom || '(sans nom)';
    const idSpan = document.createElement('span'); idSpan.className='li-id idbadge'; idSpan.textContent = r.id;
    item.append(nomSpan, idSpan);
    item.onclick = ()=>{ currentId = r.id; detailMode='view'; renderList(); renderDetail(); };
    wrap.appendChild(item);
  });
}

/* =========================================================
   RENDU — DETAIL
   ========================================================= */
function emptyStateHtml(){
  return '<div class="empty-state"><p>Pas d\'élément seléctioné.</p></div>';
}
function clearDynDatalists(){ document.querySelectorAll('.dyn-datalist').forEach(e=>e.remove()); }

function renderDetail(){
  const headerEl = document.getElementById('detailHeader');
  const bodyEl = document.getElementById('detailBody');
  headerEl.innerHTML = '';
  bodyEl.innerHTML = '';
  clearDynDatalists();
  if(currentType==='__home__'){ renderHomepage(); return; }
  if(currentType==='__notes__'){ renderNotes(); return; }
  if(!currentId){ bodyEl.innerHTML = emptyStateHtml(); return; }
  const coll = world[currentType];
  const record = coll ? coll[currentId] : null;
  if(!record){ currentId=null; bodyEl.innerHTML = emptyStateHtml(); return; }
  if(detailMode==='edit') renderDetailEdit(record); else renderDetailView(record);
}
/* ---------- Accueil : liste de toutes les fiches + % de remplissage ---------- */
function isFieldFilled(record, def){
  const val = getPath(record, def.key);
  switch(def.kind){
    case 'text': case 'textarea': case 'select': case 'lead': case 'image':
      return !!(val && String(val).trim());
    case 'number':
      return val!==null && val!==undefined && val!=='';
    case 'tags': case 'int-list': case 'ref-list': case 'narrative-list': case 'personnage-formes':
      return Array.isArray(val) && val.length>0;
    case 'ref':
      return !!val;
    case 'timeline':
      return Array.isArray(val) && val.length>0 && val.some(p=>p.debut);
    case 'roles': case 'alignements': case 'membres': case 'tuepar': case 'affecte': case 'espece-orgs':
      return Array.isArray(val) && val.length>0;
    case 'description':
      if(typeof val==='string') return val.trim().length>0;
      if(val && typeof val==='object') return Object.values(val).some(v=>v && String(v).trim());
      return false;
    default:
      return false; // boolean, habitants (dérivé), date : pas de notion de "vide", exclus du score
  }
}
function computeCompletion(type, record){
  const spec = (FORM_SPEC[type]||[]).filter(d=> d.kind!=='habitants' && d.kind!=='date' && d.kind!=='boolean');
  if(spec.length===0) return 100;
  const filled = spec.filter(d=>isFieldFilled(record,d)).length;
  return Math.round(100*filled/spec.length);
}
const HOME_EXCLUDED_TYPES = ['regions','alignements','events'];
function renderHomepage(){
  const panel = document.getElementById('detailBody');
  panel.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className='wiki-page';
  const h1 = document.createElement('h1'); h1.className='wiki-title'; h1.textContent='Accueil';
  const subtitle = document.createElement('div'); subtitle.className='wiki-subtitle';
  subtitle.textContent = '';
  wrap.append(h1, subtitle);
  const rule = document.createElement('div'); rule.className='wiki-title-rule';
  wrap.appendChild(rule);

  const pool = [];
  TYPE_ORDER.forEach(t=>{
    if(HOME_EXCLUDED_TYPES.includes(t)) return;
    Object.values(world[t]||{}).forEach(record=>{ pool.push({type:t, record}); });
  });

  if(pool.length===0){
    const p = document.createElement('p'); p.className='empty-hint'; p.textContent='Le monde est vide.';
    wrap.appendChild(p);
    panel.appendChild(wrap);
    return;
  }

  const section = document.createElement('section'); section.className='wiki-section';
  const h2 = document.createElement('h2'); h2.textContent='10 pages au hasard';
  const reshuffleBtn = document.createElement('button'); reshuffleBtn.type='button'; reshuffleBtn.className='btn-small'; reshuffleBtn.textContent='\u{1F500} Nouvelle sélection';
  reshuffleBtn.style.marginBottom='10px';
  reshuffleBtn.onclick = ()=> renderHomepage();
  const ul = document.createElement('ul'); ul.className='view-list';
  const picked = pool.slice().sort(()=>Math.random()-0.5).slice(0,10);
  picked.forEach(({type, record})=>{
    const li = document.createElement('li');
    li.appendChild(document.createTextNode('['+TYPE_META[type].singular+'] '));
    const a = document.createElement('a'); a.href='#'; a.className='wiki-link'; a.textContent = record.nom || '(sans nom)';
    a.onclick = (e)=>{ e.preventDefault(); currentType=type; currentId=record.id; detailMode='view'; renderSidebar(); renderList(); renderDetail(); };
    li.appendChild(a);
    ul.appendChild(li);
  });
  section.append(h2, reshuffleBtn, ul);
  wrap.appendChild(section);
  panel.appendChild(wrap);
}
function renderNotes(){
  const panel = document.getElementById('detailBody');
  const wrap = document.createElement('div'); wrap.className='wiki-page';
  const h1 = document.createElement('h1'); h1.className='wiki-title'; h1.textContent='Bloc-notes';
  const subtitle = document.createElement('div'); subtitle.className='wiki-subtitle';
  subtitle.textContent = 'Espace libre. Sauvegardé avec le monde, indépendant des fiches.';
  wrap.append(h1, subtitle);
  const rule = document.createElement('div'); rule.className='wiki-title-rule';
  wrap.appendChild(rule);
  const ta = document.createElement('textarea');
  ta.value = world.notes || '';
  ta.rows = 26;
  ta.style.cssText = 'width:100%; font-family:var(--font-mono); font-size:.85rem; line-height:1.7;';
  ta.placeholder = 'Idées en vrac, à trier plus tard…';
  ta.oninput = ()=>{ world.notes = ta.value; markDirty(); };
  wrap.appendChild(ta);
  panel.appendChild(wrap);
}

/* ---------- Mode LECTURE (par défaut) : page façon Wikipedia ---------- */
function renderDetailView(record){
  const headerEl = document.getElementById('detailHeader');
  const bodyEl = document.getElementById('detailBody');

  const headerRow = document.createElement('div'); headerRow.className='wiki-header-row';
  const titleBlock = document.createElement('div');
  const h1 = document.createElement('h1'); h1.className='wiki-title'; h1.textContent = record.nom || '(sans nom)';
  const subtitle = document.createElement('div'); subtitle.className='wiki-subtitle';
  subtitle.textContent = TYPE_META[currentType].singular+' · '+record.id;
  titleBlock.append(h1, subtitle);

  const actions = document.createElement('div'); actions.className='wiki-actions';
  const editBtn = document.createElement('button'); editBtn.className='btn-edit-toggle'; editBtn.textContent='Modifier';
  editBtn.onclick = ()=>{ detailMode='edit'; renderDetail(); };
  const delBtn = document.createElement('button'); delBtn.className='btn-danger'; delBtn.textContent='Supprimer';
  delBtn.onclick = ()=> confirmDelete(currentType, currentId);
  actions.append(editBtn, delBtn);

  headerRow.append(titleBlock, actions);
  headerEl.appendChild(headerRow);
  const rule = document.createElement('div'); rule.className='wiki-title-rule';
  headerEl.appendChild(rule);

  const wrap = document.createElement('div'); wrap.className='wiki-page';
  const infobox = buildInfobox(currentType, record);
  if(infobox) wrap.appendChild(infobox);

  const fullSpec = FORM_SPEC[currentType]||[];
  const leadDef = fullSpec.find(d=>d.kind==='lead');
  if(leadDef){
    const leadVal = getPath(record, leadDef.key);
    if(leadVal){
      const leadP = document.createElement('div'); leadP.className='wiki-lead prose';
      renderNarrativeText(leadP, leadVal);
      wrap.appendChild(leadP);
    }
  }

  const body = document.createElement('div'); body.className='wiki-body';
  const bodySpec = fullSpec.filter(isBodyOnlyField);
  const mainDefs = bodySpec.filter(d=>d.kind!=='narrative-list' && d.kind!=='lead');
  const anecdoteDefs = bodySpec.filter(d=>d.kind==='narrative-list');
  renderSpecInto(body, record, mainDefs, 'view');
  renderCustomSectionsView(body, currentType, record);
  renderSpecInto(body, record, anecdoteDefs, 'view');
  wrap.appendChild(body);

  renderBacklinks(wrap, record.id);

  bodyEl.appendChild(wrap);
}

/* ---------- Pages liées (backlinks) : qui référence cette fiche ailleurs dans le monde ---------- */
function findBacklinks(targetId){
  const results = [];
  TYPE_ORDER.forEach(t=>{
    Object.values(world[t]||{}).forEach(record=>{
      if(record.id===targetId) return;
      const refs = collectRefs(t, record);
      const structuredHit = refs.some(r=>r.value===targetId);
      const narrativeHit = !structuredHit && t!=='alignements' && extractWikiLinkIds(gatherNarrativeTexts(t, record)).includes(targetId);
      if(structuredHit || narrativeHit){ results.push({type:t, record}); }
    });
  });
  results.sort((a,b)=> TYPE_META[a.type].label.localeCompare(TYPE_META[b.type].label,'fr') || (a.record.nom||'').localeCompare(b.record.nom||'','fr'));
  return results;
}
function renderBacklinks(container, targetId){
  const links = findBacklinks(targetId);
  const sec = document.createElement('section'); sec.className='wiki-section backlinks-section';
  const h2 = document.createElement('h2'); h2.textContent='Pages liées';
  sec.appendChild(h2);
  if(links.length===0){
    const p = document.createElement('p'); p.className='fact-line empty'; p.textContent='Aucune page ne pointe vers celle-ci pour le moment.';
    sec.appendChild(p);
    container.appendChild(sec);
    return;
  }
  const LIMIT = 5;
  const ul = document.createElement('ul'); ul.className='view-list';
  sec.appendChild(ul);
  let expanded = false;
  function renderItems(){
    ul.innerHTML='';
    const visible = expanded ? links : links.slice(0, LIMIT);
    visible.forEach(({type, record})=>{
      const li = document.createElement('li');
      li.appendChild(document.createTextNode('['+TYPE_META[type].singular+'] '));
      const a = document.createElement('a'); a.href='#'; a.className='wiki-link'; a.textContent = record.nom || '(sans nom)';
      a.onclick = (e)=>{ e.preventDefault(); currentType=type; currentId=record.id; detailMode='view'; renderSidebar(); renderList(); renderDetail(); };
      li.appendChild(a);
      ul.appendChild(li);
    });
  }
  renderItems();
  if(links.length > LIMIT){
    const toggleBtn = document.createElement('button'); toggleBtn.type='button'; toggleBtn.className='btn-small backlinks-toggle';
    toggleBtn.textContent = 'Voir plus ('+(links.length-LIMIT)+')';
    toggleBtn.onclick = ()=>{
      expanded = !expanded;
      renderItems();
      toggleBtn.textContent = expanded ? 'Voir moins' : ('Voir plus ('+(links.length-LIMIT)+')');
    };
    sec.appendChild(toggleBtn);
  }
  container.appendChild(sec);
}

/* ---------- Sections narratives libres (nom + contenu), ajoutables sur toute fiche ---------- */
function customSectionsPath(type){
  return (type==='events' || type==='regions') ? 'sections' : 'attributs.sections';
}
function renderCustomSectionsEdit(container, type, record){
  if(type==='alignements') return; // entité basique : pas de sections libres
  const path = customSectionsPath(type);
  let arr = getPath(record, path);
  if(!arr){ arr=[]; setPath(record, path, arr); }
  const section = document.createElement('section'); section.className='field-section';
  const h3 = document.createElement('h3'); h3.textContent='Sections narratives supplémentaires';
  section.appendChild(h3);
  const hint = document.createElement('p'); hint.className='field-hint';
  section.appendChild(hint);
  buildCustomSectionsEditor(section, arr, ()=>markDirty());
  container.appendChild(section);
}
function buildCustomSectionsEditor(container, arr, onChange){
  const wrap = document.createElement('div');
  function render(){
    wrap.innerHTML='';
    arr.forEach((s,idx)=>{
      const box = document.createElement('div'); box.className='sub-box';
      const titleInput = document.createElement('input'); titleInput.type='text'; titleInput.placeholder='Titre de la section (ex. Inventions)'; titleInput.value=s.titre||''; titleInput.style.flex='1';
      titleInput.oninput = ()=>{ s.titre=titleInput.value; onChange(); };
      const rm = document.createElement('button'); rm.type='button'; rm.className='btn-small btn-danger'; rm.textContent='Supprimer la section';
      rm.onclick = ()=>{ arr.splice(idx,1); onChange(); render(); };
      const rowTop = document.createElement('div'); rowTop.className='sub-row';
      rowTop.append(labelSpan('Titre'), titleInput, rm);
      const contentTa = document.createElement('textarea'); contentTa.rows=5; contentTa.value=s.contenu||''; contentTa.style.width='100%';
      contentTa.placeholder='Texte de la section…';
      contentTa.oninput = ()=>{ s.contenu=contentTa.value; onChange(); };
      contentTa.addEventListener('input', ()=>autoGrowTextarea(contentTa));
      attachWikiLinkAutocomplete(contentTa);
      box.append(rowTop, contentTa);
      wrap.appendChild(box);
    });
  }
  render();
  const addBtn = document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Ajouter une section narrative';
  addBtn.onclick = ()=>{ arr.push({titre:'', contenu:''}); onChange(); render(); };
  container.append(wrap, addBtn);
}
function renderCustomSectionsView(container, type, record){
  if(type==='alignements') return;
  const path = customSectionsPath(type);
  const arr = getPath(record, path) || [];
  arr.forEach(s=>{
    if(!s.titre && !s.contenu) return;
    const sec = document.createElement('section'); sec.className='wiki-section';
    const h2 = document.createElement('h2'); h2.textContent = s.titre || '(section sans titre)';
    const p = document.createElement('div'); p.className='prose';
    if(s.contenu) renderNarrativeText(p, s.contenu); else p.textContent='—';
    sec.append(h2, p);
    container.appendChild(sec);
  });
}

/* Rend une liste de champs (FORM_SPEC) dans un conteneur, en mode 'view' ou 'edit'.
   Les champs consécutifs marqués compact:true (petits éléments : genre/puissance,
   type de lieu/altitude, abscisse/ordonnée…) sont regroupés côte à côte sur une même ligne. */
function renderSpecInto(container, record, spec, mode){
  const sectionClass = mode==='edit' ? 'field-section' : 'wiki-section';
  const headingTag = mode==='edit' ? 'h3' : 'h2';
  let i=0;
  while(i<spec.length){
    const def = spec[i];
    if(def.compact){
      const group=[def];
      let j=i+1;
      while(j<spec.length && spec[j].compact){ group.push(spec[j]); j++; }
      const row=document.createElement('div'); row.className=sectionClass+' field-row';
      group.forEach(gdef=>{
        const cell=document.createElement('div'); cell.className='field-cell';
        const heading=document.createElement(headingTag); heading.textContent=gdef.label;
        cell.appendChild(heading);
        if(gdef.hint){ const hint=document.createElement('p'); hint.className='field-hint'; hint.textContent=gdef.hint; cell.appendChild(hint); }
        if(mode==='edit') buildField(cell, record, gdef); else renderFieldView(cell, record, gdef);
        row.appendChild(cell);
      });
      container.appendChild(row);
      i=j;
    } else {
      const section=document.createElement('section'); section.className=sectionClass;
      const heading=document.createElement(headingTag); heading.textContent=def.label;
      section.appendChild(heading);
      if(def.hint){ const hint=document.createElement('p'); hint.className='field-hint'; hint.textContent=def.hint; section.appendChild(hint); }
      if(mode==='edit') buildField(section, record, def); else renderFieldView(section, record, def);
      container.appendChild(section);
      i++;
    }
  }
}

/* ---------- Mode EDITION : formulaire ---------- */
function renderDetailEdit(record){
  const headerEl = document.getElementById('detailHeader');
  const bodyEl = document.getElementById('detailBody');
  const article = document.createElement('article'); article.className='record-article';
  const header = document.createElement('div'); header.className='record-header';
  const idBadge = document.createElement('span'); idBadge.className='idbadge'; idBadge.textContent=record.id;
  const titleInput = document.createElement('input'); titleInput.className='title-input'; titleInput.value = record.nom||'';
  titleInput.oninput = ()=>{ record.nom = titleInput.value; markDirty(); const iw=document.querySelector('.items-wrap'); if(iw) renderListItems(iw); };
  const readBtn = document.createElement('button'); readBtn.className='btn-edit-toggle'; readBtn.textContent='Lire l\u2019article';
  readBtn.onclick = ()=>{ detailMode='view'; renderDetail(); };
  const delBtn = document.createElement('button'); delBtn.className='btn-danger'; delBtn.textContent='Supprimer';
  delBtn.onclick = ()=> confirmDelete(currentType, currentId);
  header.append(idBadge, titleInput, readBtn, delBtn);
  headerEl.appendChild(header);

  const spec = FORM_SPEC[currentType]||[];
  renderSpecInto(article, record, spec, 'edit');
  renderCustomSectionsEdit(article, currentType, record);
  bodyEl.appendChild(article);
  requestAnimationFrame(()=>{ article.querySelectorAll('textarea').forEach(autoGrowTextarea); });
}

/* ---------- Infobox (mode lecture) ---------- */
/* Le vocabulaire de statut dépend du type de fiche. */
function statusText(type, record){
  if(type==='especes'){
    const orgs = record.organisations||[];
    if(orgs.length===0) return 'Unique';
    const lastOrg = orgs[orgs.length-1];
    const tl = lastOrg.timeline||[];
    if(tl.length===0) return 'Unique';
    const last = tl[tl.length-1];
    const labels = STATUS_LABELS.especes;
    const txt = last.fin===null ? labels.active : labels.ended;
    return txt + (tl.length>1 ? ' ('+tl.length+' périodes)' : '');
  }
  const tl = record.timeline||[];
  const labels = STATUS_LABELS[type] || {active:'En cours', ended:'Terminé'};
  if(tl.length===0) return 'Inconnu';
  const last = tl[tl.length-1];
  const txt = last.fin===null ? labels.active : labels.ended;
  return txt + (tl.length>1 ? ' ('+tl.length+' périodes)' : '');
}
/* Un événement référencé dans le texte s'affiche par sa DATE + son LIEU (ex. « 4.9 à Paris »), pas par son nom. */
function formatEventDateText(id){
  const ev = world.events[id];
  if(!ev) return id;
  const d = ev.date||{};
  let label = (d.L!==undefined?d.L:'?')+'.'+(d.l!==undefined?d.l:'?');
  if(ev.lieu) label += ' à '+resolveLabel(ev.lieu);
  return label;
}
function makeViewLink(id, sources){
  const foundType = findRecordAnywhere(id);
  const isPureEventRef = sources && sources.length===1 && sources[0]==='events';
  const a = document.createElement('a'); a.href='#';
  if(foundType){
    a.textContent = isPureEventRef ? formatEventDateText(id) : resolveLabel(id);
    a.className = 'wiki-link';
    a.onclick = (e)=>{ e.preventDefault(); currentType=foundType; currentId=id; detailMode='view'; renderSidebar(); renderList(); renderDetail(); };
  } else {
    a.textContent = id;
    a.className = 'wiki-link missing';
    a.title = "Cette fiche n'existe pas encore \u2014 cliquer pour la créer et la remplir";
    a.onclick = (e)=>{
      e.preventDefault();
      const targetType = pickCreationType(sources, id);
      if(!targetType) return;
      createStubWithExactId(targetType, id);
      currentType = targetType; currentId = id; detailMode='edit';
      renderSidebar(); renderList(); renderDetail();
    };
  }
  return a;
}
/* Valeur numérique comparable pour une date d'Event (L.l) — '?'/'X' comptent comme "le plus ancien". */
function eventDateSortValue(eventId){
  const ev = world.events[eventId];
  if(!ev) return -Infinity;
  const d = ev.date||{};
  const L = (typeof d.L==='number') ? d.L : null;
  if(L===null) return -Infinity;
  const l = (typeof d.l==='number') ? d.l : 0;
  return L*100 + l;
}
function mostRecentDebutValue(timeline){
  let best = -Infinity;
  (timeline||[]).forEach(p=>{ if(p.debut){ const v = eventDateSortValue(p.debut); if(v>best) best=v; } });
  return best;
}
/* Trie un tableau d'entrées (rôles, alignements, membres, organisations…) du plus récent au plus
   ancien, d'après la période la plus récente de chaque entrée. */
function sortByRecency(arr, getTimeline){
  return (arr||[]).slice().sort((x,y)=> mostRecentDebutValue(getTimeline(y)) - mostRecentDebutValue(getTimeline(x)));
}
/* Ajoute " — date1 – date2, date3 – date4…" pour une timeline donnée, avec liens vers les Events. */
function appendPeriodsInline(container, timeline){
  const periods = timeline||[];
  if(periods.length===0) return;
  container.appendChild(document.createTextNode(' - '));
  periods.forEach((p,i)=>{
    container.appendChild(p.debut ? makeViewLink(p.debut, ['events']) : document.createTextNode('?'));
    container.appendChild(document.createTextNode(' \u2013 '));
    container.appendChild(p.fin ? makeViewLink(p.fin, ['events']) : document.createTextNode('en cours'));
    if(i<periods.length-1) container.appendChild(document.createTextNode(', '));
  });
}
/* Alignement(s) d'un Personnage, du plus récent au plus ancien, avec les dates de chaque période. */
function renderAlignementsInfobox(container, record, def){
  const arr = getPath(record, def.key) || [];
  if(arr.length===0){ container.appendChild(mkEmptyP()); return; }
  const sorted = sortByRecency(arr, a=>a.timeline);
  const ul = document.createElement('ul'); ul.className='view-list';
  sorted.forEach(a=>{
    const li = document.createElement('li');
    if(a.alignement) li.appendChild(makeViewLink(a.alignement, ['alignements']));
    else li.appendChild(document.createTextNode('(alignement)'));
    appendPeriodsInline(li, a.timeline);
    ul.appendChild(li);
  });
  container.appendChild(ul);
}
/* Une ligne d'infobox ne s'affiche que si elle a vraiment quelque chose à montrer — sauf pour les
   types de champ où "vide" n'a pas de sens (nombre, booléen, date : toujours affichés). */
function isInfoboxRowEmpty(record, def){
  const val = getPath(record, def.key);
  switch(def.kind){
    case 'text': case 'select':
      return !(val && String(val).trim());
    case 'tags': case 'int-list': case 'ref-list': case 'personnage-formes': case 'narrative-list':
      return !(Array.isArray(val) && val.length>0);
    case 'ref':
      return !val;
    case 'timeline':
      return !(Array.isArray(val) && val.length>0);
    case 'roles': case 'alignements': case 'membres': case 'tuepar': case 'affecte': case 'espece-orgs':
      return !(Array.isArray(val) && val.length>0);
    default:
      return false; // nombre, booléen, date : toujours affichés
  }
}
function buildInfobox(type, record){
  const fullSpec = (FORM_SPEC[type]||[]).filter(def=>!isBodyOnlyField(def));
  const imageDef = fullSpec.find(d=>d.kind==='image');
  const spec = fullSpec.filter(def=> def.kind!=='image' && !isInfoboxRowEmpty(record, def));
  const hasStatus = !!STATUS_LABELS[type] || type==='especes';
  const imageVal = imageDef ? getPath(record, imageDef.key) : null;
  if(spec.length===0 && !hasStatus && !imageVal) return null;
  const box = document.createElement('aside'); box.className='infobox';
  const titleEl = document.createElement('div'); titleEl.className='infobox-title'; titleEl.textContent = record.nom || TYPE_META[type].singular;
  box.appendChild(titleEl);
  if(imageVal){
    const img = document.createElement('img'); img.className='infobox-image'; img.src = imageVal; img.alt = record.nom||'';
    img.onerror = ()=>{ img.style.display='none'; };
    box.appendChild(img);
  }
  const table = document.createElement('table'); table.className='infobox-table';
  if(hasStatus){
    const tr = document.createElement('tr');
    const th = document.createElement('th'); th.textContent='Statut';
    const td = document.createElement('td'); td.textContent = statusText(type, record);
    tr.append(th, td); table.appendChild(tr);
  }
  spec.forEach(def=>{
    const tr = document.createElement('tr');
    const th = document.createElement('th'); th.textContent = def.label;
    const td = document.createElement('td'); td.className='infobox-field';
    renderFieldView(td, record, def);
    tr.append(th, td);
    table.appendChild(tr);
  });
  box.appendChild(table);
  return box;
}
function mkEmptyP(){ const p=document.createElement('p'); p.className='fact-line empty'; p.textContent='—'; return p; }

/* ---------- Rendu de chaque champ en mode lecture ---------- */
function renderFieldView(container, record, def){
  const val = getPath(record, def.key);
  switch(def.kind){
    case 'text': case 'select': {
      const p=document.createElement('p'); p.className='fact-line'; p.textContent = val || '—';
      container.appendChild(p); break;
    }
    case 'textarea': case 'lead': {
      if(!val){ container.appendChild(mkEmptyP()); break; }
      const p=document.createElement('div'); p.className='prose'; renderNarrativeText(p, val);
      container.appendChild(p); break;
    }
    case 'number': {
      const p=document.createElement('p'); p.className='fact-line'+((val===null||val===undefined||val==='')?' empty':'');
      p.textContent = (val===null||val===undefined||val==='') ? '-' : val;
      container.appendChild(p); break;
    }
    case 'boolean': {
      const p=document.createElement('p'); p.className='fact-line'; p.textContent = val ? 'Oui' : 'Non';
      container.appendChild(p); break;
    }
    case 'tags': case 'int-list': case 'personnage-formes': {
      const arr = val||[];
      if(arr.length===0){ container.appendChild(mkEmptyP()); break; }
      const wrap=document.createElement('div'); wrap.className='chip-row-view';
      arr.forEach(v=>{
        const span=document.createElement('span'); span.className='tag-pill'; span.textContent=v;
        span.onclick=()=>{ listSearchTerm=String(v); renderList(); };
        wrap.appendChild(span);
      });
      container.appendChild(wrap); break;
    }
    case 'narrative-list': {
      const arr = val||[];
      if(arr.length===0){ container.appendChild(mkEmptyP()); break; }
      const ul=document.createElement('ul'); ul.className='view-list narrative-view-list';
      arr.forEach(v=>{ const li=document.createElement('li'); li.className='prose'; renderNarrativeText(li, v); ul.appendChild(li); });
      container.appendChild(ul); break;
    }
    case 'ref': {
      if(!val){ container.appendChild(mkEmptyP()); break; }
      const p=document.createElement('p'); p.appendChild(makeViewLink(val, def.sources)); container.appendChild(p); break;
    }
    case 'ref-list': {
      const arr = val||[];
      if(arr.length===0){ container.appendChild(mkEmptyP()); break; }
      const ul=document.createElement('ul'); ul.className='view-list';
      arr.forEach(id=>{ const li=document.createElement('li'); li.appendChild(makeViewLink(id, def.sources)); ul.appendChild(li); });
      container.appendChild(ul); break;
    }
    case 'timeline': {
      const arr = val||[];
      if(arr.length===0){ container.appendChild(mkEmptyP()); break; }
      const sorted = arr.slice().sort((a,b)=> eventDateSortValue(b.debut) - eventDateSortValue(a.debut));
      const ul=document.createElement('ul'); ul.className='view-list';
      sorted.forEach(p=>{
        const li=document.createElement('li');
        li.appendChild(document.createTextNode('De '));
        li.appendChild(p.debut ? makeViewLink(p.debut, ['events']) : document.createTextNode('?'));
        li.appendChild(document.createTextNode(' à '));
        li.appendChild(p.fin ? makeViewLink(p.fin, ['events']) : document.createTextNode('aujourd\u2019hui'));
        ul.appendChild(li);
      });
      container.appendChild(ul); break;
    }
    case 'roles': {
      const arr = val||[];
      if(arr.length===0){ container.appendChild(mkEmptyP()); break; }
      const sorted = sortByRecency(arr, r=>r.timeline);
      const ul=document.createElement('ul'); ul.className='view-list';
      sorted.forEach(r=>{
        const li=document.createElement('li');
        li.appendChild(document.createTextNode((r.nom||'(rôle)')+' - '));
        if(r.lieu) li.appendChild(makeViewLink(r.lieu, ['lieux','regions'])); else li.appendChild(document.createTextNode('lieu inconnu'));
        appendPeriodsInline(li, r.timeline);
        ul.appendChild(li);
      });
      container.appendChild(ul); break;
    }
    case 'alignements': {
      const arr = val||[];
      if(arr.length===0){ container.appendChild(mkEmptyP()); break; }
      const sorted = sortByRecency(arr, a=>a.timeline);
      const ul=document.createElement('ul'); ul.className='view-list';
      sorted.forEach(a=>{
        const li=document.createElement('li');
        if(a.alignement) li.appendChild(makeViewLink(a.alignement, ['alignements']));
        else li.appendChild(document.createTextNode('(alignement)'));
        appendPeriodsInline(li, a.timeline);
        ul.appendChild(li);
      });
      container.appendChild(ul); break;
    }
    case 'membres': {
      const arr = val||[];
      if(arr.length===0){ container.appendChild(mkEmptyP()); break; }
      const sorted = sortByRecency(arr, m=>m.timeline);
      const ul=document.createElement('ul'); ul.className='view-list';
      sorted.forEach(m=>{
        const li=document.createElement('li');
        li.appendChild(makeViewLink(m.id, def.sources));
        appendPeriodsInline(li, m.timeline);
        ul.appendChild(li);
      });
      container.appendChild(ul); break;
    }
    case 'tuepar': {
      const arr = val||[];
      if(arr.length===0){ container.appendChild(mkEmptyP()); break; }
      const sorted = arr.slice().sort((a,b)=> eventDateSortValue(b.evenement) - eventDateSortValue(a.evenement));
      const ul=document.createElement('ul'); ul.className='view-list';
      sorted.forEach(t=>{
        const li=document.createElement('li');
        li.appendChild(document.createTextNode('Tué par '));
        if(t.personnage) li.appendChild(makeViewLink(t.personnage, ['personnages']));
        if(t.evenement){ li.appendChild(document.createTextNode(' - mort en ')); li.appendChild(makeViewLink(t.evenement, ['events'])); }
        ul.appendChild(li);
      });
      container.appendChild(ul); break;
    }
    case 'affecte': {
      const arr = val||[];
      if(arr.length===0){ container.appendChild(mkEmptyP()); break; }
      const ul=document.createElement('ul'); ul.className='view-list';
      arr.forEach(a=>{
        const li=document.createElement('li');
        const coll = TYPE_TO_COLLECTION[a.type];
        li.appendChild(document.createTextNode('['+(TYPE_META[coll]?TYPE_META[coll].singular:a.type)+'] '));
        if(a.id) li.appendChild(makeViewLink(a.id, [coll]));
        ul.appendChild(li);
      });
      container.appendChild(ul); break;
    }
    case 'description': {
      const obj = val||{};
      let any=false;
      def.fields.forEach(([fk,flabel])=>{
        if(obj[fk]){
          any=true;
          const h4=document.createElement('h4'); h4.className='sub-heading'; h4.textContent=flabel;
          const p=document.createElement('div'); p.className='prose'; renderNarrativeText(p, obj[fk]);
          container.append(h4,p);
        }
      });
      if(!any) container.appendChild(mkEmptyP());
      break;
    }
    case 'habitants': {
      const arr = record.habitants||[];
      if(arr.length===0){ container.appendChild(mkEmptyP()); break; }
      const ul=document.createElement('ul'); ul.className='view-list';
      arr.forEach(h=>{
        const li=document.createElement('li');
        li.appendChild(makeViewLink(h.personnage, ['personnages']));
        li.appendChild(document.createTextNode(' - '+(h.role||'')));
        ul.appendChild(li);
      });
      container.appendChild(ul); break;
    }
    case 'espece-orgs': {
      const arr = val||[];
      if(arr.length===0){ container.appendChild(mkEmptyP()); break; }
      const sorted = sortByRecency(arr, o=>o.timeline);
      const ul=document.createElement('ul'); ul.className='view-list';
      sorted.forEach(o=>{
        const li=document.createElement('li');
        li.appendChild(document.createTextNode((o.type_organisation||'(type inconnu)')+' - source : '));
        const srcType = o.source && typeof o.source==='object' ? o.source.type : null;
        const srcId = o.source && typeof o.source==='object' ? o.source.id : o.source;
        if(srcId){
          const coll = TYPE_TO_COLLECTION[srcType] || 'groupes';
          li.appendChild(document.createTextNode('['+(TYPE_META[coll]?TYPE_META[coll].singular:srcType)+'] '));
          li.appendChild(makeViewLink(srcId, [coll]));
        } else {
          li.appendChild(document.createTextNode('inconnue'));
        }
        if((o.timeline||[]).length===0) li.appendChild(document.createTextNode(' — période inconnue'));
        else appendPeriodsInline(li, o.timeline);
        ul.appendChild(li);
      });
      container.appendChild(ul); break;
    }
    case 'date': {
      const d = record.date||{};
      const p=document.createElement('p'); p.className='fact-line'; p.textContent=(d.L!==undefined?d.L:'?')+'.'+(d.l!==undefined?d.l:'?');
      container.appendChild(p); break;
    }
  }
}

/* =========================================================
   CHAMPS — DISPATCH
   ========================================================= */
function buildField(container, record, def){
  const val0 = getPath(record, def.key);
  switch(def.kind){
    case 'text': {
      const input = document.createElement('input'); input.type='text'; input.value = val0||'';
      if(def.datalist){
        const dlid = 'dl_text_'+def.key.replace(/\./g,'_');
        let dl = document.getElementById(dlid);
        if(!dl){
          dl = document.createElement('datalist'); dl.id=dlid; dl.classList.add('dyn-datalist');
          def.datalist.forEach(v=>{ const o=document.createElement('option'); o.value=v; dl.appendChild(o); });
          document.body.appendChild(dl);
        }
        input.setAttribute('list', dlid);
      }
      input.oninput = ()=>{ setPath(record, def.key, input.value); markDirty(); };
      container.appendChild(input);
      break;
    }
    case 'textarea': case 'lead': {
      const ta = document.createElement('textarea'); ta.rows=(def.kind==='lead'?3:5); ta.value = val0||'';
      ta.oninput = ()=>{ setPath(record, def.key, ta.value); markDirty(); };
      ta.addEventListener('input', ()=>autoGrowTextarea(ta));
      attachWikiLinkAutocomplete(ta);
      container.appendChild(ta);
      break;
    }
    case 'number': {
      const input = document.createElement('input'); input.type='number';
      if(def.min!==undefined) input.min=def.min;
      if(def.max!==undefined) input.max=def.max;
      input.value = (val0===undefined||val0===null) ? '' : val0;
      input.oninput = ()=>{ const n = input.value===''? null : Number(input.value); setPath(record, def.key, n); markDirty(); };
      container.appendChild(input);
      break;
    }
    case 'boolean': {
      const label = document.createElement('label'); label.className='checkbox-label';
      const input = document.createElement('input'); input.type='checkbox'; input.checked = !!val0;
      input.onchange = ()=>{ setPath(record, def.key, input.checked); markDirty(); };
      label.append(input, document.createTextNode(' '+(def.checkboxLabel||'Oui')));
      container.appendChild(label);
      break;
    }
    case 'select': {
      const sel = document.createElement('select');
      def.options.forEach(o=>{ const opt=document.createElement('option'); opt.value=o; opt.textContent=o; if(o===val0) opt.selected=true; sel.appendChild(opt); });
      sel.onchange = ()=>{ setPath(record, def.key, sel.value); markDirty(); };
      container.appendChild(sel);
      break;
    }
    case 'image': {
      const input = document.createElement('input'); input.type='text'; input.value = val0||''; input.placeholder="https://…";
      const preview = document.createElement('img'); preview.className='image-field-preview';
      preview.style.display = val0 ? 'block' : 'none';
      if(val0) preview.src = val0;
      preview.onerror = ()=>{ preview.style.display='none'; };
      preview.onload = ()=>{ preview.style.display='block'; };
      input.oninput = ()=>{
        setPath(record, def.key, input.value.trim());
        markDirty();
        if(input.value.trim()){ preview.src = input.value.trim(); } else { preview.style.display='none'; }
      };
      container.append(input, preview);
      break;
    }
    case 'tags': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildTagsEditor(container, arr, ()=>markDirty());
      break;
    }
    case 'personnage-formes': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildTagsEditor(container, arr, ()=>markDirty());
      const syncBtn = document.createElement('button'); syncBtn.type='button'; syncBtn.className='btn-small';
      syncBtn.textContent = "Ajouter les formes des espèces";
      syncBtn.title = "Ajoute ici toutes les Formes déjà listées sur les Espèce(s) de ce personnage.";
      syncBtn.onclick = ()=>{
        const especeIds = record.especes || [];
        let added = 0;
        especeIds.forEach(id=>{
          const esp = world.especes[id];
          if(!esp || !esp.attributs) return;
          (esp.attributs.formes||[]).forEach(f=>{ if(!arr.includes(f)){ arr.push(f); added++; } });
        });
        if(added===0){ alert("Rien à ajouter : les espèces de ce personnage n'ont aucune forme listée (ou elles y sont déjà toutes)."); return; }
        markDirty();
        renderDetail();
      };
      container.appendChild(syncBtn);
      break;
    }
    case 'narrative-list': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildNarrativeListEditor(container, arr, ()=>markDirty());
      break;
    }
    case 'int-list': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildIntListEditor(container, arr, def.min, def.max, ()=>markDirty());
      break;
    }
    case 'ref': {
      const input = makeRefInput(def.sources, val0||'', v=>{
        const id = v ? resolveOrCreateRef(v, def.sources) : null;
        setPath(record, def.key, id);
        markDirty();
      }, def.excludeFlag);
      if(def.nullable){
        const clearBtn = document.createElement('button'); clearBtn.type='button'; clearBtn.className='btn-small'; clearBtn.textContent='Effacer';
        clearBtn.onclick = ()=>{ input.value=''; setPath(record, def.key, null); markDirty(); };
        const row = document.createElement('div'); row.className='ref-row'; row.append(input, clearBtn);
        container.appendChild(row);
      } else container.appendChild(input);
      break;
    }
    case 'ref-list': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildRefList(container, arr, def.sources, ()=>markDirty(), def.excludeFlag);
      break;
    }
    case 'timeline': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildTimeline(container, arr, ()=>markDirty());
      break;
    }
    case 'roles': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildRoles(container, arr, ()=>markDirty());
      break;
    }
    case 'alignements': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildAlignements(container, arr, ()=>markDirty());
      break;
    }
    case 'membres': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildMembres(container, arr, def.sources, ()=>markDirty());
      break;
    }
    case 'tuepar': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildTuePar(container, arr, ()=>markDirty());
      break;
    }
    case 'affecte': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildAffecte(container, arr, ()=>markDirty());
      break;
    }
    case 'description': {
      let obj = val0;
      if(!obj){ obj={}; setPath(record, def.key, obj); }
      def.fields.forEach(([fk,flabel])=>{
        const wrap = document.createElement('div'); wrap.className='subfield';
        const lab = document.createElement('label'); lab.textContent=flabel;
        const ta = document.createElement('textarea'); ta.rows=3; ta.value = obj[fk]||'';
        ta.oninput = ()=>{ obj[fk]=ta.value; markDirty(); };
        ta.addEventListener('input', ()=>autoGrowTextarea(ta));
        attachWikiLinkAutocomplete(ta);
        wrap.append(lab, ta);
        container.appendChild(wrap);
      });
      break;
    }
    case 'habitants': {
      buildHabitants(container, record, ()=>markDirty());
      break;
    }
    case 'espece-orgs': {
      const arr = val0 || (()=>{ const a=[]; setPath(record,def.key,a); return a; })();
      buildEspeceOrgs(container, arr, ()=>markDirty());
      break;
    }
    case 'date': {
      buildDateEditor(container, record, ()=>markDirty());
      break;
    }
  }
}

/* =========================================================
   WIDGETS REUTILISABLES
   ========================================================= */
function buildTagsEditor(container, arr, onChange){
  const wrap = document.createElement('div'); wrap.className='chip-row';
  function render(){
    wrap.innerHTML='';
    arr.forEach((v,idx)=>{
      const chip=document.createElement('span'); chip.className='chip';
      const span=document.createElement('span'); span.textContent=v;
      const rm=document.createElement('button'); rm.type='button'; rm.className='chip-remove'; rm.textContent='×';
      rm.onclick=()=>{ arr.splice(idx,1); onChange(); render(); };
      chip.append(span, rm);
      wrap.appendChild(chip);
    });
  }
  render();
  const addRow=document.createElement('div'); addRow.className='add-row';
  const input=document.createElement('input'); input.type='text'; input.placeholder='Ajouter…';
  input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); commit(); } });
  const btn=document.createElement('button'); btn.type='button'; btn.className='btn-small'; btn.textContent='Ajouter';
  btn.onclick=commit;
  function commit(){ const v=input.value.trim(); if(!v) return; arr.push(v); input.value=''; onChange(); render(); }
  addRow.append(input, btn);
  container.append(wrap, addRow);
}
/* Liste de textes narratifs (anecdotes...) : chaque entrée est un petit texte multi-lignes,
   pas un mot-clé — donc des zones de texte, pas des puces. */
function buildNarrativeListEditor(container, arr, onChange){
  const list = document.createElement('div'); list.className='narrative-list-edit';
  function render(){
    list.innerHTML='';
    arr.forEach((v,idx)=>{
      const row = document.createElement('div'); row.className='narrative-item';
      const taWrap = document.createElement('div'); taWrap.style.flex='1';
      const ta = document.createElement('textarea'); ta.rows=2; ta.value=v; ta.style.width='100%';
      ta.oninput = ()=>{ arr[idx]=ta.value; onChange(); };
      ta.addEventListener('input', ()=>autoGrowTextarea(ta));
      taWrap.appendChild(ta);
      attachWikiLinkAutocomplete(ta);
      const rm = document.createElement('button'); rm.type='button'; rm.className='btn-small btn-danger'; rm.textContent='Supprimer';
      rm.onclick = ()=>{ arr.splice(idx,1); onChange(); render(); };
      row.append(taWrap, rm);
      list.appendChild(row);
    });
  }
  render();
  const addBtn = document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Ajouter';
  addBtn.onclick = ()=>{ arr.push(''); onChange(); render(); };
  container.append(list, addBtn);
}

function buildIntListEditor(container, arr, min, max, onChange){
  const wrap=document.createElement('div'); wrap.className='chip-row';
  function render(){
    wrap.innerHTML='';
    arr.forEach((v,idx)=>{
      const chip=document.createElement('span'); chip.className='chip';
      const span=document.createElement('span'); span.textContent=v;
      const rm=document.createElement('button'); rm.type='button'; rm.className='chip-remove'; rm.textContent='×';
      rm.onclick=()=>{ arr.splice(idx,1); onChange(); render(); };
      chip.append(span, rm);
      wrap.appendChild(chip);
    });
  }
  render();
  const addRow=document.createElement('div'); addRow.className='add-row';
  const input=document.createElement('input'); input.type='number';
  if(min!==undefined) input.min=min;
  if(max!==undefined) input.max=max;
  const btn=document.createElement('button'); btn.type='button'; btn.className='btn-small'; btn.textContent='Ajouter';
  btn.onclick=()=>{ if(input.value==='') return; const n=Number(input.value); if(!arr.includes(n)) arr.push(n); input.value=''; onChange(); render(); };
  addRow.append(input, btn);
  container.append(wrap, addRow);
}

function ensureDatalist(sources, excludeFlag){
  const key = 'dl_'+sources.join('_')+(excludeFlag? '_no-'+excludeFlag : '');
  let dl = document.getElementById(key);
  if(dl) return key;
  dl = document.createElement('datalist'); dl.id=key; dl.classList.add('dyn-datalist');
  sources.forEach(src=>{
    const coll = world[src]||{};
    Object.keys(coll).sort().forEach(id=>{
      const r = coll[id];
      if(excludeFlag && r[excludeFlag]) return;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = (r.nom? r.nom+' - ':'') + id;
      dl.appendChild(opt);
    });
  });
  document.body.appendChild(dl);
  return key;
}
function makeRefInput(sources, value, onPick, excludeFlag){
  const domId = ensureDatalist(sources, excludeFlag);
  const input = document.createElement('input');
  input.type='text'; input.className='ref-input'; input.setAttribute('list', domId);
  input.value = value||''; input.placeholder='ID ou nom…';
  input.addEventListener('change', ()=> onPick(input.value.trim()));
  return input;
}

function buildRefList(container, arr, sources, onChange, excludeFlag){
  const wrap=document.createElement('div'); wrap.className='chip-row';
  function render(){
    wrap.innerHTML='';
    arr.forEach((id,idx)=>{
      const chip=document.createElement('span'); chip.className='chip';
      const span=document.createElement('span'); span.textContent=resolveLabel(id);
      const small=document.createElement('span'); small.className='chip-id'; small.textContent=id;
      const rm=document.createElement('button'); rm.type='button'; rm.className='chip-remove'; rm.textContent='×';
      rm.onclick=()=>{ arr.splice(idx,1); onChange(); render(); };
      chip.append(span, small, rm);
      wrap.appendChild(chip);
    });
  }
  render();
  const addRow=document.createElement('div'); addRow.className='add-row';
  const input = makeRefInput(sources, '', ()=>{}, excludeFlag);
  const btn=document.createElement('button'); btn.type='button'; btn.className='btn-small'; btn.textContent='Ajouter';
  btn.onclick=()=>{
    const v = input.value.trim(); if(!v) return;
    const id = resolveOrCreateRef(v, sources);
    if(!id){ input.classList.add('invalid'); setTimeout(()=>input.classList.remove('invalid'),900); return; }
    const rec = sources.map(s=>(world[s]||{})[id]).find(Boolean);
    if(excludeFlag && rec && rec[excludeFlag]){
      input.classList.add('invalid'); setTimeout(()=>input.classList.remove('invalid'),900); return;
    }
    if(!arr.includes(id)) arr.push(id);
    input.value=''; onChange(); render();
  };
  addRow.append(input, btn);
  container.append(wrap, addRow);
}

function buildTimeline(container, arr, onChange){
  const list=document.createElement('div'); list.className='timeline-list';
  function render(){
    list.innerHTML='';
    arr.forEach((pair,idx)=>{
      const row=document.createElement('div'); row.className='timeline-row';
      const debutInput = makeRefInput(['events'], pair.debut||'', v=>{
        pair.debut = resolveOrCreateRef(v, ['events']) || v; onChange();
      });
      const finInput = makeRefInput(['events'], pair.fin||'', v=>{
        if(!v){ pair.fin=null; } else { pair.fin = resolveOrCreateRef(v,['events']) || v; }
        onChange();
      });
      finInput.placeholder='(en cours si vide)';
      const rm=document.createElement('button'); rm.type='button'; rm.className='btn-small btn-danger'; rm.textContent='Supprimer';
      rm.onclick=()=>{ arr.splice(idx,1); onChange(); render(); };
      row.append(labelSpan('Début'), debutInput, labelSpan('Fin'), finInput, rm);
      list.appendChild(row);
    });
  }
  render();
  const addBtn=document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Ajouter une période';
  addBtn.onclick=()=>{ arr.push({debut:'', fin:null}); onChange(); render(); };
  container.append(list, addBtn);
}

function buildRoles(container, arr, onChange){
  const list=document.createElement('div');
  function render(){
    list.innerHTML='';
    arr.forEach((role,idx)=>{
      role.timeline = role.timeline || [];
      const box=document.createElement('div'); box.className='sub-box';
      const nomInput=document.createElement('input'); nomInput.type='text'; nomInput.placeholder='Nom du rôle'; nomInput.value=role.nom||'';
      nomInput.oninput=()=>{ role.nom=nomInput.value; onChange(); };
      const lieuInput = makeRefInput(['lieux','regions'], role.lieu||'', v=>{ role.lieu = resolveOrCreateRef(v,['lieux','regions']) || v; onChange(); });
      const rm=document.createElement('button'); rm.type='button'; rm.className='btn-small btn-danger'; rm.textContent='Supprimer ce rôle';
      rm.onclick=()=>{ arr.splice(idx,1); onChange(); render(); };
      const rowTop=document.createElement('div'); rowTop.className='sub-row';
      rowTop.append(labelSpan('Rôle'), nomInput, labelSpan('Lieu'), lieuInput, rm);
      box.appendChild(rowTop);
      buildTimeline(box, role.timeline, onChange);
      list.appendChild(box);
    });
  }
  render();
  const addBtn=document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Ajouter un rôle';
  addBtn.onclick=()=>{ arr.push({nom:'', lieu:'', timeline:[]}); onChange(); render(); };
  container.append(list, addBtn);
}

function buildAlignements(container, arr, onChange){
  const list=document.createElement('div');
  function render(){
    list.innerHTML='';
    arr.forEach((al,idx)=>{
      al.timeline = al.timeline || [];
      const box=document.createElement('div'); box.className='sub-box';
      const input = makeRefInput(['alignements'], al.alignement||'', v=>{
        al.alignement = v ? (resolveOrCreateRef(v, ['alignements'])||v) : null;
        onChange();
      });
      const rm=document.createElement('button'); rm.type='button'; rm.className='btn-small btn-danger'; rm.textContent='Supprimer';
      rm.onclick=()=>{ arr.splice(idx,1); onChange(); render(); };
      const rowTop=document.createElement('div'); rowTop.className='sub-row';
      rowTop.append(labelSpan('Alignement'), input, rm);
      box.appendChild(rowTop);
      buildTimeline(box, al.timeline, onChange);
      list.appendChild(box);
    });
  }
  render();
  const addBtn=document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Ajouter un alignement';
  addBtn.onclick=()=>{ arr.push({alignement:'', timeline:[]}); onChange(); render(); };
  container.append(list, addBtn);
}

function buildMembres(container, arr, sources, onChange){
  const list=document.createElement('div');
  function render(){
    list.innerHTML='';
    arr.forEach((m,idx)=>{
      m.timeline = m.timeline || [];
      const box=document.createElement('div'); box.className='sub-box';
      const idInput = makeRefInput(sources, m.id||'', v=>{ m.id = resolveOrCreateRef(v,sources) || v; onChange(); });
      const rm=document.createElement('button'); rm.type='button'; rm.className='btn-small btn-danger'; rm.textContent='Supprimer';
      rm.onclick=()=>{ arr.splice(idx,1); onChange(); render(); };
      const rowTop=document.createElement('div'); rowTop.className='sub-row';
      rowTop.append(labelSpan('Membre'), idInput, rm);
      box.appendChild(rowTop);
      buildTimeline(box, m.timeline, onChange);
      list.appendChild(box);
    });
  }
  render();
  const addBtn=document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Ajouter un membre';
  addBtn.onclick=()=>{ arr.push({id:'', timeline:[]}); onChange(); render(); };
  container.append(list, addBtn);
}

function buildTuePar(container, arr, onChange){
  const list=document.createElement('div');
  function render(){
    list.innerHTML='';
    arr.forEach((t,idx)=>{
      const row=document.createElement('div'); row.className='timeline-row';
      const perInput = makeRefInput(['personnages'], t.personnage||'', v=>{ t.personnage = resolveOrCreateRef(v,['personnages']) || v; onChange(); });
      const evtInput = makeRefInput(['events'], t.evenement||'', v=>{ t.evenement = resolveOrCreateRef(v,['events']) || v; onChange(); });
      const rm=document.createElement('button'); rm.type='button'; rm.className='btn-small btn-danger'; rm.textContent='Supprimer';
      rm.onclick=()=>{ arr.splice(idx,1); onChange(); render(); };
      row.append(labelSpan('Tueur'), perInput, labelSpan('Événement'), evtInput, rm);
      list.appendChild(row);
    });
  }
  render();
  const addBtn=document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Ajouter un tueur';
  addBtn.onclick=()=>{ arr.push({personnage:'', evenement:''}); onChange(); render(); };
  container.append(list, addBtn);
}

function buildAffecte(container, arr, onChange){
  const list=document.createElement('div');
  function render(){
    list.innerHTML='';
    arr.forEach((item,idx)=>{
      const row=document.createElement('div'); row.className='timeline-row';
      const typeSel=document.createElement('select');
      REF_TYPE_OPTIONS.forEach(t=>{ const o=document.createElement('option'); o.value=t.value; o.textContent=t.label; if(t.value===item.type) o.selected=true; typeSel.appendChild(o); });
      typeSel.onchange=()=>{ item.type=typeSel.value; item.id=''; onChange(); render(); };
      const src = TYPE_TO_COLLECTION[item.type] || 'personnages';
      const idInput = makeRefInput([src], item.id||'', v=>{ item.id = resolveOrCreateRef(v,[src]) || v; onChange(); });
      const rm=document.createElement('button'); rm.type='button'; rm.className='btn-small btn-danger'; rm.textContent='×';
      rm.onclick=()=>{ arr.splice(idx,1); onChange(); render(); };
      row.append(typeSel, idInput, rm);
      list.appendChild(row);
    });
  }
  render();
  const addBtn=document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Ajouter une entité affectée';
  addBtn.onclick=()=>{ arr.push({type:'personnage', id:''}); onChange(); render(); };
  container.append(list, addBtn);
}

function recalcHabitants(lieuId){
  const out=[];
  Object.values(world.personnages||{}).forEach(p=>{
    (p.roles||[]).forEach(r=>{
      if(r.lieu===lieuId) out.push({personnage:p.id, role:r.nom, timeline:r.timeline||[]});
    });
  });
  return out;
}
function buildHabitants(container, record, onChange){
  const info=document.createElement('p'); info.className='field-hint';
  info.textContent = (record.habitants&&record.habitants.length) ? (record.habitants.length+' habitant(s) répertorié(s).') : 'Aucun habitant calculé pour le moment.';
  const list=document.createElement('ul'); list.className='readonly-list';
  (record.habitants||[]).forEach(h=>{
    const li=document.createElement('li');
    li.textContent = resolveLabel(h.personnage)+' - '+(h.role||'');
    list.appendChild(li);
  });
  const btn=document.createElement('button'); btn.type='button'; btn.className='btn-small'; btn.textContent='Recalculer depuis les rôles';
  btn.onclick=()=>{ record.habitants = recalcHabitants(record.id); onChange(); renderDetail(); };
  container.append(info, list, btn);
}

/* Espece.organisations : n-uplet (Type d'organisation, Source, Timeline) au lieu d'une simple liste de périodes. */
function buildEspeceOrgs(container, arr, onChange){
  const list=document.createElement('div');
  function render(){
    list.innerHTML='';
    arr.forEach((o,idx)=>{
      o.timeline = o.timeline || [];
      if(typeof o.source==='string') o.source = { type:'groupe', id:o.source };
      if(!o.source || typeof o.source!=='object') o.source = { type:'groupe', id:'' };
      const box=document.createElement('div'); box.className='sub-box';
      const typeInput=document.createElement('input'); typeInput.type='text'; typeInput.placeholder="Type d'organisation (solitaire, meute, ruche…)"; typeInput.value=o.type_organisation||'';
      typeInput.oninput=()=>{ o.type_organisation=typeInput.value; onChange(); };
      const sourceTypeSel=document.createElement('select');
      REF_TYPE_OPTIONS.forEach(t=>{ const opt=document.createElement('option'); opt.value=t.value; opt.textContent=t.label; if(t.value===o.source.type) opt.selected=true; sourceTypeSel.appendChild(opt); });
      sourceTypeSel.onchange=()=>{ o.source.type=sourceTypeSel.value; o.source.id=''; onChange(); render(); };
      const srcColl = TYPE_TO_COLLECTION[o.source.type] || 'groupes';
      const sourceInput = makeRefInput([srcColl], o.source.id||'', v=>{
        o.source.id = v ? (resolveOrCreateRef(v, [srcColl]) || v) : '';
        onChange();
      });
      const rm=document.createElement('button'); rm.type='button'; rm.className='btn-small btn-danger'; rm.textContent='Supprimer';
      rm.onclick=()=>{ arr.splice(idx,1); onChange(); render(); };
      const rowTop=document.createElement('div'); rowTop.className='sub-row';
      rowTop.append(labelSpan("Type d'organisation"), typeInput, labelSpan('Source'), sourceTypeSel, sourceInput, rm);
      box.appendChild(rowTop);
      buildTimeline(box, o.timeline, onChange);
      list.appendChild(box);
    });
  }
  render();
  const addBtn=document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Ajouter un mode d\u2019organisation';
  addBtn.onclick=()=>{ arr.push({type_organisation:'', source:{type:'groupe', id:''}, timeline:[]}); onChange(); render(); };
  container.append(list, addBtn);
}

function buildDateEditor(container, record, onChange){
  record.date = record.date || {L:'?', l:'?'};
  const wrap=document.createElement('div'); wrap.className='date-editor';
  const optionsL = ['1','2','3','4','5','6','7','8','9','10','11','12','?','X'];
  const optionsl = ['0','1','2','3','4','5','6','7','8','9','10','11','12','?','X'];
  const Lsel=document.createElement('select');
  optionsL.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; Lsel.appendChild(o); });
  const lsel=document.createElement('select');
  optionsl.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; lsel.appendChild(o); });
  Lsel.value = String(record.date.L);
  lsel.value = String(record.date.l);
  const warn=document.createElement('div'); warn.className='field-warning';
  function parseVal(v){ return (v==='?'||v==='X') ? v : parseInt(v,10); }
  function validate(){
    const L=Lsel.value, l=lsel.value;
    let msg='';
    if((L==='X') !== (l==='X')) msg='X doit toujours être en paire (X.X).';
    else if(l==='0' && L!=='1') msg="l = 0 n'est autorisé que si L = 1 (date « 1.0 »).";
    warn.textContent = msg;
    warn.style.display = msg ? 'block' : 'none';
  }
  Lsel.onchange = ()=>{ record.date.L = parseVal(Lsel.value); validate(); onChange(); };
  lsel.onchange = ()=>{ record.date.l = parseVal(lsel.value); validate(); onChange(); };
  validate();
  wrap.append(labelSpan('L'), Lsel, labelSpan('.'), lsel);
  container.append(wrap, warn);
}

/* =========================================================
   CREATION / SUPPRESSION
   ========================================================= */
function openCreateModal(type){
  if(type==='regions'){ openRegionCreateModal(); return; }
  const content=document.createElement('div');
  const h=document.createElement('h3'); h.textContent='Nouveau '+TYPE_META[type].singular;
  const row=document.createElement('div'); row.className='modal-row';
  const input=document.createElement('input'); input.type='text'; input.placeholder='Nom';
  row.append(labelSpan('Nom'), input);
  const actions=document.createElement('div'); actions.className='modal-actions';
  const cancel=document.createElement('button'); cancel.textContent='Annuler'; cancel.onclick=closeModal;
  const ok=document.createElement('button'); ok.className='btn-primary'; ok.textContent='Créer';
  ok.onclick=()=>{
    const nom=input.value.trim();
    if(!nom){ input.classList.add('invalid'); return; }
    const id=generateId(type, world[type]);
    const rec={id, nom};
    ensureRecordDefaults(type,id,rec);
    world[type][id]=rec;
    attachGenesisEvent(type, rec);
    markDirty(); currentType=type; currentId=id; detailMode='edit'; closeModal();
    renderSidebar(); renderList(); renderDetail();
  };
  input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); ok.click(); } });
  actions.append(cancel, ok);
  content.append(h,row,actions);
  showModal(content);
  input.focus();
}

/* Génère toutes les régions de la grille A1 à I14 (126 cases). Ne touche pas aux régions existantes. */
function generateFullRegionGrid(){
  const missing = [];
  'ABCDEFGHIJ'.split('').forEach(letter=>{
    for(let n=1;n<=14;n++){ const id=letter+n; if(!world.regions[id]) missing.push(id); }
  });
  if(missing.length===0){ alert('Les 140 régions de la grille existent déjà.'); return; }
  if(!confirm(missing.length+' région(s) manquante(s) sur la grille A1–J14 vont être créées. Continuer ?')) return;
  missing.forEach(id=>{
    const rec = { id, nom:id, abs:id[0], ord:parseInt(id.slice(1),10) };
    ensureRecordDefaults('regions', id, rec);
    world.regions[id] = rec;
  });
  markDirty();
  renderSidebar(); renderList(); renderDetail();
}
/* Génère un Event marquant vide pour chaque date de 1.1 à 8.12 (L de 1 à 8, l de 1 à 12) qui n'en a
   pas déjà un — sert de trame chronologique à compléter ensuite, comme la grille de régions. */
function generateMarquantEventsGrid(){
  const missing = [];
  for(let L=1; L<=8; L++){
    for(let l=1; l<=12; l++){
      const exists = Object.values(world.events).some(e=> e.marquant && e.date && e.date.L===L && e.date.l===l);
      if(!exists) missing.push({L,l});
    }
  }
  if(missing.length===0){ alert('Tous les événements marquants de 1.1 à 8.12 existent déjà.'); return; }
  if(!confirm(missing.length+" événement(s) marquant(s) manquant(s) entre 1.1 et 8.12 vont être créés (vides, à compléter). Continuer ?")) return;
  missing.forEach(({L,l})=>{
    const id = generateId('events', world.events);
    const rec = { id, date:{L,l}, nom:'Événement marquant '+L+'.'+l, ordre:1, marquant:true, lieu:null, characters:[], tags:[], anecdotes:[], sections:[] };
    world.events[id] = rec;
  });
  markDirty();
  renderSidebar(); renderList(); renderDetail();
}
function openRegionCreateModal(){
  const content=document.createElement('div');
  content.innerHTML='<h3>Nouvelle région</h3>';
  const modeRow=document.createElement('div'); modeRow.className='modal-row';
  const modeSel=document.createElement('select');
  [['coord','Coordonnée (lettre + numéro)'],['XX','Hors du monde (XX)'],['??','Position inconnue (??)']].forEach(([v,l])=>{
    const o=document.createElement('option'); o.value=v; o.textContent=l; modeSel.appendChild(o);
  });
  modeRow.append(labelSpan('Type'), modeSel);
  const coordRow=document.createElement('div'); coordRow.className='modal-row';
  const absSel=document.createElement('select');
  'ABCDEFGHIJ'.split('').forEach(l=>{ const o=document.createElement('option'); o.value=l; o.textContent=l; absSel.appendChild(o); });
  const ordInput=document.createElement('input'); ordInput.type='number'; ordInput.min=1; ordInput.max=14; ordInput.value=1;
  coordRow.append(labelSpan('Lettre'), absSel, labelSpan('Nombre'), ordInput);
  const nomRow=document.createElement('div'); nomRow.className='modal-row';
  const nomInput=document.createElement('input'); nomInput.type='text'; nomInput.placeholder='Nom (par défaut : les coordonnées, ex. A1)';
  nomRow.append(labelSpan('Nom'), nomInput);
  modeSel.onchange=()=>{ coordRow.style.display = modeSel.value==='coord' ? 'flex':'none'; };
  content.append(modeRow, coordRow, nomRow);
  const actions=document.createElement('div'); actions.className='modal-actions';
  const cancel=document.createElement('button'); cancel.textContent='Annuler'; cancel.onclick=closeModal;
  const ok=document.createElement('button'); ok.className='btn-primary'; ok.textContent='Créer';
  ok.onclick=()=>{
    let id;
    if(modeSel.value==='coord') id = absSel.value+ordInput.value;
    else id = modeSel.value;
    if(world.regions[id]){ alert('Cette région existe déjà : '+id); return; }
    const rec={ id, abs: modeSel.value==='coord'?absSel.value:modeSel.value, ord: modeSel.value==='coord'?Number(ordInput.value):undefined, nom: nomInput.value.trim() || id };
    ensureRecordDefaults('regions', id, rec);
    world.regions[id]=rec;
    markDirty(); currentType='regions'; currentId=id; detailMode='edit'; closeModal();
    renderSidebar(); renderList(); renderDetail();
  };
  actions.append(cancel, ok);
  content.appendChild(actions);
  showModal(content);
}

function countReferences(type,id){
  const record = world[type][id];
  const self = JSON.stringify(record);
  const all = JSON.stringify(world);
  const rx = new RegExp(escapeRegex(id),'g');
  const total = (all.match(rx)||[]).length;
  const selfCount = (self.match(rx)||[]).length;
  return Math.max(0, total-selfCount);
}
function confirmDelete(type,id){
  const count = countReferences(type,id);
  const content=document.createElement('div');
  const h=document.createElement('h3'); h.textContent = 'Supprimer « '+(world[type][id].nom||id)+' » ?';
  content.appendChild(h);
  const p=document.createElement('p');
  p.textContent = count>0
    ? (count+" référence(s) à cet id trouvée(s) ailleurs dans le monde. Elles ne seront pas mises à jour automatiquement.")
    : "Aucune référence trouvée ailleurs.";
  content.appendChild(p);
  const actions=document.createElement('div'); actions.className='modal-actions';
  const cancel=document.createElement('button'); cancel.textContent='Annuler'; cancel.onclick=closeModal;
  const del=document.createElement('button'); del.className='btn-danger'; del.textContent='Supprimer définitivement';
  del.onclick=()=>{
    delete world[type][id];
    if(currentId===id) currentId=null;
    markDirty(); closeModal();
    renderSidebar(); renderList(); renderDetail();
  };
  actions.append(cancel, del);
  content.appendChild(actions);
  showModal(content);
}

/* =========================================================
   INTEGRITE
   ========================================================= */
function collectRefs(type, record){
  const refs=[];
  const spec = FORM_SPEC[type]||[];
  spec.forEach(def=>{
    const val = getPath(record, def.key);
    switch(def.kind){
      case 'ref': if(val) refs.push({value:val, sources:def.sources}); break;
      case 'ref-list': (val||[]).forEach(v=>refs.push({value:v, sources:def.sources})); break;
      case 'timeline':
        (val||[]).forEach(p=>{
          if(p.debut) refs.push({value:p.debut, sources:['events']});
          if(p.fin) refs.push({value:p.fin, sources:['events']});
        });
        break;
      case 'roles':
        (val||[]).forEach(r=>{
          if(r.lieu) refs.push({value:r.lieu, sources:['lieux','regions']});
          (r.timeline||[]).forEach(p=>{
            if(p.debut) refs.push({value:p.debut, sources:['events']});
            if(p.fin) refs.push({value:p.fin, sources:['events']});
          });
        });
        break;
      case 'alignements':
        (val||[]).forEach(a=>{
          if(a.alignement) refs.push({value:a.alignement, sources:['alignements']});
          (a.timeline||[]).forEach(p=>{
            if(p.debut) refs.push({value:p.debut, sources:['events']});
            if(p.fin) refs.push({value:p.fin, sources:['events']});
          });
        });
        break;
      case 'membres':
        (val||[]).forEach(m=>{
          if(m.id) refs.push({value:m.id, sources:def.sources});
          (m.timeline||[]).forEach(p=>{
            if(p.debut) refs.push({value:p.debut, sources:['events']});
            if(p.fin) refs.push({value:p.fin, sources:['events']});
          });
        });
        break;
      case 'tuepar':
        (val||[]).forEach(t=>{
          if(t.personnage) refs.push({value:t.personnage, sources:['personnages']});
          if(t.evenement) refs.push({value:t.evenement, sources:['events']});
        });
        break;
      case 'affecte':
        (val||[]).forEach(a=>{
          if(a.id){ const coll=TYPE_TO_COLLECTION[a.type]; if(coll) refs.push({value:a.id, sources:[coll]}); }
        });
        break;
      case 'espece-orgs':
        (val||[]).forEach(o=>{
          const srcId = o.source && typeof o.source==='object' ? o.source.id : o.source;
          const srcType = o.source && typeof o.source==='object' ? o.source.type : 'groupe';
          if(srcId){ const coll = TYPE_TO_COLLECTION[srcType]||'groupes'; refs.push({value:srcId, sources:[coll]}); }
          (o.timeline||[]).forEach(p=>{
            if(p.debut) refs.push({value:p.debut, sources:['events']});
            if(p.fin) refs.push({value:p.fin, sources:['events']});
          });
        });
        break;
      default: break;
    }
  });
  return refs;
}
function runIntegrityCheck(){
  const validIds = new Set();
  TYPE_ORDER.forEach(t=>{ Object.keys(world[t]||{}).forEach(id=>validIds.add(id)); });
  const issues=[];
  TYPE_ORDER.forEach(t=>{
    Object.values(world[t]||{}).forEach(record=>{
      collectRefs(t, record).forEach(ref=>{
        if(ref.value && !validIds.has(ref.value)){
          issues.push({type:t, id:record.id, message:'Référence introuvable : "'+ref.value+'"'});
        }
      });
      if(t!=='events' && t!=='regions'){
        (record.timeline||[]).forEach((p,idx)=>{
          if(!p.debut) issues.push({type:t, id:record.id, message:'Période #'+(idx+1)+' sans début.'});
        });
      }
      if(t==='especes'){
        (record.organisations||[]).forEach((o,oi)=>{
          (o.timeline||[]).forEach((p,idx)=>{
            if(!p.debut) issues.push({type:t, id:record.id, message:'Organisation #'+(oi+1)+', période #'+(idx+1)+' sans début.'});
          });
        });
      }
      if(t==='events'){
        const d = record.date || {};
        if(d.L==='?' || d.l==='?'){
          issues.push({type:t, id:record.id, message:"Date incomplète ou inconnue (« "+(d.L!==undefined?d.L:'?')+'.'+(d.l!==undefined?d.l:'?')+" »)."});
        }
      }
    });
  });
  showIntegrityModal(issues);
}
function showIntegrityModal(issues){
  const content=document.createElement('div');
  const h=document.createElement('h3'); h.textContent="Vérification d'intégrité";
  content.appendChild(h);
  if(issues.length===0){
    const p=document.createElement('p'); p.textContent='Aucun problème détecté.'; content.appendChild(p);
  } else {
    const p=document.createElement('p'); p.textContent=issues.length+' problème(s) détecté(s) :'; content.appendChild(p);
    const list=document.createElement('ul'); list.className='issue-list';
    issues.forEach(is=>{
      const li=document.createElement('li');
      const btn=document.createElement('button'); btn.className='link-btn';
      btn.textContent = '['+TYPE_META[is.type].singular+'] '+resolveLabel(is.id)+' ('+is.id+') - '+is.message;
      btn.onclick=()=>{ currentType=is.type; currentId=is.id; detailMode='edit'; closeModal(); renderSidebar(); renderList(); renderDetail(); };
      li.appendChild(btn);
      list.appendChild(li);
    });
    content.appendChild(list);
  }
  const actions=document.createElement('div'); actions.className='modal-actions';
  const close=document.createElement('button'); close.textContent='Fermer'; close.onclick=closeModal;
  actions.appendChild(close);
  content.appendChild(actions);
  showModal(content);
}

/* =========================================================
   MODALE GENERIQUE
   ========================================================= */
function showModal(contentEl){
  const overlay=document.createElement('div'); overlay.className='modal-overlay'; overlay.id='modalOverlay';
  const box=document.createElement('div'); box.className='modal-box';
  box.appendChild(contentEl);
  overlay.appendChild(box);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  document.body.appendChild(overlay);
}
function closeModal(){ const o=document.getElementById('modalOverlay'); if(o) o.remove(); }

/* =========================================================
   STATUT / DIRTY
   ========================================================= */
function markDirty(){ dirty=true; updateStatus(); }
function updateStatus(){
  document.getElementById('fileStatus').textContent = (currentFilename||'monde.json') + (dirty? ' • modifications non enregistrées' : ' • à jour');
}

/* =========================================================
   CHARGEMENT / ENREGISTREMENT
   ========================================================= */
function loadFileObject(f){
  readJsonFile(f).then(data=>{
    world = normalizeWorld(data);
    currentFilename = f.name;
    currentType='__home__'; currentId=null; detailMode='view'; listSearchTerm=''; dirty=false;
    updateStatus(); renderSidebar(); renderList(); renderDetail();
  }).catch(err=>{
    alert('Fichier JSON invalide : '+err.message);
  });
}
//document.getElementById('btnLoad').onclick = ()=> document.getElementById('fileInput').click();
/*document.getElementById('fileInput').onchange = (e)=>{
  const f = e.target.files[0]; if(!f) return;
  loadFileObject(f);
  e.target.value='';
};*/

/* =========================================================
   INTÉGRATION GITHUB — charger/enregistrer le monde dans un dépôt
   (privé de préférence) via l'API Contents, directement depuis le navigateur.
   La mécanique bas niveau (fetch, base64, sha…) vit dans core/github.js ;
   ici on ne fait que relier ça à l'état et à l'affichage de la page.
   ========================================================= */
async function githubLoad(cfg, statusEl){
  statusEl.textContent = 'Chargement…'; statusEl.className='gh-status';
  try{
    const text = await githubLoadFile(cfg);
    const parsed = JSON.parse(text);
    world = normalizeWorld(parsed);
    currentFilename = cfg.path.split('/').pop();
    currentType='__home__'; currentId=null; detailMode='view'; listSearchTerm=''; dirty=false;
    updateStatus(); renderSidebar(); renderList(); renderDetail();
    saveGithubConfig(cfg);
    statusEl.textContent = 'Monde chargé depuis GitHub \u2713';
    statusEl.className = 'gh-status gh-status-ok';
  }catch(e){
    statusEl.textContent = 'Erreur : '+e.message;
    statusEl.className = 'gh-status gh-status-error';
  }
}
async function githubSave(cfg, statusEl){
  statusEl.textContent = 'Enregistrement…'; statusEl.className='gh-status';
  try{
    await githubSaveFile(cfg, JSON.stringify(world, null, 2));
    dirty = false; updateStatus();
    saveGithubConfig(cfg);
    statusEl.textContent = 'Enregistré sur GitHub \u2713';
    statusEl.className = 'gh-status gh-status-ok';
  }catch(e){
    statusEl.textContent = 'Erreur : '+e.message;
    statusEl.className = 'gh-status gh-status-error';
  }
}
function openGithubModal(){
  const cfg = getGithubConfig();
  const content = document.createElement('div');
  const h = document.createElement('h3'); h.textContent = 'GitHub';
  content.appendChild(h);
  const hint = document.createElement('p'); hint.className='field-hint';
  hint.textContent = "Utilise de préférence un token \u00abfine-grained\u00bb limité à ce seul dépôt, permission \u00abContents: Read and write\u00bb uniquement, avec une date d'expiration. Le token reste stocké seulement dans ce navigateur (localStorage).";
  content.appendChild(hint);

  function row(labelText, value, placeholder, type){
    const r = document.createElement('div'); r.className='modal-row';
    const lab = document.createElement('span'); lab.className='inline-label'; lab.style.minWidth='110px'; lab.textContent = labelText;
    const input = document.createElement('input'); input.type = type||'text'; input.value = value||''; input.placeholder = placeholder||'';
    r.append(lab, input);
    content.appendChild(r);
    return input;
  }
  const ownerRepoInput = row('Dépôt', cfg.ownerRepo, 'pseudo/nom-du-depot');
  const pathInput = row('Chemin du fichier', cfg.path || 'monde.json', 'monde.json');
  const branchInput = row('Branche', cfg.branch || 'main', 'main');
  const tokenInput = row('Token', cfg.token, 'ghp_… ou github_pat_…', 'password');

  const autosaveRow = document.createElement('div'); autosaveRow.className='modal-row';
  const autosaveLabel = document.createElement('label'); autosaveLabel.className='checkbox-label';
  const autosaveCheckbox = document.createElement('input'); autosaveCheckbox.type='checkbox';
  autosaveCheckbox.checked = cfg.autosave !== false; // activé par défaut dès qu'un dépôt est configuré
  autosaveLabel.append(autosaveCheckbox, document.createTextNode(' Auto-enregistrer sur GitHub toutes les 5 min s\'il y a des changements'));
  autosaveRow.appendChild(autosaveLabel);
  content.appendChild(autosaveRow);
  autosaveCheckbox.onchange = ()=>{ const c = readCfg(); saveGithubConfig(c); };

  const statusEl = document.createElement('p'); statusEl.className='gh-status';
  content.appendChild(statusEl);

  function readCfg(){
    return {
      ownerRepo: ownerRepoInput.value.trim().replace(/^\/+|\/+$/g,''),
      path: pathInput.value.trim().replace(/^\/+/,'') || 'monde.json',
      branch: branchInput.value.trim() || 'main',
      token: tokenInput.value.trim(),
      autosave: autosaveCheckbox.checked,
    };
  }
  function validate(c){
    if(!c.ownerRepo.includes('/')){ statusEl.textContent = 'Le dépôt doit être au format propriétaire/dépôt.'; statusEl.className='gh-status gh-status-error'; return false; }
    if(!c.token){ statusEl.textContent = 'Un token est nécessaire.'; statusEl.className='gh-status gh-status-error'; return false; }
    return true;
  }

  const actions = document.createElement('div'); actions.className='modal-actions';
  const forgetBtn = document.createElement('button'); forgetBtn.textContent = 'Oublier le token';
  forgetBtn.onclick = ()=>{ localStorage.removeItem(GITHUB_CONFIG_KEY); tokenInput.value=''; statusEl.textContent='Token oublié.'; statusEl.className='gh-status'; };
  const loadBtn = document.createElement('button'); loadBtn.className='btn-primary'; loadBtn.textContent = 'Charger depuis GitHub';
  loadBtn.onclick = ()=>{ const c=readCfg(); if(validate(c)) githubLoad(c, statusEl); };
  const saveBtn = document.createElement('button'); saveBtn.className='btn-primary'; saveBtn.textContent = 'Enregistrer sur GitHub';
  saveBtn.onclick = ()=>{ const c=readCfg(); if(validate(c)) githubSave(c, statusEl); };
  const closeBtn = document.createElement('button'); closeBtn.textContent = 'Fermer';
  closeBtn.onclick = closeModal;
  actions.append(forgetBtn, loadBtn, saveBtn, closeBtn);
  content.appendChild(actions);

  showModal(content);
}
document.getElementById('btnGithub').onclick = openGithubModal;

/* Auto-enregistrement : toutes les 5 minutes, si un dépôt GitHub est configuré, que l'auto-save
   n'a pas été désactivé, et qu'il y a des modifications en attente. */
const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;
function formatClockTime(d){
  const pad = n=>String(n).padStart(2,'0');
  return pad(d.getHours())+':'+pad(d.getMinutes());
}
async function tryAutosave(){
  const cfg = getGithubConfig();
  const indicator = document.getElementById('autosaveIndicator');
  if(!cfg.ownerRepo || !cfg.token || !cfg.path) return; // GitHub non configuré
  if(cfg.autosave === false) return; // désactivé explicitement
  if(!dirty) return; // rien à enregistrer
  await githubSave(cfg, indicator);
  if(!indicator.className.includes('gh-status-error')){
    indicator.textContent = 'Auto-enregistré sur GitHub à '+formatClockTime(new Date());
  }
}
setInterval(tryAutosave, AUTOSAVE_INTERVAL_MS);
/*document.getElementById('btnSave').onclick = ()=>{
  downloadJson(world, currentFilename || 'monde.json');
  dirty=false; updateStatus();
};*/
document.getElementById('btnNew').onclick = ()=>{
  if(!confirm('Créer un nouveau monde vide ? Les données non enregistrées seront perdues.')) return;
  world = emptyWorld(); currentFilename='monde.json'; currentType='__home__'; currentId=null; detailMode='view'; listSearchTerm=''; dirty=false;
  updateStatus(); renderSidebar(); renderList(); renderDetail();
};
document.getElementById('btnCheck').onclick = runIntegrityCheck;
document.getElementById('btnRandom').onclick = ()=>{
  const all=[];
  TYPE_ORDER.forEach(t=>{ Object.keys(world[t]||{}).forEach(id=>all.push([t,id])); });
  if(all.length===0){ alert('Aucune page existante.'); return; }
  const [t,id] = all[Math.floor(Math.random()*all.length)];
  currentType=t; currentId=id; detailMode='view';
  renderSidebar(); renderList(); renderDetail();
};

/* Recherche globale : cherche dans TOUT le contenu d'une fiche (tags, anecdotes, texte narratif,
   tout ce qui alimente l'infobox…) en comparant le texte brut de la fiche entière. */
function searchAllRecords(query){
  const q = query.trim().toLowerCase();
  if(!q) return [];
  const results = [];
  TYPE_ORDER.forEach(t=>{
    Object.values(world[t]||{}).forEach(r=>{
      const haystack = JSON.stringify(r).toLowerCase();
      if(haystack.includes(q)) results.push({ type:t, record:r });
    });
  });
  results.sort((a,b)=>{
    const an = (a.record.nom||'').toLowerCase(), bn = (b.record.nom||'').toLowerCase();
    const aStarts = an.startsWith(q), bStarts = bn.startsWith(q);
    if(aStarts!==bStarts) return aStarts ? -1 : 1;
    return an.localeCompare(bn,'fr');
  });
  return results.slice(0,20);
}
(function setupGlobalSearch(){
  const input = document.getElementById('globalSearch');
  const wrap = input.parentElement;
  let dropdown = null;
  function closeDropdown(){ if(dropdown){ dropdown.remove(); dropdown=null; } }
  function render(){
    const q = input.value;
    if(!q.trim()){ closeDropdown(); return; }
    const results = searchAllRecords(q);
    if(!dropdown){ dropdown = document.createElement('div'); dropdown.className='global-search-dropdown'; wrap.appendChild(dropdown); }
    dropdown.innerHTML = '';
    if(results.length===0){
      const empty = document.createElement('div'); empty.className='global-search-empty'; empty.textContent = 'Aucune fiche ne correspond à « '+q+' ».';
      dropdown.appendChild(empty);
      return;
    }
    results.forEach(({type, record})=>{
      const item = document.createElement('div'); item.className='global-search-item';
      const nameSpan = document.createElement('span'); nameSpan.textContent = record.nom || '(sans nom)';
      const typeSpan = document.createElement('span'); typeSpan.className='gs-type'; typeSpan.textContent = TYPE_META[type].singular;
      item.append(nameSpan, typeSpan);
      item.onmousedown = (e)=>{
        e.preventDefault();
        currentType = type; currentId = record.id; detailMode='view';
        renderSidebar(); renderList(); renderDetail();
        input.value=''; closeDropdown();
      };
      dropdown.appendChild(item);
    });
  }
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('keydown', e=>{ if(e.key==='Escape'){ input.blur(); closeDropdown(); } });
  input.addEventListener('blur', ()=> setTimeout(closeDropdown, 150));
})();

document.body.addEventListener('dragover', e=> e.preventDefault());
document.body.addEventListener('drop', e=>{
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if(f && f.name.toLowerCase().endsWith('.json')) loadFileObject(f);
});

/* =========================================================
   INIT
   ========================================================= */
renderSidebar();
renderList();
renderDetail();
updateStatus();
