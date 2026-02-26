import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { connect as connectNet, type Socket } from 'net';
import { connect as connectTls } from 'tls';

const requestLocks = new Map<string, number>();
const ownedRedisLockTokens = new Map<string, string>();

interface RedisConfig {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  db: number;
  tls: boolean;
}

function nowMs(): number {
  return Date.now();
}

function sweepExpired(now: number) {
  for (const [key, expiresAt] of requestLocks.entries()) {
    if (expiresAt <= now) {
      requestLocks.delete(key);
    }
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  // 키 순서를 고정해 같은 입력 데이터가 항상 같은 해시를 만들도록 보장한다.
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${pairs.join(',')}}`;
}

function hashPayload(payload: unknown): string {
  const raw = stableStringify(payload);
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function createRequestLockKey(userId: string, pipeline: string, payload: unknown): string {
  return `${userId}:${pipeline}:${hashPayload(payload)}`;
}

function parseRedisConfig(): RedisConfig | null {
  const raw = String(process.env.REDIS_URL || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'redis:' && protocol !== 'rediss:') return null;

    const dbRaw = parsed.pathname.replace('/', '').trim();
    const dbCandidate = Number.parseInt(dbRaw || '0', 10);
    const db = Number.isFinite(dbCandidate) && dbCandidate >= 0 ? dbCandidate : 0;

    return {
      host: parsed.hostname,
      port: Number(parsed.port || (protocol === 'rediss:' ? 6380 : 6379)),
      username: parsed.username ? decodeURIComponent(parsed.username) : null,
      password: parsed.password ? decodeURIComponent(parsed.password) : null,
      db,
      tls: protocol === 'rediss:',
    };
  } catch {
    return null;
  }
}

function encodeRedisCommand(args: string[]): string {
  let raw = `*${args.length}\r\n`;
  for (const arg of args) {
    raw += `$${Buffer.byteLength(arg, 'utf8')}\r\n${arg}\r\n`;
  }
  return raw;
}

function parseRedisSimpleResponse(raw: string): string | null {
  const type = raw[0];
  if (type === '+') {
    return raw.slice(1).split('\r\n', 1)[0] || '';
  }
  if (type === '$') {
    const firstLineEnd = raw.indexOf('\r\n');
    const sizeRaw = raw.slice(1, firstLineEnd);
    const size = Number.parseInt(sizeRaw, 10);
    if (size < 0) return null;
    const bodyStart = firstLineEnd + 2;
    return raw.slice(bodyStart, bodyStart + size);
  }
  if (type === ':') {
    return raw.slice(1).split('\r\n', 1)[0] || '0';
  }
  if (type === '-') {
    const message = raw.slice(1).split('\r\n', 1)[0] || 'redis_error';
    throw new Error(`redis_error:${message}`);
  }
  throw new Error('redis_error:unexpected_response');
}

function readRedisResponse(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      if (!buffer.includes('\r\n')) return;

      const type = buffer[0];
      if (type === '+' || type === '-' || type === ':') {
        cleanup();
        resolve(buffer);
        return;
      }
      if (type === '$') {
        const firstLineEnd = buffer.indexOf('\r\n');
        if (firstLineEnd < 0) return;
        const size = Number.parseInt(buffer.slice(1, firstLineEnd), 10);
        if (Number.isNaN(size)) {
          cleanup();
          reject(new Error('redis_error:invalid_bulk_header'));
          return;
        }
        if (size < 0) {
          cleanup();
          resolve(buffer);
          return;
        }
        const totalSize = firstLineEnd + 2 + size + 2;
        if (buffer.length < totalSize) return;
        cleanup();
        resolve(buffer.slice(0, totalSize));
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error('redis_error:connection_closed'));
    };

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      socket.off('end', onClose);
    };

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
    socket.once('end', onClose);
  });
}

function connectRedis(config: RedisConfig): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    const socket = config.tls
      ? connectTls({ host: config.host, port: config.port }, () => resolve(socket))
      : connectNet({ host: config.host, port: config.port }, () => resolve(socket));
    socket.setTimeout(3_000, () => {
      socket.destroy(new Error('redis_error:timeout'));
    });
    socket.once('error', onError);
  });
}

async function runRedisCommand(config: RedisConfig, args: string[]): Promise<string | null> {
  const socket = await connectRedis(config);
  socket.setNoDelay(true);

  try {
    // 외부 의존성 없이 최소 RESP 명령만 직접 전송한다.
    if (config.password) {
      const authArgs = config.username
        ? ['AUTH', config.username, config.password]
        : ['AUTH', config.password];
      socket.write(encodeRedisCommand(authArgs));
      parseRedisSimpleResponse(await readRedisResponse(socket));
    }
    if (config.db > 0) {
      socket.write(encodeRedisCommand(['SELECT', String(config.db)]));
      parseRedisSimpleResponse(await readRedisResponse(socket));
    }

    socket.write(encodeRedisCommand(args));
    const response = await readRedisResponse(socket);
    return parseRedisSimpleResponse(response);
  } finally {
    socket.end();
    socket.destroy();
  }
}

function acquireInMemoryLock(key: string, ttlMs: number): boolean {
  const now = nowMs();
  sweepExpired(now);

  const expiresAt = requestLocks.get(key);
  if (typeof expiresAt === 'number' && expiresAt > now) {
    return false;
  }

  requestLocks.set(key, now + Math.max(1_000, ttlMs));
  return true;
}

function releaseInMemoryLock(key: string): void {
  requestLocks.delete(key);
}

export async function acquireLock(key: string, ttlMs = 30_000): Promise<boolean> {
  const redis = parseRedisConfig();
  if (!redis) {
    return acquireInMemoryLock(key, ttlMs);
  }

  try {
    const token = randomUUID();
    const response = await runRedisCommand(
      redis,
      ['SET', key, token, 'NX', 'PX', String(Math.max(1_000, ttlMs))]
    );
    if (response === 'OK') {
      ownedRedisLockTokens.set(key, token);
      return true;
    }
    return false;
  } catch {
    // Redis 장애 시에도 단일 인스턴스 환경은 계속 동작하도록 메모리 락으로 대체한다.
    return acquireInMemoryLock(key, ttlMs);
  }
}

export async function releaseLock(key: string): Promise<void> {
  const redis = parseRedisConfig();
  const token = ownedRedisLockTokens.get(key);
  ownedRedisLockTokens.delete(key);

  if (!redis || !token) {
    releaseInMemoryLock(key);
    return;
  }

  try {
    // 토큰 일치 시에만 삭제해 TTL 경과 후 다른 프로세스 락을 지우지 않도록 막는다.
    await runRedisCommand(
      redis,
      [
        'EVAL',
        'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
        '1',
        key,
        token,
      ],
    );
  } catch {
    releaseInMemoryLock(key);
  }
}
