import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponse } from '../interfaces/api-response.interface';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Skip BadRequestException as it should be handled by ValidationExceptionFilter
    if (exception instanceof BadRequestException) {
      return;
    }

    this.logger.error(`HTTP Exception: ${exception.message}`, {
      status,
      path: request.url,
      method: request.method,
      body: request.body,
      query: request.query,
      params: request.params,
      stack: exception.stack,
    });

    let errors: { [key: string]: string[] } | null = null;
    let message = 'An error occurred';

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseObj = exceptionResponse as any;
      console.log(
        '🚀 ~ HttpExceptionFilter ~ catch ~ responseObj:',
        responseObj,
      );

      // Check for custom errors format first (from our custom exceptions)
      if (responseObj.errors && typeof responseObj.errors === 'object') {
        errors = responseObj.errors;
        message = responseObj.message || 'An error occurred';
      } else if (responseObj.message) {
        if (Array.isArray(responseObj.message)) {
          // Handle class-validator format (fallback)
          errors = this.formatValidationErrors(responseObj.message);
          message = 'Validation failed';
        } else {
          message = responseObj.message;
        }
      }

      // Append additional error info if available
      // if (responseObj.error && !responseObj.errors) {
      //   message = `${message}: ${responseObj.error}`;
      // }
    } else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
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

  private formatValidationErrors(messages: string[]) {
    const errors: { [key: string]: string[] } = {};

    messages.forEach((message) => {
      let field = 'general';
      let errorMsg = message;

      const patterns = [
        { pattern: /^(\w+)\s+(.+)$/, fieldIndex: 1, messageIndex: 2 },
        { pattern: /property (\w+) has failed/i, fieldIndex: 1 },
        { pattern: /(\w+) must be/i, fieldIndex: 1 },
        { pattern: /(\w+) should not be/i, fieldIndex: 1 },
      ];

      for (const { pattern, fieldIndex, messageIndex } of patterns) {
        const match = message.match(pattern);
        if (match) {
          field = match[fieldIndex];
          if (messageIndex && match[messageIndex]) {
            errorMsg = match[messageIndex];
          }
          break;
        }
      }

      if (!errors[field]) {
        errors[field] = [];
      }
      errors[field].push(errorMsg);
    });

    return errors;
  }
}
