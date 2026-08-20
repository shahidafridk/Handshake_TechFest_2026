const { z } = require('zod');

// One row of the parsed CSV, after header normalization (csv.js) but
// before anything is trusted. `department` and `year` are optional since
// not every form export collects them.
const csvRowSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required'),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  college: z.string().trim().min(1, 'College is required'),
  department: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  year: z.coerce.number().int().positive().optional().catch(undefined),
});

const participantQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  college: z.string().trim().max(100).optional(),
  minHandshakes: z.coerce.number().int().min(0).optional(),
  maxHandshakes: z.coerce.number().int().min(0).optional(),
});

const usernameParamSchema = z.object({
  username: z.string().trim().min(1).max(50),
});

const exportQuerySchema = z.object({
  batchId: z.string().uuid('Invalid batch id'),
});

const createParticipantSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Full name is required').max(100),
    username: z
      .string()
      .trim()
      .min(1, 'Username is required')
      .max(50, 'Username too long')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain alphanumeric characters, underscores, and hyphens'),
    password: z.string().min(4, 'Password must be at least 4 characters').max(200),
    phone: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    email: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    college: z
      .string()
      .trim()
      .max(100)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    department: z
      .string()
      .trim()
      .max(100)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    year: z.coerce.number().int().positive().optional().catch(undefined),
  });

const updateParticipantSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Full name cannot be empty').max(100).optional(),
    username: z
      .string()
      .trim()
      .min(1, 'Username is required')
      .max(50, 'Username too long')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain alphanumeric characters, underscores, and hyphens')
      .optional(),
    phone: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    email: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    college: z
      .string()
      .trim()
      .max(100)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    department: z
      .string()
      .trim()
      .max(100)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    password: z
      .string()
      .min(4, 'Password must be at least 4 characters')
      .max(200)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
  });

const checkUsernameQuerySchema = z.object({
  username: z.string().trim().min(1).max(50),
  excludeUsername: z.string().trim().max(50).optional(),
});

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(4, 'Password must be at least 4 characters')
      .max(200)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
  });

module.exports = {
  csvRowSchema,
  participantQuerySchema,
  usernameParamSchema,
  exportQuerySchema,
  createParticipantSchema,
  updateParticipantSchema,
  resetPasswordSchema,
  checkUsernameQuerySchema,
};
