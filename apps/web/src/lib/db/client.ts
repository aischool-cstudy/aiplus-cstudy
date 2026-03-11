/**
 * PostgreSQL 기반 Supabase 호환 클라이언트
 *
 * Supabase SDK 대신 pg(PostgreSQL)를 직접 사용합니다.
 * 기존 서버 액션 코드의 supabase.auth.* / supabase.from().* 호출 패턴을 유지합니다.
 */
import { type Pool, type PoolClient } from 'pg';
import { cookies } from 'next/headers';
import * as bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { getPool } from './pool';
import { serializeColumnValue } from './serialization';

// ─────────────────────────────────────────────────
// JWT
// ─────────────────────────────────────────────────
const COOKIE_NAME = 'auth-token';

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || 'local-dev-secret-change-in-production'
  );
}

async function signToken(payload: { sub: string; email: string }): Promise<string> {
  return new SignJWT({ ...payload, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

async function verifyToken(token: string): Promise<{ sub: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return { sub: payload.sub as string, email: payload.email as string };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
}

type QBOperation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';
type SingleMode  = 'single' | 'maybe' | 'many';

interface Condition {
  col: string;
  op: 'eq' | 'in' | 'gt' | 'gte';
  val: unknown;
}
interface OrderClause { col: string; asc: boolean }
interface QueryResult<T = any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: T | null;
  error: { message: string; code?: string } | null;
  count?: number;
}

// ─────────────────────────────────────────────────
// QueryBuilder — Supabase 체이닝 API와 동일한 인터페이스
// ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class QueryBuilder<T = any> implements PromiseLike<QueryResult<T>> {
  private _pool: Pool;
  private _table: string;
  private _op: QBOperation = 'select';
  private _cols: string = '*';
  private _conditions: Condition[] = [];
  private _orders: OrderClause[] = [];
  private _limitVal?: number;
  private _data?: Record<string, unknown> | Record<string, unknown>[];
  private _upsertConflict?: string;
  private _singleMode: SingleMode = 'many';
  private _countMode: boolean = false;
  private _headOnly: boolean = false;

  constructor(pool: Pool, table: string) {
    this._pool = pool;
    this._table = table;
  }

  // ── 쿼리 타입 ──────────────────────────────────
  select(cols: string = '*', options?: { count?: 'exact'; head?: boolean }): this {
    if (this._op === 'insert' || this._op === 'update' || this._op === 'delete' || this._op === 'upsert') {
      // insert/update 후 RETURNING 컬럼 지정
      this._cols = cols;
    } else {
      this._op = 'select';
      this._cols = cols;
      if (options?.count === 'exact') this._countMode = true;
      if (options?.head) this._headOnly = true;
    }
    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]): this {
    this._op = 'insert';
    this._data = data;
    return this;
  }

  update(data: Record<string, unknown>): this {
    this._op = 'update';
    this._data = data;
    return this;
  }

  delete(): this {
    this._op = 'delete';
    return this;
  }

  upsert(
    data: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string }
  ): this {
    this._op = 'upsert';
    this._data = data;
    this._upsertConflict = opts?.onConflict;
    return this;
  }

  // ── 필터 ──────────────────────────────────────
  eq(col: string, val: unknown): this {
    this._conditions.push({ col, op: 'eq', val });
    return this;
  }

  in(col: string, vals: unknown[]): this {
    this._conditions.push({ col, op: 'in', val: vals });
    return this;
  }

  gte(col: string, val: unknown): this {
    this._conditions.push({ col, op: 'gte', val });
    return this;
  }

  gt(col: string, val: unknown): this {
    this._conditions.push({ col, op: 'gt', val });
    return this;
  }

  // ── 정렬 / 페이징 ─────────────────────────────
  order(col: string, opts?: { ascending?: boolean }): this {
    this._orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }

  limit(n: number): this {
    this._limitVal = n;
    return this;
  }

  // ── 단일 행 터미네이터 ────────────────────────
  single(): this {
    this._singleMode = 'single';
    this._limitVal = 1;
    return this;
  }

  maybeSingle(): this {
    this._singleMode = 'maybe';
    this._limitVal = 1;
    return this;
  }

  // ── Promise 인터페이스 ────────────────────────
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?:  ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._execute().then(onfulfilled as any, onrejected as any);
  }

  // ─────────────────────────────────────────────
  // 내부 실행
  // ─────────────────────────────────────────────
  private async _execute(): Promise<QueryResult<T>> {
    const client = await this._pool.connect();
    try {
      switch (this._op) {
        case 'select': return await this._runSelect(client) as QueryResult<T>;
        case 'insert': return await this._runInsert(client) as QueryResult<T>;
        case 'update': return await this._runUpdate(client) as QueryResult<T>;
        case 'delete': return await this._runDelete(client) as QueryResult<T>;
        case 'upsert': return await this._runUpsert(client) as QueryResult<T>;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message: msg } };
    } finally {
      client.release();
    }
  }

  private _buildWhere(params: unknown[]): string {
    if (this._conditions.length === 0) return '';
    const parts = this._conditions.map((c) => {
      if (c.op === 'eq') {
        params.push(c.val);
        return `"${c.col}" = $${params.length}`;
      }
      if (c.op === 'gte') {
        params.push(c.val);
        return `"${c.col}" >= $${params.length}`;
      }
      if (c.op === 'gt') {
        params.push(c.val);
        return `"${c.col}" > $${params.length}`;
      }
      if (c.op === 'in') {
        const vals = c.val as unknown[];
        if (vals.length === 0) return 'FALSE';
        const placeholders = vals.map((v) => { params.push(v); return `$${params.length}`; });
        return `"${c.col}" IN (${placeholders.join(', ')})`;
      }
      return '';
    }).filter(Boolean);
    return parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  }

  private _buildOrder(): string {
    if (!this._orders.length) return '';
    return 'ORDER BY ' + this._orders.map((o) => `"${o.col}" ${o.asc ? 'ASC' : 'DESC'}`).join(', ');
  }

  private _selectCols(): string {
    if (this._cols === '*') return '*';
    return this._cols.split(',').map((c) => {
      const t = c.trim();
      return t === '*' ? '*' : `"${t}"`;
    }).join(', ');
  }

  private _serialize(column: string, value: unknown): unknown {
    return serializeColumnValue(this._table, column, value);
  }

  private async _runSelect(client: PoolClient): Promise<QueryResult> {
    const params: unknown[] = [];

    if (this._countMode && this._headOnly) {
      const where = this._buildWhere(params);
      const sql = `SELECT COUNT(*) AS _cnt FROM "${this._table}" ${where}`.trim();
      const res = await client.query(sql, params);
      return { data: [], count: parseInt(res.rows[0]._cnt, 10), error: null };
    }

    const where  = this._buildWhere(params);
    const order  = this._buildOrder();
    const limit  = this._limitVal ? `LIMIT ${this._limitVal}` : '';
    const cols   = this._selectCols();
    const sql    = `SELECT ${cols} FROM "${this._table}" ${where} ${order} ${limit}`.trim().replace(/\s+/g, ' ');
    const res    = await client.query(sql, params);

    if (this._singleMode === 'single') {
      if (!res.rows.length) return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
      return { data: res.rows[0], error: null };
    }
    if (this._singleMode === 'maybe') {
      return { data: res.rows[0] ?? null, error: null };
    }
    if (this._countMode) {
      return { data: res.rows as any, count: res.rowCount ?? 0, error: null };
    }
    return { data: res.rows as any, error: null };
  }

  private async _runInsert(client: PoolClient): Promise<QueryResult> {
    const rows = Array.isArray(this._data) ? this._data : [this._data!];
    if (!rows.length) return { data: null, error: null };

    const cols    = Object.keys(rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const params: unknown[] = [];

    const valRows = rows.map((row) => {
      const ph = cols.map((col) => { params.push(this._serialize(col, row[col])); return `$${params.length}`; });
      return `(${ph.join(', ')})`;
    });

    const returning = this._cols && this._cols !== '*' ? this._selectCols() : '*';
    const sql = `INSERT INTO "${this._table}" (${colList}) VALUES ${valRows.join(', ')} RETURNING ${returning}`;
    const res = await client.query(sql, params);

    if (this._singleMode !== 'many') return { data: res.rows[0] ?? null, error: null };
    return { data: res.rows as any, error: null };
  }

  private async _runUpdate(client: PoolClient): Promise<QueryResult> {
    const data = this._data as Record<string, unknown>;
    const params: unknown[] = [];
    const setClauses = Object.entries(data).map(([col, val]) => {
      params.push(this._serialize(col, val));
      return `"${col}" = $${params.length}`;
    });
    const where = this._buildWhere(params);
    const returning = this._cols && this._cols !== '*' ? this._selectCols() : '*';
    const sql = `UPDATE "${this._table}" SET ${setClauses.join(', ')} ${where} RETURNING ${returning}`.trim();
    const res = await client.query(sql, params);

    if (this._singleMode !== 'many') return { data: res.rows[0] ?? null, error: null };
    return { data: res.rows as any, error: null };
  }

  private async _runDelete(client: PoolClient): Promise<QueryResult> {
    const params: unknown[] = [];
    const where = this._buildWhere(params);
    const sql = `DELETE FROM "${this._table}" ${where} RETURNING *`.trim();
    const res = await client.query(sql, params);
    return { data: res.rows as any, error: null };
  }

  private async _runUpsert(client: PoolClient): Promise<QueryResult> {
    const rows = Array.isArray(this._data) ? this._data : [this._data!];
    if (!rows.length) return { data: null, error: null };

    const cols    = Object.keys(rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const params: unknown[] = [];

    const valRows = rows.map((row) => {
      const ph = cols.map((col) => { params.push(this._serialize(col, row[col])); return `$${params.length}`; });
      return `(${ph.join(', ')})`;
    });

    const conflictCols = this._upsertConflict
      ? this._upsertConflict.split(',').map((c) => `"${c.trim()}"`).join(', ')
      : '';

    const excludedCols = this._upsertConflict
      ? cols.filter((c) => !this._upsertConflict!.split(',').map((x) => x.trim()).includes(c))
      : cols;
    const updateClauses = excludedCols.map((c) => `"${c}" = EXCLUDED."${c}"`);

    const conflictClause = conflictCols
      ? `ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateClauses.join(', ')}`
      : 'ON CONFLICT DO NOTHING';

    const sql = `INSERT INTO "${this._table}" (${colList}) VALUES ${valRows.join(', ')} ${conflictClause} RETURNING *`;
    const res = await client.query(sql, params);

    if (this._singleMode !== 'many') return { data: res.rows[0] ?? null, error: null };
    return { data: res.rows as any, error: null };
  }
}

// ─────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────
async function getCurrentUser(
  cookieStore: Awaited<ReturnType<typeof cookies>>
): Promise<AuthUser | null> {
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return { id: payload.sub, email: payload.email };
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge,
    path: '/',
  };
}

// ─────────────────────────────────────────────────
// 공개 팩토리
// ─────────────────────────────────────────────────
export interface SupabaseCompatClient {
  auth: {
    getUser(): Promise<{ data: { user: AuthUser | null }; error: null }>;
    signUp(opts: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown> };
    }): Promise<{ error: { message: string } | null }>;
    signInWithPassword(opts: {
      email: string;
      password: string;
    }): Promise<{ error: { message: string } | null }>;
    signOut(): Promise<void>;
    exchangeCodeForSession(_code: string): Promise<{ error: null }>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from<T = any>(table: string): QueryBuilder<T>;
}

/** 서버 컴포넌트 / 서버 액션용 클라이언트 (쿠키 읽기/쓰기 포함) */
export async function createClient(): Promise<SupabaseCompatClient> {
  const pool        = getPool();
  const cookieStore = await cookies();

  return {
    auth: {
      async getUser() {
        const user = await getCurrentUser(cookieStore);
        return { data: { user }, error: null };
      },

      async signUp({ email, password, options }) {
        try {
          const hashed = await bcrypt.hash(password, 10);
          const meta   = options?.data ? JSON.stringify(options.data) : '{}';

          const res = await pool.query(
            `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data)
             VALUES ($1, $2, $3::jsonb) RETURNING id, email`,
            [email, hashed, meta]
          );
          const user  = res.rows[0];
          const token = await signToken({ sub: user.id, email: user.email });
          cookieStore.set(COOKIE_NAME, token, cookieOptions(60 * 60 * 24 * 7));
          return { error: null };
        } catch (err: unknown) {
          const pgErr = err as { code?: string; message?: string };
          if (pgErr.code === '23505') return { error: { message: '이미 등록된 이메일입니다.' } };
          return { error: { message: pgErr.message || '회원가입에 실패했습니다.' } };
        }
      },

      async signInWithPassword({ email, password }) {
        try {
          const res = await pool.query(
            `SELECT id, email, encrypted_password FROM auth.users WHERE email = $1`,
            [email]
          );
          if (!res.rows.length) return { error: { message: '이메일 또는 비밀번호가 올바르지 않습니다.' } };

          const user  = res.rows[0];
          const valid = await bcrypt.compare(password, user.encrypted_password);
          if (!valid)  return { error: { message: '이메일 또는 비밀번호가 올바르지 않습니다.' } };

          const token = await signToken({ sub: user.id, email: user.email });
          cookieStore.set(COOKIE_NAME, token, cookieOptions(60 * 60 * 24 * 7));
          return { error: null };
        } catch (err: unknown) {
          const e = err as { message?: string };
          return { error: { message: e.message || '로그인에 실패했습니다.' } };
        }
      },

      async signOut() {
        cookieStore.set(COOKIE_NAME, '', cookieOptions(0));
      },

      async exchangeCodeForSession(_code: string) {
        // 로컬 PostgreSQL 환경에서는 OAuth 코드 교환 불필요
        return { error: null };
      },
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from<T = any>(table: string): QueryBuilder<T> {
      return new QueryBuilder<T>(pool, table);
    },
  };
}

/** Admin 클라이언트 — RLS 무시 (postgres 수퍼유저이므로 이미 우회됨) */
export function createAdminClient(): SupabaseCompatClient {
  const pool = getPool();

  return {
    auth: {
      async getUser()                      { return { data: { user: null }, error: null }; },
      async signUp()                       { return { error: null }; },
      async signInWithPassword()           { return { error: null }; },
      async signOut()                      {},
      async exchangeCodeForSession()       { return { error: null }; },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from<T = any>(table: string): QueryBuilder<T> {
      return new QueryBuilder<T>(pool, table);
    },
  };
}
