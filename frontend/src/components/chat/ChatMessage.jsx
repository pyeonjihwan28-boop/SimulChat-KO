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

  return (
    <div className={`mb-1 px-2 py-1 rounded ${isFirstTimeChat ? 'bg-[#1f1f23] border-l-4 border-teal-500' : 'hover:bg-[#1f1f23]'} transition-colors duration-150`}>
      <div className="flex items-start">
        <div className="flex items-center mr-1">
          <span style={{ color: userColor }} className="font-bold">{user}</span>
          <span className="mx-1 text-gray-400">:</span>
        </div>
        <div className="flex-1 break-words">
          {isReply && replyTo && (
            <span className="text-gray-400 mr-1 text-xs bg-[#2f2f35] px-1 rounded">@{replyTo}</span>
          )}
          <span className="text-gray-100">{parseMessage(text)}</span>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage; 