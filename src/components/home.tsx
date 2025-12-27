import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { generateNotebookId } from "@/lib/notebook-storage";

function Home() {
  const id = useMemo(() => generateNotebookId(), []);
  return <Navigate to={`/n/${id}`} replace />;
}

export default Home;
