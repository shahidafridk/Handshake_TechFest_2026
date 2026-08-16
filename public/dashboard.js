// CSP-compliant Logout Listener attached via DOM ID
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userId');
      sessionStorage.clear();
      window.location.href = 'login.html';
    });
  }
});

window.addEventListener('DOMContentLoaded', async () => {

  // ---------- DOM ELEMENTS ----------
  const userDisplayNameEl = document.getElementById('userDisplayName');
  const userHandleEl = document.getElementById('userHandle');
  const pendingList = document.getElementById('pendingList');
  const recentList = document.getElementById('recentList');
  const pendingCountEl = document.getElementById('pendingCount');
  const countNumberEl = document.getElementById('countNumber');
  const glyph = document.getElementById('glyph');
  const dashboardStatus = document.getElementById('dashboardStatus');
  const dashboardStatusMessage = document.getElementById('dashboardStatusMessage');
  const retryDashboardBtn = document.getElementById('retryDashboardBtn');
  let profileLoadFailed = false;
  let dashboardDataLoadFailed = false;
  let profileRequestId = 0;
  let dashboardDataRequestId = 0;

  const modalBackdrop = document.getElementById('modalBackdrop');
  const modal = modalBackdrop ? modalBackdrop.querySelector('.modal') : null;
  const appShell = document.querySelector('.app');
  const openModalBtn = document.getElementById('openModalBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  let lastFocusedElement = null;

  // Tabs
  const tabMyCode = document.getElementById('tabMyCode');
  const tabEnterCode = document.getElementById('tabEnterCode');
  const myCodeView = document.getElementById('myCodeView');
  const enterCodeView = document.getElementById('enterCodeView');

  // Generator Elements
  const generatedCodeDisplay = document.getElementById('generatedCodeDisplay');
  const generateCodeBtn = document.getElementById('generateCodeBtn');
  const codeTimerEl = document.getElementById('codeTimer');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const protocolStatus = document.getElementById('protocolStatus');

  // Input / Connect Elements
  const codeInput = document.getElementById('codeInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const connectBtn = document.getElementById('connectBtn');
  const successView = document.getElementById('successView');
  const successName = document.getElementById('successName');
  const hasDualCodeMode = Boolean(tabMyCode && tabEnterCode && myCodeView && enterCodeView);

  // ---------- AUTH CHECK ----------
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  // ---------- HELPER FUNCTIONS ----------
  function updateIdentityUI(username, fullName) {
    const handle = username || 'user';
    const displayName = fullName || (handle !== 'user' ? handle.charAt(0).toUpperCase() + handle.slice(1) : 'User');

    if (userDisplayNameEl) userDisplayNameEl.textContent = displayName;
    if (userHandleEl) userHandleEl.textContent = `@${handle}`;
  }

  function animateCount(from, to, duration) {
    if (!countNumberEl) return;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(from + (to - from) * eased);
      countNumberEl.textContent = val;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function setProtocolState(state, message) {
    if (modal) modal.dataset.protocolState = state;
    if (protocolStatus && message) protocolStatus.textContent = message;
  }

  function updateDashboardStatus() {
    if (!dashboardStatus) return;

    const hasLoadFailure = profileLoadFailed || dashboardDataLoadFailed;
    dashboardStatus.hidden = !hasLoadFailure;

    if (hasLoadFailure && dashboardStatusMessage) {
      dashboardStatusMessage.textContent = 'We couldn\'t load dashboard data. Check your connection and try again.';
    }
  }

  function setDashboardLoadFailure(type) {
    if (type === 'profile') profileLoadFailed = true;
    if (type === 'data') dashboardDataLoadFailed = true;
    updateDashboardStatus();
  }

  function clearDashboardLoadFailure(type) {
    if (type === 'profile') profileLoadFailed = false;
    if (type === 'data') dashboardDataLoadFailed = false;
    updateDashboardStatus();
  }

  function clearSessionAndRedirect() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userId');
    sessionStorage.clear();
    window.location.href = 'login.html';
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  // ---------- 1. FETCH USER PROFILE ----------
  async function fetchUserProfile() {
    const requestId = ++profileRequestId;
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (requestId !== profileRequestId) return;

      if (response.ok) {
        const result = await response.json();
        if (requestId !== profileRequestId) return;
        const userObj = result.data?.user || result.user || result.data || {};
        
        const username = userObj.username;
        const fullName = userObj.full_name || userObj.fullName || userObj.name;
        const dbHandshakeCount = userObj.handshakeCount ?? userObj.handshake_count ?? 0;

        updateIdentityUI(username, fullName);
        animateCount(0, dbHandshakeCount, 800);
        clearDashboardLoadFailure('profile');
      } else if (response.status === 401 || response.status === 403) {
        clearSessionAndRedirect();
      } else {
        setDashboardLoadFailure('profile');
      }
    } catch (err) {
      if (requestId !== profileRequestId) return;
      setDashboardLoadFailure('profile');
    }
  }

  // ---------- 2. FETCH DASHBOARD DATA ----------
  async function fetchDashboardData() {
    const requestId = ++dashboardDataRequestId;
    try {
      const response = await fetch('/api/handshakes', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (requestId !== dashboardDataRequestId) return;

      if (response.ok) {
        const result = await response.json();
        if (requestId !== dashboardDataRequestId) return;
        const data = result.data || result;
        
        renderPendingList(data.pending || []);
        renderRecentList(data.recent || []);
        clearDashboardLoadFailure('data');
      } else if (response.status === 401 || response.status === 403) {
        clearSessionAndRedirect();
      } else {
        setDashboardLoadFailure('data');
      }
    } catch (err) {
      if (requestId !== dashboardDataRequestId) return;
      setDashboardLoadFailure('data');
    }
  }

  async function retryDashboardData() {
    if (retryDashboardBtn) {
      retryDashboardBtn.disabled = true;
      retryDashboardBtn.textContent = 'Retrying…';
    }

    try {
      await Promise.all([fetchUserProfile(), fetchDashboardData()]);
    } finally {
      if (retryDashboardBtn) {
        retryDashboardBtn.disabled = false;
        retryDashboardBtn.textContent = 'Retry';
      }
    }
  }

  function renderPendingList(items) {
    if (!pendingList || !pendingCountEl) return;
    pendingList.innerHTML = '';
    pendingCountEl.textContent = items.length;

    if (items.length === 0) {
      pendingList.innerHTML = '<div class="empty-note">No pending requests right now.</div>';
      return;
    }

    items.forEach(p => {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.id = p.id;
      const nameStr = p.full_name || p.name || p.username || 'User';
      const initials = nameStr.slice(0, 2).toUpperCase();
      const safeInitials = escapeHTML(initials);
      const safeName = escapeHTML(nameStr);
      const safeDepartment = escapeHTML(p.department || p.dept || 'Attendee');
      
      row.innerHTML = `
        <div class="avatar">${safeInitials}</div>
        <div class="row-info">
          <div class="row-name">${safeName}</div>
          <div class="row-dept">${safeDepartment}</div>
        </div>
        <div class="row-actions">
          <button class="icon-btn reject" title="Decline"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M1 1L13 13M13 1L1 13"/></svg></button>
          <button class="icon-btn accept" title="Accept"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7l3.5 3.5L12 3"/></svg></button>
        </div>
      `;
      pendingList.appendChild(row);

      const rejectBtn = row.querySelector('.reject');
      const acceptBtn = row.querySelector('.accept');
      rejectBtn.setAttribute('aria-label', `Decline handshake request from ${nameStr}`);
      acceptBtn.setAttribute('aria-label', `Accept handshake request from ${nameStr}`);
      rejectBtn.addEventListener('click', () => handlePendingAction(p.id, row, 'reject'));
      acceptBtn.addEventListener('click', () => handlePendingAction(p.id, row, 'accept'));
    });
  }

  async function handlePendingAction(id, rowEl, action) {
    rowEl.classList.add('leaving');
    try {
      const response = await fetch(`/api/handshakes/pending/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (response.ok) {
        setTimeout(() => { fetchUserProfile(); fetchDashboardData(); }, 400);
      } else {
        rowEl.classList.remove('leaving');
      }
    } catch (err) {
      rowEl.classList.remove('leaving');
    }
  }

  function renderRecentList(items) {
    if (!recentList) return;
    recentList.innerHTML = '';
    if (items.length === 0) {
      recentList.innerHTML = '<div class="empty-note">No recent handshakes yet.</div>';
      return;
    }

    items.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'timeline-row';
      row.style.animationDelay = (i * 0.04) + 's';
      const safeName = escapeHTML(r.full_name || r.name || r.username || 'Attendee');
      const safeDepartment = escapeHTML(r.department || r.dept || 'Attendee');
      const safeWhen = escapeHTML(r.when || r.time || 'Recently');
      row.innerHTML = `
        <div class="check"><svg viewBox="0 0 12 12" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5l2.5 2.5L10 3"/></svg></div>
        <div class="timeline-info">
          <div class="timeline-name">${safeName}</div>
          <div class="timeline-meta">${safeDepartment}</div>
        </div>
        <div class="timeline-when">${safeWhen}</div>
      `;
      recentList.appendChild(row);
    });
  }

  // ---------- 3. MODAL, TABS & CODE GENERATOR LOGIC ----------
  let timerInterval = null;
  let generateRequestId = 0;

  function resetGenerateButton() {
    if (generateCodeBtn) {
      generateCodeBtn.disabled = false;
      generateCodeBtn.textContent = 'Generate New Code';
    }
  }

  function cancelPendingGeneration() {
    generateRequestId += 1;
    resetGenerateButton();
  }

  function switchTab(tab) {
    if (!hasDualCodeMode) {
      if (successView) successView.classList.remove('show');
      setProtocolState('entry', 'Enter a token received from a nearby participant.');
      return;
    }

    if (tab === 'myCode') {
      tabMyCode.classList.add('active');
      tabEnterCode.classList.remove('active');
      myCodeView.style.display = 'block';
      enterCodeView.style.display = 'none';
      successView.classList.remove('show');
      generateAndDisplayCode();
    } else {
      cancelPendingGeneration();
      tabEnterCode.classList.add('active');
      tabMyCode.classList.remove('active');
      myCodeView.style.display = 'none';
      enterCodeView.style.display = 'block';
      successView.classList.remove('show');
      setProtocolState('entry', 'Enter a token received from a nearby participant.');
      if (timerInterval) clearInterval(timerInterval);
      if (codeInput) {
        codeInput.value = '';
        setTimeout(() => codeInput.focus(), 150);
      }
    }
  }

  if (tabMyCode) tabMyCode.addEventListener('click', () => switchTab('myCode'));
  if (tabEnterCode) tabEnterCode.addEventListener('click', () => switchTab('enterCode'));

  async function generateAndDisplayCode() {
    if (!generatedCodeDisplay || generateCodeBtn?.disabled) return;
    const requestId = ++generateRequestId;

    generatedCodeDisplay.value = '...';
    if (copyCodeBtn) {
      copyCodeBtn.disabled = true;
      copyCodeBtn.textContent = 'Copy Code';
    }
    setProtocolState('generating', 'Issuing a temporary handshake token.');
    if (generateCodeBtn) {
      generateCodeBtn.disabled = true;
      generateCodeBtn.textContent = 'Generating…';
    }

    try {
      const response = await fetch('/api/handshakes/generate-code', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      if (requestId !== generateRequestId) return;

      if (response.ok && result.success && result.data?.code) {
        generatedCodeDisplay.value = result.data.code;
        if (copyCodeBtn) copyCodeBtn.disabled = false;
        setProtocolState('active', 'Token active. Share it with someone nearby.');
        startCodeTimer(45);
      } else {
        generatedCodeDisplay.value = 'ERROR';
        setProtocolState('error', result.message || 'Could not issue a handshake token.');
        alert(result.message || 'Could not generate handshake code.');
      }
    } catch (err) {
      if (requestId !== generateRequestId) return;
      generatedCodeDisplay.value = 'ERROR';
      setProtocolState('error', 'Server error connecting to code generator.');
      alert('Server error connecting to code generator.');
    } finally {
      if (requestId === generateRequestId) resetGenerateButton();
    }
  }

  function startCodeTimer(seconds) {
    if (timerInterval) clearInterval(timerInterval);

    let remaining = seconds;
    if (codeTimerEl) codeTimerEl.textContent = `Valid for ${remaining}s`;

    timerInterval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timerInterval);
        if (codeTimerEl) codeTimerEl.textContent = 'Code expired. Tap below to generate a new one.';
        if (generatedCodeDisplay) generatedCodeDisplay.value = 'EXPIRED';
        if (copyCodeBtn) copyCodeBtn.disabled = true;
        setProtocolState('expired', 'Token expired. Generate a new token to continue.');
      } else {
        if (codeTimerEl) codeTimerEl.textContent = `Valid for ${remaining}s`;
      }
    }, 1000);
  }

  function openModal() {
    if (!modalBackdrop) return;
    lastFocusedElement = document.activeElement;
    if (appShell) appShell.inert = true;
    modalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    switchTab('myCode');
    setTimeout(() => (tabMyCode || codeInput || closeModalBtn)?.focus(), 0);
  }

  function closeModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
    if (appShell) appShell.inert = false;
    cancelPendingGeneration();
    if (timerInterval) clearInterval(timerInterval);
    if (glyph) glyph.classList.remove('linked');
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  }

  if (generateCodeBtn) generateCodeBtn.addEventListener('click', generateAndDisplayCode);
  if (copyCodeBtn && generatedCodeDisplay) {
    copyCodeBtn.addEventListener('click', async () => {
      const code = generatedCodeDisplay.value.trim();
      if (!code || ['...', 'ERROR', 'EXPIRED'].includes(code)) return;

      try {
        if (!navigator.clipboard) throw new Error('Clipboard access not supported.');
        await navigator.clipboard.writeText(code);
        copyCodeBtn.textContent = 'Copied';
        setProtocolState('active', 'Token copied. Share it with someone nearby.');
        setTimeout(() => {
          if (!copyCodeBtn.disabled) copyCodeBtn.textContent = 'Copy Code';
        }, 1400);
      } catch (err) {
        setProtocolState('copy-error', 'Clipboard access was unavailable. Select the token to copy it.');
      }
    });
  }
  if (openModalBtn) openModalBtn.addEventListener('click', openModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalBackdrop && modalBackdrop.classList.contains('open')) closeModal();
    if (e.key !== 'Tab' || !modalBackdrop || !modalBackdrop.classList.contains('open')) return;

    const focusable = [...modalBackdrop.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter(el => el.getClientRects().length > 0);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // ENTER CODE VALIDATION & CONNECT
  if (codeInput && connectBtn) {
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase();
      connectBtn.disabled = codeInput.value.trim().length < 4;
      if (!connectBtn.disabled) setProtocolState('entry', 'Token ready. Connect when both participants are present.');
    });
  }

  if (pasteBtn && codeInput) {
    pasteBtn.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard) {
          alert('Clipboard access not supported.');
          return;
        }
        const text = await navigator.clipboard.readText();
        if (text) {
          codeInput.value = text.toUpperCase().trim();
          if (connectBtn) connectBtn.disabled = codeInput.value.length < 4;
          if (codeInput.value.length >= 4) setProtocolState('entry', 'Token pasted. Connect when both participants are present.');
          codeInput.focus();
        }
      } catch (err) {
        if (protocolStatus) {
          setProtocolState('copy-error', 'Clipboard access was unavailable. Enter the token manually.');
        } else {
          alert('Clipboard access was unavailable. Please enter the code manually.');
        }
      }
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      if (connectBtn.disabled) return;
      const code = codeInput.value.trim();

      connectBtn.disabled = true;
      connectBtn.textContent = 'Connecting…';
      if (glyph) glyph.classList.add('linked');
      setProtocolState('verifying', 'Verifying connection protocol.');

      try {
        const response = await fetch('/api/handshakes/connect', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ code })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          const connectedUser = result.data?.full_name || result.data?.name || result.data?.username || 'Attendee';

          if (enterCodeView) enterCodeView.style.display = 'none';
          if (successView) successView.classList.add('show');
          if (successName) successName.textContent = `Connected with ${connectedUser}`;
          setProtocolState('connected', 'Connection verified and added to your network.');

          fetchUserProfile();
          fetchDashboardData();

          setTimeout(() => { closeModal(); }, 1500);
        } else {
          setProtocolState('error', result.message || 'Invalid Handshake Code or connection failed.');
          alert(result.message || 'Invalid Handshake Code or connection failed.');
          connectBtn.disabled = false;
          connectBtn.textContent = 'Connect';
          if (glyph) glyph.classList.remove('linked');
        }
      } catch (err) {
        setProtocolState('error', 'Could not reach backend database.');
        alert('Could not reach backend database.');
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
        if (glyph) glyph.classList.remove('linked');
      }
    });
  }

  if (retryDashboardBtn) {
    retryDashboardBtn.addEventListener('click', retryDashboardData);
  }

  // ---------- INITIALIZATION ----------
  await fetchUserProfile();
  await fetchDashboardData();

  // Auto-poll for pending requests every 10 seconds
  setInterval(fetchDashboardData, 10000);
});
