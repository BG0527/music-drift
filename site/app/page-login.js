/**
 * 页面模块：`site/login.html` —— 登录 / 注册（W1-d 接线）
 *
 * 端点（`docs/deploy-plan-html.md` §7.3）：`POST /api/auth/login`（**200**）、
 * `POST /api/auth/register`（**201**，注册即登录）、`POST /api/auth/logout`、`GET /api/auth/me`。
 *
 * ★ 本页最重要的一处偏离（captain 已裁决，见 `docs/impl-plan-record-v1.md` §4「方案 C」）：
 *   设计稿与 `_LANGUAGE.md` §3 要求「账号 · 密码」两项，但**冻结的后端**是
 *   `LoginRequestSchema = { email, password }`、`RegisterRequestSchema = { handle, email, password }`
 *   （`packages/shared/src/contracts/auth.ts`），且 `POST /api/auth/login` 只按 email 查用户
 *   （`apps/api/src/routes/auth.ts`）⇒ 两项填不满注册。
 *   裁决取 C：**登录 tab 两项（账号=邮箱、密码）、注册 tab 三项（多一个「用户名」）**。
 *   而 HTML 是源、**不许改**（`tools/sync-site.mjs` 会覆盖 `site/*.html`）⇒
 *   切到注册 tab 时**用 JS 克隆密码行的既有结构**在账号行下方插入一个「用户名」输入行，
 *   切回登录 tab 时移除。所有映射集中在 `readForm()` / `submit()` 一处，将来后端支持
 *   「账号登录」或去掉 handle 时只需改这一处。
 *
 * 另外**四处运行时文案修正**（冻结稿里是演示文案，接真后会说假话）：
 *   `.tip`（"登录和注册都只用这两项"）、`.act` 按钮（注册 tab 用「注册并进入」）、
 *   `.colophon`（未登录/已登录）、`.foot .said`（未登录时不再写"你已经登录为「你的代号」"）。
 *
 * 渲染纪律：**只用 textContent**（`dom.el` / 文本节点赋值），无任何 HTML 注入。
 */
import { ApiError } from './api.js';
import { el, q, qa, showWaking } from './dom.js';
import { currentUser, login, nextTarget, register } from './session.js';
import { definePage } from './page.js';

/** 冻结 HTML 里账号输入框的 id/name 是 `handle`，但在方案 C 下它承载**邮箱**（后端按 email 登录）。 */
const ACCOUNT_ROW = '.f-handle';
const PASSWORD_ROW = '.f-pass';
const USERNAME_ROW_FLAG = 'usernameRow';
const USERNAME_SEPARATOR = '\u3000'; // 全角空格，与冻结 HTML 里 `CODE　文案` 的写法一致

const MODES = { login: 0, register: 1 };

let mode = 'register';
let busy = false;
let usernameRow = null;

// ------------------------------------------------------------------ 文案通道

/** 把 `CODE　文案` 写回 msg 里既有的两个节点（`span.code` + 紧跟的文本节点）。 */
function fillMessage(msg, code, message) {
  const codeNode = msg.querySelector('.code');
  if (codeNode !== null) codeNode.textContent = code;
  const anchor = codeNode ?? msg;
  const next = anchor.nextSibling;
  if (next !== null && next.nodeType === Node.TEXT_NODE) next.textContent = USERNAME_SEPARATOR + message;
  else msg.append(el('span', { text: USERNAME_SEPARATOR + message }));
}

function fieldOf(rowSelector) {
  const row = q(rowSelector);
  return {
    row,
    input: row.querySelector('input'),
    msg: row.querySelector('.msg'),
  };
}

const account = fieldOf(ACCOUNT_ROW);
const password = fieldOf(PASSWORD_ROW);

function fieldByKey(key) {
  if (key === 'username') return usernameRow;
  return key === 'password' ? password : account;
}

function clearFieldError(field) {
  if (field === null || field === undefined) return;
  field.row.classList.remove('bad');
  field.input.removeAttribute('aria-invalid');
  if (field.msg !== null) field.msg.hidden = true;
}

function setFieldError(key, code, message) {
  const field = fieldByKey(key);
  clearFieldError(field);
  field.row.classList.add('bad');
  field.input.setAttribute('aria-invalid', 'true');
  fillMessage(field.msg, code ?? '错误', message);
  field.msg.hidden = false;
}

/** 服务端的错要落到**对应字段**：`violations[].field`（若有）→ 稳定码 → 服务端点名的字段名。 */
function fieldKeyFor(error) {
  const named = (error.violations ?? []).find((item) => typeof item.field === 'string');
  if (named !== undefined) return named.field === 'handle' ? 'username' : named.field === 'email' ? 'account' : named.field;
  switch (error.code) {
    case 'HANDLE_TAKEN':
      return 'username';
    case 'WEAK_PASSWORD':
    case 'INVALID_CREDENTIALS':
      return 'password';
    case 'EMAIL_TAKEN':
      return 'account';
    default:
      break;
  }
  // 422「请求体不合法：handle、password」这类**不带码**的结构错误：按服务端点名的字段归位。
  const text = String(error.message ?? '');
  if (/handle|用户名/.test(text)) return 'username';
  if (/password|口令/.test(text)) return 'password';
  if (/email|邮箱/.test(text)) return 'account';
  return 'password'; // 没有任何字段线索时放口令栏（登录失败的常见位置）
}

function clearAllErrors() {
  clearFieldError(account);
  clearFieldError(password);
  clearFieldError(usernameRow);
}

// ------------------------------------------------------------------ 注册 tab 的运行时插入

/** 克隆**密码行**的既有结构当模板（label + input + msg），改成「用户名」行。 */
function buildUsernameRow() {
  const row = password.row.cloneNode(true);
  row.classList.remove('bad', 'strong');
  row.removeAttribute('id');
  row.dataset[USERNAME_ROW_FLAG] = 'true';

  const label = row.querySelector('label');
  label.textContent = '用户名';
  label.setAttribute('for', 'username');

  const input = row.querySelector('input');
  input.id = 'username';
  input.name = 'username';
  input.type = 'text';
  input.autocomplete = 'username';
  input.value = '';
  input.removeAttribute('aria-invalid');
  input.setAttribute('aria-describedby', 'username-err');

  const msg = row.querySelector('.msg');
  msg.id = 'username-err';
  msg.hidden = true;
  fillMessage(msg, '用户名', '');

  // 冻结稿是 1440×900 的定高构图（`html,body{height:900px}`、`overflow:hidden`）：第三行若连
  // `.hint` 一起克隆，页脚会被挤出可视区约 14px 而**被裁掉** ⇒ 这里只要 label + input + msg
  //（提示信息由 `.tip` 那行承担："注册要三项：账号（邮箱）、用户名、密码。"）。
  row.querySelector('.hint')?.remove();

  const field = { row, input, msg };
  input.addEventListener('input', () => clearFieldError(field));
  return field;
}

function mountUsernameRow() {
  if (usernameRow !== null) return;
  usernameRow = buildUsernameRow();
  account.row.after(usernameRow.row); // 「账号」字段**下方**
}

function unmountUsernameRow() {
  if (usernameRow === null) return;
  usernameRow.row.remove();
  usernameRow = null;
}

// ------------------------------------------------------------------ 表单

function setMode(next) {
  mode = next;
  if (next === 'register') mountUsernameRow();
  else unmountUsernameRow();

  const buttons = qa('.modes .mode');
  buttons[MODES.login].classList.toggle('on', next === 'login');
  buttons[MODES.register].classList.toggle('on', next === 'register');

  const tip = q('.tip');
  if (tip !== null) {
    tip.textContent =
      next === 'register' ? '注册要三项：账号（邮箱）、用户名、密码。' : '登录只要两项：账号（邮箱）、密码。';
  }
  const act = q('button.act');
  if (act !== null) act.textContent = next === 'register' ? '注册并进入' : '登录并进入';
  // 让浏览器的口令管理器/自动填充认对字段（不改视觉）。
  account.input.setAttribute('autocomplete', next === 'register' ? 'email' : 'username');
  clearAllErrors();
}

function readForm() {
  return {
    email: account.input.value.trim(),
    password: password.input.value,
    handle: usernameRow === null ? '' : usernameRow.input.value.trim(),
  };
}

function setBusy(value) {
  busy = value;
  const act = q('button.act');
  if (act === null) return;
  act.disabled = value;
  const label = mode === 'register' ? '注册并进入' : '登录并进入';
  act.textContent = value ? (mode === 'register' ? '正在注册…' : '正在登录…') : label;
}

async function submit() {
  if (busy) return;
  clearAllErrors();
  const { email, password: secret, handle } = readForm();
  setBusy(true);
  try {
    const user = mode === 'register' ? await register(handle, email, secret) : await login(email, secret);
    // 契约：注册 201 / 登录 200，成功即已建立会话 ⇒ 直接去 `?next=`（无则回河道）。
    if (user === null) throw new ApiError('服务没有返回登录态，请重试。', { kind: 'parse' });
    location.assign(nextTarget());
    return;
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.isServiceDown === true) {
      showWaking(null, { onRetry: submit });
    } else if (error instanceof ApiError) {
      // 口令错/字段错**留在表单上**（session.login/register 已用 redirectOn401:false）。
      setFieldError(fieldKeyFor(error), error.code, error.message);
    } else {
      setFieldError('password', 'ERROR', '提交失败：' + String(error?.message ?? error));
    }
  } finally {
    setBusy(false);
  }
}

// ------------------------------------------------------------------ 装配

function clearDemoState() {
  // 冻结稿里两个字段带着演示用的「已出错」状态（.bad + 可见的 .msg + aria-invalid），接真后必须清掉。
  for (const row of qa('form .field')) row.classList.remove('bad');
  for (const msg of qa('form .msg')) msg.hidden = true;
  for (const input of qa('form input')) input.removeAttribute('aria-invalid');
  clearAllErrors();
}

function wire() {
  const buttons = qa('.modes .mode');
  buttons[MODES.login].addEventListener('click', () => setMode('login'));
  buttons[MODES.register].addEventListener('click', () => setMode('register'));

  const act = q('button.act');
  if (act !== null) act.addEventListener('click', () => void submit());

  const form = q('form.form');
  if (form !== null) {
    // 冻结稿里没有提交按钮；不接 submit 的话，在输入框里回车会整页 GET 刷新。
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void submit();
    });
  }
  account.input.addEventListener('input', () => clearFieldError(account));
  password.input.addEventListener('input', () => clearFieldError(password));
}

/** 已登录态：页面底部的「已登录态」区域显示真实代号 + 指向真实的河道页。 */
async function reflectSession() {
  const said = q('.foot .said');
  const go = q('.foot .go');
  const colophon = q('.colophon');
  let user = null;
  try {
    user = await currentUser();
  } catch {
    // `currentUser()` 只在网络/5xx 时抛（401 返回 null）⇒ 这里就是"后端没起来/在冷启动"。
    showWaking(null, { onRetry: () => void reflectSession() });
    return;
  }
  if (go !== null) go.setAttribute('href', '/river.html'); // 冻结稿里是 href="#"
  if (user === null) {
    if (said !== null) said.textContent = '现在还没有登录；登录或注册后这里会显示你的代号。';
    if (colophon !== null) colophon.textContent = 'SIDE A · 未登录';
    return;
  }
  if (said !== null) said.textContent = `你已经登录为「${user.handle}」，不用再登录一次。`;
  if (colophon !== null) colophon.textContent = 'SIDE A · 已登录';
}

export const { init } = definePage({
  name: 'login',
  owner: 'W1-d',
  endpoints: [
    'POST /api/auth/login',
    'POST /api/auth/register',
    'POST /api/auth/logout',
    'GET /api/auth/me',
  ],
  note: '方案 C：注册 tab 运行时插入「用户名」行；字段级错误按 violations[].code 归位',
  init: async () => {
    clearDemoState();
    setMode('register'); // 冻结稿默认就停在「注册」tab
    wire();
    await reflectSession();
  },
});
