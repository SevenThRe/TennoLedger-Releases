import type {WorldEvent,Subscriptions} from './worldModel.ts';
export type ArbitrationFilter={missionTypes:string[];planets:string[];nodeIds:string[];factions:string[];tiers:string[];favoritesOnly:boolean};
export type ArbitrationPreferences={showInEvents:boolean;favoriteNodeIds:string[];matchPreferencesConfigured:boolean;leadMinutes:number;notifyOnStart:boolean;alertFilter:ArbitrationFilter;reminderIds:string[];legacyMatch?:{tiers:string[];nodeIds:string[]}|null};
export const blankArbitrationPreferences=():ArbitrationPreferences=>({showInEvents:true,favoriteNodeIds:[],matchPreferencesConfigured:false,leadMinutes:10,notifyOnStart:true,alertFilter:{missionTypes:[],planets:[],nodeIds:[],factions:[],tiers:[],favoritesOnly:false},reminderIds:[]});
export function arbitrationPreferences(s:Subscriptions):ArbitrationPreferences{
 if(s.arbitrationPreferences)return s.arbitrationPreferences;
 const p=blankArbitrationPreferences();
 p.favoriteNodeIds=[...s.arbitrationNodes];
 if(s.arbitrationEnabled){p.matchPreferencesConfigured=true;if(!s.arbitrationNodes.length)p.alertFilter.tiers=[...s.arbitrationTiers];else p.legacyMatch={tiers:[...s.arbitrationTiers],nodeIds:[...s.arbitrationNodes]};}
 return p;
}
export function matchesArbitration(e:WorldEvent,p:ArbitrationPreferences){if(p.legacyMatch)return p.legacyMatch.tiers.includes(e.rating||'Unrated')||p.legacyMatch.nodeIds.includes(e.nodeId);const f=p.alertFilter;return (!f.missionTypes.length||f.missionTypes.includes(e.missionType))&&(!f.planets.length||f.planets.includes(e.planet))&&(!f.nodeIds.length||f.nodeIds.includes(e.nodeId))&&(!f.factions.length||f.factions.includes(e.faction))&&(!f.tiers.length||f.tiers.includes(e.rating||'Unrated'))&&(!f.favoritesOnly||p.favoriteNodeIds.includes(e.nodeId));}
export const hasArbitrationPreferences=(p:ArbitrationPreferences,enabled=false)=>enabled||p.matchPreferencesConfigured||p.alertFilter.favoritesOnly||[p.alertFilter.missionTypes,p.alertFilter.planets,p.alertFilter.nodeIds,p.alertFilter.factions,p.alertFilter.tiers].some(v=>v.length>0);
export function futureArbitrations(events:WorldEvent[],now:number){return events.filter(e=>Number.isFinite(Date.parse(e.activation))&&Date.parse(e.expiry)>now&&Date.parse(e.activation)<=now+7*86400000).slice().sort((a,b)=>Date.parse(a.activation)-Date.parse(b.activation));}
export function arbitrationSummary(events:WorldEvent[],p:ArbitrationPreferences,now:number,enabled=false){const schedule=futureArbitrations(events,now);return {schedule,current:schedule.find(e=>Date.parse(e.activation)<=now),next:schedule.find(e=>Date.parse(e.activation)>now),nextMatch:hasArbitrationPreferences(p,enabled)?schedule.find(e=>Date.parse(e.activation)>now&&matchesArbitration(e,p)):undefined};}
export function arbitrationDayKey(value:string|number){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function arbitrationDayGroups(events:WorldEvent[]){const groups=new Map<string,WorldEvent[]>();for(const e of events){const key=arbitrationDayKey(e.activation);groups.set(key,[...(groups.get(key)??[]),e]);}return [...groups].map(([key,slots])=>({key,slots}));}
export const arbitrationFactionZh=(f:string)=>({Infested:'感染者',Orokin:'堕落者',Corrupted:'堕落者','The Murmur':'低语者',Sentient:'Sentient'}[f]??f);
// AlecaFrame WorldStateHelper: 1735819200 UTC, five moods, two hours per mood.
export function duviriCycle(now:number){const moods=['fear','joy','anger','envy','sorrow'];const step=7200000,anchor=1735819200000;const offset=((now-anchor)%(step*5)+step*5)%(step*5),index=Math.floor(offset/step);return {state:moods[index],nextState:moods[(index+1)%5],expiry:new Date(now+(step-offset%step)).toISOString()};}
