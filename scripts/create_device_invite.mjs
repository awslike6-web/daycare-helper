/** 관리자가 교사의 휴대폰에 전달하는 30분 일회용 등록 링크를 만든다. */
import { readFile } from 'node:fs/promises';
const base = 'https://daycare-helper.awslike6.workers.dev';
const className = process.argv[2];
if (!className) throw new Error('사용법: node scripts/create_device_invite.mjs 사랑반');
const lines = (await readFile(new URL('../.dev.vars', import.meta.url), 'utf8')).split(/\r?\n/);
const secret = process.env.AUTH_ADMIN_SECRET || lines.find(line => line.startsWith('AUTH_ADMIN_SECRET='))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
if (!secret) throw new Error('로컬 관리자 비밀값 설정이 필요합니다.');
const profilesResponse = await fetch(base + '/api/auth/profiles');
if (!profilesResponse.ok) throw new Error('교사 프로필 조회 실패');
const profiles = (await profilesResponse.json()).profiles.filter(profile => profile.className === className);
if (profiles.length !== 1) throw new Error('노션에서 해당 담당반 교사를 확인해 주세요.');
const response = await fetch(base + '/api/auth/invite', {
  method: 'POST', headers: { Origin: base, Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
  body: JSON.stringify({ teacherId: profiles[0].id })
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || '등록 링크 생성 실패');
console.log(`${className}: ${base}/#register=${result.token}`);
console.log('30분 안에 해당 선생님의 휴대폰에서 열어 주세요. 링크를 공개 문서나 Git에 저장하지 마세요.');
