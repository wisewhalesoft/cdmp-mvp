import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ERROR_CODES, ERROR_MESSAGES } from '../errors/error-codes';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as any;

    // Handle ThrottlerException (429) first, before custom format check
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return response.status(status).json({
        error: ERROR_CODES.RATE_LIMITED,
        message: ERROR_MESSAGES.RATE_LIMITED,
      });
    }

    // Handle class-validator errors (BadRequestException with message array)
    // NestJS default format: { statusCode, message: [...], error: 'Bad Request' }
    // Return 422 for validation errors per error-handling.md spec
    if (
      status === HttpStatus.BAD_REQUEST &&
      (Array.isArray(exceptionResponse?.message) ||
        exceptionResponse?.error === 'Bad Request')
    ) {
      return response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        error: ERROR_CODES.VALIDATION_ERROR,
        message:
          Array.isArray(exceptionResponse?.message)
            ? exceptionResponse.message[0]
            : exceptionResponse?.message || ERROR_MESSAGES.VALIDATION_ERROR,
      });
    }

    // If the exception has our custom format (e.g., from AuthService)
    if (exceptionResponse?.error && exceptionResponse?.message) {
      return response.status(status).json({
        error: exceptionResponse.error,
        message: exceptionResponse.message,
      });
    }

    // Default
    response.status(status).json({
      error: 'INTERNAL_ERROR',
      message: exceptionResponse?.message || 'Internal server error',
    });
  }
}
