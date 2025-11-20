import { createRoot } from 'react-dom/client';
import App from './App';
import { startBridgeListeners } from './services/bridgeClient';
startBridgeListeners();

createRoot(document.getElementById('root')!).render(
  <div>
    <App />
  </div>
);
