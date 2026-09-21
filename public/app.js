const $ = (selector) => document.querySelector(selector);
const els = {
  countdown: $('#countdown'), turnout: $('#turnout'), members: $('#members'), tripCatalog: $('#tripCatalog'),
  loginPanel: $('#loginPanel'), loginForm: $('#loginForm'), voterSelect: $('#voterSelect'), voteSection: $('#voteSection'),
  helloName: $('#helloName'), topScore: $('#topScore'), ranking: $('#ranking'), saveVote: $('#saveVote'), saveHint: $('#saveHint'),
  logoutButton: $('#logoutButton'), resultsTitle: $('#resultsTitle'), resultsContent: $('#resultsContent'), sealed: $('#sealed'),
  adminSection: $('#adminSection'), adminToggle: $('#adminToggle'), adminForm: $('#adminForm'), toast: $('#toast')
};

let state;
let currentVoter = sessionStorage.getItem('tripVoter') || '';
let ranking = [];
let draggingId = '';

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
  if (signedIn) {
    els.helloName.textContent = currentVoter;
    const saved = state.myVote?.ranking || [];
    const validSaved = saved.filter((id) => state.destinations.some((item) => item.id === id));
    ranking = [...validSaved, ...state.destinations.map((item) => item.id).filter((id) => !validSaved.includes(id))];
    els.saveHint.textContent = saved.length === state.destinations.length ? `上次更新：${formatTime(state.myVote.updatedAt)}` : '排名尚未送出';
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
    return `<article class="rank-card" draggable="true" data-id="${escapeHtml(item.id)}">
      <span class="rank-number">${String(index + 1).padStart(2, '0')}</span>
      ${item.image ? `<img class="rank-image" src="${escapeHtml(item.image)}" alt="" loading="lazy">` : `<div class="rank-image"></div>`}
      <div class="rank-copy"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.title || item.subtitle || '')}</span><p>${escapeHtml(item.subtitle || '詳細內容請參考旅行社行程頁面')}</p><small>${escapeHtml(item.days || '天數未定')} · ${escapeHtml(item.departure || '出發地未定')} · ${formatPrice(item.price)}</small>${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">旅行團參考</a>` : ''}</div>
      <span class="score-tag"><strong>${total - index}</strong><small> 分</small></span>
      <div class="move-buttons"><button data-move="up" aria-label="往上移" ${index === 0 ? 'disabled' : ''}>↑</button><button data-move="down" aria-label="往下移" ${index === total - 1 ? 'disabled' : ''}>↓</button></div>
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

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const voter = els.voterSelect.value;
    const data = await request('/api/auth', { method: 'POST', body: JSON.stringify({ voter }) });
    currentVoter = voter; state = data.state;
    sessionStorage.setItem('tripVoter', voter);
    render();
    $('#voteSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`歡迎，${voter}`);
  } catch (error) { toast(error.message); }
});

els.logoutButton.addEventListener('click', () => {
  currentVoter = ''; ranking = [];
  sessionStorage.removeItem('tripVoter');
  load();
});

els.ranking.addEventListener('click', (event) => {
  const button = event.target.closest('[data-move]');
  if (!button) return;
  const card = button.closest('.rank-card');
  const index = ranking.indexOf(card.dataset.id);
  const target = button.dataset.move === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ranking.length) return;
  [ranking[index], ranking[target]] = [ranking[target], ranking[index]];
  renderRanking();
});

els.ranking.addEventListener('dragstart', (event) => { draggingId = event.target.closest('.rank-card')?.dataset.id || ''; event.target.closest('.rank-card')?.classList.add('dragging'); });
els.ranking.addEventListener('dragend', (event) => { event.target.closest('.rank-card')?.classList.remove('dragging'); draggingId = ''; });
els.ranking.addEventListener('dragover', (event) => event.preventDefault());
els.ranking.addEventListener('drop', (event) => {
  event.preventDefault();
  const targetId = event.target.closest('.rank-card')?.dataset.id;
  if (!draggingId || !targetId || draggingId === targetId) return;
  const from = ranking.indexOf(draggingId), to = ranking.indexOf(targetId);
  ranking.splice(to, 0, ranking.splice(from, 1)[0]);
  renderRanking();
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

setInterval(() => { if (state) { const wasClosed = state.closed; renderCountdown(); if (!wasClosed && Date.now() >= new Date(state.deadline).getTime()) load(); } }, 1000);
load().catch(() => toast('無法載入投票資料'));
