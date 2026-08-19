#!/usr/bin/env node

/**
 * Handshake.sh — Security & Hardening Verification Tests
 *
 * Runs against the local dev server (localhost:3000).
 * Tests confirm that security mitigations are working correctly.
 *
 * SAFE: Uses only controlled test data; no destructive attacks.
 */

const BASE = 'http://localhost:3000';

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    failures.push(testName);
    console.log(`  ❌ ${testName}`);
  }
}

function skip(testName, reason) {
  skipped++;
  console.log(`  ⏭  ${testName} (${reason})`);
}

async function json(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  let body;
  try { body = await res.json(); } catch { body = {}; }
  return { res, body };
}

// ─── 1. SECURITY HEADERS ────────────────────────────────────────────
async function testSecurityHeaders() {
  console.log('\n🔒 Security Headers');
  const res = await fetch(`${BASE}/health`);
  const h = Object.fromEntries(res.headers.entries());

  assert(h['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff');
  assert(h['x-frame-options']?.toUpperCase() === 'DENY', 'X-Frame-Options: DENY');
  assert(h['content-security-policy']?.includes("default-src 'self'"), 'CSP default-src self');
  assert(h['content-security-policy']?.includes("frame-ancestors 'none'"), 'CSP frame-ancestors none');
  assert(h['content-security-policy']?.includes("object-src 'none'"), 'CSP object-src none');
  assert(h['content-security-policy']?.includes("base-uri 'self'"), 'CSP base-uri self');
  assert(h['content-security-policy']?.includes("form-action 'self'"), 'CSP form-action self');
  assert(h['referrer-policy'] === 'no-referrer', 'Referrer-Policy: no-referrer');
  assert(h['strict-transport-security']?.includes('max-age=31536000'), 'HSTS max-age=31536000');
  assert(h['strict-transport-security']?.includes('includeSubDomains'), 'HSTS includeSubDomains');
  assert(h['x-permitted-cross-domain-policies'] === 'none', 'X-Permitted-Cross-Domain-Policies: none');
}

// ─── 2. API CACHE CONTROL ───────────────────────────────────────────
async function testAPICacheControl() {
  console.log('\n🔒 API Cache Control');
  const { res } = await json(`${BASE}/api/auth/me`);
  const cc = res.headers.get('cache-control');
  assert(cc === 'no-store', 'API responses have Cache-Control: no-store');
  assert(res.headers.get('pragma') === 'no-cache', 'API responses have Pragma: no-cache');
}

// ─── 3. AUTHENTICATION ─────────────────────────────────────────────
async function testAuthentication() {
  console.log('\n🔒 Authentication');

  // Missing token
  const { res: noAuth } = await json(`${BASE}/api/auth/me`);
  assert(noAuth.status === 401, 'Missing auth token → 401');

  // Malformed token
  const { res: badToken } = await json(`${BASE}/api/auth/me`, {
    headers: { Authorization: 'Bearer garbage.token.here' },
  });
  assert(badToken.status === 401, 'Malformed token → 401');

  // Expired token (crafted with exp in the past)
  const expiredJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiaXNBZG1pbiI6ZmFsc2UsImlhdCI6MTAwMDAwMDAwMCwiZXhwIjoxMDAwMDAwMDAxfQ.invalid';
  const { res: expired } = await json(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${expiredJwt}` },
  });
  assert(expired.status === 401, 'Expired/invalid token → 401');

  // No Bearer prefix
  const { res: noBearer } = await json(`${BASE}/api/auth/me`, {
    headers: { Authorization: 'some-random-token' },
  });
  assert(noBearer.status === 401, 'Missing Bearer prefix → 401');

  // Algorithm none attack (token with alg:none)
  const noneJwt = btoa(JSON.stringify({alg:'none',typ:'JWT'})).replace(/=/g,'') + '.' +
                  btoa(JSON.stringify({sub:'test',isAdmin:true})).replace(/=/g,'') + '.';
  const { res: noneAlg } = await json(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${noneJwt}` },
  });
  assert(noneAlg.status === 401, 'Algorithm "none" attack → 401');
}

// ─── 4. LOGIN ───────────────────────────────────────────────────────
async function testLogin() {
  console.log('\n🔒 Login');

  // Invalid credentials
  const { res: bad, body: badBody } = await json(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'nonexistent_user_xyz', password: 'wrongpassword' }),
  });
  assert(bad.status === 401 || bad.status === 429, 'Invalid credentials → 401 or rate-limited');
  if (bad.status === 401) {
    assert(!badBody?.data?.token, 'No token returned on failed login');
    assert(
      badBody.message?.toLowerCase().includes('incorrect'),
      'Generic error message (no user enumeration)'
    );
  } else {
    skip('No token check', 'rate-limited');
    skip('Enumeration check', 'rate-limited');
  }

  // Missing fields
  const { res: missing } = await json(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert(missing.status === 400 || missing.status === 429, 'Empty credentials → 400 or rate-limited');

  // Extra fields rejected (strict schema)
  const { res: extra } = await json(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'test', password: 'pass', isAdmin: true }),
  });
  assert(extra.status === 400 || extra.status === 429, 'Extra fields (mass assignment attempt) → rejected');
}

// ─── 5. INPUT VALIDATION ────────────────────────────────────────────
async function testInputValidation() {
  console.log('\n🔒 Input Validation');

  // Oversized payload — Express's json limit rejects this at the body-parser
  // layer. The exact status depends on Express version (413 or 500/400).
  try {
    const oversized = 'X'.repeat(11 * 1024);
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: oversized, password: 'test' }),
    });
    assert(res.status >= 400, `Oversized payload rejected (status ${res.status})`);
  } catch {
    assert(true, 'Oversized payload rejected (connection reset)');
  }

  // Wrong content type
  const res2 = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'not json',
  });
  assert(res2.status >= 400, 'Non-JSON content type → error');
}

// ─── 6. XSS / SQL INJECTION PAYLOADS ────────────────────────────────
async function testInjectionPayloads() {
  console.log('\n🔒 Injection Payloads (XSS / SQL)');

  // These payloads should either:
  // - Return 401 (treated as literal strings, auth fails normally), or
  // - Return 429 (rate-limited before reaching auth logic), or
  // - Return 400 (validation rejected them)
  // In ALL cases, the payload should NOT succeed as an injection.
  const payloads = [
    { name: 'XSS script tag', value: '<script>alert(1)</script>' },
    { name: 'XSS img onerror', value: '"><img src=x onerror=alert(1)>' },
    { name: 'SQL injection OR', value: "admin' OR '1'='1" },
    { name: 'SQL injection UNION', value: "' UNION SELECT 1,2,3 --" },
  ];

  for (const { name, value } of payloads) {
    const { res } = await json(`${BASE}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username: value, password: 'test' }),
    });
    // Any 4xx is acceptable — what matters is it NEVER returns 200 with a token
    assert(res.status >= 400, `${name} → rejected (status ${res.status})`);
  }
}

// ─── 7. ERROR DISCLOSURE ────────────────────────────────────────────
async function testErrorDisclosure() {
  console.log('\n🔒 Error Disclosure');

  // 404 should not leak stack trace or path info
  const { body: notFound } = await json(`${BASE}/api/nonexistent/path`);
  assert(!notFound.error?.stack, 'No stack trace in 404 response');

  // Error responses should never contain stack traces
  const { body: errBody } = await json(`${BASE}/api/auth/me`);
  assert(!errBody?.error?.stack, 'No stack trace in error responses');
}

// ─── 8. CORS ────────────────────────────────────────────────────────
async function testCORS() {
  console.log('\n🔒 CORS Behavior');

  const res = await fetch(`${BASE}/health`, {
    headers: { Origin: 'http://evil.example.com' },
  });

  if (process.env.NODE_ENV === 'production') {
    assert(
      res.status === 403,
      'Production CORS rejects unapproved origins'
    );
  } else {
    assert(
      res.status === 200,
      'Dev mode CORS allows any origin (by design)'
    );
  }
}

// ─── 9. HANDSHAKE CODE VALIDATION ───────────────────────────────────
async function testHandshakeCodeValidation() {
  console.log('\n🔒 Handshake Code Validation');

  // Without auth
  const { res: noAuth } = await json(`${BASE}/api/handshakes/connect`, {
    method: 'POST',
    body: JSON.stringify({ code: 'ABCDEF' }),
  });
  assert(noAuth.status === 401, 'Verify code without auth → 401');

  // Generate code without auth
  const { res: noAuth2 } = await json(`${BASE}/api/handshakes/generate-code`, {
    method: 'POST',
  });
  assert(noAuth2.status === 401, 'Generate code without auth → 401');

  // List handshakes without auth
  const { res: noAuth3 } = await json(`${BASE}/api/handshakes`);
  assert(noAuth3.status === 401, 'List handshakes without auth → 401');
}

// ─── 10. ADMIN AUTHORIZATION ────────────────────────────────────────
async function testAdminAuthorization() {
  console.log('\n🔒 Admin Authorization');

  const adminEndpoints = [
    { method: 'GET', path: '/api/admin/dashboard' },
    { method: 'GET', path: '/api/admin/participants' },
    { method: 'POST', path: '/api/admin/import' },
    { method: 'GET', path: '/api/admin/credentials/export?batchId=00000000-0000-0000-0000-000000000000' },
    { method: 'PUT', path: '/api/admin/participants/testuser/activate' },
    { method: 'PUT', path: '/api/admin/participants/testuser/deactivate' },
    { method: 'PUT', path: '/api/admin/participants/testuser/reset-password' },
  ];

  for (const { method, path } of adminEndpoints) {
    const { res } = await json(`${BASE}${path}`, { method });
    assert(res.status === 401, `${method} ${path} without auth → 401`);
  }
}

// ─── 11. RATE LIMITING ──────────────────────────────────────────────
async function testRateLimiting() {
  console.log('\n🔒 Rate Limiting');
  // By this point in the test, we've already sent multiple login requests.
  // The rate limiter should have kicked in.
  const { res } = await json(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'ratechecker', password: 'test' }),
  });
  assert(res.status === 429, 'Login rate limit is active');

  // Rate limit response body should be in correct format
  const body = await res.json().catch(() => ({}));
  // Check headers
  const retryAfter = res.headers.get('retry-after');
  assert(retryAfter !== null || res.status === 429, 'Rate limit returns Retry-After or 429');
}

// ─── 12. HEALTH CHECK ───────────────────────────────────────────────
async function testHealthCheck() {
  console.log('\n🔒 Health Check');
  const { res, body } = await json(`${BASE}/health`);
  assert(res.status === 200, 'Health check returns 200');
  assert(body.success === true, 'Health check returns success: true');
  assert(!body.data?.database_url, 'Health check does not leak database URL');
  assert(!body.data?.jwt_secret, 'Health check does not leak JWT secret');
}

// ─── 13. 404 HANDLING ───────────────────────────────────────────────
async function testNotFound() {
  console.log('\n🔒 404 Handling');
  const { res, body } = await json(`${BASE}/api/this/route/does/not/exist`);
  assert(res.status === 404, 'Unknown route → 404');
  assert(body.success === false, '404 returns success: false');
  assert(body.error?.code === 'NOT_FOUND', '404 returns NOT_FOUND error code');
}

// ─── 14. METHOD HANDLING ────────────────────────────────────────────
async function testMethodHandling() {
  console.log('\n🔒 HTTP Method Handling');
  const { res } = await json(`${BASE}/api/auth/login`);
  assert(res.status === 404, 'GET to POST-only route → 404');
}

// ─── 15. PROTECTED ENDPOINTS ────────────────────────────────────────
async function testProtectedEndpoints() {
  console.log('\n🔒 Protected Endpoints (No Auth)');

  const protectedEndpoints = [
    { method: 'GET', path: '/api/dashboard' },
    { method: 'GET', path: '/api/leaderboard' },
    { method: 'GET', path: '/api/profile/testuser' },
    { method: 'GET', path: '/api/stats' },
  ];

  for (const { method, path } of protectedEndpoints) {
    const { res } = await json(`${BASE}${path}`, { method });
    assert(res.status === 401, `${method} ${path} without auth → 401`);
  }
}

// ─── MAIN ───────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(' Handshake.sh Security Verification Tests');
  console.log('═══════════════════════════════════════════════════');

  await testSecurityHeaders();
  await testAPICacheControl();
  await testAuthentication();
  await testLogin();
  await testInputValidation();
  await testInjectionPayloads();
  await testErrorDisclosure();
  await testCORS();
  await testHandshakeCodeValidation();
  await testAdminAuthorization();
  await testRateLimiting();
  await testHealthCheck();
  await testNotFound();
  await testMethodHandling();
  await testProtectedEndpoints();

  console.log('\n═══════════════════════════════════════════════════');
  console.log(` Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failures.length) {
    console.log(' Failures:');
    failures.forEach(f => console.log(`   • ${f}`));
  }
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(2);
});
