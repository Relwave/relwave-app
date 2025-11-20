// src/App.tsx or your main component
import { useEffect } from 'react';
import { startBridgeListeners, stopBridgeListeners, bridgeRequest } from './services/bridgeClient';
import { QueryTester } from './components/QueryTester';

function App() {
  useEffect(() => {
    // Initialize bridge listeners when component mounts
    startBridgeListeners().catch(error => {
      console.error('Failed to start bridge listeners:', error);
    });

    // Cleanup when component unmounts
    return () => {
      stopBridgeListeners();
    };
  }, []); // Empty array = run once on mount

  const handleTestBridge = async () => {
    try {
      const result = await bridgeRequest('ping', { message: 'Hello from frontend!' });
      console.log('Bridge response:', result);
    } catch (error) {
      console.error('Bridge request failed:', error);
    }
  };

  const inTauri = typeof window !== 'undefined' && (
    !!(window as any).__TAURI__ ||
    !!(window as any).__TAURI__?.core ||
    !!(window as any).__TAURI__?.tauri
  );


  if (inTauri) {
    return (
      <div>
        <QueryTester />
      </div>
    );
  }
  return (
    <div>
      <h1>Not running in Tauri environment</h1>
    </div>
  );


}

export default App;