# 일상 작성 동선 정리 · 1회 동의 · 2026-11-08

설계: Claude Code (claude-opus-5-5) · 1단계 구현: Antigravity Flash (gemini-3.8-flash) · 2단계 구현·병합 검수: Claude Code

## 배경

선생님이 매일 쓰는 흐름(원아 → 메모 → 사진 → 서식 → 생성) 사이에 가끔 쓰는 칸이 펼쳐진 채 끼어 있다. 메모 저장 안내 4줄, 원아 연결, 과거 관찰 기록 선택, 사진 동의 체크, 사진 메모 버튼이 그렇다. 게다가 사진 동의 체크(`#photoConsentCheck`)는 어디에도 저장되지 않아서, 사진을 보낼 때마다 다시 체크해야 한다.

## 결정 사항 (Argon 초안 대비 변경)

1. **탭·서랍은 만들지 않는다.** 과거 기록 선택은 관찰일지·발달평가·상담일지를 위한 칸이다(이 세 서식은 과거 기록만으로도 작성 가능, `worker.js` 93행). 그래서 이 세 서식 중 하나를 켰을 때만 서식 카드 바로 아래에 나타나게 한다. 다른 탭으로 보내면 "서식 선택 → 탭 이동 → 기록 체크 → 돌아와 생성"으로 왔다 갔다 하게 된다.
2. **원아 연결은 메모 카드 맨 아래, 접힌 한 줄로 둔다.** 이 기능은 입력창에서 고른 문장을 가져오기 때문에(`child-links.js` 280행) 입력창과 같은 화면에 있어야 한다.
3. **서식 칩은 자리를 고정한다.** 핵심 2종(보육일지·알림장)은 늘 바깥에, 나머지 5종은 [다른 서식] 접힘 안에 둔다. 칩을 켜거나 꺼도 칩이 다른 곳으로 옮겨 가지 않는다.
4. **1회 확인 화면은 "안내 2개 + 사진 스위치 1개"로 한다.** 교사 검수 원칙과 사용 현황 90일 기록은 "동의"가 아니라 "안내"로 보여 준다. 사용 현황은 이미 운영 중이고 거부 수단이 없다(`daycare_spec.md` 24행). 실제 선택권이 있는 것은 사진 외부 AI 전송 하나뿐이고, 기본값은 꺼짐이며 설정에서 바꿀 수 있다. "동의하지 않으면 잠금" 같은 흐름은 두지 않는다.
5. **사진 전송 허용 여부의 기준은 서버에 저장된 값 하나다.** 서비스 워커가 없고 화면과 서버가 한 번에 배포되므로, 요청 본문의 `photoConsent`는 과도기 없이 바로 없앤다.
6. **두 번에 나눠 배포한다.** 1단계는 화면 배치만 바꾸고 백엔드는 건드리지 않는다. 2단계는 동의를 서버에 저장한다(GEMINI.md §7-7 안전 방어선에 해당하므로 사전 승인 필요).
7. 상단 헤더·교사 전환 바 정리, `app.js` 635행 날짜 정리는 이번 범위에서 뺀다(따로 진행).

## 1단계 · 화면 재배치 (Flash 위임)

작업 지시서: [`flash_spec_20261108_daily_flow_ui.md`](flash_spec_20261108_daily_flow_ui.md)

- A: 일상 작성 화면에서 가끔 쓰는 칸을 접거나, 필요한 조건일 때만 나타나게 한다.
- S: `public/index.html`, `public/style.css`, `public/app.js`, `public/js/records-flow.js`·`memo-sync.js`·`auth-security.js`(각 1~2줄), `tests/frontend.test.js`, 안내 문서.
- D: 지금 `.memo-card` 안에 메모 저장 안내 4줄 → 이름 제안 → 원아 연결 → 과거 기록 → 사진 동의 → 사진 → 사진 메모 버튼·상태가 차례로 쌓여 있고, 그 아래 서식 7종이 모두 펼쳐져 있다.
- S: DOM ID는 하나도 바꾸지 않는다. 백엔드·API·생성 페이로드·인증 흐름은 바꾸지 않는다. 새 라이브러리와 인라인 스크립트는 쓰지 않는다. 프론트 JS 파일은 800줄 미만을 지킨다.
- T: `npm test`, `verify_js_modules.py`, `audit_dom.py`, 계약 검사가 통과해야 한다. 로컬 가상 화면(390×844, 1280×900)에서 아래 4가지 상태가 사진에 찍혀야 한다.
  - 첫 화면에 사진 동의·과거 기록 칸이 없다
  - 사진을 첨부하면 사진 도구가 나타난다
  - 관찰일지를 켜면 서식 아래에 과거 기록 칸이 열린 채로 나타난다
  - 메모 저장 [관리]가 펼쳐진다

## 2단계 · 1회 확인과 사진 전송 설정의 서버 저장 (Claude 직접)

- A: 첫 로그인 때 안내를 한 번 확인받고, 사진 외부 AI 전송 여부를 교사 계정 기준으로 서버에 저장한다.
- S:
  - `api/auth.js`: `account.consents`, `session()` 응답, `consent` 기능 추가
  - `worker.js`: `/api/session` 응답, `POST /api/consent`, `/api/generate`·`/api/photo-memo`의 사진 검사
  - `public/index.html`: 확인 모달, 설정 카드, `#photoConsentCheck` 대신 상태 줄
  - `public/js/consent.js`: 새 파일
  - `auth-security.js`: `unlock()`에서 연결
  - `photo-memo.js`·`ai-engine.js`: 체크박스 대신 상태값 사용
  - 시험과 문서. 시험은 `auth-runtime`·`frontend`에 더하고, 기존 시험 중 `backend.test.js` 126~134행(`photoConsent:false` → 400)·`memo-runtime.test.js` 109행·`photo-memo-frontend.test.js` 47행은 요청 본문 동의 대신 서버 저장 동의를 쓰도록 고친다.
- D: 지금 서버는 `body.photoConsent === true`인지만 확인한다(`worker.js` 86행·290행). 브라우저는 체크박스 값을 매번 보낼 뿐 어디에도 저장하지 않는다.
- S: 노션 스키마는 바꾸지 않는다. 기존 계정·기기·세션 키 구조와 PIN 버전 무효화는 그대로 둔다. 건별 확인(`reviewConfirmed`, `childLinkConfirmed`, `photoMemoConfirmed`, 이름 제안 카드 체크)은 그대로 둔다.
- 설계:
  - `account.consents = { version: CONSENT_VERSION(정수 1), photoAi: boolean, at: ms }`. PIN을 바꿔도 같은 계정 객체를 저장하므로 값이 유지된다. 새 계정은 이 값이 없으므로 첫 접속 때 확인 화면이 뜬다.
  - `session()` 응답에 `consent: { acknowledged: version === CONSENT_VERSION, photoAi }`를 더한다. 안내 내용이 바뀌면 `CONSENT_VERSION`을 올려 모두에게 다시 한 번 보여 준다.
  - `consent` 기능: 세션을 확인한 뒤 `acknowledge === true`가 아니면 400을 돌려준다. `{ version, photoAi: b.photoAi === true, at }`를 저장하고 `consent`를 돌려준다.
  - `POST /api/consent`: 보호 구역(`requireSession` 다음)에서 받고, 같은 출처의 JSON만 허용한다.
  - 사진 검사: 라우트에서 `session.consent.photoAi !== true`이면 `images`가 있는 생성 요청과 사진 메모 요청을 403으로 막는다. 안내 문구는 "사진 외부 AI 전송이 꺼져 있습니다. 설정에서 켜 주세요."이다. 관리자 검증 경로(`generate()` 직접 호출, 사진 없음)에는 영향이 없다.
  - 화면:
    - `unlock()`에서 `acknowledged`가 거짓이면 확인 모달을 띄운다. [확인하고 시작] 한 번이면 끝나고, 사진 스위치는 기본 꺼짐이다.
    - 설정 카드에서 사진 스위치를 바꾸면 바로 서버에 저장한다.
    - 사진을 첨부했는데 전송이 꺼져 있으면, 사진 도구 줄에 "사진 AI 전송 꺼짐 · [켜기]"를 보여 준다.
- T:
  - workerd 가상 계정으로 다음을 확인한다: 새 계정은 `acknowledged=false`, 확인 후 `true`, PIN을 바꾼 뒤에도 유지, `photoAi=false`일 때 사진 생성·사진 메모 403, `true`일 때 통과, 세션 없이 `/api/consent` 401, 다른 출처 403.
  - 화면 시험: 확인 모달은 한 번만 뜨고, 설정 스위치가 동기화되며, 생성 페이로드에 `photoConsent`가 없다.
  - `npm test`와 계약 검사가 통과해야 한다. 로컬 화면에서 첫 로그인 → 확인 → 재로그인 시 모달이 다시 뜨지 않는지 사진으로 확인한다.

## 병합 절차

Flash 브랜치 `flash/daily-flow-ui`는 Claude가 그 브랜치 안에서 검수·교정한 뒤 `--no-ff`로 병합하고, `교정:` 줄을 남긴다(AGENT_COMMIT_PROTOCOL §3). 2단계는 1단계를 병합한 다음에 시작한다(`index.html` 충돌 방지). 버전 번호는 병합 때 Claude가 올린다.

## 진행 상황

- 1단계: 2026-11-08 병합(`a5e5f5e`).
- 2단계: 2026-11-08 구현(브랜치 `claude/consent-server`). 설계대로 하되 한 가지를 정했다. 현재 판을 확인하지 않은 계정은 저장된 photoAi 값과 관계없이 사진 전송을 꺼진 것으로 본다(안내가 바뀌면 사진 전송도 다시 고르게 함).

## 다음 작업

- `public/index.html` 나누기: 1,595줄로 계약 검사 800줄 상한을 넘는다(이 작업 이전부터). 2단계에서 확인 화면·설정 카드가 더해졌으므로, 모달·설정 묶음을 떼어 내는 방식으로 한 번에 정리한다. `frontend.test.js`의 DOM ID 검사와 `audit_dom.py`도 함께 고친다.
