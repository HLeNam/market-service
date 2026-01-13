import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

@Injectable()
export class CustomValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype, type }: ArgumentMetadata) {
    // Skip validation for certain cases
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    // Skip validation if value is undefined, null, or empty (for GET requests, params, etc.)
    if (value === undefined || value === null) {
      return value;
    }

    // Skip validation for non-body parameters unless they're DTOs
    if (type !== 'body' && !this.isDtoClass(metatype)) {
      return value;
    }

    const object = plainToClass(metatype, value);
    const errors = await validate(object, {
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      skipMissingProperties: false,
    });

    if (errors.length > 0) {
      const errorMessages = this.formatValidationErrors(errors);
      throw new BadRequestException(errorMessages);
    }

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private isDtoClass(metatype: Function): boolean {
    // Check if the class name ends with 'Dto' or has validation decorators
    return metatype.name.endsWith('Dto') || metatype.name.endsWith('DTO');
  }

  private formatValidationErrors(errors: any[]) {
    const result: { [key: string]: string[] } = {};

    errors.forEach((error) => {
      const property = error.property;
      const constraints = error.constraints;

      if (constraints) {
        result[property] = Object.values(constraints);
      }

      // Handle nested validation errors
      if (error.children && error.children.length > 0) {
        const nestedErrors = this.formatValidationErrors(error.children);
        Object.keys(nestedErrors).forEach((key) => {
          const nestedKey = `${property}.${key}`;
          result[nestedKey] = nestedErrors[key];
        });
      }
    });

    return result;
  }
}
