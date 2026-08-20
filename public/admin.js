document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  if (!token) {
    window.location.replace('login.html');
    return;
  }

  // Helper Selectors
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  let currentPage = 1;
  let currentSearch = '';

  // API Fetch Wrapper
  async function apiFetch(url, options = {}) {
    const headers = {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, { ...options, headers });
      let data;
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (response.status === 401) {
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        window.location.replace('login.html');
        return null;
      }

      if (response.status === 403) {
        window.location.replace('index.html');
        return null;
      }

      return { response, data };
    } catch (err) {
      console.error('API Fetch Network Error:', err);
      showToast('Network connection error', false);
      return null;
    }
  }

  // ─── AUTH & ADMIN ROLE GUARD ───────────────────────────────
  async function initAuth() {
    const res = await apiFetch('/api/auth/me');
    if (!res || !res.response.ok) {
      localStorage.removeItem('token');
      window.location.replace('login.html');
      return;
    }

    const user = res.data.data?.user || res.data.user;
    const isAdmin = Boolean(user?.is_admin || user?.isAdmin);

    if (!user || !isAdmin) {
      window.location.replace('index.html');
      return;
    }

    if ($('adminUserHandle')) {
      $('adminUserHandle').textContent = `@${user.username}`;
    }

    loadOverview();
  }

  // ─── NAVIGATION & MOBILE DRAWER ───────────────────────────
  const mobileMenuBtn = $('mobileMenuBtn');
  const adminSidebar = $('adminSidebar');
  const sidebarBackdrop = $('sidebarBackdrop');

  function toggleSidebar(open) {
    const isOpen = open !== undefined ? open : !adminSidebar?.classList.contains('open');
    if (isOpen) {
      adminSidebar?.classList.add('open');
      document.body.classList.add('sidebar-open');
      if (sidebarBackdrop) sidebarBackdrop.hidden = false;
    } else {
      adminSidebar?.classList.remove('open');
      document.body.classList.remove('sidebar-open');
      if (sidebarBackdrop) sidebarBackdrop.hidden = true;
    }
  }

  mobileMenuBtn?.addEventListener('click', () => toggleSidebar());
  sidebarBackdrop?.addEventListener('click', () => toggleSidebar(false));

  const navBtns = $$('.admin-nav-btn, .mobile-nav-item');
  const tabPanels = $$('.admin-tab-content');

  function switchTab(targetTab) {
    navBtns.forEach((b) => {
      if (b.dataset.tab === targetTab) {
        b.classList.add('active');
        b.setAttribute('aria-selected', 'true');
      } else {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      }
    });

    tabPanels.forEach((p) => {
      p.classList.remove('active');
      p.hidden = true;
    });

    const targetPanel = $(`sec-${targetTab}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
      targetPanel.hidden = false;
    }

    toggleSidebar(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (targetTab === 'overview') loadOverview();
    else if (targetTab === 'participants') loadParticipants();
    else if (targetTab === 'audit') loadAuditLogs();
  }

  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab) switchTab(btn.dataset.tab);
    });
  });

  // ─── 1. OVERVIEW DATA ─────────────────────────────────────
  async function loadOverview() {
    const topParticipantsBody = $('topParticipantsTableBody');

    if (topParticipantsBody) {
      topParticipantsBody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Loading top networkers…</td></tr>';
    }

    const res = await apiFetch('/api/admin/dashboard');
    if (!res || !res.response.ok) return;

    const data = res.data.data || {};
    if ($('statTotalParticipants')) $('statTotalParticipants').textContent = data.total_participants ?? 0;
    if ($('statActiveUsers')) $('statActiveUsers').textContent = data.active_users ?? 0;
    if ($('statTotalHandshakes')) $('statTotalHandshakes').textContent = data.verified_handshakes ?? 0;
    if ($('statTodaysHandshakes')) $('statTodaysHandshakes').textContent = data.todays_handshakes ?? 0;

    // Top Networkers Table
    if (topParticipantsBody) {
      const participants = data.top_participants || [];
      if (participants.length === 0) {
        topParticipantsBody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">No participant data available</td></tr>';
      } else {
        topParticipantsBody.innerHTML = participants
          .map(
            (p) => `
          <tr>
            <td class="col-rank"><strong>#${p.rank}</strong></td>
            <td><strong>${escapeHtml(p.full_name)}</strong><br><span class="text-muted font-mono" style="font-size: 11px;">@${escapeHtml(p.username)}</span></td>
            <td>${escapeHtml(p.college)}</td>
            <td class="col-num"><span class="badge-count text-orange">${p.handshake_count}</span></td>
          </tr>
        `
          )
          .join('');
      }
    }
  }

  // Overview "Add User" shortcut card — navigates to the Create tab
  $('overviewAddUserBtn')?.addEventListener('click', () => {
    const createNavBtn = document.querySelector('.admin-nav-btn[data-tab="create"]');
    if (createNavBtn) createNavBtn.click();
  });

  // ─── 2. PARTICIPANTS TAB ──────────────────────────────────
  async function loadParticipants() {
    const tbody = $('participantsTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Loading participants…</td></tr>';
    }

    let url = `/api/admin/participants?page=${currentPage}&limit=10`;
    if (currentSearch) url += `&q=${encodeURIComponent(currentSearch)}`;

    const res = await apiFetch(url);
    if (!res || !res.response.ok) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load participants</td></tr>';
      return;
    }

    const data = res.data.data || {};
    const participants = data.participants || [];
    const pagination = data.pagination || { page: 1, total_pages: 1, total: 0 };

    if (tbody) {
      if (participants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No participants found matching search filter</td></tr>';
      } else {
        tbody.innerHTML = participants
          .map((p) => {
            return `
            <tr>
              <td><strong class="font-mono">@${escapeHtml(p.username)}</strong></td>
              <td><strong>${escapeHtml(p.full_name)}</strong></td>
              <td><span class="font-mono text-muted">${escapeHtml(p.phone || 'N/A')}</span></td>
              <td>${escapeHtml(p.college || 'N/A')}</td>
              <td><span class="badge-count">${p.handshake_count || 0}</span></td>
              <td>
                <div style="display: flex; gap: 6px; align-items: center;">
                  <button class="btn btn-xs btn-secondary action-edit-btn"
                          data-username="${escapeHtml(p.username)}"
                          data-name="${escapeHtml(p.full_name)}"
                          data-phone="${escapeHtml(p.phone || '')}"
                          data-college="${escapeHtml(p.college || '')}"
                          data-dept="${escapeHtml(p.department || '')}">
                    EDIT
                  </button>
                  <button class="btn btn-xs btn-secondary action-reset-btn"
                          data-username="${escapeHtml(p.username)}" data-name="${escapeHtml(p.full_name)}">
                    RESET PW
                  </button>
                  <button class="btn btn-xs btn-danger action-delete-btn"
                          data-username="${escapeHtml(p.username)}">
                    DELETE
                  </button>
                </div>
              </td>
            </tr>
          `;
          })
          .join('');
      }
    }

    if ($('paginationInfo')) {
      $('paginationInfo').textContent = `Showing Page ${pagination.page} of ${pagination.total_pages} (${pagination.total} total)`;
    }
    if ($('currentPageVal')) $('currentPageVal').textContent = pagination.page;
    if ($('prevPageBtn')) $('prevPageBtn').disabled = pagination.page <= 1;
    if ($('nextPageBtn')) $('nextPageBtn').disabled = pagination.page >= pagination.total_pages;
  }

  // Search & Refresh listeners
  $('adminSearchInput')?.addEventListener('input', (e) => {
    currentSearch = e.target.value.trim();
    currentPage = 1;
    loadParticipants();
  });

  $('refreshParticipantsBtn')?.addEventListener('click', () => loadParticipants());

  $('prevPageBtn')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadParticipants();
    }
  });

  $('nextPageBtn')?.addEventListener('click', () => {
    currentPage++;
    loadParticipants();
  });

  // Table Action Delegate (Reset Password / Delete)
  $('participantsTableBody')?.addEventListener('click', (e) => {

    const editBtn = e.target.closest('.action-edit-btn');
    if (editBtn) {
      const username = editBtn.dataset.username;
      const fullName = editBtn.dataset.name || '';
      const phone = editBtn.dataset.phone || '';
      const college = editBtn.dataset.college || '';
      const dept = editBtn.dataset.dept || '';

      if ($('editOriginalUsername')) $('editOriginalUsername').value = username;
      if ($('editFullName')) $('editFullName').value = fullName;
      if ($('editPhone')) $('editPhone').value = phone;
      if ($('editCollege')) $('editCollege').value = college;
      if ($('editDept')) $('editDept').value = dept;

      if ($('editFormAlert')) $('editFormAlert').hidden = true;

      const editModal = $('editParticipantModal');
      if (editModal) editModal.hidden = false;
      return;
    }

    const resetBtn = e.target.closest('.action-reset-btn');
    if (resetBtn) {
      const username = resetBtn.dataset.username;
      const fullName = resetBtn.dataset.name || username;

      if ($('resetTargetUsername')) $('resetTargetUsername').value = username;
      if ($('resetTargetFullName')) $('resetTargetFullName').value = fullName;
      if ($('resetTargetUserVal')) $('resetTargetUserVal').textContent = `@${username}`;
      if ($('resetPasswordInput')) $('resetPasswordInput').value = '';
      if ($('resetFormAlert')) $('resetFormAlert').hidden = true;

      const resetModal = $('resetPasswordModal');
      if (resetModal) resetModal.hidden = false;
      return;
    }

    const deleteBtn = e.target.closest('.action-delete-btn');
    if (deleteBtn) {
      const username = deleteBtn.dataset.username;
      showConfirmModal(
        'Delete Participant Account',
        `Are you sure you want to permanently DELETE participant account @${username}? This action cannot be undone.`,
        async () => {
          const res = await apiFetch(`/api/admin/participants/${username}`, { method: 'DELETE' });
          if (res && res.response.ok) {
            showToast(`Participant @${username} deleted successfully.`, true);
            loadParticipants();
          } else {
            showToast(res?.data?.message || 'Deletion failed.', false);
          }
        }
      );
    }
  });

  // ─── LIVE USERNAME DUPLICATION CHECKER ─────────────────────
  let usernameCheckDebounce = null;
  function setupLiveUsernameCheck(inputEl, feedbackEl, submitBtnEl, getExcludeUsername = () => '') {
    if (!inputEl || !feedbackEl) return;

    inputEl.addEventListener('input', () => {
      const rawVal = inputEl.value;
      const val = rawVal.trim();
      clearTimeout(usernameCheckDebounce);

      if (!val) {
        feedbackEl.className = 'input-feedback';
        feedbackEl.textContent = '';
        if (submitBtnEl) submitBtnEl.disabled = false;
        return;
      }

      const validFormat = /^[a-zA-Z0-9_-]+$/.test(val);
      if (!validFormat) {
        feedbackEl.className = 'input-feedback invalid';
        feedbackEl.textContent = '✖ Only letters, numbers, _, and - allowed';
        if (submitBtnEl) submitBtnEl.disabled = true;
        return;
      }

      const exclude = getExcludeUsername() || '';
      if (exclude && val.toLowerCase() === exclude.toLowerCase()) {
        feedbackEl.className = 'input-feedback available';
        feedbackEl.textContent = '✔ Current username';
        if (submitBtnEl) submitBtnEl.disabled = false;
        return;
      }

      feedbackEl.className = 'input-feedback checking';
      feedbackEl.textContent = 'Checking availability…';

      usernameCheckDebounce = setTimeout(async () => {
        let url = `/api/admin/participants/check-username?username=${encodeURIComponent(val)}`;
        if (exclude) url += `&excludeUsername=${encodeURIComponent(exclude)}`;

        const res = await apiFetch(url, { method: 'GET' });
        if (res && res.response.ok) {
          const isAvailable = res.data.data?.available;
          if (isAvailable) {
            feedbackEl.className = 'input-feedback available';
            feedbackEl.textContent = `✔ Username @${val} is available`;
            if (submitBtnEl) submitBtnEl.disabled = false;
          } else {
            feedbackEl.className = 'input-feedback taken';
            feedbackEl.textContent = `✖ Username @${val} is already taken`;
            if (submitBtnEl) submitBtnEl.disabled = true;
          }
        }
      }, 250);
    });
  }

  // Setup live username check for Add User form
  const consoleFullNameInput = $('consoleFullName');
  const consoleUsernameInput = $('consoleUsername');
  const consoleUsernameFeedback = $('consoleUsernameFeedback');
  const consoleCreateBtn = $('consoleCreateBtn');
  let userHasManuallyEditedUsername = false;

  setupLiveUsernameCheck(consoleUsernameInput, consoleUsernameFeedback, consoleCreateBtn);

  consoleUsernameInput?.addEventListener('input', (e) => {
    if (e.isTrusted) {
      userHasManuallyEditedUsername = true;
    }
  });

  consoleFullNameInput?.addEventListener('input', () => {
    if (userHasManuallyEditedUsername && consoleUsernameInput?.value.trim()) return;
    const nameVal = consoleFullNameInput.value.trim();
    if (!nameVal) {
      if (!userHasManuallyEditedUsername && consoleUsernameInput) {
        consoleUsernameInput.value = '';
        consoleUsernameInput.dispatchEvent(new Event('input'));
      }
      return;
    }
    const cleanName = nameVal.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const parts = cleanName.split(/\s+/).filter(Boolean);
    let suggestedUsername = '';
    if (parts.length === 1) {
      suggestedUsername = parts[0];
    } else if (parts.length > 1) {
      suggestedUsername = `${parts[0]}_${parts[parts.length - 1]}`;
    }
    if (consoleUsernameInput && suggestedUsername) {
      consoleUsernameInput.value = suggestedUsername;
      consoleUsernameInput.dispatchEvent(new Event('input'));
    }
  });

  // ─── EDIT PARTICIPANT MODAL HANDLERS ─────────────────────
  const editModal = $('editParticipantModal');
  const closeEditModalBtn = $('closeEditModalBtn');
  const cancelEditModalBtn = $('cancelEditModalBtn');
  const editForm = $('editParticipantForm');

  function hideEditModal() {
    if (editModal) editModal.hidden = true;
    if ($('editFormAlert')) $('editFormAlert').hidden = true;
  }

  closeEditModalBtn?.addEventListener('click', hideEditModal);
  cancelEditModalBtn?.addEventListener('click', hideEditModal);

  editForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = $('editFormAlert');
    const saveBtn = $('saveEditBtn');
    const username = $('editOriginalUsername')?.value;

    const fullName = $('editFullName')?.value.trim();
    const phone = $('editPhone')?.value.trim();
    const college = $('editCollege')?.value.trim();
    const department = $('editDept')?.value.trim();

    if (!fullName) {
      if (alertEl) {
        alertEl.className = 'admin-form-status error';
        alertEl.textContent = 'Full Name is required.';
        alertEl.hidden = false;
      }
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
    }
    if (alertEl) alertEl.hidden = true;

    const payload = {
      fullName,
      phone,
      college,
      department,
    };

    const res = await apiFetch(`/api/admin/participants/${username}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'SAVE CHANGES';
    }

    if (res && res.response.ok) {
      showToast(`Participant @${username} updated successfully!`, true);
      hideEditModal();
      loadParticipants();
    } else {
      const errorMsg = res?.data?.message || res?.data?.error?.message || 'Failed to update participant account.';
      if (alertEl) {
        alertEl.className = 'admin-form-status error';
        alertEl.textContent = errorMsg;
        alertEl.hidden = false;
      }
      showToast(errorMsg, false);
    }
  });

  // ─── RESET PASSWORD MODAL HANDLERS ─────────────────────
  const resetModal = $('resetPasswordModal');
  const closeResetModalBtn = $('closeResetModalBtn');
  const cancelResetModalBtn = $('cancelResetModalBtn');
  const resetForm = $('resetPasswordForm');

  function hideResetModal() {
    if (resetModal) resetModal.hidden = true;
    if ($('resetFormAlert')) $('resetFormAlert').hidden = true;
  }

  closeResetModalBtn?.addEventListener('click', hideResetModal);
  cancelResetModalBtn?.addEventListener('click', hideResetModal);

  function generateSmartPassword(fullName) {
    const cleanStr = (fullName || '').trim();
    const words = cleanStr.split(/\s+/).filter(Boolean);

    let chosenWord = '';

    if (words.length >= 2) {
      const secondWordClean = words[1].replace(/[^a-zA-Z0-9]/g, '');
      if (secondWordClean.length >= 3) {
        chosenWord = secondWordClean;
      } else {
        chosenWord = words[0].replace(/[^a-zA-Z0-9]/g, '');
      }
    } else if (words.length === 1) {
      chosenWord = words[0].replace(/[^a-zA-Z0-9]/g, '');
    }

    if (!chosenWord || chosenWord.length === 0) {
      chosenWord = 'User';
    }

    chosenWord = chosenWord.charAt(0).toUpperCase() + chosenWord.slice(1);
    const random3Digit = Math.floor(100 + Math.random() * 900);
    return `${chosenWord}@${random3Digit}`;
  }

  $('autoGenResetPassBtn')?.addEventListener('click', () => {
    const fullName = $('resetTargetFullName')?.value || '';
    const generatedPw = generateSmartPassword(fullName);
    if ($('resetPasswordInput')) $('resetPasswordInput').value = generatedPw;
  });

  resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = $('resetFormAlert');
    const saveBtn = $('saveResetBtn');
    const username = $('resetTargetUsername')?.value;
    const fullName = $('resetTargetFullName')?.value || username;
    const password = $('resetPasswordInput')?.value.trim();

    if (!password || password.length < 6) {
      if (alertEl) {
        alertEl.className = 'admin-form-status error';
        alertEl.textContent = 'Password must be at least 6 characters.';
        alertEl.hidden = false;
      }
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Updating…';
    }
    if (alertEl) alertEl.hidden = true;

    const res = await apiFetch(`/api/admin/participants/${username}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'UPDATE PASSWORD';
    }

    if (res && res.response.ok) {
      const updatedPw = res.data.data?.new_password || password;
      hideResetModal();
      showCreatedModal(`@${username}`, updatedPw, fullName, 'Password Updated Successfully');
      showToast(`Password updated successfully for @${username}.`, true);
    } else {
      const errorMsg = res?.data?.message || res?.data?.error?.message || 'Password update failed.';
      if (alertEl) {
        alertEl.className = 'admin-form-status error';
        alertEl.textContent = errorMsg;
        alertEl.hidden = false;
      }
      showToast(errorMsg, false);
    }
  });

  // ─── 3. CREATE PARTICIPANT FORM ───────────────────────────
  const autoGenBtn = $('autoGenPassBtn');
  autoGenBtn?.addEventListener('click', () => {
    const fullName = $('consoleFullName')?.value || '';
    const generatedPw = generateSmartPassword(fullName);
    if ($('consolePassword')) $('consolePassword').value = generatedPw;
  });

  // Strict Phone number restriction (digits only)
  const consolePhoneInput = $('consolePhone');
  consolePhoneInput?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
  });

  // Real-time Email format validation feedback
  const consoleEmailInput = $('consoleEmail');
  const consoleEmailFeedback = $('consoleEmailFeedback');
  consoleEmailInput?.addEventListener('input', () => {
    const val = consoleEmailInput.value.trim();
    if (!val) {
      if (consoleEmailFeedback) consoleEmailFeedback.textContent = '';
      return;
    }
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    if (consoleEmailFeedback) {
      consoleEmailFeedback.className = isValid ? 'input-feedback valid' : 'input-feedback invalid';
      consoleEmailFeedback.textContent = isValid ? '✓ Valid email format' : '⚠ Please enter a valid email (e.g. user@domain.com)';
    }
  });

  const createForm = $('consoleCreateParticipantForm');
  createForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formAlert = $('createFormAlert');
    if (formAlert) formAlert.hidden = true;

    const fullName = $('consoleFullName')?.value.trim();
    const username = $('consoleUsername')?.value.trim();
    const password = $('consolePassword')?.value;
    const phone = $('consolePhone')?.value.trim() || undefined;
    const email = $('consoleEmail')?.value.trim() || undefined;
    const college = $('consoleCollege')?.value.trim() || undefined;
    const department = $('consoleDept')?.value.trim() || undefined;

    if (!fullName || !username || !password) {
      showFormStatus(formAlert, 'Full Name, Username, and Password are required.', false);
      return;
    }

    if (phone && !/^\d{7,15}$/.test(phone)) {
      showFormStatus(formAlert, 'Phone number must contain between 7 and 15 digits only.', false);
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFormStatus(formAlert, 'Please enter a valid email address (e.g. user@domain.com).', false);
      return;
    }

    const createBtn = $('consoleCreateBtn');
    if (createBtn) {
      createBtn.disabled = true;
      createBtn.textContent = 'Creating Account…';
    }

    try {
      const payload = { fullName, username, password };
      if (phone) payload.phone = phone;
      if (email) payload.email = email;
      if (college) payload.college = college;
      if (department) payload.department = department;

      const res = await apiFetch('/api/admin/participants', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res || !res.response.ok) {
        showFormStatus(formAlert, res?.data?.message || res?.data?.error?.message || 'Account creation failed.', false);
        return;
      }

      const p = res.data.data?.participant || {};
      const initialPw = res.data.data?.initial_password || password;

      showCreatedModal(p.username || username, initialPw, p.full_name || fullName, 'User Added Successfully');
      showToast(`Account @${username} created successfully.`, true);
      createForm.reset();
      userHasManuallyEditedUsername = false;
      if (consoleUsernameFeedback) {
        consoleUsernameFeedback.className = 'input-feedback';
        consoleUsernameFeedback.textContent = '';
      }
      if (consoleEmailFeedback) {
        consoleEmailFeedback.className = 'input-feedback';
        consoleEmailFeedback.textContent = '';
      }
    } catch {
      showFormStatus(formAlert, 'Network error while creating participant account.', false);
    } finally {
      if (createBtn) {
        createBtn.disabled = false;
        createBtn.innerHTML = `
          <svg class="admin-icon" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>
          <span>ADD USER</span>
        `;
      }
    }
  });

  // Modal Handlers
  $('closeCreatedModalBtn')?.addEventListener('click', () => {
    if ($('consoleCreatedModal')) $('consoleCreatedModal').hidden = true;
  });

  $('closeCreatedModalDoneBtn')?.addEventListener('click', () => {
    if ($('consoleCreatedModal')) $('consoleCreatedModal').hidden = true;
  });

  // Clipboard Copy Buttons
  $$('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const targetEl = $(targetId);
      if (targetEl) {
        const text = targetEl.textContent.replace(/^@/, '');
        navigator.clipboard.writeText(text);
        const originalText = btn.textContent;
        btn.textContent = 'COPIED!';
        setTimeout(() => (btn.textContent = originalText), 2000);
      }
    });
  });



  // ─── 5. CSV IMPORT ─────────────────────────────────────────
  $('csvImportForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = $('importAlert');
    if (alertEl) alertEl.hidden = true;

    const fileInput = $('csvFileInput');
    if (!fileInput || !fileInput.files.length) {
      showFormStatus(alertEl, 'Please select a CSV file to upload.', false);
      return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const importBtn = $('startImportBtn');
    if (importBtn) {
      importBtn.disabled = true;
      importBtn.textContent = 'Processing Import…';
    }

    try {
      const res = await apiFetch('/api/admin/import', {
        method: 'POST',
        body: formData,
      });

      if (!res || !res.response.ok) {
        showFormStatus(alertEl, res?.data?.message || 'CSV Import failed.', false);
        return;
      }

      const summary = res.data.data?.summary || {};
      if ($('importCreatedCnt')) $('importCreatedCnt').textContent = summary.created || 0;
      if ($('importSkippedCnt')) $('importSkippedCnt').textContent = summary.skipped || 0;
      if ($('importBatchId')) $('importBatchId').textContent = summary.batch_id || 'N/A';

      if ($('importResultsPanel')) $('importResultsPanel').hidden = false;
      showToast('CSV import processed successfully.', true);
      showFormStatus(alertEl, 'CSV Import processed successfully.', true);
    } catch {
      showFormStatus(alertEl, 'Network error during CSV import.', false);
    } finally {
      if (importBtn) {
        importBtn.disabled = false;
        importBtn.innerHTML = `
          <svg class="admin-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>UPLOAD & PROCESS IMPORT</span>
        `;
      }
    }
  });

  // ─── 6. EXPORT CREDENTIALS ────────────────────────────────
  $('exportForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = $('exportAlert');
    if (alertEl) alertEl.hidden = true;

    const batchId = $('exportBatchIdInput')?.value.trim();
    if (!batchId) {
      showFormStatus(alertEl, 'Please enter a valid Batch ID.', false);
      return;
    }

    try {
      const response = await fetch(`/api/admin/credentials/export?batchId=${encodeURIComponent(batchId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        showFormStatus(alertEl, 'Export failed. Verify the Batch ID is valid and exists.', false);
        return;
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `credentials_batch_${batchId.substring(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      showToast('Credentials CSV downloaded successfully.', true);
    } catch {
      showFormStatus(alertEl, 'Network error during credentials export.', false);
    }
  });

  // ─── 7. AUDIT LOGS ────────────────────────────────────────
  async function loadAuditLogs() {
    const tbody = $('auditTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Loading audit logs…</td></tr>';

    const res = await apiFetch('/api/admin/audit-logs');
    if (!res || !res.response.ok) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Failed to load audit logs</td></tr>';
      return;
    }

    const logs = res.data.data?.logs || [];
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No administrative audit actions logged yet</td></tr>';
      return;
    }

    tbody.innerHTML = logs
      .map((log) => {
        const dt = new Date(log.created_at).toLocaleString();
        const metaStr = log.metadata ? JSON.stringify(log.metadata) : '--';
        return `
        <tr>
          <td><span class="text-muted font-mono" style="font-size: 11.5px;">${escapeHtml(dt)}</span></td>
          <td><strong class="font-mono">@${escapeHtml(log.admin_username)}</strong></td>
          <td><span class="badge-count">${escapeHtml(log.action)}</span></td>
          <td><span class="font-mono text-muted" style="font-size: 11.5px;">${escapeHtml(log.target_user_id || 'N/A')}</span></td>
          <td><span class="font-mono text-muted" style="font-size: 11px;">${escapeHtml(metaStr)}</span></td>
        </tr>
      `;
      })
      .join('');
  }

  $('refreshAuditBtn')?.addEventListener('click', () => loadAuditLogs());

  // Logout handler
  $('adminLogoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    window.location.replace('login.html');
  });

  // ─── UTILITY HELPERS ──────────────────────────────────────
  function showFormStatus(el, msg, isSuccess) {
    if (!el) return;
    el.textContent = msg;
    el.className = `admin-form-status ${isSuccess ? 'success' : 'error'}`;
    el.hidden = false;
  }

  function showToast(msg, isSuccess) {
    const container = $('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${isSuccess ? 'success' : 'error'}`;
    toast.innerHTML = `
      <svg class="admin-icon ${isSuccess ? 'text-success' : 'text-danger'}" viewBox="0 0 24 24">
        ${isSuccess ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
      </svg>
      <span>${escapeHtml(msg)}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  function showConfirmModal(title, message, onConfirm) {
    const modal = $('confirmActionModal');
    if (!modal) return;

    if ($('confirmModalTitle')) $('confirmModalTitle').textContent = title;
    if ($('confirmModalMessage')) $('confirmModalMessage').textContent = message;

    const cancelBtn = $('confirmCancelBtn');
    const proceedBtn = $('confirmProceedBtn');
    const closeBtn = $('closeConfirmModalBtn');

    const cleanup = () => {
      modal.hidden = true;
      proceedBtn?.replaceWith(proceedBtn.cloneNode(true));
      cancelBtn?.replaceWith(cancelBtn.cloneNode(true));
      closeBtn?.replaceWith(closeBtn.cloneNode(true));
    };

    cancelBtn?.addEventListener('click', cleanup);
    closeBtn?.addEventListener('click', cleanup);

    proceedBtn?.addEventListener('click', async () => {
      cleanup();
      await onConfirm();
    });

    modal.hidden = false;
  }

  function showCreatedModal(username, password, name, title = 'Participant Credentials Generated') {
    if ($('createdUserVal')) $('createdUserVal').textContent = username.startsWith('@') ? username : `@${username}`;
    if ($('createdPassVal')) $('createdPassVal').textContent = password;
    if ($('createdNameVal')) $('createdNameVal').textContent = name;
    
    if ($('createdModalHeaderTitle')) $('createdModalHeaderTitle').textContent = title;
    const modal = $('consoleCreatedModal');
    if (modal) modal.hidden = false;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    window.location.replace('login.html');
  };

  $('sidebarLogoutBtn')?.addEventListener('click', handleLogout);

  // Initialize Auth Guard
  initAuth();
});
