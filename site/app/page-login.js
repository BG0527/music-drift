/**
 * 页面模块：`site/login.html` —— 登录 / 注册（W6：账号 + 密码）
 *
 * 端点（`docs/deploy-plan-html.md` §7.3）：`POST /api/auth/login`（**200**）、
 * `POST /api/auth/register`（**201**，注册即登录）、`POST /api/auth/logout`、`GET /api/auth/me`。
 *
 * ─── W6 的核心变化（用户第 2 轮需求 7；`docs/deploy-plan-html.md` §13 / §14.1）───────────
 * 「登录与注册**都只要「账号 + 密码」**；不要用户名；**账号就是账号、不是邮箱**」。
 * 后端已按此重建（`packages/shared/src/contracts/auth.ts`：`{ account, password }`，
 * 账号 = `users.handle`），因此本页**删掉了 W1-d 运行期插入的「用户名」行**
 * （那段 `buildUsernameRow` / `[data-username-row]` 逻辑随方案 C 一起作废）：
 * 两个 tab 现在都是**两个输入框**，就是冻结 HTML 里本来就有的「账号」+「密码」。
 * 冻结稿 `.tip` 的原文「登录和注册都只用这两项：账号、密码。」现在**是实话**，不再需要改写。
 *
 * 注意：为什么本页**直接用 `api.js` 的 `post()`** 而不是 `session.js` 的 `login()` / `register()`：
 * `site/app/session.js` 是 W0 冻结的共享层（本轮不在 W6 允许改动的文件里），
 * 它发送的是**旧契约形状**（`login(email, password)` → `{ email }`、`register(handle, email, password)`
 * → `{ handle, email }`）—— 旧写法后端仍然兼容（脚本还能跑），但**表达不了「账号」这个新正名**。
 * 本页只做一件事：把两个输入框原样送成 `{ account, password }`；映射集中在这一处。
 * （`session.js` 补上新形状后，这里可以退回共享层的 helper —— 已写进 W6 汇报。）
 *
 * 另外三处运行时文案修正（冻结稿里是演示文案，接真后会说假话）：
 *   `.act` 按钮（登录 tab 用「登录并进入」）、`.colophon`（未登录/已登录）、
 *   `.foot .said`（未登录时不再写"你已经登录为「你的代号」"）。
 *
 * 渲染纪律：**只用 textContent**（`dom.el` / 文本节点赋值），无任何 HTML 注入。
 */
import { ApiError, post } from './api.js';
import { el, q, qa, showWaking } from './dom.js';
import { currentUser, nextTarget } from './session.js';
import { definePage } from './page.js';

/** 冻结 HTML 里账号输入框的 id/name 是 `handle`，**它就是账号**（后端 `users.handle` = 契约 `account`）。 */
const ACCOUNT_ROW = '.f-handle';
const PASSWORD_ROW = '.f-pass';

const SEPARATOR = '\u3000'; // 全角空格，与冻结 HTML 里 `CODE` + 全角空格 + 文案 的写法一致

const MODES = { login: 0, register: 1 };

let mode = 'register';
let busy = false;

// ------------------------------------------------------------------ 文案通道

/** 把 `CODE` + 全角空格 + 文案 写回 msg 里既有的两个节点（`span.code` + 紧跟的文本节点）。 */
function fillMessage(msg, code, message) {
  if (msg === null) return;
  const codeNode = msg.querySelector('.code');
  if (codeNode !== null) codeNode.textContent = code;
  const anchor = codeNode ?? msg;
  const next = anchor.nextSibling;
  if (next !== null && next.nodeType === Node.TEXT_NODE) next.textContent = SEPARATOR + message;
  else msg.append(el('span', { text: SEPARATOR + message }));
}

function fieldOf(rowSelector) {
  const row = q(rowSelector);
  return {
    row,
    input: row.querySelector('input'),
    msg: row.querySelector('.msg'),
  };
}

/** 两个字段就是全部：`account`（账号）+ `password`（口令）。 */
const FIELDS = { account: fieldOf(ACCOUNT_ROW), password: fieldOf(PASSWORD_ROW) };

function clearFieldError(field) {
  if (field === null || field === undefined) return;
  field.row.classList.remove('bad');
  field.input.removeAttribute('aria-invalid');
  if (field.msg !== null) field.msg.hidden = true;
}

function setFieldError(key, code, message) {
  const field = FIELDS[key] ?? FIELDS.password;
  clearFieldError(field);
  field.row.classList.add('bad');
  field.input.setAttribute('aria-invalid', 'true');
  fillMessage(field.msg, code ?? '错误', message);
  field.msg.hidden = false;
}

/**
 * 服务端的错要落到**对应字段**：`violations[].field`（若有）→ 稳定码 → 服务端点名的字段名。
 *
 * W6 起的字段名是 `account` / `password`（旧的 `handle` 仍按账号处理；`EMAIL_TAKEN` 保留映射，
 * 但新流程不会再触发它 —— 契约里的码不删，避免连带破坏）。
 */
function fieldKeyFor(error) {
  const named = (error.violations ?? []).find((item) => typeof item.field === 'string');
  if (named !== undefined) return named.field === 'password' ? 'password' : 'account';
  switch (error.code) {
    case 'WEAK_PASSWORD':
    case 'INVALID_CREDENTIALS':
      return 'password';
    case 'HANDLE_TAKEN':
    case 'EMAIL_TAKEN':
      return 'account';
    default:
      break;
  }
  // 422「请求体不合法：account、password」这类**不带码**的结构错误：按服务端点名的字段归位。
  const text = String(error.message ?? '');
  if (/account|handle|email|账号|邮箱/.test(text)) return 'account';
  if (/password|口令|密码/.test(text)) return 'password';
  return 'password'; // 没有任何字段线索时放口令栏（登录失败的常见位置）
}

function clearAllErrors() {
  clearFieldError(FIELDS.account);
  clearFieldError(FIELDS.password);
}

// ------------------------------------------------------------------ 表单

function setMode(next) {
  mode = next;

  const buttons = qa('.modes .mode');
  buttons[MODES.login].classList.toggle('on', next === 'login');
  buttons[MODES.register].classList.toggle('on', next === 'register');

  // 冻结稿的 `.tip` 写的正是新口径，两个 tab 都成立（不再需要在注册时说"要三项"）。
  const tip = q('.tip');
  if (tip !== null) tip.textContent = '登录和注册都只用这两项：账号、密码。';
  const act = q('button.act');
  if (act !== null) act.textContent = next === 'register' ? '注册并进入' : '登录并进入';
  // 让浏览器的口令管理器/自动填充认对字段（账号就是账号，不是邮箱）。
  FIELDS.account.input.setAttribute('autocomplete', 'username');
  clearAllErrors();
}

function readForm() {
  return {
    account: FIELDS.account.input.value.trim(),
    password: FIELDS.password.input.value,
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
  const { account, password } = readForm();
  setBusy(true);
  try {
    // 契约 `{ account, password }`：注册 201 / 登录 200，成功即已建立会话 ⇒ 直接去 `?next=`。
    const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const session = await post(path, { account, password }, { redirectOn401: false });
    if (session === null || session.user === undefined || session.user === null) {
      throw new ApiError('服务没有返回登录态，请重试。', { kind: 'parse' });
    }
    location.assign(nextTarget());
    return;
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.isServiceDown === true) {
      showWaking(null, { onRetry: submit });
    } else if (error instanceof ApiError) {
      // 口令错/字段错**留在表单上**（上面已用 redirectOn401:false 关掉 401 跳转）。
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
  FIELDS.account.input.addEventListener('input', () => clearFieldError(FIELDS.account));
  FIELDS.password.input.addEventListener('input', () => clearFieldError(FIELDS.password));
}

/** 已登录态：页面底部的「已登录态」区域显示真实账号 + 指向真实的河道页。 */
async function reflectSession() {
  const said = q('.foot .said');
  const go = q('.foot .go');
  const colophon = q('.colophon');
  let user;
  try {
    user = await currentUser();
  } catch {
    // `currentUser()` 只在网络/5xx 时抛（401 返回 null）⇒ 这里就是"后端没起来/在冷启动"。
    showWaking(null, { onRetry: () => void reflectSession() });
    return;
  }
  if (go !== null) go.setAttribute('href', '/river.html'); // 冻结稿里是 href="#"
  if (user === null) {
    if (said !== null) said.textContent = '现在还没有登录；登录或注册后这里会显示你的账号。';
    if (colophon !== null) colophon.textContent = 'SIDE A · 未登录';
    return;
  }
  const account = user.account ?? user.handle;
  if (said !== null) said.textContent = `你已经登录为「${account}」，不用再登录一次。`;
  if (colophon !== null) colophon.textContent = 'SIDE A · 已登录';
}

export const { init } = definePage({
  name: 'login',
  owner: 'W6',
  endpoints: [
    'POST /api/auth/login',
    'POST /api/auth/register',
    'POST /api/auth/logout',
    'GET /api/auth/me',
  ],
  note: 'W6：两个 tab 都只有「账号 + 密码」（账号不是邮箱）；删掉 W1-d 的「用户名」运行期插入行',
  init: async () => {
    clearDemoState();
    setMode('register'); // 冻结稿默认就停在「注册」tab
    wire();
    await reflectSession();
  },
});
