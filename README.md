# 국궁록

국궁 시수를 순(5시) 단위로 기록하고, 활·깍지별로 분석하는 웹앱(PWA)입니다.
웹으로 먼저 쓰고, 나중에 같은 코드를 Capacitor로 감싸 Android·iOS 앱으로 냅니다.

## 지금 되는 것 (1단계: 개인 기록)

- **습사**: 과녁 그림을 눌러 시수 입력. 과녁 판 = 관중, 바깥 두 겹 띠 = 불(안쪽 조금, 바깥 많이).
  우궁은 오른쪽이 앞남, 좌궁은 왼쪽이 앞남. 9등분을 켜면 관중한 칸 번호도 남깁니다. 몰기 버튼, 메모 태그, 순 메모.
- **기록**: 날짜별 습사 기록, 순별 결과와 메모, 순 삭제.
- **통계**: 기간·활 필터, 순당 평균·중률·몰기, 주별 추이, 중 수 분포, 시 위치별 중률,
  탄착 분포, 불 방향(조금·많이), 활별·깍지별·조합별 비교(10순 미만은 "기록 더 필요").
- **장비**: 활·깍지·화살을 별명으로 등록, 보관, CSV 내보내기, 예시 기록 불러오기.
- 오프라인에서도 동작하고, 휴대폰 홈 화면에 설치할 수 있습니다.

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm test         # 단위 테스트 (vitest)
npm run lint
npm run build    # dist/ 에 PWA 빌드
```

## 구조

| 경로 | 내용 |
| --- | --- |
| `src/domain/` | 화면과 무관한 규칙: 과녁 판정(`target.ts`), 통계(`stats.ts`), CSV, 예시 데이터 |
| `src/storage/` | 저장소. `Repository` 인터페이스 하나로만 읽고 쓴다. 지금은 IndexedDB(Dexie) 구현 |
| `src/platform/` | 파일 저장처럼 기기마다 다른 기능을 감싼 함수 |
| `src/state/` | 화면이 쓰는 데이터와 동작 (React context) |
| `src/screens/`, `src/components/` | 화면 |

### 앱(Capacitor)으로 옮길 때

- `src/storage/index.ts`에서 IndexedDB 대신 SQLite 구현을 돌려주면 됩니다. iOS는 웹 저장소를 지울 수 있기 때문입니다.
- `src/platform/`의 함수를 Capacitor 플러그인(Filesystem, Share 등)으로 바꿉니다.
- 화면 이동은 주소의 `#` 뒤로만 처리하므로 앱 안에서도 그대로 동작합니다.

## 배포

`main`에 합쳐지면 GitHub Actions가 GitHub Pages로 배포합니다.
처음 한 번은 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 바꿔 주세요.
주소: `https://<사용자>.github.io/sisu-note/`
