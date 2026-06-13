# PNU QuestMate V6.1 Fixed

부산대 공개 생활정보(식단, 좌석현황, 공지사항, 학사일정)를 읽어 AI 퀘스트로 바꾸고, QR 체크인/스탬프/리워드 구조를 시연하는 Netlify 배포형 웹앱입니다.

## V6.1 수정점

- `pnu-data.js` 함수가 항상 JSON을 반환하도록 수정
- 브라우저에서 함수 응답이 비어도 화면이 깨지지 않도록 `res.text()` 기반 진단 처리
- 실시간 연동 실패 시에도 식단/좌석/공지/학사 예시가 여러 개 표시되도록 개선
- 연동 진단 패널에서 HTTP 상태, 텍스트 길이, 오류 메시지 확인 가능

## 업로드 시 필수 경로

```txt
netlify/functions/pnu-data.js
netlify/functions/checkin.js
assets/qr/
index.html
netlify.toml
package.json
QR_CODES.txt
QR_PRINT_SHEET.html
README.md
SECURITY.md
```

태블릿에서 `pnu-data.js`, `checkin.js`가 루트에 올라가면 GitHub에서 이름을 각각 아래처럼 변경하세요.

```txt
netlify/functions/pnu-data.js
netlify/functions/checkin.js
```
