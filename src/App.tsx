// import { useEffect } from 'react';
// import { startBridgeListeners, stopBridgeListeners, bridgeRequest } from './services/bridgeClient';
// import QueryRunner from './components/QueryRunner';
// import './App.css'
// import Index from './pages/Index';
// function App() {
//   useEffect(() => {
//     // Initialize bridge listeners when component mounts
//     startBridgeListeners().catch(error => {
//       console.error('Failed to start bridge listeners:', error);
//     });

//     // Cleanup when component unmounts
//     return () => {
//       stopBridgeListeners();
//     };
//   }, []); // Empty array = run once on mount


//   const inTauri = typeof window !== 'undefined' && (
//     !!(window as any).__TAURI__ ||
//     !!(window as any).__TAURI__?.core ||
//     !!(window as any).__TAURI__?.tauri
//   );


//   if (inTauri) {
//     return (
//       <div>
//         <Index />
//       </div>
//     );
//   }
// }

// export default App;