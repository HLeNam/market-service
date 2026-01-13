import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponse } from '../interfaces/api-response.interface';

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as any;

    let errors: { [key: string]: string[] } | null = null;
    let message = 'Validation failed';

    // Check if we have the custom format from our pipe
    if (
      exceptionResponse?.errors &&
      typeof exceptionResponse.errors === 'object'
    ) {
      // This is our custom validation format
      errors = exceptionResponse.errors;
      message = exceptionResponse.message || 'Validation failed';
    } else if (exceptionResponse?.message) {
      if (Array.isArray(exceptionResponse.message)) {
        // This is the default class-validator format
        errors = this.formatClassValidatorErrors(exceptionResponse.message);
      } else if (typeof exceptionResponse.message === 'string') {
        message = exceptionResponse.message;
      }
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      // Direct errors object
      errors = exceptionResponse;
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

  private formatClassValidatorErrors(messages: string[]) {
    const errors: { [key: string]: string[] } = {};

    messages.forEach((message) => {
      const spaceIndex = message.indexOf(' ');

      if (spaceIndex > 0) {
        const field = message.substring(0, spaceIndex);
        const errorMsg = message.substring(spaceIndex + 1);

        if (!errors[field]) {
          errors[field] = [];
        }
        errors[field].push(errorMsg);
      } else {
        if (!errors['general']) {
          errors['general'] = [];
        }
        errors['general'].push(message);
      }
    });

    return errors;
  }
}
