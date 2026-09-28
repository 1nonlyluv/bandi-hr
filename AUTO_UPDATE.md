# 근무표 자동 업데이트

## 정상 동작

- 기존 iCloud 폴더의 `26년 근무표.xlsx`를 수정하고 저장합니다.
- 로그인된 Mac이 켜져 있고 인터넷에 연결되어 있으면 1분마다 파일 내용의 SHA-256을 비교합니다.
- 두 번 읽은 내용이 같고 XLSX 검증을 통과하면 별도 임시 저장소에서 엑셀만 GitHub에 전송합니다.
- GitHub Actions가 공휴일 API를 포함한 빌드를 실행하고 Pages에 배포합니다.
- 배포 성공과 사이트의 `version.json`에 기록된 엑셀 해시까지 일치해야 `current`로 기록합니다.
- 보통 저장 후 약 2~5분이 걸립니다. GitHub 대기, iCloud 동기화, 인터넷 상태에 따라 더 걸릴 수 있습니다.

## 복구 방식

실행 스크립트와 상태 파일은 iCloud가 아닌 `~/Library/Application Support/BandiHR/AutoPublish`에 설치됩니다. 실행에 npm 패키지나 iCloud 안의 Git 저장소가 필요하지 않습니다.

엑셀은 macOS 파일 복사 기능으로 로컬 사본을 만든 뒤 읽습니다. iCloud 원본을 Node가 직접 읽을 때 발생한 간헐적인 읽기 오류를 피하고, 두 로컬 사본의 해시를 비교해 저장 완료 여부를 확인합니다.

저장 중, 파일 접근 실패, 인터넷 단절, Git 전송 실패 시 다음 1분 주기에 다시 시도합니다. 업로드에 실패한 내용은 성공으로 기록하지 않습니다. 재부팅 후 로그인하거나 잠자기에서 깨어나도 현재 파일을 다시 검사하므로 다시 저장할 필요가 없습니다.

세 번 연속 실패하면 macOS 알림을 요청하고 상태 파일에 오류를 남깁니다. 알림 표시 여부는 Mac의 알림 설정에 따릅니다. GitHub 빌드 자체가 실패하면 오류 링크를 확인해 빌드를 수정하거나 Actions에서 다시 실행해야 합니다.

## 설치와 상태 확인

```sh
node scripts/install-workbook-autopublish.mjs install "/절대경로/26년 근무표.xlsx"
node scripts/install-workbook-autopublish.mjs status
```

설치에는 Node.js와 Git, 해당 GitHub 저장소에 push할 수 있는 인증이 필요합니다. 다른 Mac에서도 별도로 설치해야 합니다. 설치에 사용한 Node 실행 파일을 제거하거나 위치를 바꿨다면 재설치하세요.

상태 파일: `~/Library/Application Support/BandiHR/AutoPublish/status.json`

로그: `~/Library/Application Support/BandiHR/AutoPublish/sync.log`

- `checkedAt`: 마지막 확인 시각(UTC)
- `deploying`: GitHub 전송 완료, 배포 확인 중
- `current`: 공개 웹사이트와 엑셀의 내용 해시 일치 확인 완료
- `error`: 실패 사유는 `error` 필드, 다음 주기에 재시도

Mac이 꺼져 있거나 로그아웃한 동안에는 전송할 수 없습니다. 실행 위치를 로컬로 옮겨도 OS가 엑셀 자체의 읽기 권한을 차단할 가능성은 있으므로, `Operation not permitted`가 기록되면 macOS 개인정보 보호 설정에서 설치에 사용한 Node의 파일 접근 권한을 확인해야 합니다. 권한을 복구하면 자동으로 재시도합니다.

공개 사이트의 `version.json`에는 커밋, 엑셀 해시와 빌드 시각만 있으며 서비스키는 포함하지 않습니다.

## 검증

```sh
node --test scripts/workbook-sync.test.mjs
```

격리된 임시 Git 저장소에서 중복 방지, 전송 실패 후 재시도, XLSX 손상 방지, 동시 실행 차단, 엑셀만 커밋하는 동작을 검사합니다.
