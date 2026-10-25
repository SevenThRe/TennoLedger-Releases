/** The shipped analytics template distinguishes quantity from platinum. */
export default function AnalyticsUnit({quantity=false,zh}:{quantity?:boolean;zh:boolean}){
 return <img className={quantity?'analyticsQuantity':undefined} src={`/reference/ui/${quantity?'sugar-cubes':'platinum'}.png`} alt={quantity?(zh?'数量':'quantity'):(zh?'白金':'platinum')}/>;
}
