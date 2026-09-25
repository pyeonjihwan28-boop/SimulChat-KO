import React, { useState, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import { aiAgents } from './agents';
import { ComputerDesktopIcon, Cog8ToothIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { makeViewer, stylize, chatRate, nextGap, makeHype, driftViewers, rand, randInt } from '../../live/liveLogic';

// 가벼운 버전: 화면 공유만 보고 반응 (사진 올리기·마이크·내 채팅·카메라·음악 감지·이모트 삭제)
const CAPTURE_INTERVAL_MS = 5000;   // 화면 사진을 찍어 AI에게 보여 주는 간격
const MAX_INFLIGHT = 2;             // AI(Ollama)에 동시에 보내는 요청 수. 밀리면 그 차례는 건너뜀
const MAX_MESSAGES = 100;           // 화면에 남기는 채팅 수
const FILLER = /^(okay|ok|alright|sure|got it|here'?s|response)\b[:,.\s-]*/i;

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [live, setLive] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  const [status, setStatus] = useState('');
  const [backendError, setBackendError] = useState('');

  const liveRef = useRef(false);
  const messagesRef = useRef([]);
  const baseViewersRef = useRef(Number(localStorage.getItem('simulchat_base_viewers')) || 30000);
  const viewersRef = useRef(0);
  const hypeRef = useRef(makeHype());
  const crowdRef = useRef({});          // AI 시청자 이름 → 한국식 닉네임·말버릇 (계속 같음)
  const lastSaidRef = useRef({});       // 같은 사람이 같은 말 반복 방지
  const recentSpeakersRef = useRef([]);
  const inflightRef = useRef(0);
  const chatBoxRef = useRef(null);
  const stickToBottomRef = useRef(true);

  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureTimerRef = useRef(null);
  const capturingRef = useRef(false);

  // ----- 채팅 한 줄 추가 -----
  const viewerFor = (key) => {
    if (!crowdRef.current[key]) crowdRef.current[key] = makeViewer();
    return crowdRef.current[key];
  };

  const addChat = (agentName, text) => {
    const v = viewerFor(agentName);
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user: v.name,
      text: stylize(text, v),
      isFirstTimeChat: v.member,
    };
    setMessages((prev) => {
      const next = [...prev, msg].slice(-MAX_MESSAGES);
      messagesRef.current = next;
      return next;
    });
  };

  // ----- AI 시청자 한 명에게 채팅 요청 -----
  const askAgent = async (agent, situation = '') => {
    try {
      const res = await fetch('/api/get-ai-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_prompt: agent.systemPrompt,
          transcribed_input: situation,
          model_name: agent.model || 'qwen2.5vl:3b',
          visual_context_memory: null,
          agent_name: agent.name,
          recent_messages: messagesRef.current.slice(-10).map((m) => ({ user: m.user, text: m.text })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBackendError(`AI 오류: ${data.error || res.statusText}`);
        return null;
      }
      setBackendError('');
      const t = String(data.ai_message || '').trim().replace(FILLER, '').replace(/\s{2,}/g, ' ').trim();
      if (!t || lastSaidRef.current[agent.name] === t) return null;
      lastSaidRef.current[agent.name] = t;
      return t;
    } catch (e) {
      setBackendError('백엔드에 연결할 수 없음 (python app.py 켜져 있나요?)');
      return null;
    }
  };

  const say = (agent, situation) => {
    inflightRef.current += 1;
    askAgent(agent, situation)
      .then((t) => { if (t && liveRef.current) addChat(agent.name, t); })
      .finally(() => { inflightRef.current -= 1; });
  };

  const pickAgent = () => {
    const fresh = aiAgents.filter((a) => !recentSpeakersRef.current.includes(a.name));
    const pool = fresh.length ? fresh : aiAgents;
    const agent = pool[randInt(0, pool.length - 1)];
    recentSpeakersRef.current = [agent.name, ...recentSpeakersRef.current].slice(0, 5);
    return agent;
  };

  // AI 시청자 여러 명에게 장면을 알려 각자 성격대로 반응 (시간차를 두고)
  const agentsReact = (situation, n, lo, hi) => {
    [...aiAgents].sort(() => 0.5 - Math.random()).slice(0, n).forEach((agent) => {
      setTimeout(() => { if (liveRef.current) say(agent, situation); }, rand(lo, hi) * 1000);
    });
  };

  // ----- 평소 채팅: 시청자 수와 폭주 정도로 정한 속도 -----
  useEffect(() => {
    let timer;
    const loop = () => {
      if (liveRef.current && inflightRef.current < MAX_INFLIGHT) say(pickAgent(), '');
      const wait = liveRef.current ? nextGap(chatRate(viewersRef.current, hypeRef.current.cur())) : 1000;
      timer = setTimeout(loop, wait);
    };
    timer = setTimeout(loop, 1000);
    return () => clearTimeout(timer);
  }, []);

  // 시청자 수: 4초마다 기본 시청자 수 쪽으로 천천히
  useEffect(() => {
    const id = setInterval(() => {
      if (!liveRef.current) return;
      viewersRef.current = driftViewers(viewersRef.current, baseViewersRef.current);
      setViewerCount(viewersRef.current);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // ----- 버튼 -----
  const handleKickoff = () => {
    if (liveRef.current) return;
    setMessages([]);
    messagesRef.current = [];
    liveRef.current = true;
    setLive(true);
    viewersRef.current = Math.round(baseViewersRef.current * (1 + Math.random() * 0.12));
    setViewerCount(viewersRef.current);
    hypeRef.current.reset();
    hypeRef.current.add(1.5);
    agentsReact('경기 시작! 킥오프', randInt(5, 7), 0.2, 4);
  };

  const handleStop = () => {
    liveRef.current = false;
    setLive(false);
  };

  const handleGoal = () => {
    if (!liveRef.current) return;
    hypeRef.current.add(3);
    viewersRef.current = Math.round(viewersRef.current * (1.04 + Math.random() * 0.08));
    setViewerCount(viewersRef.current);
    agentsReact('방금 골 들어감!!', randInt(8, 12), 0, 4);
  };

  const handleSettings = () => {
    const v = window.prompt('기본 시청자 수 (채팅 속도가 여기에 맞춰져요)', String(baseViewersRef.current));
    const n = Number(String(v || '').replace(/[^0-9]/g, ''));
    if (n >= 100) {
      baseViewersRef.current = n;
      localStorage.setItem('simulchat_base_viewers', String(n));
    }
  };

  // ----- 화면 공유: 5초마다 사진을 찍어 백엔드로 (앞 사진을 아직 보내는 중이면 건너뜀) -----
  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || capturingRef.current) return;
    const scale = Math.min(1, 1280 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
    capturingRef.current = true;
    fetch('/api/update-visual-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: b64, context_type: 'screen' }),
    })
      .then((r) => r.json())
      .then((d) => setStatus(d.error ? `화면 읽기 오류: ${d.error}` : '화면 보는 중'))
      .catch(() => setStatus('화면 읽기 실패'))
      .finally(() => { capturingRef.current = false; });
  };

  const stopSharing = () => {
    clearInterval(captureTimerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsSharing(false);
    setStatus('');
  };

  const startSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      stream.getVideoTracks()[0].onended = stopSharing;   // 브라우저의 '공유 중지'를 눌렀을 때
      setIsSharing(true);
      setStatus('화면 보는 중');
      setTimeout(captureFrame, 1000);
      captureTimerRef.current = setInterval(captureFrame, CAPTURE_INTERVAL_MS);
    } catch (e) {
      setStatus('화면 공유 취소됨');
    }
  };

  useEffect(() => () => stopSharing(), []);

  // ----- 스크롤: 맨 아래를 보고 있을 때만 따라감 -----
  const onScroll = () => {
    const el = chatBoxRef.current;
    if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop <= el.clientHeight + 50;
  };
  useEffect(() => {
    const el = chatBoxRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="yt-chat flex flex-col h-screen bg-[#0f0f0f] text-[#f1f1f1]">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0f0f0f; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #717171; border-radius: 4px; }
      `}</style>

      <header className="h-12 px-4 border-b border-[#303030] flex justify-between items-center">
        <h1 className="text-base font-normal whitespace-nowrap">실시간 채팅 <span className="text-xs text-[#aaaaaa]">▾</span></h1>
        <div className="flex items-center space-x-3 min-w-0">
          {backendError && <span className="text-xs text-red-400 truncate max-w-[180px]" title={backendError}>{backendError}</span>}
          {status && <span className="text-xs text-[#aaaaaa] whitespace-nowrap">{status}</span>}
          <span className="text-xs text-[#aaaaaa] whitespace-nowrap">{viewerCount.toLocaleString()}명 시청 중</span>
          <span className="text-lg leading-none px-1">⋮</span>
        </div>
      </header>

      {/* 화면 공유 영상은 사진을 찍는 데만 쓰고 보이지 않음 */}
      <video ref={videoRef} className="hidden" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />

      <div ref={chatBoxRef} onScroll={onScroll} className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {!live ? (
          <div className="flex flex-col items-center justify-center h-full text-[#aaaaaa]">
            <button type="button" onClick={handleKickoff}
              className="px-10 py-4 rounded-full bg-[#e62117] hover:bg-[#ff3b30] text-white text-xl font-bold shadow-lg transition-colors">
              ⚽&nbsp;&nbsp;킥오프
            </button>
            <p className="text-xs mt-4 text-center leading-5">경기가 시작되면 눌러 주세요<br />누르면 채팅이 시작돼요</p>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}
      </div>

      {/* 유튜브 입력창 모양 (보기용) + 버튼 */}
      <div className="px-6 pt-3 pb-2 border-t border-[#303030]">
        <div className="flex items-center mb-1">
          <div className="yt-avatar flex-shrink-0 mr-4 flex items-center justify-center rounded-full text-white font-medium bg-[#e91e63]">나</div>
          <span className="yt-author text-[#aaaaaa]">시청자</span>
        </div>
        <div className="ml-10 text-sm text-[#717171] border-b border-[#717171] py-1">채팅...</div>
        <div className="ml-8 mt-1 flex justify-end items-center space-x-3 text-[#717171]">
          <span className="text-xs">0/200</span>
          <PaperAirplaneIcon className="h-5 w-5" />
        </div>
        <div className="flex items-center space-x-4 mt-2 pt-2 border-t border-[#303030] text-[#aaaaaa]">
          <button type="button" onClick={isSharing ? stopSharing : startSharing}
            className={`flex items-center text-sm ${isSharing ? 'text-[#3ea6ff]' : ''} hover:text-white`}
            title={isSharing ? '화면 공유 끄기' : '화면 공유 켜기'}>
            <ComputerDesktopIcon className="h-5 w-5 mr-1" />{isSharing ? '공유 중' : '화면 공유'}
          </button>
          {live && (
            <>
              <button type="button" onClick={handleGoal} className="text-sm hover:text-white" title="골! (채팅 폭주)">⚽ 골</button>
              <button type="button" onClick={handleStop} className="text-sm hover:text-white" title="채팅 멈추기 (킥오프 전으로)">⏹ 멈추기</button>
            </>
          )}
          <button type="button" onClick={handleSettings} className="hover:text-white ml-auto" title="기본 시청자 수 설정">
            <Cog8ToothIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
