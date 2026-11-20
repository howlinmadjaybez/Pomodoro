const KEY = "pomodoro-liquid-glass-v1";
const defaults = {schemaVersion:1, timer:null, settings:{work:25,rest:5,autoBreak:true,sound:true,wakeLock:false}, notes:[], history:[], customBackground:false};
export function loadData(){try{const raw=localStorage.getItem(KEY);if(!raw)return structuredClone(defaults);const parsed=JSON.parse(raw);return {...structuredClone(defaults),...parsed,settings:{...defaults.settings,...parsed.settings},notes:Array.isArray(parsed.notes)?parsed.notes:[],history:Array.isArray(parsed.history)?parsed.history:[]}}catch(e){localStorage.removeItem(KEY);return structuredClone(defaults)}}
export let data=loadData();
export function saveData(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){window.dispatchEvent(new CustomEvent("app-toast",{detail:"Не вдалося зберегти дані: можливо, сховище заповнене."}))}}
export function updateData(patch){data={...data,...patch};saveData()}
window.addEventListener("storage",e=>{if(e.key===KEY)location.reload()});
