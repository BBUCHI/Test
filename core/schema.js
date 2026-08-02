/* =========================================================
   core/schema.js
   Le modèle de données d'Atlas : types d'entités, formulaires,
   valeurs par défaut. Aucune dépendance au DOM ni à un état global —
   ce module est pur et réutilisable par n'importe quelle page.
   ========================================================= */

export const TYPE_ORDER = ['personnages','lieux','groupes','reliques','periodes','especes','cultures','materiaux','objets','alignements','regions','events'];

export const TYPE_META = {
  personnages:{ label:'Personnages', singular:'Personnage', prefix:'PER', icon:'☉' },
  lieux:      { label:'Lieux',       singular:'Lieu',       prefix:'LIEU', icon:'▲' },
  groupes:    { label:'Groupes',     singular:'Groupe',     prefix:'GRP', icon:'⚑' },
  reliques:   { label:'Reliques',    singular:'Relique',    prefix:'REL', icon:'✦' },
  periodes:   { label:'Périodes',    singular:'Période',    prefix:'PRD', icon:'◐' },
  especes:    { label:'Espèces',     singular:'Espèce',     prefix:'ESP', icon:'❦' },
  cultures:   { label:'Cultures',    singular:'Culture',    prefix:'CUL', icon:'⬡' },
  materiaux:  { label:'Matériaux',   singular:'Matériau',   prefix:'MAT', icon:'◆' },
  objets:     { label:'Objets',      singular:'Objet',      prefix:'OBJ', icon:'⚒' },
  alignements:{ label:'Alignements', singular:'Alignement', prefix:'ALI', icon:'⚖' },
  regions:    { label:'Régions',     singular:'Région',     prefix:null, icon:'◈' },
  events:     { label:'Événements',  singular:'Événement',  prefix:'EVT', icon:'●' },
};


export const TYPE_TO_COLLECTION = {
  personnage:'personnages', lieu:'lieux', groupe:'groupes', relique:'reliques', periode:'periodes',
  espece:'especes', culture:'cultures', materiau:'materiaux', objet:'objets', region:'regions', alignement:'alignements'
};

export const REF_TYPE_OPTIONS = Object.keys(TYPE_TO_COLLECTION).map(k=>({value:k, label:TYPE_META[TYPE_TO_COLLECTION[k]].singular}));

export const FORM_SPEC = {
  alignements: [], // entité basique : seulement un nom (+ id), rien d'autre à remplir
  events: [
    { key:'photo', label:'Photo', kind:'image', hint:"URL d'une image." },
    { key:'tags', label:'Tags', kind:'tags' },
    { key:'titres_honorifiques', label:'Titres honorifiques', kind:'tags' },
    { key:'date', label:'Date', kind:'date', compact:true },
    { key:'ordre', label:'Ordre', kind:'number', min:1, compact:true, hint:"Départage à date égale (ignoré si « marquant »)." },
    { key:'marquant', label:'Marquant', kind:'boolean', compact:true, checkboxLabel:'Passe en premier à date égale' },
    { key:'lieu', label:'Lieu', kind:'ref', sources:['lieux','regions'], nullable:true },
    { key:'characters', label:'Personnages impliqués', kind:'ref-list', sources:['personnages'] },
    { key:'resume', label:'Résumé', kind:'lead', hint:"2 à 5 phrases qui présentent le sujet — affichées juste au-dessus des sections narratives (Description, etc.), pas au-dessus des faits ci-dessus." },
    { key:'anecdotes', label:'Anecdotes', kind:'narrative-list' },
  ],
  personnages: [
    { key:'attributs.photo', label:'Photo', kind:'image', hint:"URL d'une image (portrait)." },
    { key:'attributs.tags', label:'Tags', kind:'tags' },
    { key:'attributs.titres_honorifiques', label:'Titres honorifiques', kind:'tags' },
    { key:'genre', label:'Genre', kind:'select', options:['Homme','Femme','Non-binaire','Autre','??'], compact:true },
    { key:'puissance', label:'Puissance', kind:'number', min:0, max:5, compact:true, hint:'0=pas combattant · 1=bat 1 personne · 2=bat un groupe · 3=conquiert une ville · 4=conquiert une région · 5=défie le monde' },
    { key:'especes', label:'Espèce(s)', kind:'ref-list', sources:['especes'] },
    { key:'attributs.formes', label:'Formes', kind:'personnage-formes' },
    { key:'timeline', label:'Existence', kind:'timeline' },
    { key:'alignements', label:'Alignement(s)', kind:'alignements' },
    { key:'roles', label:'Rôles & position', kind:'roles' },
    { key:'liste_victimes', label:'Victimes', kind:'ref-list', sources:['personnages'] },
    { key:'tue_par', label:'Tué par', kind:'tuepar' },
    { key:'attributs.resume', label:'Résumé', kind:'lead'},
    { key:'description', label:'Description', kind:'description', fields:[
      ['apparence','Apparence'],['personnalite','Personnalité'],['pouvoirs','Pouvoirs'],['histoire','Histoire'],
      ['localisation','Localisation'],['objectifs_motivations_croyances','Objectifs / motivations / croyances'],
      ['relations','Relations'],['equipement','Équipement']
    ]},
    { key:'attributs.anecdotes', label:'Anecdotes', kind:'narrative-list' },
  ],
  lieux: [
    { key:'attributs.photo', label:'Photo', kind:'image', hint:"URL d'une image." },
    { key:'attributs.tags', label:'Tags', kind:'tags' },
    { key:'attributs.titres_honorifiques', label:'Titres honorifiques', kind:'tags' },
    { key:'type_lieu', label:'Type de lieu', kind:'text', compact:true, datalist:['ville','village','forêt','ruine','royaume','forteresse','sous-lieu','montagne','désert','marais','île','grotte'] },
    { key:'altitude', label:'Altitude(s)', kind:'int-list', min:0, max:6, compact:true, hint:"0: Tréfonds (roches, glaces et abysses), 1: Profondeurss (Océan liquide, deadzone), 2: Océan (Mer de soufre), 3: Surface (Dodro), 4: Hauteurs (Panthéon), 5: Altitude(Vakernys), 6: Cieux (Kochard)" },
    { key:'situe_dans', label:'Situé dans (si se trouve dans un autre lieu)', kind:'ref', sources:['lieux'], nullable:true },
    { key:'regions', label:'Région(s)', kind:'ref-list', sources:['regions'] },
    { key:'timeline', label:'Existence', kind:'timeline' },
    { key:'attributs.resume', label:'Résumé', kind:'lead', hint:"2 à 5 phrases qui présentent le sujet — affichées juste au-dessus des sections narratives (Description, etc.), pas au-dessus des faits ci-dessus." },
    { key:'description', label:'Description', kind:'description', fields:[
      ['apparence','Apparence'],['histoire','Histoire'],['culture_coutumes','Culture & coutumes'],['faune_flore','Faune & flore'],
      ['architecture_infrastructures','Architecture & infrastructures'],['ressources_economie','Ressources & économie'],
      ['politique_dirigeants','Politique & dirigeants'],['religion_croyances','Religion & croyances'],
      ["relations_autres_lieux","Relations avec d'autres lieux"],['evenements_marquants','Événements marquants']
    ]},
    { key:'habitants', label:'Habitants (calculé)', kind:'habitants' },
    { key:'attributs.anecdotes', label:'Anecdotes', kind:'narrative-list' },
  ],
  groupes: [
    { key:'attributs.photo', label:'Photo', kind:'image', hint:"URL d'une image." },
    { key:'attributs.tags', label:'Tags', kind:'tags' },
    { key:'attributs.titres_honorifiques', label:'Titres honorifiques', kind:'tags' },
    { key:'formel', label:'Formel', kind:'boolean', compact:true, checkboxLabel:'Organisation formelle' },
    { key:'membres', label:'Membres', kind:'membres', sources:['personnages'] },
    { key:'timeline', label:'Existence', kind:'timeline' },
    { key:'attributs.resume', label:'Résumé', kind:'lead', hint:"2 à 5 phrases qui présentent le sujet — affichées juste au-dessus des sections narratives (Description, etc.), pas au-dessus des faits ci-dessus." },
    { key:'description', label:'Description', kind:'description', fields:[
      ['origine','Origine'],['histoire','Histoire'],['objectifs','Objectifs'],['organisation_interne','Organisation interne'],
      ['membres_notables','Membres notables'],['mode_recrutement','Mode de recrutement'],
      ['territoire_lieu_rassemblement','Territoire / lieu de rassemblement'],['influence','Influence'],
      ['activites','Activités'],['symboles_identite_visuelle',"Symboles & identité visuelle"],['traditions_coutumes','Traditions & coutumes']
    ]},
    { key:'attributs.anecdotes', label:'Anecdotes', kind:'narrative-list' },
  ],
  reliques: [
    { key:'attributs.photo', label:'Photo', kind:'image', hint:"URL d'une image." },
    { key:'attributs.tags', label:'Tags', kind:'tags' },
    { key:'attributs.titres_honorifiques', label:'Titres honorifiques', kind:'tags' },
    { key:'est_unique', label:'Unique', kind:'boolean', compact:true, checkboxLabel:'Exemplaire unique' },
    { key:'createurs', label:'Créateur(s)', kind:'ref-list', sources:['personnages'] },
    { key:'evenement_creation', label:'Événement de création', kind:'ref', sources:['events'], nullable:true },
    { key:'materiaux', label:'Matériaux', kind:'ref-list', sources:['materiaux'] },
    { key:'proprietaires', label:'Propriétaire(s)', kind:'membres', sources:['personnages'] },
    { key:'timeline', label:'Existence', kind:'timeline' },
    { key:'attributs.resume', label:'Résumé', kind:'lead', hint:"2 à 5 phrases qui présentent le sujet — affichées juste au-dessus des sections narratives (Description, etc.), pas au-dessus des faits ci-dessus." },
    { key:'description', label:'Description', kind:'description', fields:[
      ['apparence','Apparence'],['capacites','Capacités'],['creation','Création'],['histoire','Histoire'],
      ['impact_societal_militaire','Impact sociétal / militaire']
    ]},
    { key:'attributs.anecdotes', label:'Anecdotes', kind:'narrative-list' },
  ],
  periodes: [
    { key:'attributs.photo', label:'Photo', kind:'image', hint:"URL d'une image." },
    { key:'attributs.tags', label:'Tags', kind:'tags' },
    { key:'attributs.titres_honorifiques', label:'Titres honorifiques', kind:'tags' },
    { key:'lieu', label:'Lieu / Région', kind:'ref', sources:['lieux','regions'], nullable:true },
    { key:'affecte', label:'Entités affectées', kind:'affecte' },
    { key:'timeline', label:'Étapes', kind:'timeline' },
    { key:'attributs.resume', label:'Résumé', kind:'lead', hint:"2 à 5 phrases qui présentent le sujet — affichées juste au-dessus des sections narratives (Description, etc.), pas au-dessus des faits ci-dessus." },
    { key:'attributs.anecdotes', label:'Anecdotes', kind:'narrative-list' },
  ],
  especes: [
    { key:'attributs.photo', label:'Photo', kind:'image', hint:"URL d'une image." },
    { key:'attributs.tags', label:'Tags', kind:'tags' },
    { key:'attributs.titres_honorifiques', label:'Titres honorifiques', kind:'tags' },
    { key:'attributs.formes', label:'Formes', kind:'tags', hint:"Les formes possibles pour cette espèce (ex. Loup, Humain, Ours…)." },
    { key:'organisations', label:'Existence', kind:'espece-orgs', hint:"Type d'organisation, source (l'entité qui l'atteste — personnage, groupe, relique, culture…) et période. Si rien n'est rempli, l'espèce est considérée Unique." },
    { key:'attributs.resume', label:'Résumé', kind:'lead', hint:"2 à 5 phrases qui présentent le sujet — affichées juste au-dessus des sections narratives (Description, etc.), pas au-dessus des faits ci-dessus." },
    { key:'description', label:'Description', kind:'description', fields:[['capacites','Capacités'],['histoire','Histoire'],['relations','Relations']] },
    { key:'attributs.anecdotes', label:'Anecdotes', kind:'narrative-list' },
  ],
  cultures: [
    { key:'attributs.photo', label:'Photo', kind:'image', hint:"URL d'une image." },
    { key:'attributs.tags', label:'Tags', kind:'tags' },
    { key:'attributs.titres_honorifiques', label:'Titres honorifiques', kind:'tags' },
    { key:'timeline', label:'Existence', kind:'timeline' },
    { key:'attributs.resume', label:'Résumé', kind:'lead', hint:"2 à 5 phrases qui présentent le sujet — affichées juste au-dessus des sections narratives (Description, etc.), pas au-dessus des faits ci-dessus." },
    { key:'description', label:'Description', kind:'textarea', hint:'String libre unique (pas de sous-champs pour Culture).' },
    { key:'attributs.anecdotes', label:'Anecdotes', kind:'narrative-list' },
  ],
  materiaux: [
    { key:'attributs.photo', label:'Photo', kind:'image', hint:"URL d'une image." },
    { key:'attributs.tags', label:'Tags', kind:'tags' },
    { key:'attributs.titres_honorifiques', label:'Titres honorifiques', kind:'tags' },
    { key:'est_organique', label:'Organique', kind:'boolean', compact:true, checkboxLabel:'Ce matériau est organique' },
    { key:'est_rare', label:'Rare', kind:'boolean', compact:true, checkboxLabel:'Matériau rare' },
    { key:'porteur_de_chant', label:'Porteur de chant', kind:'boolean', compact:true, checkboxLabel:'Ce matériau est porteur de chant' },
    { key:'timeline', label:'Existence', kind:'timeline' },
    { key:'attributs.resume', label:'Résumé', kind:'lead', hint:"2 à 5 phrases qui présentent le sujet — affichées juste au-dessus des sections narratives (Description, etc.), pas au-dessus des faits ci-dessus." },
    { key:'description', label:'Description', kind:'description', fields:[
      ['apparence','Apparence'],['capacites','Capacités'],['localisation_zone_extraction',"Localisation / zone d'extraction"],['exemples_utilisation',"Exemples d'utilisation"]
    ]},
    { key:'attributs.anecdotes', label:'Anecdotes', kind:'narrative-list' },
  ],
  objets: [
    { key:'attributs.photo', label:'Photo', kind:'image', hint:"URL d'une image." },
    { key:'attributs.tags', label:'Tags', kind:'tags' },
    { key:'attributs.titres_honorifiques', label:'Titres honorifiques', kind:'tags' },
    { key:'materiaux', label:'Matériaux (organiques ou non — jamais porteurs de chant)', kind:'ref-list', sources:['materiaux'], excludeFlag:'porteur_de_chant' },
    { key:'inventeurs', label:'Inventeur(s)', kind:'ref-list', sources:['personnages'] },
    { key:'timeline', label:'Existence', kind:'timeline' },
    { key:'attributs.resume', label:'Résumé', kind:'lead', hint:"2 à 5 phrases qui présentent le sujet — affichées juste au-dessus des sections narratives (Description, etc.), pas au-dessus des faits ci-dessus." },
    { key:'description', label:'Description', kind:'description', fields:[
      ['fonctions','Fonctions'],['apparence','Apparence'],['methode_fabrication','Méthode de fabrication'],['origine','Origine'],
      ['utilisateurs_courants','Utilisateurs courants'],['evolution_historique','Évolution historique']
    ]},
    { key:'attributs.anecdotes', label:'Anecdotes', kind:'narrative-list' },
  ],
  regions: [
    { key:'photo', label:'Photo', kind:'image', hint:"URL d'une image." },
    { key:'tags', label:'Tags', kind:'tags' },
    { key:'titres_honorifiques', label:'Titres honorifiques', kind:'tags' },
    { key:'abs', label:'Abscisse (lettre)', kind:'text', compact:true },
    { key:'ord', label:'Ordonnée (nombre)', kind:'number', min:1, max:14, compact:true },
    { key:'resume', label:'Résumé', kind:'lead', hint:"2 à 5 phrases qui présentent le sujet — affichées juste au-dessus des sections narratives (Description, etc.), pas au-dessus des faits ci-dessus." },
    { key:'anecdotes', label:'Anecdotes', kind:'narrative-list' },
  ],
};

/* L'infobox est dérivée automatiquement de FORM_SPEC : tout y va SAUF le contenu de fond
   (description, habitants dérivés, anecdotes narratives) — pour ne jamais dupliquer une info
   entre l'infobox et le corps de la page. */

export function isBodyOnlyField(def){
  if(def.kind==='description') return true;
  if(def.kind==='habitants') return true;
  if(def.kind==='narrative-list') return true;
  if(def.kind==='lead') return true;
  if(def.key==='description' && def.kind==='textarea') return true; // Culture
  return false;
}

/* =========================================================
   ETAT
   ========================================================= */

export function emptyWorld(){
  const w = {};
  TYPE_ORDER.forEach(t=>w[t]={});
  w.notes = '';
  return w;
}

/* =========================================================
   UTILITAIRES
   ========================================================= */

export function getPath(obj, path){ return path.split('.').reduce((o,k)=> (o? o[k] : undefined), obj); }

export function setPath(obj, path, val){
  const parts = path.split('.');
  let o = obj;
  for(let i=0;i<parts.length-1;i++){ if(!o[parts[i]]) o[parts[i]]={}; o = o[parts[i]]; }
  o[parts[parts.length-1]] = val;
}

export function stripAccents(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

export function generateId(type, coll){
  const prefix = TYPE_META[type].prefix;
  let max = 0;
  const rx = new RegExp('^'+prefix+'_(\\d+)$');
  Object.keys(coll).forEach(k=>{
    const m = k.match(rx);
    if(m){ const n=parseInt(m[1],10); if(n>max) max=n; }
  });
  const next = max+1;
  return prefix+'_'+String(next).padStart(4,'0');
}

export const GENESIS_VERB = {
  personnages: 'Naissance',
  lieux: 'Fondation',
  groupes: 'Fondation',
  reliques: 'Création',
  periodes: 'Début',
  cultures: 'Apparition',
  materiaux: 'Découverte',
  objets: 'Invention',
};
/* À la création d'une fiche (tout type sauf Event, Espece et Région), crée aussi l'Event qui
   marque son commencement (« Naissance de X », « Fondation de X »…) et l'utilise comme première
   période de sa timeline — pour ne jamais avoir à créer cet Event séparément à la main. */

export function ensureRecordDefaults(type, key, r){
  r.id = r.id || key;
  r.nom = r.nom || '';

  if(type==='events'){
    r.date = r.date || {L:'?', l:'?'};
    if(r.date.L===undefined || r.date.L===null) r.date.L='?';
    if(r.date.l===undefined || r.date.l===null) r.date.l='?';
    r.ordre = (r.ordre===undefined||r.ordre===null) ? 1 : r.ordre;
    r.marquant = !!r.marquant;
    r.lieu = (r.lieu===undefined) ? null : r.lieu;
    r.characters = r.characters || [];
    r.resume = r.resume || '';
    r.photo = r.photo || '';
    r.tags = r.tags || [];
    r.titres_honorifiques = r.titres_honorifiques || [];
    r.anecdotes = r.anecdotes || [];
    r.sections = r.sections || [];
    return;
  }
  if(type==='regions'){
    r.resume = r.resume || '';
    r.photo = r.photo || '';
    r.tags = r.tags || [];
    r.titres_honorifiques = r.titres_honorifiques || [];
    r.anecdotes = r.anecdotes || [];
    r.sections = r.sections || [];
    return;
  }
  if(type==='alignements'){
    return; // entité basique : rien au-delà de id + nom, déjà posés plus haut
  }
  r.type = r.type || type.slice(0,-1);
  r.timeline = r.timeline || [];
  r.attributs = r.attributs || {};
  r.attributs.resume = r.attributs.resume || '';
  r.attributs.photo = r.attributs.photo || '';
  r.attributs.tags = r.attributs.tags || [];
  r.attributs.titres_honorifiques = r.attributs.titres_honorifiques || [];
  r.attributs.anecdotes = r.attributs.anecdotes || [];
  r.attributs.sections = r.attributs.sections || [];
  r.description = (r.description===undefined) ? (type==='cultures' ? '' : {}) : r.description;

  if(type==='personnages'){
    r.genre = r.genre || '??';
    r.puissance = (r.puissance===undefined||r.puissance===null) ? 0 : r.puissance;
    r.especes = r.especes || [];
    r.alignements = r.alignements || [];
    r.roles = r.roles || [];
    r.liste_victimes = r.liste_victimes || [];
    r.tue_par = r.tue_par || [];
    r.attributs.formes = r.attributs.formes || [];
  }
  if(type==='lieux'){
    r.type_lieu = r.type_lieu || '';
    r.altitude = r.altitude || [];
    r.regions = r.regions || [];
    r.situe_dans = (r.situe_dans===undefined) ? null : r.situe_dans;
    r.habitants = r.habitants || [];
  }
  if(type==='groupes'){
    r.formel = !!r.formel;
    r.membres = r.membres || [];
  }
  if(type==='reliques'){
    r.est_unique = !!r.est_unique;
    r.createurs = r.createurs || [];
    r.evenement_creation = (r.evenement_creation===undefined) ? null : r.evenement_creation;
    r.materiaux = r.materiaux || [];
    r.proprietaires = r.proprietaires || [];
  }
  if(type==='periodes'){
    r.lieu = (r.lieu===undefined) ? null : r.lieu;
    r.affecte = r.affecte || [];
  }
  if(type==='materiaux'){
    r.est_organique = !!r.est_organique;
    r.est_rare = !!r.est_rare;
    r.porteur_de_chant = !!r.porteur_de_chant;
  }
  if(type==='objets'){
    r.materiaux = r.materiaux || [];
    r.inventeurs = r.inventeurs || [];
  }
  if(type==='especes'){
    r.attributs.formes = r.attributs.formes || [];
    r.organisations = r.organisations || [];
    r.organisations.forEach(o=>{
      o.type_organisation = o.type_organisation||'';
      if(typeof o.source === 'string'){ o.source = { type:'groupe', id:o.source }; }
      else if(!o.source || typeof o.source!=='object'){ o.source = { type:'groupe', id:'' }; }
      else { o.source.type = o.source.type || 'groupe'; o.source.id = o.source.id || ''; }
      o.timeline = o.timeline || [];
    });
  }
}

export function normalizeWorld(data){
  const w = emptyWorld();
  w.notes = (data && typeof data.notes==='string') ? data.notes : '';
  TYPE_ORDER.forEach(t=>{
    const src = data && data[t];
    if(src && typeof src==='object'){
      Object.keys(src).forEach(k=>{
        const rec = src[k] || {};
        ensureRecordDefaults(t,k,rec);
        w[t][k] = rec;
      });
    }
  });
  return w;
}

/* =========================================================
   RENDU — SIDEBAR / LISTE
   ========================================================= */

export const STATUS_LABELS = {
  personnages: { active:'En vie', ended:'Mort' },
  groupes:     { active:'En activité', ended:'Dissous' },
  lieux:       { active:'Existe', ended:'Détruit' },
  reliques:    { active:'Existe', ended:'Détruite' },
  objets:      { active:'Existe', ended:'Détruit' },
  materiaux:   { active:'Disponible', ended:'Épuisé' },
  cultures:    { active:'Vivante', ended:'Éteinte' },
  periodes:    { active:'En cours', ended:'Terminée' },
  especes:     { active:'Vivante', ended:'Éteinte' },
};
