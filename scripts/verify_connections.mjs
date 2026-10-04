/** 관리자 비밀값을 출력하지 않는 운영 연결 검증. 가상 연구 자료는 즉시 보관한다. */
import { readFile } from 'node:fs/promises';
const base = 'https://daycare-helper.awslike6.workers.dev';
const lines = (await readFile(new URL('../.dev.vars', import.meta.url), 'utf8')).split(/\r?\n/);
const secret = process.env.AUTH_ADMIN_SECRET || lines.find(line => line.startsWith('AUTH_ADMIN_SECRET='))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
if (!secret) throw new Error('비공개 관리자 설정이 필요합니다.');
try {
  const response = await fetch(base + '/api/admin/verify', { method: 'POST', headers: {
    Origin: base, Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json'
  }, body: JSON.stringify({ notionOnly: process.argv.includes('--notion-only'), memoOnly: process.argv.includes('--memo-only') }), signal: AbortSignal.timeout(280000) });
  const result = await response.json();
  console.log(JSON.stringify({ status: response.status, ...result }));
  if (!response.ok) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ success: false, error: error.name === 'TimeoutError' ? '운영 검증 시간 초과' : '운영 검증 연결 실패' }));
  process.exitCode = 1;
}
