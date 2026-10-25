import type {SVGProps} from 'react';

// AlecaFrame 3.0.4 assets/js/main/sidePanel.js, paths object.
const paths={
 clock:'M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 arbitration:'m12 2 9 5v10l-9 5-9-5V7Zm0 4v12M7 9l5-3 5 3M7 15l5 3 5-3',
 gift:'M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z',
 bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
 bellActive:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4 M2 8a10 10 0 0 1 2-6 M22 8a10 10 0 0 0-2-6',
 search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 close:'m6 6 12 12M18 6 6 18',
 chevron:'m8 4 8 8-8 8',
 info:'M12 11v6 M12 7v.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 check:'m5 12 4 4L19 6',
 refresh:'M20 7v5h-5 M4 17v-5h5 M5 7a8 8 0 0 1 13-2l2 2 M4 17l2 2a8 8 0 0 0 13-2',
 copy:'M9 8V3h12v14h-5 M3 8h13v13H3Z',
 plus:'M12 5v14M5 12h14',
 warning:'m12 3 10 18H2L12 3Zm0 6v5m0 3v1',
 trade:'M3 7h17m-5-4 5 4-5 4 M21 17H4m5-4-5 4 5 4',
 external:'M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7',
} as const;
export type PanelIconName=keyof typeof paths;
export default function PanelIcon({name,className='',...props}:SVGProps<SVGSVGElement>&{name:PanelIconName}){
 return <svg {...props} className={'sideIcon '+className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
