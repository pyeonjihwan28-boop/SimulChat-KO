import React from 'react';
import { useEmotes } from '../emotes/EmoteManager';

const ChatMessage = ({ message }) => {
  const { user, text, isFirstTimeChat, isReply, replyTo, userColor } = message;
  const { emotes } = useEmotes();

  const parseMessage = (text) => {
    if (!emotes || emotes.size === 0) {
      return text;
    }

    // Clean punctuation that might be attached to emotes
    let cleanedText = text;
    
    // Get all emote names for regex pattern
    const emoteNames = Array.from(emotes.keys());
    
    // Process each word to check if it contains an emote with punctuation
    const words = cleanedText.split(' ');
    return words.map((word, index) => {
      // Remove any punctuation that might be attached to the emote
      const cleanWord = word.replace(/[!.,?:;]/g, '');
      
      if (emotes.has(cleanWord)) {
        return (
          <img
            key={index}
            src={emotes.get(cleanWord)}
            alt={cleanWord}
            className="inline-block h-7 w-auto mx-0.5 my-[-4px]"
            title={cleanWord}
          />
        );
      }
      
      // Check if this word contains an emote with ONLY punctuation (not letters)
      for (const emoteName of emoteNames) {
        if (word.includes(emoteName) && word !== emoteName) {
          // Check if the characters before/after the emote are only punctuation
          const beforeEmote = word.substring(0, word.indexOf(emoteName));
          const afterEmote = word.substring(word.indexOf(emoteName) + emoteName.length);
          
          // Only process if before/after contains ONLY punctuation (no letters/numbers)
          const beforeIsPunctuation = /^[!.,?:;]*$/.test(beforeEmote);
          const afterIsPunctuation = /^[!.,?:;]*$/.test(afterEmote);
          
          if (beforeIsPunctuation && afterIsPunctuation) {
            return (
              <React.Fragment key={index}>
                {beforeEmote && beforeEmote}
                <img
                  src={emotes.get(emoteName)}
                  alt={emoteName}
                  className="inline-block h-7 w-auto mx-0.5 my-[-4px]"
                  title={emoteName}
                />
                {afterEmote && afterEmote}
              </React.Fragment>
            );
          }
        }
      }
      
      return ` ${word} `;
    });
  };

  // 유튜브 라이브 채팅처럼: 동그란 프로필(이니셜) + 회색 닉네임 + 흰 글자
  const avatarColors = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#1e88e5', '#039be5', '#00897b', '#5d4037',
    '#8e24aa', '#f4511e', '#6d4c41', '#546e7a', '#c2185b', '#5e35b1', '#00838f', '#ef6c00'];
  const name = user || '';
  const hash = Array.from(name).reduce((acc, ch, i) => acc + ch.charCodeAt(0) * (i + 7), 0);
  const avatarColor = avatarColors[hash % avatarColors.length];
  const initial = (name.replace(/^@/, '')[0] || '?').toUpperCase();

  return (
    <div className="yt-line flex items-start px-6 py-1 hover:bg-white/5">
      <div className="yt-avatar flex-shrink-0 mr-4 mt-0.5 flex items-center justify-center rounded-full text-white font-medium"
           style={{ backgroundColor: avatarColor }}>
        {initial}
      </div>
      <div className="flex-1 min-w-0 break-words leading-6">
        <span className={`yt-author mr-2 ${isFirstTimeChat ? 'text-[#2ba640]' : 'text-[#aaaaaa]'}`}>{name}</span>
        {isReply && replyTo && <span className="yt-message text-[#3ea6ff] mr-1">@{replyTo}</span>}
        <span className="yt-message text-[#f1f1f1]">{parseMessage(text)}</span>
      </div>
    </div>
  );
};

export default ChatMessage; 