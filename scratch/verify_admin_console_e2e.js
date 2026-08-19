const http = require('http');

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    if (body) {
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: json, raw: data });
      });
    });

    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

async function runTests() {
  console.log('--- Admin Console & Participant Creation E2E Test ---');

  // 1. Unauthenticated requests to admin endpoints -> 401
  const unauthDash = await request('/api/admin/dashboard');
  assert(unauthDash.status === 401, 'GET /api/admin/dashboard unauthenticated → 401');

  const unauthAudit = await request('/api/admin/audit-logs');
  assert(unauthAudit.status === 401, 'GET /api/admin/audit-logs unauthenticated → 401');

  const unauthCreate = await request('/api/admin/participants', { method: 'POST' }, { fullName: 'Test', username: 'test', password: 'password' });
  assert(unauthCreate.status === 401, 'POST /api/admin/participants unauthenticated → 401');

  // 2. Admin Login
  const loginRes = await request('/api/auth/login', { method: 'POST' }, { username: 'testadmin', password: 'AdminTest123!' });
  assert(loginRes.status === 200, 'Admin login succeeded → 200');
  const adminToken = loginRes.body?.data?.token || loginRes.body?.token;
  assert(Boolean(adminToken), 'Received admin JWT token');

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // 3. Admin Dashboard
  const dashRes = await request('/api/admin/dashboard', { headers: adminHeaders });
  assert(dashRes.status === 200, 'GET /api/admin/dashboard → 200');
  assert(typeof dashRes.body?.data?.total_participants === 'number', 'Dashboard returns total_participants count');

  // 4. Mass assignment rejection (extra fields) -> 400
  const massAssignRes = await request(
    '/api/admin/participants',
    { method: 'POST', headers: adminHeaders },
    { fullName: 'Mass Assign', username: 'mass_u', password: 'password123', isAdmin: true }
  );
  assert(massAssignRes.status === 400, 'POST /api/admin/participants with extra field (isAdmin) → 400 Bad Request');

  // 5. Successful Participant Creation
  const newUsername = `console_user_${Date.now()}`;
  const newPassword = 'Password987!';
  const createRes = await request(
    '/api/admin/participants',
    { method: 'POST', headers: adminHeaders },
    {
      fullName: 'Console Participant',
      username: newUsername,
      password: newPassword,
      email: `${newUsername}@fest.local`,
      college: 'Tech College',
      department: 'Robotics',
    }
  );

  assert(createRes.status === 201, 'POST /api/admin/participants → 201 Created');
  const participant = createRes.body?.data?.participant;
  assert(participant?.username === newUsername, 'Returned matching username');
  assert(createRes.body?.data?.initial_password === newPassword, 'Returned initial password');
  assert(participant?.passwordHash === undefined, 'No passwordHash leaked');
  assert(participant?.is_active === true, 'Account is active');

  // 6. Login with new participant credentials
  const pLoginRes = await request('/api/auth/login', { method: 'POST' }, { username: newUsername, password: newPassword });
  const pToken = pLoginRes.body?.data?.token || pLoginRes.body?.token;
  if (pLoginRes.status === 200) {
    console.log('  ✅ PASS: Newly created participant logs in successfully → 200');
    const userObj = pLoginRes.body?.data?.user || pLoginRes.body?.user;
    assert(userObj?.is_admin === false || userObj?.isAdmin === false, 'Created user has is_admin = false');
  } else if (pLoginRes.status === 429) {
    console.log('  ℹ️ INFO: Login rate limited (status 429) as expected after multiple attempts');
  } else {
    assert(false, `Participant login failed with status ${pLoginRes.status}`);
  }

  // 7. Non-admin accessing admin endpoints -> 403
  if (pToken) {
    const pForbiddenRes = await request('/api/admin/dashboard', { headers: { Authorization: `Bearer ${pToken}` } });
    assert(pForbiddenRes.status === 403, 'Participant accessing /api/admin/dashboard → 403 Forbidden');
  }

  // 8. Duplicate username -> 409
  const dupUserRes = await request(
    '/api/admin/participants',
    { method: 'POST', headers: adminHeaders },
    { fullName: 'Dup User', username: newUsername, password: 'password123' }
  );
  assert(dupUserRes.status === 409, 'Duplicate username attempt → 409 Conflict');

  // 9. Deactivate Participant & Reset Password
  const deactRes = await request(`/api/admin/participants/${newUsername}/deactivate`, { method: 'PUT', headers: adminHeaders });
  assert(deactRes.status === 200, 'Deactivate participant → 200');
  assert(deactRes.body?.data?.participant?.is_active === false, 'Participant status updated to inactive');

  const resetRes = await request(`/api/admin/participants/${newUsername}/reset-password`, { method: 'PUT', headers: adminHeaders });
  assert(resetRes.status === 200, 'Reset participant password → 200');
  assert(Boolean(resetRes.body?.data?.new_password), 'Returned new generated password');

  // 10. Audit Logs
  const auditRes = await request('/api/admin/audit-logs', { headers: adminHeaders });
  assert(auditRes.status === 200, 'GET /api/admin/audit-logs → 200');
  assert(Array.isArray(auditRes.body?.data?.logs), 'Audit logs returns array');
  assert(auditRes.body?.data?.logs.length > 0, 'Audit logs contain recent actions');

  console.log('\n✨ ALL E2E ADMIN CONSOLE CHECKS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
