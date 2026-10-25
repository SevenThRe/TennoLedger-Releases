import images from './relicImages.json';
export function relicImage(era:string,refinement='Intact'):string{
 const file=(images as Record<string,string>)[`${era}:${refinement}`];
 return file?`/reference/relics/${file}`:'/reference/ui/question.png';
}
