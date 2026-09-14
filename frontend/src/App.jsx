import { Routes, Route } from 'react-router-dom';
import Home from './Home';
import WatchRoom from './WatchRoom';

function App() {
  return (
    <div className="container">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<WatchRoom />} />
      </Routes>
    </div>
  );
}

export default App;
