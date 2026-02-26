import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const openapiPath = path.join(projectRoot, 'openapi', 'openapi.yaml');
const outputPath = path.join(projectRoot, 'src', 'openapi.ts');

function quote(value) {
  return `'${String(value).replace(/'/g, "\\'")}'`;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function generateTypesFromOpenApi(doc) {
  const schemas = doc?.components?.schemas || {};
  const errorSchema = schemas.ErrorResponse || {};
  const errorCodeEnum = ensureArray(errorSchema?.properties?.error_code?.enum);

  const lines = [];
  lines.push('// 자동 생성 파일입니다. 수동으로 수정하지 마세요.');
  lines.push('// 오픈API 스펙 파일을 기준으로 생성됨');
  lines.push('');
  lines.push(`export type ApiErrorCode = ${errorCodeEnum.map(quote).join(' | ') || "'unknown'"};`);
  lines.push('');
  lines.push('export interface ApiErrorResponse {');
  lines.push('  error_code: ApiErrorCode;');
  lines.push('  message: string;');
  lines.push('  retryable: boolean;');
  lines.push('  trace_id: string;');
  lines.push('  detail: string | Record<string, unknown>;');
  lines.push('}');
  lines.push('');
  lines.push('export interface AIFallbackMeta {');
  lines.push('  fallback_used: boolean;');
  lines.push('  failure_kind: string | null;');
  lines.push('  attempt_count: number;');
  lines.push('}');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

const raw = fs.readFileSync(openapiPath, 'utf8');
const doc = yaml.load(raw);
const output = generateTypesFromOpenApi(doc);
const mode = process.argv.includes('--check') ? 'check' : 'write';

if (mode === 'check') {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (current !== output) {
    console.error('[contracts] openapi generated types are out of date. Run npm run generate:openapi');
    process.exit(1);
  }
  console.log(`[contracts] checked ${path.relative(projectRoot, outputPath)}`);
  process.exit(0);
}

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`[contracts] generated ${path.relative(projectRoot, outputPath)}`);
