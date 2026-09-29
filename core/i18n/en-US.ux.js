/**
 * 文件：core/i18n/en-US.ux.js
 * 层：核心基础设施层（国际化 · 英文词条 · 体验保障模块）
 * 职责：登记体验保障模块中文文案对应的英文词条（偏好与安全四个页签、偏好项与
 *      选项、备份导出导入、完整性检查、工作台）。
 * 依赖：core/i18n/i18n.js
 *
 * 说明：
 *   · 键名统一前缀 —— pref.（偏好项）/ backup.（备份）/ integrity.（完整性）/
 *     ux.（本模块视图与通用）/ dash.（工作台）。
 *   · 偏好项的**存储 key 与取值**（theme、fontSize、light、dark、normal…）不翻译，
 *     这里登记的只是它们的显示名。
 *   · 工作台已有一批 dash.* 词条登记在 core/i18n/en-US.js，此处只补缺口。
 */
(function (PHR) {
  'use strict';

  if (!PHR.i18n) { return; }

  PHR.i18n.register('en-US', {

    'module.ux.title': 'Preferences & Safety',
    'module.ux.desc': 'Appearance, alerts, security, data integrity, backups and help.',

    /* ---------- 偏好设置内部警告 ---------- */
    'ux.pref.warn.unknown': 'Unknown preference: {key}',
    'ux.pref.warn.invalid': 'Invalid preference value: {key} = {value}',
    'ux.integrity.warn.fixFail': 'Repair failed: {key}',

    /* ---------- 工作台数据聚合失败兜底 ---------- */
    'dash.warn.insightAggregate': 'Health insight aggregation failed',
    'dash.warn.consentAggregate': 'Consent data aggregation failed',
    'dash.warn.auditAggregate': 'Audit data aggregation failed',

    /* ================================================================== *
     * 一、偏好与安全 · 页头与四个页签（modules/ux/ux.view.js）
     * ================================================================== */
    'ux.settings.headTitle': 'Preferences & safety',
    'ux.settings.headDesc': 'Make the interface comfortable to read and your account and data safe to rely on — these settings decide whether your health record stays usable over the long run.',

    'ux.tab.appearance': 'Appearance & accessibility',
    'ux.tab.alerts': 'Alerts',
    'ux.tab.security': 'Security',
    'ux.tab.data': 'Data & storage',

    'ux.appearance.sub': 'Changes apply immediately and are saved locally',
    'ux.appearance.whyTitle': 'Why these options matter',
    'ux.appearance.whyBody': 'Text size and contrast decide whether someone with low vision can read key numbers such as blood pressure and glucose, and "reduced motion" prevents dizziness from page transitions in people who are sensitive to movement. These are basic accessibility requirements, not a cosmetic theme.',

    'ux.alerts.sub': 'Decide which changes are worth interrupting you for',
    'ux.alerts.noteTitle': 'Fewer alerts mean less noise, but early changes may slip through.',
    'ux.alerts.noteBody': 'If you have just been diagnosed or your medication is being adjusted, choose "All alerts". If your readings are stable and you do not want frequent interruptions, choose "Critical only".',

    /* ---------- 通用小文案 ---------- */
    'ux.pref.unsupported': 'That value is not supported',
    'ux.pref.updated': 'Updated {name}',
    'ux.pref.switchOn': 'On',
    'ux.recheck': '↻ Re-run check',
    'ux.rechecked': 'Check re-run',
    'ux.listSep': ', ',
    'ux.listSemi': '; ',

    /* ================================================================== *
     * 二、偏好设置项（modules/ux/preference.js）
     *    label / label2 / hint / opt.<取值> —— 取值本身不翻译，只翻显示名
     * ================================================================== */
    'pref.theme.label': 'Theme',
    'pref.theme.opt.light': 'Light',
    'pref.theme.opt.dark': 'Dark',
    'pref.theme.opt.auto': 'Follow system',
    'pref.theme.hint': 'Follow system tracks your OS light / dark setting in real time.',

    'pref.fontSize.label': 'Text size',
    'pref.fontSize.opt.normal': 'Standard',
    'pref.fontSize.opt.large': 'Large',
    'pref.fontSize.opt.xlarge': 'Extra large',
    'pref.fontSize.hint': 'Also enlarges body text, tables and chart axes. Choose a larger size if you read from a distance or have reduced vision.',

    'pref.density.label': 'Information density',
    'pref.density.opt.comfortable': 'Comfortable',
    'pref.density.opt.compact': 'Compact',
    'pref.density.hint': 'Compact tightens row height and spacing so more records fit on one screen — useful for browsing long lists.',

    'pref.contrast.label': 'Contrast',
    'pref.contrast.opt.normal': 'Standard',
    'pref.contrast.opt.high': 'High contrast',
    'pref.contrast.hint': 'High contrast darkens borders and secondary text, which is easier to read with low vision or in bright light.',

    'pref.motion.label': 'Animation',
    'pref.motion.opt.normal': 'Standard',
    'pref.motion.opt.reduced': 'Reduced motion',
    'pref.motion.hint': 'Reduced motion turns off page, chart and dialog transitions — it helps if animation makes you dizzy.',

    'pref.homeView.label': 'Landing page after sign-in',
    'pref.homeView.hint': 'The page opened automatically once you sign in. The options are the views currently registered in the system.',

    'pref.alertThreshold.label': 'Alert sensitivity',
    'pref.alertThreshold.opt.ok': 'All alerts',
    'pref.alertThreshold.opt.warning': 'Warning and above',
    'pref.alertThreshold.opt.critical': 'Critical only',
    'pref.alertThreshold.hint': 'Sets the level at which Health Insight notifies you — All alerts is the most detailed, Critical only the quietest.',

    'pref.weeklyReport.label': 'Weekly health summary',
    'pref.weeklyReport.label2': 'Show last week\'s changes and advice as an in-app notice the first time you open the site each week.',

    /* ---------- 偏好取值的通用显示名与审计文案 ---------- */
    'pref.value.on': 'On',
    'pref.value.off': 'Off',
    'pref.audit.changed': 'Changed {label}: {from} → {to}',
    'pref.audit.resetAll': 'Restored all preferences to defaults',
    'pref.auditTarget': 'Preferences',

    /* ================================================================== *
     * 三、安全设置页（ux.view.js 的 1.3）
     * ================================================================== */
    'ux.security.badgeOk': 'Met',
    'ux.security.badgeTodo': 'Could improve',
    'ux.security.cardTitle': 'Security check-up',
    'ux.security.passed': '{passed} of {total} passed',
    'ux.security.footHint': 'Three common security actions',
    'ux.security.changePwd': '🔑 Change password',
    'ux.security.mfaOn': '🔓 Two-factor settings',
    'ux.security.mfaOff': '🔒 Turn on two-factor',
    'ux.security.timeout': '⏱ Session timeout',
    'ux.security.scoreLabel': 'Security score',

    /* ---------- 修改密码 ---------- */
    'ux.pwd.changeTitle': 'Change password',
    'ux.pwd.current': 'Current password',
    'ux.pwd.new': 'New password',
    'ux.pwd.confirmNew': 'Confirm new password',
    'ux.pwd.policyHint': 'At least {n} characters, with both letters and digits.',
    'ux.pwd.needOld': 'Enter your current password',
    'ux.pwd.newMismatch': 'The two new passwords do not match',
    'ux.pwd.changed': 'Password changed — use the new one next time you sign in',
    'ux.pwd.failed': 'Could not change the password',
    'ux.pwd.authMissing': 'Account security module not loaded',
    'ux.pwd.authMissingBody': 'You cannot change your password here right now. Check that the scripts under modules/auth are loaded.',

    /* ---------- 多因素认证 ---------- */
    'ux.mfa.title': 'Two-factor authentication',
    'ux.mfa.noticeTitle': 'Two-factor authentication asks for one extra check at sign-in',
    'ux.mfa.noticeBody': 'Even if someone learns your password, they cannot sign in without your phone or your face.',
    'ux.mfa.switch': 'Require a second check at sign-in',
    'ux.mfa.factors': 'Allowed second factors',
    'ux.mfa.factorsHint': 'Keep at least one, otherwise sign-in cannot complete the second check.',
    'ux.mfa.pickOne': 'Choose at least one second factor',
    'ux.mfa.notSaved': 'Account security module not loaded — settings were not saved',
    'ux.mfa.on': 'Two-factor authentication turned on',
    'ux.mfa.off': 'Two-factor authentication turned off',

    /* ---------- 登录保持（取代了原来的"会话超时"） ---------- */
    'ux.remember.title': 'Staying signed in',
    'ux.remember.noticeTitle': 'How long should sign-in last?',
    'ux.remember.noticeBody': 'When on, your sign-in is kept on this computer and you will not have to type your password again for {n} days, even after closing the browser. When off, it lasts only until you close the tab.',
    'ux.remember.label': 'Stay signed in for 7 days',
    'ux.remember.hint': 'Turn this off on a shared computer. Suspicious access is still reported and every action is still recorded.',
    'ux.remember.on': 'On: signed in automatically for {n} days',
    'ux.remember.off': 'Off: you will sign in again after closing the browser',

    /* ================================================================== *
     * 四、数据与存储页（ux.view.js 的 1.4）
     * ================================================================== */
    'ux.data.storageUsage': 'Storage used',
    'ux.data.storageBackend': 'Storage backend',
    'ux.data.backendLocal': 'Local storage',
    'ux.data.memory': 'Memory',
    'ux.data.persistent': 'Data survives across sessions',
    'ux.data.volatile': 'Lost when the page closes',
    'ux.data.recordsLabel': 'Health records',
    'ux.data.unitRecords': 'records',
    'ux.data.recordsSub': 'Across all 14 record types',
    'ux.data.consentsLabel': 'Active consents',
    'ux.data.unitConsents': 'consents',
    'ux.data.consentsSub': 'Consents a doctor can currently use',
    'ux.data.fileCardTitle': 'Database file',
    'ux.data.fileCardSub': 'The database lives in this file — you can open it, copy it or back it up',
    'ux.data.fileSaved': 'Saved · {t} · revision {n}',
    'ux.data.fileUnsaved': 'Not written to the file yet',
    'ux.data.fileOffline': 'Connection lost — changes exist only in this page',
    'ux.data.saveNow': '💾 Save now',
    'ux.data.savedNow': 'Written to the database file',
    'ux.data.notFileMode': 'Not in database-file mode — data is already written straight to storage.',
    'ux.data.saveFailed': 'Could not write the file — is the local server still running?',
    'ux.data.fileEditHint': 'Changes are normally written automatically; press "Save now" if the status above says otherwise. After editing this file in Notepad, reload the page — otherwise the next save from the interface will overwrite your edit.',
    'ux.data.offlineTitle': 'Lost the connection to the local database',
    'ux.data.offlineDetail': 'Your changes are held in this page\'s memory only, so do not close the page yet; export a backup from "Data and storage" if you need to keep them. ({err})',
    'ux.data.offlineUnknown': 'reason unknown',
    'ux.data.conflictTitle': 'Another tab changed the data too',
    'ux.data.conflictDetail': 'This tab\'s changes were written and overwrote the other version. Please use the system in one tab at a time.',

    'ux.backup.cardTitle': 'Backup & restore',
    'ux.backup.cardSub': 'Export files stay on your own computer; nothing is ever uploaded',
    'ux.backup.exportPlain': '📤 Export backup (plain JSON)',
    'ux.backup.exportEnc': '🔒 Export backup (password-encrypted)',
    'ux.backup.import': '📥 Import backup',
    'ux.backup.resetDemo': '♻️ Restore sample data',
    'ux.backup.clearAll': '🗑️ Delete all data',
    'ux.backup.dangerHint': 'The last two buttons overwrite everything locally. Export a backup first.',

    /* ---------- 导出 / 导入过程提示 ---------- */
    'ux.export.failed': 'Export failed',
    'ux.export.done': 'Backup exported',
    'ux.export.detail': '{file} — {n} records.',
    'ux.export.encTitle': 'Encrypted export',
    'ux.export.encMessage': 'The password encrypts the whole backup file. Keep it safe — without it the backup cannot be recovered.',

    'ux.pwd.backupTitle': 'Enter the backup password',
    'ux.pwd.backupMessage': 'This backup was password-encrypted when it was exported. Enter the password you set then.',
    'ux.pwd.label': 'Password',
    'ux.pwd.confirmLabel': 'Confirm password',
    'ux.pwd.minHint': 'At least {n} characters. If you forget it, this backup cannot be recovered.',
    'ux.pwd.tooShort': 'Password must be at least {n} characters',
    'ux.pwd.mismatch': 'The two passwords do not match',

    'ux.import.failed': 'Import failed',
    'ux.import.checkFailed': 'Validation failed',
    'ux.import.fileInvalid': 'The backup file did not pass validation',
    'ux.import.pickTitle': 'Choose how to import',
    'ux.import.fileLabel': 'File',
    'ux.import.verified': 'verified:',
    'ux.import.exportedAt': 'Exported',
    'ux.import.sourceVersion': 'Source version',
    'ux.import.scale': 'Contents',
    'ux.import.scaleValue': '{records} records / {collections} collections',
    'ux.import.encryptedLabel': 'Encrypted',
    'ux.import.encryptedYes': 'Yes (decrypted)',
    'ux.import.encryptedNo': 'No',
    'ux.import.warningsTitle': 'Please note',
    'ux.import.modeExplain': 'Merge keeps existing records and overwrites entries with the same id, adding the rest. Replace clears all local data first. Both roll back automatically if a write fails.',
    'ux.import.merge': 'Merge',
    'ux.import.replace': 'Replace',
    'ux.import.done': 'Import complete',
    'ux.import.doneDetail': '{n} records written.',
    'ux.import.doneDetailSkip': '{n} records written, {k} invalid rows skipped.',

    'ux.overwrite.title': 'Replace import',
    'ux.overwrite.message': 'Replace deletes all local health data first, then writes the contents of the backup file.',
    'ux.overwrite.detail': 'An in-memory snapshot is taken first, so a failure mid-write rolls everything back.',
    'ux.overwrite.confirm': 'Continue and replace',
    'ux.overwrite.requireText': 'overwrite',

    'ux.resetDemo.title': 'Restore sample data',
    'ux.resetDemo.message': 'This clears local data and restores a set of sample health records.',
    'ux.resetDemo.detail': 'This cannot be undone. Export a backup first.',
    'ux.resetDemo.fileDetail': 'Started by the "reset database" launcher: the records, posts and accounts you added are cleared, and the built-in sample data (the demo patient\'s records, the seeded community posts) is written back. This cannot be undone.',
    'ux.resetDemo.confirm': 'Restore sample data',
    'ux.resetDemo.requireText': 'restore',
    'ux.resetDemo.cancelled': 'Cancelled — your data is unchanged',
    'ux.resetDemo.done': 'Sample data restored',
    'ux.resetDemo.flushed': 'Written to data/database.json',

    'ux.clearAll.title': 'Delete all data',
    'ux.clearAll.message': 'This deletes the accounts, health records, doctor consents, community posts and access logs stored locally.',
    'ux.clearAll.detail': 'Deletion cannot be undone. The page reloads once you confirm.',
    'ux.clearAll.confirm': 'Delete everything',
    'ux.clearAll.requireText': 'delete',
    'ux.clearAll.done': 'All local data deleted',

    /* ================================================================== *
     * 五、完整性自检的界面文案（ux.view.js 的 1.4 下半页）
     * ================================================================== */
    'ux.integrity.cardTitle': 'Data integrity check',
    'ux.integrity.cardSub': 'Nine rules scan for orphans, missing fields, out-of-range dates and broken references',
    'ux.integrity.samples': 'Samples: ',
    'ux.integrity.whyLabel': 'Why this is checked: ',
    'ux.integrity.count': '{n} issues',
    'ux.integrity.fixable': 'Auto-fixable',
    'ux.integrity.scoreNotice': 'Integrity score {score} ({at})',
    'ux.integrity.found': 'Found {kinds} problem type(s), {n} issues in total — see the list below.',
    'ux.integrity.clean': 'No problems found — your data structure is intact.',
    'ux.integrity.repairBtn': '🛠 Fix auto-fixable problems',
    'ux.integrity.note': 'The check only reads your data and changes nothing. Fixes are listed in a dialog first and run only after you confirm.',

    'ux.repair.title': 'Confirm repairs',
    'ux.repair.intro': 'The system will perform these repairs:',
    'ux.repair.itemCount': '{n} records',
    'ux.repair.noteTitle': 'Please confirm before repairing',
    'ux.repair.noteBody': 'Actions such as deleting records cannot be undone. Export a backup from Data & storage before you continue.',
    'ux.repair.noPlan': 'Nothing can be fixed automatically',
    'ux.repair.confirmLabel': 'Run repairs',
    'ux.repair.done': 'Repairs complete',

    /* ================================================================== *
     * 六、使用帮助页的外壳文案（modules/ux/help.js 的正文另见 help.* 词条）
     * ================================================================== */
    'ux.help.desc': 'Plain-language instructions: {sections} sections, {articles} articles, {faqs} Q&As — where each module is, what to click, and why it is designed that way.',
    'ux.help.searchAria': 'Search help content',
    'ux.help.searchPlaceholder': 'Search help, e.g. "forgot password", "consent scope", "new computer", "trend chart"…',
    'ux.help.tocAria': 'Help contents',
    'ux.help.noResult': 'No matching content',
    'ux.help.noResultHint': 'Try another keyword, such as "password", "consent", "backup", "trend chart" or "new computer".',
    'ux.help.results': 'Search results',
    'ux.help.hits': '{n} articles matched — click to jump to the text',

    /* ================================================================== *
     * 七、备份与恢复的动作文案（modules/ux/backup.js）
     * ================================================================== */
    'backup.encryptTooShort': 'The encryption password must be at least {n} characters — please set it again.',
    'backup.filePrefix': 'PHR_backup_',
    'backup.mode.encrypted': 'password-encrypted',
    'backup.mode.plain': 'plain JSON',
    'backup.mode.replace': 'replace',
    'backup.mode.merge': 'merge',
    'backup.exported': 'Exported {file}',
    'backup.downloadBlocked': 'The download did not start — check whether your browser blocked it.',
    'backup.unknown': 'Unknown',
    'backup.unknownTime': 'Unknown time',

    /* ---------- 导入校验：文件损坏 / 结构异常 ---------- */
    'backup.err.badJson': 'The file is not valid JSON — it may not be a backup exported by this system.',
    'backup.err.noMeta': 'The backup has no meta information, so its origin and version cannot be confirmed.',
    'backup.err.noData': 'This backup has no "data" section, so it cannot be imported.',
    'backup.err.noKnownCollection': 'The backup contains no collection this system recognises.',
    'backup.err.notArray': 'Collection {name} is not an array.',
    'backup.err.tooMany': 'Collection {name} has {n} rows, beyond a plausible range — the file may be corrupt.',

    /* ---------- 导入校验：版本与口令 ---------- */
    'backup.err.versionMismatch': 'The backup version ({file}) and the current system version ({app}) have different major numbers. The import was rejected to avoid misaligned fields.',
    'backup.err.needPassword': 'This backup is encrypted — enter the password set when it was exported.',
    'backup.err.badPassword': 'The password is wrong, or the file is damaged.',

    /* ---------- 导入校验：警告（不阻断） ---------- */
    'backup.warn.unknownCollections': 'The backup contains collections this system does not know: {list}. They will be ignored on import.',
    'backup.warn.missingId': '{n} rows in collection {name} have no id and will be skipped.',

    /* ---------- 写入与回滚 ---------- */
    'backup.err.nothingToImport': 'There is nothing to import. Call importAll() to validate the file first.',
    'backup.err.rolledBack': 'Something failed during the import. Your data was rolled back automatically: {msg}',

    /* ---------- 重建与清空 ---------- */
    'backup.resetDone': 'Sample data has been restored.',
    'backup.resetSkipped': 'Sample data restore was not performed.',
    'backup.cleared': 'All locally stored data has been deleted.',

    /* ---------- 审计日志的目标名与 detail ---------- */
    'backup.targetName': 'Data backup & restore',
    'backup.audit.export': 'Health data exported: {n} records, {mode}, file name {file}',
    'backup.audit.import': 'Health data imported ({mode}): {n} written, {k} skipped',
    'backup.audit.importFail': 'Health data import failed and was rolled back: {msg}',
    'backup.audit.resetDemo': 'Sample data restored: {n} health records',
    'backup.audit.clear': 'All local health data deleted',

    /* ================================================================== *
     * 八、完整性规则：name（是什么）/ why（为什么重要）/ ok（通过了意味着什么）
     *    / fix（怎么修）/ detail（本次扫描的结论）
     * ================================================================== */

    /* ---------- 1. 孤立记录 ---------- */
    'integrity.orphan.name': 'Orphaned records',
    'integrity.orphan.why': 'The userId on these records does not exist in the account table, so the data belongs to nobody: it never shows up in anyone\'s record list, yet it keeps taking up local storage.',
    'integrity.orphan.ok': 'Every health record belongs to an existing account.',
    'integrity.orphan.fix': 'Delete records that have no owner',
    'integrity.orphan.skip': 'No account data exists yet, so the orphan check was skipped (to avoid flagging the whole database as corrupt).',
    'integrity.orphan.detail': '{n} records have no owning account — their userId is not in the account table.',

    /* ---------- 2. 心理测评缺少归属 ---------- */
    'integrity.orphan_assessment.name': 'Assessments with no owner',
    'integrity.orphan_assessment.why': 'The userId on these assessment records does not exist in the account table. They never show up in anyone\'s assessment list, yet keep taking up local storage. This rule deliberately offers **no automatic fix** — once mental-health data is deleted by a program it cannot be recovered, so it is reported for a person to decide.',
    'integrity.orphan_assessment.ok': 'Every assessment belongs to an existing account.',
    'integrity.orphan_assessment.skip': 'No account data exists yet, so the assessment ownership check was skipped.',
    'integrity.orphan_assessment.detail': '{n} assessments have no owning account.',

    /* ---------- 3. 必填字段缺失 ---------- */
    'integrity.required_missing.name': 'Missing required fields',
    'integrity.required_missing.why': 'Title, date and type are the minimum that lists, the timeline and search depend on. If any of them is empty the record appears as a blank row and sorts into the wrong place.',
    'integrity.required_missing.ok': 'Every record has a title, date and type.',
    'integrity.required_missing.detail': '{n} records are missing a title, date or type and will show as blank rows in lists and the timeline.',

    /* ---------- 4. 记录类型无法识别 ---------- */
    'integrity.invalid_type.name': 'Unrecognised record type',
    'integrity.invalid_type.why': 'When a type is not in the data dictionary the system has no field definition for it and can only fall back to rendering it as a health note, so all of its fields end up misaligned.',
    'integrity.invalid_type.ok': 'Every record type exists in the data dictionary.',
    'integrity.invalid_type.fix': 'Delete records whose type cannot be recognised',
    'integrity.invalid_type.detail': '{n} records have a type that is not in the data dictionary, so the interface can only fall back to rendering them as health notes.',

    /* ---------- 5. 日期越界 ---------- */
    'integrity.date_out_of_range.name': 'Out-of-range dates',
    'integrity.date_out_of_range.why': 'Future dates are usually typos (2026 entered as 2062) and stretch the trend chart axis until it is unreadable; dates before 1900 cannot belong to you either.',
    'integrity.date_out_of_range.ok': 'Every record has a reasonable date.',
    'integrity.date_out_of_range.fix': 'Change dates later than today to today, and dates before 1900 to 1900-01-01',
    'integrity.date_out_of_range.detail': '{n} records are dated later than today or earlier than 1900, which distorts the trend chart axis.',

    /* ---------- 6. 体征数值异常 ---------- */
    'integrity.value_abnormal.name': 'Abnormal vital-sign values',
    'integrity.value_abnormal.why': 'A value that is not a number, is negative, or exceeds three times the metric\'s upper limit is almost certainly a data-entry error (an extra zero, or text instead of digits), and it skews both the trend chart and the risk assessment.',
    'integrity.value_abnormal.ok': 'All vital-sign values are at a plausible magnitude.',
    'integrity.value_abnormal.detail': '{n} vital-sign records hold a value that is not a number, is negative, or exceeds three times the metric limit.',

    /* ---------- 7. 体征指标不存在 ---------- */
    'integrity.metric_missing.name': 'Unknown vital-sign metric',
    'integrity.metric_missing.why': 'The record references a metric key that is not in the data dictionary, so the trend chart cannot group it and the three-level threshold check cannot run.',
    'integrity.metric_missing.ok': 'Every metric referenced by a vital-sign record exists in the data dictionary.',
    'integrity.metric_missing.detail': '{n} vital-sign records reference a metric that is not in the data dictionary.',

    /* ---------- 8. 重复授权 ---------- */
    'integrity.consent_duplicate.name': 'Duplicate consents',
    'integrity.consent_duplicate.why': 'Several active consents for the same doctor blur the boundary of what was shared, and make it hard to tell exactly which data the doctor can see.',
    'integrity.consent_duplicate.ok': 'No doctor has more than one active consent.',
    'integrity.consent_duplicate.detail': '{n} doctors hold more than one active consent — consider merging them into one.',

    /* ---------- 9. 审计覆盖不足 ---------- */
    'integrity.audit_incomplete.name': 'Incomplete audit coverage',
    'integrity.audit_incomplete.why': '"Traceable" is a core promise of this system: every data write should leave a log entry. When there are clearly fewer log entries than data changes, some operations were left unrecorded (historical migration, bulk writes and so on). This item is advisory only and blocks nothing.',
    'integrity.audit_incomplete.ok': 'The number of log entries roughly matches the number of data changes.',
    'integrity.audit_incomplete.detail': 'The {ops} pieces of data each need at least one write log entry, but the audit log holds only {logs} — a shortfall of {gap}.',

    /* ---------- 10. 存储占用 ---------- */
    'integrity.storage_quota.name': 'Storage usage',
    'integrity.storage_quota.why': 'Browsers usually allow only about 5MB of storage per site. Near that limit writes can start to fail, and users suddenly find they cannot save anything.',
    'integrity.storage_quota.ok': 'Storage is using {kb} KB. Backend: {driver}.',
    'integrity.storage_quota.over': 'Storage is using {kb} KB, above the {max} KB warning line. Export a backup, then clean up old data.',

    /* ---------- 规则清单里的公共片段 ---------- */
    'integrity.noTitle': '(untitled)',
    'integrity.assessmentPrefix': 'Assessment',
    'integrity.noDoctorName': '(no name given)',
    'integrity.noHospital': '(no institution given)',
    'integrity.driverMemory': 'memory (lost when the page closes)',
    'integrity.sample.paren': '{row} ({value})',
    'integrity.sample.consentDup': '{name} ({n} records)',

    /* ---------- 审计与修复结论 ---------- */
    'integrity.targetName': 'Data integrity',
    'integrity.listSep': ', ',
    'integrity.repairItem': '{name} {n} records',
    'integrity.repair.none': 'Nothing needs fixing.',
    'integrity.repair.needConfirm': 'Fixes need explicit confirmation first.',
    'integrity.repairDone': '{n} issues handled.',
    'integrity.audit.check': 'Integrity check: score {score}, {kinds} kinds of problem ({n} issues)',
    'integrity.audit.repair': 'Integrity repair: {n} items handled ({detail})',

    /* ================================================================== *
     * 九、工作台（modules/ux/dashboard.view.js）
     *    已登记在 core/i18n/en-US.js 的 dash.* 直接复用，此处只补缺口。
     * ================================================================== */
    'dash.greet.dawn': 'Hello',
    'dash.greet.afternoon': 'Good afternoon',
    'dash.greetSep': ', ',
    'dash.needLogin': 'Please sign in first',
    'dash.hero.alertLine': '{n} readings need your attention — start with the alerts in Health Insight.',
    'dash.hero.todoLine': 'Your readings look steady. There are {n} things you may want to deal with.',
    'dash.hero.okLine': 'All records and readings are normal. A regular routine is the best health management there is.',
    'dash.hero.sub': 'This is the control centre for your health data.',

    'dash.riskLevel': 'Risk level: {level}',
    'dash.riskFromInsight': 'Provided by Health Insight',
    'dash.riskLow': 'Low',
    'dash.riskGauge': 'Risk score',
    'dash.unitScore': 'pts',
    'dash.unitAlerts': 'alerts',
    'dash.unitTodos': 'items',
    'dash.alertsUrgent': '{n} need prompt attention',
    'dash.alertsInfoOnly': 'All informational',
    'dash.alertsNone': 'Nothing abnormal',
    'dash.measuredAt': 'Measured {when}',
    'dash.noVitals': 'No vital signs recorded yet',
    'dash.todosHint': 'See the to-do list on the right',
    'dash.noAlerts': 'No alerts right now',
    'dash.allNormal': 'Every reading is within the normal range',
    'dash.monitorNote': 'The system keeps monitoring your vital signs. Alerts appear here when a reading is repeatedly abnormal, changes quickly, or has not been measured for a long time.',
    'dash.viewAllAlerts': 'View all alerts',
    'dash.alertsPending': '{n} to watch',
    'dash.adviceLabel': 'Advice: ',
    'dash.trendTitle': 'Key metric trends',
    'dash.trendNoData': 'Not enough trend data yet',
    'dash.trendEmptyTitle': 'No trend to analyse yet',
    'dash.trendEmptyHint': 'Record the same metric three times or more and the system can chart the trend and work out which way it is moving.',
    'dash.goRecordVitals': 'Record vital signs',
    'dash.trendRange': 'Last 90 days',
    'dash.viewInsightFull': 'View full insight',
    'dash.recent': 'Recent records',
    'dash.recentNone': 'No records yet',
    'dash.recentEmptyTitle': 'No health records yet',
    'dash.recentEmptyHint': 'Start by adding your first one. Allergies and confirmed diagnoses are the most useful to a doctor, so add those first.',
    'dash.recentCount': 'Latest {n}',
    'dash.synced': 'Synced',
    'dash.viewAllRecords': 'View all records',
    'dash.todoEmptyTitle': 'Nothing to deal with right now',
    'dash.todoEmptyBody': 'Follow-up reminders, prescription refills, expiring consents and metrics due for a re-test are all collected here automatically.',
    'dash.todoCount': '{n} items',
    'dash.noActiveConsent': 'No active consent right now',
    'dash.consentPrivateTitle': 'Only you can see your records at the moment',
    'dash.consentPrivateBody': 'Before a follow-up visit you can share the necessary information with a doctor for a limited time. It expires automatically and can be revoked at any time.',
    'dash.goGrant': 'Share access',
    'dash.doctorInitial': 'D',
    'dash.metaSep': ' · ',
    'dash.accessCount': '{n} visits',
    'dash.daysLeft': '{n} days left',
    'dash.consentExpiringNotice': 'Some consents are about to expire',
    'dash.consentExpiringItem': '{name} ({n} days)',
    'dash.consentExpiringSuffix': '. Extend the expiry to keep sharing — once it lapses the doctor can no longer view your records.',
    'dash.consentCount': '{n} active',
    'dash.manageConsent': 'Manage consents',
    'dash.auditNotLoaded': 'Access log module not loaded',
    'dash.auditNotLoadedBody': 'Security status cannot be shown.',
    'dash.accountRisk': 'Account risk level: ',
    'dash.auditWeekStats': 'Last 7 days: {week} actions · {denied} unauthorized attempts blocked',
    'dash.auditAlerts': '{n} security alerts',
    'dash.auditNoAlerts': 'No security alerts',
    'dash.auditNoRecent': 'No access records yet',
    'dash.securityFromAudit': 'From the access log',
    'dash.viewFullLog': 'View full log',

    /* ---------- 待办条目 ---------- */
    'dash.goHandle': 'Handle it',
    'dash.goHistory': 'View history',
    'dash.goMeds': 'View medications',
    'dash.goConsent': 'Manage consents',
    'dash.goDetail': 'View details',
    'dash.goComplete': 'Fill in the gaps',
    'dash.goRecord': 'Record now',
    'dash.followUpOverdue': 'Overdue: {name} follow-up',
    'dash.followUpSoon': 'Due soon: {name} follow-up',
    'dash.followUpDetail': '{advice} Suggested date: {date}',
    'dash.refillTitle': '{name} refill reminder',
    'dash.consentExpiringTitle': 'Consent expiring soon: {name}',
    'dash.consentExpiringDetail': '{n} days left. Extend the expiry if you want to keep sharing.',
    'dash.securityAlertTitle': 'Security alert: {name}',
    'dash.completenessTitle': 'Profile completeness {n}%',
    'dash.completenessMissing': 'Still missing: {list}',
    'dash.missingMetricsTitle': '{n} metrics have not been recorded for over 30 days',
    'dash.missingMetricsDetail': '{list} — only steady recording shows a trend.',

    /* ---------- 页脚说明 ---------- */
    'dash.footer.p1': 'Every conclusion on this page (risk score, trend judgement, prevention advice) is a rule-based, general-information hint. ',
    'dash.footer.disclaimer': 'It is not a medical diagnosis and cannot replace a doctor\'s professional opinion',
    'dash.footer.rest': '. To learn how each module works, open Help at the bottom of the left navigation.',

    /* ================================================================== *
     * 使用帮助（modules/ux/help.js）
     * 10 章 · 28 篇文章 · 26 条问答，正文是 HTML 字符串，只翻文字、标签不动
     * ================================================================== */

    /* ---------- 第 1 章 快速上手 ---------- */
    'help.section.quickstart.title': 'Getting started',
    'help.article.first-use.title': 'First use',
    'help.article.first-use.body':
      '<p>After opening the site you can register a new account on the sign-in page, or sign in with an existing one. When you first open the site and there is no local data at all, the system writes a set of sample health records (account, records, vital-sign readings, doctor consents and audit entries) so you can try every module right away.</p>' +
      '<p>Sample data is written <b>only once, when there is no local data</b>. Everything you enter afterwards is yours and will never be overwritten.</p>',
    'help.faq.first-use.1.q': 'Will the sample data wipe out what I have entered myself?',
    'help.faq.first-use.1.a': 'No. Sample data is written only on first launch, when local data is empty. If you deliberately choose Left sidebar → Preferences → Data & storage → Restore sample data, the system warns you first and suggests exporting a backup.',

    'help.article.first-login.title': 'The sign-in flow',
    'help.article.first-login.body':
      '<p>If two-factor authentication is enabled for the account, signing in takes three steps:</p>' +
      '<ul><li><b>Step 1 — Password</b>: enter your account and password.</li>' +
      '<li><b>Step 2 — SMS code</b>: enter the 6-digit code sent to your phone.</li>' +
      '<li><b>Step 3 — Face recognition</b>: click "Start scan" and follow the prompts.</li></ul>' +
      '<p>Once all three steps pass you land on the dashboard. To give up halfway, click "Back" to return to the password step.</p>',

    'help.article.layout.title': 'A tour of the interface',
    'help.article.layout.body':
      '<p>The left side is the navigation bar, split into "Modules" (Dashboard, Health Records, Search, Health Insight, Doctor Access, Access Log, Community) and "System & Support" (Preferences, Help). Across the top, left to right: the menu button (on phones), the breadcrumb, the global search box, the session countdown, the alert bell, the theme toggle and Sign out.</p>' +
      '<p>The ⏱ figure in the top right shows how long until the automatic sign-out; any mouse or keyboard activity resets it. When something unusual is detected, a numeric badge appears on the 🔔 bell.</p>',
    'help.faq.layout.1.q': 'Are there keyboard shortcuts?',
    'help.faq.layout.1.a': 'Yes. When you are not typing, press <span class="kbd">/</span> to jump straight to the search box; press Esc to close the topmost dialog or collapse the phone navigation.',

    'help.article.selfcheck.title': 'Self-check: look here first when something breaks',
    'help.article.selfcheck.body':
      '<p>If a page will not open or the data looks wrong, run a self-check first: press <span class="kbd">F12</span> to open the browser console, type <code>PHR.boot.selfTest()</code> and press Enter. It prints a diagnostic report (the core layer, the eight modules, which views are registered, how many rows of data exist — each item marked pass or fail) and also shows it as a table on the page.</p>' +
      '<p>When an item fails, read its description first: most often a script did not load, or browser storage is disabled. To start again from a clean state, go to Left sidebar → Preferences → Data & storage → Restore sample data.</p>',
    'help.faq.selfcheck.1.q': 'What does "storage backend = memory" in the self-check report mean?',
    'help.faq.selfcheck.1.a': 'It means this browser blocks local storage (common in private windows or browsers with strict privacy settings). Data is then held in memory only and is lost when you close the page. Open the site in a normal window, or check your browser privacy settings.',

    /* ---------- 第 2 章 账号安全 ---------- */
    'help.section.security.title': 'Account security',
    'help.article.password.title': 'Change or reset your password',
    'help.article.password.body':
      '<p><b>Change password</b>: Left sidebar → Preferences → Security → "Change password". Enter your current password, the new password and the confirmation. The new password must be at least 8 characters and contain both letters and digits; its strength is shown as you type.</p>' +
      '<p><b>Forgot password</b>: on the sign-in page click "Forgot password", receive a code on your registered phone number and set a new one. For safety, resetting immediately invalidates every active doctor consent — you will have to grant access again.</p>',
    'help.faq.password.1.q': 'Why does the password have to be so complex?',
    'help.faq.password.1.a': 'This system holds a complete health record. If the account is stolen, your medical history, medications and allergies are all exposed. Passwords are stored locally as salted hashes, so even the system itself cannot recover your plain-text password.',

    'help.article.mfa.title': 'Two-factor authentication: SMS codes and face recognition',
    'help.article.mfa.body':
      '<p><b>On / off</b>: Left sidebar → Preferences → Security → "Two-factor authentication". Tick or untick "Require a second step at sign-in" and choose which second factors are allowed. You can keep SMS only, or both.</p>' +
      '<p>Once it is on, knowing your password is not enough — nobody can sign in without your phone or your face. Keeping at least one second factor enabled is recommended, and it raises your security score.</p>',
    'help.faq.mfa.1.q': 'Is face recognition safe?',
    'help.faq.mfa.1.a': 'Face recognition is pre-processed locally and your photo is not uploaded. A real product should also use liveness detection and verify the result with its own authentication service.',

    'help.article.session.title': 'Sessions and staying signed in',
    'help.article.session.body':
      '<p>Tick "Stay signed in for 7 days" when you sign in, and you will not have to type your password again for 7 days, even after closing the browser. The sign-in is kept in this browser on this computer — it does not follow your account to another machine.</p>' +
      '<p>The system does <b>not</b> sign you out after a period of inactivity; that feature has been removed. The ⏱ in the top right is the <b>screensaver countdown</b>: after 30 seconds of no activity the interface hides itself and comes back the moment you move the mouse. It only covers the screen — it does not sign you out.</p>' +
      '<p>To change how long you stay signed in: Left sidebar → Preferences &amp; Security → Security → "🔓 Staying signed in". Turn it off on a shared computer; then closing the tab ends the session. When you actually leave your desk, press <code>Win + L</code> to lock the machine.</p>',

    /* ---------- 第 3 章 档案中心 ---------- */
    'help.section.records.title': 'Health Records',
    'help.article.types.title': 'What each of the 14 record types holds',
    'help.article.types.body':
      '<p>Health information is organised into 14 categories, each with its own form fields, so that trend charts, search and doctor consents can all be precise down to "one category of data".</p>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>Type</th><th>What it records</th><th>Typical moment</th></tr></thead><tbody>' +
      '<tr><td>🏥 Outpatient visit</td><td>One visit or emergency attendance: presenting complaint, diagnosis, treatment plan and cost</td><td>The day you see the doctor</td></tr>' +
      '<tr><td>🩺 Diagnosis</td><td>The name, category, severity and current status of a confirmed diagnosis</td><td>When you receive the diagnosis</td></tr>' +
      '<tr><td>🧪 Lab report</td><td>Values and reference ranges from blood counts, biochemistry, urinalysis and similar</td><td>When you get the lab sheet</td></tr>' +
      '<tr><td>🩻 Imaging study</td><td>Findings from CT, MRI, X-ray, ultrasound and endoscopy</td><td>Right after the scan</td></tr>' +
      '<tr><td>📋 Prescription</td><td>Prescribed medicines — one record per drug</td><td>After collecting the medicine</td></tr>' +
      '<tr><td>💊 Medication</td><td>What you take or have taken (including supplements) and how well you stick to it</td><td>When you start taking it</td></tr>' +
      '<tr><td>⚠️ Allergy</td><td>Allergen, typical reaction and emergency management</td><td>Something your doctor must see</td></tr>' +
      '<tr><td>🔪 Surgery</td><td>Name, date, anaesthetic type and recovery for each operation</td><td>After the operation</td></tr>' +
      '<tr><td>🛏️ Hospitalization</td><td>Admission and discharge diagnoses, the stay itself and discharge instructions</td><td>After discharge</td></tr>' +
      '<tr><td>💉 Vaccination</td><td>Vaccine name, dose number, batch number and any reaction</td><td>The day of the shot</td></tr>' +
      '<tr><td>📊 Health check-up</td><td>Overall findings and abnormal items from an annual or pre-employment check</td><td>When the report comes back</td></tr>' +
      '<tr><td>👪 Family history</td><td>Illnesses among relatives, used for genetic risk assessment</td><td>Once you know the family history</td></tr>' +
      '<tr><td>📈 Vital sign</td><td>Blood pressure, glucose, heart rate, weight and other readings over time</td><td>After each measurement</td></tr>' +
      '<tr><td>📝 Health note</td><td>Physical sensations, to-dos and questions that fit nowhere else</td><td>Any time</td></tr>' +
      '</tbody></table></div>',

    'help.article.entry.title': 'How to add a record',
    'help.article.entry.body':
      '<p>Path: Left sidebar → Health Records → "Add record" (top right) → choose a record type → fill in the form → Save.</p>' +
      '<p>Fields marked with a red asterisk are required. Choosing a metric type fills in the unit automatically; for metrics that need two values, such as blood pressure, put the diastolic reading in "Second value". For tag fields (abnormal items on a check-up, for example), type the tag and press Enter to add it.</p>' +
      '<p>Once saved, the record appears immediately in the list, on the timeline and in search results, and an audit entry is written.</p>',

    'help.article.sync.title': 'Syncing data from a hospital',
    'help.article.sync.body':
      '<p>Path: Left sidebar → Health Records → "Sync hospital data". Choose a hospital and the data types to pull (lab reports, imaging, check-up reports and so on). The system simulates a fetch and writes the results in as new records, with the source marked "hospital sync".</p>' +
      '<p>Synced records can be edited and deleted like any other, and can also be rolled back to the version as it was synced. The current version uses a simulated data source — no real hospital system is contacted.</p>',

    'help.article.version.title': 'Version history and rollback',
    'help.article.version.body':
      '<p>Every time a record is edited the system keeps a snapshot of the previous version. Open a record and click "Version history" to see when each change was made and what differed.</p>' +
      '<p>Click "Roll back" beside any version to restore the record to that state. A rollback is itself an edit, so it creates a new version in turn — you can always roll forward again, and the history never gets tangled.</p>',
    'help.faq.version.1.q': 'Can a deleted record be recovered?',
    'help.faq.version.1.a': 'No. Deleting removes every version of it, and it cannot be recovered from inside the system. If the record matters, export a backup first (Left sidebar → Preferences → Data & storage → Export backup).',

    /* ---------- 第 4 章 智能检索 ---------- */
    'help.section.search.title': 'Search',
    'help.article.howto.title': 'How to search more precisely',
    'help.article.howto.body':
      '<p>Path: type a keyword in the search box at the top and press Enter, or go to Left sidebar → Search.</p>' +
      '<p>The keyword is looked up in titles, record bodies, hospitals, doctor names and disease categories at the same time, with fuzzy matching (typing "glucose" finds "fasting glucose", "HbA1c" and "2-hour postprandial glucose"). To narrow things down:</p>' +
      '<ul><li><b>By time</b>: last 7 / 30 / 90 days, or a custom range.</li>' +
      '<li><b>By type</b>: lab reports only, or outpatient visits only.</li>' +
      '<li><b>By disease category</b>: cardiovascular, endocrine, respiratory and so on.</li></ul>' +
      '<p>Filters stack, and the number of matches is shown in the top right.</p>',

    'help.article.history.title': 'Search history',
    'help.article.history.body':
      '<p>Recent keywords are kept below the search page. Click one to run that search again, click the ✕ beside it to remove that entry, or "Clear history" to remove them all at once.</p>' +
      '<p>Search history is stored only locally and is never uploaded. It survives signing out, so you can pick up where you left off next time.</p>',

    /* ---------- 第 5 章 健康洞察 ---------- */
    'help.section.insight.title': 'Health Insight',
    'help.article.trend.title': 'How to read a trend chart',
    'help.article.trend.body':
      '<p>Path: Left sidebar → Health Insight. Pick a metric and a line chart over time appears.</p>' +
      '<p>The pale bands on the chart are the reference ranges: green is normal, yellow needs attention, and the rest is clearly abnormal. The dashed line is your target value. Hover over a day to see that day\'s exact reading and the context it was measured in. Metrics that need two values, such as blood pressure, are drawn as two curves on one chart.</p>' +
      '<p>Above each chart there is also a "this time vs last time" arrow. Its colour reflects whether the change is good for your health, not simply whether the number went up or down.</p>',

    'help.article.levels.title': 'Normal / warning / critical — what the three levels mean',
    'help.article.levels.body':
      '<p>Every metric uses the same three-level scale, defined in the data dictionary and identical across the whole system:</p>' +
      '<ul><li><b>Normal</b>: inside the reference range — carry on with your current lifestyle.</li>' +
      '<li><b>Needs attention (warning)</b>: outside the reference range but not yet at a dangerous level. A repeat test is usually advisable, along with changes to diet, exercise and sleep.</li>' +
      '<li><b>Clearly abnormal (critical)</b>: beyond the warning range. The system advises "see a doctor promptly" and may raise an in-app alert.</li></ul>' +
      '<p>To see how a particular metric is graded, open its detail page — the reference range and the reason for the grade are shown there.</p>',
    'help.faq.levels.1.q': 'Why is there no "normal range" for weight?',
    'help.faq.levels.1.a': 'There is no single absolutely normal number for weight. What matters is the trend, and the BMI calculated from it, so weight gets trend guidance only and no three-level grading.',

    'help.article.risk.title': 'Alerts, risk assessment and prevention advice',
    'help.article.risk.body':
      '<p>The system looks at your current medications, confirmed diagnoses, family history, allergies and recent vital signs together, then gives a risk assessment and prevention advice. If, for example, you have a diagnosis of hypertension, several high systolic readings and a family history of stroke, the risk note links those up and explains why.</p>' +
      '<p>Alert sensitivity is adjustable: Left sidebar → Preferences → Alerts, then choose "All alerts / Warning and above / Critical only". Fewer alerts mean a quieter screen, but early changes may slip past.</p>' +
      '<p><b>Please note:</b> these conclusions come from the data you entered and from published thresholds. They are a reference to help you understand your body — not a substitute for a doctor\'s diagnosis.</p>',

    /* ---------- 第 6 章 医生授权 ---------- */
    'help.section.consent.title': 'Doctor Access',
    'help.article.grant.title': 'Creating a consent',
    'help.article.grant.body':
      '<p>Path: Left sidebar → Doctor Access → "New consent" (top right). Fill in the doctor\'s name, title, hospital, department, licence number and purpose, tick the data scopes they may see, choose a validity period, then click "Generate consent code".</p>' +
      '<p>The system produces a code in the form <b>K7M2-P9QX-3RTD</b>. Give it to the doctor in person or over a trusted channel; they enter it in the doctor view to get in. A consent code is not a password — it stops working the moment the consent is revoked or expires.</p>',

    'help.article.scope.title': 'Choosing the scope and validity period',
    'help.article.scope.body':
      '<p>Scopes are ticked by data category: basic profile, medical history, family history, medications, allergies, lab and imaging reports, vital signs, visit records, health insight conclusions. The smaller the scope, the smaller the exposure — enough is enough.</p>' +
      '<p><b>Suggestion</b>: a cardiology follow-up needs only "basic profile + medical history + medications + vital signs + visit records"; a dental or orthopaedic appointment usually needs only "basic profile + allergies + medications".</p>' +
      '<p>The longest validity period is 90 days; the default is 7. When it runs out the system marks the consent "expired" automatically — the doctor can no longer get in, and you do not have to do anything.</p>',

    'help.article.revoke.title': 'How to revoke a consent',
    'help.article.revoke.body':
      '<p>Path: Left sidebar → Doctor Access → find the consent → "Revoke". Enter a reason and it takes effect immediately; the doctor\'s code stops working at the same moment.</p>' +
      '<p>The three statuses mean: <b>Active</b> (can view), <b>Expired</b> (past its validity period, marked automatically), <b>Revoked</b> (you took it back). Only active consents count towards what a doctor can see.</p>',
    'help.faq.revoke.1.q': 'Does revoking delete the data the doctor already saw?',
    'help.faq.revoke.1.a': 'No. Revoking only closes the door on anything further. What the doctor viewed while the consent was active is recorded in the Access Log, and you can look it up at any time.',

    'help.article.doctor.title': 'What a doctor can and cannot see',
    'help.article.doctor.body':
      '<p>A doctor sees only the scopes ticked on the consent, and only data that belongs to you. Even if they know the ID of a record outside those scopes, the request is blocked by the system before any data is returned, and an "unauthorised access blocked" alert is recorded.</p>' +
      '<p>The doctor view is a stripped-down interface. It cannot modify or delete any of your records — viewing only, and every view is written to the audit log.</p>',
    'help.faq.doctor.1.q': 'Why can\'t the doctor see everything?',
    'help.faq.doctor.1.a': 'This is the principle of minimum necessary access: an appointment only needs information relevant to the current problem. The more precise the scope, the less damage a leaked consent code can do. When more genuinely is needed, you can create a wider consent for that occasion.',

    /* ---------- 第 7 章 访问追踪 ---------- */
    'help.section.audit.title': 'Access Log',
    'help.article.what.title': 'What the audit log records',
    'help.article.what.body':
      '<p>Path: Left sidebar → Access Log. Every significant action becomes one entry: who (you, a doctor by name, or the system), when, what they did, which piece of data, and how it ended (success, failure or blocked).</p>' +
      '<p>It covers sign-ins and failed sign-ins, password changes, two-factor checks, records added, edited or deleted, data export and import, consents granted and revoked, doctors viewing records, community posts and more. You can filter by time, action type and result, and export the log to a file for your records.</p>',

    'help.article.denied.title': 'How to read "unauthorised access blocked"',
    'help.article.denied.body':
      '<p>This entry means a doctor tried to view data <strong>outside the consented scopes</strong>, and the system stopped it before any data was returned. It does <b>not</b> mean data has leaked — quite the opposite: it shows that access control is working.</p>' +
      '<p>Harmless causes are common: the doctor clicked the wrong tab, or an old bookmark pointed at another category. What deserves attention is the same blocked entry repeating within a short window, or access recorded in the small hours. If that happens, look at the alerts the system has gathered under Access Log → Security alerts, and consider revoking that consent outright.</p>',
    'help.faq.denied.1.q': 'What kinds of anomalous-access alert are there?',
    'help.faq.denied.1.a': 'Currently: suspected brute force (many failed sign-ins in a short time), account locked, access at unusual hours (doctor access between midnight and 6 a.m.), bulk viewing in a short window, unauthorised access blocked, and data export. Each alert suggests what to do about it.',

    /* ---------- 第 8 章 患者社群 ---------- */
    'help.section.community.title': 'Community',
    'help.article.post.title': 'How to post and reply anonymously',
    'help.article.post.body':
      '<p>Path: Left sidebar → Community → choose a board (General discussion, Chronic conditions, Diet & exercise, Emotional support, Family caregivers) → "New post".</p>' +
      '<p>Posting is <b>anonymous by default</b>: the system assigns a random nickname (such as "Sunlit Pine 27") and other users cannot see your account details. Replies can be anonymous too. Posts and replies are both written to the audit log, so malicious content can be traced back to whoever posted it.</p>',

    'help.article.disclaimer.title': 'Why community content is not medical advice',
    'help.article.disclaimer.body':
      '<p>Community experience comes from individual patients. It may help, or it may not apply to you because your constitution, stage of illness or other medications differ. Every post is labelled "not medical advice".</p>' +
      '<p><b>What about fake medical advertising?</b> Report it from the top right of the post, or simply delete your own content. Anything promising to "cure everything", to "replace your medication for good" or advertising a "family secret formula" is almost certainly a scam. For anything involving changing a medication, always ask your own doctor.</p>',
    'help.faq.disclaimer.1.q': 'If I talk about my condition in the community, does that leak my privacy?',
    'help.faq.disclaimer.1.a': 'Anonymous posts do not show your account or your real name. Even so, do not post ID numbers, phone numbers or admission numbers — anything that points directly at you — and avoid uploading test reports with your name on them.',

    /* ---------- 第 9 章 数据与隐私 ---------- */
    'help.section.privacy.title': 'Data & privacy',
    'help.article.where.title': 'Where is my data kept? Is anything uploaded?',
    'help.article.where.body':
      '<p>All data is kept in <b>this device\'s local storage</b>. No internet connection is required. The system works offline.</p>' +
      '<p>The upside is that your privacy stays under your control; the cost is that the data travels with the device — <b>a different device, cleared browsing data or a private window will all show nothing</b>, and in a private window the data is gone as soon as the page closes. So get into the habit of exporting a backup regularly.</p>',

    'help.article.backup.title': 'Exporting a backup and restoring it',
    'help.article.backup.body':
      '<p>Path: Left sidebar → Preferences → Data & storage.</p>' +
      '<ul><li><b>Export backup (plain JSON)</b>: produces a file named <code>PHR_backup_date_time.json</code> containing readable JSON — convenient for long-term archiving.</li>' +
      '<li><b>Export backup (passphrase-encrypted)</b>: produces a <code>.phr</code> file encrypted with a passphrase — suitable for cloud storage or a USB stick. Remember the passphrase: <b>a forgotten passphrase cannot be recovered</b>.</li>' +
      '<li><b>Import backup</b>: after you choose a file the system checks the version and structure, then asks whether to "Merge" (overwrite matching IDs, add the rest) or "Replace" (clear local data first). It takes an in-memory snapshot before writing, and rolls the whole thing back if anything goes wrong.</li></ul>',

    'help.article.delete.title': 'How to delete your data completely',
    'help.article.delete.body':
      '<p>Path: Left sidebar → Preferences → Data & storage → "Clear all data". The system asks you to type the word "delete" before it will run.</p>' +
      '<p>Everything stored locally is then deleted — account, health records, doctor consents, community posts and audit log — and it cannot be undone. The system does not write sample data back afterwards. If you only want a clean state but want to keep sample content, use "Restore sample data" instead.</p>',
    'help.faq.delete.1.q': 'Can I get the data back after clearing it?',
    'help.faq.delete.1.a': 'No. Always export a backup before clearing. The exported file lives on your own computer and can be restored at any time with "Import backup".',

    /* ---------- 第 10 章 常见问题 ---------- */
    'help.section.faq.title': 'FAQ',
    'help.article.faq.title': 'The 14 questions we hear most',
    'help.article.faq.body':
      '<p>The questions below are ordered by how often they come up — click a question to expand the answer. If yours is not here, search for a keyword using the box at the top of the page.</p>',
    'help.faq.faq.1.q': 'I forgot my password — what now?',
    'help.faq.faq.1.a': 'On the sign-in page click "Forgot password", receive a code on your registered phone number and set a new one. Every active doctor consent is invalidated immediately and will need to be granted again.',
    'help.faq.faq.2.q': 'Can I lose my data? How do I prevent it?',
    'help.faq.faq.2.a': 'Data lives in local storage, so it survives as long as you do not clear browsing data or change device. The commonest cause of "lost data" is clearing the browser cache or switching browsers. Export a backup regularly: Preferences → Data & storage → Export backup.',
    'help.faq.faq.3.q': 'Will I still see my data on a new computer (or in a new browser)?',
    'help.faq.faq.3.a': 'No. Local data does not follow the account. Export a backup on the old computer first, then open the system on the new one and restore it with Import backup → Merge.',
    'help.faq.faq.4.q': 'Can several people share one browser on the same computer?',
    'help.faq.faq.4.a': 'Yes. Each account keeps its own records, consents and preferences, so switching account switches the whole profile. For safety, sign out when you are done, and avoid exporting a plain-text backup on a shared computer.',
    'help.faq.faq.5.q': 'Why can\'t a doctor see all of my data?',
    'help.faq.faq.5.a': 'Because a consent is built by ticking scopes one by one. A doctor sees only what you ticked; anything else is blocked and logged. When more is needed, simply create a consent with a wider scope.',
    'help.faq.faq.6.q': 'What if the trend chart has no data?',
    'help.faq.faq.6.a': 'Trend charts are built from "Vital sign" records. Check that you have entered vital signs (blood pressure, glucose, heart rate, weight…) in Health Records and that the filtered time range really contains some. You can also pull a batch in with Health Records → Sync hospital data.',
    'help.faq.faq.7.q': 'Will the system sign me out automatically?',
    'help.faq.faq.7.a': 'Not after a period of inactivity — that feature has been removed. You only need to sign in again when the 7-day sign-in expires, or when you press ⏻ in the top right yourself. The ⏱ in the top bar is the screensaver countdown; it hides the interface but does not sign you out.',
    'help.faq.faq.8.q': 'What does "passphrase required" mean when importing a backup?',
    'help.faq.faq.8.a': 'It means the backup was exported with passphrase encryption. Enter the passphrase you set at the time. If it is wrong, or the file is damaged, the system asks you to try again and writes nothing.',
    'help.faq.faq.9.q': 'Should I choose "Merge" or "Replace" when importing?',
    'help.faq.faq.9.a': 'Choose "Merge" to bring back only what is missing (matching IDs are overwritten, the rest added). Choose "Replace" to swap local data entirely for the backup contents (local data is cleared first). Both take an automatic snapshot before writing and roll back if anything fails.',
    'help.faq.faq.10.q': 'Can a deleted record be restored?',
    'help.faq.faq.10.a': 'No — deletion removes the record together with its version history. Editing, however, is safe: every edit keeps a version, and you can roll back at any time from "Version history".',
    'help.faq.faq.11.q': 'Where do the vital-sign "normal ranges" come from?',
    'help.faq.faq.11.a': 'From published general reference intervals for adults (blood pressure 90–129 / 60–84 mmHg, fasting glucose 3.9–6.1 mmol/L, for example), with separate "warning" and "critical" bands on either side. They are screening references only — for your own target values, follow your doctor.',
    'help.faq.faq.12.q': 'Does the system send my data anywhere online?',
    'help.faq.faq.12.a': 'No. It makes no network requests and loads no third-party libraries; all processing and storage happen on your device. Disconnect from the network and it still works — try it.',
    'help.faq.faq.13.q': 'Can I treat community posts as medical advice?',
    'help.faq.faq.13.a': 'No. Fellow patients\' experience varies greatly with constitution, stage of illness and other medications, so it is a reference only. Any decision to stop, switch or increase a medication must go through your own doctor first.',
    'help.faq.faq.14.q': 'The text is too small and strains my eyes — what can I do?',
    'help.faq.faq.14.a': 'Left sidebar → Preferences → Appearance & accessibility. Set the font size to "Large" or "Extra large", turn on "High contrast", and use "Reduce motion" to switch off transition animations. These settings apply immediately and are saved locally.'
  });

})(window.PHR);
