import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Docs from "./Docs";
import Home from "./Home";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/docs" element={<Docs />} />
      </Routes>
    </Router>
  );
}

export default App;
