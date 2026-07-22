# KCS Employee Master V1

## 管理员操作

进入“员工、车辆、地点与区域”→“Employee Master”。新增员工时Employee Code会自动产生；主管仍可修改，但系统会检查唯一。Job Role、兼任岗位、Employment Type与System Role分别维护。Default Base只列出Active的Company Yard或Employee Base；Usual/Familiar Areas仅作建议，不限制每日派车。

修改姓名、编号、岗位、雇佣、IC、银行、EPF或SOCSO时必须填写原因。Inactive、Resigned、Terminated或Suspended不会物理删除员工，而会停用账号、撤销Session并从派车选择器移除。

重新入职时打开原Employee并按“重新入职”。系统新增Employment Period，不修改旧Period；Employee ID、GPS、Dispatch及历史关联保持不变。重新启用原账号是独立确认动作，System Role不会因Job Role改变。

Employee Directory支持姓名、Employee Code、电话及IC后四位搜索，并可按Employment Status、Job Role、Employment Type和Account Status筛选。点击一行才会打开独立详情Drawer；关闭后保留原筛选和列表位置。详情加载期间禁止保存，读取失败不会显示上一位员工资料。

Active员工通过“办理离职”填写Last Working Day、Employment End Date、Leaving Reason及Resigned / Terminated / Contract End。系统关闭当前Period、停用账号并移出派车选择器。已离职员工通过“重新入职”建立Period 2、Period 3等新记录，旧Period不会被更新。

所有Employee详情保存、离职及重新入职请求必须同时携带Employee ID。服务端核对URL Employee ID与payload Employee ID，不一致时返回409并拒绝写入。

## 敏感资料权限

普通页面和普通导出只显示遮罩IC、银行、EPF及SOCSO。Admin可在账号区域明确授权：

- `employee_identity_sensitive`：查看IC完整号码及上传/下载IC照片。
- `employee_payroll_sensitive`：查看银行、EPF、SOCSO及执行敏感薪资导出。
- `employee_sensitive_import`：导入包含Employee敏感栏位的Excel/CSV。

每次查看、修改、下载、替换或敏感导出都会写入审计。API与错误信息不返回密码、密码哈希、Session、安全密钥或证件文件内容。附件使用随机文件名，下载必须经过Session和权限检查。

## 导入导出

下载XLSX或CSV模板，填好后先按“导入预览”。确认New、Update、Unchanged和Error；存在Error时不能提交，可先导出错误报告。Employee Code是幂等upsert键。普通导出只输出遮罩敏感号码；遮罩值重新导入时不会清空原号码。EPF和SOCSO允许留空。

## 数据库变更

Schema v16扩展`employees`并增加：`employee_familiar_areas`、`employee_change_history`、`employee_employment_history`、`employee_documents`、`employee_sensitive_access_logs`及`auth_account_permissions`。Dispatch、Assistant及GPS采集保存当时Employment Period ID，旧记录不变。

## 备份与恢复

备份必须同时包含SQLite数据库与`data/uploads/`。因为备份包含身份证及银行资料，生产备份必须使用加密归档或受密码保护的备份系统，限制Admin/HR访问，并定期执行恢复演练。不得将数据库、附件、Excel、`.env`或备份文件提交到GitHub。
