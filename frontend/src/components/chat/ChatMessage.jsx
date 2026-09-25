import React from 'react';

// 유튜브 라이브 채팅처럼: 동그란 프로필(이니셜) + 회색 닉네임 + 흰 글자
const AVATAR_COLORS = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#1e88e5', '#039be5', '#00897b', '#5d4037',
  '#8e24aa', '#f4511e', '#6d4c41', '#546e7a', '#c2185b', '#5e35b1', '#00838f', '#ef6c00'];

const ChatMessage = ({ message }) => {
  const { user = '', text, isFirstTimeChat } = message;
  const hash = Array.from(user).reduce((acc, ch, i) => acc + ch.charCodeAt(0) * (i + 7), 0);
  const initial = (user.replace(/^@/, '')[0] || '?').toUpperCase();

  return (
    <div className="yt-line flex items-start px-6 py-1 hover:bg-white/5">
      <div className="yt-avatar flex-shrink-0 mr-4 mt-0.5 flex items-center justify-center rounded-full text-white font-medium"
           style={{ backgroundColor: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}>
        {initial}
      </div>
      <div className="flex-1 min-w-0 break-words leading-6">
        <span className={`yt-author mr-2 ${isFirstTimeChat ? 'text-[#2ba640]' : 'text-[#aaaaaa]'}`}>{user}</span>
        <span className="yt-message text-[#f1f1f1]">{text}</span>
      </div>
    </div>
  );
};

export default React.memo(ChatMessage);
