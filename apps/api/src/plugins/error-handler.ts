import type { ApiErrorBody, ApiErrorDetail } from '@diamond/shared'
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { ZodError, type ZodIssue } from 'zod'

import { isProduction } from '../config/env'
import {
  AppError,
  isPostgresError,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
} from '../lib/errors'

function issuesToDetails(issues: readonly ZodIssue[]): ApiErrorDetail[] {
  return issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }))
}

/**
 * Pulls a ZodError out of whatever wrapper it arrived in. Depending on where
 * validation ran it can be the error itself, its `cause` (fastify-type-provider-zod
 * wraps schema failures), or absent entirely for hand-written validation.
 */
function extractZodError(error: unknown): ZodError | null {
  if (error instanceof ZodError) return error
  if (error && typeof error === 'object' && 'cause' in error) {
    const cause = (error as { cause?: unknown }).cause
    if (cause instanceof ZodError) return cause
  }
  return null
}

function fastifyValidationDetails(error: FastifyError): ApiErrorDetail[] {
  const validation = error.validation ?? []
  return validation.map((item) => ({
    path: String(item.instancePath || item.params?.['issue'] || '').replace(/^\//, '') || '(root)',
    message: item.message ?? 'Invalid value',
  }))
}

function toErrorBody(
  request: FastifyRequest,
  error: FastifyError | Error,
): { statusCode: number; body: ApiErrorBody } {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    }
  }

  const zodError = extractZodError(error)
  if (zodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request payload failed validation',
          details: issuesToDetails(zodError.issues),
        },
      },
    }
  }

  const fastifyError = error as FastifyError

  if (fastifyError.validation) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request payload failed validation',
          details: fastifyValidationDetails(fastifyError),
        },
      },
    }
  }

  // Constraint violations that slipped past the service-layer checks - most
  // often a genuine race between two concurrent writers.
  if (isPostgresError(error, PG_UNIQUE_VIOLATION)) {
    return {
      statusCode: 409,
      body: { error: { code: 'CONFLICT', message: 'That record already exists' } },
    }
  }
  if (isPostgresError(error, PG_FOREIGN_KEY_VIOLATION)) {
    return {
      statusCode: 409,
      body: {
        error: { code: 'CONFLICT', message: 'A referenced record is missing or still in use' },
      },
    }
  }

  if (fastifyError.statusCode === 429) {
    return {
      statusCode: 429,
      body: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } },
    }
  }

  if (typeof fastifyError.statusCode === 'number' && fastifyError.statusCode < 500) {
    return {
      statusCode: fastifyError.statusCode,
      body: {
        error: {
          code: fastifyError.code ?? 'VALIDATION_ERROR',
          message: fastifyError.message,
        },
      },
    }
  }

  request.log.error({ err: error }, 'Unhandled error')

  return {
    statusCode: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        // Never surface an internal message in production: it can leak schema
        // names, file paths or query fragments.
        message: isProduction ? 'An unexpected error occurred' : error.message,
      },
    },
  }
}

/**
 * Turns every failure into the single `{ error: { code, message, details? } }`
 * envelope the web client expects.
 */
export const errorHandlerPlugin = fp(
  async (app: FastifyInstance) => {
    app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const { statusCode, body } = toErrorBody(request, error)
      return reply.status(statusCode).send(body)
    })

    app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Route ${request.method} ${request.url} not found`,
        },
      } satisfies ApiErrorBody)
    })
  },
  { name: 'error-handler' },
)
