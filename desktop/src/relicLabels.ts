const refinements:Record<string,string>={Intact:'完整',Exceptional:'优良',Flawless:'无暇',Radiant:'光辉'};
/** Display only: keep canonical refinement keys unchanged for images and market requests. */
export const refinementLabel=(level:string,en=false)=>en?level:refinements[level]??level;
const eras:Record<string,string>={Lith:'古世纪',Meso:'前世纪',Neo:'中世纪',Axi:'后世纪',Requiem:'安魂'};
export const relicEraLabel=(era:string,en=false)=>en?era:eras[era]??era;
