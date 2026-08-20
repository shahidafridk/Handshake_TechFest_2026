// Assembles the Express app: security headers, CORS, body parsing, request
// logging, routes, then the 404 handler and centralized error handler last
// (order matters — Express matches middleware top-to-bottom, and an error
// handler must be registered after everything it might catch errors from).

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const path = require('path');
const env = require('./config/env');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');
const routes = require('./routes');
const { sendSuccess } = require('./utils/apiResponse');

const compression = require('compression');

const app = express();

app.use(compression());

// Railway and Render both terminate TLS and proxy requests to the app —
// without this, req.ip (used for IP-based rate limiting in Module 2's
// login limiter, and for audit logging in Module 3) would return the
// proxy's internal address for every single request, silently breaking
// both. `1` trusts exactly one hop, matching a single reverse proxy in
// front of the app — not a wildcard trust of arbitrary forwarded headers.
app.set('trust proxy', 1);

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(helmet({
  // Content Security Policy — restrict resource loading to same-origin and
  // specific trusted CDNs.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

// Serve static HTML/CSS/JS files from the 'public' folder with cache control
app.use(express.static(path.join(__dirname, '../public'), { maxAge: '1h' }));

// In production, only the explicitly configured origins are allowed — if
// ALLOWED_ORIGINS is empty, every cross-origin request is rejected, which is
// deliberately the safe failure mode (forces someone to configure it before
// go-live, rather than silently running wide open). In development, an
// empty list falls back to allowing any origin, since local frontend dev
// (including opening a file directly, where the Origin header is absent)
// shouldn't require touching .env just to test against localhost.
const isProduction = env.NODE_ENV === 'production';

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (env.ALLOWED_ORIGINS.length > 0 && env.ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      if (!isProduction || env.ALLOWED_ORIGINS.length === 0 || origin.endsWith('.onrender.com')) {
        return callback(null, true);
      }
      return callback(new AppError('ORIGIN_NOT_ALLOWED', `Origin ${origin} is not allowed.`, 403));
    },
  })
);

app.use(express.json({ limit: '10kb' })); // handshake/admin payloads are small; caps a class of abuse cheaply
app.use(pinoHttp({ logger }));

// Prevent caching of all API responses — these contain auth-gated data
// (tokens, user profiles, handshake codes) that must never be served from
// a browser/proxy cache. Applied once here rather than per-route.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});

// Health check lives outside /api — Railway/Render probes hit a fixed path
// with no knowledge of API versioning or prefixes.
app.get('/health', (req, res) => {
  sendSuccess(res, 200, 'Service is healthy.', { status: 'ok' });
});

app.use('/api', routes);

// Anything that reaches here matched no route at all.
app.use((req, res, next) => {
  next(new AppError('NOT_FOUND', `No route matches ${req.method} ${req.originalUrl}`, 404));
});

app.use(errorHandler);

module.exports = app;
