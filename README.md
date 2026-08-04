# Electron + React 쪽지 뷰어 — 사용자 정의 프로토콜 버전

`note-resource://local/...` 사용자 정의 프로토콜로 HTML 쪽지의 상대경로 이미지, CSS, 폰트와 미디어를 제공합니다.

## 실행
```bash
npm install
npm run dev
```

## 빌드
```bash
npm run dist:win
npm run dist:nsis
npm run dist:linux
```

## 지원 예시
```html
<img src="photo.png">
<img src="./images/photo.png">
<img src="../shared/logo.png">
```

최종 경로는 선택한 쪽지 루트 폴더 안에 있어야 합니다. 프로그램은 마지막 폴더 경로를 저장하고, Electron 기본 메뉴를 숨기며, 왼쪽 목록과 오른쪽 본문을 각각 스크롤합니다.
