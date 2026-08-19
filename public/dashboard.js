window.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (!token) return window.location.replace('login.html');
  const $ = (id) => document.getElementById(id);
  const ui = {
    name: $('userDisplayName'), handle: $('userHandle'), college: $('userCollege'), collegeSep: $('collegeSep'), count: $('countNumber'), nodes: $('connectionNodes'), detail: $('nodeDetail'),
    status: $('dashboardStatus'), statusMessage: $('dashboardStatusMessage'), retry: $('retryDashboardBtn'), logout: $('logoutBtn'), handshake: $('encounterStage'), protocol: $('protocolStatus'),
    generated: $('generatedCodeDisplay'), generate: $('generateCodeBtn'), copy: $('copyCodeBtn'), timer: $('codeTimer'), input: $('codeInput'), paste: $('pasteBtn'), connect: $('connectBtn'), success: $('successView'), successName: $('successName')
  };

  const safetyModal = $('safetyModal');
  const safetyModalTitle = $('safetyModalTitle');
  const safetyModalMessage = $('safetyModalMessage');
  const closeSafetyModalBtn = $('closeSafetyModalBtn');

  function showSafetyNotice(title, message) {
    if (!safetyModal) return;
    if (safetyModalTitle) safetyModalTitle.textContent = title;
    if (safetyModalMessage) safetyModalMessage.textContent = message;
    safetyModal.hidden = false;
  }

  function hideSafetyNotice() {
    if (safetyModal) safetyModal.hidden = true;
  }

  closeSafetyModalBtn?.addEventListener('click', hideSafetyNotice);
  safetyModal?.addEventListener('click', (e) => {
    if (e.target === safetyModal) hideSafetyNotice();
  });

  let profileRequest = 0, listRequest = 0, generationRequest = 0, expiry = null, timer = null, profileFailed = false, listFailed = false, recentItems = [];
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const readJson = async (response) => { try { return await response.json(); } catch { return {}; } };
  const clearSession = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.removeItem('userId'); sessionStorage.clear(); window.location.replace('login.html'); };

  function setProtocol(state, message) {
    if (ui.handshake) ui.handshake.dataset.protocolState = state;
    if (ui.protocol) {
      ui.protocol.textContent = message;
      ui.protocol.hidden = true;
    }
  }
  function messageFor(result, fallback) { const messages = { DUPLICATE_PAIR: 'You are already connected with this participant.', SELF_HANDSHAKE: 'You cannot use your own code.', CODE_NOT_FOUND: 'Invalid code.', CODE_EXPIRED: 'Code expired.', CODE_ALREADY_USED: 'Code already used.', VALIDATION_ERROR: 'Check the code.', TOO_MANY_ATTEMPTS: 'Too many attempts.' }; return messages[result?.error?.code || result?.code] || fallback; }
  function stateFor(result) { return ({ DUPLICATE_PAIR: 'duplicate', SELF_HANDSHAKE: 'self', CODE_NOT_FOUND: 'invalid', CODE_EXPIRED: 'expired', CODE_ALREADY_USED: 'duplicate', TOO_MANY_ATTEMPTS: 'rate-limited' })[result?.error?.code || result?.code] || 'failure'; }
  function updateStatus() { if (!ui.status) return; ui.status.hidden = !(profileFailed || listFailed); if (!ui.status.hidden && ui.statusMessage) ui.statusMessage.textContent = 'Could not load data. Check connection and retry.'; }
  function setLoadFailure(type, value) { if (type === 'profile') profileFailed = value; else listFailed = value; updateStatus(); }
  function animateCount(value) { if (!ui.count) return; const from = Number(ui.count.textContent) || 0, to = Number(value) || 0, start = performance.now(); const frame = (now) => { const progress = Math.min(1, (now - start) / 380), current = Math.round(from + (to - from) * (1 - Math.pow(1 - progress, 3))); ui.count.textContent = String(current); if (progress < 1) requestAnimationFrame(frame); }; requestAnimationFrame(frame); }
  function renderRecent(items) {
    recentItems = Array.isArray(items) ? items : [];
    if (!ui.nodes) return;
    if (!recentItems.length) { ui.nodes.innerHTML = '<p class="connections-empty">No connections yet.</p>'; if (ui.detail) ui.detail.hidden = true; return; }
    ui.nodes.innerHTML = recentItems.slice(0, 10).map((item, index) => {
      const name = escapeHTML(item.full_name || item.name || item.username || 'Participant'), username = item.username ? `@${escapeHTML(item.username)}` : 'Participant', department = escapeHTML(item.department || item.dept || 'TechFest'), when = escapeHTML(item.when || item.time || 'Recently');
      return `<button class="connection-row" type="button" data-connection-index="${index}" aria-pressed="false" aria-label="Show details for ${name}"><span class="connection-check" aria-hidden="true">✓</span><span class="connection-info"><strong class="connection-name">${name}</strong><span class="connection-handle">${username}</span></span><span class="connection-detail"><span class="connection-dept">${department}</span><span class="connection-time">${when}</span></span><span class="connection-badge">Verified</span></button>`;
    }).join('');
  }
  function showConnectionDetail(index) { const item = recentItems[index]; if (!item || !ui.detail) return; const name = item.full_name || item.name || item.username || 'Participant', username = item.username ? `@${item.username} · ` : '', department = item.department || item.dept || 'TechFest', when = item.when || item.time || 'Recently'; ui.nodes?.querySelectorAll('.connection-row').forEach((node, nodeIndex) => node.setAttribute('aria-pressed', String(nodeIndex === index))); ui.detail.textContent = `${name} — ${username}${department} · ${when}`; ui.detail.hidden = false; }
  async function loadProfile() {
    const id = ++profileRequest;
    try {
      const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }), result = await readJson(response);
      if (id !== profileRequest) return;
      if (response.status === 401 || response.status === 403) return clearSession();
      if (!response.ok) return setLoadFailure('profile', true);
      const user = result.data?.user || result.user || result.data || {}, username = user.username || 'participant', college = user.college || user.college_name || user.department || user.dept;
      if (ui.name) ui.name.textContent = user.full_name || user.fullName || user.name || username;
      if (ui.handle) ui.handle.textContent = `@${username}`;
      if (ui.college) { ui.college.hidden = !college; if (college) ui.college.textContent = college; }
      if (ui.collegeSep) ui.collegeSep.hidden = !college;
      const isAdmin = Boolean(user.isAdmin || user.is_admin);
      if (isAdmin) {
        window.location.replace('admin.html');
        return;
      }
      animateCount(user.handshakeCount ?? user.handshake_count ?? 0); setLoadFailure('profile', false);
    } catch { if (id === profileRequest) setLoadFailure('profile', true); }
  }
  async function loadRecent() {
    const id = ++listRequest;
    try {
      const response = await fetch('/api/handshakes', { headers: { Authorization: `Bearer ${token}` } }), result = await readJson(response);
      if (id !== listRequest) return;
      if (response.status === 401 || response.status === 403) return clearSession();
      if (!response.ok) return setLoadFailure('list', true);
      renderRecent((result.data || result).recent || []); setLoadFailure('list', false);
    } catch { if (id === listRequest) setLoadFailure('list', true); }
  }
  async function retryDashboard() { if (ui.retry) { ui.retry.disabled = true; ui.retry.textContent = 'Retrying…'; } await Promise.all([loadProfile(), loadRecent()]); if (ui.retry) { ui.retry.disabled = false; ui.retry.textContent = 'Retry'; } }
  function clearTimer() { if (timer) clearInterval(timer); timer = null; expiry = null; }
  function expireToken() { clearTimer(); if (ui.generated) ui.generated.value = 'EXPIRED'; if (ui.copy) ui.copy.disabled = true; if (ui.timer) ui.timer.textContent = 'Code expired.'; setProtocol('expired', 'Code expired.'); }
  function resolveExpiry(data) { const date = Date.parse(data?.expires_at); if (Number.isFinite(date)) return date; const seconds = Number(data?.expires_in_seconds); return Number.isFinite(seconds) && seconds > 0 ? Date.now() + seconds * 1000 : null; }
  function startTimer(expiresAt) { clearTimer(); expiry = expiresAt; const tick = () => { const remaining = expiry - Date.now(); if (remaining <= 0) return expireToken(); if (ui.timer) ui.timer.textContent = `Expires in ${Math.ceil(remaining / 1000)}s`; }; tick(); timer = setInterval(tick, 250); }
  async function generateToken() {
    if (!ui.generated || ui.generate?.disabled) return;
    const id = ++generationRequest; clearTimer();
    ui.generated.value = 'WAITING…';
    ui.success?.classList.remove('show');
    if (ui.copy) { ui.copy.disabled = true; ui.copy.textContent = 'COPY CODE'; }
    if (ui.generate) {
      ui.generate.disabled = true;
      ui.generate.innerHTML = '<span class="spinner" style="display:inline-block; border-color: rgba(255,255,255,0.4); border-top-color:#FFFFFF;"></span> <span>GENERATING…</span>';
    }
    setProtocol('generating', 'Generating code…');
    try {
      const response = await fetch('/api/handshakes/generate-code', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }), result = await readJson(response);
      if (id !== generationRequest) return;
      if (response.status === 401 || response.status === 403) return clearSession();
      const expiresAt = resolveExpiry(result.data);
      if (!response.ok || !result.success || !result.data?.code || !expiresAt || expiresAt <= Date.now()) {
        ui.generated.value = 'UNAVAILABLE';
        setProtocol(response.ok ? 'failure' : stateFor(result), 'Could not generate code.');
        showSafetyNotice('SERVER ERROR', 'Could not generate code. Try again.');
        return;
      }
      ui.generated.value = result.data.code;
      if (ui.copy) ui.copy.disabled = false;
      setProtocol('active', 'Code ready.');
      startTimer(expiresAt);
    } catch {
      if (id === generationRequest) {
        ui.generated.value = 'UNAVAILABLE';
        setProtocol('failure', 'Service offline.');
        showSafetyNotice('SERVER ERROR', 'Could not connect to server.');
      }
    } finally {
      if (id === generationRequest && ui.generate) {
        ui.generate.disabled = false;
        ui.generate.innerHTML = '<span>GENERATE CODE</span>';
      }
    }
  }
  async function copyToken() {
    const code = ui.generated?.value.trim(); if (!code || ['······', 'WAITING…', 'EXPIRED', 'UNAVAILABLE'].includes(code)) return; if (expiry && expiry <= Date.now()) return expireToken();
    try { setProtocol('copying', 'Copying code…'); if (!navigator.clipboard) throw new Error(); await navigator.clipboard.writeText(code); if (ui.copy) ui.copy.textContent = 'COPIED'; setProtocol('active', 'Code copied.'); setTimeout(() => { if (ui.copy && !ui.copy.disabled) ui.copy.textContent = 'COPY CODE'; }, 1200); }
    catch { setProtocol('failure', 'Clipboard unavailable.'); }
  }
  async function pasteToken() { try { if (!navigator.clipboard) throw new Error(); const text = await navigator.clipboard.readText(); if (ui.input && text) { ui.input.value = text.trim().toUpperCase(); ui.input.dispatchEvent(new Event('input')); ui.input.focus(); } } catch { setProtocol('failure', 'Clipboard unavailable.'); } }

  async function connectToken() {
    const code = ui.input?.value.trim().toUpperCase();
    if (!code || !ui.connect || ui.connect.disabled) return;

    // Safety Check 1: Self Connection Guard
    const activeCode = ui.generated?.value.trim().toUpperCase();
    if (activeCode && activeCode !== '······' && activeCode !== 'EXPIRED' && activeCode !== 'UNAVAILABLE' && code === activeCode) {
      showSafetyNotice(
        'SELF CONNECTION',
        'You cannot use your own code. Enter another participant\'s code.'
      );
      return;
    }

    ui.connect.disabled = true;
    ui.connect.innerHTML = '<span class="spinner" style="display:inline-block; border-color: rgba(255,255,255,0.4); border-top-color:#FFFFFF;"></span> <span>CONNECTING…</span>';
    setProtocol('connecting', 'Verifying connection…');

    try {
      const response = await fetch('/api/handshakes/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const result = await readJson(response);

      if (response.status === 401 || response.status === 403) return clearSession();

      if (!response.ok || !result.success) {
        const errCode = result?.error?.code || result?.code;
        if (errCode === 'SELF_HANDSHAKE') {
          showSafetyNotice('SELF CONNECTION', 'You cannot use your own code. Enter another participant\'s code.');
        } else if (errCode === 'DUPLICATE_PAIR' || errCode === 'CODE_ALREADY_USED') {
          showSafetyNotice('ALREADY CONNECTED', 'You are already connected with this participant.');
        } else if (errCode === 'CODE_EXPIRED') {
          showSafetyNotice('CODE EXPIRED', 'This code has expired. Request a new code.');
        } else if (errCode === 'TOO_MANY_ATTEMPTS') {
          showSafetyNotice('TOO MANY ATTEMPTS', 'Please wait a minute before trying again.');
        } else {
          showSafetyNotice('INVALID CODE', 'Code not found. Please check and try again.');
        }
        return;
      }

      const other = result.data?.full_name || result.data?.name || result.data?.username || 'Participant';
      if (ui.successName) ui.successName.textContent = `Connected with ${other}`;
      ui.success?.classList.add('show');
      setProtocol('success', 'Connection verified.');
      await Promise.all([loadProfile(), loadRecent()]);

      setTimeout(() => {
        ui.success?.classList.remove('show');
        if (ui.input) ui.input.value = '';
        if (ui.connect) { ui.connect.disabled = true; ui.connect.innerHTML = '<span>CONNECT PARTICIPANT</span>'; }
        setProtocol('idle', 'Ready to connect.');
      }, 4000);

    } catch {
      showSafetyNotice('SERVER ERROR', 'Could not connect to server. Try again.');
    } finally {
      if (ui.connect && !ui.success?.classList.contains('show')) {
        ui.connect.disabled = false;
        ui.connect.innerHTML = '<span>CONNECT PARTICIPANT</span>';
      }
    }
  }

  ui.logout?.addEventListener('click', clearSession); ui.retry?.addEventListener('click', retryDashboard); ui.generate?.addEventListener('click', generateToken); ui.copy?.addEventListener('click', copyToken); ui.paste?.addEventListener('click', pasteToken); ui.connect?.addEventListener('click', connectToken);
  ui.nodes?.addEventListener('click', (event) => { const node = event.target.closest('[data-connection-index]'); if (node) showConnectionDetail(Number(node.dataset.connectionIndex)); });
  ui.input?.addEventListener('input', () => { ui.input.value = ui.input.value.toUpperCase(); if (ui.connect) ui.connect.disabled = !ui.input.value.trim(); if (ui.input.value.trim()) setProtocol('entry', 'Code ready.'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && expiry) startTimer(expiry); });

  const createForm = $('createParticipantForm');
  const createBtn = $('createParticipantBtn');
  const formStatus = $('adminFormStatus');
  const adminCreatedModal = $('adminCreatedModal');
  const closeAdminCreatedBtn = $('closeAdminCreatedBtn');

  function showAdminFormStatus(message, isSuccess = false) {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.className = `admin-form-status ${isSuccess ? 'success' : 'error'}`;
    formStatus.hidden = false;
  }

  function hideAdminFormStatus() {
    if (formStatus) formStatus.hidden = true;
  }

  closeAdminCreatedBtn?.addEventListener('click', () => {
    if (adminCreatedModal) adminCreatedModal.hidden = true;
  });
  adminCreatedModal?.addEventListener('click', (e) => {
    if (e.target === adminCreatedModal) adminCreatedModal.hidden = true;
  });

  createForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAdminFormStatus();

    const fullName = $('adminFullName')?.value.trim();
    const email = $('adminEmail')?.value.trim();
    const college = $('adminCollege')?.value.trim();
    const department = $('adminDept')?.value.trim() || undefined;
    const username = $('adminUsername')?.value.trim() || undefined;
    const password = $('adminPassword')?.value || undefined;

    if (!fullName || !email || !college) {
      showAdminFormStatus('Full Name, Email, and College are required fields.');
      return;
    }

    if (createBtn) {
      createBtn.disabled = true;
      createBtn.innerHTML = '<span class="spinner" style="display:inline-block; border-color: rgba(255,255,255,0.4); border-top-color:#FFFFFF;"></span> <span>CREATING ACCOUNT…</span>';
    }

    try {
      const payload = { fullName, email, college };
      if (department) payload.department = department;
      if (username) payload.username = username;
      if (password) payload.password = password;

      const response = await fetch('/api/admin/participants', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await readJson(response);

      if (response.status === 401 || response.status === 403) {
        showAdminFormStatus('Admin authorization required. Access denied.');
        return;
      }

      if (!response.ok || !result.success) {
        const msg = result.message || result.error?.message || 'Could not create participant account.';
        showAdminFormStatus(msg);
        return;
      }

      const p = result.data?.participant || {};
      const initialPw = result.data?.initial_password || '';

      if ($('createdUsernameVal')) $('createdUsernameVal').textContent = `@${p.username}`;
      if ($('createdPasswordVal')) $('createdPasswordVal').textContent = initialPw;
      if ($('createdNameVal')) $('createdNameVal').textContent = p.full_name || fullName;
      if ($('createdCollegeVal')) $('createdCollegeVal').textContent = p.college || college;

      if (adminCreatedModal) adminCreatedModal.hidden = false;
      createForm.reset();

    } catch {
      showAdminFormStatus('Network error. Failed to reach the server.');
    } finally {
      if (createBtn) {
        createBtn.disabled = false;
        createBtn.innerHTML = '<span>CREATE PARTICIPANT ACCOUNT</span>';
      }
    }
  });

  Promise.all([loadProfile(), loadRecent()]); window.setInterval(loadRecent, 30000);
});
