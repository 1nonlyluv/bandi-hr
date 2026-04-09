# Program Viewer Spec

## 목표

이 앱의 기본 진입점은 `Today`가 아니라 `Now`다.

- 사용자가 앱을 열면 가장 먼저 "지금 어떤 시간 블록이 진행 중인지"를 본다.
- 현재 시간 블록 안에 반별로 동시에 열려 있는 프로그램을 한 번에 본다.
- 그 다음 탐색은 `이전 블록`, `다음 블록`, `오늘 전체`, `주간`, `검색` 순서로 확장된다.

## 핵심 UX

### 1. Now 홈

첫 화면에서 보여줘야 하는 정보는 아래 순서로 고정한다.

1. 현재 날짜와 현재 시각
2. 현재 시간 블록
3. 현재 시간 블록 안의 진행 중인 활동 목록
4. 이전 블록과 다음 블록
5. 오늘 전체 타임라인

### 2. 시간 기준 탐색

- 사용자는 날짜보다 먼저 `시간 블록`을 기준으로 이동한다.
- 같은 시간 블록 안에 여러 프로그램이 있으면 각각을 별도 카드로 보여준다.
- 필터는 블록을 지우지 않고 블록 안의 엔트리만 좁힌다.

## 정보 구조

### 라우트

- `/index.html`
  - Now 홈
- `/day.html?date=2026-03-23`
  - 하루 전체 보기
- `/week.html?week=2026-03-23`
  - 주간 보기
- `/browse.html`
  - 전체 검색/정렬/필터
- `/calendar.html`
  - 달력 보기

### 화면 이동 흐름

1. `Now`에서 현재 블록 확인
2. `이전 블록` 또는 `다음 블록`으로 빠르게 이동
3. 더 넓은 맥락이 필요하면 `오늘 전체`
4. 날짜 비교가 필요하면 `주간`
5. 특정 프로그램을 찾으려면 `검색`

## 데이터 모델

정본 데이터 구조는 `days > blocks > entries`다.

- `day`
  - 날짜 단위
- `block`
  - 시간 구간 단위
- `entry`
  - 반별 실제 프로그램 단위

검색과 정렬 성능을 위해 `flatEntries`를 같이 생성해도 된다.

### JSON 필드 규칙

- `date`: `YYYY-MM-DD`
- `start`, `end`: `HH:MM`
- `startMin`, `endMin`: 분 단위 정수
- `groupIds`: 배열
- `categoryId`: 분류 키
- `staff`: 담당자 배열
- `tags`: 검색용 문자열 배열
- `section`: `오전`, `오후`, `공통` 등 화면 그룹용 값

### 상태 계산 규칙

기본 시간대는 `Asia/Seoul`이다.

현재 상태는 아래 네 가지 중 하나다.

- `before_open`
- `in_block`
- `between_blocks`
- `after_close`

판정 규칙:

```text
if now < firstBlock.startMin => before_open
if block.startMin <= now < block.endMin => in_block
if lastBlock.endMin <= now => after_close
else => between_blocks
```

### URL 파라미터

- `at`
  - 예: `2026-03-23T14:20`
  - 시연, QA, 디버그용
- `date`
- `week`
- `groups`
- `categories`
- `q`
- `sort`

## 페이지 상세

### `/index.html`

목적:

- 지금 기준의 시간 블록을 즉시 보여준다.

필수 모듈:

- `LiveClock`
- `NowStatusBanner`
- `ActiveBlockHero`
- `ActiveEntriesGrid`
- `BlockNavigator`
- `TodayMiniTimeline`
- `FilterChips`

표시 규칙:

- 현재 블록이 있으면 크게 강조한다.
- 현재 블록이 없으면 다음 블록 또는 운영 종료 상태를 보여준다.
- 현재 블록 안의 엔트리는 카드 목록으로 보여준다.

### `/day.html`

목적:

- 하루 전체 시간표를 세로 타임라인으로 보여준다.

필수 모듈:

- `DayHeader`
- `DayFilterBar`
- `DayTimeline`
- `BlockSection`
- `EntryCard`

### `/week.html`

목적:

- 월-토 단위의 시간표 비교

필수 모듈:

- `WeekHeader`
- `WeekGrid`
- `WeekCellSummary`

모바일에서는 큰 표 대신 카드 목록으로 바꾼다.

### `/browse.html`

목적:

- 전체 일정 검색, 정렬, 필터링

필수 모듈:

- `SearchBar`
- `BrowseFilterBar`
- `SortSelect`
- `ResultList`

### `/calendar.html`

목적:

- 날짜 선택 진입점

필수 모듈:

- `MonthSelect`
- `CalendarGrid`
- `DayCard`

## 컴포넌트 계약

### ActiveBlockHero

입력:

- `block`
- `remainingMinutes`
- `status`

출력:

- 시간 범위
- 섹션
- 남은 시간 또는 다음 블록까지 시간

### EntryCard

입력:

- `entry`
- `groupMeta`
- `categoryMeta`

출력:

- 반 이름
- 프로그램명
- 부제
- 분류
- 담당자
- 위치

### BlockNavigator

입력:

- `prevBlock`
- `nextBlock`

출력:

- 이전 블록 카드
- 다음 블록 카드

### TodayMiniTimeline

입력:

- `day.blocks`
- `activeBlockId`

출력:

- 모든 블록 목록
- 현재 블록 하이라이트

## 선택자 함수 계약

```js
selectDay(data, date)
selectNowState(data, at)
selectVisibleEntries(block, filters)
selectPrevNextBlocks(day, nowMinutes)
selectTimeline(day)
selectBrowseEntries(data, filters, sort)
```

가장 중요한 함수는 `selectNowState`다.

반환 형식:

```js
{
  status,
  day,
  block,
  prevBlock,
  nextBlock,
  remainingMinutes,
  upcomingMinutes,
  visibleEntries
}
```

## 빌드 구조

현재 프로젝트는 Python이 정적 HTML을 생성하는 구조다. 프로그램 뷰어도 같은 흐름으로 맞춘다.

```text
원본 문서
-> parser
-> normalized JSON
-> static builder
-> webapp output
```

권장 파일:

```text
data/
  raw/
  generated/
    program_schedule.json

program_schedule_parser.py
program_schedule_exporter.py
build_program_webapp.py
serve_program_webapp.py

templates/
  base.html
  now.html
  day.html
  week.html
  browse.html
  calendar.html

webapp/
  index.html
  day.html
  week.html
  browse.html
  calendar.html
  assets/
    app.css
    app.js
    data-loader.js
    selectors.js
    now.js
    day.js
    week.js
    browse.js
    calendar.js
```

## 구현 순서

### Phase 1

- `program_schedule.json` 생성
- `selectors.js` 작성
- `index.html` Now 화면 구현
- `day.html` 구현

### Phase 2

- `browse.html` 구현
- `week.html` 구현
- `calendar.html` 구현

### Phase 3

- 스타일 정리
- QA 시간 제어
- 다중 문서 병합 대응

## QA 체크리스트

- 14:20이면 14:00-15:00 블록이 잡히는가
- 13:35이면 첫 블록 전 또는 블록 사이 상태가 정확한가
- 17:30이면 저녁 또는 송영 블록이 표시되는가
- 그룹 필터 후 엔트리가 0개여도 블록 자체는 유지되는가
- `?at=`가 있을 때 시스템 현재 시간이 아닌 지정 시각을 쓰는가
- 특정 날짜에 데이터가 없을 때 빈 상태가 자연스러운가
