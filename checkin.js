const crypto = require('crypto');
const SPOTS = [
  { id:'library', name:'새벽벌도서관', emoji:'📚', entry:'QM-V6-LIBRARY-ENTRY', exit:'QM-V6-LIBRARY-EXIT', prefix:'LIB', challenge:'FOCUS' },
  { id:'meal', name:'금정회관/학생식당', emoji:'🍚', entry:'QM-V6-MEAL-ENTRY', exit:'QM-V6-MEAL-EXIT', prefix:'MEAL', challenge:'RICE' },
  { id:'notice', name:'공지 확인 부스', emoji:'📣', entry:'QM-V6-NOTICE-ENTRY', exit:'QM-V6-NOTICE-EXIT', prefix:'NOTI', challenge:'INFO' },
  { id:'hidden', name:'캠퍼스 히든스팟', emoji:'🗺️', entry:'QM-V6-HIDDEN-ENTRY', exit:'QM-V6-HIDDEN-EXIT', prefix:'HIDE', challenge:'FIND' },
  { id:'team', name:'팀 챌린지 존', emoji:'🤝', entry:'QM-V6-TEAM-ENTRY', exit:'QM-V6-TEAM-EXIT', prefix:'TEAM', challenge:'CREW' }
];
const SECRET = process.env.QUESTMATE_CHECKIN_SECRET || 'pnu-questmate-v6-demo-secret';
const DAILY_LIMIT = 1;
const STRICT_WAIT_SECONDS = 10 * 60;
const DEMO_WAIT_SECONDS = 25;
const MAX_WINDOW_MS = 2 * 60 * 60 * 1000;
const headers = {'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type'};
function kstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const get = t => parts.find(p => p.type === t).value;
  return { date:`${get('year')}-${get('month')}-${get('day')}`, mmdd:`${get('month')}${get('day')}` };
}
function dailyCode(spot) { return `${spot.prefix}-${kstParts().mmdd}`; }
function sign(payload) { return crypto.createHmac('sha256', SECRET).update(payload).digest('hex'); }
function tokenFor(obj) { const raw = Buffer.from(JSON.stringify(obj)).toString('base64url'); return raw + '.' + sign(raw); }
function readToken(token) { const [raw, sig] = String(token || '').split('.'); if (!raw || !sig || sign(raw) !== sig) throw new Error('방문 토큰이 유효하지 않습니다.'); return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')); }
function json(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }
function normalize(x) { return String(x || '').trim().toUpperCase(); }
function dailyLogs(logs) { const today = kstParts().date; return Array.isArray(logs) ? logs.filter(x => x && x.date === today) : []; }
function checkLimits(spot, logs) {
  const today = dailyLogs(logs);
  if (today.length >= DAILY_LIMIT) throw new Error(`오늘 스탬프 제한 ${DAILY_LIMIT}개를 이미 채웠습니다.`);
  if (today.some(x => x.spotId === spot.id)) throw new Error('동일 장소 스탬프는 하루 1회만 받을 수 있습니다.');
}
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok:false, message:'POST만 지원합니다.' });
  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action;
    if (action === 'start') {
      const spot = SPOTS.find(s => s.id === body.spotId);
      if (!spot) throw new Error('알 수 없는 장소입니다.');
      if (normalize(body.entryCode) !== spot.entry) throw new Error('입장 QR 코드가 맞지 않습니다.');
      if (normalize(body.dailyCode) !== dailyCode(spot)) throw new Error(`오늘 현장 코드가 맞지 않습니다. 예시: ${dailyCode(spot)}`);
      if (normalize(body.challenge) !== spot.challenge) throw new Error('현장 확인 문구가 맞지 않습니다.');
      checkLimits(spot, body.logs || []);
      const waitSeconds = body.mode === 'strict' ? STRICT_WAIT_SECONDS : DEMO_WAIT_SECONDS;
      const startedAt = Date.now();
      const payload = { spotId: spot.id, startedAt, waitSeconds, mode: body.mode === 'strict' ? 'strict' : 'demo', nonce: crypto.randomBytes(8).toString('hex') };
      return json(200, { ok:true, message:'입장 QR·현장코드·문구 검사를 통과했습니다. 최소 체류시간 후 퇴장 QR을 인증하세요.', visit: { ...payload, id: tokenFor(payload) } });
    }
    if (action === 'complete') {
      const visit = body.visit || {};
      const decoded = readToken(visit.id);
      if (decoded.spotId !== visit.spotId || decoded.startedAt !== visit.startedAt) throw new Error('방문 토큰 내용이 일치하지 않습니다.');
      const spot = SPOTS.find(s => s.id === decoded.spotId);
      if (!spot) throw new Error('알 수 없는 장소입니다.');
      if (normalize(body.exitCode) !== spot.exit) throw new Error('퇴장 QR 코드가 맞지 않습니다.');
      if (Date.now() - decoded.startedAt < decoded.waitSeconds * 1000) throw new Error('최소 체류시간이 아직 지나지 않았습니다.');
      if (Date.now() - decoded.startedAt > MAX_WINDOW_MS) throw new Error('미션 유효시간 2시간을 초과했습니다. 다시 입장 인증하세요.');
      if (!String(body.activityNote || '').trim() || String(body.activityNote).trim().length < 4) throw new Error('짧은 활동 기록을 4글자 이상 입력해야 합니다.');
      checkLimits(spot, body.logs || []);
      const now = new Date();
      const record = { id:'QM-'+crypto.randomBytes(5).toString('hex').toUpperCase(), spotId:spot.id, spotName:spot.name, emoji:spot.emoji, issuedAt:now.toISOString(), date:kstParts(now).date, mode:decoded.mode, activityNote:String(body.activityNote).trim(), rules:['entry_qr','exit_qr','daily_code','challenge_word','dwell_time','daily_limit_1','admin_review'] };
      return json(200, { ok:true, message:'퇴장 QR·체류시간·하루 1개 제한 검사를 통과했습니다. 스탬프 1개가 지급됩니다.', record });
    }
    throw new Error('알 수 없는 action입니다.');
  } catch (error) {
    return json(400, { ok:false, message:error.message || '인증 실패' });
  }
};
