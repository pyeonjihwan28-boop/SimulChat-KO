// FC 26 라이브 채팅에서 가져온 로직: 한국식 닉네임·말버릇, 시청자 수에 따른 채팅 속도, 큰 장면 직후 폭주(hype)
// 채팅 문장은 전부 AI(Ollama)가 만듦

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

// ----- 한국식 닉네임 -----
const SURNAMES = [['김', 'kim'], ['김', 'kim'], ['이', 'lee'], ['이', 'lee'], ['박', 'park'], ['최', 'choi'], ['정', 'jung'],
  ['강', 'kang'], ['조', 'cho'], ['윤', 'yoon'], ['장', 'jang'], ['임', 'lim'], ['한', 'han'], ['오', 'oh'], ['서', 'seo'],
  ['신', 'shin'], ['권', 'kwon'], ['황', 'hwang'], ['송', 'song'], ['홍', 'hong']];
const GIVENS = [['민준', 'minjun'], ['서준', 'seojun'], ['도윤', 'doyoon'], ['시우', 'siwoo'], ['하준', 'hajun'], ['지호', 'jiho'],
  ['지훈', 'jihoon'], ['현우', 'hyunwoo'], ['건우', 'gunwoo'], ['우진', 'woojin'], ['민재', 'minjae'], ['동현', 'donghyun'],
  ['승우', 'seungwoo'], ['재현', 'jaehyun'], ['민수', 'minsu'], ['태훈', 'taehoon'], ['서연', 'seoyeon'], ['지우', 'jiwoo'],
  ['하은', 'haeun'], ['수아', 'sua'], ['민서', 'minseo'], ['지민', 'jimin'], ['예린', 'yerin'], ['유나', 'yuna'], ['수빈', 'subin']];
const CASUAL = ['감자', '고구마', '도토리', '밤톨', '초코', '뭉치', '하루', '콩이', '보리', '모찌', '호빵', '만두', '구름', '라떼', '두부',
  '배고픈곰', '졸린고양이', '퇴근하고싶다', '월요병', '귤까먹는중', '야식러', '잠못드는밤', '치킨은반반', '그냥사람',
  '지나가던행인', '눈팅만함', '새벽감성', '무지개', '꿀벌', '햄찌', '펭귄', '다람쥐', '산책가자', '오늘도맑음',
  '축구보는곰', '주말엔축구', '공차는고양이', '왼발잡이', '조기축구에이스', '벤치워머', '만년후보'];
const CASUAL_TAIL = ['', '', '', '', '', '맘', '아빠', '짱', '님', '이', '22', '99', '0', '123', '_'];
const CHANNEL = ['{w}TV', '{w}의 일상', '{w}로그', '{w} 채널', '{w}브이로그', '{g}네 집', '{w}축구', '{g}의 축구일기'];
const ENG = ['sunny', 'daily', 'noname', 'kkkk', 'zzz', 'happy', 'blue', 'moon', 'lucky', 'chill', 'cozy', 'goal', 'footy',
  'pitch', 'night', 'coffee', 'mango', 'tiger', 'panda'];

const digits = () => pick(['', '', String(randInt(1, 99)), String(randInt(80, 99)), String(randInt(1990, 2008)),
  `${String(randInt(1, 12)).padStart(2, '0')}${String(randInt(1, 28)).padStart(2, '0')}`]);

export function makeKoreanName() {
  const [sk, se] = pick(SURNAMES);
  const [gk, ge] = pick(GIVENS);
  const r = Math.random();
  if (r < 0.2) return sk + gk;                                           // 실명
  if (r < 0.32) return pick([`${cap(ge)} ${cap(se)}`, `${cap(se)} ${cap(ge)}`, `${ge} ${se}`]);   // 영문 이름
  if (r < 0.55) {                                                        // @핸들
    return '@' + pick([`${ge}${digits()}`, `${se}${ge}${digits()}`, `${ge[0]}${ge.slice(-1)}${se}${randInt(1, 99)}`,
      `${ge}_${se}`, `${ge}.${se}`, `${ge}__`, `${pick(ENG)}_${ge}`, `${ge}${pick(ENG)}`,
      'user-' + Math.random().toString(36).slice(2, 12)]);
  }
  if (r < 0.8) return pick(CASUAL) + pick(CASUAL_TAIL);                  // 일상 닉네임
  if (r < 0.9) return pick(CHANNEL).replace('{w}', pick(CASUAL.slice(0, 20))).replace('{g}', gk);   // 채널 이름
  return pick(ENG) + pick(['', '', '_', '.']) + pick([...ENG, ge]) + digits();
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ----- 시청자 한 사람: 닉네임·말버릇이 계속 같음 -----
export function makeViewer(name) {
  return {
    name: name || makeKoreanName(),
    laugh: pick([2, 3, 3, 4, 4, 5, 6, 8]),
    nospace: Math.random() < 0.25,
    tail: pick(['', '', '', '', '', 'ㅋㅋ', '!!', '~', 'ㅎㅎ', '..', 'ㅠ']),
    member: Math.random() < 0.1,
  };
}

export function stylize(text, v) {
  if (!text || !v) return text;
  let t = text.replace(/ㅋ{2,}/g, () => 'ㅋ'.repeat(Math.max(2, v.laugh + randInt(-1, 2))));
  if (v.nospace && t.length <= 16 && Math.random() < 0.6) t = t.replace(/ /g, '');
  if (v.tail && Math.random() < 0.3 && !/[ㅋ!?~ㅠㅎ.]$/.test(t)) {
    t += (v.nospace || ['!!', '~', '..'].includes(v.tail) ? '' : ' ') + v.tail;
  }
  if (t.endsWith('?') && Math.random() < 0.2) t += '?';
  return t.replace(/([^.])\.$/, '$1');          // 끝 마침표는 거의 안 찍음
}

// ----- 채팅 속도 -----
// 1초에 나오는 채팅 수: 시청자 1천 명 ≈ 0.3개, 3만 명 ≈ 1개, 30만 명 ≈ 2.3개 × (1 + 폭주 정도)
export function chatRate(viewers, hype) {
  const base = 0.3 * Math.pow(Math.max(200, viewers) / 1000, 0.35);
  return Math.max(0.1, Math.min(10, base * (1 + hype)));
}

// 다음 채팅까지 기다릴 시간(ms): 무작위(푸아송)라 몰렸다 뜸했다 함
export function nextGap(rate) {
  const gap = -Math.log(1 - Math.random()) / rate;
  return Math.max(60, Math.min(8000, gap * 1000));
}

// 큰 장면 직후 몰렸다가 12초쯤에 걸쳐 가라앉음
export function makeHype() {
  let level = 0;
  let at = Date.now();
  const cur = () => level * Math.exp(-(Date.now() - at) / 12000);
  return {
    cur,
    add(v) { level = Math.min(4, cur() + v); at = Date.now(); },
    reset() { level = 0; at = Date.now(); },
  };
}

// 시청자 수: 목표 쪽으로 천천히 움직이고, 폭주 때 튀었다가 제자리로
export function driftViewers(current, base) {
  const target = base;
  return Math.max(100, Math.round(current + (target - current) * 0.06 + (Math.random() - 0.5) * current * 0.006));
}

export { pick, rand, randInt };
