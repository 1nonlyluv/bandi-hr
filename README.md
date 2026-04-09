# 근퇴 관리 웹사이트

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
