# 데이터 수집 사양 — collect-daily / collect-benchmarks

> **최종 업데이트:** 2026-02-26  
> **소스 파일:**  
> - `src/app/api/cron/collect-daily/route.ts`  
> - `src/app/api/cron/collect-benchmarks/route.ts`

---

## 1. collect-daily

**스케줄:** 매일 03:00 UTC (KST 12:00)  
**역할:** 전날(yesterday) Meta 광고 성과 데이터를 ad 단위로 수집해 DB에 적재

### 1-1. 수집 대상 계정

| 항목 | 내용 |
|------|------|
| 대상 범위 | `META_ACCESS_TOKEN`으로 접근 가능한 **전체 광고계정** |
| 계정 조회 엔드포인트 | `GET /me/adaccounts?fields=account_id,name&limit=500` |
| 계정 수 제한 | 최대 500개 (페이지네이션 미구현) |

### 1-2. Meta Insights API 호출 조건

| 파라미터 | 값 |
|----------|----|
| 엔드포인트 | `GET /act_{id}/insights` |
| `level` | `ad` |
| `date_preset` | `yesterday` |
| `limit` | `500` (계정당 최대 500 rows, 페이지네이션 없음) |
| `fields` | `spend, impressions, clicks, actions, action_values, ctr, cpc, cpm, frequency, reach, video_play_actions, video_thruplay_watched_actions` |
| timeout | 60초 |

### 1-3. 광고 단위

- **Level: ad** — campaign / adset / ad 계층 전부 메타데이터로 기록
- 각 row는 `ad_id` 기준 1일치 성과

### 1-4. 필터링 조건

| 항목 | 내용 |
|------|------|
| API 호출 단계 필터 | **없음** (impressions 최솟값 없음) |
| 클라이언트 필터 | `insights.length > 0`이면 전부 저장 |
| 수집 갯수 제한 | 계정당 최대 500개 (API limit 그대로) |

> ⚠️ 데이터가 많은 계정은 limit=500 초과분이 누락될 수 있음 (페이지네이션 미구현)

### 1-5. 계산 지표 (서버 사이드)

| 구분 | 지표 | 계산식 |
|------|------|--------|
| 기본 | spend, impressions, reach, clicks | API 원본값 |
| 기본 | ctr, cpc, cpm, frequency | API 원본값 |
| 전환 | purchases | `actions[purchase \| omni_purchase]` |
| 전환 | purchase_value | `action_values[purchase \| omni_purchase]` |
| 전환 | initiate_checkout | `actions[initiate_checkout \| omni_initiated_checkout]` |
| 전환율 | roas | `purchase_value / spend` |
| 영상 | video_p3s_rate | `video_play_actions 합계 / impressions × 100` |
| 영상 | thruplay_rate | `video_thruplay_watched_actions 합계 / impressions × 100` |
| 영상 | retention_rate | `thruplay / video_p3s × 100` |
| 참여 | reactions_per_10k | `reactions / impressions × 10,000` |
| 참여 | comments_per_10k | `comments / impressions × 10,000` |
| 참여 | shares_per_10k | `shares / impressions × 10,000` |
| 참여 | engagement_per_10k | `(reactions+comments+shares) / impressions × 10,000` |
| 퍼널 | click_to_checkout_rate | `initiate_checkout / clicks × 100` |
| 퍼널 | click_to_purchase_rate | `purchases / clicks × 100` |
| 퍼널 | checkout_to_purchase_rate | `purchases / initiate_checkout × 100` |
| 퍼널 | reach_to_purchase_rate | `purchases / impressions × 100` |
| 분류 | creative_type | `video_play_actions > 0` → `VIDEO`, 아니면 `IMAGE` |

### 1-6. 저장 테이블: `daily_ad_insights`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| date | date | 광고 집행일 (yesterday) |
| account_id | text | 광고계정 ID |
| account_name | text | 광고계정 이름 |
| campaign_id / campaign_name | text | 캠페인 |
| adset_id / adset_name | text | 광고세트 |
| ad_id / ad_name | text | 광고 |
| spend | numeric | 지출 (원) |
| impressions | integer | 노출수 |
| reach | integer | 도달수 |
| clicks | integer | 클릭수 |
| purchases | integer | 구매수 |
| purchase_value | numeric | 구매액 |
| ctr | numeric | 클릭률 |
| roas | numeric | 광고수익률 |
| cpc / cpm / frequency | numeric | 단가 지표 |
| initiate_checkout | integer | 결제 시작수 |
| video_p3s_rate | numeric | 3초 재생률 (%) |
| thruplay_rate | numeric | 완주율 (%) |
| retention_rate | numeric | 3초 대비 완주율 (%) |
| reactions/comments/shares_per_10k | numeric | 만 노출당 참여 |
| engagement_per_10k | numeric | 만 노출당 총 참여 |
| click_to_checkout_rate | numeric | 클릭→결제 시작률 (%) |
| click_to_purchase_rate | numeric | 클릭→구매율 (%) |
| checkout_to_purchase_rate | numeric | 결제 시작→구매율 (%) |
| reach_to_purchase_rate | numeric | 노출→구매율 (%) |
| creative_type | text | `VIDEO` 또는 `IMAGE` |
| collected_at | timestamptz | 수집 시각 |

---

## 2. collect-benchmarks

**스케줄:** 매주 월요일 02:00 UTC (KST 11:00)  
**역할:** `daily_ad_insights` 데이터를 집계해 지표별 백분위 벤치마크 산출 → `benchmarks` 테이블 저장

### 2-1. 데이터 소스

| 항목 | 내용 |
|------|------|
| 소스 테이블 | `daily_ad_insights` |
| 기간 필터 | **최근 7일** (`date >= 7일 전` AND `date <= 오늘`) |
| impressions 최솟값 | **3,500** (이하 행은 제외) |

### 2-2. 그룹핑

| creative_type 값 | 설명 |
|------------------|------|
| `ALL` | 필터 통과한 전체 rows |
| `VIDEO` | creative_type = VIDEO인 rows |
| `IMAGE` | creative_type = IMAGE인 rows |

> `source` 컬럼은 항상 `"all_accounts"` (계정 구분 없음)

### 2-3. 벤치마크 대상 지표 (20개)

| # | metric_name | 설명 |
|---|-------------|------|
| 1 | roas | 광고수익률 |
| 2 | ctr | 클릭률 |
| 3 | cpc | 클릭당 비용 |
| 4 | cpm | 1,000 노출당 비용 |
| 5 | spend | 지출 |
| 6 | impressions | 노출수 |
| 7 | clicks | 클릭수 |
| 8 | purchases | 구매수 |
| 9 | purchase_value | 구매액 |
| 10 | video_p3s_rate | 3초 재생률 |
| 11 | thruplay_rate | 완주율 |
| 12 | retention_rate | 3초 대비 완주율 |
| 13 | reactions_per_10k | 만 노출당 반응수 |
| 14 | comments_per_10k | 만 노출당 댓글수 |
| 15 | shares_per_10k | 만 노출당 공유수 |
| 16 | engagement_per_10k | 만 노출당 총 참여 |
| 17 | click_to_checkout_rate | 클릭→결제 시작률 |
| 18 | checkout_to_purchase_rate | 결제 시작→구매율 |
| 19 | click_to_purchase_rate | 클릭→구매율 |
| 20 | reach_to_purchase_rate | 노출→구매율 |

### 2-4. Percentile 계산 방식

```
값이 0보다 큰(> 0) rows만 추출 → 오름차순 정렬 → 선형 보간법

idx = (p / 100) × (n - 1)
lo = floor(idx), hi = ceil(idx)
result = sorted[lo] + (sorted[hi] - sorted[lo]) × (idx - lo)
```

- **0 이하 값 제외** (비정상 데이터 및 미집행 광고 배제)
- p25 / p50(중간값) / p75 / p90 + avg 산출
- 소수점 4자리 반올림

### 2-5. 저장 테이블: `benchmarks`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| date | date | 계산 실행일 |
| period | text | `YYYY-MM-DD~YYYY-MM-DD` (7일 범위) |
| metric_name | text | 지표명 |
| creative_type | text | `ALL` / `VIDEO` / `IMAGE` |
| source | text | `"all_accounts"` (고정) |
| p25 | numeric | 25 백분위 |
| p50 | numeric | 50 백분위 (중간값) |
| p75 | numeric | 75 백분위 |
| p90 | numeric | 90 백분위 |
| avg_value | numeric | 평균 |
| sample_size | integer | 계산에 사용된 샘플 수 |
| calculated_at | timestamptz | 계산 시각 |

**UPSERT 충돌 키:** `(metric_name, creative_type, date)` — 같은 날 재실행 시 덮어쓰기

---

## 3. 전체 파이프라인 요약

```
[Meta Graph API]
      │  level=ad, date_preset=yesterday, limit=500/계정
      ▼
[collect-daily]  ← 매일 KST 12:00
      │  계산: roas, ctr, creative_type, 영상/참여/퍼널 지표
      ▼
[daily_ad_insights]  (raw ad-level rows)
      │  필터: 최근 7일 & impressions ≥ 3,500
      ▼
[collect-benchmarks]  ← 매주 월 KST 11:00
      │  그룹: ALL / VIDEO / IMAGE
      │  계산: p25 / p50 / p75 / p90 / avg (20개 지표)
      ▼
[benchmarks]  (upsert by metric_name + creative_type + date)
```

---

## 4. 주요 제약 및 주의사항

| 항목 | 내용 |
|------|------|
| 페이지네이션 | collect-daily는 계정당 limit=500 이상 광고가 있으면 초과분 누락 |
| impressions 필터 | collect-daily는 필터 없음, collect-benchmarks는 3,500 이상만 사용 |
| creative_type 판별 | `video_play_actions` 합계 > 0이면 VIDEO, 아니면 IMAGE (이미지 카루셀 포함) |
| Mixpanel LP 수집 | 코드에 구현되어 있으나 **현재 비활성화** (주석 처리) |
| 벤치마크 0값 처리 | 값이 0 이하인 데이터는 percentile 계산에서 제외 |
