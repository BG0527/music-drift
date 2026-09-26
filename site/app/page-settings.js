/**
 * 页面模块：`site/settings.html` —— 设置（W1-d 接线）
 *
 * 端点（`docs/deploy-plan-html.md` §7.3）：`GET /api/auth/me`、`POST /api/auth/logout`。
 * 另加一条**只读**端点 `GET /api/songs`：页面上「伴奏与授权」那块原来只有一句作文，
 * 而曲库契约里就有真实署名来源 `licensedSource`（`apps/api/src/routes/songs.ts`），
 * 所以把它接上（点「查看署名与许可」才展开，**默认不改动原构图**），
 * 而不是把这块标成演示数据。契约版本号同理：取 `GET /healthz` 的 `contractVersion`
 * （来源于 `packages/shared/src/contracts/common.ts` 的 `CONTRACT_VERSION`），**不写死**。
 *
 * 渲染纪律：**只用 textContent**（文本节点赋值 / `dom.el`），无任何 HTML 注入。
 */
import { ApiError, get } from './api.js';
import { clearState, el, q, showError, showLoading, showWaking } from './dom.js';
import { requireUser, logout } from './session.js';
import { definePage } from './page.js';

/** 把文案写进元素的**末尾文本节点**（冻结稿里 `.who` 是 `<i class="tick"></i>未登录`）。 */
function setSuffixText(element, text) {
  const last = element.lastChild;
  if (last !== null && last.nodeType === Node.TEXT_NODE) last.textContent = text;
  else element.append(el('span', { text }));
}

const ROLE_LABEL = { USER: '普通用户', ADMIN: '管理员' };

async function renderIdentity() {
  const who = q('.l-wet .who');
  const alt = q('.l-wet .alt .v');
  showLoading('正在读取身份…');
  let user = null;
  try {
    // 未登录 → requireUser() 自动跳 /login.html?next=/settings.html，并返回 null。
    user = await requireUser();
  } catch {
    showWaking(null, { onRetry: () => void renderIdentity() });
    return;
  }
  if (user === null) return;
  clearState();
  if (who !== null) setSuffixText(who, user.handle);
  if (alt !== null) {
    // 契约里的 role 是 `USER`/`ADMIN` 枚举：原值照显，后面补一个中文读法。
    const label = ROLE_LABEL[user.role];
    const role = label === undefined ? user.role : `${user.role}（${label}）`;
    alt.textContent = `已登录：${user.handle}（${user.email}）· 角色 ${role}`;
  }
}

async function renderContractVersion() {
  const node = q('.r-dry .ver .v');
  if (node === null) return;
  try {
    const health = await get('/healthz');
    node.textContent = String(health?.contractVersion ?? '未知');
  } catch (error) {
    node.textContent =
      error instanceof ApiError && error.isServiceDown ? '取不到（服务未启动）' : '取不到';
  }
}

let licenseBlock = null;

/** 「查看署名与许可」：展开/收起**真实**的 `licensedSource`（默认收起，不动原构图）。 */
async function toggleLicense() {
  if (licenseBlock !== null) {
    licenseBlock.remove();
    licenseBlock = null;
    return;
  }
  const button = q('.r-dry button');
  const anchor = button ?? q('.r-dry h2.block');
  try {
    const songs = await get('/api/songs');
    const counts = new Map();
    for (const song of songs) {
      const key = String(song.licensedSource ?? '未标注');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const summary = [...counts].map(([source, n]) => `${source} × ${n} 首`).join('、');
    licenseBlock = el('p', {
      class: 'body',
      'data-lic': '1',
      text: `伴奏来源（GET /api/songs 的 licensedSource）：${summary || '曲库为空'}。CC BY 4.0 要求保留署名。`,
    });
    if (anchor !== null) anchor.after(licenseBlock);
    else q('.r-dry')?.append(licenseBlock);
  } catch (error) {
    showError(error, { onRetry: () => void toggleLicense() });
  }
}

async function onLogout() {
  const button = q('.l-wet .act button');
  if (button !== null) button.disabled = true;
  try {
    await logout(); // POST /api/auth/logout → 204（成功与否都清本地缓存）
  } finally {
    location.assign('/login.html');
  }
}

export const { init } = definePage({
  name: 'settings',
  owner: 'W1-d',
  endpoints: ['GET /api/auth/me', 'POST /api/auth/logout', 'GET /healthz', 'GET /api/songs'],
  note: '契约版本取 /healthz.contractVersion；署名展开取 /api/songs.licensedSource（默认收起）',
  init: async () => {
    const logoutButton = q('.l-wet .act button');
    if (logoutButton !== null) logoutButton.addEventListener('click', () => void onLogout());
    const licenseButton = q('.r-dry button');
    if (licenseButton !== null) licenseButton.addEventListener('click', () => void toggleLicense());

    await Promise.all([renderIdentity(), renderContractVersion()]);
  },
});
