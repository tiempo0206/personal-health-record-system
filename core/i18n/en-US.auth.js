/**
 * ============================================================================
 * 文件：core/i18n/en-US.auth.js
 * 层：核心基础设施层（国际化 · 英文词条 · 账号安全模块）
 * 职责：注册「账号安全」模块（登录 / 注册 / 多因素认证 / 账号与安全页）的英文词条。
 *
 *      覆盖范围：
 *        modules/auth/auth.view.js        登录页、注册表单、多因素认证、医生入口
 *        modules/auth/auth.service.js     注册 / 登录 / 改密 / 多因素开关的提示与审计文案
 *        modules/auth/mfa.js              验证码与人脸识别的提示
 *        modules/auth/lockout.js          锁定时长的措辞
 *        modules/auth/profile.view.js     「账号与安全」整页
 *
 *      与本模块相关的通用词条（ui.* / view.* / dict.*）保留在 core/i18n/en-US.js，
 *      这里只补充本模块独有的部分；两处的键不会相互覆盖。
 *
 * 依赖：core/i18n/i18n.js（register）
 * ============================================================================
 *
 * ⚠️ 医疗与合规用语的翻译原则：
 *   · 安全提示保留"说清后果"的语气，不做营销化改写
 *     （例如"攻击者仍然过不了第二关"→ 保留 attack 的具象说法）
 *   · 授权码 / 执业证号等名词沿用行业说法（access code / licence number）
 *   · 短信验证码统一用 verification code，与 screen 上的 6 位数字一致
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  if (!PHR.i18n) { return; }

  PHR.i18n.register('en-US', {

    /* ================================================================== *
     * 一、模块元信息（core/namespace.js 的 registerModule）
     * ================================================================== */
    'module.auth.title': 'Account & Security',
    'module.auth.desc': 'Sign-up and sign-in, two-factor authentication, session management and password policy',

    /* ================================================================== *
     * 二、通用小词（本模块反复用到）
     * ================================================================== */
    'ui.yes': 'Yes',
    'ui.no': 'No',
    'ui.gotIt': 'Got it',
    'ui.listSep': ', ',

    /* ================================================================== *
     * 三、登录页
     * ================================================================== */
    'auth.showPassword': 'Show password',
    'auth.factorSms': 'SMS',
    'auth.factorSmsFace': 'SMS + Face',
    'auth.factorSmsName': 'SMS verification code',
    'auth.factorFaceName': 'Face recognition',
    'auth.signingIn': 'Signing in…',
    'auth.errEmpty': 'Please enter your account and password',
    'auth.failWithHint': '{msg} ({hint})',
    'auth.loginSuccess': 'Signed in',
    'auth.welcomeBack': 'Welcome back, {name}',
    'auth.lockedBtn': 'Locked · {v}',
    'auth.pwdHint': 'Mix letters, digits and symbols, and avoid birthdays or phone numbers',
    'auth.pwdHintShort': 'Mix letters, digits and symbols',
    'auth.pwdStrength': 'Strength: {level}',
    'auth.pwdIssues': 'Not met: {list}',
    'auth.pwdUpdatedTitle': 'Password updated',

    /* ---------- 忘记密码 ---------- */
    'auth.forgot.title': 'What if I forget my password?',
    'auth.forgot.tipTitle': 'Use your registered phone number to reset',
    'auth.forgot.tipBody': 'The sign-in page currently supports account/password sign-in. To reset your password, use the mobile number bound when you registered to receive a verification code.',
    'auth.forgot.intro': 'If you cannot sign in, you can:',
    'auth.forgot.opt1': 'check that your account and password are entered correctly;',
    'auth.forgot.opt2': 'use your registered phone number to reset the password via verification code;',
    'auth.forgot.opt3': 'or register a new account (each account’s data is kept separate).',

    /* ================================================================== *
     * 四、注册表单
     * ================================================================== */
    'auth.register.username': 'Account',
    'auth.register.usernamePlaceholder': '3–32 letters, digits or underscores',
    'auth.register.displayName': 'Name / nickname',
    'auth.register.displayNamePlaceholder': 'Used in the greeting',
    'auth.register.passwordPlaceholder': 'At least {n} characters, with letters and digits',
    'auth.register.password2': 'Confirm password',
    'auth.register.password2Placeholder': 'Enter the password again',
    'auth.register.phone': 'Mobile number',
    'auth.register.phonePlaceholder': 'Used to receive SMS codes',
    'auth.register.email': 'Email',
    'auth.register.mfaFactor': 'Two-factor method',
    'auth.register.mfaHint': 'Once enabled, signing in also requires an SMS code or a face scan. We strongly recommend leaving this on.',
    'auth.register.agreement': 'I have read and agree to the Health Data Use and Privacy Notice: health data is stored only on my device, is not shared without my consent, and I will back up important data regularly to avoid loss from device or browser data cleanup.',
    'auth.register.submit': 'Create account',
    'auth.register.failed': 'Registration failed',
    'auth.register.okTitle': 'Account created',
    'auth.register.okBody': 'Please sign in with your new account.',
    'auth.register.ok': 'Registration successful — please sign in with your new account',

    /* ================================================================== *
     * 五、多因素认证（第二步）
     * ================================================================== */
    'auth.mfa.currentFactor': 'Current method: ',
    'auth.mfa.enterSecond': 'Please complete the second factor to continue',
    'auth.mfa.sessionExpired': 'The verification session has expired. Please sign in again.',
    'auth.mfa.errSession': 'The verification session has expired. Please sign in again.',
    'auth.mfa.sentTitle': 'Verification code sent',
    'auth.mfa.sentBody': 'A verification code has been sent to {phone}. Please enter the 6-digit code below.',
    'auth.mfa.smsPrompt': 'Enter the 6-digit code sent to {phone}',
    'auth.mfa.ttl': 'Code valid for {n} seconds',
    'auth.mfa.ttlLeft': 'Code expires in {n} seconds',
    'auth.mfa.resendIn': 'Resend available in {n}s',
    'auth.mfa.expired': 'Code expired',
    'auth.mfa.resent': 'Verification code resent',
    'auth.mfa.needSix': 'Please enter all 6 digits',
    'auth.mfa.waitResend': 'Please wait {n} seconds before requesting a new code',
    'auth.mfa.smsSent': 'Verification code sent to {phone}',
    'auth.mfa.getCodeFirst': 'Please request a verification code first',
    'auth.mfa.codeExpired': 'The code has expired. Please request a new one.',
    'auth.mfa.wrongCode': 'Incorrect code — {n} attempt(s) left',
    'auth.mfa.tooManyAttempts': 'Too many attempts. Please sign in again.',
    'auth.mfa.smsOk': 'SMS code verified',
    'auth.mfa.faceOk': 'Face matched',
    'auth.mfa.faceRetry': 'No matching face detected. Face the camera and try again ({n} attempt(s) left)',
    'auth.mfa.faceTooMany': 'Too many failed face scans. Please use the SMS code instead.',
    'auth.mfa.faceTitle': 'Face recognition',
    'auth.mfa.faceBody': 'Please face the screen and tap Start. Keep your face in the frame while scanning. You will enter the system once the scan passes.',
    'auth.mfa.faceOkTitle': 'Face verified',
    'auth.mfa.faceOkBody': 'Similarity {n}% — taking you in…',
    'auth.mfa.recognizing': 'Scanning…',
    'auth.mfa.auditUniversal': '⚠️ Signed in with the universal test code ({v}) instead of a real SMS code. This is for test environments only and must be disabled in production.',
    'auth.mfa.auditWrongCode': 'Incorrect SMS code, {n} attempt(s) left',
    'auth.mfa.auditFaceFail': 'Face scan failed, {n} attempt(s) left',
    'auth.mfa.warn.universalCodeUsed': 'Signed in with universal test code: {username}',
    'auth.mfa.universalPass': 'Accepted the universal test code',

    /* ---------- 演示环境：验证码直接显示（auth.view.js 的 demoCodeNote） ---------- */
    'auth.mfa.demoTitle': 'Demo environment: the code is shown on this page',
    'auth.mfa.demoBody': 'This demo has no SMS gateway. Your verification code is {code}.',

    /* ---------- 登录页的演示账号入口 / 悬停提示（auth.view.js） ---------- */
    'auth.demo.fill': '⚡ Fill in the demo account',
    'auth.demo.filled': 'Filled in the demo account {name} — press “Sign in” to continue',
    'auth.demo.tipLabel': 'Demo accounts and verification codes',
    'auth.demo.tipAccounts': 'Demo accounts: {list}',
    'auth.demo.tipCode': 'Universal code {code}: it also passes the SMS step',
    'auth.demo.tipSms': 'This demo has no SMS gateway — the code is shown on the verification page itself.',
    'auth.demo.tipPwd': 'Passwords must be at least 8 characters and contain both letters and digits.',
    'auth.mfaEnabledMsg': 'Two-factor authentication enabled ({v})',
    'auth.mfaDisabledMsg': 'Two-factor authentication disabled — your account is now less secure',

    /* ================================================================== *
     * 六、医生入口
     * ================================================================== */
    'auth.doctor.title': 'Doctor verification',
    'auth.doctor.whatTitle': 'What is this?',
    'auth.doctor.whatBody': 'If you are a doctor, your patient will send you a 12-character access code. After entering it you can see only what the patient has explicitly shared with you, and every view is recorded.',
    'auth.doctor.code': 'Access code',
    'auth.doctor.name': 'Your name',
    'auth.doctor.namePlaceholder': 'e.g. Li Jianguo',
    'auth.doctor.titleLabel': 'Title',
    'auth.doctor.titlePlaceholder': 'e.g. Chief Physician',
    'auth.doctor.license': 'Licence number',
    'auth.doctor.licensePlaceholder': 'Optional, kept for the audit trail',
    'auth.doctor.availableCodes': 'Available access codes (tap one to fill it in):',
    'auth.doctor.footnote': 'Note: the code decides whose records you can see and what you can see; the doctor name is typed by you and is only used for the audit trail.',
    'auth.doctor.needCodeName': 'Please enter the access code and your name',
    'auth.doctor.verify': 'Verify and continue',
    'auth.doctor.auditDetail': 'Doctor entered the restricted view with an access code',

    /* ================================================================== *
     * 七、服务层提示与审计文案
     * ================================================================== */
    'auth.err.agreement': 'Please read and accept the Health Data Use and Privacy Notice first',
    'auth.err.usernameTaken': 'That account name is already taken — please choose another',
    'auth.err.phoneTaken': 'That mobile number is already linked to another account',
    'auth.err.fixForm': 'Please fix the fields highlighted in the form',
    'auth.err.badCredentials': 'Incorrect account or password',
    'auth.err.disabled': 'This account has been disabled. Please contact an administrator.',
    'auth.err.lockedUntil': 'Account temporarily locked. Please try again in {v}.',
    'auth.err.lockedByFailures': 'Password incorrect {n} times in a row — the account is locked for {m} minutes',
    'auth.err.lastChances': '{n} more failed attempt(s) will lock the account',
    'auth.err.needLogin': 'Please sign in first',
    'auth.err.oldPassword': 'Current password is incorrect',
    'auth.err.newPasswordEmpty': 'Please enter a new password',
    'auth.err.samePassword': 'The new password must differ from the current one',
    'auth.err.passwordMismatch': 'The two new passwords do not match',
    'auth.err.checkForm': 'Please check the form',
    'auth.err.sessionExpired': 'The verification session has expired. Please sign in again.',
    'auth.err.unsupportedFactor': 'Unsupported second factor: {v}',
    'auth.err.userMissing': 'Account does not exist',
    'auth.err.needOneFactor': 'Select at least one method when enabling two-factor authentication',
    'auth.err.needPhone': 'Before using SMS codes, add your mobile number under “Basic Profile”.',
    'auth.pwdUpdated': 'Password updated. For your safety, watch for unfamiliar devices the next time you sign in.',
    'auth.actorSystem': 'System',

    /* ---------- 锁定倒计时措辞 ---------- */
    'auth.lock.minSec': '{m}m {s}s',
    'auth.lock.sec': '{s}s',

    /* ---------- 第二因素的说明（名称走字典层 dict.authFactor.*） ---------- */
    'auth.factor.password.desc': 'First factor: account password',
    'auth.factor.sms.desc': 'Second factor: a 6-digit code sent to your linked mobile number',
    'auth.factor.face.desc': 'Second factor: locally simulated face matching',

    /* ---------- 会话与安全提醒 ---------- */
    'auth.idleLogout': 'You were signed out automatically after a long period of inactivity',
    'auth.sessionTimeout': 'Session timed out',
    'auth.accountLocked': 'Account “{u}” is locked',
    'auth.accountLockedDetail': 'After several failed sign-in attempts, please wait for the lock to expire and try again.',
    'auth.securityAlert': 'Security notice',

    /* ---------- 退出原因 ---------- */
    'auth.logoutReason.manual': 'signed out by the user',
    'auth.logoutReason.timeout': 'the 7-day sign-in period expired',
    'auth.logoutReason.disabled': 'account disabled',
    'auth.logoutReason.userMissing': 'account no longer exists',
    'auth.logoutReason.unknown': 'unknown reason',

    /* ---------- 审计日志 ---------- */
    'auth.audit.registered': 'Registration successful, two-factor authentication: {v}',
    'auth.audit.mfaOff': 'not enabled',
    'auth.audit.lockedRemain': 'Account is locked, {v} remaining',
    'auth.audit.noSuchUser': 'Account does not exist (counted as one failed attempt)',
    'auth.audit.wrongPassword': 'Incorrect password (consecutive attempt #{n})',
    'auth.audit.locked': '{n} consecutive failed sign-ins — account locked for {m} minutes',
    'auth.audit.awaitMfa': 'Password verified, waiting for the second factor ({v})',
    'auth.audit.mfaPass': 'Second factor passed ({v})',
    'auth.audit.loginMfa': 'Signed in (two-factor verified)',
    'auth.audit.loginNoMfa': 'Signed in (two-factor not enabled)',
    'auth.audit.logout': 'Signed out ({v})',
    'auth.audit.passwordChanged': 'Login password changed',
    'auth.audit.mfaEnabled': 'Two-factor authentication enabled: {v}',
    'auth.audit.mfaDisabled': 'Two-factor authentication disabled',

    /* ================================================================== *
     * 八、账号与安全页
     * ================================================================== */
    'profile.needLogin': 'Please sign in',
    'profile.needLoginHint': 'Sign in to view your account and security settings.',
    'profile.desc': 'Manage your sign-in credentials, two-factor authentication and session policy, and see who is trying to access your account.',
    'profile.account': 'Account {u}',
    'profile.registeredAt': 'Registered {d}',
    'profile.loginCount': '{n} sign-ins',
    'profile.lastLogin': 'Last sign-in',
    'profile.currentSession': 'Current session',
    'profile.sessionLeft': 'Stays signed in',
    'profile.calculating': 'Calculating…',
    'profile.source': 'Source',
    /* 这几条取代了原来的 'profile.autoLogoutIn'（空闲登出倒计时）。
       登录保持是绝对到期，按天显示即可，不需要秒级跳字。 */
    'profile.autoLogoutInDays': 'Sign-in needed again in {d}d {h}h',
    'profile.autoLogoutInHours': 'Sign-in needed again in {h}h',
    'profile.sessionTabOnly': 'This tab only (ends when the tab closes)',

    /* ---------- 安全体检 ---------- */
    'profile.posture.title': '🛡️ Security check-up',
    'profile.posture.score': 'Security score',

    /* ---------- 修改密码 ---------- */
    'profile.pwd.title': '🔑 Change password',
    'profile.pwd.old': 'Current password',
    'profile.pwd.new': 'New password',
    'profile.pwd.new2': 'Confirm new password',
    'profile.pwd.sessionNote': 'Your current session stays active after the change',
    'profile.pwd.save': 'Save new password',
    'profile.pwd.failed': 'Change failed',
    'profile.pwd.ok': 'Password changed',
    'profile.pwd.policyOk': 'Meets the security policy',

    /* ---------- 多因素认证 ---------- */
    'profile.mfa.title': '📱 Two-factor authentication',
    'profile.mfa.on': 'On',
    'profile.mfa.off': 'Off',
    'profile.mfa.adviceTitle': 'We recommend turning this on now',
    'profile.mfa.adviceBody': 'An account protected by a password alone is exposed the moment that password leaks — anyone who has it can read your health records. With two-factor authentication, a leaked password still does not get an attacker through the second gate.',
    'profile.mfa.require': 'Require a second factor at sign-in',
    'profile.mfa.available': 'Available second factors',
    'profile.mfa.phoneHint': 'SMS codes require a mobile number, added under “Records → Basic Profile”.',
    'profile.mfa.save': 'Save two-factor settings',
    'profile.mfa.saved': 'Saved',

    /* ---------- 登录历史 ---------- */
    'profile.history.title': '🕘 Sign-in history',
    'profile.history.sub': 'If you see a time or device you do not recognise, change your password immediately',
    'profile.history.viewAll': 'View full log',
    'profile.history.empty': 'No sign-in records yet',
    'profile.history.col.time': 'Time',
    'profile.history.col.action': 'Event',
    'profile.history.col.detail': 'Details',
    'profile.history.col.result': 'Result',
    'profile.history.col.env': 'Source',

    /* ---------- 危险操作 ---------- */
    'profile.danger.title': '⚠️ Danger zone',
    'profile.danger.wipeTitle': 'Erase all data on this device',
    'profile.danger.wipeBody': 'This deletes every account, health record, consent and log stored in this browser, and cannot be undone. If you only want to switch accounts, just sign out. Always export a backup first.',
    'profile.danger.wipeBtn': 'Erase all data on this device',
    'profile.danger.confirmMsg': 'This deletes all data stored in this browser and cannot be undone.',
    'profile.danger.confirmDetail': 'This includes accounts, health records, doctor consents, audit logs and community content. We suggest exporting a backup first under “Preferences → Data & Storage”.',
    'profile.danger.confirmLabel': 'I have a backup — erase everything',
    'profile.danger.requireText': 'ERASE',
    'profile.danger.cleared': 'All local data erased — reloading',

    /* ================================================================== *
     * 九、安全体检条目（core/security.js 生成，按条目名映射到这里）
     * ================================================================== */
    'security.posture.passwordHash.name': 'Passwords hashed',
    'security.posture.passwordHash.detail': 'Passwords are stored as salted SHA-256 hashes — no plaintext password exists in the database.',
    'security.posture.mfa.name': 'Two-factor authentication',
    'security.posture.mfaOn.detail': 'Enabled — signing in requires a second confirmation step (SMS code or face scan).',
    'security.posture.mfaOff.detail': 'Not enabled. We recommend turning on SMS codes or face recognition.',
    'security.posture.session.name': 'Staying signed in',
    'security.posture.session.detail': 'Your sign-in is kept for 7 days, so reopening the browser does not ask for your password again.',
    'security.posture.audit.name': 'Access trail',
    'security.posture.audit.detail': 'Every read and write of your records is written to the audit log, readable under “Access Log”.',
    'security.posture.storage.name': 'Storage',
    'security.posture.storageOn.detail': 'Local storage is available. Your data stays on this device and is not shared externally.',
    'security.posture.storageOff.detail': 'This browser has local storage disabled, so data is held in memory only and is lost when the page closes.',

    /* ---------- 安全治理内部警告 ---------- */
    'security.warn.anomalyRuleFail': 'Anomaly detection rule failed: {rule}'
  });

})(window.PHR);
