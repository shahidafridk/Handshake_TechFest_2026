window.addEventListener('DOMContentLoaded', () => {
  // ---------- DOM ELEMENTS ----------
  const beaconWrap = document.getElementById('beaconWrap');
  const continueBtn = document.getElementById('continueBtn');
  const btnLabel = continueBtn ? continueBtn.querySelector('.btn-label') : null;
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const togglePwBtn = document.getElementById('togglePw');
  const eyeIcon = document.getElementById('eyeIcon');
  const forgotBtn = document.getElementById('forgotBtn');
  const loginForm = document.getElementById('loginForm');
  const brandMark = document.getElementById('brandMark');
  const errorMessage = document.getElementById('errorMessage');

  // ---------- HELPER: INLINE ERROR HANDLER ----------
  function showError(msg) {
    if (errorMessage) {
      errorMessage.textContent = msg;
      errorMessage.style.display = 'block';
    }
  }

  function hideError() {
    if (errorMessage) {
      errorMessage.style.display = 'none';
      errorMessage.textContent = '';
    }
  }

  // Clear error when user types
  if (usernameInput && passwordInput) {
    [usernameInput, passwordInput].forEach((input) => {
      input.addEventListener('input', hideError);
    });
  }

  // ---------- AUTH GUARD ----------
  if (localStorage.getItem('token')) {
    window.location.href = 'index.html';
    return;
  }

  // ---------- FOCUS EFFECTS FOR BEACON UI ----------
  if (beaconWrap && usernameInput && passwordInput) {
    [usernameInput, passwordInput].forEach((input) => {
      input.addEventListener('focus', () => beaconWrap.classList.add('active'));
      input.addEventListener('blur', () => {
        if (!usernameInput.value && !passwordInput.value) {
          beaconWrap.classList.remove('active');
        }
      });
    });
  }

  // ---------- TOGGLE PASSWORD VISIBILITY ----------
  if (togglePwBtn && passwordInput && eyeIcon) {
    togglePwBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isPw = passwordInput.type === 'password';
      passwordInput.type = isPw ? 'text' : 'password';
      togglePwBtn.setAttribute('aria-label', isPw ? 'Hide password' : 'Show password');
      eyeIcon.innerHTML = isPw
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
        : '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>';
    });
  }

  // ---------- FORGOT PASSWORD HANDLER ----------
  if (forgotBtn) {
    forgotBtn.addEventListener('click', () => {
      showError('Please contact the TechFest administrator to reset your password.');
    });
  }

  // ---------- SUBMISSION LOGIC ----------
  async function handleLogin(e) {
    if (e) e.preventDefault();
    hideError();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showError('Please enter both username and password.');
      return;
    }

    continueBtn.classList.add('loading');
    continueBtn.disabled = true;
    if (btnLabel) btnLabel.textContent = 'Signing In...';
    if (beaconWrap) beaconWrap.classList.add('connecting');
    if (brandMark) brandMark.classList.add('glitching');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const result = await response.json();

      const token = result.token || result.data?.token;

      if (response.ok && token) {
        const user = result.user || result.data?.user;

        if (token) localStorage.setItem('token', token);
        if (user && user.id) localStorage.setItem('userId', user.id);

        window.location.href = 'index.html';
      } else {
        showError(result.message || result.error || 'Incorrect username or password.');
        resetButtonState();
      }
    } catch (err) {
      showError('Unable to connect to the backend server. Please try again.');
      resetButtonState();
    }
  }

  function resetButtonState() {
    continueBtn.classList.remove('loading');
    continueBtn.disabled = false;
    if (btnLabel) btnLabel.textContent = 'Continue';
    if (beaconWrap) beaconWrap.classList.remove('connecting');
    if (brandMark) brandMark.classList.remove('glitching');
  }

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  } else if (continueBtn) {
    continueBtn.addEventListener('click', handleLogin);
  }
});
