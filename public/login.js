window.addEventListener('DOMContentLoaded', () => {
  const existingToken = localStorage.getItem('token');
  if (existingToken) {
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${existingToken}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then((result) => {
        const user = result.data?.user || result.user;
        if (user) {
          const isAdmin = Boolean(user.is_admin || user.isAdmin);
          window.location.replace(isAdmin ? 'admin.html' : 'index.html');
        } else {
          localStorage.removeItem('token');
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
      });
  }

  const form = document.getElementById('loginForm');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const submit = document.getElementById('continueBtn');
  const label = submit?.querySelector('.btn-label');
  const error = document.getElementById('errorMessage');
  const toggle = document.getElementById('togglePw');
  const eye = document.getElementById('eyeIcon');

  const showError = (message) => { if (error) { error.textContent = message; error.style.display = 'block'; } };
  const hideError = () => { if (error) { error.textContent = ''; error.style.display = 'none'; } };
  const readJson = async (response) => { try { return await response.json(); } catch { return {}; } };
  const errorFor = (response) => {
    if (response.status === 429) return 'Too many sign-in attempts. Please wait a moment and try again.';
    if (response.status === 401 || response.status === 403) return 'Incorrect username or password.';
    return 'We could not sign you in. Please try again.';
  };
  const reset = () => { if (submit) { submit.disabled = false; submit.classList.remove('loading'); submit.removeAttribute('aria-busy'); } if (label) label.textContent = 'SIGN IN'; };

  [username, password].filter(Boolean).forEach((field) => field.addEventListener('input', hideError));
  toggle?.addEventListener('click', () => {
    const visible = password?.type === 'password';
    if (!password) return;
    password.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    if (eye) eye.textContent = visible ? 'Hide' : 'Show';
  });
  const contactAdminBtn = document.getElementById('contactAdminBtn');
  const accessInfoModal = document.getElementById('accessInfoModal');
  const closeAccessInfoBtn = document.getElementById('closeAccessInfoBtn');

  function showAccessInfo() {
    if (accessInfoModal) {
      accessInfoModal.hidden = false;
      closeAccessInfoBtn?.focus();
    }
  }

  function hideAccessInfo() {
    if (accessInfoModal) {
      accessInfoModal.hidden = true;
      contactAdminBtn?.focus();
    }
  }

  contactAdminBtn?.addEventListener('click', showAccessInfo);
  closeAccessInfoBtn?.addEventListener('click', hideAccessInfo);
  accessInfoModal?.addEventListener('click', (e) => {
    if (e.target === accessInfoModal) hideAccessInfo();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && accessInfoModal && !accessInfoModal.hidden) {
      hideAccessInfo();
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault(); hideError();
    const usernameValue = username?.value.trim(); const passwordValue = password?.value || '';
    if (!usernameValue || !passwordValue) { showError('Enter both your username and password to continue.'); return; }
    if (submit) { submit.disabled = true; submit.classList.add('loading'); submit.setAttribute('aria-busy', 'true'); } if (label) label.textContent = 'VERIFYING ACCESS…';
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: usernameValue, password: passwordValue }) });
      const result = await readJson(response); const token = result.token || result.data?.token;
      if (!response.ok || !token) { showError(errorFor(response)); reset(); return; }
      localStorage.setItem('token', token);
      const user = result.data?.user || result.user || {};
      if (user.id) localStorage.setItem('userId', user.id);

      const isAdmin = Boolean(user.is_admin || user.isAdmin);
      if (isAdmin) {
        window.location.replace('admin.html');
      } else {
        window.location.replace('index.html');
      }
    } catch { showError('The network could not be reached. Check your connection and try again.'); reset(); }
  });
});
