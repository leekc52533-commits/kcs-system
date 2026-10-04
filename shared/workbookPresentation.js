import {formatDateDisplay} from './datePresentation.js'
export function formatWorkbook(book){
 for(const sheet of book.worksheets){
  const header=sheet.getRow(1)
  header.eachCell(cell=>{if(typeof cell.value==='string')cell.value=cell.value.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase());cell.fill={type:'pattern',pattern:'none'};cell.font={...cell.font,bold:true,color:{argb:'FF17212B'}}})
  if(sheet.columnCount)sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:sheet.columnCount}}
  sheet.eachRow((row,n)=>{if(n===1)return;row.eachCell(cell=>{if(cell.value instanceof Date)cell.numFmt=/[hHsS]/.test(cell.numFmt||'')?'dd-mmm-yy hh:mm:ss':'dd-mmm-yy';else if(typeof cell.value==='string'){const iso=/^\d{4}-\d{2}-\d{2}$/.test(cell.value)?cell.value:null;const old=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cell.value);const date=iso||(old?`${old[3]}-${old[2]}-${old[1]}`:null);if(date&&Number.isFinite(Date.parse(date))){cell.value=new Date(date+'T00:00:00Z');cell.numFmt='dd-mmm-yy'}else cell.value=formatDateDisplay(cell.value)}})})
  sheet.columns.forEach(column=>{let width=10;column.eachCell({includeEmpty:false},cell=>{const text=cell.value instanceof Date?(/hh/.test(cell.numFmt)?'04-Oct-26 12:00:00':'04-Oct-26'):cell.text||'';width=Math.max(width,...text.split('\n').map(line=>Array.from(line).reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0)+3))});column.width=Math.min(100,width)})
 }
 return book
}
