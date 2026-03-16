import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Docs from "./Docs";
import Examples from "./Examples";
import Home from "./Home";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/examples" element={<Examples />} />
      </Routes>
    </Router>
  );
}

export default App;
