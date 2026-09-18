# 🧸 daycare-helper (어린이집 교사 맞춤형 AI 보육 비서)

어린이집/유치원 교사의 일상 업무를 혁신하는 2026 플래그십 AI 보육 보조 웹 서비스입니다.  
거친 단편 메모나 활동 사진 1~6장만으로 평가제 기준에 맞춘 **키즈노트 알림장, 관찰일지, 보육일지, 상담일지, 놀이지원안 5대 표준 서식**을 교사 스타일에 맞게 즉시 생성하고 노션에 아카이빙합니다.

- 🏰 **공식 배포 주소**: [https://daycare-helper.awslike6.workers.dev/](https://daycare-helper.awslike6.workers.dev/)
- 📦 **공식 깃 저장소**: [https://github.com/awslike6-web/daycare-helper](https://github.com/awslike6-web/daycare-helper)

---

## 🚀 주요 기능
- **3대 목적별 집중 모드 엔진**:
  - **📸 놀이 알림장 집중**: 놀이 사진/장면에 100% 집중하여 학부모가 감동하는 풍부하고 따뜻한 놀이 서술형(250~400자) 알림장 1개 카드 메인 생성.
  - **🧸 평가제 관찰일지**: 보육 평가제(평가인증) 표준보육과정 기준의 객관적 행동 서술(`~함`) 및 교사 배움 지원 특화.
  - **📋 5대 보육 서식 종합팩**: 알림장·관찰일지·보육일지·상담일지·놀이지원안 전체 일괄 동시 생성.
- **🪄 AI 실시간 다듬기 (Quick Refine) & 안심 복원**:
  - 생성된 알림장 바로 아래에서 원터치 칩(더 다정하게, 더 길게, 간결하게, 점심 칭찬 추가) 및 자유 직접 지시로 1초 만에 리터칭.
  - **`↺ 원래대로 복원`**: 수정을 거치다가 언제든 최초 생성 초안으로 원터치 안전 원복.
- **선생님 맞춤 페르소나 & Few-shot 학습**:
  - 평소 선생님이 작성했던 알림장 예시문(1~2개)을 그대로 학습하여 특유의 문장 호흡, 어미, 이모지 감성을 100% 모방.
- **멀티모달 비전 지원**: 스마트폰 갤러리/카메라 사진(최대 6장)을 첨부하면 Gemini 3.8 Flash가 교구, 표정, 놀이 맥락을 자동 분석.
- **품격 있는 긍정 서술 원칙**:
  - 실패, 미숙, 산만 등 부정적 어휘를 원천 금지하고 회복탄력성과 배움의 호기심으로 긍정 승화.
- **개인정보 안심 가드**: Gemini API 전송 시 실명을 `[아동A]`로 자동 마스킹 후 반환 시 복원.
- **0% 전송 사고 안전 UX**: 원터치 클립보드 복사 및 모바일 네이티브 공유 (`navigator.share`) 방식.

---

## 🛠️ 기술 스택
- **AI Model**: Google Gemini **`gemini-3.8-flash`** (2026 플래그십 표준)
- **Backend API**: Cloudflare Workers
- **Database**: Notion REST API (`Notion-Version: 2022-06-28`) 3대 DB 연계
- **Frontend**: PWA 반응형 Vanilla JS (ES2024+) + Modern CSS + Web Speech API (STT)

---

## 💻 로컬 개발 환경 실행

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 파일 생성 (.dev.vars)
cp .dev.vars.example .dev.vars
# .dev.vars 파일 내 GEMINI_API_KEY, NOTION_TOKEN 등 입력

# 3. 로컬 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:8787` 접속하여 테스트 가능합니다.
