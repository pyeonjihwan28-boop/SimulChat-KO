import React from 'react';
import Chat from './components/chat/Chat';
import { EmoteManager } from './components/emotes/EmoteManager';

function App() {
  return (
    <div className="App">
      <EmoteManager>
        <Chat />
      </EmoteManager>
    </div>
  );
}

export default App; 