const keys=['hub.addressAnalysis','addressAnalysis.eyebrow','addressAnalysis.safety','addressAnalysis.noBulk','addressAnalysis.bucket.missing_with_gps','addressAnalysis.bucket.missing_without_gps','addressAnalysis.bucket.incomplete','addressAnalysis.bucket.evidence_conflict','addressAnalysis.bucket.ready_review','addressAnalysis.bucket.reviewed_unchanged','addressAnalysis.searchLabel','addressAnalysis.searchPlaceholder','addressAnalysis.bucketLabel','addressAnalysis.allActive','addressAnalysis.copyTitle','addressAnalysis.branchId','addressAnalysis.zone','addressAnalysis.addressMissing','addressAnalysis.officialGps','addressAnalysis.noOfficialGps','addressAnalysis.officialGpsMissing','addressAnalysis.pendingIgnored','addressAnalysis.manualReview','addressAnalysis.reviewReady','addressAnalysis.empty','addressAnalysis.currentAddress','addressAnalysis.state','addressAnalysis.city','addressAnalysis.streetNumber','addressAnalysis.postcode','addressAnalysis.gpsEvidence','addressAnalysis.coordinates','addressAnalysis.notProof','addressAnalysis.parsedEvidence','addressAnalysis.tokens','addressAnalysis.postcodes','addressAnalysis.areaCandidates','addressAnalysis.zonePolygon','addressAnalysis.zoneOnly','addressAnalysis.nearby','addressAnalysis.areaRecommendation','addressAnalysis.noSafeSuggestion','addressAnalysis.manualExplanation','addressAnalysis.reviewExplanation','addressAnalysis.confidenceLabel','addressAnalysis.confidence.low','addressAnalysis.confidence.medium','addressAnalysis.confidence.high','addressAnalysis.strongEvidence','addressAnalysis.signal.address_area_tokens','addressAnalysis.conflicts','addressAnalysis.changeArea','addressAnalysis.decisions','addressAnalysis.sessionLimitation','addressAnalysis.keepReason','addressAnalysis.keepCurrent','addressAnalysis.reviewLater','addressAnalysis.reviewLaterSession','addressAnalysis.previewGoogle','addressAnalysis.previewNotProof','addressAnalysis.suggestedAddress','addressAnalysis.previewExplanation','addressAnalysis.mandatoryReason','addressAnalysis.useSuggested','addressAnalysis.reasonRequired']
const values={
en:['Address Analysis & Area Refinement','FORMAL REVIEW · PREVIEW FIRST','Analysis never writes operational data. Pending GPS is ignored. Google runs only when you preview one record.','No bulk confirmation','Missing address + Official GPS','Missing address, no Official GPS','Incomplete / landmark / plus code','Address / Area evidence conflict','Ready for supervisor review','Reviewed / unchanged','Search address analysis','Search Branch ID, name, Customer, Area, address or postcode','Address analysis group','All active Branches','Copy {label}','Branch ID','Zone','Address missing','Official GPS','No Official GPS','Official GPS missing','Pending GPS ignored','Manual review','Review ready','No Active Branches match this filter.','Current master address','State','City','Street / number','Postcode','GPS evidence','coordinates','It is not proof.','Parsed evidence','Tokens','Postcodes','Area candidates','Zone polygon','A Zone polygon supports Zone membership only; it never proves a child Area.','Nearby Active Branches with Official GPS (supporting only)','Area recommendation','No safe suggestion','Fewer than two independent strong signals agree, or a conflict exists. Supervisor review is required.','Independent strong evidence agrees without a conflict; supervisor confirmation is still required.','Confidence','Low','Medium','High','Independent strong evidence','Address and Area tokens','Conflicts','Change Area in protected Area Refinement review','Supervisor decisions','Keep current address and Review later never change operational fields. Review later is session-only because Schema v41 has no address-review status field.','Keep current address','Keep current address','Review later','Review later (this session)','Preview Google address','Preview candidate — not proof','suggested address','Reverse geocoding is only a candidate. Confirm it against independent evidence.','Mandatory supervisor reason','Use suggested address','A supervisor reason is required.'],
ms:['Analisis Alamat & Pemurnian Area','SEMAKAN RASMI · PRATONTON DAHULU','Analisis tidak menulis data operasi. GPS menunggu diabaikan. Google hanya digunakan apabila satu rekod dipratonton.','Tiada pengesahan pukal','Alamat tiada + GPS rasmi','Alamat tiada, tiada GPS rasmi','Tidak lengkap / tanda tempat / plus code','Konflik bukti alamat / Area','Sedia untuk semakan penyelia','Disemak / tidak berubah','Cari analisis alamat','Cari ID Cawangan, nama, Pelanggan, Area, alamat atau poskod','Kumpulan analisis alamat','Semua Cawangan aktif','Salin {label}','ID Cawangan','Zon','Alamat tiada','GPS rasmi','Tiada GPS rasmi','GPS rasmi tiada','GPS menunggu diabaikan','Semakan manual','Sedia disemak','Tiada Cawangan Aktif sepadan dengan penapis ini.','Alamat master semasa','Negeri','Bandar','Jalan / nombor','Poskod','Bukti GPS','koordinat','Ia bukan bukti.','Bukti yang dihuraikan','Token','Poskod','Calon Area','Poligon Zon','Poligon Zon hanya menyokong keahlian Zon; ia tidak membuktikan Area anak.','Cawangan Aktif berdekatan dengan GPS rasmi (sokongan sahaja)','Cadangan Area','Tiada cadangan selamat','Kurang daripada dua isyarat kukuh bebas bersetuju, atau terdapat konflik. Semakan penyelia diperlukan.','Bukti kukuh bebas bersetuju tanpa konflik; pengesahan penyelia masih diperlukan.','Keyakinan','Rendah','Sederhana','Tinggi','Bukti kukuh bebas','Token alamat dan Area','Konflik','Ubah Area dalam semakan Pemurnian Area terlindung','Keputusan penyelia','Kekalkan alamat semasa dan Semak kemudian tidak mengubah medan operasi. Semak kemudian hanya untuk sesi ini kerana Skema v41 tiada medan status semakan alamat.','Kekalkan alamat semasa','Kekalkan alamat semasa','Semak kemudian','Semak kemudian (sesi ini)','Pratonton alamat Google','Calon pratonton — bukan bukti','alamat dicadangkan','Geokod songsang hanya calon. Sahkan dengan bukti bebas.','Sebab penyelia wajib','Gunakan alamat dicadangkan','Sebab penyelia diperlukan.'],
zh:['地址分析与 Area 细分','正式审核 · 先预览','分析不会写入营运资料。待审核 GPS 会被忽略。只有逐笔预览时才会调用 Google。','不可批量确认','缺地址 + 有正式 GPS','缺地址且无正式 GPS','地址不完整 / 仅地标 / plus code','地址 / Area 证据冲突','可供主管审核','已审核 / 未变更','搜索地址分析','搜索 Branch ID、名称、Customer、Area、地址或邮编','地址分析分类','全部营运中 Branch','复制{label}','Branch ID','Zone','缺少地址','正式 GPS','没有正式 GPS','缺少正式 GPS','待审核 GPS 已忽略','须人工审核','可供审核','没有符合筛选条件的营运中 Branch。','当前主档地址','州属','城市','街道 / 门牌','邮编','GPS 证据','坐标','这不是证明。','已解析证据','词元','邮编','候选 Area','Zone polygon','Zone polygon 只能支持 Zone 归属，不能证明下属 Area。','附近拥有正式 GPS 的营运中 Branch（仅辅助）','Area 建议','没有安全建议','不足两个独立强证据一致，或存在冲突；必须由主管审核。','独立强证据一致且无冲突；仍须主管确认。','可信度','低','中','高','独立强证据','地址与 Area 词元','冲突','前往受保护的 Area 细分审核修改 Area','主管决定','保留当前地址和稍后审核都不会修改营运字段。Schema v41 没有地址审核状态字段，因此稍后审核只在本次会话保留。','保留当前地址','保留当前地址','稍后审核','稍后审核（本次会话）','预览 Google 地址','预览候选 — 不是证明','建议地址','反向地理编码只是候选，必须以独立证据核对。','主管原因（必填）','采用建议地址','必须填写主管原因。']}
const addressAnalysisMessages=Object.fromEntries(Object.entries(values).map(([language,items])=>{const translated=Object.fromEntries(keys.map((key,index)=>[key,items[index]]));translated['addressAnalysis.title']=translated['hub.addressAnalysis'];return[language,translated]}))
Object.assign(addressAnalysisMessages.en,{'addressAnalysis.conflictsCount':'Conflicts: {count}','addressAnalysis.polygon.inside':'Inside','addressAnalysis.polygon.boundary':'Boundary','addressAnalysis.polygon.overlap':'Overlap','addressAnalysis.polygon.outside':'Outside','addressAnalysis.polygon.unavailable':'Unavailable'})
Object.assign(addressAnalysisMessages.ms,{'addressAnalysis.conflictsCount':'Konflik: {count}','addressAnalysis.polygon.inside':'Di dalam','addressAnalysis.polygon.boundary':'Sempadan','addressAnalysis.polygon.overlap':'Bertindih','addressAnalysis.polygon.outside':'Di luar','addressAnalysis.polygon.unavailable':'Tidak tersedia'})
Object.assign(addressAnalysisMessages.zh,{'addressAnalysis.conflictsCount':'冲突：{count}','addressAnalysis.polygon.inside':'内部','addressAnalysis.polygon.boundary':'边界','addressAnalysis.polygon.overlap':'重叠','addressAnalysis.polygon.outside':'外部','addressAnalysis.polygon.unavailable':'无法使用'})
Object.assign(addressAnalysisMessages.en,{'addressAnalysis.keepCurrentSession':'Kept current address (this session)','addressAnalysis.keepFeedback':'Current address kept for this session only. No data was saved or changed.'})
Object.assign(addressAnalysisMessages.ms,{'addressAnalysis.keepCurrentSession':'Alamat semasa dikekalkan (sesi ini)','addressAnalysis.keepFeedback':'Alamat semasa dikekalkan untuk sesi ini sahaja. Tiada data disimpan atau diubah.'})
Object.assign(addressAnalysisMessages.zh,{'addressAnalysis.keepCurrentSession':'已保留当前地址（本次会话）','addressAnalysis.keepFeedback':'当前地址只在本次会话标记为保留；没有保存或修改任何资料。'})
Object.assign(addressAnalysisMessages.en,{'addressAnalysis.bucket.evidence_conflict':'Area / Zone assignment to check','addressAnalysis.manualReview':'Area / Zone review required'})
Object.assign(addressAnalysisMessages.ms,{'addressAnalysis.bucket.evidence_conflict':'Penetapan Area / Zon untuk disemak','addressAnalysis.manualReview':'Penetapan Area / Zon perlu disemak'})
Object.assign(addressAnalysisMessages.zh,{'addressAnalysis.bucket.evidence_conflict':'Area／Zone 归属待检查','addressAnalysis.manualReview':'Area／Zone 归属待审核'})
Object.assign(addressAnalysisMessages.en,{
  'addressAnalysis.gpsRemark':'GPS Remark',
  'addressAnalysis.safeBatch':'Safe Official GPS batch','addressAnalysis.batchTitle':'Official GPS address subdivision','addressAnalysis.batchHelp':'Google candidates are checked against strict rules. Only complete, rooftop-level Sarawak addresses without conflicts can be applied automatically. Pending GPS is always ignored.','addressAnalysis.batchAnalyze':'Analyze Official GPS addresses','addressAnalysis.batchAnalyzed':'Analyzed','addressAnalysis.batchReliable':'Reliable','addressAnalysis.batchReview':'Need your decision','addressAnalysis.batchErrors':'Lookup failed','addressAnalysis.batchReason':'Audit reason','addressAnalysis.batchReasonPlaceholder':'Example: Official GPS address subdivision','addressAnalysis.batchApply':'Apply {count} reliable addresses','addressAnalysis.batchApplied':'Applied {count} reliable address(es); {skipped} stale or conflicting record(s) stayed unchanged.','addressAnalysis.batchNeedDecision':'Need your decision ({count})','addressAnalysis.batchLookupErrors':'Address lookup failed ({count})',
  'addressAnalysis.batchReasonCode.no_address':'No usable address','addressAnalysis.batchReasonCode.not_malaysia':'Not confirmed as Malaysia','addressAnalysis.batchReasonCode.not_sarawak':'Not confirmed as Sarawak','addressAnalysis.batchReasonCode.missing_state':'State missing','addressAnalysis.batchReasonCode.missing_city':'City missing','addressAnalysis.batchReasonCode.missing_street':'Street missing','addressAnalysis.batchReasonCode.missing_streetNumber':'Street number missing','addressAnalysis.batchReasonCode.missing_postcode':'Postcode missing','addressAnalysis.batchReasonCode.invalid_postcode':'Postcode is not 5 digits','addressAnalysis.batchReasonCode.partial_match':'Google returned a partial match','addressAnalysis.batchReasonCode.not_rooftop':'GPS is not rooftop precision','addressAnalysis.batchReasonCode.state_conflict':'State conflicts with current data','addressAnalysis.batchReasonCode.city_conflict':'City conflicts with current data','addressAnalysis.batchReasonCode.street_conflict':'Street conflicts with current data','addressAnalysis.batchReasonCode.postcode_conflict':'Postcode conflicts with current data','addressAnalysis.batchReasonCode.current_address_conflict':'Current address does not support the candidate'
})
Object.assign(addressAnalysisMessages.ms,{
  'addressAnalysis.gpsRemark':'Catatan GPS',
  'addressAnalysis.safeBatch':'Kelompok selamat GPS rasmi','addressAnalysis.batchTitle':'Pecahan alamat GPS rasmi','addressAnalysis.batchHelp':'Calon Google diperiksa dengan peraturan ketat. Hanya alamat Sarawak lengkap, berketepatan bumbung dan tanpa konflik boleh digunakan secara automatik. GPS menunggu sentiasa diabaikan.','addressAnalysis.batchAnalyze':'Analisis alamat GPS rasmi','addressAnalysis.batchAnalyzed':'Dianalisis','addressAnalysis.batchReliable':'Boleh dipercayai','addressAnalysis.batchReview':'Perlu keputusan anda','addressAnalysis.batchErrors':'Carian gagal','addressAnalysis.batchReason':'Sebab audit','addressAnalysis.batchReasonPlaceholder':'Contoh: Pecahan alamat GPS rasmi','addressAnalysis.batchApply':'Gunakan {count} alamat yang boleh dipercayai','addressAnalysis.batchApplied':'{count} alamat digunakan; {skipped} rekod lapuk atau bercanggah kekal tanpa perubahan.','addressAnalysis.batchNeedDecision':'Perlu keputusan anda ({count})','addressAnalysis.batchLookupErrors':'Carian alamat gagal ({count})',
  'addressAnalysis.batchReasonCode.no_address':'Tiada alamat yang boleh digunakan','addressAnalysis.batchReasonCode.not_malaysia':'Tidak disahkan sebagai Malaysia','addressAnalysis.batchReasonCode.not_sarawak':'Tidak disahkan sebagai Sarawak','addressAnalysis.batchReasonCode.missing_state':'Negeri tiada','addressAnalysis.batchReasonCode.missing_city':'Bandar tiada','addressAnalysis.batchReasonCode.missing_street':'Jalan tiada','addressAnalysis.batchReasonCode.missing_streetNumber':'Nombor jalan tiada','addressAnalysis.batchReasonCode.missing_postcode':'Poskod tiada','addressAnalysis.batchReasonCode.invalid_postcode':'Poskod bukan 5 digit','addressAnalysis.batchReasonCode.partial_match':'Google memberi padanan separa','addressAnalysis.batchReasonCode.not_rooftop':'GPS bukan ketepatan bumbung','addressAnalysis.batchReasonCode.state_conflict':'Negeri bercanggah dengan data semasa','addressAnalysis.batchReasonCode.city_conflict':'Bandar bercanggah dengan data semasa','addressAnalysis.batchReasonCode.street_conflict':'Jalan bercanggah dengan data semasa','addressAnalysis.batchReasonCode.postcode_conflict':'Poskod bercanggah dengan data semasa','addressAnalysis.batchReasonCode.current_address_conflict':'Alamat semasa tidak menyokong calon'
})
Object.assign(addressAnalysisMessages.zh,{
  'addressAnalysis.gpsRemark':'GPS 备注',
  'addressAnalysis.safeBatch':'正式 GPS 安全批量处理','addressAnalysis.batchTitle':'正式 GPS 地址细分','addressAnalysis.batchHelp':'系统会用严格规则核对 Google 候选地址。只有资料完整、定位精确到门牌、属于 Sarawak 且没有冲突的地址才可自动采用；待审核 GPS 一律忽略。','addressAnalysis.batchAnalyze':'分析正式 GPS 地址','addressAnalysis.batchAnalyzed':'已分析','addressAnalysis.batchReliable':'可以确定','addressAnalysis.batchReview':'需要你决定','addressAnalysis.batchErrors':'查询失败','addressAnalysis.batchReason':'审计原因','addressAnalysis.batchReasonPlaceholder':'例如：正式 GPS 地址细分','addressAnalysis.batchApply':'采用 {count} 个可靠地址','addressAnalysis.batchApplied':'已采用 {count} 个可靠地址；{skipped} 笔过期或冲突资料保持不变。','addressAnalysis.batchNeedDecision':'需要你决定（{count}）','addressAnalysis.batchLookupErrors':'地址查询失败（{count}）',
  'addressAnalysis.batchReasonCode.no_address':'没有可用地址','addressAnalysis.batchReasonCode.not_malaysia':'无法确定属于马来西亚','addressAnalysis.batchReasonCode.not_sarawak':'无法确定属于 Sarawak','addressAnalysis.batchReasonCode.missing_state':'缺少州属','addressAnalysis.batchReasonCode.missing_city':'缺少城市','addressAnalysis.batchReasonCode.missing_street':'缺少街道','addressAnalysis.batchReasonCode.missing_streetNumber':'缺少门牌','addressAnalysis.batchReasonCode.missing_postcode':'缺少邮编','addressAnalysis.batchReasonCode.invalid_postcode':'邮编不是5位数字','addressAnalysis.batchReasonCode.partial_match':'Google 只找到部分匹配','addressAnalysis.batchReasonCode.not_rooftop':'GPS 精度未达到门牌','addressAnalysis.batchReasonCode.state_conflict':'州属与现有资料冲突','addressAnalysis.batchReasonCode.city_conflict':'城市与现有资料冲突','addressAnalysis.batchReasonCode.street_conflict':'街道与现有资料冲突','addressAnalysis.batchReasonCode.postcode_conflict':'邮编与现有资料冲突','addressAnalysis.batchReasonCode.current_address_conflict':'现有地址无法支持候选地址'
})


export const languageOptions = [
  {code:'ms',label:'Bahasa Melayu'},
  {code:'zh',label:'中文'},
  {code:'en',label:'English'}
]

export const messages = {
  en: {
    'customerHierarchy.masterHelp':'Customer is the parent account. Addresses, GPS, contacts, payment, prices and collection settings belong to its Branches.','customerHierarchy.parentAccount':'Parent Customer Account','customerHierarchy.parentHelp':'This record supplies the Parent Customer ID for every operating or receiving location.','customerHierarchy.locations':'Customer Branches / Locations','customerHierarchy.locationHelp':'Maintain actual operating and receiving details at Branch level.','customerHierarchy.branches':'Branches','customerHierarchy.addCustomer':'Add Customer','customerHierarchy.editCustomer':'Edit Customer','customerHierarchy.addBranch':'Add Customer Branch','customerHierarchy.addFirstBranch':'Add First Branch','customerHierarchy.noBranches':'No Branch exists yet. Every Customer, including a single-location Customer, needs at least one Branch.','customerHierarchy.search':'Search Customer ID, Customer Name, Branch ID or Branch Name','customerHierarchy.branchMatches':'Matching Customer Branches','customerHierarchy.autoId':'Generated automatically on save','customerHierarchy.editorHelp':'Keep the parent account minimal: name and account status only.','customerHierarchy.customerSaved':'Customer saved. Add or review its Branches below.','customerHierarchy.branchSaved':'Customer Branch saved.','customerHierarchy.directory':'Branch Directory','unlinked.title':'Unlinked Branches','unlinked.help':'Legacy Branches without a Parent Customer. Select and confirm each relationship manually; no matching is automatic.','unlinked.total':'Total Branches','unlinked.linked':'Linked','unlinked.unlinked':'Unlinked','unlinked.search':'Search Branch ID, name, Area or address','unlinked.linkAction':'Link to Customer','unlinked.parent':'Selected Parent Customer','unlinked.reason':'Link reason','unlinked.safety':'Only the Parent Customer relationship will change. Branch ID, lifecycle, GPS, Area, Dispatch and Stop history remain unchanged.','unlinked.empty':'There are no unlinked Branches. This review remains available for integrity checks.',
    'common.back':'Back','common.logout':'Log out','common.loading':'Loading…','common.processing':'Processing…',
    'common.save':'Save','common.cancel':'Cancel','common.confirm':'Confirm','common.remove':'Remove','common.warning':'Warning','common.error':'Error',
    'branchLifecycle.stopWarning':'{stops} future or unfinished Stop(s) across {dispatches} Dispatch(es) will remain unchanged.','branchLifecycle.preserveHistory':'This status change will not delete or cancel Dispatches, Stops, Schedules, GPS, prices or other history.','branchLifecycle.reviewTitle':'Inactive & Branch Review','branchLifecycle.reviewHelp':'Review non-operating Branches without deleting any history.','branchLifecycle.operationalStatus':'Operational Status','branchLifecycle.changeStatus':'Change Status','branchLifecycle.openReview':'Open Inactive & Branch Review','branchLifecycle.currentStatus':'Current Status','branchLifecycle.newStatus':'New Status','branchLifecycle.reason':'Reason','branchLifecycle.changedAt':'Status Changed Date','branchLifecycle.changedBy':'Changed By','branchLifecycle.replacedBy':'Replaced By Branch','branchLifecycle.replacementSearch':'Search replacement Branch','branchLifecycle.search':'Search Branch ID, Branch, Customer, Area or address','branchLifecycle.allInactive':'All Inactive','branchLifecycle.withReplacement':'With Replacement','branchLifecycle.withoutReplacement':'Without Replacement','branchLifecycle.lastCollection':'Last Collection Date','branchLifecycle.noCollection':'No completed collection','branchLifecycle.viewEdit':'View / Edit Branch','branchLifecycle.restoreActive':'Restore Active','branchLifecycle.restoreReason':'Restore reason','branchLifecycle.empty':'No Branches match this review.','branchLifecycle.status.ACTIVE':'Active','branchLifecycle.status.TEMPORARILY_PAUSED':'Temporarily Paused','branchLifecycle.status.CLOSED':'Closed / No Longer Operating','branchLifecycle.status.DUPLICATE_REPLACED':'Duplicate / Replaced','branchLifecycle.status.NOT_COLLECTING':'Not Collecting / Never Started','branchLifecycle.status.TEST_INVALID':'Test / Invalid Record',
    'areaRefinement.title':'GPS-assisted Area Refinement','areaRefinement.analyze':'Analyze Area','areaRefinement.analyzing':'Analyzing official GPS and address evidence…','areaRefinement.previewOnly':'Analysis creates a Preview only. Formal Areas and Branch assignments remain unchanged until explicit confirmation.','areaRefinement.reanalyze':'Re-analyze existing child Areas','areaRefinement.total':'Total Branches','areaRefinement.officialGps':'Official GPS','areaRefinement.needGps':'GPS Needed','areaRefinement.createAreas':'Areas to Create','areaRefinement.moveBranches':'Branches to Move','areaRefinement.branch':'Customer / Branch','areaRefinement.current':'Current Area','areaRefinement.suggested':'Suggested Area','areaRefinement.gps':'Official GPS','areaRefinement.addressEvidence':'Road / Locality evidence','areaRefinement.confidence':'Confidence / Reason','areaRefinement.decision':'Manual Decision','areaRefinement.high':'High','areaRefinement.medium':'Medium','areaRefinement.needs_review':'Needs Review','areaRefinement.move':'Move to Suggested Area','areaRefinement.keep':'Keep Current Area','areaRefinement.needsReview':'Needs Review','areaRefinement.refreshNew':'Analyze New GPS Only','areaRefinement.savePreview':'Save Preview Adjustments','areaRefinement.confirmReason':'Confirmation reason (required)','areaRefinement.confirm':'Confirm Area Refinement','areaRefinement.confirmWarning':'This will create formal Areas and move the listed Branches in one transaction. Continue?','areaRefinement.map':'Area refinement GPS map','areaRefinement.mapUnavailable':'Map unavailable. The table Preview remains available.',
    'areaRefinement.zoneTitle':'Zone-level GPS Area Refinement','areaRefinement.analyzeZone':'Analyze Zone Areas','areaRefinement.analyzingZone':'Analyzing all Official GPS Branches within this Zone…','areaRefinement.zonePreviewOnly':'The Zone is a hard boundary. Existing Areas are reference evidence, not analysis boundaries. Analyze creates Preview metadata only.','areaRefinement.reanalyzeConfirmed':'Re-analyze Existing Confirmed Assignments','areaRefinement.existingAreas':'Existing Areas','areaRefinement.suggestedAreas':'Suggested Operational Areas','areaRefinement.renameMerge':'Rename / merge suggested Area','areaRefinement.targetArea':'Target Area name','areaRefinement.applyRenameMerge':'Apply to Preview','areaRefinement.splitHelp':'To split a suggested Area, edit selected Branch rows to a new Area name. No formal data changes until Confirm.','areaRefinement.manualAdjustment':'Manually adjusted during Zone Preview.','areaRefinement.kind.keep':'Keep Existing Area','areaRefinement.kind.move_existing':'Move to Existing Area','areaRefinement.kind.new_area':'Suggested New Area','areaRefinement.kind.needs_review':'Needs Review','areaRefinement.kind.need_gps':'Need Official GPS',
    'common.photo':'Take photo','common.paymentProof':'Payment proof','common.noGoodsReason':'No-goods reason',
    'common.start':'Start','common.arrive':'Arrive','common.complete':'Complete','common.search':'Search',
    'common.discard':'Discard changes','common.continueEditing':'Continue editing','common.unsaved':'You have unsaved changes. Discard them?',
    'auth.login':'Log in','auth.setup':'Create first administrator','auth.setupHelp':'No account exists. Create the first administrator.',
    'auth.loginHelp':'Every employee must use their own account.','auth.adminName':'Administrator name','auth.employeeName':'Employee Name','auth.employeeCode':'Employee code',
    'auth.username':'Username','auth.password':'Password','auth.showPassword':'Show password','auth.hidePassword':'Hide password',
    'auth.created':'Administrator created. Log in with the account you just created.','auth.changePassword':'Change password',
    'auth.firstChange':'Change password on first login','auth.changeHelp':'Complete this step before using KCS.',
    'auth.forcedChangeReason':'This password was issued temporarily or reset by an administrator. You must replace it before using KCS.',
    'auth.changeOptionalHelp':'Update your password here. You can cancel and return without making changes.',
    'auth.systemRole':'System Role','auth.preferredLanguage':'Preferred Language',
    'auth.currentPassword':'Current password','auth.newPassword':'New password','auth.confirmPassword':'Confirm new password',
    'auth.passwordMismatch':'The new passwords do not match.','auth.savePassword':'Save new password',
    'app.loading':'Loading KCS…','app.authUnavailable':'Cannot connect to the login service: {message}',
    'nav.workspace':'Workspace','nav.dashboard':'Dashboard','nav.dispatch':'Weekly Dispatch','nav.special':'Special Collection Requests','nav.buyers':'Buyer Management',
    'nav.customers':'Customers & Locations','nav.schedule':'Collection Schedules','nav.data':'GPS & Data Quality',
    'nav.gpsZone':'GPS Zone Recommendations','nav.resources':'Employees, Vehicles, Locations & Zones','nav.dispatchSchedule':'Dispatch & Collection Schedules','nav.purchaseBills':'Purchase Bills','nav.expenseRecords':'Expense Records','nav.locationGpsZone':'Locations, GPS & Zones','nav.vehicles':'Vehicle Management','nav.materials':'Materials & Prices','nav.staffAccounts':'Employees & Accounts','hub.weekly':'Weekly Dispatch','hub.schedules':'Collection Schedules','hub.employeeRecords':'Employee Records','hub.systemAccounts':'System Accounts','hub.locationsGps':'Locations & GPS Data','hub.buyerMaster':'Buyer Master','hub.areaZone':'Area / Zone Assignment','hub.gpsRecommendations':'GPS Zone Recommendations',
    'nav.gpsMigration':'Legacy GPS Migration','nav.sync':'Jodoo Data Sync','nav.accounts':'Account Management',
    'system.running':'System running','system.waiting':'System waiting for API','system.connecting':'Connecting to API…',
    'system.offline':'API unavailable. Restart KCS.','system.database':'Database v{version} · Jodoo {jodoo}',
    'system.configured':'configured','system.awaiting':'not configured',
    'dashboard.eyebrow':'Operations overview','dashboard.greeting':'Good morning. Start here today.',
    'dashboard.truth':'All figures are live from SQLite.','dashboard.create':'＋ Create today’s dispatch',
    'dashboard.branch':'Customer branches','dashboard.scheduled':'Scheduled','dashboard.gps':'Official GPS','dashboard.ready':'Route Ready','dashboard.gpsToCollect':'GPS To Collect',
    'dashboard.features':'System modules','dashboard.dataState':'Data status','dashboard.needsAction':'Needs action',
    'dashboard.viewAll':'View all','dashboard.loading':'Loading dashboard data…','dashboard.backendError':'API unavailable: {message}',
    'mobile.today':'Today’s Route','mobile.gps':'GPS Capture','mobile.newCustomer':'Temporary Customer','mobile.weight':'Weight','mobile.mine':'My Submissions','mobile.more':'More','mobile.moreGpsHelp':'Capture or correct a Customer Branch GPS location','mobile.moreCustomerHelp':'Submit a new temporary Customer for supervisor review',
    'mobile.weightTakePhoto':'Take weight ticket photo','mobile.weightReading':'Reading weight…','mobile.weightReadOk':'Weight read from photo. Please confirm.','mobile.weightCheck':'The weight was unclear. Please enter it.','mobile.weightKg':'Confirmed weight (kg)','mobile.weightConfirm':'Confirm and save','mobile.weightRetake':'Retake photo','mobile.weightSaved':'Weight record saved.','mobile.weightNoTrip':'No assigned Trip is available today.','mobile.weightLocationUnknown':'Unloading location not set','mobile.weightEstimated':'Estimated load','mobile.weightRecent':'Today’s saved weights','mobile.weightPhotoLarge':'Photo must be no larger than 8 MB.',
    'mobile.searchBranch':'Search Customer / Branch / BranchID','mobile.getGps':'Get current GPS',
    'mobile.officialGps':'Official GPS','mobile.temporaryGps':'Temporary GPS','mobile.available':'Available','mobile.missing':'Missing',
    'mobile.accuracy':'Accuracy','mobile.waitLocation':'Waiting for location','mobile.retryAccuracy':'Try again for better accuracy',
    'mobile.sitePhoto':'Site / signboard photo','mobile.remark':'Remark','mobile.submitGps':'Submit temporary GPS',
    'mobile.selectBranch':'Select a Customer Branch first','mobile.photoRequired':'A site or signboard photo is required',
    'mobile.gpsSaved':'GPS saved as temporary GPS for supervisor approval.','mobile.customerSent':'Temporary customer sent to supervisor.',
    'mobile.customerName':'Customer name','mobile.contact':'Contact person','mobile.phone':'Phone','mobile.address':'Address',
    'mobile.locationLink':'Location link','mobile.captureTemporary':'Capture temporary location','mobile.requestedDate':'Requested collection date',
    'mobile.submitCollection':'Submit pending collection','mobile.routeLoading':'Loading route…',
    'mobile.notPublished':'Today’s route has not been published.','mobile.notApproved':'There is no approved route for today.','mobile.noVehicleAssigned':'No vehicle has been assigned to you today.','mobile.routeStatus':'Route status','mobile.approved':'Approved','mobile.inProgress':'In Progress','mobile.notStarted':'Not Started','mobile.startTrip':'Start Trip','mobile.arrive':'Arrive at Stop','mobile.gettingLocation':'Getting GPS…','mobile.arrivedAt':'Arrived at','mobile.totalStops':'Total stops','mobile.completed':'Completed','mobile.pending':'Pending','mobile.stops':'stops','mobile.notSet':'Not set','mobile.area':'Area','mobile.timeRestriction':'Time restriction','mobile.estimatedWeight':'Estimated weight','mobile.gpsStatus':'GPS','mobile.openMap':'Open in map',
    'mobile.gpsUnsupported':'This browser does not support GPS','mobile.gpsFailed':'Unable to get GPS: {message}',
    'apiError.customer_gps_not_set':'Customer GPS not set, please contact the supervisor.','apiError.arrival_out_of_range':'You are {distanceMeters}m from the Customer; allowed radius is {allowedRadiusMeters}m (GPS accuracy {accuracyMeters}m).','apiError.gps_accuracy_poor':'GPS accuracy is {accuracyMeters}m; please recapture at {maximumAccuracyMeters}m or better.','apiError.gps_capture_stale':'The GPS reading is stale. Please capture your location again.','apiError.stop_sequence_required':'You must arrive at the current Stop first.',
    'planner.week':'Future 7 Days','planner.single':'Daily Dispatch Plan','planner.today':'Today','planner.tomorrow':'Tomorrow','planner.dayAfter':'Day after tomorrow','planner.otherDate':'Other date','planner.updateWeek':'Update 7-day drafts','planner.updateDay':'Update daily draft','planner.loading':'Loading dispatch data…','planner.empty':'No draft for this date','planner.emptyHelp':'Use “Update daily draft” to generate it from BranchSchedule.','planner.special':'＋ Special collection request','planner.description':'Vehicles and crew come from Master data; Area and Default Base are recommendations only.',
    'validation.required':'Please fill in this field.','validation.passwordMin':'Password must be at least {minimum} characters.',
    'validation.fallback':'Missing translation'
  },
  ms: {
    'customerHierarchy.masterHelp':'Pelanggan ialah akaun induk. Alamat, GPS, hubungan, bayaran, harga dan tetapan kutipan adalah milik Cawangan.','customerHierarchy.parentAccount':'Akaun Induk Pelanggan','customerHierarchy.parentHelp':'Rekod ini menyediakan ID Pelanggan Induk untuk setiap lokasi operasi atau penerimaan.','customerHierarchy.locations':'Cawangan / Lokasi Pelanggan','customerHierarchy.locationHelp':'Urus butiran operasi dan penerimaan sebenar pada peringkat Cawangan.','customerHierarchy.branches':'Cawangan','customerHierarchy.addCustomer':'Tambah Pelanggan','customerHierarchy.editCustomer':'Edit Pelanggan','customerHierarchy.addBranch':'Tambah Cawangan Pelanggan','customerHierarchy.addFirstBranch':'Tambah Cawangan Pertama','customerHierarchy.noBranches':'Belum ada Cawangan. Setiap Pelanggan, termasuk satu lokasi sahaja, mesti mempunyai sekurang-kurangnya satu Cawangan.','customerHierarchy.search':'Cari ID Pelanggan, Nama Pelanggan, ID Cawangan atau Nama Cawangan','customerHierarchy.branchMatches':'Cawangan Pelanggan Sepadan','customerHierarchy.autoId':'Dijana secara automatik semasa simpan','customerHierarchy.editorHelp':'Pastikan akaun induk ringkas: nama dan status akaun sahaja.','customerHierarchy.customerSaved':'Pelanggan disimpan. Tambah atau semak Cawangan di bawah.','customerHierarchy.branchSaved':'Cawangan Pelanggan disimpan.','customerHierarchy.directory':'Direktori Cawangan','unlinked.title':'Cawangan Belum Dipautkan','unlinked.help':'Cawangan lama tanpa Pelanggan Induk. Pilih dan sahkan setiap hubungan secara manual; tiada padanan automatik.','unlinked.total':'Jumlah Cawangan','unlinked.linked':'Dipautkan','unlinked.unlinked':'Belum Dipautkan','unlinked.search':'Cari ID Cawangan, nama, Area atau alamat','unlinked.linkAction':'Pautkan kepada Pelanggan','unlinked.parent':'Pelanggan Induk Dipilih','unlinked.reason':'Sebab pemautan','unlinked.safety':'Hanya hubungan Pelanggan Induk akan berubah. ID Cawangan, kitar hayat, GPS, Area, sejarah Dispatch dan Stop kekal.','unlinked.empty':'Tiada Cawangan yang belum dipautkan. Semakan ini kekal tersedia untuk pemeriksaan integriti.',
    'common.back':'Kembali','common.logout':'Log keluar','common.loading':'Memuatkan…','common.processing':'Memproses…',
    'common.save':'Simpan','common.cancel':'Batal','common.confirm':'Sahkan','common.remove':'Alih keluar','common.warning':'Amaran','common.error':'Ralat',
    'branchLifecycle.stopWarning':'{stops} Stop akan datang atau belum selesai dalam {dispatches} Dispatch akan kekal tanpa perubahan.','branchLifecycle.preserveHistory':'Perubahan status ini tidak akan memadam atau membatalkan Dispatch, Stop, Jadual, GPS, harga atau sejarah lain.','branchLifecycle.reviewTitle':'Semakan Cawangan Tidak Aktif','branchLifecycle.reviewHelp':'Semak Cawangan yang tidak beroperasi tanpa memadam sebarang sejarah.','branchLifecycle.operationalStatus':'Status Operasi','branchLifecycle.changeStatus':'Tukar Status','branchLifecycle.openReview':'Buka Semakan Cawangan Tidak Aktif','branchLifecycle.currentStatus':'Status Semasa','branchLifecycle.newStatus':'Status Baharu','branchLifecycle.reason':'Sebab','branchLifecycle.changedAt':'Tarikh Status Diubah','branchLifecycle.changedBy':'Diubah Oleh','branchLifecycle.replacedBy':'Digantikan Oleh Cawangan','branchLifecycle.replacementSearch':'Cari Cawangan pengganti','branchLifecycle.search':'Cari ID Cawangan, Cawangan, Pelanggan, Area atau alamat','branchLifecycle.allInactive':'Semua Tidak Aktif','branchLifecycle.withReplacement':'Dengan Pengganti','branchLifecycle.withoutReplacement':'Tanpa Pengganti','branchLifecycle.lastCollection':'Tarikh Kutipan Terakhir','branchLifecycle.noCollection':'Tiada kutipan selesai','branchLifecycle.viewEdit':'Lihat / Edit Cawangan','branchLifecycle.restoreActive':'Pulihkan Aktif','branchLifecycle.restoreReason':'Sebab pemulihan','branchLifecycle.empty':'Tiada Cawangan sepadan untuk semakan ini.','branchLifecycle.status.ACTIVE':'Aktif','branchLifecycle.status.TEMPORARILY_PAUSED':'Dihentikan Sementara','branchLifecycle.status.CLOSED':'Tutup / Tidak Lagi Beroperasi','branchLifecycle.status.DUPLICATE_REPLACED':'Pendua / Digantikan','branchLifecycle.status.NOT_COLLECTING':'Tidak Mengutip / Belum Pernah Bermula','branchLifecycle.status.TEST_INVALID':'Ujian / Rekod Tidak Sah',
    'areaRefinement.title':'Penyempurnaan Area Berbantu GPS','areaRefinement.analyze':'Analisis Area','areaRefinement.analyzing':'Menganalisis GPS rasmi dan bukti alamat…','areaRefinement.previewOnly':'Analisis hanya menghasilkan Pratonton. Area rasmi dan penetapan Cawangan kekal tidak berubah sehingga pengesahan nyata.','areaRefinement.reanalyze':'Analisis semula Area anak sedia ada','areaRefinement.total':'Jumlah Cawangan','areaRefinement.officialGps':'GPS Rasmi','areaRefinement.needGps':'GPS Diperlukan','areaRefinement.createAreas':'Area untuk Dicipta','areaRefinement.moveBranches':'Cawangan untuk Dipindah','areaRefinement.branch':'Pelanggan / Cawangan','areaRefinement.current':'Area Semasa','areaRefinement.suggested':'Area Dicadangkan','areaRefinement.gps':'GPS Rasmi','areaRefinement.addressEvidence':'Bukti Jalan / Lokaliti','areaRefinement.confidence':'Keyakinan / Sebab','areaRefinement.decision':'Keputusan Manual','areaRefinement.high':'Tinggi','areaRefinement.medium':'Sederhana','areaRefinement.needs_review':'Perlu Semakan','areaRefinement.move':'Pindah ke Area Dicadangkan','areaRefinement.keep':'Kekalkan Area Semasa','areaRefinement.needsReview':'Perlu Semakan','areaRefinement.refreshNew':'Analisis GPS Baharu Sahaja','areaRefinement.savePreview':'Simpan Pelarasan Pratonton','areaRefinement.confirmReason':'Sebab pengesahan (wajib)','areaRefinement.confirm':'Sahkan Penyempurnaan Area','areaRefinement.confirmWarning':'Ini akan mencipta Area rasmi dan memindahkan Cawangan tersenarai dalam satu transaksi. Teruskan?','areaRefinement.map':'Peta GPS penyempurnaan Area','areaRefinement.mapUnavailable':'Peta tidak tersedia. Pratonton jadual masih boleh digunakan.',
    'areaRefinement.zoneTitle':'Penyempurnaan Area GPS Peringkat Zon','areaRefinement.analyzeZone':'Analisis Area dalam Zon','areaRefinement.analyzingZone':'Menganalisis semua Cawangan ber-GPS Rasmi dalam Zon ini…','areaRefinement.zonePreviewOnly':'Zon ialah sempadan tetap. Area sedia ada hanya bukti rujukan, bukan sempadan analisis. Analisis hanya mencipta metadata Pratonton.','areaRefinement.reanalyzeConfirmed':'Analisis Semula Penetapan yang Telah Disahkan','areaRefinement.existingAreas':'Area Sedia Ada','areaRefinement.suggestedAreas':'Area Operasi Dicadangkan','areaRefinement.renameMerge':'Namakan semula / gabung Area cadangan','areaRefinement.targetArea':'Nama Area sasaran','areaRefinement.applyRenameMerge':'Guna pada Pratonton','areaRefinement.splitHelp':'Untuk memisahkan Area cadangan, ubah baris Cawangan terpilih kepada nama Area baharu. Tiada data rasmi berubah sebelum Pengesahan.','areaRefinement.manualAdjustment':'Dilaraskan secara manual semasa Pratonton Zon.','areaRefinement.kind.keep':'Kekalkan Area Sedia Ada','areaRefinement.kind.move_existing':'Pindah ke Area Sedia Ada','areaRefinement.kind.new_area':'Area Baharu Dicadangkan','areaRefinement.kind.needs_review':'Perlu Semakan','areaRefinement.kind.need_gps':'Perlu GPS Rasmi',
    'common.photo':'Ambil gambar','common.paymentProof':'Bukti bayaran','common.noGoodsReason':'Sebab tiada barang',
    'common.start':'Mula','common.arrive':'Tiba','common.complete':'Selesai','common.search':'Cari',
    'common.discard':'Buang perubahan','common.continueEditing':'Teruskan mengedit','common.unsaved':'Terdapat perubahan belum disimpan. Buang perubahan?',
    'auth.login':'Log masuk','auth.setup':'Cipta pentadbir pertama','auth.setupHelp':'Tiada akaun. Cipta pentadbir pertama.',
    'auth.loginHelp':'Setiap pekerja mesti menggunakan akaun sendiri.','auth.adminName':'Nama pentadbir','auth.employeeName':'Nama Pekerja','auth.employeeCode':'Kod pekerja',
    'auth.username':'Nama pengguna','auth.password':'Kata laluan','auth.showPassword':'Tunjukkan kata laluan','auth.hidePassword':'Sembunyikan kata laluan',
    'auth.created':'Pentadbir telah dicipta. Sila log masuk.','auth.changePassword':'Tukar kata laluan',
    'auth.firstChange':'Tukar kata laluan kali pertama','auth.changeHelp':'Selesaikan langkah ini sebelum menggunakan KCS.',
    'auth.forcedChangeReason':'Kata laluan ini ialah kata laluan sementara atau telah ditetapkan semula oleh pentadbir. Anda mesti menukarnya sebelum menggunakan KCS.',
    'auth.changeOptionalHelp':'Tukar kata laluan anda di sini. Anda boleh batal dan kembali tanpa membuat perubahan.',
    'auth.systemRole':'Peranan Sistem','auth.preferredLanguage':'Bahasa Pilihan',
    'auth.currentPassword':'Kata laluan semasa','auth.newPassword':'Kata laluan baharu','auth.confirmPassword':'Sahkan kata laluan baharu',
    'auth.passwordMismatch':'Kata laluan baharu tidak sama.','auth.savePassword':'Simpan kata laluan baharu',
    'app.loading':'Memuatkan KCS…','app.authUnavailable':'Tidak dapat menyambung ke perkhidmatan log masuk: {message}',
    'nav.workspace':'Ruang kerja','nav.dashboard':'Ringkasan','nav.dispatch':'Penghantaran Mingguan','nav.special':'Permintaan Kutipan Khas','nav.buyers':'Pengurusan Buyer',
    'nav.customers':'Pelanggan & Lokasi','nav.schedule':'Jadual Kutipan','nav.data':'GPS & Kualiti Data',
    'nav.gpsZone':'Cadangan Zon GPS','nav.resources':'Pekerja, Kenderaan, Lokasi & Zon','nav.dispatchSchedule':'Penghantaran & Jadual Kutipan','nav.purchaseBills':'Purchase Bills','nav.expenseRecords':'Expense Records','nav.locationGpsZone':'Lokasi, GPS & Zon','nav.vehicles':'Pengurusan Kenderaan','nav.materials':'Bahan & Harga','nav.staffAccounts':'Pekerja & Akaun','hub.weekly':'Penghantaran Mingguan','hub.schedules':'Jadual Kutipan','hub.employeeRecords':'Rekod Pekerja','hub.systemAccounts':'Akaun Sistem','hub.locationsGps':'Data Lokasi & GPS','hub.buyerMaster':'Pengurusan Buyer','hub.areaZone':'Penetapan Area / Zon','hub.gpsRecommendations':'Cadangan Zon GPS','nav.gpsMigration':'Migrasi GPS Lama','nav.sync':'Penyegerakan Data Jodoo','nav.accounts':'Pengurusan Akaun',
    'system.running':'Sistem beroperasi','system.waiting':'Menunggu API','system.connecting':'Menyambung ke API…',
    'system.offline':'API tidak tersedia. Mulakan semula KCS.','system.database':'Pangkalan data v{version} · Jodoo {jodoo}',
    'system.configured':'dikonfigurasi','system.awaiting':'belum dikonfigurasi',
    'dashboard.eyebrow':'Ringkasan operasi','dashboard.greeting':'Selamat pagi. Mulakan di sini.',
    'dashboard.truth':'Semua angka dibaca terus daripada SQLite.','dashboard.create':'＋ Cipta penghantaran hari ini',
    'dashboard.branch':'Cawangan pelanggan','dashboard.scheduled':'Ada jadual','dashboard.gps':'GPS rasmi','dashboard.ready':'Sedia Laluan','dashboard.gpsToCollect':'GPS Belum Dikumpul',
    'dashboard.features':'Modul sistem','dashboard.dataState':'Status data','dashboard.needsAction':'Perlu tindakan',
    'dashboard.viewAll':'Lihat semua','dashboard.loading':'Memuatkan data ringkasan…','dashboard.backendError':'API tidak tersedia: {message}',
    'mobile.today':'Laluan Hari Ini','mobile.gps':'Ambil GPS','mobile.newCustomer':'Pelanggan Sementara','mobile.weight':'Weight','mobile.mine':'Hantaran Saya','mobile.more':'Lagi','mobile.moreGpsHelp':'Ambil atau betulkan lokasi GPS Customer Branch','mobile.moreCustomerHelp':'Hantar Pelanggan sementara baharu untuk semakan penyelia',
    'mobile.weightTakePhoto':'Ambil gambar tiket timbang','mobile.weightReading':'Membaca berat…','mobile.weightReadOk':'Berat dibaca. Sila sahkan.','mobile.weightCheck':'Berat tidak jelas. Sila masukkan.','mobile.weightKg':'Berat disahkan (kg)','mobile.weightConfirm':'Sahkan dan simpan','mobile.weightRetake':'Ambil semula','mobile.weightSaved':'Rekod berat disimpan.','mobile.weightNoTrip':'Tiada Trip ditugaskan hari ini.','mobile.weightLocationUnknown':'Lokasi memunggah belum ditetapkan','mobile.weightEstimated':'Anggaran muatan','mobile.weightRecent':'Berat disimpan hari ini','mobile.weightPhotoLarge':'Gambar mesti tidak melebihi 8 MB.',
    'mobile.searchBranch':'Cari Pelanggan / Cawangan / BranchID','mobile.getGps':'Dapatkan GPS semasa',
    'mobile.officialGps':'GPS rasmi','mobile.temporaryGps':'GPS sementara','mobile.available':'Ada','mobile.missing':'Tiada',
    'mobile.accuracy':'Ketepatan','mobile.waitLocation':'Menunggu lokasi','mobile.retryAccuracy':'Cuba semula untuk ketepatan lebih baik',
    'mobile.sitePhoto':'Gambar tapak / papan tanda','mobile.remark':'Catatan','mobile.submitGps':'Hantar GPS sementara',
    'mobile.selectBranch':'Pilih Customer Branch dahulu','mobile.photoRequired':'Gambar tapak atau papan tanda diperlukan',
    'mobile.gpsSaved':'GPS disimpan sebagai GPS sementara untuk kelulusan penyelia.','mobile.customerSent':'Pelanggan sementara dihantar kepada penyelia.',
    'mobile.customerName':'Nama pelanggan','mobile.contact':'Orang untuk dihubungi','mobile.phone':'Telefon','mobile.address':'Alamat',
    'mobile.locationLink':'Pautan lokasi','mobile.captureTemporary':'Ambil lokasi sementara','mobile.requestedDate':'Tarikh kutipan diminta',
    'mobile.submitCollection':'Hantar kutipan menunggu','mobile.routeLoading':'Memuatkan laluan…',
    'mobile.notPublished':'Laluan hari ini belum diterbitkan.','mobile.notApproved':'Tiada laluan yang diluluskan untuk hari ini.','mobile.noVehicleAssigned':'Tiada kenderaan diberikan kepada anda hari ini.','mobile.routeStatus':'Status laluan','mobile.approved':'Diluluskan','mobile.inProgress':'Sedang Berjalan','mobile.notStarted':'Belum Bermula','mobile.startTrip':'Mulakan Trip','mobile.arrive':'Tiba di Hentian','mobile.gettingLocation':'Mendapatkan GPS…','mobile.arrivedAt':'Tiba pada','mobile.totalStops':'Jumlah hentian','mobile.completed':'Selesai','mobile.pending':'Belum selesai','mobile.stops':'hentian','mobile.notSet':'Belum ditetapkan','mobile.area':'Area','mobile.timeRestriction':'Had masa','mobile.estimatedWeight':'Anggaran berat','mobile.gpsStatus':'GPS','mobile.openMap':'Buka dalam peta',
    'mobile.gpsUnsupported':'Pelayar ini tidak menyokong GPS','mobile.gpsFailed':'Tidak dapat memperoleh GPS: {message}',
    'apiError.customer_gps_not_set':'GPS pelanggan belum ditetapkan. Sila hubungi penyelia.','apiError.arrival_out_of_range':'Anda berada {distanceMeters}m dari pelanggan; radius dibenarkan ialah {allowedRadiusMeters}m (ketepatan GPS {accuracyMeters}m).','apiError.gps_accuracy_poor':'Ketepatan GPS ialah {accuracyMeters}m; sila ambil semula pada {maximumAccuracyMeters}m atau lebih baik.','apiError.gps_capture_stale':'Bacaan GPS sudah lama. Sila dapatkan lokasi sekali lagi.','apiError.stop_sequence_required':'Anda mesti tiba di hentian semasa dahulu.',
    'planner.week':'7 Hari Akan Datang','planner.single':'Pelan Penghantaran Harian','planner.today':'Hari ini','planner.tomorrow':'Esok','planner.dayAfter':'Lusa','planner.otherDate':'Tarikh lain','planner.updateWeek':'Kemas kini draf 7 hari','planner.updateDay':'Kemas kini draf harian','planner.loading':'Memuatkan data penghantaran…','planner.empty':'Tiada draf untuk tarikh ini','planner.emptyHelp':'Gunakan “Kemas kini draf harian” untuk menjana daripada BranchSchedule.','planner.special':'＋ Permintaan kutipan khas','planner.description':'Kenderaan dan kru daripada data Master; Area dan Default Base hanya cadangan.',
    'validation.required':'Sila isi ruangan ini.','validation.passwordMin':'Kata laluan mesti sekurang-kurangnya {minimum} aksara.','validation.fallback':'Terjemahan tiada'
  },
  zh: {
    'customerHierarchy.masterHelp':'Customer 是主体户口；地址、GPS、联系人、付款、价格和收货安排都属于下属 Branch。','customerHierarchy.parentAccount':'Parent Customer 主体户口','customerHierarchy.parentHelp':'此主档只为每个实际营运或收货地点提供 Parent Customer ID。','customerHierarchy.locations':'客户分店 / 营运地点','customerHierarchy.locationHelp':'实际营运与收货资料统一在 Branch 层维护。','customerHierarchy.branches':'家分店','customerHierarchy.addCustomer':'新增 Customer','customerHierarchy.editCustomer':'编辑 Customer','customerHierarchy.addBranch':'新增客户分店','customerHierarchy.addFirstBranch':'新增首家分店','customerHierarchy.noBranches':'目前没有 Branch。即使客户只有一个地点，也必须建立一笔 Branch。','customerHierarchy.search':'搜索 Customer ID、Customer名称、Branch ID 或 Branch名称','customerHierarchy.branchMatches':'符合搜索的客户分店','customerHierarchy.autoId':'保存时由系统自动产生','customerHierarchy.editorHelp':'主体户口保持极简：只维护名称和户口状态。','customerHierarchy.customerSaved':'Customer 已保存，请在下方新增或检查 Branch。','customerHierarchy.branchSaved':'客户分店已保存。','customerHierarchy.directory':'全部分店','unlinked.title':'未关联分店','unlinked.help':'这些是没有 Parent Customer 的旧 Branch；必须逐笔人工选择和确认，系统不会自动猜测。','unlinked.total':'Branch总数','unlinked.linked':'已关联','unlinked.unlinked':'未关联','unlinked.search':'搜索 Branch ID、名称、Area 或地址','unlinked.linkAction':'关联至 Customer','unlinked.parent':'选择 Parent Customer','unlinked.reason':'关联原因','unlinked.safety':'只补 Parent Customer 关系；Branch ID、Lifecycle、GPS、Area、Dispatch 与 Stops 历史全部保持不变。','unlinked.empty':'目前没有未关联 Branch；此页面会继续保留作完整性检查。',
    'common.back':'返回','common.logout':'退出','common.loading':'载入中…','common.processing':'处理中…','common.save':'保存',
    'common.cancel':'取消','common.confirm':'确认','common.remove':'移除','common.warning':'警告','common.error':'错误','common.photo':'拍照',
    'branchLifecycle.stopWarning':'{dispatches} 个派车中的 {stops} 个未来或未完成 Stop 将保持不变。','branchLifecycle.preserveHistory':'本次状态修改不会删除或取消 Dispatch、Stop、Schedule、GPS、价格或其他历史资料。','branchLifecycle.reviewTitle':'非营运与分店检查','branchLifecycle.reviewHelp':'统一检查非营运Branch，并保留所有历史资料。','branchLifecycle.operationalStatus':'营运状态','branchLifecycle.changeStatus':'修改状态','branchLifecycle.openReview':'打开非营运与分店检查','branchLifecycle.currentStatus':'当前状态','branchLifecycle.newStatus':'新状态','branchLifecycle.reason':'原因','branchLifecycle.changedAt':'状态修改日期','branchLifecycle.changedBy':'修改人','branchLifecycle.replacedBy':'取代此资料的Branch','branchLifecycle.replacementSearch':'搜索正式替代Branch','branchLifecycle.search':'搜索Branch ID、Branch、Customer、Area或地址','branchLifecycle.allInactive':'全部非营运','branchLifecycle.withReplacement':'已有替代Branch','branchLifecycle.withoutReplacement':'没有替代Branch','branchLifecycle.lastCollection':'最后完成收货日期','branchLifecycle.noCollection':'没有已完成收货','branchLifecycle.viewEdit':'查看／编辑Branch','branchLifecycle.restoreActive':'恢复营运','branchLifecycle.restoreReason':'恢复原因','branchLifecycle.empty':'没有符合此检查条件的Branch。','branchLifecycle.status.ACTIVE':'营运中','branchLifecycle.status.TEMPORARILY_PAUSED':'暂时停止收货','branchLifecycle.status.CLOSED':'已停止营业','branchLifecycle.status.DUPLICATE_REPLACED':'重复 / 已被取代','branchLifecycle.status.NOT_COLLECTING':'未收货 / 从未开始','branchLifecycle.status.TEST_INVALID':'测试 / 无效资料',
    'areaRefinement.title':'GPS辅助细分Area','areaRefinement.analyze':'分析Area','areaRefinement.analyzing':'正在分析正式GPS与地址证据…','areaRefinement.previewOnly':'分析只建立Preview；正式Area及Branch归属只有明确确认后才会变更。','areaRefinement.reanalyze':'重新分析现有子Area','areaRefinement.total':'Branch总数','areaRefinement.officialGps':'正式GPS','areaRefinement.needGps':'需要GPS','areaRefinement.createAreas':'将新增Area','areaRefinement.moveBranches':'将移动Branch','areaRefinement.branch':'Customer / Branch','areaRefinement.current':'当前Area','areaRefinement.suggested':'建议Area','areaRefinement.gps':'正式GPS','areaRefinement.addressEvidence':'道路／地区证据','areaRefinement.confidence':'可信度／原因','areaRefinement.decision':'人工决定','areaRefinement.high':'高','areaRefinement.medium':'中','areaRefinement.needs_review':'需人工确认','areaRefinement.move':'移动到建议Area','areaRefinement.keep':'保留当前Area','areaRefinement.needsReview':'需人工确认','areaRefinement.refreshNew':'只分析新增GPS','areaRefinement.savePreview':'保存Preview调整','areaRefinement.confirmReason':'确认原因（必填）','areaRefinement.confirm':'确认Area细分','areaRefinement.confirmWarning':'这会在同一事务中建立正式Area并移动所列Branch。是否继续？','areaRefinement.map':'Area细分GPS地图','areaRefinement.mapUnavailable':'地图无法使用，仍可使用表格Preview。',
    'areaRefinement.zoneTitle':'Zone级GPS Area细分','areaRefinement.analyzeZone':'分析整个Zone的Area','areaRefinement.analyzingZone':'正在分析此Zone内所有拥有正式GPS的Branch…','areaRefinement.zonePreviewOnly':'Zone是硬边界；现有Area只是参考证据，不是分析边界。Analyze只新增Preview metadata。','areaRefinement.reanalyzeConfirmed':'重新分析现有已确认归属','areaRefinement.existingAreas':'现有Area','areaRefinement.suggestedAreas':'建议营运Area','areaRefinement.renameMerge':'重命名／合并建议Area','areaRefinement.targetArea':'目标Area名称','areaRefinement.applyRenameMerge':'应用到Preview','areaRefinement.splitHelp':'如需拆分建议Area，请把选定Branch行改为新的Area名称。Confirm前不会修改正式资料。','areaRefinement.manualAdjustment':'在Zone Preview中人工调整。','areaRefinement.kind.keep':'保留现有Area','areaRefinement.kind.move_existing':'移动到现有Area','areaRefinement.kind.new_area':'建议新Area','areaRefinement.kind.needs_review':'需人工确认','areaRefinement.kind.need_gps':'需要正式GPS',
    'common.paymentProof':'付款凭证','common.noGoodsReason':'无货原因','common.start':'开始','common.arrive':'到达','common.complete':'完成',
    'common.search':'搜索','common.discard':'放弃修改','common.continueEditing':'继续编辑','common.unsaved':'有尚未保存的修改，确定放弃吗？',
    'auth.login':'登录','auth.setup':'首次建立管理员','auth.setupHelp':'系统没有账号，请先建立第一位管理员。',
    'auth.loginHelp':'每位员工必须使用自己的账号登录。','auth.adminName':'管理员姓名','auth.employeeName':'员工姓名','auth.employeeCode':'员工编号',
    'auth.username':'用户名','auth.password':'密码','auth.showPassword':'显示密码','auth.hidePassword':'隐藏密码',
    'auth.created':'管理员已建立，请使用刚才的账号登录。','auth.changePassword':'修改密码',
    'auth.firstChange':'首次登录修改密码','auth.changeHelp':'完成修改后才能使用系统。','auth.currentPassword':'当前密码',
    'auth.forcedChangeReason':'此密码是首次临时密码或由管理员重设。完成修改后才能继续使用 KCS。',
    'auth.changeOptionalHelp':'你可以在这里主动修改密码，也可以取消并返回，不会被强制提交。',
    'auth.systemRole':'系统权限角色','auth.preferredLanguage':'首选语言',
    'auth.newPassword':'新密码','auth.confirmPassword':'确认新密码','auth.passwordMismatch':'两次新密码不一致','auth.savePassword':'保存新密码',
    'app.loading':'KCS 载入中…','app.authUnavailable':'无法连接登录服务：{message}',
    'nav.workspace':'工作台','nav.dashboard':'总览','nav.dispatch':'一周派车','nav.special':'临时收货请求','nav.buyers':'Buyer 管理',
    'nav.customers':'客户与营运地点','nav.schedule':'收货排程','nav.data':'GPS 与资料','nav.gpsZone':'GPS Zone 建议',
    'nav.resources':'员工、车辆、地点与区域','nav.dispatchSchedule':'派车与收货排程','nav.purchaseBills':'Purchase Bills','nav.expenseRecords':'Expense Records','nav.locationGpsZone':'地点、GPS与区域','nav.vehicles':'车辆管理','nav.materials':'货物与价格','nav.staffAccounts':'员工与账号','hub.weekly':'一周派车','hub.schedules':'收货排程','hub.employeeRecords':'员工档案','hub.systemAccounts':'系统账号','hub.locationsGps':'地点与GPS资料','hub.buyerMaster':'Buyer 管理','hub.areaZone':'Area／Zone归属','hub.gpsRecommendations':'GPS Zone建议','nav.gpsMigration':'旧 GPS 迁移','nav.sync':'Jodoo 资料同步','nav.accounts':'账号管理',
    'system.running':'系统运行中','system.waiting':'系统等待后台','system.connecting':'后台连接中…',
    'system.offline':'后台未连接，请重新启动系统','system.database':'数据库 v{version} · Jodoo {jodoo}',
    'system.configured':'已配置','system.awaiting':'等待配置',
    'dashboard.eyebrow':'运营总览','dashboard.greeting':'早安，今天从这里开始。','dashboard.truth':'所有数字来自 SQLite 实时资料。',
    'dashboard.create':'＋ 建立今日派车','dashboard.branch':'客户分店','dashboard.scheduled':'已有排程','dashboard.gps':'已有 GPS',
    'dashboard.ready':'Route Ready','dashboard.gpsToCollect':'待采集GPS','dashboard.features':'系统模块','dashboard.dataState':'资料状态','dashboard.needsAction':'需要处理',
    'dashboard.viewAll':'查看全部','dashboard.loading':'Dashboard 资料载入中…','dashboard.backendError':'后台无法连接：{message}',
    'mobile.today':'今日路线','mobile.gps':'GPS采集','mobile.newCustomer':'临时客户','mobile.weight':'Weight','mobile.mine':'我的提交','mobile.more':'More','mobile.moreGpsHelp':'采集或校正 Customer Branch GPS','mobile.moreCustomerHelp':'提交新的临时客户给主管审核',
    'mobile.weightTakePhoto':'拍摄卸货磅单','mobile.weightReading':'正在读取重量…','mobile.weightReadOk':'已从相片读取重量，请确认。','mobile.weightCheck':'重量不清楚，请输入正确重量。','mobile.weightKg':'确认重量（kg）','mobile.weightConfirm':'确认并保存','mobile.weightRetake':'重新拍照','mobile.weightSaved':'卸货重量已保存。','mobile.weightNoTrip':'今天没有已分配的 Trip。','mobile.weightLocationUnknown':'未设卸货地点','mobile.weightEstimated':'系统估计载重','mobile.weightRecent':'今天已保存重量','mobile.weightPhotoLarge':'相片不可超过 8 MB。',
    'mobile.searchBranch':'搜索 Customer / Branch / BranchID','mobile.getGps':'取得当前 GPS','mobile.officialGps':'official GPS',
    'mobile.temporaryGps':'temporary GPS','mobile.available':'已有','mobile.missing':'未有','mobile.accuracy':'准确度',
    'mobile.waitLocation':'等待定位','mobile.retryAccuracy':'建议重新定位','mobile.sitePhoto':'现场/招牌照片',
    'mobile.remark':'备注','mobile.submitGps':'提交 temporary GPS','mobile.selectBranch':'请先选择 Customer Branch',
    'mobile.photoRequired':'必须上传现场或招牌照片','mobile.gpsSaved':'GPS 已保存为 temporary GPS，等待主管审批。',
    'mobile.customerSent':'临时新客户已送交主管。','mobile.customerName':'客户名称','mobile.contact':'联系人','mobile.phone':'电话',
    'mobile.address':'地址','mobile.locationLink':'Location Link','mobile.captureTemporary':'采集临时 Location',
    'mobile.requestedDate':'预计收货日期','mobile.submitCollection':'提交 Pending Collection','mobile.routeLoading':'载入中…',
    'mobile.notPublished':'今天尚未发布路线。','mobile.notApproved':'今天没有已批准路线。','mobile.noVehicleAssigned':'今天尚未分配车辆。','mobile.routeStatus':'路线状态','mobile.approved':'已批准','mobile.inProgress':'进行中','mobile.notStarted':'尚未开始','mobile.startTrip':'开始Trip','mobile.arrive':'确认到达','mobile.gettingLocation':'正在取得GPS…','mobile.arrivedAt':'到达时间','mobile.totalStops':'总停靠点','mobile.completed':'已完成','mobile.pending':'待处理','mobile.stops':'个停靠点','mobile.notSet':'未设定','mobile.area':'区域','mobile.timeRestriction':'时间限制','mobile.estimatedWeight':'预计重量','mobile.gpsStatus':'GPS','mobile.openMap':'在地图打开',
    'mobile.gpsUnsupported':'浏览器不支持 GPS','mobile.gpsFailed':'无法取得 GPS：{message}',
    'apiError.customer_gps_not_set':'Customer GPS尚未设定，请联系主管。','apiError.arrival_out_of_range':'目前距离Customer {distanceMeters}米；允许范围为{allowedRadiusMeters}米（GPS准确度{accuracyMeters}米）。','apiError.gps_accuracy_poor':'GPS准确度为{accuracyMeters}米，请重新定位至{maximumAccuracyMeters}米或更佳。','apiError.gps_capture_stale':'GPS定位资料已过时，请重新取得位置。','apiError.stop_sequence_required':'必须先到达当前Stop。',
    'planner.week':'未来 7 天派车','planner.single':'单日派车计划','planner.today':'今天','planner.tomorrow':'明天','planner.dayAfter':'后天','planner.otherDate':'其他日期','planner.updateWeek':'更新 7 天草稿','planner.updateDay':'更新当天草稿','planner.loading':'派车资料载入中…','planner.empty':'该日期尚未产生草稿','planner.emptyHelp':'按“更新当天草稿”从 BranchSchedule 建立所选日期。','planner.special':'＋ 临时收货请求','planner.description':'车辆、Driver 与 Assistant/Crew 均来自 Master；Area 与 Default Base 只作建议。',
    'validation.required':'请填写此字段。','validation.passwordMin':'密码至少需要 {minimum} 个字符。','validation.fallback':'缺少翻译'
  }
}

const moduleMessages={
  en:{
    'app.pageError':'KCS page error','app.pageErrorHelp':'The page could not continue safely. Reload it; if the problem continues, restart KCS.','app.reload':'Reload','app.unknownPageError':'Unknown page error',
    'common.language':'Language','common.close':'Close','common.add':'Add','common.edit':'Edit','common.view':'View','common.refresh':'Refresh','common.download':'Download','common.upload':'Upload','common.export':'Export','common.import':'Import','common.all':'All','common.none':'None','common.yes':'Yes','common.no':'No','common.enabled':'Enabled','common.disabled':'Disabled','common.active':'Active','common.inactive':'Inactive','common.paused':'Paused','common.closed':'Closed','common.status':'Status','common.actions':'Actions','common.details':'Details','common.notSet':'Not set','common.noData':'No matching data.','common.loadFailed':'Unable to load data.','common.saved':'Saved successfully.','common.operationFailed':'The operation could not be completed.','common.reason':'Reason','common.name':'Name','common.address':'Address','common.phone':'Phone','common.date':'Date','common.notes':'Notes','common.select':'Select','common.clear':'Clear','common.previous':'Previous','common.next':'Next',
    'list.selected':'{count} selected','list.selectAll':'Select all visible rows','list.selectRow':'Select row','list.sortAsc':'Sort ascending','list.sortDesc':'Sort descending','list.clearSort':'Clear sort','list.clearFilter':'Clear filter','list.actions':'Actions','list.details':'Details','list.expand':'Expand details','list.collapse':'Collapse details','list.copy':'Copy','list.copied':'Copied','list.columns':'Columns','list.closeColumns':'Close column chooser','list.resetColumns':'Reset Columns','list.noResults':'No records match the current search or filters.','list.activeOnly':'Active only','list.includeInactive':'Include non-operating Branches','list.customerId':'Customer ID','list.customerName':'Customer Name','list.branchId':'Branch ID','list.branchName':'Branch Name','list.status':'Status','list.branchCount':'Branch Count','list.phone':'Phone','list.payment':'Payment','list.customer':'Customer','list.area':'Area','list.lifecycleStatus':'Lifecycle Status','list.gpsStatus':'GPS Status','list.materialsCount':'Materials Count','list.contact':'Contact Person','list.address':'Address','list.notes':'Notes','list.updatedAt':'Updated Date','list.employeeId':'Employee ID','list.employeeName':'Employee Name','list.mainJobRole':'Main Job Role','list.accountStatus':'Account Status','list.permissions':'Permissions','list.createdAt':'Created Date','list.lastLogin':'Last Login','list.audit':'Audit Summary','list.failedLogins':'failed logins','list.searchAccounts':'Search Employee ID, employee, username or role','branchEditor.unsavedLeave':'There are unsaved changes. Are you sure you want to leave?',
    'branchEditor.openCustomer':'Open Customer','branchEditor.inheritedPricing':'Inherited Customer Materials & Prices','branchEditor.inheritedHelp':'Read only. Materials and prices are inherited automatically from this Branch’s Customer.','branchEditor.standard':'Standard','branchEditor.outstation':'Outstation','branchEditor.editBranch':'Edit Branch','branchEditor.viewBranch':'View Branch','branchEditor.readOnly':'Read Only','branchEditor.addBranch':'Add Customer Branch','branchEditor.saveBranch':'Save Customer Branch','branchEditor.duplicateMaterial':'The same Material cannot be added twice to one Branch.','branchLifecycle.restoreReasonRequired':'Restore reason is required.','branchLifecycle.reasonRequired':'Status change reason is required.','branchLifecycle.replacementRequired':'Replaced By Branch is required.','branchLifecycle.closedStandardReason':'The audit will record: Closed / No Longer Operating.','branchLifecycle.viewHistory':'View Status History',
    'list.customerMasterTitle':'Customer Master','list.branchMasterTitle':'Customer Branch Master','list.email':'Email','list.gps.set':'GPS Set','list.gps.notSet':'GPS Not Set',
    'account.title':'Account Management','account.description':'System Role is separate from Primary Job Role. Owner Admin controls usernames and roles.','account.create':'Create employee account','account.selectEmployee':'Select active employee','account.selectAccount':'Select an account.','account.temporaryPassword':'Temporary password','account.createAction':'Create account','account.unlock':'Unlock','account.resetPassword':'Reset password','account.updated':'Account updated and audit recorded.','account.created':'Account created. The employee must change the temporary password at first login.',
    'customer.title':'Customer Master & Operational Locations','customer.description':'KCS is the master source for customers and operational locations. Important changes are audited.','customer.add':'Add customer','customer.ready':'Effective','customer.reviewRequired':'Legacy conflict review required','customer.priceType':'Applied Price Type','customer.materialPricing':'Customer Material Pricing','customer.materialHelp':'Each material requires a Standard Price. Enable Outstation Price only when needed.','customer.noPricing':'No Customer Material Pricing has been configured.','customer.sort':'Sort','customer.sortCategory':'Material Category','customer.uncategorized':'Uncategorized','customer.sortDefault':'System Order','customer.sortName':'Name A–Z','customer.sortPriceAsc':'Price Low to High','customer.sortPriceDesc':'Price High to Low','customer.specialPrice':'Customer Special Price','customer.audit':'Audit history','customer.editTitle':'Edit Customer','customer.addTitle':'Add Customer','customer.editorHelp':'Standard and Outstation settings apply to the entire Customer. Do not create regional duplicates.','customer.duplicateMaterial':'The same Material cannot be configured twice for one Customer.','customer.confirmAffected':'This price change may affect up to {count} Branches. Confirm again.','customer.reasonPrompt':'Enter a reason for the price change','customer.reasonDefault':'Customer pricing review','customer.branchesAffected':'Inherited Branches','customer.save':'Save Customer',
    'branch.title':'Customer Branches','branch.add':'Add branch','branch.search':'Search Customer, Branch, BranchID, phone or address','branch.materials':'Materials & Current Prices','branch.materialHelp':'A Branch selects the Customer material and Standard or Outstation type; the actual price is not duplicated.','branch.frequency':'Collection Frequency','branch.weekdays':'Assigned Weekdays','branch.onCallHelp':'On Call does not enter the fixed weekly route. Use Request Collection.','branch.pausedHelp':'Paused branches do not enter automatic scheduling.','branch.viewEdit':'View / Edit',
    'material.title':'Materials & Prices','material.description':'Select a Material first, then manage its Price Levels.','material.add':'Add Material','material.addLevel':'Add Price Level','material.addOccPriceGroup':'＋ Add Price Group','material.occPrice':'OCC Price','material.occPriceCreated':'OCC Price Group created:','material.bulkUpdate':'Bulk price update','material.affectedBranches':'Affected branches','material.currentPrice':'Current Price','material.priceLevel':'Select shared Price Level','material.newPrice':'New price (RM/kg)','material.effectiveDate':'Effective Date (YYYY-MM-DD)','material.changeReason':'Modification reason','material.readOnly':'This account can view prices only. Price management requires an Administrator or authorised Supervisor.','material.remove':'Remove','material.standard':'Standard Price','material.outstation':'Outstation Price','material.enableOutstation':'Enable Outstation Price','occLegacy.title':'Legacy OCC Price Group Archive','occLegacy.subtitle':'Historical OCC groups and their former Branch membership.','occLegacy.usedOnly':'Only price groups currently used by Branches are shown.','occLegacy.showUnused':'Show unused price groups','occLegacy.readOnly':'Legacy archive — read only','occLegacy.help':'These old OCC groups are retained only for history and reference. For operational setup, go to Customer Master, open the Customer, then use Customer Material Pricing.','occLegacy.openCustomers':'Open Customer Master → Customer Material Pricing','occLegacy.backToArchive':'Back to legacy OCC archive','occLegacy.backToMaterials':'Back to Material Categories','occLegacy.group':'Group','occLegacy.branches':'Branches','occLegacy.previous':'previously','occLegacy.customerCode':'Customer Code','occLegacy.customer':'Customer','occLegacy.branch':'Branch','occLegacy.area':'Area','occLegacy.historicalPrice':'Historical Price','occLegacy.noBranches':'No historical Branch membership.',
    'employee.title':'Employee Directory','employee.description':'The directory and detail view are separate. Select an employee to load the complete record.','employee.add':'Add employee','employee.code':'Employee Code','employee.name':'Employee Name','employee.primaryRole':'Primary Job Role','employee.secondaryRoles':'Secondary Roles','employee.employmentType':'Employment Type','employee.employmentStatus':'Employment Status','employee.startDate':'Current Start Date','employee.period':'Period','employee.periodStartDate':'Start Date','employee.periodCurrent':'Current','employee.periodClosed':'Closed','employee.present':'Present','employee.lastWorkingDay':'Last Working Day','employee.endDate':'Employment End Date','employee.account':'Account','employee.basic':'Basic information','employee.jobEmployment':'Job and employment','employee.sensitive':'Identity, bank, EPF and SOCSO','employee.periods':'Employment Periods','employee.history':'Change history','employee.internalAccount':'KCS internal account','employee.terminate':'End employment','employee.rehire':'Rehire','employee.noResults':'No employees match the filters.','employee.loading':'Loading employee details…','employee.startMissing':'Active employee has no Employment Start Date. Please complete it.','employee.saveCurrent':'Save current employee','employee.importPreview':'Import preview','employee.downloadImportTemplate':'Download Employee Import Template','employee.exportData':'Export Employee Data','employee.exportPreview':'Export Import Preview Results','employee.exportFiltered':'Export filtered employees','employee.exportSensitive':'Sensitive data export',
    'vehicle.title':'Vehicle Master','vehicle.detailTitle':'Vehicle Management','vehicle.add':'Add vehicle','vehicle.number':'Vehicle Number','vehicle.name':'Vehicle Name','vehicle.registration':'Registration Number / Plate','vehicle.capacity':'Operational Capacity kg','vehicle.defaultBase':'Default Base','vehicle.usualAreas':'Preferred / Usual Areas','vehicle.usualZones':'Usual Zones','vehicle.quickEdit':'Quick edit','vehicle.viewDetail':'View details','vehicle.maintenance':'Maintenance','vehicle.available':'Available','vehicle.sold':'Sold','vehicle.basic':'Basic information','vehicle.compliance':'Compliance and due-date reminders','vehicle.statusHistory':'Vehicle Status History','vehicle.saveBasic':'Save vehicle information','vehicle.saveReminder':'Save reminders',
    'dispatch.title':'Weekly Dispatch Planner','dispatch.unassignedPool':'Unassigned customer pool','dispatch.approve':'Approve','dispatch.approvePublish':'Approve and publish','dispatch.reopen':'Reopen','dispatch.addTemporaryVehicle':'Add temporary vehicle','dispatch.customer':'Customers','dispatch.unassigned':'Unassigned','dispatch.warnings':'Warnings','dispatch.estimatedWeight':'Estimated weight','dispatch.missingGps':'Missing GPS','dispatch.timeRestricted':'Time constraints','dispatch.noUnassigned':'All customers are assigned to vehicles.','dispatch.dropHelp':'Drop a Zone, Area or customer here','dispatch.vehicleUnassigned':'Unassigned vehicle','dispatch.showUnavailable':'Show maintenance / inactive vehicles','dispatch.noVehicle':'No matching vehicles','dispatch.transferVehicle':'Transfer entire vehicle plan','dispatch.startLocation':'Start Location','dispatch.endLocation':'End Location','dispatch.lockSequence':'Lock sequence',
    'specialRequest.title':'Special Collection Requests','specialRequest.description':'Search existing branches first. Create a potential new customer only when no match exists.','specialRequest.create':'Create request','specialRequest.searchExisting':'Search existing customer / branch first','specialRequest.searchPlaceholder':'Name, CustomerID, BranchID, phone or address','specialRequest.nearby':'Nearby GPS (3 km)','specialRequest.findNearby':'Find nearby','specialRequest.existing':'Existing Customer Request','specialRequest.potential':'Potential New Customer','specialRequest.temporaryName':'Temporary Customer Name','specialRequest.requestedDate':'Requested collection date','specialRequest.estimatedWeight':'Estimated weight (kg)','specialRequest.promised':'Promised to customer','specialRequest.requirement':'Special requirement / remark','specialRequest.list':'Request list','specialRequest.schedule':'Add to selected date route',
    'zone.title':'Zone Area Confirmation','zone.description':'Moving an Area creates a pending assignment. A supervisor must confirm it before new routes use the Zone.','zone.add':'Add Zone Group','zone.rename':'Rename','zone.merge':'Merge','zone.split':'Split selected Areas','zone.confirm':'Confirm assignment','zone.unconfirm':'Undo confirmation','zone.pending':'Pending confirmation','zone.confirmed':'Confirmed','zone.areaTotal':'Total Areas','zone.branchTotal':'Customer Branches','zone.officialGps':'Official GPS','zone.missingGps':'Missing GPS','zone.scheduled':'Scheduled customers','zone.viewDetails':'View details','zone.selectTarget':'Select target Zone','zone.move':'Move to selected Zone','zone.moveReason':'Movement reason (required)','zone.statistics':'Zone statistics details','zone.areaDetail':'Area confirmation details',
    'gps.title':'GPS & Data Quality','gps.collector':'GPS Collector','gps.temporary':'Temporary GPS','gps.official':'Official GPS','gps.adopt':'Adopt as official GPS','gps.keepOfficial':'Keep current official GPS','gps.recapture':'Request recapture','gps.reject':'Reject','gps.zoneTitle':'GPS Zone Recommendations and Boundary Management','gps.zoneDescription':'Only official GPS is used. Temporary GPS is for temporary dispatch and navigation only.','gps.supervisorReview':'Supervisor recommendation review','gps.boundaryMap':'Zone Boundary Map','gps.recalculate':'Recalculate recommendations','gps.accept':'Accept recommendation','gps.keepOriginal':'Keep original assignment','gps.later':'Handle later','gps.selectOther':'Select another Zone / Area','gps.noOfficial':'No official GPS','gps.loading':'Loading GPS data…',
    'import.title':'Official Excel Import','import.description':'Preview database changes first. Data is written in one transaction only after confirmation.','import.previewOnly':'Preview does not modify master data','import.choose':'Select or drop one or more Jodoo Excel files','import.preview':'Preview results','import.detected':'Detected data','import.issues':'Import issues','import.confirm':'Confirm import to SQLite','import.completed':'Import completed: {newCount} new, {updated} updated, {unchanged} unchanged, {unmatched} unmatched.',
    'schedule.title':'Collection Schedules','schedule.description':'ScheduleID is unique. Zone Group and detailed Area are shown separately.','schedule.allDays':'All weekdays','schedule.allFrequency':'All frequencies','schedule.unmatchedOnly':'Unmatched Branch only','schedule.multiple':'Multiple schedules','schedule.notFound':'Branch not found','schedule.dataQuality':'GPS & Data Completeness','schedule.dataQualityHelp':'Missing GPS or schedule is not an import error; these records are grouped for completion.',
    'apiError.generic':'The request could not be completed.','apiError.unknown_error':'The request could not be completed.','apiError.auth_required':'Please log in to KCS.','apiError.permission_denied':'You do not have permission to perform this action.','apiError.password_change_required':'You must change the temporary password first.','apiError.invalid_credentials':'Incorrect username or password, or the account is temporarily locked.','apiError.username_required':'Please enter a username.','apiError.username_in_use':'This username is already in use.','apiError.password_too_short':'The password is too short.','apiError.not_found':'The requested record was not found.','apiError.invalid_status':'The selected status is invalid.','apiError.invalid_frequency':'The collection frequency is invalid.','apiError.invalid_weekday':'The assigned weekday is invalid.','apiError.invalid_gps':'The GPS latitude or longitude is invalid.','apiError.required_field':'Please complete the required field.','apiError.invalid_location_text':'Addresses and official place names must use English or Bahasa Melayu and cannot contain Chinese characters.','apiError.conflict':'The record conflicts with existing data.','apiError.request_too_large':'The uploaded request is too large.','apiError.invalid_file':'The uploaded file type or format is invalid.','apiError.occ_no_branches_selected':'No branches were selected.','apiError.occ_move_reason_required':'Enter a reason for this move.','apiError.occ_same_group':'Source and target price groups cannot be the same.','apiError.occ_group_not_found':'The source or target OCC Price Group was not found. Refresh and try again.','apiError.occ_target_inactive':'The target OCC Price Group is not active.','apiError.occ_branch_source_changed':'One or more branches no longer belong to the source group. No branches were changed. Refresh and try again.','apiError.occ_branch_not_found':'One or more selected branches no longer exist. No branches were changed.'
  },
  ms:{
    'app.pageError':'Ralat halaman KCS','app.pageErrorHelp':'Halaman tidak dapat diteruskan dengan selamat. Muat semula; jika masalah berterusan, mulakan semula KCS.','app.reload':'Muat semula','app.unknownPageError':'Ralat halaman tidak diketahui',
    'common.language':'Bahasa','common.close':'Tutup','common.add':'Tambah','common.edit':'Edit','common.view':'Lihat','common.refresh':'Muat semula','common.download':'Muat turun','common.upload':'Muat naik','common.export':'Eksport','common.import':'Import','common.all':'Semua','common.none':'Tiada','common.yes':'Ya','common.no':'Tidak','common.enabled':'Diaktifkan','common.disabled':'Dilumpuhkan','common.active':'Aktif','common.inactive':'Tidak aktif','common.paused':'Dijeda','common.closed':'Ditutup','common.status':'Status','common.actions':'Tindakan','common.details':'Butiran','common.notSet':'Belum ditetapkan','common.noData':'Tiada data yang sepadan.','common.loadFailed':'Data tidak dapat dimuatkan.','common.saved':'Berjaya disimpan.','common.operationFailed':'Operasi tidak dapat diselesaikan.','common.reason':'Sebab','common.name':'Nama','common.address':'Alamat','common.phone':'Telefon','common.date':'Tarikh','common.notes':'Catatan','common.select':'Pilih','common.clear':'Kosongkan','common.previous':'Sebelumnya','common.next':'Seterusnya',
    'list.selected':'{count} dipilih','list.selectAll':'Pilih semua baris yang dipaparkan','list.selectRow':'Pilih baris','list.sortAsc':'Susun menaik','list.sortDesc':'Susun menurun','list.clearSort':'Kosongkan susunan','list.clearFilter':'Kosongkan penapis','list.actions':'Tindakan','list.details':'Butiran','list.expand':'Kembangkan butiran','list.collapse':'Tutup butiran','list.copy':'Salin','list.copied':'Disalin','list.columns':'Lajur','list.closeColumns':'Tutup pemilih lajur','list.resetColumns':'Pulihkan Lajur Lalai','list.noResults':'Tiada rekod sepadan dengan carian atau penapis semasa.','list.activeOnly':'Aktif sahaja','list.includeInactive':'Sertakan Cawangan tidak beroperasi','list.customerId':'ID Pelanggan','list.customerName':'Nama Pelanggan','list.branchId':'ID Cawangan','list.branchName':'Nama Cawangan','list.status':'Status','list.branchCount':'Bilangan Cawangan','list.phone':'Telefon','list.payment':'Bayaran','list.customer':'Pelanggan','list.area':'Area','list.lifecycleStatus':'Status Kitar Hayat','list.gpsStatus':'Status GPS','list.materialsCount':'Bilangan Bahan','list.contact':'Orang untuk Dihubungi','list.address':'Alamat','list.notes':'Catatan','list.updatedAt':'Tarikh Kemas Kini','list.employeeId':'ID Pekerja','list.employeeName':'Nama Pekerja','list.mainJobRole':'Peranan Kerja Utama','list.accountStatus':'Status Akaun','list.permissions':'Kebenaran','list.createdAt':'Tarikh Dicipta','list.lastLogin':'Log Masuk Terakhir','list.audit':'Ringkasan Audit','list.failedLogins':'log masuk gagal','list.searchAccounts':'Cari ID Pekerja, pekerja, nama pengguna atau peranan','branchEditor.unsavedLeave':'Terdapat perubahan yang belum disimpan. Adakah anda pasti mahu keluar?',
    'branchEditor.openCustomer':'Buka Pelanggan','branchEditor.inheritedPricing':'Bahan & Harga Pelanggan Diwarisi','branchEditor.inheritedHelp':'Baca sahaja. Bahan dan harga diwarisi secara automatik daripada Pelanggan Cawangan ini.','branchEditor.standard':'Standard','branchEditor.outstation':'Luar Kawasan','branchEditor.editBranch':'Edit Cawangan','branchEditor.viewBranch':'Lihat Cawangan','branchEditor.readOnly':'Baca Sahaja','branchEditor.addBranch':'Tambah Cawangan Pelanggan','branchEditor.saveBranch':'Simpan Cawangan Pelanggan','branchEditor.duplicateMaterial':'Bahan yang sama tidak boleh ditambah dua kali pada satu Cawangan.','branchLifecycle.restoreReasonRequired':'Sebab pemulihan diperlukan.','branchLifecycle.reasonRequired':'Sebab perubahan status diperlukan.','branchLifecycle.replacementRequired':'Cawangan pengganti diperlukan.','branchLifecycle.closedStandardReason':'Audit akan merekodkan: Tutup / Tidak Lagi Beroperasi.','branchLifecycle.viewHistory':'Lihat Sejarah Status',
    'list.customerMasterTitle':'Master Pelanggan','list.branchMasterTitle':'Master Cawangan Pelanggan','list.email':'E-mel','list.gps.set':'GPS Telah Ditetapkan','list.gps.notSet':'GPS Belum Ditetapkan',
    'account.title':'Pengurusan Akaun','account.description':'Peranan Sistem berasingan daripada Peranan Kerja Utama. Owner Admin mengawal nama pengguna dan peranan.','account.create':'Cipta akaun pekerja','account.selectEmployee':'Pilih pekerja aktif','account.selectAccount':'Pilih satu akaun.','account.temporaryPassword':'Kata laluan sementara','account.createAction':'Cipta akaun','account.unlock':'Buka kunci','account.resetPassword':'Tetapkan semula kata laluan','account.updated':'Akaun dikemas kini dan audit direkodkan.','account.created':'Akaun dicipta. Pekerja mesti menukar kata laluan sementara pada log masuk pertama.',
    'customer.title':'Induk Pelanggan & Lokasi Operasi','customer.description':'KCS ialah sumber induk pelanggan dan lokasi operasi. Perubahan penting diaudit.','customer.add':'Tambah pelanggan','customer.ready':'Berkuat kuasa','customer.reviewRequired':'Semakan konflik lama diperlukan','customer.priceType':'Jenis Harga Digunakan','customer.materialPricing':'Harga Bahan Pelanggan','customer.materialHelp':'Setiap bahan memerlukan Harga Standard. Aktifkan Harga Luar Kawasan hanya apabila diperlukan.','customer.noPricing':'Harga bahan pelanggan belum ditetapkan.','customer.sort':'Susun','customer.sortCategory':'Kategori Bahan','customer.uncategorized':'Tanpa Kategori','customer.sortDefault':'Susunan Sistem','customer.sortName':'Nama A–Z','customer.sortPriceAsc':'Harga Rendah ke Tinggi','customer.sortPriceDesc':'Harga Tinggi ke Rendah','customer.specialPrice':'Harga Khas Pelanggan','customer.audit':'Sejarah audit','customer.editTitle':'Edit Pelanggan','customer.addTitle':'Tambah Pelanggan','customer.editorHelp':'Tetapan Standard dan Luar Kawasan digunakan untuk seluruh Pelanggan. Jangan cipta pendua mengikut kawasan.','customer.duplicateMaterial':'Bahan yang sama tidak boleh ditetapkan dua kali untuk seorang Pelanggan.','customer.confirmAffected':'Perubahan harga ini mungkin menjejaskan sehingga {count} Cawangan. Sahkan sekali lagi.','customer.reasonPrompt':'Masukkan sebab perubahan harga','customer.reasonDefault':'Semakan harga pelanggan','customer.branchesAffected':'Cawangan diwarisi','customer.save':'Simpan Pelanggan',
    'branch.title':'Cawangan Pelanggan','branch.add':'Tambah cawangan','branch.search':'Cari Pelanggan, Cawangan, BranchID, telefon atau alamat','branch.materials':'Bahan & Harga Semasa','branch.materialHelp':'Cawangan memilih bahan pelanggan dan jenis Standard atau Luar Kawasan; harga sebenar tidak disimpan berulang.','branch.frequency':'Kekerapan Kutipan','branch.weekdays':'Hari Minggu Ditetapkan','branch.onCallHelp':'On Call tidak masuk ke laluan mingguan tetap. Gunakan Permintaan Kutipan.','branch.pausedHelp':'Cawangan yang dijeda tidak masuk ke jadual automatik.','branch.viewEdit':'Lihat / Edit',
    'material.title':'Bahan & Harga','material.description':'Pilih Bahan dahulu, kemudian urus Tahap Harga.','material.add':'Tambah Bahan','material.addLevel':'Tambah Tahap Harga','material.addOccPriceGroup':'＋ Tambah Kumpulan Harga','material.occPrice':'Harga OCC','material.occPriceCreated':'Kumpulan Harga OCC dicipta:','material.bulkUpdate':'Pelarasan harga pukal','material.affectedBranches':'Cawangan terjejas','material.currentPrice':'Harga Semasa','material.priceLevel':'Pilih Tahap Harga dikongsi','material.newPrice':'Harga baharu (RM/kg)','material.effectiveDate':'Tarikh Kuat Kuasa (YYYY-MM-DD)','material.changeReason':'Sebab perubahan','material.readOnly':'Akaun ini hanya boleh melihat harga. Pengurusan harga memerlukan Administrator atau Supervisor yang diberi kuasa.','material.remove':'Buang','material.standard':'Harga Standard','material.outstation':'Harga Luar Kawasan','material.enableOutstation':'Aktifkan Harga Luar Kawasan','occLegacy.title':'Arkib Kumpulan Harga OCC Lama','occLegacy.subtitle':'Kumpulan OCC lama dan keahlian Cawangan terdahulu.','occLegacy.usedOnly':'Hanya kumpulan harga yang sedang digunakan oleh Cawangan dipaparkan.','occLegacy.showUnused':'Tunjukkan kumpulan harga yang tidak digunakan','occLegacy.readOnly':'Arkib lama — baca sahaja','occLegacy.help':'Kumpulan OCC lama ini dikekalkan untuk sejarah dan rujukan sahaja. Untuk tetapan operasi, pergi ke Master Pelanggan, buka Pelanggan, kemudian gunakan Harga Bahan Pelanggan.','occLegacy.openCustomers':'Buka Master Pelanggan → Harga Bahan Pelanggan','occLegacy.backToArchive':'Kembali ke arkib OCC lama','occLegacy.backToMaterials':'Kembali ke Kategori Bahan','occLegacy.group':'Kumpulan','occLegacy.branches':'Cawangan','occLegacy.previous':'sebelumnya','occLegacy.customerCode':'Kod Pelanggan','occLegacy.customer':'Pelanggan','occLegacy.branch':'Cawangan','occLegacy.area':'Kawasan','occLegacy.historicalPrice':'Harga Sejarah','occLegacy.noBranches':'Tiada keahlian Cawangan dalam sejarah.',
    'employee.title':'Direktori Pekerja','employee.description':'Senarai dan butiran pekerja dipisahkan. Pilih pekerja untuk memuatkan rekod lengkap.','employee.add':'Tambah pekerja','employee.code':'Kod Pekerja','employee.name':'Nama Pekerja','employee.primaryRole':'Peranan Kerja Utama','employee.secondaryRoles':'Peranan Tambahan','employee.employmentType':'Jenis Pekerjaan','employee.employmentStatus':'Status Pekerjaan','employee.startDate':'Tarikh Mula Semasa','employee.period':'Tempoh','employee.periodStartDate':'Tarikh Mula','employee.periodCurrent':'Semasa','employee.periodClosed':'Ditutup','employee.present':'Kini','employee.lastWorkingDay':'Hari Kerja Terakhir','employee.endDate':'Tarikh Tamat Pekerjaan','employee.account':'Akaun','employee.basic':'Maklumat asas','employee.jobEmployment':'Jawatan dan pekerjaan','employee.sensitive':'Kad pengenalan, bank, EPF dan SOCSO','employee.periods':'Tempoh Pekerjaan','employee.history':'Sejarah perubahan','employee.internalAccount':'Akaun dalaman KCS','employee.terminate':'Tamatkan pekerjaan','employee.rehire':'Ambil bekerja semula','employee.noResults':'Tiada pekerja sepadan dengan penapis.','employee.loading':'Memuatkan butiran pekerja…','employee.startMissing':'Pekerja aktif belum mempunyai Tarikh Mula Pekerjaan. Sila lengkapkan.','employee.saveCurrent':'Simpan pekerja semasa','employee.importPreview':'Pratonton import','employee.downloadImportTemplate':'Muat Turun Templat Import Pekerja','employee.exportData':'Eksport Data Pekerja','employee.exportPreview':'Eksport Hasil Pratonton Import','employee.exportFiltered':'Eksport pekerja ditapis','employee.exportSensitive':'Eksport data sensitif',
    'vehicle.title':'Induk Kenderaan','vehicle.detailTitle':'Pengurusan Kenderaan','vehicle.add':'Tambah kenderaan','vehicle.number':'Nombor Kenderaan','vehicle.name':'Nama Kenderaan','vehicle.registration':'Nombor Pendaftaran / Plat','vehicle.capacity':'Kapasiti Operasi kg','vehicle.defaultBase':'Pangkalan Lalai','vehicle.usualAreas':'Kawasan Biasa / Pilihan','vehicle.usualZones':'Zon Biasa','vehicle.quickEdit':'Edit pantas','vehicle.viewDetail':'Lihat butiran','vehicle.maintenance':'Penyelenggaraan','vehicle.available':'Tersedia','vehicle.sold':'Dijual','vehicle.basic':'Maklumat asas','vehicle.compliance':'Peringatan pematuhan dan tarikh tamat','vehicle.statusHistory':'Sejarah Status Kenderaan','vehicle.saveBasic':'Simpan maklumat kenderaan','vehicle.saveReminder':'Simpan peringatan',
    'dispatch.title':'Perancang Penghantaran Mingguan','dispatch.unassignedPool':'Kumpulan pelanggan belum diagihkan','dispatch.approve':'Luluskan','dispatch.approvePublish':'Lulus dan terbitkan','dispatch.reopen':'Buka semula','dispatch.addTemporaryVehicle':'Tambah kenderaan sementara','dispatch.customer':'Pelanggan','dispatch.unassigned':'Belum diagihkan','dispatch.warnings':'Amaran','dispatch.estimatedWeight':'Anggaran berat','dispatch.missingGps':'GPS tiada','dispatch.timeRestricted':'Had masa','dispatch.noUnassigned':'Semua pelanggan telah diagihkan kepada kenderaan.','dispatch.dropHelp':'Letakkan Zon, Kawasan atau pelanggan di sini','dispatch.vehicleUnassigned':'Kenderaan belum ditetapkan','dispatch.showUnavailable':'Tunjuk kenderaan penyelenggaraan / tidak aktif','dispatch.noVehicle':'Tiada kenderaan sepadan','dispatch.transferVehicle':'Pindahkan seluruh pelan kenderaan','dispatch.startLocation':'Lokasi Mula','dispatch.endLocation':'Lokasi Tamat','dispatch.lockSequence':'Kunci turutan',
    'specialRequest.title':'Permintaan Kutipan Khas','specialRequest.description':'Cari cawangan sedia ada dahulu. Cipta bakal pelanggan baharu hanya jika tiada padanan.','specialRequest.create':'Cipta permintaan','specialRequest.searchExisting':'Cari pelanggan / cawangan sedia ada dahulu','specialRequest.searchPlaceholder':'Nama, CustomerID, BranchID, telefon atau alamat','specialRequest.nearby':'GPS berdekatan (3 km)','specialRequest.findNearby':'Cari berdekatan','specialRequest.existing':'Permintaan Pelanggan Sedia Ada','specialRequest.potential':'Bakal Pelanggan Baharu','specialRequest.temporaryName':'Nama Pelanggan Sementara','specialRequest.requestedDate':'Tarikh kutipan diminta','specialRequest.estimatedWeight':'Anggaran berat (kg)','specialRequest.promised':'Dijanjikan kepada pelanggan','specialRequest.requirement':'Keperluan khas / catatan','specialRequest.list':'Senarai permintaan','specialRequest.schedule':'Tambah ke laluan tarikh dipilih',
    'zone.title':'Pengesahan Kawasan Zon','zone.description':'Memindahkan Kawasan menghasilkan tugasan menunggu. Supervisor mesti mengesahkannya sebelum laluan baharu menggunakan Zon.','zone.add':'Tambah Kumpulan Zon','zone.rename':'Tukar nama','zone.merge':'Gabung','zone.split':'Pisahkan Kawasan dipilih','zone.confirm':'Sahkan tugasan','zone.unconfirm':'Batalkan pengesahan','zone.pending':'Menunggu pengesahan','zone.confirmed':'Disahkan','zone.areaTotal':'Jumlah Kawasan','zone.branchTotal':'Cawangan Pelanggan','zone.officialGps':'GPS Rasmi','zone.missingGps':'GPS Tiada','zone.scheduled':'Pelanggan berjadual','zone.viewDetails':'Lihat butiran','zone.selectTarget':'Pilih Zon sasaran','zone.move':'Pindah ke Zon dipilih','zone.moveReason':'Sebab pemindahan (wajib)','zone.statistics':'Butiran statistik Zon','zone.areaDetail':'Butiran pengesahan Kawasan',
    'gps.title':'GPS & Kualiti Data','gps.collector':'Pengumpul GPS','gps.temporary':'GPS Sementara','gps.official':'GPS Rasmi','gps.adopt':'Gunakan sebagai GPS rasmi','gps.keepOfficial':'Kekalkan GPS rasmi semasa','gps.recapture':'Minta ambil semula','gps.reject':'Tolak','gps.zoneTitle':'Cadangan Zon GPS dan Pengurusan Sempadan','gps.zoneDescription':'Hanya GPS rasmi digunakan. GPS sementara hanya untuk penghantaran sementara dan navigasi.','gps.supervisorReview':'Semakan cadangan Supervisor','gps.boundaryMap':'Peta Sempadan Zon','gps.recalculate':'Kira semula cadangan','gps.accept':'Terima cadangan','gps.keepOriginal':'Kekalkan tugasan asal','gps.later':'Urus kemudian','gps.selectOther':'Pilih Zon / Kawasan lain','gps.noOfficial':'Tiada GPS rasmi','gps.loading':'Memuatkan data GPS…',
    'import.title':'Import Excel Rasmi','import.description':'Pratonton perubahan pangkalan data dahulu. Data hanya ditulis dalam satu transaksi selepas pengesahan.','import.previewOnly':'Pratonton tidak mengubah data induk','import.choose':'Pilih atau seret satu atau lebih fail Excel Jodoo','import.preview':'Hasil pratonton','import.detected':'Data dikenal pasti','import.issues':'Masalah import','import.confirm':'Sahkan import ke SQLite','import.completed':'Import selesai: {newCount} baharu, {updated} dikemas kini, {unchanged} tiada perubahan, {unmatched} tidak sepadan.',
    'schedule.title':'Jadual Kutipan','schedule.description':'ScheduleID adalah unik. Kumpulan Zon dan Kawasan terperinci dipaparkan berasingan.','schedule.allDays':'Semua hari minggu','schedule.allFrequency':'Semua kekerapan','schedule.unmatchedOnly':'Cawangan tidak sepadan sahaja','schedule.multiple':'Pelbagai jadual','schedule.notFound':'Cawangan tidak ditemui','schedule.dataQuality':'GPS & Kelengkapan Data','schedule.dataQualityHelp':'GPS atau jadual yang tiada bukan ralat import; rekod dikumpulkan untuk dilengkapkan.',
    'apiError.generic':'Permintaan tidak dapat diselesaikan.','apiError.unknown_error':'Permintaan tidak dapat diselesaikan.','apiError.auth_required':'Sila log masuk ke KCS.','apiError.permission_denied':'Anda tidak mempunyai kebenaran untuk tindakan ini.','apiError.password_change_required':'Anda mesti menukar kata laluan sementara dahulu.','apiError.invalid_credentials':'Nama pengguna atau kata laluan salah, atau akaun dikunci sementara.','apiError.username_required':'Sila masukkan nama pengguna.','apiError.username_in_use':'Nama pengguna ini telah digunakan.','apiError.password_too_short':'Kata laluan terlalu pendek.','apiError.not_found':'Rekod yang diminta tidak ditemui.','apiError.invalid_status':'Status yang dipilih tidak sah.','apiError.invalid_frequency':'Kekerapan kutipan tidak sah.','apiError.invalid_weekday':'Hari minggu yang dipilih tidak sah.','apiError.invalid_gps':'Latitud atau longitud GPS tidak sah.','apiError.required_field':'Sila lengkapkan ruangan wajib.','apiError.invalid_location_text':'Alamat dan nama tempat rasmi mesti menggunakan English atau Bahasa Melayu dan tidak boleh mengandungi aksara Cina.','apiError.conflict':'Rekod bercanggah dengan data sedia ada.','apiError.request_too_large':'Muat naik terlalu besar.','apiError.invalid_file':'Jenis atau format fail tidak sah.','apiError.occ_no_branches_selected':'Tiada cawangan dipilih.','apiError.occ_move_reason_required':'Masukkan sebab pemindahan ini.','apiError.occ_same_group':'Kumpulan harga sumber dan sasaran tidak boleh sama.','apiError.occ_group_not_found':'Kumpulan Harga OCC sumber atau sasaran tidak ditemui. Muat semula dan cuba lagi.','apiError.occ_target_inactive':'Kumpulan Harga OCC sasaran tidak aktif.','apiError.occ_branch_source_changed':'Satu atau lebih cawangan tidak lagi berada dalam kumpulan sumber. Tiada cawangan diubah. Muat semula dan cuba lagi.','apiError.occ_branch_not_found':'Satu atau lebih cawangan yang dipilih tidak lagi wujud. Tiada cawangan diubah.'
  },
  zh:{
    'app.pageError':'KCS页面发生错误','app.pageErrorHelp':'页面无法安全继续。请重新载入；如果问题持续，请重新启动KCS。','app.reload':'重新载入','app.unknownPageError':'未知页面错误',
    'common.language':'语言','common.close':'关闭','common.add':'新增','common.edit':'编辑','common.view':'查看','common.refresh':'刷新','common.download':'下载','common.upload':'上传','common.export':'导出','common.import':'导入','common.all':'全部','common.none':'无','common.yes':'是','common.no':'否','common.enabled':'已启用','common.disabled':'已停用','common.active':'启用中','common.inactive':'未启用','common.paused':'已暂停','common.closed':'已关闭','common.status':'状态','common.actions':'操作','common.details':'详情','common.notSet':'未设置','common.noData':'没有符合条件的资料。','common.loadFailed':'资料载入失败。','common.saved':'保存成功。','common.operationFailed':'操作无法完成。','common.reason':'原因','common.name':'名称','common.address':'地址','common.phone':'电话','common.date':'日期','common.notes':'备注','common.select':'选择','common.clear':'清除','common.previous':'上一页','common.next':'下一页',
    'list.selected':'已选择 {count} 笔','list.selectAll':'全选当前显示资料','list.selectRow':'选择此行','list.sortAsc':'升序排列','list.sortDesc':'降序排列','list.clearSort':'清除排序','list.clearFilter':'清除筛选','list.actions':'操作','list.details':'详情','list.expand':'展开详情','list.collapse':'收起详情','list.copy':'复制','list.copied':'已复制','list.columns':'栏位','list.closeColumns':'关闭栏位选择','list.resetColumns':'恢复默认栏位','list.noResults':'没有符合当前搜索或筛选条件的资料。','list.activeOnly':'只显示营运中','list.includeInactive':'包含非营运Branch','list.customerId':'Customer ID','list.customerName':'Customer','list.branchId':'Branch ID','list.branchName':'Branch名称','list.status':'状态','list.branchCount':'Branch数量','list.phone':'电话','list.payment':'付款摘要','list.customer':'Customer','list.area':'Area','list.lifecycleStatus':'Lifecycle状态','list.gpsStatus':'GPS状态','list.materialsCount':'物料数量','list.contact':'联系人','list.address':'地址','list.notes':'备注','list.updatedAt':'更新日期','list.employeeId':'员工编号','list.employeeName':'员工姓名','list.mainJobRole':'主要工作职位','list.accountStatus':'账号状态','list.permissions':'权限','list.createdAt':'建立日期','list.lastLogin':'最后登录','list.audit':'Audit摘要','list.failedLogins':'次登录失败','list.searchAccounts':'搜索员工编号、姓名、用户名或角色','branchEditor.unsavedLeave':'有未保存的修改，确定离开吗？',
    'branchEditor.openCustomer':'打开客户','branchEditor.inheritedPricing':'继承的客户货物与价格','branchEditor.inheritedHelp':'只读。货物与价格自动继承自此分店所属客户。','branchEditor.standard':'标准','branchEditor.outstation':'外埠','branchEditor.editBranch':'编辑分店','branchEditor.viewBranch':'查看分店','branchEditor.readOnly':'只读','branchEditor.addBranch':'新增客户分店','branchEditor.saveBranch':'保存客户分店','branchEditor.duplicateMaterial':'同一货物不能重复加入同一Branch。','branchLifecycle.restoreReasonRequired':'必须填写恢复原因。','branchLifecycle.reasonRequired':'必须填写状态修改原因。','branchLifecycle.replacementRequired':'必须选择替代Branch。','branchLifecycle.closedStandardReason':'Audit将记录：已停止营业。','branchLifecycle.viewHistory':'查看状态历史',
    'list.customerMasterTitle':'客户主档','list.branchMasterTitle':'客户分店主档','list.email':'电邮','list.gps.set':'GPS已设置','list.gps.notSet':'GPS未设置',
    'account.title':'账号管理','account.description':'系统权限角色与主要工作岗位分开。Owner Admin负责用户名和权限角色。','account.create':'建立员工账号','account.selectEmployee':'选择在职员工','account.selectAccount':'请选择账号。','account.temporaryPassword':'临时密码','account.createAction':'建立账号','account.unlock':'解除锁定','account.resetPassword':'重设密码','account.updated':'账号已更新并保存审计记录。','account.created':'账号已建立；员工首次登录必须修改临时密码。',
    'customer.title':'客户与营运地点主档','customer.description':'KCS是客户与营运地点主档，所有关键修改均保留审计。','customer.add':'新增客户','customer.ready':'已生效','customer.reviewRequired':'需要审核旧价格冲突','customer.priceType':'采用价格类型','customer.materialPricing':'客户货物价格','customer.materialHelp':'每种货物必须有标准价格；只有需要时才启用外埠价格。','customer.noPricing':'尚未设置客户货物价格。','customer.sort':'排序','customer.sortCategory':'货物分类','customer.uncategorized':'未分类','customer.sortDefault':'系统顺序','customer.sortName':'名称 A–Z','customer.sortPriceAsc':'价格从低到高','customer.sortPriceDesc':'价格从高到低','customer.specialPrice':'客户特殊价格','customer.audit':'审计记录','customer.editTitle':'编辑客户','customer.addTitle':'新增客户','customer.editorHelp':'标准与外埠设置适用于整个客户；请勿按地区建立重复客户。','customer.duplicateMaterial':'同一客户不能重复设置相同货物。','customer.confirmAffected':'此价格变更最多可能影响 {count} 家分店。请再次确认。','customer.reasonPrompt':'请输入价格变更原因','customer.reasonDefault':'客户价格审核','customer.branchesAffected':'继承此价格的分店','customer.save':'保存客户',
    'branch.title':'客户分店','branch.add':'新增分店','branch.search':'搜索客户、分店、BranchID、电话或地址','branch.materials':'货物与当前价格','branch.materialHelp':'分店只选择客户已有货物及标准／外埠类型，不重复保存实际价格。','branch.frequency':'收货频率','branch.weekdays':'指定星期','branch.onCallHelp':'On Call不会进入固定周路线，请使用临时收货请求。','branch.pausedHelp':'已暂停分店不会进入自动排程。','branch.viewEdit':'查看／编辑',
    'material.title':'货物与价格','material.description':'先选择货物，再管理该货物的价格等级。','material.add':'新增货物','material.addLevel':'新增价格等级','material.addOccPriceGroup':'＋ 新增价格','material.occPrice':'OCC价格','material.occPriceCreated':'OCC价格组已建立：','material.bulkUpdate':'批量调价','material.affectedBranches':'受影响分店','material.currentPrice':'当前价格','material.priceLevel':'选择共享价格等级','material.newPrice':'新价格（RM/kg）','material.effectiveDate':'生效日期（YYYY-MM-DD）','material.changeReason':'修改原因','material.readOnly':'当前账号只能查看价格；价格管理需要管理员或获授权主管权限。','material.remove':'移除','material.standard':'标准价格','material.outstation':'外埠价格','material.enableOutstation':'启用外埠价格','occLegacy.title':'旧 OCC 价格组档案','occLegacy.subtitle':'旧 OCC 价格组及其过去的分店成员记录。','occLegacy.usedOnly':'默认只显示目前有分店使用的价格组。','occLegacy.showUnused':'显示未使用的价格组','occLegacy.readOnly':'旧档案 — 只读','occLegacy.help':'这些旧 OCC 价格组仅保留作历史与参考。营运设置请前往客户主档，打开客户，然后使用客户货物价格。','occLegacy.openCustomers':'打开客户主档 → 客户货物价格','occLegacy.backToArchive':'返回旧 OCC 档案','occLegacy.backToMaterials':'返回货物类别','occLegacy.group':'价格组','occLegacy.branches':'分店','occLegacy.previous':'之前','occLegacy.customerCode':'客户编号','occLegacy.customer':'客户','occLegacy.branch':'分店','occLegacy.area':'地区','occLegacy.historicalPrice':'历史价格','occLegacy.noBranches':'没有历史分店成员记录。',
    'employee.title':'员工目录','employee.description':'员工清单与详情分开；选择员工后才读取完整资料。','employee.add':'新增员工','employee.code':'员工编号','employee.name':'员工姓名','employee.primaryRole':'主要岗位','employee.secondaryRoles':'兼任岗位','employee.employmentType':'雇佣类型','employee.employmentStatus':'雇佣状态','employee.startDate':'当前入职日期','employee.period':'期间','employee.periodStartDate':'开始日期','employee.periodCurrent':'当前','employee.periodClosed':'已结束','employee.present':'至今','employee.lastWorkingDay':'最后工作日','employee.endDate':'雇佣结束日期','employee.account':'账号','employee.basic':'基本资料','employee.jobEmployment':'岗位与雇佣','employee.sensitive':'身份证、银行、EPF及SOCSO','employee.periods':'雇佣期间','employee.history':'修改历史','employee.internalAccount':'KCS内部账号','employee.terminate':'办理离职','employee.rehire':'重新入职','employee.noResults':'没有符合筛选条件的员工。','employee.loading':'员工资料载入中…','employee.startMissing':'在职员工尚未填写入职日期，请尽快补充。','employee.saveCurrent':'保存当前员工','employee.importPreview':'导入预览','employee.downloadImportTemplate':'下载员工导入模板','employee.exportData':'导出员工资料','employee.exportPreview':'导出导入预览结果','employee.exportFiltered':'导出筛选员工','employee.exportSensitive':'敏感资料导出',
    'vehicle.title':'车辆主档','vehicle.detailTitle':'车辆管理','vehicle.add':'新增车辆','vehicle.number':'车辆编号','vehicle.name':'车辆名称','vehicle.registration':'注册号码／车牌','vehicle.capacity':'营运载重kg','vehicle.defaultBase':'默认基地','vehicle.usualAreas':'常用区域','vehicle.usualZones':'常用Zone','vehicle.quickEdit':'快速编辑','vehicle.viewDetail':'查看详情','vehicle.maintenance':'维修','vehicle.available':'可用','vehicle.sold':'已出售','vehicle.basic':'基本资料','vehicle.compliance':'法定与到期提醒','vehicle.statusHistory':'车辆状态历史','vehicle.saveBasic':'保存车辆资料','vehicle.saveReminder':'保存提醒',
    'dispatch.title':'一周派车计划','dispatch.unassignedPool':'未分配客户池','dispatch.approve':'批准','dispatch.approvePublish':'批准并发布','dispatch.reopen':'重新打开','dispatch.addTemporaryVehicle':'新增临时车辆','dispatch.customer':'客户','dispatch.unassigned':'未分配','dispatch.warnings':'警告','dispatch.estimatedWeight':'预计重量','dispatch.missingGps':'缺GPS','dispatch.timeRestricted':'时间限制','dispatch.noUnassigned':'所有客户已分配到车辆。','dispatch.dropHelp':'拖放Zone、Area或单个客户到这里','dispatch.vehicleUnassigned':'未分配车辆','dispatch.showUnavailable':'显示维修／停用车辆','dispatch.noVehicle':'没有符合的车辆','dispatch.transferVehicle':'整车转移','dispatch.startLocation':'出发地点','dispatch.endLocation':'结束地点','dispatch.lockSequence':'锁定顺序',
    'specialRequest.title':'临时收货请求','specialRequest.description':'先查找现有分店；找不到才建立潜在新客户。','specialRequest.create':'建立请求','specialRequest.searchExisting':'先搜索现有客户／分店','specialRequest.searchPlaceholder':'名称、CustomerID、BranchID、电话或地址','specialRequest.nearby':'GPS附近（3km）','specialRequest.findNearby':'查附近','specialRequest.existing':'现有客户请求','specialRequest.potential':'潜在新客户','specialRequest.temporaryName':'临时客户名称','specialRequest.requestedDate':'要求收货日期','specialRequest.estimatedWeight':'预计重量（kg）','specialRequest.promised':'已承诺客户','specialRequest.requirement':'特别要求／备注','specialRequest.list':'请求清单','specialRequest.schedule':'加入指定日期路线',
    'zone.title':'Zone Area归属确认','zone.description':'移动Area只建立待确认归属；主管确认后新路线才使用该Zone。','zone.add':'新增Zone Group','zone.rename':'改名','zone.merge':'合并','zone.split':'拆分勾选Area','zone.confirm':'确认归属','zone.unconfirm':'撤销确认','zone.pending':'待确认','zone.confirmed':'已确认','zone.areaTotal':'Area总数','zone.branchTotal':'客户分店','zone.officialGps':'正式GPS','zone.missingGps':'缺GPS','zone.scheduled':'已排客户','zone.viewDetails':'查看明细','zone.selectTarget':'选择目标Zone','zone.move':'移动到指定Zone','zone.moveReason':'移动原因（必填）','zone.statistics':'Zone统计明细','zone.areaDetail':'Area归属详情',
    'gps.title':'GPS与资料完整度','gps.collector':'GPS采集','gps.temporary':'临时GPS','gps.official':'正式GPS','gps.adopt':'采用为正式GPS','gps.keepOfficial':'保留现有正式GPS','gps.recapture':'要求重新采集','gps.reject':'拒绝','gps.zoneTitle':'GPS Zone建议与边界管理','gps.zoneDescription':'只使用正式GPS；临时GPS仅用于临时派车和导航。','gps.supervisorReview':'主管确认建议','gps.boundaryMap':'Zone边界地图','gps.recalculate':'重新计算建议','gps.accept':'接受建议','gps.keepOriginal':'保持原归属','gps.later':'稍后处理','gps.selectOther':'选择其他Zone／Area','gps.noOfficial':'没有正式GPS','gps.loading':'GPS资料载入中…',
    'import.title':'Excel正式导入','import.description':'先预览数据库变化；确认后才在单一transaction内写入资料。','import.previewOnly':'预览不会修改主档','import.choose':'选择或拖入一份或多份Jodoo Excel','import.preview':'预览结果','import.detected':'识别到的资料','import.issues':'导入问题','import.confirm':'确认导入SQLite','import.completed':'导入完成：新增{newCount}，更新{updated}，无变化{unchanged}，无法匹配{unmatched}。',
    'schedule.title':'收货排程','schedule.description':'ScheduleID是唯一编号；Zone Group与详细Area分开显示。','schedule.allDays':'全部星期','schedule.allFrequency':'全部频率','schedule.unmatchedOnly':'只看无法匹配的Branch','schedule.multiple':'多排程','schedule.notFound':'Branch找不到','schedule.dataQuality':'GPS与资料完整度','schedule.dataQualityHelp':'缺GPS或没有排程不是导入错误；系统会分组显示供后续补齐。',
    'apiError.generic':'操作无法完成。','apiError.unknown_error':'操作无法完成。','apiError.auth_required':'请先登录KCS。','apiError.permission_denied':'当前账号没有权限执行此操作。','apiError.password_change_required':'请先修改临时密码。','apiError.invalid_credentials':'用户名或密码错误，或账号暂时被锁定。','apiError.username_required':'请输入用户名。','apiError.username_in_use':'用户名已经使用。','apiError.password_too_short':'密码长度不足。','apiError.not_found':'找不到指定资料。','apiError.invalid_status':'所选状态无效。','apiError.invalid_frequency':'收货频率无效。','apiError.invalid_weekday':'指定星期无效。','apiError.invalid_gps':'GPS经纬度无效。','apiError.required_field':'请填写必填资料。','apiError.invalid_location_text':'地址及正式地点名称只能使用English或Bahasa Melayu，不可包含中文字符。','apiError.conflict':'资料与现有记录冲突。','apiError.request_too_large':'上传内容过大。','apiError.invalid_file':'上传文件类型或格式无效。','apiError.occ_no_branches_selected':'没有选择任何Branch。','apiError.occ_move_reason_required':'请输入搬迁原因。','apiError.occ_same_group':'来源与目标价格组不能相同。','apiError.occ_group_not_found':'找不到来源或目标OCC价格组，请刷新后重试。','apiError.occ_target_inactive':'目标OCC价格组并非启用状态。','apiError.occ_branch_source_changed':'一个或多个Branch已不属于来源组。本次没有修改任何Branch，请刷新后重试。','apiError.occ_branch_not_found':'一个或多个所选Branch已不存在。本次没有修改任何Branch。'
  }
}

const routeMessages={
  en:{
    'common.noPhone':'No phone','common.noNotes':'No notes','common.records':'records','common.items':'items','common.branches':'branches','common.rename':'Rename','common.saving':'Saving…',
    'common.loadingData':'Loading data…','common.waitingReview':'Pending review','common.unassignedArea':'Unassigned area','common.notNamedBranch':'Unnamed branch','gpsCollection.unassignedArea':'Unassigned Area','gpsCollection.groupCount':'{count} Branches',
    'common.unmatchedCustomer':'Unmatched customer','common.noAddress':'No address','common.notProvided':'Not provided','common.exportXlsx':'Export XLSX',
    'customer.masterTitle':'Customer Master','customer.retentionHelp':'Historical records are not physically deleted. Use Pause, Resume or Close to manage status.',
    'customer.exportMapping':'Export Area-Zone Mapping XLSX','customer.exportMappingLabel':'Export Area-Zone Mapping','customer.exportData':'Export data XLSX','customer.searchMaster':'Search ID, name, phone or address',
    'customer.allSchedules':'All schedules','customer.totalBranches':'{count} branches','customer.noPayment':'Payment type not set',
    'branch.gpsStatus':'GPS Status','branch.scheduleStatus':'Schedule Status','branch.weekday':'Weekday','branch.notCompleted':'Incomplete',
    'branch.scheduleCount':'{count} schedules','branch.totalCount':'{count} branches','branch.details':'View details',
    'schedule.flag':'Flag','schedule.gpsComplete':'GPS available','schedule.gpsMissing':'GPS missing','schedule.allSchedules':'All schedules',
    'schedule.scheduled':'Scheduled','schedule.noSchedule':'No schedule','schedule.qualityScheduledGps':'Scheduled with GPS',
    'schedule.qualityScheduledMissingGps':'Scheduled but GPS missing','schedule.qualityGpsWithoutSchedule':'GPS available but no schedule',
    'schedule.qualityMissingBoth':'No GPS and no schedule','schedule.qualityInvalidGps':'Invalid GPS format',
    'schedule.qualityUnmatchedBranch':'Schedule BranchID not found','schedule.qualityMissingArea':'AreaID not found',
    'specialRequest.deduplicated':'The same request already exists; no duplicate was created.','specialRequest.created':'Special collection request created.',
    'specialRequest.scheduleDate':'Schedule date (YYYY-MM-DD)','specialRequest.scheduledMessage':'The request was added to the selected date draft. Reapproval is required if that day was already approved.',
    'specialRequest.adoptWarning':'Adopted as official GPS, but it is more than 500 m from the previous GPS. Please verify again.',
    'specialRequest.adopted':'The supervisor adopted it as official GPS.','specialRequest.openPlanner':'View weekly dispatch',
    'specialRequest.contact':'Contact person','specialRequest.phone':'Phone','specialRequest.locationSource':'Location source',
    'specialRequest.tempLatitude':'Temporary Latitude','specialRequest.tempLongitude':'Temporary Longitude','specialRequest.address':'Address',
    'specialRequest.locationLink':'Google Maps / Location Link','specialRequest.createdSource':'Registration source',
    'specialRequest.general':'General request','specialRequest.promisedLabel':'Customer promise','specialRequest.pendingGps':'On-site GPS pending supervisor review',
    'specialRequest.adoptOfficial':'Adopt as official GPS','specialRequest.changeToNew':'Change to new customer','specialRequest.missingLocation':'Address or Location missing',
    'specialRequest.statusNew':'New request','specialRequest.statusAwaitingSupervisor':'Awaiting supervisor','specialRequest.statusAwaitingAccount':'Awaiting customer account',
    'specialRequest.statusScheduled':'Scheduled','specialRequest.statusApproved':'Approved','specialRequest.statusPublished':'Published',
    'specialRequest.statusCompleted':'Completed','specialRequest.statusRejected':'Rejected','specialRequest.statusCancelled':'Cancelled',
    'import.notXlsx':'{file} is not an .xlsx file','import.unrecognized':'{file} could not be identified from its worksheet and columns',
    'import.systemRecognition':'The system identifies Customer List, Customer Branch, BranchSchedule, AreaInfo and Customer Location Update from worksheet names and columns.',
    'import.selectFile':'Select Excel files','import.total':'Total','import.new':'New','import.updated':'Updated','import.unchanged':'Unchanged','import.errors':'Errors',
    'import.unmatched':'Unmatched','import.worksheet':'Worksheet','import.rows':'{count} records','import.compare':'The preview was sent to the API for comparison with existing SQLite data.',
    'import.issueCount':'{count} items require review','import.row':'Excel row {row}','import.ready':'Preview completed. You can confirm writing to SQLite.',
    'import.blocked':'Important errors exist. Correct the Excel file and preview it again.','import.imported':'Imported',
    'zone.currentName':'Current Zone Name','zone.newName':'New Zone Name','zone.renameTitle':'Rename Zone Group','zone.renameSave':'Save new name',
    'zone.renameEmpty':'Enter a new Zone name.','zone.renameSuccess':'Zone name updated.','zone.renameDialog':'Zone rename',
    'zone.renameHelp':'Official Zone names must use English or Bahasa Melayu. Area assignments and dispatch history are unchanged.',
    'gps.searchBranchAddress':'Search Branch / BranchID / address','gps.outsidePolygon':'Outside polygon','gps.allConfidence':'All confidence levels','gps.overlapOnly':'Boundary conflicts only',
    'gps.batchHigh':'Confirm High confidence in bulk','gps.recommendationOnly':'Recommendation only · Official assignments are not changed automatically',
    'gps.currentArea':'Current Area','gps.currentZone':'Current Zone','gps.suggestedArea':'Suggested Area','gps.suggestedZone':'Suggested Zone','gps.referenceDistance':'Reference distance',
    'gps.boundaryConflict':'Boundary conflict','gps.reason':'Recommendation reason','gps.category':'Category','gps.decision':'Decision',
    'gps.migrationPreview':'Preview first; data is written to SQLite only after confirmation.','gps.itemsShown':'Showing {count} items',
    'resource.vehicleHelp':'Official vehicles are shown as Lorry Number — Registration Number. Sold vehicles remain in history and are excluded from dispatch and reminders.',
    'resource.vehiclePageHelp':'View and manage company vehicles, vehicle records and operational status.',
    'resource.vehicleNumberPlaceholder':'Vehicle Number, for example Lorry 7','resource.jobHelp':'Job Role and System Role are stored separately. Only Active employees qualified as Driver / Attendant appear in dispatch selectors.',
    'resource.locationHelp':'Used for employee and vehicle Default Base, and route start and end locations.','resource.accountHelp':'Account permissions and job roles are separate. Sensitive-data access must be explicitly granted by an Admin.',
    'vehicle.missingNameBrand':'Name/brand not provided','vehicle.missingCapacity':'Capacity not provided','vehicle.missingPlate':'Registration plate not set','vehicle.temporaryLabel':'Temporary vehicle',
    'zone.search':'Search Area / AreaID / Zone','zone.allGps':'All GPS statuses','zone.withGps':'At least one official GPS','zone.missingGpsBranch':'Includes Branch with missing GPS',
    'zone.areaSort':'Sort by Area name','zone.customerDesc':'Customer count: high to low','zone.customerAsc':'Customer count: low to high',
    'zone.selectFiltered':'Select current filtered results','zone.clearSelection':'Clear selection','zone.bulkMove':'Move selected Areas (pending confirmation)',
    'zone.statistics':'Statistics details','zone.searchDetails':'Search Area, customer name or BranchID','zone.noFixedSchedule':'No fixed schedule',
    'zone.noAreaBranches':'This Area currently has no branches.','zone.adjacentAreas':'Adjacent Areas (estimated from existing official GPS)','zone.insufficientGps':'Existing GPS data is insufficient to calculate this.',
    'zone.sortOrder':'Order','zone.allZones':'All Zones','zone.unconfirm':'Revoke confirmation','zone.newPlaceholder':'New Zone name','zone.codePlaceholder':'Code (auto-generated if blank)','zone.orderPlaceholder':'Display order',
    'zone.officialGps':'Official GPS','zone.deactivate':'Deactivate','zone.reactivate':'Reactivate','zone.counts':'Showing {shown} · {selected} selected','employee.searchDirectory':'Search name, Employee Code, phone or last IC digits',
    'employee.noCode':'No employee code','employee.noAccount':'No account','customer.exportDataShort':'Export data',
    'master.description':'KCS is the master source for customers and operational locations. Jodoo remains available for invoicing only. Important changes are audited and approved routes are protected.',
    'master.confirmedAreas':'Confirmed Areas','master.pendingAreas':'Pending Areas','master.totalAreas':'Total Areas','master.addEntity':'Add {entity}',
    'master.savedRefreshed':'{entity} saved; the list has been refreshed.','master.editorLoading':'Loading Branch / Customer details…',
    'master.zoneFromArea':'Zone Group (determined by Area)','master.notSetArea':'Area not set','master.notSetLocation':'Location not set','master.notSetMaterial':'Material not set','master.notSetAddress':'Address not set',
    'master.customer':'Customer','master.branch':'Customer Branch','master.zone':'Zone','master.area':'Area','master.gps':'GPS','master.buyer':'Buyer','master.operationalLocation':'Operational Location',
    'master.importExport':'Import / Export','master.materialsPrices':'Materials & Prices','master.gpsCollector':'GPS Collector',
    'master.customerTitle':'Customer Master','master.branchTitle':'Customer Branch Master','master.buyerTitle':'Buyer Master','master.locationTitle':'Operational Location Master',
    'master.locationName':'Location Name','master.contactPerson':'Contact Person','master.branchId':'Branch ID','master.customerId':'Customer ID','master.branchName':'Branch Name','master.buyerId':'Buyer ID','master.buyerName':'Buyer Name','master.locationId':'Location ID','master.locationType':'Location Type',
    'master.officialLatitude':'Official Latitude','master.officialLongitude':'Official Longitude','master.temporaryLatitude':'Latest Temporary Latitude','master.temporaryLongitude':'Latest Temporary Longitude','master.gpsVerificationStatus':'GPS Verification Status',
    'master.areaId':'Area ID','master.collectionTime':'Collection Time Constraint','master.paymentType':'Payment Type','master.proofRequirements':'Proof Requirements','master.vehicleRestriction':'Vehicle Restriction','master.materialAccepted':'Material Accepted','master.operatingHours':'Operating Hours','master.unloadingRestrictions':'Unloading Restrictions','master.pricingNotes':'Pricing Notes',
    'master.companyYard':'Company Yard','master.employeeBase':'Employee Base','master.workshop':'Workshop','master.fuelStation':'Fuel Station','master.other':'Other','master.cash':'Cash','master.credit':'Credit',
    'master.addBranch':'Add Customer Branch','master.editBranch':'Edit Customer Branch','master.saveBranch':'Save Customer Branch','master.rawLocationHelp':'Official addresses and location names remain in their original English / Bahasa Melayu and are not translated.',
    'master.weekdaysEmpty':'Not selected (may be arranged later)','master.materialsEmpty':'No material selected.','master.configurePricing':'Configure Customer Material Pricing on the Customer page first.',
    'master.latitude':'Latitude','master.longitude':'Longitude','master.noBuyers':'No buyers found.','master.noOperationalLocations':'No operational locations found.',
    'buyerBranch.gpsSet':'GPS Set','buyerBranch.gpsNotSet':'GPS Not Set','buyerBranch.routeEndpoint':'Route Endpoint','buyerBranch.notRouteEndpoint':'Not a Route Endpoint','buyerBranch.materials':'Accepted Materials','buyerBranch.status.active':'Active','buyerBranch.status.paused':'Paused','buyerBranch.status.closed':'Closed',
    'gpsCollection.alreadyRecorded':'This Branch already has Official GPS or a pending GPS submission.',
    'gpsCollection.highAccuracy':'Getting high-accuracy GPS...',
    'gpsCollection.originalDeviceGps':'Original Device GPS',
    'gpsCollection.finalProposedGps':'Final Proposed GPS',
    'gpsCollection.finalLatitude':'Final Latitude',
    'gpsCollection.finalLongitude':'Final Longitude',
    'gpsCollection.dragMarker':'Drag the red marker to the correct entrance or loading point.',
    'gpsCollection.manuallyAdjusted':'Location manually adjusted',
    'gpsCollection.finalEqualsDevice':'Final GPS = Device GPS',
    'gpsCollection.lowAccuracy':'GPS accuracy is low (±{accuracy}m). Please retry or adjust the marker on the map.',
    'gpsCollection.toCollect':'GPS To Collect','gpsCollection.totalActive':'Total Active Branches','gpsCollection.official':'Official GPS','gpsCollection.pending':'Pending Approval','gpsCollection.remaining':'Remaining To Collect','gpsCollection.none':'No Branch currently requires GPS collection.','gpsCollection.notCollected':'GPS Not Collected','gpsCollection.gettingGps':'Getting GPS…','gpsCollection.findingAddress':'Finding address…','gpsCollection.state':'State','gpsCollection.city':'City','gpsCollection.street':'Street','gpsCollection.streetNumber':'Street Number','gpsCollection.postalCode':'Postal Code','gpsCollection.remark':'GPS Remark','gpsCollection.mapPreview':'Captured GPS on Google Map','gpsCollection.mapKeyMissing':'Map unavailable: Google Maps key not configured','gpsCollection.mapLoadFailed':'Google Map could not be loaded. GPS collection remains available.','mobile.getGpsFirst':'Get the device GPS before submitting.',
    'gps.collectorHelp':'Continue using the existing temporary GPS → supervisor approval → official GPS workflow. No second GPS system is created.',
    'gps.searchCustomerBranch':'Search Customer Branch','gps.customerBranchPlaceholder':'Customer, Branch, BranchID, phone or address','gps.selectBranch':'Select Branch','gps.chooseBranchStep':'Choose Branch','gps.matchingBranches':'Matching Branches','gps.pleaseSelect':'Please select',
    'gps.source':'Source','gps.saveTemporary':'Save temporary GPS','gps.savedTemporary':'GPS saved as temporary GPS. Official GPS was not overwritten.','gps.withdrawOfficial':'Withdraw Official GPS','gps.withdrawn':'Official GPS withdrawn. The Branch is available for collection again.',
    'gps.latitude':'Latitude','gps.longitude':'Longitude','gps.latitudePlaceholder':'Enter latitude','gps.longitudePlaceholder':'Enter longitude','gps.accuracy':'Accuracy',
    'gps.source.driverCaptured':'Driver Captured','gps.source.customerWhatsApp':'Customer WhatsApp','gps.source.customerPhone':'Customer Phone','gps.source.manualEntry':'Manual Entry','gps.source.supervisorConfirmed':'Supervisor Confirmed',
    'gps.proofAlt':'On-site GPS evidence','gps.adoptOfficial':'Confirm & Save as Official GPS','gps.keepOfficial':'Keep Existing GPS','gps.recapture':'Recollect GPS','gps.reject':'Reject',
    'defaultVehicle.label':'Default Vehicle','defaultVehicle.plural':'Default Vehicles','defaultVehicle.unassigned':'Unassigned Vehicle','defaultVehicle.noneAssigned':'No Default Vehicle Assigned','defaultVehicle.add':'Add Vehicle','defaultVehicle.remove':'Remove Vehicle','defaultVehicle.unavailable':'Vehicle Unavailable','defaultVehicle.maximum':'Maximum 3 Vehicles','defaultVehicle.poolUpdated':'Updated Successfully','defaultVehicle.changeToday':'Change for Today','defaultVehicle.update':'Update Default Vehicle','defaultVehicle.clear':'Clear Default Vehicle','defaultVehicle.updated':'Default Vehicle updated.','defaultVehicle.cleared':'Default Vehicle cleared.','defaultVehicle.reason':'Change Reason','defaultVehicle.scope':'Assignment Level','defaultVehicle.current':'Current Default','defaultVehicle.help':'The default applies only to future Drafts. A daily override does not change it.',
    'routeTemplate.title':'Route Template','routeTemplate.manage':'Manage Route','routeTemplate.assignedVehicle':'Assigned Vehicle','routeTemplate.areaOrder':'Area Order','routeTemplate.branchOrder':'Branch Order','routeTemplate.unassignedArea':'Unassigned Area','routeTemplate.notPlaced':'Not Yet Placed in Route','routeTemplate.up':'Move Up','routeTemplate.down':'Move Down','routeTemplate.remove':'Remove from Route','routeTemplate.update':'Update Route Template','routeTemplate.updated':'Route Updated Successfully','routeTemplate.loadingZone':'Loading Zone','routeTemplate.invalidZone':'A valid Zone is required to open this Route Template.',
    'gps.reviewReason':'Enter the review reason','gps.reviewReasonDefault':'Supervisor confirmed on-site information','gps.reviewDistanceWarning':'Adopted, but the distance from the previous location is large. Please verify again.','gps.reviewSaved':'GPS review decision saved.',
    'gps.supervisorReview':'Supervisor recommendation review','gps.boundaryMap':'Zone Boundary Map','gps.recommendationSaved':'Saved. A Branch official Area changes only after supervisor confirmation.',
    'transfer.title':'Excel / CSV Import & Export','transfer.help':'Download a template, fill it in, preview it, then confirm import. Any error prevents writing so existing data remains safe.',
    'transfer.module':'Module','transfer.blankTemplate':'Download {entity} XLSX blank template','transfer.csvTemplate':'Download CSV template','transfer.exportAll':'Export all',
    'transfer.chooseFile':'Select an .xlsx or .csv file','transfer.preview':'Preview before import','transfer.previewDone':'Preview completed. Data is written to SQLite only after Confirm Import.',
    'transfer.commitDone':'Import transaction completed. Re-importing the same data does not create duplicates.','transfer.errorCount':'{count} errors found. Correct them and preview again.',
    'transfer.exportErrors':'Export errors XLSX','transfer.commit':'Confirm import to SQLite','transfer.recent':'Recent import / export records','transfer.noLogs':'No import or export records.',
    'resource.vehicleMaster':'Vehicle Master','resource.employeeMaster':'Employee Master','resource.locationMaster':'Location Master','resource.zoneGroup':'Zone Group','resource.saved':'Master data saved. Affected approved routes will require reapproval.',
    'gpsMigration.title':'Jodoo Legacy GPS Migration','gpsMigration.help':'Preview by BranchID. Conflicts never overwrite official GPS automatically.','gpsMigration.downloadTemplate':'Download template',
    'gpsMigration.selectFile':'Select XLSX / CSV','gpsMigration.previewOnly':'Preview first; data is written to SQLite only after confirmation.','gpsMigration.history':'Previous batches',
    'gpsMigration.commitConfirm':'Only New records without official GPS will be written. Conflicts are never overwritten automatically. Continue?','gpsMigration.committed':'Migration submitted. Conflicts remain pending individual supervisor decisions.','gpsMigration.resolveReason':'Enter the resolution reason'
  },
  ms:{
    'common.noPhone':'Tiada telefon','common.noNotes':'Tiada catatan','common.records':'rekod','common.items':'item','common.branches':'cawangan','common.rename':'Tukar nama','common.saving':'Menyimpan…',
    'common.loadingData':'Memuatkan data…','common.waitingReview':'Menunggu semakan','common.unassignedArea':'Kawasan belum ditetapkan','common.notNamedBranch':'Cawangan tanpa nama','gpsCollection.unassignedArea':'Kawasan Belum Ditetapkan','gpsCollection.groupCount':'{count} Cawangan',
    'common.unmatchedCustomer':'Pelanggan tidak sepadan','common.noAddress':'Tiada alamat','common.notProvided':'Belum diisi','common.exportXlsx':'Eksport XLSX',
    'customer.masterTitle':'Induk Pelanggan','customer.retentionHelp':'Rekod sejarah tidak dipadam secara fizikal. Gunakan Jeda, Sambung atau Tutup untuk mengurus status.',
    'customer.exportMapping':'Eksport Pemetaan Area-Zone XLSX','customer.exportMappingLabel':'Eksport Pemetaan Area-Zone','customer.exportData':'Eksport data XLSX','customer.searchMaster':'Cari ID, nama, telefon atau alamat',
    'customer.allSchedules':'Semua jadual','customer.totalBranches':'{count} cawangan','customer.noPayment':'Jenis bayaran belum ditetapkan',
    'branch.gpsStatus':'Status GPS','branch.scheduleStatus':'Status Jadual','branch.weekday':'Hari Minggu','branch.notCompleted':'Belum lengkap',
    'branch.scheduleCount':'{count} jadual','branch.totalCount':'{count} cawangan','branch.details':'Lihat butiran',
    'schedule.flag':'Penanda','schedule.gpsComplete':'GPS tersedia','schedule.gpsMissing':'GPS tiada','schedule.allSchedules':'Semua jadual',
    'schedule.scheduled':'Berjadual','schedule.noSchedule':'Tiada jadual','schedule.qualityScheduledGps':'Berjadual dan mempunyai GPS',
    'schedule.qualityScheduledMissingGps':'Berjadual tetapi GPS tiada','schedule.qualityGpsWithoutSchedule':'Mempunyai GPS tetapi tiada jadual',
    'schedule.qualityMissingBoth':'Tiada GPS dan tiada jadual','schedule.qualityInvalidGps':'Format GPS tidak sah',
    'schedule.qualityUnmatchedBranch':'Schedule BranchID tidak ditemui','schedule.qualityMissingArea':'AreaID tidak ditemui',
    'specialRequest.deduplicated':'Permintaan sama telah wujud; rekod pendua tidak dicipta.','specialRequest.created':'Permintaan kutipan khas telah dicipta.',
    'specialRequest.scheduleDate':'Tarikh jadual (YYYY-MM-DD)','specialRequest.scheduledMessage':'Permintaan ditambah ke draf tarikh dipilih. Kelulusan semula diperlukan jika hari itu telah diluluskan.',
    'specialRequest.adoptWarning':'Digunakan sebagai GPS rasmi, tetapi jaraknya melebihi 500 m daripada GPS lama. Sila semak semula.',
    'specialRequest.adopted':'Supervisor telah menggunakannya sebagai GPS rasmi.','specialRequest.openPlanner':'Lihat penghantaran mingguan',
    'specialRequest.contact':'Orang untuk dihubungi','specialRequest.phone':'Telefon','specialRequest.locationSource':'Sumber lokasi',
    'specialRequest.tempLatitude':'Latitud sementara','specialRequest.tempLongitude':'Longitud sementara','specialRequest.address':'Alamat',
    'specialRequest.locationLink':'Google Maps / Pautan Lokasi','specialRequest.createdSource':'Sumber pendaftaran',
    'specialRequest.general':'Permintaan biasa','specialRequest.promisedLabel':'Janji pelanggan','specialRequest.pendingGps':'GPS tapak menunggu semakan Supervisor',
    'specialRequest.adoptOfficial':'Gunakan sebagai GPS rasmi','specialRequest.changeToNew':'Tukar kepada pelanggan baharu','specialRequest.missingLocation':'Alamat atau Lokasi tiada',
    'specialRequest.statusNew':'Permintaan baharu','specialRequest.statusAwaitingSupervisor':'Menunggu Supervisor','specialRequest.statusAwaitingAccount':'Menunggu akaun pelanggan',
    'specialRequest.statusScheduled':'Berjadual','specialRequest.statusApproved':'Diluluskan','specialRequest.statusPublished':'Diterbitkan',
    'specialRequest.statusCompleted':'Selesai','specialRequest.statusRejected':'Ditolak','specialRequest.statusCancelled':'Dibatalkan',
    'import.notXlsx':'{file} bukan fail .xlsx','import.unrecognized':'{file} tidak dapat dikenal pasti daripada lembaran kerja dan lajurnya',
    'import.systemRecognition':'Sistem mengenal pasti Customer List, Customer Branch, BranchSchedule, AreaInfo dan Customer Location Update melalui nama lembaran kerja dan lajur.',
    'import.selectFile':'Pilih fail Excel','import.total':'Jumlah','import.new':'Baharu','import.updated':'Dikemas kini','import.unchanged':'Tiada perubahan','import.errors':'Ralat',
    'import.unmatched':'Tidak sepadan','import.worksheet':'Lembaran kerja','import.rows':'{count} rekod','import.compare':'Pratonton dihantar ke API untuk dibandingkan dengan data SQLite sedia ada.',
    'import.issueCount':'{count} item perlu disemak','import.row':'Baris Excel {row}','import.ready':'Pratonton selesai. Anda boleh mengesahkan penulisan ke SQLite.',
    'import.blocked':'Terdapat ralat penting. Betulkan fail Excel dan pratonton semula.','import.imported':'Telah diimport',
    'zone.currentName':'Nama Zon Semasa','zone.newName':'Nama Zon Baharu','zone.renameTitle':'Tukar Nama Kumpulan Zon','zone.renameSave':'Simpan nama baharu',
    'zone.renameEmpty':'Masukkan nama Zon baharu.','zone.renameSuccess':'Nama Zon telah dikemas kini.','zone.renameDialog':'Tukar nama Zon',
    'zone.renameHelp':'Nama Zon rasmi mesti menggunakan English atau Bahasa Melayu. Tugasan Area dan sejarah penghantaran tidak berubah.',
    'gps.searchBranchAddress':'Cari Cawangan / BranchID / alamat','gps.outsidePolygon':'Di luar polygon','gps.allConfidence':'Semua tahap keyakinan','gps.overlapOnly':'Konflik sempadan sahaja',
    'gps.batchHigh':'Sahkan keyakinan High secara pukal','gps.recommendationOnly':'Cadangan sahaja · Tugasan rasmi tidak diubah secara automatik',
    'gps.currentArea':'Area semasa','gps.currentZone':'Zon semasa','gps.suggestedArea':'Area dicadangkan','gps.suggestedZone':'Zon dicadangkan','gps.referenceDistance':'Jarak rujukan',
    'gps.boundaryConflict':'Konflik sempadan','gps.reason':'Sebab cadangan','gps.category':'Kategori','gps.decision':'Keputusan',
    'gps.migrationPreview':'Pratonton dahulu; data hanya ditulis ke SQLite selepas pengesahan.','gps.itemsShown':'Memaparkan {count} item',
    'resource.vehicleHelp':'Kenderaan rasmi dipaparkan sebagai Lorry Number — Registration Number. Kenderaan Sold kekal dalam sejarah dan tidak disertakan dalam penghantaran atau peringatan.',
    'resource.vehiclePageHelp':'Lihat dan urus kenderaan syarikat, rekod kenderaan serta status operasi.',
    'resource.vehicleNumberPlaceholder':'Vehicle Number, contohnya Lorry 7','resource.jobHelp':'Job Role dan System Role disimpan berasingan. Hanya pekerja Active yang layak sebagai Driver / Attendant dipaparkan dalam pemilih penghantaran.',
    'resource.locationHelp':'Digunakan untuk Default Base pekerja dan kenderaan serta lokasi mula dan tamat laluan.','resource.accountHelp':'Kebenaran akaun dan jawatan kerja adalah berasingan. Akses data sensitif mesti diberikan secara jelas oleh Admin.',
    'vehicle.missingNameBrand':'Nama/jenama belum diisi','vehicle.missingCapacity':'Kapasiti belum diisi','vehicle.missingPlate':'Nombor pendaftaran belum ditetapkan','vehicle.temporaryLabel':'Kenderaan sementara',
    'zone.search':'Cari Area / AreaID / Zone','zone.allGps':'Semua status GPS','zone.withGps':'Sekurang-kurangnya satu GPS rasmi','zone.missingGpsBranch':'Termasuk Branch tanpa GPS',
    'zone.areaSort':'Susun mengikut nama Area','zone.customerDesc':'Bilangan pelanggan: banyak ke sedikit','zone.customerAsc':'Bilangan pelanggan: sedikit ke banyak',
    'zone.selectFiltered':'Pilih hasil tapisan semasa','zone.clearSelection':'Kosongkan pilihan','zone.bulkMove':'Pindahkan Area dipilih (menunggu pengesahan)',
    'zone.statistics':'Butiran statistik','zone.searchDetails':'Cari Area, nama pelanggan atau BranchID','zone.noFixedSchedule':'Tiada jadual tetap',
    'zone.noAreaBranches':'Area ini belum mempunyai cawangan.','zone.adjacentAreas':'Area bersebelahan (anggaran daripada GPS rasmi sedia ada)','zone.insufficientGps':'Data GPS sedia ada tidak mencukupi untuk pengiraan.',
    'zone.sortOrder':'Susunan','zone.allZones':'Semua Zon','zone.unconfirm':'Batalkan pengesahan','zone.newPlaceholder':'Nama Zon baharu','zone.codePlaceholder':'Kod (dijana automatik jika kosong)','zone.orderPlaceholder':'Susunan paparan',
    'zone.officialGps':'GPS rasmi','zone.deactivate':'Nyahaktifkan','zone.reactivate':'Aktifkan semula','zone.counts':'Memaparkan {shown} · {selected} dipilih','employee.searchDirectory':'Cari nama, Employee Code, telefon atau digit akhir IC',
    'employee.noCode':'Tiada kod pekerja','employee.noAccount':'Tiada akaun','customer.exportDataShort':'Eksport data',
    'master.description':'KCS ialah sumber induk bagi pelanggan dan lokasi operasi. Jodoo hanya diteruskan untuk invois. Perubahan penting diaudit dan laluan yang diluluskan dilindungi.',
    'master.confirmedAreas':'Area disahkan','master.pendingAreas':'Area menunggu pengesahan','master.totalAreas':'Jumlah Area','master.addEntity':'Tambah {entity}',
    'master.savedRefreshed':'{entity} disimpan; senarai telah dikemas kini.','master.editorLoading':'Memuatkan butiran Cawangan / Pelanggan…',
    'master.zoneFromArea':'Kumpulan Zon (ditentukan oleh Area)','master.notSetArea':'Area belum ditetapkan','master.notSetLocation':'Lokasi belum ditetapkan','master.notSetMaterial':'Bahan belum ditetapkan','master.notSetAddress':'Alamat belum ditetapkan',
    'master.customer':'Pelanggan','master.branch':'Cawangan Pelanggan','master.zone':'Zon','master.area':'Area','master.gps':'GPS','master.buyer':'Pembeli','master.operationalLocation':'Lokasi Operasi',
    'master.importExport':'Import / Eksport','master.materialsPrices':'Bahan & Harga','master.gpsCollector':'Pengumpul GPS',
    'master.customerTitle':'Induk Pelanggan','master.branchTitle':'Induk Cawangan Pelanggan','master.buyerTitle':'Induk Pembeli','master.locationTitle':'Induk Lokasi Operasi',
    'master.locationName':'Nama Lokasi','master.contactPerson':'Orang untuk Dihubungi','master.branchId':'ID Cawangan','master.customerId':'ID Pelanggan','master.branchName':'Nama Cawangan','master.buyerId':'ID Pembeli','master.buyerName':'Nama Pembeli','master.locationId':'ID Lokasi','master.locationType':'Jenis Lokasi',
    'master.officialLatitude':'Latitud Rasmi','master.officialLongitude':'Longitud Rasmi','master.temporaryLatitude':'Latitud Sementara Terkini','master.temporaryLongitude':'Longitud Sementara Terkini','master.gpsVerificationStatus':'Status Pengesahan GPS',
    'master.areaId':'ID Area','master.collectionTime':'Kekangan Masa Kutipan','master.paymentType':'Jenis Bayaran','master.proofRequirements':'Keperluan Bukti','master.vehicleRestriction':'Sekatan Kenderaan','master.materialAccepted':'Bahan Diterima','master.operatingHours':'Waktu Operasi','master.unloadingRestrictions':'Sekatan Pemunggahan','master.pricingNotes':'Catatan Harga',
    'master.companyYard':'Laman Syarikat','master.employeeBase':'Pangkalan Pekerja','master.workshop':'Bengkel','master.fuelStation':'Stesen Minyak','master.other':'Lain-lain','master.cash':'Tunai','master.credit':'Kredit',
    'master.addBranch':'Tambah Cawangan Pelanggan','master.editBranch':'Edit Cawangan Pelanggan','master.saveBranch':'Simpan Cawangan Pelanggan','master.rawLocationHelp':'Alamat rasmi dan nama lokasi kekal dalam English / Bahasa Melayu asal dan tidak diterjemahkan.',
    'master.weekdaysEmpty':'Belum dipilih (boleh diatur kemudian)','master.materialsEmpty':'Tiada bahan dipilih.','master.configurePricing':'Tetapkan Harga Bahan Pelanggan pada halaman Pelanggan dahulu.',
    'master.latitude':'Latitud','master.longitude':'Longitud','master.noBuyers':'Tiada pembeli ditemui.','master.noOperationalLocations':'Tiada lokasi operasi ditemui.',
    'buyerBranch.gpsSet':'GPS Ditetapkan','buyerBranch.gpsNotSet':'GPS Belum Ditetapkan','buyerBranch.routeEndpoint':'Titik Akhir Laluan','buyerBranch.notRouteEndpoint':'Bukan Titik Akhir Laluan','buyerBranch.materials':'Bahan Diterima','buyerBranch.status.active':'Aktif','buyerBranch.status.paused':'Dijeda','buyerBranch.status.closed':'Ditutup',
    'gpsCollection.alreadyRecorded':'Cawangan ini sudah mempunyai GPS Rasmi atau penghantaran GPS yang menunggu kelulusan.',
    'gpsCollection.highAccuracy':'Sedang mendapatkan GPS ketepatan tinggi...',
    'gpsCollection.originalDeviceGps':'GPS Asal Peranti',
    'gpsCollection.finalProposedGps':'GPS Akhir Dicadangkan',
    'gpsCollection.finalLatitude':'Latitud Akhir',
    'gpsCollection.finalLongitude':'Longitud Akhir',
    'gpsCollection.dragMarker':'Seret penanda merah ke pintu masuk atau tempat pemunggahan yang betul.',
    'gpsCollection.manuallyAdjusted':'Lokasi dilaraskan secara manual',
    'gpsCollection.finalEqualsDevice':'GPS Akhir = GPS Peranti',
    'gpsCollection.lowAccuracy':'Ketepatan GPS rendah (±{accuracy}m). Cuba lagi atau laraskan penanda pada peta.',
    'gpsCollection.toCollect':'GPS Belum Dikumpul','gpsCollection.totalActive':'Jumlah Cawangan Aktif','gpsCollection.official':'GPS Rasmi','gpsCollection.pending':'Menunggu Kelulusan','gpsCollection.remaining':'Baki untuk Dikumpul','gpsCollection.none':'Tiada Cawangan yang memerlukan pengumpulan GPS.','gpsCollection.notCollected':'GPS Belum Dikumpul','gpsCollection.gettingGps':'Mendapatkan GPS…','gpsCollection.findingAddress':'Mencari alamat…','gpsCollection.state':'Negeri','gpsCollection.city':'Bandar','gpsCollection.street':'Jalan','gpsCollection.streetNumber':'Nombor Jalan','gpsCollection.postalCode':'Poskod','gpsCollection.remark':'Catatan GPS','gpsCollection.mapPreview':'GPS yang diambil pada Google Map','gpsCollection.mapKeyMissing':'Peta tidak tersedia: Google Maps key belum dikonfigurasi','gpsCollection.mapLoadFailed':'Google Map tidak dapat dimuatkan. Pengumpulan GPS masih boleh diteruskan.','mobile.getGpsFirst':'Dapatkan GPS peranti sebelum menghantar.',
    'gps.collectorHelp':'Terus gunakan aliran temporary GPS → kelulusan Supervisor → official GPS yang sedia ada. Tiada sistem GPS kedua diwujudkan.',
    'gps.searchCustomerBranch':'Cari Cawangan Pelanggan','gps.customerBranchPlaceholder':'Pelanggan, Cawangan, BranchID, telefon atau alamat','gps.selectBranch':'Pilih Cawangan','gps.chooseBranchStep':'Pilih Cawangan','gps.matchingBranches':'Cawangan Sepadan','gps.pleaseSelect':'Sila pilih',
    'gps.source':'Sumber','gps.saveTemporary':'Simpan temporary GPS','gps.savedTemporary':'GPS disimpan sebagai temporary GPS. Official GPS tidak ditulis ganti.','gps.withdrawOfficial':'Tarik balik Official GPS','gps.withdrawn':'Official GPS telah ditarik balik. Branch boleh dikumpul semula.',
    'gps.latitude':'Latitud','gps.longitude':'Longitud','gps.latitudePlaceholder':'Masukkan latitud','gps.longitudePlaceholder':'Masukkan longitud','gps.accuracy':'Ketepatan',
    'gps.source.driverCaptured':'Diambil oleh Pemandu','gps.source.customerWhatsApp':'WhatsApp Pelanggan','gps.source.customerPhone':'Panggilan Telefon Pelanggan','gps.source.manualEntry':'Kemasukan Manual','gps.source.supervisorConfirmed':'Disahkan oleh Penyelia',
    'gps.proofAlt':'Bukti GPS di lokasi','gps.adoptOfficial':'Sahkan & Simpan sebagai GPS Rasmi','gps.keepOfficial':'Kekalkan GPS Rasmi Sedia Ada','gps.recapture':'Kutip Semula GPS','gps.reject':'Tolak',
    'defaultVehicle.label':'Kenderaan Lalai','defaultVehicle.plural':'Kenderaan Lalai','defaultVehicle.unassigned':'Kenderaan Belum Ditugaskan','defaultVehicle.noneAssigned':'Tiada Kenderaan Lalai Ditugaskan','defaultVehicle.add':'Tambah Kenderaan','defaultVehicle.remove':'Alih Keluar Kenderaan','defaultVehicle.unavailable':'Kenderaan Tidak Tersedia','defaultVehicle.maximum':'Maksimum 3 Kenderaan','defaultVehicle.poolUpdated':'Berjaya Dikemas Kini','defaultVehicle.changeToday':'Tukar untuk Hari Ini','defaultVehicle.update':'Kemas Kini Kenderaan Lalai','defaultVehicle.clear':'Kosongkan Kenderaan Lalai','defaultVehicle.updated':'Kenderaan lalai telah dikemas kini.','defaultVehicle.cleared':'Kenderaan lalai telah dikosongkan.','defaultVehicle.reason':'Sebab Perubahan','defaultVehicle.scope':'Peringkat Tugasan','defaultVehicle.current':'Lalai Semasa','defaultVehicle.help':'Tetapan lalai hanya digunakan untuk Draf akan datang. Pertukaran harian tidak mengubahnya.',
    'routeTemplate.title':'Templat Laluan Tetap','routeTemplate.manage':'Urus Laluan','routeTemplate.assignedVehicle':'Kenderaan Bertanggungjawab','routeTemplate.areaOrder':'Susunan Area','routeTemplate.branchOrder':'Susunan Branch','routeTemplate.unassignedArea':'Area Belum Ditugaskan','routeTemplate.notPlaced':'Belum Ditempatkan dalam Laluan','routeTemplate.up':'Alih Ke Atas','routeTemplate.down':'Alih Ke Bawah','routeTemplate.remove':'Keluarkan daripada Laluan','routeTemplate.update':'Kemas Kini Templat Laluan','routeTemplate.updated':'Laluan Berjaya Dikemas Kini','routeTemplate.loadingZone':'Memuatkan Zon','routeTemplate.invalidZone':'Zon yang sah diperlukan untuk membuka Templat Laluan ini.',
    'gps.reviewReason':'Masukkan sebab semakan','gps.reviewReasonDefault':'Supervisor mengesahkan maklumat di lokasi','gps.reviewDistanceWarning':'Telah digunakan, tetapi jaraknya jauh daripada lokasi lama. Sila semak semula.','gps.reviewSaved':'Keputusan semakan GPS telah disimpan.',
    'gps.supervisorReview':'Semakan cadangan Supervisor','gps.boundaryMap':'Peta Sempadan Zon','gps.recommendationSaved':'Disimpan. Area rasmi Branch hanya berubah selepas pengesahan Supervisor.',
    'transfer.title':'Import & Eksport Excel / CSV','transfer.help':'Muat turun templat, isi, pratonton, kemudian sahkan import. Sebarang ralat menghalang penulisan supaya data sedia ada kekal selamat.',
    'transfer.module':'Modul','transfer.blankTemplate':'Muat turun templat kosong XLSX {entity}','transfer.csvTemplate':'Muat turun templat CSV','transfer.exportAll':'Eksport semua',
    'transfer.chooseFile':'Pilih fail .xlsx atau .csv','transfer.preview':'Pratonton sebelum import','transfer.previewDone':'Pratonton selesai. Data hanya ditulis ke SQLite selepas Sahkan Import.',
    'transfer.commitDone':'Transaksi import selesai. Import semula data yang sama tidak menghasilkan pendua.','transfer.errorCount':'{count} ralat ditemui. Betulkan dan pratonton semula.',
    'transfer.exportErrors':'Eksport ralat XLSX','transfer.commit':'Sahkan import ke SQLite','transfer.recent':'Rekod import / eksport terkini','transfer.noLogs':'Tiada rekod import atau eksport.',
    'resource.vehicleMaster':'Induk Kenderaan','resource.employeeMaster':'Induk Pekerja','resource.locationMaster':'Induk Lokasi','resource.zoneGroup':'Kumpulan Zon','resource.saved':'Data induk disimpan. Laluan diluluskan yang terjejas akan memerlukan kelulusan semula.',
    'gpsMigration.title':'Migrasi GPS Lama Jodoo','gpsMigration.help':'Pratonton mengikut BranchID. Konflik tidak pernah menulis ganti GPS rasmi secara automatik.','gpsMigration.downloadTemplate':'Muat turun templat',
    'gpsMigration.selectFile':'Pilih XLSX / CSV','gpsMigration.previewOnly':'Pratonton dahulu; data hanya ditulis ke SQLite selepas pengesahan.','gpsMigration.history':'Batch terdahulu',
    'gpsMigration.commitConfirm':'Hanya rekod New tanpa GPS rasmi akan ditulis. Konflik tidak ditulis ganti secara automatik. Teruskan?','gpsMigration.committed':'Migrasi dihantar. Konflik masih menunggu keputusan Supervisor satu demi satu.','gpsMigration.resolveReason':'Masukkan sebab penyelesaian'
  },
  zh:{
    'common.noPhone':'无电话','common.noNotes':'无备注','common.records':'笔','common.items':'项','common.branches':'间分店','common.rename':'改名','common.saving':'保存中…',
    'common.loadingData':'资料载入中…','common.waitingReview':'等待核对','common.unassignedArea':'未分区','common.notNamedBranch':'未命名分店','gpsCollection.unassignedArea':'未分配区域','gpsCollection.groupCount':'{count} 个分店',
    'common.unmatchedCustomer':'未匹配客户','common.noAddress':'无地址','common.notProvided':'未填写','common.exportXlsx':'导出XLSX',
    'customer.masterTitle':'客户主档','customer.retentionHelp':'不物理删除历史资料；使用暂停、恢复或关闭管理状态。',
    'customer.exportMapping':'导出Area-Zone Mapping XLSX','customer.exportMappingLabel':'导出Area-Zone Mapping','customer.exportData':'导出资料XLSX','customer.searchMaster':'搜索编号、名称、电话或地址',
    'customer.allSchedules':'所有排程','customer.totalBranches':'共{count}间分店','customer.noPayment':'未设付款方式',
    'branch.gpsStatus':'GPS状态','branch.scheduleStatus':'排程状态','branch.weekday':'星期','branch.notCompleted':'未完成',
    'branch.scheduleCount':'{count}条','branch.totalCount':'共{count}间分店','branch.details':'查看详情',
    'schedule.flag':'标识','schedule.gpsComplete':'已有GPS','schedule.gpsMissing':'缺GPS','schedule.allSchedules':'全部排程',
    'schedule.scheduled':'已有排程','schedule.noSchedule':'没有排程','schedule.qualityScheduledGps':'已有排程且已有GPS',
    'schedule.qualityScheduledMissingGps':'已有排程但缺GPS','schedule.qualityGpsWithoutSchedule':'有GPS但没有排程',
    'schedule.qualityMissingBoth':'没有GPS也没有排程','schedule.qualityInvalidGps':'GPS格式异常',
    'schedule.qualityUnmatchedBranch':'Schedule BranchID找不到','schedule.qualityMissingArea':'AreaID找不到',
    'specialRequest.deduplicated':'相同请求已经存在，未重复建立。','specialRequest.created':'临时收货请求已建立。',
    'specialRequest.scheduleDate':'安排日期（YYYY-MM-DD）','specialRequest.scheduledMessage':'请求已加入指定日期草稿；如果该日已批准，系统已要求重新批准。',
    'specialRequest.adoptWarning':'已采用为正式GPS，但与原GPS相距超过500m，请再次核对。',
    'specialRequest.adopted':'已由主管采用为正式GPS。','specialRequest.openPlanner':'查看一周派车',
    'specialRequest.contact':'联系人','specialRequest.phone':'电话','specialRequest.locationSource':'Location来源',
    'specialRequest.tempLatitude':'临时Latitude','specialRequest.tempLongitude':'临时Longitude','specialRequest.address':'地址',
    'specialRequest.locationLink':'Google Maps / Location Link','specialRequest.createdSource':'登记来源',
    'specialRequest.general':'一般请求','specialRequest.promisedLabel':'客户承诺','specialRequest.pendingGps':'现场GPS待主管确认',
    'specialRequest.adoptOfficial':'采用为正式GPS','specialRequest.changeToNew':'改为新客户','specialRequest.missingLocation':'缺地址或Location',
    'specialRequest.statusNew':'新请求','specialRequest.statusAwaitingSupervisor':'等待主管','specialRequest.statusAwaitingAccount':'等待建立账号',
    'specialRequest.statusScheduled':'已排车','specialRequest.statusApproved':'已批准','specialRequest.statusPublished':'已发布',
    'specialRequest.statusCompleted':'已完成','specialRequest.statusRejected':'已拒绝','specialRequest.statusCancelled':'已取消',
    'import.notXlsx':'{file}不是.xlsx文件','import.unrecognized':'{file}无法根据工作表与栏位识别',
    'import.systemRecognition':'系统根据工作表名称和栏位识别Customer List、Customer Branch、BranchSchedule、AreaInfo及Customer Location Update。',
    'import.selectFile':'选择Excel文件','import.total':'总笔数','import.new':'新增','import.updated':'更新','import.unchanged':'没有变化','import.errors':'错误',
    'import.unmatched':'无法匹配','import.worksheet':'工作表','import.rows':'{count}笔','import.compare':'预览已送到后台与现有SQLite比对。',
    'import.issueCount':'{count}项需要核对','import.row':'Excel第{row}行','import.ready':'预览完成，可以确认写入SQLite。',
    'import.blocked':'存在重要错误，请修正Excel后重新预览。','import.imported':'已导入',
    'zone.currentName':'当前Zone名称','zone.newName':'新Zone名称','zone.renameTitle':'Zone Group改名','zone.renameSave':'保存新名称',
    'zone.renameEmpty':'请输入新的Zone名称。','zone.renameSuccess':'Zone名称已更新。','zone.renameDialog':'Zone改名',
    'zone.renameHelp':'正式Zone名称必须使用English或Bahasa Melayu；Area归属及派车历史不会改变。',
    'gps.searchBranchAddress':'搜索Branch / BranchID / 地址','gps.outsidePolygon':'Polygon外','gps.allConfidence':'全部置信度','gps.overlapOnly':'只看重叠冲突',
    'gps.batchHigh':'批量确认High','gps.recommendationOnly':'仅供建议 · 不会自动修改正式归属',
    'gps.currentArea':'当前Area','gps.currentZone':'当前Zone','gps.suggestedArea':'建议Area','gps.suggestedZone':'建议Zone','gps.referenceDistance':'参考距离',
    'gps.boundaryConflict':'与边界冲突','gps.reason':'建议原因','gps.category':'分类','gps.decision':'决定',
    'gps.migrationPreview':'先预览，确认后才写入SQLite。','gps.itemsShown':'显示{count}项',
    'resource.vehicleHelp':'正式车辆按Lorry Number — Registration Number显示；Sold车辆只保留历史，不参加派车或提醒。',
    'resource.vehiclePageHelp':'查看及管理公司车辆、车辆资料与营运状态。',
    'resource.vehicleNumberPlaceholder':'Vehicle Number，例如Lorry 7','resource.jobHelp':'Job Role与System Role分开保存；只有Active且具备Driver / Attendant资格的员工进入派车选择器。',
    'resource.locationHelp':'用于车辆与员工Default Base，以及路线出发与结束地点。','resource.accountHelp':'账号权限与工作岗位分开；敏感资料权限只可由Admin明确授权。',
    'vehicle.missingNameBrand':'未填写名称/品牌','vehicle.missingCapacity':'未填写载重','vehicle.missingPlate':'未设置车牌','vehicle.temporaryLabel':'临时车辆',
    'zone.search':'搜索Area / AreaID / Zone','zone.allGps':'全部GPS状态','zone.withGps':'至少一个正式GPS','zone.missingGpsBranch':'包含缺GPS Branch',
    'zone.areaSort':'Area名称排序','zone.customerDesc':'客户数量：多到少','zone.customerAsc':'客户数量：少到多',
    'zone.selectFiltered':'勾选当前筛选结果','zone.clearSelection':'清除勾选','zone.bulkMove':'批量移动（保持待确认）',
    'zone.statistics':'统计明细','zone.searchDetails':'搜索Area、客户名称、BranchID','zone.noFixedSchedule':'没有固定排程',
    'zone.noAreaBranches':'这个Area暂时没有分店。','zone.adjacentAreas':'相邻Area（按现有正式GPS估算）','zone.insufficientGps':'现有GPS资料不足，暂时无法计算。',
    'zone.sortOrder':'顺序','zone.allZones':'全部Zone','zone.unconfirm':'撤销确认','zone.newPlaceholder':'新Zone名称','zone.codePlaceholder':'Code（可留空自动产生）','zone.orderPlaceholder':'显示顺序',
    'zone.officialGps':'有正式GPS','zone.deactivate':'停用','zone.reactivate':'重新启用','zone.counts':'显示{shown}个 · 已勾选{selected}个','employee.searchDirectory':'搜索姓名、Employee Code、电话或IC后几位',
    'employee.noCode':'无员工编号','employee.noAccount':'无账号','customer.exportDataShort':'导出资料',
    'master.description':'KCS是客户与营运地点主档；Jodoo暂时只继续用于开单。所有关键修改保留审计，并保护已批准路线。',
    'master.confirmedAreas':'已确认Area','master.pendingAreas':'待确认Area','master.totalAreas':'Area总数','master.addEntity':'新增{entity}',
    'master.savedRefreshed':'{entity}已保存；清单已刷新。','master.editorLoading':'Branch / Customer资料载入中…',
    'master.zoneFromArea':'Zone Group（由Area决定）','master.notSetArea':'未设Area','master.notSetLocation':'未设地点','master.notSetMaterial':'未设物料','master.notSetAddress':'未设地址',
    'master.customer':'客户','master.branch':'客户分店','master.zone':'Zone','master.area':'Area','master.gps':'GPS','master.buyer':'买方','master.operationalLocation':'营运地点',
    'master.importExport':'导入 / 导出','master.materialsPrices':'货物与价格','master.gpsCollector':'GPS采集',
    'master.customerTitle':'客户主档','master.branchTitle':'客户分店主档','master.buyerTitle':'买方主档','master.locationTitle':'营运地点主档',
    'master.locationName':'地点名称','master.contactPerson':'联系人','master.branchId':'分店ID','master.customerId':'客户ID','master.branchName':'分店名称','master.buyerId':'买方ID','master.buyerName':'买方名称','master.locationId':'地点ID','master.locationType':'地点类型',
    'master.officialLatitude':'正式纬度','master.officialLongitude':'正式经度','master.temporaryLatitude':'最新临时纬度','master.temporaryLongitude':'最新临时经度','master.gpsVerificationStatus':'GPS审核状态',
    'master.areaId':'Area ID','master.collectionTime':'收运时间限制','master.paymentType':'付款方式','master.proofRequirements':'证明要求','master.vehicleRestriction':'车辆限制','master.materialAccepted':'接收物料','master.operatingHours':'营业时间','master.unloadingRestrictions':'卸货限制','master.pricingNotes':'价格备注',
    'master.companyYard':'公司场地','master.employeeBase':'员工基地','master.workshop':'维修厂','master.fuelStation':'油站','master.other':'其他','master.cash':'现金','master.credit':'赊账',
    'master.addBranch':'新增客户分店','master.editBranch':'编辑客户分店','master.saveBranch':'保存客户分店','master.rawLocationHelp':'正式地址与地点名称保留原有English / Bahasa Melayu数据库值，不进行翻译。',
    'master.weekdaysEmpty':'尚未选择（可稍后安排）','master.materialsEmpty':'尚未选择物料。','master.configurePricing':'请先在客户页面设置客户物料价格。',
    'master.latitude':'纬度','master.longitude':'经度','master.noBuyers':'未找到买方。','master.noOperationalLocations':'未找到营运地点。',
    'buyerBranch.gpsSet':'已有GPS','buyerBranch.gpsNotSet':'未设GPS','buyerBranch.routeEndpoint':'路线终点','buyerBranch.notRouteEndpoint':'非路线终点','buyerBranch.materials':'接收物料','buyerBranch.status.active':'启用','buyerBranch.status.paused':'暂停','buyerBranch.status.closed':'关闭',
    'gpsCollection.alreadyRecorded':'此Branch已有正式GPS或待批准GPS，不能重复采集。',
    'gpsCollection.highAccuracy':'正在取得高精度GPS...',
    'gpsCollection.originalDeviceGps':'原始设备GPS',
    'gpsCollection.finalProposedGps':'最终建议GPS',
    'gpsCollection.finalLatitude':'最终纬度',
    'gpsCollection.finalLongitude':'最终经度',
    'gpsCollection.dragMarker':'拖动红色标记到正确的入口或装卸位置。',
    'gpsCollection.manuallyAdjusted':'位置已人工校正',
    'gpsCollection.finalEqualsDevice':'最终GPS = 设备GPS',
    'gpsCollection.lowAccuracy':'GPS精度较低（±{accuracy}m），建议重新取得或在地图上校正位置。',
    'gpsCollection.toCollect':'待采集GPS','gpsCollection.totalActive':'Active Branch总数','gpsCollection.official':'正式GPS','gpsCollection.pending':'等待批准','gpsCollection.remaining':'剩余待采集','gpsCollection.none':'目前没有需要采集GPS的Branch。','gpsCollection.notCollected':'GPS尚未采集','gpsCollection.gettingGps':'正在获取GPS…','gpsCollection.findingAddress':'正在查找地址…','gpsCollection.state':'State','gpsCollection.city':'City','gpsCollection.street':'Street','gpsCollection.streetNumber':'Street Number','gpsCollection.postalCode':'Postal Code','gpsCollection.remark':'GPS备注','gpsCollection.mapPreview':'Google Map上的采集GPS','gpsCollection.mapKeyMissing':'地图无法使用：尚未配置Google Maps key','gpsCollection.mapLoadFailed':'Google Map无法载入，GPS采集仍可继续。','mobile.getGpsFirst':'请先取得设备GPS再提交。',
    'gps.collectorHelp':'继续使用现有temporary GPS → 主管审批 → official GPS流程；不会建立第二套GPS。',
    'gps.searchCustomerBranch':'搜索Customer Branch','gps.customerBranchPlaceholder':'Customer、Branch、BranchID、电话或地址','gps.selectBranch':'选择Branch','gps.chooseBranchStep':'选择Branch','gps.matchingBranches':'匹配Branch','gps.pleaseSelect':'请选择',
    'gps.source':'来源','gps.saveTemporary':'保存temporary GPS','gps.savedTemporary':'GPS已保存为temporary GPS，不会覆盖official GPS。','gps.withdrawOfficial':'撤销正式GPS','gps.withdrawn':'正式GPS已撤销，Branch已重新进入待采集名单。',
    'gps.latitude':'纬度','gps.longitude':'经度','gps.latitudePlaceholder':'请输入纬度','gps.longitudePlaceholder':'请输入经度','gps.accuracy':'精确度',
    'gps.source.driverCaptured':'司机采集','gps.source.customerWhatsApp':'客户WhatsApp','gps.source.customerPhone':'客户电话','gps.source.manualEntry':'手动输入','gps.source.supervisorConfirmed':'主管确认',
    'gps.proofAlt':'现场GPS证据','gps.adoptOfficial':'确认并保存为正式GPS','gps.keepOfficial':'保留现有正式GPS','gps.recapture':'重新采集GPS','gps.reject':'拒绝',
    'defaultVehicle.label':'默认车辆','defaultVehicle.plural':'默认车辆','defaultVehicle.unassigned':'未分配车辆','defaultVehicle.noneAssigned':'未分配默认车辆','defaultVehicle.add':'添加车辆','defaultVehicle.remove':'移除车辆','defaultVehicle.unavailable':'车辆不可用','defaultVehicle.maximum':'最多3辆车','defaultVehicle.poolUpdated':'更新成功','defaultVehicle.changeToday':'仅修改当天','defaultVehicle.update':'更新默认车辆','defaultVehicle.clear':'清除默认车辆','defaultVehicle.updated':'默认车辆已更新。','defaultVehicle.cleared':'默认车辆已清除。','defaultVehicle.reason':'修改原因','defaultVehicle.scope':'分配层级','defaultVehicle.current':'当前默认车辆','defaultVehicle.help':'默认车辆只用于未来新Draft；当天换车不会修改长期默认。',
    'routeTemplate.title':'固定路线模板','routeTemplate.manage':'管理路线','routeTemplate.assignedVehicle':'负责车辆','routeTemplate.areaOrder':'Area顺序','routeTemplate.branchOrder':'Branch顺序','routeTemplate.unassignedArea':'未分配Area','routeTemplate.notPlaced':'尚未加入路线','routeTemplate.up':'上移','routeTemplate.down':'下移','routeTemplate.remove':'移出路线','routeTemplate.update':'更新固定路线','routeTemplate.updated':'路线更新成功','routeTemplate.loadingZone':'正在载入Zone','routeTemplate.invalidZone':'必须指定有效Zone才能打开固定路线模板。',
    'gps.reviewReason':'请输入审批理由','gps.reviewReasonDefault':'主管现场资料确认','gps.reviewDistanceWarning':'已采用，但与旧位置距离较大，请再次核对。','gps.reviewSaved':'GPS审批决定已保存。',
    'gps.supervisorReview':'主管确认建议','gps.boundaryMap':'Zone边界地图','gps.recommendationSaved':'操作已保存。推荐只会在主管确认后改变Branch的正式Area。',
    'transfer.title':'Excel / CSV导入与导出','transfer.help':'下载模板 → 填写 → 预览 → 确认导入。任何错误都会阻止写入，确保原资料不受破坏。',
    'transfer.module':'模块','transfer.blankTemplate':'下载{entity} XLSX空白模板','transfer.csvTemplate':'下载CSV模板','transfer.exportAll':'导出全部',
    'transfer.chooseFile':'请选择.xlsx或.csv','transfer.preview':'导入前预览','transfer.previewDone':'预览完成。只有按“确认导入”后才会写入SQLite。',
    'transfer.commitDone':'导入事务已完成；重复导入不会产生重复记录。','transfer.errorCount':'发现{count}个错误，必须修正后重新预览。',
    'transfer.exportErrors':'导出错误XLSX','transfer.commit':'确认导入SQLite','transfer.recent':'最近导入 / 导出记录','transfer.noLogs':'暂无导入或导出记录。',
    'resource.vehicleMaster':'车辆主档','resource.employeeMaster':'员工主档','resource.locationMaster':'地点主档','resource.zoneGroup':'Zone Group','resource.saved':'主档已保存。相关已批准路线如受影响，会要求重新批准。',
    'gpsMigration.title':'Jodoo旧GPS迁移','gpsMigration.help':'按BranchID预览；冲突绝不自动覆盖正式GPS。','gpsMigration.downloadTemplate':'下载模板',
    'gpsMigration.selectFile':'选择XLSX / CSV','gpsMigration.previewOnly':'先预览，确认后才写入SQLite。','gpsMigration.history':'历史批次',
    'gpsMigration.commitConfirm':'只会写入没有official GPS的New记录。Conflict不会自动覆盖，是否继续？','gpsMigration.committed':'迁移已提交；Conflict仍等待主管逐笔决定。','gpsMigration.resolveReason':'请输入处理原因'
  }
}

for(const language of Object.keys(moduleMessages))Object.assign(messages[language],moduleMessages[language],routeMessages[language])

Object.assign(messages.en,{
  'optimization.weekTitle':'Seven-day fleet route optimization','optimization.weekHelp':'Optimize every vehicle, customer assignment and stop order for all seven draft days. Review everything once before applying.','optimization.weekAction':'Optimize all vehicles for 7 days','optimization.weekWorking':'Optimizing seven days…','optimization.weekDraftRequired':'All seven days must be draft before optimization.','optimization.weekPreviewTitle':'Seven-day Google route review','optimization.cachedDays':'cached days','optimization.weekApply':'Apply all 7 days atomically',
  'apiError.duplicate_branch_service_date':'This branch already has an active collection stop on the selected service date.',
  'apiError.route_generation_duplicates_unresolved':'Route generation is blocked until existing duplicate branch/date stops are resolved.'
})
Object.assign(messages.ms,{
  'optimization.weekTitle':'Pengoptimuman laluan armada tujuh hari','optimization.weekHelp':'Optimumkan semua kenderaan, pelanggan dan turutan hentian untuk tujuh hari draf. Semak semuanya sekali sebelum digunakan.','optimization.weekAction':'Optimumkan semua kenderaan untuk 7 hari','optimization.weekWorking':'Mengoptimumkan tujuh hari…','optimization.weekDraftRequired':'Semua tujuh hari mesti berstatus draf.','optimization.weekPreviewTitle':'Semakan laluan Google tujuh hari','optimization.cachedDays':'hari cache','optimization.weekApply':'Gunakan semua 7 hari secara atomik',
  'apiError.duplicate_branch_service_date':'Cawangan ini sudah mempunyai hentian kutipan aktif pada tarikh perkhidmatan yang dipilih.',
  'apiError.route_generation_duplicates_unresolved':'Penjanaan laluan disekat sehingga hentian cawangan/tarikh yang berulang diselesaikan.'
})
Object.assign(messages.zh,{
  'optimization.weekTitle':'未来7天全车队路线优化','optimization.weekHelp':'一次安排7天所有可用车辆、客户分配和拜访顺序；先集中检查，再一次提交。','optimization.weekAction':'使用 Google 优化未来7天全部车辆','optimization.weekWorking':'正在逐日优化7天路线…','optimization.weekDraftRequired':'7天必须全部保持草稿状态才能优化。','optimization.weekPreviewTitle':'未来7天 Google 路线总检查','optimization.cachedDays':'天使用缓存','optimization.weekApply':'一次过原子应用7天路线',
  'apiError.duplicate_branch_service_date':'该Branch在所选服务日期已有有效收货Stop。',
  'apiError.route_generation_duplicates_unresolved':'现有Branch／日期重复Stop尚未处理，路线生成已被阻止。'
})

const gpsAreaV2={
  en:{'gpsArea.changes':'Changes only','gpsArea.keep':'Keep original','gpsArea.cross':'Cross-zone','gpsArea.pending':'Pending GPS','gpsArea.missing':'Missing address','gpsArea.low':'Low confidence','gpsArea.all':'All','gpsArea.reason':'Review reason *','gpsArea.reasonPlaceholder':'Enter the human review reason','gpsArea.preview':'Suggestions never take effect automatically'},
  ms:{'gpsArea.changes':'Perubahan sahaja','gpsArea.keep':'Kekalkan asal','gpsArea.cross':'Merentas zon','gpsArea.pending':'GPS menunggu kelulusan','gpsArea.missing':'Alamat tiada','gpsArea.low':'Keyakinan rendah','gpsArea.all':'Semua','gpsArea.reason':'Sebab semakan *','gpsArea.reasonPlaceholder':'Masukkan sebab semakan manusia','gpsArea.preview':'Cadangan tidak berkuat kuasa secara automatik'},
  zh:{'gpsArea.changes':'仅显示变更','gpsArea.keep':'保留原归属','gpsArea.cross':'跨 Zone','gpsArea.pending':'待 GPS 审批','gpsArea.missing':'缺少地址','gpsArea.low':'低可信度','gpsArea.all':'全部','gpsArea.reason':'审核原因 *','gpsArea.reasonPlaceholder':'请输入人工审核原因','gpsArea.preview':'建议不会自动生效'}
}
for(const language of Object.keys(gpsAreaV2))Object.assign(messages[language],gpsAreaV2[language])
Object.assign(messages.en,{
  'gpsArea.awaiting':'Awaiting supervisor','gpsArea.highPending':'High-confidence pending','gpsArea.boundaryConflict':'Boundary conflict','gpsArea.outside':'Outside polygon','gpsArea.noOfficial':'No official GPS','gpsArea.view':'Recommendation view','gpsArea.search':'Search Branch, Branch ID or address','gpsArea.status':'Decision status','gpsArea.later':'Review later','gpsArea.accepted':'Accepted','gpsArea.kept':'Original kept','gpsArea.selectedOther':'Another Area selected','gpsArea.allStatuses':'All statuses','gpsArea.confidence':'Confidence','gpsArea.allConfidence':'All confidence levels','gpsArea.high':'High','gpsArea.medium':'Medium','gpsArea.none':'None','gpsArea.overlapOnly':'Overlap conflicts only','gpsArea.recalculate':'Recalculate preview','gpsArea.bulkTitle':'Bulk confirmation: {count} eligible','gpsArea.bulkLimits':'Only HIGH-confidence Official GPS records inside a polygon, without conflicts, and with a valid Area parent are eligible.','gpsArea.bulkReason':'Bulk reason *','gpsArea.bulkConfirm':'Confirm {count} eligible records','gpsArea.resetTitle':'Reset selected decisions','gpsArea.resetHelp':'Only the {count} explicitly selected recommendations will be reset. Other decisions remain unchanged.','gpsArea.resetReason':'Reset reason *','gpsArea.resetSelected':'Reset {count} selected','gpsArea.selectReset':'Select {branch} for reset','gpsArea.pendingSelection':'Manual selection pending','gpsArea.noZone':'No Zone','gpsArea.noSuggestedZone':'No single suggested Zone','gpsArea.conflict':'Conflict','gpsArea.detailTitle':'GPS Area recommendation','gpsArea.officialGps':'Official GPS','gpsArea.calculation':'Calculation','gpsArea.algorithm':'Algorithm','gpsArea.legacy':'Legacy','gpsArea.gpsSource':'GPS source','gpsArea.official':'Official','gpsArea.polygon':'Polygon','gpsArea.addressTokens':'Address tokens','gpsArea.postcode':'Postcode','gpsArea.centroid':'Area centroid','gpsArea.nearestBranch':'Nearest reference Branch','gpsArea.accept':'Accept recommendation','gpsArea.keepAction':'Keep original assignment','gpsArea.selectArea':'Select another Area','gpsArea.selectAreaPlaceholder':'Select Area','gpsArea.confirmArea':'Confirm selected Area'
})
Object.assign(messages.ms,{
  'gpsArea.awaiting':'Menunggu Supervisor','gpsArea.highPending':'Keyakinan tinggi menunggu','gpsArea.boundaryConflict':'Konflik sempadan','gpsArea.outside':'Di luar poligon','gpsArea.noOfficial':'Tiada GPS rasmi','gpsArea.view':'Paparan cadangan','gpsArea.search':'Cari Cawangan, ID Cawangan atau alamat','gpsArea.status':'Status keputusan','gpsArea.later':'Semak kemudian','gpsArea.accepted':'Diterima','gpsArea.kept':'Asal dikekalkan','gpsArea.selectedOther':'Area lain dipilih','gpsArea.allStatuses':'Semua status','gpsArea.confidence':'Keyakinan','gpsArea.allConfidence':'Semua tahap keyakinan','gpsArea.high':'Tinggi','gpsArea.medium':'Sederhana','gpsArea.none':'Tiada','gpsArea.overlapOnly':'Konflik bertindih sahaja','gpsArea.recalculate':'Kira semula pratonton','gpsArea.bulkTitle':'Pengesahan pukal: {count} layak','gpsArea.bulkLimits':'Hanya rekod GPS rasmi berkeyakinan TINGGI dalam poligon, tanpa konflik dan dengan induk Area sah layak.','gpsArea.bulkReason':'Sebab pukal *','gpsArea.bulkConfirm':'Sahkan {count} rekod layak','gpsArea.resetTitle':'Tetap semula keputusan dipilih','gpsArea.resetHelp':'Hanya {count} cadangan yang dipilih dengan jelas akan ditetap semula. Keputusan lain kekal.','gpsArea.resetReason':'Sebab tetap semula *','gpsArea.resetSelected':'Tetap semula {count} dipilih','gpsArea.selectReset':'Pilih {branch} untuk tetap semula','gpsArea.pendingSelection':'Menunggu pilihan manual','gpsArea.noZone':'Tiada Zon','gpsArea.noSuggestedZone':'Tiada satu Zon cadangan','gpsArea.conflict':'Konflik','gpsArea.detailTitle':'Cadangan Area GPS','gpsArea.officialGps':'GPS rasmi','gpsArea.calculation':'Pengiraan','gpsArea.algorithm':'Algoritma','gpsArea.legacy':'Lama','gpsArea.gpsSource':'Sumber GPS','gpsArea.official':'Rasmi','gpsArea.polygon':'Poligon','gpsArea.addressTokens':'Token alamat','gpsArea.postcode':'Poskod','gpsArea.centroid':'Centroid Area','gpsArea.nearestBranch':'Cawangan rujukan terdekat','gpsArea.accept':'Terima cadangan','gpsArea.keepAction':'Kekalkan penetapan asal','gpsArea.selectArea':'Pilih Area lain','gpsArea.selectAreaPlaceholder':'Pilih Area','gpsArea.confirmArea':'Sahkan Area dipilih'
})
Object.assign(messages.zh,{
  'gpsArea.awaiting':'等待主管审核','gpsArea.highPending':'待审核高可信建议','gpsArea.boundaryConflict':'边界冲突','gpsArea.outside':'Polygon 外','gpsArea.noOfficial':'没有正式 GPS','gpsArea.view':'建议视图','gpsArea.search':'搜索 Branch、Branch ID 或地址','gpsArea.status':'决定状态','gpsArea.later':'稍后审核','gpsArea.accepted':'已接受','gpsArea.kept':'已保留原归属','gpsArea.selectedOther':'已选择其他 Area','gpsArea.allStatuses':'全部状态','gpsArea.confidence':'可信度','gpsArea.allConfidence':'全部可信度','gpsArea.high':'高','gpsArea.medium':'中','gpsArea.none':'无','gpsArea.overlapOnly':'仅重叠冲突','gpsArea.recalculate':'重新计算预览','gpsArea.bulkTitle':'批量确认：{count} 笔符合条件','gpsArea.bulkLimits':'仅限 polygon 内、无冲突、Area parent 有效且使用正式 GPS 的真正高可信记录。','gpsArea.bulkReason':'批量原因 *','gpsArea.bulkConfirm':'确认 {count} 笔符合条件记录','gpsArea.resetTitle':'重置选中的人工决定','gpsArea.resetHelp':'只重置明确选中的 {count} 笔建议；其他人工决定保持不变。','gpsArea.resetReason':'重置原因 *','gpsArea.resetSelected':'重置选中的 {count} 笔','gpsArea.selectReset':'选择 {branch} 进行重置','gpsArea.pendingSelection':'等待人工选择','gpsArea.noZone':'没有 Zone','gpsArea.noSuggestedZone':'没有唯一建议 Zone','gpsArea.conflict':'冲突','gpsArea.detailTitle':'GPS Area 建议','gpsArea.officialGps':'正式 GPS','gpsArea.calculation':'计算方式','gpsArea.algorithm':'算法','gpsArea.legacy':'旧版','gpsArea.gpsSource':'GPS 来源','gpsArea.official':'正式','gpsArea.polygon':'Polygon','gpsArea.addressTokens':'地址 token','gpsArea.postcode':'邮编','gpsArea.centroid':'Area centroid','gpsArea.nearestBranch':'最近参考 Branch','gpsArea.accept':'接受建议','gpsArea.keepAction':'保留原归属','gpsArea.selectArea':'选择其他 Area','gpsArea.selectAreaPlaceholder':'选择 Area','gpsArea.confirmArea':'确认所选 Area'
})

for(const language of Object.keys(addressAnalysisMessages))Object.assign(messages[language],addressAnalysisMessages[language])
Object.assign(messages.en,{'optimization.availability':'Vehicle and crew availability for this date','optimization.vehicles':'Vehicles','optimization.crew':'Drivers and crew','optimization.leave':'Leave','optimization.availabilityStatus':'Availability status','optimization.available':'Available','optimization.excluded':'Excluded','optimization.maintenance':'Maintenance','optimization.offDuty':'Off duty','optimization.startTime':'Start time','optimization.endTime':'End time','optimization.availabilityReason':'Availability reason is required','optimization.availabilitySaved':'Availability saved','optimization.ruleSuggestions':'Proposed routing rules','optimization.supportingOverrides':'Supporting overrides: {count}','optimization.approveRule':'Approve rule','optimization.rejectRule':'Reject rule','optimization.ruleDecisionReason':'Enter the supervisor decision reason','optimization.currentRoad':'Current road route','optimization.proposedRoad':'Proposed road route','optimization.savings':'Estimated road savings','optimization.fallbackHours':'Default hours fallback','optimization.routeMap':'Proposed Google road routes','optimization.dayAction':'Optimize with Google','optimization.tripAction':'Optimize this trip with Google','optimization.working':'Preparing Google preview…','optimization.roadLabel':'Google road-based optimization · preview only','optimization.vehicleSelection':'Vehicles included for this date','optimization.previewTitle':'Google route comparison','optimization.cached':'Cached result — no new billable request','optimization.distance':'Road distance','optimization.duration':'Road duration','optimization.assigned':'Proposed stops','optimization.unassigned':'Unassigned','optimization.proposed':'Proposed vehicle and order','optimization.warnings':'Warnings and conflicts','optimization.applyReason':'Reason to apply','optimization.reasonRequired':'A reason is required.','optimization.apply':'Apply atomically'})
Object.assign(messages.ms,{'optimization.availability':'Ketersediaan kenderaan dan kru untuk tarikh ini','optimization.vehicles':'Kenderaan','optimization.crew':'Pemandu dan kru','optimization.leave':'Cuti','optimization.availabilityStatus':'Status ketersediaan','optimization.available':'Tersedia','optimization.excluded':'Dikecualikan','optimization.maintenance':'Penyelenggaraan','optimization.offDuty':'Tidak bertugas','optimization.startTime':'Masa mula','optimization.endTime':'Masa tamat','optimization.availabilityReason':'Sebab ketersediaan diperlukan','optimization.availabilitySaved':'Ketersediaan disimpan','optimization.ruleSuggestions':'Peraturan laluan dicadangkan','optimization.supportingOverrides':'Sokongan perubahan: {count}','optimization.approveRule':'Luluskan peraturan','optimization.rejectRule':'Tolak peraturan','optimization.ruleDecisionReason':'Masukkan sebab keputusan penyelia','optimization.currentRoad':'Laluan jalan semasa','optimization.proposedRoad':'Laluan jalan dicadangkan','optimization.savings':'Anggaran penjimatan jalan','optimization.fallbackHours':'Waktu lalai sandaran','optimization.routeMap':'Laluan jalan Google dicadangkan','optimization.dayAction':'Optimumkan dengan Google','optimization.tripAction':'Optimumkan trip ini dengan Google','optimization.working':'Menyediakan pratonton Google…','optimization.roadLabel':'Pengoptimuman berasaskan jalan Google · pratonton sahaja','optimization.vehicleSelection':'Kenderaan yang disertakan untuk tarikh ini','optimization.previewTitle':'Perbandingan laluan Google','optimization.cached':'Keputusan cache — tiada permintaan berbayar baharu','optimization.distance':'Jarak jalan','optimization.duration':'Tempoh jalan','optimization.assigned':'Hentian dicadangkan','optimization.unassigned':'Belum ditetapkan','optimization.proposed':'Kenderaan dan turutan dicadangkan','optimization.warnings':'Amaran dan konflik','optimization.applyReason':'Sebab untuk guna','optimization.reasonRequired':'Sebab diperlukan.','optimization.apply':'Gunakan secara atomik'})
Object.assign(messages.zh,{'optimization.availability':'此日期的车辆与员工可用时间','optimization.vehicles':'车辆','optimization.crew':'司机与员工','optimization.leave':'休假','optimization.availabilityStatus':'可用状态','optimization.available':'可用','optimization.excluded':'暂时排除','optimization.maintenance':'维修','optimization.offDuty':'休班','optimization.startTime':'开始时间','optimization.endTime':'结束时间','optimization.availabilityReason':'必须填写可用时间原因','optimization.availabilitySaved':'可用时间已保存','optimization.ruleSuggestions':'建议的路线规则','optimization.supportingOverrides':'支持的人工调整：{count}','optimization.approveRule':'批准规则','optimization.rejectRule':'拒绝规则','optimization.ruleDecisionReason':'输入主管决定原因','optimization.currentRoad':'当前道路路线','optimization.proposedRoad':'建议道路路线','optimization.savings':'预计道路节省','optimization.fallbackHours':'默认工时后备','optimization.routeMap':'建议的 Google 道路路线','optimization.dayAction':'使用 Google 优化','optimization.tripAction':'使用 Google 优化此 Trip','optimization.working':'正在准备 Google 预览…','optimization.roadLabel':'Google 道路优化 · 仅预览','optimization.vehicleSelection':'此日期纳入的车辆','optimization.previewTitle':'Google 路线比较','optimization.cached':'使用缓存结果 — 没有新增计费请求','optimization.distance':'道路距离','optimization.duration':'道路时间','optimization.assigned':'建议站点','optimization.unassigned':'未分配','optimization.proposed':'建议车辆与顺序','optimization.warnings':'警告与冲突','optimization.applyReason':'应用原因','optimization.reasonRequired':'必须填写原因。','optimization.apply':'原子应用'})

const scheduleManagementMessages={
 en:{'schedule.manageDescription':'Maintain future collection master settings. Existing Dispatch Stops remain unchanged.','schedule.weekdays':'Collection Weekdays','schedule.nextDate':'Next Collection Date','schedule.missing':'Missing Schedule','schedule.blocked':'Multiple Schedule / Blocked','schedule.edit':'Edit','schedule.currentFrequency':'Current Frequency','schedule.anchorDate':'Anchor Date','schedule.effectiveDate':'Effective Date','schedule.monthlyOccurrence':'Monthly Occurrence','schedule.reason':'Reason','schedule.preview':'Preview Changes','schedule.conflict':'Conflict.','schedule.reload':'Reload required.','schedule.saved':'Saved'},
 ms:{'schedule.manageDescription':'Selenggara tetapan induk kutipan akan datang. Hentian Dispatch sedia ada tidak berubah.','schedule.weekdays':'Hari Kutipan','schedule.nextDate':'Tarikh Kutipan Seterusnya','schedule.missing':'Jadual Tiada','schedule.blocked':'Pelbagai Jadual / Disekat','schedule.edit':'Edit','schedule.currentFrequency':'Kekerapan Semasa','schedule.anchorDate':'Tarikh Sauh','schedule.effectiveDate':'Tarikh Berkuat Kuasa','schedule.monthlyOccurrence':'Kejadian Bulanan','schedule.reason':'Sebab','schedule.preview':'Pratonton Perubahan','schedule.conflict':'Konflik.','schedule.reload':'Muat semula diperlukan.','schedule.saved':'Disimpan'},
 zh:{'schedule.manageDescription':'维护未来收货主档设置；现有Dispatch Stops不会更改。','schedule.weekdays':'收货星期','schedule.nextDate':'下次收货日期','schedule.missing':'没有排程','schedule.blocked':'多排程／已阻止','schedule.edit':'编辑','schedule.currentFrequency':'当前频率','schedule.anchorDate':'锚定日期','schedule.effectiveDate':'生效日期','schedule.monthlyOccurrence':'每月次序','schedule.reason':'原因','schedule.preview':'预览更改','schedule.conflict':'资料冲突。','schedule.reload':'请重新载入。','schedule.saved':'已保存'}
}
for(const language of Object.keys(scheduleManagementMessages))Object.assign(messages[language],scheduleManagementMessages[language])

const sourceAliases=new Map()
for(const language of Object.keys(messages)){
  for(const[key,value]of Object.entries(messages[language]))sourceAliases.set(String(value),key)
}
for(const[source,key]of Object.entries({
  '客户与分店':'branch.title','查看 / 编辑':'branch.viewEdit','Materials & Current Prices':'branch.materials',
  'Materials & Prices':'material.title','Employee Directory':'employee.title','Vehicle Master':'vehicle.title',
  'VEHICLE MANAGEMENT':'vehicle.detailTitle','Weekly Dispatch Planner':'dispatch.title','WEEKLY DISPATCH PLANNER':'dispatch.title',
  'Special Collection Requests':'specialRequest.title','SPECIAL COLLECTION REQUESTS':'specialRequest.title',
  'Zone Area Confirmation':'zone.title','GPS Zone 建议与边界管理':'gps.zoneTitle','GPS-BASED ZONE RECOMMENDATION V1':'gps.zoneTitle',
  'Excel 正式导入':'import.title','收货排程':'schedule.title','GPS 与资料完整度':'schedule.dataQuality',
  '员工、车辆、地点与区域':'nav.resources','账号管理':'account.title','新增':'common.add','关闭':'common.close',
  '取消':'common.cancel','保存':'common.save','载入中…':'common.loading','操作失败':'common.operationFailed',
  'Customer Master':'master.customerTitle','Customer Branch Master':'master.branchTitle','Buyer Master':'master.buyerTitle','Operational Location Master':'master.locationTitle',
  'Location Name':'master.locationName','Contact Person':'master.contactPerson','Branch ID':'master.branchId','Customer ID':'master.customerId','Branch Name':'master.branchName','Buyer ID':'master.buyerId','Buyer Name':'master.buyerName','Location ID':'master.locationId','Location Type':'master.locationType',
  'Official Latitude':'master.officialLatitude','Official Longitude':'master.officialLongitude','Latest Temporary Latitude':'master.temporaryLatitude','Latest Temporary Longitude':'master.temporaryLongitude','GPS Verification Status':'master.gpsVerificationStatus','Area ID':'master.areaId',
  'Collection Time Constraint':'master.collectionTime','Payment Type':'master.paymentType','Proof Requirements':'master.proofRequirements','Vehicle Restriction':'master.vehicleRestriction','Material Accepted':'master.materialAccepted','Operating Hours':'master.operatingHours','Unloading Restrictions':'master.unloadingRestrictions','Pricing Notes':'master.pricingNotes',
  'Company Yard':'master.companyYard','Employee Base':'master.employeeBase','Workshop':'master.workshop','Fuel Station':'master.fuelStation','Other':'master.other','Cash':'master.cash','Credit':'master.credit',
  'Add Customer Branch':'master.addBranch','Edit Customer Branch':'master.editBranch','Save Customer Branch':'master.saveBranch','Official addresses and location names remain in their original English / Bahasa Melayu, are not translated.':'master.rawLocationHelp',
  'Address':'common.address','Phone':'common.phone','Status':'common.status','Notes':'common.notes','Active':'common.active','Paused':'common.paused','Closed':'common.closed',
  'Latitude':'master.latitude','Longitude':'master.longitude',
  'active':'common.active','paused':'common.paused','closed':'common.closed','GPS Collector':'gps.collector',
  'Cancel':'common.cancel','Save':'common.save','Saving…':'common.saving','Remove':'common.remove','Select':'common.select','Add Material':'material.add','Audit history':'customer.audit',
  'Changes only':'gpsArea.changes','Keep original':'gpsArea.keep','Cross-zone':'gpsArea.cross','Pending GPS':'gpsArea.pending','Missing address':'gpsArea.missing','Low confidence':'gpsArea.low','All':'gpsArea.all','Review reason *':'gpsArea.reason','Enter the human review reason':'gpsArea.reasonPlaceholder','Suggestions never take effect automatically':'gpsArea.preview',
  'Standard':'material.standard','Outstation':'material.outstation','Special Price':'customer.specialPrice','Not selected (may be arranged later)':'master.weekdaysEmpty','Not selected Material.':'master.materialsEmpty','Configure it first on the  Customer  page Customer Material Pricing.':'master.configurePricing',
  'A Branch selects the Customer material and Standard or Outstation type; the actual price is not duplicated.':'branch.materialHelp','On Call does not enter the fixed weekly route. Use Request Collection.':'branch.onCallHelp','Paused branches do not enter automatic scheduling.':'branch.pausedHelp',
  '资料载入失败':'common.loadFailed','查看详情':'common.details','搜索':'common.search','状态':'common.status',
  '全部状态':'common.all','全部 GPS':'common.all','全部排程':'common.all','上一页':'common.previous','下一页':'common.next',
  '未设置':'common.notSet','无':'common.none','有':'common.yes','没有':'common.no','启用中':'common.active','已停用':'common.disabled'
  ,'缺 GPS':'dispatch.missingGps','没有排程':'schedule.notFound','所有排程':'schedule.title','全部 Frequency':'schedule.allFrequency',
  '只看无法匹配 Branch':'schedule.unmatchedOnly','资料直接来自 SQLite；Zone Group 可由主管管理，Area 是详细路线区域。':'customer.description',
  '搜索 Customer Name、Branch Name 或 BranchID':'branch.search','ScheduleID 为唯一编号；Zone Group 与详细 Area 分层显示。':'schedule.description',
  '缺 GPS 或没有排程不是导入错误；系统将其分组列出供后续补齐。':'schedule.dataQualityHelp',
  '员工名单与详情分开；点击员工后才读取完整资料。':'employee.description','下载XLSX模板':'common.download','下载CSV模板':'common.download',
  '导出当前筛选':'employee.exportFiltered','导出CSV':'common.export','敏感资料专用导出':'employee.exportSensitive','导出错误':'common.export',
  '确认导入':'import.confirm','＋ 新增员工':'employee.add','新增员工':'employee.add','没有符合筛选条件的员工。':'employee.noResults',
  '基本资料':'employee.basic','岗位与雇佣':'employee.jobEmployment','身份证、银行、EPF、SOCSO':'employee.sensitive',
  'Employment Periods':'employee.periods','修改历史':'employee.history','KCS内部账号':'employee.internalAccount','办理离职':'employee.terminate','重新入职':'employee.rehire',
  'Jodoo 旧 GPS 迁移':'nav.gpsMigration','按 BranchID 预览；冲突绝不自动覆盖正式 GPS。':'gps.zoneDescription','下载模板':'common.download',
  '选择 XLSX / CSV':'common.select','导出查核报告':'common.export','确认迁移 New 记录':'common.confirm','旧 GPS':'gps.official','导入 GPS':'gps.temporary',
  '保留正式':'gps.keepOfficial','采用导入':'gps.adopt','拒绝':'gps.reject','历史批次':'employee.history',
  '只使用 official GPS。temporary GPS 仅用于临时派车与导航，不参与 Zone 或 Area 正式建议。':'gps.zoneDescription',
  'GPS Zone 资料载入中…':'gps.loading','编辑 Zone':'common.edit','绘制新边界':'common.add','修改当前边界':'common.edit','撤销最后一点':'common.clear',
  '保存新版本':'common.save','等待主管':'zone.pending','高置信度待确认':'zone.pending','没有 official GPS':'gps.noOfficial','稍后处理':'gps.later',
  '已接受':'common.active','保持原归属':'gps.keepOriginal','选择其他':'gps.selectOther','重新计算建议':'gps.recalculate','接受建议':'gps.accept',
  '选择其他 Zone / Area':'gps.selectOther','选择 Zone':'common.select','选择 Area':'common.select','确认其他归属':'zone.confirm',
  '← 返回总览':'common.back','先预览数据库变化；只有按下“确认导入”后，才会在单一 transaction 内更新主档。':'import.description',
  '预览不修改主档':'import.previewOnly','选择或拖入一份或多份 Jodoo Excel':'import.choose','预览结果':'import.preview','识别到的资料':'import.detected',
  '导入问题':'import.issues','KCS 是客户与营运地点主档；Jodoo 暂时只继续用于开单。所有关键修改保留审计，并保护已批准路线。':'customer.description',
  '已确认 Area':'zone.confirmed','待确认 Area':'zone.pending','Area 总数':'zone.areaTotal','＋ 新增':'common.add','主档载入中…':'common.loading',
  '恢复':'common.enabled','暂停':'common.paused','审计记录':'customer.audit','选择共享 Price Level':'material.priceLevel',
  '每种 Material 必须有 Standard Price；只有需要时才启用 Outstation Price。':'customer.materialHelp','只读：需要 Administrator 或获授权 Supervisor 权限才能修改价格。':'material.readOnly',
  '＋ 加入 Material':'material.add','尚未设置 Customer Material Pricing。':'customer.noPricing','选择 Material':'common.select','移除':'material.remove',
  'Enable Outstation Price':'material.enableOutstation','Collection Frequency':'branch.frequency','Assigned Weekdays':'branch.weekdays',
  'On Call 不会自动进入固定周路线，请使用 Request Collection。':'branch.onCallHelp','Paused 分店不会进入自动排程。':'branch.pausedHelp',
  'Branch 只选择 Customer 已设置的 Material 及 Standard / Outstation，不重复保存实际价格。':'branch.materialHelp',
  '＋ 新增 Price Level':'material.addLevel','受影响分店名单':'material.affectedBranches','第一层只显示 Material。选择 Material 后才管理该货物的 Price Levels。':'material.description',
  '＋ 新增 Material':'material.add','当前账号只可查看货物与价格。价格管理需要 Administrator 或获授权 Supervisor。':'material.readOnly',
  'Zone Group 数量可由主管管理；详细 Area 继续用于 GPS、距离和统计。':'zone.description','建立登录账号':'account.createAction','改名称':'zone.rename',
  '新增地点':'common.add','兼任岗位资格':'employee.secondaryRoles','选择员工':'account.selectEmployee','保存兼任岗位':'common.save','解除锁定':'account.unlock','重设密码':'account.resetPassword',
  '先查找现有分店；找不到才建立潜在新客户，并在发布前补齐 Jodoo 正式账号。':'specialRequest.description','查看一周排车':'dispatch.title',
  'GPS 附近（3km）':'specialRequest.nearby','改为新客户':'specialRequest.potential','临时客户名称':'specialRequest.temporaryName','要求收货日期':'specialRequest.requestedDate',
  '预计重量（kg）':'specialRequest.estimatedWeight','已承诺客户':'specialRequest.promised','特别要求／备注':'specialRequest.requirement','建立临时请求':'specialRequest.create','请求清单':'specialRequest.list',
  '← 返回 Vehicle Master':'common.back','状态变动不可删除。':'vehicle.statusHistory','保存基本资料':'vehicle.saveBasic','法定与到期提醒':'vehicle.compliance',
  '保存提醒':'vehicle.saveReminder','保存使用记录':'common.save','暂无记录':'common.noData','车辆资料已保存。':'common.saved',
  '＋ 新增临时车辆':'dispatch.addTemporaryVehicle','账号资料未齐，禁止发布':'common.warning','所有客户已分配到车辆':'dispatch.noUnassigned',
  '预计重量':'dispatch.estimatedWeight','时间限制':'dispatch.timeRestricted','未分配车辆 ▾':'dispatch.vehicleUnassigned','显示维修／停用车辆':'dispatch.showUnavailable',
  '没有符合的车辆':'dispatch.noVehicle','整车转移':'dispatch.transferVehicle','拖放 Zone、Area 或单个客户到这里':'dispatch.dropHelp','锁定顺序':'dispatch.lockSequence',
  '移动 Area 只建立待确认归属；主管另按“确认归属”后，新路线才采用新 Zone。BranchID、CustomerID、GPS、固定排程与历史派车不会被修改。':'zone.description',
  '新增 Zone Group':'zone.add','改名':'zone.rename','合并':'zone.merge','拆分勾选 Area':'zone.split','只看待确认':'zone.pending','只看已确认':'zone.confirmed',
  '查看明细 →':'zone.viewDetails','选择目标 Zone':'zone.selectTarget','移动到指定 Zone':'zone.move','填写移动原因（必填）':'zone.moveReason',
  '资料载入中…':'common.loading','没有符合筛选条件的资料。':'common.noData','只有 Supervisor 可以批量移动 Area。':'apiError.permission_denied'
  ,'导出资料 XLSX':'customer.exportData','Branch 找不到':'schedule.notFound','选择 Excel 文件':'import.selectFile',
  '导出 Area-Zone Mapping':'customer.exportMappingLabel','不物理删除历史资料；使用 Pause、Resume 或 Close 管理状态。':'customer.retentionHelp',
  '已有排程且已有 GPS':'schedule.qualityScheduledGps','已有排程但缺 GPS':'schedule.qualityScheduledMissingGps','有 GPS 但没有排程':'schedule.qualityGpsWithoutSchedule','没有 GPS 也没有排程':'schedule.qualityMissingBoth',
  '搜索 Branch / BranchID / 地址':'gps.searchBranchAddress','Polygon 外':'gps.outsidePolygon','全部置信度':'gps.allConfidence','只看重叠冲突':'gps.overlapOnly',
  '批量确认 High':'gps.batchHigh','Recommendation only · 不会自动修改正式归属':'gps.recommendationOnly','当前 Area':'gps.currentArea','当前 Zone':'gps.currentZone',
  '建议 Area':'gps.suggestedArea','建议 Zone':'gps.suggestedZone','参考距离':'gps.referenceDistance','与边界冲突':'gps.boundaryConflict','建议原因':'gps.reason',
  '分类':'gps.category','决定':'gps.decision','先预览，确认后才写入 SQLite':'gps.migrationPreview',
  '正式车辆按 Lorry Number — Registration Number 显示；Sold 车辆只保留历史，不参加派车或提醒。':'resource.vehicleHelp',
  'Vehicle Number，例如 Lorry 7':'resource.vehicleNumberPlaceholder',
  'Job Role 与 System Role 分开保存；只有 Active 且具备 Driver / Attendant 资格的员工进入派车选择器。':'resource.jobHelp',
  '用于车辆与员工 Default Base，以及路线出发与结束地点。':'resource.locationHelp',
  '账号权限与工作岗位分开；敏感资料权限只可由Admin明确授权。':'resource.accountHelp',
  '搜索 Area / AreaID / Zone':'zone.search','全部 GPS 状态':'zone.allGps','至少一个正式 GPS':'zone.withGps','包含缺 GPS Branch':'zone.missingGpsBranch',
  'Area 名称排序':'zone.areaSort','客户数量：多到少':'zone.customerDesc','客户数量：少到多':'zone.customerAsc',
  '勾选当前筛选结果':'zone.selectFiltered','清除勾选':'zone.clearSelection','批量移动（保持待确认）':'zone.bulkMove',
  '统计明细':'zone.statistics','搜索 Area、客户名称、BranchID':'zone.searchDetails','没有固定排程':'zone.noFixedSchedule',
  '这个 Area 暂时没有分店。':'zone.noAreaBranches','相邻 Area（按现有正式 GPS 估算）':'zone.adjacentAreas','现有 GPS 资料不足，暂时无法计算。':'zone.insufficientGps'
  ,'顺序':'zone.sortOrder','全部 Zone':'zone.allZones','撤销确认':'zone.unconfirm','搜索姓名、Employee Code、电话或IC后几位':'employee.searchDirectory',
  '无员工编号':'employee.noCode','无账号':'employee.noAccount','导出资料':'customer.exportDataShort',
  '新 Zone 名称':'zone.newPlaceholder','Code（可留空自动产生）':'zone.codePlaceholder','显示顺序':'zone.orderPlaceholder','有正式 GPS':'zone.officialGps',
  '停用':'zone.deactivate','重新启用':'zone.reactivate','未填写名称/品牌':'vehicle.missingNameBrand','未填写载重':'vehicle.missingCapacity',
  '未设置车牌':'vehicle.missingPlate','临时车辆':'vehicle.temporaryLabel'
}))sourceAliases.set(source,key)

export function translateSource(language,value){
  const source=String(value??''),trimmed=source.trim(),key=sourceAliases.get(trimmed)
  if(key){
    const translated=translate(language,key)
    return source.replace(trimmed,translated)
  }
  const recommendationCount=trimmed.match(/^显示\s*(\d+)\s*项$/)
  if(recommendationCount)return source.replace(trimmed,translate(language,'gps.itemsShown',{count:recommendationCount[1]}))
  const zoneCounts=trimmed.match(/^显示\s*(\d+)\s*个\s*·\s*已勾选\s*(\d+)\s*个$/)
  if(zoneCounts)return source.replace(trimmed,translate(language,'zone.counts',{shown:zoneCounts[1],selected:zoneCounts[2]}))
  let translated=source
  for(const fragmentKey of ['common.noPhone','common.noNotes','common.notSet','vehicle.missingNameBrand','vehicle.missingCapacity','vehicle.missingPlate','vehicle.temporaryLabel']){
    for(const sourceLanguage of Object.keys(messages)){
      const fragment=messages[sourceLanguage][fragmentKey]
      if(fragment&&translated.includes(fragment))translated=translated.replaceAll(fragment,translate(language,fragmentKey))
    }
  }
  return translated
}

Object.assign(messages.en,{'optimization.weekTitle':'Automatic seven-day fleet scheduling','optimization.weekHelp':'The system directly assigns every scheduled customer to available vehicles and orders stops by Google roads. Make manual changes only if needed afterward.','optimization.weekAction':'Automatically arrange all 7 days','optimization.weekWorking':'Arranging and saving seven days…','apiError.route_unassigned':'Google could not assign every stop. No draft routes were changed; review the listed stops.','apiError.route_validation':'Some route data must be corrected first. No draft routes were changed.'})
Object.assign(messages.ms,{'optimization.weekTitle':'Jadual armada tujuh hari automatik','optimization.weekHelp':'Sistem terus menetapkan semua pelanggan berjadual kepada kenderaan tersedia dan menyusun hentian mengikut jalan Google. Buat perubahan manual selepas itu hanya jika perlu.','optimization.weekAction':'Susun semua 7 hari secara automatik','optimization.weekWorking':'Menyusun dan menyimpan tujuh hari…','apiError.route_unassigned':'Google tidak dapat menetapkan semua hentian. Tiada laluan draf diubah; semak hentian yang disenaraikan.','apiError.route_validation':'Sesetengah data laluan perlu dibetulkan dahulu. Tiada laluan draf diubah.'})
Object.assign(messages.zh,{'optimization.weekTitle':'未来7天自动排车','optimization.weekHelp':'系统根据已设星期、客户资料和可用车辆，直接按 Google 道路分车及排列拜访顺序；完成后只有不满意才人工调整。','optimization.weekAction':'自动安排并保存未来7天','optimization.weekWorking':'正在安排并保存未来7天…','apiError.route_unassigned':'Google 无法安排全部站点，草稿没有被修改；请查看下面列出的站点。','apiError.route_validation':'部分路线资料必须先修正，草稿没有被修改。'})

Object.assign(messages.en,{'purchase.receipt':'Electronic Purchase Bill','purchase.billCreated':'Electronic Bill {number} created.','purchase.selectProof':'Select a payment proof photo.','purchase.proofSize':'Payment proof must be no larger than 8 MB.','purchase.proofUploaded':'Payment proof uploaded. You may continue to the next customer.','purchase.loading':'Loading billing…','purchase.created':'Electronic Bill created','purchase.print':'Print / Reprint','purchase.cashProof':'Payment proof photo','purchase.uploadProof':'Upload payment proof','purchase.createTitle':'Create Electronic Purchase Bill','purchase.item':'Item','purchase.quantity':'Weight / Quantity','purchase.otherItem':'Other Item','purchase.weightMethod':'How weight was determined','purchase.weight.on_site':'Weighed on site','purchase.weight.factory':'Weighed at factory','purchase.weight.estimated':'Estimated by experience','purchase.paperChoice':'Paper option','purchase.createPrint':'Create electronic Bill and print','purchase.createNoPrint':'Create electronic Bill only — no print','purchase.create':'Create Electronic Bill','purchase.saving':'Saving…','purchase.nextCustomer':'Complete and continue to next customer'})
Object.assign(messages.ms,{'purchase.receipt':'Bil Pembelian Elektronik','purchase.billCreated':'Bil elektronik {number} telah dibuat.','purchase.selectProof':'Pilih foto bukti pembayaran.','purchase.proofSize':'Bukti pembayaran tidak boleh melebihi 8 MB.','purchase.proofUploaded':'Bukti pembayaran dimuat naik. Anda boleh terus ke pelanggan seterusnya.','purchase.loading':'Memuatkan bil…','purchase.created':'Bil Elektronik telah dibuat','purchase.print':'Cetak / Cetak semula','purchase.cashProof':'Foto bukti pembayaran','purchase.uploadProof':'Muat naik bukti pembayaran','purchase.createTitle':'Buat Bil Pembelian Elektronik','purchase.item':'Item','purchase.quantity':'Berat / Kuantiti','purchase.otherItem':'Item lain','purchase.weightMethod':'Cara berat ditentukan','purchase.weight.on_site':'Ditimbang di lokasi','purchase.weight.factory':'Ditimbang di kilang','purchase.weight.estimated':'Anggaran berdasarkan pengalaman','purchase.paperChoice':'Pilihan kertas','purchase.createPrint':'Buat Bil elektronik dan cetak','purchase.createNoPrint':'Buat Bil elektronik sahaja — jangan cetak','purchase.create':'Buat Bil Elektronik','purchase.saving':'Menyimpan…','purchase.nextCustomer':'Selesai dan terus ke pelanggan seterusnya'})
Object.assign(messages.zh,{'purchase.receipt':'电子采购单','purchase.billCreated':'电子单 {number} 已建立。','purchase.selectProof':'请选择付款证明照片。','purchase.proofSize':'付款证明不可超过 8 MB。','purchase.proofUploaded':'付款证明已上传，可以前往下一家。','purchase.loading':'正在载入开单资料…','purchase.created':'电子单已建立','purchase.print':'打印／重新打印','purchase.cashProof':'付款证明照片','purchase.uploadProof':'上传付款证明','purchase.createTitle':'建立电子采购单','purchase.item':'Item','purchase.quantity':'重量／数量','purchase.otherItem':'其他 Item','purchase.weightMethod':'重量取得方式','purchase.weight.on_site':'现场称重','purchase.weight.factory':'拉回工厂称重','purchase.weight.estimated':'凭经验估重','purchase.paperChoice':'纸张选择','purchase.createPrint':'建立电子单并打印','purchase.createNoPrint':'只建立电子单，不打印','purchase.create':'建立电子单','purchase.saving':'保存中…','purchase.nextCustomer':'完成并前往下一家'})


Object.assign(messages.en,{'purchase.takePhoto':'Take Photo','purchase.chooseGallery':'Choose from Gallery or Files','purchase.retakePhoto':'Retake Photo','purchase.replaceFromGallery':'Replace from Gallery or Files','purchase.removePhoto':'Remove selected photo','purchase.proofPreview':'Selected payment proof preview','purchase.proofSelected':'Photo selected, waiting for confirmation','purchase.proofProcessing':'Processing photo…','purchase.proofWaiting':'Payment proof selected, waiting to upload.','purchase.proofUploading':'Uploading proof…','purchase.confirmUpload':'Confirm and upload proof','purchase.proofRemoved':'Selected photo removed. Bill details were kept.','purchase.proofProcessFailed':'Photo processing failed. Retake it or choose JPEG/PNG.'})
Object.assign(messages.ms,{'purchase.takePhoto':'Ambil Gambar','purchase.chooseGallery':'Pilih dari Galeri atau Fail','purchase.retakePhoto':'Ambil Semula Gambar','purchase.replaceFromGallery':'Ganti dari Galeri atau Fail','purchase.removePhoto':'Buang gambar dipilih','purchase.proofPreview':'Pratonton bukti bayaran dipilih','purchase.proofSelected':'Gambar dipilih, menunggu pengesahan','purchase.proofProcessing':'Memproses gambar…','purchase.proofWaiting':'Bukti bayaran dipilih, menunggu muat naik.','purchase.proofUploading':'Memuat naik bukti…','purchase.confirmUpload':'Sahkan dan muat naik bukti','purchase.proofRemoved':'Gambar dipilih telah dibuang. Butiran bil dikekalkan.','purchase.proofProcessFailed':'Pemprosesan gambar gagal. Ambil semula atau pilih JPEG/PNG.'})
Object.assign(messages.zh,{'purchase.takePhoto':'拍照','purchase.chooseGallery':'从相册或文件选择','purchase.retakePhoto':'重新拍照','purchase.replaceFromGallery':'从相册或文件更换','purchase.removePhoto':'删除已选照片','purchase.proofPreview':'已选择的付款证明预览','purchase.proofSelected':'照片已选择，等待确认','purchase.proofProcessing':'正在处理照片…','purchase.proofWaiting':'付款证明已选择，等待上传。','purchase.proofUploading':'正在上传付款证明…','purchase.confirmUpload':'确认并上传付款证明','purchase.proofRemoved':'已删除所选照片，开单资料已保留。','purchase.proofProcessFailed':'照片处理失败，请重拍或选择 JPEG/PNG。'})

Object.assign(messages.en,{'mobile.comeBackLater':'Come back later','mobile.expectedReturnTime':'Expected return time','mobile.returnTimeRequired':'Select the expected return time.','mobile.deferCustomerRequest':'Customer requested return later','mobile.deferNoSpace':'No space available','mobile.deferOther':'Other operational reason','mobile.requestDeferApproval':'Request supervisor approval','mobile.deferWaiting':'Request sent. The next customer stays locked until a supervisor approves.','mobile.waitingSupervisor':'Waiting for supervisor approval','mobile.nextCustomerLocked':'The next customer is locked.','mobile.autoRefresh':'This page checks the approval automatically.'})
Object.assign(messages.ms,{'mobile.comeBackLater':'Datang semula kemudian','mobile.expectedReturnTime':'Anggaran masa kembali','mobile.returnTimeRequired':'Pilih anggaran masa kembali.','mobile.deferCustomerRequest':'Pelanggan minta datang semula','mobile.deferNoSpace':'Tiada ruang tersedia','mobile.deferOther':'Sebab operasi lain','mobile.requestDeferApproval':'Minta kelulusan penyelia','mobile.deferWaiting':'Permintaan dihantar. Pelanggan seterusnya kekal dikunci sehingga penyelia meluluskan.','mobile.waitingSupervisor':'Menunggu kelulusan penyelia','mobile.nextCustomerLocked':'Pelanggan seterusnya dikunci.','mobile.autoRefresh':'Halaman ini menyemak kelulusan secara automatik.'})
Object.assign(messages.zh,{'mobile.comeBackLater':'稍后再来','mobile.expectedReturnTime':'预计返回时间','mobile.returnTimeRequired':'请选择预计返回时间。','mobile.deferCustomerRequest':'顾客要求稍后再来','mobile.deferNoSpace':'顾客暂时没有空间','mobile.deferOther':'其他现场原因','mobile.requestDeferApproval':'提交主管批准','mobile.deferWaiting':'申请已发送；主管批准前，下一位顾客保持锁定。','mobile.waitingSupervisor':'等待主管批准','mobile.nextCustomerLocked':'下一位顾客尚未打开。','mobile.autoRefresh':'本页面会自动检查批准状态。'})
Object.assign(messages.en,{'mobile.routeDay':'Route day','mobile.todayChoice':'Today','mobile.tomorrow':'Tomorrow’s Route','mobile.tomorrowChoice':'Tomorrow','mobile.tomorrowPreview':'Preview only — route actions are available only on today’s route.','mobile.tomorrowNotApproved':'Tomorrow’s route has not been approved and published yet.','mobile.tomorrowNoVehicle':'No approved route has been assigned to your vehicle for tomorrow.'})
Object.assign(messages.ms,{'mobile.routeDay':'Hari laluan','mobile.todayChoice':'Hari Ini','mobile.tomorrow':'Laluan Esok','mobile.tomorrowChoice':'Esok','mobile.tomorrowPreview':'Pratonton sahaja — tindakan laluan hanya tersedia untuk laluan hari ini.','mobile.tomorrowNotApproved':'Laluan esok belum diluluskan dan diterbitkan.','mobile.tomorrowNoVehicle':'Tiada laluan diluluskan yang diberikan kepada kenderaan anda untuk esok.'})
Object.assign(messages.zh,{'mobile.routeDay':'路线日期','mobile.todayChoice':'今天','mobile.tomorrow':'明日路线','mobile.tomorrowChoice':'明天','mobile.tomorrowPreview':'仅供预览——所有路线操作只可在今日路线执行。','mobile.tomorrowNotApproved':'明日路线尚未正式批准及发布。','mobile.tomorrowNoVehicle':'明日尚无已批准并分配给您所属车辆的路线。'})
Object.assign(messages.en,{'deferApproval.title':'Return-later requests awaiting supervisor approval','deferApproval.approve':'Approve and open next customer','deferApproval.reject':'Reject','deferApproval.approveReason':'Approval reason:','deferApproval.rejectReason':'Rejection reason:','deferApproval.approvedMessage':'Approved the return to {branch}. The next customer is now open.','deferApproval.rejectedMessage':'Rejected the return-later request for {branch}.'})
Object.assign(messages.ms,{'deferApproval.title':'Permintaan datang semula menunggu kelulusan penyelia','deferApproval.approve':'Lulus dan buka pelanggan seterusnya','deferApproval.reject':'Tolak','deferApproval.approveReason':'Sebab kelulusan:','deferApproval.rejectReason':'Sebab penolakan:','deferApproval.approvedMessage':'Permintaan kembali ke {branch} diluluskan. Pelanggan seterusnya kini dibuka.','deferApproval.rejectedMessage':'Permintaan datang semula untuk {branch} ditolak.'})
Object.assign(messages.zh,{'deferApproval.title':'等待主管批准倒回顾客','deferApproval.approve':'批准并打开下一位','deferApproval.reject':'拒绝','deferApproval.approveReason':'批准原因：','deferApproval.rejectReason':'拒绝原因：','deferApproval.approvedMessage':'已批准倒回 {branch}，下一位顾客已经打开。','deferApproval.rejectedMessage':'已拒绝 {branch} 的倒回申请。'})

Object.assign(messages.en,{'nav.actingCollector':'Collector View','acting.title':'Collector View','acting.help':'Inspect today’s vehicle routes. If staff are absent, take over one vehicle for today only.','acting.currentDriver':'Current collector','acting.inspectRoute':'Inspect route','acting.hideRoute':'Hide route','acting.takeOver':'Take over today','acting.approveFirst':'Approve route first','acting.assignedToMe':'Assigned to me','acting.confirm':'Take over {plate} for today? The current collector will be replaced for today only.','acting.noRoutes':'No vehicle routes are available today.','acting.backToManagement':'Back to supervisor view'})
Object.assign(messages.ms,{'nav.actingCollector':'Halaman Pengutip','acting.title':'Halaman Pengutip','acting.help':'Semak laluan kenderaan hari ini. Jika kakitangan tidak hadir, ambil alih satu kenderaan untuk hari ini sahaja.','acting.currentDriver':'Pengutip semasa','acting.inspectRoute':'Semak laluan','acting.hideRoute':'Tutup laluan','acting.takeOver':'Ambil alih hari ini','acting.approveFirst':'Luluskan laluan dahulu','acting.assignedToMe':'Diberikan kepada saya','acting.confirm':'Ambil alih {plate} untuk hari ini? Pengutip semasa akan diganti untuk hari ini sahaja.','acting.noRoutes':'Tiada laluan kenderaan hari ini.','acting.backToManagement':'Kembali ke halaman penyelia'})
Object.assign(messages.zh,{'nav.actingCollector':'收货员页面','acting.title':'收货员页面','acting.help':'检查今天每辆车的路线；人手不足时，主管可只代班当天。','acting.currentDriver':'当前收货员','acting.inspectRoute':'检查路线','acting.hideRoute':'收起路线','acting.takeOver':'由我代班','acting.approveFirst':'请先批准路线','acting.assignedToMe':'已由我代班','acting.confirm':'确定今天由您代班 {plate}？只会更换今天的收货员。','acting.noRoutes':'今天没有可用的车辆路线。','acting.backToManagement':'返回主管页面'})
Object.assign(messages.en,{'dashboard.employeeApprovals':'Employee approvals','dashboard.noEmployeeApprovals':'No employee requests are waiting for approval.'})
Object.assign(messages.ms,{'dashboard.employeeApprovals':'Kelulusan pekerja','dashboard.noEmployeeApprovals':'Tiada permintaan pekerja menunggu kelulusan.'})
Object.assign(messages.zh,{'dashboard.employeeApprovals':'员工等待批准','dashboard.noEmployeeApprovals':'目前没有员工申请等待批准。'})

export function translate(language,key,variables={}){
  const selected=messages[language]||messages.en
  let value=selected[key]
  if(value==null){
    value=messages.en[key]??key
    if(import.meta.env?.DEV) console.warn(`[i18n] Missing ${language} translation: ${key}`)
  }
  return String(value).replace(/\{(\w+)\}/g,(_,name)=>variables[name]??`{${name}}`)
}
Object.assign(messages.en,{'dashboard.enableSound':'Enable alert sound','dashboard.soundOn':'Alert sound on','dashboard.soundUnsupported':'This phone does not support browser alert sounds.','dashboard.soundBlocked':'The browser blocked the sound. Tap Enable alert sound again.'})
Object.assign(messages.ms,{'dashboard.enableSound':'Aktifkan bunyi amaran','dashboard.soundOn':'Bunyi amaran aktif','dashboard.soundUnsupported':'Telefon ini tidak menyokong bunyi amaran pelayar.','dashboard.soundBlocked':'Pelayar menyekat bunyi. Tekan Aktifkan bunyi amaran sekali lagi.'})
Object.assign(messages.zh,{'dashboard.enableSound':'开启通知铃声','dashboard.soundOn':'通知铃声已开启','dashboard.soundUnsupported':'这部手机不支持网页通知铃声。','dashboard.soundBlocked':'浏览器阻止了铃声，请再按一次开启通知铃声。'})

// Operational UI catalog: source, English, Bahasa Melayu, Chinese.
export const operationalUiMessages = [
  [
    "On Leave",
    "On leave",
    "Bercuti",
    "休假"
  ],
  [
    "approval withdrawn",
    "Approval withdrawn",
    "Kelulusan ditarik balik",
    "已撤回批准"
  ],
  [
    "Start Location updated.",
    "Start location updated.",
    "Lokasi mula dikemas kini.",
    "出发地点已更新。"
  ],
  [
    "{0} 的 {1} 家客户已分配到 Route {2}。",
    "Assigned {1} customers from {0} to route {2}.",
    "{1} pelanggan dari {0} ditetapkan ke laluan {2}.",
    "{0} 的 {1} 家客户已分配到路线 {2}。"
  ],
  [
    "Route {0} 已{1}；客户与顺序没有改变。",
    "Route {0}: {1}. Customers and stop order are unchanged.",
    "Laluan {0}: {1}. Pelanggan dan urutan hentian kekal.",
    "路线 {0} 已{1}；客户与顺序没有改变。"
  ],
  [
    "整条分配到所选车辆",
    "Assigned in full to the selected vehicle",
    "Seluruh laluan ditetapkan kepada kenderaan dipilih",
    "整条分配到所选车辆"
  ],
  [
    "解除当天车辆分配",
    "Vehicle assignment removed for this date",
    "Penetapan kenderaan untuk tarikh ini dibatalkan",
    "解除当天车辆分配"
  ],
  [
    "请输入新的 Route 名称：",
    "Enter the new route name:",
    "Masukkan nama laluan baharu:",
    "请输入新的路线名称："
  ],
  [
    "Route {0} 已改名为 {1}。",
    "Route {0} renamed to {1}.",
    "Laluan {0} dinamakan semula kepada {1}.",
    "路线 {0} 已改名为 {1}。"
  ],
  [
    "客户顺序已保存；以后同一星期会跟随这个排列。",
    "Customer order saved for this weekday in future weeks.",
    "Urutan pelanggan disimpan untuk hari yang sama pada minggu berikutnya.",
    "客户顺序已保存；以后同一星期会跟随这个排列。"
  ],
  [
    "Route {0} 已单独批准。",
    "Route {0} approved individually.",
    "Laluan {0} diluluskan secara berasingan.",
    "路线 {0} 已单独批准。"
  ],
  [
    "请输入撤回批准的原因：",
    "Enter the reason for withdrawing approval:",
    "Masukkan sebab penarikan balik kelulusan:",
    "请输入撤回批准的原因："
  ],
  [
    "需要修改路线",
    "Route changes needed",
    "Perubahan laluan diperlukan",
    "需要修改路线"
  ],
  [
    "Enter target vehicle number or plate: {0}",
    "Enter target vehicle number or plate: {0}",
    "Masukkan nombor kenderaan atau plat sasaran: {0}",
    "输入目标车辆编号或车牌：{0}"
  ],
  [
    "No available target vehicle",
    "No available target vehicle",
    "Tiada kenderaan sasaran tersedia",
    "没有可用的目标车辆"
  ],
  [
    "After route transfer, Set the original vehicle to Maintenance？",
    "After transferring the route, mark the original vehicle as under maintenance?",
    "Selepas pemindahan laluan, tandakan kenderaan asal sebagai dalam penyelenggaraan?",
    "转移路线后，将原车辆设为维修中？"
  ],
  [
    "Enter the transfer reason:",
    "Enter the transfer reason:",
    "Masukkan sebab pemindahan:",
    "输入转移原因："
  ],
  [
    "Vehicle breakdown／Replace vehicle",
    "Vehicle breakdown / replacement",
    "Kerosakan / penggantian kenderaan",
    "车辆故障／更换车辆"
  ],
  [
    "Vehicle transfer",
    "Vehicle transfer",
    "Pemindahan kenderaan",
    "车辆转移"
  ],
  [
    "Trip, Customer routes and driver transferred to {0}.",
    "Trips, customer routes and driver transferred to {0}.",
    "Perjalanan, laluan pelanggan dan pemandu dipindahkan ke {0}.",
    "趟次、客户路线及司机已转移到 {0}。"
  ],
  [
    "Temporary vehicle number:",
    "Temporary vehicle number:",
    "Nombor kenderaan sementara:",
    "临时车辆编号："
  ],
  [
    "{0} added for {1}.",
    "{0} added for {1}.",
    "{0} ditambah untuk {1}.",
    "已为 {1} 加入 {0}。"
  ],
  [
    "Permanent vehicle number:",
    "Permanent vehicle number:",
    "Nombor kenderaan tetap:",
    "长期车辆编号："
  ],
  [
    "Registration plate (must be unique):",
    "Registration plate (must be unique):",
    "Nombor plat (mesti unik):",
    "车牌号码（不可重复）："
  ],
  [
    "Capacity (kg, optional):",
    "Capacity (kg, optional):",
    "Kapasiti (kg, pilihan):",
    "载重量（kg，选填）："
  ],
  [
    "Capacity must be a non-negative number.",
    "Capacity must be zero or greater.",
    "Kapasiti mesti sifar atau lebih.",
    "载重量必须为零或正数。"
  ],
  [
    "{0} added permanently and selected for {1}.",
    "{0} added permanently and selected for {1}.",
    "{0} ditambah sebagai kenderaan tetap dan dipilih untuk {1}.",
    "已加入长期车辆 {0}，并安排于 {1} 使用。"
  ],
  [
    "{0} moved to another vehicle.",
    "{0} moved to another vehicle.",
    "{0} dipindahkan ke kenderaan lain.",
    "{0} 已移到另一辆车。"
  ],
  [
    "Stop {0}",
    "Stop {0}",
    "Hentian {0}",
    "站点 {0}"
  ],
  [
    "派车",
    "Dispatch",
    "Penugasan kenderaan",
    "派车"
  ],
  [
    "一周派车日期",
    "Weekly dispatch dates",
    "Tarikh penugasan mingguan",
    "一周派车日期"
  ],
  [
    "家",
    "customers",
    "pelanggan",
    "家"
  ],
  [
    "· ✓ 已批准",
    "· ✓ Approved",
    "· ✓ Diluluskan",
    "· ✓ 已批准"
  ],
  [
    "Route 1 至 5",
    "Routes",
    "Laluan",
    "路线"
  ],
  [
    "Route {0}",
    "Route {0}",
    "Laluan {0}",
    "路线 {0}"
  ],
  [
    "查看七天",
    "View seven days",
    "Lihat tujuh hari",
    "查看七天"
  ],
  [
    "客户通知无货 · 无需到店（",
    "Customer reported no goods · No visit needed (",
    "Pelanggan memaklumkan tiada barang · Tidak perlu melawat (",
    "客户通知无货 · 无需到店（"
  ],
  [
    "Withdraw Approval first",
    "Withdraw approval first",
    "Tarik balik kelulusan dahulu",
    "请先撤回批准"
  ],
  [
    "Add permanent vehicle",
    "Add permanent vehicle",
    "Tambah kenderaan tetap",
    "加入长期车辆"
  ],
  [
    "＋ 长期车",
    "＋ Permanent vehicle",
    "＋ Kenderaan tetap",
    "＋ 长期车"
  ],
  [
    "Add temporary vehicle for this date",
    "Add a temporary vehicle for this date",
    "Tambah kenderaan sementara untuk tarikh ini",
    "加入当天临时车辆"
  ],
  [
    "＋ 临时车",
    "＋ Temporary vehicle",
    "＋ Kenderaan sementara",
    "＋ 临时车"
  ],
  [
    "Customer promise ·",
    "Promised to customer ·",
    "Dijanjikan kepada pelanggan ·",
    "已向客户承诺 ·"
  ],
  [
    "Potential new customer · Trip",
    "Potential new customer · Trip",
    "Bakal pelanggan baharu · Perjalanan",
    "潜在新客户 · 趟次"
  ],
  [
    "当天 Route 总览",
    "Daily route overview",
    "Gambaran laluan harian",
    "当天路线总览"
  ],
  [
    "No vehicles available for this date.",
    "No vehicles available for this date.",
    "Tiada kenderaan tersedia untuk tarikh ini.",
    "当天没有可用车辆。"
  ],
  [
    "Vehicles available for this date",
    "Vehicles available for this date",
    "Kenderaan tersedia untuk tarikh ini",
    "当天可用车辆"
  ],
  [
    "调整当天车辆／司机",
    "Change today's vehicle / driver",
    "Tukar kenderaan / pemandu hari ini",
    "调整当天车辆／司机"
  ],
  [
    "当天交接",
    "Today's handover",
    "Serahan tugas hari ini",
    "当天交接"
  ],
  [
    "只影响当天。旧单据归属不变，明天安排不变。",
    "Applies only today. Existing bills and tomorrow's assignments remain unchanged.",
    "Hanya untuk hari ini. Bil sedia ada dan penugasan esok kekal.",
    "只影响当天。旧单据归属不变，明天安排不变。"
  ],
  [
    "接手司机",
    "Replacement driver",
    "Pemandu pengganti",
    "接手司机"
  ],
  [
    "选择司机",
    "Select driver",
    "Pilih pemandu",
    "选择司机"
  ],
  [
    "调整原因",
    "Reason for change",
    "Sebab perubahan",
    "调整原因"
  ],
  [
    "确认当天调整",
    "Confirm today's change",
    "Sahkan perubahan hari ini",
    "确认当天调整"
  ],
  [
    "星期日两组合并收货，每周轮班。换车、换人只影响这个星期日。",
    "Sunday collections use two combined groups with weekly rotation. Vehicle and staff changes apply only to this Sunday.",
    "Kutipan Ahad menggunakan dua kumpulan gabungan dengan giliran mingguan. Perubahan kenderaan dan kakitangan hanya untuk Ahad ini.",
    "星期日两组合并收货，每周轮班。换车、换人只影响这个星期日。"
  ],
  [
    "撤回当天批准",
    "Withdraw today's approval",
    "Tarik balik kelulusan hari ini",
    "撤回当天批准"
  ],
  [
    "未设车牌",
    "Plate not set",
    "Plat belum ditetapkan",
    "未设车牌"
  ],
  [
    "当天未分配车辆",
    "No vehicle assigned for this date",
    "Tiada kenderaan ditetapkan untuk tarikh ini",
    "当天未分配车辆"
  ],
  [
    "需要重新批准",
    "Reapproval required",
    "Perlu kelulusan semula",
    "需要重新批准"
  ],
  [
    "当天没有客户",
    "No customers for this date",
    "Tiada pelanggan untuk tarikh ini",
    "当天没有客户"
  ],
  [
    "尚未批准",
    "Not yet approved",
    "Belum diluluskan",
    "尚未批准"
  ],
  [
    "批准这条 Route",
    "Approve this route",
    "Luluskan laluan ini",
    "批准这条路线"
  ],
  [
    "当天执行车辆",
    "Vehicle for this date",
    "Kenderaan untuk tarikh ini",
    "当天执行车辆"
  ],
  [
    "· 已给 Route {0}",
    "· Assigned to route {0}",
    "· Ditetapkan ke laluan {0}",
    "· 已给路线 {0}"
  ],
  [
    "Route 以外的临时客户",
    "Temporary customers outside planned routes",
    "Pelanggan sementara di luar laluan terancang",
    "路线以外的临时客户"
  ],
  [
    "· Zone只用于查看地理位置",
    "· Zone indicates geographic location only",
    "· Zon menunjukkan lokasi geografi sahaja",
    "· 分区只用于查看地理位置"
  ],
  [
    "没有 Route 以外的临时客户。",
    "No temporary customers outside planned routes.",
    "Tiada pelanggan sementara di luar laluan terancang.",
    "没有路线以外的临时客户。"
  ],
  [
    "地理 Zone ·",
    "Geographic zone ·",
    "Zon geografi ·",
    "地理分区 ·"
  ],
  [
    "地理 Area",
    "Geographic area",
    "Kawasan geografi",
    "地理区域"
  ],
  [
    "未分配 Route ▾",
    "Unassigned route ▾",
    "Laluan belum ditetapkan ▾",
    "未分配路线 ▾"
  ],
  [
    "司机：",
    "Driver:",
    "Pemandu:",
    "司机："
  ],
  [
    "· Attendant：",
    "· Crew:",
    "· Pembantu:",
    "· 跟车员："
  ],
  [
    "收货设置",
    "Collection settings",
    "Tetapan kutipan",
    "收货设置"
  ],
  [
    "Capacity not set",
    "Capacity not set",
    "Kapasiti belum ditetapkan",
    "未设载重量"
  ],
  [
    "· Base",
    "· Base",
    "· Pangkalan",
    "· 基地"
  ],
  [
    "Stops ·",
    "Stops ·",
    "Hentian ·",
    "站点 ·"
  ],
  [
    "{0} kg estimated",
    "{0} kg estimated",
    "Anggaran {0} kg",
    "预计 {0} kg"
  ],
  [
    "weight not set",
    "Weight not set",
    "Berat belum ditetapkan",
    "未设重量"
  ],
  [
    "· {0} missing weight",
    "· {0} missing weights",
    "· {0} berat belum diisi",
    "· {0} 项缺少重量"
  ],
  [
    "· Over capacity",
    "· Over capacity",
    "· Melebihi kapasiti",
    "· 超过载重量"
  ],
  [
    "· recommendation match {0}",
    "· Recommendation match {0}",
    "· Padanan cadangan {0}",
    "· 建议匹配 {0}"
  ],
  [
    "Change Reason is required",
    "A reason for change is required.",
    "Sebab perubahan diperlukan.",
    "请填写修改原因。"
  ],
  [
    "Buyer / Payer",
    "Buyer / Payer",
    "Pembeli / Pembayar",
    "买家／付款方"
  ],
  [
    "Trip {0} Buyer / Payer",
    "Trip {0} buyer / payer",
    "Pembeli / pembayar perjalanan {0}",
    "第 {0} 趟买家／付款方"
  ],
  [
    "Not selected",
    "Not selected",
    "Belum dipilih",
    "未选择"
  ],
  [
    "Primary End Location",
    "Primary end location",
    "Lokasi akhir utama",
    "主要结束地点"
  ],
  [
    "Trip {0} Primary End Location",
    "Trip {0} primary end location",
    "Lokasi akhir utama perjalanan {0}",
    "第 {0} 趟主要结束地点"
  ],
  [
    "Recommended ·",
    "Recommended ·",
    "Disyorkan ·",
    "建议 ·"
  ],
  [
    "· GPS Set",
    "· GPS set",
    "· GPS ditetapkan",
    "· 已设定位"
  ],
  [
    "Save Buyer & End Location",
    "Save buyer and end location",
    "Simpan pembeli dan lokasi akhir",
    "保存买家及结束地点"
  ],
  [
    "· GPS source: {0}",
    "· GPS source: {0}",
    "· Sumber GPS: {0}",
    "· 定位来源：{0}"
  ],
  [
    "Factory not set",
    "Factory not set",
    "Kilang belum ditetapkan",
    "未设工厂"
  ],
  [
    "Start Location · Trip",
    "Start location · Trip",
    "Lokasi mula · Perjalanan",
    "出发地点 · 趟次"
  ],
  [
    "Employee Home",
    "Employee home",
    "Rumah pekerja",
    "员工住处"
  ],
  [
    "Saved Location",
    "Saved location",
    "Lokasi disimpan",
    "已存地点"
  ],
  [
    "Custom Location",
    "Custom location",
    "Lokasi tersuai",
    "自定地点"
  ],
  [
    "Factory — {0} · GPS Set",
    "Factory — {0} · GPS set",
    "Kilang — {0} · GPS ditetapkan",
    "工厂 — {0} · 已设定位"
  ],
  [
    "Company Yard GPS is not set",
    "Company yard GPS is not set",
    "GPS kawasan syarikat belum ditetapkan",
    "公司场地尚未设定位"
  ],
  [
    "{0} · Home GPS Set",
    "{0} · Home GPS set",
    "{0} · GPS rumah ditetapkan",
    "{0} · 住处已设定位"
  ],
  [
    "Select a Driver",
    "Select a driver",
    "Pilih pemandu",
    "选择司机"
  ],
  [
    "Select a GPS-enabled location",
    "Select a location with GPS",
    "Pilih lokasi dengan GPS",
    "选择已有定位的地点"
  ],
  [
    "Save Start Location",
    "Save start location",
    "Simpan lokasi mula",
    "保存出发地点"
  ],
  [
    "Unassigned driver",
    "Unassigned driver",
    "Pemandu belum ditetapkan",
    "未分配司机"
  ],
  [
    "Search driver name or employee number",
    "Search driver name or employee number",
    "Cari nama pemandu atau nombor pekerja",
    "搜索司机姓名或员工编号"
  ],
  [
    "Release current driver assignment",
    "Remove current driver assignment",
    "Batalkan penugasan pemandu semasa",
    "解除当前司机安排"
  ],
  [
    "· Area",
    "· Area",
    "· Kawasan",
    "· 区域"
  ],
  [
    "Assigned today: {0}",
    "Assigned today: {0}",
    "Penugasan hari ini: {0}",
    "当天安排：{0}"
  ],
  [
    "Not assigned to another vehicle today",
    "Not assigned to another vehicle today",
    "Belum ditetapkan ke kenderaan lain hari ini",
    "当天未安排到其他车辆"
  ],
  [
    "· Unavailable",
    "· Unavailable",
    "· Tidak tersedia",
    "· 不可用"
  ],
  [
    "Employee Master No Driver",
    "No drivers in employee records",
    "Tiada pemandu dalam rekod pekerja",
    "员工资料中没有司机"
  ],
  [
    "attendant / crew",
    "Crew",
    "Pembantu",
    "跟车员"
  ],
  [
    "Attendant / Crew",
    "Crew",
    "Pembantu",
    "跟车员"
  ],
  [
    "Unassigned crew",
    "Unassigned crew",
    "Pembantu belum ditetapkan",
    "未分配跟车员"
  ],
  [
    "Search crew name or employee number",
    "Search crew name or employee number",
    "Cari nama pembantu atau nombor pekerja",
    "搜索跟车员姓名或员工编号"
  ],
  [
    "· Maximum 2 crew selected",
    "· Maximum two crew members",
    "· Maksimum dua pembantu",
    "· 最多选择两位跟车员"
  ],
  [
    "Employee Master No Assistant/Crew",
    "No crew in employee records",
    "Tiada pembantu dalam rekod pekerja",
    "员工资料中没有跟车员"
  ],
  [
    "Weight not set",
    "Weight not set",
    "Berat belum ditetapkan",
    "未设重量"
  ],
  [
    "GPS✓",
    "GPS ✓",
    "GPS ✓",
    "定位 ✓"
  ],
  [
    "Time restriction:",
    "Time restriction:",
    "Had masa:",
    "时间限制："
  ],
  [
    "Move {0} to another vehicle",
    "Move {0} to another vehicle",
    "Pindahkan {0} ke kenderaan lain",
    "将 {0} 移到其他车辆"
  ],
  [
    "移到其他车辆",
    "Move to another vehicle",
    "Pindah ke kenderaan lain",
    "移到其他车辆"
  ],
  [
    "No plate",
    "No plate",
    "Tiada plat",
    "未设车牌"
  ],
  [
    "Move this route stop",
    "Move this stop",
    "Pindahkan hentian ini",
    "移动此站点"
  ],
  [
    "Draft restored after the page was reopened.",
    "Draft restored after reopening the page.",
    "Draf dipulihkan selepas halaman dibuka semula.",
    "重新打开页面后已恢复草稿。"
  ],
  [
    "Bill draft discarded.",
    "Bill draft discarded.",
    "Draf bil dibuang.",
    "开单草稿已清除。"
  ],
  [
    "Electronic Bill",
    "Electronic bill",
    "Bil elektronik",
    "电子单"
  ],
  [
    "Select a payment proof photo.",
    "Select a payment proof photo.",
    "Pilih foto bukti bayaran.",
    "请选择付款证明照片。"
  ],
  [
    "Payment proof selected and is uploading…",
    "Uploading selected payment proof…",
    "Memuat naik bukti bayaran dipilih…",
    "正在上传已选付款证明…"
  ],
  [
    "✓ Payment proof saved. You may continue to the next customer.",
    "✓ Payment proof saved. You may continue to the next customer.",
    "✓ Bukti bayaran disimpan. Anda boleh terus ke pelanggan seterusnya.",
    "✓ 付款证明已保存，可以前往下一家。"
  ],
  [
    "The upload is too large for the server. Retake the photo at a lower resolution.",
    "The photo is too large. Retake it at a lower resolution.",
    "Foto terlalu besar. Ambil semula pada resolusi lebih rendah.",
    "照片太大，请以较低分辨率重拍。"
  ],
  [
    "Upload failed. Check the connection and tap Retry upload.",
    "Upload failed. Check your connection and retry.",
    "Muat naik gagal. Semak sambungan dan cuba semula.",
    "上传失败，请检查网络后重试。"
  ],
  [
    "Loading billing…",
    "Loading billing…",
    "Memuatkan bil…",
    "正在载入开单资料…"
  ],
  [
    "✓ Electronic Bill created",
    "✓ Electronic bill created",
    "✓ Bil elektronik dibuat",
    "✓ 电子单已建立"
  ],
  [
    "Print / Reprint",
    "Print / Reprint",
    "Cetak / Cetak semula",
    "打印／重新打印"
  ],
  [
    "✓ Payment proof uploaded",
    "✓ Payment proof uploaded",
    "✓ Bukti bayaran dimuat naik",
    "✓ 付款证明已上传"
  ],
  [
    "Create Electronic Purchase Bill",
    "Create electronic purchase bill",
    "Buat bil pembelian elektronik",
    "建立电子采购单"
  ],
  [
    "Weight / Quantity",
    "Weight / Quantity",
    "Berat / Kuantiti",
    "重量／数量"
  ],
  [
    "＋ Other Item",
    "＋ Other item",
    "＋ Item lain",
    "＋ 其他品项"
  ],
  [
    "Paper option",
    "Paper option",
    "Pilihan kertas",
    "纸张选择"
  ],
  [
    "Create electronic Bill and print",
    "Create electronic bill and print",
    "Buat bil elektronik dan cetak",
    "建立电子单并打印"
  ],
  [
    "Create electronic Bill only — no print",
    "Create electronic bill without printing",
    "Buat bil elektronik tanpa cetakan",
    "只建立电子单，不打印"
  ],
  [
    "Create Electronic Bill",
    "Create electronic bill",
    "Buat bil elektronik",
    "建立电子单"
  ],
  [
    "Discard bill draft",
    "Discard bill draft",
    "Buang draf bil",
    "清除开单草稿"
  ],
  [
    "Receipt photo is required.",
    "Receipt photo is required.",
    "Foto resit diperlukan.",
    "请上传收据照片。"
  ],
  [
    "✓ Expense and receipt photo saved.",
    "✓ Expense and receipt photo saved.",
    "✓ Perbelanjaan dan foto resit disimpan.",
    "✓ 支出及收据照片已保存。"
  ],
  [
    "The receipt upload is too large. Retake the photo.",
    "The receipt photo is too large. Retake it.",
    "Foto resit terlalu besar. Ambil semula.",
    "收据照片太大，请重拍。"
  ],
  [
    "Cash Float",
    "Cash float",
    "Wang runcit",
    "备用金"
  ],
  [
    "Current Balance",
    "Current balance",
    "Baki semasa",
    "当前余额"
  ],
  [
    "Today Top Up",
    "Today's top-ups",
    "Tambahan hari ini",
    "今日补款"
  ],
  [
    "Low balance. Supervisor has been notified.",
    "Low balance. Supervisor has been notified.",
    "Baki rendah. Penyelia telah dimaklumkan.",
    "余额不足，已通知主管。"
  ],
  [
    "Record Expense",
    "Record expense",
    "Rekod perbelanjaan",
    "记录支出"
  ],
  [
    "Amount (RM)",
    "Amount (RM)",
    "Amaun (RM)",
    "金额（RM）"
  ],
  [
    "Select description",
    "Select description",
    "Pilih keterangan",
    "选择支出项目"
  ],
  [
    "Other description",
    "Other description",
    "Keterangan lain",
    "其他说明"
  ],
  [
    "Receipt photo (required)",
    "Receipt photo (required)",
    "Foto resit (wajib)",
    "收据照片（必填）"
  ],
  [
    "Selected receipt preview",
    "Selected receipt preview",
    "Pratonton resit dipilih",
    "已选收据预览"
  ],
  [
    "Save Expense and Receipt",
    "Save expense and receipt",
    "Simpan perbelanjaan dan resit",
    "保存支出及收据"
  ],
  [
    "Trip started.",
    "Trip started.",
    "Perjalanan bermula.",
    "趟次已开始。"
  ],
  [
    "Arrival recorded.",
    "Arrival recorded.",
    "Ketibaan direkodkan.",
    "已记录到店。"
  ],
  [
    "Stop completed. Next Stop is now available.",
    "Stop completed. Next stop is now available.",
    "Hentian selesai. Hentian seterusnya kini tersedia.",
    "站点已完成，可以前往下一家。"
  ],
  [
    "Trip completed.",
    "Trip completed.",
    "Perjalanan selesai.",
    "趟次已完成。"
  ],
  [
    "No Goods reason is required.",
    "Enter the reason for no goods.",
    "Masukkan sebab tiada barang.",
    "请填写无货原因。"
  ],
  [
    "A No Goods photo is required.",
    "A photo showing no goods is required.",
    "Foto bukti tiada barang diperlukan.",
    "请上传无货证明照片。"
  ],
  [
    "No Goods proof saved. Next Stop is now available.",
    "No-goods proof saved. Next stop is now available.",
    "Bukti tiada barang disimpan. Hentian seterusnya kini tersedia.",
    "无货证明已保存，可以前往下一家。"
  ],
  [
    "REMOTE ARRIVAL TEST MODE",
    "Remote arrival test mode",
    "Mod ujian ketibaan jarak jauh",
    "远程到店测试模式"
  ],
  [
    "Complete Trip",
    "Complete trip",
    "Selesaikan perjalanan",
    "完成趟次"
  ],
  [
    "COME BACK LATER ▼",
    "Come back later ▼",
    "Datang semula ▼",
    "稍后再来 ▼"
  ],
  [
    "OPEN ▼",
    "Open ▼",
    "Buka ▼",
    "打开 ▼"
  ],
  [
    "COME BACK LATER ▲",
    "Come back later ▲",
    "Datang semula ▲",
    "稍后再来 ▲"
  ],
  [
    "Open in Google Maps",
    "Open in Google Maps",
    "Buka dalam Google Maps",
    "在 Google Maps 打开"
  ],
  [
    "· Open Map",
    "· Open map",
    "· Buka peta",
    "· 打开地图"
  ],
  [
    "Complete and continue to next customer",
    "Complete and continue to next customer",
    "Selesai dan terus ke pelanggan seterusnya",
    "完成并前往下一家"
  ],
  [
    "No Goods reason",
    "No-goods reason",
    "Sebab tiada barang",
    "无货原因"
  ],
  [
    "No Goods photo",
    "No-goods photo",
    "Foto tiada barang",
    "无货照片"
  ],
  [
    "Uploading…",
    "Uploading…",
    "Memuat naik…",
    "上传中…"
  ],
  [
    "No Goods",
    "No goods",
    "Tiada barang",
    "无货"
  ],
  [
    "Missing official GPS",
    "Missing official GPS",
    "GPS rasmi tiada",
    "缺少正式定位"
  ],
  [
    "Move {0} Merge into which Zone？ {1}",
    "Merge {0} into which zone? {1}",
    "Gabungkan {0} ke zon mana? {1}",
    "将 {0} 合并到哪个分区？{1}"
  ],
  [
    "Confirm moving all Area and deactivate {0}？Moved Area remain pending confirmation, history snapshots remain unchanged.",
    "Move all areas and deactivate {0}? Moved areas await confirmation; historical records remain unchanged.",
    "Pindahkan semua kawasan dan nyahaktifkan {0}? Kawasan dipindahkan menunggu pengesahan; rekod sejarah kekal.",
    "移动全部区域并停用 {0}？移动后的区域保持待确认，历史记录不变。"
  ],
  [
    "First select the Zone, items to split Area.",
    "Select the areas to split from this zone first.",
    "Pilih kawasan untuk dipisahkan daripada zon ini dahulu.",
    "请先勾选要从此分区拆出的区域。"
  ],
  [
    "New Zone Group Name",
    "New zone name",
    "Nama zon baharu",
    "新分区名称"
  ],
  [
    "Select at least one Area.",
    "Select at least one area.",
    "Pilih sekurang-kurangnya satu kawasan.",
    "请至少选择一个区域。"
  ],
  [
    "Select a target Zone Group.",
    "Select a target zone.",
    "Pilih zon sasaran.",
    "请选择目标分区。"
  ],
  [
    "The target Zone Group must be different from every selected Area current Zone Group.",
    "The target zone must differ from the current zone of every selected area.",
    "Zon sasaran mesti berbeza daripada zon semasa setiap kawasan dipilih.",
    "目标分区必须与所有已选区域的当前分区不同。"
  ],
  [
    "Moved {0} Area; assignment adjusted, awaiting Supervisor confirmation.",
    "Moved {0} areas; awaiting supervisor confirmation.",
    "{0} kawasan dipindahkan; menunggu pengesahan penyelia.",
    "已移动 {0} 个区域，等待主管确认归属。"
  ],
  [
    "Successfully moved {0} Area{1}; assignment adjusted, awaiting Supervisor confirmation.",
    "Successfully moved {0} areas; awaiting supervisor confirmation.",
    "Berjaya memindahkan {0} kawasan; menunggu pengesahan penyelia.",
    "已成功移动 {0} 个区域，等待主管确认归属。"
  ],
  [
    "The Areas could not be moved. No Areas were changed.",
    "Areas could not be moved. No changes were made.",
    "Kawasan tidak dapat dipindahkan. Tiada perubahan dibuat.",
    "区域移动失败，资料没有改变。"
  ],
  [
    "{0} Area assignment{1} {2}.",
    "{0} area assignments: {2}.",
    "Penetapan {0} kawasan: {2}.",
    "{0} 个区域归属：{2}。"
  ],
  [
    "returned to pending confirmation",
    "Returned to pending confirmation",
    "Dikembalikan untuk pengesahan",
    "已退回待确认"
  ],
  [
    "The Area confirmation could not be changed. No Areas were changed.",
    "Area confirmation could not be changed. No changes were made.",
    "Pengesahan kawasan tidak dapat diubah. Tiada perubahan dibuat.",
    "区域确认状态修改失败，资料没有改变。"
  ],
  [
    "＋ Add Zone Group",
    "＋ Add zone",
    "＋ Tambah zon",
    "＋ 新增分区"
  ],
  [
    "Zone 只记录地理范围；新派车不会使用这里保存的旧默认车辆。",
    "Zones describe geographic coverage only. New dispatches do not use the old default vehicles saved here.",
    "Zon hanya menerangkan liputan geografi. Penugasan baharu tidak menggunakan kenderaan lalai lama yang disimpan di sini.",
    "分区只记录地理范围；新派车不会使用这里保存的旧默认车辆。"
  ],
  [
    "Zone Group Name",
    "Zone name",
    "Nama zon",
    "分区名称"
  ],
  [
    "Code (optional)",
    "Code (optional)",
    "Kod (pilihan)",
    "代码（选填）"
  ],
  [
    "Display Order (optional)",
    "Display order (optional)",
    "Urutan paparan (pilihan)",
    "显示顺序（选填）"
  ],
  [
    "Placed last when empty",
    "Placed last when empty",
    "Diletakkan terakhir jika kosong",
    "留空则排在最后"
  ],
  [
    "Moving Areas…",
    "Moving areas…",
    "Memindahkan kawasan…",
    "正在移动区域…"
  ],
  [
    "Select {0}",
    "Select {0}",
    "Pilih {0}",
    "选择 {0}"
  ],
  [
    "None AreaID",
    "No area ID",
    "Tiada ID kawasan",
    "无区域编号"
  ],
  [
    "customers /",
    "customers /",
    "pelanggan /",
    "客户／"
  ],
  [
    "branches · GPS",
    "branches · GPS",
    "cawangan · GPS",
    "分店 · 定位"
  ],
  [
    "Area assignment confirmed.",
    "Area assignment confirmed.",
    "Penetapan kawasan disahkan.",
    "区域归属已确认。"
  ],
  [
    "The Area assignment could not be confirmed.",
    "Area assignment could not be confirmed.",
    "Penetapan kawasan tidak dapat disahkan.",
    "无法确认区域归属。"
  ],
  [
    "Confirm moving {0} Area？ Source Zone: {1} Target Zone: {2} After moving this is shown as “Assignment adjusted／Pending confirmation”.",
    "Move {0} areas from {1} to {2}? They will await confirmation.",
    "Pindahkan {0} kawasan dari {1} ke {2}? Kawasan akan menunggu pengesahan.",
    "确认将 {0} 个区域从 {1} 移到 {2}？移动后将显示为待确认归属。"
  ],
  [
    "Successfully moved {0} Area to {1}; Assignment adjusted, awaiting reconfirmation.",
    "Moved {0} areas to {1}; awaiting reconfirmation.",
    "{0} kawasan dipindahkan ke {1}; menunggu pengesahan semula.",
    "已将 {0} 个区域移到 {1}，等待重新确认归属。"
  ],
  [
    "ZONE STATISTIC DETAIL",
    "Zone statistics",
    "Statistik zon",
    "分区统计明细"
  ],
  [
    "items · currently shown",
    "items · currently shown",
    "item · sedang dipaparkan",
    "项 · 当前显示"
  ],
  [
    "Search details",
    "Search details",
    "Cari butiran",
    "搜索明细"
  ],
  [
    "By Area filter",
    "Filter by area",
    "Tapis mengikut kawasan",
    "按区域筛选"
  ],
  [
    "All Area",
    "All areas",
    "Semua kawasan",
    "全部区域"
  ],
  [
    "Detail sort",
    "Sort details",
    "Susun butiran",
    "明细排序"
  ],
  [
    "Area / Branch Name",
    "Area / Branch name",
    "Kawasan / Nama cawangan",
    "区域／分店名称"
  ],
  [
    "Customer Branch descending",
    "Branch count: high to low",
    "Bilangan cawangan: tinggi ke rendah",
    "分店数量：多到少"
  ],
  [
    "Official GPS descending",
    "Official GPS count: high to low",
    "Bilangan GPS rasmi: tinggi ke rendah",
    "正式定位数量：多到少"
  ],
  [
    "official GPS descending",
    "Official GPS count: high to low",
    "Bilangan GPS rasmi: tinggi ke rendah",
    "正式定位数量：多到少"
  ],
  [
    "By Area summary",
    "Summary by area",
    "Ringkasan mengikut kawasan",
    "按区域汇总"
  ],
  [
    "By Customer Branch",
    "By customer branch",
    "Mengikut cawangan pelanggan",
    "按客户分店"
  ],
  [
    "Select all current filtered results",
    "Select all filtered results",
    "Pilih semua hasil ditapis",
    "勾选当前全部筛选结果"
  ],
  [
    "Target Zone",
    "Target zone",
    "Zon sasaran",
    "目标分区"
  ],
  [
    "Move reason",
    "Reason for moving",
    "Sebab pemindahan",
    "移动原因"
  ],
  [
    "Area Name / ID",
    "Area name / ID",
    "Nama / ID kawasan",
    "区域名称／编号"
  ],
  [
    "Current official Zone",
    "Current confirmed zone",
    "Zon disahkan semasa",
    "当前正式分区"
  ],
  [
    "Confirmation status",
    "Confirmation status",
    "Status pengesahan",
    "确认状态"
  ],
  [
    "None Area ID",
    "No area ID",
    "Tiada ID kawasan",
    "无区域编号"
  ],
  [
    "Assignment adjusted／Pending confirmation",
    "Assignment changed / Pending confirmation",
    "Penetapan diubah / Menunggu pengesahan",
    "归属已调整／待确认"
  ],
  [
    "Confirm this Area current Zone assignment？",
    "Confirm this area's current zone assignment?",
    "Sahkan penetapan zon semasa kawasan ini?",
    "确认此区域的当前分区归属？"
  ],
  [
    "Current suggestion Zone",
    "Currently suggested zone",
    "Zon dicadangkan semasa",
    "当前建议分区"
  ],
  [
    "Customer ID / Branch ID",
    "Customer ID / Branch ID",
    "ID pelanggan / ID cawangan",
    "客户编号／分店编号"
  ],
  [
    "Not stated",
    "Not stated",
    "Tidak dinyatakan",
    "未注明"
  ],
  [
    "Not specified",
    "Not specified",
    "Tidak dinyatakan",
    "未指定"
  ],
  [
    "Available official GPS",
    "Official GPS available",
    "GPS rasmi tersedia",
    "已有正式定位"
  ],
  [
    "Has official schedule",
    "Official schedule available",
    "Jadual rasmi tersedia",
    "已有正式排程"
  ],
  [
    "No official schedule",
    "No official schedule",
    "Tiada jadual rasmi",
    "没有正式排程"
  ],
  [
    "AREA CONFIRMATION DETAIL",
    "Area confirmation details",
    "Butiran pengesahan kawasan",
    "区域确认明细"
  ],
  [
    "Area Loading data…",
    "Loading area data…",
    "Memuatkan data kawasan…",
    "正在载入区域资料…"
  ],
  [
    "Assignment status",
    "Assignment status",
    "Status penetapan",
    "归属状态"
  ],
  [
    "Historical dispatch count",
    "Historical dispatch count",
    "Bilangan penugasan terdahulu",
    "历史派车次数"
  ],
  [
    "Historical collection weight",
    "Historical collection weight",
    "Berat kutipan terdahulu",
    "历史收货重量"
  ],
  [
    "Frequency not stated",
    "Frequency not stated",
    "Kekerapan tidak dinyatakan",
    "未注明频率"
  ],
  [
    "Weekday not specified",
    "Weekday not specified",
    "Hari tidak dinyatakan",
    "未指定收货星期"
  ],
  [
    "· about",
    "· About",
    "· Kira-kira",
    "· 约"
  ],
  [
    "Parking Note",
    "Parking note",
    "Catatan parkir",
    "停车备注"
  ],
  [
    "Truck Access",
    "Truck access",
    "Akses lori",
    "罗里通行条件"
  ],
  [
    "Once a week",
    "Once a week",
    "Sekali seminggu",
    "每周一次"
  ],
  [
    "Twice a week",
    "Twice a week",
    "Dua kali seminggu",
    "每周两次"
  ],
  [
    "3 times a week",
    "3 times a week",
    "Tiga kali seminggu",
    "每周三次"
  ],
  [
    "4 times a week",
    "4 times a week",
    "Empat kali seminggu",
    "每周四次"
  ],
  [
    "5 times a week",
    "5 times a week",
    "Lima kali seminggu",
    "每周五次"
  ],
  [
    "6 times a week",
    "6 times a week",
    "Enam kali seminggu",
    "每周六次"
  ],
  [
    "Every 2 Weeks",
    "Every 2 weeks",
    "Setiap dua minggu",
    "每两周一次"
  ],
  [
    "Every 3 Weeks",
    "Every 3 weeks",
    "Setiap tiga minggu",
    "每三周一次"
  ],
  [
    "On Call",
    "On call",
    "Atas permintaan",
    "来电安排"
  ],
  [
    "当前频率需要选择 {0} 个收货星期。",
    "Select {0} collection weekdays for this frequency.",
    "Pilih {0} hari kutipan untuk kekerapan ini.",
    "当前频率需要选择 {0} 个收货星期。"
  ],
  [
    "请选择客户所属 ROUTE。",
    "Select the customer's home route.",
    "Pilih laluan tetap pelanggan.",
    "请选择客户所属路线。"
  ],
  [
    "Area / Zone",
    "Area / Zone",
    "Kawasan / Zon",
    "区域／分区"
  ],
  [
    "所属 ROUTE",
    "Home route",
    "Laluan tetap",
    "所属路线"
  ],
  [
    "请选择所属 ROUTE",
    "Select home route",
    "Pilih laluan tetap",
    "请选择所属路线"
  ],
  [
    "星期日执行路线",
    "Sunday collection route",
    "Laluan kutipan Ahad",
    "星期日执行路线"
  ],
  [
    "跟随固定所属路线",
    "Follow home route",
    "Ikut laluan tetap",
    "跟随固定所属路线"
  ],
  [
    "只改变星期日由哪组收货；客户仍按原收货频率到期安排。",
    "Only changes the Sunday collection group. The customer's collection frequency remains unchanged.",
    "Hanya menukar kumpulan kutipan Ahad. Kekerapan kutipan pelanggan kekal.",
    "只改变星期日由哪组收货；客户仍按原收货频率到期安排。"
  ],
  [
    "周期起算日期",
    "Cycle start date",
    "Tarikh mula kitaran",
    "周期起算日期"
  ],
  [
    "按当前设置计算的下次收货日期：",
    "Next collection date with these settings:",
    "Tarikh kutipan seterusnya berdasarkan tetapan ini:",
    "按当前设置计算的下次收货日期："
  ],
  [
    "请先补全有效的周期设置",
    "Complete valid cycle settings first",
    "Lengkapkan tetapan kitaran yang sah dahulu",
    "请先补全有效的周期设置"
  ],
  [
    "（保存后生效）",
    "(Effective after saving)",
    "(Berkuat kuasa selepas disimpan)",
    "（保存后生效）"
  ],
  [
    "星期日执行路线：",
    "Sunday collection route:",
    "Laluan kutipan Ahad:",
    "星期日执行路线："
  ],
  [
    "客户通知无货、无需到店：请填写通知内容及原因。",
    "Customer reported no goods and no visit needed. Enter the notice and reason.",
    "Pelanggan memaklumkan tiada barang dan tidak perlu melawat. Masukkan makluman dan sebab.",
    "客户通知无货、无需到店：请填写通知内容及原因。"
  ],
  [
    "固定收货排程",
    "Regular collection schedule",
    "Jadual kutipan tetap",
    "固定收货排程"
  ],
  [
    "＋ 临时增加收货",
    "＋ Add extra collection",
    "＋ Tambah kutipan tambahan",
    "＋ 临时增加收货"
  ],
  [
    "客户通知无货（无需到店）",
    "Customer reported no goods (no visit needed)",
    "Pelanggan memaklumkan tiada barang (tidak perlu melawat)",
    "客户通知无货（无需到店）"
  ],
  [
    "只增加一次，保留原收货记录",
    "Add once; keep the original collection record",
    "Tambah sekali; kekalkan rekod kutipan asal",
    "只增加一次，保留原收货记录"
  ],
  [
    "确认增加",
    "Confirm addition",
    "Sahkan penambahan",
    "确认增加"
  ],
  [
    "收货排程需要确认（",
    "Collection schedules awaiting confirmation (",
    "Jadual kutipan menunggu pengesahan (",
    "收货排程需要确认（"
  ],
  [
    "确认补入",
    "Confirm adding",
    "Sahkan penambahan",
    "确认补入"
  ],
  [
    "上述应收客户",
    "customers due above",
    "pelanggan yang perlu dikutip di atas",
    "上述应收客户"
  ],
  [
    "按上传路线表同步固定收货星期",
    "Synchronize collection weekdays from the uploaded route plan",
    "Selaraskan hari kutipan daripada pelan laluan dimuat naik",
    "按上传路线表同步固定收货星期"
  ],
  [
    "建议收货星期：",
    "Suggested collection weekdays:",
    "Cadangan hari kutipan:",
    "建议收货星期："
  ],
  [
    "· ROUTE {0}",
    "· Route {0}",
    "· Laluan {0}",
    "· 路线 {0}"
  ],
  [
    "（依据同一 Area 建议，需确认）",
    "(Suggested from the same area; confirmation required)",
    "(Cadangan berdasarkan kawasan sama; pengesahan diperlukan)",
    "（依据同一区域建议，需确认）"
  ],
  [
    "周期起算日期：",
    "Cycle start date:",
    "Tarikh mula kitaran:",
    "周期起算日期："
  ],
  [
    "依据上次实际收货",
    "Based on the last actual collection",
    "Berdasarkan kutipan sebenar terakhir",
    "依据上次实际收货"
  ],
  [
    "系统建议，尚未确认",
    "System suggestion, not yet confirmed",
    "Cadangan sistem, belum disahkan",
    "系统建议，尚未确认"
  ],
  [
    "依据原排程",
    "Based on the original schedule",
    "Berdasarkan jadual asal",
    "依据原排程"
  ],
  [
    "建议下次收货日期：",
    "Suggested next collection date:",
    "Cadangan tarikh kutipan seterusnya:",
    "建议下次收货日期："
  ],
  [
    "（确认后生效）",
    "(Effective after confirmation)",
    "(Berkuat kuasa selepas pengesahan)",
    "（确认后生效）"
  ],
  [
    "来源：",
    "Source:",
    "Sumber:",
    "来源："
  ],
  [
    "{0} / ROUTE {1}",
    "{0} / Route {1}",
    "{0} / Laluan {1}",
    "{0}／路线 {1}"
  ],
  [
    "已有派车记录：",
    "Existing dispatch records:",
    "Rekod penugasan sedia ada:",
    "已有派车记录："
  ],
  [
    "排程",
    "Schedule",
    "Jadual",
    "排程"
  ],
  [
    "· 起算",
    "· Starts",
    "· Bermula",
    "· 起算"
  ],
  [
    "核对排程",
    "Review schedule",
    "Semak jadual",
    "核对排程"
  ],
  [
    "已到店 · 无货",
    "Arrived · No goods",
    "Tiba · Tiada barang",
    "已到店 · 无货"
  ],
  [
    "需跟进",
    "Follow-up needed",
    "Perlu susulan",
    "需跟进"
  ],
  [
    "收货中",
    "Collecting",
    "Sedang mengutip",
    "收货中"
  ],
  [
    "待收",
    "Awaiting collection",
    "Menunggu kutipan",
    "待收"
  ],
  [
    "上移 {0}",
    "Move {0} up",
    "Naikkan {0}",
    "上移 {0}"
  ],
  [
    "下移 {0}",
    "Move {0} down",
    "Turunkan {0}",
    "下移 {0}"
  ],
  [
    "Address：",
    "Address:",
    "Alamat:",
    "Address:"
  ],
  [
    "Not recorded",
    "Not recorded",
    "Tidak direkodkan",
    "未记录"
  ],
  [
    "联系人：",
    "Contact:",
    "Orang hubungan:",
    "联系人："
  ],
  [
    "未记录",
    "Not recorded",
    "Tidak direkodkan",
    "未记录"
  ],
  [
    "电话未记录",
    "Phone not recorded",
    "Telefon tidak direkodkan",
    "电话未记录"
  ],
  [
    "约定时段：",
    "Agreed time window:",
    "Tempoh masa dipersetujui:",
    "约定时段："
  ],
  [
    "Truck access",
    "Truck access",
    "Akses lori",
    "罗里通行条件"
  ],
  [
    "GPS note",
    "GPS note",
    "Catatan GPS",
    "定位备注"
  ],
  [
    "跟进原因",
    "Follow-up reason",
    "Sebab susulan",
    "跟进原因"
  ],
  [
    "导航",
    "Navigate",
    "Navigasi",
    "导航"
  ],
  [
    "GPS 未记录",
    "GPS not recorded",
    "GPS tidak direkodkan",
    "未记录定位"
  ],
  [
    "客户主资料",
    "Customer records",
    "Rekod pelanggan",
    "客户主资料"
  ],
  [
    "转到其他 ROUTE",
    "Move to another route",
    "Pindah ke laluan lain",
    "转到其他路线"
  ],
  [
    "已有执行或单据，保留原始收货记录。",
    "Execution or billing has started; the original collection record is retained.",
    "Pelaksanaan atau bil telah bermula; rekod kutipan asal dikekalkan.",
    "已有执行或单据，保留原始收货记录。"
  ],
  [
    "调整前请先撤回批准；执行中的日期不能移动客户。",
    "Withdraw approval before editing. Customers cannot be moved on dates already in progress.",
    "Tarik balik kelulusan sebelum mengubah. Pelanggan tidak boleh dipindah pada tarikh yang sedang dilaksanakan.",
    "调整前请先撤回批准；执行中的日期不能移动客户。"
  ],
  [
    "调整当天 ROUTE（收货日期不变）",
    "Change today's route (collection date unchanged)",
    "Ubah laluan hari ini (tarikh kutipan kekal)",
    "调整当天路线（收货日期不变）"
  ],
  [
    "确认调整",
    "Confirm change",
    "Sahkan perubahan",
    "确认调整"
  ],
  [
    "卸货记录",
    "Unloading records",
    "Rekod pemunggahan",
    "卸货记录"
  ],
  [
    "刷新记录",
    "Refresh records",
    "Muat semula rekod",
    "刷新记录"
  ],
  [
    "当天这条 ROUTE 暂无卸货记录。",
    "No unloading records for this route on this date.",
    "Tiada rekod pemunggahan bagi laluan ini pada tarikh ini.",
    "当天这条路线暂无卸货记录。"
  ],
  [
    "等待员工确认重量",
    "Awaiting staff weight confirmation",
    "Menunggu pengesahan berat oleh pekerja",
    "等待员工确认重量"
  ],
  [
    "重量待确认",
    "Weight awaiting confirmation",
    "Berat menunggu pengesahan",
    "重量待确认"
  ],
  [
    "卸货提交司机：",
    "Submitting driver:",
    "Pemandu yang menghantar:",
    "卸货提交司机："
  ],
  [
    "当时 Attendant：",
    "Crew at the time:",
    "Pembantu ketika itu:",
    "当时跟车员："
  ],
  [
    "这车货关联 ROUTE",
    "This load is linked to routes",
    "Muatan ini berkaitan dengan laluan",
    "这车货关联路线"
  ],
  [
    "，同一卸货编号只计算一次。",
    "; each unloading record is counted once.",
    "; setiap rekod pemunggahan dikira sekali sahaja.",
    "，同一卸货编号只计算一次。"
  ],
  [
    "历史记录：路线根据现有趟次关联，人员按原始记录显示。",
    "Historical record: routes are linked from existing trips; staff follow the original record.",
    "Rekod sejarah: laluan dikaitkan melalui perjalanan sedia ada; pekerja mengikut rekod asal.",
    "历史记录：路线根据现有趟次关联，人员按原始记录显示。"
  ],
  [
    "查看卸货照片",
    "View unloading photo",
    "Lihat foto pemunggahan",
    "查看卸货照片"
  ],
  [
    "当天交接记录",
    "Today's handover records",
    "Rekod serahan tugas hari ini",
    "当天交接记录"
  ],
  [
    "交接前后人员供核对；卸货重量尚未分配为个人薪酬。",
    "Staff before and after handover are shown for checking. Unloading weight has not been allocated to individual pay.",
    "Pekerja sebelum dan selepas serahan dipaparkan untuk semakan. Berat pemunggahan belum diperuntukkan kepada gaji individu.",
    "交接前后人员供核对；卸货重量尚未分配为个人薪酬。"
  ],
  [
    "Workspace sections",
    "Workspace sections",
    "Bahagian ruang kerja",
    "工作区栏目"
  ],
  [
    "Preferred/Usual Areas",
    "Preferred / usual areas",
    "Kawasan pilihan / biasa",
    "偏好／常跑区域"
  ],
  [
    "· Start",
    "· Start",
    "· Mula",
    "· 出发"
  ],
  [
    "/ End",
    "/ End",
    "/ Akhir",
    "／结束"
  ],
  [
    "Coordinates kept; address lookup failed: {0}",
    "Coordinates kept; address lookup failed: {0}",
    "Koordinat dikekalkan; carian alamat gagal: {0}",
    "坐标已保留；地址查询失败：{0}"
  ],
  [
    "Enter an address to search",
    "Enter an address to search",
    "Masukkan alamat untuk dicari",
    "输入地址进行搜索"
  ],
  [
    "Select a valid location on the map",
    "Select a valid location on the map",
    "Pilih lokasi yang sah pada peta",
    "请在地图上选择有效位置"
  ],
  [
    "Paste Coordinates",
    "Paste coordinates",
    "Tampal koordinat",
    "粘贴坐标"
  ],
  [
    "Get Current GPS",
    "Get current GPS",
    "Dapatkan GPS semasa",
    "取得当前位置"
  ],
  [
    "Use Pasted Coordinates",
    "Use pasted coordinates",
    "Gunakan koordinat ditampal",
    "使用已粘贴坐标"
  ],
  [
    "Find on Map",
    "Find on map",
    "Cari pada peta",
    "在地图查找"
  ],
  [
    "Select on Map",
    "Select on map",
    "Pilih pada peta",
    "在地图选择"
  ],
  [
    "GPS Source:",
    "GPS source:",
    "Sumber GPS:",
    "定位来源："
  ],
  [
    "Select GPS on map",
    "Select GPS on map",
    "Pilih GPS pada peta",
    "在地图选择定位"
  ],
  [
    "Search map",
    "Search map",
    "Cari peta",
    "搜索地图"
  ],
  [
    "Search address or place",
    "Search address or place",
    "Cari alamat atau tempat",
    "搜索地址或地点"
  ],
  [
    "Searching…",
    "Searching…",
    "Sedang mencari…",
    "搜索中…"
  ],
  [
    "Address search results",
    "Address search results",
    "Hasil carian alamat",
    "地址搜索结果"
  ],
  [
    "Search, pan or zoom, switch Map / Satellite, then click the map or drag the marker.",
    "Search, pan or zoom, switch Map / Satellite, then click the map or drag the marker.",
    "Cari, gerakkan atau zum, tukar Peta / Satelit, kemudian klik peta atau seret penanda.",
    "搜索、移动或缩放地图，切换地图／卫星，然后点击地图或拖动标记。"
  ],
  [
    "Use This Location",
    "Use this location",
    "Gunakan lokasi ini",
    "使用此位置"
  ],
  [
    "Selected GPS",
    "Selected GPS",
    "GPS dipilih",
    "已选定位"
  ],
  [
    "Current: {0}",
    "Current: {0}",
    "Semasa: {0}",
    "当前：{0}"
  ],
  [
    "Suggested: {0}",
    "Suggested: {0}",
    "Cadangan: {0}",
    "建议：{0}"
  ],
  [
    "Route",
    "Route",
    "Laluan",
    "路线"
  ],
  [
    "ROUTE",
    "Route",
    "Laluan",
    "路线"
  ],
  [
    "Trip",
    "Trip",
    "Perjalanan",
    "趟次"
  ],
  [
    "Daily",
    "Daily",
    "Setiap hari",
    "每天"
  ],
  [
    "Weekly",
    "Weekly",
    "Setiap minggu",
    "每周"
  ],
  [
    "Monthly",
    "Monthly",
    "Setiap bulan",
    "每月"
  ],
  [
    "Paused",
    "Paused",
    "Dijeda",
    "暂停"
  ],
  [
    "Sunday",
    "Sunday",
    "Ahad",
    "星期日"
  ],
  [
    "Monday",
    "Monday",
    "Isnin",
    "星期一"
  ],
  [
    "Tuesday",
    "Tuesday",
    "Selasa",
    "星期二"
  ],
  [
    "Wednesday",
    "Wednesday",
    "Rabu",
    "星期三"
  ],
  [
    "Thursday",
    "Thursday",
    "Khamis",
    "星期四"
  ],
  [
    "Friday",
    "Friday",
    "Jumaat",
    "星期五"
  ],
  [
    "Saturday",
    "Saturday",
    "Sabtu",
    "星期六"
  ],
  [
    "First",
    "First",
    "Pertama",
    "第一个"
  ],
  [
    "Second",
    "Second",
    "Kedua",
    "第二个"
  ],
  [
    "Third",
    "Third",
    "Ketiga",
    "第三个"
  ],
  [
    "Fourth",
    "Fourth",
    "Keempat",
    "第四个"
  ],
  [
    "Last",
    "Last",
    "Terakhir",
    "最后一个"
  ],
  [
    "Weight",
    "Weight",
    "Berat",
    "重量"
  ],
  [
    "Item",
    "Item",
    "Item",
    "品项"
  ],
  [
    "Remove",
    "Remove",
    "Buang",
    "删除"
  ],
  [
    "Remove {0}",
    "Remove {0}",
    "Buang {0}",
    "删除 {0}"
  ],
  [
    "Reason:",
    "Reason:",
    "Sebab:",
    "原因："
  ],
  [
    "Arrived",
    "Arrived",
    "Tiba",
    "已到店"
  ],
  [
    "Fuel",
    "Fuel",
    "Bahan api",
    "燃油"
  ],
  [
    "Services",
    "Servicing",
    "Servis",
    "保养"
  ],
  [
    "Repair",
    "Repair",
    "Pembaikan",
    "维修"
  ],
  [
    "Spare Parts",
    "Spare parts",
    "Alat ganti",
    "零件"
  ],
  [
    "Road Tax",
    "Road tax",
    "Cukai jalan",
    "路税"
  ],
  [
    "Insurance",
    "Insurance",
    "Insurans",
    "保险"
  ],
  [
    "Other",
    "Other",
    "Lain-lain",
    "其他"
  ],
  [
    "Purchases",
    "Purchases",
    "Pembelian",
    "采购"
  ],
  [
    "Expenses",
    "Expenses",
    "Perbelanjaan",
    "支出"
  ],
  [
    "Description",
    "Description",
    "Keterangan",
    "说明"
  ],
  [
    "PURCHASE",
    "Purchase",
    "Pembelian",
    "采购单"
  ],
  [
    "No:",
    "No.:",
    "No.:",
    "编号："
  ],
  [
    "Date:",
    "Date:",
    "Tarikh:",
    "日期："
  ],
  [
    "To:",
    "To:",
    "Kepada:",
    "客户："
  ],
  [
    "Att:",
    "Vehicle:",
    "Kenderaan:",
    "车辆："
  ],
  [
    "Total",
    "Total",
    "Jumlah",
    "合计"
  ],
  [
    "Cash",
    "Cash",
    "Tunai",
    "现金"
  ],
  [
    "Credit",
    "Credit",
    "Kredit",
    "赊账"
  ],
  [
    "Bank Transfer",
    "Bank transfer",
    "Pindahan bank",
    "银行转账"
  ],
  [
    "Stop",
    "Stop",
    "Hentian",
    "站点"
  ],
  [
    "Areas",
    "Areas",
    "Kawasan",
    "区域"
  ],
  [
    "Type",
    "Type",
    "Jenis",
    "类型"
  ],
  [
    "Factory",
    "Factory",
    "Kilang",
    "工厂"
  ],
  [
    "Move",
    "Move",
    "Pindah",
    "移动"
  ],
  [
    "BranchID",
    "Branch ID",
    "ID cawangan",
    "分店编号"
  ],
  [
    "ScheduleID",
    "Schedule ID",
    "ID jadual",
    "排程编号"
  ],
  [
    "Selected",
    "Selected",
    "Dipilih",
    "已选择"
  ],
  [
    "Area",
    "Area",
    "Kawasan",
    "区域"
  ],
  [
    "Frequency",
    "Frequency",
    "Kekerapan",
    "频率"
  ],
  [
    "Capacity",
    "Capacity",
    "Kapasiti",
    "载重量"
  ],
  [
    "Base",
    "Base",
    "Pangkalan",
    "基地"
  ],
  [
    "Zones",
    "Zones",
    "Zon",
    "分区"
  ],
  [
    "Zone",
    "Zone",
    "Zon",
    "分区"
  ],
  [
    "End",
    "End",
    "Akhir",
    "结束"
  ],
  [
    "Parking",
    "Parking",
    "Parkir",
    "停车"
  ],
  [
    "Assistant",
    "Assistant",
    "Pembantu",
    "跟车员"
  ],
  [
    "Crew",
    "Crew",
    "Pembantu",
    "跟车员"
  ],
  [
    "confirmed",
    "Confirmed",
    "Disahkan",
    "已确认"
  ],
  [
    "pending",
    "Pending",
    "Menunggu",
    "待处理"
  ],
  [
    "active",
    "Active",
    "Aktif",
    "启用"
  ],
  [
    "inactive",
    "Inactive",
    "Tidak aktif",
    "停用"
  ],
  [
    "completed",
    "Completed",
    "Selesai",
    "已完成"
  ],
  [
    "cancelled",
    "Cancelled",
    "Dibatalkan",
    "已取消"
  ],
  [
    "draft",
    "Draft",
    "Draf",
    "草稿"
  ],
  [
    "approved",
    "Approved",
    "Diluluskan",
    "已批准"
  ],
  [
    "in_progress",
    "In progress",
    "Sedang dilaksanakan",
    "执行中"
  ],
  [
    "reapproval_required",
    "Reapproval required",
    "Perlu kelulusan semula",
    "需要重新批准"
  ],
  [
    "maintenance",
    "Maintenance",
    "Penyelenggaraan",
    "维修中"
  ],
  [
    "sold",
    "Sold",
    "Dijual",
    "已出售"
  ],
  [
    "on_leave",
    "On leave",
    "Bercuti",
    "休假"
  ],
  [
    "available",
    "Available",
    "Tersedia",
    "可用"
  ],
  [
    "customer_requested_return",
    "Customer requested return later",
    "Pelanggan minta datang semula",
    "客户要求稍后再来"
  ],
  [
    "no_space_available",
    "No space available",
    "Tiada ruang tersedia",
    "暂时没有空间"
  ],
  [
    "other",
    "Other",
    "Lain-lain",
    "其他"
  ],
  [
    "Sunday is restricted to approved customers.",
    "Sunday collections require supervisor approval.",
    "Kutipan Ahad memerlukan kelulusan penyelia.",
    "星期日收货需要主管批准。"
  ],
  [
    "请由主管确认星期日收货。",
    "Ask a supervisor to confirm Sunday collection.",
    "Minta penyelia mengesahkan kutipan Ahad.",
    "请由主管确认星期日收货。"
  ],
  [
    "Electronic Bill {0} created.",
    "Electronic bill {0} created.",
    "Bil elektronik {0} dibuat.",
    "电子单 {0} 已建立。"
  ],
  [
    "Monthly occurrence must be First, Second, Third, Fourth, or Last.",
    "Choose the first, second, third, fourth or last occurrence in the month.",
    "Pilih kejadian pertama, kedua, ketiga, keempat atau terakhir dalam bulan.",
    "请选择当月第一个、第二个、第三个、第四个或最后一个星期。"
  ],
  [
    "Monthly occurrence is required.",
    "Select the monthly occurrence.",
    "Pilih kejadian dalam bulan.",
    "请选择当月第几个星期。"
  ],
  [
    "The requested monthly occurrence does not exist in this month.",
    "The selected occurrence does not exist in this month.",
    "Kejadian dipilih tidak wujud dalam bulan ini.",
    "本月没有所选的星期次数。"
  ],
  [
    "A valid fixed weekday is required for interval or monthly recurrence.",
    "Choose a valid fixed weekday for this repeating schedule.",
    "Pilih hari tetap yang sah untuk jadual berulang ini.",
    "此周期排程必须选择有效的固定星期。"
  ],
  [
    "Anchor Date is required for interval or monthly recurrence.",
    "A cycle start date is required for this repeating schedule.",
    "Tarikh mula kitaran diperlukan untuk jadual berulang ini.",
    "此周期排程必须填写起算日期。"
  ],
  [
    "Interval Weeks must be 2 or 3.",
    "The interval must be two or three weeks.",
    "Sela mesti dua atau tiga minggu.",
    "间隔必须为两周或三周。"
  ],
  [
    "Anchor Date must fall on the fixed weekday.",
    "The cycle start date must fall on the selected weekday.",
    "Tarikh mula kitaran mesti jatuh pada hari yang dipilih.",
    "周期起算日期必须与所选星期一致。"
  ],
  [
    "A valid from date is required.",
    "A valid start date is required.",
    "Tarikh mula yang sah diperlukan.",
    "请填写有效的开始日期。"
  ],
  [
    "Invalid Route",
    "Invalid route",
    "Laluan tidak sah",
    "路线无效"
  ],
  [
    "Invalid weekday",
    "Invalid weekday",
    "Hari tidak sah",
    "收货星期无效"
  ],
  [
    "Collection Frequency is required.",
    "Collection frequency is required.",
    "Kekerapan kutipan diperlukan.",
    "请选择收货频率。"
  ],
  [
    "Recurrence type does not match Collection Frequency.",
    "The recurrence type does not match the collection frequency.",
    "Jenis ulangan tidak sepadan dengan kekerapan kutipan.",
    "周期类型与收货频率不一致。"
  ],
  [
    "Reason is required.",
    "A reason is required.",
    "Sebab diperlukan.",
    "请填写原因。"
  ],
  [
    "此客户属于多条 ROUTE，请在派车中指定新增星期的 ROUTE。",
    "This customer uses multiple routes. Select the route for the added weekday in dispatch.",
    "Pelanggan ini menggunakan beberapa laluan. Pilih laluan untuk hari tambahan dalam penugasan.",
    "此客户属于多条路线，请在派车中指定新增星期的路线。"
  ],
  [
    "所选 ROUTE 尚无基础路线，请先确认路线资料。",
    "The selected route has no base plan. Confirm its route data first.",
    "Laluan dipilih tiada pelan asas. Sahkan data laluan dahulu.",
    "所选路线尚无基础路线，请先确认路线资料。"
  ],
  [
    "多份有效收货排程，需要主管核对（未删除或合并）",
    "Multiple active schedules need supervisor review. None have been deleted or merged.",
    "Beberapa jadual aktif memerlukan semakan penyelia. Tiada jadual dipadam atau digabungkan.",
    "多份有效收货排程，需要主管核对（未删除或合并）"
  ],
  [
    "路线表每周次数需要核对",
    "Review the weekly frequency in the route plan.",
    "Semak kekerapan mingguan dalam pelan laluan.",
    "路线表每周次数需要核对"
  ],
  [
    "路线表包含星期日，但现有排程未获星期日许可；保留原排程，请主管核对收货星期",
    "The route plan includes Sunday, but the current schedule lacks Sunday approval. The original schedule is retained for supervisor review.",
    "Pelan laluan termasuk Ahad, tetapi jadual semasa belum mendapat kelulusan Ahad. Jadual asal dikekalkan untuk semakan penyelia.",
    "路线表包含星期日，但现有排程未获星期日许可；保留原排程，请主管核对收货星期"
  ],
  [
    "确认低频客户周期及所属 ROUTE",
    "Confirm this infrequent customer's cycle and home route.",
    "Sahkan kitaran dan laluan tetap pelanggan berkekerapan rendah ini.",
    "确认低频客户周期及所属路线"
  ],
  [
    "曾在上传路线表中出现，请核对是否恢复；不会自动覆盖当前安排",
    "Found in a previously uploaded route plan. Review whether to restore it; current assignments are not overwritten automatically.",
    "Ditemui dalam pelan laluan terdahulu. Semak sama ada perlu dipulihkan; penugasan semasa tidak ditulis ganti secara automatik.",
    "曾在上传路线表中出现，请核对是否恢复；不会自动覆盖当前安排"
  ],
  [
    "有历史派车 ROUTE，尚未保存为固定路线；请确认长期归属",
    "Historical dispatch routes exist, but no home route is saved. Confirm the long-term assignment.",
    "Laluan penugasan terdahulu wujud tetapi laluan tetap belum disimpan. Sahkan penetapan jangka panjang.",
    "有历史派车路线，尚未保存为固定路线；请确认长期归属"
  ],
  [
    "现行及已保存的上传路线表均未找到此客户，需确认固定归属",
    "This customer is absent from current and saved uploaded route plans. Confirm the home route.",
    "Pelanggan ini tiada dalam pelan laluan semasa dan yang disimpan. Sahkan laluan tetap.",
    "现行及已保存的上传路线表均未找到此客户，需确认固定归属"
  ],
  [
    "原周期起算日期无效，需要核对",
    "The original cycle start date is invalid. Please review it.",
    "Tarikh mula kitaran asal tidak sah. Sila semak.",
    "原周期起算日期无效，需要核对"
  ],
  [
    "原预计收货日期无效，需要核对",
    "The original expected collection date is invalid. Please review it.",
    "Tarikh jangkaan kutipan asal tidak sah. Sila semak.",
    "原预计收货日期无效，需要核对"
  ],
  [
    "原收货日期无效，需要核对",
    "The original collection date is invalid. Please review it.",
    "Tarikh kutipan asal tidak sah. Sila semak.",
    "原收货日期无效，需要核对"
  ],
  [
    "原生效日期无效，需要核对",
    "The original effective date is invalid. Please review it.",
    "Tarikh kuat kuasa asal tidak sah. Sila semak.",
    "原生效日期无效，需要核对"
  ],
  [
    "原起算星期与所属路线不同，已列出对齐路线日的建议，需确认",
    "The original start weekday differs from the route. A matching date is suggested for confirmation.",
    "Hari mula asal berbeza daripada laluan. Tarikh sepadan dicadangkan untuk pengesahan.",
    "原起算星期与所属路线不同，已列出对齐路线日的建议，需确认"
  ],
  [
    "周期规则需要核对，暂不提供下次日期",
    "Review the recurrence rules before calculating the next date.",
    "Semak peraturan ulangan sebelum mengira tarikh seterusnya.",
    "周期规则需要核对，暂不提供下次日期"
  ],
  [
    "星期日执行路线已改变，原安排已有批准、执行或人工调整，请主管核对。",
    "The Sunday route changed, but the original plan was approved, started or manually adjusted. Supervisor review is required.",
    "Laluan Ahad berubah, tetapi pelan asal telah diluluskan, dimulakan atau diubah secara manual. Semakan penyelia diperlukan.",
    "星期日执行路线已改变，原安排已有批准、执行或人工调整，请主管核对。"
  ],
  [
    "应收客户尚未加入；请主管核对并撤回批准后补排",
    "A due customer is missing. The supervisor must review and withdraw approval before adding the customer.",
    "Pelanggan yang perlu dikutip belum ditambah. Penyelia perlu menyemak dan menarik balik kelulusan sebelum menambah pelanggan.",
    "应收客户尚未加入；请主管核对并撤回批准后补排"
  ],
  [
    "所属 ROUTE 已完成，请主管安排临时增加到其他日期",
    "The home route is completed. Ask the supervisor to add a one-off collection on another date.",
    "Laluan tetap telah selesai. Minta penyelia menambah kutipan sekali pada tarikh lain.",
    "所属路线已完成，请主管安排临时增加到其他日期"
  ],
  [
    "收货记录与排程关联需要核对",
    "Review the link between the collection record and schedule.",
    "Semak kaitan antara rekod kutipan dan jadual.",
    "收货记录与排程关联需要核对"
  ],
  [
    "已加入当天待安排客户，请确认所属 ROUTE",
    "Added to today's unassigned customers. Confirm the home route.",
    "Ditambah kepada pelanggan belum ditetapkan hari ini. Sahkan laluan tetap.",
    "已加入当天待安排客户，请确认所属路线"
  ],
  [
    "固定排程已改变，原批准安排需要主管核对",
    "The regular schedule changed. The approved plan needs supervisor review.",
    "Jadual tetap berubah. Pelan diluluskan memerlukan semakan penyelia.",
    "固定排程已改变，原批准安排需要主管核对"
  ],
  [
    "Route {0} has no customers.",
    "Route {0} has no customers.",
    "Laluan {0} tiada pelanggan.",
    "路线 {0} 没有客户。"
  ],
  [
    "Route {0} has not been assigned a vehicle.",
    "Route {0} has not been assigned a vehicle.",
    "Laluan {0} belum ditetapkan kenderaan.",
    "路线 {0} 尚未分配车辆。"
  ],
  [
    "{0} is not on the Route vehicle.",
    "{0} is not on the assigned route vehicle.",
    "{0} bukan pada kenderaan laluan ditetapkan.",
    "{0} 不在路线所分配的车辆上。"
  ],
  [
    "{0} is not Active.",
    "{0} is not active.",
    "{0} tidak aktif.",
    "{0} 未启用。"
  ],
  [
    "{0} has an invalid Trip.",
    "{0} has an invalid trip.",
    "{0} mempunyai perjalanan tidak sah.",
    "{0} 的趟次无效。"
  ],
  [
    "{0} is inactive.",
    "{0} is inactive.",
    "{0} tidak aktif.",
    "{0} 已停用。"
  ],
  [
    "{0} belongs to a Superseded Schedule.",
    "{0} belongs to a replaced schedule.",
    "{0} tergolong dalam jadual yang telah diganti.",
    "{0} 属于已被替代的排程。"
  ],
  [
    "{0}: GPS missing.",
    "{0}: GPS missing.",
    "{0}: GPS tiada.",
    "{0}：缺少定位。"
  ],
  [
    "{0}: estimated weight not set.",
    "{0}: estimated weight not set.",
    "{0}: anggaran berat belum ditetapkan.",
    "{0}：未设预计重量。"
  ],
  [
    "{0}: time restriction applies.",
    "{0}: time restriction applies.",
    "{0}: tertakluk kepada had masa.",
    "{0}：有收货时间限制。"
  ],
  [
    "{0} existing future Dispatch Stop(s) will be checked against the new schedule; approved or executed records require supervisor review.",
    "{0} future stops will be checked against the new schedule. Approved or executed records need supervisor review.",
    "{0} hentian akan disemak mengikut jadual baharu. Rekod diluluskan atau dilaksanakan memerlukan semakan penyelia.",
    "将按新排程核对 {0} 个未来站点；已批准或执行的记录需要主管核对。"
  ]
]

const normalizeUiText=value=>String(value??'').trim().replace(/\s+/g,' ')
operationalUiMessages.push(...[
  [
    "Select a payment proof photo.",
    "Select a payment proof photo.",
    "Pilih gambar bukti pembayaran.",
    "请选择付款证明照片。"
  ],
  [
    "Unsupported photo format. Use JPEG, PNG, HEIC or WebP.",
    "Unsupported photo format. Use JPEG, PNG, HEIC or WebP.",
    "Format gambar tidak disokong. Gunakan JPEG, PNG, HEIC atau WebP.",
    "不支持此照片格式，请使用 JPEG、PNG、HEIC 或 WebP。"
  ],
  [
    "The original photo is too large. Use a photo smaller than 25 MB.",
    "The original photo is too large. Use a photo smaller than 25 MB.",
    "Gambar asal terlalu besar. Gunakan gambar kurang daripada 25 MB.",
    "原照片太大，请选择小于 25 MB 的照片。"
  ],
  [
    "This phone cannot decode HEIC. Set the camera to JPEG or upload a screenshot.",
    "This phone cannot decode HEIC. Set the camera to JPEG or upload a screenshot.",
    "Telefon ini tidak dapat membaca HEIC. Tetapkan kamera kepada JPEG atau muat naik tangkapan skrin.",
    "此手机无法读取 HEIC，请将相机设为 JPEG 或上传截图。"
  ],
  [
    "This photo could not be read. Retake it or choose a JPEG/PNG image.",
    "This photo could not be read. Retake it or choose a JPEG/PNG image.",
    "Gambar ini tidak dapat dibaca. Ambil semula atau pilih gambar JPEG/PNG.",
    "无法读取照片，请重新拍摄或选择 JPEG／PNG 图片。"
  ],
  [
    "The browser could not compress this photo.",
    "The browser could not compress this photo.",
    "Pelayar tidak dapat memampatkan gambar ini.",
    "浏览器无法压缩这张照片。"
  ],
  [
    "The browser could not prepare this photo.",
    "The browser could not prepare this photo.",
    "Pelayar tidak dapat memproses gambar ini.",
    "浏览器无法处理这张照片。"
  ],
  [
    "The compressed proof is still too large. Retake it at a lower camera resolution.",
    "The compressed proof is still too large. Retake it at a lower camera resolution.",
    "Gambar selepas dimampatkan masih terlalu besar. Ambil semula dengan resolusi kamera lebih rendah.",
    "压缩后的照片仍然太大，请降低相机分辨率重新拍摄。"
  ],
  [
    "The processed proof could not be prepared for upload.",
    "The processed proof could not be prepared for upload.",
    "Gambar yang diproses tidak dapat disediakan untuk muat naik.",
    "无法准备照片上传，请重试。"
  ]
])
operationalUiMessages.push(...[["Payment / Receipt Proof (optional)", "Payment / Receipt Proof (optional)", "Bukti Bayaran / Resit (pilihan)", "付款／收据证明（选填）"], ["IC Front", "IC Front", "Bahagian depan kad pengenalan", "身份证正面"], ["IC Back", "IC Back", "Bahagian belakang kad pengenalan", "身份证背面"], ["Before Photo", "Before Photo", "Gambar sebelum", "维修前照片"], ["After Photo", "After Photo", "Gambar selepas", "维修后照片"], ["Receipt", "Receipt", "Resit", "收据"], ["Photo", "Photo", "Gambar", "照片"], ["Invoice", "Invoice", "Invois", "发票"], ["File", "File", "Fail", "文件"], ["Replace", "Replace", "Ganti", "替换"]])
operationalUiMessages.push(...[["等待客户来电后安排收货", "Awaiting customer call to arrange collection", "Menunggu panggilan pelanggan untuk mengatur kutipan", "等待客户来电后安排收货"], ["已暂停定期收货", "Regular collection is paused", "Kutipan berkala dihentikan sementara", "已暂停定期收货"]])

operationalUiMessages.push(...[["1. Basic information", "1. Basic information", "1. Maklumat asas", "1. 基本资料"], ["2. Job and employment", "2. Job and employment", "2. Jawatan dan pekerjaan", "2. 岗位与任职"], ["3. Identity document, Bank, EPF, SOCSO", "3. Identity document, Bank, EPF, SOCSO", "3. Pengenalan, bank, KWSP, PERKESO", "3. 身份证件、银行、EPF、SOCSO"], ["3. Optional sensitive and payroll information", "3. Optional sensitive and payroll information", "3. Maklumat sulit dan gaji pilihan", "3. 敏感及薪资资料（选填）"], ["4. KCS internal account", "4. KCS internal account", "4. Akaun dalaman KCS", "4. KCS登录账号"], ["Cancel / Exit", "Cancel / Exit", "Batal / Keluar", "取消／退出"], ["Clear Filter", "Clear Filter", "Kosongkan penapis", "清除筛选"], ["Clear Sort", "Clear Sort", "Kosongkan susunan", "清除排序"], ["Confirm closing currentPeriod", "Confirm closing currentPeriod", "Sahkan pemberhentian", "确认离职"], ["Confirm rehire", "Confirm rehire", "Sahkan pengambilan semula", "确认重新入职"], ["Contract End", "Contract End", "Kontrak tamat", "合约结束"], ["Create employee", "Create employee", "Cipta pekerja", "新增员工"], ["Data tools ⋯", "Data tools ⋯", "Alat data ⋯", "资料工具 ⋯"], ["Driving Licence Expiry Date", "Driving Licence Expiry Date", "Tarikh tamat lesen memandu", "驾驶执照到期日期"], ["GDL Expiry Date", "GDL Expiry Date", "Tarikh tamat GDL", "GDL到期日期"], ["Edit bank details", "Edit bank details", "Sunting maklumat bank", "修改银行资料"], ["EditEPF", "EditEPF", "Sunting KWSP", "修改EPF"], ["EditIC", "EditIC", "Sunting kad pengenalan", "修改身份证"], ["EditSOCSO", "EditSOCSO", "Sunting PERKESO", "修改SOCSO"], ["Employee Name *", "Employee Name *", "Nama pekerja *", "员工姓名 *"], ["Employment Start Date *", "Employment Start Date *", "Tarikh mula kerja *", "入职日期 *"], ["Employment Status *", "Employment Status *", "Status pekerjaan *", "任职状态 *"], ["Employment Type *", "Employment Type *", "Jenis pekerjaan *", "聘用类型 *"], ["End Date", "End Date", "Tarikh tamat", "结束日期"], ["Leaving Reason", "Leaving Reason", "Sebab berhenti", "离职原因"], ["New Start Date", "New Start Date", "Tarikh mula baharu", "新入职日期"], ["Primary Job Role *", "Primary Job Role *", "Jawatan utama *", "主要岗位 *"], ["Reactivate the original account", "Reactivate the original account", "Aktifkan semula akaun asal", "重新启用原账号"], ["Resigned", "Resigned", "Meletak jawatan", "辞职"], ["Terminated", "Terminated", "Ditamatkan", "终止聘用"], ["Suspended", "Suspended", "Digantung tugas", "停职"], ["The active employee has no Employment Start Date. Please provide it soon.", "The active employee has no Employment Start Date. Please provide it soon.", "Pekerja semasa tiada tarikh mula kerja. Sila lengkapkan.", "这名在职员工尚未填写入职日期，请补全。"], ["Usual/Familiar Areas (recommendation only)", "Usual/Familiar Areas (recommendation only)", "Kawasan biasa (cadangan sahaja)", "熟悉区域（仅供安排参考）"], ["＋ Add employee", "＋ Add employee", "＋ Tambah pekerja", "＋ 新增员工"], ["Employee record only", "Employee record only", "Rekod pekerja dan akaun pilihan", "员工资料及可选登录账号"], ["Editing {name} ({code}). Enter the reason for this change", "Editing {name} ({code}). Enter the reason for this change", "Menyunting {name} ({code}). Masukkan sebab perubahan", "正在修改 {name}（{code}），请输入修改原因"], ["Saved: {name}", "Saved: {name}", "Disimpan: {name}", "已保存：{name}"], ["The current employee has unsaved changes. Discard them and switch employee?", "The current employee has unsaved changes. Discard them and switch employee?", "Perubahan belum disimpan. Buang dan tukar pekerja?", "当前员工有未保存的修改，是否放弃并切换员工？"], ["The current employee has unsaved changes. Discard them and close?", "The current employee has unsaved changes. Discard them and close?", "Perubahan belum disimpan. Buang dan tutup?", "当前员工有未保存的修改，是否放弃并关闭？"], ["No changes", "No changes", "Tiada perubahan", "尚无修改"], ["Unsaved changes", "Unsaved changes", "Perubahan belum disimpan", "修改尚未保存"], ["Complete the required fields", "Complete the required fields", "Lengkapkan medan wajib", "请填写必填资料"], ["Save employee", "Save employee", "Simpan pekerja", "保存员工"], ["Save changes", "Save changes", "Simpan perubahan", "保存修改"], ["Departure process completed, The current Employment Period is closed.", "Departure process completed, The current Employment Period is closed.", "Pemberhentian selesai. Tempoh pekerjaan semasa ditutup.", "离职已保存，当前任职期间已结束，登录已停用。"], ["Rehire completed, A new Employment Period was created.", "Rehire completed, A new Employment Period was created.", "Pengambilan semula selesai. Tempoh pekerjaan baharu dicipta.", "已重新入职并建立新的任职记录。"], ["Create the employee first. IC, bank, EPF, SOCSO and protected documents can be completed later from the employee record with the existing permission and audit controls.", "Create the employee first. IC, bank, EPF, SOCSO and protected documents can be completed later from the employee record with the existing permission and audit controls.", "Simpan pekerja dahulu. Maklumat pengenalan, bank, KWSP, PERKESO dan dokumen boleh dilengkapkan kemudian oleh pengguna yang diberi kuasa.", "先保存员工；身份证、银行、EPF、SOCSO及证件可稍后在该员工资料卡内由授权人员补全。"]])
operationalUiMessages.push(...[["Mechanic / Workshop", "Mechanic / Workshop", "Mekanik / Bengkel", "维修／车间"], ["Employee ID mismatch. Save blocked. Close the details and open them again.", "Employee ID mismatch. Save blocked. Close the details and open them again.", "ID pekerja tidak sepadan. Tutup dan buka semula rekod.", "员工编号不一致，已阻止保存。请关闭后重新打开。"], ["Enter the purpose of the sensitive-data export", "Enter the purpose of the sensitive-data export", "Masukkan tujuan eksport data sulit", "请输入导出敏感资料的用途"], ["Employee import committed.", "Employee import committed.", "Import pekerja selesai.", "员工资料已导入。"], ["You have unsaved changes. Leave without saving?", "You have unsaved changes. Leave without saving?", "Perubahan belum disimpan. Keluar tanpa menyimpan?", "有未保存的修改，是否放弃并离开？"], ["Export sensitive employee data? This action is audited.", "Export sensitive employee data? This action is audited.", "Eksport data sulit pekerja? Tindakan ini direkodkan.", "确定导出员工敏感资料？此操作会留下审计记录。"], ["Active Account", "Active Account", "Akaun aktif", "账号启用"], ["Disabled Account", "Disabled Account", "Akaun dinyahaktifkan", "账号停用"], ["No Account", "No Account", "Tiada akaun", "无账号"], ["Enter a reason for viewing sensitive data", "Enter a reason for viewing sensitive data", "Masukkan sebab melihat data sulit", "请输入查看敏感资料的原因"], ["Sensitive data saved and audited.", "Sensitive data saved and audited.", "Data sulit disimpan dan direkodkan.", "敏感资料已保存并记录审计。"], ["Bank Name", "Bank Name", "Nama bank", "银行名称"], ["Enter a reason for uploading or replacing the document", "Enter a reason for uploading or replacing the document", "Masukkan sebab memuat naik atau mengganti dokumen", "请输入上传或更换证件的原因"], ["Identity document saved securely.", "Identity document saved securely.", "Dokumen pengenalan disimpan.", "身份证件已保存。"], ["Enter a reason for downloading the document", "Enter a reason for downloading the document", "Masukkan sebab memuat turun dokumen", "请输入下载证件的原因"], ["NewIC Number (optional)", "NewIC Number (optional)", "Nombor kad pengenalan baharu (pilihan)", "新身份证号码（选填）"], ["NewEPF Number (optional)", "NewEPF Number (optional)", "Nombor KWSP baharu (pilihan)", "新EPF号码（选填）"], ["NewSOCSO Number (optional)", "NewSOCSO Number (optional)", "Nombor PERKESO baharu (pilihan)", "新SOCSO号码（选填）"], ["Creating", "Creating", "Mencipta", "正在新增"], ["Editing", "Editing", "Menyunting", "正在修改"], ["New employee", "New employee", "Pekerja baharu", "新员工"], ["View", "View", "Lihat", "查看"], ["Download", "Download", "Muat turun", "下载"], ["Process departure", "Process departure", "Urus pemberhentian", "办理离职"], ["Rehire — new employment period", "Rehire — new employment period", "Pengambilan semula — tempoh pekerjaan baharu", "重新入职—新任职期间"], ["Change history", "Change history", "Sejarah perubahan", "修改记录"]])
operationalUiMessages.push(...[["Receipt details", "Receipt details", "Butiran resit", "单据资料"], ["Vehicle expenses require vehicle, odometer, invoice number and merchant name. TIN and remarks are optional.", "Vehicle expenses require vehicle, odometer, invoice number and merchant name. TIN and remarks are optional.", "Perbelanjaan kenderaan memerlukan kenderaan, bacaan meter, nombor invois dan nama peniaga. TIN dan catatan adalah pilihan.", "车辆费用必须填写车辆、公里数、发票号码和商家名称，TIN及备注选填。"], ["For Other, vehicle, odometer, TIN, remarks and additional description are optional. Amount, receipt photo, invoice number and merchant name are required.", "For Other, vehicle, odometer, TIN, remarks and additional description are optional. Amount, receipt photo, invoice number and merchant name are required.", "Untuk Lain-lain, kenderaan, bacaan meter, TIN, catatan dan penerangan tambahan adalah pilihan. Amaun, gambar resit, nombor invois dan nama peniaga wajib.", "选择其他费用时，车辆、公里数、TIN、备注及其他说明可留空；金额、单据照片、发票号码和商家公司名称必填。"], ["Vehicle", "Vehicle", "Kenderaan", "车辆"], ["Select vehicle", "Select vehicle", "Pilih kenderaan", "请选择车辆"], ["Odometer (km)", "Odometer (km)", "Bacaan meter (km)", "公里数（km）"], ["Invoice / Reference Number", "Invoice / Reference Number", "Nombor invois / rujukan", "发票／参考号码"], ["Company Name", "Company Name", "Nama syarikat", "商家公司名称"], ["TIN Number", "TIN Number", "Nombor TIN", "TIN税务编号"], ["Remarks", "Remarks", "Catatan", "备注"], ["Read receipt and fill blank fields", "Read receipt and fill blank fields", "Baca resit dan isi medan kosong", "识别单据并填入空白栏位"], ["Reading receipt…", "Reading receipt…", "Membaca resit…", "正在识别单据…"], ["Recognized values filled into blank fields only. Check every value before saving; enter unread details manually.", "Recognized values filled into blank fields only. Check every value before saving; enter unread details manually.", "Nilai dikenal pasti hanya diisi ke medan kosong. Semak semua nilai sebelum menyimpan; isi butiran lain secara manual.", "已将识别结果填入空白栏位。请逐项核对后再保存，未识别的资料请手动填写。"], ["The receipt could not be read reliably. Keep the photo and enter the details manually.", "The receipt could not be read reliably. Keep the photo and enter the details manually.", "Resit tidak dapat dibaca dengan pasti. Simpan gambar dan isi butiran secara manual.", "无法可靠识别这张单据，照片已保留，请手动填写资料。"], ["Receipt recognition is unavailable on this server. You can still enter details and save the photo.", "Receipt recognition is unavailable on this server. You can still enter details and save the photo.", "Pengecaman resit tidak tersedia pada pelayan ini. Anda masih boleh mengisi butiran dan menyimpan gambar.", "服务器暂时无法识别单据，仍可手动填写并保存照片。"], ["Another receipt is being read. Please try again shortly.", "Another receipt is being read. Please try again shortly.", "Resit lain sedang dibaca. Sila cuba sebentar lagi.", "系统正在识别另一张单据，请稍后再试。"]])
const operationalAliases=new Map()
operationalUiMessages.push(
 ['＋ Record Expense','＋ Record Expense','＋ Rekod perbelanjaan','＋ 记录费用'],
 ['Download Excel with Receipts','Download Excel with Receipts','Muat turun Excel berserta resit','下载Excel（含单据）'],
 ['View receipt','View receipt','Lihat resit','查看单据'],
 ['Entered By','Entered By','Dimasukkan oleh','录入人'],
 ['Entered Time','Entered Time','Masa dimasukkan','录入时间']
)
operationalUiMessages.push(
 ['From Date','From Date','Tarikh mula','开始日期'],['To Date','To Date','Tarikh akhir','结束日期'],
 ['Search all expense records','Search all expense records','Cari semua rekod perbelanjaan','搜索费用记录'],
 ['Employee, description or reference','Employee, description or reference','Pekerja, keterangan atau rujukan','员工、说明或参考号码'],
 ['Find an option','Find an option','Cari pilihan','搜索选项'],['Select value','Select value','Pilih nilai','选择内容'],
 ['Close','Close','Tutup','关闭']
)
operationalUiMessages.push(
 ['Unloading Weight Records','Unloading Weight Records','Rekod berat pemunggahan','卸货重量记录'],
 ['Download Excel with Payment Proofs','Download Excel with Payment Proofs','Muat turun Excel berserta bukti bayaran','下载Excel（含付款证明）'],
 ['Search purchase bills','Search purchase bills','Cari bil pembelian','搜索收购单据'],
 ['PO No., Customer, Branch or Branch ID','PO No., Customer, Branch or Branch ID','No. PO, pelanggan, cawangan atau ID cawangan','单据号码、客户、分店或分店编号'],
 ['Loading Purchase Bills…','Loading Purchase Bills…','Memuatkan bil pembelian…','正在加载收购单据…'],
 ['No Purchase Bills found for this selection.','No Purchase Bills found for this selection.','Tiada bil pembelian untuk pilihan ini.','没有符合条件的收购单据。'],
 ['Issued By','Issued By','Dikeluarkan oleh','开单员工'],
 ['View proof','View proof','Lihat bukti','查看付款证明'],
 ['Bill Items','Bill Items','Item bil','单据明细'],
 ['Item Total','Item Total','Jumlah item','项目合计'],
 ['Issued at','Issued at','Dikeluarkan pada','开单时间'],
 ['Electronic records cannot be deleted.','Electronic records cannot be deleted.','Rekod elektronik tidak boleh dipadam.','电子记录不能删除。'],
 ['Uploaded','Uploaded','Dimuat naik','已上传'],['Missing','Missing','Tiada','缺少'],
 ['Not required','Not required','Tidak diperlukan','无需提供'],
 ['Issued','Issued','Dikeluarkan','已开单'],['Voided','Voided','Dibatalkan','已作废']
)
operationalUiMessages.push(
 ['PO No.','PO No.','No. PO','收购单号'],
 ['Payment Method','Payment Method','Kaedah bayaran','付款方式'],
 ['Customer Name','Customer Name','Nama pelanggan','客户名称'],
 ['Car','Car','Kenderaan','车辆'],
 ['Payment Proof','Payment Proof','Bukti bayaran','付款证明'],
 ['Quantity','Quantity','Kuantiti','数量'],
 ['Unit','Unit','Unit','单位'],
 ['Price','Price','Harga','单价']
)
operationalUiMessages.push(
 ['Blank','Blank','Kosong','空白'],['Select all','Select all','Pilih semua','全选'],
 ['Sort ascending','Sort ascending','Susun menaik','升序'],
 ['Sort descending','Sort descending','Susun menurun','降序']
)
for(const row of operationalUiMessages)for(const text of row)operationalAliases.set(normalizeUiText(text),row)
export function translateUi(language,source,variables={}){
  const value=String(source??''),normalized=normalizeUiText(value),row=operationalAliases.get(normalized)
  let matched=row,params=variables
  if(!matched){
    for(const pattern of operationalPatterns){
      const match=normalized.match(pattern.regex)
      if(match){matched=pattern.row;params={...Object.fromEntries(pattern.keys.map((key,i)=>[key,match[i+1]])),...variables};break}
    }
  }
  if(!matched&&/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)([,;|，、]\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday))*$/.test(normalized))return normalized.split(/[,;|，、]\s*/).map(day=>translateUi(language,day)).join(', ')
  const text=matched?matched[{en:1,ms:2,zh:3}[language]||1]:translateSource(language,value)
  return text.replace(/\{(\w+)\}/g,(_,key)=>params[key]??'{'+key+'}')
}

// Match complete generated notices, never fragments of names or addresses.
const escapePattern=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
const operationalPatterns=[]
for(const row of operationalUiMessages)for(const source of row){
  const keys=[...source.matchAll(/\{(\w+)\}/g)].map(match=>match[1])
  if(!keys.length)continue
  const parts=normalizeUiText(source).split(/\{\w+\}/g)
  operationalPatterns.push({row,keys,weight:parts.join('').length,regex:new RegExp('^'+parts.map(escapePattern).join('(.*?)')+'$')})
}
operationalPatterns.sort((a,b)=>b.weight-a.weight)

Object.assign(messages.en,{'common.notAvailable':'Not available'})
Object.assign(messages.ms,{'common.notAvailable':'Tidak tersedia','mobile.weight':'Berat','mobile.area':'Kawasan','schedule.edit':'Sunting','hub.weekly':'Penugasan Mingguan','nav.dispatchSchedule':'Penugasan Kenderaan & Jadual Kutipan','hub.areaZone':'Penetapan Kawasan / Zon'})
Object.assign(messages.zh,{'common.notAvailable':'不可用','mobile.weight':'重量','mobile.more':'更多','mobile.selectBranch':'请先选择客户分店','mobile.searchBranch':'搜索客户、分店或分店编号','mobile.gpsSaved':'定位已保存为临时定位，等待主管审批。','mobile.submitGps':'提交临时定位','mobile.moreGpsHelp':'采集或校正客户分店定位','mobile.temporaryGps':'临时定位','mobile.weightNoTrip':'今天没有已分配的趟次。','mobile.startTrip':'开始趟次','hub.areaZone':'区域／分区归属','purchase.item':'品项','purchase.otherItem':'其他品项'})
for(const [language,replacements] of Object.entries({ms:{Area:'Kawasan',Areas:'Kawasan',Branch:'Cawangan',Branches:'Cawangan',Trip:'Perjalanan',Buyer:'Pembeli',Driver:'Pemandu',Attendant:'Pembantu',Schedule:'Jadual',Customer:'Pelanggan'},zh:{Area:'区域',Areas:'区域',Branch:'分店',Branches:'分店',BranchID:'分店编号',Trip:'趟次',Zone:'分区',Group:'组',Customer:'客户',Driver:'司机',Attendant:'跟车员',Route:'路线',ROUTE:'路线',Schedule:'排程',Buyer:'买家',Preview:'预览',Analyze:'分析',Confirm:'确认',metadata:'资料'}})){
  for(const key of Object.keys(messages[language]))if(/^(mobile|zone|areaRefinement|planner|optimization|schedule|hub|purchase)\./.test(key)){
    for(const [word,replacement]of Object.entries(replacements))messages[language][key]=messages[language][key].replace(new RegExp('\\b'+word+'\\b','g'),replacement)
  }
}

Object.assign(messages.en,{'nav.cashFloat':'Cash float'})
Object.assign(messages.ms,{'nav.cashFloat':'Wang runcit'})
Object.assign(messages.zh,{'nav.cashFloat':'备用金'})

Object.assign(messages.en,{"photo.cameraUnavailable": "Camera unavailable. Allow camera access in your browser, or use the phone camera button below.", "photo.systemCamera": "Use phone camera", "photo.cameraPreview": "Camera preview", "photo.opening": "Opening camera…", "photo.capture": "Capture photo", "photo.cancel": "Cancel camera", "photo.captureFailed": "Could not capture the photo. Try again or choose from gallery."})

Object.assign(messages.ms,{"photo.cameraUnavailable": "Kamera tidak tersedia. Benarkan akses kamera dalam pelayar, atau gunakan butang kamera telefon di bawah.", "photo.systemCamera": "Guna kamera telefon", "photo.cameraPreview": "Pratonton kamera", "photo.opening": "Membuka kamera…", "photo.capture": "Ambil gambar", "photo.cancel": "Batal kamera", "photo.captureFailed": "Gambar tidak dapat diambil. Cuba lagi atau pilih daripada galeri."})

Object.assign(messages.zh,{"photo.cameraUnavailable": "无法打开相机。请允许浏览器使用相机，或使用下方的手机相机按钮。", "photo.systemCamera": "使用手机相机", "photo.cameraPreview": "相机预览", "photo.opening": "正在打开相机…", "photo.capture": "拍摄照片", "photo.cancel": "取消拍照", "photo.captureFailed": "无法拍摄照片，请重试或从相册选择。"})

Object.assign(messages.en,{"photo.choosePdf": "Choose PDF file", "photo.removeFile": "Remove file", "photo.uploadFailed": "Upload failed. Try again.", "photo.readWeight": "Read weight from photo"})

Object.assign(messages.ms,{"photo.choosePdf": "Pilih fail PDF", "photo.removeFile": "Buang fail", "photo.uploadFailed": "Muat naik gagal. Cuba lagi.", "photo.readWeight": "Baca berat daripada gambar"})

Object.assign(messages.zh,{"photo.choosePdf": "选择 PDF 文件", "photo.removeFile": "删除文件", "photo.uploadFailed": "上传失败，请重试。", "photo.readWeight": "识别照片中的重量"})

Object.assign(messages.en,{"photo.preview": "Selected photo preview", "photo.confirmUpload": "Confirm and upload"})

Object.assign(messages.ms,{"photo.preview": "Pratonton gambar dipilih", "photo.confirmUpload": "Sahkan dan muat naik"})

Object.assign(messages.zh,{"photo.preview": "已选择的照片预览", "photo.confirmUpload": "确认并上传"})

Object.assign(messages.en,{"routeTrial.banner": "Trial 10–23 September: after starting a trip, use Up/Down to change the order of unvisited customers. Normal order restrictions resume on 24 September.", "routeTrial.up": "↑ Earlier", "routeTrial.down": "↓ Later", "routeTrial.orderSaved": "Today’s stop order updated.", "routeTrial.requestDate": "Request another date", "routeTrial.requestSent": "Request sent. Keep the original arrangement until the supervisor approves.", "routeTrial.pendingHelp": "The original stop remains until approval. This does not change the permanent schedule.", "routeTrial.pending": "Awaiting date approval", "routeTrial.approved": "Date change approved", "routeTrial.rejected": "Date change rejected", "routeTrial.reason": "Reason", "routeTrial.targetDate": "Requested date", "routeTrial.submit": "Submit request", "routeTrial.approvals": "Employee date-change requests", "routeTrial.targetRoute": "Route on the requested date", "routeTrial.approvalHelp": "Choose the target route. The target day must be generated and its vehicle assigned before approval.", "routeTrial.approvedHelp": "Date changed. Review the original and target routes and reapprove where needed before departure.", "routeTrial.reviewReason": "Enter the reason for this decision.", "routeTrial.ownToday": "You may only adjust your assigned customers for today.", "routeTrial.expired": "Free reordering is available only from 10 to 23 September 2026.", "routeTrial.startFirst": "Start the approved trip before changing its order.", "routeTrial.invalidDirection": "Choose Up or Down.", "routeTrial.stale": "The arrangement has changed or expired. Refresh and review it again.", "routeTrial.finishCurrent": "Finish the arrived customer or wait for the pending supervisor decision first.", "routeTrial.protected": "This stop has execution records or documents and cannot be changed here.", "routeTrial.dateReason": "Choose a valid future date and enter a reason of up to 1,000 characters.", "routeTrial.notFound": "Request not found.", "routeTrial.supervisorOnly": "Supervisor permission is required.", "routeTrial.targetNotReady": "Generate the target day first. Its vehicle must not have started or been released.", "routeTrial.chooseRoute": "Select a current route with an assigned vehicle on the target date.", "apiError.route_trial_banner": "Trial 10–23 September: after starting a trip, use Up/Down to change the order of unvisited customers. Normal order restrictions resume on 24 September.", "apiError.route_trial_up": "↑ Earlier", "apiError.route_trial_down": "↓ Later", "apiError.route_trial_ordersaved": "Today’s stop order updated.", "apiError.route_trial_requestdate": "Request another date", "apiError.route_trial_requestsent": "Request sent. Keep the original arrangement until the supervisor approves.", "apiError.route_trial_pendinghelp": "The original stop remains until approval. This does not change the permanent schedule.", "apiError.route_trial_pending": "Awaiting date approval", "apiError.route_trial_approved": "Date change approved", "apiError.route_trial_rejected": "Date change rejected", "apiError.route_trial_reason": "Reason", "apiError.route_trial_targetdate": "Requested date", "apiError.route_trial_submit": "Submit request", "apiError.route_trial_approvals": "Employee date-change requests", "apiError.route_trial_targetroute": "Route on the requested date", "apiError.route_trial_approvalhelp": "Choose the target route. The target day must be generated and its vehicle assigned before approval.", "apiError.route_trial_approvedhelp": "Date changed. Review the original and target routes and reapprove where needed before departure.", "apiError.route_trial_reviewreason": "Enter the reason for this decision.", "apiError.route_trial_owntoday": "You may only adjust your assigned customers for today.", "apiError.route_trial_expired": "Free reordering is available only from 10 to 23 September 2026.", "apiError.route_trial_startfirst": "Start the approved trip before changing its order.", "apiError.route_trial_invaliddirection": "Choose Up or Down.", "apiError.route_trial_stale": "The arrangement has changed or expired. Refresh and review it again.", "apiError.route_trial_finishcurrent": "Finish the arrived customer or wait for the pending supervisor decision first.", "apiError.route_trial_protected": "This stop has execution records or documents and cannot be changed here.", "apiError.route_trial_datereason": "Choose a valid future date and enter a reason of up to 1,000 characters.", "apiError.route_trial_notfound": "Request not found.", "apiError.route_trial_supervisoronly": "Supervisor permission is required.", "apiError.route_trial_targetnotready": "Generate the target day first. Its vehicle must not have started or been released.", "apiError.route_trial_chooseroute": "Select a current route with an assigned vehicle on the target date."})

Object.assign(messages.ms,{"routeTrial.banner": "Percubaan 10–23 September: selepas memulakan perjalanan, guna Naik/Turun untuk menyusun pelanggan yang belum dilawati. Sekatan biasa kembali pada 24 September.", "routeTrial.up": "↑ Naik", "routeTrial.down": "↓ Turun", "routeTrial.orderSaved": "Urutan hentian hari ini dikemas kini.", "routeTrial.requestDate": "Mohon tukar tarikh", "routeTrial.requestSent": "Permohonan dihantar. Kekalkan jadual asal sehingga penyelia meluluskan.", "routeTrial.pendingHelp": "Hentian asal kekal sehingga diluluskan. Jadual tetap tidak berubah.", "routeTrial.pending": "Menunggu kelulusan tarikh", "routeTrial.approved": "Pertukaran tarikh diluluskan", "routeTrial.rejected": "Pertukaran tarikh ditolak", "routeTrial.reason": "Sebab", "routeTrial.targetDate": "Tarikh dimohon", "routeTrial.submit": "Hantar permohonan", "routeTrial.approvals": "Permohonan tukar tarikh pekerja", "routeTrial.targetRoute": "Laluan pada tarikh dimohon", "routeTrial.approvalHelp": "Pilih laluan sasaran. Hari sasaran mesti dijana dan kenderaan ditetapkan sebelum kelulusan.", "routeTrial.approvedHelp": "Tarikh ditukar. Semak laluan asal dan sasaran, dan luluskan semula jika perlu sebelum bertolak.", "routeTrial.reviewReason": "Masukkan sebab keputusan ini.", "routeTrial.ownToday": "Anda hanya boleh melaras pelanggan yang ditugaskan kepada anda hari ini.", "routeTrial.expired": "Susunan bebas hanya tersedia dari 10 hingga 23 September 2026.", "routeTrial.startFirst": "Mulakan perjalanan yang diluluskan sebelum mengubah urutan.", "routeTrial.invalidDirection": "Pilih Naik atau Turun.", "routeTrial.stale": "Jadual telah berubah atau tamat. Muat semula dan semak lagi.", "routeTrial.finishCurrent": "Selesaikan pelanggan yang sedang dilawati atau tunggu keputusan penyelia dahulu.", "routeTrial.protected": "Hentian ini mempunyai rekod pelaksanaan atau dokumen dan tidak boleh diubah di sini.", "routeTrial.dateReason": "Pilih tarikh akan datang yang sah dan masukkan sebab sehingga 1,000 aksara.", "routeTrial.notFound": "Permohonan tidak ditemui.", "routeTrial.supervisorOnly": "Kebenaran penyelia diperlukan.", "routeTrial.targetNotReady": "Jana hari sasaran dahulu. Kenderaannya belum boleh bermula atau dilepaskan.", "routeTrial.chooseRoute": "Pilih laluan semasa dengan kenderaan yang ditetapkan pada tarikh sasaran.", "apiError.route_trial_banner": "Percubaan 10–23 September: selepas memulakan perjalanan, guna Naik/Turun untuk menyusun pelanggan yang belum dilawati. Sekatan biasa kembali pada 24 September.", "apiError.route_trial_up": "↑ Naik", "apiError.route_trial_down": "↓ Turun", "apiError.route_trial_ordersaved": "Urutan hentian hari ini dikemas kini.", "apiError.route_trial_requestdate": "Mohon tukar tarikh", "apiError.route_trial_requestsent": "Permohonan dihantar. Kekalkan jadual asal sehingga penyelia meluluskan.", "apiError.route_trial_pendinghelp": "Hentian asal kekal sehingga diluluskan. Jadual tetap tidak berubah.", "apiError.route_trial_pending": "Menunggu kelulusan tarikh", "apiError.route_trial_approved": "Pertukaran tarikh diluluskan", "apiError.route_trial_rejected": "Pertukaran tarikh ditolak", "apiError.route_trial_reason": "Sebab", "apiError.route_trial_targetdate": "Tarikh dimohon", "apiError.route_trial_submit": "Hantar permohonan", "apiError.route_trial_approvals": "Permohonan tukar tarikh pekerja", "apiError.route_trial_targetroute": "Laluan pada tarikh dimohon", "apiError.route_trial_approvalhelp": "Pilih laluan sasaran. Hari sasaran mesti dijana dan kenderaan ditetapkan sebelum kelulusan.", "apiError.route_trial_approvedhelp": "Tarikh ditukar. Semak laluan asal dan sasaran, dan luluskan semula jika perlu sebelum bertolak.", "apiError.route_trial_reviewreason": "Masukkan sebab keputusan ini.", "apiError.route_trial_owntoday": "Anda hanya boleh melaras pelanggan yang ditugaskan kepada anda hari ini.", "apiError.route_trial_expired": "Susunan bebas hanya tersedia dari 10 hingga 23 September 2026.", "apiError.route_trial_startfirst": "Mulakan perjalanan yang diluluskan sebelum mengubah urutan.", "apiError.route_trial_invaliddirection": "Pilih Naik atau Turun.", "apiError.route_trial_stale": "Jadual telah berubah atau tamat. Muat semula dan semak lagi.", "apiError.route_trial_finishcurrent": "Selesaikan pelanggan yang sedang dilawati atau tunggu keputusan penyelia dahulu.", "apiError.route_trial_protected": "Hentian ini mempunyai rekod pelaksanaan atau dokumen dan tidak boleh diubah di sini.", "apiError.route_trial_datereason": "Pilih tarikh akan datang yang sah dan masukkan sebab sehingga 1,000 aksara.", "apiError.route_trial_notfound": "Permohonan tidak ditemui.", "apiError.route_trial_supervisoronly": "Kebenaran penyelia diperlukan.", "apiError.route_trial_targetnotready": "Jana hari sasaran dahulu. Kenderaannya belum boleh bermula atau dilepaskan.", "apiError.route_trial_chooseroute": "Pilih laluan semasa dengan kenderaan yang ditetapkan pada tarikh sasaran."})

Object.assign(messages.zh,{"routeTrial.banner": "9月10日至23日试运行：开始趟次后，可用上下按钮调整本趟未到店客户的顺序。9月24日恢复正常限制。", "routeTrial.up": "↑ 提前", "routeTrial.down": "↓ 延后", "routeTrial.orderSaved": "已更新当天收货顺序。", "routeTrial.requestDate": "申请改期", "routeTrial.requestSent": "申请已提交。主管批准前仍按原安排执行。", "routeTrial.pendingHelp": "批准前保留原收货安排；此申请不改变固定收货排程。", "routeTrial.pending": "改期待批准", "routeTrial.approved": "改期已批准", "routeTrial.rejected": "改期已拒绝", "routeTrial.reason": "原因", "routeTrial.targetDate": "建议收货日期", "routeTrial.submit": "提交申请", "routeTrial.approvals": "员工改期申请", "routeTrial.targetRoute": "目标日期执行路线", "routeTrial.approvalHelp": "请选择目标路线；批准前需先生成目标日期并安排路线车辆。", "routeTrial.approvedHelp": "改期已生效。出车前请核对原日期和目标日期的路线，并完成需要的重新批准。", "routeTrial.reviewReason": "请填写批准或拒绝的原因。", "routeTrial.ownToday": "只能调整今天分配给自己车辆的客户。", "routeTrial.expired": "自由调整顺序仅在2026年9月10日至23日开放。", "routeTrial.startFirst": "请先开始已批准的趟次，再调整顺序。", "routeTrial.invalidDirection": "请选择提前或延后。", "routeTrial.stale": "安排已改变或日期已过，请刷新后重新核对。", "routeTrial.finishCurrent": "请先完成已到店客户，或等待主管处理待批准申请。", "routeTrial.protected": "此站点已有执行记录或单据，不能在这里调整。", "routeTrial.dateReason": "请选择有效的未来日期，并填写不超过1000字的原因。", "routeTrial.notFound": "找不到申请。", "routeTrial.supervisorOnly": "需要主管权限。", "routeTrial.targetNotReady": "请先建立目标日期；目标车辆不能已发布出车或开始执行。", "routeTrial.chooseRoute": "请选择目标日期已安排车辆的有效路线。", "apiError.route_trial_banner": "9月10日至23日试运行：开始趟次后，可用上下按钮调整本趟未到店客户的顺序。9月24日恢复正常限制。", "apiError.route_trial_up": "↑ 提前", "apiError.route_trial_down": "↓ 延后", "apiError.route_trial_ordersaved": "已更新当天收货顺序。", "apiError.route_trial_requestdate": "申请改期", "apiError.route_trial_requestsent": "申请已提交。主管批准前仍按原安排执行。", "apiError.route_trial_pendinghelp": "批准前保留原收货安排；此申请不改变固定收货排程。", "apiError.route_trial_pending": "改期待批准", "apiError.route_trial_approved": "改期已批准", "apiError.route_trial_rejected": "改期已拒绝", "apiError.route_trial_reason": "原因", "apiError.route_trial_targetdate": "建议收货日期", "apiError.route_trial_submit": "提交申请", "apiError.route_trial_approvals": "员工改期申请", "apiError.route_trial_targetroute": "目标日期执行路线", "apiError.route_trial_approvalhelp": "请选择目标路线；批准前需先生成目标日期并安排路线车辆。", "apiError.route_trial_approvedhelp": "改期已生效。出车前请核对原日期和目标日期的路线，并完成需要的重新批准。", "apiError.route_trial_reviewreason": "请填写批准或拒绝的原因。", "apiError.route_trial_owntoday": "只能调整今天分配给自己车辆的客户。", "apiError.route_trial_expired": "自由调整顺序仅在2026年9月10日至23日开放。", "apiError.route_trial_startfirst": "请先开始已批准的趟次，再调整顺序。", "apiError.route_trial_invaliddirection": "请选择提前或延后。", "apiError.route_trial_stale": "安排已改变或日期已过，请刷新后重新核对。", "apiError.route_trial_finishcurrent": "请先完成已到店客户，或等待主管处理待批准申请。", "apiError.route_trial_protected": "此站点已有执行记录或单据，不能在这里调整。", "apiError.route_trial_datereason": "请选择有效的未来日期，并填写不超过1000字的原因。", "apiError.route_trial_notfound": "找不到申请。", "apiError.route_trial_supervisoronly": "需要主管权限。", "apiError.route_trial_targetnotready": "请先建立目标日期；目标车辆不能已发布出车或开始执行。", "apiError.route_trial_chooseroute": "请选择目标日期已安排车辆的有效路线。"})

Object.assign(messages.en,{'list.horizontalScroll':'Drag left or right to view more columns'})
Object.assign(messages.ms,{'list.horizontalScroll':'Seret ke kiri atau kanan untuk melihat lajur lain'})
Object.assign(messages.zh,{'list.horizontalScroll':'左右拖动，查看其他栏目'})

Object.assign(messages.en,{"staff.current": "Current employees", "staff.departed": "Former employees", "staff.departureHelp": "Saving departure disables login immediately and revokes existing sessions. Historical records are retained.", "staff.createLogin": "Create a login account", "staff.codeDefault": "Leave blank to use employee code", "staff.accountRestricted": "Account changes require an authorized administrator.", "staff.disableLogin": "Disable login", "staff.enableLogin": "Enable login", "staff.ineligible": "This employee cannot log in in their current employment status.", "staff.passwordRequired": "Enter a temporary password of at least 8 characters.", "apiError.staff_account_ineligible": "Restore eligible employment status before enabling this account.", "staff.role.owner_admin": "Owner administrator", "staff.role.operations_admin": "Operations administrator", "staff.role.supervisor": "Supervisor", "staff.role.office": "Office", "staff.role.driver": "Driver", "staff.role.crew": "Crew", "staff.permission.employee_identity_sensitive": "View identity documents", "staff.permission.employee_payroll_sensitive": "View/export payroll data", "staff.permission.employee_sensitive_import": "Import sensitive employee data"})

Object.assign(messages.ms,{"staff.current": "Pekerja semasa", "staff.departed": "Bekas pekerja", "staff.departureHelp": "Menyimpan pemberhentian menyahaktifkan log masuk serta-merta dan membatalkan sesi sedia ada. Rekod sejarah dikekalkan.", "staff.createLogin": "Cipta akaun log masuk", "staff.codeDefault": "Biarkan kosong untuk menggunakan kod pekerja", "staff.accountRestricted": "Perubahan akaun memerlukan pentadbir yang diberi kuasa.", "staff.disableLogin": "Nyahaktifkan log masuk", "staff.enableLogin": "Aktifkan log masuk", "staff.ineligible": "Pekerja ini tidak boleh log masuk dengan status pekerjaan semasa.", "staff.passwordRequired": "Masukkan kata laluan sementara sekurang-kurangnya 8 aksara.", "apiError.staff_account_ineligible": "Pulihkan status pekerjaan yang layak sebelum mengaktifkan akaun ini.", "staff.role.owner_admin": "Pentadbir pemilik", "staff.role.operations_admin": "Pentadbir operasi", "staff.role.supervisor": "Penyelia", "staff.role.office": "Pejabat", "staff.role.driver": "Pemandu", "staff.role.crew": "Kru", "staff.permission.employee_identity_sensitive": "Lihat dokumen pengenalan", "staff.permission.employee_payroll_sensitive": "Lihat/eksport data gaji", "staff.permission.employee_sensitive_import": "Import data sulit pekerja"})

Object.assign(messages.zh,{"staff.current": "在职员工", "staff.departed": "离职员工", "staff.departureHelp": "保存离职后立即停用账号并使现有登录失效，历史记录继续保留。", "staff.createLogin": "同时建立登录账号", "staff.codeDefault": "留空则使用员工编号", "staff.accountRestricted": "账号修改需要有权限的管理员操作。", "staff.disableLogin": "停用登录", "staff.enableLogin": "启用登录", "staff.ineligible": "该员工目前的任职状态不允许登录。", "staff.passwordRequired": "请输入至少8个字符的临时密码。", "apiError.staff_account_ineligible": "请先办理重新入职，再启用账号。", "staff.role.owner_admin": "负责人管理员", "staff.role.operations_admin": "营运管理员", "staff.role.supervisor": "主管", "staff.role.office": "办公室", "staff.role.driver": "司机", "staff.role.crew": "跟车员", "staff.permission.employee_identity_sensitive": "查看身份证件", "staff.permission.employee_payroll_sensitive": "查看／导出薪资资料", "staff.permission.employee_sensitive_import": "导入员工敏感资料"})

Object.assign(messages.en,{'staff.saveFirst':'Save or discard the employee changes before editing the login account.'})
Object.assign(messages.ms,{'staff.saveFirst':'Simpan atau buang perubahan pekerja sebelum menyunting akaun log masuk.'})
Object.assign(messages.zh,{'staff.saveFirst':'请先保存或放弃员工资料的修改，再修改登录账号。'})

Object.assign(messages.en,{"expenseDetail.title": "Receipt details", "expenseDetail.required": "Vehicle expenses require vehicle, odometer, invoice number and merchant name. TIN and remarks are optional.", "expenseDetail.optional": "For Other, vehicle, odometer, TIN, remarks and additional description are optional. Amount, receipt photo, invoice number and merchant name are required.", "expenseDetail.vehicle": "Vehicle", "expenseDetail.selectVehicle": "Select vehicle", "expenseDetail.meter": "Odometer (km)", "expenseDetail.invoice": "Invoice / Reference Number", "expenseDetail.company": "Company Name", "expenseDetail.tin": "TIN Number", "expenseDetail.remarks": "Remarks", "expenseDetail.read": "Read receipt and fill blank fields", "expenseDetail.reading": "Reading receipt…", "expenseDetail.review": "Recognized values filled into blank fields only. Check every value before saving; enter unread details manually.", "expenseDetail.unreadable": "The receipt could not be read reliably. Keep the photo and enter the details manually.", "expenseDetail.unavailable": "Receipt recognition is unavailable on this server. You can still enter details and save the photo.", "expenseDetail.busy": "Another receipt is being read. Please try again shortly.", "apiError.expense_details_invalid": "All expenses require invoice number and merchant name. Vehicle expenses also require an active vehicle and valid odometer. Check the field lengths and values."})

Object.assign(messages.ms,{"expenseDetail.title": "Butiran resit", "expenseDetail.required": "Perbelanjaan kenderaan memerlukan kenderaan, bacaan meter, nombor invois dan nama peniaga. TIN dan catatan adalah pilihan.", "expenseDetail.optional": "Untuk Lain-lain, kenderaan, bacaan meter, TIN, catatan dan penerangan tambahan adalah pilihan. Amaun, gambar resit, nombor invois dan nama peniaga wajib.", "expenseDetail.vehicle": "Kenderaan", "expenseDetail.selectVehicle": "Pilih kenderaan", "expenseDetail.meter": "Bacaan meter (km)", "expenseDetail.invoice": "Nombor invois / rujukan", "expenseDetail.company": "Nama syarikat", "expenseDetail.tin": "Nombor TIN", "expenseDetail.remarks": "Catatan", "expenseDetail.read": "Baca resit dan isi medan kosong", "expenseDetail.reading": "Membaca resit…", "expenseDetail.review": "Nilai dikenal pasti hanya diisi ke medan kosong. Semak semua nilai sebelum menyimpan; isi butiran lain secara manual.", "expenseDetail.unreadable": "Resit tidak dapat dibaca dengan pasti. Simpan gambar dan isi butiran secara manual.", "expenseDetail.unavailable": "Pengecaman resit tidak tersedia pada pelayan ini. Anda masih boleh mengisi butiran dan menyimpan gambar.", "expenseDetail.busy": "Resit lain sedang dibaca. Sila cuba sebentar lagi.", "apiError.expense_details_invalid": "Semua perbelanjaan memerlukan nombor invois dan nama peniaga. Perbelanjaan kenderaan juga memerlukan kenderaan aktif dan bacaan meter sah. Semak panjang dan nilai medan."})

Object.assign(messages.zh,{"expenseDetail.title": "单据资料", "expenseDetail.required": "车辆费用必须填写车辆、公里数、发票号码和商家名称，TIN及备注选填。", "expenseDetail.optional": "选择其他费用时，车辆、公里数、TIN、备注及其他说明可留空；金额、单据照片、发票号码和商家公司名称必填。", "expenseDetail.vehicle": "车辆", "expenseDetail.selectVehicle": "请选择车辆", "expenseDetail.meter": "公里数（km）", "expenseDetail.invoice": "发票／参考号码", "expenseDetail.company": "商家公司名称", "expenseDetail.tin": "TIN税务编号", "expenseDetail.remarks": "备注", "expenseDetail.read": "识别单据并填入空白栏位", "expenseDetail.reading": "正在识别单据…", "expenseDetail.review": "已将识别结果填入空白栏位。请逐项核对后再保存，未识别的资料请手动填写。", "expenseDetail.unreadable": "无法可靠识别这张单据，照片已保留，请手动填写资料。", "expenseDetail.unavailable": "服务器暂时无法识别单据，仍可手动填写并保存照片。", "expenseDetail.busy": "系统正在识别另一张单据，请稍后再试。", "apiError.expense_details_invalid": "所有费用必须填写发票号码和商家公司名称；车辆费用还须填写有效车辆及公里数。请检查各栏位内容与长度。"})

Object.assign(messages.en,{"void.title": "Bill Void", "void.help": "Request a void for your own bill. A supervisor reviews it; original bills and photos remain available.", "void.refresh": "Refresh", "void.search": "Search bill number, customer, branch or employee", "void.filter": "Status", "void.all": "All bills", "void.pending": "Pending approval", "void.approved": "Approved void", "void.rejected": "Rejected", "void.issued": "Issued", "void.voided": "Voided", "void.Cash": "Cash", "void.Credit": "Credit", "void.loading": "Loading…", "void.empty": "No matching bills.", "void.saved": "Saved successfully.", "void.items": "View bill items", "void.proof": "View original payment proof", "void.reason": "Void reason (required)", "void.request": "Request void", "void.reviewNote": "Review note (required for rejection)", "void.approve": "Approve void", "void.reject": "Reject request", "void.confirm": "Void {number} ({amount})? Any recorded Cash Float deduction will be reversed once. Original documents remain.", "void.reversed": "Original Cash Float deduction reversed.", "void.noDeduction": "No recorded Cash Float deduction to reverse.", "void.replacementLinked": "Linked replacement record: {id}", "void.reissue": "Reissue / view replacement", "void.reissueHelp": "Check the items and current prices. A new bill number will be linked to the voided bill; the completed stop stays completed.", "void.weight": "Weight method", "void.on_site": "On site", "void.factory": "Factory", "void.estimated": "Estimated", "void.print": "Print", "void.no_print": "No print", "void.product": "Product", "void.quantity": "Quantity", "void.select": "Select product", "void.remove": "Remove item", "void.addItem": "Add item", "void.total": "Total", "void.newProof": "New payment proof (required for Cash). The original photo stays with the old bill.", "void.saveProof": "Save payment proof", "void.createNew": "Issue new bill number", "apiError.void_reason_required": "Enter a reason (1–2000 characters).", "apiError.void_state_conflict": "This bill/request has changed. Refresh and review its current status.", "apiError.void_ledger_conflict": "The original deduction does not match. Ask the office to review the Cash Float ledger.", "apiError.void_use_reissue": "Open Bill Void in More to reissue this bill.", "apiError.void_float_required": "Reactivate the original issuer’s Cash Float account before reissuing."})

Object.assign(messages.ms,{"void.title": "Pembatalan Bil", "void.help": "Mohon pembatalan bil sendiri untuk semakan penyelia. Bil asal dan gambar dikekalkan.", "void.refresh": "Muat semula", "void.search": "Cari nombor bil, pelanggan, cawangan atau pekerja", "void.filter": "Status", "void.all": "Semua bil", "void.pending": "Menunggu kelulusan", "void.approved": "Pembatalan diluluskan", "void.rejected": "Ditolak", "void.issued": "Dikeluarkan", "void.voided": "Dibatalkan", "void.Cash": "Tunai", "void.Credit": "Kredit", "void.loading": "Memuatkan…", "void.empty": "Tiada bil sepadan.", "void.saved": "Berjaya disimpan.", "void.items": "Lihat butiran bil", "void.proof": "Lihat bukti bayaran asal", "void.reason": "Sebab pembatalan (wajib)", "void.request": "Mohon pembatalan", "void.reviewNote": "Catatan semakan (wajib untuk penolakan)", "void.approve": "Luluskan pembatalan", "void.reject": "Tolak permohonan", "void.confirm": "Batalkan {number} ({amount})? Potongan wang apungan yang direkodkan akan dibalikkan sekali. Dokumen asal dikekalkan.", "void.reversed": "Potongan wang apungan asal telah dibalikkan.", "void.noDeduction": "Tiada potongan wang apungan direkodkan untuk dibalikkan.", "void.replacementLinked": "Rekod bil ganti: {id}", "void.reissue": "Keluarkan semula / lihat bil ganti", "void.reissueHelp": "Semak item dan harga semasa. Nombor bil baharu dipautkan kepada bil batal; hentian selesai kekal selesai.", "void.weight": "Kaedah timbang", "void.on_site": "Di lokasi", "void.factory": "Kilang", "void.estimated": "Anggaran", "void.print": "Cetak", "void.no_print": "Tidak cetak", "void.product": "Produk", "void.quantity": "Kuantiti", "void.select": "Pilih produk", "void.remove": "Buang item", "void.addItem": "Tambah item", "void.total": "Jumlah", "void.newProof": "Bukti bayaran baharu (wajib untuk tunai). Gambar asal kekal pada bil lama.", "void.saveProof": "Simpan bukti bayaran", "void.createNew": "Keluarkan nombor bil baharu", "apiError.void_reason_required": "Isi sebab (1–2000 aksara).", "apiError.void_state_conflict": "Bil/permohonan telah berubah. Muat semula dan semak status semasa.", "apiError.void_ledger_conflict": "Potongan asal tidak sepadan. Minta pejabat menyemak lejar wang apungan.", "apiError.void_use_reissue": "Buka Pembatalan Bil dalam Lagi untuk mengeluarkan semula bil ini.", "apiError.void_float_required": "Aktifkan semula akaun wang apungan pengeluar asal sebelum mengeluarkan semula bil."})

Object.assign(messages.zh,{"void.title": "单据作废", "void.help": "开错单可申请作废，由主管审核；原单与照片保留。", "void.refresh": "刷新", "void.search": "搜索单号、客户、分店或员工", "void.filter": "状态", "void.all": "全部单据", "void.pending": "待批准", "void.approved": "已批准作废", "void.rejected": "已拒绝", "void.issued": "已开单", "void.voided": "已作废", "void.Cash": "现金", "void.Credit": "赊账", "void.loading": "正在加载…", "void.empty": "没有符合条件的单据。", "void.saved": "已保存。", "void.items": "查看单据项目", "void.proof": "查看原付款照片", "void.reason": "作废原因（必填）", "void.request": "申请作废", "void.reviewNote": "审核备注（拒绝时必填）", "void.approve": "批准作废", "void.reject": "拒绝申请", "void.confirm": "确定作废 {number}（{amount}）？已记录的备用金扣款会冲回一次，原单保留。", "void.reversed": "原备用金扣款已冲回。", "void.noDeduction": "没有原备用金扣款需要冲回。", "void.replacementLinked": "关联重开记录：{id}", "void.reissue": "重新开单／查看重开单据", "void.reissueHelp": "请核对项目与当前价格。系统会使用新单号并关联原作废单；已完成站点保持完成。", "void.weight": "称重方式", "void.on_site": "现场称重", "void.factory": "工厂称重", "void.estimated": "估计重量", "void.print": "打印", "void.no_print": "不打印", "void.product": "货品", "void.quantity": "数量", "void.select": "选择货品", "void.remove": "删除项目", "void.addItem": "增加项目", "void.total": "总额", "void.newProof": "新单付款照片（现金必填）。原照片保留在旧单据。", "void.saveProof": "保存付款照片", "void.createNew": "确认重开新单号", "apiError.void_reason_required": "请填写原因（1至2000字）。", "apiError.void_state_conflict": "单据或申请状态已改变，请刷新后核对。", "apiError.void_ledger_conflict": "原扣款不一致，请办公室核对备用金流水。", "apiError.void_use_reissue": "请从「更多→单据作废」重新开单。", "apiError.void_float_required": "请先恢复原开单员工的备用金账户，再重新开单。"})

Object.assign(messages.en,{"dateReview.open": "Review / edit", "dateReview.date": "Approved collection date", "dateReview.sameDay": "Keep the original date to change only the route.", "dateReview.scope": "Apply change to", "dateReview.once": "Only this occurrence", "dateReview.permanent": "Future collections too", "dateReview.onceHelp": "Save this date and route as a Customer Schedule exception. The fixed schedule stays the same.", "dateReview.permanentHelp": "Replace the original collection weekday with the selected weekday, keeping other weekdays and frequency. Use the selected fixed route going forward. Synchronize generated future plans; preserve executed records.", "dateReview.planner": "Go to dispatch planner", "dateReview.reload": "Reload routes", "dateReview.loading": "Loading date / route availability…", "dateReview.unavailable": "Not ready", "dateReview.approve": "Approve changes", "dateReview.sunday": "Confirm Sunday collection", "dateReview.preserved": "These dates have protected records and were preserved; review in the planner:", "dateReview.history": "Date / route adjustments", "routeTrial.invalidReviewDate": "Choose a valid date on or after today.", "apiError.route_trial_invalidreviewdate": "Choose a valid date on or after today.", "routeTrial.invalidScope": "Choose only this occurrence or future collections.", "apiError.route_trial_invalidscope": "Choose only this occurrence or future collections.", "routeTrial.noChange": "Choose a different date or route.", "apiError.route_trial_nochange": "Choose a different date or route.", "routeTrial.scheduleReview": "Review this customer’s active fixed schedule in Customer Schedule before making a permanent change.", "apiError.route_trial_schedulereview": "Review this customer’s active fixed schedule in Customer Schedule before making a permanent change.", "routeTrial.weekdayConflict": "The original weekday is not in the fixed schedule, or the target weekday is already scheduled. Review weekdays and frequency in Customer Schedule first.", "apiError.route_trial_weekdayconflict": "The original weekday is not in the fixed schedule, or the target weekday is already scheduled. Review weekdays and frequency in Customer Schedule first."})

Object.assign(messages.ms,{"dateReview.open": "Semak / ubah", "dateReview.date": "Tarikh kutipan diluluskan", "dateReview.sameDay": "Kekalkan tarikh asal untuk menukar laluan sahaja.", "dateReview.scope": "Skop perubahan", "dateReview.once": "Kali ini sahaja", "dateReview.permanent": "Kutipan akan datang juga", "dateReview.onceHelp": "Simpan tarikh dan laluan ini sebagai pengecualian Jadual Pelanggan. Jadual tetap kekal.", "dateReview.permanentHelp": "Gantikan hari kutipan asal dengan hari dipilih; kekalkan hari lain dan kekerapan. Gunakan laluan tetap dipilih selepas ini. Selaraskan pelan akan datang yang dijana; kekalkan rekod pelaksanaan.", "dateReview.planner": "Buka perancang penghantaran", "dateReview.reload": "Muat semula laluan", "dateReview.loading": "Memuatkan tarikh / laluan…", "dateReview.unavailable": "Belum sedia", "dateReview.approve": "Luluskan perubahan", "dateReview.sunday": "Sahkan kutipan Ahad", "dateReview.preserved": "Tarikh ini mempunyai rekod dilindungi dan dikekalkan; semak dalam perancang:", "dateReview.history": "Pelarasan tarikh / laluan", "routeTrial.invalidReviewDate": "Pilih tarikh sah mulai hari ini.", "apiError.route_trial_invalidreviewdate": "Pilih tarikh sah mulai hari ini.", "routeTrial.invalidScope": "Pilih kali ini sahaja atau kutipan akan datang.", "apiError.route_trial_invalidscope": "Pilih kali ini sahaja atau kutipan akan datang.", "routeTrial.noChange": "Pilih tarikh atau laluan berbeza.", "apiError.route_trial_nochange": "Pilih tarikh atau laluan berbeza.", "routeTrial.scheduleReview": "Semak jadual tetap aktif pelanggan ini dalam Jadual Pelanggan sebelum perubahan kekal.", "apiError.route_trial_schedulereview": "Semak jadual tetap aktif pelanggan ini dalam Jadual Pelanggan sebelum perubahan kekal.", "routeTrial.weekdayConflict": "Hari asal tiada dalam jadual tetap atau hari sasaran sudah dijadualkan. Semak hari dan kekerapan dalam Jadual Pelanggan dahulu.", "apiError.route_trial_weekdayconflict": "Hari asal tiada dalam jadual tetap atau hari sasaran sudah dijadualkan. Semak hari dan kekerapan dalam Jadual Pelanggan dahulu."})

Object.assign(messages.zh,{"dateReview.open": "审核／修改", "dateReview.date": "调整后的收货日期", "dateReview.sameDay": "保留原日期即可只修改路线。", "dateReview.scope": "修改范围", "dateReview.once": "仅这一次", "dateReview.permanent": "以后都修改", "dateReview.onceHelp": "此次日期和路线作为 Customer Schedule 临时调整记录，固定收货排程保持原样。", "dateReview.permanentHelp": "将原收货星期改为所选日期的星期，保留其他收货星期及频率；以后固定使用所选路线。同步已生成的未来安排，保留执行记录。", "dateReview.planner": "前往派车安排", "dateReview.reload": "重新载入路线", "dateReview.loading": "正在读取日期和可用路线…", "dateReview.unavailable": "未准备好", "dateReview.approve": "批准修改", "dateReview.sunday": "确认安排星期日收货", "dateReview.preserved": "以下日期已有受保护记录，保留原安排，请在派车中核对：", "dateReview.history": "日期／路线调整记录", "routeTrial.invalidReviewDate": "请选择今天或以后的有效日期。", "apiError.route_trial_invalidreviewdate": "请选择今天或以后的有效日期。", "routeTrial.invalidScope": "请选择仅这一次或以后都修改。", "apiError.route_trial_invalidscope": "请选择仅这一次或以后都修改。", "routeTrial.noChange": "请选择不同的日期或路线。", "apiError.route_trial_nochange": "请选择不同的日期或路线。", "routeTrial.scheduleReview": "请先在 Customer Schedule 核对该客户的有效固定排程，再作永久修改。", "apiError.route_trial_schedulereview": "请先在 Customer Schedule 核对该客户的有效固定排程，再作永久修改。", "routeTrial.weekdayConflict": "原星期不在固定排程内，或目标星期已经有收货安排。请先在 Customer Schedule 核对收货星期和频率。", "apiError.route_trial_weekdayconflict": "原星期不在固定排程内，或目标星期已经有收货安排。请先在 Customer Schedule 核对收货星期和频率。"})

Object.assign(messages.en,{"dateReview.missingDay": "This target date has not been generated.", "dateReview.prepareDay": "Create this dispatch date"})

Object.assign(messages.ms,{"dateReview.missingDay": "Tarikh sasaran ini belum dijana.", "dateReview.prepareDay": "Jana tarikh penghantaran ini"})

Object.assign(messages.zh,{"dateReview.missingDay": "目标日期尚未生成派车安排。", "dateReview.prepareDay": "建立此日期的派车安排"})

Object.assign(messages.en,{"dateReview.reuseHelp": "If this customer is already scheduled on the selected date, reuse its unstarted scheduled stop and apply the selected route.", "routeTrial.existingProtected": "This customer already has a protected or separate arrangement on the target date. Check its execution, documents or pending requests in the planner first.", "apiError.route_trial_existingprotected": "This customer already has a protected or separate arrangement on the target date. Check its execution, documents or pending requests in the planner first."})

Object.assign(messages.ms,{"dateReview.reuseHelp": "Jika pelanggan ini sudah dijadualkan pada tarikh dipilih, gunakan hentian berjadual yang belum bermula dan tetapkan laluan dipilih.", "routeTrial.existingProtected": "Pelanggan ini mempunyai rekod dilindungi atau aturan berasingan pada tarikh sasaran. Semak pelaksanaan, dokumen atau permohonan tertunda dalam perancang dahulu.", "apiError.route_trial_existingprotected": "Pelanggan ini mempunyai rekod dilindungi atau aturan berasingan pada tarikh sasaran. Semak pelaksanaan, dokumen atau permohonan tertunda dalam perancang dahulu."})

Object.assign(messages.zh,{"dateReview.reuseHelp": "目标日期已有该客户的未执行固定排程时，沿用该记录并调整为所选路线，不重复新增。", "routeTrial.existingProtected": "该客户在目标日期已有受保护记录或独立安排。请先在派车中核对执行、单据或待批准申请。", "apiError.route_trial_existingprotected": "该客户在目标日期已有受保护记录或独立安排。请先在派车中核对执行、单据或待批准申请。"})

Object.assign(messages.en,{"dateReview.waitVehicle": "Awaiting vehicle", "dateReview.autoPlan": "Save the date and route directly. Missing dates are created automatically; vehicles and drivers can be assigned later.", "dateReview.changePlan": "Change date / route", "dateReview.awaitDeparture": "Awaiting departure approval", "dateReview.draftVisible": "You can view this assigned plan. Wait for departure approval before starting.", "routeTrial.chooseRoute": "Choose a current route. Vehicle assignment can follow later.", "routeTrial.supervisorOnly": "Office or management access is required.", "apiError.route_trial_chooseroute": "Choose a current route. Vehicle assignment can follow later.", "apiError.route_trial_supervisoronly": "Office or management access is required."})

Object.assign(messages.ms,{"dateReview.waitVehicle": "Menunggu kenderaan", "dateReview.autoPlan": "Simpan tarikh dan laluan terus. Tarikh yang belum ada dijana secara automatik; kenderaan dan pemandu boleh ditetapkan kemudian.", "dateReview.changePlan": "Ubah tarikh / laluan", "dateReview.awaitDeparture": "Menunggu kelulusan bertolak", "dateReview.draftVisible": "Anda boleh melihat pelan yang ditugaskan ini. Tunggu kelulusan bertolak sebelum bermula.", "routeTrial.chooseRoute": "Pilih laluan semasa. Kenderaan boleh ditetapkan kemudian.", "routeTrial.supervisorOnly": "Akses pejabat atau pengurusan diperlukan.", "apiError.route_trial_chooseroute": "Pilih laluan semasa. Kenderaan boleh ditetapkan kemudian.", "apiError.route_trial_supervisoronly": "Akses pejabat atau pengurusan diperlukan."})

Object.assign(messages.zh,{"dateReview.waitVehicle": "待配车", "dateReview.autoPlan": "直接保存日期和路线。未建立的日期会自动建立，车辆和司机可以之后安排。", "dateReview.changePlan": "修改日期／路线", "dateReview.awaitDeparture": "待出车批准", "dateReview.draftVisible": "可以先查看分配给你的行程，出车批准后才能开始执行。", "routeTrial.chooseRoute": "请选择有效路线，车辆可以稍后安排。", "routeTrial.supervisorOnly": "需要办公室或管理人员操作。", "apiError.route_trial_chooseroute": "请选择有效路线，车辆可以稍后安排。", "apiError.route_trial_supervisoronly": "需要办公室或管理人员操作。"})

Object.assign(messages.en,{"ng.title": "No Goods", "ng.help": "Submit a reason and proof to skip this stop. The next scheduled collection stays unchanged.", "ng.method": "Notification method", "ng.phone": "Phone call", "ng.whatsapp": "WhatsApp", "ng.sms": "SMS", "ng.onsite": "At the customer", "ng.reason": "Reason (required)", "ng.proof": "Proof (chat or call screenshot / photo)", "ng.submit": "Submit and skip", "ng.advance": "Customer notified before arrival", "ng.visited": "No goods after arrival", "ng.viewProof": "View proof", "ng.restoreReason": "Reason for restoring", "ng.restore": "Restore to today’s pending stops", "apiError.ng_access": "Only assigned employees or office / management can perform this action.", "apiError.ng_details": "Enter a reason and select how the customer notified you.", "apiError.ng_storage": "Proof storage is unavailable. Please retry.", "apiError.ng_today": "Only today’s stops can be updated.", "apiError.ng_protected": "This stop has ended or has a bill. Refresh the route.", "apiError.ng_running": "Another trip is running for this vehicle. Restore after that trip ends."})

Object.assign(messages.ms,{"ng.title": "Tiada barang", "ng.help": "Hantar sebab dan bukti untuk melangkau hentian ini. Jadual kutipan seterusnya tidak berubah.", "ng.method": "Cara pemberitahuan", "ng.phone": "Panggilan telefon", "ng.whatsapp": "WhatsApp", "ng.sms": "SMS", "ng.onsite": "Di premis pelanggan", "ng.reason": "Sebab (wajib)", "ng.proof": "Bukti (tangkapan skrin mesej atau panggilan / foto)", "ng.submit": "Hantar dan langkau", "ng.advance": "Pelanggan maklumkan sebelum tiba", "ng.visited": "Tiada barang selepas tiba", "ng.viewProof": "Lihat bukti", "ng.restoreReason": "Sebab memulihkan", "ng.restore": "Pulihkan ke hentian belum selesai hari ini", "apiError.ng_access": "Hanya pekerja yang ditugaskan atau pejabat / pengurusan boleh melakukan tindakan ini.", "apiError.ng_details": "Isi sebab dan pilih cara pelanggan memaklumkan.", "apiError.ng_storage": "Storan bukti tidak tersedia. Cuba lagi.", "apiError.ng_today": "Hanya hentian hari ini boleh dikemas kini.", "apiError.ng_protected": "Hentian sudah tamat atau mempunyai bil. Muat semula laluan.", "apiError.ng_running": "Perjalanan lain sedang berjalan untuk kenderaan ini. Pulihkan selepas perjalanan itu tamat."})

Object.assign(messages.zh,{"ng.title": "没有货", "ng.help": "填写说明并上传证明后跳过这一站，原本下次收货日期保持不变。", "ng.method": "通知方式", "ng.phone": "电话", "ng.whatsapp": "WhatsApp", "ng.sms": "短信", "ng.onsite": "已到店", "ng.reason": "说明（必填）", "ng.proof": "证明（聊天截图／通话记录截图／照片）", "ng.submit": "提交并跳过", "ng.advance": "提前通知无货", "ng.visited": "到店后无货", "ng.viewProof": "查看证明", "ng.restoreReason": "恢复原因", "ng.restore": "恢复到当天待收货", "apiError.ng_access": "仅分配到此车辆的员工或办公室、主管可以操作。", "apiError.ng_details": "请填写说明并选择通知方式。", "apiError.ng_storage": "证明暂时无法保存，请重试。", "apiError.ng_today": "只能修改当天的站点。", "apiError.ng_protected": "此站点已结束或已有单据，请刷新路线。", "apiError.ng_running": "这辆车另有行程正在执行，请在该行程结束后恢复。"})

Object.assign(messages.en,{"sales.title": "Sales", "sales.add": "＋ Record Sale", "sales.from": "From Date", "sales.to": "To Date", "sales.export": "Download Excel with Bills", "sales.blank": "Blank", "sales.photo": "Bill photo", "sales.view": "View photo", "sales.empty": "No sales found.", "sales.select": "Select", "sales.settlementDate": "Bill date", "sales.deliveryDate": "Delivery date", "sales.billNumber": "Bill number", "sales.buyerName": "Factory / Buyer", "sales.vehiclePlate": "Vehicle", "sales.slipNumber": "Weighbridge slip number", "sales.description": "Material", "sales.weightKg": "Bill weight (kg)", "sales.unitPrice": "Unit price (RM/kg)", "sales.amount": "Line amount (RM)", "sales.total": "Bill total (RM)", "sales.remarks": "Remarks", "sales.createdBy": "Entered by", "sales.rounding": "Rounding adjustment (RM)", "sales.line": "Item", "sales.remove": "Remove item", "sales.addLine": "＋ Add item", "sales.calculated": "Calculated total", "sales.mismatch": "— Does not match bill total", "sales.confirm": "I checked the photo, dates, vehicle, slip numbers, weights, prices and total.", "sales.cancel": "Cancel", "sales.save": "Save", "sales.retry": "Read photo again", "sales.reviewHelp": "Check every line against the photo. Missing or unclear values need your correction. The unit price may differ by line; this does not confirm payment received.", "sales.ocr.reading": "Reading bill…", "sales.ocr.review": "Recognized draft — check all fields before saving.", "sales.ocr.unreadable": "Some details could not be read. Check the photo and fill the missing fields.", "sales.ocr.unavailable": "Recognition is unavailable. You can fill the fields manually.", "sales.ocr.busy": "Recognition is busy. Please try again.", "apiError.sales_access": "Sales is restricted to office and management.", "apiError.sales_not_found": "Bill not found.", "apiError.sales_date": "Check delivery and bill dates.", "apiError.sales_review": "Confirm that you checked the photo.", "apiError.sales_master": "Choose an active factory and vehicle.", "apiError.sales_number": "Enter a bill number.", "apiError.sales_lines": "Check all line fields and duplicate slip numbers.", "apiError.sales_math": "Weight × price or total does not match.", "apiError.sales_duplicate": "This factory already has this bill number.", "apiError.sales_stale": "This record changed. Reopen it before editing.", "apiError.sales_storage": "Photo storage is unavailable."})

Object.assign(messages.ms,{"sales.title": "Jualan", "sales.add": "＋ Rekod jualan", "sales.from": "Tarikh mula", "sales.to": "Tarikh akhir", "sales.export": "Muat turun Excel dengan bil", "sales.blank": "Kosong", "sales.photo": "Foto bil", "sales.view": "Lihat foto", "sales.empty": "Tiada jualan dijumpai.", "sales.select": "Pilih", "sales.settlementDate": "Tarikh bil", "sales.deliveryDate": "Tarikh penghantaran", "sales.billNumber": "Nombor bil", "sales.buyerName": "Kilang / Pembeli", "sales.vehiclePlate": "Kenderaan", "sales.slipNumber": "Nombor tiket timbang", "sales.description": "Bahan", "sales.weightKg": "Berat bil (kg)", "sales.unitPrice": "Harga seunit (RM/kg)", "sales.amount": "Amaun item (RM)", "sales.total": "Jumlah bil (RM)", "sales.remarks": "Catatan", "sales.createdBy": "Dimasukkan oleh", "sales.rounding": "Pelarasan pembundaran (RM)", "sales.line": "Item", "sales.remove": "Buang item", "sales.addLine": "＋ Tambah item", "sales.calculated": "Jumlah dikira", "sales.mismatch": "— Tidak sepadan dengan jumlah bil", "sales.confirm": "Saya telah menyemak foto, tarikh, kenderaan, nombor tiket, berat, harga dan jumlah.", "sales.cancel": "Batal", "sales.save": "Simpan", "sales.retry": "Baca foto semula", "sales.reviewHelp": "Semak setiap item dengan foto. Betulkan nilai yang tiada atau tidak jelas. Harga setiap item boleh berbeza; ini bukan pengesahan penerimaan bayaran.", "sales.ocr.reading": "Sedang membaca bil…", "sales.ocr.review": "Draf dikenal pasti — semak semua medan sebelum menyimpan.", "sales.ocr.unreadable": "Sesetengah butiran tidak dapat dibaca. Semak foto dan isi medan yang tiada.", "sales.ocr.unavailable": "Pengecaman tidak tersedia. Anda boleh mengisi secara manual.", "sales.ocr.busy": "Pengecaman sibuk. Cuba lagi.", "apiError.sales_access": "Jualan terhad kepada pejabat dan pengurusan.", "apiError.sales_not_found": "Bil tidak dijumpai.", "apiError.sales_date": "Semak tarikh penghantaran dan bil.", "apiError.sales_review": "Sahkan foto telah disemak.", "apiError.sales_master": "Pilih kilang dan kenderaan aktif.", "apiError.sales_number": "Isi nombor bil.", "apiError.sales_lines": "Semak semua item dan nombor tiket berulang.", "apiError.sales_math": "Berat × harga atau jumlah tidak sepadan.", "apiError.sales_duplicate": "Kilang ini sudah mempunyai nombor bil ini.", "apiError.sales_stale": "Rekod telah berubah. Buka semula sebelum mengedit.", "apiError.sales_storage": "Storan foto tidak tersedia."})

Object.assign(messages.zh,{"sales.title": "卖货记录", "sales.add": "＋ 记录卖货", "sales.from": "开始日期", "sales.to": "结束日期", "sales.export": "下载Excel（含结算单）", "sales.blank": "空白", "sales.photo": "结算单照片", "sales.view": "查看照片", "sales.empty": "没有符合条件的卖货记录。", "sales.select": "请选择", "sales.settlementDate": "结算日期", "sales.deliveryDate": "送货日期", "sales.billNumber": "结算单号", "sales.buyerName": "工厂／买家", "sales.vehiclePlate": "车辆", "sales.slipNumber": "磅单号码", "sales.description": "货品", "sales.weightKg": "结算重量（kg）", "sales.unitPrice": "单价（RM/kg）", "sales.amount": "本行金额（RM）", "sales.total": "整单总额（RM）", "sales.remarks": "备注", "sales.createdBy": "录入人员", "sales.rounding": "尾数调整（RM）", "sales.line": "项目", "sales.remove": "删除本行", "sales.addLine": "＋ 增加一行", "sales.calculated": "计算总额", "sales.mismatch": "— 与结算单总额不一致", "sales.confirm": "我已核对照片、日期、车辆、磅单号码、重量、单价及总额。", "sales.cancel": "取消", "sales.save": "保存", "sales.retry": "重新识别照片", "sales.reviewHelp": "请逐行对照照片，补齐或修正不清楚的资料。每行可以使用不同单价；保存结算单不代表已经收到款项。", "sales.ocr.reading": "正在识别结算单…", "sales.ocr.review": "已填入识别草稿，请核对全部资料后保存。", "sales.ocr.unreadable": "部分资料未能识别，请对照照片补齐。", "sales.ocr.unavailable": "暂时无法识别，可以先手动填写。", "sales.ocr.busy": "识别服务正在使用，请稍后重试。", "apiError.sales_access": "仅办公室和管理人员可操作卖货记录。", "apiError.sales_not_found": "找不到结算单。", "apiError.sales_date": "请检查送货日期和结算日期。", "apiError.sales_review": "请勾选已核对照片。", "apiError.sales_master": "请选择有效工厂和车辆。", "apiError.sales_number": "请填写结算单号。", "apiError.sales_lines": "请检查每行资料，磅单号码不可重复。", "apiError.sales_math": "重量乘单价或整单总额不一致，请核对。", "apiError.sales_duplicate": "这间工厂已记录相同结算单号，请勿重复录入。", "apiError.sales_stale": "记录已被修改，请重新打开。", "apiError.sales_storage": "照片暂时无法保存。"})

Object.assign(messages.en,{"sales.rotated": "Photo automatically rotated for recognition.", "sales.factory.unmatched": "Factory text recognized but not matched to a current factory. Please select the correct factory.", "sales.factory.unreadable": "Factory name could not be read. Please select the factory."})

Object.assign(messages.ms,{"sales.rotated": "Foto diputarkan secara automatik untuk pengecaman.", "sales.factory.unmatched": "Nama kilang dibaca tetapi tidak sepadan dengan kilang semasa. Sila pilih kilang yang betul.", "sales.factory.unreadable": "Nama kilang tidak dapat dibaca. Sila pilih kilang."})

Object.assign(messages.zh,{"sales.rotated": "已自动转正照片进行识别。", "sales.factory.unmatched": "已读到工厂文字，但未匹配到现有工厂，请选择正确工厂。", "sales.factory.unreadable": "工厂名称未能识别，请选择工厂。"})

Object.assign(messages.en,{"menu.documents": "Documents", "menu.edit": "Arrange company menu", "menu.shared": "This order applies to everyone. Drag rows or use the arrows, then Save.", "menu.main": "Main menu", "menu.up": "Move up", "menu.down": "Move down", "menu.reset": "Restore default", "menu.unavailable": "Unavailable", "apiError.menu_owner_only": "Only the designated account can change the menu.", "apiError.menu_invalid": "Invalid menu layout.", "apiError.menu_stale": "The menu changed. Close and reopen the editor."})

Object.assign(messages.ms,{"menu.documents": "Dokumen", "menu.edit": "Susun menu syarikat", "menu.shared": "Susunan ini digunakan oleh semua pengguna. Seret baris atau gunakan anak panah, kemudian Simpan.", "menu.main": "Menu utama", "menu.up": "Naik", "menu.down": "Turun", "menu.reset": "Pulihkan asal", "menu.unavailable": "Tidak tersedia", "apiError.menu_owner_only": "Hanya akaun yang ditetapkan boleh mengubah menu.", "apiError.menu_invalid": "Susunan menu tidak sah.", "apiError.menu_stale": "Menu telah berubah. Tutup dan buka semula editor."})

Object.assign(messages.zh,{"menu.documents": "单据管理", "menu.edit": "调整公司菜单", "menu.shared": "全公司使用此顺序。拖动项目或用上下箭头调整，再保存。", "menu.main": "主菜单", "menu.up": "上移", "menu.down": "下移", "menu.reset": "恢复默认顺序", "menu.unavailable": "不可用", "apiError.menu_owner_only": "只有指定的本人帐号可以修改菜单。", "apiError.menu_invalid": "菜单排列无效。", "apiError.menu_stale": "菜单已更新，请关闭后重新打开编辑。"})

Object.assign(messages.en,{"cf.manage": "Manage Employees", "cf.alerts": "Enable Browser Alerts", "cf.export": "Download Excel", "cf.totalTitle": "Employee Total Spending", "cf.allPurchases": "Purchase bills", "cf.employeeExpense": "Employee Expense", "cf.voids": "Voided purchases", "cf.total": "Total spending", "cf.credit": "Included credit purchases", "cf.scope": "Excludes Admin Expense and top-ups. Voids adjust bills in the selected bill-date range; credit is not proof of payment.", "cf.today": "Today", "cf.opening": "Opening balance", "cf.topups": "Top-ups", "cf.purchases": "Cash purchases", "cf.expenses": "Employee expenses", "cf.other": "Opening entry / refunds / adjustments", "cf.balance": "Current balance", "cf.suggested": "Suggested top-up", "cf.topup": "Top Up", "cf.more": "More", "cf.target": "Target Float", "cf.threshold": "Low Balance Alert", "cf.addExpense": "Add Expense", "cf.settings": "Settings"})

Object.assign(messages.ms,{"cf.manage": "Urus pekerja", "cf.alerts": "Aktifkan notifikasi", "cf.export": "Muat turun Excel", "cf.totalTitle": "Jumlah perbelanjaan pekerja", "cf.allPurchases": "Bil pembelian", "cf.employeeExpense": "Perbelanjaan pekerja", "cf.voids": "Pembelian dibatalkan", "cf.total": "Jumlah perbelanjaan", "cf.credit": "Termasuk pembelian kredit", "cf.scope": "Tidak termasuk perbelanjaan admin dan tambah nilai. Pembatalan mengikut tarikh bil dipilih; kredit bukan bukti bayaran.", "cf.today": "Hari ini", "cf.opening": "Baki awal", "cf.topups": "Tambah nilai", "cf.purchases": "Pembelian tunai", "cf.expenses": "Perbelanjaan pekerja", "cf.other": "Baki permulaan / bayaran balik / pelarasan", "cf.balance": "Baki semasa", "cf.suggested": "Cadangan tambah nilai", "cf.topup": "Tambah nilai", "cf.more": "Lagi", "cf.target": "Sasaran wang runcit", "cf.threshold": "Amaran baki rendah", "cf.addExpense": "Tambah perbelanjaan", "cf.settings": "Tetapan"})

Object.assign(messages.zh,{"cf.manage": "管理员工", "cf.alerts": "启用浏览器提醒", "cf.export": "下载Excel", "cf.totalTitle": "员工总开销", "cf.allPurchases": "买货单总额", "cf.employeeExpense": "员工费用", "cf.voids": "已作废买货金额", "cf.total": "总开销", "cf.credit": "其中：赊账买货", "cf.scope": "不包含 Admin Expense 和备用金加款。作废按所选单据日期范围扣除；赊账不代表已付款。", "cf.today": "今天", "cf.opening": "今日开始余额", "cf.topups": "今日加款", "cf.purchases": "今日现金买货", "cf.expenses": "今日员工费用", "cf.other": "初始入账／退款／其他调整", "cf.balance": "当前余额", "cf.suggested": "建议加款", "cf.topup": "加款", "cf.more": "更多", "cf.target": "目标备用金", "cf.threshold": "低余额提醒金额", "cf.addExpense": "添加费用", "cf.settings": "设置"})

Object.assign(messages.en,{"cf.category.Fuel": "Fuel", "cf.category.Services": "Services", "cf.category.Repair": "Repair", "cf.category.Spare Parts": "Spare Parts", "cf.category.Road Tax": "Road Tax", "cf.category.Puspakom": "Puspakom", "cf.category.Insurance": "Insurance", "cf.category.Other": "Other"})

Object.assign(messages.ms,{"cf.category.Fuel": "Minyak", "cf.category.Services": "Servis", "cf.category.Repair": "Pembaikan", "cf.category.Spare Parts": "Alat ganti", "cf.category.Road Tax": "Cukai jalan", "cf.category.Puspakom": "Puspakom", "cf.category.Insurance": "Insurans", "cf.category.Other": "Lain-lain"})

Object.assign(messages.zh,{"cf.category.Fuel": "汽油", "cf.category.Services": "保养", "cf.category.Repair": "修理", "cf.category.Spare Parts": "零件", "cf.category.Road Tax": "路税", "cf.category.Puspakom": "Puspakom", "cf.category.Insurance": "保险", "cf.category.Other": "其他"})

Object.assign(messages.en,{"cf.totalTitle": "Employee Cash Spending", "cf.allPurchases": "Cash purchases", "cf.voids": "Voided cash purchases", "cf.total": "Total cash spending", "cf.scope": "Excludes credit purchases, Admin Expense and top-ups. Voids adjust cash bills in the selected bill-date range."})

Object.assign(messages.ms,{"cf.totalTitle": "Perbelanjaan tunai pekerja", "cf.allPurchases": "Pembelian tunai", "cf.voids": "Pembelian tunai dibatalkan", "cf.total": "Jumlah perbelanjaan tunai", "cf.scope": "Tidak termasuk pembelian kredit, perbelanjaan admin dan tambah nilai. Pembatalan mengikut tarikh bil tunai dipilih."})

Object.assign(messages.zh,{"cf.totalTitle": "员工现金总开销", "cf.allPurchases": "现金买货", "cf.voids": "已作废现金买货", "cf.total": "现金总开销", "cf.scope": "不包含赊账、Admin Expense 和备用金加款。作废按所选现金单据日期范围扣除。"})

Object.assign(messages.en,{"cf.dailyRecords": "Daily records", "cf.month": "Month", "cf.unlocked": "Daily totals remain editable through authorized late entries. Select a date to see its expense items below.", "cf.day": "Date", "cf.enteredAt": "Entered time", "apiError.cash_date_invalid": "Choose a valid expense date no later than today.", "apiError.cash_date_restricted": "Employees can submit expenses only for today. Ask the office to record a past date."})

Object.assign(messages.ms,{"cf.dailyRecords": "Rekod harian", "cf.month": "Bulan", "cf.unlocked": "Jumlah harian dikemas kini apabila pejabat memasukkan rekod lewat. Pilih tarikh untuk melihat butiran di bawah.", "cf.day": "Tarikh", "cf.enteredAt": "Masa direkodkan", "apiError.cash_date_invalid": "Pilih tarikh perbelanjaan yang sah sehingga hari ini.", "apiError.cash_date_restricted": "Pekerja hanya boleh menghantar perbelanjaan hari ini. Minta pejabat merekodkan tarikh lepas."})

Object.assign(messages.zh,{"cf.dailyRecords": "每日记录", "cf.month": "月份", "cf.unlocked": "每日汇总不锁账，办公室补录后会更新。点击日期，可在下方查看当天费用明细。", "cf.day": "日期", "cf.enteredAt": "实际录入时间", "apiError.cash_date_invalid": "请选择有效的费用日期，不能晚于今天。", "apiError.cash_date_restricted": "员工只能提交今天的费用，过去日期请由办公室补录。"})

Object.assign(messages.en,{"cf.downloadDaily": "Download daily records", "cf.pickDate": "Select a date"})

Object.assign(messages.ms,{"cf.downloadDaily": "Muat turun rekod harian", "cf.pickDate": "Pilih tarikh"})

Object.assign(messages.zh,{"cf.downloadDaily": "下载每日记录", "cf.pickDate": "选择日期"})

Object.assign(messages.en,{"cf.downloadLedger":"Download Cash Float Ledger"})
Object.assign(messages.ms,{"cf.downloadLedger":"Muat turun lejar wang runcit"})
Object.assign(messages.zh,{"cf.downloadLedger":"下载备用金流水账"})

Object.assign(messages.en,{"cf.ledger.title": "Cash Float Ledger", "cf.ledger.employee": "Employee", "cf.ledger.type": "Type", "cf.ledger.amount": "Amount", "cf.ledger.channel": "Channel", "cf.ledger.reference": "Reference / PO", "cf.ledger.description": "Description", "cf.ledger.by": "Entered By", "cf.ledger.proof": "Proof", "cf.ledger.Opening Balance": "Opening Balance", "cf.ledger.Top Up": "Top Up", "cf.ledger.Cash Purchase": "Cash Purchase", "cf.ledger.Expense": "Expense", "cf.ledger.Reversal": "Reversal", "cf.ledger.Adjustment": "Adjustment", "cf.ledger.Uploaded": "Uploaded", "cf.ledger.Missing": "Missing", "cf.ledger.Cash": "Cash", "cf.ledger.Bank Transfer": "Bank Transfer", "cf.ledger.System": "System"})

Object.assign(messages.ms,{"cf.ledger.title": "Lejar wang runcit", "cf.ledger.employee": "Pekerja", "cf.ledger.type": "Jenis", "cf.ledger.amount": "Amaun", "cf.ledger.channel": "Saluran", "cf.ledger.reference": "Rujukan / PO", "cf.ledger.description": "Keterangan", "cf.ledger.by": "Direkodkan oleh", "cf.ledger.proof": "Bukti", "cf.ledger.Opening Balance": "Baki awal", "cf.ledger.Top Up": "Tambah nilai", "cf.ledger.Cash Purchase": "Pembelian tunai", "cf.ledger.Expense": "Perbelanjaan", "cf.ledger.Reversal": "Pembalikan", "cf.ledger.Adjustment": "Pelarasan", "cf.ledger.Uploaded": "Dimuat naik", "cf.ledger.Missing": "Tiada", "cf.ledger.Cash": "Tunai", "cf.ledger.Bank Transfer": "Pindahan bank", "cf.ledger.System": "Sistem"})

Object.assign(messages.zh,{"cf.ledger.title": "备用金流水账", "cf.ledger.employee": "员工", "cf.ledger.type": "类型", "cf.ledger.amount": "金额", "cf.ledger.channel": "付款方式", "cf.ledger.reference": "参考号／买货单号", "cf.ledger.description": "说明", "cf.ledger.by": "录入人", "cf.ledger.proof": "凭证", "cf.ledger.Opening Balance": "初始余额", "cf.ledger.Top Up": "加款", "cf.ledger.Cash Purchase": "现金买货", "cf.ledger.Expense": "费用", "cf.ledger.Reversal": "冲销", "cf.ledger.Adjustment": "调整", "cf.ledger.Uploaded": "已上传", "cf.ledger.Missing": "未上传", "cf.ledger.Cash": "现金", "cf.ledger.Bank Transfer": "银行转账", "cf.ledger.System": "系统"})

Object.assign(messages.en,{'route.withdraw':'Withdraw this route approval'})
Object.assign(messages.ms,{'route.withdraw':'Tarik balik kelulusan laluan ini'})
Object.assign(messages.zh,{'route.withdraw':'撤回本区域批准'})

Object.assign(messages.en,{"intake.title": "Temporary customer collection", "intake.help": "Create a temporary customer, issue the bill, then send it for office review.", "intake.name": "Customer name", "intake.phone": "Phone (optional)", "intake.trip": "Today's running vehicle / trip", "intake.choose": "Select", "intake.noTrip": "Start your assigned trip in Today before collecting.", "intake.capture": "Get current GPS", "intake.checkMap": "Check the marker; drag it to correct the customer location.", "intake.poorGps": "GPS accuracy is poor. Try capturing again.", "intake.cash": "Cash collection. Enter the actual purchase price on this bill; existing customer prices are unchanged.", "intake.saving": "Saving…", "intake.start": "Confirm location and start billing", "intake.records": "My temporary collections", "intake.back": "Back", "intake.notified": "The bill has been sent for office review. Finish payment proof and collection.", "intake.arrive": "Confirm on-site GPS and open bill", "intake.complete": "Complete collection", "intake.cancelConfirm": "Cancel this unbilled temporary collection?", "intake.cancelDraft": "Cancel unbilled collection", "intake.map": "View GPS map", "intake.proofYes": "Payment proof saved", "intake.proofNo": "Payment proof pending", "intake.decision": "Customer decision", "intake.formalHelp": "The customer becomes available in Customer Management. Complete master details and prices there; add a schedule only if required.", "intake.search": "Search name, phone or branch code", "intake.find": "Search", "intake.target": "Existing customer branch", "intake.reason": "Review note (required)", "intake.save": "Confirm decision", "intake.reviewTitle": "Temporary customer review", "intake.history": "Reviewed records", "intake.empty": "No records.", "intake.draft": "Not billed", "intake.pending": "Pending review", "intake.formal": "Formal customer", "intake.one_time": "One-time customer", "intake.linked": "Link existing customer", "intake.cancelled": "Cancelled", "intake.price": "Actual unit price (RM)", "intake.voided": "Bill voided; awaiting reissue", "intake.gpsFailed": "Unable to obtain GPS. Check location permission and retry.", "apiError.intake_permission": "You do not have permission for this collection.", "apiError.intake_fields": "Enter a customer name and retry.", "apiError.intake_gps": "Select valid customer GPS coordinates.", "apiError.intake_trip": "Choose your own running trip for today.", "apiError.intake_price": "Enter a valid unit price with at most two decimal places.", "apiError.intake_state": "The record changed or cannot be processed. Refresh and check the bill.", "apiError.intake_review": "Choose a decision and enter a review note.", "apiError.intake_target": "Choose an active existing customer branch."})

Object.assign(messages.ms,{"intake.title": "Kutipan pelanggan sementara", "intake.help": "Daftar pelanggan sementara, keluarkan bil, kemudian hantar untuk semakan pejabat.", "intake.name": "Nama pelanggan", "intake.phone": "Telefon (pilihan)", "intake.trip": "Kenderaan / perjalanan yang sedang berjalan hari ini", "intake.choose": "Pilih", "intake.noTrip": "Mulakan perjalanan yang ditugaskan dalam Hari Ini sebelum mengutip.", "intake.capture": "Dapatkan GPS semasa", "intake.checkMap": "Semak penanda; seret untuk membetulkan lokasi pelanggan.", "intake.poorGps": "Ketepatan GPS rendah. Cuba dapatkan semula.", "intake.cash": "Kutipan tunai. Masukkan harga belian sebenar pada bil ini; harga pelanggan sedia ada kekal.", "intake.saving": "Menyimpan…", "intake.start": "Sahkan lokasi dan mula bil", "intake.records": "Kutipan sementara saya", "intake.back": "Kembali", "intake.notified": "Bil telah dihantar untuk semakan pejabat. Lengkapkan bukti bayaran dan kutipan.", "intake.arrive": "Sahkan GPS di lokasi dan buka bil", "intake.complete": "Selesaikan kutipan", "intake.cancelConfirm": "Batalkan kutipan sementara yang belum dibil ini?", "intake.cancelDraft": "Batalkan kutipan belum dibil", "intake.map": "Lihat peta GPS", "intake.proofYes": "Bukti bayaran disimpan", "intake.proofNo": "Bukti bayaran belum ada", "intake.decision": "Keputusan pelanggan", "intake.formalHelp": "Pelanggan tersedia dalam Pengurusan Pelanggan. Lengkapkan butiran dan harga; tambah jadual jika perlu.", "intake.search": "Cari nama, telefon atau kod cawangan", "intake.find": "Cari", "intake.target": "Cawangan pelanggan sedia ada", "intake.reason": "Catatan semakan (wajib)", "intake.save": "Sahkan keputusan", "intake.reviewTitle": "Semakan pelanggan sementara", "intake.history": "Rekod disemak", "intake.empty": "Tiada rekod.", "intake.draft": "Belum dibil", "intake.pending": "Menunggu semakan", "intake.formal": "Pelanggan tetap", "intake.one_time": "Pelanggan sekali sahaja", "intake.linked": "Paut pelanggan sedia ada", "intake.cancelled": "Dibatalkan", "intake.price": "Harga seunit sebenar (RM)", "intake.voided": "Bil dibatalkan; menunggu bil baharu", "intake.gpsFailed": "GPS tidak diperoleh. Semak kebenaran lokasi dan cuba lagi.", "apiError.intake_permission": "Anda tiada kebenaran untuk kutipan ini.", "apiError.intake_fields": "Masukkan nama pelanggan dan cuba lagi.", "apiError.intake_gps": "Pilih koordinat GPS pelanggan yang sah.", "apiError.intake_trip": "Pilih perjalanan anda yang sedang berjalan hari ini.", "apiError.intake_price": "Masukkan harga seunit sah dengan maksimum dua tempat perpuluhan.", "apiError.intake_state": "Rekod berubah atau tidak boleh diproses. Muat semula dan semak bil.", "apiError.intake_review": "Pilih keputusan dan masukkan catatan semakan.", "apiError.intake_target": "Pilih cawangan pelanggan sedia ada yang aktif."})

Object.assign(messages.zh,{"intake.title": "临时客户收货", "intake.help": "现场建立临时客户，开单后自动交主管审核。", "intake.name": "客户名字", "intake.phone": "电话（选填）", "intake.trip": "当天执行车辆／趟次", "intake.choose": "请选择", "intake.noTrip": "请先在今天页面开始执行已分配的行程。", "intake.capture": "获取当前位置", "intake.checkMap": "请核对地图上的客户位置，可拖动定位点修正。", "intake.poorGps": "GPS 精度较差，请重新定位。", "intake.cash": "按现金收货，在单据中填写本次实际收购价。", "intake.saving": "保存中…", "intake.start": "确认位置并开始开单", "intake.records": "我的临时收货记录", "intake.back": "返回", "intake.notified": "单据已交主管审核，请完成付款凭证及收货。", "intake.arrive": "确认现场 GPS 并开单", "intake.complete": "完成收货", "intake.cancelConfirm": "取消这次尚未开单的临时收货？", "intake.cancelDraft": "取消未开单收货", "intake.map": "查看 GPS 地图", "intake.proofYes": "付款凭证已保存", "intake.proofNo": "付款凭证待上传", "intake.decision": "客户归类", "intake.formalHelp": "转为正式客户后，在客户管理补齐资料及价格；需要固定收货时再设置排程。", "intake.search": "搜索名字、电话或分店编号", "intake.find": "搜索", "intake.target": "关联已有客户分店", "intake.reason": "审核备注（必填）", "intake.save": "确认归类", "intake.reviewTitle": "临时客户待审核", "intake.history": "已审核记录", "intake.empty": "暂无记录。", "intake.draft": "尚未开单", "intake.pending": "待主管审核", "intake.formal": "正式客户", "intake.one_time": "一次性客户", "intake.linked": "关联已有客户", "intake.cancelled": "已取消", "intake.price": "本次实际单价（RM）", "intake.voided": "单据已作废，待重新开单", "intake.gpsFailed": "无法获取 GPS，请检查定位权限后重试。", "apiError.intake_permission": "你没有操作这次收货的权限。", "apiError.intake_fields": "请填写客户名字后重试。", "apiError.intake_gps": "请取得有效的客户 GPS。", "apiError.intake_trip": "请选择自己当天正在执行的行程。", "apiError.intake_price": "请输入有效单价，最多两位小数。", "apiError.intake_state": "记录已变更或当前不能处理，请刷新并检查单据。", "apiError.intake_review": "请选择归类并填写审核备注。", "apiError.intake_target": "请选择有效的已有客户分店。"})
