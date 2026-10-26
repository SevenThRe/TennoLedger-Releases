import referenceThemes from './communityThemes.json';
import {parseTheme,type Theme} from './themeModel';

/** AlecaFrame's cached community presets; names, authors and icons stay intact. */
export const communityThemes:Theme[]=referenceThemes.map(parseTheme);
export function themeCatalog(saved:readonly Theme[]):Theme[]{
 const themes=new Map(communityThemes.map(theme=>[theme.name+'\0'+theme.author,theme]));
 for(const theme of saved)themes.set(theme.name+'\0'+theme.author,theme);
 return [...themes.values()];
}
