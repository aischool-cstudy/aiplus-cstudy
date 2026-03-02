import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as any;

      // Already formatted with error_code
      if (typeof body === 'object' && body.error_code) {
        return response.status(status).json(body);
      }

      // ValidationPipe 오류 → schema_mismatch
      if (status === HttpStatus.BAD_REQUEST) {
        const message =
          typeof body === 'object' && body.message
            ? Array.isArray(body.message)
              ? body.message.join(', ')
              : body.message
            : String(body);
        return response
          .status(400)
          .json({ error_code: 'schema_mismatch', message });
      }

      return response.status(status).json({
        error_code: 'unknown',
        message: typeof body === 'string' ? body : JSON.stringify(body),
      });
    }

    const message =
      exception instanceof Error ? exception.message : 'Internal server error';

    response.status(500).json({ error_code: 'internal_error', message });
  }
}
