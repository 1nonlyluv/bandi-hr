# 근태 관리 웹사이트

## 실행
```sh
source ~/.zshrc
bun install
bun run dev
```

## 데이터 갱신
엑셀을 수정하면 아래 명령으로 JSON을 다시 생성할 수 있다.

```sh
bun run generate:data
```

`dev`, `build` 스크립트는 실행 전에 자동으로 데이터를 다시 생성한다.

루트의 `26년 근무표.xlsx` 같은 월별 근무표 파일에서 탭 내용만 바뀌어도 다시 생성된다. 현재는 루트의 `.xlsx` 파일 중 가장 최근 수정된 파일을 읽고, 엑셀 임시 잠금 파일(`~$...xlsx`)은 자동으로 무시한다.

## 웹 배포
현재 앱은 GitHub Pages 자동 배포를 기준으로 설정되어 있다.

1. GitHub 저장소의 `Settings > Pages`에서 `GitHub Actions`를 배포 소스로 선택한다.
2. `Settings > Secrets and variables > Actions`에 `DATA_GO_KR_SERVICE_KEY`를 추가하면 공휴일 API도 함께 반영된다.
3. 이후 `main` 브랜치에 푸시하면 아래가 자동으로 실행된다.
   - 최신 `.xlsx`에서 `schedule.json` 재생성
   - Vite 웹 빌드
   - GitHub Pages 배포

즉 운영 방식은 `26년 근무표.xlsx`에 새 월 탭을 추가하거나 기존 탭 내용을 수정한 뒤 `main`에 푸시하면 된다.

## 데스크톱 앱
현재 데스크톱 빌드는 macOS 전용이며, 웹 앱을 로컬 `.app` 번들로 만든다.

```sh
bun run desktop:build
```

빌드 결과물은 `desktop/build/BandiHR.app`에 생성된다.

개발 모드로 데스크톱 창을 띄우려면 아래 명령을 사용한다.

```sh
bun run desktop:dev
```
