# 보육비서 공통 부품·API 지도

개정: 2026-10-04 · 명세: docs/daycare_spec.md

## 서버 대문

### worker.js

동일 출처 API 라우팅, 서버 세션·노션 담당반 검증, 대상 문맥 검증, 등록 원아 가명화, 실제 근거 선택, 생성·저장 연결을 담당합니다.

- 공개: GET /api/health, GET /api/auth/profiles(최소 교사 목록), POST /api/auth/invite-status(유효 초대 필요).
- 관리자 비밀값: POST /api/auth/invite, POST /api/admin/verify.
- 추가 기기 링크: POST /api/auth/device-invite. 등록 기기·세션·현재 PIN과 실제 노션 교사·담당반을 확인하여 자기 계정의 url/expiresAt를 no-store 응답으로 반환합니다.
- 인증: POST /api/auth/register(초대와 PIN), login(등록 기기와 PIN), logout, change-pin.
- 세션 필요: GET /api/session, /api/connection, /api/children, /api/history, /api/history/:id, /api/children/:id/recent-logs.
- 세션과 동일 출처 JSON 필요: POST /api/generate, /api/logs/save, /api/profile, /api/children; PUT /api/children/:id.
- 원시 메모: GET /api/memo?date=…&childId=…; PUT /api/memo {date,childId,rawMemo,baseVersion}. 실제 교사·담당반·원아를 검증하고 source:notion과 rawMemo/version/pageId/updatedAt를 반환합니다. 오래된 버전은 current 메모를 포함한 409입니다.
- /api/gemini-key는 410이며 키를 배포하지 않습니다.

### api/auth.js

AuthStore, authCall, requireSession, checkMutation, authCookies. Durable Object가 초대·PIN 해시·기기·세션·실패 횟수·교사별 초안 키를 보관합니다.

login은 유효 기기의 PIN 확인·세션 저장 성공 후 기기 만료를 30일로 갱신하며 deviceToken/deviceMaxAge를 기존 Worker의 HttpOnly 쿠키 발급 경로에 반환합니다. 조회·실패·만료·해제 기기는 연장하지 않습니다. 세션 유지 옵션은 기기 연장과 별도로 적용합니다.

createInvite(teacherId, className, deviceToken?)는 기존 관리자 초대와 직접 발급의 30분·일회용 저장을 통합합니다. device-invite는 유효 세션과 currentPin을 재확인해 발급합니다. getInvite(token)는 발급 기기의 현재 등록·최근 inviteKey·계정 PIN 버전을 확인하여 재발급·해제·만료·PIN 변경 후 미사용 링크를 거부합니다.

AuthStore.failure(error)는 인증 예외를 응답으로 변환합니다. fetch의 직렬 실행 콜백 내부에서 호출하여 PIN 오류로 객체가 재시작되지 않도록 합니다. tests/auth-runtime.test.js와 tests/wrangler.auth-test.toml은 실제 workerd의 가상 계정 등록·오류 재시도·쿠키·세션·5회 제한을 검증하며 운영 계정을 사용하지 않습니다.

tests/auth-fixture-worker.js는 독립 로컬 인증 저장소에서만 기기 만료·해제와 초대 만료 조건을 구성하는 검증용 Worker입니다. 운영 worker.js는 이 파일을 가져오지 않으며 공개 API는 검증 제어 기능을 제공하지 않습니다. 실제 실행기 검증은 서버/쿠키 연장 일치와 원래 만료일 이후 진입, 실패 미연장, 만료·해제 거부, 같은 교사의 여러 기기 등록 유지와 연장·해제의 독립 적용, 직접 발급→새 기기 등록→세션 및 초대 무효화를 포함합니다.

### api/notion.js

callNotionApi(env, endpoint, method, body), getTeachersList, getChildrenList, requireChild, getAllDailyLogs, getRecentChildLogs, getLogDetail, saveDailyLogToNotion, saveChildToNotion, updateChildInNotion, updateTeacherProfile, verifyNotionConnection(env, teacher, date).

서비스 바인딩·서버 전용 헤더·실제 스키마·커서 조회·전체 rich_text 결합·검수 JSON 복원을 담당하며 연결 실패를 샘플로 바꾸지 않습니다.

### api/gemini.js

generateDaycareLog(options), validateFormats(data, formats), FORMAT_KEYS. 선택 서식의 프롬프트·사실 규칙·응답 내용 검증·110초 제한·일시 장애 재시도를 구성하여 서버 키로 호출하고 meta.model_used로 실제 모델을 반환합니다. worker.js에서 원아 정보·근거·원시 메모를 가명화하여 전달합니다.

### api/memo.js → MemoStore

memoCall(env,operation,context,input), verifyMemoConnection(env,teacher,date). 교사·학급·날짜·원아별 Durable Object 큐와 노션 자동 메모 행의 읽기·버전 비교·속성 갱신·불명확 쓰기 재조회를 담당합니다. pending은 노션 확인 전 새 쓰기를 막으며 같은 텍스트 재시도는 쓰기를 생략합니다. 관리자 /api/admin/verify의 memoOnly=true는 연구반 새 가상 원아에서 저장→수정→노션 직접 조회 후 보관합니다.

### infra/notion-proxy.js / api/notion-proxy-guard.js

기존 공유 프록시와 guardDaycareProxy. 보육 DB와 하위 자료 접근을 캐시 전에 검사하며 서버 인증 요청은 캐시를 우회합니다. wrangler.notion-proxy.toml은 기존 minmin-notion에 배포합니다.

## 브라우저 3대 파사드

### public/js/auth-security.js → DaycareAuth

initAuthGate, lock, changePin, saveProfile, syncProfile, 교사 전환. 실제 인증 후 화면과 자기 반 노션 원아를 불러옵니다. 로그인 로딩·버전·연결 재시도와 키패드 대기 상태를 표시하며 잠금 시 DaycareRecords.cancelSave를 호출합니다. createDeviceInvite는 PIN 확인→링크 표시·복사·공유를 담당하고 clearDeviceInvite는 PIN·링크·만료 타이머·대기 요청을 제거합니다. 잠금·설정 닫기·교사 전환 뒤 늦은 응답은 표시하지 않습니다.

### public/js/records-flow.js → DaycareRecords

capture, save, restore, clear, forget, invalidateResult, initEvidence, resetEvidence, monthlyOptions, saveNotion, cancelSave, requestJson, saveStatus, generationStatus, generationProgress, availableFormats. 검수 수집·AES-GCM 초안·실제 근거 선택·대상 변경·현재 서식 인쇄본·검수 저장 상태를 담당합니다. requestJson(path, {method, body, signal, timeoutMs})은 JSON 요청·본문 수신의 제한 시간과 취소를 보장하며 쓰기를 자동 재전송하지 않습니다. cancelSave는 진행 저장과 중복 선택을 종료합니다. DaycareNotion.handleSaveNotion이 저장 오케스트레이터를 호출합니다. DaycareHTML은 동적 HTML 텍스트를 이스케이프합니다.

### public/js/notion-store.js → ChildrenStore / DaycareNotion

ChildrenStore: loadChildren, renderChildrenChips, selectChild, openChildModal, handleChildFormSubmit.
DaycareNotion: checkHealth, handleSaveNotion, handleSaveIndividualObs, cancelPendingSave, openHistoryModal, loadHistoryLogs, renderHistoryList. cancelPendingSave는 중복 선택 Promise를 취소로 완료합니다.

실제 원아 조회·검수본 저장·중복 처리·개별 요약 저장·보관함 조회·복원을 제공합니다.

## 화면과 출력

- public/js/memo-sync.js → DaycareMemo: start, changed, persist, flush, pause, beforeContextChange, clearEditor, restoredText, forget, snapshot. 메모 5초/30초 전송·노션 조회·대상별 AES-GCM 대기본·교사/대상 변경 격리·동시 편집 선택을 제공합니다. app.js 입력·STT, 인증 unlock/잠금, 원아/날짜 변경, 기존 초안 복원과 연결됩니다. 사진·검수 완성본은 공유하지 않습니다.

- public/app.js: 초기화·메모·날짜·문체 설정·사진 재인코딩·모달의 화면 대문.
- public/js/ai-engine.js → AiEngine: handleGenerate, renderResults, switchResultTab, copyTextToClipboard, copyHwpTableToClipboard, setupExportListeners. 검수 가능한 7종 결과와 실제 값이 들어간 복사본을 구성합니다.
- public/gemini-client.js → GeminiClient: 동일 출처 generate/refine. 키 수급·브라우저 Google 직통 호출을 하지 않습니다.
- public/index.html / style.css / _headers: DOM·반응형·인쇄·콘텐츠 보안 정책.
- public/.assetsignore: js/legacy 백업을 배포에서 제외합니다.

## 검증·운영 도구

- tests/backend.test.js: 기기·PIN·학급·프록시·실제 근거·전체 저장 계약.
- tests/draft.test.js: 암호화 초안·빈 화면 덮어쓰기 방지·검수 복원.
- tests/memo-frontend.test.js: 자동 저장 시간·암호화·PC 조회·동시 수정 합치기·오프라인 재진입·날짜 격리·화면 숨김·빈 입력 보호.
- tests/memo-runtime.test.js + tests/wrangler.memo-test.toml: 실제 workerd의 두 기기 쿠키·AI 없는 노션 저장/수정/조회·중복 생략·경합 409·반 격리·응답 유실 재조회·명확한 거부 후 복구.
- tests/frontend.test.js: 필수 DOM·모듈 경로·키 경로·파일 크기.
- tests/stability.test.js: 만료 링크 복구·등록 주소 보존·교사 선택 DOM·AI/노션 오류 분류·검수 누락·연속 저장 제한·중복 대기 잠금 복구·통신/본문 시간 초과·취소·이전 요청의 늦은 응답 격리.
- scripts/verify_connections.mjs: 관리자 운영 연결 검증. --notion-only로 AI와 분리한 가상 기록 쓰기·읽기를 수행합니다.
- tests/ui-fixture.js + .dev.vars.ui-test: 실제 자료와 분리된 가상 노션·AI(8790), 로컬 Worker(8787).
- scripts/verify_js_modules.py: Node 실제 파서와 프론트 코어 800줄 상한.
- scripts/create_device_invite.mjs: 관리자 비밀값으로 담당반 일회용 등록 링크 생성.
- /api/admin/verify: 연구반 가상 원아·기록으로 7종 생성·근거·검수 저장·복원을 검사하고 검증 자료를 보관 처리합니다.
