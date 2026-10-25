import type {SVGProps} from 'react';
// AlecaFrame 3.0.4 assets/js/main/arbitrations.js icons, preserved by name.
const paths={arbitration:'M12 2 21 7v10l-9 5-9-5V7l9-5Zm0 4v12M7 9l5-3 5 3M7 15l5 3 5-3',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',calendar:'M4 5h16v16H4V5Zm4-3v6m8-6v6M4 10h16M8 14h2m4 0h2m-8 4h2',bell:'M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3V9Zm4 12h4',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',arrow:'M4 12h15m-6-6 6 6-6 6',settings:'M3 6h18M3 18h18M7 3v6m10 6v6',close:'m6 6 12 12M18 6 6 18',history:'M3 4v5h5M3 9a9 9 0 1 1 1 9m8-11v6l4 2'};
type Props=SVGProps<SVGSVGElement>;
const icon=(name:keyof typeof paths)=>(props:Props)=><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]}/></svg>;
export const CubeIcon=icon('arbitration'),ClockIcon=icon('clock'),CalendarIcon=icon('calendar'),BellIcon=icon('bell'),StarIcon=icon('star'),StarFilledIcon=icon('star'),ArrowRightIcon=icon('arrow'),MixerHorizontalIcon=icon('settings'),Cross2Icon=icon('close'),CounterClockwiseClockIcon=icon('history');
export function MagnifyingGlassIcon(){return <span aria-hidden="true" className="arbReferenceMask" style={{maskImage:'url(/reference/ui/search.png)',WebkitMaskImage:'url(/reference/ui/search.png)'}}/>;}
export function TrashIcon(){return <span aria-hidden="true" className="arbReferenceMask" style={{maskImage:'url(/reference/ui/delete.png)',WebkitMaskImage:'url(/reference/ui/delete.png)'}}/>;}
