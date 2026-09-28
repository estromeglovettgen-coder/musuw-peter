(function () {
  'use strict';
  const data = window.PARTNER_SIMULATION;
  if (!data || data.simulated !== true) throw new Error('Explicitly simulated data required.');
  let lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh';
  let selected = 'all', expanded = null, orderPage = 1, boardPage = 1, lookupQuery = null;
  const orderPageSize = 20, boardPageSize = 25;
  const $ = selector => document.querySelector(selector);
  const dict = {
    zh: {
      title: '推广榜单', pageTitle: 'Musuw 推广榜单', eyebrow: '合作伙伴看板',
      offer: '新客户首笔实付 100% 佣金，后续实际付费 20%。', currency: 'CNY · 人民币',
      month: '统计月份', all: '六月至今', search: '搜索折扣码', summary: '推广汇总',
      lookupTitle: '查我的佣金', lookupSubmit: '查询佣金', lookupPlaceholder: '输入完整折扣码',
      lookupEmpty: '请输入你的完整折扣码。', lookupMissing: '未找到这个折扣码，请检查后重试。',
      lookupOrders: '查看订单', lookupLifetime: '累计佣金（截至所选月份）',
      rank: '排名', code: '折扣码', customers: '新付费客户', monthly: '本月佣金', period: '期间佣金', lifetime: '累计佣金',
      grossAll: '累计推广成交金额', grossMonth: '本月推广成交金额', commissionAll: '累计佣金', commissionMonth: '本月佣金',
      customerTotal: '累计付费客户', customerNote: '已付款客户，含退款客户', commissionNote: '已扣除退款与拒付对应佣金',
      grossNote: n => `${n} 笔付款订单 · 含退款订单原始金额`, meta: (codes, n, all) => `${codes} 个折扣码 · ${n} 位${all ? '' : '本月新'}付费客户`,
      details: '订单明细', close: '收起', anonymous: '匿名订单', date: '日期 UTC', type: '类型', paid: '付款金额', share: '本笔佣金', status: '状态',
      first: '首购', renewal: '续费', adjusted: '退款已调整', counted: '已计入', noOrders: '该月份暂无订单', noCodes: '没有匹配的折扣码',
      previous: '上一页', next: '下一页', orderPages: (p, pages, n) => `第 ${p} / ${pages} 页 · ${n} 笔订单`, boardPages: (p, pages, n) => `第 ${p} / ${pages} 页 · ${n} 个折扣码`,
      view: code => `查看 ${code} 订单`, monthlyShort: '本月 ', periodShort: '期间 ', lifetimeShort: '累计 ',
      disclosure: '数据为合成记录，仅用于功能与口径展示，不代表真实订单或收益。',
      footer: '统计日期：2026 年 6 月 11 日至 9 月 8 日。固定换算假设：1 美元 = 7.20 人民币。退款与拒付按原订单归属月份调整佣金。点击折扣码查看订单明细。',
    },
    en: {
      title: 'Partner leaderboard', pageTitle: 'Musuw Partner Leaderboard', eyebrow: 'PARTNER PROGRAM',
      offer: 'Earn 100% of a new customer’s first payment, then 20% on repeat payments.', currency: 'USD · US dollars',
      month: 'Month', all: 'June to date', search: 'Search discount code', summary: 'Referral totals',
      lookupTitle: 'Find my commission', lookupSubmit: 'Check commission', lookupPlaceholder: 'Enter your full discount code',
      lookupEmpty: 'Enter your full discount code.', lookupMissing: 'Discount code not found. Check the code and try again.',
      lookupOrders: 'View orders', lookupLifetime: 'Total through selected month',
      rank: 'Rank', code: 'Discount code', customers: 'New paid customers', monthly: 'Monthly commission', period: 'Period commission', lifetime: 'Total commission',
      grossAll: 'Total referral revenue', grossMonth: 'Monthly referral revenue', commissionAll: 'Total commission', commissionMonth: 'Monthly commission',
      customerTotal: 'Total paid customers', customerNote: 'Includes customers with refunded payments', commissionNote: 'After refund and chargeback adjustments',
      grossNote: n => `${n} payments · before refunds`, meta: (codes, n, all) => `${codes} discount codes · ${n} ${all ? '' : 'new '}paid customers`,
      details: 'Order details', close: 'Close', anonymous: 'Anonymous order', date: 'Date (UTC)', type: 'Type', paid: 'Amount paid', share: 'Commission', status: 'Status',
      first: 'First payment', renewal: 'Renewal', adjusted: 'Refund adjusted', counted: 'Included', noOrders: 'No orders this month', noCodes: 'No matching discount codes',
      previous: 'Previous', next: 'Next', orderPages: (p, pages, n) => `Page ${p} of ${pages} · ${n} orders`, boardPages: (p, pages, n) => `Page ${p} of ${pages} · ${n} codes`,
      view: code => `View orders for ${code}`, monthlyShort: 'Month ', periodShort: 'Period ', lifetimeShort: 'Total ',
      disclosure: 'Synthetic records for product and calculation review; not actual orders or earnings.',
      footer: 'June 11–September 8, 2026. Fixed exchange rate assumption: US$1 = CN¥7.20. Refunds and chargebacks adjust the original order month. Select a discount code to view orders.',
    },
  };
  const t = () => dict[lang];
  const count = value => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'zh-CN').format(value);
  const money = cnyMinor => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'zh-CN', { style: 'currency', currency: lang === 'en' ? 'USD' : 'CNY' }).format(cnyMinor / 100 / (lang === 'en' ? data.cnyPerUsd : 1));
  const rows = data.orders.map(o => {
    const refunded = o.adjustments.filter(a => a.at <= data.asOf).reduce((s, a) => s + a.amount, 0);
    const net = Math.max(0, o.paid - refunded);
    const commission = o.first ? net : Math.floor(net / 5);
    const rate = o.currency === 'CNY' ? 1 : data.cnyPerUsd;
    return { ...o, net, refunded, grossCny: o.paid * rate, commissionCny: commission * rate };
  });
  const cache = new Map();
  function summarize(month) {
    if (cache.has(month)) return cache.get(month);
    const end = month === 'all' ? data.asOf : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1) - 1).toISOString();
    const lifetime = rows.filter(o => o.date <= end);
    const current = month === 'all' ? lifetime : lifetime.filter(o => o.date.startsWith(month));
    const byCode = new Map(data.codes.map(code => [code, { code, customers: 0, commission: 0, lifetimeCommission: 0, orders: [] }]));
    for (const o of lifetime) byCode.get(o.code).lifetimeCommission += o.commissionCny;
    for (const o of current) {
      const p = byCode.get(o.code); p.orders.push(o); p.commission += o.commissionCny; p.customers += Number(o.first);
    }
    const partners = [...byCode.values()].sort((a, b) => b.customers - a.customers || b.commission - a.commission || a.code.localeCompare(b.code));
    const sum = (list, field) => Math.round(list.reduce((s, o) => s + o[field], 0));
    const result = { partners, current, lifetime, gross: sum(current, 'grossCny'), lifetimeGross: sum(lifetime, 'grossCny'), commission: sum(current, 'commissionCny'), customers: current.filter(o => o.first).length, lifetimeCustomers: lifetime.filter(o => o.first).length };
    cache.set(month, result); return result;
  }
  window.summarizePartnerSimulation = summarize;
  function monthLabel(month) {
    return month === 'all' ? t().all : new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-CN', {year:'numeric', month:'long', timeZone:'UTC'}).format(new Date(month + '-01T00:00:00Z'));
  }
  function renderLookup() {
    const result = $('#lookup-result'), d = t();
    result.hidden = lookupQuery === null;
    $('#commission-code').setAttribute('aria-invalid', 'false');
    if (lookupQuery === null) { result.innerHTML = ''; return; }
    const partner = summarize(selected).partners.find(p => p.code === lookupQuery);
    if (!partner) {
      result.innerHTML = `<p class="lookup-message">${lookupQuery ? d.lookupMissing : d.lookupEmpty}</p>`;
      $('#commission-code').setAttribute('aria-invalid', 'true'); return;
    }
    result.innerHTML = `<div class="lookup-result-heading"><div><strong><code>${partner.code}</code></strong><span class="lookup-scope">${monthLabel(selected)} · ${lang === 'en' ? 'USD' : 'CNY'}</span></div><button class="lookup-orders" type="button" data-lookup-orders>${d.lookupOrders}</button></div><dl class="lookup-values"><div><dt>${selected === 'all' ? d.period : d.monthly}</dt><dd>${money(partner.commission)}</dd></div><div><dt>${d.lookupLifetime}</dt><dd>${money(partner.lifetimeCommission)}</dd></div><div><dt>${d.customers}</dt><dd>${count(partner.customers)}</dd></div></dl>`;
  }
  function pagination(kind, p, pages, total) {
    const d = t(), attr = kind === 'order' ? 'data-order-page' : 'data-board-page';
    return `<button type="button" ${attr}="-1" ${p === 1 ? 'disabled' : ''}>${d.previous}</button><span>${(kind === 'order' ? d.orderPages : d.boardPages)(p, pages, count(total))}</span><button type="button" ${attr}="1" ${p === pages ? 'disabled' : ''}>${d.next}</button>`;
  }
  function detail(partner) {
    const d = t(), orders = partner.orders, pages = Math.max(1, Math.ceil(orders.length / orderPageSize));
    orderPage = Math.max(1, Math.min(orderPage, pages));
    const visible = orders.slice((orderPage - 1) * orderPageSize, orderPage * orderPageSize);
    const body = visible.map(o => `<tr><td data-label="${d.anonymous}"><code>${o.id}</code></td><td data-label="${d.date}">${o.date.slice(0, 10)}</td><td data-label="${d.type}">${o.first ? d.first : d.renewal}</td><td data-label="${d.paid}" class="align-right">${money(o.grossCny)}</td><td data-label="${d.share}" class="align-right">${money(o.commissionCny)}</td><td data-label="${d.status}">${o.refunded ? d.adjusted : d.counted}</td></tr>`).join('');
    return `<tr class="detail-row"><td colspan="5"><div class="detail-content"><div class="detail-heading"><strong>${partner.code} · ${d.details}</strong><button class="close-detail" type="button" data-close>${d.close}</button></div><div class="orders-wrap"><table class="orders-table"><thead><tr><th>${d.anonymous}</th><th>${d.date}</th><th>${d.type}</th><th class="align-right">${d.paid}</th><th class="align-right">${d.share}</th><th>${d.status}</th></tr></thead><tbody>${body || `<tr><td colspan="6">${d.noOrders}</td></tr>`}</tbody></table></div><div class="order-pages">${pagination('order', orderPage, pages, orders.length)}</div></div></td></tr>`;
  }
  function renderBoard() {
    const d = t(), all = selected === 'all', state = summarize(selected);
    const filtered = state.partners;
    const pages = Math.max(1, Math.ceil(filtered.length / boardPageSize));
    boardPage = Math.min(boardPage, pages);
    const start = (boardPage - 1) * boardPageSize;
    const visible = filtered.slice(start, start + boardPageSize);
    $('#ranking').innerHTML = visible.map((p, i) => `<tr class="partner-row ${expanded === p.code ? 'is-expanded' : ''}" data-code="${p.code}" tabindex="0" aria-expanded="${expanded === p.code}"><td class="rank-cell" data-label="${d.rank}"><span class="${start + i < 3 ? 'rank-top' : ''}">${state.partners.indexOf(p) + 1}</span></td><td class="partner-cell" data-label="${d.code}"><button type="button" class="code-button" aria-label="${d.view(p.code)}"><code>${p.code}</code></button></td><td class="number-cell" data-label="${d.customers}">${count(p.customers)}</td><td class="money-cell" data-period="${all ? d.periodShort : d.monthlyShort}" data-label="${all ? d.period : d.monthly}">${money(p.commission)}</td><td class="money-cell" data-lifetime="${d.lifetimeShort}" data-label="${d.lifetime}">${money(p.lifetimeCommission)}</td></tr>${expanded === p.code ? detail(p) : ''}`).join('') || `<tr><td colspan="5" class="empty-results">${d.noCodes}</td></tr>`;
    $('#board-pages').innerHTML = pagination('board', boardPage, pages, filtered.length);
  }
  function render() {
    const d = t(), state = summarize(selected), all = selected === 'all';
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'; document.title = d.pageTitle;
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = d[node.dataset.i18n];
    for (const button of document.querySelectorAll('[data-lang]')) button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
    $('#totals').setAttribute('aria-label', d.summary);
    $('#totals').innerHTML = `<div><div class="metric-label">${all ? d.grossAll : d.grossMonth} <span class="currency-unit">${lang === 'en' ? 'USD' : 'CNY'}</span></div><div class="metric-value">${money(state.gross)}</div><div class="metric-sub">${d.grossNote(count(state.current.length))}</div></div><div><div class="metric-label">${all ? d.commissionAll : d.commissionMonth} <span class="currency-unit">${lang === 'en' ? 'USD' : 'CNY'}</span></div><div class="metric-value">${money(state.commission)}</div><div class="metric-sub">${d.commissionNote}</div></div><div><div class="metric-label">${d.customerTotal}</div><div class="metric-value">${count(state.lifetimeCustomers)}</div><div class="metric-sub">${d.customerNote}</div></div>`;
    $('#meta').textContent = d.meta(count(data.codes.length), count(state.customers), all);
    $('#commission-heading').textContent = all ? d.period : d.monthly;
    $('#commission-code').placeholder = d.lookupPlaceholder;
    $('#month-select').innerHTML = ['all', '2026-09', '2026-08', '2026-07', '2026-06'].map(month => `<option value="${month}">${monthLabel(month)}</option>`).join('');
    $('#month-select').value = selected; renderBoard(); renderLookup();
  }
  function toggle(code) { expanded = expanded === code ? null : code; orderPage = 1; renderBoard(); }
  $('#month-select').addEventListener('change', event => { selected = event.target.value; expanded = null; orderPage = 1; boardPage = 1; render(); });
  $('#commission-form').addEventListener('submit', event => {
    event.preventDefault(); lookupQuery = $('#commission-code').value.trim().toUpperCase(); renderLookup();
  });
  $('#commission-code').addEventListener('input', () => { lookupQuery = null; renderLookup(); });
  $('#lookup-result').addEventListener('click', event => {
    if (!event.target.closest('[data-lookup-orders]') || !lookupQuery) return;
    const index = summarize(selected).partners.findIndex(p => p.code === lookupQuery);
    if (index < 0) return;
    boardPage = Math.floor(index / boardPageSize) + 1; expanded = lookupQuery; orderPage = 1; renderBoard();
    $(`.partner-row[data-code="${lookupQuery}"]`).scrollIntoView({block:'start'});
  });
  for (const button of document.querySelectorAll('[data-lang]')) button.addEventListener('click', () => {
    lang = button.dataset.lang; const url = new URL(location.href); url.searchParams.set('lang', lang); history.replaceState(null, '', url); render();
  });
  $('#board-pages').addEventListener('click', event => {
    const button = event.target.closest('[data-board-page]'); if (!button || button.disabled) return;
    boardPage += Number(button.dataset.boardPage); expanded = null; renderBoard(); $('#ranking-heading').scrollIntoView({block:'start'});
  });
  $('#ranking').addEventListener('click', event => {
    const paging = event.target.closest('[data-order-page]');
    if (paging) { if (!paging.disabled) { orderPage += Number(paging.dataset.orderPage); renderBoard(); } return; }
    if (event.target.closest('[data-close]')) { expanded = null; renderBoard(); return; }
    const row = event.target.closest('[data-code]'); if (row) toggle(row.dataset.code);
  });
  $('#ranking').addEventListener('keydown', event => {
    if (event.target.tagName === 'BUTTON' || !['Enter', ' '].includes(event.key)) return;
    const row = event.target.closest('[data-code]'); if (row) { event.preventDefault(); toggle(row.dataset.code); }
  });
  render();
})();
