const $ = (selector) => document.querySelector(selector);
const els = {
  countdown: $('#countdown'), turnout: $('#turnout'), members: $('#members'), tripCatalog: $('#tripCatalog'),
  loginPanel: $('#loginPanel'), loginForm: $('#loginForm'), voterSelect: $('#voterSelect'), voteSection: $('#voteSection'),
  helloName: $('#helloName'), topScore: $('#topScore'), ranking: $('#ranking'), saveVote: $('#saveVote'), saveHint: $('#saveHint'),
  savePanel: $('#savePanel'), logoutButton: $('#logoutButton'), resultsTitle: $('#resultsTitle'), resultsContent: $('#resultsContent'),
  sealed: $('#sealed'), adminSection: $('#adminSection'), adminToggle: $('#adminToggle'), adminForm: $('#adminForm'), toast: $('#toast'),
  closePanel: $('#closePanel'), adminClose: $('#adminClose'),
  navCta: $('.site-header .nav-cta'), heroVote: $('.hero-vote-button')
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let state;
let currentVoter = sessionStorage.getItem('tripVoter') || '';
let ranking = [];

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '發生錯誤');
  return data;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 2400);
}

async function load() {
  state = await request(`/api/state${currentVoter ? `?voter=${encodeURIComponent(currentVoter)}` : ''}`);
  if (currentVoter && !state.voters.includes(currentVoter)) {
    currentVoter = '';
    sessionStorage.removeItem('tripVoter');
  }
  render();
}

function render() {
  els.turnout.textContent = `${state.turnout.completed.length} / ${state.turnout.total}`;
  els.members.innerHTML = state.voters.map((name) => `<span class="member ${state.turnout.completed.includes(name) ? 'done' : ''}" title="${escapeHtml(name)}">${escapeHtml(name.slice(0, 2))}</span>`).join('');
  els.voterSelect.innerHTML = '<option value="">請選擇</option>' + state.voters.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  els.topScore.textContent = `${state.destinations.length} 分`;
  renderCountdown();
  renderCatalog();
  renderResults();

  const signedIn = Boolean(currentVoter);
  els.loginPanel.classList.toggle('hidden', signedIn);
  els.voteSection.classList.toggle('hidden', !signedIn);
  els.adminSection.classList.toggle('hidden', currentVoter !== '奕翔' || state.closed);
  els.closePanel.classList.toggle('hidden', !signedIn || state.closed);
  if (els.navCta) els.navCta.textContent = signedIn ? '我的排名' : '開始投票';
  if (els.heroVote) els.heroVote.textContent = signedIn ? '回到我的排名' : '開始投票';
  if (signedIn) {
    els.helloName.textContent = currentVoter;
    const saved = state.myVote?.ranking || [];
    const validSaved = saved.filter((id) => state.destinations.some((item) => item.id === id));
    ranking = [...validSaved, ...state.destinations.map((item) => item.id).filter((id) => !validSaved.includes(id))];
    els.saveHint.textContent = saved.length === state.destinations.length ? `上次更新：${formatTime(state.myVote.updatedAt)}` : '排名尚未送出';
    els.savePanel.classList.remove('is-dirty');
    els.saveVote.disabled = state.closed;
    renderRanking();
  }
}

function renderCountdown() {
  const distance = new Date(state.deadline).getTime() - Date.now();
  if (distance <= 0) { els.countdown.textContent = '投票已截止'; return; }
  const days = Math.floor(distance / 86400000);
  const hours = Math.floor((distance % 86400000) / 3600000);
  const minutes = Math.floor((distance % 3600000) / 60000);
  const seconds = Math.floor((distance % 60000) / 1000);
  els.countdown.textContent = `${days} 天 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderCatalog() {
  els.tripCatalog.innerHTML = state.destinations.map((item) => `<article class="trip-card">
    <div class="trip-image">${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}行程照片" loading="lazy">` : `<span>${item.emoji || '✈️'}</span>`}<span class="agency-badge">${escapeHtml(item.agency || '候選行程')}</span></div>
    <div class="trip-content">
      <div class="trip-topline"><span class="trip-name">${escapeHtml(item.name)}</span><span class="trip-meta">${escapeHtml(item.days || '天數未定')} · ${escapeHtml(item.departure || '出發地未定')}</span></div>
      <h3>${escapeHtml(item.title || item.name)}</h3>
      <p class="trip-summary">${escapeHtml(item.subtitle || '詳細內容請參考旅行社行程頁面')}</p>
      ${renderHighlights(item.highlights)}
      <div class="trip-footer"><div><span class="price-label">參考團費／每人</span><strong class="price">${formatPrice(item.price)}<small>${escapeHtml(item.priceNote || '依團期為準')}</small></strong></div>${item.url ? `<a class="reference-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">旅行團參考</a>` : ''}</div>
    </div>
  </article>`).join('');
}

function renderHighlights(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return `<div class="highlights"><strong>行程亮點</strong><ul class="highlight-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
}

function renderRanking() {
  const total = ranking.length;
  els.ranking.innerHTML = ranking.map((id, index) => {
    const item = state.destinations.find((destination) => destination.id === id);
    const place = index + 1;
    const facts = [item.days || '天數未定', item.departure || '出發地未定', formatPrice(item.price)];
    return `<article class="rank-card" data-id="${escapeHtml(item.id)}" data-place="${place}">
      <button class="drag-handle" type="button" aria-label="拖曳調整 ${escapeHtml(item.name)} 的名次，或用上下方向鍵移動"><i></i></button>
      <div class="rank-media">${item.image ? `<img class="rank-image" src="${escapeHtml(item.image)}" alt="" loading="lazy">` : '<div class="rank-image"></div>'}<span class="rank-number" data-place="${place}">${String(place).padStart(2, '0')}</span></div>
      <div class="rank-copy">
        <div class="rank-head"><strong>${escapeHtml(item.name)}</strong><span class="score-tag"><strong>${total - index}</strong><small>分</small></span></div>
        <span class="rank-title">${escapeHtml(item.title || item.subtitle || '')}</span>
        <ul class="rank-facts">${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul>
        ${item.url ? `<a class="rank-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">旅行團參考 <span aria-hidden="true">↗</span></a>` : ''}
      </div>
      <div class="move-buttons"><button type="button" data-move="up" aria-label="往上移" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-move="down" aria-label="往下移" ${index === total - 1 ? 'disabled' : ''}>↓</button></div>
    </article>`;
  }).join('');
}

function renderResults() {
  if (!state.closed || !state.results) return;
  els.resultsTitle.textContent = state.results.length ? `冠軍：${state.results[0].name}` : '尚無候選行程';
  els.sealed.textContent = '已開票';
  els.resultsContent.className = 'results-list';
  els.resultsContent.innerHTML = state.results.map((item, index) => `<div class="result-row"><span class="result-place">${index + 1}</span>${item.image ? `<img class="result-thumb" src="${escapeHtml(item.image)}" alt="">` : '<span></span>'}<div><strong>${escapeHtml(item.name)}</strong><br><small>${item.firsts} 張第一名票</small></div><span class="result-score">${item.score} 分</span></div>`).join('');
}

function formatPrice(value) {
  return Number.isFinite(Number(value)) ? `NT$${Number(value).toLocaleString('zh-TW')}` : '待確認';
}

function formatTime(value) {
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

/* ---------- 排名互動：拖曳、箭頭、鍵盤 ---------- */

const rankCards = () => [...els.ranking.querySelectorAll('.rank-card')];
const cardById = (id) => els.ranking.querySelector(`.rank-card[data-id="${CSS.escape(id)}"]`);

function buzz(duration) {
  try { navigator.vibrate?.(duration); } catch { /* 裝置不支援就略過 */ }
}

function markDirty() {
  els.savePanel.classList.add('is-dirty');
  els.saveHint.textContent = '順序已調整，記得按下送出';
}

// offsetTop 不受 transform 影響，動畫進行中量測也不會抖動。
function snapshotPositions() {
  const positions = new Map();
  rankCards().forEach((card) => positions.set(card.dataset.id, card.offsetTop));
  return positions;
}

function playFlip(before, duration = 220) {
  if (reduceMotion) return;
  rankCards().forEach((card) => {
    const previous = before.get(card.dataset.id);
    if (previous === undefined) return;
    const delta = previous - card.offsetTop;
    if (!delta) return;
    card.style.transition = 'none';
    card.style.transform = `translateY(${delta}px)`;
    requestAnimationFrame(() => {
      card.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1)`;
      card.style.transform = '';
    });
  });
}

function reorder(mutate) {
  const before = snapshotPositions();
  mutate();
  renderRanking();
  playFlip(before);
  markDirty();
}

function moveCard(id, direction) {
  const index = ranking.indexOf(id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ranking.length) return false;
  reorder(() => { [ranking[index], ranking[target]] = [ranking[target], ranking[index]]; });
  buzz(10);
  return true;
}

els.ranking.addEventListener('click', (event) => {
  const button = event.target.closest('[data-move]');
  if (!button) return;
  const card = button.closest('.rank-card');
  const { id } = card.dataset;
  if (!moveCard(id, button.dataset.move)) return;
  const next = cardById(id)?.querySelector(`[data-move="${button.dataset.move}"]`);
  if (next && !next.disabled) next.focus();
});

els.ranking.addEventListener('keydown', (event) => {
  if (!event.target.closest('.drag-handle')) return;
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const card = event.target.closest('.rank-card');
  const { id } = card.dataset;
  if (moveCard(id, event.key === 'ArrowUp' ? 'up' : 'down')) cardById(id)?.querySelector('.drag-handle')?.focus();
});

let drag = null;
let press = null;
let pressTimer = 0;
let autoScrollFrame = 0;

function cancelPress() {
  clearTimeout(pressTimer);
  pressTimer = 0;
  press = null;
}

function positionGhost(x, y) {
  drag.ghost.style.transform = `translate3d(${x - drag.grabX}px, ${y - drag.grabY}px, 0) scale(1.02) rotate(-.5deg)`;
}

function startDrag(card, point) {
  cancelPress();
  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);
  card.classList.add('drag-source');
  els.ranking.classList.add('is-dragging');
  document.body.classList.add('is-dragging-body');
  drag = {
    card, ghost, id: card.dataset.id, pointerId: point.pointerId,
    grabX: point.clientX - rect.left, grabY: point.clientY - rect.top, pointerY: point.clientY
  };
  positionGhost(point.clientX, point.clientY);
  buzz(14);
  autoScrollFrame = requestAnimationFrame(autoScrollStep);
}

function updateDropTarget(pointerY) {
  const localY = pointerY - els.ranking.getBoundingClientRect().top;
  let target = null;
  for (const card of rankCards()) {
    if (card === drag.card) continue;
    if (localY < card.offsetTop + card.offsetHeight / 2) { target = card; break; }
  }
  if (target === drag.card.nextElementSibling) return;
  const before = snapshotPositions();
  if (target) els.ranking.insertBefore(drag.card, target);
  else els.ranking.appendChild(drag.card);
  playFlip(before, 180);
  renumberCards();
  buzz(8);
}

function renumberCards() {
  const cards = rankCards();
  const total = cards.length;
  cards.forEach((card, index) => {
    const place = index + 1;
    card.dataset.place = place;
    const number = card.querySelector('.rank-number');
    number.textContent = String(place).padStart(2, '0');
    number.dataset.place = place;
    card.querySelector('.score-tag strong').textContent = total - index;
    const [up, down] = card.querySelectorAll('[data-move]');
    if (up) up.disabled = index === 0;
    if (down) down.disabled = index === total - 1;
  });
  if (!drag) return;
  const place = cards.indexOf(drag.card) + 1;
  const ghostNumber = drag.ghost.querySelector('.rank-number');
  ghostNumber.textContent = String(place).padStart(2, '0');
  ghostNumber.dataset.place = place;
  drag.ghost.dataset.place = place;
  drag.ghost.querySelector('.score-tag strong').textContent = total - place + 1;
}

function autoScrollStep() {
  if (!drag) return;
  const margin = 90;
  const y = drag.pointerY;
  let delta = 0;
  if (y < margin) delta = -Math.ceil((margin - y) / 6);
  else if (y > window.innerHeight - margin) delta = Math.ceil((y - (window.innerHeight - margin)) / 6);
  if (delta) {
    window.scrollBy(0, delta);
    updateDropTarget(y);
  }
  autoScrollFrame = requestAnimationFrame(autoScrollStep);
}

function endDrag(commit) {
  if (!drag) return;
  const { card, ghost, id } = drag;
  const order = rankCards().map((element) => element.dataset.id);
  cancelAnimationFrame(autoScrollFrame);
  autoScrollFrame = 0;
  drag = null;
  card.classList.remove('drag-source');
  els.ranking.classList.remove('is-dragging');
  document.body.classList.remove('is-dragging-body');

  const changed = commit && order.join('|') !== ranking.join('|');
  if (commit) ranking = order;
  renderRanking();
  if (changed) markDirty();

  const landing = cardById(id);
  if (landing && !reduceMotion) {
    const rect = landing.getBoundingClientRect();
    ghost.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s ease';
    ghost.style.boxShadow = '0 4px 12px rgba(45,58,53,0)';
    requestAnimationFrame(() => { ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) scale(1) rotate(0deg)`; });
    setTimeout(() => ghost.remove(), 200);
    if (changed) {
      landing.classList.add('is-moving');
      setTimeout(() => landing.classList.remove('is-moving'), 560);
    }
  } else {
    ghost.remove();
  }
}

els.ranking.addEventListener('pointerdown', (event) => {
  if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const card = event.target.closest('.rank-card');
  if (!card) return;
  const point = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
  if (event.target.closest('.drag-handle')) {
    event.preventDefault();
    startDrag(card, point);
    return;
  }
  if (event.target.closest('a, button')) return;
  if (event.pointerType === 'mouse') { startDrag(card, point); return; }
  // 觸控：長按卡片任一處也能開始拖曳，避免只有握把可用。
  press = { card, point, x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(() => { if (press) startDrag(press.card, press.point); }, 320);
});

window.addEventListener('pointermove', (event) => {
  if (!drag) {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelPress();
    return;
  }
  if (event.pointerId !== drag.pointerId) return;
  drag.pointerY = event.clientY;
  positionGhost(event.clientX, event.clientY);
  updateDropTarget(event.clientY);
});

window.addEventListener('pointerup', (event) => {
  cancelPress();
  if (drag && event.pointerId === drag.pointerId) endDrag(true);
});
window.addEventListener('pointercancel', (event) => {
  cancelPress();
  if (drag && event.pointerId === drag.pointerId) endDrag(false);
});
// 拖曳中攔下捲動與長按選單，否則手機上手指一動就變成捲頁。
document.addEventListener('touchmove', (event) => { if (drag) event.preventDefault(); }, { passive: false });
els.ranking.addEventListener('contextmenu', (event) => { if (drag || press) event.preventDefault(); });
window.addEventListener('scroll', () => { if (!drag) cancelPress(); }, { passive: true });

/* ---------- 其他互動 ---------- */

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const voter = els.voterSelect.value;
    const data = await request('/api/auth', { method: 'POST', body: JSON.stringify({ voter }) });
    currentVoter = voter; state = data.state;
    sessionStorage.setItem('tripVoter', voter);
    render();
    els.voteSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`歡迎，${voter}`);
  } catch (error) { toast(error.message); }
});

els.logoutButton.addEventListener('click', () => {
  currentVoter = ''; ranking = [];
  sessionStorage.removeItem('tripVoter');
  load();
});

els.saveVote.addEventListener('click', async () => {
  try {
    const data = await request('/api/vote', { method: 'POST', body: JSON.stringify({ voter: currentVoter, ranking }) });
    state = data.state; render(); toast('排名已儲存，可以在截止前修改');
  } catch (error) { toast(error.message); }
});

els.adminToggle.addEventListener('click', () => els.adminForm.classList.toggle('hidden'));
els.adminForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const body = { voter: currentVoter, name: $('#newName').value, subtitle: $('#newSubtitle').value, url: $('#newUrl').value };
    const data = await request('/api/destinations', { method: 'POST', body: JSON.stringify(body) });
    state = data.state; els.adminForm.reset(); els.adminForm.classList.add('hidden'); render(); toast('新行程已加入票選');
  } catch (error) { toast(error.message); }
});

els.adminClose.addEventListener('click', async () => {
  if (!window.confirm('確定要立即鎖票並公布結果嗎？這個動作無法復原。')) return;
  try {
    const data = await request('/api/close', { method: 'POST', body: JSON.stringify({ voter: currentVoter }) });
    state = data.state; render(); toast('已手動開票');
  } catch (error) { toast(error.message); }
});

// 首圖上的「開始投票」還看得見時收起導覽列按鈕，畫面上只會有一顆。
if (els.navCta && els.heroVote && 'IntersectionObserver' in window) {
  els.navCta.classList.add('is-tucked');
  new IntersectionObserver(
    (entries) => entries.forEach((entry) => els.navCta.classList.toggle('is-tucked', entry.isIntersecting)),
    { rootMargin: '-80px 0px 0px 0px' }
  ).observe(els.heroVote);
}

setInterval(() => { if (state) { const wasClosed = state.closed; renderCountdown(); if (!wasClosed && Date.now() >= new Date(state.deadline).getTime()) load(); } }, 1000);
load().catch(() => toast('無法載入投票資料'));
