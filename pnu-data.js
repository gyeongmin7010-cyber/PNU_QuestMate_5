const https = require('https');
const zlib = require('zlib');

const SOURCES = {
  meals: 'https://m.pusan.ac.kr/ko/meals',
  seats: 'https://m.pusan.ac.kr/ko/seat',
  notices: 'https://m.pusan.ac.kr/ko/notice/cover/list/1?current=notice',
  academic: 'https://m.pusan.ac.kr/ko/notice/cover/list/1?current=haksa'
};

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store, max-age=0'
};

const FALLBACK = {
  meals: [
    { title: '데모: 오늘 학식 확인 후 금정회관/학생식당 미션 추천', meta: '공개 페이지 연결 실패 시 표시' },
    { title: '데모: 조식·중식·석식 메뉴 확인 후 식사 만족도 기록', meta: 'AI 퀘스트 생성용 예시' },
    { title: '데모: 식당 방문 QR 인증 후 하루 1개 스탬프 후보', meta: '리워드 남용 방지 적용' }
  ],
  seats: [
    { title: '데모: 새벽벌도서관 좌석현황 확인 후 학습 미션 수행', meta: '공개 페이지 연결 실패 시 표시' },
    { title: '데모: 미리내열람실 잔여석 확인 후 30분 집중 미션', meta: 'AI 퀘스트 생성용 예시' },
    { title: '데모: 좌석 많은 공간 우선 추천', meta: '실제 운영 시 좌석 데이터 반영' }
  ],
  notices: [
    { title: '데모: 최신 공지 확인 후 마감일 퀴즈 미션 수행', meta: '공개 페이지 연결 실패 시 표시' },
    { title: '데모: 장학/비교과 공지 요약 확인', meta: 'AI 요약·퀴즈 기능 예시' },
    { title: '데모: 학생지원 공지에서 대상자·신청방법 추출', meta: '공지 확인왕 미션' }
  ],
  academic: [
    { title: '데모: 학사일정 확인 후 이번 주 일정 정리', meta: '공개 페이지 연결 실패 시 표시' },
    { title: '데모: 수강·시험·성적 일정 확인 미션', meta: 'AI 퀘스트 생성용 예시' },
    { title: '데모: 마감일을 캘린더형으로 정리', meta: '학사일정 체크 미션' }
  ]
};

function httpGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: timeoutMs,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; PNU QuestMate V6.1; Netlify Function)',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.7',
        'accept-encoding': 'gzip,deflate,br'
      }
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const enc = String(res.headers['content-encoding'] || '').toLowerCase();
        const finish = (err, decoded) => {
          if (err) return reject(err);
          resolve({ status: res.statusCode, contentType: res.headers['content-type'] || '', text: decoded.toString('utf8') });
        };
        if (enc.includes('gzip')) zlib.gunzip(buffer, finish);
        else if (enc.includes('deflate')) zlib.inflate(buffer, finish);
        else if (enc.includes('br')) zlib.brotliDecompress(buffer, finish);
        else finish(null, buffer);
      });
    });
    req.on('timeout', () => { req.destroy(new Error('요청 시간이 초과되었습니다.')); });
    req.on('error', reject);
  });
}

function decodeEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function strip(html) {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>|<\/tr>|<\/p>|<\/div>|<\/a>|<\/span>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
  ).trim();
}

function addUnique(arr, title, meta = '') {
  const clean = String(title || '').replace(/\s+/g, ' ').trim();
  if (clean.length < 6) return;
  if (/^(로그인|메뉴|검색|닫기|이전|다음|부산대학교|PUSAN)/i.test(clean)) return;
  if (!arr.some(x => x.title === clean)) arr.push({ title: clean.slice(0, 160), meta });
}

function extractLines(text, keywords, max = 10) {
  const arr = [];
  const lines = String(text || '').split(/\n|(?=\d{4}[.\-]\d{2}[.\-]\d{2})|(?=\d{2}[.]\d{2})|(?=조식)|(?=중식)|(?=석식)|(?=새벽벌)|(?=미리내)|(?=잔여)|(?=공지)|(?=학사)|(?=신청)|(?=장학)|(?=수강)|(?=시험)/g);
  for (const raw of lines) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (s.length > 7 && s.length < 240 && keywords.some(k => s.includes(k))) addUnique(arr, s);
    if (arr.length >= max) break;
  }
  if (arr.length < 3) {
    for (const k of keywords) {
      let idx = text.indexOf(k);
      while (idx >= 0 && arr.length < max) {
        addUnique(arr, text.slice(Math.max(0, idx - 50), idx + 130));
        idx = text.indexOf(k, idx + k.length);
      }
    }
  }
  return arr.slice(0, max);
}

function parse(kind, text) {
  if (kind === 'meals') return extractLines(text, ['금정','샛벌','학생','조식','중식','석식','식단','메뉴','등록된 식단'], 12);
  if (kind === 'seats') return extractLines(text, ['잔여','열람실','새벽벌','미리내','좌석','나노생명','이용가능','도서관'], 12);
  if (kind === 'notices') return extractLines(text, ['공지','모집','신청','안내','장학','학생','비교과','행사','채용'], 12);
  if (kind === 'academic') return extractLines(text, ['학사','수업','성적','휴학','복학','등록','시험','수강','졸업'], 12);
  return [];
}

async function readSource(kind, url) {
  try {
    const res = await httpGet(url);
    const text = strip(res.text);
    const data = parse(kind, text).map(x => ({ ...x, meta: x.meta || `부산대 공개 페이지 · HTTP ${res.status}` }));
    return { ok: true, live: data.length > 0, count: data.length, status: res.status, textLength: text.length, url, data: data.length ? data : FALLBACK[kind] };
  } catch (error) {
    return { ok: false, live: false, count: 0, status: null, textLength: 0, url, error: error.message, data: FALLBACK[kind] };
  }
}

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

async function handler(event) {
  if (event && event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  try {
    const entries = await Promise.all(Object.entries(SOURCES).map(async ([k, u]) => [k, await readSource(k, u)]));
    const results = Object.fromEntries(entries);
    const liveCount = Object.values(results).filter(x => x.live).length;
    return response(200, {
      version: '6.1-fixed',
      mode: liveCount ? 'live' : 'demo',
      fetchedAt: new Date().toISOString(),
      meals: results.meals.data,
      seats: results.seats.data,
      notices: results.notices.data,
      academic: results.academic.data,
      diagnostics: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, {
        ok: v.ok,
        live: v.live,
        count: v.live ? v.count : 0,
        status: v.status,
        textLength: v.textLength,
        error: v.error || null,
        url: v.url
      }]))
    });
  } catch (error) {
    return response(200, {
      version: '6.1-fixed',
      mode: 'demo',
      fetchedAt: new Date().toISOString(),
      meals: FALLBACK.meals,
      seats: FALLBACK.seats,
      notices: FALLBACK.notices,
      academic: FALLBACK.academic,
      diagnostics: { fatal: { ok:false, error: error.message || String(error) } }
    });
  }
}

exports.handler = handler;
module.exports.handler = handler;
