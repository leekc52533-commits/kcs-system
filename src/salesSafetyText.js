import {formatDateDisplay} from './dateDisplay.js'
export const salesSafetyText={
 zh:{lookup:'全期查找（完整系统单号或工厂单号）',search:'查找',empty:'找不到此单号。',view:'查看原单',discard:'打开原单将放弃当前未保存内容，是否继续？',confirm:date=>`结算日期为 ${formatDateDisplay(date)}，已超过过去 7 天或属于未来日期。请核对年份和原单，确认仍要提交吗？`},
 en:{lookup:'All dates: full sales or factory bill number',search:'Search',empty:'No matching bill.',view:'View original bill',discard:'Opening the original bill will discard unsaved changes. Continue?',confirm:date=>`Settlement date ${formatDateDisplay(date)} is more than 7 days ago or in the future. Check the year and original bill. Submit anyway?`},
 ms:{lookup:'Semua tarikh: nombor penuh bil jualan atau kilang',search:'Cari',empty:'Bil tidak dijumpai.',view:'Lihat bil asal',discard:'Membuka bil asal akan membuang perubahan yang belum disimpan. Teruskan?',confirm:date=>`Tarikh penyelesaian ${formatDateDisplay(date)} melebihi 7 hari lalu atau pada masa hadapan. Semak tahun dan bil asal. Teruskan penghantaran?`}
}
