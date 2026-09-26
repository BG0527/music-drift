/**
 * 页面模块：`site/admin.html` —— 审核台（W1-d 接线）
 *
 * 端点（`docs/deploy-plan-html.md` §7.3）：
 *   `GET /api/admin/reports?status=PENDING|REVIEWED`（注意：响应是 **ReportSchema[] 裸数组**，
 *   `apps/api/src/routes/admin.ts`）、`POST /api/admin/reports/:id/decision`（`ReviewDecisionRequestSchema`）。
 *
 * 三条与冻结稿有关的处理：
 * 1. **版式模板来自冻结稿本身**：三张工单卡与三条历史记录既是"演示数据"也是**唯一**的版式来源。
 *    本文件先把它们 `cloneNode` 成模板，再**立刻清空**容器 —— 于是页面上永远不会有机会用假数据
 *    冒充真数据（占位文案不是被覆盖，而是从来没被显示过），而克隆体连内联定位一起继承，构图不变。
 * 2. **动作按对象类型给**（`interactions.ts` 的 `ReportActionSchema` + admin.ts 的 `ACTION_TARGETS`）：
 *    瓶子 → 驳回/删瓶下架/封禁作者；唱段 → 驳回/删段/封禁作者；留言 → 驳回/封禁作者。
 *    不匹配的动作服务端会 422 `REVIEW_ACTION_NOT_APPLICABLE`，所以前端不给这种按钮。
 * 3. **非管理员（403）不显示空队列**：用 `dom.showError` 明说无权限并给出回河道的链接。
 *
 * ⚠️ 已知后端约束（不是 bug，本页无从绕过）：历史行的「恢复这一段」按契约是 `RESTORE_SEGMENT`，
 * 但 admin.ts 对**已裁决**的举报只接受"同一结论"（幂等 200），改判一律 422 `REPORT_ALREADY_REVIEWED`
 * ⇒ 这个按钮只能**如实报错**（错误文案由服务端给），要真正恢复得有一条**新的**举报。
 *
 * 渲染纪律：**只用 textContent**（文本节点赋值 / `dom.el`），无任何 HTML 注入。
 */
import { ApiError, get, post } from './api.js';
import { clearState, el, q, qa, showEmpty, showError, showLoading, showRequestFailure, showWaking } from './dom.js';
import { definePage } from './page.js';

const TYPE_LABEL = { BOTTLE: '瓶子', SEGMENT: '唱段', MESSAGE: '留言' };

/** 目标类型 → [按钮文案, ReportAction, 用哪个按钮原型]。 */
const ACTIONS_BY_TYPE = {
  BOTTLE: [
    ['驳回', 'NONE', 'plain'],
    ['删瓶下架', 'REMOVE_BOTTLE', 'cut'],
    ['封禁作者', 'BAN_USER', 'ban'],
  ],
  SEGMENT: [
    ['驳回', 'NONE', 'plain'],
    ['删段', 'REMOVE_SEGMENT', 'cut'],
    ['封禁作者', 'BAN_USER', 'ban'],
  ],
  MESSAGE: [
    ['驳回', 'NONE', 'plain'],
    ['封禁作者', 'BAN_USER', 'ban'],
  ],
};

const ACTION_SEAL = {
  NONE: '已驳回',
  REMOVE_SEGMENT: '已删段',
  RESTORE_SEGMENT: '已恢复唱段',
  REMOVE_BOTTLE: '已删瓶下架',
  BAN_USER: '已封禁作者',
};

const FLOAT = q('.float');
const SUNK = q('ul.sunk');
const VIEWS = qa('.views .view');
const FOOT_CAT = q('footer .cat');

// ------------------------------------------------------------------ 复制模板（必须在清空之前）

const CARD_TEMPLATES = qa('.float .card').map((card) => ({
  node: card.cloneNode(true),
  style: card.getAttribute('style'),
}));
const REC_TEMPLATES = qa('ul.sunk li.rec').map((li) => li.cloneNode(true));
const BUTTON_PROTOTYPES = {
  plain: q('.float .card .acts button:not(.cut):not(.ban)'),
  cut: q('.float .card .acts button.cut'),
  ban: q('.float .card .acts button.ban'),
};
const BACK_PROTOTYPE = q('ul.sunk li.rec button.back');

/** 清掉冻结稿里的演示队列（三张假工单 + 三条假历史），页面上不再有任何假数据。 */
function clearDemoContent() {
  FLOAT?.replaceChildren();
  SUNK?.replaceChildren();
  setCounts(null, null);
}

// ------------------------------------------------------------------ 小工具

function shortId(id) {
  return `RPT-${String(id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function formatWhen(iso) {
  const at = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `举报于 ${at.getFullYear()}/${at.getMonth() + 1}/${at.getDate()} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function brief(text, max = 16) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function setLeadingText(element, text) {
  const first = element.firstChild;
  if (first !== null && first.nodeType === Node.TEXT_NODE) first.textContent = text;
  else element.insertBefore(el('span', { text }), element.firstChild);
}

function setCounts(pendingCount, reviewedCount) {
  const pendingNode = VIEWS[0]?.querySelector('.n');
  const reviewedNode = VIEWS[1]?.querySelector('.n');
  const show = (n) => (n === null ? '—' : String(n));
  if (pendingNode) pendingNode.textContent = show(pendingCount);
  if (reviewedNode) reviewedNode.textContent = show(reviewedCount);
  if (FOOT_CAT) FOOT_CAT.textContent = `待处理 ${show(pendingCount)} · 历史 ${show(reviewedCount)}`;
}

// ------------------------------------------------------------------ 渲染

function buildButtons(report, card) {
  const spec = ACTIONS_BY_TYPE[report.targetType] ?? ACTIONS_BY_TYPE.BOTTLE;
  return spec.map(([label, action, kind]) => {
    const node = BUTTON_PROTOTYPES[kind].cloneNode(true);
    node.textContent = label;
    node.addEventListener('click', () => void decide(report, action, card));
    return node;
  });
}

function renderPending(reports) {
  if (FLOAT === null) return;
  FLOAT.replaceChildren();
  clearState({ target: FLOAT });
  if (reports.length === 0) {
    showEmpty('待处理队列是空的：目前没有需要人工裁决的举报。', { target: FLOAT });
    return;
  }
  // 冻结稿只有三个卡位（.float 高 287px、卡片绝对定位）⇒ 多出来的条目在计数里如实体现，
  // 处理掉一条就自动顶上来一条。
  reports.slice(0, CARD_TEMPLATES.length).forEach((report, index) => {
    const template = CARD_TEMPLATES[index % CARD_TEMPLATES.length];
    const card = template.node.cloneNode(true);
    card.setAttribute('style', template.style);
    card.querySelector('.no').textContent = shortId(report.id);
    card.querySelector('.kind').textContent = TYPE_LABEL[report.targetType] ?? report.targetType;
    const rep = card.querySelector('.rep');
    setLeadingText(rep, `举报：${TYPE_LABEL[report.targetType] ?? report.targetType} `);
    const em = rep.querySelector('em');
    if (em !== null) em.textContent = brief(report.reason);
    card.querySelector('.when').textContent = formatWhen(report.createdAt);
    card.querySelector('.acts').replaceChildren(...buildButtons(report, card));
    FLOAT.append(card);
  });
}

function renderReviewed(reports) {
  if (SUNK === null) return;
  SUNK.replaceChildren();
  reports.forEach((report, index) => {
    const rec = REC_TEMPLATES[index % REC_TEMPLATES.length].cloneNode(true);
    rec.querySelector('.rno').textContent = shortId(report.id);
    const obj = rec.querySelector('.robj');
    setLeadingText(obj, `举报：${TYPE_LABEL[report.targetType] ?? report.targetType} `);
    const em = obj.querySelector('em');
    if (em !== null) em.textContent = brief(report.reason);
    rec.querySelector('.rtime').textContent = formatWhen(report.reviewedAt ?? report.createdAt);

    const seal = rec.querySelector('.seal');
    if (seal !== null) {
      const text = ACTION_SEAL[report.action] ?? '已裁决';
      seal.textContent = text;
      seal.setAttribute('data-s', text); // 冻印的 ::after 用 attr(data-s)
    }

    // 「恢复这一段」只在"删段"的裁决行上有意义（人工覆盖自动斩杀的唯一入口）。
    const back = rec.querySelector('button.back');
    const needsBack = report.action === 'REMOVE_SEGMENT';
    if (back !== null && !needsBack) back.remove();
    if (needsBack) {
      const node = back ?? BACK_PROTOTYPE?.cloneNode(true) ?? null;
      if (node !== null) {
        node.addEventListener('click', () => void decide(report, 'RESTORE_SEGMENT', rec));
        if (back === null && seal !== null) rec.insertBefore(node, seal);
      }
    }
    SUNK.append(rec);
  });
}

function renderForbidden() {
  const node = showError('无权限：审核台只对管理员开放（服务端按角色拒绝了这次请求）。');
  // base.css 是 W0 冻结的共享层（只有 captain 能改）：里面唯一的"状态条动作"样式就叫
  // `.app-state__retry`（--glass 描边 + --paper 文字）。复用它给这枚**站内链接**上色，
  // 避免在页面 JS 里内联硬编码颜色。
  node.append(el('a', { href: '/river.html', class: 'app-state__retry', text: '回河道捞一个瓶子' }));
}

// ------------------------------------------------------------------ 动作

async function decide(report, action, scope) {
  const buttons = qa('button', scope);
  for (const button of buttons) button.disabled = true;
  clearState();
  try {
    await post(`/api/admin/reports/${report.id}/decision`, { decision: action });
    await load(); // 权威刷新：该条就地离开待处理、落进历史裁决区
  } catch (error) {
    if (error instanceof ApiError && error.isServiceDown) {
      showWaking(null, { onRetry: () => void load() });
    } else {
      // 例如改判被拒（422 REPORT_ALREADY_REVIEWED）——把服务端的中文文案原样显示出来。
      showError(error);
    }
  } finally {
    for (const button of buttons) button.disabled = false;
  }
}

async function load() {
  showLoading('正在读取举报队列…');
  try {
    const [pending, reviewed] = await Promise.all([
      get('/api/admin/reports', { query: { status: 'PENDING', limit: 100 } }),
      get('/api/admin/reports', { query: { status: 'REVIEWED', limit: 100 } }),
    ]);
    clearState();
    renderPending(pending);
    renderReviewed(reviewed);
    setCounts(pending.length, reviewed.length);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      setCounts(null, null);
      renderForbidden();
      return;
    }
    // 401 已由共享层统一跳登录页；其余（网络/5xx/结构错）走"唤醒 or 出错"分流。
    showRequestFailure(error, { onRetry: () => void load() });
  }
}

/** 待处理 / 历史裁决 两个视图：默认**两个区域同时呈现**（冻结稿的构图本身就是水面上下两半），
 *  点「历史裁决」只看水下那半（用 visibility 保住 287px 占位，构图不塌）。 */
function setView(which) {
  const historyOnly = which === 'history';
  if (FLOAT !== null) FLOAT.style.visibility = historyOnly ? 'hidden' : '';
  VIEWS[0]?.setAttribute('aria-selected', historyOnly ? 'false' : 'true');
  VIEWS[1]?.setAttribute('aria-selected', historyOnly ? 'true' : 'false');
}

export const { init } = definePage({
  name: 'admin',
  owner: 'W1-d',
  endpoints: [
    'GET /api/admin/reports',
    'POST /api/admin/reports/:id/decision',
  ],
  note: '待处理/历史双队列；动作按对象类型给；403 明示无权限',
  init: async () => {
    // 模板必须在清空**之前**拿走（清空后页面上不会再有演示数据）。
    clearDemoContent();
    VIEWS[0]?.addEventListener('click', () => setView('pending'));
    VIEWS[1]?.addEventListener('click', () => setView('history'));
    await load();
  },
});
