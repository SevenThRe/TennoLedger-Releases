import {WorldRailSidebar} from './WorldRail';
/** Existing call sites keep their navigation contract; all rail content is shared. */
export default function EventSidebar({onNavigate}:{onNavigate:(page:string)=>void}){return <WorldRailSidebar onNavigate={onNavigate}/>;}
