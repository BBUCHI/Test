/* =========================================================
   core/github.js
   Lecture/écriture d'un fichier dans un dépôt GitHub via l'API Contents,
   directement depuis le navigateur. Ne connaît rien du "monde" d'Atlas —
   ce module manipule juste du texte brut, il est réutilisable pour
   n'importe quel fichier, sur n'importe quelle page.
   ========================================================= */

export const GITHUB_CONFIG_KEY = 'atlas_github_config';

export function getGithubConfig(){
  try{ return JSON.parse(localStorage.getItem(GITHUB_CONFIG_KEY) || '{}'); }
  catch(e){ return {}; }
}
export function saveGithubConfig(cfg){
  try{ localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(cfg)); }
  catch(e){ /* stockage indisponible (navigation privée, etc.) — tant pis, pas bloquant */ }
}

function ghHeaders(cfg){
  return {
    'Authorization': 'Bearer '+cfg.token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}
function utf8ToBase64(str){
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b=> binary += String.fromCharCode(b));
  return btoa(binary);
}
function base64ToUtf8(b64){
  const binary = atob(b64.replace(/\n/g,''));
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
function ghContentsUrl(cfg){
  return 'https://api.github.com/repos/'+cfg.ownerRepo+'/contents/'+cfg.path.split('/').map(encodeURIComponent).join('/');
}

/* Renvoie le contenu texte (déjà décodé UTF-8) du fichier. Lève une erreur explicite en cas d'échec. */
export async function githubLoadFile(cfg){
  const url = ghContentsUrl(cfg)+'?ref='+encodeURIComponent(cfg.branch||'main');
  const res = await fetch(url, { headers: ghHeaders(cfg) });
  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error('HTTP '+res.status+' — '+(err.message||'erreur inconnue'));
  }
  const data = await res.json();
  if(Array.isArray(data)) throw new Error("Ce chemin pointe vers un dossier, pas un fichier JSON.");
  return base64ToUtf8(data.content);
}

/* Écrit `content` (texte brut) dans le fichier, en récupérant d'abord le sha courant pour éviter
   d'écraser un changement fait depuis un autre appareil (crée le fichier s'il n'existe pas encore). */
export async function githubSaveFile(cfg, content){
  let sha;
  const getRes = await fetch(ghContentsUrl(cfg)+'?ref='+encodeURIComponent(cfg.branch||'main'), { headers: ghHeaders(cfg) });
  if(getRes.ok){ const getData = await getRes.json(); sha = getData.sha; }
  else if(getRes.status !== 404){
    const err = await getRes.json().catch(()=>({}));
    throw new Error("Impossible de vérifier le fichier existant (HTTP "+getRes.status+" — "+(err.message||'erreur')+")");
  }
  const body = {
    message: 'Mise à jour depuis Atlas — '+new Date().toISOString(),
    content: utf8ToBase64(content),
    branch: cfg.branch || 'main',
  };
  if(sha) body.sha = sha;
  const putRes = await fetch(ghContentsUrl(cfg), {
    method: 'PUT',
    headers: Object.assign({'Content-Type':'application/json'}, ghHeaders(cfg)),
    body: JSON.stringify(body),
  });
  if(!putRes.ok){
    const err = await putRes.json().catch(()=>({}));
    throw new Error('HTTP '+putRes.status+' — '+(err.message||'erreur inconnue'));
  }
}
