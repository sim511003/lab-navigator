# Lab Navigator 배포 가이드 (무료 버전)

실험 전에 우리 랩 장비로 가능한지 판정하는 의사결정 AI 사이트.
사이트는 Vercel 무료 플랜, AI는 Google Gemini 무료 API를 사용함. 카드 등록 없이 0원으로 운영 가능.

## 폴더 구성

- `index.html` — 사이트 화면 (판정 로직, 직접 입력 폼 포함)
- `api/ai.js` — AI 서버 함수. API 키를 숨긴 채 Gemini를 대신 호출함
- `vercel.json` — 서버 함수 실행 시간 설정 (최대 60초)
- `package.json` — 프로젝트 정보

## 1. Gemini API 키 발급 (무료)

- https://aistudio.google.com 에 Google 계정으로 로그인 (만 18세 이상)
- 왼쪽 메뉴 Get API key → Create API key → 키 복사
- **결제 정보(Billing)는 연결하지 말 것**
  - 연결하면 유료 등급으로 바뀌고, 잔액이 0이 돼도 무료로 자동 복귀하지 않음
- 무료 한도는 프로젝트마다 다르니 AI Studio의 사용량(Usage/Rate limit) 화면에서 확인
- 무료 사용분의 입력 내용은 Google 제품 개선에 쓰일 수 있음 → 공개 논문 절차만 넣고 개인정보·미발표 데이터는 넣지 말 것
- **키는 절대 index.html이나 GitHub에 올리지 말 것**

## 2. GitHub에 올리기

- https://github.com 가입 → New repository → 이름 `lab-navigator`
- "uploading an existing file" 클릭 → 이 폴더 안의 파일을 **폴더 구조 그대로** 끌어다 놓기
  - `api` 폴더 안에 `ai.js`가 들어가 있어야 함
- Commit changes

## 3. Vercel로 배포 (무료)

- https://vercel.com 에서 GitHub 계정으로 가입 (Hobby 플랜 = 무료)
- Add New → Project → `lab-navigator` 저장소 Import
- **Environment Variables**에 추가
  - Key: `GEMINI_API_KEY` / Value: 1단계에서 복사한 키
  - (선택) Key: `GEMINI_MODEL` / Value: 모델 이름. 기본값은 `gemini-3.8-flash`
- Deploy 클릭 → 1분 정도 뒤 `lab-navigator-xxxx.vercel.app` 주소가 생김

## 4. 확인

- 사이트 주소 뒤에 `/api/ai`를 붙여서 열기 → `"configured":true`가 보이면 키 연결 성공
- 사이트에서 "물질 이름으로 찾기"에 `TiO₂ 나노로드` 입력 → 실험법 3개가 판정되면 완료

## 문제가 생기면

- **"AI 설정 문제"가 뜸**: 키가 틀렸거나 모델 이름이 바뀐 경우
  - AI Studio에서 무료로 쓸 수 있는 Flash 모델 이름을 확인 → Vercel의 `GEMINI_MODEL`에 넣고 Redeploy
- **"오늘 무료 AI 한도를 다 썼음"이 뜸**: 무료 한도 소진. 다음 날 초기화됨
  - 한도가 더 큰 Flash-Lite 모델로 `GEMINI_MODEL`을 바꾸는 방법도 있음 (정확도는 조금 낮을 수 있음)
  - 그동안은 사이트의 "실험법 직접 입력"으로 시연 가능
- 자세한 오류는 Vercel → 프로젝트 → Logs에서 확인

## 수정할 때

- GitHub에서 파일을 고치고 Commit하면 Vercel이 자동으로 다시 배포함

## 보안·비용 장치

- 브라우저는 `{ kind, text }`만 보내고 프롬프트는 서버가 만듦 → 사이트를 일반 챗봇처럼 악용 불가
- IP당 10분에 10회 제한, 입력은 12,000자까지
- 결제를 연결하지 않으면 한도를 넘어도 요청이 막힐 뿐 요금은 나가지 않음

## 알아둘 점

- 사용자가 추가한 장비·시약·실험법은 각자 브라우저에만 저장됨 (회원·공유 저장 기능은 없음)
- 기본 실험법은 시연용 예시 데이터이고, AI가 뽑은 실험법은 출처 확인이 필요함
