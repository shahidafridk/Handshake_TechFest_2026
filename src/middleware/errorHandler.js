// Centralized error handler — the single place every error in the app ends
// up, whether thrown deliberately (AppError) or accidentally (a bug). Must
// be registered last, after every route, per Express's error-middleware
// convention (4 arguments is what makes Express treat this as an error
// handler rather than regular middleware).

const { Prisma } = require('@prisma/client');
const multer = require('multer');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // 1. Known, expected errors — safe to describe precisely.
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, code: err.code, path: req.path }, err.message);
    } else {
      logger.warn({ code: err.code, path: req.path }, err.message);
    }

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: {
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // 2. Multer upload errors (file too large, unexpected field name, etc.) —
  // without this, a too-large CSV upload would otherwise fall through to
  // the generic 500 below instead of a clear 400.
  if (err instanceof multer.MulterError) {
    logger.warn({ multerCode: err.code, path: req.path }, 'Multer upload error');

    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'The uploaded file is too large.'
        : 'The file upload could not be processed.';

    return res.status(400).json({
      success: false,
      message,
      error: { code: `UPLOAD_${err.code}` },
    });
  }

  // 3. Body-parser errors — oversized payloads and malformed JSON that Express
  // rejects before the request even reaches route-level code.
  if (err.type === 'entity.too.large') {
    logger.warn({ path: req.path }, 'Request payload too large');
    return res.status(413).json({
      success: false,
      message: 'Request payload is too large.',
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
  }
  if (err.type === 'entity.parse.failed') {
    logger.warn({ path: req.path }, 'Malformed request body');
    return res.status(400).json({
      success: false,
      message: 'The request body could not be parsed.',
      error: { code: 'INVALID_BODY' },
    });
  }

  // 4. Known Prisma errors — translate the common ones to something
  // meaningful instead of leaking a raw database error to the client.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.warn({ prismaCode: err.code, path: req.path }, 'Prisma known request error');

    if (err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'A record with this value already exists.',
        error: { code: 'DUPLICATE_ENTRY' },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'The requested resource was not found.',
        error: { code: 'NOT_FOUND' },
      });
    }

    // Any other Prisma error code: don't guess, fall through to the generic
    // 500 handler below rather than returning a wrong/misleading response.
  }

  // 4. Anything else: a genuine bug. Log the full error for us, tell the
  // client nothing more than "something went wrong" — this is the boundary
  // that keeps stack traces and internal details out of API responses.
  logger.error({ err, path: req.path }, 'Unhandled error');

  return res.status(500).json({
    success: false,
    message: 'Something went wrong. Please try again.',
    error: {
      code: 'INTERNAL_ERROR',
    },
  });
}

module.exports = errorHandler;
