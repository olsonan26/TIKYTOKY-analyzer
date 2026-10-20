const DATABASE="tikytoky-workspaces";
const STORE="workspace";
let writes:Promise<void>=Promise.resolve();

function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DATABASE,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error("Browser document storage is unavailable."));
  request.onblocked=()=>reject(new Error("Close other outdated workspace tabs, then reload to open document storage."));
});}

export async function readWorkspace(key:string):Promise<string|null>{
  if(typeof indexedDB==="undefined")return localStorage.getItem(key);
  const db=await open();
  try{
    const value=await new Promise<unknown>((resolve,reject)=>{
      const request=db.transaction(STORE,"readonly").objectStore(STORE).get(key);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    return value?JSON.stringify(value):localStorage.getItem(key);
  }finally{db.close();}
}

export function saveWorkspace(key:string,value:unknown,characters:number):Promise<void>{
  const operation=async()=>{
    const db=await open();
    try{await new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction(STORE,"readwrite");
      transaction.objectStore(STORE).put(value,key);
      transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
    });}finally{db.close();}
    // Small legacy workspaces retain a compatibility cache. Large books live in
    // IndexedDB, avoiding localStorage's roughly 5 MB quota; never truncate text.
    try{if(characters<750_000)localStorage.setItem(key,JSON.stringify(value));else localStorage.removeItem(key);}catch{/* The durable IndexedDB transaction already completed. */}
  };
  writes=writes.catch(()=>{}).then(operation);
  return writes;
}
