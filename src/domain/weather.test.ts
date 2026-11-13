import { describe, expect, it } from 'vitest';
import { parseMetNo, parseWttr, relativeWindDir, skyFromCode, toWeather, weatherLabel, windLevelFromSpeed } from './weather';

describe('날씨 불러오기', () => {
  it('날씨 코드와 풍속을 앱의 선택지로 바꾼다', () => {
    expect([0, 2, 3, 45, 61, 81, 95, 73].map(skyFromCode)).toEqual(['맑음', '구름', '흐림', '흐림', '비', '비', '비', '눈']);
    expect([0.5, 2, 5, 9].map(windLevelFromSpeed)).toEqual(['없음', '약함', '보통', '강함']);
  });

  it('바람 방향은 사대에서 과녁을 보는 방향 기준', () => {
    // 과녁이 북쪽(0°)일 때
    expect(relativeWindDir(10, 0)).toBe('맞바람');
    expect(relativeWindDir(90, 0)).toBe('오른쪽에서');
    expect(relativeWindDir(180, 0)).toBe('뒷바람');
    expect(relativeWindDir(270, 0)).toBe('왼쪽에서');
    // 과녁이 서쪽(270°)이면 북풍은 오른쪽에서
    expect(relativeWindDir(0, 270)).toBe('오른쪽에서');
  });

  it('사대 방향을 모르면 바람 방향은 비운다', () => {
    const c = { temperature: 11.6, code: 2, windSpeed: 3.24, windFrom: 200 };
    expect(toWeather(c, null)).toEqual({ sky: '구름', temp: 12, wind: '약함', windDir: null, windSpeed: 3.2, windFrom: 200 });
    expect(toWeather(c, 0).windDir).toBe('뒷바람');
    expect(weatherLabel(toWeather(c, 0))).toBe('구름 · 12° · 바람 약함 3.2m/s(뒷바람)');
  });

  it('예비 날씨 서비스 응답도 같은 모양으로 바꾼다', () => {
    const met = { properties: { timeseries: [{ data: { instant: { details: { air_temperature: 8.4, wind_speed: 5.1, wind_from_direction: 180 } }, next_1_hours: { summary: { symbol_code: 'lightrainshowers_day' } } } }] } };
    expect(toWeather(parseMetNo(met), 0)).toMatchObject({ sky: '비', temp: 8, wind: '보통', windDir: '뒷바람' });
    const wttr = { current_condition: [{ temp_C: '-3', windspeedKmph: '11', winddirDegree: '270', weatherCode: '326' }] };
    expect(toWeather(parseWttr(wttr), null)).toMatchObject({ sky: '눈', temp: -3, wind: '약함', windSpeed: 3.1 });
    expect(skyFromCode(parseMetNo({ properties: { timeseries: [{ data: { instant: { details: { air_temperature: 1, wind_speed: 0, wind_from_direction: 0 } }, next_1_hours: { summary: { symbol_code: 'partlycloudy_night' } } } }] } }).code)).toBe('구름');
  });
});
