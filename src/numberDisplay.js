// Display only: keep stored values, form inputs and calculations ungrouped.
export function groupNumber(value){
 const text=String(value??'');
 if(!/^-?\d+(?:\.\d+)?$/.test(text))return value;
 const [integer,decimal]=text.split('.');
 return integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(decimal===undefined?'':'.'+decimal);
}
export const displayWeight=value=>groupNumber(Number(value).toFixed(2));
export const displayMoney=value=>groupNumber(Number(value).toFixed(2));
