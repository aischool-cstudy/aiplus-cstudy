import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import {
  PracticeRunRequestDto,
  PracticeRunResponseDto,
} from './dto/run-practice.dto';

const EXECUTION_TIMEOUT_MS = 10_000;

// Docker sandbox 실행 옵션
// --network none  : 외부 네트워크 차단
// --memory 64m    : 메모리 64MB 제한
// --cpus 0.5      : CPU 0.5코어 제한
// --pids-limit 50 : 프로세스 수 제한 (fork bomb 방지)
// --read-only     : 파일시스템 읽기 전용 (tmpfs /tmp 허용)
// -i              : stdin 연결 (코드를 stdin으로 주입)
const DOCKER_ARGS = [
  'run',
  '--rm',
  '--network', 'none',
  '--memory', '64m',
  '--cpus', '0.5',
  '--pids-limit', '50',
  '--read-only',
  '--tmpfs', '/tmp:size=32m,noexec',
  '-i',
  'python:3.12-slim',
  'python', '-',
];

@Injectable()
export class PracticeService {
  private readonly logger = new Logger(PracticeService.name);

  run(dto: PracticeRunRequestDto): Promise<PracticeRunResponseDto> {
    this.logger.log(`problem_id=${dto.problem_id} code_len=${dto.code.length}`);

    return new Promise((resolve, reject) => {
      const docker = spawn('docker', DOCKER_ARGS);

      let stdout = '';
      let stderr = '';
      let settled = false;

      const settle = (value: PracticeRunResponseDto | null, err?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(value!);
      };

      const timer = setTimeout(() => {
        docker.kill('SIGKILL');
        reject(
          new HttpException(
            { error_code: 'timeout', message: 'Execution timed out' },
            HttpStatus.INTERNAL_SERVER_ERROR,
          ),
        );
        settled = true;
      }, EXECUTION_TIMEOUT_MS);

      docker.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      docker.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      docker.on('close', (exitCode) => {
        settle({ passed: exitCode === 0, stdout, stderr });
      });

      docker.on('error', (err) => {
        this.logger.error('docker spawn error', err);
        settle(null, new HttpException(
          { error_code: 'internal_error', message: err.message },
          HttpStatus.INTERNAL_SERVER_ERROR,
        ));
      });

      docker.stdin.write(dto.code);
      docker.stdin.end();
    });
  }
}
