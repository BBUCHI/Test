/* =========================================================
   core/store.js
   Primitives génériques de lecture/écriture de fichiers locaux (via l'input
   file du navigateur et le téléchargement de Blob). Ne connaît rien du
   "monde" d'Atlas — prend/rend des données brutes, réutilisable ailleurs.
   ========================================================= */

/* Lit un fichier choisi par l'utilisateur et le parse en JSON. */
export function readJsonFile(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      try{ resolve(JSON.parse(reader.result)); }
      catch(err){ reject(err); }
    };
    reader.onerror = ()=> reject(reader.error || new Error('Lecture du fichier impossible.'));
    reader.readAsText(file, 'utf-8');
  });
}

/* Déclenche le téléchargement d'un objet sous forme de fichier .json. */
export function downloadJson(data, filename){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'monde.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
