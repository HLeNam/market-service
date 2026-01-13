import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  constructor(errors: { [key: string]: string[] }) {
    super(
      {
        message: 'Validation failed',
        errors,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class DuplicateException extends HttpException {
  constructor(field: string, value: string) {
    super(
      {
        message: `${field} already exists`,
        errors: {
          [field]: [`${field} '${value}' is already taken`],
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class InvalidInputException extends HttpException {
  constructor(field: string, message: string) {
    super(
      {
        message: 'Invalid input provided',
        errors: {
          [field]: [message],
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
