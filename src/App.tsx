import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./components/home";
import NotebookPage from "./components/notebook/NotebookPage";

function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/n/:id" element={<NotebookPage />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </>
    </Suspense>
  );
}

export default App;
