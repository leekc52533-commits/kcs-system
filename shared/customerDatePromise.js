export const dateRequestReasonChoices=[
 {id:'time',zh:'来不及收货',ms:'Tidak sempat membuat kutipan',en:'Not enough time to collect'},
 {id:'full',zh:'罗里满货',ms:'Lori penuh',en:'Lorry full'},
 {id:'customer',zh:'客户要求改期',ms:'Pelanggan minta tukar tarikh',en:'Customer requested rescheduling'}
]
export const customerDateWords={
 zh:{date:'客户要求的收货日期',warning:'这是答应客户的收货日期，当天必须前往，批准后不能再次改期。',badge:'客户约定',locked:'必须到店，不可改期',scope:'请选择仅本次或永久更改',once:'仅本次改期',permanent:'永久更改',permanentHelp:'批准时同步修改客户固定收货日期及路线；修改失败则不予批准。',scopeChecked:'我已确认客户约定日期及更改范围',view:'查看约定日期（模拟）'},
 ms:{date:'Tarikh kutipan diminta pelanggan',warning:'Ini tarikh yang dijanjikan kepada pelanggan. Wajib datang pada tarikh ini dan tidak boleh tukar lagi selepas diluluskan.',badge:'Janji pelanggan',locked:'Wajib datang, tarikh tidak boleh ditukar',scope:'Pilih sekali ini atau perubahan tetap',once:'Sekali ini sahaja',permanent:'Perubahan tetap',permanentHelp:'Kelulusan turut mengemas kini tarikh dan laluan kutipan tetap pelanggan. Jika kemas kini gagal, kelulusan dibatalkan.',scopeChecked:'Saya sahkan tarikh janji pelanggan dan skop perubahan',view:'Lihat tarikh janji (simulasi)'},
 en:{date:'Collection date requested by customer',warning:'This date is promised to the customer. You must attend on this date; it cannot be rescheduled after approval.',badge:'Customer commitment',locked:'Must attend; date cannot change',scope:'Choose once only or permanent change',once:'Once only',permanent:'Permanent change',permanentHelp:'Approval also updates the customer’s recurring collection date and route. If the update fails, approval is rolled back.',scopeChecked:'I confirm the customer’s promised date and change scope',view:'View promised date (simulation)'}
}
