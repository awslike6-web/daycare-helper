# 작업 지시서 · 일상 작성 화면 재배치 (1단계)

- 받는 쪽: Antigravity `gemini-3.8-flash`
- 쓴 쪽: Claude Code `claude-opus-5-5`
- 날짜: 2026-11-08
- 전체 설계: [`implementation_plan_20261108_daily_flow.md`](implementation_plan_20261108_daily_flow.md)

이 문서에 적힌 것만 바꾼다. 적혀 있지 않은 개선 아이디어가 떠올라도 손대지 말고, 보고서 끝 "제안" 칸에 적는다.

---

## 0. 작업 규칙

- **저장소**: `daycare-helper/` (별도 git 저장소). 아래 경로는 모두 이 폴더 기준이다.
- **브랜치**: `main`에서 `flash/daily-flow-ui`를 만들어 거기서만 커밋한다. **푸시·배포(`wrangler deploy`)·main 병합은 하지 않는다.**
- **커밋 메시지**: 한국어로 쓰고, 맨 끝 줄에 `Agent: antigravity (gemini-3.8-flash)`를 적는다.
- **바꾸면 안 되는 것**:
  - DOM `id` 이름을 바꾸거나 지우지 않는다. 위치만 옮긴다.
  - `worker.js`, `api/*`, `public/js/ai-engine.js`, `public/js/photo-memo.js`, `public/js/child-links.js`, `public/js/memo-workspace.js`, `public/js/notion-store.js`는 수정하지 않는다.
  - 생성 요청 내용(페이로드), 인증, 저장 흐름을 바꾸지 않는다.
  - 새 라이브러리를 들이지 않는다. 인라인 `<script>`나 `onclick=""`을 쓰지 않는다(CSP 규칙).
  - 새로 쓰는 마크업에는 `style=""`을 넣지 않는다. 클래스를 만들고 `style.css`에 적는다.
  - 기존 `.memo-sync-panel` 규칙(style.css 2447행 부근)은 고치지 않는다. `#photoMemoPanel`도 이 클래스를 쓰기 때문이다. 새 모양은 새 클래스로 만든다.
  - 버전 번호(3.6.7)는 그대로 둔다.
- **멈춤 조건**: 아래 중 하나라도 해당하면 더 진행하지 말고 그 자리에서 보고한다.
  - 금지 파일을 고쳐야만 해결되는 경우
  - 이 문서와 실제 코드가 다른 경우(행 번호가 어긋난 정도는 괜찮다)
  - 원래 있던 시험이 실패하는 경우

---

## 1. 바꾼 뒤의 화면 순서

`#childScrollContainer` 위쪽은 그대로 두고, 메모 카드(`.memo-card`)부터 아래처럼 바꾼다.

```
.memo-card
  ├ 메모 머리줄 (그대로)
  ├ #rawMemoInput (그대로)
  ├ 메모 저장 상태 1줄  [관리 ▾]           ← 작업 1
  │   └ (충돌 시) #memoConflict 자동 표시  ← 위치·동작 그대로
  ├ #memoChildSuggestions (그대로, 조건부 표시는 기존 코드가 담당)
  ├ .photo-area (사진 미리보기 + 첨부 버튼)
  ├ #photoAttachedTools [hidden]          ← 작업 2 (사진 1장 이상일 때만)
  │   ├ 사진 외부 AI 전송 동의 체크
  │   ├ [사진에서 행동 메모 만들기]
  │   └ #photoMemoStatus
  ├ #photoMemoPanel (그대로, 자기 hidden으로 표시)
  └ #childLinkPanel (접힌 1줄, 맨 아래로 이동)  ← 작업 4
#formatSelectCard
  ├ 핵심 2종 칩 (보육일지·알림장)
  └ <details #formatMoreBox> 다른 서식 5종    ← 작업 3
#evidencePicker [hidden]  (과거 관찰 기록 선택, 메모 카드에서 이동) ← 작업 3
#generateBtn
```

---

## 작업 1 · 메모 저장 안내를 1줄로

### 1-1. `public/index.html`

현재 `<section class="memo-sync-panel" aria-label="원시 메모 자동 저장">` 블록(약 194~204행)을 아래로 **통째로 바꾼다**. `#memoConflict` 안쪽 내용은 지금 그대로 옮긴다.

```html
<section class="memo-sync-panel memo-sync-compact" aria-label="원시 메모 자동 저장">
  <div class="memo-sync-line">
    <p id="memoSyncStatus" role="status" aria-live="polite">로그인한 교사의 원시 메모를 자동 저장합니다.</p>
    <details id="memoSyncMore" class="memo-sync-more">
      <summary>관리</summary>
      <div class="memo-sync-actions"><button type="button" id="memoSaveNow" class="action-btn">지금 메모 저장</button><button type="button" id="memoReload" class="action-btn">노션 메모 다시 조회</button></div>
      <small>입력 후 5초 · 연속 입력은 최대 30초마다 저장. 사진·완성 일지는 별도입니다.</small>
    </details>
  </div>
  <div id="memoConflict" class="memo-conflict" hidden>
    … 기존 내용 그대로 …
  </div>
</section>
```

- `#memoConflict`는 `<details>` **밖에** 둔다. 그래야 충돌이 났을 때 기존 코드가 `hidden`만 풀어도 바로 보인다.

### 1-2. `public/js/memo-sync.js`

13행 `function status(text, kind = 'info', c = current) {` 함수에서, 첫 줄 `if (c && !live(c)) return;` **다음 줄**에 한 줄만 더한다. 오류가 나면 [관리]를 자동으로 펼쳐서 [지금 메모 저장] 버튼이 보이게 하기 위해서다. 가드 앞에 넣으면 지난 원아·날짜의 늦은 오류에도 펼쳐지므로 반드시 가드 다음에 넣는다.

```js
if (kind === 'error' && el('memoSyncMore')) el('memoSyncMore').open = true;
```

`el`은 이 파일 3행에 이미 정의되어 있다. 나머지 줄은 고치지 않는다.

### 1-3. `public/style.css` (새 규칙만 추가)

- `.memo-sync-compact`: 위아래 여백을 줄인다(예: `padding: 8px 10px; margin: 8px 0 12px;`).
- `.memo-sync-line`: `display:flex; flex-wrap:wrap; align-items:flex-start; gap:6px 8px;`
- `.memo-sync-line #memoSyncStatus`: `flex:1 1 200px; margin:0; font-size:12px;`
- `.memo-sync-more > summary`: 작은 글씨(12px), 커서 포인터, 오른쪽 끝에 붙는 작은 버튼 모양. 터치 영역은 최소 높이 32px.
- `.memo-sync-more[open]`: `flex-basis:100%;`. 펼치면 버튼과 설명이 다음 줄 전체 폭으로 내려간다.
- **완료 조건**: 접힌 상태에서 모바일 390px 기준 상태 문구와 [관리]가 한 줄에 나오거나, 문구가 길면 두 줄까지 나온다. 버튼 2개와 설명은 보이지 않는다.

---

## 작업 2 · 사진 도구는 사진을 첨부한 뒤에만

### 2-1. `public/index.html`

지금은 아래 요소들이 메모 카드 안에 차례로 놓여 있다.

- `<label class="photo-consent">…#photoConsentCheck…</label>` (약 233행)
- `<div class="photo-area">…</div>`
- `<button id="photoMemoCreate">`
- `<section id="photoMemoPanel">`
- `<p id="photoMemoStatus">`

이것을 아래 순서로 바꾼다. 각 요소의 내용과 속성은 그대로 두고 위치만 옮긴다.

```html
<div class="photo-area"> … 그대로 … </div>
<div id="photoAttachedTools" class="photo-attached-tools" hidden>
  <label class="photo-consent"> … #photoConsentCheck 그대로 … </label>
  <button type="button" id="photoMemoCreate" class="action-btn">사진에서 행동 메모 만들기</button>
  <p id="photoMemoStatus" role="status" aria-live="polite">사진만으로 생성하면 먼저 행동 메모를 확인·저장합니다.</p>
</div>
<section id="photoMemoPanel" …> … 그대로 … </section>
```

- `#photoMemoPanel`은 래퍼 **밖에** 둔다. 복원된 사진 초안이 래퍼에 묻혀 안 보이는 일을 막기 위해서다.
- 잘못된 자리에 붙어 있는 주석 `<!-- 📷 사진 첨부 영역 -->`(지금 `.evidence-picker` 바로 위)은 `.photo-area` 바로 위로 옮긴다.

### 2-2. `public/app.js` · `renderPhotoPreviews()` (약 291행)

함수 끝, `box.appendChild` 반복문이 끝난 다음 줄에 더한다.

```js
const tools = document.getElementById('photoAttachedTools');
if (tools) tools.hidden = !state.photos?.length;
```

이 함수는 첨부·삭제·초안 복원(`records-flow.js` 253행)·초기화(app.js 381행 부근) 때 이미 호출되므로, 다른 곳은 고치지 않아도 된다.

### 2-3. `public/js/auth-security.js` · `showGate()` (87행)

`for (const id of ['childScrollContainer', … 'photoPreviews']) …replaceChildren();` 줄 **바로 다음에** 한 줄을 더한다. 잠금 화면으로 갈 때 사진 도구가 남아 있지 않게 하기 위해서다.

```js
if (el('photoAttachedTools')) el('photoAttachedTools').hidden = true;
```

auth-security.js에서 고치는 것은 이 한 줄뿐이다.

### 2-4. `public/style.css`

- `.photo-attached-tools`: `display:flex; flex-direction:column; gap:6px; margin-top:8px;`
- `hidden` 처리는 style.css 2396행의 공통 규칙 `[hidden] { display: none !important; }`가 맡는다. 따로 규칙을 만들지 않는다. 다만 이 공통 규칙을 지우거나 덮어쓰지 않는다.

---

## 작업 3 · 서식은 핵심 2종만 펼치고, 과거 기록은 필요할 때만

### 3-1. `public/index.html` · 서식 카드

`#formatChipsGrid` 안에서 앞의 2개 칩(`class_daily_report`, `kidsnote`)은 그대로 둔다. 나머지 5개 칩(`observation`, `hangroo_eval`, `daily_care`, `counseling`, `play_support`)은 **같은 `#formatChipsGrid` 안에** 새로 넣는 `<details>`로 옮긴다. 그리드 안에 두는 이유는, 기존 클릭 처리가 `#formatChipsGrid`에 한 번만 걸려 있어서(app.js `grid.onclick`) JS를 바꾸지 않아도 되기 때문이다.

```html
<div class="format-chips-grid" id="formatChipsGrid">
  <button … data-format="class_daily_report"> … </button>
  <button … data-format="kidsnote"> … </button>
  <details id="formatMoreBox" class="format-more">
    <summary>➕ 다른 서식 (관찰·발달평가·상담 등) <span id="formatMoreCount"></span></summary>
    <div class="format-more-grid">
      … 5개 칩 그대로 (class·data-format·내부 span 변경 금지) …
    </div>
  </details>
</div>
```

### 3-2. `public/index.html` · 과거 관찰 기록 선택 이동

메모 카드 안의 `<details class="evidence-picker">…</details>` 블록 전체를 잘라서, `#formatSelectCard`의 닫는 `</div>` **바로 다음**, `#generateBtn` **바로 앞**에 붙인다. 여는 태그만 아래처럼 바꾼다(`id`와 `hidden` 추가). 안쪽은 그대로 둔다.

```html
<details class="evidence-picker" id="evidencePicker" hidden>
```

### 3-3. `public/app.js`

**(1)** `initFormatSelector` 위쪽에 상수 2개와 함수 1개를 더한다.

```js
const CORE_FORMATS = ['class_daily_report', 'kidsnote'];
// 이 세 서식은 과거 기록만으로도 작성할 수 있어 근거 선택 칸과 함께 보인다 (worker.js generate 참고).
const HISTORY_FORMATS = ['observation', 'hangroo_eval', 'counseling'];

/** 과거 기록 칸 표시. 선택한 기록이 남아 있으면 절대 숨기지 않는다. */
function syncEvidencePicker({ allowHide = false, openOnShow = false } = {}) {
  const box = document.getElementById('evidencePicker');
  if (!box) return;
  const needed = state.selectedFormats.some(f => HISTORY_FORMATS.includes(f)) || (state.evidenceIds?.length || 0) > 0;
  if (needed && box.hidden) { box.hidden = false; if (openOnShow) box.open = true; }
  else if (!needed && allowHide) box.hidden = true;
}
window.syncEvidencePicker = syncEvidencePicker;
```

**(2)** `syncFormatChipsUI()`를 아래처럼 바꾼다. 매개변수 하나를 더하고 끝에 두 덩어리를 붙인다.

```js
function syncFormatChipsUI(fromChip = false) {
  // … 기존 chips.forEach 그대로 …
  const extra = state.selectedFormats.filter(f => !CORE_FORMATS.includes(f)).length;
  const count = document.getElementById('formatMoreCount');
  if (count) count.textContent = extra ? `· ${extra}개 켜짐` : '';
  syncEvidencePicker({ allowHide: true, openOnShow: fromChip === true });
}
```

- `window.syncFormatChipsUI`는 `records-flow.js` 250행과 `notion-store.js` 607행에서 매개변수 없이 호출된다. 그때는 `fromChip=false`이므로 과거 기록 칸이 저절로 펼쳐지지 않는다. 이것이 의도한 동작이다.

**(3)** `grid.onclick` 안의 `syncFormatChipsUI();`(약 116행)만 `syncFormatChipsUI(true);`로 바꾼다.

**(4)** `initFormatSelector()`의 첫 `syncFormatChipsUI();`(약 89행) 바로 다음에 더한다.

```js
const more = document.getElementById('formatMoreBox');
if (more) more.open = state.selectedFormats.some(f => !CORE_FORMATS.includes(f));
```

- 이 펼침 처리는 **처음 불러올 때 한 번만** 한다. 칩을 누를 때마다 다시 하면, 사용자가 열어 둔 접힘이 저절로 닫힌다.

### 3-4. `public/js/records-flow.js` · `updateEvidenceCount()` (304행)

함수의 마지막 줄 다음에 한 줄을 더한다. 기록을 선택했거나 복원했을 때 칸이 보이게만 하고, 숨기지는 않는다(`allowHide` 기본값은 거짓).

```js
window.syncEvidencePicker?.();
```

### 3-5. `public/style.css`

- `.format-more`: `grid-column: 1 / -1;` (그리드 한 줄 전체 폭)
- `.format-more > summary`: 칩과 어울리는 옅은 버튼 모양, 12~13px, 터치 높이 최소 36px.
- `.format-more-grid`: `display:grid;`. 열 구성은 `.format-chips-grid`와 같게 한다(2333행 `repeat(auto-fit, minmax(130px, 1fr))`, 480px 이하에서는 2391행처럼 `repeat(2, 1fr)`). `margin-top:8px;`
- `#evidencePicker`의 `hidden`도 공통 `[hidden]` 규칙(2396행)이 처리한다. 따로 규칙을 만들지 않는다.

### 3-6. 표시 규칙 정리 (검증 때 이대로 확인)

| 상황 | 과거 기록 칸 |
|---|---|
| 첫 로딩, 선택 서식이 보육일지·알림장뿐 | 안 보임 |
| 첫 로딩, 저장된 선택에 관찰일지가 있음 | 보임 · **접힘** |
| 관찰일지·발달평가·상담일지 칩을 눌러 켬 | 보임 · **펼침** |
| 세 서식을 모두 끔 + 선택한 기록 0건 | 안 보임 |
| 세 서식을 모두 끔 + 선택한 기록 1건 이상 | 계속 보임 |
| 기록 체크를 모두 해제함 | 다음에 칩을 바꿀 때까지 보임 |

---

## 작업 4 · 원아 연결은 메모 카드 맨 아래 한 줄로

### 4-1. `public/index.html`

`<details class="child-link-panel" id="childLinkPanel">…</details>` 블록 전체를 `#photoMemoPanel` 다음, 즉 `.memo-card`의 닫는 `</div>` **바로 앞**으로 옮긴다. 안쪽은 그대로 두고, 여는 태그의 class만 `child-link-panel memo-card-extra`로 바꾼다.

### 4-2. `public/style.css`

- `.memo-card-extra`: `margin-top:12px;`
- `.memo-card-extra > summary`: 13px, 옅은 글자색(기존 보조 글자색 변수가 있으면 그것을 쓴다). 평소에 눈에 덜 띄게 하기 위해서다.

---

## 5. 시험 추가 · `tests/frontend.test.js`

파일 끝에 아래 시험을 **그대로** 더한다. 기존 시험은 고치지 않는다.

```js
test('일상 작성 화면은 가끔 쓰는 칸을 접거나 조건부로 둔다', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const at = s => { const i = html.indexOf(s); assert.ok(i >= 0, s); return i; };
  const block = (start, end) => html.slice(at(start), html.indexOf(end, at(start)));
  assert.match(html, /<details class="evidence-picker" id="evidencePicker" hidden>/);
  assert.ok(at('id="formatSelectCard"') < at('id="evidencePicker"') && at('id="evidencePicker"') < at('id="generateBtn"'), '과거 기록은 서식과 생성 버튼 사이');
  assert.match(html, /<div id="photoAttachedTools" class="photo-attached-tools" hidden>/);
  const tools = block('id="photoAttachedTools"', 'id="photoMemoPanel"');
  for (const id of ['photoConsentCheck', 'photoMemoCreate', 'photoMemoStatus']) assert.ok(tools.includes(`id="${id}"`), id);
  const more = block('id="formatMoreBox"', '</details>');
  for (const f of ['observation', 'hangroo_eval', 'daily_care', 'counseling', 'play_support']) assert.ok(more.includes(`data-format="${f}"`), f);
  for (const f of ['class_daily_report', 'kidsnote']) assert.ok(!more.includes(`data-format="${f}"`), f);
  assert.ok(at('id="formatChipsGrid"') < at('id="formatMoreBox"'), '다른 서식은 같은 그리드 안');
  const sync = block('id="memoSyncMore"', '</details>');
  for (const id of ['memoSaveNow', 'memoReload']) assert.ok(sync.includes(`id="${id}"`), id);
  assert.ok(!sync.includes('id="memoConflict"'), '충돌 안내는 접힘 밖');
  assert.ok(at('id="photoMemoPanel"') < at('id="childLinkPanel"') && at('id="childLinkPanel"') < at('id="formatSelectCard"'), '원아 연결은 메모 카드 맨 아래');
});
```

---

## 6. 문서 고치기

- `docs/teacher_guide.md`
  - 47행 부근: "바로 저장하려면 **지금 메모 저장**을 누릅니다" → "바로 저장하려면 저장 상태 옆 **[관리]**를 열고 **지금 메모 저장**을 누릅니다"
  - 52·88행 부근: 동의 체크 안내 앞에 "사진을 첨부하면 나타나는"을 붙인다.
  - 107행 부근: "**과거 관찰 기록 선택**을 열고" → "관찰일지·발달평가·상담일지 중 하나를 켜면 서식 아래에 나타나는 **과거 관찰 기록 선택**에서"
- `public/index.html` 사용 가이드 모달(1394행·1452행 부근): 위와 같은 뜻으로 고친다.
- `docs/daycare_spec.md`: 화면 흐름 설명(13행 부근) 아래에 한 줄을 더한다.
  > 일상 작성 화면 배치(2026-11-08~): 메모 저장 버튼은 [관리] 접힘 안에 두고 오류·충돌 때 자동으로 펼친다. 사진 동의·사진 메모 버튼은 사진 1장 이상일 때만 보인다. 서식은 보육일지·알림장만 펼치고 나머지 5종은 [다른 서식] 안에 둔다. 과거 관찰 기록 선택은 관찰일지·발달평가·상담일지를 켰거나 선택한 기록이 있을 때 서식 아래에 보인다. 원아 연결은 메모 카드 맨 아래 접힘 한 줄이다.
- `docs/CORE_CATALOG.md`: `app.js` 항목에 `syncEvidencePicker({allowHide, openOnShow})` 한 줄(목적: 과거 기록 칸 조건부 표시)을 더한다.
- `walkthrough.md`: 7-3의 사진 경로와 확인 결과를 적는다.

---

## 7. 검증 (전부 실행하고, 출력 원문을 보고서에 붙인다)

### 7-1. 시험·검사 명령 (`daycare-helper/`에서 실행)

```bash
node --test --test-concurrency=1 tests/*.test.js
python -X utf8 scripts/verify_js_modules.py
python -X utf8 scripts/audit_dom.py
python -X utf8 ../scripts/verify_contracts.py --mode git-diff
```

마지막 명령은 상위 `master-tower` 저장소의 스크립트다. 실행 위치나 인자가 맞지 않으면 `--help`로 확인한 뒤 실행하고, 어떻게 실행했는지 보고서에 적는다.

### 7-2. 로컬 가상 환경 띄우기

실제 노션·AI에는 접속하지 않는다.

1. `tests/.dev.vars.ui-test.example`를 `.dev.vars.ui-test`로 복사한다. 이 파일은 git에서 무시된다.
2. 터미널 A에서 `node tests/ui-fixture.js`를 실행한다(가상 노션·AI, 8790).
3. 터미널 B에서 `npm run dev:ui`를 실행한다(로컬 Worker, 8787).
4. 로그인은 `scripts/verify_memo_workspace.mjs` 앞부분(초대 발급 → 등록 → `page.goto`)과 같은 방식으로 한다. 임시 검증 스크립트는 **`.local/verify_daily_flow.mjs`** 에 만든다. `.local/`은 git에서 무시되므로 커밋하지 않는다. `scripts/`에는 새 파일을 만들지 않는다.

### 7-3. 사진으로 확인할 상태

뷰포트는 390×844와 1280×900 두 가지다. 사진은 `docs/verification/daily-flow-*.png`에 저장한다.

| 파일 | 조작 | 사진에서 보여야 하는 것 |
|---|---|---|
| `daily-flow-mobile-start.png` | 로그인 → 원아 1명 선택 | 사진 동의 체크·[사진에서 행동 메모 만들기]·과거 기록 칸이 없다. 메모 저장 안내가 1~2줄이다. 서식 칩은 2개와 [다른 서식] 한 줄이다. |
| `daily-flow-mobile-photo.png` | `#photoFileInput`에 작은 PNG 1장 첨부 | 미리보기 아래에 동의 체크·사진 메모 버튼·상태 문구가 보인다. |
| `daily-flow-mobile-observation.png` | [다른 서식] 열기 → 관찰일지 칩 누르기 | 요약에 "· 1개 켜짐"이 보이고, 서식 카드 아래에 과거 기록 칸이 **펼쳐진 채로** 보이며, 그 아래에 생성 버튼이 있다. |
| `daily-flow-mobile-manage.png` | 저장 상태 옆 [관리] 누르기 | [지금 메모 저장]·[노션 메모 다시 조회]가 보인다. |
| `daily-flow-desktop.png` | 1280×900, 위의 관찰일지 상태 | 겹침 없이 배치되어 있다. |

자동으로 함께 확인할 것:

- 각 상태에서 `document.documentElement.scrollWidth <= window.innerWidth`이다(가로 스크롤 0).
- 콘솔에 `pageerror`가 0건이다.
- 사진을 삭제(×)하면 `#photoAttachedTools`가 다시 `hidden`이 된다.
- 관찰일지를 다시 끄면(선택 기록 0건) 과거 기록 칸이 사라진다.

사진은 저장한 뒤 **직접 열어 보고**, 사진에 실제로 보이는 것만 보고서에 적는다. 로딩 화면만 찍혔다면 그대로 그렇게 적는다.

---

## 8. 보고서 형식 (작업이 끝나면 채팅으로 회신)

1. 커밋 해시와 제목 목록 (`git log --oneline main..flash/daily-flow-ui`)
2. 바꾼 파일 목록과 줄 수 변화 (`git diff --stat main`)
3. 7-1 명령 4개의 출력 끝부분 원문 (통과·실패 개수가 보이게)
4. 7-3 사진 경로 5개와, 사진마다 실제로 보이는 것 한 줄씩
5. 지시서와 다르게 한 부분과 그 이유 (없으면 "없음")
6. 제안 (범위 밖 아이디어, 구현하지 않은 것)
