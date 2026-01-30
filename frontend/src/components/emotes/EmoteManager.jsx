import React, { createContext, useContext, useEffect, useState } from 'react';

const EmoteContext = createContext();

export const useEmotes = () => {
  return useContext(EmoteContext);
};

export const EmoteManager = ({ children }) => {
  const [emotes, setEmotes] = useState(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEmotes = async () => {
      try {
        // Fetch more popular emote sets for better variety
        const popularEmoteSetIds = [
          '01F6ME22ER0000WDA7ERT8XZRP', // catJAM's set
          '01F6M4B85G000AXRNAAMW9RGB4', // GIGACHAD's set
          '6076a86a4f3cac1df7fa5f7d',    // xQc's set
          '60a1c7c3259ac5a73e8e1d94',    // forsen's set
          '60a7c492f4d51d920d1a9ea9',    // Mizkif's set
          '60b3c09e259ac5a73e8edaf0',    // sodapoppin's set
          '62f9c7c6b4e2a8b4f76bb1e3',    // NymN's set
          '6076a86a4f3cac1df7fa5f7d',    // Popular set
          'global'                        // Keep the base global set
        ];

        const emoteMap = new Map();

        for (const setId of popularEmoteSetIds) {
          const response = await fetch(`https://7tv.io/v3/emote-sets/${setId}`);
          if (!response.ok) {
            console.warn(`Failed to fetch emote set: ${setId}`);
            continue;
          }
          const data = await response.json();
          if (data && data.emotes) {
            data.emotes.forEach(emote => {
              if (!emoteMap.has(emote.name)) { // Avoid duplicates
                const emoteUrl = `https://cdn.7tv.app/emote/${emote.id}/1x.webp`;
                emoteMap.set(emote.name, emoteUrl);
              }
            });
          }
        }
        
        // --- MANUAL EMOTE MODIFICATIONS ---

        // Add user-requested emotes
        emoteMap.set('classic', 'https://cdn.7tv.app/emote/01GBPSCGR00007Q17796BDN5AJ/1x.avif');
        emoteMap.set('Madge', 'https://cdn.7tv.app/emote/01F6ASPNM00009TPCEMWQTT4XX/1x.avif');
        emoteMap.set('BANGER', 'https://cdn.7tv.app/emote/01H1SDVRH000080K50KTZJ6NH9/1x.avif');
        emoteMap.set('5Head', 'https://cdn.7tv.app/emote/01F6NPFQXG000AAS5FM9Q6GVCC/4x.avif');
        emoteMap.set('monkaHmm', 'https://cdn.7tv.app/emote/01FEPF1820000A35M54YK6J45N/1x.avif');
        emoteMap.set('FeelsGoodMan', 'https://cdn.7tv.app/emote/01GBTGFPR8000CFDH7XER3DVJ0/1x.avif');
        emoteMap.set('VIBE', 'https://cdn.7tv.app/emote/01FYQZVG280006SX8JX4TD7SJA/1x.avif');
        emoteMap.set('monkaW', 'https://cdn.7tv.app/emote/01F71S8MF0000CGWD8KWAH6S2E/1x.avif');
        emoteMap.set('FeelsBadMan', 'https://cdn.7tv.app/emote/01GB8HJ61R0000X4MX5ZF49QE8/1x.avif');
        emoteMap.set('monkaS', 'https://cdn.7tv.app/emote/01F78CHJ2G0005TDSTZFBDGMK4/1x.avif');
        emoteMap.set('LULW', 'https://cdn.7tv.app/emote/01F22WE74G000F9Q0G00A2DE8N/1x.avif');
        emoteMap.set('BASED', 'https://cdn.7tv.app/emote/01F031CCA80001TJB3006SVBHS/1x.avif');
        emoteMap.set('Based', 'https://cdn.7tv.app/emote/01FJRZF31R0005ZW4QCZF2M8JN/3x.avif');
        emoteMap.set('POGGERS', 'https://cdn.7tv.app/emote/01F6P0803G000898NRWSAKGYXT/1x.avif');
        emoteMap.set('AlienPls', 'https://cdn.7tv.app/emote/01FA5X897G0007FCCDBQ9R010G/1x.avif');
        emoteMap.set('PogU', 'https://cdn.7tv.app/emote/01F6M3N17G000B5V5G2M2RYJN7/1x.avif');
        emoteMap.set('HYPERS', 'https://cdn.7tv.app/emote/01F6NMD520000AAS5FM9QEF9ZJ/3x.avif');
        emoteMap.set('KEKW', 'https://cdn.7tv.app/emote/01FCP0YPQ800037YGEKHNTNXY1/3x.avif');
        console.log('Manually added classic, Madge, 5Head, monkaHmm, FeelsGoodMan, VIBE, monkaW, FeelsBadMan, monkaS, LULW, BASED, POGGERS, BANGER, AlienPls, HYPERS, and KEKW emotes.');

        // Remove the specific "hi" emote if it exists
        if (emoteMap.has('hi')) {
          emoteMap.delete('hi');
          console.log('Removed "hi" emote from the emote map.');
        }

        // Remove the specific "peepoYummy" emote if it exists
        if (emoteMap.has('peepoYummy')) {
          emoteMap.delete('peepoYummy');
          console.log('Removed "peepoYummy" emote from the emote map.');
        }

        // Remove the specific "xqcFiles" emote if it exists
        if (emoteMap.has('xqcFiles')) {
          emoteMap.delete('xqcFiles');
          console.log('Removed "xqcFiles" emote from the emote map.');
        }

        console.log(`Fetched a total of ${emoteMap.size} unique 7TV emotes.`);
        setEmotes(emoteMap);

      } catch (error) {
        console.error('Failed to fetch 7TV emotes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEmotes();
  }, []);

  // Helper function to get a random emote name
  const getRandomEmote = () => {
    if (emotes.size === 0) return null;
    const emoteNames = Array.from(emotes.keys());
    return emoteNames[Math.floor(Math.random() * emoteNames.length)];
  };

  return (
    <EmoteContext.Provider value={{ emotes, loading, getRandomEmote }}>
      {children}
    </EmoteContext.Provider>
  );
}; 