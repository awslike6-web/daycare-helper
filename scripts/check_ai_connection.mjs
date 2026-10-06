/** 실제 자료 없이 운영 AI 최소 요청과 로컬·운영 키의 동일 여부만 확인한다. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const vars = await readFile(new URL('../.dev.vars', import.meta.url), 'utf8');
const value = name => new RegExp('^' + name + '\\s*=\\s*(.+)$', 'm').exec(vars)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
const admin = value('AUTH_ADMIN_SECRET'), key = value('GEMINI_API_KEY');
if (!admin || !key) throw new Error('비공개 관리자·AI 설정을 확인해 주세요.');
const base = 'https://daycare-helper.awslike6.workers.dev';
const response = await fetch(base + '/api/admin/ai-status', {
  method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin },
  body: '{}', signal: AbortSignal.timeout(70000)
});
if (!response.ok) throw new Error('관리자 AI 점검 실패: HTTP ' + response.status);
const result = await response.json();
const fingerprint = createHash('sha256').update(key).digest('hex').slice(0, 16);
console.log(JSON.stringify({ status: response.status, sameKey: fingerprint === result.keyFingerprint, endpoint: result.endpoint, results: result.results }));
