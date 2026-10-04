# 보육비서 공통 부품·API 지도

개정: 2026-10-04 · 명세: docs/daycare_spec.md

## 가이드와 운영 도구

- 앱 안 사용 가이드: public/index.html의 teacherGuideModal. 열기·닫기·확인은 기존 public/app.js 이벤트를 사용합니다. docs/teacher_guide.md와 버튼 이름·월/분기 절차·저장/복원/출력 범위를 함께 갱신합니다.
- 관리자 등록: node scripts/create_device_invite.mjs 사랑반 또는 소망반. 링크는 30분·일회용이며 공개 문서·Git에 남기지 않습니다.
- node scripts/verify_connections.mjs --notion-only는 연구반 가상 메모의 저장·조회·일치 후 보관, --memo-only는 새 가상 원아의 AI 없는 메모 저장·수정·직접 조회 후 보관, --child-links-only는 새 가상 원아 2명과 가상 학급 원문의 발췌·관계·조회·재시도·잘못된 발췌 거부 후 보관을 검증합니다. 옵션 없이 실행하면 실제 AI 호출도 하므로 결과의 ai 값을 구분합니다. 운영 자료를 쓰는 도구를 단순 문서 확인을 위해 실행하지 않습니다.
- 관리자 비밀값·보육비서 전용 AI 키는 Worker Secret과 로컬 비공개 환경파일에만 둡니다. PIN 자동 복구·이메일 인증 확장은 현재 제공하지 않습니다.

## 서버 대문

### worker.js

동일 출처 API 라우팅, 서버 세션·노션 담당반 검증, 대상 문맥 검증, 등록 원아 가명화, 실제 근거 선택, 생성·저장 연결을 담당합니다.

POST /api/generate의 evidenceFrom/evidenceTo는 실제 근거의 기간 계약입니다. 오늘 입력 없이 observation/hangroo_eval/counseling만 선택해 생성할 수 있으며 월간 대상 월·실제 관찰일을 요청/응답에서 검증합니다. citation에 from/to/historyOnly와 실제 출처를 부착합니다. 기간 종합본의 근거 재사용, 관찰 원문 덮어쓰기, 다른 기간 합치기를 차단합니다.

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

logFromPage는 [기간종합] 출처 표시를 periodSummary로 반환합니다. saveDailyLogToNotion은 표시를 보존하여 관찰 사실과 기간 서류를 구분합니다. 새로운 DB 속성은 추가하지 않습니다.

### api/gemini.js

generateDaycareLog(options), validateFormats(data, formats), FORMAT_KEYS. 선택 서식의 프롬프트·사실 규칙·응답 내용 검증·110초 제한·일시 장애 재시도를 구성하여 서버 키로 호출하고 meta.model_used로 실제 모델을 반환합니다. worker.js에서 원아 정보·근거·원시 메모를 가명화하여 전달합니다.

### api/memo.js → MemoStore

memoCall(env,operation,context,input), verifyMemoConnection(env,teacher,date). 교사·학급·날짜·원아별 Durable Object 큐와 노션 자동 메모 행의 읽기·버전 비교·속성 갱신·불명확 쓰기 재조회를 담당합니다. pending은 노션 확인 전 새 쓰기를 막으며 같은 텍스트 재시도는 쓰기를 생략합니다. 관리자 /api/admin/verify의 memoOnly=true는 연구반 새 가상 원아에서 저장→수정→노션 직접 조회 후 보관합니다.

### api/child-links.js

linkChildRecord(env,context,input,storage), verifyChildLinks(env,teacher,date,run). POST /api/logs/link-child의 실제 원문·원아 ID·교사·반·날짜·발췌·교사 확인을 검증합니다. MemoStore의 /link-child 경로에서 기존 대상별 큐를 재사용하며, 안정 제목·pending으로 재시도와 불명확 쓰기를 보호합니다. 개인 rawMemo는 발췌문만 저장하고 검수 JSON의 child_link에 원문 출처·해시·확인을 보관합니다. 관리자 childLinksOnly=true는 새 연구반 가상 원아 2명의 관계·발췌·재조회·재시도와 잘못된 발췌 거부를 검사합니다.

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

- DaycareRecords의 initEvidence는 월·분기 버튼과 기간 변경을 연결합니다. changeEvidencePeriod는 선택/조회 세대를 초기화하며 restoreEvidence(citation)는 출처 ID·기간을 복원합니다. evidenceTo와 근거만 있는 초안도 기존 암호화 보관에 포함합니다.
- generateDaycareLog는 evidenceFrom/evidenceTo와 날짜순 pastLogs를 전달합니다. 월간은 실제 유형·날짜로 배정하며 기록 부족을 표시합니다. 미기록을 행동 부재로 바꾸지 않도록 구분합니다. 날짜 검증은 Worker, 문장 사실 검수는 교사가 담당합니다.
- AiEngine은 월간 전문/요약 복사에 실제 관찰일을 보존하고 발달평가 제목·복사에 실제 참조 기간을 넣습니다. DaycareNotion은 기간 서류 표시·동일 종류/기간의 중복 선택·근거와 검수 문장 복원을 담당합니다.

- public/js/child-links.js → DaycareChildLinks: contextChanged, pause, captureDraft, restoreDraft, renderIndividual, saveIndividual. 원시 메모 단계의 원아 연결과 생성된 카드의 ID·발췌·검수 확인을 담당합니다. 동명이인에는 연령·구분 번호를 표시하고 이름으로 첫 원아를 찾지 않습니다. 확인은 복원 후 다시 받으며 초안은 기존 암호화 저장에 포함합니다.

  suggestMemo(rawMemo,children)는 문장/줄바꿈·실명/이름 약칭·조사와 쉼표 뒤 새 주어로 원문 후보와 unassigned/omitted를 반환하는 순수 함수입니다. refreshSuggestions/memoChanged는 반 전체 원문의 입력·STT·노션 조회·충돌 선택·초안 복원을 연결하며 편집 후보를 유지하고 확인을 해제합니다. saveSuggestions는 확인한 카드만 기존 원문 확보와 /api/logs/link-child로 직렬 저장하며 부분 실패와 늦은 응답을 격리합니다. refreshButtons는 완성본 저장 파사드의 저장 시작/종료에서도 일괄 저장 버튼을 잠금/복구합니다. 후보 100건 제한·공동 역할 경고·동명이인 미선택·미연결 문장 수동 후보를 제공합니다.

- public/js/memo-sync.js → DaycareMemo: start, changed, persist, flush, pause, beforeContextChange, clearEditor, restoredText, forget, snapshot. 메모 5초/30초 전송·노션 조회·대상별 AES-GCM 대기본·교사/대상 변경 격리·동시 편집 선택을 제공합니다. app.js 입력·STT, 인증 unlock/잠금, 원아/날짜 변경, 기존 초안 복원과 연결됩니다. 사진·검수 완성본은 공유하지 않습니다.

- public/app.js: 초기화·메모·날짜·문체 설정·사진 재인코딩·모달의 화면 대문.
- public/js/ai-engine.js → AiEngine: handleGenerate, renderResults, switchResultTab, copyTextToClipboard, copyHwpTableToClipboard, setupExportListeners. 검수 가능한 7종 결과와 실제 값이 들어간 복사본을 구성합니다.
- public/gemini-client.js → GeminiClient: 동일 출처 generate/refine. 키 수급·브라우저 Google 직통 호출을 하지 않습니다.
- public/index.html / style.css / _headers: DOM·반응형·인쇄·콘텐츠 보안 정책.
- public/.assetsignore: js/legacy 백업을 배포에서 제외합니다.

## 검증·운영 도구

- tests/backend.test.js의 기간 검증: 오늘 입력 없는 월간/분기 생성, 실제 날짜·기간·가명화·누락 유형 지침, 기간 밖 기록 차단, 기간 서류의 재귀 근거 사용/원문 덮어쓰기 차단과 출처 보존. tests/draft.test.js는 연도를 넘는 분기 계산·늦은 조회 폐기·근거와 종료일 복원도 검증합니다.

- tests/backend.test.js: 기기·PIN·학급·프록시·실제 근거·전체 저장 계약.
- tests/child-links-runtime.test.js: 실제 workerd의 동명이인 ID 선택·발췌 격리·개인 조회·근거 생성·원문/인증 조작 거부·동시 재시도·응답 유실·과거/다중 관계 차단.
- tests/child-links-frontend.test.js: 확인·대상·발췌 누락 차단, 동명이인 ID 전송, 연속 탭·잠금 뒤 늦은 응답과 저장 중 추가 수정 분리.
- tests/name-suggestions.test.js: 이름/조사·약칭·동명이인·공동 역할·일반 단어 부분 일치·반복/후보 상한·확인한 카드 일괄 저장·수정/복원·이름 없는 문장·부분 실패·연속 탭·늦은 응답·저장 중 수정 보존.
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
