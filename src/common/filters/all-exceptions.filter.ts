import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ApiResponse } from '../interfaces/api-response.interface';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: Record<string, string[]> | null = null;

    this.logger.error('Unexpected error occurred', {
      error: exception,
      path: request.url,
      method: request.method,
      body: request.body,
      query: request.query,
      params: request.params,
      headers: {
        'user-agent': request.headers['user-agent'],
        'content-type': request.headers['content-type'],
        authorization: request.headers.authorization ? '[REDACTED]' : undefined,
      },
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    } else if (exception instanceof QueryFailedError) {
      status = HttpStatus.BAD_REQUEST;
      const dbError = this.handleDatabaseError(exception);
      message = dbError.message;
      errors = dbError.errors;
    } else if (exception instanceof Error) {
      message = exception.message;

      if (exception.name === 'ValidationError') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Validation failed';
      } else if (exception.name === 'CastError') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Invalid data format';
      } else if (exception.name === 'JsonWebTokenError') {
        status = HttpStatus.UNAUTHORIZED;
        message = 'Invalid token';
      } else if (exception.name === 'TokenExpiredError') {
        status = HttpStatus.UNAUTHORIZED;
        message = 'Token expired';
      }
    }

    const errorResponse: ApiResponse = {
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }

  private handleDatabaseError(error: QueryFailedError) {
    const dbError = error as any;

    switch (dbError.code) {
      case '23505': // Unique violation
        return {
          message: 'Duplicate entry found',
          errors: this.extractDuplicateField(dbError.detail),
        };
      case '23503': // Foreign key violation
        return {
          message: 'Referenced record not found',
          errors: { reference: ['Invalid reference provided'] },
        };
      case '23502': // Not null violation
        return {
          message: 'Required field missing',
          errors: this.extractNotNullField(dbError.column),
        };
      case '22001': // String data too long
        return {
          message: 'Data too long',
          errors: { general: ['Input data exceeds maximum length'] },
        };
      default:
        return {
          message: 'Database error occurred',
          errors: { database: [dbError.message] },
        };
    }
  }

  private extractDuplicateField(detail: string) {
    const match = detail?.match(/Key \((\w+)\)=/);
    const field = match ? match[1] : 'general';

    return {
      [field]: [`${field} already exists`],
    };
  }

  private extractNotNullField(column: string) {
    return {
      [column]: [`${column} is required`],
    };
  }
}
