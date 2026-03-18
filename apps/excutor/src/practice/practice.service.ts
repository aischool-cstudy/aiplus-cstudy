import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import {
  PracticeRunRequestDto,
  PracticeRunResponseDto,
} from './dto/run-practice.dto';

const EXECUTION_TIMEOUT_MS = 10_000; // 10초 제한
const MAX_CONCURRENT = 5; // 4코어 기준 62.5% 차지
const MAX_QUEUE = 90; // 최대 큐 90

// Docker sandbox 실행 옵션  - 현재 파이썬만 가능
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
  '-i',
  'python:3.12-slim',
  'python', '-',
];

class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  get queueLength() { return this.queue.length; }
  get activeCount() { return this.active; }

  acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  release(): void {
    if (this.queue.length > 0) {
      this.queue.shift()!();
    } else {
      this.active--;
    }
  }
}

@Injectable()
export class PracticeService {
  private readonly logger = new Logger(PracticeService.name);
  private readonly semaphore = new Semaphore(MAX_CONCURRENT);

  async run(dto: PracticeRunRequestDto): Promise<PracticeRunResponseDto> {
    this.logger.log(`problem_id=${dto.problem_id} code_len=${dto.code.length} active=${this.semaphore.activeCount} queued=${this.semaphore.queueLength}`);

    if (this.semaphore.queueLength >= MAX_QUEUE) {
      throw new HttpException(
        { error_code: 'too_many_requests', message: 'Server is busy. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.semaphore.acquire();
    try {
      return await this.runDocker(dto);
    } finally {
      this.semaphore.release();
    }
  }

  private runDocker(dto: PracticeRunRequestDto): Promise<PracticeRunResponseDto> {
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

      docker.stdout.on('data', (chunk: { toString(): string }) => {
        stdout += chunk.toString();
      });

      docker.stderr.on('data', (chunk: { toString(): string }) => {
        stderr += chunk.toString();
      });

      docker.on('close', (exitCode: number | null) => {
        settle({ passed: exitCode === 0, stdout, stderr });
      });

      docker.on('error', (err: Error) => {
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
